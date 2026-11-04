import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { hashPassword } from "./password";
import { canViewVa, type Role } from "./session";
import { formatEtDateLong, etDateStringForInstant } from "./time";
import { DEFAULT_PIN, type AddMemberInput } from "./validation";

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  title: string;
  role: Role;
  entryCount: number;
  hasVaDashboard: boolean;
  /** "Wed, Nov 4, 2026" when removed from the team; null while active. */
  removedOnLabel: string | null;
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
      removedAt: true,
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
        removedOnLabel: u.removedAt
          ? formatEtDateLong(etDateStringForInstant(u.removedAt))
          : null,
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
      return {
        ok: false,
        message:
          "An account with that email already exists. If they were removed, restore them under Removed members.",
      };
    }
    return { ok: false, message: "Could not create the member. Please try again." };
  }
}

/**
 * Remove a member from the team — a soft remove (see User.removedAt): they
 * can't sign in and leave the roster, but their reports and the feedback they
 * wrote are kept. Nobody can remove themselves, which also means the last
 * admin can never be removed (only admins can remove, so one always remains).
 */
export async function removeTeamMember(
  actorId: string,
  memberId: string,
): Promise<void> {
  if (!memberId || memberId === actorId) return;
  await prisma.user.updateMany({
    where: { id: memberId, removedAt: null },
    data: { removedAt: new Date() },
  });
}

/** Bring a removed member back. Their PIN and history are unchanged. */
export async function restoreTeamMember(memberId: string): Promise<void> {
  if (!memberId) return;
  await prisma.user.updateMany({
    where: { id: memberId, removedAt: { not: null } },
    data: { removedAt: null },
  });
}
