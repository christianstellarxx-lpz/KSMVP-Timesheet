"use client";

import { useActionState, useEffect } from "react";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { saveWeekPlanAction } from "@/app/va/actions";
import { emptyFormState } from "@/lib/formState";
import type { PlanDayDTO } from "@/lib/plans";

/**
 * Mon–Fri planner. Each day's box prefills that day's Start of Day — nothing is
 * sent to admins from here. Past days and days already logged are read-only.
 */
export function WeekPlanModal({
  open,
  onClose,
  days,
}: {
  open: boolean;
  onClose: () => void;
  days: PlanDayDTO[];
}) {
  const [state, formAction] = useActionState(saveWeekPlanAction, emptyFormState);

  useEffect(() => {
    if (state.ok) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Plan my week"
      description="Write each day’s tasks once. They prefill your Start of Day — you still review and submit it each morning. Admins don’t see this plan."
    >
      <form action={formAction} className="space-y-4" noValidate>
        {state.error && (
          <p
            role="alert"
            className="rounded-lg border border-brand-orange-200 bg-brand-orange-50 px-3 py-2 text-sm font-medium text-brand-orange-800"
          >
            {state.error}
          </p>
        )}

        {days.map((day) => {
          const id = `plan-${day.date}`;
          return (
            <div key={day.date}>
              <label htmlFor={id} className="field-label">
                {day.label}
                {day.locked && (
                  <span className="chip ml-2 bg-[var(--surface-muted)] text-[var(--text-muted)]">
                    Logged or past
                  </span>
                )}
              </label>
              {day.locked ? (
                <p
                  id={id}
                  className="min-h-[2.5rem] whitespace-pre-wrap break-words rounded-lg bg-[var(--surface-muted)] px-3 py-2 text-sm italic text-[var(--text-muted)]"
                >
                  {day.tasks || "—"}
                </p>
              ) : (
                <textarea
                  id={id}
                  name={id}
                  rows={3}
                  defaultValue={day.tasks}
                  className="field-textarea"
                  placeholder="Tasks for this day (leave blank if not planned yet)"
                />
              )}
            </div>
          );
        })}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <SubmitButton className="btn-action px-6" pendingLabel="Saving…">
            Save plan
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
