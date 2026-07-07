"use client";

import { useEffect, useState } from "react";

const ET = "America/New_York";

/** Large live ET wall clock. Renders nothing until mounted to avoid SSR mismatch. */
export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: ET,
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }).format(now)
    : "—:—:—";

  return (
    <span
      className="font-heading text-3xl font-bold tabular-nums tracking-tight text-brand-blue-700 sm:text-4xl"
      aria-live="off"
    >
      {time}
      <span className="ml-1 align-top text-xs font-semibold text-[var(--text-muted)]">
        ET
      </span>
    </span>
  );
}
