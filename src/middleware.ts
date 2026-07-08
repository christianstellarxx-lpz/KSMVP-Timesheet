import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "ksmvp_session";

/**
 * Coarse edge guard: bounce unauthenticated requests to /login before they hit
 * a protected page. Role enforcement and the authoritative check live in the
 * route layouts (src/lib/session.ts) — this is defense in depth, not the only line.
 */
async function isValidToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const secret = process.env.AUTH_SECRET;
  if (!secret) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
    });
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (await isValidToken(token)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/va/:path*",
    "/client/:path*",
    "/sales/:path*",
    "/account/:path*",
  ],
};
