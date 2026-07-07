import { z } from "zod";

/**
 * Zod schemas shared by client forms and server actions.
 * Note on XSS: task/urgent text is stored verbatim and only ever rendered as
 * React text children (auto-escaped) — never via dangerouslySetInnerHTML — so
 * no HTML sanitization is required. We trim to normalize whitespace.
 */

// datetime-local values are "YYYY-MM-DDTHH:mm" (some browsers append ":ss").
const wallClock = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/,
    "Enter a valid date and time.",
  );

const requiredText = (label: string, max = 5000) =>
  z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, `${label} is required.`).max(max));

// Empty / whitespace-only input normalizes to undefined (stored as null).
const optionalText = (max = 5000) =>
  z
    .string()
    .max(max)
    .transform((s) => {
      const t = s.trim();
      return t.length > 0 ? t : undefined;
    });

/** The PIN every account starts with; changeable in Account settings. */
export const DEFAULT_PIN = "0000";

const pin = z.string().regex(/^\d{4}$/, "Enter your 4-digit PIN.");

export const quickLoginSchema = z.object({
  userId: z.string().min(1),
  pin,
});
export type QuickLoginInput = z.infer<typeof quickLoginSchema>;

export const timeInSchema = z.object({
  timeInWallClock: wallClock,
  startOfDayTasks: requiredText("Start-of-day tasks"),
  urgentNeed: optionalText(),
});
export type TimeInInput = z.infer<typeof timeInSchema>;

export const timeOutSchema = z.object({
  timeOutWallClock: wallClock,
  endOfDayTasks: requiredText("End of Day Report"),
});
export type TimeOutInput = z.infer<typeof timeOutSchema>;

export const resolveStaleSchema = z.object({
  entryId: z.string().min(1),
  timeOutWallClock: wallClock,
  endOfDayTasks: requiredText("End of Day Report"),
});
export type ResolveStaleInput = z.infer<typeof resolveStaleSchema>;

export const ptoSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date."),
  note: optionalText(500),
});
export type PtoInput = z.infer<typeof ptoSchema>;

export const changePinSchema = z
  .object({
    currentPin: pin,
    newPin: pin,
    confirmPin: z.string().min(1, "Confirm your new PIN."),
  })
  .refine((d) => d.newPin === d.confirmPin, {
    path: ["confirmPin"],
    message: "PINs do not match.",
  })
  .refine((d) => d.newPin !== d.currentPin, {
    path: ["newPin"],
    message: "New PIN must be different from your current one.",
  });
export type ChangePinInput = z.infer<typeof changePinSchema>;

/** Which part of an entry an admin comment is about. */
export const commentSchema = z.object({
  entryId: z.string().min(1),
  target: z.enum(["START", "END", "GENERAL"]),
  body: requiredText("Comment", 2000),
});
export type CommentInput = z.infer<typeof commentSchema>;

export const addMemberSchema = z.object({
  name: requiredText("Name", 120),
  email: z.string().trim().min(1, "Email is required.").email("Enter a valid email."),
  title: requiredText("Title", 120),
  role: z.enum(["ADMIN", "VA_ADMIN", "VA", "INTERN"]),
});
export type AddMemberInput = z.infer<typeof addMemberSchema>;
