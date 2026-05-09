import type { ReactNode } from "react";

export interface SuggestionChipsProps {
  label: string;
  suggestions: string[];
  onApply: (value: string) => void;
}

export function SuggestionChips({ label, suggestions, onApply }: SuggestionChipsProps): ReactNode {
  if (!suggestions.length) {
    return null;
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</span>
      {suggestions.map((suggestion) => (
        <button
          key={`${label}-${suggestion}`}
          type="button"
          onClick={() => onApply(suggestion)}
          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-950"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
