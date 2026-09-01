import "server-only";
import { prisma } from "@/lib/prisma";
import { etDateStringToStorageDate } from "@/lib/time";
import { monthBounds, type MonthKey } from "./months";
import type { GameResolver, MonthlyLeaderRow } from "./types";

/**
 * Daily Flappy — monthly scoring resolver.
 *
 * Flappy's own dashboard panel ranks by all-time best (src/lib/game.ts); this
 * resolver is the *monthly* view of the same GameScore rows, so a month where
 * Flappy was the rotating game can crown a Reigning Champion the same way the
 * Word game does. Score = best single score set inside the month; ties go to
 * whoever played more days that month.
 */
export async function resolveFlappyMonthly(
  monthKey: MonthKey,
): Promise<MonthlyLeaderRow[]> {
  const { start, end } = monthBounds(monthKey);

  const grouped = await prisma.gameScore.groupBy({
    by: ["userId"],
    where: {
      playDate: {
        gte: etDateStringToStorageDate(start),
        lte: etDateStringToStorageDate(end),
      },
    },
    _max: { score: true },
    _count: { _all: true },
  });
  if (grouped.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: grouped.map((g) => g.userId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  return grouped
    .map((g) => ({
      userId: g.userId,
      name: nameById.get(g.userId) ?? "—",
      points: g._max.score ?? 0,
      daysPlayed: g._count._all,
    }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.daysPlayed - a.daysPlayed ||
        a.name.localeCompare(b.name),
    )
    .map((row, i) => ({
      rank: i + 1,
      userId: row.userId,
      name: row.name,
      points: row.points,
      detail: `${row.daysPlayed} day${row.daysPlayed === 1 ? "" : "s"} played`,
    }));
}

export const flappyResolver: GameResolver = {
  id: "FLAPPY",
  name: "DailyFlappy",
  scoreLabel: "TOP SCORE",
  tagline: "One flight a day. Dodge the pipes and set the month's best score.",
  icon: "🐦",
  resolveMonthly: resolveFlappyMonthly,
};
