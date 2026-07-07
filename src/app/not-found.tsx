import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo />
      <div>
        <p className="font-heading text-5xl font-bold text-brand-blue-700">404</p>
        <p className="mt-2 text-[var(--text-muted)]">
          We couldn’t find that page.
        </p>
      </div>
      <Link href="/" className="btn-primary">
        Back to home
      </Link>
    </main>
  );
}
