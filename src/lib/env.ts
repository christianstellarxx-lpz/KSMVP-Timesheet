/**
 * Central, lazily-validated access to environment variables.
 * Kept dependency-free so it can be imported from any runtime (node / edge).
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get authSecret() {
    return required("AUTH_SECRET");
  },
  /** Optional. Without it, End-of-Day drafts fall back to the Start-of-Day text. */
  get geminiApiKey(): string | null {
    return process.env.GEMINI_API_KEY?.trim() || null;
  },
  /** Which Gemini model writes the End-of-Day draft. */
  get geminiModel(): string {
    return process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
  },
  /** Optional. Without it (or EMAIL_FROM), feedback emails are skipped. */
  get resendApiKey(): string | null {
    return process.env.RESEND_API_KEY?.trim() || null;
  },
  /** Sender on your verified Resend domain, e.g. "KSMVP Tasks <notifications@yourdomain.com>". */
  get emailFrom(): string | null {
    return process.env.EMAIL_FROM?.trim() || null;
  },
  /** Public address of the app, used for the link in emails. */
  get appUrl(): string {
    return (process.env.APP_URL?.trim() || "https://ksmvp-task.vercel.app").replace(/\/$/, "");
  },
};
