import { describe, it, expect } from "vitest";
import { weekPlanSchema, startDaySchema, endDaySchema } from "@/lib/validation";

describe("weekPlanSchema", () => {
  it("trims tasks and turns an empty box into 'no plan'", () => {
    const parsed = weekPlanSchema.parse([
      { date: "2026-11-02", tasks: "  Update CRM  " },
      { date: "2026-11-03", tasks: "   " },
    ]);
    expect(parsed).toEqual([
      { date: "2026-11-02", tasks: "Update CRM" },
      { date: "2026-11-03", tasks: undefined },
    ]);
  });

  it("rejects a malformed date and more than five days", () => {
    expect(weekPlanSchema.safeParse([{ date: "Nov 2", tasks: "x" }]).success).toBe(false);
    const six = Array.from({ length: 6 }, (_, i) => ({ date: `2026-11-0${i + 1}`, tasks: "x" }));
    expect(weekPlanSchema.safeParse(six).success).toBe(false);
  });
});

describe("Start / End of Day schemas carry no clock fields", () => {
  it("accepts a Start of Day with just tasks", () => {
    expect(startDaySchema.parse({ startOfDayTasks: "Plan", urgentNeed: "" })).toEqual({
      startOfDayTasks: "Plan",
      urgentNeed: undefined,
    });
  });

  it("requires End-of-Day text", () => {
    expect(endDaySchema.safeParse({ endOfDayTasks: "  " }).success).toBe(false);
  });
});
