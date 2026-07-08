import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { hashPassword } from "./password";
import { canViewVa, type Role } from "./session";
import { DEFAULT_PIN, type AddMemberInput } from "./validation";

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  title: string;
  role: Role;
  entryCount: number;
  hasVaDashboard: boolean;
}

const ROLE_ORDER: Record<Role, number> = {
  ADMIN: 0,
  VA_ADMIN: 1,
  SALES_PRODUCER: 2,
  VA: 3,
  INTERN: 4,
};

/** The full org roster, ordered by role then name. */
export async function getTeamMembers(): Promise<TeamMember[]> {
  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      title: true,
      role: true,
      _count: { select: { timeEntries: true } },
    },
  });
  return users
    .map((u) => {
      const role = u.role as Role;
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        title: u.title,
        role,
        entryCount: u._count.timeEntries,
        hasVaDashboard: canViewVa(role),
      };
    })
    .sort(
      (a, b) =>
        ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name),
    );
}

export type AddMemberResult =
  | { ok: true; name: string }
  | { ok: false; message: string };

export async function addTeamMember(
  input: AddMemberInput,
): Promise<AddMemberResult> {
  // New members start with the default PIN; they change it in Account settings.
  const passwordHash = await hashPassword(DEFAULT_PIN);
  try {
    const user = await prisma.user.create({
      data: {
        role: input.role,
        name: input.name,
        title: input.title,
        email: input.email.toLowerCase(),
        passwordHash,
      },
      select: { name: true },
    });
    return { ok: true, name: user.name };
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return { ok: false, message: "An account with that email already exists." };
    }
    return { ok: false, message: "Could not create the member. Please try again." };
  }
}
