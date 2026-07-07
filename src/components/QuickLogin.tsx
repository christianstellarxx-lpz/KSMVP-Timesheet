"use client";

import { useActionState, useState } from "react";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { quickLoginAction } from "@/app/login/actions";
import { emptyFormState } from "@/lib/formState";

export interface QuickUser {
  id: string;
  firstName: string;
  name: string;
  title: string;
}

export function QuickLogin({
  admins,
  team,
}: {
  admins: QuickUser[];
  team: QuickUser[];
}) {
  const [selected, setSelected] = useState<QuickUser | null>(null);

  return (
    <div className="space-y-4">
      <Box title="Admins" users={admins} onPick={setSelected} />
      <Box title="Virtual Assistants & Interns" users={team} onPick={setSelected} />

      {selected && (
        <PinModal user={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function Box({
  title,
  users,
  onPick,
}: {
  title: string;
  users: QuickUser[];
  onPick: (u: QuickUser) => void;
}) {
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="mb-3 font-heading text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
        {title}
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {users.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => onPick(u)}
            title={u.name}
            className="flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-lg border border-[var(--border)] bg-white px-2 py-3 text-center transition-colors hover:border-brand-blue-300 hover:bg-brand-blue-50 focus-visible:border-brand-blue-400"
          >
            <span
              aria-hidden
              className="grid h-8 w-8 place-items-center rounded-full bg-brand-blue-600 text-[11px] font-heading font-bold text-white"
            >
              {initials(u.name)}
            </span>
            <span className="font-heading text-sm font-semibold text-[var(--text)]">
              {u.firstName}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function PinModal({
  user,
  onClose,
}: {
  user: QuickUser;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState(quickLoginAction, emptyFormState);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Hi, ${user.firstName}`}
      description="Enter your 4-digit PIN to sign in."
    >
      <form action={formAction} className="space-y-5" noValidate>
        <input type="hidden" name="userId" value={user.id} />

        <div className="flex items-center gap-3 rounded-lg bg-[var(--surface-muted)] px-3 py-2.5">
          <span
            aria-hidden
            className="grid h-9 w-9 place-items-center rounded-full bg-brand-blue-600 text-xs font-heading font-bold text-white"
          >
            {initials(user.name)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-heading text-sm font-semibold text-[var(--text)]">
              {user.name}
            </p>
            <p className="truncate text-xs text-[var(--text-muted)]">
              {user.title}
            </p>
          </div>
        </div>

        {state.error && (
          <p
            role="alert"
            className="rounded-lg border border-brand-orange-200 bg-brand-orange-50 px-3 py-2 text-sm font-medium text-brand-orange-800"
          >
            {state.error}
          </p>
        )}

        <div>
          <label htmlFor="pin" className="field-label text-center">
            4-digit PIN
          </label>
          <input
            id="pin"
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]*"
            maxLength={4}
            required
            autoFocus
            placeholder="••••"
            className="field-input text-center text-2xl font-mono tracking-[0.6em]"
            aria-invalid={!!state.fieldErrors?.pin || !!state.error}
          />
          {state.fieldErrors?.pin && (
            <p className="field-error text-center">{state.fieldErrors.pin}</p>
          )}
        </div>

        <SubmitButton className="btn-primary w-full btn-lg" pendingLabel="Signing in…">
          Sign in
        </SubmitButton>
      </form>
    </Modal>
  );
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
