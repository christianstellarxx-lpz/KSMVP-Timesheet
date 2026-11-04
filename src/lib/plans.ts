import "server-only";
import { prisma } from "./prisma";
import { withTx, messageFrom, type MutationResult } from "./timeEntries";
import {
  etPlanWeek,
  etToday,
  etDateStringToStorageDate,
  storageDateToEtDateString,
  formatEtDateLong,
} from "./time";
import type { WeekPlanInput } from "./validation";

/** One day in the weekly planner. */
export interface PlanDayDTO {
  date: string;
  label: string;
  tasks: string;
  /**
   * Past days and days already logged (Start of Day sent, or PTO) can't be
   * planned — the plan only ever prefills a Start of Day that hasn't happened.
   */
  locked: boolean;
}

/** The Mon–Fri planner for this VA (next week's, on a weekend). */
export async function getWeekPlan(vaId: string): Promise<PlanDayDTO[]> {
  const week = etPlanWeek();
  const storage = week.map(etDateStringToStorageDate);
  const [plans, entries] = await Promise.all([
    prisma.dayPlan.findMany({ where: { vaId, workDate: { in: storage } } }),
    prisma.timeEntry.findMany({
      where: { vaId, workDate: { in: storage } },
      select: { workDate: true },
    }),
  ]);
  const planByDate = new Map(
    plans.map((p) => [storageDateToEtDateString(p.workDate), p.startOfDayTasks]),
  );
  const logged = new Set(entries.map((e) => storageDateToEtDateString(e.workDate)));
  const today = etToday();

  return week.map((date) => ({
    date,
    label: formatEtDateLong(date),
    tasks: planByDate.get(date) ?? "",
    locked: date < today || logged.has(date),
  }));
}

/**
 * Save the planner. A filled box upserts that day's plan; an empty box deletes
 * it. Locked days are skipped rather than rejected — the form disables them, so
 * they only arrive here from a tab left open across a Start of Day.
 */
export async function saveWeekPlan(
  vaId: string,
  days: WeekPlanInput,
): Promise<MutationResult> {
  const week = new Set(etPlanWeek());
  if (days.some((d) => !week.has(d.date))) {
    return { ok: false, message: "This plan is for a different week. Reload and try again." };
  }

  try {
    const current = await getWeekPlan(vaId);
    const editable = new Set(current.filter((d) => !d.locked).map((d) => d.date));

    await withTx(async (tx) => {
      for (const day of days) {
        if (!editable.has(day.date)) continue;
        const workDate = etDateStringToStorageDate(day.date);
        if (day.tasks) {
          await tx.dayPlan.upsert({
            where: { vaId_workDate: { vaId, workDate } },
            create: { vaId, workDate, startOfDayTasks: day.tasks },
            update: { startOfDayTasks: day.tasks },
          });
        } else {
          await tx.dayPlan.deleteMany({ where: { vaId, workDate } });
        }
      }
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: messageFrom(e) };
  }
}
