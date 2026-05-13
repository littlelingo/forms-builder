import type { TestPanelStatusSnapshot } from "./types";

export interface TestPanelStatusStripProps {
  snapshot: TestPanelStatusSnapshot | null;
}

const validationStyles = "rounded bg-emerald-100 px-2 py-0.5 text-emerald-800";
const validationInvalidStyles = "rounded bg-rose-100 px-2 py-0.5 text-rose-800";
const submitStyles: Record<TestPanelStatusSnapshot["submitStatus"], string> = {
  idle: "rounded bg-slate-100 px-2 py-0.5 text-slate-700",
  submitting: "rounded bg-amber-100 px-2 py-0.5 text-amber-900",
  success: "rounded bg-emerald-100 px-2 py-0.5 text-emerald-800",
  error: "rounded bg-rose-100 px-2 py-0.5 text-rose-800",
};

export function TestPanelStatusStrip({ snapshot }: TestPanelStatusStripProps) {
  if (!snapshot) {
    return (
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-500">
        <span>No document loaded</span>
      </div>
    );
  }
  const stepLabel =
    snapshot.currentStepIndex >= 0
      ? `Step ${snapshot.currentStepIndex + 1} of ${snapshot.totalSteps}${snapshot.currentStepLabel ? ` · ${snapshot.currentStepLabel}` : ""}`
      : "No active step";
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs">
      <span className="rounded bg-slate-200 px-2 py-0.5 text-slate-800">{stepLabel}</span>
      <span className={snapshot.validationValid ? validationStyles : validationInvalidStyles}>
        {snapshot.validationValid ? "Valid" : "Invalid"}
      </span>
      <span className={submitStyles[snapshot.submitStatus]}>Submit: {snapshot.submitStatus}</span>
    </div>
  );
}
