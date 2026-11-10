// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { simulateRun, type InputLog, type Route } from "@/lib/trapshift/trapShiftCore";
import * as v1 from "@/lib/trapshift/trapShiftCore.v1";
import fixturesV1 from "./trapShift.fixtures.v1.json";
import fixturesV3 from "./trapShift.fixtures.v3.json";

/**
 * The same fixtures as trapShift.test.ts, under a browser environment. The core
 * uses only + - * / and Math.imul/floor/min/max, which are exact in every JS
 * engine, so this guards against a browser-only global sneaking into the core
 * rather than against engine maths.
 */
type Fixture = { seed: number; routes: Route[]; log: InputLog; startCp?: number; expect: Record<string, unknown> };

describe("trap shift — fixtures in a browser environment", () => {
  it("runs under happy-dom", () => {
    expect(typeof window).toBe("object");
    expect(typeof document.createElement).toBe("function");
  });

  for (const [name, f] of Object.entries(fixturesV3 as unknown as Record<string, Fixture>)) {
    it(`replays v3 fixture ${name} exactly`, () => {
      expect(simulateRun(f.seed, f.routes, f.log, f.startCp)).toMatchObject(f.expect);
    });
  }

  for (const [name, f] of Object.entries(fixturesV1 as unknown as Record<string, Fixture>)) {
    it(`replays v1 fixture ${name} exactly on the v1 core`, () => {
      expect(v1.simulateRun(f.seed, f.routes, f.log)).toMatchObject(f.expect);
    });
  }
});
