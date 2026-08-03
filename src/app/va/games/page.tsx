import { requireVA } from "@/lib/session";
import { getWordGameState } from "@/lib/word/game";
import { getReigningChampion } from "@/lib/leaderboards/registry";
import { ReigningChampion } from "@/components/games/ReigningChampion";
import { WordGame } from "@/components/games/WordGame";

export const metadata = { title: "Games — KSMVP VA Tasks" };
export const dynamic = "force-dynamic";

/**
 * The game / leaderboard page. Reigning Champion sits at the top (mobile-first),
 * then this month's rotating game — currently Daily Word Guess — with its
 * monthly leaderboard.
 */
export default async function GamesPage() {
  const session = await requireVA();
  const [champion, word] = await Promise.all([
    getReigningChampion(),
    getWordGameState(session.userId),
  ]);

  return (
    <div className="space-y-6">
      <ReigningChampion champion={champion} />

      <div>
        <h1 className="text-2xl font-bold text-brand-blue-700">
          This month’s game
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          {word.dateLabel} · one attempt a day, once you’ve clocked in
        </p>
      </div>

      <WordGame initialState={word} meId={session.userId} />
    </div>
  );
}
