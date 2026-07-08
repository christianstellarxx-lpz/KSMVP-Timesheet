import { requireSalesProducer } from "@/lib/session";
import { getSalesDesk } from "@/lib/sales";
import { SalesDeskClient } from "@/components/sales/SalesDeskClient";

export const metadata = { title: "Sales Desk — KSMVP VA Tasks" };
export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const session = await requireSalesProducer();
  const groups = await getSalesDesk();
  const firstName = session.name.split(" ")[0] || session.name;

  return <SalesDeskClient firstName={firstName} groups={groups} />;
}
