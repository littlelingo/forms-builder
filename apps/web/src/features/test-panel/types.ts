import type { PendingContinuationSnapshot, RuntimeDispatchReport, RuntimeTraceEntry } from "@form-builder/runtime";

import type { RuntimeEventSourceCandidate } from "../behavior/utils/runtime-helpers";

export type TestPanelMode = "synth" | "record" | "session" | "host";
export type TestPanelDockSide = "left" | "right" | "float";

export type MockHostFailureMode = "none" | "timeout" | "network-error";

export interface MockHostConfig {
  defaults: {
    /** Preset id to use; null = custom JSON from `payload`. */
    presetId: string | null;
    /** JSON payload (override). */
    payload: Record<string, unknown> | null;
    /** Delay before auto-respond, ms (0–30000). */
    delayMs: number;
    /** Override behavior. */
    failureMode: MockHostFailureMode;
  };
}

export type BridgeSource = "builder" | "walkthrough";

export interface BridgePendingEntry extends PendingContinuationSnapshot {
  source: BridgeSource;
}

export interface CollisionEntry {
  correlationId: string;
  handlerKey: string | null;
  timestamp: string;
  trace: RuntimeTraceEntry;
}

export interface TestPanelSelection {
  sourceId: string | null;
  eventType: string | null;
  payload: Record<string, string>;
  /** True once the user manually edits payload — selection-mirror stops overwriting it. */
  payloadEdited: boolean;
  /**
   * True once the user manually picks source/event inside the panel —
   * selection-mirror from authoring stops overwriting source + event.
   * Reset on `open` (fresh panel session starts clean) and on `close`.
   */
  sourceEditedByUser?: boolean;
}

export interface TestPanelStatusSnapshot {
  currentStepLabel: string | null;
  currentStepIndex: number;
  totalSteps: number;
  validationValid: boolean;
  submitStatus: "idle" | "submitting" | "success" | "error";
  pendingCorrelationId: string | null;
}

export interface TestPanelState {
  open: boolean;
  mode: TestPanelMode;
  dockSide: TestPanelDockSide;
  selection: TestPanelSelection;
  lastReport: RuntimeDispatchReport | null;
  recordedReports: { id: string; timestamp: string; report: RuntimeDispatchReport }[];
  statusSnapshot: TestPanelStatusSnapshot | null;
  mockHostConfig: MockHostConfig;
  pendingContinuations: BridgePendingEntry[];
  collisionEvents: CollisionEntry[];
}

export interface SourcePickerNode {
  id: string;
  candidate: RuntimeEventSourceCandidate;
  label: string;
  pathLabels: string[];
  childIds: string[];
  parentId: string | null;
}

export interface SourcePickerTree {
  rootIds: string[];
  byId: Map<string, SourcePickerNode>;
}
