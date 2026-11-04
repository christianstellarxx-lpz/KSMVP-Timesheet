import { NextResponse, type NextRequest } from "next/server";
import { getSession, canViewVa } from "@/lib/session";
import { GAMES_ENABLED } from "@/lib/features";
import { check } from "@/lib/rateLimit";
import { submitRun } from "@/lib/stretch/game";
import { stretchRunSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * POST /api/minigame/score — body `{ seed, holds }`.
 *
 * THE CLIENT'S SCORE IS NEVER READ. There is no score field in
 * `stretchRunSchema` and none is destructured below, so there is nowhere for a
 * forged number to enter. The server replays `holds` against the seed it
 * issued, and `submitRun` stores `simulateRun()`'s own output.
 *
 * Everything else — the run exists, it is still "issued", the seed matches, the
 * replay actually finished — is enforced in `submitRun`, inside the same write
 * that records the result. This handler does auth, rate limiting, and shape
 * validation only.
 */

/** Submit attempts allowed per VA per window. A real run takes far fewer. */
const SUBMIT_LIMIT = 8;
const SUBMIT_WINDOW_MS = 5 * 60_000;

/**
 * Log a rejected submission with the user id.
 *
 * A legitimate player hits this essentially never: they get one run, and the
 * client posts once when it ends. A cluster of these against one id is somebody
 * probing the endpoint, and the brief is explicit that we want to know before
 * prize day rather than after.
 */
function logRejection(
  userId: string,
  reason: string,
  detail?: Record<string, unknown>,
): void {
  console.warn(
    `[minigame] rejected submission user=${userId} reason=${reason}` +
      (detail ? ` ${JSON.stringify(detail)}` : ""),
  );
}

export async function POST(req: NextRequest) {
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
    `minigame:score:${session.userId}`,
    SUBMIT_LIMIT,
    SUBMIT_WINDOW_MS,
  );
  if (!limit.allowed) {
    logRejection(session.userId, "rate_limited");
    return NextResponse.json(
      { error: "Too many submissions. Try again shortly." },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(limit.retryAfterSeconds),
        },
      },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    logRejection(session.userId, "unparseable_body");
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = stretchRunSchema.safeParse(body);
  if (!parsed.success) {
    logRejection(session.userId, "malformed_payload", {
      issue: parsed.error.issues[0]?.path.join(".") ?? "unknown",
    });
    return NextResponse.json(
      { error: "That replay wasn’t valid." },
      { status: 400 },
    );
  }

  const result = await submitRun(
    session.userId,
    parsed.data.seed,
    parsed.data.holds,
  );
  if (!result.ok) {
    logRejection(session.userId, "verification_failed", {
      status: result.status,
    });
    return NextResponse.json(
      { error: result.message },
      { status: result.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(result.run, {
    headers: { "Cache-Control": "no-store" },
  });
}
