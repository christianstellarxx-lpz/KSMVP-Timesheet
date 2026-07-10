"use client";

import { useActionState, useEffect, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { updateEntryTextAction } from "@/app/va/actions";
import { emptyFormState } from "@/lib/formState";

/**
 * A start-of-day / end-of-day field the VA can edit in place on their dashboard.
 * Shows the text read-only with an "Edit" button; editing swaps in a textarea
 * that saves via the server action (ownership enforced server-side).
 */
export function EditableTask({
  entryId,
  field,
  label,
  text,
  placeholder,
}: {
  entryId: string;
  field: "START" | "END";
  label: string;
  text: string | null;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState(
    updateEntryTextAction,
    emptyFormState,
  );

  useEffect(() => {
    if (state.ok) setEditing(false);
  }, [state]);

  if (!editing) {
    const value = text?.trim();
    return (
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="field-label mb-0">{label}</p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 text-xs font-heading font-semibold text-brand-blue-700 transition-colors hover:text-brand-blue-800"
          >
            <PencilIcon />
            Edit
          </button>
        </div>
        <p
          className={`whitespace-pre-wrap break-words rounded-lg bg-[var(--surface-muted)] px-3 py-2.5 text-sm ${
            value ? "text-[var(--text)]" : "italic text-[var(--text-muted)]"
          }`}
        >
          {value || "—"}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="entryId" value={entryId} />
      <input type="hidden" name="field" value={field} />
      <p className="field-label">{label}</p>
      <textarea
        name="value"
        defaultValue={text ?? ""}
        rows={4}
        autoFocus
        required
        maxLength={5000}
        placeholder={placeholder}
        className="field-textarea"
        aria-invalid={!!state.fieldErrors?.value}
      />
      {state.fieldErrors?.value && (
        <p className="field-error">{state.fieldErrors.value}</p>
      )}
      {state.error && <p className="field-error">{state.error}</p>}
      <div className="mt-2 flex gap-2">
        <SubmitButton
          className="btn-primary px-4 text-sm sm:min-h-[40px]"
          pendingLabel="Saving…"
        >
          Save
        </SubmitButton>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="btn-ghost px-4 text-sm sm:min-h-[40px]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
