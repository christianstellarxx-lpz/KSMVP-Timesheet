import type { InputLog } from "./trapShiftCore";

/**
 * Review signals for a verified run. They only ever FLAG a run for a human to
 * look at — they never block it or change its score, because they are guesses.
 */

/**
 * Solver output holds every input for a whole number of decision ticks, so
 * nearly every run length is a multiple of the tick (6 frames in the recorded
 * solver runs). A human at 60 Hz lands on a multiple of 6 about one time in six.
 */
export function looksScripted(log: InputLog): boolean {
  if (log.length < 20) return false;
  const even = log.filter(([, n]) => n % 6 === 0).length;
  return even / log.length > 0.9;
}
