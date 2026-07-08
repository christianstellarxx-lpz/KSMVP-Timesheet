import { requireVA } from "@/lib/session";
import { getVaDayState } from "@/lib/timeEntries";
import { getGameState } from "@/lib/game";
import { getUnreadNoticesForUser } from "@/lib/notices";
import { dismissNoticeAction } from "@/app/notices/actions";
import { VaDayClient } from "@/components/va/VaDayClient";

export const metadata = { title: "My Day — KSMVP VA Tasks" };
export const dynamic = "force-dynamic";

export default async function VaPage() {
  const session = await requireVA();
  const [state, game, notices] = await Promise.all([
    getVaDayState(session.userId),
    getGameState(session.userId),
    getUnreadNoticesForUser(session.userId),
  ]);
  const firstName = session.name.split(" ")[0] || session.name;

  return (
    <VaDayClient
      firstName={firstName}
      state={state}
      game={game}
      meId={session.userId}
      notices={notices}
      dismissNoticeAction={dismissNoticeAction}
    />
  );
}
