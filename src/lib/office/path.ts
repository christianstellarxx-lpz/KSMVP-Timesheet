// Grid A* over the walkable floor (public/office/web/walkable.txt, built by
// scripts/office-assets.py). Coordinates in and out are art pixels.

export type Pt = { x: number; y: number };
export type Grid = { cols: number; rows: number; cell: number; open: Uint8Array };

export function parseWalkable(text: string, cell = 8): Grid {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const rows = lines.length;
  const cols = lines[0].length;
  const open = new Uint8Array(rows * cols);
  lines.forEach((line, r) => {
    for (let c = 0; c < cols; c++) open[r * cols + c] = line[c] === "." ? 1 : 0;
  });
  return { cols, rows, cell, open };
}

export function pathLength(pts: Pt[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

/** Index of the open cell nearest to `p` (breadth-first outwards). Seats sit inside furniture. */
function nearestOpen(g: Grid, p: Pt): number {
  const c0 = Math.min(g.cols - 1, Math.max(0, Math.floor(p.x / g.cell)));
  const r0 = Math.min(g.rows - 1, Math.max(0, Math.floor(p.y / g.cell)));
  const seen = new Uint8Array(g.open.length);
  const queue = [r0 * g.cols + c0];
  seen[queue[0]] = 1;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    if (g.open[i]) return i;
    const r = Math.floor(i / g.cols), c = i % g.cols;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= g.rows || nc >= g.cols) continue;
      const n = nr * g.cols + nc;
      if (!seen[n]) { seen[n] = 1; queue.push(n); }
    }
  }
  return -1;
}

/** Binary min-heap of cell indexes keyed by f. */
class Heap {
  private items: { f: number; i: number }[] = [];
  get size() { return this.items.length; }
  push(f: number, i: number) {
    const a = this.items;
    a.push({ f, i });
    for (let k = a.length - 1; k > 0; ) {
      const p = (k - 1) >> 1;
      if (a[p].f <= a[k].f) break;
      [a[p], a[k]] = [a[k], a[p]];
      k = p;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0].i;
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      for (let k = 0; ; ) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === k) break;
        [a[m], a[k]] = [a[k], a[m]];
        k = m;
      }
    }
    return top;
  }
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** [from, ...waypoints, to]. The first and last legs are the short straight steps into a seat. */
export function findPath(g: Grid, from: Pt, to: Pt): Pt[] {
  const s = nearestOpen(g, from), t = nearestOpen(g, to);
  // shortcut: a straight line through furniture if the guide is ever broken; tests keep every real route valid.
  if (s < 0 || t < 0) return [from, to];
  const tc = t % g.cols, tr = Math.floor(t / g.cols);
  const h = (i: number) => {
    const dx = Math.abs((i % g.cols) - tc), dy = Math.abs(Math.floor(i / g.cols) - tr);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy); // octile
  };
  const cost = new Float64Array(g.open.length).fill(Infinity);
  const came = new Int32Array(g.open.length).fill(-1);
  const heap = new Heap();
  cost[s] = 0;
  heap.push(h(s), s);
  while (heap.size) {
    const i = heap.pop();
    if (i === t) break;
    const r = Math.floor(i / g.cols), c = i % g.cols;
    for (const [dc, dr] of DIRS) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= g.rows || nc >= g.cols) continue;
      const n = nr * g.cols + nc;
      if (!g.open[n]) continue;
      if (dr && dc && (!g.open[r * g.cols + nc] || !g.open[nr * g.cols + c])) continue; // no corner cutting
      const next = cost[i] + (dr && dc ? Math.SQRT2 : 1);
      if (next < cost[n]) { cost[n] = next; came[n] = i; heap.push(next + h(n), n); }
    }
  }
  if (s !== t && came[t] < 0) return [from, to];

  const cells: number[] = [];
  for (let i = t; i !== -1; i = i === s ? -1 : came[i]) cells.push(i);
  cells.reverse();
  const centre = (i: number): Pt => ({ x: (i % g.cols) * g.cell + g.cell / 2, y: Math.floor(i / g.cols) * g.cell + g.cell / 2 });
  const corners = cells.filter((i, k) => {
    if (k === 0 || k === cells.length - 1) return true;
    const a = cells[k - 1], b = cells[k + 1];
    return i - a !== b - i; // keep a cell only where the direction changes
  });
  const pts = [from, ...corners.map(centre), to];
  return pts.filter((p, k) => k === 0 || p.x !== pts[k - 1].x || p.y !== pts[k - 1].y);
}
