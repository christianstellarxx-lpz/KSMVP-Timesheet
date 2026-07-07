"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { addTeamMember } from "@/lib/vas";
import { addComment } from "@/lib/comments";
import { addMemberSchema, commentSchema } from "@/lib/validation";
import { fieldErrorsFromZod, type FormState } from "@/lib/formState";

export async function addMemberAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const parsed = addMemberSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    title: formData.get("title"),
    role: formData.get("role"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error) };

  const result = await addTeamMember(parsed.data);
  if (!result.ok) return { error: result.message };

  revalidatePath("/client/vas");
  revalidatePath("/client");
  return { ok: true };
}

export async function addCommentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdmin();
  const parsed = commentSchema.safeParse({
    entryId: formData.get("entryId"),
    target: formData.get("target"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error) };

  const result = await addComment(session.userId, parsed.data);
  if (!result.ok) return { error: result.message };

  // Refresh the admin dashboard (shows the new comment) and the VA's view.
  revalidatePath("/client");
  revalidatePath("/va");
  return { ok: true };
}
