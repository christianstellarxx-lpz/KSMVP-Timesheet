import { describe, it, expect } from "vitest";
import { drawOrder, WAIST, type DrawOp, type SceneObject } from "@/lib/office/layers";

const obj = (id: number, kind: SceneObject["kind"], baseline: number, seats: string[] = []): SceneObject => ({
  id, x: 0, y: 0, w: 10, h: 10, baseline, kind, seats,
});
const TABLE = obj(1, "table", 662);
const L2 = obj(2, "chair", 540, ["L2"]);
const L3 = obj(3, "chair", 590, ["L3"]);
const B1 = obj(4, "chair", 686, ["B1"]);
const LOUNGE = obj(5, "lounge", 963, ["A1"]);
const DESK = obj(6, "desk", 600);
const OBJECTS = [TABLE, L2, L3, B1, LOUNGE, DESK];

const pos = (ops: DrawOp[], op: Partial<DrawOp> & { kind: DrawOp["kind"] }) =>
  ops.findIndex((o) =>
    o.kind === op.kind && (o.kind === "object" ? o.id === (op as { id: number }).id : o.slug === (op as { slug: string }).slug),
  );
const ob = (id: number) => ({ kind: "object" as const, id });
const pe = (slug: string) => ({ kind: "person" as const, slug });

describe("drawOrder", () => {
  it("sorts a walker by feet y between a desk and the table", () => {
    const ops = drawOrder(OBJECTS, [{ slug: "w", x: 500, y: 610, seat: null }]);
    expect(pos(ops, ob(6))).toBeLessThan(pos(ops, pe("w")));
    expect(pos(ops, pe("w"))).toBeLessThan(pos(ops, ob(1)));
  });

  it("draws an armchair sitter right after their lounge group", () => {
    const ops = drawOrder(OBJECTS, [{ slug: "a", x: 724, y: 900, seat: "A1" }]);
    expect(pos(ops, pe("a"))).toBe(pos(ops, ob(5)) + 1);
  });

  it("puts a bottom-end diner after the table and behind their own chair", () => {
    const ops = drawOrder(OBJECTS, [{ slug: "b", x: 1321, y: 665, seat: "B1" }]);
    expect(pos(ops, ob(1))).toBeLessThan(pos(ops, pe("b")));
    expect(pos(ops, pe("b"))).toBeLessThan(pos(ops, ob(4)));
  });

  it("puts a side diner over their own chair and under the next chair down", () => {
    const ops = drawOrder(OBJECTS, [{ slug: "l", x: 1221, y: 530, seat: "L2" }]);
    expect(pos(ops, ob(2))).toBeLessThan(pos(ops, pe("l")));
    expect(pos(ops, pe("l"))).toBeLessThan(pos(ops, ob(3)));
  });

  it("redraws a left diner over the table, then chairs in front and the table's waist band", () => {
    const x = 1221, y = 530;
    const ops = drawOrder(OBJECTS, [{ slug: "l", x, y, seat: "L2" }]);
    const frame = { x: x - 72, y: y - 144, w: 144, h: 144 };
    expect(ops.slice(-4)).toEqual([
      { kind: "person", slug: "l" },
      { kind: "object", id: 3, clip: frame },
      { kind: "object", id: 4, clip: frame },
      { kind: "object", id: 1, clip: { x: x - 72, y: y - WAIST, w: 144, h: WAIST } },
    ]);
  });
});
