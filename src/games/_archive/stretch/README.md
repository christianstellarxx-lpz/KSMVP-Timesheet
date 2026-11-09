# Archived — Stretch Goal, September–October 2026

This game was the rotating mini-game for **2026-09** and **2026-10** (October
is a void season — see `VOID_SEASONS` in `src/lib/leaderboards/registry.ts`).
It is archived, not deleted: nothing here is mounted or routed, but every file
still compiles and **every `MiniGameRun` row it wrote (`gameKey =
"stretch-goal"`) is still queryable**, because the wall of fame resolves
September from this data.

## What moved here

| file | was |
|---|---|
| `StretchGoal.tsx` | `src/components/games/StretchGoal.tsx` |
| `StretchGoalPanel.tsx` | `src/components/games/StretchGoalPanel.tsx` |
| `game.ts` | `src/lib/stretch/game.ts` |
| `api/session.ts`, `api/start.ts`, `api/score.ts`, `api/leaderboard.ts` | the bodies of `src/app/api/minigame/*/route.ts` |

The `/api/minigame/*` paths now serve Trap Shift. Stretch Goal's handlers are
kept here as inert source, so they can't accept runs into a closed season.

## What deliberately did NOT move

- **`src/lib/stretch/core.ts`**: the simulation. `tests/stretch.test.ts` covers
  it, and the archived component imports it.
- **`src/lib/leaderboards/stretchResolver.ts`**: still *active*. It is what
  renders September on the wall of fame.
- **The unlock gate** (`isUnlockedToday`) moved to `src/lib/game.ts` so Trap
  Shift could share it. `game.ts` here re-exports it.

## One change made while archiving

`MiniGameRun`'s unique index became `(userId, gameKey, playedOn, attemptNo)`
for Trap Shift's three tries. The two lookups in `game.ts` now pass
`attemptNo: 1`. Stretch Goal only ever wrote attempt 1, so its rule (one run a
day) is unchanged.

## Bringing it back

Add a rotation entry in `src/lib/leaderboards/registry.ts`
(`{ from: "<month>", gameId: "STRETCH" }`), move the four `api/*.ts` files back
over `src/app/api/minigame/*/route.ts`, and render `<StretchGoalPanel>` from
`src/app/va/games/page.tsx` with `getStretchGoalState()`.
