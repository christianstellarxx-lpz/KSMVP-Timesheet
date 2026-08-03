import { TopNav } from "@/components/TopNav";
import { AppFooter } from "@/components/AppFooter";
import { requireVA, canViewAdmin } from "@/lib/session";
import type { NavItem } from "@/components/NavLinks";

export default async function VaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireVA();

  // Everyone with a VA dashboard gets the Games tab; VA Admins additionally get
  // a tab to switch over to the admin dashboard (VA dashboard first).
  const navItems: NavItem[] = canViewAdmin(session.role)
    ? [
        { href: "/va", label: "My VA Dashboard" },
        { href: "/va/games", label: "Games" },
        { href: "/client", label: "Admin Dashboard" },
      ]
    : [
        { href: "/va", label: "My Day" },
        { href: "/va/games", label: "Games" },
      ];

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav session={session} navItems={navItems} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
      <AppFooter />
    </div>
  );
}
