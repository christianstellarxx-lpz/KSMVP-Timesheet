import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { commentInclude, toCommentDTO, type CommentDTO } from "./comments";
import {
  SCHEDULE,
  PTO_HOURS,
  etToday,
  etDateStringToStorageDate,
  storageDateToEtDateString,
  etWallClockToUtc,
  presetWallClock,
  instantToEtWallClock,
  scheduledInstant,
  formatEtTime,
  formatEtDateLong,
  computeHoursWorked,
  hasUrgent,
} from "./time";
import type {
  TimeInInput,
  TimeOutInput,
  ResolveStaleInput,
  PtoInput,
} from "./validation";

export type MutationResult =
  | { ok: true }
  | { ok: false; message: string };

/** Serializable view of a time entry for client components. */
export interface EntryDTO {
  id: string;
  workDate: string;
  workDateLabel: string;
  status: "OPEN" | "CLOSED" | "INCOMPLETE";
  entryType: "WORK" | "PTO";
  timeInLabel: string | null;
  timeInWallClock: string | null;
  timeInISO: string | null;
  timeOutLabel: string | null;
  hoursWorked: number | null;
  startOfDayTasks: string;
  endOfDayTasks: string | null;
  urgentNeed: string | null;
  hasUrgent: boolean;
  /** When the End-of-Day report is scheduled to reach the admins (5 PM ET). */
  publishAtLabel: string | null;
  /** True while publishAt is still in the future — held from the admin view. */
  isScheduled: boolean;
}

/** An entry that has admin feedback, surfaced on the VA dashboard. */
export interface FeedbackEntryDTO {
  entryId: string;
  workDate: string;
  workDateLabel: string;
  entryType: "WORK" | "PTO";
  comments: CommentDTO[];
}

export interface VaDayState {
  today: string;
  todayLabel: string;
  /** Today's entry, whatever its status (OPEN active session, or CLOSED summary). */
  todayEntry: EntryDTO | null;
  /** Prior-day sessions flagged INCOMPLETE that still need a time-out. */
  stale: EntryDTO[];
  /** Entries that have admin feedback, most recent first. */
  feedback: FeedbackEntryDTO[];
  /** How many received comments the VA hasn't seen yet (drives the notification). */
  unreadCommentCount: number;
  presets: {
    timeInWallClock: string; // today @ 9:00 AM ET
    timeOutWallClock: string; // today @ 5:00 PM ET
  };
}

function toDTO(entry: {
  id: string;
  workDate: Date;
  status: string;
  entryType: string;
  timeIn: Date | null;
  timeOut: Date | null;
  hoursWorked: unknown;
  startOfDayTasks: string;
  endOfDayTasks: string | null;
  urgentNeed: string | null;
  publishAt: Date | null;
}): EntryDTO {
  const workDate = storageDateToEtDateString(entry.workDate);
  const isScheduled =
    entry.publishAt != null && entry.publishAt.getTime() > Date.now();
  return {
    id: entry.id,
    workDate,
    workDateLabel: formatEtDateLong(workDate),
    status: entry.status as EntryDTO["status"],
    entryType: entry.entryType as EntryDTO["entryType"],
    timeInLabel: entry.timeIn ? formatEtTime(entry.timeIn) : null,
    timeInWallClock: entry.timeIn ? instantToEtWallClock(entry.timeIn) : null,
    timeInISO: entry.timeIn ? entry.timeIn.toISOString() : null,
    timeOutLabel: entry.timeOut ? formatEtTime(entry.timeOut) : null,
    hoursWorked: entry.hoursWorked != null ? Number(entry.hoursWorked) : null,
    startOfDayTasks: entry.startOfDayTasks,
    endOfDayTasks: entry.endOfDayTasks,
    urgentNeed: entry.urgentNeed,
    hasUrgent: hasUrgent(entry.urgentNeed),
    publishAtLabel: entry.publishAt ? formatEtTime(entry.publishAt) : null,
    isScheduled,
  };
}

/**
 * Transient connectivity errors worth retrying — chiefly Neon serverless
 * resuming from autosuspend, which can drop the connection or exceed the
 * transaction's start window (Prisma P2028: "Unable to start a transaction in
 * the given time"). Business-logic throws (duplicate session, etc.) are NOT
 * transient and must propagate on the first try.
 */
function isTransientDbError(e: unknown): boolean {
  const code =
    e instanceof Prisma.PrismaClientKnownRequestError ? e.code : undefined;
  if (code && ["P2028", "P1001", "P1002", "P1008", "P1017"].includes(code)) {
    return true;
  }
  const msg = e instanceof Error ? e.message : String(e);
  return /transaction api error|unable to start a transaction|terminating connection due to administrator command|connection (?:closed|reset|terminated)|econnreset|server has closed the connection/i.test(
    msg,
  );
}

/**
 * Run an interactive transaction with a generous start window (so a Neon cold
 * start doesn't blow the default 2s `maxWait`) and a few automatic retries on
 * transient connectivity errors. The callback must be idempotent — it re-runs
 * on retry — which ours are (they re-check state before writing).
 */
async function withTx<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const options = { maxWait: 8000, timeout: 15000 };
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(fn, options);
    } catch (e) {
      lastError = e;
      if (!isTransientDbError(e)) throw e;
      // Short backoff to let Neon finish resuming before the next attempt.
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw lastError;
}

/**
 * Safeguard: mark any of this VA's OPEN sessions from a *previous* ET day as
 * INCOMPLETE (auto-review needed). Never fabricates a time-out or hours.
 */
export async function flagStaleSessions(vaId: string): Promise<void> {
  const todayStorage = etDateStringToStorageDate(etToday());
  await prisma.timeEntry.updateMany({
    where: { vaId, status: "OPEN", workDate: { lt: todayStorage } },
    data: { status: "INCOMPLETE" },
  });
}

/** Everything the VA "my day" screen needs, after running the stale safeguard. */
export async function getVaDayState(vaId: string): Promise<VaDayState> {
  await flagStaleSessions(vaId);

  const today = etToday();
  const todayStorage = etDateStringToStorageDate(today);

  const [staleRows, todayEntry, commentedRows] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { vaId, status: "INCOMPLETE" },
      orderBy: { workDate: "desc" },
    }),
    prisma.timeEntry.findFirst({ where: { vaId, workDate: todayStorage } }),
    prisma.timeEntry.findMany({
      where: { vaId, comments: { some: {} } },
      include: commentInclude,
      orderBy: { workDate: "desc" },
      take: 20,
    }),
  ]);

  const feedback: FeedbackEntryDTO[] = commentedRows.map((r) => {
    const workDate = storageDateToEtDateString(r.workDate);
    return {
      entryId: r.id,
      workDate,
      workDateLabel: formatEtDateLong(workDate),
      entryType: r.entryType as FeedbackEntryDTO["entryType"],
      comments: r.comments.map(toCommentDTO),
    };
  });

  const unreadCommentCount = feedback.reduce(
    (sum, f) => sum + f.comments.filter((c) => c.unread).length,
    0,
  );

  return {
    today,
    todayLabel: formatEtDateLong(today),
    todayEntry: todayEntry ? toDTO(todayEntry) : null,
    stale: staleRows.map(toDTO),
    feedback,
    unreadCommentCount,
    presets: {
      timeInWallClock: presetWallClock(today, SCHEDULE.timeIn),
      timeOutWallClock: presetWallClock(today, SCHEDULE.timeOut),
    },
  };
}

/** Clock in: creates today's OPEN entry, guarding against duplicates. */
export async function timeInForVa(
  vaId: string,
  input: TimeInInput,
): Promise<MutationResult> {
  const timeIn = etWallClockToUtc(input.timeInWallClock);
  if (!timeIn) return { ok: false, message: "Enter a valid time-in." };

  const today = etToday();
  const workDate = etDateStringToStorageDate(today);

  try {
    await withTx(async (tx) => {
      // Re-run the stale safeguard inside the transaction for consistency.
      await tx.timeEntry.updateMany({
        where: { vaId, status: "OPEN", workDate: { lt: workDate } },
        data: { status: "INCOMPLETE" },
      });

      const existingToday = await tx.timeEntry.findFirst({
        where: { vaId, workDate },
      });
      if (existingToday) {
        throw new Error(
          existingToday.status === "OPEN"
            ? "You already have an open session today. Time out to close it."
            : "You've already logged a session for today.",
        );
      }

      const openElsewhere = await tx.timeEntry.findFirst({
        where: { vaId, status: "OPEN" },
      });
      if (openElsewhere) {
        throw new Error(
          "You have an unresolved open session. Close it before starting a new day.",
        );
      }

      await tx.timeEntry.create({
        data: {
          vaId,
          workDate,
          timeIn,
          startOfDayTasks: input.startOfDayTasks,
          urgentNeed: input.urgentNeed ?? null,
          status: "OPEN",
        },
      });
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: messageFrom(e) };
  }
}

/** Clock out: closes today's OPEN entry and computes hours worked. */
export async function timeOutForVa(
  vaId: string,
  input: TimeOutInput,
): Promise<MutationResult> {
  const timeOut = etWallClockToUtc(input.timeOutWallClock);
  if (!timeOut) return { ok: false, message: "Enter a valid time-out." };

  try {
    await withTx(async (tx) => {
      const active = await tx.timeEntry.findFirst({
        where: { vaId, status: "OPEN" },
      });
      if (!active || !active.timeIn) {
        throw new Error("No open session to close.");
      }
      if (timeOut.getTime() <= active.timeIn.getTime()) {
        throw new Error("Time out must be after time in.");
      }
      // "Atake" scheduler: the End-of-Day report reaches the admins at 5:00 PM ET
      // on the work date. If it's already past 5 PM, publishAt is in the past, so
      // the entry publishes immediately (auto-publish).
      const publishAt = scheduledInstant(
        storageDateToEtDateString(active.workDate),
        SCHEDULE.timeOut,
      );
      await tx.timeEntry.update({
        where: { id: active.id },
        data: {
          timeOut,
          endOfDayTasks: input.endOfDayTasks,
          hoursWorked: computeHoursWorked(active.timeIn, timeOut),
          status: "CLOSED",
          publishAt,
        },
      });
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: messageFrom(e) };
  }
}

/** Resolve a forgotten (INCOMPLETE) session by supplying the real time-out. */
export async function resolveStaleForVa(
  vaId: string,
  input: ResolveStaleInput,
): Promise<MutationResult> {
  const timeOut = etWallClockToUtc(input.timeOutWallClock);
  if (!timeOut) return { ok: false, message: "Enter a valid time-out." };

  try {
    await withTx(async (tx) => {
      const entry = await tx.timeEntry.findFirst({
        where: {
          id: input.entryId,
          vaId,
          status: { in: ["INCOMPLETE", "OPEN"] },
        },
      });
      if (!entry || !entry.timeIn) {
        throw new Error("That session could not be found.");
      }
      if (timeOut.getTime() <= entry.timeIn.getTime()) {
        throw new Error("Time out must be after time in.");
      }
      await tx.timeEntry.update({
        where: { id: entry.id },
        data: {
          timeOut,
          endOfDayTasks: input.endOfDayTasks,
          hoursWorked: computeHoursWorked(entry.timeIn, timeOut),
          status: "CLOSED",
        },
      });
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: messageFrom(e) };
  }
}

/** Log a PTO / vacation day (credited a full 8 hours, no clock times). */
export async function logPtoForVa(
  vaId: string,
  input: PtoInput,
): Promise<MutationResult> {
  const workDate = etDateStringToStorageDate(input.date);

  try {
    await withTx(async (tx) => {
      const existing = await tx.timeEntry.findFirst({
        where: { vaId, workDate },
      });
      if (existing) {
        throw new Error(
          "You already have an entry for that day. Remove it before logging PTO.",
        );
      }
      await tx.timeEntry.create({
        data: {
          vaId,
          workDate,
          entryType: "PTO",
          status: "CLOSED",
          hoursWorked: PTO_HOURS,
          startOfDayTasks: input.note ?? "Paid time off / Vacation",
          timeIn: null,
          timeOut: null,
        },
      });
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: messageFrom(e) };
  }
}

function messageFrom(e: unknown): string {
  // Never surface raw DB/connectivity errors (e.g. Neon resuming) to the user.
  if (isTransientDbError(e)) {
    return "The server was waking up and didn’t respond in time. Please try again in a moment.";
  }
  return e instanceof Error && e.message
    ? e.message
    : "Something went wrong. Please try again.";
}
