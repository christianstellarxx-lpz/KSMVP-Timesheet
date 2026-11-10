import { officeSlugForName } from "@/lib/office/roster";

/** A person's office-character headshot, or their initials if they have no character. */
export function UserAvatar({
  name,
  className,
  fallbackClassName = "bg-brand-blue-600 text-white",
}: {
  name: string;
  /** Size + text size, e.g. "h-9 w-9 text-xs". */
  className: string;
  /** Colours for the initials fallback. */
  fallbackClassName?: string;
}) {
  const slug = officeSlugForName(name);
  if (slug) {
    return (
      <img
        src={`/office/web/heads/${slug}.webp`}
        alt=""
        aria-hidden
        className={`${className} shrink-0 rounded-full bg-brand-blue-50 object-cover ring-1 ring-brand-blue-100`}
      />
    );
  }
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden
      className={`${className} grid shrink-0 place-items-center rounded-full font-heading font-bold ${fallbackClassName}`}
    >
      {initials}
    </span>
  );
}
