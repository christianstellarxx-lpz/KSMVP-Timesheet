import type { RollCallData, RollRow, RollState } from "@/lib/rollcall";
import { RollCallActions } from "./RollCallActions";

/**
 * The daily reporter's unique dashboard panel: today's clock-in/out status for
 * every VA, a readiness indicator, and one-click email/copy of the summary that
 * goes to the admins.
 */
export function RollCall({ data }: { data: RollCallData }) {
  return (
    <section className="card overflow-hidden ring-2 ring-brand-yellow-300">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-brand-yellow-200 bg-brand-yellow-50 px-4 py-3 sm:px-6">
        <div>
          <h2 className="font-heading text-base font-bold text-brand-blue-700">
            🗒️ Daily Roll Call
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            {data.dateLabel} · today’s clock-in / clock-out status
          </p>
        </div>
        <ReadyBadge ready={data.endReady} pending={data.counts.in + data.counts.incomplete} />
      </header>

      <div className="space-y-5 p-4 sm:p-6">
        {/* Counts */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Count label="Clocked out" value={data.counts.out} tone="emerald" />
          <Count label="Clocked in" value={data.counts.in} tone="blue" />
          <Count label="PTO" value={data.counts.pto} tone="yellow" />
          <Count label="Needs review" value={data.counts.incomplete} tone="orange" />
          <Count label="Not started" value={data.counts.none} tone="muted" />
        </div>

        {/* Per-VA status */}
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {data.rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="font-heading text-sm font-semibold text-[var(--text)]">
                  {r.name}
                </p>
                <p className="truncate text-xs text-[var(--text-muted)]">
                  {r.title}
                </p>
              </div>
              <StatusChip row={r} />
            </li>
          ))}
        </ul>

        {/* Email actions — open Gmail (new tab) with the right report */}
        <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-start sm:justify-between">
          <p className="max-w-xs text-xs text-[var(--text-muted)]">
            Opens Gmail in a new tab, pre-filled.{" "}
            {data.endReady
              ? "Everyone’s clocked out — send the End-of-Day report."
              : data.startReady
                ? "Everyone’s clocked in — send the Start-of-Day report."
                : "Send the Start-of-Day report once everyone’s clocked in."}{" "}
            Recipients: {data.adminEmails.join(", ")}
          </p>
          <RollCallActions
            start={data.start}
            end={data.end}
            startReady={data.startReady}
            endReady={data.endReady}
          />
        </div>
      </div>
    </section>
  );
}

function ReadyBadge({ ready, pending }: { ready: boolean; pending: number }) {
  return ready ? (
    <span className="chip bg-emerald-100 text-emerald-800">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
      Ready to send
    </span>
  ) : (
    <span className="chip bg-brand-orange-100 text-brand-orange-800">
      <span className="h-1.5 w-1.5 rounded-full bg-brand-orange-500" aria-hidden />
      {pending} still pending
    </span>
  );
}

function Count({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "blue" | "yellow" | "orange" | "muted";
}) {
  const cls = {
    emerald: "text-emerald-700",
    blue: "text-brand-blue-600",
    yellow: "text-brand-yellow-600",
    orange: "text-brand-orange-600",
    muted: "text-[var(--text-muted)]",
  }[tone];
  return (
    <div className="rounded-lg bg-[var(--surface-muted)] px-3 py-2 text-center">
      <p className={`font-heading text-2xl font-bold tabular-nums ${cls}`}>
        {value}
      </p>
      <p className="text-[11px] font-medium text-[var(--text-muted)]">{label}</p>
    </div>
  );
}

const STATE_META: Record<RollState, { label: string; cls: string }> = {
  OUT: { label: "Clocked out", cls: "bg-emerald-50 text-emerald-700" },
  IN: { label: "Clocked in", cls: "bg-brand-blue-50 text-brand-blue-700" },
  PTO: { label: "PTO", cls: "bg-brand-yellow-100 text-brand-yellow-800" },
  INCOMPLETE: {
    label: "No clock-out",
    cls: "bg-brand-orange-100 text-brand-orange-800",
  },
  NONE: { label: "Not started", cls: "bg-[var(--surface-muted)] text-[var(--text-muted)]" },
};

function StatusChip({ row }: { row: RollRow }) {
  const meta = STATE_META[row.state];
  const detail =
    row.state === "OUT"
      ? `${row.timeInLabel}–${row.timeOutLabel} · ${row.hoursWorked ?? 0}h`
      : row.state === "IN" || row.state === "INCOMPLETE"
        ? `in ${row.timeInLabel}`
        : null;
  return (
    <div className="flex items-center gap-2">
      {detail && (
        <span className="text-xs tabular-nums text-[var(--text-muted)]">
          {detail}
        </span>
      )}
      <span className={`chip ${meta.cls}`}>{meta.label}</span>
    </div>
  );
}
