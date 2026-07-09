"use client";

import { useFormStatus } from "react-dom";

/**
 * Small "Remove" control shown on a VA's urgent banner in the admin dashboard.
 * Clears the urgent flag once an admin has handled it (with a confirm).
 */
export function RemoveUrgentButton({
  action,
  entryId,
  vaName,
}: {
  action: (formData: FormData) => void | Promise<void>;
  entryId: string;
  vaName: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Remove the urgent flag on ${vaName}'s entry? It will no longer be marked urgent.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="entryId" value={entryId} />
      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      aria-label="Remove urgent flag"
      className="inline-flex items-center gap-1 rounded-md border border-brand-orange-300 bg-white/70 px-2 py-1 text-xs font-heading font-semibold text-brand-orange-700 transition-colors hover:bg-brand-orange-100 disabled:opacity-50"
    >
      {pending ? (
        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4z" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
      Remove
    </button>
  );
}
