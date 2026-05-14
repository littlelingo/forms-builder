import type { RuntimeDispatchReport } from "@form-builder/runtime";

import type {
  BridgePendingEntry,
  CollisionEntry,
  MockHostConfig,
  TestPanelDockSide,
  TestPanelMode,
  TestPanelSelection,
  TestPanelState,
  TestPanelStatusSnapshot,
} from "./types";

export const RECORD_BUFFER_CAP = 50;

export type TestPanelAction =
  | { type: "open"; selection: TestPanelSelection }
  | { type: "close" }
  | { type: "set-mode"; mode: TestPanelMode }
  | { type: "set-dock"; side: TestPanelDockSide }
  | { type: "mirror-selection"; selection: TestPanelSelection }
  | { type: "edit-payload"; name: string; value: string }
  | { type: "reset-payload"; payload: Record<string, string> }
  | { type: "set-last-report"; report: RuntimeDispatchReport | null }
  | { type: "set-status-snapshot"; snapshot: TestPanelStatusSnapshot | null }
  | { type: "set-mock-host-config"; config: MockHostConfig }
  | { type: "set-pending-continuations"; entries: BridgePendingEntry[] }
  | { type: "append-collision"; entry: CollisionEntry }
  | { type: "append-report"; entry: { id: string; timestamp: string; report: RuntimeDispatchReport } }
  | { type: "clear-recorded" };

export const initialTestPanelState: TestPanelState = {
  open: false,
  mode: "synth",
  dockSide: "right",
  selection: {
    sourceId: null,
    eventType: null,
    payload: {},
    payloadEdited: false,
    sourceEditedByUser: false,
  },
  lastReport: null,
  recordedReports: [],
  statusSnapshot: null,
  mockHostConfig: {
    defaults: {
      presetId: null,
      payload: null,
      delayMs: 0,
      failureMode: "none",
    },
  },
  pendingContinuations: [],
  collisionEvents: [],
};

export function testPanelReducer(state: TestPanelState, action: TestPanelAction): TestPanelState {
  switch (action.type) {
    case "open":
      // Fresh open clears the per-session "user picked source manually" flag so
      // the auto-mirror effect can pre-fill source/event from the current
      // authoring selection. The mirrored selection itself carries whatever the
      // caller passed (typically payloadEdited=false, sourceEditedByUser=false).
      return {
        ...state,
        open: true,
        selection: {
          sourceId: action.selection.sourceId,
          eventType: action.selection.eventType,
          payload: action.selection.payload,
          payloadEdited: action.selection.payloadEdited,
          sourceEditedByUser: action.selection.sourceEditedByUser ?? false,
        },
      };
    case "close":
      return { ...state, open: false };
    case "set-mode":
      return { ...state, mode: action.mode };
    case "set-dock":
      return { ...state, dockSide: action.side };
    case "mirror-selection": {
      // Two independent stickiness rules:
      //  - If the user manually picked source/event inside the panel, keep theirs.
      //  - If the user edited the payload, keep theirs.
      // The action shape may carry an explicit sourceEditedByUser flag, in which
      // case the caller is asserting a manual pick (or clearing it). When absent
      // the action is treated as an auto-mirror from authoring.
      const explicitSourceEditFlag = action.selection.sourceEditedByUser === true;
      const keepSource = !explicitSourceEditFlag && (state.selection.sourceEditedByUser ?? false);
      const keepPayload = state.selection.payloadEdited;
      return {
        ...state,
        selection: {
          sourceId: keepSource ? state.selection.sourceId : action.selection.sourceId,
          eventType: keepSource ? state.selection.eventType : action.selection.eventType,
          payload: keepPayload ? state.selection.payload : action.selection.payload,
          payloadEdited: state.selection.payloadEdited,
          sourceEditedByUser: explicitSourceEditFlag ? true : (state.selection.sourceEditedByUser ?? false),
        },
      };
    }
    case "edit-payload":
      return {
        ...state,
        selection: {
          ...state.selection,
          payload: { ...state.selection.payload, [action.name]: action.value },
          payloadEdited: true,
        },
      };
    case "reset-payload":
      return {
        ...state,
        selection: {
          ...state.selection,
          payload: action.payload,
          payloadEdited: false,
        },
      };
    case "set-last-report":
      return { ...state, lastReport: action.report };
    case "set-status-snapshot":
      return { ...state, statusSnapshot: action.snapshot };
    case "set-mock-host-config":
      return { ...state, mockHostConfig: action.config };
    case "set-pending-continuations":
      return { ...state, pendingContinuations: action.entries };
    case "append-collision": {
      const next = [...state.collisionEvents, action.entry];
      if (next.length > 20) next.splice(0, next.length - 20);
      return { ...state, collisionEvents: next };
    }
    case "append-report": {
      const next = [...state.recordedReports, action.entry];
      // FIFO cap: drop the oldest entries when over the buffer cap.
      const trimmed = next.length > RECORD_BUFFER_CAP ? next.slice(next.length - RECORD_BUFFER_CAP) : next;
      return { ...state, recordedReports: trimmed };
    }
    case "clear-recorded":
      return { ...state, recordedReports: [] };
    default: {
      const _exhaustive: never = action;
      void _exhaustive;
      return state;
    }
  }
}
