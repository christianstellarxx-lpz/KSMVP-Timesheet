import { describe, it, expect } from "vitest";
import { OFFICE_ROSTER, visibleMembers } from "@/lib/office/roster";

// Everyone with an account, by slug (Marc has none).
const accounts = new Set(OFFICE_ROSTER.filter((m) => m.account).map((m) => m.slug));
const none = new Set<string>();

describe("OFFICE_ROSTER", () => {
  it("holds no email addresses (it ships to the public login page)", () => {
    expect(JSON.stringify(OFFICE_ROSTER)).not.toContain("@");
  });
});

describe("visibleMembers", () => {
  it("shows all 11 when nobody is off, in desk order", () => {
    const people = visibleMembers(accounts, none);
    expect(people).toHaveLength(11);
    expect(people[2]).toEqual({ slug: "marc-fey", desk: "D3", firstName: "Marc" });
    expect(people.map((p) => p.desk)).toEqual(Array.from({ length: 11 }, (_, i) => `D${i + 1}`));
  });

  it("hides someone on PTO, never Marc", () => {
    const people = visibleMembers(accounts, new Set(["kristine-te"]));
    expect(people.map((p) => p.slug)).not.toContain("kristine-te");
    expect(people.map((p) => p.slug)).toContain("marc-fey");
  });

  it("hides a removed member (no active account)", () => {
    const active = new Set([...accounts].filter((s) => s !== "venus-paglinawan"));
    expect(visibleMembers(active, none).map((p) => p.slug)).not.toContain("venus-paglinawan");
  });

  it("leaves only Marc when nobody else is active", () => {
    expect(visibleMembers(none, none)).toEqual([{ slug: "marc-fey", desk: "D3", firstName: "Marc" }]);
  });
});
