"use client";

import { useActionState, useState } from "react";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { sendSalesNoticeAction } from "@/app/sales/actions";
import { emptyFormState } from "@/lib/formState";
import type { SalesGroup } from "@/lib/sales";

export function SalesDeskClient({
  firstName,
  groups,
}: {
  firstName: string;
  groups: SalesGroup[];
}) {
  const [active, setActive] = useState<SalesGroup | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-blue-700">
          Hi {firstName} 👋
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          Sales Desk — send a note to the right team in one tap. It shows up on
          their dashboard right away.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {groups.map((g) => (
          <button
            key={g.channel}
            type="button"
            onClick={() => setActive(g)}
            className={`card flex flex-col gap-3 p-5 text-left transition-shadow hover:shadow-card-hover ${
              g.key === "tech"
                ? "ring-1 ring-brand-blue-200"
                : "ring-1 ring-brand-orange-200"
            }`}
          >
            <span
              aria-hidden
              className={`grid h-11 w-11 place-items-center rounded-full text-white ${
                g.key === "tech" ? "bg-brand-blue-600" : "bg-brand-orange-500"
              }`}
            >
              {g.key === "tech" ? <WrenchIcon /> : <ChatIcon />}
            </span>
            <span>
              <span className="block font-heading text-lg font-bold text-[var(--text)]">
                {g.label}
              </span>
              <span className="mt-0.5 block text-sm text-[var(--text-muted)]">
                {g.description}
              </span>
            </span>
            <span className="mt-1 text-xs font-medium text-[var(--text-muted)]">
              Notifies {joinNames(g.names)}
            </span>
          </button>
        ))}
      </div>

      {active && (
        <NoticeModal group={active} onClose={() => setActive(null)} />
      )}
    </div>
  );
}

function NoticeModal({
  group,
  onClose,
}: {
  group: SalesGroup;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState(
    sendSalesNoticeAction,
    emptyFormState,
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={group.label}
      description={
        state.ok
          ? undefined
          : `Your note shows up on ${joinNames(group.names)}'s dashboard.`
      }
    >
      {state.ok ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckIcon />
          </div>
          <div>
            <p className="font-heading text-base font-bold text-[var(--text)]">
              Sent to {joinNames(group.names)}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              They’ll see it on their dashboard the next time they open it.
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-primary w-full">
            Done
          </button>
        </div>
      ) : (
        <form action={formAction} className="space-y-4" noValidate>
          <input type="hidden" name="channel" value={group.channel} />
          <div>
            <label htmlFor="sales-message" className="field-label">
              Your message <span className="text-brand-orange-600">*</span>
            </label>
            <textarea
              id="sales-message"
              name="body"
              rows={5}
              autoFocus
              required
              maxLength={2000}
              placeholder={group.placeholder}
              className="field-input resize-y"
              aria-invalid={!!state.fieldErrors?.body}
            />
            {state.fieldErrors?.body && (
              <p className="field-error">{state.fieldErrors.body}</p>
            )}
          </div>
          {state.error && (
            <p
              role="alert"
              className="rounded-lg border border-brand-orange-200 bg-brand-orange-50 px-3 py-2 text-sm font-medium text-brand-orange-800"
            >
              {state.error}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <SubmitButton
              className="btn-action px-5"
              pendingLabel="Sending…"
            >
              <SendIcon />
              Send to {joinNames(group.names)}
            </SubmitButton>
            <button type="button" onClick={onClose} className="btn-ghost px-5">
              Cancel
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function WrenchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
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
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
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

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="m20 6-11 11-5-5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
