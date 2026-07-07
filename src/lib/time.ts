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

/** The scheduled shift used as the dashboard benchmark and time-in/out presets. */
export const SCHEDULE = {
  timeIn: { hour: 9, minute: 0 }, // 9:00 AM ET
  timeOut: { hour: 17, minute: 0 }, // 5:00 PM ET
} as const;

/** 24h {hour,minute} -> "9:00 AM" style label. */
function to12Hour(hm: { hour: number; minute: number }): string {
  const ampm = hm.hour >= 12 ? "PM" : "AM";
  const hour12 = ((hm.hour + 11) % 12) + 1;
  return `${hour12}:${String(hm.minute).padStart(2, "0")} ${ampm}`;
}

// Display labels derived from SCHEDULE (single source of truth — no hardcoding).
export const SCHEDULE_TIME_IN_LABEL = to12Hour(SCHEDULE.timeIn); // "9:00 AM"
export const SCHEDULE_TIME_OUT_LABEL = to12Hour(SCHEDULE.timeOut); // "5:00 PM"
export const SCHEDULE_SHIFT_LABEL = `${SCHEDULE_TIME_IN_LABEL} – ${SCHEDULE_TIME_OUT_LABEL} ET`;

/** Hours credited for a full PTO / vacation day. */
export const PTO_HOURS = 8;

/** An ET calendar day as an ISO date string, e.g. "2026-07-07". */
export type EtDateString = string;

// ---------------------------------------------------------------------------
// Work date (ET calendar day) <-> storage Date (@db.Date, UTC midnight)
// ---------------------------------------------------------------------------

/** Today's ET calendar day, e.g. "2026-07-07". */
export function etToday(now: Date = new Date()): EtDateString {
  return DateTime.fromJSDate(now).setZone(ET_ZONE).toISODate()!;
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

// ---------------------------------------------------------------------------
// Wall-clock <-> UTC conversion for the editable time inputs
// ---------------------------------------------------------------------------

/**
 * A `<input type="datetime-local">` produces a naive wall-clock string with no
 * timezone, e.g. "2026-07-07T08:45". We always interpret that as ET wall-clock
 * (never the browser's zone) and convert to a UTC instant for storage.
 * Returns null if the string is not a valid datetime.
 */
export function etWallClockToUtc(wallClock: string): Date | null {
  const dt = DateTime.fromISO(wallClock, { zone: ET_ZONE });
  return dt.isValid ? dt.toUTC().toJSDate() : null;
}

/**
 * Produce the wall-clock string (ET) to prefill a datetime-local input for a
 * scheduled preset on a given ET day. e.g. presetWallClock("2026-07-07", 8, 45)
 * -> "2026-07-07T08:45".
 */
export function presetWallClock(
  date: EtDateString,
  hm: { hour: number; minute: number },
): string {
  const dt = DateTime.fromISO(date, { zone: ET_ZONE }).set({
    hour: hm.hour,
    minute: hm.minute,
    second: 0,
    millisecond: 0,
  });
  return dt.toFormat("yyyy-LL-dd'T'HH:mm");
}

/** The wall-clock string (ET) for an existing UTC instant, for editable inputs. */
export function instantToEtWallClock(instant: Date): string {
  return DateTime.fromJSDate(instant)
    .setZone(ET_ZONE)
    .toFormat("yyyy-LL-dd'T'HH:mm");
}

/** The scheduled shift instant (UTC) for a given ET day, e.g. 8:45 AM ET. */
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

/** "Jul 7, 3:24 PM" — a compact ET timestamp for comments. */
export function formatEtDateTime(instant: Date): string {
  return DateTime.fromJSDate(instant).setZone(ET_ZONE).toFormat("LLL d, h:mm a");
}

// ---------------------------------------------------------------------------
// Hours worked — computed server-side, never trusted from the client
// ---------------------------------------------------------------------------

/**
 * Hours between two instants, rounded to the nearest whole hour so a standard
 * 9:00 AM–5:00 PM shift reads as 8. Returns null when inputs are
 * missing or non-positive (invalid range).
 */
export function computeHoursWorked(
  timeIn: Date | null | undefined,
  timeOut: Date | null | undefined,
): number | null {
  if (!timeIn || !timeOut) return null;
  const ms = timeOut.getTime() - timeIn.getTime();
  if (ms <= 0) return null;
  return Math.round(ms / 3_600_000);
}

// ---------------------------------------------------------------------------
// Benchmark / punctuality classification vs the scheduled shift
// ---------------------------------------------------------------------------

export type PunctualityChip = "ON_TIME" | "LATE_IN" | "EARLY_OUT";

export interface Punctuality {
  chips: PunctualityChip[];
  /** minutes after scheduled time-in (positive = late); null if no time-in */
  inDeltaMin: number | null;
  /** minutes before scheduled time-out (positive = left early); null if no time-out */
  outEarlyMin: number | null;
}

/**
 * Compare actual punches against the scheduled 9:00 AM–5:00 PM ET shift for the
 * entry's ET day. A grace window (minutes) makes tiny deltas read as on-time.
 * Presets are a benchmark, not a hard rule.
 */
export function classifyPunctuality(
  workDate: EtDateString,
  timeIn: Date | null | undefined,
  timeOut: Date | null | undefined,
  graceMinutes = 5,
): Punctuality {
  const chips: PunctualityChip[] = [];
  let inDeltaMin: number | null = null;
  let outEarlyMin: number | null = null;

  if (timeIn) {
    const scheduledIn = scheduledInstant(workDate, SCHEDULE.timeIn);
    inDeltaMin = Math.round((timeIn.getTime() - scheduledIn.getTime()) / 60_000);
    if (inDeltaMin > graceMinutes) chips.push("LATE_IN");
  }

  if (timeOut) {
    const scheduledOut = scheduledInstant(workDate, SCHEDULE.timeOut);
    outEarlyMin = Math.round(
      (scheduledOut.getTime() - timeOut.getTime()) / 60_000,
    );
    if (outEarlyMin > graceMinutes) chips.push("EARLY_OUT");
  }

  // Only claim "on time" once both punches exist and neither tripped a flag.
  if (timeIn && timeOut && chips.length === 0) chips.push("ON_TIME");

  return { chips, inDeltaMin, outEarlyMin };
}

/** True when an urgent-need field carries real content (whitespace = none). */
export function hasUrgent(urgentNeed: string | null | undefined): boolean {
  return !!urgentNeed && urgentNeed.trim().length > 0;
}
