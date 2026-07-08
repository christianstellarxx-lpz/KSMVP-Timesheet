"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { dismissNotice } from "@/lib/notices";

/**
 * Dismiss a Sales Desk notice from the current user's dashboard. `dismissNotice`
 * only clears a notice actually addressed to them, so this is safe for any
 * signed-in user (VA or admin recipient).
 */
export async function dismissNoticeAction(formData: FormData): Promise<void> {
  const session = await requireUser();
  const noticeId = String(formData.get("noticeId") ?? "");
  if (!noticeId) return;

  await dismissNotice(noticeId, session.userId);
  revalidatePath("/va");
  revalidatePath("/client");
}
