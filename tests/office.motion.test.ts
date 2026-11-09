import { describe, it, expect } from "vitest";
import { poseAt, sheetRow, WALK_SPEED } from "@/lib/office/motion";
import type { Segment } from "@/lib/office/schedule";
import type { Seats } from "@/lib/office/seats";

const seats: Seats = {
  EXIT: { x: 200, y: 260, facing: null },
  CR: { x: 1100, y: 260, facing: null },
  D4: { x: 260, y: 492, facing: null },
  L2: { x: 1221, y: 530, facing: "right" },
  R3: { x: 1410, y: 549, facing: "left" },
  G1: { x: 760, y: 975, facing: null },
  FAR: { x: 1200, y: 260, facing: null },
};
// A straight line between the two spots stands in for A*.
const route = (from: string, to: string) => [{ x: seats[from].x, y: seats[from].y }, { x: seats[to].x, y: seats[to].y }];

const day: Segment[] = [
  { start: 480, end: 495, activity: "arrive", spot: "D4" },
  { start: 495, end: 510, activity: "work", spot: "D4" },
  { start: 510, end: 525, activity: "cr", spot: "CR" },
  { start: 525, end: 540, activity: "lunch", spot: "L2" },
  { start: 540, end: 555, activity: "lunch", spot: "R3" },
  { start: 555, end: 570, activity: "talk", spot: "G1" },
  { start: 1025, end: 1030, activity: "leave", spot: "EXIT" },
];

describe("poseAt", () => {
  it("is null before arriving and after leaving", () => {
    expect(poseAt(day, 400, seats, route)).toBeNull();
    expect(poseAt(day, 1100, seats, route)).toBeNull();
  });

  it("starts the day walking in from EXIT", () => {
    expect(poseAt(day, 480, seats, route)).toMatchObject({ x: 200, y: 260, walking: true, seat: null });
  });

  it("sits typing at the desk once the walk is done", () => {
    const walkSec = Math.hypot(60, 232) / WALK_SPEED;
    expect(walkSec).toBeLessThan(60);
    expect(poseAt(day, 481, seats, route)).toEqual({ x: 260, y: 492, row: 4, flip: false, walking: false, seat: "D4" });
  });

  it("stays seated when the next segment is at the same spot (arrive -> work at 8:15)", () => {
    // Like real A*, a same-spot route detours via the nearest open cell (seats sit inside furniture).
    const viaAisle = (from: string, to: string) =>
      from === to ? [seats[from], { x: seats[from].x, y: seats[from].y - 100 }, seats[to]] : route(from, to);
    expect(poseAt(day, 495, seats, viaAisle)).toMatchObject({ x: 260, y: 492, row: 4, walking: false });
  });

  it("is hidden inside the CR door after walking there", () => {
    expect(poseAt(day, 524, seats, route)).toBeNull();
  });

  it("eats in profile at side seats, facing the table", () => {
    expect(poseAt(day, 539, seats, route)).toMatchObject({ row: 12, flip: true, seat: "L2" });
    expect(poseAt(day, 554, seats, route)).toMatchObject({ row: 12, flip: false, seat: "R3" });
  });

  it("faces right when talking from the left spot of a pair", () => {
    expect(poseAt(day, 569, seats, route)).toMatchObject({ row: 8, flip: true, seat: "G1" });
  });

  it("skipWalk jumps straight to the arrived pose", () => {
    expect(poseAt(day, 480, seats, route, { skipWalk: true })).toMatchObject({ x: 260, y: 492, row: 4, walking: false });
  });

  it("walks with the side row when moving mostly right", () => {
    const walk: Segment[] = [{ start: 600, end: 615, activity: "coffee", spot: "FAR" }];
    const pose = poseAt([{ start: 590, end: 600, activity: "work", spot: "EXIT" }, ...walk], 600.05, seats, route);
    expect(pose).toMatchObject({ row: 3, flip: true, walking: true });
  });
});

describe("sheetRow", () => {
  it("falls back to row 5 when a sheet has no row 12", () => {
    expect(sheetRow(12, 1728)).toBe(5);
    expect(sheetRow(12, 1872)).toBe(12);
    expect(sheetRow(4, 1728)).toBe(4);
  });
});
