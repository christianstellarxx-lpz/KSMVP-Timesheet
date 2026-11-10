import "server-only";
import { getTrapBoard } from "@/lib/trapshift/game";
import type { MonthKey } from "./months";
import type { GameResolver, MonthlyLeaderRow } from "./types";

/**
 * Trap Shift — monthly scoring resolver. A VA's season score is their best
 * single try (v3 rows only, ties to the faster run); the ranking is
 * `getTrapBoard`'s, so the game page, the Reigning Champion box and the wall of
 * fame can never disagree.
 *
 * There is no v1 resolver: v3 went live in November 2026, Trap Shift's first
 * season, so no season was ever scored the v1 way. The v1 core stays so those
 * rows remain verifiable.
 */
export async function resolveTrapMonthly(monthKey: MonthKey): Promise<MonthlyLeaderRow[]> {
  const board = await getTrapBoard(monthKey);
  return board.map((r) => ({
    rank: r.rank,
    userId: r.userId,
    name: r.name,
    points: r.best,
    detail: r.reached,
  }));
}

export const trapShiftResolver: GameResolver = {
  id: "TRAP",
  name: "Trap Shift",
  scoreLabel: "BEST TRY",
  tagline: "Three levels. Zero trust. Five tries a day — your best single try is your score.",
  icon: "🪤",
  resolveMonthly: resolveTrapMonthly,
};
