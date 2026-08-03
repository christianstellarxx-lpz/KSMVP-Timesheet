import "server-only";
import answers from "./answers.json";
import allowed from "./allowed.json";
import { ANSWER_SHUFFLE_SEED, seededShuffle } from "./logic";

/**
 * The word lists, loaded server-side only.
 *
 * `server-only` is the guard that matters here: importing this module from a
 * client component is a build error, so `answers.json` can never end up in a
 * public bundle where someone could read tomorrow's word out of page source.
 * Guess validation runs on the server too, so `allowed.json` stays here as well
 * (it also keeps ~1,800 words out of every page load).
 */

/** Curated answers, in the *play* order the daily sequence indexes into. */
export const ANSWER_PLAY_ORDER: readonly string[] = seededShuffle(
  answers as string[],
  ANSWER_SHUFFLE_SEED,
);

/**
 * Every word a VA is allowed to guess. Answers are unioned in defensively so a
 * curated answer can never be rejected as "not in the word list" if someone
 * trims `allowed.json`.
 */
const ALLOWED = new Set<string>([
  ...(allowed as string[]),
  ...(answers as string[]),
]);

export function isAllowedGuess(word: string): boolean {
  return ALLOWED.has(word.toLowerCase());
}

export const ALLOWED_COUNT = ALLOWED.size;
export const ANSWER_COUNT = ANSWER_PLAY_ORDER.length;
