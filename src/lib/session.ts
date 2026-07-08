import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

const COOKIE_NAME = "ksmvp_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

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
    role: user.role,
    name: user.name,
    email: user.email,
    title: user.title,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

/** Create the session cookie after a successful login. */
export async function createSession(user: SessionUser): Promise<void> {
  const token = await signSession(user);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Clear the session cookie (logout). */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/** Return the current session user, or null if unauthenticated/invalid. */
export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
    });
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
