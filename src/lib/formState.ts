import type { ZodError } from "zod";

/** Shared shape returned by form-backed server actions (React useActionState). */
export interface FormState {
  ok?: boolean;
  /** A top-level error message (e.g. invalid credentials). */
  error?: string;
  /** Per-field validation messages keyed by field name. */
  fieldErrors?: Record<string, string>;
}

export const emptyFormState: FormState = {};

/** Flatten a ZodError into the first message per field. */
export function fieldErrorsFromZod(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
