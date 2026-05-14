import type { ReactElement } from "react";

import type { TestPanelStatusSnapshot } from "./types";

export interface TestPanelSessionProps {
  statusSnapshot: TestPanelStatusSnapshot | null;
  onResetSession: () => void;
  onFillRequired: () => void;
  onRunStep: () => void;
  onSubmit: () => void;
  pendingCount: number;
  onOpenHostTab: () => void;
}

export function TestPanelSession({
  statusSnapshot,
  onResetSession,
  onFillRequired,
  onRunStep,
  onSubmit,
  pendingCount,
  onOpenHostTab,
}: TestPanelSessionProps): ReactElement {
  const documentReady = statusSnapshot !== null;

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
        <span className="text-xs uppercase tracking-wide text-slate-500">Host loop</span>
        <p className="mt-1 rounded bg-slate-50 px-2 py-2 text-xs text-slate-600">
          {pendingCount > 0
            ? `${pendingCount} pending host call${pendingCount === 1 ? "" : "s"}.`
            : "No pending host calls."}
          <button type="button" onClick={onOpenHostTab} className="ml-2 text-blue-700 underline">
            Open Host tab
          </button>
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
