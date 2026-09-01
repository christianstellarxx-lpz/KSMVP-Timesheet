import { describe, it, expect } from "vitest";
import {
  MAX_HOLDS,
  REPLAY_VERSION,
  ReplayError,
  TIERS,
  simulateRun,
  tierIndex,
  type Hold,
} from "@/lib/stretch/core";
import { driveRun, jitterForBeam } from "./helpers/stretchBot";

/**
 * Stretch Goal — replay integrity and forgery resistance.
 *
 * The prize depends on one property: replaying `{ seed, holds }` on the server
 * reproduces exactly what the player saw. These tests drive a real game with a
 * scripted input pattern, then feed the resulting holds back through
 * `simulateRun` and demand an exact match — over 100+ seeds, each driven past
 * score 100 so Bent Beam, Moving Ledges and Overtime are all exercised.
 */

/* ---------------------------------------------------------------------------
   1. Replay integrity
   --------------------------------------------------------------------------- */

/** Seeds 1..120 — comfortably the "at least 100" the brief asks for. */
const SEEDS = Array.from({ length: 120 }, (_, i) => i + 1);
const TARGET_SCORE = 110; // past 100, so Overtime is entered on every seed

describe("stretch goal — replay integrity", () => {
  const runs = SEEDS.map((seed) => driveRun(seed, TARGET_SCORE, jitterForBeam));

  it("drives every seed past score 100 and into a finished run", () => {
    for (const run of runs) {
      expect(run.over, `seed ${run.seed} did not finish`).toBe(true);
      expect(run.score, `seed ${run.seed} scored ${run.score}`).toBeGreaterThanOrEqual(100);
    }
  });

  it("reaches the Bent Beam, Moving Ledges and Overtime tiers", () => {
    // tier 4 = Overtime, which can only be reached through tiers 2 and 3.
    for (const run of runs) {
      expect(run.tier, `seed ${run.seed}`).toBe(4);
    }
    expect(TIERS[2].name).toBe("Bent Beam");
    expect(TIERS[3].name).toBe("Moving Ledges");
    expect(TIERS[4].name).toBe("Overtime");
  });

  it("re-simulating the holds reproduces score, perfects and tier exactly", () => {
    for (const run of runs) {
      const verified = simulateRun(run.seed, run.holds);
      expect(verified.score, `seed ${run.seed} score`).toBe(run.score);
      expect(verified.perfects, `seed ${run.seed} perfects`).toBe(run.perfects);
      expect(verified.tier, `seed ${run.seed} tier`).toBe(run.tier);
      expect(verified.steps, `seed ${run.seed} steps`).toBe(run.steps);
      expect(verified.finished, `seed ${run.seed} finished`).toBe(true);
      expect(verified.tierName).toBe(TIERS[run.tier].name);
    }
  });

  it("is deterministic — the same inputs always give the same result", () => {
    const run = runs[0];
    const a = simulateRun(run.seed, run.holds);
    const b = simulateRun(run.seed, run.holds);
    expect(a).toEqual(b);
  });

  it("covers both the +2 perfect landing and the ordinary +1", () => {
    // score = 2 * perfects + ordinary landings, so the difference isolates the
    // non-perfect path. Both must appear or the replay coverage is one-sided.
    const perfects = runs.reduce((sum, r) => sum + r.perfects, 0);
    const ordinary = runs.reduce((sum, r) => sum + (r.score - 2 * r.perfects), 0);
    expect(perfects).toBeGreaterThan(0);
    expect(ordinary).toBeGreaterThan(0);
  });

  it("verifies short runs and a run that never presses at all", () => {
    const short = driveRun(4242, 3, jitterForBeam);
    expect(short.score).toBeGreaterThanOrEqual(3);
    expect(simulateRun(short.seed, short.holds).score).toBe(short.score);

    // No holds at all: the player never touches the screen, nothing happens,
    // and the replay is therefore unfinished rather than a zero-score run.
    const idle = simulateRun(7, []);
    expect(idle.score).toBe(0);
    expect(idle.finished).toBe(false);
  });
});

/* ---------------------------------------------------------------------------
   2. Forgery resistance
   --------------------------------------------------------------------------- */

describe("stretch goal — forgery resistance", () => {
  it("the same holds on a different seed collapse to a far lower score", () => {
    const forgedScores: number[] = [];

    for (const seed of SEEDS.slice(0, 40)) {
      const honest = driveRun(seed, TARGET_SCORE, jitterForBeam);
      // Same replay, wrong seed — a different layout the timings do not fit.
      const forged = simulateRun(seed + 1_000_003, honest.holds);
      expect(
        forged.score,
        `seed ${seed}: forged ${forged.score} vs honest ${honest.score}`,
      ).toBeLessThan(honest.score);
      forgedScores.push(forged.score);
    }

    // Not merely lower — nowhere near a prize-winning run.
    expect(Math.max(...forgedScores)).toBeLessThan(25);
  });

  it("a hand-written holds array cannot manufacture a high score", () => {
    // A plausible-looking log: 200 evenly spaced one-second holds.
    const fabricated: Hold[] = Array.from({ length: 200 }, (_, i) => ({
      press: i * 120 + 1,
      release: i * 120 + 61,
    }));
    const result = simulateRun(12345, fabricated);
    expect(result.score).toBeLessThan(25);
  });

  it("rejects malformed replay payloads", () => {
    const bad: [string, unknown][] = [
      ["not an array", { press: 1, release: 2 }],
      ["null entry", [null]],
      ["missing fields", [{}]],
      ["non-integer press", [{ press: 1.5, release: 9 }]],
      ["non-integer release", [{ press: 1, release: 9.5 }]],
      ["NaN", [{ press: NaN, release: 9 }]],
      ["Infinity", [{ press: 1, release: Infinity }]],
      ["release before press", [{ press: 9, release: 4 }]],
      ["zero-length hold", [{ press: 5, release: 5 }]],
      ["press at step 0", [{ press: 0, release: 4 }]],
      ["negative press", [{ press: -3, release: 4 }]],
      ["out of order", [{ press: 40, release: 60 }, { press: 10, release: 20 }]],
      ["overlapping", [{ press: 10, release: 40 }, { press: 30, release: 60 }]],
      ["past the step cap", [{ press: 1, release: 500_000 }]],
      [
        "too many holds",
        Array.from({ length: MAX_HOLDS + 1 }, (_, i) => ({
          press: i * 4 + 1,
          release: i * 4 + 3,
        })),
      ],
    ];

    for (const [label, holds] of bad) {
      expect(() => simulateRun(1, holds as Hold[]), label).toThrow(ReplayError);
    }
  });

  it("rejects an out-of-range seed", () => {
    expect(() => simulateRun(-1, [])).toThrow(ReplayError);
    expect(() => simulateRun(2 ** 32, [])).toThrow(ReplayError);
    expect(() => simulateRun(1.5, [])).toThrow(ReplayError);
  });

  it("a truncated replay is not a scoreable run", () => {
    const run = driveRun(31337, TARGET_SCORE, jitterForBeam);
    // Drop the fatal last hold: the player is mid-run, not finished.
    const truncated = simulateRun(run.seed, run.holds.slice(0, -1));
    expect(truncated.finished).toBe(false);
    expect(truncated.score).toBeGreaterThan(0);
  });
});

/* ---------------------------------------------------------------------------
   3. The tuned numbers are pinned
   --------------------------------------------------------------------------- */

describe("stretch goal — difficulty ladder", () => {
  it("keeps the five tiers on their tuned thresholds", () => {
    // These thresholds are tuned so that 100 is a real badge. Changing any of
    // them invalidates every stored replay — see REPLAY_VERSION.
    expect(TIERS.map((t) => t.at)).toEqual([0, 25, 50, 75, 100]);
    expect(TIERS.map((t) => t.name)).toEqual([
      "Warm-Up",
      "Uneven Ground",
      "Bent Beam",
      "Moving Ledges",
      "Overtime",
    ]);
  });

  it("maps a score to its tier", () => {
    expect(tierIndex(0)).toBe(0);
    expect(tierIndex(24)).toBe(0);
    expect(tierIndex(25)).toBe(1);
    expect(tierIndex(99)).toBe(3);
    expect(tierIndex(100)).toBe(4);
    expect(tierIndex(9999)).toBe(4);
  });

  it("bends the beam away from the pit, never up into a wall", () => {
    // A landing must always be a step DOWN onto the ledge, so ledges only ever
    // get deeper (drop >= 0) and the bend is a positive kink.
    for (const tier of TIERS) {
      expect(tier.drop).toBeGreaterThanOrEqual(0);
      expect(tier.bendMin).toBeGreaterThanOrEqual(0);
      expect(tier.bendMax).toBeGreaterThanOrEqual(tier.bendMin);
    }
  });

  it("pins REPLAY_VERSION, which must be bumped if the physics change", () => {
    expect(REPLAY_VERSION).toBe(1);
  });
});
