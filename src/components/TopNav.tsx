import Link from "next/link";
import { Logo } from "./Logo";
import { NavLinks, type NavItem } from "./NavLinks";
import { logoutAction } from "@/app/login/actions";
import { roleLabel, type SessionUser } from "@/lib/session";

/** Brand-blue top navigation shared by the VA and Client experiences. */
export function TopNav({
  session,
  navItems = [],
}: {
  session: SessionUser;
  navItems?: NavItem[];
}) {
  const initials = session.name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 bg-brand-blue-600 text-white shadow-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Logo variant="onDark" />
          {navItems.length > 0 && (
            <div className="hidden sm:block">
              <NavLinks items={navItems} />
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/account"
            title="Account settings"
            className="flex items-center gap-3 rounded-lg px-1 py-1 transition-colors hover:bg-white/10"
          >
            <div className="hidden max-w-[220px] text-right sm:block">
              <p className="truncate text-sm font-heading font-semibold leading-tight">
                {session.name}
              </p>
              <p className="truncate text-[11px] text-white/60">
                {session.title || roleLabel(session.role)}
              </p>
            </div>
            <span
              aria-hidden
              className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-xs font-heading font-bold"
            >
              {initials}
            </span>
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              title="Sign out"
              aria-label="Sign out"
              className="flex min-h-[40px] items-center gap-2 rounded-lg border border-white/25 px-2.5 py-2 text-sm font-heading font-medium text-white/90 transition-colors hover:bg-white/10 sm:px-3"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </form>
        </div>
      </div>

      {navItems.length > 0 && (
        <div className="border-t border-white/10 px-4 pb-2 pt-1 sm:hidden">
          <NavLinks items={navItems} />
        </div>
      )}
    </header>
  );
}
