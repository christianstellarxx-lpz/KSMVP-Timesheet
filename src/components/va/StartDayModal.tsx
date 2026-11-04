"use client";

import { useActionState, useEffect } from "react";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { startDayAction } from "@/app/va/actions";
import { emptyFormState } from "@/lib/formState";

export function StartDayModal({
  open,
  onClose,
  plannedTasks,
}: {
  open: boolean;
  onClose: () => void;
  /** Today's tasks from the weekly planner, if any. */
  plannedTasks: string | null;
}) {
  const [state, formAction] = useActionState(startDayAction, emptyFormState);

  useEffect(() => {
    if (state.ok) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Start of Day"
      description="Share what you’re working on today. Your admins see it as soon as you submit."
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

        {/* 1. Start-of-Day Tasks (required) — prefilled from the weekly plan */}
        <div>
          <label htmlFor="startOfDayTasks" className="field-label">
            Start-of-Day Tasks <span className="text-brand-orange-600">*</span>
          </label>
          <textarea
            id="startOfDayTasks"
            name="startOfDayTasks"
            required
            rows={6}
            defaultValue={plannedTasks ?? ""}
            className="field-textarea"
            placeholder="What do you plan to work on today?"
            aria-invalid={!!state.fieldErrors?.startOfDayTasks}
          />
          {state.fieldErrors?.startOfDayTasks && (
            <p className="field-error">{state.fieldErrors.startOfDayTasks}</p>
          )}
          {plannedTasks && (
            <p className="field-hint">
              Prefilled from your weekly plan. Review it before you submit.
            </p>
          )}
        </div>

        {/* 2. Urgent Need / Support (optional) */}
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
          <SubmitButton className="btn-action px-6" pendingLabel="Submitting…">
            Submit Start of Day
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
