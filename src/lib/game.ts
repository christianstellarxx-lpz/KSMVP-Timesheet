import "server-only";
import { prisma } from "./prisma";
import { etToday, etDateStringToStorageDate } from "./time";

/** Sanity cap so a bogus client can't post an absurd score. */
export const MAX_SCORE = 10000;
/** How many players to show on the all-time leaderboard. */
const LEADERBOARD_SIZE = 10;

export interface LeaderRow {
  rank: number;
  userId: string;
  name: string;
  best: number;
}

export interface GameState {
  /** The user clocked in (a WORK time-in) today — required to play. */
  clockedInToday: boolean;
  /** They've already used today's single play. */
  hasPlayedToday: boolean;
  /** Today's score (if played). */
  todayScore: number | null;
  /** Their all-time best. */
  bestScore: number | null;
  /** All-time top players by best score. */
  leaderboard: LeaderRow[];
}

export type SubmitScoreResult =
  | { ok: true; state: GameState }
  | { ok: false; message: string };

/** Top players by their best-ever score. */
async function getLeaderboard(): Promise<LeaderRow[]> {
  const grouped = await prisma.gameScore.groupBy({
    by: ["userId"],
    _max: { score: true },
    orderBy: { _max: { score: "desc" } },
    take: LEADERBOARD_SIZE,
  });
  if (grouped.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: grouped.map((g) => g.userId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  return grouped.map((g, i) => ({
    rank: i + 1,
    userId: g.userId,
    name: nameById.get(g.userId) ?? "—",
    best: g._max.score ?? 0,
  }));
}

/** Whether the user has a WORK time-in for today (i.e. they clocked in). */
async function isClockedInToday(userId: string): Promise<boolean> {
  const todayStorage = etDateStringToStorageDate(etToday());
  const entry = await prisma.timeEntry.findFirst({
    where: { vaId: userId, workDate: todayStorage },
    select: { entryType: true, timeIn: true },
  });
  return !!entry && entry.entryType === "WORK" && entry.timeIn != null;
}

/** Everything the VA dashboard game panel needs. */
export async function getGameState(userId: string): Promise<GameState> {
  const todayStorage = etDateStringToStorageDate(etToday());

  const [clockedInToday, todayRow, bestAgg, leaderboard] = await Promise.all([
    isClockedInToday(userId),
    prisma.gameScore.findUnique({
      where: { userId_playDate: { userId, playDate: todayStorage } },
      select: { score: true },
    }),
    prisma.gameScore.aggregate({ where: { userId }, _max: { score: true } }),
    getLeaderboard(),
  ]);

  return {
    clockedInToday,
    hasPlayedToday: todayRow != null,
    todayScore: todayRow?.score ?? null,
    bestScore: bestAgg._max.score ?? null,
    leaderboard,
  };
}

/**
 * Record today's single game score. Re-checks server-side that the user clocked
 * in today, and relies on the unique (userId, playDate) constraint to enforce
 * one play per day — a second submission keeps the first score.
 */
export async function submitGameScore(
  userId: string,
  rawScore: number,
): Promise<SubmitScoreResult> {
  const score = Math.max(
    0,
    Math.min(MAX_SCORE, Math.floor(Number(rawScore) || 0)),
  );

  if (!(await isClockedInToday(userId))) {
    return { ok: false, message: "Clock in first to play today's game." };
  }

  const playDate = etDateStringToStorageDate(etToday());
  try {
    await prisma.gameScore.create({ data: { userId, score, playDate } });
  } catch (e) {
    // P2002 = already played today; that first score stands. Anything else rethrows.
    if (
      !(
        e &&
        typeof e === "object" &&
        "code" in e &&
        (e as { code?: string }).code === "P2002"
      )
    ) {
      throw e;
    }
  }

  return { ok: true, state: await getGameState(userId) };
}
