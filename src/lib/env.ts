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
};
