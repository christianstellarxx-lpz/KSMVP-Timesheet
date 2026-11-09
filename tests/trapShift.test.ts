import { describe, expect, it } from "vitest";
import {
  InputRecorder,
  MAX_FRAMES,
  createRun,
  currentPoints,
  simulateRun,
  step,
  validateLog,
  type InputLog,
  type Route,
} from "@/lib/trapshift/trapShiftCore";
import { looksScripted } from "@/lib/trapshift/flags";
import fixtures from "./trapShift.fixtures.json";

/**
 * Trap Shift — the pure guarantees: the recorded fixtures replay exactly, a
 * live run and its replay never disagree, and malformed or mismatched logs are
 * refused. `trapShift.dom.test.ts` re-runs the fixtures under happy-dom.
 */

type Fixture = { seed: number; routes: Route[]; log: InputLog; expect: Record<string, unknown> };
const FIXTURES = fixtures as unknown as Record<string, Fixture>;

describe("trap shift — fixtures", () => {
  for (const [name, f] of Object.entries(FIXTURES)) {
    it(`replays fixture ${name} exactly`, () => {
      expect(simulateRun(f.seed, f.routes, f.log)).toMatchObject(f.expect);
    });
  }
});

/** A scripted player: runs right, jumps on a seed-dependent rhythm, sometimes backs off. */
function scriptedBits(frame: number, seed: number): number {
  const phase = (frame + seed) % 97;
  let bits = 2;
  if (phase % 23 < 6) bits |= 4;
  if (phase > 88) bits = (bits & ~2) | 1;
  return bits;
}

describe("trap shift — replay integrity", () => {
  it("a live run and its recorded replay agree over 300 seeds", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const routes: Route[] = [(seed & 1) as Route, ((seed >> 1) & 1) as Route, ((seed >> 2) & 1) as Route];
      const live = createRun(seed * 7919, routes);
      const rec = new InputRecorder();
      while (live.phase !== "over" && live.frame < 6000) {
        const bits = scriptedBits(live.frame, seed);
        rec.push(bits);
        step(live, bits);
      }
      const replay = simulateRun(seed * 7919, routes, rec.log);
      expect(replay.points, `seed ${seed}`).toBe(currentPoints(live));
      expect(replay.frames, `seed ${seed}`).toBe(live.frame);
      expect(rec.frames).toBe(live.frame);
    }
  });
});

describe("trap shift — forgery", () => {
  it("a valid log on the wrong seed or routes plays out differently", () => {
    const a = FIXTURES.A;
    const wrongRoutes = simulateRun(a.seed, [1, 1, 1], a.log);
    expect(wrongRoutes.points).toBeLessThan(375);
    // Different seeds change the thrown-spike pattern; across a handful, the
    // perfect log must stop being perfect.
    const scores = [1, 2, 3, 4, 5, 6, 7, 8].map((d) => simulateRun(a.seed + d, a.routes, a.log).points);
    expect(scores.some((p) => p !== 375)).toBe(true);
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
    const r = simulateRun(FIXTURES.A.seed, [0, 0, 0], [[2, 60]]);
    expect(r.ended).toBe("quit");
    expect(r.points).toBeGreaterThan(0);
  });
});

describe("trap shift — review flags", () => {
  it("flags solver-shaped logs (run lengths in multiples of 6)", () => {
    expect(looksScripted(FIXTURES.A.log)).toBe(true);
    expect(looksScripted(FIXTURES.B.log)).toBe(true);
  });

  it("does not flag a jittery human-shaped log", () => {
    const human: InputLog = Array.from({ length: 60 }, (_, i) => [i % 2 ? 6 : 2, 5 + ((i * 7) % 11)]);
    expect(looksScripted(human)).toBe(false);
  });

  it("does not flag short logs", () => {
    expect(looksScripted([[2, 400]])).toBe(false);
  });
});
