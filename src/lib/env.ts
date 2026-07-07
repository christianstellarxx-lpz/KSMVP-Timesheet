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
  /** Grace window (minutes) for the on-time / late benchmark chips. */
  get benchmarkGraceMinutes() {
    const raw = process.env.BENCHMARK_GRACE_MINUTES;
    const n = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n >= 0 ? n : 5;
  },
};
