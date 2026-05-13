import type { ReactElement } from "react";

import type { RuntimeDispatchReport } from "@form-builder/runtime";
import type { RuntimeEventEnvelope } from "@form-builder/schema";

import type { RuntimeEventSourceCandidate } from "../behavior/utils/runtime-helpers";

import type { MockHostResponseKind } from "./host-presets";
import { TestPanelHeader } from "./TestPanelHeader";
import { TestPanelHost } from "./TestPanelHost";
import { TestPanelInputs } from "./TestPanelInputs";
import { TestPanelSession } from "./TestPanelSession";
import { TestPanelStatusStrip } from "./TestPanelStatusStrip";
import { TestPanelTrace } from "./TestPanelTrace";
import type {
  BridgePendingEntry,
  CollisionEntry,
  MockHostConfig,
  TestPanelDockSide,
  TestPanelMode,
  TestPanelSelection,
  TestPanelStatusSnapshot,
} from "./types";

export interface TestPanelProps {
  open: boolean;
  mode: TestPanelMode;
  dockSide: TestPanelDockSide;
  selection: TestPanelSelection;
  lastReport: RuntimeDispatchReport | null;
  recordedReports: { id: string; timestamp: string; report: RuntimeDispatchReport }[];
  statusSnapshot: TestPanelStatusSnapshot | null;
  candidates: RuntimeEventSourceCandidate[];
  nodeLabelById?: Map<string, string>;
  hostConfig: MockHostConfig;
  pendingContinuations: BridgePendingEntry[];
  collisionEvents: CollisionEntry[];
  submitEnvelope: RuntimeEventEnvelope | null;
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
  onResetSession: () => void;
  onFillRequired: () => void;
  onRunStep: () => void;
  onSubmit: () => void;
  onMockHostConfigChange: (config: MockHostConfig) => void;
  onResolveContinuation: (correlationId: string, kind: MockHostResponseKind, payload: Record<string, unknown>) => void;
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
    statusSnapshot,
    candidates,
    nodeLabelById,
    hostConfig,
    pendingContinuations,
    collisionEvents,
    submitEnvelope,
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
    onResetSession,
    onFillRequired,
    onRunStep,
    onSubmit,
    onMockHostConfigChange,
    onResolveContinuation,
  } = props;

  const recordHead = recordedReports.length ? recordedReports[recordedReports.length - 1] : null;
  const traceReport: RuntimeDispatchReport | null = mode === "synth" ? lastReport : (recordHead?.report ?? null);

  return (
    <aside
      role="dialog"
      aria-label="Test panel"
      className={`${dockClasses[dockSide]} z-20 flex flex-col overflow-hidden rounded-lg border border-slate-300 bg-white`}
    >
      <TestPanelHeader mode={mode} dockSide={dockSide} onSetMode={onSetMode} onSetDock={onSetDock} onClose={onClose} />
      <TestPanelStatusStrip snapshot={statusSnapshot} />
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
        ) : mode === "record" ? (
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
        ) : mode === "session" ? (
          <TestPanelSession
            statusSnapshot={statusSnapshot}
            onResetSession={onResetSession}
            onFillRequired={onFillRequired}
            onRunStep={onRunStep}
            onSubmit={onSubmit}
            pendingCount={pendingContinuations.length}
            onOpenHostTab={() => onSetMode("host")}
          />
        ) : (
          <TestPanelHost
            config={hostConfig}
            pending={pendingContinuations}
            collisions={collisionEvents}
            submitEnvelope={submitEnvelope}
            onConfigChange={onMockHostConfigChange}
            onResolve={onResolveContinuation}
          />
        )}
        <TestPanelTrace
          report={traceReport}
          nodeLabelById={nodeLabelById}
          onCreateListenerForSource={onCreateListenerForSource}
          recordedReports={recordedReports}
        />
      </div>
    </aside>
  );
}
