import { requireVA } from "@/lib/session";
import { getVaDayState } from "@/lib/timeEntries";
import { getWeekPlan } from "@/lib/plans";
import { getUnreadNoticesForUser } from "@/lib/notices";
import { dismissNoticeAction } from "@/app/notices/actions";
import { getActiveGamePromo } from "@/lib/leaderboards/registry";
import { GAMES_ENABLED } from "@/lib/features";
import { VaDayClient } from "@/components/va/VaDayClient";
import { getOfficePeople } from "@/lib/officeRoster";
import { OfficePanel } from "@/components/office/OfficePanel";

export const metadata = { title: "My Day — KSMVP VA Tasks" };
export const dynamic = "force-dynamic";

export default async function VaPage() {
  const session = await requireVA();
  const [state, weekPlan, notices, officePeople] = await Promise.all([
    getVaDayState(session.userId),
    getWeekPlan(session.userId),
    getUnreadNoticesForUser(session.userId),
    getOfficePeople(),
  ]);
  const firstName = session.name.split(" ")[0] || session.name;

  return (
    // The VA shell is max-w-6xl so the Games page can breathe; My Day keeps the
    // narrower reading column it has always had.
    <>
      <div className="mx-auto w-full max-w-3xl">
        <VaDayClient
          firstName={firstName}
          state={state}
          weekPlan={weekPlan}
          notices={notices}
          game={GAMES_ENABLED ? getActiveGamePromo() : null}
          dismissNoticeAction={dismissNoticeAction}
        />
      </div>
      {/* The live office uses the full shell width, under the reading column. */}
      {officePeople && (
        <div className="mt-10">
          <OfficePanel people={officePeople} />
        </div>
      )}
    </>
  );
}
