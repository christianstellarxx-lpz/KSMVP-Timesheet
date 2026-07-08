"use server";

import { revalidatePath } from "next/cache";
import { requireVA } from "@/lib/session";
import {
  timeInForVa,
  timeOutForVa,
  resolveStaleForVa,
  logPtoForVa,
} from "@/lib/timeEntries";
import { markCommentsReadForVa } from "@/lib/comments";
import { submitGameScore, type SubmitScoreResult } from "@/lib/game";
import {
  timeInSchema,
  timeOutSchema,
  resolveStaleSchema,
  ptoSchema,
} from "@/lib/validation";
import { fieldErrorsFromZod, type FormState } from "@/lib/formState";

export async function timeInAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireVA();
  const parsed = timeInSchema.safeParse({
    timeInWallClock: formData.get("timeInWallClock"),
    startOfDayTasks: formData.get("startOfDayTasks"),
    urgentNeed: formData.get("urgentNeed") ?? "",
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error) };

  const result = await timeInForVa(session.userId, parsed.data);
  if (!result.ok) return { error: result.message };

  revalidatePath("/va");
  return { ok: true };
}

export async function timeOutAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireVA();
  const parsed = timeOutSchema.safeParse({
    timeOutWallClock: formData.get("timeOutWallClock"),
    endOfDayTasks: formData.get("endOfDayTasks"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error) };

  const result = await timeOutForVa(session.userId, parsed.data);
  if (!result.ok) return { error: result.message };

  revalidatePath("/va");
  return { ok: true };
}

export async function resolveStaleAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireVA();
  const parsed = resolveStaleSchema.safeParse({
    entryId: formData.get("entryId"),
    timeOutWallClock: formData.get("timeOutWallClock"),
    endOfDayTasks: formData.get("endOfDayTasks"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error) };

  const result = await resolveStaleForVa(session.userId, parsed.data);
  if (!result.ok) return { error: result.message };

  revalidatePath("/va");
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
 * Mark the VA's received comments as read. Called from the dashboard once the
 * feedback has been shown, so the "new comment" notification clears on their
 * next visit. Intentionally does NOT revalidate — the current view keeps its
 * "New" highlighting for this visit.
 */
export async function acknowledgeCommentsAction(): Promise<void> {
  const session = await requireVA();
  await markCommentsReadForVa(session.userId);
}

/** Record the VA's daily Flappy Bird score (one play per day, after clock-in). */
export async function submitGameScoreAction(
  score: number,
): Promise<SubmitScoreResult> {
  const session = await requireVA();
  return submitGameScore(session.userId, score);
}
