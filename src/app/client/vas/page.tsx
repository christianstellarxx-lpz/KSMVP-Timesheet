import Link from "next/link";
import { requireAdmin, roleLabel, type Role } from "@/lib/session";
import { getTeamMembers } from "@/lib/vas";
import { AddVaButton } from "@/components/client/AddVaButton";

export const metadata = { title: "Team — KSMVP VA Tasks" };
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  await requireAdmin();
  const members = await getTeamMembers();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-blue-700">Team</h1>
          <p className="text-sm text-[var(--text-muted)]">
            {members.length} member{members.length === 1 ? "" : "s"} across the
            organization.
          </p>
        </div>
        <AddVaButton />
      </div>

      {/* Mobile: stacked cards */}
      <ul className="space-y-3 md:hidden">
        {members.map((m) => (
          <li key={m.id} className="card p-4">
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-blue-600 text-xs font-heading font-bold text-white"
              >
                {initials(m.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-heading font-semibold text-[var(--text)]">
                  {m.name}
                </p>
                <p className="text-xs text-[var(--text-muted)]">{m.title}</p>
                <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
                  {m.email}
                </p>
              </div>
              <RoleBadge role={m.role} />
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3 text-sm">
              <span className="text-[var(--text-muted)]">
                {m.hasVaDashboard ? `${m.entryCount} entries` : "—"}
              </span>
              {m.hasVaDashboard && (
                <Link
                  href={`/client?vaId=${m.id}`}
                  className="font-heading font-medium text-brand-blue-700 hover:underline"
                >
                  View activity
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto rounded-card border border-[var(--border)] bg-white shadow-card md:block">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="bg-brand-blue-600 text-left text-white">
              <th className="px-4 py-3 font-heading font-semibold sm:px-5">
                Name &amp; title
              </th>
              <th className="px-4 py-3 font-heading font-semibold sm:px-5">
                Email
              </th>
              <th className="px-4 py-3 font-heading font-semibold sm:px-5">
                Role
              </th>
              <th className="px-4 py-3 text-right font-heading font-semibold sm:px-5">
                Entries
              </th>
              <th className="px-4 py-3 text-right font-heading font-semibold sm:px-5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {members.map((m) => (
              <tr key={m.id} className="hover:bg-[var(--surface-muted)]/60">
                <td className="px-4 py-3 sm:px-5">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-blue-600 text-xs font-heading font-bold text-white"
                    >
                      {initials(m.name)}
                    </span>
                    <div>
                      <p className="font-heading font-semibold text-[var(--text)]">
                        {m.name}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {m.title}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-[var(--text-muted)] sm:px-5">
                  {m.email}
                </td>
                <td className="px-4 py-3 sm:px-5">
                  <RoleBadge role={m.role} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums sm:px-5">
                  {m.hasVaDashboard ? m.entryCount : "—"}
                </td>
                <td className="px-4 py-3 text-right sm:px-5">
                  {m.hasVaDashboard ? (
                    <Link
                      href={`/client?vaId=${m.id}`}
                      className="font-heading text-sm font-medium text-brand-blue-700 hover:underline"
                    >
                      View activity
                    </Link>
                  ) : (
                    <span className="text-xs text-[var(--text-muted)]">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: Role }) {
  const cls: Record<Role, string> = {
    ADMIN: "bg-brand-blue-100 text-brand-blue-800",
    VA_ADMIN: "bg-emerald-50 text-emerald-700",
    VA: "bg-emerald-50 text-emerald-700",
    INTERN: "bg-[var(--surface-muted)] text-[var(--text-muted)]",
  };
  return <span className={`chip ${cls[role]}`}>{roleLabel(role)}</span>;
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
