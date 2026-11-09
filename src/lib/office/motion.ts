// Where a person is at a given ET minute, and which sprite row they show.
// Pure: recomputed from the clock every frame, so a page opened mid-day lands
// everyone where they should be.
import type { Segment } from "@/lib/office/schedule";
import type { Seats } from "@/lib/office/seats";
import { pathLength, type Pt } from "@/lib/office/path";

export type Pose = { x: number; y: number; row: number; flip: boolean; walking: boolean; seat: string | null };

export const WALK_SPEED = 70; // px per second

/** Row 12 (eating in profile) needs chunk D; a sheet without it shows row 5 instead. */
export function sheetRow(row: number, sheetHeight: number): number {
  return row === 12 && sheetHeight < 13 * 144 ? 5 : row;
}

function restingRow(seg: Segment): { row: number; flip: boolean } {
  const kind = seg.spot[0];
  switch (seg.activity) {
    case "lunch":
      if (kind === "L") return { row: 12, flip: true };
      if (kind === "R") return { row: 12, flip: false };
      return { row: kind === "B" ? 6 : 5, flip: false };
    case "armchair": return { row: 5, flip: false };
    case "talk": return { row: 8, flip: seg.spot === "G1" || seg.spot === "G3" };
    case "laugh": return { row: 9, flip: false };
    case "coffee": return { row: 7, flip: false };
    case "workout": return { row: 10, flip: false };
    default: return { row: 4, flip: false }; // arrive, work: typing at the desk
  }
}

function along(pts: Pt[], dist: number): { p: Pt; dx: number; dy: number } {
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
    const len = Math.hypot(dx, dy);
    if (dist <= len || i === pts.length - 1) {
      const t = len ? Math.min(1, dist / len) : 1;
      return { p: { x: pts[i - 1].x + dx * t, y: pts[i - 1].y + dy * t }, dx, dy };
    }
    dist -= len;
  }
  return { p: pts[0], dx: 0, dy: 0 };
}

export function poseAt(
  segments: Segment[],
  minute: number,
  seats: Seats,
  route: (from: string, to: string) => Pt[],
  opts: { skipWalk?: boolean } = {},
): Pose | null {
  const k = segments.findIndex((s) => s.start <= minute && minute < s.end);
  if (k < 0) return null;
  const seg = segments[k];
  const prev = k === 0 ? "EXIT" : segments[k - 1].spot;
  const pts = prev === seg.spot ? [] : route(prev, seg.spot); // e.g. arrive -> work at the same desk
  const walked = (minute - seg.start) * 60 * WALK_SPEED;
  if (!opts.skipWalk && walked < pathLength(pts)) {
    const { p, dx, dy } = along(pts, walked);
    const row = Math.abs(dx) > Math.abs(dy) ? 3 : dy > 0 ? 1 : 2;
    return { x: p.x, y: p.y, row, flip: row === 3 && dx > 0, walking: true, seat: null };
  }
  if (seg.activity === "cr" || seg.activity === "leave") return null; // inside the door
  const spot = seats[seg.spot];
  return { x: spot.x, y: spot.y, ...restingRow(seg), walking: false, seat: seg.spot };
}
