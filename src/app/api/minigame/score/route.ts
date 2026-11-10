import { NextResponse, type NextRequest } from "next/server";
import { getSession, canViewVa } from "@/lib/session";
import { GAMES_ENABLED } from "@/lib/features";
import { check } from "@/lib/rateLimit";
import { scoreTrapRun } from "@/lib/trapshift/game";
import { trapScoreSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * POST /api/minigame/score — body `{ runId, log }`. Also the target of the
 * client's `sendBeacon` when a tab closes mid-run (the partial log scores as
 * "quit" with the distance reached).
 *
 * THE CLIENT'S SCORE IS NEVER READ. The schema has no score, seed, routes,
 * attempt or date field, and Zod strips anything extra. `scoreTrapRun` replays
 * the log on the stored seed, routes and save point, on the core of the row's
 * own version, and stores that result.
 */
const SCORE_LIMIT = 10;
const SCORE_WINDOW_MS = 60_000;
/** A 15-minute log is well under this; anything bigger is not a real run. */
const MAX_BODY_BYTES = 1_000_000;

/** Every rejection is logged with the user id — probing should show up before prize day. */
function reject(
  userId: string,
  status: number,
  error: string,
  reason: string,
  headers: Record<string, string> = {},
) {
  console.warn(`[minigame] rejected submission user=${userId} status=${status} reason=${reason}`);
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
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
    return NextResponse.json({ error: "This game is for the VA dashboard." }, { status: 403 });
  }
  const userId = session.userId;

  const limit = check(`minigame:score:${userId}`, SCORE_LIMIT, SCORE_WINDOW_MS);
  if (!limit.allowed) {
    return reject(userId, 429, "Too many submissions. Try again shortly.", "rate_limited", {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  // shortcut: a chunked body with no Content-Length is buffered before the size
  // check below; Vercel's own 4.5 MB request cap bounds that.
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return reject(userId, 400, "That replay is too large.", "body_too_large");
  }
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) {
      return reject(userId, 400, "That replay is too large.", "body_too_large");
    }
    body = JSON.parse(text);
  } catch {
    return reject(userId, 400, "Invalid request.", "unparseable_body");
  }

  const parsed = trapScoreSchema.safeParse(body);
  if (!parsed.success) {
    const where = parsed.error.issues[0]?.path.join(".") ?? "?";
    return reject(userId, 400, "That replay wasn’t valid.", `malformed_payload:${where}`);
  }

  const result = await scoreTrapRun(userId, parsed.data.runId, parsed.data.log);
  if (!result.ok) return reject(userId, result.status, result.message, result.reason);

  const { score, cleared, ended, cause, todayBest, seasonBest, attemptsLeft, nextStartCp, rank } = result;
  return NextResponse.json(
    { score, cleared, ended, cause, todayBest, seasonBest, attemptsLeft, nextStartCp, rank },
    { headers: { "Cache-Control": "no-store" } },
  );
}
