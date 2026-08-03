import "server-only";
import {
  etCurrentMonthKey,
  monthLabel,
  previousMonthKey,
  type MonthKey,
} from "@/lib/word/logic";
import { flappyResolver } from "./flappyResolver";
import { wordResolver } from "./wordResolver";
import type { GameId, GameResolver, MonthlyLeaderRow } from "./types";

/**
 * The rotation: which game "counts" for a given calendar month.
 *
 * To hand next month over to a new game, add its resolver file and one entry
 * here. Everything downstream — the monthly leaderboard and the Reigning
 * Champion spotlight — follows automatically.
 */
export const GAME_ROTATION: readonly { from: MonthKey; gameId: GameId }[] = [
  { from: "2026-08", gameId: "WORD" }, // Daily Word Guess — game #2
];

/** Months before the rotation started were Daily Flappy's. */
export const DEFAULT_GAME_ID: GameId = "FLAPPY";

const RESOLVERS: Record<GameId, GameResolver> = {
  FLAPPY: flappyResolver,
  WORD: wordResolver,
};

export function resolverFor(gameId: GameId): GameResolver {
  return RESOLVERS[gameId];
}

/** The game that was live in a given month — the latest rotation entry at or before it. */
export function gameIdForMonth(monthKey: MonthKey): GameId {
  const match = [...GAME_ROTATION]
    .filter((r) => r.from <= monthKey)
    .sort((a, b) => b.from.localeCompare(a.from))[0];
  return match?.gameId ?? DEFAULT_GAME_ID;
}

export function resolverForMonth(monthKey: MonthKey): GameResolver {
  return resolverFor(gameIdForMonth(monthKey));
}

// ---------------------------------------------------------------------------
// Reigning Champion — last month's overall winner
// ---------------------------------------------------------------------------

export interface ChampionDTO {
  name: string;
  score: number;
  gameName: string;
  /** "July 2026" */
  monthLabel: string;
  /** True while we're still showing the seeded placeholder (no real data yet). */
  isFallback: boolean;
}

/**
 * Seed shown only until a real previous-month winner exists in the data. Once
 * a month wraps with actual play, the box crowns that winner automatically.
 */
export const CHAMPION_FALLBACK: ChampionDTO = {
  name: "Bryxter Bulisig",
  score: 198,
  gameName: "DailyFlappy",
  monthLabel: "July 2026",
  isFallback: true,
};

/**
 * The rank-1 finisher of the *previous* calendar month, resolved through that
 * month's game. Nothing here is hardcoded — when a new month's game wraps, this
 * box crowns that winner on the next page load.
 */
export async function getReigningChampion(
  now: Date = new Date(),
): Promise<ChampionDTO> {
  const lastMonth = previousMonthKey(etCurrentMonthKey(now));
  const resolver = resolverForMonth(lastMonth);

  let winner: MonthlyLeaderRow | undefined;
  try {
    const rows = await resolver.resolveMonthly(lastMonth);
    winner = rows[0];
  } catch {
    // A leaderboard hiccup should never take the page down — fall back.
    winner = undefined;
  }
  if (!winner) return CHAMPION_FALLBACK;

  return {
    name: winner.name,
    score: winner.points,
    gameName: resolver.name,
    monthLabel: monthLabel(lastMonth),
    isFallback: false,
  };
}
