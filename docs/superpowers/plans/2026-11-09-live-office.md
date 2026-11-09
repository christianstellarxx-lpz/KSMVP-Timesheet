# Live Office Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An animated, watch-only office scene of the team (click a person to make them wave) on the right half of `/login` and at the bottom of `/va`, desktop only.

**Architecture:** A Python script turns the art into web assets once, offline: WebP images, a walkable grid, and an object id map with the lunch-chair split. Pure TypeScript modules then work out who is where at any ET minute and in what draw order: seats, schedule, path, motion and layers. A server-only helper hides people on PTO, and one client canvas component draws it all. Nothing is stored. Every viewer computes the same scene from the ET clock.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Luxon (`ET_ZONE`), Prisma (read-only), Canvas 2D, Vitest. Offline: Python 3 + Pillow + numpy + scipy.

**Spec:** `docs/superpowers/specs/2026-11-04-pixel-office-design.md`

## Global Constraints

- Every coordinate is in 1536×1024 art space. A sprite frame is 144×144, and a person's feet point is the frame's bottom-centre, so the frame is drawn at `(x − 72, y − 144)`.
- ET only through Luxon and `ET_ZONE` from `src/lib/time.ts`. Never hardcode a UTC offset.
- No database changes, and no new routes, Route Handlers or Server Actions.
- Shown only on `/login` and `/va`. Nothing is rendered or fetched below `lg` (1024 px), and nothing appears on `/client`.
- The schedule is deterministic: no `Math.random`, and the same `(etDate, people)` always gives the same plan.
- Prisma rows never reach the client. The DTO is `{ slug, desk, firstName }`.
- Rendering is pixelated: `ctx.imageSmoothingEnabled = false`, CSS `image-rendering: pixelated`, every `drawImage` position is `Math.round`ed.
- Marc (`marc-fey`) is office-only: no account, never hidden.
- Never delete or move `public/office/_chunks/`.
- `npm run typecheck` is the lint gate. Tests live in `tests/**/*.test.ts`.
- Commit steps run only once the user has said commits are OK (see the handoff question); otherwise skip them and leave the work staged.

## Review Focus

1. **More people want a shared spot than there are spots** (coffee, armchairs, talk pairs, lunch chairs): the extra people stay at their desk, and two people never share a spot. Pinned in Task 4 with 30 synthetic people.
2. **Page open outside office hours** (before 7:50 AM, after 5:15 PM, weekends, across midnight): an empty office, no errors. Pinned in Tasks 4 and 6.
3. **Only Marc is visible** (everyone else on PTO or removed): just Marc, never in a talk pair. Pinned in Task 4.
4. **The clock crosses a time-of-day boundary while the page is open** (11:59→12:00, 4:59→5:00 PM): the background and the object cut-outs switch. `periodFor` boundaries are pinned in Task 4; the swap is a manual check in Task 8.
5. **A sheet without row 12 at a side lunch seat** (any future character without chunk D): row 5 is drawn instead. Pinned in Task 6 (`sheetRow`).

---

### Task 1: Asset script and repo hygiene

**Files:**
- Create: `scripts/office-assets.py`
- Create (generated): `public/office/web/bg-morning.webp`, `bg-afternoon.webp`, `bg-evening.webp`, `<slug>.webp` for every `public/office/characters/*.png`, `walkable.txt`, `objects.png`, `objects.json`
- Modify: `.gitignore` (add `/public/office/_chunks/`), `CLAUDE.md` (Commands: one line for `python scripts/office-assets.py`)

**Interfaces:**
- Produces `walkable.txt`: 128 lines × 192 chars, `.` = open, `#` = blocked. A cell (8×8 px) is open when ≥ 50% of its pixels in `layout-guide.png` are green (`G ≥ 200, R < 64, B < 64`; the guide's green is `(0,224,0)`).
- Produces `objects.png`: 1536×1024, mode `L`, pixel value = object id (0 = none).
- Produces `objects.json`: `{ "width": 1536, "height": 1024, "objects": [{ "id", "x", "y", "w", "h", "baseline", "kind", "seats" }] }`. `baseline` = the lowest owned pixel's y. `kind` ∈ `exec | desk | plant | lounge | table | chair`. `seats` is the seat codes the object belongs to: a chair's own code, or the A codes whose x lies within a lounge object's `[x, x+w)`. Otherwise `[]`.

- [ ] **Step 1: Write `scripts/office-assets.py`** following the docstring style of `scripts/office-sprite.py`, and reuse its `OFFICE` path constant pattern. Behaviour:
  - **WebP:** `bg-*.png` at `quality=80`; each character sheet at `quality=90, method=6` (alpha kept).
  - **Objects:** go through the files in this order: `fg-executive`, `fg-desks-row1`, `fg-desks-row2`, `fg-plants`, `fg-lounge`, `fg-lunch`, `fg-lunch-chairs`. A later file takes ownership of overlapping pixels. Bboxes and baselines are computed from the final ownership.
    - Every file except the chairs: mask = alpha ≥ 128. Label its connected parts after `binary_dilation(iterations=4)`, and own only the undilated mask pixels. Drop parts under 200 px.
  - **Chair split** (`fg-lunch-chairs`, mask alpha ≥ 128). These values were proven in the 2026-11-09 renders:
    - Undilated connected parts whose max y < 420 → `T1` / `T2` / `T3` by mean x (`< 1260`, `< 1314`, else).
    - The remaining pixels go through polygons in painter order, later wins: `L1..L4`, `R1..R5`, `B1`, `B2`.
      - `C4 = [(1216,516),(1230,516),(1236,530),(1247,576),(1284,576),(1284,618),(1242,618),(1240,662),(1224,662),(1217,625),(1215,560)]`
      - `L4 = C4`, `L3 = C4 + (−16,−47)`, `L2 = C4 + (−31,−92)`, `L1 = C4 + (−43,−130)`
      - `R5 = [(1446,528),(1468,528),(1477,546),(1477,600),(1475,657),(1460,657),(1455,632),(1440,632),(1440,610),(1423,610),(1423,578),(1434,560),(1438,540)]`
      - `R4 = R5 + (−17,−39)`, `R3 = R5 + (−34,−75)`, `R2 = R5 + (−47,−107)`, `R1 = R5 + (−60,−139)`
      - `B1` = box `x 1284–1360, y 582–690`; `B2` = box `x 1360–1437, y 582–690`
    - Any chair pixel left unowned goes to the nearest owned pixel (`distance_transform_edt` with `return_indices`).
  - **Self-check (asserts, so a bad re-cut fails loudly):**
    - fewer than 256 objects;
    - each of `T1–T3, L1–L4, R1–R5, B1–B2` is owned by exactly one `chair` object;
    - each of `A1–A4` is in exactly one `lounge` object;
    - exactly one `table` object;
    - an open cell lies within 40 px of `EXIT` and of `CR`.
  - **Output:** print one line per output file with its size.

- [ ] **Step 2: Run it**

Run: `python scripts/office-assets.py`
Expected: no assertion error. `web/bg-afternoon.webp` is about 300 KB, each sheet WebP about 220 KB, and 14 chair objects are reported.

- [ ] **Step 3: Gitignore the chunks and document the command** (`/public/office/_chunks/` in `.gitignore`; in CLAUDE.md, one Commands line: `python scripts/office-assets.py   # re-run after any change to public/office art`).

- [ ] **Step 4: Commit**

```bash
git add .gitignore CLAUDE.md scripts/office-assets.py scripts/office-sprite.py public/office docs/superpowers
git commit -m "Office: asset script, web assets, chair split"
```

---

### Task 2: Seats parser

**Files:**
- Create: `src/lib/office/seats.ts`
- Test: `tests/office.seats.test.ts`

**Interfaces:**
- Produces: `type Facing = "front" | "back" | "left" | "right"`, `type Seat = { x: number; y: number; facing: Facing | null }`, `type Seats = Record<string, Seat>`, `parseSeats(text: string): Seats`.
- Format: blank lines and `#` lines are skipped. The first token is the code. `x` and `y` are the first two integer tokens after it (desk lines carry a name in between). An optional final token is a `Facing`. A non-comment line with fewer than two integers throws `Error("seats.txt line <n>: expected x and y")`.

- [ ] **Step 1: Write the failing tests** (read `public/office/seats.txt` with `node:fs`):
  - `it("has every code")`: the keys include `D1–D11, T1–T3, L1–L4, R1–R5, B1–B2, A1–A4, G1–G4, C1–C3, W1–W3, EXIT, CR`.
  - `it("reads desk lines with names")`: `D1` → `{ x: 652, y: 277, facing: null }`; `D11` → `{ x: 1006, y: 650, facing: null }`.
  - `it("reads facing")`: `L1.facing === "right"`, `R1.facing === "left"`, `T1.facing === "front"`, `B1.facing === "back"`.
  - `it("rejects a line without coordinates")`: `parseSeats("Z9 nope")` throws `/line 1/`.
  - `it("objects.json has a chair for every lunch seat")`: read `public/office/web/objects.json`; for each code in `T1–T3, L1–L4, R1–R5, B1–B2`, exactly one object with `kind === "chair"` has that code in its `seats`.

- [ ] **Step 2:** Run `npx vitest run tests/office.seats.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `parseSeats` in `src/lib/office/seats.ts`.
- [ ] **Step 4:** Run `npx vitest run tests/office.seats.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `git add src/lib/office/seats.ts tests/office.seats.test.ts && git commit -m "Office: seats.txt parser"`

---

### Task 3: Roster and server visibility

**Files:**
- Create: `src/lib/office/roster.ts`, `src/lib/officeRoster.ts`
- Test: `tests/office.roster.test.ts`

**Interfaces:**
- Produces in `roster.ts` (no `server-only`; the client imports it):
  - `type OfficeMember = { slug: string; desk: string; email: string | null; firstName: string; exec: boolean }`
  - `OFFICE_ROSTER: readonly OfficeMember[]` in desk order D1..D11. This order is the roster order the schedule allocates in. Emails come from `prisma/seed.ts`:
    - Kevin `akspann1@gmail.com` D1 (exec)
    - Tanya `tanya@kevinspann.com` D2 (exec)
    - Marc `null` D3 (exec)
    - Kristine `kristine@kevinspann.com` D4
    - Jonathan `jonathan@kevinspann.com` D5
    - Christian `christian@kevinspann.com` D6
    - Bryxter `bryxter@kevinspann.com` D7
    - Gianfranco `franco@kevinspann.com` D8
    - Jeannyn `jeannyn@kevinspann.com` D9
    - Ginger `ginger@kevinspann.com` D10
    - Venus `venus@kevinspann.com` D11
  - Slugs are as in the spec's slug list.
  - `EXEC_LUNCH_SEAT: Readonly<Record<string, string>>` = `{ "tanya-crawford": "T1", "kevin-spann": "T2", "marc-fey": "T3" }`
  - `type OfficePersonDTO = { slug: string; desk: string; firstName: string }`
  - `visibleMembers(activeEmails: ReadonlySet<string>, ptoEmails: ReadonlySet<string>): OfficePersonDTO[]`. Keeps roster order. A member is visible when `email === null`, or the email is in `activeEmails` and not in `ptoEmails`.
- Produces in `officeRoster.ts` (`import "server-only"`): `getOfficePeople(now: Date = new Date()): Promise<OfficePersonDTO[]>`.
  - One `prisma.user.findMany({ where: { email: { in: emails }, removedAt: null }, select: { id: true, email: true } })`.
  - Then `prisma.timeEntry.findMany({ where: { vaId: { in: ids }, workDate: etDateStringToStorageDate(etToday(now)), entryType: "PTO" }, select: { vaId: true } })`.
  - Then `visibleMembers`.

- [ ] **Step 1: Write the failing tests** for `visibleMembers`:
  - all 10 emails active and none on PTO → 11 people, `marc-fey` third;
  - Kristine's email in `ptoEmails` → `kristine-te` is absent and Marc is present;
  - an email missing from `activeEmails` (a removed member) → absent;
  - both sets empty → `[{ slug: "marc-fey", desk: "D3", firstName: "Marc" }]`.
- [ ] **Step 2:** Run `npx vitest run tests/office.roster.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement both files.
- [ ] **Step 4:** Run `npx vitest run tests/office.roster.test.ts && npm run typecheck`. Expected: PASS, no type errors.
- [ ] **Step 5: Commit** `git commit -m "Office: roster and PTO visibility"` (add the three files).

---

### Task 4: Schedule

**Files:**
- Create: `src/lib/office/schedule.ts`
- Test: `tests/office.schedule.test.ts`

**Interfaces:**
- Consumes: `EXEC_LUNCH_SEAT` (Task 3).
- Produces:
  - `type Activity = "arrive" | "work" | "coffee" | "lunch" | "talk" | "laugh" | "armchair" | "workout" | "cr" | "leave"`
  - `type Segment = { start: number; end: number; activity: Activity; spot: string }`. Times are minutes after ET midnight, `end` exclusive. `spot` is a seats.txt code: the desk for `arrive`/`work`, `"CR"` for `cr`, `"EXIT"` for `leave`.
  - `type DayPlan = Record<string, Segment[]>` (by slug, segments in time order)
  - `planDay(etDate: string, people: readonly { slug: string; desk: string }[]): DayPlan`
  - `type Period = "morning" | "afternoon" | "evening"`; `periodFor(minuteOfDay: number): Period` (morning 300–719, afternoon 720–1019, else evening)
  - `SLOT = 15`, `DAY_START = 495` (8:15), `SLOTS = 34`, which give `DAY_END = 1005` (4:45).

**Rules** (the spec's numbers; the implementer decides nothing else):
- **Weekend** (Luxon `DateTime.fromISO(etDate, { zone: ET_ZONE }).weekday >= 6`) → `{}`.
- **Random draws:** each person uses `rng = mulberry32(fnv1a(\`${etDate}|${slug}\`))` (FNV-1a 32-bit, mulberry32; both private to the file). Draw in this exact order:
  1. arrive = `470 + floor(r·21)`;
  2. leave = `1020 + floor(r·11)`;
  3. lunch length = `3 + (r < 0.5 ? 1 : 0)` slots, starting at slot `k = 13 + floor(r·(21 − len − 13 + 1))`, so lunch sits inside 11:30–1:30;
  4. then distinct random non-lunch slots for `coffee`, `coffee`, `lounge`, `cr`, and `workout` only if `r < 0.5`.
- **Allocation:** slot by slot, people in input order.
  - `lunch`: an exec takes their `EXEC_LUNCH_SEAT`. Anyone else takes the first of `L1–L4, R1–R5, B1–B2` that is free for the whole lunch block. No seat free → `work`.
  - `coffee`: first free of `C1–C3`. `workout`: first free of `W1–W3`. `cr`: `"CR"`, no limit.
  - `lounge`: in each slot, pair the lounge drawers in input order. The first two take `G1/G2`, the next two `G3/G4`. A pair is `laugh` when `fnv1a(\`${etDate}|${k}|${pairIndex}\`) % 3 === 0`, else `talk`. Leftovers take the first free of `A1–A4` as `armchair`. Nothing free → `work`.
- **Segments:**
  - `arrive {start: arrive, end: 495, spot: desk}`;
  - one segment per slot, with consecutive identical `(activity, spot)` merged;
  - `work {start: 1005, end: leave, spot: desk}`;
  - `leave {start: leave, end: leave + 5, spot: "EXIT"}`.

- [ ] **Step 1: Write the failing tests** (people = the 11 roster entries mapped to `{slug, desk}`; dates: Mon `2026-11-09`, Sat `2026-11-07`, Sun `2026-11-08`, DST: Mon `2026-03-09`, Sun `2026-03-08`, Sun `2026-11-01`):
  - `same inputs, same plan`: `planDay` called twice gives `toEqual` results.
  - `weekends are empty`: the three Sundays and the Saturday give `{}`; `2026-03-09` has 11 keys.
  - `everyone at their desk by 8:15`: each person's first segment is `arrive` with `470 ≤ start ≤ 490`, `end === 495` and `spot === desk`.
  - `gone by 5:15`: the last segment is `leave` with `end ≤ 1035`.
  - `lunch inside 11:30–1:30`: every `lunch` segment has `start ≥ 690` and `end ≤ 810`.
  - `execs eat at the top end, VAs never do`.
  - `nobody shares a spot`: for every minute 495..1004 in steps of 15, over 20 consecutive weekdays from `2026-11-09`, the occupied spots other than `"CR"` are unique. Run it again with 30 synthetic people `{ slug: "p"+i, desk: "D"+i }` (Review Focus 1).
  - `a hidden person is never planned`: `planDay` without Gianfranco has no `gianfranco-adana` key, and no `talk`/`laugh` segment names him.
  - `only Marc`: `planDay(date, [marc])` has one key and no `talk`/`laugh` (Review Focus 3).
  - `periodFor`: 299 → evening, 300 → morning, 719 → morning, 720 → afternoon, 1019 → afternoon, 1020 → evening (Review Focus 4).
- [ ] **Step 2:** Run `npx vitest run tests/office.schedule.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `schedule.ts`.
- [ ] **Step 4:** Run `npx vitest run tests/office.schedule.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Office: deterministic day schedule"`.

---

### Task 5: Pathfinding

**Files:**
- Create: `src/lib/office/path.ts`
- Test: `tests/office.path.test.ts`

**Interfaces:**
- Produces:
  - `type Pt = { x: number; y: number }`
  - `type Grid = { cols: number; rows: number; cell: number; open: Uint8Array }`
  - `parseWalkable(text: string, cell = 8): Grid`
  - `findPath(grid: Grid, from: Pt, to: Pt): Pt[]` → `[from, ...waypoints, to]`
  - `pathLength(pts: Pt[]): number`
- Algorithm:
  - Snap `from` and `to` to their nearest open cells (BFS outwards).
  - A* on 8 neighbours, diagonal cost √2, no diagonal step if either orthogonal neighbour is blocked, octile heuristic, a binary min-heap open set.
  - Waypoints are the cell centres with collinear runs collapsed.
  - The straight steps from `from` to its first cell, and from the last cell to `to`, are the "short straight step" into a seat.
  - If no route exists, return `[from, to]`. `shortcut: a straight line through furniture if the guide is ever broken; the test below keeps every real route valid.`

- [ ] **Step 1: Write the failing tests** (grid from `public/office/web/walkable.txt`, seats from Task 2):
  - `waypoints are on open cells`: for EXIT → D11, every waypoint except the first and last lies in an open cell.
  - `EXIT reaches every desk`: `findPath(EXIT, Dn)` ends at `Dn` and has more than 2 points, for n = 1..11.
  - `every desk reaches the lunch table`: `findPath(Dn, L1)` ends at `L1`.
  - `a tiny synthetic grid detours`: a 5×3 grid with a wall in the middle column (open at the bottom) routes around the wall, not through it.
- [ ] **Step 2:** Run `npx vitest run tests/office.path.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `path.ts`.
- [ ] **Step 4:** Run the test. Expected: PASS, with the file finishing in under 2 s.
- [ ] **Step 5: Commit** `git commit -m "Office: A* over the walkable grid"`.

---

### Task 6: Motion (pose at a moment)

**Files:**
- Create: `src/lib/office/motion.ts`
- Test: `tests/office.motion.test.ts`

**Interfaces:**
- Consumes: `Segment` (Task 4), `Seats` (Task 2), `Pt` and `pathLength` (Task 5).
- Produces:
  - `type Pose = { x: number; y: number; row: number; flip: boolean; walking: boolean; seat: string | null }`
  - `WALK_SPEED = 70` (px/s)
  - `poseAt(segments: Segment[], minute: number, seats: Seats, route: (from: string, to: string) => Pt[], opts?: { skipWalk?: boolean }): Pose | null`. `minute` is fractional minutes after ET midnight.
  - `sheetRow(row: number, sheetHeight: number): number` → 5 when `row === 12 && sheetHeight < 13 * 144`, else `row`.
- Rules:
  - No segment contains `minute` → `null`.
  - The previous spot is the previous segment's spot, or `"EXIT"` for the first segment.
  - The walk lasts `pathLength(route(prev, spot)) / WALK_SPEED` seconds from the segment start. During it the pose is interpolated along the polyline with `walking: true` and `seat: null`.
    - Row: `|dx| > |dy|` → 3, with `flip = dx > 0`; otherwise 1 when `dy > 0`, else 2.
    - `skipWalk` jumps straight to the arrived pose.
  - After arriving, `cr` and `leave` → `null` (inside the door).
  - Otherwise `seat = spot` and the row is:

    | Activity | Row | Flip |
    |---|---|---|
    | `arrive` / `work` | 4 | |
    | `lunch` at T | 5 | |
    | `lunch` at L | 12 | yes |
    | `lunch` at R | 12 | no |
    | `lunch` at B | 6 | |
    | `armchair` | 5 | |
    | `talk` | 8 | flip on `G1` / `G3` |
    | `laugh` | 9 | |
    | `coffee` | 7 | |
    | `workout` | 10 | |

- [ ] **Step 1: Write the failing tests.** Use hand-built segments and a fake `route` returning `[seats[from], seats[to]]`:
  - before the first segment and after the last (minutes 400 and 1100) → `null` (Review Focus 2);
  - at the arrive start → the EXIT position, `walking: true`;
  - one minute after arrive starts, when the walk is under 60 s → the desk position, row 4, `seat: "D4"`;
  - a `cr` segment after its walk → `null`;
  - a lunch at `L2` → row 12, `flip: true`; at `R3` → row 12, `flip: false`;
  - `skipWalk` at the segment start → the arrived pose;
  - a walk that mostly moves right → row 3, `flip: true`;
  - `sheetRow(12, 1728) === 5`, `sheetRow(12, 1872) === 12`, `sheetRow(4, 1728) === 4` (Review Focus 5).
- [ ] **Step 2:** Run `npx vitest run tests/office.motion.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `motion.ts`.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Office: pose at a given minute"`.

---

### Task 7: Draw order

**Files:**
- Create: `src/lib/office/layers.ts`
- Test: `tests/office.layers.test.ts`

**Interfaces:**
- Produces:
  - `type ObjectKind = "exec" | "desk" | "plant" | "lounge" | "table" | "chair"`
  - `type SceneObject = { id: number; x: number; y: number; w: number; h: number; baseline: number; kind: ObjectKind; seats: string[] }` (the `objects.json` entry)
  - `type Placed = { slug: string; x: number; y: number; seat: string | null }`
  - `type Rect = { x: number; y: number; w: number; h: number }`
  - `type DrawOp = { kind: "object"; id: number; clip: Rect | null } | { kind: "person"; slug: string }`
  - `WAIST = 40`
  - `drawOrder(objects: SceneObject[], people: Placed[]): DrawOp[]`
- Rules (spec, Rendering → Overrides):
  - Sort key = object `baseline` or person `y`; on a tie, objects come first.
  - Person seated at `A*`: key = the containing lounge object's baseline + 0.5.
  - Person seated at `B*`: key = table baseline + 1; their own chair's key = table baseline + 1.5.
  - Person seated at `T*`, `L*` or `R*`: their own chair's key = person `y − 0.5`.
  - **Post-pass**, for each person seated at `L*` in seat order, appended after the sorted list:
    1. that person again;
    2. every chair object for a higher L number and for `B1`/`B2`, clipped to `(x − 72, y − 144, 144, 144)`;
    3. the table, clipped to `(x − 72, y − WAIST, 144, WAIST)`.

- [ ] **Step 1: Write the failing tests** with synthetic objects:
  - table baseline 662;
  - chairs `L2` (baseline 540) and `L3` (baseline 590);
  - chair `B1` (baseline 686);
  - lounge with `seats: ["A1"]` (baseline 963);
  - desk baseline 600.

  Assert:
  - a walker at y 610 comes after the desk and before the table;
  - a person at `A1` (y 900) comes right after the lounge object;
  - a person at `B1` (y 665) comes after the table and before chair `B1`;
  - a person at `L2` (y 530) comes after chair `L2` and before chair `L3`;
  - the post-pass for `L2` ends with person `L2`, then chair `L3` and chair `B1` clipped to the frame rect, then the table clipped to `{ x: x − 72, y: 490, w: 144, h: 40 }`.
- [ ] **Step 2:** Run `npx vitest run tests/office.layers.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `layers.ts`.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Office: draw order with seat overrides"`.

---

### Task 8: Canvas scene, panel, and page placement

**Files:**
- Create: `src/components/office/OfficeScene.tsx` (`"use client"`), `src/components/office/OfficePanel.tsx` (`"use client"`)
- Modify: `src/app/login/page.tsx`, `src/app/va/page.tsx`

**Interfaces:**
- Consumes: `OfficePersonDTO`, `getOfficePeople` (Task 3); `parseSeats` (Task 2); `planDay`, `periodFor` (Task 4); `parseWalkable`, `findPath` (Task 5); `poseAt`, `sheetRow` (Task 6); `drawOrder`, `SceneObject` (Task 7).
- Produces: `OfficePanel({ people }: { people: OfficePersonDTO[] })` and `OfficeScene({ people }: { people: OfficePersonDTO[] })` (default export, so `next/dynamic` can load it).

- [ ] **Step 1: `OfficePanel`**
  - `const OfficeScene = dynamic(() => import("./OfficeScene"), { ssr: false })` at module level.
  - Render `<OfficeScene>` only after `matchMedia("(min-width: 1024px)")` matches, re-checked on its `change` event, so phones never fetch the chunk or the assets.
  - The wrapper is `hidden lg:block`.

- [ ] **Step 2: `OfficeScene`**
  - **Canvas and loading:**
    - One `<canvas width={1536} height={1024}>` with style `width: 100%; aspect-ratio: 3/2; image-rendering: pixelated`, `role="img"` and `aria-label="Illustration of the team's office"`.
    - In `useEffect`, so it runs after hydration, load `/office/seats.txt`, `/office/web/walkable.txt`, `/office/web/objects.json`, `/office/web/objects.png`, the current period's `bg-*.webp`, and `/office/web/<slug>.webp` for each person.
    - A shared asset that fails → render nothing (no error box). A sheet that fails → skip that person.
  - **Object canvases:** for the current bg, read the id map (red channel) and cut every object's bbox from the bg pixels where id matches, into offscreen canvases. Rebuild when `periodFor` changes.
  - **Clock:**
    - `etNow()` returns the ET date and fractional minute through Luxon `ET_ZONE`.
    - In development only (`process.env.NODE_ENV !== "production"`), `?office-time=YYYY-MM-DDTHH:mm` overrides it so reviewers can view any moment.
    - `planDay(etDate, people)` is memoised by date; routes are memoised by `"from>to"`.
  - **Frame:**
    - background → `drawOrder(objects, placed)`, executing each op, with clipping via `ctx.save/clip/restore`.
    - Person frames: `drawImage(sheet, col·144, sheetRow(row, sheet.height)·144, 144, 144, round(x − 72), round(y − 144), 144, 144)`.
    - `flip` mirrors around the feet x.
    - Frame column = `floor(performance.now() / 125) % 4` (8 fps).
    - `ctx.imageSmoothingEnabled = false`.
  - **Wave:**
    - A click maps client to canvas coordinates through `getBoundingClientRect`, then hits the topmost non-walking person whose box `(x − 30, y − 135, 60, 135)` contains the point.
    - That person draws row 11, unflipped, for 1500 ms. `shortcut: fixed hit box and walkers ignore clicks; switch to an alpha hit test if clicks feel off.`
    - The cursor is `pointer` while hovering a hit.
  - **Pausing:** the `requestAnimationFrame` loop stops while an `IntersectionObserver` reports the canvas off screen or `document.hidden` is true.
  - **Reduced motion:** with `prefers-reduced-motion: reduce`, draw with `poseAt(..., { skipWalk: true })` once, then every 60 s, with no RAF loop.

- [ ] **Step 3: Pages**
  - `/login`: on `lg`, a two-column grid. The existing centred form column is the left cell; the right cell is `<OfficePanel people={await getOfficePeople()} />` with padding. Below `lg` the page is unchanged.
  - `/va`: add `getOfficePeople()` to the existing `Promise.all`, and return a fragment: the existing `max-w-3xl` div, then `<div className="mt-10"><OfficePanel people={people} /></div>`, which is full shell width.

- [ ] **Step 4: Verify**
  - Run `npm run typecheck && npm test`. Expected: no type errors, all tests pass.
  - Then `npm run dev`, and with a desktop-width browser check:
    1. `/login?office-time=2026-11-09T10:30`: morning bg; 11 people, or fewer if someone is on PTO; everyone fully drawn at their desk or a spot; nobody hidden behind furniture they should be in front of.
    2. `?office-time=2026-11-09T12:20`: lunch seating as in the 2026-11-09 renders (execs at the top end).
    3. `?office-time=2026-11-09T07:55`: people walking in from EXIT along the aisles.
    4. `?office-time=2026-11-09T18:00`: evening bg, empty office.
    5. `?office-time=2026-11-07T12:00` (Saturday): empty.
    6. Click a seated person: they wave for about 1.5 s.
    7. At 11:59 → 12:00 with the page open, the bg switches with no stale cut-outs (Review Focus 4).
    8. Narrow the window below 1024 px and reload: the network tab shows no `/office/` requests.
    9. `/client` shows no office.
    10. `/va`: the office sits under My Day at full shell width.
- [ ] **Step 5: Commit** `git commit -m "Office: canvas scene on /login and /va"`.

---

### Task 9: Close out

**Files:**
- Modify: `CLAUDE.md` (Architecture: a short "Live office" paragraph covering the modules, the asset script, the PTO hiding and the overrides, plus `/login` and `/va` in the route map), and the spec's Status line ("Built").

- [ ] **Step 1:** Write those docs.
- [ ] **Step 2:** Run `npm run typecheck && npm test`. Expected: PASS.
- [ ] **Step 3: Commit** `git commit -m "Office: docs"`.
