import { describe, it, expect } from "vitest";
import {
  etWallClockToUtc,
  scheduledInstant,
  presetWallClock,
  instantToEtWallClock,
  formatEtTime,
  etDateStringForInstant,
  etDateStringToStorageDate,
  storageDateToEtDateString,
  computeHoursWorked,
  classifyPunctuality,
  hasUrgent,
  SCHEDULE,
} from "@/lib/time";

// A summer date is in EDT (UTC-4); a winter date is in EST (UTC-5).
const SUMMER = "2026-07-07"; // EDT
const WINTER = "2026-01-07"; // EST

describe("ET wall-clock <-> UTC (DST aware)", () => {
  it("interprets 8:45 AM ET as 12:45 UTC in summer (EDT, -4)", () => {
    const utc = etWallClockToUtc(`${SUMMER}T08:45`);
    expect(utc?.toISOString()).toBe("2026-07-07T12:45:00.000Z");
  });

  it("interprets 8:45 AM ET as 13:45 UTC in winter (EST, -5)", () => {
    const utc = etWallClockToUtc(`${WINTER}T08:45`);
    expect(utc?.toISOString()).toBe("2026-01-07T13:45:00.000Z");
  });

  it("proves the offset switches between summer and winter", () => {
    const summer = etWallClockToUtc(`${SUMMER}T08:45`)!;
    const winter = etWallClockToUtc(`${WINTER}T08:45`)!;
    // Same wall-clock, one hour apart in UTC because the offset changed.
    expect(winter.getUTCHours() - summer.getUTCHours()).toBe(1);
  });

  it("returns null for an invalid wall-clock string", () => {
    expect(etWallClockToUtc("not-a-date")).toBeNull();
  });
});

describe("display always renders in ET regardless of stored UTC", () => {
  it("shows 8:45 AM for the summer UTC instant", () => {
    const utc = new Date("2026-07-07T12:45:00.000Z");
    expect(formatEtTime(utc)).toBe("8:45 AM");
  });

  it("shows 8:45 AM for the winter UTC instant", () => {
    const utc = new Date("2026-01-07T13:45:00.000Z");
    expect(formatEtTime(utc)).toBe("8:45 AM");
  });

  it("round-trips an instant through the editable wall-clock", () => {
    const utc = etWallClockToUtc(`${SUMMER}T14:05`)!;
    expect(instantToEtWallClock(utc)).toBe(`${SUMMER}T14:05`);
  });
});

describe("scheduled shift presets", () => {
  it("preset wall-clock strings match the 9:00 / 5:00 schedule", () => {
    expect(presetWallClock(SUMMER, SCHEDULE.timeIn)).toBe(`${SUMMER}T09:00`);
    expect(presetWallClock(SUMMER, SCHEDULE.timeOut)).toBe(`${SUMMER}T17:00`);
  });

  it("resolves scheduled instants at the correct offset", () => {
    // 9:00 AM ET -> 13:00 UTC in summer (EDT, -4), 14:00 UTC in winter (EST, -5)
    expect(scheduledInstant(SUMMER, SCHEDULE.timeIn).toISOString()).toBe(
      "2026-07-07T13:00:00.000Z",
    );
    expect(scheduledInstant(WINTER, SCHEDULE.timeIn).toISOString()).toBe(
      "2026-01-07T14:00:00.000Z",
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

describe("computeHoursWorked (rounded to whole hours)", () => {
  it("rounds a standard 8h15m shift down to 8", () => {
    const inA = new Date("2026-07-07T12:45:00.000Z");
    const outA = new Date("2026-07-07T21:00:00.000Z"); // 8h15m -> 8
    expect(computeHoursWorked(inA, outA)).toBe(8);
  });

  it("rounds to the nearest whole hour", () => {
    const start = new Date("2026-07-07T12:00:00.000Z");
    // 8h40m -> 9
    expect(computeHoursWorked(start, new Date("2026-07-07T20:40:00.000Z"))).toBe(9);
    // 8h20m -> 8
    expect(computeHoursWorked(start, new Date("2026-07-07T20:20:00.000Z"))).toBe(8);
    // 10 min -> 0
    expect(computeHoursWorked(start, new Date("2026-07-07T12:10:00.000Z"))).toBe(0);
  });

  it("returns null for missing or non-positive ranges", () => {
    expect(computeHoursWorked(null, new Date())).toBeNull();
    const t = new Date("2026-07-07T12:00:00.000Z");
    expect(computeHoursWorked(t, t)).toBeNull();
    expect(
      computeHoursWorked(t, new Date("2026-07-07T11:00:00.000Z")),
    ).toBeNull();
  });

  it("credits a full scheduled shift as 8 hours", () => {
    const timeIn = etWallClockToUtc(`${SUMMER}T09:00`)!;
    const timeOut = etWallClockToUtc(`${SUMMER}T17:00`)!;
    expect(computeHoursWorked(timeIn, timeOut)).toBe(8);
  });
});

describe("classifyPunctuality (benchmark vs schedule)", () => {
  const grace = 5;

  it("marks an on-schedule day as On time", () => {
    const timeIn = etWallClockToUtc(`${SUMMER}T09:00`)!;
    const timeOut = etWallClockToUtc(`${SUMMER}T17:00`)!;
    const p = classifyPunctuality(SUMMER, timeIn, timeOut, grace);
    expect(p.chips).toEqual(["ON_TIME"]);
  });

  it("flags a late arrival", () => {
    const timeIn = etWallClockToUtc(`${SUMMER}T09:20`)!;
    const timeOut = etWallClockToUtc(`${SUMMER}T17:00`)!;
    const p = classifyPunctuality(SUMMER, timeIn, timeOut, grace);
    expect(p.chips).toContain("LATE_IN");
    expect(p.chips).not.toContain("ON_TIME");
    expect(p.inDeltaMin).toBe(20); // 20 min after 9:00
  });

  it("flags an early departure", () => {
    const timeIn = etWallClockToUtc(`${SUMMER}T09:00`)!;
    const timeOut = etWallClockToUtc(`${SUMMER}T15:30`)!;
    const p = classifyPunctuality(SUMMER, timeIn, timeOut, grace);
    expect(p.chips).toContain("EARLY_OUT");
    expect(p.outEarlyMin).toBe(90);
  });

  it("treats deltas within the grace window as on time", () => {
    const timeIn = etWallClockToUtc(`${SUMMER}T09:04`)!; // +4 min, within 5
    const timeOut = etWallClockToUtc(`${SUMMER}T16:56`)!; // -4 min, within 5
    const p = classifyPunctuality(SUMMER, timeIn, timeOut, grace);
    expect(p.chips).toEqual(["ON_TIME"]);
  });

  it("does not claim On time while a session is still open", () => {
    const timeIn = etWallClockToUtc(`${SUMMER}T09:00`)!;
    const p = classifyPunctuality(SUMMER, timeIn, null, grace);
    expect(p.chips).toEqual([]);
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
