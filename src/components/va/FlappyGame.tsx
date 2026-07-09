"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { submitGameScoreAction } from "@/app/va/actions";
import type { GameState, LeaderRow } from "@/lib/game";

// --- Fixed logical play-field (scaled to fit via CSS) ---
const W = 360;
const H = 520;
const GROUND = 64;

const BIRD_X = 96;
const BIRD_R = 13;
const GRAVITY = 1500; // px/s²
const FLAP = -430; // px/s

const PIPE_W = 60;
const GAP = 155;
const SPEED = 155; // px/s
const SPACING = 215; // horizontal px between pipes
const GAP_MIN = 50;
const GAP_MAX = H - GROUND - GAP - 50;

type Pipe = { x: number; gapTop: number; passed: boolean };
type Engine = {
  birdY: number;
  vel: number;
  pipes: Pipe[];
  score: number;
  last: number;
  seed: number;
};

type Status =
  | "locked"
  | "intro"
  | "playing"
  | "submitting"
  | "done"
  | "error";

export function FlappyGame({ game, meId }: { game: GameState; meId: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine>(freshEngine());
  const endedRef = useRef(false);

  const initial: Status = !game.clockedInToday
    ? "locked"
    : game.hasPlayedToday
      ? "done"
      : "intro";

  const [status, setStatus] = useState<Status>(initial);
  const [score, setScore] = useState(0);
  const [board, setBoard] = useState<LeaderRow[]>(game.leaderboard);
  const [todayScore, setTodayScore] = useState<number | null>(game.todayScore);
  const [bestScore, setBestScore] = useState<number | null>(game.bestScore);
  const [errorMsg, setErrorMsg] = useState("");

  const statusRef = useRef(status);
  statusRef.current = status;

  const onGameOver = useCallback(async (finalScore: number) => {
    if (endedRef.current) return;
    endedRef.current = true;
    setStatus("submitting");
    try {
      const res = await submitGameScoreAction(finalScore);
      if (res.ok) {
        setBoard(res.state.leaderboard);
        setTodayScore(res.state.todayScore);
        setBestScore(res.state.bestScore);
        setStatus("done");
      } else {
        setErrorMsg(res.message);
        setStatus("error");
      }
    } catch {
      setErrorMsg("Couldn’t save your score — please refresh and try again.");
      setStatus("error");
    }
  }, []);

  const startGame = useCallback(() => {
    engineRef.current = freshEngine();
    endedRef.current = false;
    setScore(0);
    setStatus("playing");
  }, []);

  const tap = useCallback(() => {
    const s = statusRef.current;
    if (s === "intro") startGame();
    else if (s === "playing") engineRef.current.vel = FLAP;
  }, [startGame]);

  // Keyboard: Space / ArrowUp to flap or start.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.code !== "ArrowUp") return;

      // Never hijack the key while the user is typing in a form field —
      // otherwise Space can't be typed in the Time In / Time Out task boxes.
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }

      // Only react when the game is actually on-screen and playable.
      const s = statusRef.current;
      if (s !== "intro" && s !== "playing") return;

      e.preventDefault();
      tap();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tap]);

  // Canvas sizing + rendering (static frames + the play loop).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return; // not mounted (locked / done / error)
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (status === "intro") {
      engineRef.current = freshEngine();
      draw(ctx, engineRef.current, "intro");
      return;
    }
    if (status === "submitting") {
      draw(ctx, engineRef.current, "submitting");
      return;
    }
    if (status !== "playing") return;

    let raf = 0;
    const frame = (t: number) => {
      const e = engineRef.current;
      if (!e.last) e.last = t;
      const dt = Math.min((t - e.last) / 1000, 0.033);
      e.last = t;

      // Physics
      e.vel += GRAVITY * dt;
      e.birdY += e.vel * dt;
      if (e.birdY < BIRD_R) {
        e.birdY = BIRD_R;
        e.vel = 0;
      }

      // Pipes
      for (const p of e.pipes) p.x -= SPEED * dt;
      const last = e.pipes[e.pipes.length - 1];
      if (!last || last.x <= W - SPACING) {
        e.seed = (e.seed * 1103515245 + 12345) & 0x7fffffff;
        const gapTop = GAP_MIN + (e.seed % Math.max(1, GAP_MAX - GAP_MIN));
        e.pipes.push({ x: W, gapTop, passed: false });
      }
      e.pipes = e.pipes.filter((p) => p.x + PIPE_W > -8);

      // Score
      for (const p of e.pipes) {
        if (!p.passed && p.x + PIPE_W < BIRD_X) {
          p.passed = true;
          e.score += 1;
          setScore(e.score);
        }
      }

      // Collisions
      let dead = e.birdY + BIRD_R >= H - GROUND;
      for (const p of e.pipes) {
        if (BIRD_X + BIRD_R > p.x && BIRD_X - BIRD_R < p.x + PIPE_W) {
          if (e.birdY - BIRD_R < p.gapTop || e.birdY + BIRD_R > p.gapTop + GAP) {
            dead = true;
          }
        }
      }

      draw(ctx, e, "playing");

      if (dead) {
        void onGameOver(e.score);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [status, onGameOver]);

  const showCanvas =
    status === "intro" || status === "playing" || status === "submitting";

  return (
    <section className="card overflow-hidden" aria-label="Daily Flappy game">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[var(--border)] bg-brand-blue-50/50 px-4 py-3 sm:px-6">
        <div>
          <h2 className="font-heading text-base font-bold text-brand-blue-700">
            🐦 Daily Flappy
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            One try a day after you clock in — beat the leaderboard!
          </p>
        </div>
        {bestScore != null && (
          <span className="chip bg-brand-yellow-100 text-brand-yellow-800">
            Your best: {bestScore}
          </span>
        )}
      </header>

      <div className="grid gap-5 p-4 sm:grid-cols-[auto_1fr] sm:p-6">
        {/* Game area */}
        <div className="mx-auto w-full max-w-[360px]">
          {status === "locked" && (
            <Placeholder
              emoji="🔒"
              title="Clock in to play"
              body="Today’s game unlocks once you’ve clocked in. Come back after Time In!"
            />
          )}

          {(status === "done" || status === "error") && (
            <Placeholder
              emoji={status === "error" ? "⚠️" : "✅"}
              title={
                status === "error"
                  ? "Score not saved"
                  : `You scored ${todayScore ?? 0}`
              }
              body={
                status === "error"
                  ? errorMsg
                  : "That’s your one play for today — come back tomorrow for another go."
              }
            />
          )}

          {showCanvas && (
            <div className="relative">
              <canvas
                ref={canvasRef}
                onPointerDown={(e) => {
                  e.preventDefault();
                  tap();
                }}
                className="block w-full cursor-pointer touch-none select-none rounded-xl border border-[var(--border)] shadow-sm"
                style={{ aspectRatio: `${W} / ${H}` }}
                aria-label="Flappy game board — tap or press Space to flap"
              />
              {status === "intro" && (
                <Overlay>
                  <p className="font-heading text-lg font-bold text-white drop-shadow">
                    Tap / Space to start
                  </p>
                  <p className="mt-1 text-sm text-white/90 drop-shadow">
                    One attempt today
                  </p>
                </Overlay>
              )}
              {status === "submitting" && (
                <Overlay>
                  <p className="font-heading text-lg font-bold text-white drop-shadow">
                    Saving score…
                  </p>
                </Overlay>
              )}
            </div>
          )}
        </div>

        {/* Leaderboard */}
        <Leaderboard rows={board} meId={meId} />
      </div>
    </section>
  );
}

function Leaderboard({ rows, meId }: { rows: LeaderRow[]; meId: string }) {
  return (
    <div className="min-w-0">
      <p className="field-label">🏆 Leaderboard — all-time best</p>
      {rows.length === 0 ? (
        <p className="rounded-lg bg-[var(--surface-muted)] px-3 py-4 text-center text-sm text-[var(--text-muted)]">
          No scores yet. Be the first!
        </p>
      ) : (
        <ol className="divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)]">
          {rows.map((r) => {
            const isMe = r.userId === meId;
            return (
              <li
                key={r.userId}
                className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${
                  isMe ? "bg-brand-blue-50" : ""
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-6 shrink-0 text-center">
                    {medal(r.rank)}
                  </span>
                  <span
                    className={`truncate ${
                      isMe
                        ? "font-heading font-bold text-brand-blue-700"
                        : "text-[var(--text)]"
                    }`}
                  >
                    {r.name}
                    {isMe && " (you)"}
                  </span>
                </span>
                <span className="shrink-0 font-heading font-bold tabular-nums text-[var(--text)]">
                  {r.best}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function medal(rank: number): string {
  return rank === 1
    ? "🥇"
    : rank === 2
      ? "🥈"
      : rank === 3
        ? "🥉"
        : String(rank);
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-brand-blue-900/25 text-center">
      {children}
    </div>
  );
}

function Placeholder({
  emoji,
  title,
  body,
}: {
  emoji: string;
  title: string;
  body: string;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-muted)]/50 px-4 text-center"
      style={{ aspectRatio: `${W} / ${H}` }}
    >
      <span className="text-4xl" aria-hidden>
        {emoji}
      </span>
      <p className="mt-3 font-heading text-lg font-bold text-brand-blue-700">
        {title}
      </p>
      <p className="mt-1 max-w-[16rem] text-sm text-[var(--text-muted)]">
        {body}
      </p>
    </div>
  );
}

// --- Rendering ---
function freshEngine(): Engine {
  return {
    birdY: H * 0.45,
    vel: 0,
    pipes: [],
    score: 0,
    last: 0,
    // Deterministic-ish seed varied by start position (Math.random unavailable
    // in some sandboxes, but fine in the browser).
    seed: Math.floor(Math.random() * 0x7fffffff) || 12345,
  };
}

function draw(
  ctx: CanvasRenderingContext2D,
  e: Engine,
  status: "intro" | "playing" | "submitting",
) {
  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#DCE6FF");
  sky.addColorStop(1, "#F4F7FF");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Pipes
  for (const p of e.pipes) {
    drawPipe(ctx, p.x, 0, p.gapTop); // top
    drawPipe(ctx, p.x, p.gapTop + GAP, H - GROUND - (p.gapTop + GAP)); // bottom
  }

  // Ground
  ctx.fillStyle = "#E7ECFA";
  ctx.fillRect(0, H - GROUND, W, GROUND);
  ctx.strokeStyle = "#C3CEEE";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, H - GROUND + 1);
  ctx.lineTo(W, H - GROUND + 1);
  ctx.stroke();

  // Bird
  drawBird(ctx, BIRD_X, e.birdY, e.vel);

  // Score (while playing / after)
  if (status !== "intro") {
    ctx.fillStyle = "#303E7A";
    ctx.font = "bold 40px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(String(e.score), W / 2, 24);
  }
}

function drawPipe(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
) {
  if (h <= 0) return;
  ctx.fillStyle = "#303E7A";
  roundRect(ctx, x, y, PIPE_W, h, 6);
  ctx.fill();
  // cap at the gap-facing end
  ctx.fillStyle = "#26305F";
  const capH = 14;
  const capY = y === 0 ? y + h - capH : y;
  roundRect(ctx, x - 3, capY, PIPE_W + 6, capH, 4);
  ctx.fill();
}

function drawBird(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  vel: number,
) {
  ctx.save();
  ctx.translate(x, y);
  const tilt = Math.max(-0.4, Math.min(0.7, vel / 600));
  ctx.rotate(tilt);
  // body
  ctx.fillStyle = "#FBCE1B";
  ctx.strokeStyle = "#E4B70F";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // wing
  ctx.fillStyle = "#F67F25";
  ctx.beginPath();
  ctx.ellipse(-3, 3, 6, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // eye
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(5, -4, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1A1A1A";
  ctx.beginPath();
  ctx.arc(6, -4, 2, 0, Math.PI * 2);
  ctx.fill();
  // beak
  ctx.fillStyle = "#F67F25";
  ctx.beginPath();
  ctx.moveTo(BIRD_R - 2, -2);
  ctx.lineTo(BIRD_R + 7, 0);
  ctx.lineTo(BIRD_R - 2, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
