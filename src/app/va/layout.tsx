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

  // VA Admins get tabs to switch between the two dashboards (VA dashboard first).
  const navItems: NavItem[] = canViewAdmin(session.role)
    ? [
        { href: "/va", label: "My VA Dashboard" },
        { href: "/client", label: "Admin Dashboard" },
      ]
    : [];

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
