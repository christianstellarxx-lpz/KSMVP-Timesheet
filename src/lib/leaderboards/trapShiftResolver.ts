import "server-only";
import { getTrapBoard } from "@/lib/trapshift/game";
import type { MonthKey } from "./months";
import type { GameResolver, MonthlyLeaderRow } from "./types";

/**
 * Trap Shift — monthly scoring resolver. The season score is the sum of each
 * VA's daily best try; the ranking is `getTrapBoard`'s, so the game page, the
 * Reigning Champion box and the wall of fame can never disagree.
 */
export async function resolveTrapMonthly(monthKey: MonthKey): Promise<MonthlyLeaderRow[]> {
  const board = await getTrapBoard(monthKey);
  return board.map((r) => ({
    rank: r.rank,
    userId: r.userId,
    name: r.name,
    points: r.total,
    detail: `${r.cleared} level${r.cleared === 1 ? "" : "s"} cleared · ${r.days} day${r.days === 1 ? "" : "s"}`,
  }));
}

export const trapShiftResolver: GameResolver = {
  id: "TRAP",
  name: "Trap Shift",
  scoreLabel: "SEASON TOTAL",
  tagline: "Three levels. Zero trust. Three tries a day — your best try counts toward the season.",
  icon: "🪤",
  resolveMonthly: resolveTrapMonthly,
};
