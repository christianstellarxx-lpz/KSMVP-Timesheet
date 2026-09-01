import "server-only";

/**
 * A small fixed-window rate limiter, in process memory.
 *
 * Scope, stated plainly: this is **per serverless instance**, not global. On
 * Vercel a determined attacker who lands on several warm instances gets several
 * windows. It is here for the reason the brief gives — to blunt someone
 * hammering the submit endpoint, and to make the attempt visible in the logs —
 * not as a hard quota. The real correctness guarantees are elsewhere and do not
 * depend on it: the seed is issued once a day, the score is recomputed
 * server-side, and one-run-per-day is a database constraint.
 *
 * If this ever needs to be global, swap the Map for Redis/Upstash behind the
 * same `check()` signature.
 */

interface Window {
  count: number;
  /** epoch ms when this window resets */
  resetAt: number;
}

const buckets = new Map<string, Window>();

/** Stop the map growing without bound on a long-lived instance. */
const MAX_TRACKED_KEYS = 5000;

export interface RateLimitResult {
  allowed: boolean;
  /** Attempts left in the current window. */
  remaining: number;
  /** Seconds until the window resets — the value for `Retry-After`. */
  retryAfterSeconds: number;
}

/**
 * Count one attempt against `key`. Returns whether it is allowed.
 *
 * Fixed window rather than sliding: cheaper, and the imprecision at a window
 * boundary does not matter for a limiter that is advisory anyway.
 */
export function check(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    if (buckets.size >= MAX_TRACKED_KEYS) sweep(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return {
      allowed: true,
      remaining: limit - 1,
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    };
  }

  existing.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  return {
    allowed: existing.count <= limit,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSeconds,
  };
}

/** Drop expired windows. Called only when the map is at its cap. */
function sweep(now: number): void {
  for (const [key, window] of buckets) {
    if (now >= window.resetAt) buckets.delete(key);
  }
  // Still full of live windows — evict the oldest few rather than grow.
  if (buckets.size >= MAX_TRACKED_KEYS) {
    const oldest = [...buckets.entries()]
      .sort((a, b) => a[1].resetAt - b[1].resetAt)
      .slice(0, Math.ceil(MAX_TRACKED_KEYS / 10));
    for (const [key] of oldest) buckets.delete(key);
  }
}

/** Test seam: forget every tracked window. */
export function reset(): void {
  buckets.clear();
}
