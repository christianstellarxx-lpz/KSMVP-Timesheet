import type { PunctualityChip } from "@/lib/time";

export function StatusBadge({
  status,
}: {
  status: "OPEN" | "CLOSED" | "INCOMPLETE";
}) {
  const map = {
    OPEN: { label: "In progress", cls: "bg-brand-blue-50 text-brand-blue-700" },
    CLOSED: { label: "Complete", cls: "bg-emerald-50 text-emerald-700" },
    INCOMPLETE: {
      label: "Needs review",
      cls: "bg-brand-orange-100 text-brand-orange-800",
    },
  } as const;
  const { label, cls } = map[status];
  return <span className={`chip ${cls}`}>{label}</span>;
}

const CHIP_META: Record<
  PunctualityChip,
  { label: string; cls: string; dot: string }
> = {
  ON_TIME: {
    label: "On time",
    cls: "bg-brand-yellow-50 text-brand-yellow-800 ring-1 ring-brand-yellow-300",
    dot: "bg-brand-yellow-400",
  },
  LATE_IN: {
    label: "Late in",
    cls: "bg-brand-orange-50 text-brand-orange-800 ring-1 ring-brand-orange-200",
    dot: "bg-brand-orange-500",
  },
  EARLY_OUT: {
    label: "Early out",
    cls: "bg-brand-orange-50 text-brand-orange-800 ring-1 ring-brand-orange-200",
    dot: "bg-brand-orange-500",
  },
};

export function PunctualityChips({ chips }: { chips: PunctualityChip[] }) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => {
        const meta = CHIP_META[c];
        return (
          <span key={c} className={`chip ${meta.cls}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden />
            {meta.label}
          </span>
        );
      })}
    </div>
  );
}
