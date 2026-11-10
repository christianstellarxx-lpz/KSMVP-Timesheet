import { MAX_ATTEMPTS_PER_DAY as TRAP_SHIFT_TRIES } from "@/lib/trapshift/trapShiftCore";

/**
 * App-wide feature switches. Plain constants — flip one and redeploy.
 */

/**
 * Games are hidden for everyone while this is false: no "Games" nav tab, no
 * game card on My Day, `/va/games` redirects to `/va`, and every
 * `/api/minigame/*` route answers 404 — so the game can't be played by URL
 * either, not just hidden from the menu.
 *
 * Nothing is deleted. Components, libs, leaderboard resolvers and every
 * GameScore / WordEntry / MiniGameRun row stay intact while it is off.
 *
 * Off October 2026; back on November 2026 with Trap Shift.
 */
export const GAMES_ENABLED = true;

/**
 * Tries per VA per ET day, by `MiniGameRun.gameKey`. The database backs the
 * ceiling (a CHECK caps attemptNo at 5); this map is what the game code reads.
 * Trap Shift's number comes from its current core so it lives in one place.
 * Archived one-run games stay at 1 — their code only ever issues attempt 1.
 */
export const MAX_ATTEMPTS = {
  "stretch-goal": 1,
  "trap-shift": TRAP_SHIFT_TRIES,
} as const;
