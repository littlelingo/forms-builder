/**
 * useTestPanelState — React-shaped wrapper around the pure {@link testPanelReducer}.
 *
 * Responsibilities:
 *  - Owns the panel's reducer state (open/mode/dock/selection/reports).
 *  - Persists `mode` and `dockSide` to `sessionStorage` so the panel reopens
 *    in the same configuration within a tab.
 *  - When `state.mode === "record"` and `state.open === true`, subscribes to
 *    `engine.subscribeReports` so the recorded buffer fills as the form runs.
 *
 * The hook itself is intentionally side-effect light: each dispatch helper is
 * memoised via `useCallback`. The reducer is pure and is exercised by
 * `state.test.ts` (`tsx --test`); E2E coverage lands in a later phase.
 */

import { useCallback, useEffect, useReducer } from "react";

import type { RuntimeDispatchReport, RuntimeEngine } from "@form-builder/runtime";

import { initialTestPanelState, testPanelReducer } from "./state";
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

const PREFS_STORAGE_KEY = "test-panel-prefs-v1";
const HOST_CONFIG_KEY = "mock-host-config-v1";

interface PersistedPrefs {
  mode: TestPanelMode;
  dockSide: TestPanelDockSide;
}

interface StoredHostConfig {
  defaults: {
    presetId: string | null;
    payload: Record<string, unknown> | null;
    delayMs: number;
    failureMode: "none" | "timeout" | "network-error";
  };
}

function isFailureMode(v: unknown): v is StoredHostConfig["defaults"]["failureMode"] {
  return v === "none" || v === "timeout" || v === "network-error";
}

function isStoredHostConfig(v: unknown): v is StoredHostConfig {
  if (!v || typeof v !== "object") return false;
  const obj = v as { defaults?: unknown };
  if (!obj.defaults || typeof obj.defaults !== "object") return false;
  const d = obj.defaults as Record<string, unknown>;
  return (
    (d.presetId === null || typeof d.presetId === "string") &&
    (d.payload === null || (typeof d.payload === "object" && d.payload !== null && !Array.isArray(d.payload))) &&
    typeof d.delayMs === "number" &&
    isFailureMode(d.failureMode)
  );
}

function readPersistedHostConfig(): MockHostConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(HOST_CONFIG_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredHostConfig(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writePersistedHostConfig(config: MockHostConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(HOST_CONFIG_KEY, JSON.stringify(config));
  } catch {
    // Storage quota / privacy mode — swallow silently.
  }
}

function isPanelMode(value: unknown): value is TestPanelMode {
  return value === "synth" || value === "record" || value === "session" || value === "host";
}

function isDockSide(value: unknown): value is TestPanelDockSide {
  return value === "left" || value === "right" || value === "float";
}

function readPersistedPrefs(): Partial<PersistedPrefs> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return {};
    const candidate = parsed as Partial<PersistedPrefs>;
    const result: Partial<PersistedPrefs> = {};
    if (isPanelMode(candidate.mode)) result.mode = candidate.mode;
    if (isDockSide(candidate.dockSide)) result.dockSide = candidate.dockSide;
    return result;
  } catch {
    return {};
  }
}

function makeInitialState(): TestPanelState {
  const prefs = readPersistedPrefs();
  const hostConfig = readPersistedHostConfig();
  return {
    ...initialTestPanelState,
    mode: prefs.mode ?? initialTestPanelState.mode,
    dockSide: prefs.dockSide ?? initialTestPanelState.dockSide,
    mockHostConfig: hostConfig ?? initialTestPanelState.mockHostConfig,
  };
}

export interface UseTestPanelStateResult {
  state: TestPanelState;
  open: (selection: TestPanelSelection) => void;
  close: () => void;
  setMode: (mode: TestPanelMode) => void;
  setDock: (side: TestPanelDockSide) => void;
  mirrorSelection: (selection: TestPanelSelection) => void;
  editPayload: (name: string, value: string) => void;
  resetPayload: (payload: Record<string, string>) => void;
  setLastReport: (report: RuntimeDispatchReport | null) => void;
  setStatusSnapshot: (snapshot: TestPanelStatusSnapshot | null) => void;
  setMockHostConfig: (config: MockHostConfig) => void;
  setPendingContinuations: (entries: BridgePendingEntry[]) => void;
  appendCollision: (entry: CollisionEntry) => void;
  clearRecorded: () => void;
}

/**
 * @param engine The mounted runtime engine. When the panel is open in
 *   record mode, the hook subscribes to `engine.subscribeReports` and
 *   appends each report to the recorded buffer (FIFO-capped by the
 *   reducer). Pass `null` to disable subscription (e.g. when no project
 *   is loaded).
 */
export function useTestPanelState(engine: RuntimeEngine | null): UseTestPanelStateResult {
  const [state, dispatch] = useReducer(testPanelReducer, undefined, makeInitialState);

  // Persist mode + dock prefs whenever they change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const prefs: PersistedPrefs = { mode: state.mode, dockSide: state.dockSide };
      window.sessionStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Storage quota / privacy mode — swallow silently.
    }
  }, [state.mode, state.dockSide]);

  // Persist mock-host config separately so its lifecycle is independent of mode/dock.
  useEffect(() => {
    writePersistedHostConfig(state.mockHostConfig);
  }, [state.mockHostConfig]);

  // Live-record subscription: active when panel is open AND mode is "record" or "session".
  useEffect(() => {
    if (!engine) return;
    if (!state.open || (state.mode !== "record" && state.mode !== "session")) return;
    const unsubscribe = engine.subscribeReports((report) => {
      const id =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      dispatch({
        type: "append-report",
        entry: { id, timestamp: new Date().toISOString(), report },
      });
    });
    return unsubscribe;
  }, [engine, state.open, state.mode]);

  const open = useCallback((selection: TestPanelSelection) => {
    dispatch({ type: "open", selection });
  }, []);

  const close = useCallback(() => {
    dispatch({ type: "close" });
  }, []);

  const setMode = useCallback((mode: TestPanelMode) => {
    dispatch({ type: "set-mode", mode });
  }, []);

  const setDock = useCallback((side: TestPanelDockSide) => {
    dispatch({ type: "set-dock", side });
  }, []);

  const mirrorSelection = useCallback((selection: TestPanelSelection) => {
    dispatch({ type: "mirror-selection", selection });
  }, []);

  const editPayload = useCallback((name: string, value: string) => {
    dispatch({ type: "edit-payload", name, value });
  }, []);

  const resetPayload = useCallback((payload: Record<string, string>) => {
    dispatch({ type: "reset-payload", payload });
  }, []);

  const setLastReport = useCallback((report: RuntimeDispatchReport | null) => {
    dispatch({ type: "set-last-report", report });
  }, []);

  const setStatusSnapshot = useCallback(
    (snapshot: TestPanelStatusSnapshot | null) => dispatch({ type: "set-status-snapshot", snapshot }),
    [],
  );

  const setMockHostConfig = useCallback(
    (config: MockHostConfig) => dispatch({ type: "set-mock-host-config", config }),
    [],
  );

  const setPendingContinuations = useCallback(
    (entries: BridgePendingEntry[]) => dispatch({ type: "set-pending-continuations", entries }),
    [],
  );

  const appendCollision = useCallback((entry: CollisionEntry) => dispatch({ type: "append-collision", entry }), []);

  const clearRecorded = useCallback(() => {
    dispatch({ type: "clear-recorded" });
  }, []);

  return {
    state,
    open,
    close,
    setMode,
    setDock,
    mirrorSelection,
    editPayload,
    resetPayload,
    setLastReport,
    setStatusSnapshot,
    setMockHostConfig,
    setPendingContinuations,
    appendCollision,
    clearRecorded,
  };
}
