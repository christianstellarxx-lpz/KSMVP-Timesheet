import { TopNav } from "@/components/TopNav";
import { AppFooter } from "@/components/AppFooter";
import { requireVA, canViewAdmin } from "@/lib/session";
import { GAMES_ENABLED } from "@/lib/features";
import type { NavItem } from "@/components/NavLinks";

export default async function VaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireVA();

  // Everyone with a VA dashboard gets the Games tab (while GAMES_ENABLED); VA
  // Admins additionally get a tab to switch over to the admin dashboard (VA
  // dashboard first).
  const gamesTab: NavItem[] = GAMES_ENABLED
    ? [{ href: "/va/games", label: "Games" }]
    : [];
  const navItems: NavItem[] = canViewAdmin(session.role)
    ? [
        { href: "/va", label: "My VA Dashboard" },
        ...gamesTab,
        { href: "/client", label: "Admin Dashboard" },
      ]
    : [{ href: "/va", label: "My Day" }, ...gamesTab];

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav session={session} navItems={navItems} />
      {/* Wide shell, matching the admin dashboard. Each page picks its own
          reading width inside it — My Day stays narrow, Games needs the room. */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
      <AppFooter />
    </div>
  );
}
