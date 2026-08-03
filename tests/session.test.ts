import { describe, it, expect } from "vitest";
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_PATH,
  SESSION_VERSION,
  isCurrentSessionVersion,
} from "@/lib/sessionCookie";

describe("session version", () => {
  it("accepts only the current version", () => {
    expect(isCurrentSessionVersion(SESSION_VERSION)).toBe(true);
  });

  it("rejects tokens minted before versioning existed (no `v` claim)", () => {
    expect(isCurrentSessionVersion(undefined)).toBe(false);
    expect(isCurrentSessionVersion(null)).toBe(false);
  });

  it("rejects any other version, so bumping it signs everyone out", () => {
    expect(isCurrentSessionVersion(SESSION_VERSION - 1)).toBe(false);
    expect(isCurrentSessionVersion(SESSION_VERSION + 1)).toBe(false);
  });

  it("does not coerce — a stringified version is not the version", () => {
    expect(isCurrentSessionVersion(String(SESSION_VERSION))).toBe(false);
  });

  it("keeps the cookie name and path in one shared place", () => {
    // Both src/lib/session.ts and src/middleware.ts import these; a mismatch
    // would mean the middleware could not delete what login sets.
    expect(SESSION_COOKIE_NAME).toBe("ksmvp_session");
    expect(SESSION_COOKIE_PATH).toBe("/");
  });
});
