/**
 * Stretch Goal — deterministic core.
 *
 * Pure logic: no DOM, no React, no Date, no Math.random. It runs identically in
 * the browser and in Node, which is the whole basis of the anti-cheat model.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A SEPARATE FILE FROM THE COMPONENT
 * ---------------------------------------------------------------------------
 * The brief requires `simulateRun` to come from the same module the client
 * renders so the two can never drift — "or one shared core". It has to be the
 * shared core here: in the App Router a `"use client"` module's named exports
 * become client-reference proxies when a Server Component or Route Handler
 * imports them, so `simulateRun` pulled out of the component file would not be
 * a callable function on the server at all.
 *
 * So this file holds the physics and the verifier, and is imported by BOTH
 * `src/components/games/StretchGoal.tsx` (the play surface) and
 * `src/lib/stretch/game.ts` (the server-side scorer). There is exactly one copy
 * of the simulation; changing it changes both at once, by construction.
 *
 * ---------------------------------------------------------------------------
 * ANTI-CHEAT MODEL
 * ---------------------------------------------------------------------------
 * The game is a fixed-timestep simulation seeded by a single 32-bit integer.
 * The ONLY input is "is the pointer held down on step N", so a finished run
 * compresses to `{ seed, holds[] }` — a few hundred bytes.
 *
 * The client posts `{ seed, holds }`. The server replays them through
 * `simulateRun` and stores ITS OWN result. A client-supplied score is never
 * read, so a forged one cannot survive. The seed is issued by the server once a
 * day and never re-rolled, so nobody can grind seeds for an easy layout.
 */

/* ============================================================================
   TYPES
   ========================================================================== */

export interface Hold {
  /** simulation step on which the beam started growing */
  press: number;
  /** simulation step on which it was released */
  release: number;
}

export interface RunResult {
  score: number;
  perfects: number;
  /** 0-based tier index reached, 0 = Warm-Up ... 4 = Overtime */
  tier: number;
  tierName: string;
  seed: number;
  holds: Hold[];
  /** total simulation steps elapsed; 60 steps = 1 second */
  steps: number;
}

export interface LeaderRow {
  name: string;
  score: number;
  perfects: number;
  isYou?: boolean;
}

/* ============================================================================
   DIFFICULTY LADDER
   Each tier stacks on the ones before it. Tune here, nowhere else.
   Changing ANY number here invalidates stored replays — bump REPLAY_VERSION.
   ========================================================================== */

export const REPLAY_VERSION = 1;

export interface TierCfg {
  at: number;
  name: string;
  blurb: string;
  wMin: number; wMax: number;     // ledge width range
  gMin: number; gMax: number;     // gap range
  drop: number;                   // max extra depth of the next ledge (0 = level)
  bendMin: number; bendMax: number; // beam kink, degrees (0 = straight)
  drift: number;                  // px of ledge sway while stretching
  perfect: number;                // width of the +2 centre mark
  stretch: number;                // beam growth, px per step
}

export const TIERS: TierCfg[] = [
  { at: 0,   name: "Warm-Up",       blurb: "Level ground, wide ledges. Learn the length of the beam.",
    wMin: 86, wMax: 112, gMin: 48, gMax: 128, drop: 0,  bendMin: 0,  bendMax: 0,  drift: 0,  perfect: 14, stretch: 5.00 },
  { at: 25,  name: "Uneven Ground", blurb: "Ledges sit at different depths, so the beam no longer lands where your eye expects.",
    wMin: 62, wMax: 94,  gMin: 66, gMax: 158, drop: 52, bendMin: 0,  bendMax: 0,  drift: 0,  perfect: 12, stretch: 5.17 },
  { at: 50,  name: "Bent Beam",     blurb: "The beam kinks partway up. It reaches shorter than it looks.",
    wMin: 50, wMax: 80,  gMin: 82, gMax: 178, drop: 56, bendMin: 26, bendMax: 50, drift: 0,  perfect: 10, stretch: 5.50 },
  { at: 75,  name: "Moving Ledges", blurb: "The target ledge drifts while you stretch and locks the moment you release.",
    wMin: 42, wMax: 70,  gMin: 90, gMax: 194, drop: 62, bendMin: 26, bendMax: 50, drift: 20, perfect: 9,  stretch: 5.83 },
  { at: 100, name: "Overtime",      blurb: "Everything at once, narrower ledges, sharper bends, a faster beam.",
    wMin: 32, wMax: 58,  gMin: 98, gMax: 212, drop: 76, bendMin: 32, bendMax: 60, drift: 28, perfect: 8,  stretch: 6.50 },
];

export function tierIndex(score: number): number {
  let idx = 0;
  for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].at) idx = i;
  return idx;
}

/* ============================================================================
   DETERMINISTIC CORE
   ========================================================================== */

export const STEP_MS = 1000 / 60;

/** Stage geometry, in simulation units. The renderer scales this to the canvas. */
export const W = 560, H = 400;
export const PLATFORM_H = 110;
export const GROUND = H - PLATFORM_H;
export const STICK_X = 150;
const HERO_EDGE = 14;

/** per-step speeds */
const WALK = 4.33;
const TURN = 5.33;
const TRANS = 9.17;
const FALL = 9.17;
const DROP = 6.67;
const DRIFT_SP = 0.0367;

/**
 * Quantise to 4 decimals wherever a transcendental feeds gameplay.
 * Math.sin/cos/tan are not bit-identical across JS engines; rounding here means
 * a run played in Safari still verifies against Node's V8.
 */
const q = (n: number): number => Math.round(n * 10000) / 10000;

/** mulberry32 — small, fast, fully deterministic */
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Phase =
  | "waiting" | "stretching" | "turning"
  | "beamwalk" | "dropping" | "platwalk"
  | "transition" | "falling" | "over";

export interface Platform {
  x: number; baseX: number; w: number; top: number;
  drift: number; ph: number;
}

export interface Beam {
  x: number; top: number; len: number; angle: number;
  bend: number; aFrac: number;
}

export interface GameState {
  platforms: Platform[];
  beams: Beam[];
  heroX: number; heroY: number;
  camY: number; targetCamY: number;
  sceneOffset: number; targetOffset: number;
  score: number; perfects: number; tier: number;
  phase: Phase; step: number; over: boolean;
  holds: Hold[];
  /** transient presentation flags, ignored by the verifier */
  flash: { text: string; a: number } | null;
  banner: { n: number; name: string; a: number } | null;
}

export interface Game {
  state: GameState;
  /** advance exactly one fixed step. `pressed` = is the pointer held this step. */
  tick(pressed: boolean): void;
}

export function createGame(seed: number): Game {
  const rnd = mulberry32(seed >>> 0);
  const rand = (a: number, b: number) => a + rnd() * (b - a);

  const s: GameState = {
    platforms: [{ x: 50, baseX: 50, w: 110, top: 0, drift: 0, ph: 0 }],
    beams: [],
    heroX: 50 + 110 - HERO_EDGE,
    heroY: 0,
    camY: 0, targetCamY: 0,
    sceneOffset: 50 + 110 - STICK_X,
    targetOffset: 50 + 110 - STICK_X,
    score: 0, perfects: 0, tier: 0,
    phase: "waiting", step: 0, over: false,
    holds: [],
    flash: null, banner: null,
  };

  /* resolution scratch — recomputed per beam, never read across ticks */
  let walkTarget = 0;
  let landed: Platform | null = null;
  let wasPerfect = false;
  let kneeX = 0, tanPhi = 0, tipRise = 0;
  let dropFrom = 0, dropTo = 0, dropT = 0;

  function cfg() { return TIERS[tierIndex(s.score)]; }

  function addPlatform() {
    const last = s.platforms[s.platforms.length - 1];
    const c = cfg();
    const w = rand(c.wMin, c.wMax);
    const gap = rand(c.gMin, c.gMax);
    const top = last.top + (c.drop ? rand(8, c.drop) : 0);
    const x = last.x + last.w + gap;
    s.platforms.push({ x, baseX: x, w, top, drift: c.drift, ph: rand(0, 6.28) });
  }

  function newBeam() {
    const base = s.platforms[s.platforms.length - 2];
    const c = cfg();
    // integer degrees keeps sin/cos stable across engines
    const bend = c.bendMax > 0 ? Math.round(rand(c.bendMin, c.bendMax)) : 0;
    s.beams.push({ x: base.x + base.w, top: base.top, len: 0, angle: 0, bend, aFrac: bend > 0 ? 0.55 : 1 });
  }

  addPlatform();
  newBeam();

  function resolve() {
    const b = s.beams[s.beams.length - 1];
    const phi = (b.bend * Math.PI) / 180;
    const A = b.len * b.aFrac;
    const B = b.len - A;
    const reach = q(A + B * Math.cos(phi));
    const rise = q(B * Math.sin(phi));
    const tipX = b.x + reach;

    kneeX = b.x + A;
    tanPhi = B > 0 ? q(rise / (reach - A || 1)) : 0;
    tipRise = rise;

    landed = null;
    wasPerfect = false;
    const last = s.platforms[s.platforms.length - 1];
    if (tipX > last.x && tipX < last.x + last.w) {
      landed = last;
      wasPerfect = Math.abs(tipX - (last.x + last.w / 2)) < cfg().perfect / 2;
      walkTarget = tipX;
    } else {
      walkTarget = tipX + 18;
    }
    s.phase = "beamwalk";
  }

  function beamHeight(x: number) {
    if (x <= kneeX) return 0;
    return Math.min((x - kneeX) * tanPhi, tipRise);
  }

  function award() {
    s.score += wasPerfect ? 2 : 1;
    if (wasPerfect) {
      s.perfects++;
      s.flash = { text: "PERFECT  +2", a: 1 };
    }
    const ni = tierIndex(s.score);
    if (ni > s.tier) {
      s.tier = ni;
      s.banner = { n: ni + 1, name: TIERS[ni].name, a: 1.6 };
    }
  }

  function tick(pressed: boolean) {
    if (s.over) return;
    s.step++;

    const beam = s.beams[s.beams.length - 1];
    const target = s.platforms[s.platforms.length - 1];

    if (target.drift && (s.phase === "waiting" || s.phase === "stretching")) {
      target.ph = q(target.ph + DRIFT_SP);
      target.x = q(target.baseX + Math.sin(target.ph) * target.drift);
    }

    switch (s.phase) {
      case "waiting":
        if (pressed) {
          s.holds.push({ press: s.step, release: -1 });
          s.phase = "stretching";
        }
        break;

      case "stretching":
        if (!pressed) {
          s.holds[s.holds.length - 1].release = s.step;
          target.drift = 0;             // lock the drifting ledge
          s.phase = "turning";
        } else {
          beam.len += cfg().stretch;
        }
        break;

      case "turning":
        beam.angle += TURN;
        if (beam.angle >= 90) { beam.angle = 90; resolve(); }
        break;

      case "beamwalk":
        s.heroX += WALK;
        s.heroY = beam.top - beamHeight(s.heroX);
        if (s.heroX >= walkTarget) {
          s.heroX = walkTarget;
          if (landed) {
            award();
            dropFrom = beam.top - tipRise;
            dropTo = landed.top;
            dropT = 0;
            s.phase = "dropping";
          } else {
            s.phase = "falling";
          }
        }
        break;

      case "dropping": {
        dropT += DROP;
        const span = Math.max(Math.abs(dropTo - dropFrom), 1);
        const k = Math.min(dropT / span, 1);
        s.heroY = dropFrom + (dropTo - dropFrom) * k;
        if (k >= 1) {
          s.heroY = dropTo;
          walkTarget = landed!.x + landed!.w - HERO_EDGE;
          s.phase = "platwalk";
        }
        break;
      }

      case "platwalk":
        s.heroX += WALK;
        s.heroY = landed!.top;
        if (s.heroX >= walkTarget) {
          s.heroX = walkTarget;
          addPlatform();
          s.targetOffset = landed!.x + landed!.w - STICK_X;
          s.targetCamY = landed!.top;
          s.phase = "transition";
        }
        break;

      case "transition": {
        s.sceneOffset = Math.min(s.sceneOffset + TRANS, s.targetOffset);
        const dy = s.targetCamY - s.camY;
        s.camY += Math.sign(dy) * Math.min(Math.abs(dy), TRANS * 0.7);
        if (s.sceneOffset >= s.targetOffset && Math.abs(s.targetCamY - s.camY) < 0.5) {
          s.sceneOffset = s.targetOffset;
          s.camY = s.targetCamY;
          newBeam();
          s.phase = "waiting";
        }
        break;
      }

      case "falling":
        s.heroY += FALL;
        beam.angle = Math.min(180, beam.angle + TURN * 0.8);
        if (s.heroY - s.camY > 420) { s.phase = "over"; s.over = true; }
        break;
    }

    if (s.flash) { s.flash.a -= STEP_MS / 900; if (s.flash.a <= 0) s.flash = null; }
    if (s.banner) { s.banner.a -= STEP_MS / 1400; if (s.banner.a <= 0) s.banner = null; }
  }

  return { state: s, tick };
}

/* ----------------------------------------------------------------------------
   SERVER-SIDE VERIFIER
   Store what THIS returns, never the client's claim.
   -------------------------------------------------------------------------- */

export interface VerifiedRun {
  score: number;
  perfects: number;
  tier: number;
  tierName: string;
  steps: number;
  /** true if the run ended in a fall, i.e. the replay is complete */
  finished: boolean;
}

/** Hard caps so a malicious payload cannot pin a server thread. */
export const MAX_HOLDS = 4000;
export const MAX_STEPS = 400_000;   // ~110 minutes of simulated play

/**
 * Thrown for a structurally invalid replay payload.
 *
 * The API turns this into a 400, not a 500: a malformed `holds` array is a bad
 * request. The messages stay deliberately generic so probing the endpoint
 * teaches an attacker nothing about the simulation.
 */
export class ReplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplayError";
  }
}

export function simulateRun(seed: number, holds: Hold[]): VerifiedRun {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new ReplayError("stretch-goal: invalid seed");
  }
  if (!Array.isArray(holds) || holds.length > MAX_HOLDS) {
    throw new ReplayError("stretch-goal: invalid replay payload");
  }
  // holds must be finite, ordered, non-overlapping
  let prev = 0;
  for (const h of holds) {
    if (!h || typeof h !== "object") throw new ReplayError("stretch-goal: malformed hold");
    if (!Number.isInteger(h.press) || !Number.isInteger(h.release)) throw new ReplayError("stretch-goal: non-integer hold");
    if (h.press <= prev || h.release <= h.press) throw new ReplayError("stretch-goal: out-of-order hold");
    if (h.release > MAX_STEPS) throw new ReplayError("stretch-goal: hold past the step cap");
    prev = h.release;
  }

  const g = createGame(seed);
  const last = holds.length ? holds[holds.length - 1].release : 0;
  const limit = Math.min(last + 3000, MAX_STEPS);

  let hi = 0;
  for (let i = 0; i < limit && !g.state.over; i++) {
    const step = g.state.step + 1;                 // tick() increments first
    while (hi < holds.length && holds[hi].release < step) hi++;
    const h = holds[hi];
    const pressed = !!h && step >= h.press && step < h.release;
    g.tick(pressed);
  }

  return {
    score: g.state.score,
    perfects: g.state.perfects,
    tier: g.state.tier,
    tierName: TIERS[g.state.tier].name,
    steps: g.state.step,
    finished: g.state.over,
  };
}
