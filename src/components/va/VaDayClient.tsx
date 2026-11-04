"use client";

import { useState } from "react";
import type { ActiveGamePromo } from "@/lib/leaderboards/registry";
import Link from "next/link";
import type { VaDayState, EntryDTO } from "@/lib/timeEntries";
import type { NoticeDTO } from "@/lib/notices";
import type { PlanDayDTO } from "@/lib/plans";
import { NoticeInbox } from "@/components/NoticeInbox";
import { UrgentBanner } from "@/components/UrgentBanner";
import { StatusBadge } from "@/components/Badges";
import { StartDayModal } from "./StartDayModal";
import { EndDayModal } from "./EndDayModal";
import { ResolveStaleModal } from "./ResolveStaleModal";
import { PtoModal } from "./PtoModal";
import { WeekPlanModal } from "./WeekPlanModal";
import { AdminFeedback } from "./AdminFeedback";
import { EditableTask } from "./EditableTask";

export function VaDayClient({
  firstName,
  state,
  weekPlan,
  notices,
  game,
  dismissNoticeAction,
}: {
  firstName: string;
  state: VaDayState;
  /** Mon–Fri planner days (this week, or next week on a weekend). */
  weekPlan: PlanDayDTO[];
  notices: NoticeDTO[];
  /** This month's rotating game, resolved from GAME_ROTATION; null while games are off. */
  game: ActiveGamePromo | null;
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

  const [modal, setModal] = useState<"start" | "end" | "pto" | "plan" | null>(null);
  const [resolveEntry, setResolveEntry] = useState<EntryDTO | null>(null);
  const [dismissedStale, setDismissedStale] = useState(false);

  const gateStart =
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
      </div>

      {/* Sales Desk notices addressed to this VA */}
      <NoticeInbox notices={notices} dismissAction={dismissNoticeAction} />

      {/* Earlier days with a Start of Day but no End-of-Day report */}
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
                Missing End-of-Day report{state.stale.length > 1 ? "s" : ""}
              </h2>
              <p className="text-sm text-brand-orange-900/80">
                You sent a Start of Day but no End of Day. Add the report so
                your admins can see what you worked on.
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
                </div>
                <button
                  type="button"
                  className="btn-action px-4 text-sm sm:min-h-[40px]"
                  onClick={() => setResolveEntry(entry)}
                >
                  Add End of Day
                </button>
              </li>
            ))}
          </ul>

          {gateStart && (
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
        <ActiveSessionCard entry={active} onEndDay={() => setModal("end")} />
      ) : ptoToday ? (
        <PtoDayCard entry={ptoToday} />
      ) : completed ? (
        <CompletedCard entry={completed} />
      ) : gateStart ? (
        <div className="card p-6 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            Add the missing End-of-Day report above before starting a new day.
          </p>
        </div>
      ) : (
        <StartDayCard
          planned={!!state.todayPlan}
          onStart={() => setModal("start")}
        />
      )}

      {/* Secondary actions, always available */}
      <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => setModal("plan")}
          className="btn-ghost"
        >
          <span aria-hidden>🗓️</span>
          Plan my week
        </button>
        <button
          type="button"
          onClick={() => setModal("pto")}
          className="btn-ghost"
        >
          <span aria-hidden>🌴</span>
          Log PTO / Vacation day
        </button>
      </div>

      {/* This month's rotating game lives on the Games page, alongside the
          Reigning Champion spotlight and the monthly leaderboard. Hidden while
          GAMES_ENABLED (lib/features.ts) is false. */}
      {game && (
        <Link
          href="/va/games"
          className="card flex items-center gap-3 px-4 py-3 transition-shadow hover:shadow-card-hover sm:px-5"
        >
          <span className="text-2xl" aria-hidden>
            {game.icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-heading text-sm font-bold text-brand-blue-700">
              {game.name} — this month’s game
            </span>
            <span className="block text-xs text-[var(--text-muted)]">
              {game.tagline} See the leaderboard &amp; reigning champion.
            </span>
          </span>
          <svg
            className="h-5 w-5 shrink-0 text-brand-orange-500"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <path
              d="m9 18 6-6-6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      )}

      {/* Daily Flappy is hidden — the rotating game on /va/games is the one in
          play. The component (components/va/FlappyGame.tsx), its lib
          (lib/game.ts) and its GameScore rows are all still here: the monthly
          Flappy resolver keeps powering the Reigning Champion box for months
          when Flappy was the rotating game. To bring it back, re-fetch
          getGameState in app/va/page.tsx and render <FlappyGame> here. */}

      {/* Modals — mounted only while open so their form/action state resets. */}
      {modal === "start" && (
        <StartDayModal
          open
          onClose={() => setModal(null)}
          plannedTasks={state.todayPlan}
        />
      )}
      {modal === "end" && active && (
        <EndDayModal open onClose={() => setModal(null)} entryId={active.id} />
      )}
      {modal === "plan" && (
        <WeekPlanModal open onClose={() => setModal(null)} days={weekPlan} />
      )}
      {resolveEntry && (
        <ResolveStaleModal
          open={!!resolveEntry}
          onClose={() => setResolveEntry(null)}
          entry={resolveEntry}
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
      </div>
      <div className="space-y-4 p-5 sm:p-6">
        <p className="text-sm text-[var(--text-muted)]">
          You’re off today — enjoy your time off. Your admins see this day as
          PTO, so no reports are needed.
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

function StartDayCard({
  planned,
  onStart,
}: {
  planned: boolean;
  onStart: () => void;
}) {
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
        onClick={onStart}
        className="btn-action btn-lg mx-auto w-full max-w-xs text-lg"
      >
        <ListIcon />
        Start of Day
      </button>
      <p className="mt-4 text-xs text-[var(--text-muted)]">
        {planned
          ? "Today’s tasks are ready from your weekly plan — just review and submit."
          : "Tip: use “Plan my week” to write the whole week’s tasks once."}
      </p>
    </section>
  );
}

function ActiveSessionCard({
  entry,
  onEndDay,
}: {
  entry: EntryDTO;
  onEndDay: () => void;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-brand-blue-50/50 px-5 py-3 sm:px-6">
        <span className="font-heading text-sm font-semibold text-brand-blue-700">
          Start of Day sent
        </span>
        <StatusBadge status="OPEN" />
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        <EditableTask
          entryId={entry.id}
          field="START"
          label="Start-of-day tasks"
          text={entry.startOfDayTasks}
          placeholder="What do you plan to work on today?"
        />

        {entry.hasUrgent && entry.urgentNeed && (
          <UrgentBanner text={entry.urgentNeed} />
        )}

        <button
          type="button"
          onClick={onEndDay}
          className="btn-action btn-lg w-full text-lg"
        >
          <ListIcon />
          End of Day
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
              Scheduled — your End-of-Day report reaches your admins at{" "}
              <span className="font-semibold">{entry.publishAtLabel} ET</span>.
            </span>
          </p>
        )}
        {entry.hasUrgent && entry.urgentNeed && (
          <UrgentBanner text={entry.urgentNeed} />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <EditableTask
            entryId={entry.id}
            field="START"
            label="Start-of-day"
            text={entry.startOfDayTasks}
            placeholder="What did you plan to work on today?"
          />
          <EditableTask
            entryId={entry.id}
            field="END"
            label="End of Day Report"
            text={entry.endOfDayTasks}
            placeholder="What did you accomplish today? Include any notes or blockers."
          />
        </div>
      </div>
    </section>
  );
}

function ListIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
