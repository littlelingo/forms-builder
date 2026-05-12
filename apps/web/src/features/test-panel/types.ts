import type { RuntimeDispatchReport } from "@form-builder/runtime";

import type { RuntimeEventSourceCandidate } from "../behavior/utils/runtime-helpers";

export type TestPanelMode = "synth" | "record";
export type TestPanelDockSide = "left" | "right" | "float";

export interface TestPanelSelection {
  sourceId: string | null;
  eventType: string | null;
  payload: Record<string, string>;
  /** True once the user manually edits payload — selection-mirror stops overwriting it. */
  payloadEdited: boolean;
}

export interface TestPanelState {
  open: boolean;
  mode: TestPanelMode;
  dockSide: TestPanelDockSide;
  selection: TestPanelSelection;
  lastReport: RuntimeDispatchReport | null;
  recordedReports: { id: string; timestamp: string; report: RuntimeDispatchReport }[];
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
