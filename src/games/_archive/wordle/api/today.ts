import { NextResponse } from "next/server";
import { getSession, canViewVa } from "@/lib/session";
import { getWordGameState } from "../game";

export const dynamic = "force-dynamic";

/**
 * GET /api/word/today — this VA's state for today's shared puzzle.
 *
 * Returns their guesses so far, the colour pattern for each, and how many
 * guesses remain. It does NOT return the answer unless their own attempt is
 * already finished (see getWordGameState).
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

  const state = await getWordGameState(session.userId);
  return NextResponse.json(state, {
    headers: { "Cache-Control": "no-store" },
  });
}
