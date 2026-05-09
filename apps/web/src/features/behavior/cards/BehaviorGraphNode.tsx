export interface BehaviorGraphNodeProps {
  eyebrow: string;
  title: string;
  detail: string;
  tone: "blue" | "emerald" | "amber";
  active?: boolean;
  compact?: boolean;
  onClick?: () => void;
}

export function BehaviorGraphNode(props: BehaviorGraphNodeProps) {
  const toneClass =
    props.tone === "blue"
      ? props.active
        ? "border-blue-400 bg-blue-50 text-blue-950 shadow-[0_10px_24px_rgba(37,99,235,0.12)]"
        : "border-blue-200 bg-blue-50/70 text-slate-900"
      : props.tone === "emerald"
        ? props.active
          ? "border-emerald-400 bg-emerald-50 text-emerald-950 shadow-[0_10px_24px_rgba(5,150,105,0.12)]"
          : "border-emerald-200 bg-emerald-50/70 text-slate-900"
        : props.active
          ? "border-amber-400 bg-amber-50 text-amber-950 shadow-[0_10px_24px_rgba(217,119,6,0.12)]"
          : "border-amber-200 bg-amber-50/80 text-slate-900";
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`rounded-[1rem] border text-left transition hover:-translate-y-0.5 hover:border-slate-300 ${
        props.compact ? "min-w-[10rem] px-3 py-2.5" : "min-w-[12rem] px-4 py-3"
      } ${toneClass}`}
    >
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">{props.eyebrow}</p>
      <p className={`font-semibold ${props.compact ? "mt-1.5 text-sm" : "mt-2"}`}>{props.title}</p>
      <p className={`text-slate-600 ${props.compact ? "mt-1.5 text-xs leading-5" : "mt-2 text-sm leading-6"}`}>
        {props.detail}
      </p>
    </button>
  );
}

export interface BehaviorEdgeLabelProps {
  label: string;
  compact?: boolean;
}

export function BehaviorEdgeLabel(props: BehaviorEdgeLabelProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-slate-200 bg-white font-semibold uppercase tracking-[0.16em] text-slate-500 ${
        props.compact ? "px-2.5 py-1 text-[0.62rem]" : "px-3 py-1 text-[0.68rem]"
      }`}
    >
      {props.label}
    </span>
  );
}
