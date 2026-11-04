"use client";

import { useActionState, useEffect } from "react";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { resolveStaleAction } from "@/app/va/actions";
import { emptyFormState } from "@/lib/formState";
import type { EntryDTO } from "@/lib/timeEntries";
import { EndOfDayField } from "./EndOfDayField";

export function ResolveStaleModal({
  open,
  onClose,
  entry,
}: {
  open: boolean;
  onClose: () => void;
  entry: EntryDTO;
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
      title="Finish an earlier day"
      description={`You sent a Start of Day on ${entry.workDateLabel} but no End-of-Day report. Add it now — it reaches your admins right away.`}
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

        <EndOfDayField entryId={entry.id} error={state.fieldErrors?.endOfDayTasks} />

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <SubmitButton className="btn-action px-6" pendingLabel="Saving…">
            Send report
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
