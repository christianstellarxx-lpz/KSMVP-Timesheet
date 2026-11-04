import { describe, it, expect } from "vitest";
import {
  scheduledInstant,
  formatEtTime,
  etDateStringForInstant,
  etDateStringToStorageDate,
  storageDateToEtDateString,
  etPlanWeek,
  hasUrgent,
  EOD_PUBLISH_TIME,
  EOD_PUBLISH_LABEL,
} from "@/lib/time";

// A summer date is in EDT (UTC-4); a winter date is in EST (UTC-5).
const SUMMER = "2026-07-07"; // EDT
const WINTER = "2026-01-07"; // EST

describe("display always renders in ET regardless of stored UTC", () => {
  it("shows 8:45 AM for the summer UTC instant", () => {
    const utc = new Date("2026-07-07T12:45:00.000Z");
    expect(formatEtTime(utc)).toBe("8:45 AM");
  });

  it("shows 8:45 AM for the winter UTC instant", () => {
    const utc = new Date("2026-01-07T13:45:00.000Z");
    expect(formatEtTime(utc)).toBe("8:45 AM");
  });
});

describe("End-of-Day publish time (5:00 PM ET)", () => {
  it("labels the publish time from the constant", () => {
    expect(EOD_PUBLISH_LABEL).toBe("5:00 PM");
  });

  it("resolves 5:00 PM ET at the correct offset across DST", () => {
    // 21:00 UTC in summer (EDT, -4), 22:00 UTC in winter (EST, -5).
    expect(scheduledInstant(SUMMER, EOD_PUBLISH_TIME).toISOString()).toBe(
      "2026-07-07T21:00:00.000Z",
    );
    expect(scheduledInstant(WINTER, EOD_PUBLISH_TIME).toISOString()).toBe(
      "2026-01-07T22:00:00.000Z",
    );
  });
});

describe("workDate (ET calendar day)", () => {
  it("assigns a late-night UTC instant to the intended ET day", () => {
    // 2026-07-08 03:00 UTC == 2026-07-07 11:00 PM EDT -> ET day is the 7th.
    const instant = new Date("2026-07-08T03:00:00.000Z");
    expect(etDateStringForInstant(instant)).toBe("2026-07-07");
  });

  it("round-trips a workDate through storage", () => {
    const storage = etDateStringToStorageDate(SUMMER);
    expect(storageDateToEtDateString(storage)).toBe(SUMMER);
  });
});

describe("etPlanWeek (weekly planner Mon–Fri)", () => {
  const WEEK = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"];
  const NEXT = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"];

  it("returns the current week on a weekday", () => {
    // Wed Nov 4, noon ET.
    expect(etPlanWeek(new Date("2026-11-04T17:00:00.000Z"))).toEqual(WEEK);
    // Mon Nov 2, 9 AM ET — Monday is its own week's start.
    expect(etPlanWeek(new Date("2026-11-02T14:00:00.000Z"))).toEqual(WEEK);
  });

  it("returns next week on Saturday and Sunday", () => {
    expect(etPlanWeek(new Date("2026-11-07T17:00:00.000Z"))).toEqual(NEXT); // Sat
    expect(etPlanWeek(new Date("2026-11-08T17:00:00.000Z"))).toEqual(NEXT); // Sun
  });

  it("uses the ET day, not the UTC day, near midnight", () => {
    // Fri Nov 6, 11:30 PM ET is already Saturday in UTC — still this week.
    expect(etPlanWeek(new Date("2026-11-07T04:30:00.000Z"))).toEqual(WEEK);
    // Sat Nov 7, 12:30 AM ET — now it's next week.
    expect(etPlanWeek(new Date("2026-11-07T05:30:00.000Z"))).toEqual(NEXT);
  });

  it("handles the week DST ends (Sun Nov 1, 2026)", () => {
    // Sunday Nov 1 is the DST change day; the planner shows the week after.
    expect(etPlanWeek(new Date("2026-11-01T17:00:00.000Z"))).toEqual(WEEK);
  });
});

describe("hasUrgent", () => {
  it("is false for null, empty, or whitespace", () => {
    expect(hasUrgent(null)).toBe(false);
    expect(hasUrgent("")).toBe(false);
    expect(hasUrgent("   ")).toBe(false);
  });
  it("is true for real content", () => {
    expect(hasUrgent("Need approval")).toBe(true);
  });
});
