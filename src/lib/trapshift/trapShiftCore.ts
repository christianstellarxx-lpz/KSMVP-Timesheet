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

export const REPLAY_VERSION = 3;
export const W = 960, H = 540, G = 460;            // view size and ground top
export const STEP_HZ = 60;
export const MAX_ATTEMPTS_PER_DAY = 5;
export const MAX_FRAMES = STEP_HZ * 60 * 15;       // 15 minutes of play per run, hard cap
export const MAX_LOG_PAIRS = 60000;
/** Score = how far you got. Level 1 counts 0 to 100, Level 2 101 to 200, Level 3 201 to 300. No bonuses. */
export const MAX_SCORE = 300;
export const SAVE_POINTS = 6;   // 0 L1 start, 1 L1 half, 2 L2 start, 3 L2 half, 4 L3 start, 5 L3 half
export const PERFECT_SCORE = MAX_SCORE;

const GRAV = 0.6, JUMP = -11.6, DJUMP = -10.2, SPEED = 4.3, MAXFALL = 14;
const CLEAR_FRAMES = 70;

/* ---------- types ---------- */
export type Bits = number;                    // 0..7
export type InputLog = [Bits, number][];      // run-length encoded: [bits, frames]
export type Route = 0 | 1;                    // 0 = A, 1 = B
export type Cause = "fake" | "delay" | "popup" | "spike" | "slider" | "faller" | "pit" | "thrown" | "launch" | "wall" | "bag" | "decoy" | "monster" | "burn";
export type Phase = "play" | "clear" | "over";
type SolidKind = "ground" | "fake" | "delay" | "hidden";
type ThrowKind = "low" | "drop" | "back" | "air";

export interface Box { x: number; y: number; w: number; h: number }
export interface Solid extends Box { kind: SolidKind; falling?: boolean; vy?: number; timer?: number; shown?: boolean; fuse?: number }
export interface Spike { x: number; base: number; w: number; hgt: number; kind: "spike" | "popup" | "slider"; trigger?: number; live?: boolean; vx?: number; stopX?: number }
export interface Faller extends Box { from: number; to: number; floor: number; vy: number; drop: boolean; landed: boolean; launch?: boolean; sit?: number }
export interface Wall { trigger: number; camX: number; phase?: "warn" | "go" | "done"; t?: number; x?: number }
export interface Goal { x: number; run: null | { trigger: number; to: number; moving: boolean } }
/** goalShown: the real EOD flag stays hidden (and untouchable) until the player is past every decoy. */
export interface LevelObjects { solids: Solid[]; spikes: Spike[]; fallers: Faller[]; wall?: Wall; goal: Goal; decoys?: number[]; goalShown?: boolean }
interface ThrowCfg { first: number; gap: [number, number]; kinds: ThrowKind[]; bluff?: number; warn: number }
/** The Collector: floating monster head that lobs money bags. */
interface MonsterCfg {
  activeAt: number;            // player x that wakes it up
  first: number;               // steps before its first wind-up
  gap: [number, number];       // steps between wind-ups
  windup: number;              // telegraph length in steps
  flight: [number, number];    // bag flight time range in steps
  bluff: number;               // share of wind-ups that throw nothing (it laughs instead)
  volley: number;              // share of wind-ups that throw a volley instead of one bag
  volleySize: number;          // bags in a volley
}
/** Level 1 fire: after `start` steps the floor starts burning from the left edge at `speed` px per step. */
interface BurnCfg { start: number; speed: number }
/** save: x of the halfway save point for this route. Always on ground level, clear of traps that would fire on spawn. */
export interface LevelDef { name: string; tip: string; start: number; save: number; length: number; thr: ThrowCfg; mon: MonsterCfg | null; burn: BurnCfg | null; build: () => LevelObjects }
export interface Warn { kind: ThrowKind; x: number; y: number; t: number; bluff: boolean }
export interface Proj extends Box { kind: ThrowKind; vx: number; vy: number; g: number; life: number; stuck?: number }
export type MonsterState = "enter" | "idle" | "windup" | "laugh";
export interface Monster { x: number; y: number; state: MonsterState; t: number; throwT: number; volley: number; bluff: boolean }
/** tx: where the bag will come down (x center). Bags are thrown at random spots, never at the player. */
export interface Bag extends Box { vx: number; vy: number; spin: number; tx: number }
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
  | { t: "over"; won: boolean; cause: Cause | null }
  | { t: "monsterThrow" } | { t: "monsterLaugh" } | { t: "bagBurst"; x: number; y: number } | { t: "flagReveal"; x: number }
  | { t: "savePoint"; cp: number };

export interface RunState {
  seed: number; routes: Route[]; rngState: number;
  li: number; def: LevelDef; lv: LevelObjects; p: Player;
  cam: number; maxX: number; cleared: number;
  prevJ: boolean; jumpBuffer: number; throwT: number;
  warns: Warn[]; proj: Proj[];
  mon: Monster | null; bags: Bag[];
  levelFrame: number; burnX: number | null;
  /** save points: 0 L1 start, 1 L1 half, 2 L2 start, 3 L2 half, 4 L3 start, 5 L3 half */
  startCp: number; cpReached: number; burnFrom: number;
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
  startCp: number;         // save point this try started from
  checkpoint: number;      // furthest save point reached in this try (0..5). The server starts the VA's next try today from it.
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
const delay = (x: number, top: number, w: number, h = 18, fuse = 13): Solid => ({ x, y: top, w, h, kind: "delay", timer: -1, fuse });
const hidden = (x: number, top: number, w: number, h = 20): Solid => ({ x, y: top, w, h, kind: "hidden", shown: false });
const spike = (x: number, base: number, w = 30): Spike => ({ x, base, w, hgt: 22, kind: "spike" });
const popup = (x: number, base: number, w: number, trigger: number): Spike => ({ x, base, w, hgt: 0, kind: "popup", trigger, live: false });
const slider = (x: number, base: number, trigger: number, vx: number, stopX: number): Spike => ({ x, base, w: 34, hgt: 22, kind: "slider", trigger, vx, stopX, live: false });
const faller = (x: number, top: number, w: number, h: number, from: number, to: number, floor: number, launch = false): Faller =>
  ({ x, y: top, w, h, from, to, floor, vy: 0, drop: false, landed: false, launch, sit: 0 });

/* thrown-spike settings per level: first delay, gap range (frames), kinds, share of fake warnings */
/* warn: how many steps the "!" shows before a thrown spike fires (v1 was 45 everywhere) */
const T1: ThrowCfg = { first: 120, gap: [150, 230], kinds: ["low", "drop", "air"], bluff: 0.35, warn: 45 };
const T2: ThrowCfg = { first: 100, gap: [115, 185], kinds: ["low", "drop", "back", "air"], bluff: 0.25, warn: 38 };
const T3: ThrowCfg = { first: 80, gap: [92, 148], kinds: ["low", "drop", "back", "air"], bluff: 0.2, warn: 32 };
/* The Collector per level: wakes earlier, throws more often, aims better, and volleys more as levels go up */
/* The Collector appears in Levels 2 and 3 only. It throws at random spots on screen, never at the player. */
const M2: MonsterCfg = { activeAt: 320, first: 50, gap: [130, 190], windup: 32, flight: [34, 46], bluff: 0.2, volley: 0.35, volleySize: 2 };
const M3: MonsterCfg = { activeAt: 200, first: 40, gap: [105, 155], windup: 28, flight: [30, 40], bluff: 0.15, volley: 0.5, volleySize: 3 };
const B1: BurnCfg = { start: 300, speed: 1.5 };   // 5 seconds in, then about a third of running speed

/** LEVELS[level][route]. Route letters are never shown to players. */
export const LEVELS: LevelDef[][] = [
  [
    { name: "Clock In", tip: "Easy start. Probably.", start: 60, save: 1240, length: 2700, thr: T1, mon: null, burn: B1,
      build: () => ({
        solids: [ground(0, 700), fake(700, 170), ground(870, 400), hidden(1330, 300, 40), ground(1440, 940), hidden(1995, 350, 40), fake(2380, 90), ground(2470, 230), block(2700, 0, 40, 560)],
        spikes: [popup(1050, G, 32, 985), spike(2000, G, 36), popup(2085, G, 30, 1990), spike(2240, G, 30), popup(2290, G, 30, 2200)],
        fallers: [faller(1700, 110, 64, 54, 1640, 1790, G, true)],
        wall: { trigger: 1850, camX: 1510 },
        decoys: [1560],
        goal: { x: 2560, run: null } }) },
    { name: "Clock In", tip: "Same office. Different lies.", start: 60, save: 1180, length: 2700, thr: T1, mon: null, burn: B1,
      build: () => ({
        solids: [ground(0, 500), hidden(570, 300, 40), ground(660, 560), delay(1260, 430, 90), block(1400, 420, 90), hidden(1440, 290, 40), ground(1540, 940), hidden(1700, 372, 42), fake(2470, 80), ground(2550, 150), block(2700, 0, 40, 560)],
        spikes: [popup(300, G, 30, 240), popup(340, G, 30, 240), spike(2100, G, 34), popup(2190, G, 30, 2090), slider(2420, G, 1960, -4.2, 1540)],
        fallers: [faller(800, 110, 64, 54, 760, 880, G)],
        wall: { trigger: 1880, camX: 1540 },
        decoys: [2300],
        goal: { x: 2600, run: null } }) },
  ],
  [
    { name: "Inbox Zero", tip: "Two roads. One is a lie.", start: 60, save: 1340, length: 2640, thr: T2, mon: M2, burn: null,
      build: () => ({
        solids: [ground(0, 880), block(1000, 400, 280), fake(1020, 280), ground(1300, 580), hidden(1560, 372, 42), hidden(1940, 300, 40), ground(2040, 600), block(2640, 0, 40, 560)],
        spikes: [spike(380, G, 30), popup(540, G, 32, 430), popup(650, G, 32, 520), slider(1830, G, 1420, -4.5, 1290), popup(2430, G, 32, 2380)],
        fallers: [faller(2250, 100, 70, 56, 2195, 2330, G)],
        decoys: [2120],
        goal: { x: 2500, run: null } }) },
    { name: "Inbox Zero", tip: "The high road looks nice today.", start: 60, save: 1160, length: 2660, thr: T2, mon: M2, burn: null,
      build: () => ({
        solids: [ground(0, 580), hidden(640, 300, 40), ground(740, 460), fake(1240, 320, 400, 18), block(1250, 470, 90), block(1400, 470, 90), ground(1560, 1100), hidden(2050, 372, 42), block(2660, 0, 40, 560)],
        spikes: [slider(540, G, 120, -4, -60), popup(890, G, 80, 820), popup(2090, G, 30, 2030), popup(2200, G, 30, 2140)],
        fallers: [faller(1800, 100, 70, 56, 1750, 1880, G)],
        decoys: [1640],
        goal: { x: 2440, run: { trigger: 2340, to: 2580, moving: false } } }) },
  ],
  [
    { name: "End of Day", tip: "The finish line has trust issues.", start: 60, save: 1620, length: 3050, thr: T3, mon: M3, burn: null,
      build: () => ({
        solids: [ground(0, 420), block(500, 430, 80), hidden(615, 290, 40), delay(690, 410, 80, 18, 9), hidden(805, 300, 40), block(880, 430, 80), block(1070, 400, 110), ground(1270, 710), hidden(2045, 300, 40), ground(2150, 860), block(3010, 0, 40, 560)],
        spikes: [popup(1146, 400, 30, 1062), spike(1400, G, 30), popup(1490, G, 30, 1390), popup(1720, G, 30, 1655), popup(1752, G, 30, 1655), popup(2700, G, 40, 2640)],
        fallers: [faller(1500, 90, 70, 56, 1450, 1590, G)],
        decoys: [1360],
        goal: { x: 2700, run: { trigger: 2560, to: 2920, moving: false } } }) },
    { name: "End of Day", tip: "Overtime. Everything is angry.", start: 60, save: 1480, length: 3050, thr: T3, mon: M3, burn: null,
      build: () => ({
        solids: [ground(0, 380), delay(460, 430, 80, 18, 9), block(630, 400, 80), hidden(720, 280, 40), block(790, 380, 90), block(960, 410, 80), delay(1110, 400, 80, 18, 9), ground(1270, 680), hidden(2010, 300, 40), ground(2110, 90), fake(2200, 90), ground(2290, 720), block(3010, 0, 40, 560)],
        spikes: [popup(850, 380, 30, 800), popup(1800, G, 30, 1740), slider(1900, G, 1350, -3.5, 1270), spike(2320, G, 30), popup(2650, G, 40, 2580), popup(2820, G, 30, 2760), popup(2852, G, 30, 2760)],
        fallers: [faller(1600, 90, 70, 56, 1560, 1680, G)],
        decoys: [2400],
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
  if (s.phase === "over") return s.won ? MAX_SCORE : s.li * 100 + s.finalPct;
  if (s.phase === "clear") return (s.li + 1) * 100;
  return s.li * 100 + levelPct(s);
}

function loadLevel(s: RunState, i: number, fromHalf = false) {
  s.li = i;
  s.def = LEVELS[i][s.routes[i]];
  s.lv = s.def.build();
  s.proj = []; s.warns = []; s.throwT = s.def.thr.first;
  s.mon = null; s.bags = [];
  s.lv.goalShown = !(s.lv.decoys && s.lv.decoys.length); s.levelFrame = 0; s.burnX = null;
  const x0 = fromHalf ? s.def.save : s.def.start;
  s.p = { x: x0, y: G - 34, w: 26, h: 34, vx: 0, vy: 0, onGround: true, coyote: 6, face: 1, air: 1, standing: null, dropCause: "", launched: false };
  s.maxX = x0; s.cam = Math.max(0, Math.min(s.def.length - W + 40, x0 - 340)); s.clearT = 0; s.jumpBuffer = 0;
  s.burnFrom = x0 - 60;   // the fire always starts 60 px behind where the player spawned
  if (s.lv.decoys && x0 > Math.max(...s.lv.decoys) + 30) s.lv.goalShown = true;
  s.cpReached = Math.max(s.cpReached ?? 0, i * 2 + (fromHalf ? 1 : 0));
  s.levelJustStarted = true;
  emit(s, { t: "levelStart", level: i });
}

/** startCp: the save point to start from (0..5). Only the server decides it, from the VA's earlier tries today. */
export function createRun(seed: number, routes: Route[], startCp = 0, withEvents = true): RunState {
  if (!Number.isInteger(seed)) throw new Error("seed must be an integer");
  if (!Number.isInteger(startCp) || startCp < 0 || startCp >= SAVE_POINTS) throw new Error("startCp must be 0..5");
  if (routes.length !== 3 || routes.some(r => r !== 0 && r !== 1)) throw new Error("routes must be three 0/1 values");
  const s = {
    seed, routes: routes.slice(), rngState: seed | 0,
    cam: 0, maxX: 0, cleared: 0, levelFrame: 0, burnX: null, prevJ: false, jumpBuffer: 0, throwT: 0,
    warns: [], proj: [], mon: null, bags: [], frame: 0, phase: "play", clearT: 0, won: false, cause: null, finalPct: 0,
    levelJustStarted: false, events: withEvents ? [] : null,
    startCp, cpReached: startCp, burnFrom: 0,
  } as unknown as RunState;
  loadLevel(s, Math.floor(startCp / 2), startCp % 2 === 1);
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
    else if ("kind" in st && st.kind === "delay" && (st.timer ?? -1) < 0) { st.timer = st.fuse ?? 13; }
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
    if (k.kind === "popup" && k.live && k.hgt < 22) k.hgt = Math.min(22, k.hgt + 11);
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
      if (kind === "drop") s.warns.push({ kind, x: Math.max(s.cam + 40, Math.min(s.cam + W - 60, p.x + p.vx * 38)), y: 0, t: thr.warn - 3, bluff });
      else s.warns.push({ kind, x: 0, y: kind === "air" ? p.y - 52 : p.y + p.h - 17, t: thr.warn, bluff });
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

  // The Collector (Levels 2 and 3). RNG order on each wind-up: bluff, volley, gap. On each throw: flight, landing spot.
  const mc = s.def.mon;
  if (mc && !s.mon && p.x > mc.activeAt) s.mon = { x: s.cam + W + 110, y: 104, state: "enter", t: 0, throwT: mc.first, volley: 0, bluff: false };
  const m = s.mon;
  if (m && mc) {
    const ph = s.frame % 120;
    m.y = 104 + ((ph < 60 ? ph : 120 - ph) * 16) / 60;          // bob, triangle wave
    m.x += (s.cam + 650 - m.x) * 0.06;                           // drifts with the screen
    if (m.state === "enter" && m.x < s.cam + W - 60) m.state = "idle";
    if (!walling && m.state === "idle") {
      m.throwT--;
      if (m.throwT <= 0) {
        m.bluff = rand(s) < mc.bluff;
        m.volley = rand(s) < mc.volley ? mc.volleySize : 1;
        m.throwT = mc.gap[0] + Math.floor(rand(s) * (mc.gap[1] - mc.gap[0]));
        m.state = "windup"; m.t = mc.windup;
      }
    } else if (m.state === "windup") {
      m.t--;
      if (m.t <= 0) {
        if (m.bluff) { m.state = "laugh"; m.t = 40; emit(s, { t: "monsterLaugh" }); }
        else {
          const T = mc.flight[0] + Math.floor(rand(s) * (mc.flight[1] - mc.flight[0]));
          const x0 = m.x - 12, y0 = m.y + 58, gB = 0.45;
          const tx = s.cam + 60 + Math.floor(rand(s) * (W - 120)) - 12;   // random spot on screen, not aimed
          s.bags.push({ x: x0, y: y0, w: 24, h: 26, vx: (tx - x0) / T, vy: (G - 26 - y0 - 0.5 * gB * T * T) / T, spin: 0, tx: tx + 12 });
          emit(s, { t: "monsterThrow" });
          m.volley--;
          if (m.volley > 0) { m.state = "windup"; m.t = 18; } else m.state = "idle";
        }
      }
    } else if (m.state === "laugh") { m.t--; if (m.t <= 0) m.state = "idle"; }
    if (overlap(p, { x: m.x - 64, y: m.y - 60, w: 128, h: 122 })) return die(s, "monster");
  }
  // money bags burst on whatever they land on (no coins)
  for (const b of s.bags) {
    const prevB = b.y + b.h;
    b.vy += 0.45; b.x += b.vx; b.y += b.vy; b.spin++;
    if (overlap(p, { x: b.x + 3, y: b.y + 3, w: b.w - 6, h: b.h - 5 })) return die(s, "bag");
    const hit = lv.solids.find(o => isSolid(o) && b.vy > 0 && prevB <= o.y && b.y + b.h >= o.y && b.x + b.w > o.x && b.x < o.x + o.w);
    if (hit) {
      const cx = b.x + b.w / 2, top = hit.y;
      b.spin = -1;
      emit(s, { t: "bagBurst", x: cx, y: top }); emit(s, { t: "burst", x: cx, y: top, c: "#FBCE1B", n: 10 });
    } else if (b.y > H + 40) b.spin = -1;
  }
  s.bags = s.bags.filter(b => b.spin >= 0);
  // decoy flags look exactly like the EOD flag. Touching one kills you.
  for (const dx of lv.decoys ?? []) if (overlap(p, { x: dx + 4, y: G - 120, w: 22, h: 120 })) return die(s, "decoy");
  // the real flag only appears once the player is past every decoy
  if (!lv.goalShown && p.x > Math.max(...(lv.decoys as number[])) + 30) {
    lv.goalShown = true;
    emit(s, { t: "flagReveal", x: lv.goal.x }); emit(s, { t: "burst", x: lv.goal.x + 14, y: G - 90, c: "#FBCE1B", n: 18 });
  }

  // halfway save point
  if (s.cpReached < s.li * 2 + 1 && p.x >= s.def.save) {
    s.cpReached = s.li * 2 + 1;
    emit(s, { t: "savePoint", cp: s.cpReached });
  }

  // Level 1: the floor behind you burns. Starts 5 s into the level, creeps right, never stops.
  s.levelFrame++;
  const bc = s.def.burn;
  if (bc && s.levelFrame >= bc.start) {
    s.burnX = (s.burnX ?? s.burnFrom) + bc.speed;
    if (p.x < s.burnX) return die(s, "burn");
  }

  // running flag
  const g = lv.goal;
  if (g.run && !g.run.moving && lv.goalShown && p.x > g.run.trigger) g.run.moving = true;
  if (g.run && g.run.moving && g.x < g.run.to) g.x = Math.min(g.run.to, g.x + 8);

  s.maxX = Math.max(s.maxX, p.x);
  if (p.y > H + 40) return die(s, p.dropCause || "pit");
  if (lv.goalShown && overlap(p, { x: g.x + 4, y: G - 120, w: 22, h: 120 }) && (!g.run || g.x >= g.run.to)) {
    s.cleared++;
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
export function simulateRun(seed: number, routes: Route[], log: InputLog, startCp = 0): RunResult {
  const err = validateLog(log);
  if (err) throw new Error(err);
  const s = createRun(seed, routes, startCp, false);
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
    startCp: s.startCp,
    checkpoint: s.cpReached,
    replayVersion: REPLAY_VERSION,
  };
}
