import type { ReactElement } from "react";

import type { RuntimeDispatchReport } from "@form-builder/runtime";

import type { RuntimeEventSourceCandidate } from "../behavior/utils/runtime-helpers";

import { TestPanelHeader } from "./TestPanelHeader";
import { TestPanelInputs } from "./TestPanelInputs";
import { TestPanelTrace } from "./TestPanelTrace";
import type { TestPanelDockSide, TestPanelMode, TestPanelSelection } from "./types";

export interface TestPanelProps {
  open: boolean;
  mode: TestPanelMode;
  dockSide: TestPanelDockSide;
  selection: TestPanelSelection;
  lastReport: RuntimeDispatchReport | null;
  recordedReports: { id: string; timestamp: string; report: RuntimeDispatchReport }[];
  candidates: RuntimeEventSourceCandidate[];
  nodeLabelById?: Map<string, string>;
  onClose: () => void;
  onSetMode: (mode: TestPanelMode) => void;
  onSetDock: (side: TestPanelDockSide) => void;
  onSelectSource: (id: string) => void;
  onSelectEvent: (type: string) => void;
  onEditPayload: (name: string, value: string) => void;
  onResetPayload: (payload: Record<string, string>) => void;
  onFire: (envelope: { sourceId: string; eventType: string; payload: Record<string, unknown> }) => void;
  onClearRecorded: () => void;
  onCreateListenerForSource?: () => void;
}

const dockClasses: Record<TestPanelDockSide, string> = {
  left: "fixed left-2 top-20 bottom-2 w-[22rem]",
  right: "fixed right-2 top-20 bottom-2 w-[22rem]",
  float: "fixed right-8 top-24 w-[22rem] h-[36rem] shadow-2xl",
};

export function TestPanel(props: TestPanelProps): ReactElement | null {
  if (!props.open) return null;
  const {
    mode,
    dockSide,
    selection,
    lastReport,
    recordedReports,
    candidates,
    nodeLabelById,
    onClose,
    onSetMode,
    onSetDock,
    onSelectSource,
    onSelectEvent,
    onEditPayload,
    onResetPayload,
    onFire,
    onClearRecorded,
    onCreateListenerForSource,
  } = props;

  const recordHead = recordedReports.length ? recordedReports[recordedReports.length - 1] : null;
  const traceReport: RuntimeDispatchReport | null = mode === "synth" ? lastReport : (recordHead?.report ?? null);

  return (
    <aside
      role="dialog"
      aria-label="Test panel"
      className={`${dockClasses[dockSide]} z-20 flex flex-col overflow-hidden rounded-lg border border-slate-300 bg-white`}
    >
      <TestPanelHeader
        mode={mode}
        dockSide={dockSide}
        onSetMode={onSetMode}
        onSetDock={onSetDock}
        onClose={onClose}
      />
      <div className="flex-1 overflow-auto">
        {mode === "synth" ? (
          <TestPanelInputs
            candidates={candidates}
            selection={selection}
            onSelectSource={onSelectSource}
            onSelectEvent={onSelectEvent}
            onEditPayload={onEditPayload}
            onResetPayload={onResetPayload}
            onFire={onFire}
          />
        ) : (
          <section className="p-3 text-xs text-slate-600">
            <div className="flex items-center justify-between gap-2">
              <span>
                Recording. Interact with the preview to capture dispatches.
                <br />
                {recordedReports.length} captured (cap 50)
              </span>
              {recordedReports.length > 0 ? (
                <button type="button" onClick={onClearRecorded} className="rounded bg-slate-200 px-2 py-0.5">
                  Clear
                </button>
              ) : null}
            </div>
          </section>
        )}
        <TestPanelTrace
          report={traceReport}
          nodeLabelById={nodeLabelById}
          onCreateListenerForSource={onCreateListenerForSource}
        />
      </div>
    </aside>
  );
}
