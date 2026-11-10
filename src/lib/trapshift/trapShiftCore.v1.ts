/**
 * Trap Shift: deterministic game core.
 *
 * Shared by the browser (to play) and the server (to verify).
 * Rules for this file:
 *   - No Math.random, no Date, no DOM, no Math.sin/cos/pow. Only + - * / and Math.min/max/floor/imul.
 *   - All randomness comes from the run's seeded RNG, consumed in a fixed order.
 *   - The only input is one 3-bit value per fixed 60 Hz step: 1 = left, 2 = right, 4 = jump held.
 * Changing any constant, level, or rule here changes replays. Bump REPLAY_VERSION when you do.
 */

export const REPLAY_VERSION = 1;
export const W = 960, H = 540, G = 460;            // view size and ground top
export const STEP_HZ = 60;
export const MAX_ATTEMPTS_PER_DAY = 3;
export const MAX_FRAMES = STEP_HZ * 60 * 15;       // 15 minutes of play per run, hard cap
export const MAX_LOG_PAIRS = 60000;
export const LEVEL_POINTS = 100, CLEAR_BONUS = 25;  // distance 0 to 100 per level, +25 for solving it
export const PERFECT_SCORE = 3 * (LEVEL_POINTS + CLEAR_BONUS); // 375

const GRAV = 0.6, JUMP = -11.6, DJUMP = -10.2, SPEED = 4.3, MAXFALL = 14;
const CLEAR_FRAMES = 70;

/* ---------- types ---------- */
export type Bits = number;                    // 0..7
export type InputLog = [Bits, number][];      // run-length encoded: [bits, frames]
export type Route = 0 | 1;                    // 0 = A, 1 = B
export type Cause = "fake" | "delay" | "popup" | "spike" | "slider" | "faller" | "pit" | "thrown" | "launch" | "wall";
export type Phase = "play" | "clear" | "over";
type SolidKind = "ground" | "fake" | "delay" | "hidden";
type ThrowKind = "low" | "drop" | "back" | "air";

export interface Box { x: number; y: number; w: number; h: number }
export interface Solid extends Box { kind: SolidKind; falling?: boolean; vy?: number; timer?: number; shown?: boolean }
export interface Spike { x: number; base: number; w: number; hgt: number; kind: "spike" | "popup" | "slider"; trigger?: number; live?: boolean; vx?: number; stopX?: number }
export interface Faller extends Box { from: number; to: number; floor: number; vy: number; drop: boolean; landed: boolean; launch?: boolean; sit?: number }
export interface Wall { trigger: number; camX: number; phase?: "warn" | "go" | "done"; t?: number; x?: number }
export interface Goal { x: number; run: null | { trigger: number; to: number; moving: boolean } }
export interface LevelObjects { solids: Solid[]; spikes: Spike[]; fallers: Faller[]; wall?: Wall; goal: Goal }
interface ThrowCfg { first: number; gap: [number, number]; kinds: ThrowKind[]; bluff?: number }
export interface LevelDef { name: string; tip: string; start: number; length: number; thr: ThrowCfg; build: () => LevelObjects }
export interface Warn { kind: ThrowKind; x: number; y: number; t: number; bluff: boolean }
export interface Proj extends Box { kind: ThrowKind; vx: number; vy: number; g: number; life: number; stuck?: number }
export interface Player extends Box {
  vx: number; vy: number; onGround: boolean; coyote: number; face: number; air: number;
  standing: Solid | Faller | null; dropCause: "" | "fake" | "delay"; launched: boolean;
}
/** Cosmetic events for the renderer. The server ignores them. */
export type FxEvent =
  | { t: "burst"; x: number; y: number; c: string; n: number }
  | { t: "shake"; n: number }
  | { t: "levelClear"; level: number }
  | { t: "levelStart"; level: number }
  | { t: "over"; won: boolean; cause: Cause | null };

export interface RunState {
  seed: number; routes: Route[]; rngState: number;
  li: number; def: LevelDef; lv: LevelObjects; p: Player;
  cam: number; maxX: number; banked: number; cleared: number;
  prevJ: boolean; jumpBuffer: number; throwT: number;
  warns: Warn[]; proj: Proj[];
  frame: number; phase: Phase; clearT: number;
  won: boolean; cause: Cause | null; finalPct: number;
  /** true for one step after a new level loads; the client pauses on it to show the level intro */
  levelJustStarted: boolean;
  events: FxEvent[] | null;
}

export interface RunResult {
  points: number;          // the score that counts
  cleared: number;         // levels solved, 0..3
  levelReached: number;    // 1..3
  pct: number;             // distance on the level where the run ended (0 if won)
  frames: number;
  ended: "won" | "died" | "quit";
  cause: Cause | null;
  replayVersion: number;
}

/* ---------- seeded RNG (mulberry32) ---------- */
function rand(s: RunState): number {
  s.rngState = (s.rngState + 0x6d2b79f5) | 0;
  let t = s.rngState;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/* ---------- level pieces ---------- */
const ground = (x: number, w: number): Solid => ({ x, y: G, w, h: H - G + 40, kind: "ground" });
const block = (x: number, top: number, w: number, h = 18): Solid => ({ x, y: top, w, h, kind: "ground" });
const fake = (x: number, w: number, top = G, h = H - G + 40): Solid => ({ x, y: top, w, h, kind: "fake" });
const delay = (x: number, top: number, w: number, h = 18): Solid => ({ x, y: top, w, h, kind: "delay", timer: -1 });
const hidden = (x: number, top: number, w: number, h = 20): Solid => ({ x, y: top, w, h, kind: "hidden", shown: false });
const spike = (x: number, base: number, w = 30): Spike => ({ x, base, w, hgt: 22, kind: "spike" });
const popup = (x: number, base: number, w: number, trigger: number): Spike => ({ x, base, w, hgt: 0, kind: "popup", trigger, live: false });
const slider = (x: number, base: number, trigger: number, vx: number, stopX: number): Spike => ({ x, base, w: 34, hgt: 22, kind: "slider", trigger, vx, stopX, live: false });
const faller = (x: number, top: number, w: number, h: number, from: number, to: number, floor: number, launch = false): Faller =>
  ({ x, y: top, w, h, from, to, floor, vy: 0, drop: false, landed: false, launch, sit: 0 });

/* thrown-spike settings per level: first delay, gap range (frames), kinds, share of fake warnings */
const T1: ThrowCfg = { first: 140, gap: [170, 260], kinds: ["low", "drop", "air"], bluff: 0.35 };
const T2: ThrowCfg = { first: 120, gap: [135, 215], kinds: ["low", "drop", "back", "air"] };
const T3: ThrowCfg = { first: 100, gap: [105, 170], kinds: ["low", "drop", "back", "air"] };

/** LEVELS[level][route]. Route letters are never shown to players. */
export const LEVELS: LevelDef[][] = [
  [
    { name: "Clock In", tip: "Easy start. Probably.", start: 60, length: 2700, thr: T1,
      build: () => ({
        solids: [ground(0, 700), fake(700, 170), ground(870, 400), hidden(1330, 300, 40), ground(1440, 940), hidden(1995, 350, 40), fake(2380, 90), ground(2470, 230), block(2700, 0, 40, 560)],
        spikes: [popup(1050, G, 32, 985), spike(2000, G, 36), spike(2240, G, 30), popup(2290, G, 30, 2200)],
        fallers: [faller(1700, 110, 64, 54, 1640, 1790, G, true)],
        wall: { trigger: 1850, camX: 1510 },
        goal: { x: 2560, run: null } }) },
    { name: "Clock In", tip: "Same office. Different lies.", start: 60, length: 2700, thr: T1,
      build: () => ({
        solids: [ground(0, 500), hidden(570, 300, 40), ground(660, 560), delay(1260, 430, 90), block(1400, 420, 90), hidden(1440, 290, 40), ground(1540, 940), hidden(1700, 372, 42), fake(2470, 80), ground(2550, 150), block(2700, 0, 40, 560)],
        spikes: [popup(300, G, 30, 240), popup(340, G, 30, 240), spike(2100, G, 34), slider(2420, G, 1960, -4.2, 1540)],
        fallers: [faller(800, 110, 64, 54, 760, 880, G)],
        wall: { trigger: 1880, camX: 1540 },
        goal: { x: 2600, run: null } }) },
  ],
  [
    { name: "Inbox Zero", tip: "Two roads. One is a lie.", start: 60, length: 2640, thr: T2,
      build: () => ({
        solids: [ground(0, 880), block(1000, 400, 280), fake(1020, 280), ground(1300, 580), hidden(1560, 372, 42), hidden(1940, 300, 40), ground(2040, 600), block(2640, 0, 40, 560)],
        spikes: [spike(380, G, 30), popup(540, G, 32, 430), popup(650, G, 32, 520), slider(1830, G, 1420, -4.5, 1290), popup(2430, G, 32, 2380)],
        fallers: [faller(2250, 100, 70, 56, 2195, 2330, G)],
        goal: { x: 2500, run: null } }) },
    { name: "Inbox Zero", tip: "The high road looks nice today.", start: 60, length: 2660, thr: T2,
      build: () => ({
        solids: [ground(0, 580), hidden(640, 300, 40), ground(740, 460), fake(1240, 320, 400, 18), block(1250, 470, 90), block(1400, 470, 90), ground(1560, 1100), hidden(2050, 372, 42), block(2660, 0, 40, 560)],
        spikes: [slider(540, G, 120, -4, -60), popup(890, G, 80, 820), popup(2090, G, 30, 2030), popup(2200, G, 30, 2140)],
        fallers: [faller(1800, 100, 70, 56, 1750, 1880, G)],
        goal: { x: 2440, run: { trigger: 2340, to: 2580, moving: false } } }) },
  ],
  [
    { name: "End of Day", tip: "The finish line has trust issues.", start: 60, length: 3050, thr: T3,
      build: () => ({
        solids: [ground(0, 420), block(500, 430, 80), hidden(615, 290, 40), delay(690, 410, 80), hidden(805, 300, 40), block(880, 430, 80), block(1070, 400, 110), ground(1270, 710), hidden(2045, 300, 40), ground(2150, 860), block(3010, 0, 40, 560)],
        spikes: [popup(1146, 400, 30, 1062), popup(1720, G, 30, 1655), popup(1752, G, 30, 1655), popup(2700, G, 40, 2640)],
        fallers: [faller(1500, 90, 70, 56, 1450, 1590, G)],
        goal: { x: 2700, run: { trigger: 2560, to: 2920, moving: false } } }) },
    { name: "End of Day", tip: "Overtime. Everything is angry.", start: 60, length: 3050, thr: T3,
      build: () => ({
        solids: [ground(0, 380), delay(460, 430, 80), block(630, 400, 80), hidden(720, 280, 40), block(790, 380, 90), block(960, 410, 80), delay(1110, 400, 80), ground(1270, 680), hidden(2010, 300, 40), ground(2110, 90), fake(2200, 90), ground(2290, 720), block(3010, 0, 40, 560)],
        spikes: [popup(850, 380, 30, 800), popup(1800, G, 30, 1740), slider(1900, G, 1350, -3.5, 1270), popup(2650, G, 40, 2580), popup(2820, G, 30, 2760), popup(2852, G, 30, 2760)],
        fallers: [faller(1600, 90, 70, 56, 1560, 1680, G)],
        goal: { x: 2650, run: { trigger: 2500, to: 2900, moving: false } } }) },
  ],
];

/* ---------- helpers ---------- */
export const overlap = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export const isSolid = (s: Solid) => s.kind === "ground" || ((s.kind === "fake" || s.kind === "delay") && !s.falling) || (s.kind === "hidden" && !!s.shown);
const solidNow = (s: Solid | Faller) => ("kind" in s ? isSolid(s) : s.landed);
const goalEnd = (lv: LevelObjects) => (lv.goal.run ? lv.goal.run.to : lv.goal.x);
const emit = (s: RunState, e: FxEvent) => { if (s.events) s.events.push(e); };

/** Routes for a try. Every new try flips every level's route; the starting mix changes by day. */
export function routesFor(attemptNo: number, playedOn: string): Route[] {
  const daySeed = parseInt(playedOn.slice(-2), 10) % 2;
  return [0, 1, 2].map(i => ((attemptNo - 1 + i + daySeed) % 2) as Route);
}

export function levelPct(s: RunState): number {
  const span = goalEnd(s.lv) - s.def.start;
  return Math.max(0, Math.min(100, Math.floor(((s.maxX - s.def.start) / span) * 100)));
}
/** Live score of a run in progress, or the final score once over. */
export function currentPoints(s: RunState): number {
  if (s.phase === "over") return s.banked + (s.won ? 0 : s.finalPct);
  if (s.phase === "clear") return s.banked;
  return s.banked + levelPct(s);
}

function loadLevel(s: RunState, i: number) {
  s.li = i;
  s.def = LEVELS[i][s.routes[i]];
  s.lv = s.def.build();
  s.proj = []; s.warns = []; s.throwT = s.def.thr.first;
  s.p = { x: s.def.start, y: G - 34, w: 26, h: 34, vx: 0, vy: 0, onGround: true, coyote: 6, face: 1, air: 1, standing: null, dropCause: "", launched: false };
  s.maxX = s.def.start; s.cam = 0; s.clearT = 0; s.jumpBuffer = 0;
  s.levelJustStarted = true;
  emit(s, { t: "levelStart", level: i });
}

export function createRun(seed: number, routes: Route[], withEvents = true): RunState {
  if (!Number.isInteger(seed)) throw new Error("seed must be an integer");
  if (routes.length !== 3 || routes.some(r => r !== 0 && r !== 1)) throw new Error("routes must be three 0/1 values");
  const s = {
    seed, routes: routes.slice(), rngState: seed | 0,
    cam: 0, maxX: 0, banked: 0, cleared: 0, prevJ: false, jumpBuffer: 0, throwT: 0,
    warns: [], proj: [], frame: 0, phase: "play", clearT: 0, won: false, cause: null, finalPct: 0,
    levelJustStarted: false, events: withEvents ? [] : null,
  } as unknown as RunState;
  loadLevel(s, 0);
  return s;
}

function die(s: RunState, cause: Cause) {
  s.finalPct = levelPct(s);
  s.cause = cause; s.phase = "over"; s.won = false;
  emit(s, { t: "shake", n: 14 });
  emit(s, { t: "burst", x: s.p.x + s.p.w / 2, y: Math.min(H - 10, s.p.y + s.p.h / 2), c: "#F67F25", n: 18 });
  emit(s, { t: "over", won: false, cause });
}

/** Advance one fixed 60 Hz step. bits: 1 = left, 2 = right, 4 = jump held. */
export function step(s: RunState, bits: Bits): void {
  if (s.phase === "over") return;
  s.frame++;
  s.levelJustStarted = false;
  const left = (bits & 1) !== 0, right = (bits & 2) !== 0, jumpHeld = (bits & 4) !== 0;
  if (jumpHeld && !s.prevJ) s.jumpBuffer = 7;
  s.prevJ = jumpHeld;

  if (s.phase === "clear") {
    if (--s.clearT <= 0) {
      if (s.li >= LEVELS.length - 1) { s.phase = "over"; s.won = true; s.finalPct = 0; emit(s, { t: "over", won: true, cause: null }); }
      else { s.phase = "play"; loadLevel(s, s.li + 1); }
    }
    return;
  }

  const p = s.p, lv = s.lv;

  // movement intent and jumps (coyote time, jump buffer, one air jump)
  p.vx = p.launched ? 0 : (right ? SPEED : 0) - (left ? SPEED : 0);
  if (p.vx) p.face = p.vx > 0 ? 1 : -1;
  if (s.jumpBuffer > 0) s.jumpBuffer--;
  if (s.jumpBuffer > 0 && p.coyote > 0) { p.vy = JUMP; s.jumpBuffer = 0; p.coyote = 0; p.onGround = false; p.air = 1; }
  else if (s.jumpBuffer > 0 && p.air > 0 && !p.onGround && !p.launched) {
    p.vy = DJUMP; s.jumpBuffer = 0; p.air = 0;
    emit(s, { t: "burst", x: p.x + p.w / 2, y: p.y + p.h, c: "#FBCE1B", n: 7 });
  }
  if (!jumpHeld && !p.launched && p.vy < -4.5) p.vy = -4.5;   // short hop when released early
  p.vy = Math.min(MAXFALL, p.vy + GRAV);

  const solids: (Solid | Faller)[] = (lv.solids as (Solid | Faller)[]).concat(lv.fallers.filter(f => f.landed));
  // move X
  p.x += p.vx;
  for (const b of solids) {
    if (!solidNow(b)) continue;
    if (overlap(p, b)) { if (p.vx > 0) p.x = b.x - p.w; else if (p.vx < 0) p.x = b.x + b.w; }
  }
  if (p.x < 0) p.x = 0;
  // move Y
  const prevTop = p.y, prevBottom = p.y + p.h;
  p.y += p.vy; p.onGround = false; p.standing = null;
  for (const b of solids) {
    if ("kind" in b && b.kind === "hidden" && !b.shown) {
      if (p.vy < 0 && prevTop >= b.y + b.h - 0.01 && overlap(p, b)) {
        b.shown = true; p.y = b.y + b.h; p.vy = 0;
        emit(s, { t: "burst", x: p.x + p.w / 2, y: b.y + b.h, c: "#FBCE1B", n: 6 });
      }
      continue;
    }
    if (!solidNow(b)) continue;
    if (overlap(p, b)) {
      if (p.vy > 0 && prevBottom <= b.y + 0.01) { p.y = b.y - p.h; p.vy = 0; p.onGround = true; p.standing = b; }
      else if (p.vy < 0) { p.y = b.y + b.h; p.vy = 0; }
      else if (p.vy > 0) { p.y = b.y - p.h; p.vy = 0; p.onGround = true; p.standing = b; }
    }
  }
  p.coyote = p.onGround ? 6 : Math.max(0, p.coyote - 1);
  if (p.onGround) p.air = 1;

  // floors that betray you
  const st = p.standing;
  if (st) {
    if ("kind" in st && st.kind === "fake") { st.falling = true; st.vy = 1; p.dropCause = "fake"; }
    else if ("kind" in st && st.kind === "delay" && (st.timer ?? -1) < 0) { st.timer = 13; }
    else if (!("kind" in st) || st.kind === "ground") p.dropCause = "";
  }
  for (const b of lv.solids) {
    if (b.kind === "delay" && (b.timer ?? 0) > 0) { b.timer = (b.timer as number) - 1; if (b.timer === 0) { b.falling = true; b.vy = 1; if (p.standing === b) p.dropCause = "delay"; } }
    if (b.kind === "delay" && b.falling && p.standing === b) p.dropCause = "delay";
    if ((b.kind === "fake" || b.kind === "delay") && b.falling) { b.vy = (b.vy ?? 0) + 0.7; b.y += b.vy; }
  }

  // spikes
  for (const k of lv.spikes) {
    if (k.kind === "popup" && !k.live && p.x + p.w > (k.trigger as number)) k.live = true;
    if (k.kind === "popup" && k.live && k.hgt < 22) k.hgt = Math.min(22, k.hgt + 8);
    if (k.kind === "slider" && !k.live && p.x + p.w > (k.trigger as number)) k.live = true;
    if (k.kind === "slider" && k.live && k.x > (k.stopX as number)) k.x += k.vx as number;
    if (k.hgt > 8 && overlap(p, { x: k.x + 5, y: k.base - k.hgt + 6, w: k.w - 10, h: k.hgt - 6 })) return die(s, k.kind);
  }

  // falling cabinets
  const pc = p.x + p.w / 2;
  for (const f of lv.fallers) {
    if (!f.drop && pc > f.from && pc < f.to) f.drop = true;
    if (f.drop && !f.landed) {
      f.vy = Math.min(20, f.vy + 1.3); f.y += f.vy;
      if (f.y + f.h >= f.floor) {
        f.y = f.floor - f.h; f.landed = true;
        emit(s, { t: "shake", n: 8 }); emit(s, { t: "burst", x: f.x + f.w / 2, y: f.floor, c: "#C9CEE8", n: 10 });
      }
      if (overlap(p, f)) return die(s, "faller");
    }
  }
  // launch cabinet: stand on it for 60 steps (1 second) and it fires you into the sky
  for (const f of lv.fallers) {
    if (!f.launch || !f.landed || p.launched) continue;
    if (p.standing === f) {
      f.sit = (f.sit ?? 0) + 1;
      if (f.sit >= 60) { p.launched = true; p.vy = -24; p.onGround = false; emit(s, { t: "shake", n: 12 }); emit(s, { t: "burst", x: p.x + p.w / 2, y: f.y, c: "#FBCE1B", n: 16 }); }
    } else f.sit = 0;
  }
  if (p.launched && p.y < -60) return die(s, "launch");

  // spike wall: camera locks, 60-step warning, wall sweeps left and vanishes just before the left edge
  const wd = lv.wall;
  if (wd && !wd.phase && p.x > wd.trigger) { wd.phase = "warn"; wd.t = 60; s.warns = []; }
  if (wd && wd.phase === "warn") { wd.t = (wd.t as number) - 1; if (wd.t <= 0) { wd.phase = "go"; wd.x = wd.camX + W + 10; } }
  if (wd && wd.phase === "go") {
    wd.x = (wd.x as number) - 9;
    if (wd.x <= wd.camX + 50) { wd.phase = "done"; for (let y = 30; y < G; y += 60) emit(s, { t: "burst", x: wd.x + 10, y, c: "#F2F3FA", n: 4 }); }
    else if (overlap(p, { x: wd.x + 4, y: -400, w: 24, h: G + 400 })) return die(s, "wall");
  }
  const walling = !!wd && (wd.phase === "warn" || wd.phase === "go");
  if (walling) p.x = Math.max(s.cam, Math.min(s.cam + W - p.w, p.x));

  // thrown spikes (paused during the wall). RNG order: gap, kind, bluff.
  const thr = s.def.thr;
  if (!walling) {
    s.throwT--;
    if (s.throwT <= 0) {
      s.throwT = thr.gap[0] + Math.floor(rand(s) * (thr.gap[1] - thr.gap[0]));
      const kind = thr.kinds[Math.floor(rand(s) * thr.kinds.length)];
      const bluff = rand(s) < (thr.bluff ?? 0);
      if (kind === "drop") s.warns.push({ kind, x: Math.max(s.cam + 40, Math.min(s.cam + W - 60, p.x + p.vx * 38)), y: 0, t: 42, bluff });
      else s.warns.push({ kind, x: 0, y: kind === "air" ? p.y - 52 : p.y + p.h - 17, t: 45, bluff });
    }
  }
  for (const w of s.warns) {
    w.t--;
    if (w.t > 0 || w.bluff) continue;
    if (w.kind === "low" || w.kind === "air") s.proj.push({ kind: w.kind, x: s.cam + W + 10, y: w.y, vx: -7.4, vy: 0, g: 0, w: 30, h: 12, life: 320 });
    if (w.kind === "back") s.proj.push({ kind: "back", x: s.cam - 40, y: w.y, vx: 8.8, vy: 0, g: 0, w: 30, h: 12, life: 320 });
    if (w.kind === "drop") s.proj.push({ kind: "drop", x: w.x, y: -30, vx: 0, vy: 3, g: 0.52, w: 14, h: 28, life: 320 });
  }
  s.warns = s.warns.filter(w => w.t > 0);
  for (const q of s.proj) {
    q.life--;
    if (q.stuck) { q.stuck--; if (!q.stuck) q.life = 0; continue; }
    q.vy = Math.min(16, q.vy + q.g); q.x += q.vx; q.y += q.vy;
    if (q.kind === "drop" && q.y + q.h >= G && q.y + q.h < G + 16 && lv.solids.some(b => isSolid(b) && b.y === G && q.x + q.w / 2 > b.x && q.x + q.w / 2 < b.x + b.w)) {
      q.y = G - q.h + 6; q.stuck = 30; emit(s, { t: "burst", x: q.x + 7, y: G, c: "#F2F3FA", n: 5 }); continue;
    }
    if (q.y > H + 60) q.life = 0;
    if (overlap(p, { x: q.x + 3, y: q.y + 2, w: q.w - 6, h: q.h - 4 })) return die(s, "thrown");
  }
  s.proj = s.proj.filter(q => q.life > 0);

  // running flag
  const g = lv.goal;
  if (g.run && !g.run.moving && p.x > g.run.trigger) g.run.moving = true;
  if (g.run && g.run.moving && g.x < g.run.to) g.x = Math.min(g.run.to, g.x + 8);

  s.maxX = Math.max(s.maxX, p.x);
  if (p.y > H + 40) return die(s, p.dropCause || "pit");
  if (overlap(p, { x: g.x + 4, y: G - 120, w: 22, h: 120 }) && (!g.run || g.x >= g.run.to)) {
    s.banked += LEVEL_POINTS + CLEAR_BONUS; s.cleared++;
    s.phase = "clear"; s.clearT = CLEAR_FRAMES;
    emit(s, { t: "burst", x: g.x + 14, y: G - 90, c: "#FBCE1B", n: 26 });
    emit(s, { t: "levelClear", level: s.li });
    return;
  }

  // camera (part of the simulation: thrown spikes spawn relative to it)
  const target = walling ? (wd as Wall).camX : Math.max(0, Math.min(s.def.length - W + 40, p.x - 340));
  s.cam += (target - s.cam) * 0.18;
}

/* ---------- input log ---------- */
/** Records one Bits value per step and run-length encodes it. */
export class InputRecorder {
  private pairs: InputLog = [];
  push(bits: Bits) {
    const last = this.pairs[this.pairs.length - 1];
    if (last && last[0] === bits) last[1]++;
    else this.pairs.push([bits, 1]);
  }
  get log(): InputLog { return this.pairs.map(p => [p[0], p[1]] as [Bits, number]); }
  get frames(): number { return this.pairs.reduce((a, p) => a + p[1], 0); }
}

/** Shape check for an untrusted log. Returns an error string, or null if it is well formed. */
export function validateLog(log: unknown): string | null {
  if (!Array.isArray(log)) return "log must be an array";
  if (log.length === 0) return "log is empty";
  if (log.length > MAX_LOG_PAIRS) return "log has too many entries";
  let total = 0;
  for (const pair of log) {
    if (!Array.isArray(pair) || pair.length !== 2) return "each entry must be [bits, frames]";
    const [b, n] = pair;
    if (!Number.isInteger(b) || b < 0 || b > 7) return "bits must be an integer 0..7";
    if (!Number.isInteger(n) || n < 1) return "frames must be a positive integer";
    total += n;
    if (total > MAX_FRAMES) return "run is longer than the maximum";
  }
  return null;
}

/**
 * Replays a run from its seed, routes and input log. This is the only source of a stored score.
 * Steps after the run ends are ignored. A log that stops while the run is still going
 * scores as "quit" with the distance reached so far.
 */
export function simulateRun(seed: number, routes: Route[], log: InputLog): RunResult {
  const err = validateLog(log);
  if (err) throw new Error(err);
  const s = createRun(seed, routes, false);
  outer: for (const [bits, n] of log) {
    for (let i = 0; i < n; i++) {
      step(s, bits);
      if (s.phase === "over") break outer;
    }
  }
  const over = s.phase === "over";
  return {
    points: currentPoints(s),
    cleared: s.cleared,
    levelReached: s.li + 1,
    pct: over ? (s.won ? 0 : s.finalPct) : s.phase === "clear" ? 0 : levelPct(s),
    frames: s.frame,
    ended: over ? (s.won ? "won" : "died") : "quit",
    cause: s.cause,
    replayVersion: REPLAY_VERSION,
  };
}
