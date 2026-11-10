import { describe, expect, it } from "vitest";
import {
  InputRecorder,
  LEVELS,
  MAX_FRAMES,
  MAX_SCORE,
  SAVE_POINTS,
  createRun,
  currentPoints,
  simulateRun,
  step,
  validateLog,
  type InputLog,
  type Route,
} from "@/lib/trapshift/trapShiftCore";
import * as v1 from "@/lib/trapshift/trapShiftCore.v1";
import { looksScripted } from "@/lib/trapshift/flags";
import fixturesV1 from "./trapShift.fixtures.v1.json";
import fixturesV3 from "./trapShift.fixtures.v3.json";

/**
 * Trap Shift — the pure guarantees: every released core still replays its own
 * fixtures exactly, a live run and its replay never disagree, logs from one
 * version don't score on another, and the v3 rules (hidden flag, burning
 * floor, save points) hold. `trapShift.dom.test.ts` re-runs the fixtures under
 * happy-dom.
 */

type FixtureV1 = { seed: number; routes: Route[]; log: InputLog; expect: Record<string, unknown> };
type FixtureV3 = FixtureV1 & { startCp: number };
const V1 = fixturesV1 as unknown as Record<string, FixtureV1>;
const V3 = fixturesV3 as unknown as Record<string, FixtureV3>;

/* ---------------------------------------------------------------- fixtures */

describe("trap shift v3 — fixtures", () => {
  for (const [name, f] of Object.entries(V3)) {
    it(`replays fixture ${name} (startCp ${f.startCp}) exactly`, () => {
      expect(simulateRun(f.seed, f.routes, f.log, f.startCp)).toMatchObject(f.expect);
    });
  }
});

describe("trap shift v1 — fixtures still pass on the v1 core", () => {
  for (const [name, f] of Object.entries(V1)) {
    it(`replays v1 fixture ${name} exactly`, () => {
      expect(v1.simulateRun(f.seed, f.routes, f.log)).toMatchObject(f.expect);
    });
  }
});

describe("trap shift — cross-version", () => {
  it("v1 perfect runs replayed on the v3 core do not return 300", () => {
    for (const name of ["A", "B"]) {
      const f = V1[name];
      expect(v1.simulateRun(f.seed, f.routes, f.log).points, `v1 ${name}`).toBe(v1.PERFECT_SCORE);
      expect(simulateRun(f.seed, f.routes, f.log).points, `v1 ${name} on v3`).not.toBe(MAX_SCORE);
    }
  });

  it("fromL2Half's log replayed from the start (startCp 0) does not give 300", () => {
    const f = V3.fromL2Half;
    expect(simulateRun(f.seed, f.routes, f.log, 0).points).not.toBe(MAX_SCORE);
  });
});

/* -------------------------------------------------- range and integrity */

/** A scripted player: runs right, jumps on a seed-dependent rhythm, sometimes backs off. */
function scriptedBits(frame: number, seed: number): number {
  const phase = (frame + seed) % 97;
  let bits = 2;
  if (phase % 23 < 6) bits |= 4;
  if (phase > 88) bits = (bits & ~2) | 1;
  return bits;
}

describe("trap shift v3 — score range and replay integrity", () => {
  it("over 300 seeds (every save point): integer 0..300, and the replay matches the live run", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const routes: Route[] = [(seed & 1) as Route, ((seed >> 1) & 1) as Route, ((seed >> 2) & 1) as Route];
      const startCp = seed % SAVE_POINTS;
      const live = createRun(seed * 7919, routes, startCp);
      const rec = new InputRecorder();
      while (live.phase !== "over" && live.frame < 6000) {
        const bits = scriptedBits(live.frame, seed);
        rec.push(bits);
        step(live, bits);
      }
      const replay = simulateRun(seed * 7919, routes, rec.log, startCp);
      expect(Number.isInteger(replay.points), `seed ${seed}`).toBe(true);
      expect(replay.points, `seed ${seed}`).toBeGreaterThanOrEqual(0);
      expect(replay.points, `seed ${seed}`).toBeLessThanOrEqual(MAX_SCORE);
      expect(replay.points, `seed ${seed}`).toBe(currentPoints(live));
      expect(replay.frames, `seed ${seed}`).toBe(live.frame);
      expect(replay.checkpoint, `seed ${seed}`).toBe(live.cpReached);
      expect(rec.frames).toBe(live.frame);
    }
  });
});

/* --------------------------------------------------------------- v3 rules */

describe("trap shift v3 — hidden EOD flag", () => {
  it("the real flag stays hidden and untouchable until the player is past the decoy", () => {
    const s = createRun(424242, [0, 0, 0]);
    const decoy = Math.max(...(s.lv.decoys as number[]));
    expect(s.lv.goalShown).toBe(false);

    // Just past the decoy's body but not yet 30 px past it: still hidden.
    s.p.x = decoy + 27;
    step(s, 0);
    expect(s.phase).toBe("play");
    expect(s.lv.goalShown).toBe(false);

    // Teleport onto the real flag while the reveal is pending (decoy moved past the goal).
    const s2 = createRun(424242, [0, 0, 0]);
    s2.lv.decoys = [9000];
    s2.p.x = s2.lv.goal.x + 4;
    for (let i = 0; i < 5; i++) step(s2, 0);
    expect(s2.cleared).toBe(0);
    expect(s2.phase).toBe("play");
    expect(s2.lv.goalShown).toBe(false);

    // Once past the decoy, it pops in.
    s.p.x = decoy + 31;
    step(s, 0);
    expect(s.lv.goalShown).toBe(true);
  });

  it("in a real winning run the flag is never shown before the player passes the decoy", () => {
    const f = V3.ABA;
    const s = createRun(f.seed, f.routes, 0, false);
    for (const [bits, n] of f.log) {
      for (let i = 0; i < n; i++) {
        const decoy = Math.max(...(s.lv.decoys as number[]));
        step(s, bits);
        if (s.phase === "play" && !s.lv.goalShown) expect(s.maxX).toBeLessThanOrEqual(decoy + 30);
      }
    }
    expect(s.won).toBe(true);
  });
});

describe("trap shift v3 — burning floor", () => {
  it("burn fixture: fire starts at x = 0 on step 300 and catches an idle player at step 340", () => {
    const s = createRun(424242, [0, 0, 0], 0, false);
    for (let i = 0; i < 299; i++) step(s, 0);
    expect(s.burnX).toBeNull();
    step(s, 0);
    expect(s.frame).toBe(300);
    expect(s.burnX).toBe(1.5); // first creep from x = 0
    while (s.phase !== "over") step(s, 0);
    expect(s.frame).toBe(340);
    expect(s.cause).toBe("burn");
  });

  it("only Level 1 burns", () => {
    expect(LEVELS[0].every((d) => d.burn !== null)).toBe(true);
    expect(LEVELS.slice(1).flat().every((d) => d.burn === null)).toBe(true);
  });
});

describe("trap shift v3 — save points", () => {
  it("spawning at every save point on both routes and standing still for 20 steps never dies", () => {
    for (const r of [0, 1] as Route[]) {
      for (let cp = 0; cp < SAVE_POINTS; cp++) {
        for (let seed = 1; seed <= 25; seed++) {
          const s = createRun(seed * 104729, [r, r, r], cp, false);
          expect(s.li).toBe(Math.floor(cp / 2));
          for (let i = 0; i < 20; i++) step(s, 0);
          expect(s.phase, `route ${r} cp ${cp} seed ${seed}`).toBe("play");
        }
      }
    }
  });

  it("refuses a start point outside 0..5", () => {
    expect(() => createRun(1, [0, 0, 0], 6)).toThrow();
    expect(() => createRun(1, [0, 0, 0], -1)).toThrow();
    expect(() => createRun(1, [0, 0, 0], 1.5)).toThrow();
  });

  it("a log played from the start does not replay from Level 3", () => {
    const f = V3.ABA;
    expect(simulateRun(f.seed, f.routes, f.log, 4).points).not.toBe(MAX_SCORE);
  });
});

/* ---------------------------------------------------------------- forgery */

describe("trap shift v3 — forgery", () => {
  it("a valid log on the wrong seed or routes plays out differently", () => {
    const a = V3.ABA;
    expect(simulateRun(a.seed, [1, 1, 1], a.log).points).toBeLessThan(MAX_SCORE);
    const scores = [1, 2, 3, 4, 5, 6, 7, 8].map((d) => simulateRun(a.seed + d, a.routes, a.log).points);
    expect(scores.some((p) => p !== MAX_SCORE)).toBe(true);
  });

  it.each([
    ["null", null],
    ["empty", []],
    ["bits 9", [[9, 10]]],
    ["frames 0", [[2, 0]]],
    ["frames 1.5", [[2, 1.5]]],
    ["string bits", [["2", 10]]],
    ["over 15 minutes", [[2, MAX_FRAMES + 1]]],
    ["not pairs", [[2, 10, 3]]],
  ])("rejects a %s log", (_name, log) => {
    expect(validateLog(log)).not.toBeNull();
    expect(() => simulateRun(1, [0, 0, 0], log as InputLog)).toThrow();
  });

  it("a log that stops mid-run scores as quit with the distance so far", () => {
    const r = simulateRun(V3.ABA.seed, [0, 0, 0], [[2, 60]]);
    expect(r.ended).toBe("quit");
    expect(r.points).toBeGreaterThan(0);
  });
});

describe("trap shift — review flags", () => {
  it("flags solver-shaped logs (run lengths in multiples of 6)", () => {
    expect(looksScripted(V1.A.log)).toBe(true);
    expect(looksScripted(V3.BAB.log)).toBe(true);
  });

  it("does not flag a jittery human-shaped log", () => {
    const human: InputLog = Array.from({ length: 60 }, (_, i) => [i % 2 ? 6 : 2, 5 + ((i * 7) % 11)]);
    expect(looksScripted(human)).toBe(false);
  });

  it("does not flag short logs", () => {
    expect(looksScripted([[2, 400]])).toBe(false);
  });
});
