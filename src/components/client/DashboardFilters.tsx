"use client";

import { useRef } from "react";
import Link from "next/link";
import type { DashboardFilters as Filters } from "@/lib/dashboard";

/**
 * Filter/sort bar. Implemented as a GET form so it works without client JS;
 * with JS it auto-submits on change for a live feel.
 */
export function DashboardFilters({
  vas,
  filters,
}: {
  vas: { id: string; name: string }[];
  filters: Filters;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const submit = () => formRef.current?.requestSubmit();

  return (
    <form
      ref={formRef}
      method="get"
      action="/client"
      className="card flex flex-col gap-4 p-4 sm:p-5"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="f-va" className="field-label">
            Virtual assistant
          </label>
          <select
            id="f-va"
            name="vaId"
            defaultValue={filters.vaId ?? ""}
            onChange={submit}
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
          <label htmlFor="f-from" className="field-label">
            From
          </label>
          <input
            id="f-from"
            name="from"
            type="date"
            defaultValue={filters.from ?? ""}
            onChange={submit}
            className="field-input"
          />
        </div>

        <div>
          <label htmlFor="f-to" className="field-label">
            To
          </label>
          <input
            id="f-to"
            name="to"
            type="date"
            defaultValue={filters.to ?? ""}
            onChange={submit}
            className="field-input"
          />
        </div>

        <div>
          <label htmlFor="f-sort" className="field-label">
            Sort by
          </label>
          <select
            id="f-sort"
            name="sort"
            defaultValue={filters.sort}
            onChange={submit}
            className="field-input"
          >
            <option value="date_desc">Date — newest first</option>
            <option value="date_asc">Date — oldest first</option>
            <option value="va">VA name (A–Z)</option>
            <option value="hours_desc">Hours worked — high to low</option>
            <option value="urgent_first">Urgent first</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--text)]">
          <input
            type="checkbox"
            name="urgent"
            value="1"
            defaultChecked={filters.urgentOnly}
            onChange={submit}
            className="h-4 w-4 rounded border-[var(--border)] text-brand-orange-500 focus:ring-brand-orange-300"
          />
          Urgent entries only
        </label>

        <div className="flex items-center gap-2">
          <Link
            href="/client"
            className="text-sm font-heading font-medium text-[var(--text-muted)] underline-offset-2 hover:text-brand-blue-700 hover:underline"
          >
            Clear filters
          </Link>
          <button type="submit" className="btn-primary px-4 text-sm sm:min-h-[40px]">
            Apply
          </button>
        </div>
      </div>
    </form>
  );
}
