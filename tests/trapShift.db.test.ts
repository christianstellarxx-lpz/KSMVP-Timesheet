import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import {
  CURRENT_REPLAY_VERSION,
  MAX_TRIES,
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
import type { InputLog } from "@/lib/trapshift/trapShiftCore";
import fixturesV1 from "./trapShift.fixtures.v1.json";
import fixturesV3 from "./trapShift.fixtures.v3.json";

/**
 * Trap Shift — the rules only the database can prove: tries per day held by
 * UNIQUE + CHECK, the version gate, server-chosen save points, refresh-to-retry
 * spending a try, ownership, double submit, the real-time check, the unlock
 * gate and the v3 board. Runs against two throwaway users, deleted in afterAll.
 * Skips itself when no database is configured.
 */

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

// The /start route reads the signed-in user from the cookie; stand that in.
const auth = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/session", () => ({
  getSession: async () => (auth.userId ? { userId: auth.userId, role: "VA" } : null),
  canViewVa: (role: string) => ["VA_ADMIN", "VA", "INTERN"].includes(role),
}));
import { POST as startRoute } from "@/app/api/minigame/start/route";

const DB_CONFIGURED = Boolean(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL);
const EMAIL_A = "vitest+trap-shift-a@ksmvp.invalid";
const EMAIL_B = "vitest+trap-shift-b@ksmvp.invalid";
const prisma = new PrismaClient();

type Fixture = { seed: number; routes: number[]; log: [number, number][] };
const ABA = (fixturesV3 as unknown as Record<string, Fixture>).ABA;
const V1A = (fixturesV1 as unknown as Record<string, Fixture>).A;
const V = CURRENT_REPLAY_VERSION;

/** The first n frames of a log. */
function truncate(log: [number, number][], n: number): InputLog {
  const out: InputLog = [];
  for (const [b, k] of log) {
    if (n <= 0) break;
    out.push([b, Math.min(k, n)]);
    n -= k;
  }
  return out;
}
/** ABA cut at 1,300 frames: past the Level 2 halfway post (1,149), short of Level 3 (1,565). */
const ABA_TO_CP3 = truncate(ABA.log, 1300);

async function purge() {
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL_A, EMAIL_B] } } });
}

describe.skipIf(!DB_CONFIGURED)("trap shift — database rules", () => {
  let userA = "";
  let userB = "";
  const today = etToday();
  const playedOn = etDateStringToStorageDate(today);
  const season = today.slice(0, 7);

  async function unlock(userId: string, tasks = "Inbox triage, CRM cleanup") {
    await prisma.timeEntry.deleteMany({ where: { vaId: userId } });
    await prisma.timeEntry.create({
      data: { vaId: userId, workDate: playedOn, startOfDayTasks: tasks, entryType: "WORK", status: "OPEN" },
    });
  }

  /** Point a started try at a fixture and back-date its issue time. */
  async function rigTo(runId: string, f: Fixture, secondsAgo: number) {
    await prisma.miniGameRun.update({
      where: { id: runId },
      data: { seed: f.seed, routes: f.routes, startedAt: new Date(Date.now() - secondsAgo * 1000) },
    });
  }

  async function startOk(userId: string) {
    const r = await startTrapRun(userId, V);
    if (!r.ok) throw new Error(`start failed: ${r.status} ${r.message}`);
    return r;
  }

  function startViaRoute(userId: string, body: unknown) {
    auth.userId = userId;
    return startRoute(
      new NextRequest("http://localhost/api/minigame/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
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

  /* ------------------------------------------------------------ tries */

  it("is 5 tries a day", () => {
    expect(MAX_TRIES).toBe(5);
  });

  it("refuses to start for a VA with a Start of Day but no saved task (403)", async () => {
    await unlock(userA, "   ");
    const r = await startTrapRun(userA, V);
    expect(!r.ok && r.status).toBe(403);
    expect(await prisma.miniGameRun.count({ where: { userId: userA } })).toBe(0);
  });

  it("issues server seeds and routes, and never returns a seed from session", async () => {
    const r = await startOk(userA);
    expect(r.attemptNo).toBe(1);
    expect(r.attemptsLeft).toBe(4);
    const row = await prisma.miniGameRun.findUniqueOrThrow({ where: { id: r.runId } });
    expect(row.seed).toBe(r.seed);
    expect(row.routes).toEqual(r.routes);
    expect(row.status).toBe(RUN_STARTED);
    expect(row.replayVersion).toBe(3);
    const s = await getTrapSession(userA);
    expect(s).not.toHaveProperty("seed");
    expect(s.attemptsUsed).toBe(1);
  });

  it("refuses a 6th start on the same day (409)", async () => {
    for (let i = 0; i < 5; i++) await startOk(userA);
    const sixth = await startTrapRun(userA, V);
    expect(!sixth.ok && sixth.status).toBe(409);
    expect(await prisma.miniGameRun.count({ where: { userId: userA } })).toBe(5);
  });

  it("10 parallel starts create exactly 5 tries", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => startTrapRun(userA, V)));
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect(results.filter((r) => !r.ok && r.status === 409)).toHaveLength(5);
    const rows = await prisma.miniGameRun.findMany({ where: { userId: userA }, orderBy: { attemptNo: "asc" } });
    expect(rows.map((r) => r.attemptNo)).toEqual([1, 2, 3, 4, 5]);
  });

  it("the CHECK constraint refuses attemptNo = 6 on a direct insert", async () => {
    await expect(
      prisma.miniGameRun.create({
        data: { userId: userA, gameKey: TRAP_GAME_KEY, season, playedOn, seed: 1, attemptNo: 6 },
      }),
    ).rejects.toThrow(/attemptNo_check|check constraint/i);
  });

  it("the CHECK constraint refuses startCp = 6 on a direct insert", async () => {
    await expect(
      prisma.miniGameRun.create({
        data: { userId: userA, gameKey: TRAP_GAME_KEY, season, playedOn, seed: 1, attemptNo: 1, startCp: 6 },
      }),
    ).rejects.toThrow(/startCp_check|check constraint/i);
  });

  it("start then start again abandons the first try, and it still counts", async () => {
    const first = await startOk(userA);
    const second = await startOk(userA);
    expect(second.attemptNo).toBe(2);
    const row = await prisma.miniGameRun.findUniqueOrThrow({ where: { id: first.runId } });
    expect(row.status).toBe(RUN_ABANDONED);
    expect(row.score).toBe(0);
    expect((await getTrapSession(userA)).attemptsLeft).toBe(3);
  });

  /* ------------------------------------------------------ version gate */

  it("an old clientVersion gets 409 update_required and creates no row", async () => {
    const r = await startTrapRun(userA, 1);
    expect(r).toMatchObject({ ok: false, status: 409, code: "update_required" });

    const viaRoute = await startViaRoute(userA, { clientVersion: 1 });
    expect(viaRoute.status).toBe(409);
    expect((await viaRoute.json()).code).toBe("update_required");

    // A v1 page sends no body at all.
    const noBody = await startViaRoute(userA, undefined);
    expect(noBody.status).toBe(409);
    expect(await prisma.miniGameRun.count({ where: { userId: userA } })).toBe(0);
  });

  /* ------------------------------------------------------- save points */

  it("a submitted try that reached save point 3 makes the next start begin there", async () => {
    const run = await startOk(userA);
    expect(run.startCp).toBe(0);
    await rigTo(run.runId, ABA, 60);
    const r = await scoreTrapRun(userA, run.runId, ABA_TO_CP3);
    expect(r).toMatchObject({ ok: true, ended: "quit", nextStartCp: 3 });
    expect((await prisma.miniGameRun.findUniqueOrThrow({ where: { id: run.runId } })).checkpointReached).toBe(3);

    const next = await startOk(userA);
    expect(next.startCp).toBe(3);
    expect((await prisma.miniGameRun.findUniqueOrThrow({ where: { id: next.runId } })).startCp).toBe(3);

    // Abandoning that try (start again) doesn't move the save point.
    const after = await startOk(userA);
    expect(after.startCp).toBe(3);
  });

  it("a startCp sent by the client is ignored", async () => {
    const fresh = await startViaRoute(userA, { clientVersion: V, startCp: 5 });
    expect(fresh.status).toBe(200);
    expect((await fresh.json()).startCp).toBe(0);

    await prisma.miniGameRun.updateMany({
      where: { userId: userA },
      data: { status: RUN_SUBMITTED, checkpointReached: 3, submittedAt: new Date() },
    });
    const res = await startViaRoute(userA, { clientVersion: V, startCp: 5 });
    const body = await res.json();
    expect(body.startCp).toBe(3);
    expect((await prisma.miniGameRun.findUniqueOrThrow({ where: { id: body.runId } })).startCp).toBe(3);
  });

  it("abandoned rows and yesterday's tries never set the save point", async () => {
    const yesterday = new Date(playedOn.getTime() - 86_400_000);
    const base = { userId: userA, gameKey: TRAP_GAME_KEY, seed: 1, replayVersion: V };
    await prisma.miniGameRun.createMany({
      data: [
        { ...base, season: yesterday.toISOString().slice(0, 7), playedOn: yesterday, attemptNo: 1, status: RUN_SUBMITTED, checkpointReached: 5 },
        { ...base, season, playedOn, attemptNo: 1, status: RUN_ABANDONED, checkpointReached: 4 },
      ],
    });
    const r = await startOk(userA);
    expect(r.startCp).toBe(0);
  });

  /* --------------------------------------------- scoring and security */

  it("scores the fixture from the stored seed and routes, flags the 300, then refuses a double submit", async () => {
    const run = await startOk(userA);
    await rigTo(run.runId, ABA, 60);

    const r = await scoreTrapRun(userA, run.runId, ABA.log);
    expect(r).toMatchObject({ ok: true, score: 300, cleared: 3, ended: "won", todayBest: 300, seasonBest: 300, attemptsLeft: 4, nextStartCp: 5 });

    const row = await prisma.miniGameRun.findUniqueOrThrow({ where: { id: run.runId } });
    expect(row).toMatchObject({ status: RUN_SUBMITTED, score: 300, frames: 2313, ended: "won", checkpointReached: 5, flagged: true });
    expect(row.flagReason).toContain("finished run");

    const again = await scoreTrapRun(userA, run.runId, ABA.log);
    expect(!again.ok && again.status).toBe(409);

    // After a 300, the rest of today's tries start at Level 3 halfway.
    expect((await startOk(userA)).startCp).toBe(5);
  });

  it("a try started on v1 is still replayed on the v1 core", async () => {
    const run = await startOk(userA);
    await prisma.miniGameRun.update({ where: { id: run.runId }, data: { replayVersion: 1 } });
    await rigTo(run.runId, V1A, 60);
    const r = await scoreTrapRun(userA, run.runId, V1A.log);
    expect(r).toMatchObject({ ok: true, score: 375 });
    const row = await prisma.miniGameRun.findUniqueOrThrow({ where: { id: run.runId } });
    expect(row.checkpointReached).toBeNull();
    expect(row.flagReason).toContain("perfect run");
  });

  it("another VA's runId is 404 and changes nothing", async () => {
    const run = await startOk(userA);
    await rigTo(run.runId, ABA, 60);
    const r = await scoreTrapRun(userB, run.runId, ABA.log);
    expect(!r.ok && r.status).toBe(404);
    const row = await prisma.miniGameRun.findUniqueOrThrow({ where: { id: run.runId } });
    expect(row.status).toBe(RUN_STARTED);
    expect(row.score).toBe(0);
  });

  it("rejects and flags a 2,313-frame log submitted 2 seconds after start (422)", async () => {
    const run = await startOk(userA);
    await rigTo(run.runId, ABA, 2);
    const r = await scoreTrapRun(userA, run.runId, ABA.log);
    expect(!r.ok && r.status).toBe(422);
    const row = await prisma.miniGameRun.findUniqueOrThrow({ where: { id: run.runId } });
    expect(row.flagged).toBe(true);
    expect(row.flagReason).toMatch(/real-time/);
    expect(row.score).toBe(0);
    expect(row.status).not.toBe(RUN_SUBMITTED);
  });

  it("expires a try that is not scored within 20 minutes (410)", async () => {
    const run = await startOk(userA);
    await rigTo(run.runId, ABA, 21 * 60);
    const r = await scoreTrapRun(userA, run.runId, ABA.log);
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
    await rigTo(run.runId, ABA, 60);
    const r = await scoreTrapRun(userA, run.runId, [[2, 60]]);
    expect(r).toMatchObject({ ok: true, ended: "quit" });
  });

  /* -------------------------------------------------------- the board */

  it("v3 board: best single try (MAX, not SUM), ignores v1 rows, 300-vs-300 goes to fewer frames", async () => {
    const base = { gameKey: TRAP_GAME_KEY, season, playedOn, seed: 1, status: RUN_SUBMITTED, submittedAt: new Date() };
    await prisma.miniGameRun.createMany({
      data: [
        // A: two 300s (the faster is 2,400 frames), and a v1 375 that must not count.
        { ...base, userId: userA, attemptNo: 1, score: 140, frames: 900, replayVersion: 3 },
        { ...base, userId: userA, attemptNo: 2, score: 300, frames: 2600, replayVersion: 3 },
        { ...base, userId: userA, attemptNo: 3, score: 300, frames: 2400, replayVersion: 3 },
        { ...base, userId: userA, attemptNo: 4, score: 375, frames: 2000, replayVersion: 1 },
        // B: one 300, faster than A's best.
        { ...base, userId: userB, attemptNo: 1, score: 300, frames: 2313, replayVersion: 3, submittedAt: new Date(Date.now() + 60_000) },
        { ...base, userId: userB, attemptNo: 2, score: 0, status: RUN_ABANDONED, replayVersion: 3 },
      ],
    });
    const board = await getTrapBoard(season);
    const a = board.find((r) => r.userId === userA)!;
    const b = board.find((r) => r.userId === userB)!;
    expect(a).toMatchObject({ best: 300, frames: 2400, reached: "Finished", todayBest: 300 });
    expect(b).toMatchObject({ best: 300, frames: 2313 });
    expect(b.rank).toBeLessThan(a.rank);

    const s = await getTrapSession(userA);
    expect(s.seasonBest).toBe(300);
    expect(s.todayBest).toBe(300);
  });

  it("a VA with only v1 rows is not on the v3 board", async () => {
    await prisma.miniGameRun.create({
      data: { userId: userA, gameKey: TRAP_GAME_KEY, season, playedOn, seed: 1, attemptNo: 1, score: 200, status: RUN_SUBMITTED, replayVersion: 1, submittedAt: new Date() },
    });
    expect((await getTrapBoard(season)).find((r) => r.userId === userA)).toBeUndefined();
    expect((await getTrapSession(userA)).seasonBest).toBeNull();
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
