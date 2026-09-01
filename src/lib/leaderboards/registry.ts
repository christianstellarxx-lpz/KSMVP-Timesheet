import "server-only";
import {
  etCurrentMonthKey,
  monthLabel,
  previousMonthKey,
  type MonthKey,
} from "./months";
import { flappyResolver } from "./flappyResolver";
import { stretchResolver } from "./stretchResolver";
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
  { from: "2026-09", gameId: "STRETCH" }, // Stretch Goal — game #3
];

/** Months before the rotation started were Daily Flappy's. */
export const DEFAULT_GAME_ID: GameId = "FLAPPY";

const RESOLVERS: Record<GameId, GameResolver> = {
  FLAPPY: flappyResolver,
  WORD: wordResolver,
  STRETCH: stretchResolver,
};

/**
 * The game live right now — the single source of truth for "this month's game",
 * derived from the rotation rather than declared a second time beside it.
 *
 * Handing next month to a new game is still one line: add its resolver file and
 * one GAME_ROTATION entry. Deriving ACTIVE_GAME from the rotation (instead of
 * standing it up as its own constant) is what keeps the wall of fame honest —
 * the rotation remembers which game was live in *every* past month, so August
 * still resolves to Daily Word Guess after the swap.
 */
export function activeGameId(now: Date = new Date()): GameId {
  return gameIdForMonth(etCurrentMonthKey(now));
}

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

// ---------------------------------------------------------------------------
// The promo card on the VA dashboard
// ---------------------------------------------------------------------------

export interface ActiveGamePromo {
  /** e.g. "Stretch Goal" */
  name: string;
  tagline: string;
  icon: string;
}

/**
 * What this month's game is called, for the "this month's game" card on the VA
 * dashboard.
 *
 * Read from the rotation rather than written into the component, because the
 * component is exactly where a stale name hides: /va went on advertising Daily
 * Word Guess after the September swap. Now the swap carries the card with it.
 */
export function getActiveGamePromo(now: Date = new Date()): ActiveGamePromo {
  const resolver = resolverFor(activeGameId(now));
  return {
    name: resolver.name,
    tagline: resolver.tagline,
    icon: resolver.icon,
  };
}

// ---------------------------------------------------------------------------
// Wall of fame — every past season's winner
// ---------------------------------------------------------------------------

export interface PastChampion {
  /** "2026-08" */
  monthKey: MonthKey;
  /** "August 2026" */
  monthLabel: string;
  /** The game that was live that month, e.g. "Daily Word Guess". */
  gameName: string;
  scoreLabel: string;
  name: string;
  score: number;
  /** That game's secondary stat, e.g. "18/21 solved · 62 guesses". */
  detail: string;
}

/**
 * The winner of each completed season, newest first.
 *
 * This is the reason Wordle was archived rather than deleted. Each month is
 * resolved through the game that was live *then* (see GAME_ROTATION), so
 * August still renders as a Daily Word Guess season, scored by Word's own
 * rules, long after the game itself stopped being mounted.
 *
 * Months with no play are skipped rather than shown empty.
 */
export async function getPastChampions(
  limit = 6,
  now: Date = new Date(),
): Promise<PastChampion[]> {
  let monthKey = previousMonthKey(etCurrentMonthKey(now));
  const out: PastChampion[] = [];

  for (let i = 0; i < limit; i++) {
    const resolver = resolverForMonth(monthKey);
    try {
      const rows = await resolver.resolveMonthly(monthKey);
      const winner = rows[0];
      if (winner) {
        out.push({
          monthKey,
          monthLabel: monthLabel(monthKey),
          gameName: resolver.name,
          scoreLabel: resolver.scoreLabel,
          name: winner.name,
          score: winner.points,
          detail: winner.detail,
        });
      }
    } catch {
      // One month failing to resolve must not take the wall down.
    }
    monthKey = previousMonthKey(monthKey);
  }

  return out;
}
