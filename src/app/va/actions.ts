"use server";

import { revalidatePath } from "next/cache";
import { requireVA } from "@/lib/session";
import {
  startDayForVa,
  endDayForVa,
  resolveStaleForVa,
  logPtoForVa,
  updateEntryTextForVa,
  getStartOfDayForDraft,
} from "@/lib/timeEntries";
import { saveWeekPlan } from "@/lib/plans";
import { draftEndOfDay } from "@/lib/gemini";
import { check as rateLimit } from "@/lib/rateLimit";
import { markCommentsReadForVa } from "@/lib/comments";
import { submitGameScore, type SubmitScoreResult } from "@/lib/game";
import { GAMES_ENABLED } from "@/lib/features";
import {
  startDaySchema,
  endDaySchema,
  weekPlanSchema,
  resolveStaleSchema,
  ptoSchema,
  updateTaskSchema,
} from "@/lib/validation";
import { fieldErrorsFromZod, type FormState } from "@/lib/formState";

export async function startDayAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireVA();
  const parsed = startDaySchema.safeParse({
    startOfDayTasks: formData.get("startOfDayTasks"),
    urgentNeed: formData.get("urgentNeed") ?? "",
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error) };

  const result = await startDayForVa(session.userId, parsed.data);
  if (!result.ok) return { error: result.message };

  revalidatePath("/va");
  revalidatePath("/client");
  return { ok: true };
}

/** End of Day — always scheduled to reach admins at 5:00 PM ET ("Sched"). */
export async function endDayAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireVA();
  const parsed = endDaySchema.safeParse({
    endOfDayTasks: formData.get("endOfDayTasks"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error) };

  const result = await endDayForVa(session.userId, parsed.data);
  if (!result.ok) return { error: result.message };

  revalidatePath("/va");
  revalidatePath("/client");
  return { ok: true };
}

/** Save the Mon–Fri weekly planner. Boxes are named `plan-YYYY-MM-DD`. */
export async function saveWeekPlanAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireVA();
  const days = [...formData.entries()]
    .filter(([key]) => key.startsWith("plan-"))
    .map(([key, value]) => ({ date: key.slice(5), tasks: String(value) }));
  const parsed = weekPlanSchema.safeParse(days);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your plan and try again." };
  }

  const result = await saveWeekPlan(session.userId, parsed.data);
  if (!result.ok) return { error: result.message };

  revalidatePath("/va");
  return { ok: true };
}

export type EndOfDayDraft =
  | { ok: true; text: string; ai: boolean }
  | { ok: false; message: string };

/** Generous for a real VA, tight enough that nobody drains the free quota. */
const DRAFTS_PER_DAY = 10;

/**
 * The End-of-Day draft for one of the caller's unfinished days: Gemini's
 * past-tense rewrite of that day's Start of Day, or the Start of Day itself
 * when Gemini is unavailable or the daily draft cap is reached. The text sent
 * to Gemini is read from the database, never taken from the client.
 */
export async function draftEndOfDayAction(entryId: string): Promise<EndOfDayDraft> {
  const session = await requireVA();
  const sod = await getStartOfDayForDraft(session.userId, String(entryId));
  if (sod == null) return { ok: false, message: "That day could not be found." };

  // shortcut: per-instance in-memory cap (see rateLimit.ts); move to a DB count if drafts get abused.
  const limit = rateLimit(`eod-draft:${session.userId}`, DRAFTS_PER_DAY, 86_400_000);
  const draft = limit.allowed ? await draftEndOfDay(sod) : null;
  return { ok: true, text: draft ?? sod, ai: draft != null };
}

/** VA edits their own start-of-day tasks or end-of-day report in place. */
export async function updateEntryTextAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireVA();
  const parsed = updateTaskSchema.safeParse({
    entryId: formData.get("entryId"),
    field: formData.get("field"),
    value: formData.get("value"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error) };

  const result = await updateEntryTextForVa(session.userId, parsed.data);
  if (!result.ok) return { error: result.message };

  // Reflect the edit on the VA's dashboard and the admin's view.
  revalidatePath("/va");
  revalidatePath("/client");
  return { ok: true };
}

export async function resolveStaleAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireVA();
  const parsed = resolveStaleSchema.safeParse({
    entryId: formData.get("entryId"),
    endOfDayTasks: formData.get("endOfDayTasks"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error) };

  const result = await resolveStaleForVa(session.userId, parsed.data);
  if (!result.ok) return { error: result.message };

  revalidatePath("/va");
  revalidatePath("/client");
  return { ok: true };
}

export async function logPtoAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireVA();
  const parsed = ptoSchema.safeParse({
    date: formData.get("date"),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error) };

  const result = await logPtoForVa(session.userId, parsed.data);
  if (!result.ok) return { error: result.message };

  revalidatePath("/va");
  return { ok: true };
}

/**
 * Mark the VA's received comments as read — backs the "Done" button on the
 * admin-feedback box. Scoped to the caller's own comments by
 * `markCommentsReadForVa`.
 *
 * Revalidates so the dismissal is authoritative rather than only local: once
 * these are read, `getVaDayState` no longer returns them and the panel stays
 * gone across refreshes (and in any other tab the VA has open).
 */
export async function acknowledgeCommentsAction(): Promise<void> {
  const session = await requireVA();
  await markCommentsReadForVa(session.userId);
  revalidatePath("/va");
}

/** Record the VA's daily Flappy Bird score (one play per day, after Start of Day). */
export async function submitGameScoreAction(
  score: number,
): Promise<SubmitScoreResult> {
  const session = await requireVA();
  if (!GAMES_ENABLED) return { ok: false, message: "Games are turned off." };
  return submitGameScore(session.userId, score);
}
