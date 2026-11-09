/**
 * Trap Shift: canvas renderer. Browser only. Never imported by the server.
 * Draws a RunState from trapShiftCore and keeps cosmetic effects (particles, shake)
 * that are allowed to use Math.random because they never affect the simulation.
 */
import { W, H, G, currentPoints, levelPct, type RunState, type FxEvent, type Solid, type Faller, type Spike, type Proj } from "./trapShiftCore";

interface Particle { x: number; y: number; vx: number; vy: number; life: number; c: string }

export class Fx {
  particles: Particle[] = [];
  shake = 0;
  tick = 0;
  /** Call after every core step(); drains the run's event queue. */
  consume(s: RunState) {
    if (!s.events) return;
    for (const e of s.events) this.apply(e);
    s.events.length = 0;
  }
  private apply(e: FxEvent) {
    if (e.t === "burst") for (let i = 0; i < e.n; i++) this.particles.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 7, vy: -Math.random() * 7, life: 40 + Math.random() * 20, c: e.c });
    if (e.t === "shake") this.shake = Math.max(this.shake, e.n);
  }
  /** Call once per fixed step, including while the death animation plays. */
  update() {
    this.tick++;
    for (const q of this.particles) { q.x += q.vx; q.y += q.vy; q.vy += 0.35; q.life--; }
    this.particles = this.particles.filter(q => q.life > 0);
    if (this.shake > 0) this.shake--;
  }
}

/** Draws one frame. `dying` hides the player while the death burst plays. */
export function drawFrame(ctx: CanvasRenderingContext2D, canvasWidth: number, s: RunState, fx: Fx, opts: { dying?: boolean; showHud?: boolean } = {}) {
  const scale = canvasWidth / W;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#303E7A"); sky.addColorStop(1, "#1A2252");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

  const cam = Math.round(s.cam);
  const sh = fx.shake ? (Math.random() - 0.5) * fx.shake : 0;
  drawSkyline(ctx, cam);

  ctx.save(); ctx.translate(-cam + sh, sh * 0.6);
  const lv = s.lv;
  for (const b of lv.solids) {
    if (b.kind === "hidden") { if (b.shown) drawHiddenBlock(ctx, b); continue; }
    if (b.h > 500 && b.y === 0) { ctx.fillStyle = "#141A3F"; ctx.fillRect(b.x, b.y, b.w, b.h); continue; }
    const ox = b.kind === "delay" && (b.timer ?? 0) > 0 ? (Math.random() - 0.5) * 4 : 0;
    ctx.save(); ctx.translate(ox, 0); drawGround(ctx, b); ctx.restore();
  }
  for (const f of lv.fallers) drawCabinet(ctx, f);
  for (const k of lv.spikes) if (k.hgt > 0) drawSpikes(ctx, k);
  drawFlag(ctx, lv.goal.x, fx.tick);
  for (const q of s.proj) drawThrown(ctx, q);
  if (lv.wall && lv.wall.phase === "go") drawWall(ctx, lv.wall.x as number);
  if (!opts.dying) drawPlayer(ctx, s);
  for (const q of fx.particles) { ctx.globalAlpha = Math.max(0, q.life / 50); ctx.fillStyle = q.c; ctx.fillRect(q.x - 3, q.y - 3, 6, 6); }
  ctx.globalAlpha = 1;
  ctx.restore();

  // warnings, screen space
  if (s.phase === "play") {
    if (lv.wall && lv.wall.phase === "warn" && Math.floor((lv.wall.t as number) / 5) % 2 === 0)
      for (let y = 84; y < G - 20; y += 62) drawWarnSign(ctx, W - 40, y);
    for (const w of s.warns) {
      if (Math.floor(w.t / 5) % 2) continue;   // blink
      const wx = (w.kind === "low" || w.kind === "air") ? W - 40 : w.kind === "back" ? 12 : w.x - cam - 7;
      const wy = w.kind === "drop" ? 78 : w.y - 8;
      drawWarnSign(ctx, wx, wy);
    }
  }
  if (opts.showHud !== false) drawHud(ctx, s);
}

function drawSkyline(ctx: CanvasRenderingContext2D, cam: number) {
  const pos = (i: number) => (((i * 170 - cam * 0.3) % 2380) + 2380) % 2380 - 200;
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  for (let i = 0; i < 14; i++) { const bh = 90 + (i * 53) % 140; ctx.fillRect(pos(i), G - bh - 20, 110, bh + 20); }
  ctx.fillStyle = "rgba(251,206,27,0.12)";
  for (let i = 0; i < 14; i++) {
    const bx = pos(i), bh = 90 + (i * 53) % 140;
    for (let r = 0; r < Math.floor(bh / 28); r++) for (let c = 0; c < 3; c++) if ((i + r + c) % 3) ctx.fillRect(bx + 14 + c * 32, G - bh + r * 28, 14, 10);
  }
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}
function drawGround(ctx: CanvasRenderingContext2D, b: Solid) {
  ctx.fillStyle = "#141A3F"; ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.fillStyle = "#3E4F9C"; ctx.fillRect(b.x, b.y, b.w, 8);
  ctx.fillStyle = "#F67F25"; ctx.fillRect(b.x, b.y, b.w, 3);
  ctx.fillStyle = "rgba(255,255,255,.05)";
  for (let x = b.x + 10; x < b.x + b.w - 10; x += 40) ctx.fillRect(x, b.y + 18, 24, 4);
}
function drawHiddenBlock(ctx: CanvasRenderingContext2D, b: Solid) {
  ctx.fillStyle = "#C99C00"; ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.fillStyle = "#FBCE1B"; ctx.fillRect(b.x + 2, b.y + 2, b.w - 4, b.h - 6);
  ctx.fillStyle = "#303E7A"; ctx.font = "800 13px Poppins, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("?", b.x + b.w / 2, b.y + b.h / 2); ctx.textAlign = "left";
}
function drawCabinet(ctx: CanvasRenderingContext2D, f: Faller) {
  const rattle = (f.sit ?? 0) > 30 ? (Math.random() - 0.5) * ((f.sit ?? 0) > 45 ? 4 : 2) : 0;
  ctx.save(); ctx.translate(rattle, 0);
  ctx.fillStyle = "#8D93B5"; ctx.fillRect(f.x, f.y, f.w, f.h);
  ctx.fillStyle = "#6B7196"; ctx.fillRect(f.x + 4, f.y + 4, f.w - 8, f.h / 2 - 6); ctx.fillRect(f.x + 4, f.y + f.h / 2 + 2, f.w - 8, f.h / 2 - 6);
  ctx.fillStyle = "#E8EAF5"; ctx.fillRect(f.x + f.w / 2 - 8, f.y + f.h / 4 - 2, 16, 4); ctx.fillRect(f.x + f.w / 2 - 8, f.y + (3 * f.h) / 4 - 2, 16, 4);
  if (!f.drop) { ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(f.x + f.w / 2, 0); ctx.lineTo(f.x + f.w / 2, f.y); ctx.stroke(); }
  ctx.restore();
}
function drawSpikes(ctx: CanvasRenderingContext2D, k: Spike) {
  const n = Math.max(1, Math.round(k.w / 12)), tw = k.w / n;
  ctx.fillStyle = "#F2F3FA";
  for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.moveTo(k.x + i * tw, k.base); ctx.lineTo(k.x + i * tw + tw / 2, k.base - k.hgt); ctx.lineTo(k.x + (i + 1) * tw, k.base); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = "rgba(194,55,43,.9)";
  for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.moveTo(k.x + i * tw + tw / 2 - 2, k.base - k.hgt + 5); ctx.lineTo(k.x + i * tw + tw / 2, k.base - k.hgt); ctx.lineTo(k.x + i * tw + tw / 2 + 2, k.base - k.hgt + 5); ctx.closePath(); ctx.fill(); }
}
function drawThrown(ctx: CanvasRenderingContext2D, q: Proj) {
  ctx.save(); ctx.translate(q.x + q.w / 2, q.y + q.h / 2);
  if (q.kind === "drop") ctx.rotate(Math.PI / 2); else if (q.kind === "back") ctx.rotate(Math.PI);
  const L = q.kind === "drop" ? 14 : 15;
  ctx.fillStyle = "#F2F3FA"; ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(L - 6, -7); ctx.lineTo(L, 0); ctx.lineTo(L - 6, 7); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#C2372B"; ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(-L + 8, -3); ctx.lineTo(-L + 8, 3); ctx.closePath(); ctx.fill();
  if (!q.stuck) { ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(L + 4, 0); ctx.lineTo(L + 18, 0); ctx.stroke(); }
  ctx.restore();
}
function drawWall(ctx: CanvasRenderingContext2D, x: number) {
  ctx.fillStyle = "rgba(20,26,63,.9)"; ctx.fillRect(x + 14, 0, 16, G);
  ctx.fillStyle = "#F2F3FA";
  for (let y = 0; y < G; y += 22) { ctx.beginPath(); ctx.moveTo(x + 16, y); ctx.lineTo(x, y + 11); ctx.lineTo(x + 16, y + 22); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = "rgba(194,55,43,.9)";
  for (let y = 0; y < G; y += 22) ctx.fillRect(x, y + 10, 5, 2);
}
function drawWarnSign(ctx: CanvasRenderingContext2D, wx: number, wy: number) {
  ctx.fillStyle = "#FBCE1B"; ctx.beginPath(); ctx.moveTo(wx + 14, wy); ctx.lineTo(wx + 28, wy + 26); ctx.lineTo(wx, wy + 26); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#303E7A"; ctx.font = "800 16px Poppins, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("!", wx + 14, wy + 17); ctx.textAlign = "left";
}
function drawFlag(ctx: CanvasRenderingContext2D, x: number, tick: number) {
  ctx.fillStyle = "#E8EAF5"; ctx.fillRect(x + 12, G - 120, 5, 120);
  const wv = Math.sin(tick / 8) * 3;
  ctx.fillStyle = "#FBCE1B"; ctx.beginPath(); ctx.moveTo(x + 17, G - 118); ctx.lineTo(x + 70, G - 104 + wv); ctx.lineTo(x + 17, G - 88); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#303E7A"; ctx.font = "800 11px Poppins, sans-serif"; ctx.textBaseline = "alphabetic"; ctx.fillText("EOD", x + 22, G - 101 + wv / 2);
}
function drawPlayer(ctx: CanvasRenderingContext2D, s: RunState) {
  const p = s.p, x = p.x, y = p.y;
  const squash = p.onGround ? 0 : Math.min(3, Math.abs(p.vy) / 4);
  ctx.fillStyle = "#F67F25"; roundRect(ctx, x, y + squash, p.w, p.h - squash, 7); ctx.fill();
  ctx.fillStyle = "#C85F12"; ctx.fillRect(x + 3, y + p.h - 6, p.w - 6, 4);
  ctx.strokeStyle = "#151A33"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x + p.w / 2, y + 12 + squash, 12, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
  ctx.fillStyle = "#151A33"; ctx.fillRect(p.face > 0 ? x + p.w - 4 : x, y + 9 + squash, 5, 9);
  ctx.strokeStyle = "#151A33"; ctx.lineWidth = 2; ctx.beginPath();
  const mx = p.face > 0 ? x + p.w - 2 : x + 2;
  ctx.moveTo(mx, y + 17 + squash); ctx.quadraticCurveTo(mx - p.face * 2, y + 26 + squash, mx - p.face * 9, y + 25 + squash); ctx.stroke();
  ctx.fillStyle = "#fff"; const ex = x + p.w / 2 + p.face * 3;
  ctx.fillRect(ex - 7, y + 12 + squash, 5, 6); ctx.fillRect(ex + 2, y + 12 + squash, 5, 6);
  ctx.fillStyle = "#151A33"; ctx.fillRect(ex - 6 + p.face, y + 14 + squash, 3, 3); ctx.fillRect(ex + 3 + p.face, y + 14 + squash, 3, 3);
}
function drawHud(ctx: CanvasRenderingContext2D, s: RunState) {
  ctx.fillStyle = "rgba(14,17,34,.55)"; roundRect(ctx, 14, 14, 350, 48, 10); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.font = "700 15px Poppins, sans-serif"; ctx.textBaseline = "middle";
  ctx.fillText(`Level ${s.li + 1}/3 · ${s.def.name}`, 28, 31);
  const pct = s.phase === "clear" ? 100 : levelPct(s);
  ctx.font = "600 12px 'Open Sans', sans-serif"; ctx.fillStyle = "#C9CEE8";
  ctx.fillText(`Distance ${pct}/100`, 28, 50);
  ctx.fillStyle = "rgba(255,255,255,.15)"; roundRect(ctx, 150, 45, 200, 7, 4); ctx.fill();
  ctx.fillStyle = "#F67F25"; roundRect(ctx, 150, 45, 2 * pct, 7, 4); ctx.fill();
  ctx.fillStyle = "rgba(14,17,34,.55)"; roundRect(ctx, W - 174, 14, 160, 48, 10); ctx.fill();
  ctx.fillStyle = "#C9CEE8"; ctx.font = "600 11px 'Open Sans', sans-serif"; ctx.textAlign = "right";
  ctx.fillText("THIS TRY", W - 28, 29);
  ctx.fillStyle = "#FBCE1B"; ctx.font = "800 20px Poppins, sans-serif";
  ctx.fillText(String(currentPoints(s)), W - 28, 48);
  ctx.textAlign = "left";
  if (s.phase === "clear") {
    ctx.fillStyle = "rgba(14,17,34,.6)"; ctx.fillRect(0, H / 2 - 56, W, 112);
    ctx.fillStyle = "#FBCE1B"; ctx.font = "800 40px Poppins, sans-serif"; ctx.textAlign = "center";
    ctx.fillText(s.li === 2 ? "SHIFT COMPLETE" : "LEVEL CLEARED", W / 2, H / 2 - 12);
    ctx.fillStyle = "#fff"; ctx.font = "600 17px 'Open Sans', sans-serif";
    ctx.fillText("+100 distance  +25 bonus", W / 2, H / 2 + 26); ctx.textAlign = "left";
  }
}
