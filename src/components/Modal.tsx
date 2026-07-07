"use client";

import { useEffect, useId, useRef } from "react";

/**
 * Accessible modal dialog: focus moves in on open, Escape and backdrop click
 * close, background scroll is locked, and focus is restored on close.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const { body } = document;
    const prevOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    // Move focus to the first focusable control in the panel.
    const focusable = panelRef.current?.querySelector<HTMLElement>(
      'input, textarea, select, button, [href], [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 animate-fade-in sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className="w-full max-w-lg rounded-t-2xl bg-white shadow-xl animate-scale-in max-h-[92vh] overflow-y-auto sm:rounded-card"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4 sm:px-6">
          <div>
            <h2 id={titleId} className="text-lg font-bold text-brand-blue-700">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-0.5 text-sm text-[var(--text-muted)]">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="px-5 py-5 sm:px-6">{children}</div>
      </div>
    </div>
  );
}
