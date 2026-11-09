import { z } from "zod";

/**
 * Zod schemas shared by client forms and server actions.
 * Note on XSS: task/urgent text is stored verbatim and only ever rendered as
 * React text children (auto-escaped) — never via dangerouslySetInnerHTML — so
 * no HTML sanitization is required. We trim to normalize whitespace.
 */

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

/** Start of Day: what the VA plans to do today (prefilled from the week plan). */
export const startDaySchema = z.object({
  startOfDayTasks: requiredText("Start-of-day tasks"),
  urgentNeed: optionalText(),
});
export type StartDayInput = z.infer<typeof startDaySchema>;

/** End of Day: what the VA actually did (prefilled from the Gemini draft). */
export const endDaySchema = z.object({
  endOfDayTasks: requiredText("End of Day Report"),
});
export type EndDayInput = z.infer<typeof endDaySchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.");

/**
 * The Mon–Fri weekly plan. Every day is optional — an empty box clears that
 * day's plan. Which dates are actually editable is checked server-side
 * (src/lib/plans.ts), not here.
 */
export const weekPlanSchema = z
  .array(z.object({ date: isoDate, tasks: optionalText() }))
  .max(5);
export type WeekPlanInput = z.infer<typeof weekPlanSchema>;

/** VA editing their own start-of-day tasks or end-of-day report in place. */
export const updateTaskSchema = z.object({
  entryId: z.string().min(1),
  field: z.enum(["START", "END"]),
  value: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "This can’t be empty.").max(5000)),
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const resolveStaleSchema = z.object({
  entryId: z.string().min(1),
  endOfDayTasks: requiredText("End of Day Report"),
});
export type ResolveStaleInput = z.infer<typeof resolveStaleSchema>;

export const ptoSchema = z.object({
  date: isoDate,
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

/** A Sales Desk notice posted to a fixed team channel. */
export const salesNoticeSchema = z.object({
  channel: z.enum(["TECH_SUPPORT", "ADMIN_INQUIRY"]),
  body: requiredText("Message", 2000),
});
export type SalesNoticeInput = z.infer<typeof salesNoticeSchema>;

/**
 * One Daily Word Guess submission. Shape only — membership in the allowed word
 * list is checked server-side (src/lib/word/lists.ts), since that list never
 * ships to the client.
 */
export const wordGuessSchema = z.object({
  guess: z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .pipe(z.string().regex(/^[a-z]{5}$/, "Enter a 5-letter word.")),
});
export type WordGuessInput = z.infer<typeof wordGuessSchema>;

/**
 * One Stretch Goal replay submission.
 *
 * Note what is NOT in this schema: a score. The endpoint does not accept one,
 * so there is no field for a client to lie in — the server replays `holds`
 * against the seed it issued and computes the score itself. `seed` is accepted
 * only so a stale tab can be detected; the replay always runs on the stored
 * seed. Deeper structural checks (ordering, overlap, caps) live in
 * `simulateRun`, which is the same code the verifier runs.
 */
export const stretchRunSchema = z.object({
  seed: z.number().int().min(0).max(0xffffffff),
  holds: z
    .array(
      z.object({
        press: z.number().int().min(1),
        release: z.number().int().min(1),
      }),
    )
    .max(4000, "That replay is too long."),
});
export type StretchRunInput = z.infer<typeof stretchRunSchema>;

/**
 * Trap Shift score submission: `{ runId, log }` and nothing else — any other
 * field (a score, seed, routes, attempt number, date) is stripped, never read.
 * `validateLog` in the core re-checks the log, including the 15-minute cap.
 */
export const trapScoreSchema = z.object({
  runId: z.string().min(1).max(64),
  log: z
    .array(z.tuple([z.number().int().min(0).max(7), z.number().int().min(1)]))
    .min(1)
    .max(60_000, "That replay is too long."),
});
export type TrapScoreInput = z.infer<typeof trapScoreSchema>;

export const addMemberSchema = z.object({
  name: requiredText("Name", 120),
  email: z.string().trim().min(1, "Email is required.").email("Enter a valid email."),
  title: requiredText("Title", 120),
  role: z.enum(["ADMIN", "VA_ADMIN", "VA", "INTERN"]),
});
export type AddMemberInput = z.infer<typeof addMemberSchema>;
