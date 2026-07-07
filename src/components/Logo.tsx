/**
 * Brand lockup. Renders a clean text logo for now; drop a real logo image in by
 * swapping the mark below for an <Image> — the rest of the app references
 * <Logo /> only, so this is the single swap point.
 */
export function Logo({
  variant = "onLight",
  showTagline = true,
}: {
  variant?: "onLight" | "onDark";
  showTagline?: boolean;
}) {
  const onDark = variant === "onDark";
  return (
    <span className="inline-flex items-center gap-2.5">
      {/* Logo mark placeholder — replace with <Image src=... /> when available. */}
      <span
        aria-hidden
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg font-heading text-base font-bold ${
          onDark
            ? "bg-white text-brand-blue-700"
            : "bg-brand-blue-600 text-white"
        }`}
      >
        K
      </span>
      <span className="flex flex-col leading-none">
        <span
          className={`font-heading text-base font-bold tracking-tight ${
            onDark ? "text-white" : "text-brand-blue-700"
          }`}
        >
          KSMVP VA Tasks
        </span>
        {showTagline && (
          <span
            className={`font-heading text-[11px] font-medium ${
              onDark ? "text-white/70" : "text-brand-orange-600"
            }`}
          >
            We Make AI Easy
          </span>
        )}
      </span>
    </span>
  );
}
