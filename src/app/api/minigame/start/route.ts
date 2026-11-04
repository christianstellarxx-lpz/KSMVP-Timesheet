import { NextResponse } from "next/server";
import { getSession, canViewVa } from "@/lib/session";
import { GAMES_ENABLED } from "@/lib/features";
import { check } from "@/lib/rateLimit";
import { startRun } from "@/lib/stretch/game";

export const dynamic = "force-dynamic";

/**
 * POST /api/minigame/start — claim today's single ranked run.
 *
 * This is where the one-try-a-day rule actually bites. The client calls it
 * before the first frame is simulated, and the run is spent from that moment,
 * whether or not a score ever comes back.
 *
 * Without this step the attempt was only consumed on submit, which made the
 * rule "one submission a day": reloading mid-run returned the same seed and let
 * a player rehearse the identical layout until they liked their score.
 *
 * `startRun` does the claiming with a conditional update, so concurrent calls
 * from two tabs cannot both win.
 */

/** Start attempts allowed per VA per window. One honest player needs one. */
const START_LIMIT = 6;
const START_WINDOW_MS = 5 * 60_000;

export async function POST() {
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

  const limit = check(
    `minigame:start:${session.userId}`,
    START_LIMIT,
    START_WINDOW_MS,
  );
  if (!limit.allowed) {
    console.warn(`[minigame] rate-limited start user=${session.userId}`);
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(limit.retryAfterSeconds),
        },
      },
    );
  }

  const result = await startRun(session.userId);
  if (!result.ok) {
    console.warn(
      `[minigame] rejected start user=${session.userId} status=${result.status}`,
    );
    return NextResponse.json(
      { error: result.message },
      { status: result.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { seed: result.seed },
    { headers: { "Cache-Control": "no-store" } },
  );
}
