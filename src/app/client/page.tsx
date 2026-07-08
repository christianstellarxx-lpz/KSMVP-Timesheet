import Link from "next/link";
import { requireAdmin, isDailyReporter, isFullAdmin } from "@/lib/session";
import { getDashboardData, parseFilters } from "@/lib/dashboard";
import { formatEtDateLong } from "@/lib/time";
import { getTodayRollCall } from "@/lib/rollcall";
import { getUnreadNoticesForUser } from "@/lib/notices";
import { dismissNoticeAction } from "@/app/notices/actions";
import { DashboardFilters } from "@/components/client/DashboardFilters";
import { DashboardEntryCard } from "@/components/client/DashboardEntryCard";
import { RollCall } from "@/components/client/RollCall";
import { NoticeInbox } from "@/components/NoticeInbox";

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
  const canDelete = isFullAdmin(session.role);

  // The daily reporter gets a unique roll-call panel at the top.
  const reporter = isDailyReporter(session.email);
  const rollCall = reporter ? await getTodayRollCall(session.name) : null;

  // Sales Desk notices addressed to this admin (e.g. Admin Inquiries).
  const notices = await getUnreadNoticesForUser(session.userId);

  const hasVAs = data.vas.length > 0;
  const filtersActive = !!filters.vaId || filters.urgentOnly;
  const dayLabel =
    filters.day === "today"
      ? "Today"
      : filters.day === "yesterday"
        ? "Yesterday"
        : "Selected day";

  return (
    <div className="space-y-6">
      <NoticeInbox notices={notices} dismissAction={dismissNoticeAction} />
      {rollCall && <RollCall data={rollCall} />}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-blue-700">
            Team activity
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            {dayLabel} · {formatEtDateLong(filters.date)} — start-of-day and
            end-of-day reports, all times in ET.
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
              title="No entries for this day"
              body={
                filtersActive
                  ? "No entries match your current filters on this day. Try another day or clear the filters."
                  : `No start-of-day or end-of-day reports for ${formatEtDateLong(filters.date)} yet. Try Today, Yesterday, or pick another day.`
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
                <DashboardEntryCard
                  key={entry.id}
                  entry={entry}
                  canDelete={canDelete}
                  viewerId={session.userId}
                />
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
