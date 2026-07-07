"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button that reflects the enclosing form's pending state.
 * Must be rendered inside a <form>.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className = "btn-primary w-full btn-lg",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? (
        <>
          <Spinner />
          {pendingLabel ?? "Working…"}
        </>
      ) : (
        children
      )}
    </button>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
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
