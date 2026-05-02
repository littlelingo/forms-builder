interface MetricTileProps {
  label: string;
  value: string;
}

export function MetricTile({ label, value }: MetricTileProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <p className="text-[0.64rem] uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1.5 font-display text-2xl text-slate-950">{value}</p>
    </div>
  );
}
