import "server-only";
import { prisma } from "./prisma";
import { VA_ROLES } from "./session";
import {
  etToday,
  etDateStringToStorageDate,
  formatEtDateLong,
  formatEtTime,
} from "./time";

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
  /** True once everyone who started has clocked out (nobody still in / incomplete). */
  ready: boolean;
  adminEmails: string[];
  subject: string;
  summaryText: string;
  mailto: string;
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
  const ready = counts.in === 0 && counts.incomplete === 0 && counts.out > 0;

  const adminEmails = admins.map((a) => a.email);
  const subject = `VA Daily Time Report — ${dateLabel}`;
  const summaryText = buildSummary(dateLabel, rows, reporterName);
  const mailto = `mailto:${encodeURIComponent(adminEmails.join(","))}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(summaryText)}`;

  return {
    date: today,
    dateLabel,
    rows,
    counts,
    ready,
    adminEmails,
    subject,
    summaryText,
    mailto,
  };
}

function buildSummary(
  dateLabel: string,
  rows: RollRow[],
  reporterName: string,
): string {
  const lines: string[] = [`VA Daily Time Report — ${dateLabel}`, ""];
  const group = (state: RollState) => rows.filter((r) => r.state === state);

  const out = group("OUT");
  if (out.length) {
    lines.push(`Clocked out (${out.length}):`);
    out.forEach((r) =>
      lines.push(
        `  - ${r.name}: ${r.timeInLabel} – ${r.timeOutLabel} ET (${r.hoursWorked ?? 0}h)`,
      ),
    );
    lines.push("");
  }

  const inn = group("IN");
  if (inn.length) {
    lines.push(`Still clocked in (${inn.length}):`);
    inn.forEach((r) => lines.push(`  - ${r.name}: in at ${r.timeInLabel} ET`));
    lines.push("");
  }

  const pto = group("PTO");
  if (pto.length) {
    lines.push(`PTO / Vacation (${pto.length}):`);
    pto.forEach((r) => lines.push(`  - ${r.name}`));
    lines.push("");
  }

  const inc = group("INCOMPLETE");
  if (inc.length) {
    lines.push(`Needs review — clocked in, no clock-out (${inc.length}):`);
    inc.forEach((r) => lines.push(`  - ${r.name}: in at ${r.timeInLabel} ET`));
    lines.push("");
  }

  const none = group("NONE");
  if (none.length) {
    lines.push(`Not started (${none.length}):`);
    none.forEach((r) => lines.push(`  - ${r.name}`));
    lines.push("");
  }

  lines.push(`Prepared by ${reporterName} · KSMVP VA Tasks`);
  return lines.join("\n");
}
