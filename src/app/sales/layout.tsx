import { TopNav } from "@/components/TopNav";
import { AppFooter } from "@/components/AppFooter";
import { requireSalesProducer } from "@/lib/session";

export default async function SalesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSalesProducer();

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav session={session} navItems={[]} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
      <AppFooter />
    </div>
  );
}
