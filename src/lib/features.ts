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
 * GameScore / WordEntry / MiniGameRun row stay intact; set this back to `true`
 * to bring the Games page back exactly as it was.
 */
export const GAMES_ENABLED = false;
