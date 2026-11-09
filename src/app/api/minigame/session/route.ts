import { NextResponse } from "next/server";
import { getSession, canViewVa } from "@/lib/session";
import { GAMES_ENABLED } from "@/lib/features";
import { getTrapSession } from "@/lib/trapshift/game";

export const dynamic = "force-dynamic";

/**
 * GET /api/minigame/session — this VA's Trap Shift tries for today:
 * `{ unlocked, attemptsUsed, attemptsLeft, todayBest, seasonTotal, runsToday, season }`.
 *
 * No seed here, ever: a seed is handed out only by POST /start, with the try.
 * Outside the middleware matcher, so it answers 401/403 as JSON itself.
 * (Stretch Goal's version of this route is in src/games/_archive/stretch/api/.)
 */
export async function GET() {
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

  return NextResponse.json(await getTrapSession(session.userId), {
    headers: { "Cache-Control": "no-store" },
  });
}
