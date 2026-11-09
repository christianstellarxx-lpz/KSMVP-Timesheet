import { NextResponse } from "next/server";
import { getSession, canViewVa } from "@/lib/session";
import { GAMES_ENABLED } from "@/lib/features";
import { check } from "@/lib/rateLimit";
import { startTrapRun } from "@/lib/trapshift/game";

export const dynamic = "force-dynamic";

/**
 * POST /api/minigame/start — issue the next Trap Shift try:
 * `{ runId, seed, routes, attemptNo, attemptsLeft }`.
 *
 * The try is spent here. Starting again abandons the open try (still counted),
 * which is what stops refresh-to-retry. Counting, the row lock and the database
 * constraints all live in `startTrapRun`; this handler is auth + rate limit.
 */
const START_LIMIT = 10;
const START_WINDOW_MS = 60_000;

export async function POST() {
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

  const limit = check(`minigame:start:${session.userId}`, START_LIMIT, START_WINDOW_MS);
  if (!limit.allowed) {
    console.warn(`[minigame] rejected start user=${session.userId} reason=rate_limited`);
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      {
        status: 429,
        headers: { "Cache-Control": "no-store", "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  const result = await startTrapRun(session.userId);
  if (!result.ok) {
    console.warn(`[minigame] rejected start user=${session.userId} status=${result.status}`);
    return NextResponse.json(
      { error: result.message },
      { status: result.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { runId, seed, routes, attemptNo, attemptsLeft } = result;
  return NextResponse.json(
    { runId, seed, routes, attemptNo, attemptsLeft },
    { headers: { "Cache-Control": "no-store" } },
  );
}
