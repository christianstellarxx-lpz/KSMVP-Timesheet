"use client";

/**
 * Trap Shift — the play surface.
 *
 * Nothing here is trusted. The component plays the shared core
 * (`@/lib/trapshift/trapShiftCore`), records one input value per fixed step,
 * and posts `{ runId, log }` when a try ends. The server replays that log on
 * the seed and routes it stored when it issued the try, and its number is the
 * one shown as final. There is no practice, test or god mode, no level select
 * and no localStorage — nothing on this page can change the rules.
 *
 * Fonts come from the app shell (next/font/local in src/app/layout.tsx) via
 * the --font-poppins / --font-open-sans variables.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  H,
  InputRecorder,
  MAX_ATTEMPTS_PER_DAY,
  MAX_SCORE,
  REPLAY_VERSION,
  STEP_HZ,
  W,
  createRun,
  currentPoints,
  step,
  type Cause,
  type Route,
  type RunState,
} from "@/lib/trapshift/trapShiftCore";
import { Fx, drawFrame, loadMonsterImage } from "@/lib/trapshift/trapShiftRender";
import type { TrapRailRow, TrapSession } from "@/lib/trapshift/game";
import { dismissTrapShiftNewRulesAction } from "@/app/va/games/actions";

/** Save point names, by number (0 L1 start .. 5 L3 half). */
const SAVE_POINT_NAMES = [
  "Level 1 start",
  "Level 1 halfway",
  "Level 2 start",
  "Level 2 halfway",
  "Level 3 start",
  "Level 3 halfway",
];
const MONSTER_SRC = "/games/trap-shift/collector.webp";

export const TAUNTS: Record<string, string[]> = {
  fake:   ["That floor was a contractor. It quit.", "Did you really trust that floor?", "Floor said: not my job."],
  delay:  ["Too slow. The platform clocked out.", "That platform had a 0.2s break policy."],
  popup:  ["Surprise spike. Nobody reads the fine print.", "The spike was hiding in the SOP.", "Plot twist: spikes."],
  spike:  ["It was literally right there.", "You saw it. You still did it."],
  slider: ["That spike had a deadline too.", "Incoming task. Very pointy."],
  faller: ["Ceiling said hi.", "Something heavy landed on your to-do list."],
  pit:    ["Gravity: 1. You: 0.", "Into the void. Like unread emails."],
  thrown: ["Someone threw a task at you.", "Catch! No wait, dodge.", "Incoming from management."],
  launch: ["You overstayed on the cabinet. It filed you away.", "Cabinet launched you into next week.", "No sitting on the furniture."],
  wall:   ["The spike wall stops just short of the left edge. Just saying.", "Should have hugged the left wall.", "Wall of tasks: 1. You: 0."],
  bag:     ["The Collector always gets paid.", "That bag had your name on it.", "Bonus received. Directly to the face."],
  decoy:   ["That wasn't the EOD flag. That was a trap holding a flag.", "Fake deadline. Real consequences.", "Not every finish line is real."],
  monster: ["You touched The Collector. Bold.", "Don't high-five the debt collector.", "It bites. Obviously."],
  burn:    ["The floor got fired. So did you.", "You stood still. The office caught fire.", "Burnout. Literally."],
};

const STEP_S = 1 / STEP_HZ;
/** Fixed steps the death burst plays for before the try is submitted. */
const END_FX_STEPS = 46;
/** Overlay buttons ignore clicks this long after appearing, so a held key can't burn a try. */
const ARM_MS = 700;

type View = "lobby" | "intro" | "playing" | "over";
/** Loop state: "paused" = level intro showing, "ending" = burst playing, "done" = stopped. */
type Phase = "idle" | "play" | "paused" | "ending" | "done";
type Keys = { l: boolean; r: boolean; j: boolean };

interface Outcome {
  won: boolean;
  taunt: string;
  pct: number;
  level: number;
  levelName: string;
  localScore: number;
  serverScore: number | null;
  checking: boolean;
  error: string;
}

export interface TrapShiftProps {
  initialSession: TrapSession;
  initialRail: TrapRailRow[];
  /** e.g. "November Season" */
  seasonLabel: string;
  /** One-time v3 "new rules" banner, until this VA dismisses it. */
  showNewRules: boolean;
}

const triesLine = (left: number) =>
  left <= 0
    ? `You used all ${MAX_ATTEMPTS_PER_DAY} tries today. Come back tomorrow.`
    : left === 1
      ? "You have 1 try left today."
      : `You have ${left} tries left today.`;

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

export default function TrapShift({ initialSession, initialRail, seasonLabel, showNewRules }: TrapShiftProps) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const runRef = useRef<RunState | null>(null);
  const recRef = useRef<InputRecorder | null>(null);
  const fxRef = useRef(new Fx());
  const runIdRef = useRef<string | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const accRef = useRef(0);
  const endStepsRef = useRef(0);
  const keysRef = useRef<Keys>({ l: false, r: false, j: false });
  const touchRef = useRef<Keys>({ l: false, r: false, j: false });

  const [session, setSession] = useState(initialSession);
  const [rail, setRail] = useState(initialRail);
  const [view, setView] = useState<View>("lobby");
  const [intro, setIntro] = useState({ n: 1, name: "", tip: "", from: "" });
  const [newRules, setNewRules] = useState(showNewRules);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [armed, setArmed] = useState(false);

  /* ---------------- server state ---------------- */

  const refresh = useCallback(async () => {
    const [s, b] = await Promise.all([
      fetch("/api/minigame/session", { cache: "no-store" }),
      fetch(`/api/minigame/leaderboard?season=${encodeURIComponent(initialSession.season)}`, { cache: "no-store" }),
    ]);
    if (s.ok) setSession((await s.json()) as TrapSession);
    if (b.ok) setRail(((await b.json()) as { rows: TrapRailRow[] }).rows);
  }, [initialSession.season]);

  /** Sends the partial log if the tab goes away mid-try. It scores as "quit". */
  const sendBeacon = useCallback(() => {
    const runId = runIdRef.current;
    const rec = recRef.current;
    if (!runId || !rec || rec.frames === 0) return;
    runIdRef.current = null;
    navigator.sendBeacon(
      "/api/minigame/score",
      new Blob([JSON.stringify({ runId, log: rec.log })], { type: "application/json" }),
    );
  }, []);

  const finish = useCallback(async () => {
    const s = runRef.current;
    const rec = recRef.current;
    const runId = runIdRef.current;
    window.removeEventListener("pagehide", sendBeacon);
    runIdRef.current = null;
    if (!s || !rec) return;

    setOutcome({
      won: s.won,
      taunt: s.won ? "" : pick(TAUNTS[s.cause as Cause] ?? ["Shift over."]),
      pct: s.finalPct,
      level: s.li + 1,
      levelName: s.def.name,
      localScore: currentPoints(s),
      serverScore: null,
      checking: true,
      error: "",
    });
    setView("over");
    if (!runId) return;

    try {
      const res = await fetch("/api/minigame/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Only the try id and the inputs. The server computes the score.
        body: JSON.stringify({ runId, log: rec.log }),
      });
      const body = (await res.json().catch(() => null)) as
        | { score?: number; nextStartCp?: number; error?: string }
        | null;
      setOutcome((o) =>
        o && (res.ok
          ? { ...o, serverScore: body?.score ?? 0, checking: false }
          : { ...o, checking: false, error: body?.error ?? "That try couldn’t be recorded." }),
      );
      if (res.ok && typeof body?.nextStartCp === "number") {
        const next = body.nextStartCp;
        setSession((cur) => ({ ...cur, nextStartCp: next }));
      }
    } catch {
      setOutcome((o) => o && { ...o, checking: false, error: "Couldn’t reach the server — this try wasn’t recorded." });
    }
    await refresh().catch(() => {});
  }, [refresh, sendBeacon]);

  /* ---------------- the loop ---------------- */

  const readBits = () => {
    const k = keysRef.current;
    const t = touchRef.current;
    return (k.l || t.l ? 1 : 0) | (k.r || t.r ? 2 : 0) | (k.j || t.j ? 4 : 0);
  };

  const loop = useCallback(
    (t: number) => {
      const s = runRef.current;
      const cv = canvasRef.current;
      const ctx = cv?.getContext("2d");
      if (!s || !cv || !ctx) return;
      const fx = fxRef.current;

      // Clamped so a background tab never fast-forwards on return.
      const dt = Math.min((t - lastRef.current) / 1000, 0.1);
      lastRef.current = t;
      if (phaseRef.current === "play" || phaseRef.current === "ending") accRef.current += dt;

      while (accRef.current >= STEP_S) {
        accRef.current -= STEP_S;
        if (phaseRef.current === "play") {
          const bits = readBits();
          recRef.current!.push(bits); // every step that runs is recorded, or the replay won't match
          step(s, bits);
          fx.consume(s);
          fx.update();
          if (s.phase === "over") {
            phaseRef.current = "ending";
            endStepsRef.current = 0;
          } else if (s.levelJustStarted) {
            phaseRef.current = "paused";
            accRef.current = 0;
            setIntro({ n: s.li + 1, name: s.def.name, tip: s.def.tip, from: "" });
            setView("intro");
            break;
          }
        } else if (phaseRef.current === "ending") {
          fx.update();
          if (++endStepsRef.current >= END_FX_STEPS) {
            phaseRef.current = "done";
            void finish();
            break;
          }
        } else break;
      }

      const ended = phaseRef.current === "ending" || phaseRef.current === "done";
      drawFrame(ctx, cv.width, s, fx, { dying: ended && !s.won });
      if (phaseRef.current !== "done") rafRef.current = requestAnimationFrame(loop);
    },
    [finish],
  );

  const startTry = async () => {
    if (busy || !armed) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/minigame/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The core version this page plays. The server picks the save point.
        body: JSON.stringify({ clientVersion: REPLAY_VERSION }),
      });
      const body = (await res.json().catch(() => null)) as
        | {
            runId: string;
            seed: number;
            routes: Route[];
            attemptNo: number;
            attemptsLeft: number;
            startCp: number;
            error?: string;
            code?: string;
          }
        | null;
      // This page is running an older core than the server: no try was used.
      if (res.status === 409 && body?.code === "update_required") {
        window.location.reload();
        return;
      }
      if (!res.ok || !body) {
        setError(body?.error ?? "That try couldn’t be started.");
        await refresh().catch(() => {});
        return;
      }
      const s = createRun(body.seed, body.routes, body.startCp);
      runRef.current = s;
      recRef.current = new InputRecorder();
      fxRef.current = new Fx();
      runIdRef.current = body.runId;
      keysRef.current = { l: false, r: false, j: false };
      touchRef.current = { l: false, r: false, j: false };
      setSession((cur) => ({ ...cur, attemptsUsed: body.attemptNo, attemptsLeft: body.attemptsLeft }));
      setOutcome(null);
      window.addEventListener("pagehide", sendBeacon);

      phaseRef.current = "paused"; // intro of the level this try starts on
      setIntro({
        n: s.li + 1,
        name: s.def.name,
        tip: s.def.tip,
        from: body.startCp > 0 ? SAVE_POINT_NAMES[body.startCp] : "",
      });
      setView("intro");
      lastRef.current = performance.now();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(loop);
    } catch {
      setError("Couldn’t reach the server — your try wasn’t started.");
    } finally {
      setBusy(false);
    }
  };

  const go = () => {
    if (!armed) return;
    lastRef.current = performance.now();
    accRef.current = 0;
    phaseRef.current = "play";
    setView("playing");
  };

  /* ---------------- effects ---------------- */

  // Canvas at device resolution, plus a still frame so the cabinet is never empty.
  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = W * dpr;
    cv.height = H * dpr;
    drawFrame(ctx, cv.width, createRun(1, [0, 0, 0], 0, false), new Fx(), { showHud: false });
  }, []);

  // The Collector art. Never blocks Start: a drawn placeholder head is used until it loads.
  useEffect(() => {
    void loadMonsterImage(MONSTER_SRC);
  }, []);

  // Overlay buttons stay disabled for a moment after they appear.
  useEffect(() => {
    setArmed(false);
    const id = window.setTimeout(() => setArmed(true), ARM_MS);
    return () => window.clearTimeout(id);
  }, [view]);

  // Keyboard. Game keys are tracked always, but only swallowed during a try.
  useEffect(() => {
    const keyOf = (code: string): keyof Keys | null =>
      code === "ArrowLeft" || code === "KeyA" ? "l"
      : code === "ArrowRight" || code === "KeyD" ? "r"
      : code === "Space" || code === "ArrowUp" || code === "KeyW" ? "j"
      : null;
    const onKey = (e: KeyboardEvent) => {
      const inRun = phaseRef.current === "play" || phaseRef.current === "paused" || phaseRef.current === "ending";
      // Space never presses an overlay button: a held jump would burn the next try.
      const inOverlay = !!overlayRef.current?.contains(document.activeElement);
      if (e.code === "Space" && (inRun || inOverlay)) e.preventDefault();
      const k = keyOf(e.code);
      if (!k) return;
      keysRef.current[k] = e.type === "keydown";
      if (inRun) e.preventDefault();
    };
    const clear = () => { keysRef.current = { l: false, r: false, j: false }; };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", clear);
    };
  }, []);

  // Leaving the page by client-side navigation does not fire pagehide.
  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("pagehide", sendBeacon);
      sendBeacon();
    },
    [sendBeacon],
  );

  /* ---------------- render ---------------- */

  const touchProps = (k: keyof Keys) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      touchRef.current[k] = true;
    },
    onPointerUp: () => { touchRef.current[k] = false; },
    onPointerCancel: () => { touchRef.current[k] = false; },
    onLostPointerCapture: () => { touchRef.current[k] = false; },
  });

  const dots = (
    <span className="ts-dots" aria-label={`${session.attemptsLeft} of ${MAX_ATTEMPTS_PER_DAY} tries left`}>
      {Array.from({ length: MAX_ATTEMPTS_PER_DAY }, (_, i) => (
        <i key={i} className={i < session.attemptsLeft ? "ts-on" : ""} />
      ))}
    </span>
  );

  const shownScore = outcome
    ? outcome.serverScore ?? outcome.localScore
    : 0;

  return (
    <div className="ts-root">
      <style>{CSS}</style>
      {newRules && (
        <div className="ts-news" role="status">
          <p>
            New rules: {MAX_ATTEMPTS_PER_DAY} tries a day, save points that reset daily, and your score is
            how far you get (up to {MAX_SCORE}). The leaderboard starts fresh. Also, the floor is on fire.
          </p>
          <button
            type="button"
            className="ts-btn"
            onClick={() => {
              setNewRules(false);
              void dismissTrapShiftNewRulesAction().catch(() => {});
            }}
          >
            Got it
          </button>
        </div>
      )}
      <div className="ts-wrap">
        <div className="ts-main">
          <div className="ts-cab">
            <div className="ts-stage">
              <canvas
                ref={canvasRef}
                width={W}
                height={H}
                style={{ aspectRatio: `${W} / ${H}` }}
                aria-label="Trap Shift mini-game"
              />

              {view !== "playing" && (
                <div className="ts-veil" ref={overlayRef}>
                  {view === "lobby" && !session.unlocked && (
                    <>
                      <p className="ts-eyebrow">Shift not started</p>
                      <h2>Send your Start of Day to unlock today’s tries</h2>
                      <p>Your {MAX_ATTEMPTS_PER_DAY} tries open once today’s Start of Day is in, with your tasks saved.</p>
                      <button className="ts-btn" disabled={!armed} onClick={() => router.push("/va")}>
                        Go to My Day
                      </button>
                    </>
                  )}

                  {view === "lobby" && session.unlocked && (
                    <>
                      <p className="ts-eyebrow">Trap Shift · {seasonLabel}</p>
                      <h2>Three levels. Zero trust.</h2>
                      <p>
                        Run right, reach the EOD flag. In Level 1 the floor behind you starts burning
                        after 5 seconds, so keep moving. In Levels 2 and 3 The Collector floats overhead
                        throwing money bags. Watch for the red X. Not every flag is the real one. One
                        life per try. You can double jump.
                      </p>
                      <p className="ts-small">
                        Save points: halfway through each level, and the start of each level you clear.
                        Your next try starts from the furthest one you reached today. They reset every day.
                      </p>
                      {dots}
                      <p className="ts-strong">{triesLine(session.attemptsLeft)}</p>
                      {session.attemptsLeft > 0 && (
                        <p className="ts-strong">Next try starts at: {SAVE_POINT_NAMES[session.nextStartCp]}</p>
                      )}
                      <div className="ts-final">
                        <div><span className="n g">{session.todayBest ?? "—"}</span><span className="l">Today’s best</span></div>
                        <div><span className="n">{session.seasonBest ?? "—"}</span><span className="l">Season best</span></div>
                      </div>
                      <button
                        className="ts-btn"
                        disabled={!armed || busy || session.attemptsLeft <= 0}
                        onClick={() => void startTry()}
                      >
                        {session.attemptsLeft <= 0
                          ? "No tries left"
                          : busy
                            ? "Starting…"
                            : `Start try ${session.attemptsUsed + 1}`}
                      </button>
                      {error && <p className="ts-warn ts-err">{error}</p>}
                      <p className="ts-small">
                        Your best try counts. Leaving mid-run uses up that try.
                      </p>
                    </>
                  )}

                  {view === "intro" && (
                    <>
                      <p className="ts-eyebrow">Level {intro.n} of 3</p>
                      <h2>{intro.name}</h2>
                      {intro.from && <p className="ts-strong">Starting from your save point: {intro.from}</p>}
                      <p className="ts-tip">{intro.tip}</p>
                      <button className="ts-btn" disabled={!armed} onClick={go}>Go</button>
                    </>
                  )}

                  {view === "over" && outcome && (
                    <>
                      <p className="ts-eyebrow">{outcome.won ? "Try complete" : "Try over"}</p>
                      <h2>{outcome.won ? "Shift complete!" : outcome.taunt}</h2>
                      <div className="ts-final">
                        <div>
                          <span className="n g">{shownScore} / {MAX_SCORE}</span>
                          <span className="l">
                            {outcome.checking ? "Checking…" : outcome.error ? "Not recorded" : "Score"}
                          </span>
                        </div>
                      </div>
                      <p>
                        {outcome.won
                          ? `All three levels cleared. ${MAX_SCORE} out of ${MAX_SCORE}.`
                          : `You made it ${outcome.pct}% through Level ${outcome.level}: ${outcome.levelName}.`}
                      </p>
                      {outcome.error && <p className="ts-warn ts-err">{outcome.error}</p>}
                      {dots}
                      <p className="ts-strong">
                        {session.attemptsLeft <= 0
                          ? "That was your last try today."
                          : `${session.attemptsLeft} ${session.attemptsLeft === 1 ? "try" : "tries"} left today.`}
                      </p>
                      <p>Today’s best: {session.todayBest ?? "—"}</p>
                      {session.attemptsLeft > 0 && !outcome.checking && (
                        <p className="ts-strong">Next try starts at: {SAVE_POINT_NAMES[session.nextStartCp]}</p>
                      )}
                      <button className="ts-btn" disabled={!armed || outcome.checking} onClick={() => setView("lobby")}>
                        Back to lobby
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="ts-touch" aria-hidden={view !== "playing"}>
              <button type="button" aria-label="Left" {...touchProps("l")}>◀</button>
              <button type="button" aria-label="Right" {...touchProps("r")}>▶</button>
              <button type="button" aria-label="Jump" className="ts-jump" {...touchProps("j")}>JUMP</button>
            </div>
          </div>
          <p className="ts-hint">← → or A D to move. Space / ↑ to jump, again in the air to double jump.</p>
        </div>

        <div className="ts-rail">
          <div className="ts-card">
            <h3>{seasonLabel}</h3>
            {rail.length > 0 ? (
              <ol className="ts-lb">
                <li className="ts-head" aria-hidden="true">
                  <span className="rk">#</span>
                  <span className="nm">VA</span>
                  <span className="sc">Best</span>
                  <span className="rc">Reached</span>
                  <span className="td">Today</span>
                </li>
                {rail.map((r) => (
                  <li key={`${r.rank}-${r.name}`} className={`${r.rank === 1 ? "ts-top " : ""}${r.isYou ? "ts-you" : ""}`}>
                    <span className="rk">{r.rank}</span>
                    <span className="nm">{r.name}</span>
                    <span className="sc">{r.best}</span>
                    <span className="rc">{r.reached}</span>
                    <span className="td">{r.todayBest ?? "—"}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="ts-empty">No tries in yet this season.</p>
            )}
          </div>

          <div className="ts-card">
            <h3>Scoring</h3>
            <ul className="ts-score">
              <li><span>Level 1, by how far you get</span><b>0 to 100</b></li>
              <li><span>Level 2</span><b>101 to 200</b></li>
              <li><span>Level 3</span><b>201 to 300</b></li>
              <li><span>Tries per day</span><b>{MAX_ATTEMPTS_PER_DAY}</b></li>
            </ul>
            <p className="ts-note">
              Your best single try is your leaderboard score. Ties go to the faster run.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Container queries, as in the Stretch Goal cabinet: the game sits in a page
   column, so it sizes against its own width rather than the viewport. */
const CSS = `
.ts-root{container-type:inline-size;width:100%}
.ts-wrap{--ts-navy:#303E7A;--ts-orange:#F67F25;--ts-yellow:#FBCE1B;--ts-paper:#E9ECF9;
  --ts-muted:#aab5d6;--ts-line:rgba(213,218,235,.20);
  --ts-display:var(--font-poppins),"Poppins","Segoe UI",system-ui,sans-serif;
  --ts-body:var(--font-open-sans),"Open Sans","Segoe UI",system-ui,sans-serif;
  display:grid;grid-template-columns:minmax(0,1fr);gap:16px;align-items:start;
  font-family:var(--ts-body);font-size:14px;line-height:1.55;color:var(--ts-paper);
  -webkit-tap-highlight-color:transparent}
.ts-wrap *{box-sizing:border-box}
@container (min-width:760px){.ts-wrap{grid-template-columns:minmax(0,1fr) 260px;gap:18px}}

.ts-cab{border:6px solid #1A2252;border-radius:16px;overflow:hidden;background:#141A3F;
  box-shadow:0 24px 60px rgba(0,0,0,.35);user-select:none;-webkit-user-select:none}
.ts-stage{position:relative;container-type:inline-size;background:#141A3F}
.ts-stage canvas{display:block;width:100%;height:auto;touch-action:none}
.ts-hint{margin:8px 2px 0;font-size:12px;color:var(--text-muted,#5b6386)}

.ts-veil{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
  justify-content:center;text-align:center;gap:clamp(4px,1.6cqi,12px);
  padding:clamp(10px,3cqi,24px);overflow-y:auto;
  background:linear-gradient(180deg,rgba(20,26,63,.84),rgba(20,26,63,.95))}
.ts-veil h2{font-family:var(--ts-display);font-weight:700;margin:0;
  font-size:clamp(17px,4.6cqi,30px);line-height:1.18;max-width:26ch}
.ts-veil p{margin:0;color:var(--ts-muted);max-width:52ch;font-size:clamp(11px,2cqi,14px)}
.ts-veil .ts-strong{color:var(--ts-paper);font-family:var(--ts-display);font-weight:600}
.ts-veil .ts-tip{color:var(--ts-yellow);font-family:var(--ts-display);font-weight:600;font-size:clamp(12px,2.4cqi,16px)}
.ts-veil .ts-small{font-size:clamp(10px,1.7cqi,12px)}
.ts-eyebrow{font-family:var(--ts-display);font-weight:600;letter-spacing:.16em;text-transform:uppercase;
  color:var(--ts-orange)!important;font-size:clamp(9px,1.7cqi,11px)!important}
.ts-btn{font-family:var(--ts-display);font-weight:600;border:none;border-radius:9px;cursor:pointer;
  font-size:clamp(12px,2.2cqi,15px);padding:clamp(7px,1.8cqi,12px) clamp(16px,4cqi,26px);
  background:var(--ts-orange);color:#26160A;transition:transform .12s ease,box-shadow .12s ease}
.ts-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 8px 22px rgba(246,127,37,.32)}
.ts-btn:focus-visible{outline:3px solid var(--ts-yellow);outline-offset:3px}
.ts-btn:disabled{opacity:.55;cursor:default}
.ts-warn{font-family:var(--ts-display);font-weight:600;color:var(--ts-yellow)!important}
.ts-err{color:var(--ts-orange)!important}
.ts-dots{display:inline-flex;gap:7px}
.ts-dots i{width:11px;height:11px;border-radius:50%;border:2px solid var(--ts-yellow);display:block}
.ts-dots i.ts-on{background:var(--ts-yellow)}
.ts-final{display:flex;gap:clamp(14px,5cqi,32px);justify-content:center;font-family:var(--ts-display)}
.ts-final div{display:flex;flex-direction:column}
.ts-final .n{font-size:clamp(20px,5.4cqi,36px);font-weight:700;line-height:1;font-variant-numeric:tabular-nums}
.ts-final .n.g{color:var(--ts-yellow)}
.ts-final .l{font-size:clamp(8px,1.6cqi,10px);letter-spacing:.14em;text-transform:uppercase;color:var(--ts-muted);font-weight:600}

.ts-touch{display:none;gap:10px;padding:10px;background:#1A2252}
.ts-touch button{font-family:var(--ts-display);font-weight:700;font-size:18px;color:var(--ts-paper);
  background:var(--ts-navy);border:1px solid var(--ts-line);border-radius:12px;padding:14px 0;
  flex:1;touch-action:none;user-select:none;-webkit-user-select:none}
.ts-touch .ts-jump{flex:1.6;background:var(--ts-orange);color:#26160A;font-size:15px;letter-spacing:.08em}
@media (pointer:coarse){.ts-touch{display:flex}}

.ts-rail{display:flex;flex-direction:column;gap:12px;min-width:0}
.ts-card{border:1px solid var(--ts-line);border-radius:12px;overflow:hidden;background:var(--ts-navy);color:var(--ts-paper)}
.ts-card h3{font-family:var(--ts-display);font-size:10px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;
  color:#d5daeb;margin:0;padding:10px 13px;background:#293568;border-bottom:1px solid var(--ts-line)}
.ts-empty{margin:0;padding:11px 13px;font-size:12px;color:var(--ts-muted)}
.ts-lb{list-style:none;margin:0;padding:3px 0}
.ts-lb li{display:grid;grid-template-columns:16px minmax(0,1fr) 28px 82px 30px;align-items:center;gap:6px;padding:6px 10px;
  font-size:12.5px;border-left:3px solid transparent}
.ts-lb .sc,.ts-lb .td{text-align:right}
.ts-lb .rc{font-size:10.5px;color:#d5daeb;white-space:nowrap}
.ts-lb .td{font-size:11px;color:var(--ts-muted);font-variant-numeric:tabular-nums}
.ts-lb li.ts-head{font-family:var(--ts-display);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--ts-muted)}
.ts-lb li.ts-head span{font-weight:600;color:var(--ts-muted);font-size:9.5px}
.ts-news{display:flex;align-items:center;gap:14px;margin:0 0 14px;padding:12px 14px;border-radius:12px;
  background:#303E7A;color:#E9ECF9;border:1px solid rgba(251,206,27,.45);
  font-family:var(--font-open-sans),"Open Sans","Segoe UI",system-ui,sans-serif;font-size:14px}
.ts-news p{margin:0;flex:1}
.ts-news .ts-btn{font-size:14px;padding:8px 18px;flex:none}
.ts-lb li + li{border-top:1px solid var(--ts-line)}
.ts-lb .rk{font-family:var(--ts-display);font-weight:600;color:var(--ts-muted);font-size:11px;font-variant-numeric:tabular-nums}
.ts-lb .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ts-lb .pf{font-size:10px;color:var(--ts-muted)}
.ts-lb .sc{font-family:var(--ts-display);font-weight:600;font-variant-numeric:tabular-nums}
.ts-lb li.ts-top .rk{color:var(--ts-yellow)}
.ts-lb li.ts-you{background:#3d4f95;border-left-color:var(--ts-orange)}
.ts-lb li.ts-you .nm{font-weight:700;color:#fff}
.ts-score{list-style:none;margin:0;padding:4px 0}
.ts-score li{display:flex;justify-content:space-between;gap:10px;padding:6px 13px;font-size:12px}
.ts-score li + li{border-top:1px solid var(--ts-line)}
.ts-score span{color:#d5daeb}
.ts-score b{font-family:var(--ts-display);color:var(--ts-yellow);white-space:nowrap}
.ts-note{margin:0;padding:9px 13px 11px;font-size:11.5px;color:var(--ts-muted);border-top:1px solid var(--ts-line)}
@media (prefers-reduced-motion:reduce){.ts-wrap *{transition:none!important}}
`;
