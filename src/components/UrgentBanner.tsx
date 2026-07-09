/** Unmistakable brand-orange urgent treatment. Render only when text exists. */
export function UrgentBanner({
  text,
  compact = false,
  action,
}: {
  text: string;
  compact?: boolean;
  /** Optional trailing control (e.g. an admin "remove" button). */
  action?: React.ReactNode;
}) {
  return (
    <div
      role="note"
      aria-label="Urgent need flagged"
      className={`flex gap-2.5 rounded-lg border-l-4 border-brand-orange-500 bg-brand-orange-50 ${
        compact ? "px-3 py-2" : "px-4 py-3"
      }`}
    >
      <svg
        className="mt-0.5 h-5 w-5 shrink-0 text-brand-orange-600"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
        <path
          d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="font-heading text-xs font-bold uppercase tracking-wide text-brand-orange-700">
          Urgent need / support
        </p>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-brand-orange-900">
          {text}
        </p>
      </div>
      {action && <div className="shrink-0 self-start">{action}</div>}
    </div>
  );
}
