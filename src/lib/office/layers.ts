// Draw order for one frame: objects (furniture cut from the bg) and people sorted
// by baseline y, plus the seat overrides from the spec (Rendering -> Overrides).

export type ObjectKind = "exec" | "desk" | "plant" | "lounge" | "table" | "chair";
/** One entry of public/office/web/objects.json. */
export type SceneObject = { id: number; x: number; y: number; w: number; h: number; baseline: number; kind: ObjectKind; seats: string[] };
export type Placed = { slug: string; x: number; y: number; seat: string | null };
export type Rect = { x: number; y: number; w: number; h: number };
export type DrawOp = { kind: "object"; id: number; clip: Rect | null } | { kind: "person"; slug: string };

/** A left-side diner covers the tabletop from the waist up; the table still hides the last 40 px (legs). */
export const WAIST = 40;

export function drawOrder(objects: SceneObject[], people: Placed[]): DrawOp[] {
  const table = objects.find((o) => o.kind === "table");
  const chairOf = (seat: string) => objects.find((o) => o.kind === "chair" && o.seats.includes(seat));
  const keys = new Map<SceneObject, number>(objects.map((o) => [o, o.baseline]));
  const items: { key: number; tie: number; op: DrawOp }[] = [];

  for (const p of people) {
    let key = p.y;
    const kind = p.seat?.[0];
    const own = p.seat && "TLRB".includes(kind!) ? chairOf(p.seat) : undefined;
    if (kind === "A") {
      const lounge = objects.find((o) => o.kind === "lounge" && o.seats.includes(p.seat!));
      if (lounge) key = lounge.baseline + 0.5;
    } else if (kind === "B" && table) {
      key = table.baseline + 1; // sits in front of the table's end, back to us
      if (own) keys.set(own, table.baseline + 1.5); // their chair back covers them
    } else if (own) {
      keys.set(own, p.y - 0.5); // a diner draws over their own chair
    }
    items.push({ key, tie: 1, op: { kind: "person", slug: p.slug } });
  }
  for (const [o, key] of keys) items.push({ key, tie: 0, op: { kind: "object", id: o.id, clip: null } });
  items.sort((a, b) => a.key - b.key || a.tie - b.tie);
  const ops = items.map((i) => i.op);

  const left = people.filter((p) => p.seat?.[0] === "L").sort((a, b) => a.seat!.localeCompare(b.seat!));
  for (const p of left) {
    const frame = { x: p.x - 72, y: p.y - 144, w: 144, h: 144 };
    ops.push({ kind: "person", slug: p.slug });
    const inFront = ["L1", "L2", "L3", "L4"].filter((s) => s > p.seat!).concat("B1", "B2");
    for (const s of inFront) {
      const chair = chairOf(s);
      if (chair) ops.push({ kind: "object", id: chair.id, clip: frame });
    }
    if (table) ops.push({ kind: "object", id: table.id, clip: { x: p.x - 72, y: p.y - WAIST, w: 144, h: WAIST } });
  }
  return ops;
}
