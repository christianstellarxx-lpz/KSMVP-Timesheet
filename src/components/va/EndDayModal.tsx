"use client";

import { useActionState, useEffect } from "react";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { endDayAction } from "@/app/va/actions";
import { emptyFormState } from "@/lib/formState";
import { EOD_PUBLISH_LABEL } from "@/lib/time";
import { EndOfDayField } from "./EndOfDayField";

export function EndDayModal({
  open,
  onClose,
  entryId,
}: {
  open: boolean;
  onClose: () => void;
  entryId: string;
}) {
  const [state, formAction] = useActionState(endDayAction, emptyFormState);

  useEffect(() => {
    if (state.ok) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="End of Day"
      description={`Review your report, then press Sched. It reaches your admins at ${EOD_PUBLISH_LABEL} ET (right away if it’s already later).`}
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

        <EndOfDayField entryId={entryId} error={state.fieldErrors?.endOfDayTasks} />

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <SubmitButton className="btn-action px-6" pendingLabel="Scheduling…">
            Sched
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
