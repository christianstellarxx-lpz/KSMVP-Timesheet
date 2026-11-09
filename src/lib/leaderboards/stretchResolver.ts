import "server-only";
import { prisma } from "@/lib/prisma";
import {
  RUN_SUBMITTED,
  STRETCH_GAME_KEY,
} from "@/games/_archive/stretch/game";
import type { MonthKey } from "./months";
import type { GameResolver, MonthlyLeaderRow } from "./types";

/**
 * Stretch Goal — monthly scoring resolver.
 *
 * The simplest resolver in the harness, because the game already stores a
 * verified score per run: a season is ranked by each VA's **best single run**,
 * ties broken by perfects, then by total runs played that month.
 *
 * Only rows at status "submitted" count — an "issued" row is a seed that was
 * handed out and never played, and must never place on a board.
 *
 * Rows carrying a different `replayVersion` than the one that scored them are
 * still ranked as-is. They were verified under the physics that were live at
 * the time; re-scoring them under new physics would be the silent rewrite the
 * brief warns against.
 */
export async function resolveStretchMonthly(
  monthKey: MonthKey,
): Promise<MonthlyLeaderRow[]> {
  const rows = await prisma.miniGameRun.findMany({
    where: {
      gameKey: STRETCH_GAME_KEY,
      season: monthKey,
      status: RUN_SUBMITTED,
    },
    select: {
      userId: true,
      score: true,
      perfects: true,
      user: { select: { name: true } },
    },
  });
  if (rows.length === 0) return [];

  interface Agg {
    userId: string;
    name: string;
    best: number;
    perfects: number;
    runs: number;
  }

  const byPlayer = new Map<string, Agg>();
  for (const row of rows) {
    const current = byPlayer.get(row.userId);
    if (!current) {
      byPlayer.set(row.userId, {
        userId: row.userId,
        name: row.user.name,
        best: row.score,
        perfects: row.perfects,
        runs: 1,
      });
      continue;
    }
    current.runs += 1;
    // Perfects travel with the best run, not summed across the month — the
    // board ranks a single best run, so its tiebreak has to describe that run.
    if (
      row.score > current.best ||
      (row.score === current.best && row.perfects > current.perfects)
    ) {
      current.best = row.score;
      current.perfects = row.perfects;
    }
  }

  return [...byPlayer.values()]
    .sort(
      (a, b) =>
        b.best - a.best ||
        b.perfects - a.perfects ||
        b.runs - a.runs ||
        a.name.localeCompare(b.name),
    )
    .map((row, i) => ({
      rank: i + 1,
      userId: row.userId,
      name: row.name,
      points: row.best,
      detail: `${row.perfects} perfect · ${row.runs} run${row.runs === 1 ? "" : "s"}`,
    }));
}

export const stretchResolver: GameResolver = {
  id: "STRETCH",
  name: "Stretch Goal",
  scoreLabel: "TOP SCORE",
  tagline: "One ranked run a day. Stretch the beam, land the centre mark, climb the tiers.",
  icon: "🌉",
  resolveMonthly: resolveStretchMonthly,
};

/** Exposed for the game panel's "how scoring works" copy. */
export const STRETCH_SCORING_SUMMARY =
  "One ranked run a day, unlocked at time-in. +1 per ledge, +2 for landing the yellow centre mark. Your single best run of the month is your score; ties go to the most perfects.";
