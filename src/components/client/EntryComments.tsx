"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addCommentAction } from "@/app/client/actions";
import { emptyFormState } from "@/lib/formState";
import type { CommentDTO } from "@/lib/comments";
import { SubmitButton } from "@/components/SubmitButton";

const TARGET_OPTIONS = [
  { value: "END", label: "End of Day Report" },
  { value: "START", label: "Start-of-day tasks" },
  { value: "GENERAL", label: "General" },
] as const;

export function EntryComments({
  entryId,
  comments,
  vaName,
}: {
  entryId: string;
  comments: CommentDTO[];
  vaName: string;
}) {
  const [state, formAction] = useActionState(addCommentAction, emptyFormState);
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const firstName = vaName.split(" ")[0] || vaName;

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state]);

  return (
    <section className="border-t border-[var(--border)] pt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="field-label mb-0">
          Feedback{comments.length > 0 ? ` (${comments.length})` : ""}
        </p>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="btn-ghost h-8 px-3 text-xs"
          >
            <PlusIcon />
            Add comment
          </button>
        )}
      </div>

      {comments.length > 0 && (
        <ul className="mb-3 space-y-2">
          {comments.map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]/60 px-3 py-2.5"
            >
              <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="chip bg-brand-blue-50 text-brand-blue-700">
                  {c.targetLabel}
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  {c.authorName} · {c.createdAtLabel}
                </span>
                <span
                  className={`ml-auto inline-flex items-center gap-1 text-[11px] font-medium ${
                    c.unread ? "text-brand-orange-700" : "text-emerald-700"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      c.unread ? "bg-brand-orange-500" : "bg-emerald-500"
                    }`}
                    aria-hidden
                  />
                  {c.unread ? `Awaiting ${firstName}` : `Seen by ${firstName}`}
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-[var(--text)]">
                {c.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <form ref={formRef} action={formAction} className="space-y-2" noValidate>
          <input type="hidden" name="entryId" value={entryId} />
          {state.error && (
            <p
              role="alert"
              className="rounded-lg border border-brand-orange-200 bg-brand-orange-50 px-3 py-2 text-sm font-medium text-brand-orange-800"
            >
              {state.error}
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label htmlFor={`target-${entryId}`} className="field-label mb-0 shrink-0">
              About
            </label>
            <select
              id={`target-${entryId}`}
              name="target"
              defaultValue="END"
              className="field-input h-9 py-0 sm:max-w-[16rem]"
            >
              {TARGET_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <textarea
              name="body"
              rows={3}
              required
              placeholder={`Leave feedback for ${firstName}…`}
              className="field-input resize-y"
              aria-invalid={!!state.fieldErrors?.body}
            />
            {state.fieldErrors?.body && (
              <p className="field-error">{state.fieldErrors.body}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <SubmitButton className="btn-primary h-9 px-4 text-sm" pendingLabel="Sending…">
              Send comment
            </SubmitButton>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn-ghost h-9 px-4 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
