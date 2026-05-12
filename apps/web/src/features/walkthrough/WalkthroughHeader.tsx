export interface WalkthroughHeaderProps {
  currentStepLabel: string;
  currentStepIndex: number;
  totalSteps: number;
  onExit: () => void;
  onRestart: () => void;
}

/**
 * Top-of-canvas header for the Walkthrough route. Hosts the exit
 * affordance, the "Step X of Y — label" indicator, and a Restart button.
 * Intentionally lightweight so it can sit above either a full-canvas
 * preview or a future hosted-style chrome.
 */
export function WalkthroughHeader({
  currentStepLabel,
  currentStepIndex,
  totalSteps,
  onExit,
  onRestart,
}: WalkthroughHeaderProps) {
  return (
    <header
      className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3 shadow-sm"
      role="banner"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
        >
          <span aria-hidden="true">&larr;</span>
          <span>Exit walkthrough</span>
        </button>
        <span className="text-sm font-semibold text-slate-900">
          {totalSteps > 0 ? (
            <>
              Step {currentStepIndex + 1} of {totalSteps}
              {currentStepLabel ? ` — ${currentStepLabel}` : null}
            </>
          ) : (
            "Walkthrough"
          )}
        </span>
      </div>
      <button
        type="button"
        onClick={onRestart}
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
      >
        Restart
      </button>
    </header>
  );
}
