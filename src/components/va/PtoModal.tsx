"use client";

import { useActionState, useEffect } from "react";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { logPtoAction } from "@/app/va/actions";
import { emptyFormState } from "@/lib/formState";

export function PtoModal({
  open,
  onClose,
  defaultDate,
}: {
  open: boolean;
  onClose: () => void;
  defaultDate: string; // ET date string, e.g. "2026-07-07"
}) {
  const [state, formAction] = useActionState(logPtoAction, emptyFormState);

  useEffect(() => {
    if (state.ok) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log PTO / Vacation"
      description="Mark a day as paid time off or vacation. No Start or End of Day report is needed for it."
    >
      <form action={formAction} className="space-y-5" noValidate>
        {state.error && (
          <p
            role="alert"
            className="rounded-lg border border-brand-orange-200 bg-brand-orange-50 px-3 py-2 text-sm font-medium text-brand-orange-800"
          >
            {state.error}
          </p>
        )}

        <div className="flex items-center gap-3 rounded-lg bg-brand-yellow-50 px-3 py-2.5 text-sm text-[var(--text)]">
          <span aria-hidden className="text-lg">🌴</span>
          <span>Your admins will see this day as PTO.</span>
        </div>

        <div>
          <label htmlFor="pto-date" className="field-label">
            Date <span className="text-brand-orange-600">*</span>
          </label>
          <input
            id="pto-date"
            name="date"
            type="date"
            defaultValue={defaultDate}
            required
            className="field-input"
            aria-invalid={!!state.fieldErrors?.date}
          />
          {state.fieldErrors?.date && (
            <p className="field-error">{state.fieldErrors.date}</p>
          )}
        </div>

        <div>
          <label htmlFor="pto-note" className="field-label">
            Note{" "}
            <span className="chip bg-[var(--surface-muted)] text-[var(--text-muted)]">
              Optional
            </span>
          </label>
          <textarea
            id="pto-note"
            name="note"
            rows={3}
            className="field-textarea"
            placeholder="e.g. Vacation, sick day, personal day…"
          />
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <SubmitButton className="btn-primary px-6" pendingLabel="Saving…">
            Log PTO day
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
