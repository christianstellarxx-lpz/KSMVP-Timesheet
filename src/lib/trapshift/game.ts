import "server-only";
import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withTx } from "@/lib/timeEntries";
import { isUnlockedToday } from "@/lib/game";
import { MAX_ATTEMPTS } from "@/lib/features";
import { etDateStringToStorageDate, etToday, type EtDateString } from "@/lib/time";
import {
  etCurrentMonthKey,
  monthKeyForDate,
  monthLabel,
  type MonthKey,
} from "@/lib/leaderboards/months";
import {
  PERFECT_SCORE,
  REPLAY_VERSION,
  STEP_HZ,
  routesFor,
  simulateRun,
  validateLog,
  type InputLog,
  type Route,
} from "./trapShiftCore";
import { looksScripted } from "./flags";

/**
 * Trap Shift — server-authoritative game module.
 *
 * The browser decides nothing that counts. The server issues every try (seed
 * and routes stored on the row), replays the player's input log through the
 * same trapShiftCore the client played, and stores that replay's result.
 *
 * What enforces what:
 *  - Tries per day: one row per try, UNIQUE (userId, gameKey, playedOn,
 *    attemptNo) plus CHECK (attemptNo BETWEEN 1 AND 3). `startTrapRun` also
 *    counts, but the database is the backstop.
 *  - Score: `simulateRun(row.seed, row.routes, log)`. No client score, seed,
 *    routes, attempt number or date is ever read.
 *  - Refresh-to-retry: a new start abandons the open try, which still counts.
 */

export const TRAP_GAME_KEY = "trap-shift";

/**
 * Row lifecycle for Trap Shift. "started" means the same thing it does for
 * Stretch Goal — the try is spent and in progress — and Trap Shift rows are
 * created at it, because /start hands out the seed and spends the try at once.
 */
export const RUN_STARTED = "started";
export const RUN_SUBMITTED = "submitted";
export const RUN_ABANDONED = "abandoned";

export const MAX_TRIES = MAX_ATTEMPTS[TRAP_GAME_KEY];
/** A try not scored within this long is abandoned at 0. */
export const RUN_TTL_MS = 20 * 60_000;
/** Real-time check slack: a log may claim at most this much more play than the clock allows. */
export const REALTIME_SLACK_S = 5;
/** Postgres INTEGER is signed 32-bit. */
const SEED_EXCLUSIVE_MAX = 2 ** 31;

const UNLOCK_MESSAGE = "Send your Start of Day to unlock today’s tries.";
const OUT_MESSAGE = "You used all 3 tries today. Come back tomorrow.";
const RETRY_MESSAGE =
  "The server was waking up and didn’t respond in time. Please try again in a moment.";

/** An error whose message is safe to show a player. */
class PlayerError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type Fail = { ok: false; status: number; message: string };

// ---------------------------------------------------------------------------
// Season board — sum of each VA's daily best
// ---------------------------------------------------------------------------

export interface TrapBoardRow {
  rank: number;
  userId: string;
  name: string;
  /** Sum of daily bests this season. */
  total: number;
  /** Levels cleared across the runs that make up `total`. */
  cleared: number;
  /** Days with at least one submitted try. */
  days: number;
  /** Best try today, or null if none (always null for a past season). */
  todayBest: number | null;
}

/**
 * For each VA: the max score per day among submitted tries, summed over the
 * season. Ranked by total, then levels cleared, then whoever reached their
 * total earliest.
 *
 * Reduced in JS: rows are bounded by team size x days x 3, and "the best row
 * per day, then a sum" is not one groupBy.
 */
export async function getTrapBoard(
  season: MonthKey,
  today: EtDateString = etToday(),
): Promise<TrapBoardRow[]> {
  const rows = await prisma.miniGameRun.findMany({
    where: { gameKey: TRAP_GAME_KEY, season, status: RUN_SUBMITTED },
    select: {
      userId: true,
      score: true,
      cleared: true,
      playedOn: true,
      submittedAt: true,
      user: { select: { name: true } },
    },
  });

  // Best try per (VA, day); a tie goes to the earlier submission.
  const best = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = `${row.userId}|${row.playedOn.toISOString()}`;
    const cur = best.get(key);
    const at = row.submittedAt?.getTime() ?? 0;
    if (!cur || row.score > cur.score || (row.score === cur.score && at < (cur.submittedAt?.getTime() ?? 0))) {
      best.set(key, row);
    }
  }

  const todayMs = etDateStringToStorageDate(today).getTime();
  const agg = new Map<string, TrapBoardRow & { reachedAt: number }>();
  for (const row of best.values()) {
    const a =
      agg.get(row.userId) ??
      { rank: 0, userId: row.userId, name: row.user.name, total: 0, cleared: 0, days: 0, todayBest: null, reachedAt: 0 };
    a.total += row.score;
    a.cleared += row.cleared;
    a.days += 1;
    // A zero day adds nothing, so it does not move when the total was reached.
    if (row.score > 0) a.reachedAt = Math.max(a.reachedAt, row.submittedAt?.getTime() ?? 0);
    if (row.playedOn.getTime() === todayMs) a.todayBest = row.score;
    agg.set(row.userId, a);
  }

  return [...agg.values()]
    .sort(
      (a, b) =>
        b.total - a.total ||
        b.cleared - a.cleared ||
        a.reachedAt - b.reachedAt ||
        a.name.localeCompare(b.name),
    )
    .map(({ reachedAt: _reachedAt, ...row }, i) => ({ ...row, rank: i + 1 }));
}

// ---------------------------------------------------------------------------
// Session — today's tries. Never returns a seed: only /start hands one out.
// ---------------------------------------------------------------------------

export interface TrapSession {
  unlocked: boolean;
  attemptsUsed: number;
  attemptsLeft: number;
  todayBest: number | null;
  seasonTotal: number;
  runsToday: { attemptNo: number; score: number; ended: string | null }[];
  season: MonthKey;
}

async function loadState(userId: string) {
  const today = etToday();
  const season = etCurrentMonthKey();
  const playedOn = etDateStringToStorageDate(today);

  const [unlocked, runs, board] = await Promise.all([
    isUnlockedToday(userId),
    prisma.miniGameRun.findMany({
      where: { userId, gameKey: TRAP_GAME_KEY, playedOn },
      orderBy: { attemptNo: "asc" },
      select: { attemptNo: true, score: true, ended: true, status: true },
    }),
    getTrapBoard(season, today),
  ]);

  const submitted = runs.filter((r) => r.status === RUN_SUBMITTED);
  const session: TrapSession = {
    unlocked,
    attemptsUsed: runs.length,
    attemptsLeft: Math.max(0, MAX_TRIES - runs.length),
    todayBest: submitted.length ? Math.max(...submitted.map((r) => r.score)) : null,
    seasonTotal: board.find((r) => r.userId === userId)?.total ?? 0,
    runsToday: runs.map((r) => ({
      attemptNo: r.attemptNo,
      score: r.score,
      ended: r.status === RUN_ABANDONED ? "abandoned" : r.ended,
    })),
    season,
  };
  return { session, board };
}

export async function getTrapSession(userId: string): Promise<TrapSession> {
  return (await loadState(userId)).session;
}

// ---------------------------------------------------------------------------
// Start — issue a try
// ---------------------------------------------------------------------------

export type StartTrapResult =
  | { ok: true; runId: string; seed: number; routes: Route[]; attemptNo: number; attemptsLeft: number }
  | Fail;

/**
 * Issue the next try. In one transaction, serialised per VA by a row lock on
 * their User row so parallel starts queue rather than race:
 *  - count today's tries; at the cap, refuse (409) without touching anything,
 *    so a stray request cannot kill a try that is still being played;
 *  - abandon any open try at 0 — it still counts (this is "refresh to retry");
 *  - insert the next attemptNo with a server seed and routesFor().
 * If the lock were ever bypassed, the unique index turns a lost race into P2002
 * (409) and the CHECK refuses a 4th row.
 */
export async function startTrapRun(userId: string): Promise<StartTrapResult> {
  const today = etToday();
  const playedOn = etDateStringToStorageDate(today);

  try {
    if (!(await isUnlockedToday(userId))) throw new PlayerError(UNLOCK_MESSAGE, 403);

    const run = await withTx(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      const used = await tx.miniGameRun.count({
        where: { userId, gameKey: TRAP_GAME_KEY, playedOn },
      });
      if (used >= MAX_TRIES) throw new PlayerError(OUT_MESSAGE, 409);

      await tx.miniGameRun.updateMany({
        where: { userId, gameKey: TRAP_GAME_KEY, playedOn, status: RUN_STARTED },
        data: { status: RUN_ABANDONED, score: 0 },
      });

      const attemptNo = used + 1;
      return tx.miniGameRun.create({
        data: {
          userId,
          gameKey: TRAP_GAME_KEY,
          season: monthKeyForDate(today),
          playedOn,
          attemptNo,
          seed: randomInt(0, SEED_EXCLUSIVE_MAX),
          routes: routesFor(attemptNo, today),
          status: RUN_STARTED,
          startedAt: new Date(),
          replayVersion: REPLAY_VERSION,
        },
      });
    });

    return {
      ok: true,
      runId: run.id,
      seed: run.seed,
      routes: run.routes as Route[],
      attemptNo: run.attemptNo,
      attemptsLeft: MAX_TRIES - run.attemptNo,
    };
  } catch (e) {
    if (e instanceof PlayerError) return { ok: false, status: e.status, message: e.message };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, status: 409, message: "Another try was started at the same moment. Reload to see your tries." };
    }
    return { ok: false, status: 503, message: RETRY_MESSAGE };
  }
}

// ---------------------------------------------------------------------------
// Score — replay the log and store the server's own result
// ---------------------------------------------------------------------------

export type ScoreTrapResult =
  | {
      ok: true;
      score: number;
      cleared: number;
      ended: string;
      cause: string | null;
      todayBest: number | null;
      seasonTotal: number;
      attemptsLeft: number;
      rank: number | null;
    }
  | (Fail & { reason: string });

/**
 * Score a try. `log` is untrusted; everything else comes from the stored row.
 * Returns a `reason` on failure so the route can log rejections.
 */
export async function scoreTrapRun(
  userId: string,
  runId: string,
  log: unknown,
): Promise<ScoreTrapResult> {
  const now = new Date();
  const fail = (status: number, message: string, reason: string) =>
    ({ ok: false, status, message, reason }) as const;

  try {
    // Looked up with the session user: someone else's runId is simply not found.
    const run = await prisma.miniGameRun.findFirst({
      where: { id: runId, userId, gameKey: TRAP_GAME_KEY },
    });
    if (!run) return fail(404, "That try wasn’t found.", "not_found");
    if (run.status !== RUN_STARTED) return fail(409, "That try has already been scored.", "not_open");

    const elapsedMs = now.getTime() - (run.startedAt ?? run.createdAt).getTime();
    if (elapsedMs > RUN_TTL_MS) {
      await prisma.miniGameRun.updateMany({
        where: { id: run.id, status: RUN_STARTED },
        data: { status: RUN_ABANDONED, score: 0 },
      });
      return fail(410, "That try expired before it was scored.", "expired");
    }

    const shapeError = validateLog(log);
    if (shapeError) return fail(400, "That replay wasn’t valid.", `invalid_log: ${shapeError}`);
    const inputLog = log as InputLog;

    const r = simulateRun(run.seed, run.routes as Route[], inputLog);

    // A log that claims more play than real time allows was generated, not played.
    const elapsedS = elapsedMs / 1000;
    const playedS = r.frames / STEP_HZ;
    if (playedS > elapsedS + REALTIME_SLACK_S) {
      const flagReason = `real-time check: log is ${playedS.toFixed(1)}s, only ${elapsedS.toFixed(1)}s since issue`;
      await prisma.miniGameRun.updateMany({
        where: { id: run.id, status: RUN_STARTED },
        data: {
          status: RUN_ABANDONED,
          score: 0,
          holds: inputLog as unknown as Prisma.InputJsonValue,
          flagged: true,
          flagReason,
        },
      });
      return fail(422, "That try couldn’t be verified.", flagReason);
    }

    const reasons: string[] = [];
    if (r.points === PERFECT_SCORE) reasons.push("perfect run");
    if (looksScripted(inputLog)) reasons.push("input timing looks scripted");

    const written = await prisma.miniGameRun.updateMany({
      where: { id: run.id, status: RUN_STARTED },
      data: {
        holds: inputLog as unknown as Prisma.InputJsonValue,
        score: r.points,
        cleared: r.cleared,
        levelReached: r.levelReached,
        frames: r.frames,
        ended: r.ended,
        cause: r.cause,
        replayVersion: r.replayVersion,
        status: RUN_SUBMITTED,
        submittedAt: now,
        flagged: reasons.length > 0,
        flagReason: reasons.length ? reasons.join("; ") : null,
      },
    });
    if (written.count === 0) return fail(409, "That try has already been scored.", "double_submit");
    if (reasons.length) {
      console.warn(`[minigame] flagged run=${run.id} user=${userId} reason=${reasons.join("; ")}`);
    }

    const { session, board } = await loadState(userId);
    return {
      ok: true,
      score: r.points,
      cleared: r.cleared,
      ended: r.ended,
      cause: r.cause,
      todayBest: session.todayBest,
      seasonTotal: session.seasonTotal,
      attemptsLeft: session.attemptsLeft,
      rank: board.find((b) => b.userId === userId)?.rank ?? null,
    };
  } catch {
    return fail(503, RETRY_MESSAGE, "server_error");
  }
}

// ---------------------------------------------------------------------------
// Page state
// ---------------------------------------------------------------------------

export interface TrapRailRow {
  rank: number;
  name: string;
  seasonTotal: number;
  todayBest: number | null;
  isYou: boolean;
}

/** Top rows for the side rail, always including the caller's own. */
export function toRail(board: TrapBoardRow[], meId: string, size = 10): TrapRailRow[] {
  const rows = board.filter((r, i) => i < size || r.userId === meId);
  return rows.map((r) => ({
    rank: r.rank,
    name: r.name,
    seasonTotal: r.total,
    todayBest: r.todayBest,
    isYou: r.userId === meId,
  }));
}

export interface TrapPageState {
  session: TrapSession;
  rail: TrapRailRow[];
  seasonLabel: string;
  today: EtDateString;
}

export async function getTrapPageState(userId: string): Promise<TrapPageState> {
  const { session, board } = await loadState(userId);
  return {
    session,
    rail: toRail(board, userId),
    seasonLabel: `${monthLabel(session.season).split(" ")[0]} Season`,
    today: etToday(),
  };
}
