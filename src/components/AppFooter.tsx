export function AppFooter() {
  return (
    <footer className="mt-auto border-t border-[var(--border)] bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-1 px-4 py-5 text-xs text-[var(--text-muted)] sm:flex-row sm:px-6">
        <p className="font-heading font-semibold text-brand-blue-700">
          KSMVP VA Tasks
        </p>
        <p>
          <span className="text-brand-orange-600 font-heading font-medium">
            We Make AI Easy.
          </span>
        </p>
      </div>
    </footer>
  );
}
