"use client";

// The live office: one canvas, redrawn from the ET clock every frame. Everything
// it shows comes from the pure modules in src/lib/office; this file only loads
// assets, draws, and handles click-to-wave. Nothing is sent to the server.
import { useEffect, useRef, useState } from "react";
import { DateTime } from "luxon";
import { ET_ZONE } from "@/lib/time";
import type { OfficePersonDTO } from "@/lib/office/roster";
import { parseSeats, type Seats } from "@/lib/office/seats";
import { planDay, periodFor, type DayPlan, type Period } from "@/lib/office/schedule";
import { parseWalkable, findPath, type Grid, type Pt } from "@/lib/office/path";
import { poseAt, sheetRow, type Pose } from "@/lib/office/motion";
import { drawOrder, type SceneObject } from "@/lib/office/layers";
import { retryCache } from "@/lib/office/retryCache";

const W = 1536;
const H = 1024;
const FRAME = 144;
const WAVE_MS = 1500;
const BASE = "/office/web";

type Shared = { seats: Seats; grid: Grid; objects: SceneObject[]; ids: Uint8ClampedArray };
type Backdrop = { bg: HTMLImageElement; cutouts: Map<number, HTMLCanvasElement> };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

function pixels(img: HTMLImageElement): Uint8ClampedArray {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, W, H).data;
}

async function loadShared(): Promise<Shared> {
  const text = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`failed to load ${url}`);
    return res.text();
  };
  const [seats, walkable, objects, idImg] = await Promise.all([
    text("/office/seats.txt"),
    text(`${BASE}/walkable.txt`),
    text(`${BASE}/objects.json`),
    loadImage(`${BASE}/objects.png`),
  ]);
  return {
    seats: parseSeats(seats),
    grid: parseWalkable(walkable),
    objects: (JSON.parse(objects) as { objects: SceneObject[] }).objects,
    ids: pixels(idImg),
  };
}

/** Each object is cut from the bg that is showing, so it always matches it pixel for pixel. */
async function loadBackdrop(period: Period, shared: Shared): Promise<Backdrop> {
  const bg = await loadImage(`${BASE}/bg-${period}.webp`);
  const src = pixels(bg);
  const cutouts = new Map<number, HTMLCanvasElement>();
  for (const o of shared.objects) {
    const c = document.createElement("canvas");
    c.width = o.w;
    c.height = o.h;
    const ctx = c.getContext("2d")!;
    const out = ctx.createImageData(o.w, o.h);
    for (let y = 0; y < o.h; y++)
      for (let x = 0; x < o.w; x++) {
        const i = (o.y + y) * W + (o.x + x);
        if (shared.ids[i * 4] !== o.id) continue;
        out.data.set(src.subarray(i * 4, i * 4 + 4), (y * o.w + x) * 4);
      }
    ctx.putImageData(out, 0, 0);
    cutouts.set(o.id, c);
  }
  return { bg, cutouts };
}

/** ET date + fractional minute. Dev only: ?office-time=YYYY-MM-DDTHH:mm starts the clock there. */
function makeClock(): () => { date: string; minute: number } {
  let offset = 0;
  const forced = process.env.NODE_ENV !== "production" && new URLSearchParams(location.search).get("office-time");
  if (forced) {
    const t = DateTime.fromISO(forced, { zone: ET_ZONE });
    if (t.isValid) offset = t.toMillis() - Date.now();
  }
  return () => {
    const t = DateTime.fromMillis(Date.now() + offset, { zone: ET_ZONE });
    return { date: t.toISODate()!, minute: t.hour * 60 + t.minute + t.second / 60 + t.millisecond / 60000 };
  };
}

export default function OfficeScene({ people }: { people: OfficePersonDTO[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    const now = makeClock();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let disposed = false;
    let shared: Shared | null = null;
    const sheets = new Map<string, HTMLImageElement>();
    const routes = new Map<string, Pt[]>();
    const waves = new Map<string, number>(); // slug -> wave ends (performance.now)
    let plan: { date: string; day: DayPlan } | null = null;
    let lastPlaced: (Pose & { slug: string })[] = [];

    const route = (from: string, to: string) => {
      const key = `${from}>${to}`;
      let pts = routes.get(key);
      if (!pts) {
        const s = shared!.seats;
        pts = findPath(shared!.grid, s[from], s[to]);
        routes.set(key, pts);
      }
      return pts;
    };

    // A failed bg load retries later; meanwhile the last bg keeps showing.
    const backdrops = retryCache((period: Period) => loadBackdrop(period, shared!), () => { if (!disposed) draw(); });
    let lastBackdrop: Backdrop | null = null;

    function draw() {
      if (!shared) return;
      const { date, minute } = now();
      const backdrop = backdrops.get(periodFor(Math.floor(minute))) ?? lastBackdrop;
      if (!backdrop) return; // nothing to draw on until the first bg is ready
      lastBackdrop = backdrop;
      if (plan?.date !== date) plan = { date, day: planDay(date, people) };
      const t = performance.now();
      const placed: (Pose & { slug: string })[] = [];
      for (const p of people) {
        if (!sheets.has(p.slug)) continue; // a missing sheet skips only that person
        const pose = poseAt(plan.day[p.slug] ?? [], minute, shared.seats, route, { skipWalk: reduced });
        if (!pose) continue;
        if ((waves.get(p.slug) ?? 0) > t && !pose.walking) Object.assign(pose, { row: 11, flip: false });
        placed.push({ ...pose, slug: p.slug });
      }
      lastPlaced = placed;
      const byId = new Map(shared.objects.map((o) => [o.id, o]));
      const bySlug = new Map(placed.map((p, i) => [p.slug, { p, i }]));
      ctx.drawImage(backdrop.bg, 0, 0);
      for (const op of drawOrder(shared.objects, placed)) {
        if (op.kind === "object") {
          const o = byId.get(op.id)!;
          if (op.clip) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(op.clip.x, op.clip.y, op.clip.w, op.clip.h);
            ctx.clip();
          }
          ctx.drawImage(backdrop.cutouts.get(op.id)!, o.x, o.y);
          if (op.clip) ctx.restore();
          continue;
        }
        const { p, i } = bySlug.get(op.slug)!;
        const sheet = sheets.get(op.slug)!;
        const col = reduced ? 0 : (Math.floor(t / 125) + i) % 4; // 8 fps, people out of step
        const sy = sheetRow(p.row, sheet.naturalHeight) * FRAME;
        const x = Math.round(p.x);
        const y = Math.round(p.y);
        if (p.flip) {
          ctx.save();
          ctx.translate(x, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(sheet, col * FRAME, sy, FRAME, FRAME, -FRAME / 2, y - FRAME, FRAME, FRAME);
          ctx.restore();
        } else {
          ctx.drawImage(sheet, col * FRAME, sy, FRAME, FRAME, x - FRAME / 2, y - FRAME, FRAME, FRAME);
        }
      }
    }

    // Loop only while visible: off screen or a hidden tab stops it.
    let raf = 0;
    let onScreen = true;
    const tick = () => { draw(); raf = requestAnimationFrame(tick); };
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      if (!reduced && onScreen && !document.hidden) raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); });
    io.observe(canvas);
    document.addEventListener("visibilitychange", sync);
    const still = reduced ? window.setInterval(draw, 60_000) : 0;

    // shortcut: fixed hit box and walkers ignore clicks; switch to an alpha hit test if clicks feel off.
    const hit = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * W;
      const y = ((e.clientY - r.top) / r.height) * H;
      return [...lastPlaced]
        .sort((a, b) => b.y - a.y) // front-most first
        .find((p) => !p.walking && x >= p.x - 30 && x <= p.x + 30 && y >= p.y - 135 && y <= p.y);
    };
    const onClick = (e: MouseEvent) => {
      const p = hit(e);
      if (!p) return;
      waves.set(p.slug, performance.now() + WAVE_MS);
      if (reduced) { draw(); window.setTimeout(draw, WAVE_MS); }
    };
    const onMove = (e: MouseEvent) => { canvas.style.cursor = hit(e) ? "pointer" : "default"; };
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("mousemove", onMove);

    loadShared().then(
      (s) => {
        if (disposed) return;
        shared = s;
        for (const p of people)
          loadImage(`${BASE}/${p.slug}.webp`).then((img) => { sheets.set(p.slug, img); if (reduced) draw(); }, () => {});
        draw();
        sync();
      },
      () => { if (!disposed) setFailed(true); },
    );

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      window.clearInterval(still);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("mousemove", onMove);
    };
  }, [people]);

  if (failed) return null; // a missing asset shows nothing, not an error box
  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      role="img"
      aria-label="Illustration of the team's office"
      className="block h-auto w-full rounded-xl"
      style={{ imageRendering: "pixelated" }}
    />
  );
}
