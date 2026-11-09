// The office's day, as a pure function of (ET date, who is visible). Every viewer
// computes the same plan, so everyone sees the same office with no server state.
// Times are minutes after ET midnight.
import { DateTime } from "luxon";
import { ET_ZONE } from "@/lib/time";
import { EXEC_LUNCH_SEAT, LATE_LEAVE } from "@/lib/office/roster";

export type Activity =
  | "arrive" | "work" | "coffee" | "lunch" | "talk" | "laugh" | "armchair" | "workout" | "cr" | "leave";
/** `end` is exclusive. `spot` is a seats.txt code: the desk, a seat, "CR" or "EXIT". */
export type Segment = { start: number; end: number; activity: Activity; spot: string };
export type DayPlan = Record<string, Segment[]>;
export type Period = "morning" | "afternoon" | "evening";

export const SLOT = 15;
export const DAY_START = 495; // 8:15 AM
export const SLOTS = 38; // through 5:45 PM; everyone leaves at 6:00 PM
export const DAY_END = DAY_START + SLOT * SLOTS;

const LUNCH_FIRST_SLOT = 13; // 11:30 AM
const LUNCH_LAST_END = 21; // lunch ends by slot 21 = 1:30 PM
const VA_LUNCH_SEATS = ["L1", "L2", "L3", "L4", "R1", "R2", "R3", "R4", "R5", "B1", "B2"];
const COFFEE = ["C1", "C2", "C3"];
const WORKOUT = ["W1", "W2", "W3"];
const ARMCHAIRS = ["A1", "A2", "A3", "A4"];
const PAIRS: [string, string][] = [["G1", "G2"], ["G3", "G4"]];

/** Background / time of day: morning 5:00-11:59, afternoon 12:00-4:59 PM, else evening. */
export function periodFor(minuteOfDay: number): Period {
  if (minuteOfDay >= 300 && minuteOfDay < 720) return "morning";
  if (minuteOfDay >= 720 && minuteOfDay < 1020) return "afternoon";
  return "evening";
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Extra = "coffee" | "lounge" | "cr" | "workout";
type Draw = { arrive: number; leave: number; lunchStart: number; lunchLen: number; extras: Map<number, Extra> };

function draw(etDate: string, slug: string): Draw {
  const r = mulberry32(fnv1a(`${etDate}|${slug}`));
  const arrive = 470 + Math.floor(r() * 21);
  const leave = LATE_LEAVE[slug] ?? 1080 + Math.floor(r() * 11);
  const lunchLen = 3 + (r() < 0.5 ? 1 : 0);
  const lunchStart = LUNCH_FIRST_SLOT + Math.floor(r() * (LUNCH_LAST_END - lunchLen - LUNCH_FIRST_SLOT + 1));
  const free = Array.from({ length: SLOTS }, (_, k) => k).filter((k) => k < lunchStart || k >= lunchStart + lunchLen);
  const extras = new Map<number, Extra>();
  const wanted: Extra[] = ["coffee", "coffee", "lounge", "cr"];
  for (const e of wanted) extras.set(free.splice(Math.floor(r() * free.length), 1)[0], e);
  if (r() < 0.5) extras.set(free.splice(Math.floor(r() * free.length), 1)[0], "workout");
  return { arrive, leave, lunchStart, lunchLen, extras };
}

export function planDay(etDate: string, people: readonly { slug: string; desk: string }[]): DayPlan {
  if (DateTime.fromISO(etDate, { zone: ET_ZONE }).weekday >= 6) return {};
  const draws = people.map((p) => draw(etDate, p.slug));
  const slots = people.map((p) => Array.from({ length: SLOTS }, () => ({ activity: "work" as Activity, spot: p.desk })));
  const taken = Array.from({ length: SLOTS }, () => new Set<string>());
  const firstFree = (k: number, spots: string[]) => spots.find((s) => !taken[k].has(s));

  for (let k = 0; k < SLOTS; k++) {
    const lounge: number[] = [];
    people.forEach((p, i) => {
      const d = draws[i];
      const take = (activity: Activity, spot: string | undefined) => {
        if (!spot) return; // nothing free: stays at the desk
        slots[i][k] = { activity, spot };
        taken[k].add(spot);
      };
      if (k === d.lunchStart) {
        const span = Array.from({ length: d.lunchLen }, (_, j) => k + j);
        const seat = EXEC_LUNCH_SEAT[p.slug] ?? VA_LUNCH_SEATS.find((s) => span.every((j) => !taken[j].has(s)));
        if (seat) for (const j of span) { slots[i][j] = { activity: "lunch", spot: seat }; taken[j].add(seat); }
        return;
      }
      const extra = d.extras.get(k);
      if (extra === "coffee") take("coffee", firstFree(k, COFFEE));
      else if (extra === "workout") take("workout", firstFree(k, WORKOUT));
      else if (extra === "cr") slots[i][k] = { activity: "cr", spot: "CR" };
      else if (extra === "lounge") lounge.push(i);
    });
    // A talk pair needs two people who both drew the lounge this slot; the rest take an armchair.
    const pairs = Math.min(PAIRS.length, Math.floor(lounge.length / 2));
    for (let p = 0; p < pairs; p++) {
      const activity: Activity = fnv1a(`${etDate}|${k}|${p}`) % 3 === 0 ? "laugh" : "talk";
      [0, 1].forEach((side) => {
        slots[lounge[2 * p + side]][k] = { activity, spot: PAIRS[p][side] };
        taken[k].add(PAIRS[p][side]);
      });
    }
    for (const i of lounge.slice(2 * pairs)) {
      const seat = firstFree(k, ARMCHAIRS);
      if (seat) { slots[i][k] = { activity: "armchair", spot: seat }; taken[k].add(seat); }
    }
  }

  const plan: DayPlan = {};
  people.forEach((p, i) => {
    const d = draws[i];
    const day: Segment[] = slots[i].map((s, k) => ({ start: DAY_START + k * SLOT, end: DAY_START + (k + 1) * SLOT, ...s }));
    day.push({ start: DAY_END, end: d.leave, activity: "work", spot: p.desk });
    const merged: Segment[] = [];
    for (const s of day) {
      const prev = merged[merged.length - 1];
      if (prev && prev.activity === s.activity && prev.spot === s.spot) prev.end = s.end;
      else merged.push({ ...s });
    }
    plan[p.slug] = [
      { start: d.arrive, end: DAY_START, activity: "arrive", spot: p.desk },
      ...merged,
      { start: d.leave, end: d.leave + 5, activity: "leave", spot: "EXIT" },
    ];
  });
  return plan;
}
