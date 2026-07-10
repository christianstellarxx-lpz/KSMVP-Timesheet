"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Modal } from "@/components/Modal";
import { timeOutAction } from "@/app/va/actions";
import { emptyFormState } from "@/lib/formState";

export function TimeOutModal({
  open,
  onClose,
  presetWallClock,
  timeInLabel,
}: {
  open: boolean;
  onClose: () => void;
  presetWallClock: string;
  timeInLabel: string | null;
}) {
  const [state, formAction] = useActionState(timeOutAction, emptyFormState);

  useEffect(() => {
    if (state.ok) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Time Out"
      description="End your workday. The clock is preset to 5:00 PM ET — edit it to your actual finish time."
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

        {timeInLabel && (
          <p className="rounded-lg bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-muted)]">
            Started today at{" "}
            <span className="font-semibold text-[var(--text)]">
              {timeInLabel} ET
            </span>
          </p>
        )}

        {/* 1. Time Out clock (editable ET preset) */}
        <div>
          <label htmlFor="timeOutWallClock" className="field-label">
            Time Out <span className="text-[var(--text-muted)]">(ET)</span>
          </label>
          <input
            id="timeOutWallClock"
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
          <p className="field-hint">Must be after your time-in.</p>
        </div>

        {/* 2. End of Day Report (required) */}
        <div>
          <label htmlFor="endOfDayTasks" className="field-label">
            End of Day Report <span className="text-brand-orange-600">*</span>
          </label>
          <textarea
            id="endOfDayTasks"
            name="endOfDayTasks"
            required
            rows={4}
            className="field-textarea"
            placeholder="What did you accomplish today? Include any notes or blockers."
            aria-invalid={!!state.fieldErrors?.endOfDayTasks}
          />
          {state.fieldErrors?.endOfDayTasks && (
            <p className="field-error">{state.fieldErrors.endOfDayTasks}</p>
          )}
        </div>

        <Actions onClose={onClose} />
      </form>
    </Modal>
  );
}

/**
 * Cancel + the two submit options. Both submit the same form; the clicked
 * button's `intent` (schedule | now) tells the server how to publish the report.
 */
function Actions({ onClose }: { onClose: () => void }) {
  const { pending } = useFormStatus();
  const [clicked, setClicked] = useState<"now" | "schedule" | null>(null);

  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={onClose}
        disabled={pending}
        className="btn-ghost"
      >
        Cancel
      </button>
      <button
        type="submit"
        name="intent"
        value="now"
        onClick={() => setClicked("now")}
        disabled={pending}
        aria-busy={pending && clicked === "now"}
        className="btn-primary px-6"
      >
        {pending && clicked === "now" ? (
          <>
            <Spinner />
            Sending…
          </>
        ) : (
          "Enter now"
        )}
      </button>
      <button
        type="submit"
        name="intent"
        value="schedule"
        onClick={() => setClicked("schedule")}
        disabled={pending}
        aria-busy={pending && clicked === "schedule"}
        className="btn-action px-6"
      >
        {pending && clicked === "schedule" ? (
          <>
            <Spinner />
            Atake na…
          </>
        ) : (
          "Atake na"
        )}
      </button>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4z"
      />
    </svg>
  );
}
