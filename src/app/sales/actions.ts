"use server";

import { revalidatePath } from "next/cache";
import { requireSalesProducer } from "@/lib/session";
import { createSalesNotice } from "@/lib/notices";
import { salesNoticeSchema } from "@/lib/validation";
import { fieldErrorsFromZod, type FormState } from "@/lib/formState";

/** Sales Producer posts a notice to a team channel; it lands on their dashboards. */
export async function sendSalesNoticeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSalesProducer();
  const parsed = salesNoticeSchema.safeParse({
    channel: formData.get("channel"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error) };

  await createSalesNotice({
    channel: parsed.data.channel,
    body: parsed.data.body,
    senderId: session.userId,
  });

  // Surface the new notice on recipients' dashboards.
  revalidatePath("/va");
  revalidatePath("/client");
  return { ok: true };
}
