import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";
import { prisma } from "./prisma";
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_PATH,
  SESSION_VERSION,
  isCurrentSessionVersion,
} from "./sessionCookie";

const COOKIE_NAME = SESSION_COOKIE_NAME;

/**
 * Absolute cap on how long a signed token stays valid, enforced server-side by
 * `jwtVerify`. This is NOT how long a login lasts in practice — the cookie is a
 * browser *session cookie* (see createSession), so closing the browser ends the
 * session well before this. This is only the backstop for a browser that is
 * left open for days.
 */
const TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

/**
 * Roles & capabilities:
 *  ADMIN    — sees the admin dashboard only.
 *  VA_ADMIN — sees the admin dashboard AND their own VA dashboard (tabbed).
 *  VA       — sees their own VA dashboard.
 *  INTERN   — sees their own VA dashboard (same access as VA).
 *  SALES_PRODUCER — sees a unique Sales Desk (Technical Support / Admin Inquiries).
 */
export type Role = "ADMIN" | "VA_ADMIN" | "VA" | "INTERN" | "SALES_PRODUCER";

export const ROLES: Role[] = [
  "ADMIN",
  "VA_ADMIN",
  "VA",
  "INTERN",
  "SALES_PRODUCER",
];

/** Roles that can view the org-wide admin dashboard. */
export const ADMIN_ROLES: Role[] = ["ADMIN", "VA_ADMIN"];
/** Roles that have a personal VA dashboard. */
export const VA_ROLES: Role[] = ["VA_ADMIN", "VA", "INTERN"];

export function canViewAdmin(role: Role): boolean {
  return ADMIN_ROLES.includes(role);
}
export function canViewVa(role: Role): boolean {
  return VA_ROLES.includes(role);
}
/** The Sales Producer's unique dashboard. */
export function canViewSales(role: Role): boolean {
  return role === "SALES_PRODUCER";
}

/**
 * Top-level admins only (not VA admins). Gate destructive actions here —
 * deleting VAs' time entries and comments.
 */
export function isFullAdmin(role: Role): boolean {
  return role === "ADMIN";
}

/**
 * Team members responsible for compiling & sending the daily time-report email
 * to the admins. They get a unique "Daily Roll Call" panel on the admin dashboard.
 */
export const DAILY_REPORTER_EMAILS = ["kristine@kevinspann.com"];
export function isDailyReporter(email: string): boolean {
  return DAILY_REPORTER_EMAILS.includes(email.toLowerCase());
}

export function roleLabel(role: Role): string {
  switch (role) {
    case "ADMIN":
      return "Admin";
    // Shown as a plain "Virtual Assistant" — the admin-dashboard access is a
    // capability, not a separate title. (Role id stays VA_ADMIN internally.)
    case "VA_ADMIN":
      return "Virtual Assistant";
    case "INTERN":
      return "Intern";
    case "SALES_PRODUCER":
      return "Sales Producer";
    case "VA":
    default:
      return "Virtual Assistant";
  }
}

export interface SessionUser {
  userId: string;
  role: Role;
  name: string;
  email: string;
  title: string;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.authSecret);
}

async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({
    // `v` lets a future change retire every existing session automatically —
    // see SESSION_VERSION.
    v: SESSION_VERSION,
    role: user.role,
    name: user.name,
    email: user.email,
    title: user.title,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.userId)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

/**
 * Create the session cookie after a successful login.
 *
 * Deliberately a **session cookie**: no `maxAge` and no `expires`, so the
 * browser holds it in memory only and discards it when the browser is closed —
 * the next visit lands on /login. Do not add `maxAge`/`expires` here; that
 * would write it to disk and keep people signed in across restarts.
 *
 * Caveat worth knowing: a browser configured to reopen its previous tabs
 * ("Continue where you left off", or Android Chrome's default) can restore
 * session cookies too. The signed token's own expiry is the backstop.
 */
export async function createSession(user: SessionUser): Promise<void> {
  const token = await signSession(user);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: SESSION_COOKIE_PATH,
  });
}

/** Clear the session cookie (logout). */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/**
 * Return the current session user, or null if unauthenticated/invalid — or if
 * the account has since been removed (or deleted). That last check is a DB
 * read, so a removed member loses access on their next request instead of when
 * they close the browser. `cache` makes it one read per request, however many
 * guards run.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const user = await verifySessionToken();
  if (!user) return null;
  // Outside verifySessionToken's try/catch on purpose: a DB hiccup should fail
  // the request like any other DB error, not silently sign the user out.
  const account = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { removedAt: true },
  });
  return account && !account.removedAt ? user : null;
});

async function verifySessionToken(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
    });
    // A token from an older session format is treated as no session at all.
    // We can't clear the cookie from here (renders may not mutate cookies), but
    // the guard's redirect to /login goes through the middleware, which does.
    if (!isCurrentSessionVersion(payload.v)) return null;

    const role = payload.role as Role | undefined;
    if (!payload.sub || !role || !ROLES.includes(role)) return null;
    return {
      userId: payload.sub,
      role,
      name: String(payload.name ?? ""),
      email: String(payload.email ?? ""),
      title: String(payload.title ?? ""),
    };
  } catch {
    return null;
  }
}

/** The landing route for a given role. */
export function homePathForRole(role: Role): string {
  if (canViewAdmin(role)) return "/client";
  if (canViewSales(role)) return "/sales";
  return "/va";
}

/** Guard: require any authenticated user, else redirect to login. */
export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Guard: require admin-dashboard access (ADMIN or VA_ADMIN). */
export async function requireAdmin(): Promise<SessionUser> {
  const session = await requireUser();
  if (!canViewAdmin(session.role)) redirect(homePathForRole(session.role));
  return session;
}

/** Guard: require a personal VA dashboard (VA_ADMIN, VA, or INTERN). */
export async function requireVA(): Promise<SessionUser> {
  const session = await requireUser();
  if (!canViewVa(session.role)) redirect(homePathForRole(session.role));
  return session;
}

/** Guard: require the Sales Producer dashboard. */
export async function requireSalesProducer(): Promise<SessionUser> {
  const session = await requireUser();
  if (!canViewSales(session.role)) redirect(homePathForRole(session.role));
  return session;
}
