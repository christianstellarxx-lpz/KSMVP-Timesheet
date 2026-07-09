import type { DashboardEntry } from "@/lib/dashboard";
import { UrgentBanner } from "@/components/UrgentBanner";
import { StatusBadge, PunctualityChips } from "@/components/Badges";
import { EntryComments } from "./EntryComments";
import { DeleteButton } from "./DeleteButton";
import { deleteEntryAction } from "@/app/client/actions";

export function DashboardEntryCard({
  entry,
  canDelete,
  viewerId,
}: {
  entry: DashboardEntry;
  canDelete: boolean;
  viewerId: string;
}) {
  if (entry.entryType === "PTO")
    return <PtoRow entry={entry} canDelete={canDelete} />;

  const urgent = entry.hasUrgent;
  return (
    <article
      className={`card overflow-hidden transition-shadow hover:shadow-card-hover ${
        urgent ? "ring-2 ring-brand-orange-300" : ""
      }`}
    >
      {/* Header */}
      <header
        className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-3 sm:px-5 ${
          urgent
            ? "border-brand-orange-200 bg-brand-orange-50/60"
            : "border-[var(--border)] bg-[var(--surface-muted)]/60"
        }`}
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-blue-600 text-xs font-heading font-bold text-white"
          >
            {initials(entry.vaName)}
          </span>
          <div>
            <p className="font-heading text-sm font-bold text-[var(--text)]">
              {entry.vaName}
            </p>
            <p className="text-xs font-heading font-bold text-[var(--text)]">
              {entry.workDateLabel}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {urgent && (
            <span className="chip bg-brand-orange-500 text-white">
              <WarnDot /> Urgent
            </span>
          )}
          <PunctualityChips chips={entry.chips} />
          <StatusBadge status={entry.status} />
          {canDelete && (
            <DeleteButton
              action={deleteEntryAction}
              fields={{ entryId: entry.id }}
              label="Delete this entry"
              confirmText={`Delete ${entry.vaName}'s entry for ${entry.workDateLabel}? This can't be undone.`}
            />
          )}
        </div>
      </header>

      <div className="space-y-4 p-4 sm:p-5">
        {/* Times */}
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <Stat label="Time in" value={entry.timeInLabel ?? "—"} />
          <Stat
            label="Time out"
            value={
              entry.timeOutLabel ??
              (entry.status === "INCOMPLETE" ? "Not recorded" : "—")
            }
            muted={!entry.timeOutLabel}
          />
          <Stat
            label="Hours worked"
            value={entry.hoursWorked != null ? String(entry.hoursWorked) : "—"}
            accent={entry.hoursWorked != null}
          />
        </div>

        {/* Urgent — prominent, only when filled */}
        {urgent && entry.urgentNeed && <UrgentBanner text={entry.urgentNeed} />}

        {/* Side-by-side tasks (stack on mobile) */}
        <div className="grid gap-4 sm:grid-cols-2">
          <TaskColumn
            title="Start-of-day tasks"
            text={entry.startOfDayTasks}
          />
          {entry.endOfDayScheduled ? (
            <ScheduledColumn publishLabel={entry.endOfDayPublishLabel} />
          ) : (
            <TaskColumn
              title="End of Day Report"
              text={entry.endOfDayTasks}
              emptyLabel={
                entry.status === "INCOMPLETE"
                  ? "No time-out logged — awaiting the VA’s end-of-day report."
                  : entry.status === "OPEN"
                    ? "Still in progress."
                    : "—"
              }
            />
          )}
        </div>

        {/* Admin feedback thread + add-comment form */}
        <EntryComments
          entryId={entry.id}
          comments={entry.comments}
          vaName={entry.vaName}
          canDelete={canDelete}
          viewerId={viewerId}
        />
      </div>
    </article>
  );
}

function PtoRow({
  entry,
  canDelete,
}: {
  entry: DashboardEntry;
  canDelete: boolean;
}) {
  const note = entry.startOfDayTasks?.trim();
  const hasNote = !!note && note !== "Paid time off / Vacation";
  return (
    <article className="card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-brand-yellow-200 bg-brand-yellow-50 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-blue-600 text-xs font-heading font-bold text-white"
          >
            {initials(entry.vaName)}
          </span>
          <div>
            <p className="font-heading text-sm font-bold text-[var(--text)]">
              {entry.vaName}
            </p>
            <p className="text-xs font-heading font-bold text-[var(--text)]">
              {entry.workDateLabel}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip bg-brand-yellow-400 text-brand-blue-900">
            🌴 PTO / Vacation
          </span>
          <span className="chip bg-brand-blue-50 text-brand-blue-700">
            8 hours
          </span>
          {canDelete && (
            <DeleteButton
              action={deleteEntryAction}
              fields={{ entryId: entry.id }}
              label="Delete this entry"
              confirmText={`Delete ${entry.vaName}'s PTO for ${entry.workDateLabel}? This can't be undone.`}
            />
          )}
        </div>
      </header>
      <div className="px-4 py-4 sm:px-5">
        <p className="text-sm text-[var(--text-muted)]">
          {hasNote ? (
            <>
              <span className="font-heading font-semibold text-[var(--text)]">
                Note:{" "}
              </span>
              {note}
            </>
          ) : (
            "Paid time off — counted as a full 8-hour day."
          )}
        </p>
      </div>
    </article>
  );
}

function ScheduledColumn({ publishLabel }: { publishLabel: string | null }) {
  return (
    <div>
      <p className="field-label">End of Day Report</p>
      <p className="flex min-h-[3rem] items-center gap-2 rounded-lg border border-dashed border-brand-blue-300 bg-brand-blue-50 px-3 py-2.5 text-sm font-medium text-brand-blue-800">
        <svg
          className="h-4 w-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
          <path
            d="M12 7v5l3 2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Scheduled — visible at {publishLabel ?? "5:00 PM"} ET.
      </p>
    </div>
  );
}

function TaskColumn({
  title,
  text,
  emptyLabel = "—",
}: {
  title: string;
  text: string | null;
  emptyLabel?: string;
}) {
  const value = text?.trim();
  return (
    <div>
      <p className="field-label">{title}</p>
      <p
        className={`min-h-[3rem] whitespace-pre-wrap break-words rounded-lg bg-[var(--surface-muted)] px-3 py-2.5 text-sm ${
          value ? "text-[var(--text)]" : "italic text-[var(--text-muted)]"
        }`}
      >
        {value || emptyLabel}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  accent = false,
  muted = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <div>
      <p className="field-label mb-0">{label}</p>
      <p
        className={`font-heading text-xl font-bold ${
          accent
            ? "text-brand-blue-600"
            : muted
              ? "text-[var(--text-muted)]"
              : "text-[var(--text)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function WarnDot() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
