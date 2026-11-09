import "server-only";
import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isUnlockedToday } from "@/lib/game";

// The unlock gate moved to src/lib/game.ts when Trap Shift took over; re-exported
// so the archived routes and tests keep their import.
export { isUnlockedToday };
import {
  etToday,
  etDateStringToStorageDate,
  formatEtDateShort,
  storageDateToEtDateString,
  type EtDateString,
} from "@/lib/time";
import { VA_ROLES } from "@/lib/session";
import {
  etCurrentMonthKey,
  monthKeyForDate,
  type MonthKey,
} from "@/lib/leaderboards/months";
import {
  REPLAY_VERSION,
  ReplayError,
  TIERS,
  simulateRun,
  type Hold,
  type LeaderRow,
} from "@/lib/stretch/core";

/**
 * Stretch Goal — server-authoritative game module.
 *
 * Every number that ends up on the leaderboard is computed here, by replaying
 * the player's own input log through the shared core. The client's claimed
 * score is never read; the POST handler does not even parse a score field.
 *
 * Three properties this module exists to protect:
 *
 *  1. The seed is issued by the server, once per ET day, and never re-rolled.
 *     The row is created at status "issued" the moment the seed is handed out,
 *     so a refresh reads that seed back rather than minting a new one — nobody
 *     can reload until they get a friendly layout.
 *  2. The stored score is `simulateRun()`'s output. See `submitRun`.
 *  3. One ranked run per person per day is enforced by the unique
 *     (userId, gameKey, playedOn) index, not by the UI.
 *
 * The unlock gate reuses `isClockedInToday` from src/lib/game.ts — the shared
 * "one try a day, after Time In" definition — rather than restating it.
 */

/** Identifies this game's rows in the shared MiniGameRun table. */
export const STRETCH_GAME_KEY = "stretch-goal";

/**
 * Row lifecycle: seed handed out -> attempt spent -> replay verified and final.
 *
 * "started" is the important one. The attempt is consumed when the player
 * presses Start, NOT when a score arrives. Consuming it on submit made this one
 * *submission* a day rather than one try a day: a player could reload mid-run,
 * be handed the same seed back, and rehearse the identical layout as often as
 * they liked before letting an attempt finish.
 */
export const RUN_ISSUED = "issued";
export const RUN_STARTED = "started";
export const RUN_SUBMITTED = "submitted";

/** How many rows the in-game side rail shows. */
const RAIL_SIZE = 10;

/**
 * Postgres INTEGER is signed 32-bit, so seeds are drawn from [0, 2^31) rather
 * than the full unsigned range. The simulation treats the seed as uint32
 * (`mulberry32` starts with `a |= 0`), so this costs one bit of seed space and
 * nothing else — and avoids an overflow that would silently corrupt a replay.
 */
const SEED_EXCLUSIVE_MAX = 2 ** 31;

/** Where today's single attempt stands. */
export type RunState = "available" | "started" | "submitted";

export interface MiniGameSession {
  /** Timed in today AND a start-of-day task is saved. */
  unlocked: boolean;
  /**
   * Today's single ranked run has been spent. True from the moment the run is
   * STARTED — an abandoned run does not hand the day back.
   */
  runUsed: boolean;
  /**
   * Finer detail than `runUsed`, so the UI can tell "you finished today's run"
   * apart from "you started one and walked away".
   */
  runState: RunState;
  /** The seed issued for today. Null while locked. */
  seed: number | null;
  /** ET calendar month, "2026-09". */
  season: MonthKey;
}

export interface SubmittedRun {
  score: number;
  perfects: number;
  tier: number;
  tierName: string;
  /** Position on this season's leaderboard after the run was recorded. */
  rank: number;
}

export type SubmitRunResult =
  | { ok: true; run: SubmittedRun }
  | { ok: false; message: string; status: number };

/** A leaderboard row plus the identity the host page needs for `isYou`. */
export interface SeasonLeaderRow extends LeaderRow {
  userId: string;
  rank: number;
}

/** Today's scoreboard: who has played today and what they got. */
export interface DailyTally {
  /** ET calendar day this tally covers. */
  date: EtDateString;
  /** "Sep 7" — compact, for the narrow rail card. */
  dateLabel: string;
  /** Everyone who submitted a run today, best first. */
  rows: SeasonLeaderRow[];
  /**
   * VAs who are unlocked today and still hold their run.
   *
   * Counted, not listed: the card should say whether the day is done without
   * doubling as a public roll call of who has not played. Someone who started
   * and abandoned is in neither number — their attempt is spent, so they are
   * not "still to play", and they never submitted, so they are not a row.
   */
  stillToPlay: number;
}

/**
 * An error whose message is safe to show a player. Anything else that escapes
 * (a Neon cold start, say) is replaced with a generic retry line, matching how
 * the rest of the app treats infrastructure failures.
 */
class PlayerError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
  }
}

/** Shown whenever today's single attempt is already gone. */
const SPENT_MESSAGE =
  "You’ve already used today’s ranked run.";

const UNLOCK_MESSAGE =
  "Send your Start of Day to play today’s run.";

const RETRY_MESSAGE =
  "The server was waking up and didn’t respond in time. Please try again in a moment.";

// ---------------------------------------------------------------------------
// Session — issue today's seed, exactly once
// ---------------------------------------------------------------------------

/**
 * Today's session for this VA.
 *
 * When unlocked with no row for today, this creates one at status "issued" with
 * a fresh seed and returns it. When a row already exists it returns the SAME
 * seed, whatever its status. Re-rolling on refresh would let someone reload
 * until they drew an easy layout, so the row is the seed's only home.
 */
export async function getMiniGameSession(userId: string): Promise<MiniGameSession> {
  const today = etToday();
  const season = etCurrentMonthKey();

  if (!(await isUnlockedToday(userId))) {
    return {
      unlocked: false,
      runUsed: false,
      runState: "available",
      seed: null,
      season,
    };
  }

  const run = await getOrIssueRun(userId, today, season);
  const runState: RunState =
    run.status === RUN_SUBMITTED
      ? "submitted"
      : run.status === RUN_STARTED
        ? "started"
        : "available";

  return {
    unlocked: true,
    // Anything past "issued" means the one try is gone.
    runUsed: runState !== "available",
    runState,
    seed: run.seed,
    season,
  };
}

// ---------------------------------------------------------------------------
// Start — this is where the single daily attempt is actually spent
// ---------------------------------------------------------------------------

export type StartRunResult =
  | { ok: true; seed: number }
  | { ok: false; message: string; status: number };

/**
 * Claim today's run.
 *
 * Called when the player presses Start, BEFORE a single frame is simulated.
 * The conditional update is the whole mechanism: exactly one caller can move
 * the row out of "issued", so a double-click, a second tab, or a reload
 * mid-run all lose the race and are told the attempt is spent.
 *
 * A player who abandons after this leaves the row at "started" with score 0.
 * That is the intended reading of one try a day — the try was taken.
 */
export async function startRun(userId: string): Promise<StartRunResult> {
  const today = etToday();

  try {
    if (!(await isUnlockedToday(userId))) {
      throw new PlayerError(UNLOCK_MESSAGE, 403);
    }

    const run = await getOrIssueRun(userId, today, etCurrentMonthKey());
    if (run.status !== RUN_ISSUED) {
      throw new PlayerError(SPENT_MESSAGE, 409);
    }

    const claimed = await prisma.miniGameRun.updateMany({
      where: { id: run.id, status: RUN_ISSUED },
      data: { status: RUN_STARTED, startedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new PlayerError(SPENT_MESSAGE, 409);
    }

    return { ok: true, seed: run.seed };
  } catch (e) {
    if (e instanceof PlayerError) {
      return { ok: false, message: e.message, status: e.status };
    }
    return { ok: false, message: RETRY_MESSAGE, status: 503 };
  }
}

/** Read today's run row, creating the "issued" one on first request of the day. */
async function getOrIssueRun(
  userId: string,
  today: EtDateString,
  season: MonthKey,
) {
  const playedOn = etDateStringToStorageDate(today);
  const key = {
    userId_gameKey_playedOn_attemptNo: { userId, gameKey: STRETCH_GAME_KEY, playedOn, attemptNo: 1 },
  };

  const existing = await prisma.miniGameRun.findUnique({ where: key });
  if (existing) return existing;

  try {
    return await prisma.miniGameRun.create({
      data: {
        userId,
        gameKey: STRETCH_GAME_KEY,
        season,
        playedOn,
        seed: randomInt(0, SEED_EXCLUSIVE_MAX),
        status: RUN_ISSUED,
        replayVersion: REPLAY_VERSION,
      },
    });
  } catch (e) {
    // Two concurrent first-requests of the day race the create; the unique
    // index settles it and the loser reads the winner's seed. This is exactly
    // the guarantee we want — a race must not mint a second seed.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const winner = await prisma.miniGameRun.findUnique({ where: key });
      if (winner) return winner;
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Submit — the server scores the run itself
// ---------------------------------------------------------------------------

/**
 * Verify and record today's run.
 *
 * `claimedScore` is not a parameter, and no caller passes one. The only inputs
 * are the seed the client echoes back (checked against the stored one) and the
 * hold log. Everything written to the row comes out of `simulateRun`.
 */
export async function submitRun(
  userId: string,
  seed: number,
  holds: Hold[],
): Promise<SubmitRunResult> {
  const today = etToday();
  const playedOn = etDateStringToStorageDate(today);

  try {
    if (!(await isUnlockedToday(userId))) {
      throw new PlayerError(UNLOCK_MESSAGE, 403);
    }

    const run = await prisma.miniGameRun.findUnique({
      where: {
        userId_gameKey_playedOn_attemptNo: { userId, gameKey: STRETCH_GAME_KEY, playedOn, attemptNo: 1 },
      },
    });

    // No issued row means no seed was ever handed out for today.
    if (!run) {
      throw new PlayerError("No run was issued for today. Reload and try again.");
    }
    if (run.status === RUN_SUBMITTED) {
      throw new PlayerError(SPENT_MESSAGE, 409);
    }
    // A score can only close out a run that was properly claimed. Without this
    // a client could skip /start, rehearse offline and submit its best attempt.
    if (run.status !== RUN_STARTED) {
      throw new PlayerError("That run was never started.", 409);
    }
    // The client echoes the seed back purely so a stale tab can be detected.
    // The replay itself always runs on the STORED seed, never this one.
    if (run.seed !== seed) {
      throw new PlayerError(
        "That run was played on a different seed. Reload and try again.",
      );
    }

    const verified = simulateRun(run.seed, holds);

    // A replay that never ends in a fall is not a scoreable run — it is either
    // truncated or still in progress.
    if (!verified.finished) {
      throw new PlayerError("That run didn’t finish, so it can’t be scored.");
    }

    // Conditioned on the row still being "issued", so a double-submit that
    // slips past the read above updates zero rows instead of overwriting a
    // recorded score.
    const written = await prisma.miniGameRun.updateMany({
      where: { id: run.id, status: RUN_STARTED },
      data: {
        holds: holds as unknown as Prisma.InputJsonValue,
        score: verified.score,
        perfects: verified.perfects,
        tier: verified.tier,
        replayVersion: REPLAY_VERSION,
        status: RUN_SUBMITTED,
        submittedAt: new Date(),
        season: monthKeyForDate(today),
      },
    });
    if (written.count === 0) {
      throw new PlayerError(SPENT_MESSAGE, 409);
    }

    const rows = await getSeasonLeaderboard(monthKeyForDate(today));
    return {
      ok: true,
      run: {
        score: verified.score,
        perfects: verified.perfects,
        tier: verified.tier,
        tierName: verified.tierName,
        rank: rows.find((r) => r.userId === userId)?.rank ?? rows.length + 1,
      },
    };
  } catch (e) {
    if (e instanceof PlayerError) {
      return { ok: false, message: e.message, status: e.status };
    }
    // A structurally invalid payload is a bad request, not a server fault.
    if (e instanceof ReplayError) {
      return { ok: false, message: "That replay wasn’t valid.", status: 400 };
    }
    return { ok: false, message: RETRY_MESSAGE, status: 503 };
  }
}

// ---------------------------------------------------------------------------
// Leaderboard — best single run per VA, per season
// ---------------------------------------------------------------------------

/**
 * Ranked table for a season: each VA's best single submitted run, ordered by
 * score desc then perfects desc.
 *
 * Read in full and reduced in JS rather than grouped in SQL — the row count is
 * bounded by (team size x days in the month), and `groupBy` cannot express
 * "the row with the highest score, breaking ties on perfects" in one query.
 */
export async function getSeasonLeaderboard(
  season: MonthKey,
): Promise<SeasonLeaderRow[]> {
  const rows = await prisma.miniGameRun.findMany({
    where: { gameKey: STRETCH_GAME_KEY, season, status: RUN_SUBMITTED },
    select: {
      userId: true,
      score: true,
      perfects: true,
      user: { select: { name: true } },
    },
  });

  const best = new Map<string, SeasonLeaderRow>();
  for (const row of rows) {
    const current = best.get(row.userId);
    const better =
      !current ||
      row.score > current.score ||
      (row.score === current.score && row.perfects > current.perfects);
    if (better) {
      best.set(row.userId, {
        rank: 0,
        userId: row.userId,
        name: row.user.name,
        score: row.score,
        perfects: row.perfects,
      });
    }
  }

  return [...best.values()]
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.perfects - a.perfects ||
        a.name.localeCompare(b.name),
    )
    .map((row, i) => ({ ...row, rank: i + 1 }));
}

/** The side-rail view: top rows, with the current player flagged. */
export async function getRailLeaderboard(
  season: MonthKey,
  meId: string,
): Promise<SeasonLeaderRow[]> {
  const rows = await getSeasonLeaderboard(season);
  const top = rows.slice(0, RAIL_SIZE).map((r) => ({ ...r, isYou: r.userId === meId }));

  // Always show the player their own row, even from outside the top N.
  const mine = rows.find((r) => r.userId === meId);
  if (mine && !top.some((r) => r.userId === meId)) {
    top.push({ ...mine, isYou: true });
  }
  return top;
}

/**
 * Today's tally, ranked the same way the season is: score desc, then perfects.
 *
 * Separate from the season board on purpose. The season ranks each VA's single
 * best run of the month, so on any given day it barely moves; this answers the
 * question people actually ask each other in the morning — who has played today
 * and what did they get.
 */
export async function getDailyTally(
  meId: string,
  date: EtDateString = etToday(),
): Promise<DailyTally> {
  const playedOn = etDateStringToStorageDate(date);

  const [submitted, spent, unlocked] = await Promise.all([
    prisma.miniGameRun.findMany({
      where: { gameKey: STRETCH_GAME_KEY, playedOn, status: RUN_SUBMITTED },
      select: {
        userId: true,
        score: true,
        perfects: true,
        user: { select: { name: true } },
      },
    }),
    // Anyone whose attempt is gone, submitted or merely started.
    prisma.miniGameRun.findMany({
      where: {
        gameKey: STRETCH_GAME_KEY,
        playedOn,
        status: { in: [RUN_STARTED, RUN_SUBMITTED] },
      },
      select: { userId: true },
    }),
    // The unlock gate, applied across the team: a WORK entry for today with a
    // start-of-day task saved. PTO and unstarted shifts are excluded, so the
    // count means "can still play", not "has not played".
    prisma.timeEntry.findMany({
      where: {
        workDate: playedOn,
        entryType: "WORK",
        va: { role: { in: VA_ROLES } },
      },
      select: { vaId: true, startOfDayTasks: true },
    }),
  ]);

  const rows = submitted
    .map((row) => ({
      rank: 0,
      userId: row.userId,
      name: row.user.name,
      score: row.score,
      perfects: row.perfects,
      isYou: row.userId === meId,
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.perfects - a.perfects ||
        a.name.localeCompare(b.name),
    )
    .map((row, i) => ({ ...row, rank: i + 1 }));

  const spentIds = new Set(spent.map((r) => r.userId));
  const stillToPlay = unlocked.filter(
    (e) => e.startOfDayTasks.trim().length > 0 && !spentIds.has(e.vaId),
  ).length;

  return { date, dateLabel: formatEtDateShort(date), rows, stillToPlay };
}

/** This player's rank this season, or null if they haven't posted a run. */
export async function getMyRank(
  season: MonthKey,
  userId: string,
): Promise<number | null> {
  const rows = await getSeasonLeaderboard(season);
  return rows.find((r) => r.userId === userId)?.rank ?? null;
}

// ---------------------------------------------------------------------------
// Page state
// ---------------------------------------------------------------------------

export interface StretchGoalState {
  session: MiniGameSession;
  leaderboard: SeasonLeaderRow[];
  dailyTally: DailyTally;
  myRank: number | null;
  seasonLabel: string;
  /** Today's ET date, for the "one run a day" copy. */
  today: EtDateString;
}

/** Everything the Stretch Goal panel needs on first render. */
export async function getStretchGoalState(
  userId: string,
): Promise<StretchGoalState> {
  const session = await getMiniGameSession(userId);
  const today = etToday();
  const [leaderboard, dailyTally, myRank] = await Promise.all([
    getRailLeaderboard(session.season, userId),
    getDailyTally(userId, today),
    getMyRank(session.season, userId),
  ]);

  return {
    session,
    leaderboard,
    dailyTally,
    myRank,
    seasonLabel: seasonLabelFor(session.season),
    today,
  };
}

/** "September Season" — the label the cabinet shows. */
export function seasonLabelFor(season: MonthKey): string {
  const month = new Date(Date.UTC(Number(season.slice(0, 4)), Number(season.slice(5, 7)) - 1, 1));
  return `${month.toLocaleString("en-US", { month: "long", timeZone: "UTC" })} Season`;
}

/** Exposed for the difficulty-ladder copy and the resolver's detail line. */
export const TIER_NAMES: readonly string[] = TIERS.map((t) => t.name);

/** Used by the tests and the leaderboard route to read a run back. */
export function runPlayedOn(playedOn: Date): EtDateString {
  return storageDateToEtDateString(playedOn);
}
