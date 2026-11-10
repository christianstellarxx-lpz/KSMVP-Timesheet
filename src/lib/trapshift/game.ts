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
import * as coreV1 from "./trapShiftCore.v1";
import * as coreV3 from "./trapShiftCore";
import { MAX_SCORE, STEP_HZ, routesFor, validateLog, type InputLog, type Route } from "./trapShiftCore";
import { looksScripted } from "./flags";

/**
 * Trap Shift — server-authoritative game module.
 *
 * The browser decides nothing that counts. The server issues every try (seed,
 * routes and save point stored on the row), replays the player's input log
 * through the core of the row's own replayVersion, and stores that result.
 *
 * What enforces what:
 *  - Tries per day: one row per try, UNIQUE (userId, gameKey, playedOn,
 *    attemptNo) plus CHECK (attemptNo BETWEEN 1 AND 5). `startTrapRun` also
 *    counts, but the database is the backstop.
 *  - Score: the row's core replaying `log` from the row's seed, routes and
 *    startCp. No client score, seed, routes, save point, attempt or date is read.
 *  - Save point: the furthest checkpoint any verified v3 try reached today.
 *  - Refresh-to-retry: a new start abandons the open try, which still counts.
 */

export const TRAP_GAME_KEY = "trap-shift";

/**
 * Every Trap Shift core that was ever live, by REPLAY_VERSION. A row is always
 * replayed with the core of its own version — old rows are never re-scored on
 * a newer core. (v2 was never released, so there is no v2.)
 */
export const CORES = { 1: coreV1, 3: coreV3 } as const;
export const CURRENT_REPLAY_VERSION = coreV3.REPLAY_VERSION;

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
const OUT_MESSAGE = `You used all ${MAX_TRIES} tries today. Come back tomorrow.`;
const UPDATE_MESSAGE = "Trap Shift was updated. Reload the page to play the new version.";
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

type Fail = { ok: false; status: number; message: string; code?: string };
type Db = Prisma.TransactionClient | typeof prisma;

/** What a v3 score means: "Level 2 · 47%", or "Finished" at 300. */
export function reachLabel(score: number): string {
  if (score >= MAX_SCORE) return "Finished";
  if (score <= 100) return `Level 1 · ${score}%`;
  if (score <= 200) return `Level 2 · ${score - 100}%`;
  return `Level 3 · ${score - 200}%`;
}

/** Replays a row on the core of its own version. null = no core for that version. */
function replay(
  run: { replayVersion: number; seed: number; routes: Prisma.JsonValue; startCp: number },
  log: InputLog,
) {
  const routes = run.routes as Route[];
  if (run.replayVersion === 3) return CORES[3].simulateRun(run.seed, routes, log, run.startCp);
  if (run.replayVersion === 1) return { ...CORES[1].simulateRun(run.seed, routes, log), checkpoint: null };
  return null;
}

/**
 * The save point the VA's next try today starts from: the furthest checkpoint
 * any verified try on the current core reached today. Abandoned tries never
 * count — they were never replayed. Resets with the ET day.
 */
async function nextStartCp(db: Db, userId: string, playedOn: Date): Promise<number> {
  const agg = await db.miniGameRun.aggregate({
    where: {
      userId,
      gameKey: TRAP_GAME_KEY,
      playedOn,
      status: RUN_SUBMITTED,
      replayVersion: CURRENT_REPLAY_VERSION,
    },
    _max: { checkpointReached: true },
  });
  return agg._max.checkpointReached ?? 0;
}

// ---------------------------------------------------------------------------
// Season board — each VA's best single try (v3 rows only)
// ---------------------------------------------------------------------------

export interface TrapBoardRow {
  rank: number;
  userId: string;
  name: string;
  /** Best single try this season, 0..300. */
  best: number;
  /** Frames of the try that set `best` — the tiebreak (faster wins). */
  frames: number;
  /** What `best` means: "Level 2 · 47%" / "Finished". */
  reached: string;
  /** Best try today, or null if none (always null for a past season). */
  todayBest: number | null;
}

type BoardRow = { score: number; frames: number; submittedAt: Date | null };
/** Higher score, then the faster run, then whoever got there first. */
const better = (a: BoardRow, b: BoardRow) =>
  b.score - a.score || a.frames - b.frames || (a.submittedAt?.getTime() ?? 0) - (b.submittedAt?.getTime() ?? 0);

/**
 * Only rows on replayVersion >= 3 count: that filter is what started the board
 * fresh when v3 went live. Older rows stay in the table and stay verifiable.
 * Nothing is summed — a VA's score is their single best try.
 */
export async function getTrapBoard(
  season: MonthKey,
  today: EtDateString = etToday(),
): Promise<TrapBoardRow[]> {
  const rows = await prisma.miniGameRun.findMany({
    where: { gameKey: TRAP_GAME_KEY, season, status: RUN_SUBMITTED, replayVersion: { gte: 3 } },
    select: {
      userId: true,
      score: true,
      frames: true,
      playedOn: true,
      submittedAt: true,
      user: { select: { name: true } },
    },
  });

  const todayMs = etDateStringToStorageDate(today).getTime();
  const best = new Map<string, (typeof rows)[number]>();
  const todayBest = new Map<string, number>();
  for (const row of rows) {
    const cur = best.get(row.userId);
    if (!cur || better(row, cur) < 0) best.set(row.userId, row);
    if (row.playedOn.getTime() === todayMs) {
      todayBest.set(row.userId, Math.max(todayBest.get(row.userId) ?? 0, row.score));
    }
  }

  return [...best.values()]
    .sort((a, b) => better(a, b) || a.user.name.localeCompare(b.user.name))
    .map((r, i) => ({
      rank: i + 1,
      userId: r.userId,
      name: r.user.name,
      best: r.score,
      frames: r.frames,
      reached: reachLabel(r.score),
      todayBest: todayBest.get(r.userId) ?? null,
    }));
}

// ---------------------------------------------------------------------------
// Session — today's tries. Never returns a seed: only /start hands one out.
// ---------------------------------------------------------------------------

export interface TrapSession {
  unlocked: boolean;
  attemptsUsed: number;
  attemptsLeft: number;
  todayBest: number | null;
  /** Best single try this season, or null if none yet. */
  seasonBest: number | null;
  /** Save point the next try starts from (0..5). */
  nextStartCp: number;
  runsToday: { attemptNo: number; score: number; ended: string | null }[];
  season: MonthKey;
}

async function loadState(userId: string) {
  const today = etToday();
  const season = etCurrentMonthKey();
  const playedOn = etDateStringToStorageDate(today);

  const [unlocked, runs, board, startCp] = await Promise.all([
    isUnlockedToday(userId),
    prisma.miniGameRun.findMany({
      where: { userId, gameKey: TRAP_GAME_KEY, playedOn },
      orderBy: { attemptNo: "asc" },
      select: { attemptNo: true, score: true, ended: true, status: true, replayVersion: true },
    }),
    getTrapBoard(season, today),
    nextStartCp(prisma, userId, playedOn),
  ]);

  // Every try today counts toward the 5, but only v3 scores are on the v3 scale.
  const submitted = runs.filter((r) => r.status === RUN_SUBMITTED && r.replayVersion >= 3);
  const session: TrapSession = {
    unlocked,
    attemptsUsed: runs.length,
    attemptsLeft: Math.max(0, MAX_TRIES - runs.length),
    todayBest: submitted.length ? Math.max(...submitted.map((r) => r.score)) : null,
    seasonBest: board.find((r) => r.userId === userId)?.best ?? null,
    nextStartCp: startCp,
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
  | { ok: true; runId: string; seed: number; routes: Route[]; attemptNo: number; attemptsLeft: number; startCp: number }
  | Fail;

/**
 * Issue the next try. A client on an older core is refused (409
 * update_required) before anything is read or written. Then, in one
 * transaction, serialised per VA by a row lock on their User row so parallel
 * starts queue rather than race:
 *  - count today's tries; at the cap, refuse (409) without touching anything,
 *    so a stray request cannot kill a try that is still being played;
 *  - abandon any open try at 0 — it still counts (this is "refresh to retry");
 *  - pick the save point from today's verified tries (never from the client);
 *  - insert the next attemptNo with a server seed, routesFor() and that startCp.
 * If the lock were ever bypassed, the unique index turns a lost race into P2002
 * (409) and the CHECK refuses a 6th row.
 */
export async function startTrapRun(userId: string, clientVersion: unknown): Promise<StartTrapResult> {
  if (clientVersion !== CURRENT_REPLAY_VERSION) {
    return { ok: false, status: 409, code: "update_required", message: UPDATE_MESSAGE };
  }
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
          startCp: await nextStartCp(tx, userId, playedOn),
          status: RUN_STARTED,
          startedAt: new Date(),
          replayVersion: CURRENT_REPLAY_VERSION,
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
      startCp: run.startCp,
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
      seasonBest: number | null;
      attemptsLeft: number;
      nextStartCp: number;
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

    const r = replay(run, inputLog);
    if (!r) return fail(409, "That try can’t be verified.", `unknown_replay_version:${run.replayVersion}`);

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
    if (run.replayVersion === 3 && r.points === CORES[3].MAX_SCORE) reasons.push("finished run");
    if (run.replayVersion === 1 && r.points === CORES[1].PERFECT_SCORE) reasons.push("perfect run");
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
        checkpointReached: r.checkpoint,
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
      seasonBest: session.seasonBest,
      attemptsLeft: session.attemptsLeft,
      nextStartCp: session.nextStartCp,
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
  best: number;
  reached: string;
  todayBest: number | null;
  isYou: boolean;
}

/** Top rows for the side rail, always including the caller's own. */
export function toRail(board: TrapBoardRow[], meId: string, size = 10): TrapRailRow[] {
  const rows = board.filter((r, i) => i < size || r.userId === meId);
  return rows.map((r) => ({
    rank: r.rank,
    name: r.name,
    best: r.best,
    reached: r.reached,
    todayBest: r.todayBest,
    isYou: r.userId === meId,
  }));
}

export interface TrapPageState {
  session: TrapSession;
  rail: TrapRailRow[];
  seasonLabel: string;
  today: EtDateString;
  /** The one-time v3 "new rules" banner, until this VA dismisses it. */
  showNewRules: boolean;
}

export async function getTrapPageState(userId: string): Promise<TrapPageState> {
  const [{ session, board }, user] = await Promise.all([
    loadState(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { trapShiftV3SeenAt: true } }),
  ]);
  return {
    session,
    rail: toRail(board, userId),
    seasonLabel: `${monthLabel(session.season).split(" ")[0]} Season`,
    today: etToday(),
    showNewRules: !user?.trapShiftV3SeenAt,
  };
}

/** "Got it" on the new-rules banner. Idempotent. */
export async function markNewRulesSeen(userId: string): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId, trapShiftV3SeenAt: null },
    data: { trapShiftV3SeenAt: new Date() },
  });
}
