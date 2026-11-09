import { redirect } from "next/navigation";
import { requireVA } from "@/lib/session";
import { GAMES_ENABLED } from "@/lib/features";
import {
  getPastChampions,
  getReigningChampion,
} from "@/lib/leaderboards/registry";
import { getTrapPageState } from "@/lib/trapshift/game";
import { formatEtDateLong } from "@/lib/time";
import { PastChampions } from "@/components/games/PastChampions";
import { ReigningChampion } from "@/components/games/ReigningChampion";
import TrapShift from "@/components/games/TrapShift";

export const metadata = { title: "Games — KSMVP VA Tasks" };
export const dynamic = "force-dynamic";

/**
 * The game / leaderboard page. Same route and same "Games" nav label the VAs
 * already know — only the game inside it changed.
 *
 * Reigning Champion sits at the top (mobile-first), then this month's rotating
 * game — Trap Shift from November 2026 — with its season board, then the wall
 * of fame carrying every earlier season, including archived games.
 */
export default async function GamesPage() {
  const session = await requireVA();
  // Games are off for everyone — send old bookmarks back to My Day.
  if (!GAMES_ENABLED) redirect("/va");
  const [champion, trap, pastChampions] = await Promise.all([
    getReigningChampion(),
    getTrapPageState(session.userId),
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
          {formatEtDateLong(trap.today)} · three tries a day, once you’ve sent
          your Start of Day
        </p>
      </div>

      <TrapShift
        initialSession={trap.session}
        initialRail={trap.rail}
        seasonLabel={trap.seasonLabel}
      />

      <PastChampions champions={pastChampions} />
    </div>
  );
}
