import { DateTime } from "luxon";
import { ET_ZONE, type EtDateString } from "@/lib/time";

/**
 * ET calendar-month helpers. Leaderboards are monthly, so every rotating game
 * and the registry that maps a month to its game need these.
 *
 * They used to live in `src/lib/word/logic.ts`, which meant the *active*
 * leaderboard harness imported them out of a game module that has since been
 * archived. They are game-agnostic, so they live here now; `word/logic.ts`
 * re-exports them unchanged so existing imports and tests keep working.
 */

/** "2026-08" — an ET calendar month. */
export type MonthKey = string;

export function monthKeyForDate(date: EtDateString): MonthKey {
  return date.slice(0, 7);
}

export function etCurrentMonthKey(now: Date = new Date()): MonthKey {
  return DateTime.fromJSDate(now).setZone(ET_ZONE).toFormat("yyyy-LL");
}

/** The calendar month before `monthKey`, e.g. "2026-08" -> "2026-07". */
export function previousMonthKey(monthKey: MonthKey): MonthKey {
  return DateTime.fromISO(`${monthKey}-01`, { zone: "utc" })
    .minus({ months: 1 })
    .toFormat("yyyy-LL");
}

/** First and last ET calendar day of a month, as date strings. */
export function monthBounds(monthKey: MonthKey): {
  start: EtDateString;
  end: EtDateString;
} {
  const start = DateTime.fromISO(`${monthKey}-01`, { zone: "utc" }).startOf("day");
  return {
    start: start.toISODate()!,
    end: start.endOf("month").toISODate()!,
  };
}

/** "July 2026" — the label the Reigning Champion box shows. */
export function monthLabel(monthKey: MonthKey): string {
  return DateTime.fromISO(`${monthKey}-01`, { zone: "utc" }).toFormat("LLLL yyyy");
}

/** Is `monthKey` a well-formed "YYYY-MM"? Used to validate a query param. */
export function isMonthKey(value: unknown): value is MonthKey {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
