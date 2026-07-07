"use client";

import { useActionState, useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { addMemberAction } from "@/app/client/actions";
import { emptyFormState } from "@/lib/formState";

export function AddVaButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        Add member
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add a team member"
        description="Create login credentials for a team member. VAs and interns get a VA dashboard; admins and VA admins can see the admin dashboard."
      >
        {/* Mounts fresh each open, so the form/state reset automatically. */}
        <AddMemberFields onSuccess={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function AddMemberFields({ onSuccess }: { onSuccess: () => void }) {
  const [state, formAction] = useActionState(addMemberAction, emptyFormState);

  useEffect(() => {
    if (state.ok) onSuccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-brand-orange-200 bg-brand-orange-50 px-3 py-2 text-sm font-medium text-brand-orange-800"
        >
          {state.error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="m-name" className="field-label">
            Full name <span className="text-brand-orange-600">*</span>
          </label>
          <input
            id="m-name"
            name="name"
            type="text"
            required
            autoComplete="off"
            className="field-input"
            placeholder="Jordan Rivera"
            aria-invalid={!!state.fieldErrors?.name}
          />
          {state.fieldErrors?.name && (
            <p className="field-error">{state.fieldErrors.name}</p>
          )}
        </div>

        <div>
          <label htmlFor="m-role" className="field-label">
            Role <span className="text-brand-orange-600">*</span>
          </label>
          <select
            id="m-role"
            name="role"
            defaultValue="VA"
            className="field-input"
            aria-invalid={!!state.fieldErrors?.role}
          >
            <option value="VA">Virtual Assistant</option>
            <option value="INTERN">Intern</option>
            <option value="VA_ADMIN">Virtual Assistant (with admin dashboard)</option>
            <option value="ADMIN">Admin</option>
          </select>
          {state.fieldErrors?.role && (
            <p className="field-error">{state.fieldErrors.role}</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="m-title" className="field-label">
          Job title <span className="text-brand-orange-600">*</span>
        </label>
        <input
          id="m-title"
          name="title"
          type="text"
          required
          autoComplete="off"
          className="field-input"
          placeholder="Graphic Designer"
          aria-invalid={!!state.fieldErrors?.title}
        />
        {state.fieldErrors?.title && (
          <p className="field-error">{state.fieldErrors.title}</p>
        )}
      </div>

      <div>
        <label htmlFor="m-email" className="field-label">
          Email <span className="text-brand-orange-600">*</span>
        </label>
        <input
          id="m-email"
          name="email"
          type="email"
          required
          autoComplete="off"
          className="field-input"
          placeholder="jordan@example.com"
          aria-invalid={!!state.fieldErrors?.email}
        />
        {state.fieldErrors?.email && (
          <p className="field-error">{state.fieldErrors.email}</p>
        )}
      </div>

      <p className="rounded-lg bg-[var(--surface-muted)] px-3 py-2.5 text-xs text-[var(--text-muted)]">
        They’ll sign in by tapping their name and entering the default PIN{" "}
        <span className="font-mono font-semibold text-[var(--text)]">0000</span>,
        which they can change in Account settings.
      </p>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onSuccess} className="btn-ghost">
          Cancel
        </button>
        <SubmitButton className="btn-primary px-6" pendingLabel="Creating…">
          Create member
        </SubmitButton>
      </div>
    </form>
  );
}
