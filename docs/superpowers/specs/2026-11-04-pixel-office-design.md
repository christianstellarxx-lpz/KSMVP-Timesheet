# Live Office — design

Status: built 2026-11-09 (not committed). Plan: `docs/superpowers/plans/2026-11-09-live-office.md`.

## What it is

An illustrated, animated office scene showing the team at work. It is something to watch, not a game. The only interaction is clicking a person, which makes them wave. Mon–Fri, people walk in through the exit door around 8:00 AM ET and leave around 5:00 PM ET. During the day each person works at their desk and now and then gets coffee, eats lunch, sits in the lounge, chats, laughs, works out, or visits the CR (restroom). The background follows the ET clock: sunrise in the morning, blue sky in the afternoon, night skyline in the evening, when the office is always empty.

### Where it shows

| Place | Layout |
|---|---|
| `/login` | Right half of the page. The login form moves to the left half. |
| `/va` (My Day) | Last section of the page, full width of the VA shell (`max-w-6xl`). The reading column above stays `max-w-3xl`. |

- Desktop only (`lg` and up). Below `lg` it is not rendered, and none of its assets are fetched.
- It does **not** appear on the admin dashboard (`/client`) or anywhere else.

### Decisions already made

- **Who is in the office:** 11 people, one desk each, no spare desks. Rodney Monasque and Stephanie Mays are not in the office.
- **Marc (CIO)** exists only in the office. He has no account and no seed entry, and he is never hidden.
- **PTO:** anyone with a PTO `TimeEntry` for today (ET) is hidden for the whole day.
  - Admins can't log PTO, so Kevin and Tanya always show.
  - Removed members (`removedAt` set) are hidden too.
- **Workdays:** Mon–Fri. US holidays count as workdays.
- **No database changes.** Waves are local to the viewer's browser and are not stored or shared.
- **Art style:** pixel-art look, drawn with pixelated rendering (see Rendering).

## Assets (`public/office/`)

The art is 1536×1024 (3:2). It is not the 2040×1360 first asked for, and every coordinate in this spec is in 1536×1024 space.

| File | What it is | Status |
|---|---|---|
| `bg-morning.png`, `bg-afternoon.png`, `bg-evening.png` | Full scene, one per time of day | ✅ |
| `fg-executive.png`, `fg-desks-row1.png`, `fg-desks-row2.png`, `fg-plants.png` | Cutouts, used as masks only (see Rendering) | ⚠️ AI-redrawn, so their edges are a few px off the bg (29–60% of pixels differ). The monitor tops reach ~4 px too high and paint a strip of chair over each sitter's chest. Re-cut from a copy of the bg, as was done for `fg-lunch.png` (0 px off). An automatic rim trim was tried and rejected: it cut away too much. |
| `fg-lunch.png` | The table only, without the chairs. Mask only. | ✅ re-cut 2026-11-09, matches the bg exactly |
| `fg-lounge.png` | Armchairs and tables (not the rugs). Mask only. | ✅ re-cut 2026-11-09, aligned |
| `fg-lunch-chairs.png` | All 14 lunch chairs, cut from the bg. Mask only; split into one chair per seat (see Rendering). | ✅ 2026-11-09 |
| `layout-guide.png` | Green = walkable floor | ✅ |
| `seats.txt` | Feet points for every spot (format documented in the file) | ✅ re-measured 2026-11-09; L/R/B re-measured from `fg-lunch-chairs.png` the same day; every desk row uses one offset, seat y = monitor top + 66 (exec 277, back row 492, front row 650), so the face, collar and tie show and the monitor edge sits on the chest |
| `characters/<slug>.png` | Sprite sheet built by `scripts/office-sprite.py` from `_chunks/` | All 11 + `_generic` ✅. Kevin, Marc and Tanya have no row 12 and don't need one: they only sit at the top end (row 5). |
| `_chunks/<slug>-A/B/C/D.png` | Source art for the sprite sheets. Keep this folder. D may be any width: the poses are split at the gaps between them. | Everyone A–D, except Kevin, Marc and Tanya (A–C) |

**Sprite sheet layout:**
- Frames are 144×144, in 4 columns. Every person stands 131 px tall.
- The bottom-centre of a frame is the person's feet point.
- Rows, by chunk:
  - A: 0 idle, 1 walk down, 2 walk up, 3 walk left (mirrored for walking right)
  - B: 4 sit-typing, 5 sit-eat facing the viewer, 6 sit-eat with back to the viewer, 7 coffee
  - C: 8 talk facing left (mirrored for right), 9 laugh, 10 workout, 11 wave
  - D: 12 sit-eat in profile facing left (mirrored for right)
- D is scaled so the seated figure is as tall as the same person's row 5, which keeps all their seated rows the same size.
- A sheet without row 12 is 576×1728; with it, 576×1872. The office reads the sheet height: with no row 12, side seats (L/R) use row 5 instead. Adding the D chunk and re-running the script needs no code change.

**Character slugs** are the lowercase full name joined with hyphens: `kevin-spann`, `tanya-crawford`, `marc-fey`, `kristine-te`, `jonathan-sarong`, `christian-lopez`, `bryxter-bulisig`, `gianfranco-adana`, `jeannyn-jereza`, `ginger-mesias`, `venus-paglinawan`.

**Web weight:** each bg PNG is about 2.7 MB. `scripts/office-assets.py` writes what the browser loads into `public/office/web/`:
- each bg as WebP quality 80 (about 300 KB); only the current time of day's bg is fetched;
- each character sheet as WebP quality 90 (about 220 KB);
- `objects.png` + `objects.json` (see Rendering) instead of the fg PNGs, and `walkable.txt` instead of `layout-guide.png`.
- `public/office/_chunks/` is source art: kept on disk, git-ignored, never deployed.

## Seats and spots (`seats.txt`)

| Code | Spot | Count | Pose |
|---|---|---|---|
| D1–D11 | Desks, fixed per person (table below) | 11 | sit-typing |
| T1–T3 | Lunch table, top end | 3 | sit-eat facing the viewer |
| L1–L4 | Lunch table, left side | 4 | profile facing right |
| R1–R5 | Lunch table, right side | 5 | profile facing left |
| B1–B2 | Lunch table, bottom end | 2 | sit-eat with back to the viewer |
| A1–A4 | Armchairs | 4 | sit |
| G1/G2, G3/G4 | Stand-and-talk pairs (each pair faces each other) | 4 | talk or laugh |
| C1–C3 | Coffee bar | 3 | coffee |
| W1–W3 | Workout | 3 | workout |
| EXIT, CR | Doors | 2 | — |

The lunch table has 14 chairs, not the 15 reported earlier.

| Desk | Person |
|---|---|
| D1 | Kevin |
| D2 | Tanya |
| D3 | Marc |
| D4 | Kristine |
| D5 | Jonathan |
| D6 | Christian |
| D7 | Bryxter |
| D8 | Gianfranco |
| D9 | Jeannyn |
| D10 | Ginger |
| D11 | Venus |

## Architecture

```
scripts/office-assets.py  # offline: bg/sheet WebP, walkable grid, object id map + chair split
src/lib/office/
  roster.ts      # the 11 office people: slug, desk, account (Marc: false) + visibleMembers(). Shared, so no emails.
  retryCache.ts  # load-once cache that retries a failed bg load (pages left open all day).
  seats.ts       # pure: parse seats.txt text.
  schedule.ts    # pure: (etDate, people) -> each person's day as segments; periodFor(). No I/O.
  path.ts        # pure: grid A* over walkable.txt.
  motion.ts      # pure: (segments, minute) -> where a person is and which sprite row.
  layers.ts      # pure: draw order with the overrides in Rendering.
src/lib/officeRoster.ts   # server-only: login emails + who is visible today (PTO / removed); null on a DB error
src/components/office/
  OfficeScene.tsx         # "use client": canvas, asset loading, animation loop, click-to-wave
  OfficePanel.tsx         # lg-only wrapper; dynamic-imports OfficeScene with ssr:false
```

### Server: who is visible

`getOfficePeople()` in `src/lib/officeRoster.ts` (`import "server-only"`):
1. It looks up the roster emails with `removedAt: null`, plus any `TimeEntry` with `entryType: "PTO"` on `etToday()`.
2. It returns a DTO, `{ slug, desk, firstName }[]`, for the people to show. Marc is always included.
3. `/login/page.tsx` and `/va/page.tsx` each call it and pass the result to `OfficePanel`.

There are no new routes or actions.

**Privacy:** the login page is public, so anyone can see who is missing from the office today and infer that they are on PTO. The login page already lists every name, so this exposes only "who is off today". It is accepted as part of "hide PTO". If that is not OK, hide the office on `/login` (or stop hiding PTO there).

### Schedule (deterministic)

**Goal:** every viewer sees the same office at the same moment, with no server state.
- A person's day is a pure function of `(ET date, person slug)`, seeded with a small integer hash. No `Math.random`.
- Their position at any instant is a pure function of that day plus the current ET time.

**Day plan per person:**
1. **Arrive:** between 7:50 and 8:10 AM ET. They walk from EXIT to their desk.
2. **The day** is split into 15-minute slots from 8:15 AM to 4:45 PM. Each slot is one activity:
   - `work` (desk): most slots.
   - `coffee`: about 2 a day.
   - `lunch`: one 45–60 minute block between 11:30 AM and 1:30 PM.
   - `lounge`: armchair, or a talk/laugh pair.
   - `workout`: about 1 a day, not for everyone.
   - `cr`: walk into the CR door, hidden for a few minutes, walk back.
3. **Leave:** between 5:00 and 5:10 PM ET. They walk from their desk to EXIT and disappear.

**Shared spots** (lunch chairs, armchairs, talk pairs, coffee, workout):
- Spots are handed out per slot in roster order. Each person takes the first free spot for their activity; if none is free, they work instead.
- The top end of the lunch table belongs to the executives, in their desk order: Tanya T1, Kevin T2, Marc T3. Nobody else sits there, and they sit nowhere else at lunch. The VAs share L1–L4, R1–R5 and B1–B2.
- A talk pair only happens when two people both drew `lounge` in the same slot. Otherwise the person takes an armchair.

**Within a slot:**
- The person walks from their previous spot along the A* path at a fixed speed, then plays the activity's loop.
- Walking time comes out of the slot.
- Positions are recomputed from the clock every frame, so a page opened mid-day lands people where they should be. Nobody "spawns at their desk".

**Weekends:** the office is empty all day.

**Time of day (ET), which also picks the background:**

| Background | Hours | Office |
|---|---|---|
| Morning | 5:00–11:59 AM | — |
| Afternoon | 12:00–4:59 PM | — |
| Evening | 5:00 PM–4:59 AM | empty once everyone has walked out |

Use `ET_ZONE` and Luxon from `src/lib/time.ts`. Never hardcode an offset.

### Pathfinding

- Build a walkable grid once from `layout-guide.png` (green pixels), with 8 px cells.
- Desks, the lunch table and lounge furniture are not green, so paths go around them.
- The gaps between desks in a row (about 22 px) are narrower than a person, so walkers use the row ends and the aisles.
- Seats sit inside furniture, so a path ends at the walkable cell nearest the seat, and a short straight step finishes the move.
- Walkers don't avoid each other; people may pass through one another.
  - `shortcut: no walker-walker avoidance, add if overlaps look bad.`

### Rendering

- One `<canvas>` with a 1536×1024 backing store, scaled by CSS to its container. `devicePixelRatio` is capped at 2. `image-rendering: pixelated` and `imageSmoothingEnabled = false` (the user's choice, 2026-11-09). Everything is drawn at whole source-pixel positions. Known trade-off: when the panel is narrower than 1536 px, some pixels drop and walkers can shimmer slightly.
- **Draw order, each frame:**
  1. Background.
  2. All *objects* and all people, sorted by baseline y.
     - A person's baseline is their feet y.
     - An object's baseline is its lowest pixel.
  3. Click-wave and name effects (none planned beyond the wave).
- **Objects:**
  - Worked out offline by `scripts/office-assets.py`: each `fg-*.png` alpha mask (alpha ≥ 128) is split into connected parts (dilated 4 px), and each part is one object. The result is `objects.png` (pixel value = object id) and `objects.json` (id, bbox, baseline, kind, seats). Re-run the script whenever an fg file changes.
  - A workstation draws back to front as: chair (part of the bg), the person, then the desk object (desk, monitor and props are one mask). The desk is cut from the same bg pixels, so there is no seam where it meets the person.
  - An object's pixels come from the **current bg**, not from the fg file. The AI-redrawn fg art never lines up exactly, while bg pixels always match whichever bg is showing.
  - At load, each object is cut from the current bg with the id map and cached as an offscreen canvas; this is redone when the bg changes.
- **Overrides:**
  - A person seated in an armchair (A1–A4) draws above that armchair's object.
  - A left-side lunch diner (L1–L4) draws above the table, and the table is then redrawn over the bottom 40 px of their frame (the legs). Without this, the table's diagonal edge hides their face.
  - Right-side diners (R1–R5) use the normal draw order.
  - **Lunch chairs:** `fg-lunch-chairs.png` is one joined shape, so it is split into one object per seat at load. The 3 top-end chairs (T) stand apart. For the sides, the asset script holds an outline of the front-most chair on each side (L4, R5) and the shift to each chair behind it. Where outlines overlap, the lower chair wins, because it hides the one behind it in the art. B1/B2 are boxes. Each chair's baseline is its lowest pixel, so a chair in front of a diner covers them.
  - A diner draws above their own chair, except at B1/B2. Those diners face away from us, so their chair back is in front of them.
  - B1/B2 diners draw above the table (they sit in front of its end), with their chair above them.
  - A left-side diner's redraw also puts back the chairs in front of them (lower L chairs and B1).
- **Seat checks done 2026-11-09 against the afternoon bg:**
  - Desk fronts hide a seated person's legs, and faces clear the monitors. Re-checked on all 11 desks with every row at monitor top + 66: no chin or face is under a monitor, and no sprite frame touches its edge (`office-sprite.py` also warns if one would).
  - Walkers between the two VA rows are in front of the back row and behind the front row.
  - Talk spots stand in front of the lounge tables.
  - All 14 lunch seats and the 4 armchairs checked with the full team the same day; the left side is crowded because the chairs in the art are close together.
- **Animation:** 8 fps sprite frames. Movement is interpolated at display rate.

### Interaction

- Clicking (or tapping) a person plays the wave row once, for about 1.5 s, then they carry on.
- Hit test: the topmost person whose frame's non-transparent box contains the point.
- The cursor is a pointer over a person.
- Nothing is sent to the server.

### Performance and accessibility

- `OfficePanel` renders nothing below `lg`. It checks `matchMedia("(min-width: 1024px)")` before importing `OfficeScene`, so phones download none of it.
- Assets load after the page is interactive. On `/login` the form must never wait on the office.
- The animation loop stops when the canvas is off screen (`IntersectionObserver`) or the tab is hidden (`visibilitychange`).
- **`prefers-reduced-motion`:** draw one still frame of the current scene, refresh it once a minute, and skip walking.
- The canvas is `role="img"` with an `aria-label` such as "Illustration of the team's office". It holds no information that isn't elsewhere, so it is not keyboard-interactive.
- **If an asset fails to load:** show nothing, without an error box. If one character sheet is missing, skip that person.

## Testing

- `tests/office.schedule.test.ts`:
  - The same inputs give the same output.
  - Weekends are empty.
  - Everyone is at their desk by 8:15 AM and gone by 5:15 PM.
  - Nobody shares a spot in any slot.
  - Lunch falls inside 11:30 AM–1:30 PM.
  - A hidden person is never scheduled into a pair.
  - DST dates resolve through Luxon.
- `tests/office.path.test.ts`: a path stays on walkable cells, and the routes from EXIT to every desk and from every desk to the lunch table exist.
- `tests/office.seats.test.ts`: `seats.txt` parses, and every code in the tables above is present.
- **Visual check:** a throwaway composite render per bg. The 2026-11-09 renders cover the afternoon only; morning and evening are still unchecked.
- `npm run typecheck` and `npm test`.

## Art still open

Nothing blocks the build. Still open, none of it blocking:
1. Re-cut `fg-executive.png`, `fg-desks-row1.png`, `fg-desks-row2.png` and `fg-plants.png` from a copy of the bg.
2. A render check against the morning and evening backgrounds.

## Out of scope

- Showing the office on `/client` or on mobile.
- Saving waves, or showing other viewers' waves.
- Live presence (people appearing because they actually did Start of Day). The office follows its own schedule; only PTO and removal hide someone.
- Sounds, speech-bubble text, and new hires automatically getting a desk. A new hire needs a desk in the art, a `seats.txt` line and a roster entry.
