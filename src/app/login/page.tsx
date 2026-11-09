import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { QuickLogin, type QuickUser } from "@/components/QuickLogin";
import { prisma } from "@/lib/prisma";
import { getSession, homePathForRole } from "@/lib/session";
import { getOfficePeople } from "@/lib/officeRoster";
import { OfficePanel } from "@/components/office/OfficePanel";
import { officeSlugForName } from "@/lib/office/roster";

export const metadata = { title: "Sign in — KSMVP VA Tasks" };
export const dynamic = "force-dynamic";

// Roles that appear in the "Admins" box on login. The Sales Producer sits here
// alongside the admins (she has an org-level desk), not with the Virtual Team.
const ADMIN_BOX_ROLES = new Set(["ADMIN", "SALES_PRODUCER"]);

const TEAM_ROLE_ORDER: Record<string, number> = {
  VA_ADMIN: 0,
  VA: 1,
  INTERN: 2,
};

function avatarFor(name: string): string | null {
  const slug = officeSlugForName(name);
  return slug ? `/office/web/heads/${slug}.webp` : null;
}

function toQuickUser(u: { id: string; name: string; title: string }): QuickUser {
  return {
    id: u.id,
    name: u.name,
    title: u.title,
    firstName: u.name.split(" ")[0] || u.name,
    // Their office character's headshot; people without one keep their initials.
    avatar: avatarFor(u.name),
  };
}

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(homePathForRole(session.role));

  const [users, officePeople] = await Promise.all([
    prisma.user.findMany({
      where: { removedAt: null },
      select: { id: true, name: true, title: true, role: true },
      orderBy: { name: "asc" },
    }),
    getOfficePeople(),
  ]);

  const admins = users
    .filter((u) => ADMIN_BOX_ROLES.has(u.role))
    .map(toQuickUser);
  const team = users
    .filter((u) => !ADMIN_BOX_ROLES.has(u.role))
    .sort(
      (a, b) =>
        (TEAM_ROLE_ORDER[a.role] ?? 9) - (TEAM_ROLE_ORDER[b.role] ?? 9) ||
        a.name.localeCompare(b.name),
    )
    .map(toQuickUser);

  return (
    // Desktop: the login card and the live office side by side, as one centered
    // group (max 1400px, 56px apart, never touching the screen edges). Below lg
    // the office is not rendered and the card is centered on its own, as before.
    <main className="flex min-h-screen items-center justify-center px-4 py-10 lg:px-12 lg:py-12">
      <div className="flex w-full max-w-[1400px] flex-col items-center lg:flex-row lg:justify-center lg:gap-14">
        <div className="w-full max-w-md lg:shrink-0">
          <div className="mb-6 flex justify-center">
            <Logo />
          </div>

          <div className="mb-5 text-center">
            <h1 className="text-xl font-bold text-brand-blue-700">Welcome back</h1>
            <p className="text-sm text-[var(--text-muted)]">
              Tap your name, then enter your 4-digit PIN.
            </p>
          </div>

          <QuickLogin admins={admins} team={team} />

          <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
            <Link href="/" className="hover:text-brand-blue-600">
              KSMVP VA Tasks
            </Link>{" "}
            · We Make AI Easy
          </p>
        </div>
        {officePeople && (
          <div className="hidden min-w-0 flex-1 lg:block">
            <OfficePanel people={officePeople} />
          </div>
        )}
      </div>
    </main>
  );
}
