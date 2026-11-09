import "server-only";
import { prisma } from "@/lib/prisma";
import { etDateStringToStorageDate, etToday } from "@/lib/time";
import { visibleMembers, type OfficePersonDTO } from "@/lib/office/roster";

// Login emails of the office people with accounts (as seeded, lowercase). Kept
// server-side: the roster in src/lib/office/roster.ts ships to the browser.
const EMAIL_BY_SLUG: Readonly<Record<string, string>> = {
  "kevin-spann": "akspann1@gmail.com",
  "tanya-crawford": "tanya@kevinspann.com",
  "kristine-te": "kristine@kevinspann.com",
  "jonathan-sarong": "jonathan@kevinspann.com",
  "christian-lopez": "christian@kevinspann.com",
  "bryxter-bulisig": "bryxter@kevinspann.com",
  "gianfranco-adana": "franco@kevinspann.com",
  "jeannyn-jereza": "jeannyn@kevinspann.com",
  "ginger-mesias": "ginger@kevinspann.com",
  "venus-paglinawan": "venus@kevinspann.com",
};

/**
 * The office people to show today: hides removed members and anyone on PTO (ET day).
 * Returns null if the database fails, so the page shows no office instead of an error:
 * the office is decoration and must never stand between a VA and the login form.
 */
export async function getOfficePeople(now: Date = new Date()): Promise<OfficePersonDTO[] | null> {
  try {
    return await loadOfficePeople(now);
  } catch {
    return null;
  }
}

async function loadOfficePeople(now: Date): Promise<OfficePersonDTO[]> {
  const slugByEmail = new Map(Object.entries(EMAIL_BY_SLUG).map(([slug, email]) => [email, slug]));
  const users = await prisma.user.findMany({
    where: { email: { in: [...slugByEmail.keys()] }, removedAt: null },
    select: { id: true, email: true },
  });
  const pto = await prisma.timeEntry.findMany({
    where: {
      vaId: { in: users.map((u) => u.id) },
      workDate: etDateStringToStorageDate(etToday(now)),
      entryType: "PTO",
    },
    select: { vaId: true },
  });
  const ptoIds = new Set(pto.map((e) => e.vaId));
  const slugOf = (u: { email: string }) => slugByEmail.get(u.email)!;
  return visibleMembers(
    new Set(users.map(slugOf)),
    new Set(users.filter((u) => ptoIds.has(u.id)).map(slugOf)),
  );
}
