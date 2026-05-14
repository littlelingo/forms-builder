import type { ReactNode } from "react";

export interface BehaviorGraphNodeProps {
  eyebrow: string;
  title: string;
  detail: string;
  tone: "blue" | "emerald" | "amber";
  active?: boolean;
  compact?: boolean;
  onClick?: () => void;
  badges?: ReactNode;
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
    <div className="relative inline-block">
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
      {props.badges ? (
        <div className="absolute right-1 top-1 flex flex-wrap items-center justify-end gap-1">{props.badges}</div>
      ) : null}
    </div>
  );
}

export interface BehaviorEdgeLabelProps {
  label: string;
  compact?: boolean;
  tone?: "default" | "crossStep";
}

export function BehaviorEdgeLabel(props: BehaviorEdgeLabelProps) {
  const toneClass =
    props.tone === "crossStep"
      ? "border-amber-300 bg-amber-50 text-amber-900 [stroke-dasharray:4_3]"
      : "border-slate-200 bg-white text-slate-500";
  return (
    <span
      className={`graph-edge${props.tone === "crossStep" ? " graph-edge-cross-step" : ""} inline-flex items-center rounded-full border font-semibold uppercase tracking-[0.16em] ${toneClass} ${
        props.compact ? "px-2.5 py-1 text-[0.62rem]" : "px-3 py-1 text-[0.68rem]"
      }`}
    >
      {props.label}
    </span>
  );
}
