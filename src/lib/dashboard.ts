import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { env } from "./env";
import { VA_ROLES } from "./session";
import { commentInclude, toCommentDTO, type CommentDTO } from "./comments";
import {
  classifyPunctuality,
  formatEtTime,
  formatEtDateLong,
  storageDateToEtDateString,
  etDateStringToStorageDate,
  hasUrgent,
  type PunctualityChip,
} from "./time";

export type SortKey =
  | "date_desc"
  | "date_asc"
  | "va"
  | "hours_desc"
  | "urgent_first";

export interface DashboardFilters {
  vaId?: string; // specific VA, or undefined = all
  from?: string; // ET date string (inclusive)
  to?: string; // ET date string (inclusive)
  urgentOnly?: boolean;
  sort: SortKey;
}

export interface DashboardEntry {
  id: string;
  vaId: string;
  vaName: string;
  workDate: string;
  workDateLabel: string;
  status: "OPEN" | "CLOSED" | "INCOMPLETE";
  entryType: "WORK" | "PTO";
  timeInLabel: string | null;
  timeOutLabel: string | null;
  hoursWorked: number | null;
  startOfDayTasks: string;
  endOfDayTasks: string | null;
  urgentNeed: string | null;
  hasUrgent: boolean;
  chips: PunctualityChip[];
  comments: CommentDTO[];
}

export interface DashboardData {
  vas: { id: string; name: string }[];
  entries: DashboardEntry[];
  stats: {
    total: number;
    urgentCount: number;
    incompleteCount: number;
    totalHours: number;
  };
  filters: DashboardFilters;
}

/** Parse raw searchParams into a validated filter object. */
export function parseFilters(
  sp: Record<string, string | string[] | undefined>,
): DashboardFilters {
  const get = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const isDate = (s: string | undefined): s is string =>
    !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

  const sortRaw = get("sort");
  const sort: SortKey =
    sortRaw === "date_asc" ||
    sortRaw === "va" ||
    sortRaw === "hours_desc" ||
    sortRaw === "urgent_first"
      ? sortRaw
      : "date_desc";

  return {
    vaId: get("vaId") || undefined,
    from: isDate(get("from")) ? get("from") : undefined,
    to: isDate(get("to")) ? get("to") : undefined,
    urgentOnly: get("urgent") === "1",
    sort,
  };
}

export async function getDashboardData(
  filters: DashboardFilters,
): Promise<DashboardData> {
  const grace = env.benchmarkGraceMinutes;

  // Org-wide: every team member who has a VA dashboard.
  const vas = await prisma.user.findMany({
    where: { role: { in: VA_ROLES } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const vaIds = new Set(vas.map((v) => v.id));

  const where: Prisma.TimeEntryWhereInput = {
    va: { role: { in: VA_ROLES } },
  };
  // Only honor a vaId filter if it's actually one of this client's VAs.
  if (filters.vaId && vaIds.has(filters.vaId)) {
    where.vaId = filters.vaId;
  }
  if (filters.from || filters.to) {
    where.workDate = {};
    if (filters.from)
      where.workDate.gte = etDateStringToStorageDate(filters.from);
    if (filters.to) where.workDate.lte = etDateStringToStorageDate(filters.to);
  }
  if (filters.urgentOnly) {
    where.AND = [{ urgentNeed: { not: null } }, { urgentNeed: { not: "" } }];
  }

  const rows = await prisma.timeEntry.findMany({
    where,
    include: { va: { select: { id: true, name: true } }, ...commentInclude },
  });

  const entries: DashboardEntry[] = rows.map((r) => {
    const workDate = storageDateToEtDateString(r.workDate);
    return {
      id: r.id,
      vaId: r.vaId,
      vaName: r.va.name,
      workDate,
      workDateLabel: formatEtDateLong(workDate),
      status: r.status as DashboardEntry["status"],
      entryType: r.entryType as DashboardEntry["entryType"],
      timeInLabel: r.timeIn ? formatEtTime(r.timeIn) : null,
      timeOutLabel: r.timeOut ? formatEtTime(r.timeOut) : null,
      hoursWorked: r.hoursWorked != null ? Number(r.hoursWorked) : null,
      startOfDayTasks: r.startOfDayTasks,
      endOfDayTasks: r.endOfDayTasks,
      urgentNeed: r.urgentNeed,
      hasUrgent: hasUrgent(r.urgentNeed),
      chips: classifyPunctuality(workDate, r.timeIn, r.timeOut, grace).chips,
      comments: r.comments.map(toCommentDTO),
    };
  });

  sortEntries(entries, filters.sort);

  const stats = {
    total: entries.length,
    urgentCount: entries.filter((e) => e.hasUrgent).length,
    incompleteCount: entries.filter((e) => e.status === "INCOMPLETE").length,
    totalHours:
      Math.round(
        entries.reduce((sum, e) => sum + (e.hoursWorked ?? 0), 0) * 100,
      ) / 100,
  };

  return { vas, entries, stats, filters };
}

function sortEntries(entries: DashboardEntry[], sort: SortKey): void {
  const byDateDesc = (a: DashboardEntry, b: DashboardEntry) =>
    b.workDate.localeCompare(a.workDate) || a.vaName.localeCompare(b.vaName);

  switch (sort) {
    case "date_asc":
      entries.sort(
        (a, b) =>
          a.workDate.localeCompare(b.workDate) ||
          a.vaName.localeCompare(b.vaName),
      );
      break;
    case "va":
      entries.sort(
        (a, b) =>
          a.vaName.localeCompare(b.vaName) ||
          b.workDate.localeCompare(a.workDate),
      );
      break;
    case "hours_desc":
      entries.sort(
        (a, b) => (b.hoursWorked ?? -1) - (a.hoursWorked ?? -1) || byDateDesc(a, b),
      );
      break;
    case "urgent_first":
      entries.sort(
        (a, b) => Number(b.hasUrgent) - Number(a.hasUrgent) || byDateDesc(a, b),
      );
      break;
    case "date_desc":
    default:
      entries.sort(byDateDesc);
      break;
  }
}
