import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseSeats } from "@/lib/office/seats";

const seats = parseSeats(readFileSync("public/office/seats.txt", "utf8"));
const range = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${i + 1}`);
const LUNCH = [...range("T", 3), ...range("L", 4), ...range("R", 5), ...range("B", 2)];

describe("seats.txt", () => {
  it("has every code", () => {
    const codes = [...range("D", 11), ...LUNCH, ...range("A", 4), ...range("G", 4), ...range("C", 3), ...range("W", 3), "EXIT", "CR"];
    for (const c of codes) expect(seats[c], c).toBeDefined();
  });

  it("reads desk lines with names", () => {
    expect(seats.D1).toEqual({ x: 652, y: 289, facing: null });
    expect(seats.D11).toEqual({ x: 1006, y: 650, facing: null });
  });

  it("reads facing", () => {
    expect(seats.L1.facing).toBe("right");
    expect(seats.R1.facing).toBe("left");
    expect(seats.T1.facing).toBe("front");
    expect(seats.B1.facing).toBe("back");
  });

  it("rejects a line without coordinates", () => {
    expect(() => parseSeats("Z9 nope")).toThrow(/line 1/);
  });

  it("objects.json has a chair for every lunch seat", () => {
    const { objects } = JSON.parse(readFileSync("public/office/web/objects.json", "utf8")) as {
      objects: { kind: string; seats: string[] }[];
    };
    for (const code of LUNCH) {
      expect(objects.filter((o) => o.kind === "chair" && o.seats.includes(code)), code).toHaveLength(1);
    }
  });
});
