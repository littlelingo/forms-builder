interface StatusBadgeProps {
  tone: "info" | "warning" | "error" | "success" | "neutral";
  children: string;
  system?: "shadcn" | "uswds";
}

const toneClasses: Record<StatusBadgeProps["tone"], string> = {
  info: "border-sky-200 bg-sky-50 text-sky-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  error: "border-rose-200 bg-rose-50 text-rose-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
};

export function StatusBadge({ tone, children, system = "shadcn" }: StatusBadgeProps) {
  const baseClass =
    system === "uswds"
      ? "inline-flex items-center rounded-sm border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em]"
      : "inline-flex items-center rounded-md border px-2.5 py-1 text-[0.68rem] font-medium uppercase tracking-[0.14em]";
  return <span className={`${baseClass} ${toneClasses[tone]}`}>{children}</span>;
}
