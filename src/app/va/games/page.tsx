import { redirect } from "next/navigation";
import { requireVA } from "@/lib/session";
import { GAMES_ENABLED } from "@/lib/features";
import {
  getPastChampions,
  getReigningChampion,
} from "@/lib/leaderboards/registry";
import { STRETCH_SCORING_SUMMARY } from "@/lib/leaderboards/stretchResolver";
import { getStretchGoalState } from "@/lib/stretch/game";
import { formatEtDateLong } from "@/lib/time";
import { PastChampions } from "@/components/games/PastChampions";
import { ReigningChampion } from "@/components/games/ReigningChampion";
import { StretchGoalPanel } from "@/components/games/StretchGoalPanel";

export const metadata = { title: "Games — KSMVP VA Tasks" };
export const dynamic = "force-dynamic";

/**
 * The game / leaderboard page. Same route and same "Games" nav label the VAs
 * already know — only the game inside it changed.
 *
 * Reigning Champion sits at the top (mobile-first), then this month's rotating
 * game — Stretch Goal from September 2026 — with its monthly leaderboard, then
 * the wall of fame carrying every earlier season including Daily Word Guess.
 */
export default async function GamesPage() {
  const session = await requireVA();
  // Games are off for everyone — send old bookmarks back to My Day.
  if (!GAMES_ENABLED) redirect("/va");
  const [champion, stretch, pastChampions] = await Promise.all([
    getReigningChampion(),
    getStretchGoalState(session.userId),
    getPastChampions(),
  ]);

  return (
    // The VA shell is max-w-6xl; the game reads best a little narrower than that.
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <ReigningChampion champion={champion} />

      <div>
        <h1 className="text-2xl font-bold text-brand-blue-700">
          This month’s game
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          {formatEtDateLong(stretch.today)} · one ranked run a day, once you’ve
          timed in and logged your start-of-day task
        </p>
      </div>

      <StretchGoalPanel
        unlocked={stretch.session.unlocked}
        runUsed={stretch.session.runUsed}
        runState={stretch.session.runState}
        seed={stretch.session.seed}
        season={stretch.session.season}
        seasonLabel={stretch.seasonLabel}
        leaderboard={stretch.leaderboard}
        dailyTally={stretch.dailyTally}
        myRank={stretch.myRank}
      />

      <p className="text-xs text-[var(--text-muted)]">{STRETCH_SCORING_SUMMARY}</p>

      <PastChampions champions={pastChampions} />
    </div>
  );
}
