import type { MonthKey } from "@/lib/word/logic";

/**
 * The monthly leaderboard harness.
 *
 * Each rotating game plugs in a *resolver* — a module that knows how to turn
 * that game's raw rows into a ranked monthly table. Nothing outside the
 * resolver knows how a game is scored, so next month's game drops in by adding
 * one file plus one line in `registry.ts`, with no leaderboard rework.
 */

export type GameId = "FLAPPY" | "WORD";

export interface MonthlyLeaderRow {
  rank: number;
  userId: string;
  name: string;
  /** The headline number this game ranks by (points, best score, …). */
  points: number;
  /** Secondary stat shown beside the score, e.g. "18 played · 41 guesses". */
  detail: string;
  /** Live consecutive-solve streak, for games that track one. */
  streak?: number;
}

export interface GameResolver {
  id: GameId;
  /** Display name — this is what the Reigning Champion box crowns them for. */
  name: string;
  /** Caption above the headline number, e.g. "TOP SCORE". */
  scoreLabel: string;
  /** Ranked rows for an ET calendar month ("2026-08"), best first. */
  resolveMonthly(monthKey: MonthKey): Promise<MonthlyLeaderRow[]>;
}
