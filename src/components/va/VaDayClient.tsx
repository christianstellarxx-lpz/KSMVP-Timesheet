"use client";

import { useState } from "react";
import type { VaDayState, EntryDTO } from "@/lib/timeEntries";
import type { GameState } from "@/lib/game";
import type { NoticeDTO } from "@/lib/notices";
import { NoticeInbox } from "@/components/NoticeInbox";
import { UrgentBanner } from "@/components/UrgentBanner";
import { StatusBadge } from "@/components/Badges";
import { LiveClock } from "./LiveClock";
import { TimeInModal } from "./TimeInModal";
import { TimeOutModal } from "./TimeOutModal";
import { ResolveStaleModal } from "./ResolveStaleModal";
import { PtoModal } from "./PtoModal";
import { AdminFeedback } from "./AdminFeedback";
import { FlappyGame } from "./FlappyGame";
import { presetWallClock, SCHEDULE, SCHEDULE_SHIFT_LABEL } from "@/lib/time";

export function VaDayClient({
  firstName,
  state,
  game,
  meId,
  notices,
  dismissNoticeAction,
}: {
  firstName: string;
  state: VaDayState;
  game: GameState;
  meId: string;
  notices: NoticeDTO[];
  dismissNoticeAction: (formData: FormData) => void | Promise<void>;
}) {
  const active =
    state.todayEntry?.status === "OPEN" ? state.todayEntry : null;
  const ptoToday =
    state.todayEntry?.entryType === "PTO" ? state.todayEntry : null;
  const completed =
    state.todayEntry?.status === "CLOSED" && state.todayEntry.entryType === "WORK"
      ? state.todayEntry
      : null;

  const [modal, setModal] = useState<"in" | "out" | "pto" | null>(null);
  const [resolveEntry, setResolveEntry] = useState<EntryDTO | null>(null);
  const [dismissedStale, setDismissedStale] = useState(false);

  const gateTimeIn =
    state.stale.length > 0 && !dismissedStale && !state.todayEntry;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-blue-700">
            Hi {firstName} 👋
          </h1>
          <p className="text-sm text-[var(--text-muted)]">{state.todayLabel}</p>
        </div>
        <LiveClock />
      </div>

      {/* Sales Desk notices addressed to this VA */}
      <NoticeInbox notices={notices} dismissAction={dismissNoticeAction} />

      {/* Stale / forgotten sessions */}
      {state.stale.length > 0 && (
        <section className="card border-brand-orange-200 bg-brand-orange-50/40 p-4 sm:p-5">
          <div className="mb-3 flex items-start gap-2.5">
            <svg
              className="mt-0.5 h-5 w-5 shrink-0 text-brand-orange-600"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <path
                d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div>
              <h2 className="font-heading text-base font-bold text-brand-orange-800">
                Unfinished session{state.stale.length > 1 ? "s" : ""}
              </h2>
              <p className="text-sm text-brand-orange-900/80">
                You clocked in but never clocked out. Set your finish time so
                your hours are counted correctly.
              </p>
            </div>
          </div>

          <ul className="space-y-2">
            {state.stale.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-col gap-2 rounded-lg border border-brand-orange-200 bg-white px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="text-sm">
                  <span className="font-heading font-semibold text-[var(--text)]">
                    {entry.workDateLabel}
                  </span>
                  <span className="text-[var(--text-muted)]">
                    {" "}
                    · in at {entry.timeInLabel} ET
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-action px-4 text-sm sm:min-h-[40px]"
                  onClick={() => setResolveEntry(entry)}
                >
                  Set time out
                </button>
              </li>
            ))}
          </ul>

          {gateTimeIn && (
            <button
              type="button"
              onClick={() => setDismissedStale(true)}
              className="mt-3 text-sm font-heading font-medium text-brand-blue-700 underline underline-offset-2 hover:text-brand-blue-800"
            >
              I can’t recall — leave for client review & start today
            </button>
          )}
        </section>
      )}

      {/* Feedback from the admin (with new-comment notification) */}
      <AdminFeedback
        feedback={state.feedback}
        unreadCommentCount={state.unreadCommentCount}
      />

      {/* Primary action zone */}
      {active ? (
        <ActiveSessionCard entry={active} onTimeOut={() => setModal("out")} />
      ) : ptoToday ? (
        <PtoDayCard entry={ptoToday} />
      ) : completed ? (
        <CompletedCard entry={completed} />
      ) : gateTimeIn ? (
        <div className="card p-6 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            Close your unfinished session above before starting a new day.
          </p>
        </div>
      ) : (
        <TimeInCard onTimeIn={() => setModal("in")} />
      )}

      {/* Secondary action: PTO / vacation, always available */}
      <div className="text-center">
        <button
          type="button"
          onClick={() => setModal("pto")}
          className="btn-ghost mx-auto"
        >
          <span aria-hidden>🌴</span>
          Log PTO / Vacation day
        </button>
      </div>

      {/* Daily Flappy Bird game — unlocks once clocked in, one play a day.
          The key remounts it when clock-in / played status changes (e.g. right
          after Time In) so it re-reads the fresh availability from the server. */}
      <FlappyGame
        key={`${game.clockedInToday}-${game.hasPlayedToday}`}
        game={game}
        meId={meId}
      />

      {/* Modals — mounted only while open so their form/action state resets. */}
      {modal === "in" && (
        <TimeInModal
          open
          onClose={() => setModal(null)}
          presetWallClock={state.presets.timeInWallClock}
        />
      )}
      {modal === "out" && active && (
        <TimeOutModal
          open
          onClose={() => setModal(null)}
          presetWallClock={state.presets.timeOutWallClock}
          timeInLabel={active.timeInLabel}
        />
      )}
      {resolveEntry && (
        <ResolveStaleModal
          open={!!resolveEntry}
          onClose={() => setResolveEntry(null)}
          entry={resolveEntry}
          presetWallClock={presetWallClock(resolveEntry.workDate, SCHEDULE.timeOut)}
        />
      )}
      {modal === "pto" && (
        <PtoModal
          open
          onClose={() => setModal(null)}
          defaultDate={state.today}
        />
      )}
    </div>
  );
}

function PtoDayCard({ entry }: { entry: EntryDTO }) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-brand-yellow-50 px-5 py-3 sm:px-6">
        <span className="font-heading text-sm font-semibold text-brand-blue-700">
          🌴 PTO / Vacation day
        </span>
        <span className="chip bg-brand-yellow-400 text-brand-blue-900">
          8 hours
        </span>
      </div>
      <div className="space-y-4 p-5 sm:p-6">
        <p className="text-sm text-[var(--text-muted)]">
          You’re logged off today — enjoy your time off. This day counts as{" "}
          <span className="font-heading font-bold text-[var(--text)]">
            8 hours
          </span>{" "}
          of PTO on your client’s dashboard.
        </p>
        {entry.startOfDayTasks?.trim() &&
          entry.startOfDayTasks.trim() !== "Paid time off / Vacation" && (
            <div>
              <p className="field-label">Note</p>
              <p className="whitespace-pre-wrap break-words rounded-lg bg-[var(--surface-muted)] px-3 py-2.5 text-sm text-[var(--text)]">
                {entry.startOfDayTasks}
              </p>
            </div>
          )}
      </div>
    </section>
  );
}

function TimeInCard({ onTimeIn }: { onTimeIn: () => void }) {
  return (
    <section className="card p-6 text-center sm:p-10">
      <p className="mb-1 font-heading text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        Ready when you are
      </p>
      <h2 className="mb-6 text-xl font-bold text-brand-blue-700">
        Start your workday
      </h2>
      <button
        type="button"
        onClick={onTimeIn}
        className="btn-action btn-lg mx-auto w-full max-w-xs text-lg"
      >
        <ClockIcon />
        Time In
      </button>
      <p className="mt-4 text-xs text-[var(--text-muted)]">
        Scheduled shift: {SCHEDULE_SHIFT_LABEL}
      </p>
    </section>
  );
}

function ActiveSessionCard({
  entry,
  onTimeOut,
}: {
  entry: EntryDTO;
  onTimeOut: () => void;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-brand-blue-50/50 px-5 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <span className="font-heading text-sm font-semibold text-brand-blue-700">
            Clocked in
          </span>
        </div>
        <StatusBadge status="OPEN" />
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        <div>
          <p className="field-label mb-0">Time in</p>
          <p className="font-heading text-2xl font-bold text-[var(--text)]">
            {entry.timeInLabel}{" "}
            <span className="text-sm font-semibold text-[var(--text-muted)]">
              ET
            </span>
          </p>
        </div>

        <div>
          <p className="field-label">Start-of-day tasks</p>
          <p className="whitespace-pre-wrap break-words rounded-lg bg-[var(--surface-muted)] px-3 py-2.5 text-sm text-[var(--text)]">
            {entry.startOfDayTasks}
          </p>
        </div>

        {entry.hasUrgent && entry.urgentNeed && (
          <UrgentBanner text={entry.urgentNeed} />
        )}

        <button
          type="button"
          onClick={onTimeOut}
          className="btn-action btn-lg w-full text-lg"
        >
          <ClockIcon />
          Time Out
        </button>
      </div>
    </section>
  );
}

function CompletedCard({ entry }: { entry: EntryDTO }) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-emerald-50/60 px-5 py-3 sm:px-6">
        <span className="font-heading text-sm font-semibold text-emerald-700">
          Day complete — nicely done!
        </span>
        <StatusBadge status="CLOSED" />
      </div>
      <div className="space-y-5 p-5 sm:p-6">
        {entry.isScheduled && entry.publishAtLabel && (
          <p className="flex items-start gap-2 rounded-lg border border-brand-blue-200 bg-brand-blue-50 px-3 py-2.5 text-sm text-brand-blue-800">
            <svg
              className="mt-0.5 h-4 w-4 shrink-0"
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
            <span>
              Scheduled — your End-of-Day report reaches your client at{" "}
              <span className="font-semibold">{entry.publishAtLabel} ET</span>.
            </span>
          </p>
        )}
        <div className="flex flex-wrap gap-x-10 gap-y-3">
          <TimeStat label="Time in" value={`${entry.timeInLabel} ET`} />
          <TimeStat label="Time out" value={`${entry.timeOutLabel} ET`} />
          <TimeStat
            label="Hours worked"
            value={entry.hoursWorked != null ? String(entry.hoursWorked) : "—"}
            accent
          />
        </div>
        {entry.hasUrgent && entry.urgentNeed && (
          <UrgentBanner text={entry.urgentNeed} />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <TaskBlock title="Start-of-day" text={entry.startOfDayTasks} />
          <TaskBlock
            title="End of Day Report"
            text={entry.endOfDayTasks?.trim() || "—"}
          />
        </div>
      </div>
    </section>
  );
}

function TimeStat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="field-label mb-0">{label}</p>
      <p
        className={`font-heading text-2xl font-bold ${
          accent ? "text-brand-blue-600" : "text-[var(--text)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function TaskBlock({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <p className="field-label">{title}</p>
      <p className="whitespace-pre-wrap break-words rounded-lg bg-[var(--surface-muted)] px-3 py-2.5 text-sm text-[var(--text)]">
        {text}
      </p>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 7v5l3 2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
