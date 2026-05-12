import type { ReactElement } from "react";

import type { TestPanelDockSide, TestPanelMode } from "./types";

export interface TestPanelHeaderProps {
  mode: TestPanelMode;
  dockSide: TestPanelDockSide;
  onSetMode: (mode: TestPanelMode) => void;
  onSetDock: (side: TestPanelDockSide) => void;
  onClose: () => void;
}

export function TestPanelHeader({
  mode,
  dockSide,
  onSetMode,
  onSetDock,
  onClose,
}: TestPanelHeaderProps): ReactElement {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Test panel</h3>
        <div className="flex gap-0.5 text-xs">
          <button
            type="button"
            onClick={() => onSetMode("synth")}
            aria-pressed={mode === "synth"}
            className={`rounded-l px-2 py-0.5 ${mode === "synth" ? "bg-blue-600 text-white" : "bg-slate-200"}`}
          >
            Synth
          </button>
          <button
            type="button"
            onClick={() => onSetMode("record")}
            aria-pressed={mode === "record"}
            className={`rounded-r px-2 py-0.5 ${mode === "record" ? "bg-blue-600 text-white" : "bg-slate-200"}`}
          >
            Live record
          </button>
        </div>
      </div>
      <div className="flex items-center gap-1 text-xs">
        <button
          type="button"
          aria-label="Dock left"
          aria-pressed={dockSide === "left"}
          onClick={() => onSetDock("left")}
          className={`rounded px-1 ${dockSide === "left" ? "bg-slate-200" : ""}`}
        >
          ◧
        </button>
        <button
          type="button"
          aria-label="Float"
          aria-pressed={dockSide === "float"}
          onClick={() => onSetDock("float")}
          className={`rounded px-1 ${dockSide === "float" ? "bg-slate-200" : ""}`}
        >
          ◇
        </button>
        <button
          type="button"
          aria-label="Dock right"
          aria-pressed={dockSide === "right"}
          onClick={() => onSetDock("right")}
          className={`rounded px-1 ${dockSide === "right" ? "bg-slate-200" : ""}`}
        >
          ◨
        </button>
        <button type="button" aria-label="Close" onClick={onClose} className="ml-1 rounded px-1 hover:bg-slate-200">
          ✕
        </button>
      </div>
    </header>
  );
}
