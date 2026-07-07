"use client";

import { useEffect } from "react";
import { Logo } from "@/components/Logo";

/**
 * Route-level error boundary. Usually caused by an unreachable database or a
 * missing env var (DATABASE_URL / AUTH_SECRET) — keep the user-facing copy
 * generic and actionable.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      <Logo />
      <div className="card max-w-md p-6 sm:p-8">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-brand-orange-50 text-brand-orange-600">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-brand-blue-700">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          This page couldn’t load. Please try again in a moment. If it keeps
          happening, the app can’t reach its database — check that{" "}
          <code className="rounded bg-[var(--surface-muted)] px-1">DATABASE_URL</code>{" "}
          and{" "}
          <code className="rounded bg-[var(--surface-muted)] px-1">AUTH_SECRET</code>{" "}
          are set correctly.
        </p>
        {error.digest && (
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            Error digest: <span className="font-mono">{error.digest}</span>
          </p>
        )}
        <button onClick={reset} className="btn-primary mt-6 w-full">
          Try again
        </button>
      </div>
    </main>
  );
}
