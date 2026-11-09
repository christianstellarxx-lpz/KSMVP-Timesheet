import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma, PrismaClient } from "@prisma/client";
import { simulateRun } from "@/lib/stretch/core";
import {
  RUN_ISSUED,
  RUN_STARTED,
  RUN_SUBMITTED,
  STRETCH_GAME_KEY,
  getDailyTally,
  getMiniGameSession,
  isUnlockedToday,
  startRun,
  submitRun,
} from "@/games/_archive/stretch/game";
import { getPastChampions } from "@/lib/leaderboards/registry";
import { etDateStringToStorageDate, etToday } from "@/lib/time";
import { driveRun, jitterForBeam } from "./helpers/stretchBot";

/**
 * Stretch Goal — the guarantees that only the database can prove.
 *
 * The pure tests show the replay maths is sound. These show the rules around it
 * actually hold: one ranked run per person per day enforced by a UNIQUE index
 * rather than by the UI, the unlock gate refusing a VA who has timed in but not
 * saved a start-of-day task, the seed never being re-rolled, and the archived
 * Word game still crowning August on the wall of fame.
 *
 * Isolation: everything runs against a throwaway user created here and deleted
 * in `afterAll`. No real member's rows are read or written. The whole file skips
 * itself when no database is configured, so `npm test` still passes offline.
 */

/**
 * Neon autosuspends, so the first query of a run pays a cold start and every
 * later one still crosses the network. The 5s default is for pure tests; these
 * legitimately take seconds.
 */
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const DB_CONFIGURED = Boolean(
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
);

const TEST_EMAIL = "vitest+stretch-goal@ksmvp.invalid";
const prisma = new PrismaClient();

/** Remove the fixture user and everything cascading from it. */
async function purgeFixture(): Promise<void> {
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
}

describe.skipIf(!DB_CONFIGURED)("stretch goal — database rules", () => {
  let userId = "";
  const today = etToday();
  const playedOn = etDateStringToStorageDate(today);

  beforeAll(async () => {
    // A previous crashed run could have left the fixture behind.
    await purgeFixture();
    const user = await prisma.user.create({
      data: {
        role: "VA",
        name: "Vitest Fixture (Stretch Goal)",
        title: "Automated test account",
        email: TEST_EMAIL,
        passwordHash: "not-a-real-hash",
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await purgeFixture();
    await prisma.$disconnect();
  });

  /* -----------------------------------------------------------------------
     4. Unlock — timed in is not enough on its own
     ----------------------------------------------------------------------- */

  describe("the unlock gate", () => {
    it("is locked before the VA has timed in at all", async () => {
      await prisma.timeEntry.deleteMany({ where: { vaId: userId } });
      expect(await isUnlockedToday(userId)).toBe(false);

      const session = await getMiniGameSession(userId);
      expect(session.unlocked).toBe(false);
      expect(session.runState).toBe("available");
      expect(session.seed).toBeNull();
      // A locked VA must not be issued a seed — otherwise today's seed could be
      // farmed before the shift even starts.
      const rows = await prisma.miniGameRun.count({ where: { userId } });
      expect(rows).toBe(0);
    });

    it("stays locked for a VA who has timed in but saved no start-of-day task", async () => {
      await prisma.timeEntry.deleteMany({ where: { vaId: userId } });
      await prisma.timeEntry.create({
        data: {
          vaId: userId,
          workDate: playedOn,
          timeIn: new Date(),
          startOfDayTasks: "", // timed in, nothing logged
          entryType: "WORK",
          status: "OPEN",
        },
      });

      expect(await isUnlockedToday(userId)).toBe(false);
      const session = await getMiniGameSession(userId);
      expect(session.unlocked).toBe(false);
      expect(session.runUsed).toBe(false);
      expect(session.seed).toBeNull();
    });

    it("stays locked on a PTO day", async () => {
      await prisma.timeEntry.deleteMany({ where: { vaId: userId } });
      await prisma.timeEntry.create({
        data: {
          vaId: userId,
          workDate: playedOn,
          startOfDayTasks: "Paid time off",
          entryType: "PTO",
          status: "CLOSED",
        },
      });
      expect(await isUnlockedToday(userId)).toBe(false);
    });

    it("unlocks once the VA has timed in AND logged a start-of-day task", async () => {
      await prisma.timeEntry.deleteMany({ where: { vaId: userId } });
      await prisma.timeEntry.create({
        data: {
          vaId: userId,
          workDate: playedOn,
          timeIn: new Date(),
          startOfDayTasks: "Inbox triage, CRM cleanup, follow-up calls",
          entryType: "WORK",
          status: "OPEN",
        },
      });
      expect(await isUnlockedToday(userId)).toBe(true);
    });
  });

  /* -----------------------------------------------------------------------
     The seed is issued once and never re-rolled
     ----------------------------------------------------------------------- */

  describe("seed issuance", () => {
    it("issues one seed and returns the same one on every later request", async () => {
      await prisma.miniGameRun.deleteMany({ where: { userId } });

      const first = await getMiniGameSession(userId);
      expect(first.unlocked).toBe(true);
      expect(first.runUsed).toBe(false);
      expect(first.seed).toBeTypeOf("number");

      // Refreshing the page must not hand out a fresh layout each time.
      for (let i = 0; i < 4; i++) {
        const again = await getMiniGameSession(userId);
        expect(again.seed).toBe(first.seed);
      }

      const rows = await prisma.miniGameRun.findMany({ where: { userId } });
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe(RUN_ISSUED);
      expect(rows[0].gameKey).toBe(STRETCH_GAME_KEY);
      expect(rows[0].season).toBe(today.slice(0, 7));
      // Must fit a Postgres INTEGER, or the stored seed would not match the
      // one the replay was played on.
      expect(rows[0].seed).toBeGreaterThanOrEqual(0);
      expect(rows[0].seed).toBeLessThan(2 ** 31);
    });

    it("issues seeds concurrently without minting a second one", async () => {
      await prisma.miniGameRun.deleteMany({ where: { userId } });

      const sessions = await Promise.all(
        Array.from({ length: 5 }, () => getMiniGameSession(userId)),
      );
      const seeds = new Set(sessions.map((s) => s.seed));
      expect(seeds.size).toBe(1);
      expect(await prisma.miniGameRun.count({ where: { userId } })).toBe(1);
    });
  });

  /* -----------------------------------------------------------------------
     3. One ranked run per day — enforced by the database
     ----------------------------------------------------------------------- */

  describe("one run per day", () => {
    it("the UNIQUE index rejects a second row for the same VA and day", async () => {
      await prisma.miniGameRun.deleteMany({ where: { userId } });

      await prisma.miniGameRun.create({
        data: {
          userId,
          gameKey: STRETCH_GAME_KEY,
          season: today.slice(0, 7),
          playedOn,
          seed: 12345,
          status: RUN_ISSUED,
        },
      });

      // Not a UI check, not an application check — the constraint itself.
      let code: string | undefined;
      try {
        await prisma.miniGameRun.create({
          data: {
            userId,
            gameKey: STRETCH_GAME_KEY,
            season: today.slice(0, 7),
            playedOn,
            seed: 99999,
            status: RUN_ISSUED,
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) code = e.code;
      }
      expect(code).toBe("P2002");
      expect(await prisma.miniGameRun.count({ where: { userId } })).toBe(1);
    });

    it("records the server's own score, then rejects the second submission", async () => {
      await prisma.miniGameRun.deleteMany({ where: { userId } });

      const session = await getMiniGameSession(userId);
      const seed = session.seed!;
      const run = driveRun(seed, 60, jitterForBeam);
      expect(run.over).toBe(true);
      expect(run.score).toBeGreaterThanOrEqual(50);

      const claim = await startRun(userId);
      expect(claim.ok).toBe(true);

      const first = await submitRun(userId, seed, run.holds);
      expect(first.ok).toBe(true);
      if (!first.ok) throw new Error(first.message);

      // The stored numbers are simulateRun's, not the client's.
      const truth = simulateRun(seed, run.holds);
      expect(first.run.score).toBe(truth.score);
      expect(first.run.perfects).toBe(truth.perfects);
      expect(first.run.tier).toBe(truth.tier);

      const stored = await prisma.miniGameRun.findFirstOrThrow({
        where: { userId },
      });
      expect(stored.status).toBe(RUN_SUBMITTED);
      expect(stored.score).toBe(truth.score);
      expect(stored.perfects).toBe(truth.perfects);
      expect(stored.tier).toBe(truth.tier);
      expect(stored.replayVersion).toBe(1);
      expect(stored.submittedAt).not.toBeNull();

      // The second attempt of the day is refused.
      const second = await submitRun(userId, seed, run.holds);
      expect(second.ok).toBe(false);
      if (second.ok) throw new Error("a second run was accepted");
      expect(second.status).toBe(409);

      // And the first score is untouched.
      const after = await prisma.miniGameRun.findFirstOrThrow({ where: { userId } });
      expect(after.score).toBe(truth.score);

      const session2 = await getMiniGameSession(userId);
      expect(session2.runUsed).toBe(true);
      expect(session2.seed).toBe(seed);
    });

    it("refuses a replay played on a seed the server did not issue", async () => {
      await prisma.miniGameRun.deleteMany({ where: { userId } });

      const session = await getMiniGameSession(userId);
      const issued = session.seed!;
      await startRun(userId);
      const forgedSeed = (issued + 1) % 2 ** 31;
      const run = driveRun(forgedSeed, 60, jitterForBeam);

      const result = await submitRun(userId, forgedSeed, run.holds);
      expect(result.ok).toBe(false);

      const row = await prisma.miniGameRun.findFirstOrThrow({ where: { userId } });
      expect(row.status).toBe(RUN_STARTED);
      expect(row.score).toBe(0);
    });

    it("refuses an unfinished replay", async () => {
      await prisma.miniGameRun.deleteMany({ where: { userId } });

      const session = await getMiniGameSession(userId);
      const seed = session.seed!;
      await startRun(userId);
      const run = driveRun(seed, 60, jitterForBeam);

      // Drop the fatal hold: the player is still standing.
      const result = await submitRun(userId, seed, run.holds.slice(0, -1));
      expect(result.ok).toBe(false);

      const row = await prisma.miniGameRun.findFirstOrThrow({ where: { userId } });
      expect(row.status).toBe(RUN_STARTED);
      expect(row.score).toBe(0);
    });
  });

  /* -----------------------------------------------------------------------
     One TRY per day — the attempt is spent on start, not on submit
     ----------------------------------------------------------------------- */

  describe("one try per day", () => {
    it("spends the attempt the moment the run starts", async () => {
      await prisma.miniGameRun.deleteMany({ where: { userId } });

      const before = await getMiniGameSession(userId);
      expect(before.runUsed).toBe(false);
      expect(before.runState).toBe("available");

      const claim = await startRun(userId);
      expect(claim.ok).toBe(true);
      if (!claim.ok) throw new Error(claim.message);
      expect(claim.seed).toBe(before.seed);

      const after = await getMiniGameSession(userId);
      expect(after.runUsed).toBe(true);
      expect(after.runState).toBe("started");

      const row = await prisma.miniGameRun.findFirstOrThrow({ where: { userId } });
      expect(row.status).toBe(RUN_STARTED);
      expect(row.startedAt).not.toBeNull();
    });

    it("refuses a second start, so reloading mid-run cannot replay the day", async () => {
      await prisma.miniGameRun.deleteMany({ where: { userId } });

      const first = await startRun(userId);
      expect(first.ok).toBe(true);

      // This is the hole the rule closes: quit mid-run, reload, try again.
      const second = await startRun(userId);
      expect(second.ok).toBe(false);
      if (second.ok) throw new Error("a second run was started");
      expect(second.status).toBe(409);

      expect(await prisma.miniGameRun.count({ where: { userId } })).toBe(1);
    });

    it("lets only one of several concurrent starts win", async () => {
      await prisma.miniGameRun.deleteMany({ where: { userId } });
      await getMiniGameSession(userId); // issue the seed first

      const results = await Promise.all(
        Array.from({ length: 5 }, () => startRun(userId)),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok)).toHaveLength(4);
    });

    it("keeps an abandoned run spent, at zero", async () => {
      await prisma.miniGameRun.deleteMany({ where: { userId } });

      const session = await getMiniGameSession(userId);
      await startRun(userId);
      // The player closes the tab. No score is ever submitted.

      const after = await getMiniGameSession(userId);
      expect(after.runUsed).toBe(true);
      expect(after.runState).toBe("started");
      // Same seed, but it can no longer be played.
      expect(after.seed).toBe(session.seed);
      expect((await startRun(userId)).ok).toBe(false);

      const row = await prisma.miniGameRun.findFirstOrThrow({ where: { userId } });
      expect(row.score).toBe(0);
      expect(row.status).toBe(RUN_STARTED);
    });

    it("refuses a score for a run that was never started", async () => {
      await prisma.miniGameRun.deleteMany({ where: { userId } });

      const session = await getMiniGameSession(userId);
      const seed = session.seed!;
      const run = driveRun(seed, 60, jitterForBeam);

      // Skipping /start would otherwise allow unlimited offline rehearsal.
      const result = await submitRun(userId, seed, run.holds);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("an unclaimed run was scored");
      expect(result.status).toBe(409);

      const row = await prisma.miniGameRun.findFirstOrThrow({ where: { userId } });
      expect(row.status).toBe(RUN_ISSUED);
      expect(row.score).toBe(0);
    });

    it("cannot start again after a score has been submitted", async () => {
      await prisma.miniGameRun.deleteMany({ where: { userId } });

      const session = await getMiniGameSession(userId);
      const seed = session.seed!;
      await startRun(userId);
      const run = driveRun(seed, 60, jitterForBeam);
      expect((await submitRun(userId, seed, run.holds)).ok).toBe(true);

      const again = await startRun(userId);
      expect(again.ok).toBe(false);

      const after = await getMiniGameSession(userId);
      expect(after.runState).toBe("submitted");
      expect(after.runUsed).toBe(true);
    });
  });

  /* -----------------------------------------------------------------------
     Today's tally
     ----------------------------------------------------------------------- */

  describe("daily tally", () => {
    it("lists today's submitted runs best first, flagging the caller", async () => {
      await prisma.miniGameRun.deleteMany({ where: { userId } });
      const session = await getMiniGameSession(userId);
      await startRun(userId);
      const run = driveRun(session.seed!, 40, jitterForBeam);
      expect((await submitRun(userId, session.seed!, run.holds)).ok).toBe(true);

      const tally = await getDailyTally(userId);
      expect(tally.date).toBe(today);
      expect(tally.dateLabel.length).toBeGreaterThan(0);

      const mine = tally.rows.find((r) => r.userId === userId);
      expect(mine, "the fixture's run is missing from today").toBeDefined();
      expect(mine!.isYou).toBe(true);
      expect(mine!.score).toBeGreaterThan(0);

      // Ranked score desc, then perfects desc — same order as the season board.
      for (let i = 1; i < tally.rows.length; i++) {
        const prev = tally.rows[i - 1];
        const cur = tally.rows[i];
        expect(
          prev.score > cur.score ||
            (prev.score === cur.score && prev.perfects >= cur.perfects),
          `row ${i} is out of order`,
        ).toBe(true);
      }
      expect(tally.rows.map((r) => r.rank)).toEqual(
        tally.rows.map((_, i) => i + 1),
      );
    });

    it("counts an unlocked VA who still holds their run as still to play", async () => {
      await prisma.miniGameRun.deleteMany({ where: { userId } });

      const before = await getDailyTally(userId);
      expect(before.rows.some((r) => r.userId === userId)).toBe(false);
      // The fixture is timed in with a SOD task from the unlock suite above.
      const withFixture = before.stillToPlay;
      expect(withFixture).toBeGreaterThan(0);

      // Starting spends the attempt, so they are no longer "still to play" —
      // and having not submitted, they are not a row either.
      await startRun(userId);
      const after = await getDailyTally(userId);
      expect(after.stillToPlay).toBe(withFixture - 1);
      expect(after.rows.some((r) => r.userId === userId)).toBe(false);
    });

    it("excludes a VA on PTO from the still-to-play count", async () => {
      await prisma.miniGameRun.deleteMany({ where: { userId } });
      await prisma.timeEntry.deleteMany({ where: { vaId: userId } });
      await prisma.timeEntry.create({
        data: {
          vaId: userId,
          workDate: playedOn,
          startOfDayTasks: "Paid time off",
          entryType: "PTO",
          status: "CLOSED",
        },
      });

      const tally = await getDailyTally(userId);
      // They cannot play, so they must not be counted as able to.
      const withPto = tally.stillToPlay;

      await prisma.timeEntry.deleteMany({ where: { vaId: userId } });
      await prisma.timeEntry.create({
        data: {
          vaId: userId,
          workDate: playedOn,
          timeIn: new Date(),
          startOfDayTasks: "Back at it",
          entryType: "WORK",
          status: "OPEN",
        },
      });
      const working = await getDailyTally(userId);
      expect(working.stillToPlay).toBe(withPto + 1);
    });

    it("reports an empty day for a date nobody played", async () => {
      const tally = await getDailyTally(userId, "2020-01-01");
      expect(tally.rows).toEqual([]);
      expect(tally.stillToPlay).toBe(0);
      expect(tally.date).toBe("2020-01-01");
    });

    it("is scoped to one day — yesterday's runs do not leak in", async () => {
      await prisma.miniGameRun.deleteMany({ where: { userId } });
      const yesterday = new Date(playedOn);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);

      await prisma.miniGameRun.create({
        data: {
          userId,
          gameKey: STRETCH_GAME_KEY,
          season: today.slice(0, 7),
          playedOn: yesterday,
          seed: 4242,
          score: 999,
          perfects: 99,
          tier: 4,
          replayVersion: 1,
          status: RUN_SUBMITTED,
          submittedAt: new Date(),
        },
      });

      const tally = await getDailyTally(userId);
      expect(tally.rows.some((r) => r.score === 999)).toBe(false);

      await prisma.miniGameRun.deleteMany({ where: { userId } });
    });
  });

  /* -----------------------------------------------------------------------
     5. The archive still renders
     ----------------------------------------------------------------------- */

  describe("wall of fame", () => {
    it("still crowns the archived Daily Word Guess season", async () => {
      const champions = await getPastChampions(6);
      const august = champions.find((c) => c.monthKey === "2026-08");

      expect(august, "August 2026 has no champion").toBeDefined();
      expect(august!.gameName).toBe("Daily Word Guess");
      expect(august!.name.length).toBeGreaterThan(0);
      expect(august!.score).toBeGreaterThan(0);
    });

    it("resolves each past month through the game that was live then", async () => {
      const champions = await getPastChampions(6);
      expect(champions.length).toBeGreaterThan(0);
      for (const champion of champions) {
        // A month before the rotation started belongs to Daily Flappy.
        const expected =
          champion.monthKey >= "2026-09"
            ? "Stretch Goal"
            : champion.monthKey >= "2026-08"
              ? "Daily Word Guess"
              : "DailyFlappy";
        expect(champion.gameName, champion.monthKey).toBe(expected);
      }
    });
  });
});
