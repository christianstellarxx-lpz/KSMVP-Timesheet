import type { ChampionDTO } from "@/lib/leaderboards/registry";

/**
 * Reigning Champion spotlight — last month's overall winner.
 *
 * Everything shown here is resolved from the previous calendar month's winning
 * leaderboard entry (see getReigningChampion); nothing is hardcoded. When a
 * month's game wraps, this box crowns that winner on the next load.
 *
 * Brand treatment: blue #303E7A card, orange #F67F25 top bar + score pill,
 * yellow #FBCE1B trophy badge + eyebrow. Text on colored fills uses dark shades
 * from the same family, never plain black.
 */
export function ReigningChampion({ champion }: { champion: ChampionDTO }) {
  return (
    <section
      className="overflow-hidden rounded-card bg-brand-blue-600 shadow-card"
      aria-label="Reigning champion"
    >
      {/* Orange top bar */}
      <div className="h-1.5 w-full bg-brand-orange-500" />

      <div className="flex items-center gap-4 px-4 py-4 sm:px-6 sm:py-5">
        {/* Yellow trophy badge */}
        <span
          aria-hidden
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-yellow-400 sm:h-14 sm:w-14"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6 text-brand-yellow-900 sm:h-7 sm:w-7"
            fill="none"
          >
            <path
              d="M8 21h8m-4-4v4M6 4h12v4a6 6 0 0 1-12 0V4Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M18 5h2.5a1.5 1.5 0 0 1 0 5H18M6 5H3.5a1.5 1.5 0 0 0 0 5H6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-heading text-[11px] font-bold uppercase tracking-[0.14em] text-brand-yellow-400">
            Reigning Champion
          </p>
          <p className="mt-0.5 truncate text-xs text-white/70">
            {champion.gameName} · {champion.monthLabel}
          </p>
          <p className="mt-1 truncate font-heading text-xl font-bold leading-tight text-white sm:text-2xl">
            {champion.name}
          </p>
        </div>

        {/* Orange score pill */}
        <span className="shrink-0 self-center rounded-full bg-brand-orange-500 px-3 py-1.5 text-center font-heading text-[11px] font-bold uppercase tracking-wide text-[#4A1B0C] sm:px-4 sm:py-2 sm:text-xs">
          <span className="block leading-tight">Top score</span>
          <span className="block font-heading text-lg font-bold leading-tight tabular-nums sm:text-xl">
            {champion.score}
          </span>
        </span>
      </div>
    </section>
  );
}
