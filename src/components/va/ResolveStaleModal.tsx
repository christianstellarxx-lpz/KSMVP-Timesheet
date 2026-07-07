"use client";

import { useActionState, useEffect } from "react";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { resolveStaleAction } from "@/app/va/actions";
import { emptyFormState } from "@/lib/formState";
import type { EntryDTO } from "@/lib/timeEntries";

export function ResolveStaleModal({
  open,
  onClose,
  entry,
  presetWallClock,
}: {
  open: boolean;
  onClose: () => void;
  entry: EntryDTO;
  presetWallClock: string;
}) {
  const [state, formAction] = useActionState(resolveStaleAction, emptyFormState);

  useEffect(() => {
    if (state.ok) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Close an unfinished session"
      description={`You clocked in on ${entry.workDateLabel} but never clocked out. Set your actual finish time so your hours are counted correctly.`}
    >
      <form action={formAction} className="space-y-5" noValidate>
        <input type="hidden" name="entryId" value={entry.id} />

        {state.error && (
          <p
            role="alert"
            className="rounded-lg border border-brand-orange-200 bg-brand-orange-50 px-3 py-2 text-sm font-medium text-brand-orange-800"
          >
            {state.error}
          </p>
        )}

        <div className="rounded-lg bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-muted)]">
          <span className="font-semibold text-[var(--text)]">
            {entry.workDateLabel}
          </span>{" "}
          · clocked in at{" "}
          <span className="font-semibold text-[var(--text)]">
            {entry.timeInLabel} ET
          </span>
        </div>

        <div>
          <label htmlFor="resolveTimeOut" className="field-label">
            Actual Time Out <span className="text-[var(--text-muted)]">(ET)</span>
          </label>
          <input
            id="resolveTimeOut"
            name="timeOutWallClock"
            type="datetime-local"
            defaultValue={presetWallClock}
            required
            className="field-input"
            aria-invalid={!!state.fieldErrors?.timeOutWallClock}
          />
          {state.fieldErrors?.timeOutWallClock && (
            <p className="field-error">{state.fieldErrors.timeOutWallClock}</p>
          )}
        </div>

        <div>
          <label htmlFor="resolveEndTasks" className="field-label">
            End of Day Report <span className="text-brand-orange-600">*</span>
          </label>
          <textarea
            id="resolveEndTasks"
            name="endOfDayTasks"
            required
            rows={4}
            className="field-textarea"
            placeholder="What did you accomplish that day?"
            aria-invalid={!!state.fieldErrors?.endOfDayTasks}
          />
          {state.fieldErrors?.endOfDayTasks && (
            <p className="field-error">{state.fieldErrors.endOfDayTasks}</p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <SubmitButton className="btn-action px-6" pendingLabel="Saving…">
            Save & close session
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
