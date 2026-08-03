import { DateTime } from "luxon";
import { ET_ZONE, type EtDateString } from "@/lib/time";

/**
 * Daily Word Guess — pure game logic.
 *
 * Everything in this file is deterministic and side-effect free so it can be
 * unit-tested directly (tests/word.test.ts). Anything that touches the database
 * or the answer list lives in the server-only modules alongside it
 * (`lists.ts`, `../wordGame.ts`).
 */

export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;

/** Per-letter feedback. "green" = right spot, "yellow" = wrong spot, "grey" = absent. */
export type Tile = "green" | "yellow" | "grey";

// ---------------------------------------------------------------------------
// Date-seeded puzzle selection
// ---------------------------------------------------------------------------

/**
 * Fixed origin of the daily sequence. Changing this shifts every future word,
 * so it must stay put once the game is live. The day rollover is ET midnight —
 * the same DST-safe Luxon handling used everywhere else (see src/lib/time.ts).
 */
export const WORD_EPOCH_DATE: EtDateString = "2026-08-03";

/**
 * Fixed seed for the one-time shuffle of the answer list. The list ships in
 * alphabetical order (so a human can review it), and this shuffle turns it into
 * the play order — deterministic, but not guessable from the file.
 */
export const ANSWER_SHUFFLE_SEED = 20260803;

/**
 * Whole ET calendar days from the epoch to `date`. Both sides are read as
 * UTC-midnight calendar dates, so the difference is exact regardless of DST.
 * Negative for dates before the epoch.
 */
export function wordDayIndex(date: EtDateString): number {
  const day = DateTime.fromISO(date, { zone: "utc" }).startOf("day");
  const epoch = DateTime.fromISO(WORD_EPOCH_DATE, { zone: "utc" }).startOf("day");
  return Math.floor(day.diff(epoch, "days").days);
}

/** Deterministic 32-bit LCG — same sequence everywhere, no Math.random. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Fisher–Yates with a fixed seed: same input + seed always yields the same order. */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const rand = lcg(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The answer for an ET calendar day: index deterministically into the shuffled
 * list. Wraps once the list is exhausted, and handles pre-epoch dates without
 * going negative.
 */
export function answerForDate(
  date: EtDateString,
  playOrder: readonly string[],
): string {
  if (playOrder.length === 0) {
    throw new Error("The word answer list is empty.");
  }
  const idx = wordDayIndex(date);
  const wrapped = ((idx % playOrder.length) + playOrder.length) % playOrder.length;
  return playOrder[wrapped];
}

// ---------------------------------------------------------------------------
// Guess evaluation (server-authoritative)
// ---------------------------------------------------------------------------

/**
 * Standard two-pass evaluation. Greens are marked first and their letters
 * consumed, so yellows respect how many of each letter the answer actually has:
 * guessing "geese" against "eagle" yields one yellow E, not three.
 */
export function evaluateGuess(guess: string, answer: string): Tile[] {
  const g = guess.toLowerCase();
  const a = answer.toLowerCase();
  const tiles: Tile[] = Array(g.length).fill("grey");

  // Pass 1 — exact positions, consuming those letters from the pool.
  const pool = new Map<string, number>();
  for (let i = 0; i < a.length; i++) {
    if (g[i] === a[i]) tiles[i] = "green";
    else pool.set(a[i], (pool.get(a[i]) ?? 0) + 1);
  }

  // Pass 2 — present-but-misplaced, only while that letter is still in the pool.
  for (let i = 0; i < g.length; i++) {
    if (tiles[i] === "green") continue;
    const left = pool.get(g[i]) ?? 0;
    if (left > 0) {
      tiles[i] = "yellow";
      pool.set(g[i], left - 1);
    }
  }

  return tiles;
}

/** Best-known state per letter for the on-screen keyboard (green > yellow > grey). */
export function keyboardStates(
  guesses: readonly string[],
  patterns: readonly Tile[][],
): Record<string, Tile> {
  const rank: Record<Tile, number> = { grey: 0, yellow: 1, green: 2 };
  const out: Record<string, Tile> = {};
  guesses.forEach((guess, row) => {
    const pattern = patterns[row];
    if (!pattern) return;
    [...guess].forEach((letter, col) => {
      const tile = pattern[col];
      if (!tile) return;
      const current = out[letter];
      if (!current || rank[tile] > rank[current]) out[letter] = tile;
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Play eligibility — the two hard rules, in one place
// ---------------------------------------------------------------------------

/**
 * Why a VA can't submit a guess right now.
 *  NOT_CLOCKED_IN   — the shared daily-attempt gate: no WORK time-in today.
 *  ALREADY_FINISHED — this day's single attempt is over (solved, or finalized).
 *  OUT_OF_GUESSES   — all six guesses used.
 */
export type PlayBlock = "NOT_CLOCKED_IN" | "ALREADY_FINISHED" | "OUT_OF_GUESSES";

export interface PlayEligibility {
  canPlay: boolean;
  block: PlayBlock | null;
  /** Player-facing reason, null when they may play. */
  message: string | null;
}

const BLOCK_MESSAGE: Record<PlayBlock, string> = {
  NOT_CLOCKED_IN: "Clock in first to play today’s word.",
  ALREADY_FINISHED: "You’ve already played today’s word — one game a day.",
  OUT_OF_GUESSES: "You’ve used all six guesses for today.",
};

/**
 * The single definition of "may this VA submit a guess right now".
 *
 * Both the server (submitWordGuess, inside the transaction that writes the
 * guess) and the UI (which panel to render, whether the keyboard is live) call
 * this, so the button state can never disagree with what the server will allow.
 * The server is still the authority — the client copy is only a courtesy.
 */
export function checkPlayEligibility(input: {
  /** Has a WORK time-in for today. */
  clockedInToday: boolean;
  solved: boolean;
  /** The attempt has been finalized (completedAt set). */
  completed: boolean;
  guessesUsed: number;
}): PlayEligibility {
  const block: PlayBlock | null = !input.clockedInToday
    ? "NOT_CLOCKED_IN"
    : input.solved || input.completed
      ? "ALREADY_FINISHED"
      : input.guessesUsed >= MAX_GUESSES
        ? "OUT_OF_GUESSES"
        : null;

  return {
    canPlay: block === null,
    block,
    message: block ? BLOCK_MESSAGE[block] : null,
  };
}

// ---------------------------------------------------------------------------
// Brag mechanic — spoiler-free emoji grid
// ---------------------------------------------------------------------------

const TILE_EMOJI: Record<Tile, string> = {
  green: "🟩",
  yellow: "🟨",
  grey: "⬜",
};

/**
 * "KSMVP Word • 3/6" plus the emoji grid. Shows *how* it was solved without
 * revealing the word, so it's safe to paste in team chat before others play.
 */
export function emojiGrid(
  patterns: readonly Tile[][],
  solved: boolean,
  dateLabel?: string,
): string {
  const scoreLine = solved ? `${patterns.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
  const header = dateLabel
    ? `KSMVP Word • ${dateLabel} • ${scoreLine}`
    : `KSMVP Word • ${scoreLine}`;
  const grid = patterns
    .map((row) => row.map((t) => TILE_EMOJI[t]).join(""))
    .join("\n");
  return `${header}\n${grid}`;
}

// ---------------------------------------------------------------------------
// Scoring (the leaderboard resolver's arithmetic lives here, pure & testable)
// ---------------------------------------------------------------------------

/** Base points by how many guesses it took to solve. Index 0 is unused. */
export const POINTS_BY_GUESS: readonly number[] = [0, 10, 6, 5, 4, 3, 2];

/** Awarded for showing up — any day the VA played, even a fail. */
export const PARTICIPATION_POINT = 1;

/** Consecutive solved workdays needed for each +1 streak bonus. */
export const STREAK_INTERVAL = 5;

export function basePointsForSolve(guessCount: number): number {
  if (guessCount < 1 || guessCount >= POINTS_BY_GUESS.length) return 0;
  return POINTS_BY_GUESS[guessCount];
}

/** Mon–Fri in ET. Weekends are not part of the streak cadence at all. */
export function isWorkday(date: EtDateString): boolean {
  const weekday = DateTime.fromISO(date, { zone: ET_ZONE }).weekday; // 1=Mon … 7=Sun
  return weekday >= 1 && weekday <= 5;
}

/** Every ET workday in [from, to] inclusive, ascending. */
export function workdaysBetween(
  from: EtDateString,
  to: EtDateString,
): EtDateString[] {
  const out: EtDateString[] = [];
  let cursor = DateTime.fromISO(from, { zone: "utc" }).startOf("day");
  const end = DateTime.fromISO(to, { zone: "utc" }).startOf("day");
  // Guard against a runaway loop if the range is inverted or invalid.
  if (!cursor.isValid || !end.isValid || cursor > end) return out;
  while (cursor <= end) {
    const iso = cursor.toISODate()!;
    if (isWorkday(iso)) out.push(iso);
    cursor = cursor.plus({ days: 1 });
  }
  return out;
}

/**
 * Streak bonus over an ordered run of workdays: +1 point for every
 * STREAK_INTERVAL consecutive *solved* workdays. A fail or a skipped workday
 * resets the run to zero (that's what makes a streak worth protecting).
 */
export function streakBonus(
  workdays: readonly EtDateString[],
  solvedDates: ReadonlySet<EtDateString>,
): number {
  let run = 0;
  let bonus = 0;
  for (const day of workdays) {
    if (solvedDates.has(day)) {
      run += 1;
      if (run % STREAK_INTERVAL === 0) bonus += 1;
    } else {
      run = 0;
    }
  }
  return bonus;
}

/**
 * The live "current streak" shown next to a VA's name: consecutive solved
 * workdays counting back from today. Today is treated as neutral while it's
 * still unplayed (an unfinished day shouldn't look like a broken streak), but
 * any earlier workday with no solve ends the run.
 */
export function currentStreak(
  today: EtDateString,
  solvedDates: ReadonlySet<EtDateString>,
  playedDates: ReadonlySet<EtDateString>,
  since: EtDateString = WORD_EPOCH_DATE,
): number {
  let cursor = DateTime.fromISO(today, { zone: "utc" }).startOf("day");
  const floor = DateTime.fromISO(since, { zone: "utc" }).startOf("day");
  let streak = 0;

  while (cursor >= floor) {
    const iso = cursor.toISODate()!;
    if (isWorkday(iso)) {
      if (solvedDates.has(iso)) {
        streak += 1;
      } else if (iso === today && !playedDates.has(iso)) {
        // Today isn't over yet — neither counts nor breaks the run.
      } else {
        break;
      }
    }
    cursor = cursor.minus({ days: 1 });
  }

  return streak;
}

// ---------------------------------------------------------------------------
// Month helpers (leaderboards are monthly)
// ---------------------------------------------------------------------------

/** "2026-08" for an ET date (or for today, in ET). */
export type MonthKey = string;

export function monthKeyForDate(date: EtDateString): MonthKey {
  return date.slice(0, 7);
}

export function etCurrentMonthKey(now: Date = new Date()): MonthKey {
  return DateTime.fromJSDate(now).setZone(ET_ZONE).toFormat("yyyy-LL");
}

/** The calendar month before `monthKey`, e.g. "2026-08" -> "2026-07". */
export function previousMonthKey(monthKey: MonthKey): MonthKey {
  return DateTime.fromISO(`${monthKey}-01`, { zone: "utc" })
    .minus({ months: 1 })
    .toFormat("yyyy-LL");
}

/** First and last ET calendar day of a month, as date strings. */
export function monthBounds(monthKey: MonthKey): {
  start: EtDateString;
  end: EtDateString;
} {
  const start = DateTime.fromISO(`${monthKey}-01`, { zone: "utc" }).startOf("day");
  return {
    start: start.toISODate()!,
    end: start.endOf("month").toISODate()!,
  };
}

/** "July 2026" — the label the Reigning Champion box shows. */
export function monthLabel(monthKey: MonthKey): string {
  return DateTime.fromISO(`${monthKey}-01`, { zone: "utc" }).toFormat("LLLL yyyy");
}
