import { NextResponse, type NextRequest } from "next/server";
import { getSession, canViewVa } from "@/lib/session";
import { GAMES_ENABLED } from "@/lib/features";
import { etCurrentMonthKey, isMonthKey } from "@/lib/leaderboards/months";
import { getTrapBoard, toRail } from "@/lib/trapshift/game";

export const dynamic = "force-dynamic";

/**
 * GET /api/minigame/leaderboard?season=YYYY-MM — the Trap Shift season board:
 * each VA's best single try (v3 rows), with today's best and the
 * caller's own row flagged. `season` defaults to the current ET month.
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
    return NextResponse.json({ error: "This game is for the VA dashboard." }, { status: 403 });
  }

  const requested = req.nextUrl.searchParams.get("season");
  if (requested !== null && !isMonthKey(requested)) {
    return NextResponse.json({ error: "Season must look like 2026-11." }, { status: 400 });
  }
  const season = requested ?? etCurrentMonthKey();
  const rows = toRail(await getTrapBoard(season), session.userId);

  return NextResponse.json(
    { season, myRank: rows.find((r) => r.isYou)?.rank ?? null, rows },
    { headers: { "Cache-Control": "no-store" } },
  );
}
