import { DateTime } from "luxon";

/**
 * All scheduling, presets, and display are anchored to America/New_York ("ET").
 * ET is EST or EDT depending on the date — Luxon resolves the correct offset,
 * including daylight-saving transitions. Never hardcode a fixed UTC offset.
 *
 * Storage rule: every instant lives in the database as UTC.
 * Display rule: every instant is rendered in ET regardless of the viewer's
 * machine timezone, so all users see identical times.
 */
export const ET_ZONE = "America/New_York" as const;

/**
 * When a scheduled End-of-Day report becomes visible to admins (5:00 PM ET on
 * the work date). The app no longer tracks clock times or hours — this is the
 * only fixed time of day left in it.
 */
export const EOD_PUBLISH_TIME = { hour: 17, minute: 0 } as const;

/** 24h {hour,minute} -> "9:00 AM" style label. */
function to12Hour(hm: { hour: number; minute: number }): string {
  const ampm = hm.hour >= 12 ? "PM" : "AM";
  const hour12 = ((hm.hour + 11) % 12) + 1;
  return `${hour12}:${String(hm.minute).padStart(2, "0")} ${ampm}`;
}

/** "5:00 PM" — derived from EOD_PUBLISH_TIME, never hardcoded in the UI. */
export const EOD_PUBLISH_LABEL = to12Hour(EOD_PUBLISH_TIME);

/** An ET calendar day as an ISO date string, e.g. "2026-07-07". */
export type EtDateString = string;

// ---------------------------------------------------------------------------
// Work date (ET calendar day) <-> storage Date (@db.Date, UTC midnight)
// ---------------------------------------------------------------------------

/** Today's ET calendar day, e.g. "2026-07-07". */
export function etToday(now: Date = new Date()): EtDateString {
  return DateTime.fromJSDate(now).setZone(ET_ZONE).toISODate()!;
}

/** The ET calendar day `days` before today (0 = today, 1 = yesterday). */
export function etDaysAgo(days: number, now: Date = new Date()): EtDateString {
  return DateTime.fromJSDate(now).setZone(ET_ZONE).minus({ days }).toISODate()!;
}

/** The ET calendar day that a UTC instant falls on. */
export function etDateStringForInstant(instant: Date): EtDateString {
  return DateTime.fromJSDate(instant).setZone(ET_ZONE).toISODate()!;
}

/**
 * Convert an ET date string to the Date value Prisma stores in a `@db.Date`
 * column. `@db.Date` is timezone-agnostic, so we anchor it at UTC midnight to
 * keep the calendar day stable in and out of the database.
 */
export function etDateStringToStorageDate(date: EtDateString): Date {
  return DateTime.fromISO(date, { zone: "utc" }).startOf("day").toJSDate();
}

/** Read a `@db.Date` value (UTC-midnight Date) back to an ET date string. */
export function storageDateToEtDateString(date: Date): EtDateString {
  return DateTime.fromJSDate(date, { zone: "utc" }).toISODate()!;
}

/** The UTC instant of a wall-clock time on a given ET day, e.g. 5:00 PM ET. */
export function scheduledInstant(
  date: EtDateString,
  hm: { hour: number; minute: number },
): Date {
  return DateTime.fromISO(date, { zone: ET_ZONE })
    .set({ hour: hm.hour, minute: hm.minute, second: 0, millisecond: 0 })
    .toUTC()
    .toJSDate();
}

// ---------------------------------------------------------------------------
// Display formatting (always ET)
// ---------------------------------------------------------------------------

/** "8:45 AM" */
export function formatEtTime(instant: Date): string {
  return DateTime.fromJSDate(instant).setZone(ET_ZONE).toFormat("h:mm a");
}

/** "8:45 AM EDT" (with the resolved zone abbreviation) */
export function formatEtTimeWithZone(instant: Date): string {
  return DateTime.fromJSDate(instant).setZone(ET_ZONE).toFormat("h:mm a ZZZZ");
}

/** "Mon, Jul 7, 2026" from an ET date string. */
export function formatEtDateLong(date: EtDateString): string {
  return DateTime.fromISO(date, { zone: ET_ZONE }).toFormat("ccc, LLL d, yyyy");
}

/** "Jul 7" — a compact ET date, e.g. for the shareable game result. */
export function formatEtDateShort(date: EtDateString): string {
  return DateTime.fromISO(date, { zone: ET_ZONE }).toFormat("LLL d");
}

/** "Jul 7, 3:24 PM" — a compact ET timestamp for comments. */
export function formatEtDateTime(instant: Date): string {
  return DateTime.fromJSDate(instant).setZone(ET_ZONE).toFormat("LLL d, h:mm a");
}

// ---------------------------------------------------------------------------
// Weekly planner
// ---------------------------------------------------------------------------

/**
 * The Mon–Fri ET dates the weekly planner covers. On a weekday that is the
 * current week; on Saturday/Sunday it is the coming week, so a VA planning on
 * the weekend lands on the right Monday.
 */
export function etPlanWeek(now: Date = new Date()): EtDateString[] {
  const today = DateTime.fromJSDate(now).setZone(ET_ZONE).startOf("day");
  const monday =
    today.weekday >= 6
      ? today.plus({ days: 8 - today.weekday })
      : today.minus({ days: today.weekday - 1 });
  return [0, 1, 2, 3, 4].map((d) => monday.plus({ days: d }).toISODate()!);
}

/** True when an urgent-need field carries real content (whitespace = none). */
export function hasUrgent(urgentNeed: string | null | undefined): boolean {
  return !!urgentNeed && urgentNeed.trim().length > 0;
}
