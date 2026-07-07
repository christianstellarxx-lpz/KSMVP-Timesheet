import { TopNav } from "@/components/TopNav";
import { AppFooter } from "@/components/AppFooter";
import { requireUser, canViewAdmin, canViewVa } from "@/lib/session";
import type { NavItem } from "@/components/NavLinks";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireUser();

  // Show links to every area this user can reach (VA dashboard first).
  const navItems: NavItem[] = [];
  if (canViewVa(session.role)) {
    navItems.push({ href: "/va", label: "My VA Dashboard" });
  }
  if (canViewAdmin(session.role)) {
    navItems.push(
      { href: "/client", label: "Admin Dashboard" },
      { href: "/client/vas", label: "Team" },
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav session={session} navItems={navItems} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
      <AppFooter />
    </div>
  );
}
