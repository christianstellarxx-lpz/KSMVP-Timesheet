import Link from "next/link";
import { requireAdmin, isDailyReporter } from "@/lib/session";
import { getDashboardData, parseFilters } from "@/lib/dashboard";
import { getTodayRollCall } from "@/lib/rollcall";
import { DashboardFilters } from "@/components/client/DashboardFilters";
import { DashboardEntryCard } from "@/components/client/DashboardEntryCard";
import { RollCall } from "@/components/client/RollCall";

export const metadata = { title: "Dashboard — KSMVP VA Tasks" };
export const dynamic = "force-dynamic";

export default async function ClientDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdmin();
  const filters = parseFilters(await searchParams);
  const data = await getDashboardData(filters);

  // The daily reporter gets a unique roll-call panel at the top.
  const reporter = isDailyReporter(session.email);
  const rollCall = reporter ? await getTodayRollCall(session.name) : null;

  const hasVAs = data.vas.length > 0;
  const filtersActive =
    !!filters.vaId || !!filters.from || !!filters.to || filters.urgentOnly;

  return (
    <div className="space-y-6">
      {rollCall && <RollCall data={rollCall} />}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-blue-700">
            Team activity
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            Daily time and task reports from your virtual assistants — all times
            in ET.
          </p>
        </div>
        <Link href="/client/vas" className="btn-ghost self-start sm:self-auto">
          Manage team
        </Link>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Entries" value={data.stats.total} />
        <StatTile
          label="Hours logged"
          value={data.stats.totalHours}
          accent="blue"
        />
        <StatTile
          label="Urgent"
          value={data.stats.urgentCount}
          accent={data.stats.urgentCount > 0 ? "orange" : undefined}
        />
        <StatTile
          label="Needs review"
          value={data.stats.incompleteCount}
          accent={data.stats.incompleteCount > 0 ? "orange" : undefined}
        />
      </div>

      {!hasVAs ? (
        <EmptyState
          title="No VAs yet"
          body="Add your first virtual assistant to start seeing their daily reports here."
          action={
            <Link href="/client/vas" className="btn-primary">
              Add a VA
            </Link>
          }
        />
      ) : (
        <>
          <DashboardFilters vas={data.vas} filters={filters} />

          {data.entries.length === 0 ? (
            <EmptyState
              title="No entries found"
              body={
                filtersActive
                  ? "No time entries match your current filters. Try widening the date range or clearing filters."
                  : "Your VAs haven’t logged any time yet. Entries will appear here as they clock in and out."
              }
              action={
                filtersActive ? (
                  <Link href="/client" className="btn-ghost">
                    Clear filters
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <section className="space-y-4" aria-label="Time entries">
              {data.entries.map((entry) => (
                <DashboardEntryCard key={entry.id} entry={entry} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "blue" | "orange";
}) {
  const valueColor =
    accent === "blue"
      ? "text-brand-blue-600"
      : accent === "orange"
        ? "text-brand-orange-600"
        : "text-[var(--text)]";
  return (
    <div className="card p-4">
      <p className="font-heading text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </p>
      <p className={`mt-1 font-heading text-3xl font-bold tabular-nums ${valueColor}`}>
        {value}
      </p>
    </div>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-brand-blue-50 text-brand-blue-500">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" strokeWidth="2" />
          <path d="M8 2v4M16 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <div>
        <h3 className="font-heading text-lg font-bold text-[var(--text)]">
          {title}
        </h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-[var(--text-muted)]">
          {body}
        </p>
      </div>
      {action}
    </div>
  );
}
