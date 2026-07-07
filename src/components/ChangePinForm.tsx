"use client";

import { useActionState, useEffect, useRef } from "react";
import { changePinAction } from "@/app/account/actions";
import { emptyFormState } from "@/lib/formState";
import { SubmitButton } from "./SubmitButton";

const pinClass =
  "field-input text-center text-xl font-mono tracking-[0.5em] max-w-[10rem]";

export function ChangePinForm() {
  const [state, formAction] = useActionState(changePinAction, emptyFormState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4" noValidate>
      {state.ok && (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800"
        >
          Your PIN has been updated.
        </p>
      )}
      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-brand-orange-200 bg-brand-orange-50 px-3 py-2 text-sm font-medium text-brand-orange-800"
        >
          {state.error}
        </p>
      )}

      <PinField
        id="currentPin"
        label="Current PIN"
        error={state.fieldErrors?.currentPin}
        autoComplete="off"
      />
      <PinField
        id="newPin"
        label="New PIN"
        error={state.fieldErrors?.newPin}
        hint="4 digits."
        autoComplete="off"
      />
      <PinField
        id="confirmPin"
        label="Confirm new PIN"
        error={state.fieldErrors?.confirmPin}
        autoComplete="off"
      />

      <div className="pt-1">
        <SubmitButton className="btn-primary px-6" pendingLabel="Updating…">
          Update PIN
        </SubmitButton>
      </div>
    </form>
  );
}

function PinField({
  id,
  label,
  error,
  hint,
  autoComplete,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label} <span className="text-brand-orange-600">*</span>
      </label>
      <input
        id={id}
        name={id}
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        required
        autoComplete={autoComplete}
        placeholder="••••"
        className={pinClass}
        aria-invalid={!!error}
      />
      {error ? (
        <p className="field-error">{error}</p>
      ) : hint ? (
        <p className="field-hint">{hint}</p>
      ) : null}
    </div>
  );
}
