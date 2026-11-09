// The people in the live office, in desk order (D1..D11). This order is also the
// order the schedule hands out shared spots in. Shared by server and client, so it
// must hold nothing private: their login emails live in src/lib/officeRoster.ts.

/** `account: false` = office-only (Marc): no login, never hidden. */
export type OfficeMember = { slug: string; desk: string; account: boolean; firstName: string; exec: boolean };
export type OfficePersonDTO = { slug: string; desk: string; firstName: string };

export const OFFICE_ROSTER: readonly OfficeMember[] = [
  { slug: "kevin-spann", desk: "D1", account: true, firstName: "Kevin", exec: true },
  { slug: "tanya-crawford", desk: "D2", account: true, firstName: "Tanya", exec: true },
  // Marc (CIO) exists only in the office: no account, never hidden.
  { slug: "marc-fey", desk: "D3", account: false, firstName: "Marc", exec: true },
  { slug: "kristine-te", desk: "D4", account: true, firstName: "Kristine", exec: false },
  { slug: "jonathan-sarong", desk: "D5", account: true, firstName: "Jonathan", exec: false },
  { slug: "christian-lopez", desk: "D6", account: true, firstName: "Christian", exec: false },
  { slug: "bryxter-bulisig", desk: "D7", account: true, firstName: "Bryxter", exec: false },
  { slug: "gianfranco-adana", desk: "D8", account: true, firstName: "Gianfranco", exec: false },
  { slug: "jeannyn-jereza", desk: "D9", account: true, firstName: "Jeannyn", exec: false },
  { slug: "ginger-mesias", desk: "D10", account: true, firstName: "Ginger", exec: false },
  { slug: "venus-paglinawan", desk: "D11", account: true, firstName: "Venus", exec: false },
];

/** The executives always eat at the top end of the lunch table, in their desk order. */
export const EXEC_LUNCH_SEAT: Readonly<Record<string, string>> = {
  "tanya-crawford": "T1",
  "kevin-spann": "T2",
  "marc-fey": "T3",
};

/** Who shows today, by slug: Marc always; everyone else needs an active account and no PTO today. */
export function visibleMembers(activeSlugs: ReadonlySet<string>, ptoSlugs: ReadonlySet<string>): OfficePersonDTO[] {
  return OFFICE_ROSTER.filter((m) => !m.account || (activeSlugs.has(m.slug) && !ptoSlugs.has(m.slug))).map(
    ({ slug, desk, firstName }) => ({ slug, desk, firstName }),
  );
}

/** The office character for a login name ("Kevin Spann" -> "kevin-spann"), or null if they have none. */
export function officeSlugForName(name: string): string | null {
  const slug = name.trim().toLowerCase().split(/\s+/).join("-");
  return OFFICE_ROSTER.some((m) => m.slug === slug) ? slug : null;
}
