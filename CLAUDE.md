# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

KSMVP VA Tasks — a Virtual Assistant time-tracking and task-reporting web app for the Kevin Spann Mentorship Value Program ("We Make AI Easy"). VAs clock in/out with a start-of-day plan and end-of-day report; admins review the org-wide dashboard and leave feedback; a Sales Producer has a separate "Sales Desk".

Stack: Next.js 15 (App Router, React 19 Server Components + Server Actions), TypeScript, Prisma 6 + PostgreSQL, Tailwind CSS 3, Zod validation, `jose` JWT session cookies, Luxon for timezone handling. Deployed on Vercel.

## Commands

```bash
npm run dev          # Next dev server (http://localhost:3000)
npm run build        # prisma generate + migrate deploy + db seed + next build (this is what Vercel runs)
npm run typecheck    # tsc --noEmit
npm test             # vitest run (tests live in tests/**/*.test.ts)
npm run test:watch   # vitest watch mode
npx vitest run tests/time.test.ts            # run a single test file
npx vitest run -t "classifyPunctuality"      # run tests matching a name

# Database (Prisma)
npm run db:migrate   # prisma migrate dev — create/apply a migration locally
npm run db:deploy    # prisma migrate deploy — apply pending migrations (prod)
npm run db:seed      # tsx prisma/seed.ts — idempotent upsert of team members
npm run db:studio    # Prisma Studio
npm run db:reset     # DESTRUCTIVE: drops + recreates + reseeds the DB
npm run setup        # generate + deploy + seed (first-time local setup)

# Games
npm run word:schedule                        # print which word lands on which ET day
npm run word:schedule > docs/word-answer-schedule.md   # regenerate the review doc
```

There is no ESLint step; `npm run typecheck` is the lint gate. Always run `typecheck` after non-trivial changes.

## Environment & database

- Copy `.env.example` to `.env`. Required: `DATABASE_URL_UNPOOLED` (the connection the app/Prisma actually uses — see `datasource` in `prisma/schema.prisma`), `DATABASE_URL`, and `AUTH_SECRET` (JWT signing secret, ≥32 chars). Optional `BENCHMARK_GRACE_MINUTES` (default 5).
- **PostgreSQL for both dev and prod** — there is no local SQLite/Docker DB. Use a hosted Postgres (Neon, Vercel Postgres, Supabase); the same `DATABASE_URL` works locally and in production. (`prisma/dev.db` is a stale leftover, not used.)
- Env access goes through `src/lib/env.ts` (lazy, throws a helpful message if missing). Don't read `process.env` directly for app config.
- Neon serverless cold-starts are handled explicitly: DB mutations run through `withTx()` in `src/lib/timeEntries.ts`, which retries transient connectivity errors (P2028, P1001, etc.) and never surfaces raw DB errors to users.

## Architecture

### Roles & auth (`src/lib/session.ts`, `src/middleware.ts`)
Five roles, stored as validated strings (not DB enums): `ADMIN`, `VA_ADMIN`, `VA`, `INTERN`, `SALES_PRODUCER`.
- Capability helpers: `canViewAdmin` (ADMIN, VA_ADMIN), `canViewVa` (VA_ADMIN, VA, INTERN), `canViewSales` (SALES_PRODUCER), `isFullAdmin` (ADMIN only — gates destructive actions).
- Login is **PIN-based, no username typed**: a user picks their account and enters a 4-digit PIN (`quickLoginAction` in `src/app/login/actions.ts`). Every seeded account starts with PIN `0000` (`DEFAULT_PIN` in `src/lib/validation.ts`); users change it in Account settings. PINs are bcrypt-hashed (`src/lib/password.ts`) and stored in `User.passwordHash`.
- Session is a signed JWT in the `ksmvp_session` httpOnly cookie. It is a **browser session cookie** — `createSession` sets no `maxAge`/`expires`, so closing the browser signs the user out. The JWT's own 7-day `TOKEN_MAX_AGE_SECONDS` expiry is only a server-side backstop for a browser left open for days; don't mistake it for the login lifetime, and don't reintroduce a cookie `maxAge`.
- **Sessions self-heal — never tell a user to clear cookies.** Every token carries a `v` claim (`SESSION_VERSION` in `src/lib/sessionCookie.ts`, imported by both the node and edge sides so they can't drift). A cookie that fails to verify for *any* reason — wrong version, rotated `AUTH_SECRET`, expired, corrupt — is rejected **and deleted by the middleware** on the way to `/login`, which is in the matcher solely so a stale cookie gets cleared on arrival. **Bump `SESSION_VERSION` whenever a change should sign everyone out**; that is the supported way to retire live sessions. The one carve-out: `POST /login` is never cleared, because the login Server Action owns that response's `Set-Cookie`. `middleware.ts` is a coarse edge guard that bounces unauthenticated requests off `/va`, `/client`, `/sales`, `/account`. **The authoritative check is the per-route guard** — `requireAdmin()` / `requireVA()` / `requireSalesProducer()` called at the top of each route's layout/page. Guards redirect to the role's home (`homePathForRole`) on mismatch.

### Route map (`src/app/`)
App Router, one area per role. Each area has a `layout.tsx` that runs the auth guard, a `page.tsx` (Server Component that fetches data via a `src/lib/*` module), and often `actions.ts` (Server Actions for mutations).
- `/` → redirects to role home or `/login`
- `/login` → PIN login
- `/va` → VA "my day" dashboard (clock in/out, tasks, PTO, admin feedback). Daily Flappy used to render here and is now **hidden** — see the note in `VaDayClient.tsx` for how to bring it back.
- `/va/games` → the game / leaderboard page: Reigning Champion spotlight + this month's rotating game (Daily Word Guess) + its monthly leaderboard
- `/client` → org-wide **admin** dashboard (naming is historical — "client" = admin, not a customer). `/client/vas` manages members.
- `/sales` → Sales Producer's Sales Desk (notices to team channels)
- `/account` → change PIN
- `/api/word/today` (GET) and `/api/word/guess` (POST) → the Word Guess gameplay API. These are the only Route Handlers in the app (everything else uses Server Actions); they exist because the game needs per-guess round trips without a page revalidation. They are **not** in the `middleware.ts` matcher — they enforce auth themselves and return 401/403 JSON rather than redirecting to `/login`.

### Time model (`src/lib/time.ts`) — read this before touching any date logic
- **Storage is always UTC; display is always America/New_York ("ET"), for every user regardless of their machine timezone.** ET is EST/EDT depending on date — Luxon resolves DST; never hardcode a UTC offset.
- `workDate` is the ET calendar day, stored anchored at UTC-midnight so entries near midnight land on the intended day. Convert with `etDateStringToStorageDate` / `storageDateToEtDateString`.
- `<input type="datetime-local">` values are naive wall-clock strings, always interpreted as **ET** (never browser zone) via `etWallClockToUtc`.
- The scheduled shift benchmark is `SCHEDULE` (9:00 AM–5:00 PM ET). Display labels and punctuality chips (`ON_TIME` / `LATE_IN` / `EARLY_OUT`, with a grace window) all derive from it — single source of truth, no hardcoded times. `hoursWorked` is computed server-side (`computeHoursWorked`, rounded to whole hours), never trusted from the client.

### Data model (`prisma/schema.prisma`)
- `User` — role, name, title, email (unique), passwordHash. Self-relation `ClientVAs` is reserved for future per-manager scoping (the admin dashboard is org-wide today).
- `TimeEntry` — one per VA per ET day. `status` OPEN | CLOSED | INCOMPLETE; `entryType` WORK | PTO (PTO credits 8h, no clock times). Invariant "at most one OPEN entry per VA" is enforced at the app layer inside a transaction (`timeInForVa`), not by a DB constraint.
- **`publishAt` = the "Atake" scheduler.** On time-out a VA can schedule their End-of-Day report to stay hidden from admins until 5:00 PM ET on the work date. While `publishAt` is in the future the entry is masked from the admin dashboard (the start-of-day part still shows); `null` = visible immediately. See `timeOutForVa`.
- `Comment` — admin/VA-admin feedback on an entry (`target` START | END | GENERAL); `readAt` drives the VA's unread-feedback notification.
- `GameScore` — one Flappy Bird score per user per ET day (VA dashboard game); powers a leaderboard.
- `WordPuzzle` — one row per ET day for the Daily Word Guess: the shared `answer` for that date. Materialized on the first request of the day so every user provably reads the same word; an existing row is never rewritten.
- `WordEntry` — one VA's attempt at one puzzle (`guesses` / `guessPatterns` JSON arrays). The unique `(vaId, puzzleId)` constraint is what enforces one attempt per day. `guessCount` is 1–6 when solved and 0 when the attempt ends unsolved — use `guesses.length` for "guesses used".
- `Notice` — Sales Desk message to a fixed channel (`TECH_SUPPORT` | `ADMIN_INQUIRY`); **one row per recipient** so read-state is per-person.
- `WordPuzzle` and `WordEntry` both carry a nullable `organizationId` — unused today (single-tenant), added up front as Phase 4 multi-tenant prep.

### Games & the monthly leaderboard harness
- **The daily-attempt gate is shared.** `isClockedInToday()` in `src/lib/game.ts` is the single definition of "one try a day, after Time In". Don't reimplement it in a new game.
- **Daily Flappy is hidden, not deleted.** `components/va/FlappyGame.tsx`, `lib/game.ts`, `submitGameScoreAction`, and every `GameScore` row are intact — the monthly Flappy resolver still powers the Reigning Champion box for months when Flappy was the rotating game (July 2026 resolves to a real winner from this data).
- **Daily Word Guess** (`src/lib/word/`) is **server-authoritative**: `logic.ts` is pure and unit-tested (date-seeded selection, two-pass green/yellow evaluation with correct duplicate-letter handling, emoji grid, streak math); `lists.ts` and `game.ts` are `server-only`. The answer never reaches the client until that player's own attempt is finished. `answers.json` / `allowed.json` live behind `server-only` precisely so they can't land in a public bundle — never import them from a `"use client"` file.
- Word selection is deterministic: `dayIndex = days since WORD_EPOCH_DATE` (ET, Luxon), indexed into the answer list after one fixed-seed shuffle (`ANSWER_SHUFFLE_SEED`). **Changing either constant reshuffles every future day**, so treat them as frozen once live.
- **Leaderboards are resolver-based** (`src/lib/leaderboards/`). Each rotating game supplies a `GameResolver` that turns its rows into a ranked monthly table; `registry.ts` maps a month to the game that was live then (`GAME_ROTATION`). To hand next month to a new game: add a resolver file plus one rotation entry — no leaderboard rework, and the Reigning Champion box follows automatically.
- Word scoring: 10/6/5/4/3/2 points for a solve in 1–6 guesses, +1 for playing at all, +1 per 5 consecutive solved **workdays** (Mon–Fri; a fail *or* a skipped workday resets the run), tiebreak = fewest total guesses.
- The leaderboard's "Today" column shows each player's colour path. `WordLeaderRow.todayPath` carries **tile colours only** — `todayRuns()` reads `guesses` purely to count them and never passes the words on, which is what keeps the column spoiler-free. A path is withheld until that player's attempt is finished, so nobody can watch a live game tile by tile.

### Server-side data flow — the dominant pattern
1. Server Component page calls a `src/lib/*.ts` module (marked `import "server-only"`) that reads via Prisma and returns a **DTO** (plain serializable object, e.g. `EntryDTO`) — Prisma models never cross into client components.
2. Client components (`"use client"`) render DTOs and submit to **Server Actions** (`actions.ts`) using `useActionState` + the `FormState` shape in `src/lib/formState.ts`.
3. Actions validate with the Zod schemas in `src/lib/validation.ts`, call the corresponding `src/lib/*` mutation (which returns `MutationResult = {ok:true} | {ok:false, message}`), then `revalidatePath` the affected route.
- Domain logic per area lives in its lib module: `timeEntries.ts`, `dashboard.ts` (admin view), `rollcall.ts`, `sales.ts`/`notices.ts`, `vas.ts`, `comments.ts`, `game.ts`. Keep new business logic in these modules, not in components or actions.
- Ownership is enforced in the query `where` clause (e.g. a VA can only edit `{ id, vaId }`), not just in the UI.

## Conventions
- Path alias `@/*` → `src/*` (configured in `tsconfig.json` and `vitest.config.ts`).
- All task/urgent/report text is stored verbatim and rendered only as React text children (auto-escaped) — never `dangerouslySetInnerHTML`, so no HTML sanitization is needed. Zod trims input.
- Prisma Client and `bcryptjs` are kept out of the client bundle via `serverExternalPackages` in `next.config.mjs`.
- Seeding is idempotent (`upsert` by email, no `deleteMany`) so it's safe to re-run against production without wiping logged hours. The team roster is the `MEMBERS` array in `prisma/seed.ts`.

## Rebranding / duplicating for another brand
Brand identity is centralized. To spin up a copy for a different company, change these (and nothing else needs to touch business logic):
- **Brand colors & fonts:** `tailwind.config.ts` (the `brand.blue/orange/yellow` palettes, `fontFamily`) and the mirrored CSS variables + component primitives (`.btn`, `.card`, `.field-*`, `.chip`) in `src/app/globals.css`. Fonts are loaded in `src/app/layout.tsx` (Poppins + Open Sans via `next/font`).
- **Logo & tagline:** `src/components/Logo.tsx` is the single swap point (currently a text lockup "KSMVP VA Tasks" / "We Make AI Easy" with a "K" mark placeholder — designed to be replaced with an `<Image>`).
- **App metadata / theme color:** `title`, `description`, `viewport.themeColor` in `src/app/layout.tsx`.
- **Team roster & default accounts:** `MEMBERS` in `prisma/seed.ts` (names, emails, roles, titles). Note emails are lowercased on seed.
- **Daily-report owner:** `DAILY_REPORTER_EMAILS` in `src/lib/session.ts` (whose email gets the "Daily Roll Call" panel).
- **Package identity:** `name`/`description` in `package.json`.
- **Cookie name:** `SESSION_COOKIE_NAME` in `src/lib/sessionCookie.ts` — the one place it's defined; both `session.ts` and `middleware.ts` import it.
- **Schedule & PTO rules:** `SCHEDULE`, `PTO_HOURS`, `ET_ZONE` in `src/lib/time.ts` if the new brand's shift or timezone differs.
- **Games:** the `"KSMVP Word"` prefix in `emojiGrid()` (`src/lib/word/logic.ts`), and `CHAMPION_FALLBACK` in `src/lib/leaderboards/registry.ts` (the placeholder champion shown only until a real previous-month winner exists).
- Grep for `KSMVP`, `Kevin Spann`, `kevinspann.com`, and `ksmvp` to catch remaining brand strings.
