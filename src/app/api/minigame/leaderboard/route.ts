import { NextResponse, type NextRequest } from "next/server";
import { getSession, canViewVa } from "@/lib/session";
import { GAMES_ENABLED } from "@/lib/features";
import { etCurrentMonthKey, isMonthKey } from "@/lib/leaderboards/months";
import {
  getDailyTally,
  getRailLeaderboard,
  seasonLabelFor,
} from "@/lib/stretch/game";

export const dynamic = "force-dynamic";

/**
 * GET /api/minigame/leaderboard?season=YYYY-MM
 *
 * Each VA's best single submitted run for that season, ordered by score desc
 * then perfects desc, with the caller's own row flagged. `season` defaults to
 * the current ET month; anything that isn't a well-formed "YYYY-MM" is rejected
 * rather than silently coerced.
 *
 * Also returns `today` — the daily tally. It is always *today*, never scoped to
 * the season queried (it carries its own `date` so it is self-describing), and
 * it rides along here so the panel refreshes both boards in one round trip.
 */
export async function GET(req: NextRequest) {
  if (!GAMES_ENABLED) {
    return NextResponse.json({ error: "Games are turned off." }, { status: 404 });
  }
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!canViewVa(session.role)) {
    return NextResponse.json(
      { error: "This game is for the VA dashboard." },
      { status: 403 },
    );
  }

  const requested = req.nextUrl.searchParams.get("season");
  if (requested !== null && !isMonthKey(requested)) {
    return NextResponse.json(
      { error: "Season must look like 2026-09." },
      { status: 400 },
    );
  }
  const season = requested ?? etCurrentMonthKey();

  const [rows, tally] = await Promise.all([
    getRailLeaderboard(season, session.userId),
    getDailyTally(session.userId),
  ]);
  const me = rows.find((r) => r.isYou);

  return NextResponse.json(
    {
      season,
      seasonLabel: seasonLabelFor(season),
      myRank: me?.rank ?? null,
      rows: rows.map((r) => ({
        name: r.name,
        score: r.score,
        perfects: r.perfects,
        isYou: r.isYou ?? false,
      })),
      today: {
        date: tally.date,
        dateLabel: tally.dateLabel,
        stillToPlay: tally.stillToPlay,
        rows: tally.rows.map((r) => ({
          name: r.name,
          score: r.score,
          perfects: r.perfects,
          isYou: r.isYou ?? false,
        })),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
