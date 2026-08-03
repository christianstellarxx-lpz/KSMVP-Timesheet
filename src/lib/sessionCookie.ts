/**
 * Shared session-cookie constants and the session-version check.
 *
 * Deliberately dependency-free and NOT `server-only`: the edge middleware
 * imports this too, so the cookie name and the version can never drift between
 * `src/lib/session.ts` (node) and `src/middleware.ts` (edge).
 */

export const SESSION_COOKIE_NAME = "ksmvp_session";

/**
 * The session-payload version carried in every token as the `v` claim.
 *
 * **Bump this whenever a change should sign everyone out** — a new claim in the
 * token, changed cookie semantics, or a rotated `AUTH_SECRET`. Tokens carrying
 * any other version (including old tokens minted before versioning, which have
 * no `v` at all) are rejected, and the middleware deletes the stale cookie on
 * the way to /login. Nobody ever has to clear cookies by hand.
 *
 * History:
 *   1 — implicit; tokens minted before versioning existed (no `v` claim).
 *   2 — the auth cookie became a browser session cookie (no maxAge), so the
 *       persistent cookies issued before that had to be retired.
 */
export const SESSION_VERSION = 2;

/** True only for a token minted by the current session format. */
export function isCurrentSessionVersion(v: unknown): boolean {
  return v === SESSION_VERSION;
}

/**
 * Cookie attributes used both when writing the session and when expiring it.
 * The browser matches a deletion on name + domain + path, so the path here has
 * to stay in sync with the path used at login.
 */
export const SESSION_COOKIE_PATH = "/";
