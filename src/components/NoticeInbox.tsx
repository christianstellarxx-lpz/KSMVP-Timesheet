"use client";

import { useFormStatus } from "react-dom";
import type { NoticeDTO } from "@/lib/notices";

/**
 * Sales Desk notices addressed to the signed-in user, shown at the top of their
 * dashboard (VA or admin). Each can be dismissed, which marks it read server-side.
 */
export function NoticeInbox({
  notices,
  dismissAction,
}: {
  notices: NoticeDTO[];
  dismissAction: (formData: FormData) => void | Promise<void>;
}) {
  if (notices.length === 0) return null;

  return (
    <section aria-label="Messages" className="space-y-3">
      {notices.map((n) => (
        <NoticeCard key={n.id} notice={n} dismissAction={dismissAction} />
      ))}
    </section>
  );
}

function NoticeCard({
  notice,
  dismissAction,
}: {
  notice: NoticeDTO;
  dismissAction: (formData: FormData) => void | Promise<void>;
}) {
  const tech = notice.channel === "TECH_SUPPORT";
  return (
    <article
      className={`card p-4 sm:p-5 ${
        tech ? "ring-1 ring-brand-blue-200" : "ring-1 ring-brand-orange-200"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-white ${
            tech ? "bg-brand-blue-600" : "bg-brand-orange-500"
          }`}
        >
          {tech ? <WrenchIcon /> : <ChatIcon />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip bg-brand-yellow-400 text-brand-blue-900">
              New message
            </span>
            <span className="font-heading text-sm font-bold text-[var(--text)]">
              {notice.channelLabel}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            From {notice.senderName} · {notice.createdAtLabel}
          </p>
          <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-[var(--surface-muted)] px-3 py-2.5 text-sm text-[var(--text)]">
            {notice.body}
          </p>
        </div>

        <form action={dismissAction} className="shrink-0">
          <input type="hidden" name="noticeId" value={notice.id} />
          <DismissButton />
        </form>
      </div>
    </article>
  );
}

function DismissButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      aria-label="Dismiss message"
      title="Dismiss"
      className="inline-grid h-8 w-8 place-items-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text)] disabled:opacity-50"
    >
      {pending ? (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4z" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M6 6l12 12M18 6 6 18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}

function WrenchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14.7 6.3a4 4 0 0 0-5.4 5.2L4 16.8 7.2 20l5.3-5.3a4 4 0 0 0 5.2-5.4l-2.4 2.4-2.3-.6-.6-2.3 2.3-2.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
