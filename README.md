# KSMVP VA Tasks

**Virtual Assistant daily task-reporting for the Kevin Spann Mentorship Value Program.**
_We Make AI Easy._

VAs send a Start-of-Day plan and an End-of-Day report each day and flag anything
urgent. Admins get a clean dashboard showing what every VA worked on. There are
no clock times or hours — this is a work log, not a payroll timesheet.

---

## Features

- **Four roles, routed from one login:**
  - **Admin** (e.g. CEO/COO) — the org-wide admin dashboard only.
  - **Virtual Assistant with admin dashboard** (role id `VA_ADMIN`, e.g.
    directors) — displayed everywhere simply as "Virtual Assistant", but sees the
    admin dashboard **and** their own VA dashboard, with a tab to switch between
    them.
  - **VA** — their own "My Day" dashboard.
  - **Intern** — their own "My Day" dashboard (same access as VA).
- **Plan my week** — on Monday a VA writes Mon–Fri tasks once. Each morning that
  day's plan prefills Start of Day; the VA still reviews and submits it. Admins
  never see the plan, only the daily reports.
- **Start of Day** — required **Start-of-Day Tasks** + optional **Urgent Need /
  Support**. Admins see it as soon as it's submitted.
- **End of Day** — prefilled with a **Gemini** draft of the Start of Day rewritten
  in past tense (or the Start of Day itself if Gemini is off or unavailable). The
  VA edits it and presses **Sched**; it reaches admins at **5:00 PM ET**, or right
  away if submitted later.
- **PTO / Vacation** — a day marker from the "Log PTO / Vacation" button; no
  reports needed, shown distinctly on the admin dashboard.
- **Guards** — a VA can never have two open days; a Start of Day with no End of
  Day is flagged `INCOMPLETE` and the VA is prompted to add the report before
  starting a new day.
- **Admin dashboard** — one card per day per VA with **start/end reports side by
  side**, unmistakable **urgent highlighting** (only when filled), plus **day +
  VA filters** and **sorting** (including urgent-first).
- **Admin feedback + notifications** — admins can leave a **comment** on any
  entry (targeting the **Start-of-day tasks** or **End of Day Report**). The VA
  sees it in a **"Feedback from your admin"** panel on their dashboard with a
  **new-comment notification**; the notification clears once they've viewed it,
  and the admin card shows whether each comment has been **seen** yet.
- **Timezone-correct** — every timestamp is stored in **UTC** and displayed in
  **America/New_York (ET)** with correct **daylight-saving** behavior, regardless
  of anyone's device timezone.

---

## Tech stack

| Concern | Choice |
|---|---|
| Framework | Next.js 15 (App Router, TypeScript, Server Actions) |
| Styling | Tailwind CSS v3 with brand design tokens |
| Fonts | Poppins (headings/buttons/numbers) + Open Sans (body) via `next/font` |
| Database | Prisma ORM — **PostgreSQL** (Neon / Vercel Postgres / Supabase) for local dev and production |
| Auth | Custom email+password sessions — `bcryptjs` hashes, signed JWT in an HTTP-only cookie (`jose`), role-based route guards |
| Time/date | Luxon (all timezone math) |
| Validation | Zod (shared by client forms and server actions) |
| Tests | Vitest (hours + timezone/DST logic) |

---

## Prerequisites

- **Node.js 18.18+** (built and verified on Node 24)
- A **PostgreSQL** database. The easiest zero-install option is a free serverless
  Postgres — **[Neon](https://neon.tech)**, **Vercel Postgres**, or
  **[Supabase](https://supabase.com)**. No Docker required. The same database URL
  is used for local dev and production.

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
#    - DATABASE_URL / DATABASE_URL_UNPOOLED: your Postgres connection string(s).
#      If you only have one, set both to the same value.
#    - AUTH_SECRET: a long random string  ->  openssl rand -base64 32
#    - GEMINI_API_KEY (optional): End-of-Day drafts — https://aistudio.google.com

# 3. Create the schema and seed the org roster
npm run db:deploy       # prisma migrate deploy  (applies migrations)
npm run db:seed         # upserts the 11-person roster (idempotent, no data loss)

# 4. Run it
npm run dev             # http://localhost:3000
```

That's it — sign in with a seeded account below (PIN `0000`).

> **Already have the dev server running?** Restart it after step 2/3 so it picks
> up `.env` and the freshly generated Prisma client.

---

## Deploying to Vercel

1. **Create a Postgres database.** In the Vercel dashboard → **Storage → Create
   Database → Neon** (Serverless Postgres). Connect it to the project — this
   auto-creates `DATABASE_URL` and `DATABASE_URL_UNPOOLED` for you.
   _(External Neon/Supabase also works: add both env vars yourself; if you only
   have one connection string, set both to it.)_
2. **Add `AUTH_SECRET`** (Settings → Environment Variables, Production + Preview)
   = a long random string (`openssl rand -base64 32`).
   Optionally add `GEMINI_API_KEY` too, for the AI End-of-Day drafts.
3. **Redeploy.** The build runs
   `prisma generate && prisma migrate deploy && prisma db seed && next build`, so
   the tables **and the login accounts** are created automatically on deploy.

That's it — open the app and sign in with PIN `0000`. The seed is **idempotent**
(upsert by email), so it's safe to run on every deploy — it never deletes logged
hours or resets changed PINs.

Everyone signs in with the default PIN **`0000`** and can change it under
**Account** settings.

### Seeded accounts

The seed (`prisma/seed.ts`) creates the real organization roster. **Login is
quick-login**: on the login page, tap your name, then enter your **4-digit PIN**.
Every account starts at the default PIN **`0000`** (`DEFAULT_PIN` in
`src/lib/validation.ts`) and can be changed under **Account** settings.

| Role | Example account | Sees |
|---|---|---|
| Admin | Kevin Spann | Admin dashboard |
| Virtual Assistant (`VA_ADMIN`) | Jonathan Sarong | Admin dashboard + own VA dashboard (tabbed) |
| VA | Bryxter Bulisig | Own VA dashboard |
| Intern | Rodney Monasque | Own VA dashboard |

No time entries are seeded — the dashboard fills in as the team clocks in/out.
See `prisma/seed.ts` for the full 11-person roster. (A 4-digit PIN with quick-login
name buttons favors convenience for this internal tool over strong auth.)

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | `prisma generate` + production build |
| `npm start` | Run the production build |
| `npm test` | Run the Vitest unit tests (hours + timezone/DST) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | Create/apply the schema (`prisma migrate dev`) |
| `npm run db:seed` | Seed demo data |
| `npm run db:reset` | Drop, re-migrate, and re-seed |
| `npm run db:studio` | Open Prisma Studio |
| `npm run setup` | `generate` + `migrate deploy` + `seed` (for a fresh env) |

---

## How it satisfies the brief

- **Start of Day** — Start-of-Day (required, prefilled from the weekly plan) →
  Urgent (optional). See [StartDayModal.tsx](src/components/va/StartDayModal.tsx).
- **End-of-Day draft** — [gemini.ts](src/lib/gemini.ts); the text sent to Gemini is
  read from the VA's own entry on the server, and any failure falls back to the
  Start-of-Day text.
- **No double Start of Day / forgotten End of Day** — enforced transactionally in
  [timeEntries.ts](src/lib/timeEntries.ts) (`startDayForVa`, `flagStaleSessions`).
- **Urgent highlighting only when filled** — [hasUrgent](src/lib/time.ts) treats
  blank/whitespace as no-flag; the dashboard card adds an orange ring + banner
  only for real content.
- **Authorization on every read/write** — role guards in
  [session.ts](src/lib/session.ts); dashboard queries are scoped to
  `va.clientId === client.id` so a client only ever sees their own VAs' data.

---

## Timezone design

- `America/New_York` ("ET") is the anchor for the work day, the weekly planner
  and the 5:00 PM End-of-Day publish time. Luxon resolves EST vs EDT per date —
  no hardcoded offsets.
- **Store** every instant as **UTC**; **display** every instant in **ET**.
- `workDate` is the **ET calendar day** so entries near midnight land on the
  intended day.
- Proof: [tests/time.test.ts](tests/time.test.ts) asserts 5:00 PM ET resolves to
  **21:00 UTC in July (EDT)** and **22:00 UTC in January (EST)**, and that the
  planner week follows the ET day around midnight and the DST change.

---

## Project structure

```
prisma/
  schema.prisma          # User + TimeEntry, enums, indexes
  seed.ts                # demo client, VAs, and sample entries
src/
  app/
    login/               # login page + login/logout server actions
    va/                  # VA "my day" page + start/end-of-day, plan, draft actions
    client/              # dashboard + /client/vas management + add-VA action
    layout.tsx           # fonts + global shell
    middleware.ts        # edge auth redirect for /va and /client
  components/            # Logo, TopNav, Modal, badges, VA & client UI
  lib/
    time.ts              # timezone + planner-week logic (unit-tested)
    session.ts           # JWT sessions + role guards
    password.ts          # bcrypt hashing
    prisma.ts            # Prisma client singleton
    timeEntries.ts       # VA read/write data layer (transactional guards)
    dashboard.ts         # client dashboard queries, filters, sorting
    vas.ts               # VA management data layer
    validation.ts        # Zod schemas
tests/
  time.test.ts           # hours + DST timezone tests
```

---

## Security notes

- Passwords hashed with bcrypt; sessions are signed JWTs in an **HTTP-only**,
  `SameSite=Lax`, `Secure`-in-production cookie.
- Server Actions carry Next.js's built-in same-origin (CSRF) protection; the
  `SameSite` cookie reinforces it.
- All task/urgent text is rendered as escaped React text (never
  `dangerouslySetInnerHTML`), so stored content can't inject markup.
- Every server action re-checks the session and role before touching data.

`npm audit` may report advisories in transitive dev/build dependencies (e.g.
PostCSS/esbuild used only at build time). They don't affect the running app; the
Next.js runtime advisory is resolved by pinning **Next 15.5.20**.

---

## Out of scope (future work)

Public self-serve signup, payroll/billing/invoicing, notifications/email,
VA-to-VA visibility, native mobile apps, and third-party integrations are
intentionally not built. The data model uses a self-relation for the
client→VA link so it can later widen to many-to-many.
