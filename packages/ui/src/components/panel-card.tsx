import type { PropsWithChildren, ReactNode } from "react";

interface PanelCardProps extends PropsWithChildren {
  title: string;
  eyebrow?: string;
  aside?: ReactNode;
  className?: string;
  system?: "shadcn" | "uswds";
}

export function PanelCard({ title, eyebrow, aside, className = "", system = "shadcn", children }: PanelCardProps) {
  const shellClass =
    system === "uswds"
      ? "rounded-sm border border-slate-300 bg-white p-5 shadow-sm"
      : "rounded-2xl border border-slate-200/80 bg-white/96 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_32px_rgba(15,23,42,0.06)] backdrop-blur";
  return (
    <section className={`${shellClass} ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="mb-1.5 text-[0.64rem] font-semibold uppercase tracking-[0.22em] text-slate-500">{eyebrow}</p>
          ) : null}
          <h2 className="font-display text-[1.15rem] leading-none text-slate-950">{title}</h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}
