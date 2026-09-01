import { NextResponse } from "next/server";
import { getSession, canViewVa } from "@/lib/session";
import { getMiniGameSession } from "@/lib/stretch/game";

export const dynamic = "force-dynamic";

/**
 * GET /api/minigame/session — this VA's state for today's ranked run.
 *
 * Returns `{ unlocked, runUsed, seed, season }`.
 *
 * `unlocked` is true only once the VA has timed in today AND saved a
 * start-of-day task. On the first unlocked request of the day this issues the
 * seed and stores it at status "issued"; every later request returns that SAME
 * seed. That is deliberate and load-bearing — re-rolling on refresh would let
 * someone reload until they drew an easy layout.
 *
 * Like the archived Word routes, this handler is outside the middleware matcher
 * and enforces auth itself, answering 401/403 as JSON instead of redirecting a
 * fetch() to /login.
 */
export async function GET() {
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

  const state = await getMiniGameSession(session.userId);
  return NextResponse.json(state, {
    headers: { "Cache-Control": "no-store" },
  });
}
