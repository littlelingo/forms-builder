import type { ReactElement } from "react";

import type { TestPanelStatusSnapshot } from "./types";

export interface TestPanelSessionProps {
  statusSnapshot: TestPanelStatusSnapshot | null;
  onResetSession: () => void;
  onFillRequired: () => void;
  onRunStep: () => void;
  onSubmit: () => void;
  onSimulateHostSuccess: () => void;
  onSimulateHostError: () => void;
}

export function TestPanelSession({
  statusSnapshot,
  onResetSession,
  onFillRequired,
  onRunStep,
  onSubmit,
  onSimulateHostSuccess,
  onSimulateHostError,
}: TestPanelSessionProps): ReactElement {
  const documentReady = statusSnapshot !== null;
  const submitting = statusSnapshot?.submitStatus === "submitting";

  return (
    <section className="space-y-4 p-3">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-slate-500">Lifecycle</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <SessionButton label="Reset" hint="Clear values + state" onClick={onResetSession} disabled={!documentReady} />
          <SessionButton
            label="Fill required"
            hint="Auto-fill required fields"
            onClick={onFillRequired}
            disabled={!documentReady}
          />
          <SessionButton label="Run step" hint="Advance to next step" onClick={onRunStep} disabled={!documentReady} />
          <SessionButton
            label="Submit"
            hint="Trigger form.submit"
            onClick={onSubmit}
            disabled={!documentReady}
            variant="primary"
          />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-slate-500">Host loop</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <SessionButton
            label="Simulate success"
            hint="Resolve pending host await"
            onClick={onSimulateHostSuccess}
            disabled={!submitting}
          />
          <SessionButton
            label="Simulate error"
            hint="Reject pending host await"
            onClick={onSimulateHostError}
            disabled={!submitting}
            variant="danger"
          />
        </div>
        <p className="mt-2 rounded bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
          {submitting
            ? `Submit correlation ${statusSnapshot?.pendingCorrelationId ?? "unknown"} is waiting.`
            : "Run Submit. Active when waiting on host."}
        </p>
      </div>
    </section>
  );
}

interface SessionButtonProps {
  label: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "primary" | "danger";
}

function SessionButton({ label, hint, onClick, disabled, variant = "default" }: SessionButtonProps): ReactElement {
  const styles =
    variant === "primary"
      ? "bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50"
      : variant === "danger"
        ? "bg-rose-600 text-white hover:bg-rose-500 disabled:opacity-50"
        : "bg-slate-200 text-slate-800 hover:bg-slate-300 disabled:opacity-50";
  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`w-full rounded px-3 py-1.5 text-sm font-semibold ${styles}`}
      >
        {label}
      </button>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}
