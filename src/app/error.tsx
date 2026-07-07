"use client";

import { useEffect } from "react";
import { Logo } from "@/components/Logo";

/**
 * Route-level error boundary. The most common cause in local dev is an
 * unreachable database — surface that hint instead of an opaque 500.
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
          This page couldn’t load. The most common cause during local setup is
          that the <span className="font-semibold">database isn’t running</span>{" "}
          or <code className="rounded bg-[var(--surface-muted)] px-1">DATABASE_URL</code>{" "}
          is wrong. Start Postgres and run{" "}
          <code className="rounded bg-[var(--surface-muted)] px-1">
            npm run db:migrate &amp;&amp; npm run db:seed
          </code>
          , then retry.
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
