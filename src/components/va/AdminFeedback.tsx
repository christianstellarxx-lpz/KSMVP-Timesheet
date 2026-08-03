"use client";

import { useState } from "react";
import { acknowledgeCommentsAction } from "@/app/va/actions";
import type { FeedbackEntryDTO } from "@/lib/timeEntries";

export function AdminFeedback({
  feedback,
  unreadCommentCount,
}: {
  feedback: FeedbackEntryDTO[];
  unreadCommentCount: number;
}) {
  // This panel only ever renders when there is UNREAD feedback — getVaDayState
  // filters to it — so the box is a notification, not a history view.
  //
  // "Done" marks the comments read, which is what makes the dismissal stick:
  // the next load finds nothing unread and the panel stays gone until an admin
  // writes something new. `dismissed` just hides it instantly so the VA doesn't
  // wait on the round trip. Nothing is deleted.
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState("");

  const markDone = async () => {
    setBusy(true);
    setError("");
    try {
      await acknowledgeCommentsAction();
      setDismissed(true);
    } catch {
      // Keep the panel up — a silent failure would look dismissed but come
      // straight back on refresh, which is the bug this button had.
      setError("Couldn’t clear that — please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (feedback.length === 0 || dismissed) return null;

  const hasNew = unreadCommentCount > 0;

  return (
    <section
      className={`card overflow-hidden ${
        hasNew ? "ring-2 ring-brand-blue-300" : ""
      }`}
      aria-label="Feedback from your admin"
    >
      <header
        className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-4 py-3 sm:px-5 ${
          hasNew
            ? "border-brand-blue-200 bg-brand-blue-50/70"
            : "border-[var(--border)] bg-[var(--surface-muted)]/60"
        }`}
      >
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-blue-600 text-white"
          >
            <ChatIcon />
          </span>
          <div>
            <h2 className="font-heading text-base font-bold text-brand-blue-700">
              Feedback from your admin
            </h2>
            <p className="text-xs font-medium text-brand-blue-700">
              You have {unreadCommentCount} new comment
              {unreadCommentCount === 1 ? "" : "s"}.
            </p>
            {error && (
              <p className="mt-0.5 text-xs font-semibold text-brand-orange-700">
                {error}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasNew && (
            <span className="chip bg-brand-orange-500 text-white">
              {unreadCommentCount} new
            </span>
          )}
          {/* Marks the feedback read — that is what keeps it from coming back. */}
          <button
            type="button"
            onClick={markDone}
            disabled={busy}
            className="btn-primary min-h-[36px] px-4 text-xs"
          >
            {busy ? "Clearing…" : "Done"}
          </button>
        </div>
      </header>

      <div className="divide-y divide-[var(--border)]">
        {feedback.map((entry) => (
          <div key={entry.entryId} className="px-4 py-3 sm:px-5">
            <p className="mb-2 font-heading text-xs font-bold text-[var(--text)]">
              {entry.workDateLabel}
            </p>
            <ul className="space-y-2">
              {entry.comments.map((c) => (
                <li
                  key={c.id}
                  className={`rounded-lg border px-3 py-2.5 ${
                    c.unread
                      ? "border-brand-blue-200 bg-brand-blue-50/60"
                      : "border-[var(--border)] bg-[var(--surface-muted)]/50"
                  }`}
                >
                  <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {c.unread && (
                      <span className="chip bg-brand-orange-500 text-white">
                        New
                      </span>
                    )}
                    <span className="chip bg-brand-blue-50 text-brand-blue-700">
                      {c.targetLabel}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">
                      {c.authorName} · {c.createdAtLabel}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm text-[var(--text)]">
                    {c.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8A8.38 8.38 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
