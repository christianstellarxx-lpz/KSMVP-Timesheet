import { describe, it, expect, vi } from "vitest";

// The office is decoration: a database error must never break the page it sits on
// (on /login it would block signing in).
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: vi.fn().mockRejectedValue(new Error("P1001: can't reach database")) },
    timeEntry: { findMany: vi.fn() },
  },
}));

import { getOfficePeople } from "@/lib/officeRoster";

describe("getOfficePeople", () => {
  it("returns null instead of throwing when the database fails", async () => {
    await expect(getOfficePeople()).resolves.toBeNull();
  });
});
