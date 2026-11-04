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
