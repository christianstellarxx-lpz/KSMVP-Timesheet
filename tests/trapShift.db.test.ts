import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  RUN_ABANDONED,
  RUN_STARTED,
  RUN_SUBMITTED,
  TRAP_GAME_KEY,
  getTrapBoard,
  getTrapSession,
  scoreTrapRun,
  startTrapRun,
} from "@/lib/trapshift/game";
import { getPastChampions, getReigningChampion } from "@/lib/leaderboards/registry";
import { etDateStringToStorageDate, etToday } from "@/lib/time";
import fixtures from "./trapShift.fixtures.json";

/**
 * Trap Shift — the rules only the database can prove: tries per day held by
 * UNIQUE + CHECK, refresh-to-retry spending a try, ownership, double submit,
 * the real-time check, and the unlock gate. Runs against two throwaway users,
 * deleted in afterAll. Skips itself when no database is configured.
 */

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const DB_CONFIGURED = Boolean(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL);
const EMAIL_A = "vitest+trap-shift-a@ksmvp.invalid";
const EMAIL_B = "vitest+trap-shift-b@ksmvp.invalid";
const prisma = new PrismaClient();

type Fixture = { seed: number; routes: number[]; log: [number, number][] };
const A = (fixtures as unknown as Record<string, Fixture>).A;

async function purge() {
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL_A, EMAIL_B] } } });
}

describe.skipIf(!DB_CONFIGURED)("trap shift — database rules", () => {
  let userA = "";
  let userB = "";
  const today = etToday();
  const playedOn = etDateStringToStorageDate(today);

  async function unlock(userId: string, tasks = "Inbox triage, CRM cleanup") {
    await prisma.timeEntry.deleteMany({ where: { vaId: userId } });
    await prisma.timeEntry.create({
      data: { vaId: userId, workDate: playedOn, startOfDayTasks: tasks, entryType: "WORK", status: "OPEN" },
    });
  }

  /** Point a started try at the Appendix D fixture and back-date its issue time. */
  async function rigToFixture(runId: string, secondsAgo: number) {
    await prisma.miniGameRun.update({
      where: { id: runId },
      data: { seed: A.seed, routes: A.routes, startedAt: new Date(Date.now() - secondsAgo * 1000) },
    });
  }

  async function startOk(userId: string) {
    const r = await startTrapRun(userId);
    if (!r.ok) throw new Error(`start failed: ${r.status} ${r.message}`);
    return r;
  }

  beforeAll(async () => {
    await purge();
    const base = { role: "VA", title: "Automated test account", passwordHash: "not-a-real-hash" };
    userA = (await prisma.user.create({ data: { ...base, name: "Vitest Trap A", email: EMAIL_A } })).id;
    userB = (await prisma.user.create({ data: { ...base, name: "Vitest Trap B", email: EMAIL_B } })).id;
  });

  afterAll(async () => {
    await purge();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.miniGameRun.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await unlock(userA);
    await unlock(userB);
  });

  it("refuses to start for a VA with a Start of Day but no saved task (403)", async () => {
    await unlock(userA, "   ");
    const r = await startTrapRun(userA);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.status).toBe(403);
    expect(await prisma.miniGameRun.count({ where: { userId: userA } })).toBe(0);
  });

  it("issues server seeds and routes, and never returns a seed from session", async () => {
    const r = await startOk(userA);
    expect(r.attemptNo).toBe(1);
    expect(r.attemptsLeft).toBe(2);
    const row = await prisma.miniGameRun.findUniqueOrThrow({ where: { id: r.runId } });
    expect(row.seed).toBe(r.seed);
    expect(row.routes).toEqual(r.routes);
    expect(row.status).toBe(RUN_STARTED);
    const s = await getTrapSession(userA);
    expect(s).not.toHaveProperty("seed");
    expect(s.attemptsUsed).toBe(1);
  });

  it("refuses a 4th start on the same day (409)", async () => {
    for (let i = 0; i < 3; i++) await startOk(userA);
    const fourth = await startTrapRun(userA);
    expect(!fourth.ok && fourth.status).toBe(409);
    expect(await prisma.miniGameRun.count({ where: { userId: userA } })).toBe(3);
  });

  it("10 parallel starts create exactly 3 tries", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => startTrapRun(userA)));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.filter((r) => !r.ok && r.status === 409)).toHaveLength(7);
    const rows = await prisma.miniGameRun.findMany({ where: { userId: userA }, orderBy: { attemptNo: "asc" } });
    expect(rows.map((r) => r.attemptNo)).toEqual([1, 2, 3]);
  });

  it("the CHECK constraint refuses attemptNo = 4 on a direct insert", async () => {
    await expect(
      prisma.miniGameRun.create({
        data: { userId: userA, gameKey: TRAP_GAME_KEY, season: today.slice(0, 7), playedOn, seed: 1, attemptNo: 4 },
      }),
    ).rejects.toThrow(/attemptNo_check|check constraint/i);
  });

  it("start then start again abandons the first try, and it still counts", async () => {
    const first = await startOk(userA);
    const second = await startOk(userA);
    expect(second.attemptNo).toBe(2);
    const row = await prisma.miniGameRun.findUniqueOrThrow({ where: { id: first.runId } });
    expect(row.status).toBe(RUN_ABANDONED);
    expect(row.score).toBe(0);
    expect((await getTrapSession(userA)).attemptsLeft).toBe(1);
  });

  it("scores the fixture from the stored seed and routes, then refuses a double submit", async () => {
    const run = await startOk(userA);
    await rigToFixture(run.runId, 60);

    const r = await scoreTrapRun(userA, run.runId, A.log);
    expect(r).toMatchObject({ ok: true, score: 375, cleared: 3, ended: "won", todayBest: 375, seasonTotal: 375 });

    const row = await prisma.miniGameRun.findUniqueOrThrow({ where: { id: run.runId } });
    expect(row).toMatchObject({ status: RUN_SUBMITTED, score: 375, frames: 2268, ended: "won", flagged: true });
    expect(row.flagReason).toContain("perfect run");

    const again = await scoreTrapRun(userA, run.runId, A.log);
    expect(!again.ok && again.status).toBe(409);
  });

  it("another VA's runId is 404 and changes nothing", async () => {
    const run = await startOk(userA);
    await rigToFixture(run.runId, 60);
    const r = await scoreTrapRun(userB, run.runId, A.log);
    expect(!r.ok && r.status).toBe(404);
    const row = await prisma.miniGameRun.findUniqueOrThrow({ where: { id: run.runId } });
    expect(row.status).toBe(RUN_STARTED);
    expect(row.score).toBe(0);
  });

  it("rejects and flags a 2,268-frame log submitted 2 seconds after start (422)", async () => {
    const run = await startOk(userA);
    await rigToFixture(run.runId, 2);
    const r = await scoreTrapRun(userA, run.runId, A.log);
    expect(!r.ok && r.status).toBe(422);
    const row = await prisma.miniGameRun.findUniqueOrThrow({ where: { id: run.runId } });
    expect(row.flagged).toBe(true);
    expect(row.flagReason).toMatch(/real-time/);
    expect(row.score).toBe(0);
    expect(row.status).not.toBe(RUN_SUBMITTED);
  });

  it("expires a try that is not scored within 20 minutes (410)", async () => {
    const run = await startOk(userA);
    await rigToFixture(run.runId, 21 * 60);
    const r = await scoreTrapRun(userA, run.runId, A.log);
    expect(!r.ok && r.status).toBe(410);
    expect((await prisma.miniGameRun.findUniqueOrThrow({ where: { id: run.runId } })).status).toBe(RUN_ABANDONED);
  });

  it("refuses a malformed log (400) without spending the score", async () => {
    const run = await startOk(userA);
    const r = await scoreTrapRun(userA, run.runId, [[9, 1]]);
    expect(!r.ok && r.status).toBe(400);
    expect((await prisma.miniGameRun.findUniqueOrThrow({ where: { id: run.runId } })).status).toBe(RUN_STARTED);
  });

  it("scores a partial log as quit with the distance so far", async () => {
    const run = await startOk(userA);
    await rigToFixture(run.runId, 60);
    const r = await scoreTrapRun(userA, run.runId, [[2, 60]]);
    expect(r).toMatchObject({ ok: true, ended: "quit" });
  });

  it("season = sum of daily bests; only the best try of a day counts", async () => {
    const season = today.slice(0, 7);
    const yesterday = new Date(playedOn.getTime() - 86_400_000);
    const sameMonth = yesterday.toISOString().slice(0, 7) === season;
    const base = { userId: userA, gameKey: TRAP_GAME_KEY, season, seed: 1, status: RUN_SUBMITTED, submittedAt: new Date() };
    await prisma.miniGameRun.createMany({
      data: [
        { ...base, playedOn, attemptNo: 1, score: 40, cleared: 0 },
        { ...base, playedOn, attemptNo: 2, score: 140, cleared: 1 },
        { ...base, playedOn, attemptNo: 3, score: 0, status: RUN_ABANDONED },
        ...(sameMonth ? [{ ...base, playedOn: yesterday, attemptNo: 1, score: 60, cleared: 0 }] : []),
      ],
    });
    const mine = (await getTrapBoard(season)).find((r) => r.userId === userA)!;
    expect(mine.total).toBe(140 + (sameMonth ? 60 : 0));
    expect(mine.todayBest).toBe(140);
    expect(mine.cleared).toBe(1);
  });

  describe("wall of fame", () => {
    it("still renders the archived Stretch Goal season (September)", async () => {
      const champions = await getPastChampions(6);
      const september = champions.find((c) => c.monthKey === "2026-09");
      expect(september?.gameName).toBe("Stretch Goal");
      expect(september!.score).toBeGreaterThan(0);
      expect(september!.voidReason).toBeUndefined();
    });

    it("shows October as void and never crowns it", async () => {
      const october = (await getPastChampions(6)).find((c) => c.monthKey === "2026-10");
      if (october) expect(october.voidReason).toBeTruthy();
      const champion = await getReigningChampion(new Date("2026-11-15T15:00:00Z"));
      expect(champion.monthLabel).toBe("September 2026");
    });
  });
});
