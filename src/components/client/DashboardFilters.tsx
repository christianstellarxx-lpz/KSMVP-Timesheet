"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DashboardFilters as Filters, DayFilter } from "@/lib/dashboard";

/**
 * Dashboard controls. The primary control is a day selector — Today (default),
 * Yesterday, or "The other day" (pick any date). Secondary VA / sort / urgent
 * filters sit below. Every change navigates via the router, always preserving
 * the current day and the other filters.
 */
export function DashboardFilters({
  vas,
  filters,
}: {
  vas: { id: string; name: string }[];
  filters: Filters;
}) {
  const router = useRouter();

  // Build the next URL from the current filters plus any overrides, then go.
  const go = (overrides: {
    day?: DayFilter;
    date?: string;
    vaId?: string;
    sort?: string;
    urgent?: string;
  }) => {
    const p = new URLSearchParams();

    const vaId = overrides.vaId ?? filters.vaId;
    if (vaId) p.set("vaId", vaId);

    p.set("sort", overrides.sort ?? filters.sort);

    const urgent = overrides.urgent ?? (filters.urgentOnly ? "1" : "");
    if (urgent) p.set("urgent", "1");

    const day = overrides.day ?? filters.day;
    p.set("day", day);
    if (day === "other") {
      const date = overrides.date ?? filters.date;
      if (date) p.set("date", date);
    }

    router.push(`/client?${p.toString()}`);
  };

  return (
    <div className="card flex flex-col gap-4 p-4 sm:p-5">
      {/* Day selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="field-label">Showing</span>
          <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-1">
            <DayButton
              active={filters.day === "today"}
              onClick={() => go({ day: "today" })}
            >
              Today
            </DayButton>
            <DayButton
              active={filters.day === "yesterday"}
              onClick={() => go({ day: "yesterday" })}
            >
              Yesterday
            </DayButton>
            <DayButton
              active={filters.day === "other"}
              // Clear the date so the server defaults to a recent past day.
              onClick={() => go({ day: "other", date: "" })}
            >
              The other day
            </DayButton>
          </div>
        </div>

        {filters.day === "other" && (
          <div>
            <label htmlFor="f-date" className="field-label">
              Pick a day
            </label>
            <input
              id="f-date"
              type="date"
              defaultValue={filters.date}
              onChange={(e) =>
                e.target.value && go({ day: "other", date: e.target.value })
              }
              className="field-input"
            />
          </div>
        )}
      </div>

      {/* Secondary filters */}
      <div className="grid grid-cols-1 gap-4 border-t border-[var(--border)] pt-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor="f-va" className="field-label">
            Virtual assistant
          </label>
          <select
            id="f-va"
            defaultValue={filters.vaId ?? ""}
            onChange={(e) => go({ vaId: e.target.value })}
            className="field-input"
          >
            <option value="">All VAs</option>
            {vas.map((va) => (
              <option key={va.id} value={va.id}>
                {va.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="f-sort" className="field-label">
            Sort by
          </label>
          <select
            id="f-sort"
            defaultValue={filters.sort}
            onChange={(e) => go({ sort: e.target.value })}
            className="field-input"
          >
            <option value="date_desc">Date — newest first</option>
            <option value="date_asc">Date — oldest first</option>
            <option value="va">VA name (A–Z)</option>
            <option value="hours_desc">Hours worked — high to low</option>
            <option value="urgent_first">Urgent first</option>
          </select>
        </div>

        <div className="flex items-end">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--text)]">
            <input
              type="checkbox"
              defaultChecked={filters.urgentOnly}
              onChange={(e) => go({ urgent: e.target.checked ? "1" : "" })}
              className="h-4 w-4 rounded border-[var(--border)] text-brand-orange-500 focus:ring-brand-orange-300"
            />
            Urgent entries only
          </label>
        </div>
      </div>

      {(filters.vaId || filters.urgentOnly || filters.day !== "today") && (
        <div className="flex items-center justify-end">
          <Link
            href="/client"
            className="text-sm font-heading font-medium text-[var(--text-muted)] underline-offset-2 hover:text-brand-blue-700 hover:underline"
          >
            Reset to today
          </Link>
        </div>
      )}
    </div>
  );
}

function DayButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md px-3 py-1.5 text-sm font-heading font-semibold transition-colors ${
        active
          ? "bg-brand-blue-600 text-white shadow-sm"
          : "text-[var(--text-muted)] hover:text-brand-blue-700"
      }`}
    >
      {children}
    </button>
  );
}
