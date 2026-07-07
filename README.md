# KSMVP VA Tasks

**Virtual Assistant time-tracking & task-reporting for the Kevin Spann Mentorship Value Program.**
_We Make AI Easy._

VAs clock in and out of their workday, log planned tasks at clock-in and completed
tasks at clock-out, and flag anything urgent. Clients get a clean dashboard to
review all of their VAs' activity at a glance.

---

## Features

- **Four roles, routed from one login:**
  - **Admin** (e.g. CEO/COO) — the org-wide admin dashboard only.
  - **Virtual Assistant with admin dashboard** (role id `VA_ADMIN`, e.g.
    directors) — displayed everywhere simply as "Virtual Assistant", but sees the
    admin dashboard **and** their own VA dashboard, with a tab to switch between
    them.
  - **VA** — their own Time In/Out dashboard.
  - **Intern** — their own Time In/Out dashboard (same access as VA).
- **Time In** — big orange button opens a modal with, in order: an editable
  **8:45 AM ET** clock, required **Start-of-Day Tasks**, and an optional
  **Urgent Need / Support** field.
- **Time Out** — editable **5:00 PM ET** clock + required **End-of-Day Tasks**;
  hours worked are computed **server-side** and rounded to the nearest **whole
  hour** (a standard 8:45–5:00 shift reads as 8).
- **PTO / Vacation** — VAs can log a paid time-off / vacation day from the "Log
  PTO / Vacation" button; it's credited as a full **8-hour day** (no clock in/out)
  and shown distinctly on the client dashboard.
- **Guards** — a VA can never have two open sessions; a forgotten time-out from a
  previous day is flagged `INCOMPLETE` (never given fabricated hours) and the VA
  is prompted to close it before starting a new day.
- **Client dashboard** — one card per day per VA with **start/end tasks side by
  side**, unmistakable **urgent highlighting** (only when filled), **on-time /
  late-in / early-out** benchmark chips vs the scheduled shift, plus **date-range
  + VA filters** and **sorting** (including urgent-first).
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
| Database | Prisma ORM — **SQLite** for zero-setup local dev, **PostgreSQL** for production (portable schema) |
| Auth | Custom email+password sessions — `bcryptjs` hashes, signed JWT in an HTTP-only cookie (`jose`), role-based route guards |
| Time/date | Luxon (all timezone math) |
| Validation | Zod (shared by client forms and server actions) |
| Tests | Vitest (hours + timezone/DST logic) |

---

## Prerequisites

- **Node.js 18.18+** (built and verified on Node 24)
- Nothing else for local dev — the default database is **SQLite** (a file), so no
  Docker, no install, no signup. PostgreSQL is only needed for production.

---

## Setup (one documented path — zero external services)

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
#    - Set AUTH_SECRET to a long random string:  openssl rand -base64 32
#    - DATABASE_URL already defaults to SQLite (file:./dev.db) — nothing to change.

# 3. Create the schema and seed demo data (creates prisma/dev.db)
npm run db:migrate      # prisma migrate dev
npm run db:seed         # 1 client + 3 VAs + sample entries

# 4. Run it
npm run dev             # http://localhost:3000
```

That's it — sign in with a demo account below.

> **Already have the dev server running?** Restart it after step 2/3 so it picks
> up `.env` and the freshly generated Prisma client.

### Switching to PostgreSQL (production)

The schema is written to be portable. To run on Postgres instead:

1. In `prisma/schema.prisma`, change `provider = "sqlite"` → `provider = "postgresql"`.
2. Set `DATABASE_URL` to your Postgres instance (the bundled `docker-compose.yml`
   provides one: `docker compose up -d` → `postgresql://ksmvp:ksmvp@localhost:5432/ksmvp?schema=public`).
3. Delete the SQLite-flavored `prisma/migrations/` folder, then
   `npm run db:migrate && npm run db:seed` to create fresh Postgres migrations.

No application code changes are required — roles/status are stored as validated
strings, so the same code runs on both engines.

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

- **Time-In field order** — editable 8:45 AM ET clock → Start-of-Day (required) →
  Urgent (optional). See [TimeInModal.tsx](src/components/va/TimeInModal.tsx).
- **Hours computed server-side** — [computeHoursWorked](src/lib/time.ts) is only
  ever called inside server actions / the DB layer; the client total is never trusted.
- **No double time-in / forgotten time-out** — enforced transactionally in
  [timeEntries.ts](src/lib/timeEntries.ts) (`timeInForVa`, `flagStaleSessions`).
- **Urgent highlighting only when filled** — [hasUrgent](src/lib/time.ts) treats
  blank/whitespace as no-flag; the dashboard card adds an orange ring + banner
  only for real content.
- **Benchmark chips** — [classifyPunctuality](src/lib/time.ts) compares actual
  punches to the 8:45–5:00 ET shift with a configurable ±grace window
  (`BENCHMARK_GRACE_MINUTES`, default 5).
- **Authorization on every read/write** — role guards in
  [session.ts](src/lib/session.ts); dashboard queries are scoped to
  `va.clientId === client.id` so a client only ever sees their own VAs' data.

---

## Timezone design

- `America/New_York` ("ET") is the anchor for all presets and the dashboard
  benchmark. Luxon resolves EST vs EDT per date — no hardcoded offsets.
- **Store** every instant as **UTC**; **display** every instant in **ET**.
- The editable time inputs are naive wall-clock strings; the server always
  interprets them as **ET** (never the browser's zone) via `etWallClockToUtc`.
- `workDate` is the **ET calendar day** (stored in a `DATE` column) so entries
  near midnight land on the intended day.
- Proof: [tests/time.test.ts](tests/time.test.ts) asserts the same 8:45 AM ET
  wall-clock maps to **12:45 UTC in July (EDT)** and **13:45 UTC in January
  (EST)**, and displays back as 8:45 AM in both cases.

```bash
npm test   # 22 passing assertions
```

---

## Project structure

```
prisma/
  schema.prisma          # User + TimeEntry, enums, indexes
  seed.ts                # demo client, VAs, and sample entries
src/
  app/
    login/               # login page + login/logout server actions
    va/                  # VA "my day" page + time-in/out/resolve actions
    client/              # dashboard + /client/vas management + add-VA action
    layout.tsx           # fonts + global shell
    middleware.ts        # edge auth redirect for /va and /client
  components/            # Logo, TopNav, Modal, badges, VA & client UI
  lib/
    time.ts              # timezone/hours/benchmark logic (unit-tested)
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
