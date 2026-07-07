import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { QuickLogin, type QuickUser } from "@/components/QuickLogin";
import { prisma } from "@/lib/prisma";
import { getSession, homePathForRole } from "@/lib/session";

export const metadata = { title: "Sign in — KSMVP VA Tasks" };
export const dynamic = "force-dynamic";

const TEAM_ROLE_ORDER: Record<string, number> = {
  VA_ADMIN: 0,
  VA: 1,
  INTERN: 2,
};

function toQuickUser(u: { id: string; name: string; title: string }): QuickUser {
  return {
    id: u.id,
    name: u.name,
    title: u.title,
    firstName: u.name.split(" ")[0] || u.name,
  };
}

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(homePathForRole(session.role));

  const users = await prisma.user.findMany({
    select: { id: true, name: true, title: true, role: true },
    orderBy: { name: "asc" },
  });

  const admins = users
    .filter((u) => u.role === "ADMIN")
    .map(toQuickUser);
  const team = users
    .filter((u) => u.role !== "ADMIN")
    .sort(
      (a, b) =>
        (TEAM_ROLE_ORDER[a.role] ?? 9) - (TEAM_ROLE_ORDER[b.role] ?? 9) ||
        a.name.localeCompare(b.name),
    )
    .map(toQuickUser);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
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
    </main>
  );
}
