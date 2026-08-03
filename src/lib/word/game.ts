import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isClockedInToday } from "@/lib/game";
import {
  etToday,
  etDateStringToStorageDate,
  storageDateToEtDateString,
  formatEtDateLong,
  formatEtDateShort,
  type EtDateString,
} from "@/lib/time";
import {
  resolveWordMonthly,
  WORD_SCORING_SUMMARY,
} from "@/lib/leaderboards/wordResolver";
import type { MonthlyLeaderRow } from "@/lib/leaderboards/types";
import { ANSWER_PLAY_ORDER, isAllowedGuess } from "./lists";
import {
  MAX_GUESSES,
  WORD_EPOCH_DATE,
  WORD_LENGTH,
  answerForDate,
  checkPlayEligibility,
  currentStreak,
  emojiGrid,
  etCurrentMonthKey,
  evaluateGuess,
  monthLabel,
  type Tile,
} from "./logic";

/**
 * Daily Word Guess — server-authoritative game module.
 *
 * The answer is resolved and compared here and never leaves the server until
 * the player's own attempt is finished. The client posts a guess and receives
 * only the colour pattern back.
 *
 * The daily-attempt gate is the shared one: `isClockedInToday` from
 * src/lib/game.ts — the same rule that unlocks Daily Flappy.
 */

export interface WordLeaderRow {
  rank: number;
  userId: string;
  name: string;
  points: number;
  detail: string;
  streak: number;
}

export interface WordGameState {
  /** ET calendar day this puzzle belongs to. */
  date: EtDateString;
  dateLabel: string;
  /** The user clocked in today — required to play (shared game gate). */
  clockedInToday: boolean;
  /** Words submitted so far, in order. */
  guesses: string[];
  /** Colour pattern per submitted guess, same length as `guesses`. */
  patterns: Tile[][];
  guessesLeft: number;
  solved: boolean;
  /** Solved, or all six guesses used — the attempt is over either way. */
  finished: boolean;
  /** The secret, revealed ONLY once this player's attempt is finished. */
  answer: string | null;
  /** Spoiler-free emoji grid, ready to copy. Null until finished. */
  shareText: string | null;
  /** Live consecutive-solved-workday streak. */
  streak: number;
  monthLabel: string;
  /** This player's points so far this month. */
  monthPoints: number;
  leaderboard: WordLeaderRow[];
  scoringSummary: string;
}

export type WordGuessResult =
  | { ok: true; state: WordGameState }
  | { ok: false; message: string };

/** How many rows of the monthly leaderboard the game panel shows. */
const LEADERBOARD_SIZE = 10;

/**
 * An error whose message is safe to show the player. Anything else that escapes
 * (a Prisma/connectivity failure, say) is replaced with a generic retry line so
 * raw DB errors never reach the UI.
 */
class PlayerError extends Error {}

// ---------------------------------------------------------------------------
// Milestone 2 — the shared daily puzzle
// ---------------------------------------------------------------------------

/**
 * Materialize the puzzle row for an ET day, so every user provably reads the
 * identical answer (and a later edit to answers.json can't retroactively change
 * a day that has already been played). First request of the day creates it;
 * `update: {}` means an existing row is never rewritten.
 */
export async function getOrCreatePuzzle(date: EtDateString) {
  const storageDate = etDateStringToStorageDate(date);
  const answer = answerForDate(date, ANSWER_PLAY_ORDER);
  try {
    return await prisma.wordPuzzle.upsert({
      where: { date: storageDate },
      update: {},
      create: { date: storageDate, answer },
    });
  } catch (e) {
    // Two first-visitors of the day can race the create; the unique index on
    // `date` settles it and the loser just reads the winner's row.
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      const existing = await prisma.wordPuzzle.findUnique({
        where: { date: storageDate },
      });
      if (existing) return existing;
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Reading state
// ---------------------------------------------------------------------------

/** JSON columns come back as `Prisma.JsonValue`; narrow them defensively. */
function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function toPatterns(value: unknown): Tile[][] {
  if (!Array.isArray(value)) return [];
  return value.map((row) =>
    Array.isArray(row)
      ? row.map((t) => (t === "green" || t === "yellow" ? t : "grey"))
      : [],
  );
}

/** This player's solved / played day sets, for the live streak. */
async function streakFor(vaId: string, today: EtDateString): Promise<number> {
  const rows = await prisma.wordEntry.findMany({
    where: {
      vaId,
      puzzle: { date: { gte: etDateStringToStorageDate(WORD_EPOCH_DATE) } },
    },
    select: { solved: true, guesses: true, puzzle: { select: { date: true } } },
  });

  const solved = new Set<EtDateString>();
  const played = new Set<EtDateString>();
  for (const row of rows) {
    if (toStringArray(row.guesses).length === 0) continue;
    const date = storageDateToEtDateString(row.puzzle.date);
    played.add(date);
    if (row.solved) solved.add(date);
  }
  return currentStreak(today, solved, played, WORD_EPOCH_DATE);
}

function toLeaderRows(rows: MonthlyLeaderRow[]): WordLeaderRow[] {
  return rows.slice(0, LEADERBOARD_SIZE).map((r) => ({
    rank: r.rank,
    userId: r.userId,
    name: r.name,
    points: r.points,
    detail: r.detail,
    streak: r.streak ?? 0,
  }));
}

/** Everything the Word Guess panel needs. Never includes an unfinished answer. */
export async function getWordGameState(vaId: string): Promise<WordGameState> {
  const today = etToday();
  const monthKey = etCurrentMonthKey();

  const puzzle = await getOrCreatePuzzle(today);

  const [clockedInToday, entry, streak, monthly] = await Promise.all([
    isClockedInToday(vaId),
    prisma.wordEntry.findUnique({
      where: { vaId_puzzleId: { vaId, puzzleId: puzzle.id } },
    }),
    streakFor(vaId, today),
    resolveWordMonthly(monthKey),
  ]);

  const guesses = toStringArray(entry?.guesses);
  const patterns = toPatterns(entry?.guessPatterns);
  const solved = entry?.solved ?? false;
  const finished = solved || guesses.length >= MAX_GUESSES;

  return {
    date: today,
    dateLabel: formatEtDateLong(today),
    clockedInToday,
    guesses,
    patterns,
    guessesLeft: Math.max(0, MAX_GUESSES - guesses.length),
    solved,
    finished,
    // The one place the answer crosses the wire — and only to a player whose
    // own attempt is already over.
    answer: finished ? puzzle.answer : null,
    shareText: finished
      ? emojiGrid(patterns, solved, formatEtDateShort(today))
      : null,
    streak,
    monthLabel: monthLabel(monthKey),
    monthPoints: monthly.find((r) => r.userId === vaId)?.points ?? 0,
    leaderboard: toLeaderRows(monthly),
    scoringSummary: WORD_SCORING_SUMMARY,
  };
}

// ---------------------------------------------------------------------------
// Milestone 3 — submitting a guess (server-authoritative evaluation)
// ---------------------------------------------------------------------------

/**
 * Evaluate one guess against today's answer and persist it.
 *
 * The two hard rules — **clocked in today** and **one game per day** — are both
 * enforced here, server-side, via `checkPlayEligibility`, and the check runs
 * *inside* the write transaction against freshly-read state. A client that
 * posts straight to /api/word/guess gets exactly the same treatment as the UI:
 * the caller's identity comes from the session cookie, never from the body,
 * and the unique (vaId, puzzleId) index is the final backstop.
 */
export async function submitWordGuess(
  vaId: string,
  rawGuess: string,
): Promise<WordGuessResult> {
  const guess = rawGuess.trim().toLowerCase();

  if (!/^[a-z]{5}$/.test(guess) || guess.length !== WORD_LENGTH) {
    return { ok: false, message: `Enter a ${WORD_LENGTH}-letter word.` };
  }
  if (!isAllowedGuess(guess)) {
    return { ok: false, message: `“${guess.toUpperCase()}” isn’t in the word list.` };
  }

  // Re-read the gate from the database on every guess — a session cookie alone
  // is not enough to play.
  const clockedInToday = await isClockedInToday(vaId);

  const today = etToday();
  const puzzle = await getOrCreatePuzzle(today);

  try {
    await prisma.$transaction(
      async (tx) => {
        const entry = await tx.wordEntry.findUnique({
          where: { vaId_puzzleId: { vaId, puzzleId: puzzle.id } },
        });

        const guesses = toStringArray(entry?.guesses);
        const patterns = toPatterns(entry?.guessPatterns);

        // Clocked in? Attempt still open? Guesses left? — one shared decision,
        // evaluated against state read inside this transaction.
        const gate = checkPlayEligibility({
          clockedInToday,
          solved: entry?.solved ?? false,
          completed: entry?.completedAt != null,
          guessesUsed: guesses.length,
        });
        if (!gate.canPlay) throw new PlayerError(gate.message!);

        const pattern = evaluateGuess(guess, puzzle.answer);
        const nextGuesses = [...guesses, guess];
        const nextPatterns = [...patterns, pattern];
        const isSolved = pattern.every((t) => t === "green");
        const isFinal = isSolved || nextGuesses.length >= MAX_GUESSES;

        const data = {
          guesses: nextGuesses,
          guessPatterns: nextPatterns,
          solved: isSolved,
          // Per the data model: 1–6 when solved, 0 when the attempt ends
          // unsolved. While in progress it tracks guesses used so far.
          guessCount: isFinal && !isSolved ? 0 : nextGuesses.length,
          completedAt: isFinal ? new Date() : null,
        };

        if (!entry) {
          await tx.wordEntry.create({
            data: { vaId, puzzleId: puzzle.id, ...data },
          });
          return;
        }

        // Optimistic guard: if a double-submit already appended a guess, this
        // matches zero rows rather than silently overwriting it.
        const res = await tx.wordEntry.updateMany({
          where: { id: entry.id, guessCount: entry.guessCount, solved: false },
          data,
        });
        if (res.count === 0) {
          throw new PlayerError(
            "That guess didn’t go through — please try again.",
          );
        }
      },
      // Generous window so a Neon cold start doesn't blow the default maxWait.
      { maxWait: 8000, timeout: 15000 },
    );
  } catch (e) {
    if (e instanceof PlayerError) return { ok: false, message: e.message };
    // P2002 = the unique (vaId, puzzleId) constraint caught a concurrent create.
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return {
        ok: false,
        message: "That guess didn’t go through — please try again.",
      };
    }
    // Anything else is infrastructure (typically Neon resuming from
    // autosuspend) — never surface the raw error to a player.
    return {
      ok: false,
      message:
        "The server was waking up and didn’t respond in time. Please try again in a moment.",
    };
  }

  return { ok: true, state: await getWordGameState(vaId) };
}
