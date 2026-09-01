import { NextResponse, type NextRequest } from "next/server";
import { getSession, canViewVa } from "@/lib/session";
import { submitWordGuess } from "../game";
import { wordGuessSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * POST /api/word/guess — body: { guess: "crane" }
 *
 * The server evaluates the guess against today's answer and returns only the
 * colour pattern (inside the refreshed game state). The gate, the six-guess
 * cap, and the "already finished" check are all enforced in submitWordGuess —
 * this handler only does auth and shape validation.
 */
export async function POST(req: NextRequest) {
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = wordGuessSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Enter a 5-letter word." },
      { status: 400 },
    );
  }

  const result = await submitWordGuess(session.userId, parsed.data.guess);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json(result.state, {
    headers: { "Cache-Control": "no-store" },
  });
}
