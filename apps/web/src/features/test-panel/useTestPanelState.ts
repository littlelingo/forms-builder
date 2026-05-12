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
  TestPanelDockSide,
  TestPanelMode,
  TestPanelSelection,
  TestPanelState,
} from "./types";

const PREFS_STORAGE_KEY = "test-panel-prefs-v1";

interface PersistedPrefs {
  mode: TestPanelMode;
  dockSide: TestPanelDockSide;
}

function isPanelMode(value: unknown): value is TestPanelMode {
  return value === "synth" || value === "record";
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
  return {
    ...initialTestPanelState,
    mode: prefs.mode ?? initialTestPanelState.mode,
    dockSide: prefs.dockSide ?? initialTestPanelState.dockSide,
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

  // Live-record subscription: only active when panel is open AND mode is "record".
  useEffect(() => {
    if (!engine) return;
    if (!state.open || state.mode !== "record") return;
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
    clearRecorded,
  };
}
