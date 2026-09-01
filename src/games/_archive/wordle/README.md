# Archived — Daily Word Guess ("Wordle"), August 2026

This game was the rotating mini-game for **2026-08**. It is archived, not
deleted: nothing here is mounted or routed, but every file still compiles and
**every row it wrote is still queryable**, because the wall of fame and the
Reigning Champion box both resolve August from this data.

## What moved here

| file | was |
|---|---|
| `WordGame.tsx` | `src/components/games/WordGame.tsx` |
| `game.ts` | `src/lib/word/game.ts` |
| `api/today.ts` | `src/app/api/word/today/route.ts` |
| `api/guess.ts` | `src/app/api/word/guess/route.ts` |

The two API files left `src/app/` on purpose. A Route Handler is registered by
its *location*, so leaving them under `src/app/api/word/` would have kept the
endpoints live — a VA could have gone on POSTing guesses and written new
`WordEntry` rows into a season that is supposed to be closed. Here they are
inert source.

## What deliberately did NOT move

- **`src/lib/word/logic.ts`, `lists.ts`, `answers.json`, `allowed.json`** — the
  scoring arithmetic and word lists. `src/lib/leaderboards/wordResolver.ts` is
  still *active* (it is what renders August on the wall of fame) and reads them,
  and `tests/word.test.ts` still covers them.
- **The `WordPuzzle` / `WordEntry` tables.** No migration drops them. 27 puzzles
  and 109 entries stay exactly where they are.

## Bringing it back

Add a rotation entry in `src/lib/leaderboards/registry.ts`
(`{ from: "<month>", gameId: "WORD" }`), move `api/today.ts` and `api/guess.ts`
back to `src/app/api/word/{today,guess}/route.ts`, and render `<WordGame>` from
`src/app/va/games/page.tsx`. Nothing else needs to change.
