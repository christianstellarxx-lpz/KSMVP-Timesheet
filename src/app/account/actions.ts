"use server";

import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { verifyPassword, hashPassword } from "@/lib/password";
import { changePinSchema } from "@/lib/validation";
import { fieldErrorsFromZod, type FormState } from "@/lib/formState";

export async function changePinAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireUser();

  const parsed = changePinSchema.safeParse({
    currentPin: formData.get("currentPin"),
    newPin: formData.get("newPin"),
    confirmPin: formData.get("confirmPin"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error) };

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return { error: "Your account could not be found." };

  const currentOk = await verifyPassword(parsed.data.currentPin, user.passwordHash);
  if (!currentOk) {
    return { fieldErrors: { currentPin: "Current PIN is incorrect." } };
  }

  const passwordHash = await hashPassword(parsed.data.newPin);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  return { ok: true };
}
