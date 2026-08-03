import "server-only";
import { prisma } from "@/lib/prisma";
import {
  etToday,
  etDateStringToStorageDate,
  storageDateToEtDateString,
  type EtDateString,
} from "@/lib/time";
import {
  PARTICIPATION_POINT,
  STREAK_INTERVAL,
  WORD_EPOCH_DATE,
  basePointsForSolve,
  currentStreak,
  monthBounds,
  streakBonus,
  workdaysBetween,
  type MonthKey,
} from "@/lib/word/logic";
import type { GameResolver, MonthlyLeaderRow } from "./types";

/**
 * Daily Word Guess — monthly scoring resolver.
 *
 *   base           10 / 6 / 5 / 4 / 3 / 2 points for a solve in 1–6 guesses
 *   participation  +1 for any day played, even a fail
 *   streak         +1 for every 5 consecutive solved workdays (Mon–Fri)
 *   tiebreak       fewest total guesses used across the month
 *
 * A fail *or* a skipped workday resets the streak run — that's what makes the
 * everyday player beat the occasional genius. Streak runs are evaluated inside
 * the month (each month starts a fresh run for bonus purposes); the "current
 * streak" shown next to a VA's name is the live one and does cross months.
 */

/** One VA's play record for a single day. */
interface DayRecord {
  date: EtDateString;
  solved: boolean;
  guessesUsed: number;
}

/** Everything the resolver needs, grouped per player. */
interface PlayerHistory {
  userId: string;
  name: string;
  days: Map<EtDateString, DayRecord>;
}

/** Load word entries in a date range, grouped by player. */
async function loadHistory(
  from: EtDateString,
  to: EtDateString,
): Promise<PlayerHistory[]> {
  const rows = await prisma.wordEntry.findMany({
    where: {
      puzzle: {
        date: {
          gte: etDateStringToStorageDate(from),
          lte: etDateStringToStorageDate(to),
        },
      },
    },
    select: {
      vaId: true,
      solved: true,
      guesses: true,
      va: { select: { name: true } },
      puzzle: { select: { date: true } },
    },
  });

  const byPlayer = new Map<string, PlayerHistory>();
  for (const row of rows) {
    const guessesUsed = Array.isArray(row.guesses) ? row.guesses.length : 0;
    // A row with no submitted guess isn't a "play" — skip it entirely.
    if (guessesUsed === 0) continue;

    let player = byPlayer.get(row.vaId);
    if (!player) {
      player = { userId: row.vaId, name: row.va.name, days: new Map() };
      byPlayer.set(row.vaId, player);
    }
    const date = storageDateToEtDateString(row.puzzle.date);
    player.days.set(date, { date, solved: row.solved, guessesUsed });
  }
  return [...byPlayer.values()];
}

/** Points + tiebreak stats for one player over one month. */
function scoreMonth(
  player: PlayerHistory,
  monthWorkdays: readonly EtDateString[],
): {
  points: number;
  daysPlayed: number;
  totalGuesses: number;
  solves: number;
  streakBonusPoints: number;
} {
  let points = 0;
  let daysPlayed = 0;
  let totalGuesses = 0;
  let solves = 0;
  const solvedDates = new Set<EtDateString>();

  for (const day of player.days.values()) {
    daysPlayed += 1;
    totalGuesses += day.guessesUsed;
    points += PARTICIPATION_POINT;
    if (day.solved) {
      solves += 1;
      solvedDates.add(day.date);
      points += basePointsForSolve(day.guessesUsed);
    }
  }

  const streakBonusPoints = streakBonus(monthWorkdays, solvedDates);
  points += streakBonusPoints;

  return { points, daysPlayed, totalGuesses, solves, streakBonusPoints };
}

/**
 * The live streak for a player, counted back from today across month
 * boundaries — it's a status symbol, not a monthly stat.
 */
function liveStreak(player: PlayerHistory, today: EtDateString): number {
  const solved = new Set<EtDateString>();
  const played = new Set<EtDateString>();
  for (const day of player.days.values()) {
    played.add(day.date);
    if (day.solved) solved.add(day.date);
  }
  return currentStreak(today, solved, played, WORD_EPOCH_DATE);
}

/** Ranked monthly table. Rank by points desc, then fewest total guesses. */
export async function resolveWordMonthly(
  monthKey: MonthKey,
): Promise<MonthlyLeaderRow[]> {
  const { start, end } = monthBounds(monthKey);
  const today = etToday();

  // Load from the epoch through today so the *live* streak can look back past
  // the 1st of the month (and past the month being viewed, if it's an old one).
  const players = await loadHistory(
    WORD_EPOCH_DATE,
    end > today ? end : today,
  );

  // Streak runs only walk workdays that have actually happened, and never
  // before the game launched — a month in progress shouldn't punish anyone for
  // days that haven't arrived, and pre-launch days aren't "skipped" days.
  const monthEnd = end > today ? today : end;
  const monthStart = start < WORD_EPOCH_DATE ? WORD_EPOCH_DATE : start;
  const monthWorkdays = workdaysBetween(monthStart, monthEnd);

  const scored = players
    .map((player) => {
      // Restrict scoring to days inside the requested month.
      const inMonth: PlayerHistory = {
        ...player,
        days: new Map(
          [...player.days].filter(([date]) => date >= start && date <= end),
        ),
      };
      const stats = scoreMonth(inMonth, monthWorkdays);
      return { player, stats, streak: liveStreak(player, today) };
    })
    .filter((row) => row.stats.daysPlayed > 0)
    .sort(
      (a, b) =>
        b.stats.points - a.stats.points ||
        a.stats.totalGuesses - b.stats.totalGuesses ||
        a.player.name.localeCompare(b.player.name),
    );

  return scored.map((row, i) => ({
    rank: i + 1,
    userId: row.player.userId,
    name: row.player.name,
    points: row.stats.points,
    detail: `${row.stats.solves}/${row.stats.daysPlayed} solved · ${row.stats.totalGuesses} guesses`,
    streak: row.streak,
  }));
}

export const wordResolver: GameResolver = {
  id: "WORD",
  name: "Daily Word Guess",
  scoreLabel: "TOP SCORE",
  resolveMonthly: resolveWordMonthly,
};

/** Exposed for the game panel's "how scoring works" copy. */
export const WORD_SCORING_SUMMARY = `Solve in 1 guess = 10 pts, 2 = 6, 3 = 5, 4 = 4, 5 = 3, 6 = 2. +${PARTICIPATION_POINT} just for playing, +1 for every ${STREAK_INTERVAL} workdays solved in a row. Ties go to the fewest guesses used.`;
