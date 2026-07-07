import { requireVA } from "@/lib/session";
import { getVaDayState } from "@/lib/timeEntries";
import { VaDayClient } from "@/components/va/VaDayClient";

export const metadata = { title: "My Day — KSMVP VA Tasks" };
export const dynamic = "force-dynamic";

export default async function VaPage() {
  const session = await requireVA();
  const state = await getVaDayState(session.userId);
  const firstName = session.name.split(" ")[0] || session.name;

  return <VaDayClient firstName={firstName} state={state} />;
}
