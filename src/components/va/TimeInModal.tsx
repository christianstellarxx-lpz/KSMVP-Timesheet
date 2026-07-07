"use client";

import { useActionState, useEffect } from "react";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { timeInAction } from "@/app/va/actions";
import { emptyFormState } from "@/lib/formState";
import { SCHEDULE_TIME_IN_LABEL } from "@/lib/time";

export function TimeInModal({
  open,
  onClose,
  presetWallClock,
}: {
  open: boolean;
  onClose: () => void;
  presetWallClock: string;
}) {
  const [state, formAction] = useActionState(timeInAction, emptyFormState);

  useEffect(() => {
    if (state.ok) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Time In"
      description={`Start your workday. The clock is preset to ${SCHEDULE_TIME_IN_LABEL} ET — edit it to your actual start time.`}
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

        {/* 1. Time In clock (editable ET preset) */}
        <div>
          <label htmlFor="timeInWallClock" className="field-label">
            Time In <span className="text-[var(--text-muted)]">(ET)</span>
          </label>
          <input
            id="timeInWallClock"
            name="timeInWallClock"
            type="datetime-local"
            defaultValue={presetWallClock}
            required
            className="field-input"
            aria-invalid={!!state.fieldErrors?.timeInWallClock}
          />
          {state.fieldErrors?.timeInWallClock && (
            <p className="field-error">{state.fieldErrors.timeInWallClock}</p>
          )}
          <p className="field-hint">
            Recorded in Eastern Time regardless of your device’s timezone.
          </p>
        </div>

        {/* 2. Start-of-Day Tasks (required) */}
        <div>
          <label htmlFor="startOfDayTasks" className="field-label">
            Start-of-Day Tasks <span className="text-brand-orange-600">*</span>
          </label>
          <textarea
            id="startOfDayTasks"
            name="startOfDayTasks"
            required
            rows={4}
            className="field-textarea"
            placeholder="What do you plan to work on today?"
            aria-invalid={!!state.fieldErrors?.startOfDayTasks}
          />
          {state.fieldErrors?.startOfDayTasks && (
            <p className="field-error">{state.fieldErrors.startOfDayTasks}</p>
          )}
        </div>

        {/* 3. Urgent Need / Support (optional) */}
        <div>
          <label htmlFor="urgentNeed" className="field-label">
            Urgent Need / Support{" "}
            <span className="chip bg-[var(--surface-muted)] text-[var(--text-muted)]">
              Optional
            </span>
          </label>
          <textarea
            id="urgentNeed"
            name="urgentNeed"
            rows={3}
            className="field-textarea"
            placeholder="Anything blocking you or needing your client’s attention? Leave blank if none."
          />
          <p className="field-hint">
            Fill this in only if something needs your client’s attention — it
            will be flagged on their dashboard.
          </p>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <SubmitButton
            className="btn-action px-6"
            pendingLabel="Starting…"
          >
            Start my day
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
