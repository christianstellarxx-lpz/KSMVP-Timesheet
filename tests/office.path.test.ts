import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseWalkable, findPath, type Grid, type Pt } from "@/lib/office/path";
import { parseSeats } from "@/lib/office/seats";

const grid = parseWalkable(readFileSync("public/office/web/walkable.txt", "utf8"));
const seats = parseSeats(readFileSync("public/office/seats.txt", "utf8"));
const at = (code: string): Pt => ({ x: seats[code].x, y: seats[code].y });
const isOpen = (g: Grid, p: Pt) => g.open[Math.floor(p.y / g.cell) * g.cols + Math.floor(p.x / g.cell)] === 1;
const desks = Array.from({ length: 11 }, (_, i) => `D${i + 1}`);

describe("findPath", () => {
  it("reads the full grid", () => {
    expect(grid.cols).toBe(192);
    expect(grid.rows).toBe(128);
  });

  it("waypoints are on open cells", () => {
    const path = findPath(grid, at("EXIT"), at("D11"));
    for (const p of path.slice(1, -1)) expect(isOpen(grid, p), JSON.stringify(p)).toBe(true);
  });

  it("EXIT reaches every desk", () => {
    for (const d of desks) {
      const path = findPath(grid, at("EXIT"), at(d));
      expect(path.length, d).toBeGreaterThan(2);
      expect(path[path.length - 1]).toEqual(at(d));
    }
  });

  it("every desk reaches the lunch table", () => {
    for (const d of desks) {
      const path = findPath(grid, at(d), at("L1"));
      expect(path.length, d).toBeGreaterThan(2);
      expect(path[path.length - 1]).toEqual(at("L1"));
    }
  });

  it("detours around a wall on a tiny grid", () => {
    // 5 x 3 cells, wall in the middle column except the bottom row.
    const tiny = parseWalkable(["..#..", "..#..", "....."].join("\n"), 10);
    const path = findPath(tiny, { x: 5, y: 5 }, { x: 45, y: 5 });
    for (const p of path) expect(p.x >= 20 && p.x < 30 && p.y < 20).toBe(false);
    expect(path.some((p) => p.y >= 20)).toBe(true);
  });
});
