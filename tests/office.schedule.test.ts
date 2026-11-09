import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { planDay, periodFor, type DayPlan } from "@/lib/office/schedule";
import { OFFICE_ROSTER, EXEC_LUNCH_SEAT } from "@/lib/office/roster";

const TEAM = OFFICE_ROSTER.map(({ slug, desk }) => ({ slug, desk }));
const MON = "2026-11-09";

function weekdays(from: string, n: number): string[] {
  const out: string[] = [];
  for (let d = DateTime.fromISO(from); out.length < n; d = d.plus({ days: 1 })) {
    if (d.weekday <= 5) out.push(d.toISODate()!);
  }
  return out;
}

/** Spot -> slugs occupying it at `minute`, for every spot except the CR door. */
function occupied(plan: DayPlan, minute: number): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const [slug, segs] of Object.entries(plan)) {
    const s = segs.find((g) => g.start <= minute && minute < g.end);
    if (!s || s.spot === "CR") continue;
    m.set(s.spot, [...(m.get(s.spot) ?? []), slug]);
  }
  return m;
}

describe("planDay", () => {
  it("same inputs, same plan", () => {
    expect(planDay(MON, TEAM)).toEqual(planDay(MON, TEAM));
  });

  it("weekends are empty, DST dates resolve", () => {
    for (const d of ["2026-11-07", "2026-11-08", "2026-03-08", "2026-11-01"]) expect(planDay(d, TEAM)).toEqual({});
    expect(Object.keys(planDay("2026-03-09", TEAM))).toHaveLength(11);
  });

  it("everyone is at their desk by 8:15", () => {
    for (const { slug, desk } of TEAM) {
      const first = planDay(MON, TEAM)[slug][0];
      expect(first.activity).toBe("arrive");
      expect(first.start).toBeGreaterThanOrEqual(470);
      expect(first.start).toBeLessThanOrEqual(490);
      expect(first.end).toBe(495);
      expect(first.spot).toBe(desk);
    }
  });

  it("everyone is gone by 5:15", () => {
    for (const segs of Object.values(planDay(MON, TEAM))) {
      const last = segs[segs.length - 1];
      expect(last.activity).toBe("leave");
      expect(last.spot).toBe("EXIT");
      expect(last.end).toBeLessThanOrEqual(1035);
    }
  });

  it("lunch falls inside 11:30-1:30", () => {
    for (const date of weekdays(MON, 20))
      for (const segs of Object.values(planDay(date, TEAM)))
        for (const s of segs.filter((g) => g.activity === "lunch")) {
          expect(s.start).toBeGreaterThanOrEqual(690);
          expect(s.end).toBeLessThanOrEqual(810);
        }
  });

  it("execs eat at the top end, VAs never do", () => {
    for (const date of weekdays(MON, 20))
      for (const [slug, segs] of Object.entries(planDay(date, TEAM)))
        for (const s of segs.filter((g) => g.activity === "lunch")) {
          if (EXEC_LUNCH_SEAT[slug]) expect(s.spot).toBe(EXEC_LUNCH_SEAT[slug]);
          else expect(s.spot).not.toMatch(/^T/);
        }
  });

  it("nobody shares a spot, even with more people than spots", () => {
    const crowd = Array.from({ length: 30 }, (_, i) => ({ slug: `p${i}`, desk: `D${i + 1}` }));
    for (const people of [TEAM, crowd])
      for (const date of weekdays(MON, 20)) {
        const plan = planDay(date, people);
        for (let minute = 495; minute < 1005; minute += 15)
          for (const [spot, who] of occupied(plan, minute)) expect(who, `${date} ${minute} ${spot}`).toHaveLength(1);
      }
  });

  it("a hidden person is never planned or paired", () => {
    const plan = planDay(MON, TEAM.filter((p) => p.slug !== "gianfranco-adana"));
    expect(plan["gianfranco-adana"]).toBeUndefined();
    expect(Object.keys(plan)).toHaveLength(10);
  });

  it("only Marc: one person, never in a talk pair", () => {
    for (const date of weekdays(MON, 20)) {
      const plan = planDay(date, [{ slug: "marc-fey", desk: "D3" }]);
      expect(Object.keys(plan)).toEqual(["marc-fey"]);
      expect(plan["marc-fey"].some((s) => s.activity === "talk" || s.activity === "laugh")).toBe(false);
    }
  });

  it("talk pairs only form between two people in the same slot", () => {
    for (const date of weekdays(MON, 20)) {
      const plan = planDay(date, TEAM);
      for (let minute = 495; minute < 1005; minute += 15) {
        const occ = occupied(plan, minute);
        for (const [a, b] of [["G1", "G2"], ["G3", "G4"]]) expect(occ.has(a)).toBe(occ.has(b));
      }
    }
  });
});

describe("periodFor", () => {
  it("switches at 5:00 AM, noon and 5:00 PM", () => {
    expect(periodFor(299)).toBe("evening");
    expect(periodFor(300)).toBe("morning");
    expect(periodFor(719)).toBe("morning");
    expect(periodFor(720)).toBe("afternoon");
    expect(periodFor(1019)).toBe("afternoon");
    expect(periodFor(1020)).toBe("evening");
  });
});
