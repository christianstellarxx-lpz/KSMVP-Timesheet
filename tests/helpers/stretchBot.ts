import {
  TIERS,
  createGame,
  tierIndex,
  type Game,
  type Hold,
} from "@/lib/stretch/core";

/**
 * A bot that can actually play Stretch Goal, shared by the replay-integrity
 * tests and the database tests.
 *
 * It exists to produce *genuine* input logs: a `holds` array that the real
 * simulation accepts and that reaches a real score. Nothing here is app code —
 * it is the test's own model of the physics, deliberately independent of the
 * implementation so a change to the simulation makes these tests fail rather
 * than quietly agree with themselves.
 */

/**
 * Mirrors the private per-step drift speed in core.ts.
 *
 * Duplicated deliberately: the bot has to predict where a drifting ledge will
 * be when it releases, and it is the *test's* model of the physics. If someone
 * changes the real constant, this bot stops landing on tier-3 ledges and these
 * tests fail loudly — which is the intended alarm, not a nuisance.
 */
const DRIFT_SP = 0.0367;

/** Same 4-decimal quantisation the simulation applies to transcendentals. */
const q = (n: number): number => Math.round(n * 10000) / 10000;

/**
 * Where the target ledge's centre will be after `ticks` more simulation steps.
 * A still ledge is where it is; a drifting one is mid-swing and locks only on
 * release, so the bot has to aim at the future.
 */
function predictedCentre(
  target: { x: number; baseX: number; w: number; drift: number; ph: number },
  ticks: number,
): number {
  if (!target.drift) return target.x + target.w / 2;
  let ph = target.ph;
  for (let i = 0; i < ticks; i++) ph = q(ph + DRIFT_SP);
  return q(target.baseX + Math.sin(ph) * target.drift) + target.w / 2;
}

export interface Plan {
  pressAt: number;
  releaseAt: number;
}

/**
 * The hold that lands the beam tip on the centre of the target ledge.
 *
 * Beam geometry: reach = len * (aFrac + (1 - aFrac) * cos(bend)), so the length
 * needed for a given reach is reach / k. Growth happens on the ticks strictly
 * between press and release, hence the +1.
 */
export function idealHold(game: Game, jitterSteps = 0): Plan {
  const s = game.state;
  const target = s.platforms[s.platforms.length - 1];
  const beam = s.beams[s.beams.length - 1];
  const k =
    beam.aFrac + (1 - beam.aFrac) * Math.cos((beam.bend * Math.PI) / 180);
  const stretch = TIERS[tierIndex(s.score)].stretch;
  const pressAt = s.step + 1;

  // Fixed point: the hold length decides the release step, the release step
  // decides where a drifting ledge stops, and that decides the hold length.
  let growth = 1;
  for (let i = 0; i < 8; i++) {
    const releaseAt = pressAt + growth + 1;
    const centre = predictedCentre(target, releaseAt - s.step);
    const next = Math.max(1, Math.round((centre - beam.x) / k / stretch));
    if (next === growth) break;
    growth = next;
  }

  return {
    pressAt,
    releaseAt: Math.max(pressAt + 1, pressAt + growth + 1 + jitterSteps),
  };
}

/** A hold far too short to bridge any gap — used to end a run on purpose. */
function fallShortHold(game: Game): Plan {
  const pressAt = game.state.step + 1;
  return { pressAt, releaseAt: pressAt + 2 };
}

export interface DrivenRun {
  seed: number;
  holds: Hold[];
  score: number;
  perfects: number;
  tier: number;
  steps: number;
  over: boolean;
}

/**
 * A deterministic one-step timing wobble, applied to some beams and not others.
 *
 * A bot that lands dead centre every time scores nothing but perfects, which
 * would leave the ordinary +1 landing — the common case — untested. Nudging
 * every third and fifth beam produces a realistic mix of both.
 */
export function jitterForBeam(index: number): number {
  if (index % 3 === 0) return 1;
  if (index % 5 === 0) return -1;
  return 0;
}

/**
 * Drive a real game to `stopAtScore`, then deliberately fall short so the run
 * ends. Returns the input log exactly as the client would post it.
 */
export function driveRun(
  seed: number,
  stopAtScore: number,
  jitter: (beamIndex: number) => number = () => 0,
): DrivenRun {
  const game = createGame(seed);
  let plan: Plan | null = null;
  let beamIndex = 0;

  // Generous ceiling; a 110-point run is well under 30k steps.
  for (let guard = 0; guard < 200_000 && !game.state.over; guard++) {
    if (game.state.phase === "waiting" && !plan) {
      plan =
        game.state.score >= stopAtScore
          ? fallShortHold(game)
          : idealHold(game, jitter(beamIndex));
      beamIndex++;
    }

    const step = game.state.step + 1;
    const pressed = !!plan && step >= plan.pressAt && step < plan.releaseAt;
    game.tick(pressed);
    if (plan && game.state.step >= plan.releaseAt) plan = null;
  }

  const s = game.state;
  return {
    seed,
    holds: s.holds.filter((h) => h.release > 0),
    score: s.score,
    perfects: s.perfects,
    tier: s.tier,
    steps: s.step,
    over: s.over,
  };
}
