"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import {
  createSession,
  destroySession,
  homePathForRole,
  type Role,
} from "@/lib/session";
import { quickLoginSchema } from "@/lib/validation";
import { fieldErrorsFromZod, type FormState } from "@/lib/formState";

export async function quickLoginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = quickLoginSchema.safeParse({
    userId: formData.get("userId"),
    pin: formData.get("pin"),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod(parsed.error) };
  }

  const { userId, pin } = parsed.data;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "Account not found." };

  const ok = await verifyPassword(pin, user.passwordHash);
  if (!ok) return { error: "Incorrect PIN. Please try again." };

  const role = user.role as Role;
  await createSession({
    userId: user.id,
    role,
    name: user.name,
    email: user.email,
    title: user.title,
  });

  redirect(homePathForRole(role));
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
