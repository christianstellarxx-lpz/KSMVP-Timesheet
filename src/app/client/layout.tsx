import { TopNav } from "@/components/TopNav";
import { AppFooter } from "@/components/AppFooter";
import { requireAdmin, canViewVa } from "@/lib/session";
import type { NavItem } from "@/components/NavLinks";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdmin();

  // VA Admins get their own VA dashboard first, then the admin views.
  const navItems: NavItem[] = [];
  if (canViewVa(session.role)) {
    navItems.push({ href: "/va", label: "My VA Dashboard" });
  }
  navItems.push(
    { href: "/client", label: "Admin Dashboard" },
    { href: "/client/vas", label: "Team" },
  );

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav session={session} navItems={navItems} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
      <AppFooter />
    </div>
  );
}
