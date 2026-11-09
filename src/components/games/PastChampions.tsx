import type { PastChampion } from "@/lib/leaderboards/registry";

/**
 * Wall of fame — the winner of every completed season.
 *
 * Each row is resolved through the game that was live that month, so an
 * archived game keeps its history: August 2026 still shows its Daily Word Guess
 * champion, scored by Word's own rules, even though the game itself is no
 * longer mounted anywhere.
 *
 * Brand treatment matches the rest of the dashboard — white card, blue
 * headings, yellow medal for the most recent season.
 */
export function PastChampions({ champions }: { champions: PastChampion[] }) {
  if (champions.length === 0) return null;
  // The medal goes to the newest season that counted, not to a void one.
  const medalKey = champions.find((c) => !c.voidReason)?.monthKey;

  return (
    <section className="rounded-card bg-white shadow-card" aria-label="Past champions">
      <div className="border-b border-[var(--border)] px-4 py-3 sm:px-6">
        <h2 className="font-heading text-sm font-bold uppercase tracking-[0.12em] text-brand-blue-700">
          Past champions
        </h2>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Every season keeps its winner, including games that have since retired.
        </p>
      </div>

      <ol className="divide-y divide-[var(--border)]">
        {champions.map((champion) => (
          <li
            key={champion.monthKey}
            className={`flex items-center gap-3 px-4 py-3 sm:px-6${
              champion.voidReason ? " opacity-50 grayscale" : ""
            }`}
          >
            <span
              aria-hidden
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-full font-heading text-xs font-bold ${
                champion.monthKey === medalKey
                  ? "bg-brand-yellow-400 text-brand-yellow-900"
                  : "bg-brand-blue-50 text-brand-blue-700"
              }`}
            >
              {champion.monthLabel.slice(0, 3)}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate font-heading text-sm font-bold text-[var(--text)]">
                {champion.name}
              </p>
              <p className="truncate text-xs text-[var(--text-muted)]">
                {champion.gameName} · {champion.monthLabel} · {champion.detail}
              </p>
            </div>

            <span className="shrink-0 text-right">
              <span className="block font-heading text-lg font-bold tabular-nums leading-tight text-brand-blue-700">
                {champion.voidReason ? "—" : champion.score}
              </span>
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                {champion.voidReason ? "Void" : champion.scoreLabel}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
