"use client";

/**
 * Stretch Goal — the play surface.
 *
 * Deliberately thin, in the same spirit as the archived Word game: it renders
 * the simulation and reports `{ seed, holds }` when a run ends. It computes a
 * score for display, but nothing here is trusted — the server replays the same
 * holds through the same core and stores its own number.
 *
 * The physics, the tier table and `simulateRun` all live in
 * `@/lib/stretch/core`, which this file and the API route both import. One
 * copy of the simulation, so the two cannot drift.
 *
 * Fonts: Poppins and Open Sans are already loaded by the app shell via
 * `next/font` (src/app/layout.tsx), which exposes them as the CSS variables
 * `--font-poppins` and `--font-open-sans`. The stylesheet below points at those
 * rather than naming the families directly, because next/font emits hashed
 * family names — a bare `font-family: Poppins` would silently fall back to
 * system-ui. No `<link>` is added here.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  GROUND,
  H,
  STEP_MS,
  TIERS,
  W,
  createGame,
  type Game,
  type GameState,
  type Hold,
  type LeaderRow,
  type RunResult,
} from "@/lib/stretch/core";

export type { Hold, LeaderRow, RunResult };

export interface StretchGoalProps {
  /** true once the VA has timed in AND saved a start-of-day task */
  unlocked: boolean;
  /** true once today's single ranked run has been spent */
  runUsed: boolean;
  /** seed issued by the server for today's run. Falls back to a local seed. */
  seed?: number;
  /** called once when a run ends. Post { seed, holds } to your API here. */
  onRunComplete: (result: RunResult) => void | Promise<void>;
  /**
   * Claim today's attempt. Called BEFORE the first frame; the run only begins
   * if this resolves true. This is what makes it one try a day rather than one
   * score a day — the server spends the attempt here, so quitting mid-run does
   * not hand the day back.
   */
  onRunStart?: () => Promise<boolean>;
  /** true when the attempt was started but no score was ever submitted. */
  abandoned?: boolean;
  /** optional: renders the "Time In" CTA on the locked screen */
  onTimeIn?: () => void;
  /** rows for the side rail. Omit to hide the leaderboard card. */
  leaderboard?: LeaderRow[];
  /** e.g. "September Season". Defaults to the current month. */
  seasonLabel?: string;
  /** hide the whole right-hand rail if the host page has its own */
  showRail?: boolean;
  /** shown on the game-over screen, e.g. "#4" */
  rankLabel?: string;
}

/* ============================================================================
   RENDERER
   ========================================================================== */

const C = {
  skyTop: "#0F1740", skyBot: "#18214F",
  hillFar: "#16204A", hillNear: "#1C2758",
  plat: "#303E7A", platTop: "#465799",
  beam: "#F67F25", mark: "#FBCE1B", hero: "#E9ECF9",
};

/** Canvas cannot read CSS variables, so the display stack is resolved once. */
const FALLBACK_DISPLAY = "Poppins, system-ui, sans-serif";

function displayFontStack(): string {
  if (typeof window === "undefined") return FALLBACK_DISPLAY;
  const poppins = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-poppins")
    .trim();
  return poppins ? `${poppins}, system-ui, sans-serif` : FALLBACK_DISPLAY;
}

function render(
  ctx: CanvasRenderingContext2D,
  s: GameState,
  dpr: number,
  font: string,
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, C.skyTop);
  g.addColorStop(1, C.skyBot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "rgba(251,206,27,.30)";
  ctx.beginPath(); ctx.arc(W - 84, 76, 16, 0, Math.PI * 2); ctx.fill();

  const hill = (base: number, amp: number, stretch: number, speed: number, color: string) => {
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let i = 0; i <= W; i += 4) {
      ctx.lineTo(i, GROUND - base + Math.sin(((s.sceneOffset * speed + i) * stretch) / 58) * amp);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  hill(96, 13, 1, 0.22, C.hillFar);
  hill(54, 21, 0.55, 0.42, C.hillNear);

  ctx.save();
  ctx.translate(-s.sceneOffset, GROUND - s.camY);

  const mark = TIERS[s.tier].perfect;
  for (const p of s.platforms) {
    ctx.fillStyle = C.plat;
    ctx.fillRect(p.x, p.top, p.w, 1400);
    ctx.fillStyle = C.platTop;
    ctx.fillRect(p.x, p.top, p.w, 4);
    if (p.w >= mark * 1.8) {
      ctx.fillStyle = C.mark;
      ctx.fillRect(p.x + p.w / 2 - mark / 2, p.top, mark, 4);
    }
  }

  for (const b of s.beams) {
    const phi = (b.bend * Math.PI) / 180;
    const A = b.len * b.aFrac;
    const B = b.len - A;
    ctx.save();
    ctx.translate(b.x, b.top);
    ctx.rotate((b.angle * Math.PI) / 180);
    ctx.strokeStyle = C.beam;
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -A);
    if (B > 0) ctx.lineTo(-B * Math.sin(phi), -A - B * Math.cos(phi));
    ctx.stroke();
    ctx.restore();
  }

  // hero
  const swing = s.phase === "beamwalk" || s.phase === "platwalk" ? Math.sin(s.heroX / 5) * 4 : 0;
  ctx.save();
  ctx.translate(s.heroX, s.heroY);
  ctx.strokeStyle = C.hero;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-swing * 0.6, 0); ctx.lineTo(0, -12);
  ctx.moveTo(swing * 0.6, 0);  ctx.lineTo(0, -12);
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(0, -25); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-6, -18 + swing * 0.4); ctx.lineTo(6, -18 - swing * 0.4);
  ctx.stroke();
  ctx.fillStyle = C.beam;
  ctx.fillRect(-2.5, -21, 5, 5);
  ctx.fillStyle = C.hero;
  ctx.beginPath(); ctx.arc(0, -30, 5.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  ctx.restore();

  ctx.textAlign = "center";
  ctx.font = `700 40px ${font}`;
  ctx.fillStyle = "rgba(233,236,249,.9)";
  ctx.fillText(String(s.score), W / 2, 66);

  if (s.flash && s.flash.a > 0) {
    ctx.font = `700 19px ${font}`;
    ctx.fillStyle = `rgba(251,206,27,${s.flash.a.toFixed(2)})`;
    ctx.fillText(s.flash.text, W / 2, 98 - (1 - s.flash.a) * 14);
  }
  if (s.banner && s.banner.a > 0) {
    const a = Math.min(1, s.banner.a);
    ctx.fillStyle = `rgba(246,127,37,${(a * 0.16).toFixed(2)})`;
    ctx.fillRect(0, 148, W, 62);
    ctx.font = `600 11px ${font}`;
    ctx.fillStyle = `rgba(251,206,27,${a.toFixed(2)})`;
    ctx.fillText(`TIER ${s.banner.n} UNLOCKED`, W / 2, 170);
    ctx.font = `700 24px ${font}`;
    ctx.fillStyle = `rgba(233,236,249,${a.toFixed(2)})`;
    ctx.fillText(s.banner.name, W / 2, 197);
  }
}

/* ============================================================================
   COMPONENT
   ========================================================================== */

const CSS = `
/* ---------------------------------------------------------------------------
   Layout is driven by CONTAINER queries, not viewport media queries.
   The cabinet lives inside a page column, so the viewport width says nothing
   useful about how much room it actually has — a 1600px desktop was still
   rendering two columns inside a 720px box, which squeezed the canvas until the
   overlay text overflowed it. Everything below sizes against the component's
   own width instead, so it is correct at any container size.
   --------------------------------------------------------------------------- */
.sg-root{container-type:inline-size;width:100%}

.sg-wrap{--sg-ink:#0B1029;--sg-navy:#303E7A;--sg-orange:#F67F25;--sg-yellow:#FBCE1B;
  --sg-paper:#E9ECF9;--sg-muted:#8C96C0;--sg-line:rgba(140,150,192,.22);--sg-good:#3FBF87;
  /* Rail cards sit on the brand blue. Every foreground below is checked against
     #303E7A: paper 8.3:1, dim 7.2:1, mute 4.9:1, yellow 6.7:1 — all AA or
     better. The active ladder row lightens to blue-500, where the dim tone holds
     5.5:1, so the highlight never costs legibility. */
  --sg-card:#303E7A;--sg-card-head:#293568;--sg-card-live:#3d4f95;
  --sg-card-line:rgba(213,218,235,.20);
  --sg-on-card:#E9ECF9;--sg-on-card-dim:#d5daeb;--sg-on-card-mute:#aab5d6;
  --sg-display:var(--font-poppins),"Poppins","Segoe UI",system-ui,sans-serif;
  --sg-body:var(--font-open-sans),"Open Sans","Segoe UI",system-ui,sans-serif;
  /* Keeps the whole cabinet on screen without scrolling. The reserve covers
     the nav, the champion spotlight and the page heading that sit above it. */
  --sg-maxh:calc(100vh - 360px);
  display:grid;grid-template-columns:minmax(0,1fr);gap:16px;align-items:start;
  font-family:var(--sg-body);font-size:14px;line-height:1.55;color:var(--sg-paper);
  -webkit-tap-highlight-color:transparent}
@supports (height:100dvh){.sg-wrap{--sg-maxh:calc(100dvh - 360px)}}
.sg-wrap *{box-sizing:border-box}

/* The rail only sits alongside once there is genuinely room for both. */
@container (min-width:720px){
  .sg-wrap:not(.sg-norail){grid-template-columns:minmax(0,1fr) 248px;gap:18px}
}

.sg-cab{position:relative;border:1px solid var(--sg-line);border-radius:14px;overflow:hidden;
  background:#0D1330;box-shadow:0 24px 60px rgba(0,0,0,.45);
  width:100%;margin-inline:auto;
  /* 560/400 = 1.4 — cap the width so the height fits the viewport. */
  max-width:max(300px,min(100%,calc(var(--sg-maxh) * 1.4)));
  user-select:none;-webkit-user-select:none}

.sg-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;
  padding:9px 12px;border-bottom:1px solid var(--sg-line);background:rgba(48,62,122,.28)}
.sg-right{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.sg-pill{display:inline-flex;align-items:center;gap:6px;font-family:var(--sg-display);font-weight:600;
  font-size:10px;letter-spacing:.07em;text-transform:uppercase;padding:4px 10px;border-radius:999px;
  border:1px solid var(--sg-line);color:var(--sg-muted);white-space:nowrap}
.sg-pill i{width:6px;height:6px;border-radius:50%;background:var(--sg-muted);font-style:normal;flex:none}
.sg-pill.sg-on{color:var(--sg-good);border-color:rgba(63,191,135,.4)}
.sg-pill.sg-on i{background:var(--sg-good);box-shadow:0 0 8px rgba(63,191,135,.8)}
.sg-pill.sg-spent{color:var(--sg-orange);border-color:rgba(246,127,37,.4)}
.sg-pill.sg-spent i{background:var(--sg-orange)}
.sg-tier{font-family:var(--sg-display);font-size:10px;font-weight:600;letter-spacing:.07em;
  text-transform:uppercase;color:var(--sg-yellow);border:1px solid rgba(251,206,27,.32);
  border-radius:999px;padding:4px 10px;white-space:nowrap}
.sg-meta{font-family:var(--sg-display);font-size:11px;color:var(--sg-muted);white-space:nowrap}
.sg-meta b{color:var(--sg-paper);font-weight:600}
/* On a phone the bar has no room for all three; the run counter is the least
   useful of them, and the pill already says whether the run is spent. */
@container (max-width:430px){.sg-meta{display:none}}

/* The stage is its own query container, so everything drawn over the canvas
   scales with the canvas rather than with the page. */
.sg-stage{position:relative;display:block;width:100%;background:#0D1330;
  container-type:inline-size}
.sg-stage canvas{display:block;width:100%;height:auto;touch-action:none;cursor:pointer}

.sg-veil{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
  justify-content:center;text-align:center;gap:clamp(6px,2.2cqi,16px);
  padding:clamp(10px,3.5cqi,26px);overflow-y:auto;
  background:linear-gradient(180deg,rgba(11,16,41,.86),rgba(11,16,41,.95))}
.sg-veil h2{font-family:var(--sg-display);font-weight:700;margin:0;
  font-size:clamp(17px,5.4cqi,30px);line-height:1.18;max-width:22ch}
.sg-veil p{margin:0;color:var(--sg-muted);max-width:38ch;font-size:clamp(11px,2.4cqi,14px)}
.sg-eyebrow{font-family:var(--sg-display);font-weight:600;letter-spacing:.16em;
  text-transform:uppercase;color:var(--sg-orange);margin:0;font-size:clamp(9px,1.9cqi,11px)}
.sg-btn{font-family:var(--sg-display);font-weight:600;border:none;border-radius:9px;
  font-size:clamp(12px,2.6cqi,15px);padding:clamp(8px,2.2cqi,13px) clamp(16px,4.4cqi,26px);
  cursor:pointer;background:var(--sg-orange);color:#26160A;
  transition:transform .12s ease,box-shadow .12s ease}
.sg-btn:hover{transform:translateY(-1px);box-shadow:0 8px 22px rgba(246,127,37,.32)}
.sg-btn:focus-visible{outline:3px solid var(--sg-yellow);outline-offset:3px}
/* A 2x2 grid rather than wrapping flex, so the block height is predictable and
   the veil can never grow taller than the stage it sits in. */
.sg-warn{font-family:var(--sg-display);font-size:clamp(9.5px,2cqi,11.5px);
  font-weight:600;color:var(--sg-yellow);max-width:34ch;margin:0}
.sg-warn.sg-err{color:var(--sg-orange)}
.sg-btn:disabled{opacity:.6;cursor:progress;transform:none;box-shadow:none}
.sg-how{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));
  gap:clamp(6px,2cqi,14px) clamp(10px,3cqi,22px);width:100%;max-width:34ch}
.sg-how div{font-size:clamp(9.5px,2.1cqi,12px);color:var(--sg-muted);line-height:1.4}
.sg-how b{display:block;font-family:var(--sg-display);color:var(--sg-paper);
  font-size:clamp(9.5px,2.1cqi,12px);letter-spacing:.08em;text-transform:uppercase;margin-bottom:1px}
.sg-final{display:flex;gap:clamp(12px,4.6cqi,28px);justify-content:center;font-family:var(--sg-display)}
.sg-final div{display:flex;flex-direction:column;gap:1px}
.sg-final .n{font-size:clamp(20px,6cqi,34px);font-weight:700;line-height:1;font-variant-numeric:tabular-nums}
.sg-final .n.g{color:var(--sg-yellow)}
.sg-final .l{font-size:clamp(8px,1.8cqi,10px);letter-spacing:.14em;text-transform:uppercase;
  color:var(--sg-muted);font-weight:600}

.sg-rail{display:flex;flex-direction:column;gap:12px;min-width:0}
.sg-card{border:1px solid var(--sg-card-line);border-radius:12px;overflow:hidden;
  background:var(--sg-card);color:var(--sg-on-card)}
.sg-card h3{font-family:var(--sg-display);font-size:10px;font-weight:600;letter-spacing:.14em;
  text-transform:uppercase;color:var(--sg-on-card-dim);margin:0;padding:10px 13px;
  background:var(--sg-card-head);border-bottom:1px solid var(--sg-card-line)}
.sg-lb{list-style:none;margin:0;padding:3px 0}
.sg-lb li{display:grid;grid-template-columns:20px 1fr auto;align-items:center;gap:9px;
  padding:6px 13px;font-size:12.5px;border-left:3px solid transparent}
.sg-lb li + li{border-top:1px solid var(--sg-card-line)}
.sg-lb .rk{font-family:var(--sg-display);font-weight:600;color:var(--sg-on-card-mute);font-size:11px;font-variant-numeric:tabular-nums}
.sg-lb .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--sg-on-card)}
.sg-lb .pf{font-size:10px;color:var(--sg-on-card-mute)}
.sg-lb .sc{font-family:var(--sg-display);font-weight:600;font-variant-numeric:tabular-nums;color:var(--sg-on-card)}
.sg-lb li.sg-top .rk{color:var(--sg-yellow)}
.sg-lb li.sg-you{background:var(--sg-card-live);border-left-color:var(--sg-orange)}
.sg-lb li.sg-you .nm{font-weight:700;color:#fff}
.sg-lb li.sg-you .pf{color:var(--sg-on-card-dim)}

.sg-ladder{list-style:none;margin:0;padding:0}
.sg-ladder li{display:grid;grid-template-columns:26px 1fr;gap:9px;padding:9px 13px;
  align-items:baseline;border-left:3px solid transparent}
.sg-ladder li + li{border-top:1px solid var(--sg-card-line)}
.sg-ladder .at{font-family:var(--sg-display);font-weight:700;font-size:12px;
  color:var(--sg-on-card-mute);font-variant-numeric:tabular-nums}
.sg-ladder .nm2{font-family:var(--sg-display);font-weight:600;font-size:12px;color:var(--sg-on-card)}
/* Every tier explains itself — the ladder is how a player learns what is
   coming. Only the highlight moves with the score. */
.sg-ladder .ds{display:block;font-size:11px;color:var(--sg-on-card-mute);margin-top:2px;line-height:1.42}
.sg-ladder li.sg-live{background:var(--sg-card-live);border-left-color:var(--sg-yellow)}
.sg-ladder li.sg-live .at{color:var(--sg-yellow)}
.sg-ladder li.sg-live .nm2{color:#fff}
.sg-ladder li.sg-live .ds{color:var(--sg-on-card-dim)}

@media (prefers-reduced-motion:reduce){.sg-wrap *{transition:none!important}}
`;

type View = "locked" | "ready" | "playing" | "over";

export default function StretchGoal({
  unlocked,
  runUsed,
  seed,
  onRunComplete,
  onRunStart,
  abandoned = false,
  onTimeIn,
  leaderboard,
  seasonLabel,
  showRail = true,
  rankLabel,
}: StretchGoalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const holdingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  const startingRef = useRef(false);
  const fontRef = useRef(FALLBACK_DISPLAY);

  const [view, setView] = useState<View>("locked");
  const [tier, setTier] = useState(0);
  const [result, setResult] = useState<RunResult | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");

  const season =
    seasonLabel ?? `${new Date().toLocaleString("en-US", { month: "long" })} Season`;

  useEffect(() => {
    if (view === "playing") return;
    if (!unlocked) setView("locked");
    else if (runUsed) setView("over");
    else setView("ready");
  }, [unlocked, runUsed, view]);

  /* draw a static first frame so the cabinet is never an empty box */
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || view === "playing") return;
    fontRef.current = displayFontStack();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = W * dpr;
    cv.height = H * dpr;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    render(ctx, createGame(seed ?? 1).state, dpr, fontRef.current);
  }, [view, seed]);

  const finish = useCallback(() => {
    const g = gameRef.current;
    if (!g || doneRef.current) return;
    doneRef.current = true;
    const st = g.state;
    const r: RunResult = {
      score: st.score,
      perfects: st.perfects,
      tier: st.tier,
      tierName: TIERS[st.tier].name,
      seed: (seed ?? 1) >>> 0,
      holds: st.holds.filter((h) => h.release > 0),
      steps: st.step,
    };
    setResult(r);
    setView("over");
    void onRunComplete(r);
  }, [onRunComplete, seed]);

  const start = useCallback(async () => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    if (startingRef.current) return;

    // Spend the attempt before drawing a single frame. If the server says the
    // day is already gone, nothing starts.
    if (onRunStart) {
      startingRef.current = true;
      setStarting(true);
      setStartError("");
      let claimed = false;
      try {
        claimed = await onRunStart();
      } finally {
        startingRef.current = false;
        setStarting(false);
      }
      if (!claimed) {
        setStartError("That run couldn’t be started. Reload to see today’s status.");
        return;
      }
    }

    fontRef.current = displayFontStack();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = W * dpr;
    cv.height = H * dpr;

    doneRef.current = false;
    holdingRef.current = false;
    gameRef.current = createGame((seed ?? Math.floor(Math.random() * 0xffffffff)) >>> 0);
    setTier(0);
    setResult(null);
    setView("playing");

    let acc = 0;
    let last = performance.now();

    const loop = (t: number) => {
      const g = gameRef.current;
      if (!g) return;
      acc += Math.min(t - last, 250);
      last = t;
      while (acc >= STEP_MS && !g.state.over) {
        acc -= STEP_MS;
        g.tick(holdingRef.current);
      }
      render(ctx, g.state, dpr, fontRef.current);
      // Functional update: `tier` from the closure would be stale, and React
      // bails out when the value is unchanged.
      setTier((current) => (current === g.state.tier ? current : g.state.tier));
      if (g.state.over) { finish(); return; }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [seed, finish, onRunStart]);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  /* input — pointer-down is on the canvas; release is global so a pointer that
     leaves the cabinet still ends the hold rather than growing the beam forever */
  useEffect(() => {
    const up = () => { holdingRef.current = false; };
    const key = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      holdingRef.current = e.type === "keydown";
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("blur", up);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("blur", up);
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
    };
  }, []);

  const rows = (leaderboard ?? []).slice().sort((a, b) => b.score - a.score || b.perfects - a.perfects);

  return (
    // .sg-root is the query container everything below measures itself against.
    <div className="sg-root">
      <style>{CSS}</style>
      <div className={`sg-wrap${showRail ? "" : " sg-norail"}`}>
        <div className="sg-cab">
          <div className="sg-bar">
            <span className={`sg-pill${unlocked ? (runUsed ? " sg-spent" : " sg-on") : ""}`}>
              <i />
              {unlocked ? (runUsed ? "Run used today" : "Timed in") : "Not timed in"}
            </span>
            <span className="sg-right">
              <span className="sg-tier">{`Tier ${tier + 1} · ${TIERS[tier].name}`}</span>
              <span className="sg-meta">
                Runs today <b>{unlocked && !runUsed ? "1" : "0"} / 1</b>
              </span>
            </span>
          </div>

          <div className="sg-stage">
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              style={{ aspectRatio: `${W} / ${H}` }}
              aria-label="Stretch Goal mini-game"
              onPointerDown={(e) => { e.preventDefault(); holdingRef.current = true; }}
            />

            {view === "locked" && (
              <div className="sg-veil">
                <p className="sg-eyebrow">Shift not started</p>
                <h2>Time in to unlock today&apos;s run</h2>
                <p>Your ranked attempt opens the moment you clock in and log your start-of-day task.</p>
                {onTimeIn && <button className="sg-btn" onClick={onTimeIn}>Time In &amp; Log SOD Task</button>}
              </div>
            )}

            {view === "ready" && (
              <div className="sg-veil">
                <p className="sg-eyebrow">Run unlocked · {season}</p>
                <h2>One shot. Make it count.</h2>
                <div className="sg-how">
                  <div><b>Hold</b>Press and hold to grow the beam</div>
                  <div><b>Release</b>Let go and it drops into place</div>
                  <div><b>Center</b>Land the yellow mark for +2</div>
                  <div><b>Every 25</b>The ground gets harder</div>
                </div>
                <p className="sg-warn">
                  This is your only run today. It counts from the moment it
                  starts, even if you leave.
                </p>
                <button
                  className="sg-btn"
                  onClick={() => void start()}
                  disabled={starting}
                >
                  {starting ? "Starting…" : "Start Ranked Run"}
                </button>
                {startError && <p className="sg-warn sg-err">{startError}</p>}
              </div>
            )}

            {view === "over" && (
              <div className="sg-veil">
                <p className="sg-eyebrow">
                  {result
                    ? `Run complete · Tier ${result.tier + 1} · ${result.tierName}`
                    : abandoned
                      ? "Run not finished"
                      : "Run used today"}
                </p>
                <h2>
                  {!result && abandoned ? "You left today’s run"
                    : !result ? "Today's run is done"
                    : result.score === 0 ? "Straight off the edge"
                    : result.score < 25 ? "Never made it off the warm-up"
                    : result.score < 50 ? "The uneven ground got you"
                    : result.score < 75 ? "The bent beam got you"
                    : result.score < 100 ? "The moving ledges got you"
                    : "Deep into overtime"}
                </h2>
                {result && (
                  <div className="sg-final">
                    <div><span className="n">{result.score}</span><span className="l">Score</span></div>
                    <div><span className="n g">{result.perfects}</span><span className="l">Perfects</span></div>
                    <div><span className="n">{rankLabel ?? "—"}</span><span className="l">Rank</span></div>
                  </div>
                )}
                <p>
                  {!result && abandoned
                    ? "One run a day means one run a day — starting it spent it. Your next one unlocks at tomorrow’s time-in."
                    : "Your next run unlocks at tomorrow’s time-in."}
                </p>
              </div>
            )}
          </div>
      </div>

      {showRail && (
        <div className="sg-rail">
          {rows.length > 0 && (
            <div className="sg-card">
              <h3>{season}</h3>
              <ol className="sg-lb">
                {rows.slice(0, 8).map((r, i) => (
                  <li key={`${r.name}-${i}`} className={`${i === 0 ? "sg-top " : ""}${r.isYou ? "sg-you" : ""}`}>
                    <span className="rk">{i + 1}</span>
                    <span className="nm">
                      {r.name} <span className="pf">{r.perfects} perfect</span>
                    </span>
                    <span className="sc">{r.score}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="sg-card">
            <h3>Difficulty Ladder</h3>
            <ol className="sg-ladder">
              {TIERS.map((t, i) => (
                <li key={t.at} className={i === tier ? "sg-live" : ""}>
                  <span className="at">{t.at}</span>
                  <span>
                    <span className="nm2">{t.name}</span>
                    <span className="ds">{t.blurb}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
