import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_PATH,
  isCurrentSessionVersion,
} from "@/lib/sessionCookie";

const LOGIN_PATH = "/login";

/**
 * Coarse edge guard: bounce unauthenticated requests to /login before they hit
 * a protected page. Role enforcement and the authoritative check live in the
 * route layouts (src/lib/session.ts) — this is defense in depth, not the only line.
 *
 * It is also where a **stale session cookie self-heals**. A cookie that fails
 * to verify — wrong signature after a secret rotation, expired, or minted by an
 * older session format (see SESSION_VERSION) — is deleted here rather than left
 * for the browser to keep re-sending. Nobody should ever have to clear cookies
 * by hand to get back into the app.
 */
async function isValidToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const secret = process.env.AUTH_SECRET;
  if (!secret) return false;
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
      { algorithms: ["HS256"] },
    );
    // Reject anything not minted by the current session format, so bumping
    // SESSION_VERSION signs everyone out cleanly.
    return isCurrentSessionVersion(payload.v);
  } catch {
    return false;
  }
}

/** Expire the session cookie on this response (name + path must match login). */
function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: SESSION_COOKIE_PATH,
    maxAge: 0,
  });
}

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (await isValidToken(token)) return NextResponse.next();

  const onLogin = req.nextUrl.pathname === LOGIN_PATH;

  // /login is matched only so a stale cookie can be cleaned up on arrival —
  // never redirect it (that would loop).
  if (onLogin) {
    // Only on a plain page load. The login Server Action POSTs to this same
    // path and sets the *new* session cookie itself; clearing it here would
    // race that Set-Cookie and could wipe the session the user just created.
    if (token && req.method === "GET") {
      const res = NextResponse.next();
      clearSessionCookie(res);
      return res;
    }
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = LOGIN_PATH;
  url.search = "";
  const res = NextResponse.redirect(url);
  if (token) clearSessionCookie(res);
  return res;
}

export const config = {
  matcher: [
    "/va/:path*",
    "/client/:path*",
    "/sales/:path*",
    "/account/:path*",
    // Not guarded — present so a stale cookie is cleared when someone lands here.
    "/login",
  ],
};
