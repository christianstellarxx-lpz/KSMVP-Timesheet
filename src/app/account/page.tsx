import { requireUser, roleLabel } from "@/lib/session";
import { ChangePinForm } from "@/components/ChangePinForm";

export const metadata = { title: "Account — KSMVP VA Tasks" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await requireUser();
  const initials = session.name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-blue-700">Account</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Your profile and sign-in settings.
        </p>
      </div>

      {/* Profile */}
      <section className="card p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <span
            aria-hidden
            className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-brand-blue-600 text-lg font-heading font-bold text-white"
          >
            {initials}
          </span>
          <div className="min-w-0">
            <p className="truncate font-heading text-lg font-bold text-[var(--text)]">
              {session.name}
            </p>
            {session.title && (
              <p className="truncate text-sm text-[var(--text-muted)]">
                {session.title}
              </p>
            )}
          </div>
          <span className="ml-auto chip bg-brand-blue-50 text-brand-blue-700">
            {roleLabel(session.role)}
          </span>
        </div>

        <dl className="mt-5 grid gap-4 border-t border-[var(--border)] pt-5 sm:grid-cols-2">
          <div>
            <dt className="field-label mb-0">Email</dt>
            <dd className="text-sm text-[var(--text)]">{session.email}</dd>
          </div>
          <div>
            <dt className="field-label mb-0">Role</dt>
            <dd className="text-sm text-[var(--text)]">
              {roleLabel(session.role)}
            </dd>
          </div>
        </dl>
      </section>

      {/* Change PIN */}
      <section className="card p-5 sm:p-6">
        <h2 className="text-lg font-bold text-brand-blue-700">Change PIN</h2>
        <p className="mb-5 mt-0.5 text-sm text-[var(--text-muted)]">
          Set a 4-digit PIN only you know. New accounts start with{" "}
          <span className="font-mono font-semibold">0000</span>.
        </p>
        <ChangePinForm />
      </section>
    </div>
  );
}
