import "server-only";
import { prisma } from "./prisma";
import { VA_ROLES } from "./session";
import {
  etToday,
  etDateStringToStorageDate,
  formatEtDateLong,
  formatEtTime,
} from "./time";

/** Public URL of the app, included in the daily email so admins can open it. */
const APP_LOGIN_URL = "https://ksmvp-task.vercel.app/login";

export type RollState = "OUT" | "IN" | "PTO" | "INCOMPLETE" | "NONE";

export interface RollRow {
  id: string;
  name: string;
  title: string;
  state: RollState;
  timeInLabel: string | null;
  timeOutLabel: string | null;
  hoursWorked: number | null;
}

export interface RollEmail {
  subject: string;
  body: string;
  /** Opens Gmail's compose window (new tab) pre-filled with this report. */
  gmailUrl: string;
}

export interface RollCallData {
  date: string;
  dateLabel: string;
  rows: RollRow[];
  counts: {
    total: number;
    out: number;
    in: number;
    pto: number;
    incomplete: number;
    none: number;
  };
  /** Everyone who's working has clocked in — the Start-of-Day report is ready. */
  startReady: boolean;
  /** Everyone who started has clocked out — the End-of-Day report is ready. */
  endReady: boolean;
  adminEmails: string[];
  /** Pre-composed Start-of-Day and End-of-Day emails (Gmail compose links). */
  start: RollEmail;
  end: RollEmail;
}

/**
 * Today's clock-in / clock-out status for every VA, plus a pre-composed email
 * summary + mailto link addressed to the admins. Powers the daily reporter's
 * unique dashboard panel.
 */
export async function getTodayRollCall(
  reporterName: string,
): Promise<RollCallData> {
  const today = etToday();
  const dateLabel = formatEtDateLong(today);
  const workDate = etDateStringToStorageDate(today);

  const [vas, admins, entries] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: VA_ROLES } },
      select: { id: true, name: true, title: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { email: true },
      orderBy: { name: "asc" },
    }),
    prisma.timeEntry.findMany({
      where: { workDate, va: { role: { in: VA_ROLES } } },
    }),
  ]);

  const byVa = new Map(entries.map((e) => [e.vaId, e]));

  const rows: RollRow[] = vas.map((v) => {
    const e = byVa.get(v.id);
    let state: RollState = "NONE";
    if (e) {
      if (e.entryType === "PTO") state = "PTO";
      else if (e.status === "OPEN") state = "IN";
      else if (e.status === "INCOMPLETE") state = "INCOMPLETE";
      else if (e.status === "CLOSED") state = "OUT";
    }
    return {
      id: v.id,
      name: v.name,
      title: v.title,
      state,
      timeInLabel: e?.timeIn ? formatEtTime(e.timeIn) : null,
      timeOutLabel: e?.timeOut ? formatEtTime(e.timeOut) : null,
      hoursWorked: e?.hoursWorked != null ? Number(e.hoursWorked) : null,
    };
  });

  const counts = {
    total: rows.length,
    out: rows.filter((r) => r.state === "OUT").length,
    in: rows.filter((r) => r.state === "IN").length,
    pto: rows.filter((r) => r.state === "PTO").length,
    incomplete: rows.filter((r) => r.state === "INCOMPLETE").length,
    none: rows.filter((r) => r.state === "NONE").length,
  };
  // Start-of-Day: everyone who's working has a time-in (nobody "not started").
  const startReady =
    counts.none === 0 && counts.in + counts.out + counts.incomplete > 0;
  // End-of-Day: everyone who started has clocked out.
  const endReady = counts.in === 0 && counts.incomplete === 0 && counts.out > 0;

  const adminEmails = admins.map((a) => a.email);
  const start = buildEmail(
    `VA Start-of-Day Report — ${dateLabel}`,
    buildNotification("Start-of-Day", dateLabel, reporterName),
    adminEmails,
  );
  const end = buildEmail(
    `VA End-of-Day Report — ${dateLabel}`,
    buildNotification("End-of-Day", dateLabel, reporterName),
    adminEmails,
  );

  return {
    date: today,
    dateLabel,
    rows,
    counts,
    startReady,
    endReady,
    adminEmails,
    start,
    end,
  };
}

/** Build an email payload + a Gmail compose URL that opens pre-filled. */
function buildEmail(subject: string, body: string, to: string[]): RollEmail {
  const params = new URLSearchParams({
    view: "cm", // compose mode
    fs: "1", // full screen
    to: to.join(","),
    su: subject,
    body,
  });
  return {
    subject,
    body,
    gmailUrl: `https://mail.google.com/mail/?${params.toString()}`,
  };
}

/**
 * A short notification email — no names or per-person details. Just says the
 * report is ready and links to the app to view it.
 */
function buildNotification(
  kind: "Start-of-Day" | "End-of-Day",
  dateLabel: string,
  reporterName: string,
): string {
  return [
    "Hi team,",
    "",
    `The ${kind} report for ${dateLabel} is ready.`,
    "",
    `Click the link to view it: ${APP_LOGIN_URL}`,
    "",
    `Prepared by ${reporterName} · KSMVP VA Tasks`,
  ].join("\n");
}
