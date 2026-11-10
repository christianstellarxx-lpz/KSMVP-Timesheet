"use server";

import { requireVA } from "@/lib/session";
import { markNewRulesSeen } from "@/lib/trapshift/game";

/** "Got it" on the one-time Trap Shift v3 banner. Stored per user, not in the browser. */
export async function dismissTrapShiftNewRulesAction(): Promise<void> {
  const session = await requireVA();
  await markNewRulesSeen(session.userId);
}
