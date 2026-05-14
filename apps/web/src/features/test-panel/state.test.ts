import { test } from "node:test";
import assert from "node:assert/strict";

import type { RuntimeDispatchReport } from "@form-builder/runtime";

import { initialTestPanelState, RECORD_BUFFER_CAP, testPanelReducer } from "./state";
import type { MockHostConfig, TestPanelSelection, TestPanelState } from "./types";

function makeSelection(overrides: Partial<TestPanelSelection> = {}): TestPanelSelection {
  return {
    sourceId: overrides.sourceId ?? null,
    eventType: overrides.eventType ?? null,
    payload: overrides.payload ?? {},
    payloadEdited: overrides.payloadEdited ?? false,
    sourceEditedByUser: overrides.sourceEditedByUser ?? false,
  };
}

function makeReport(correlationId: string): RuntimeDispatchReport {
  return {
    event: {
      type: "component.click",
      version: "1.0",
      source: {
        runtimeId: "runtime-test",
        formId: "form-test",
        projectId: "project-test",
        nodeId: "button-1",
        nodeType: "component",
      },
      payload: {},
      correlationId,
      timestamp: "2026-05-11T12:00:00.000Z",
    },
    stateBefore: {
      currentStepId: null,
      values: {},
      nodes: {},
      validation: { valid: true, errors: [], warnings: [] },
      submit: { status: "idle", lastCorrelationId: null, message: null, fieldErrors: null },
      hostContextSnapshot: null,
    },
    stateAfter: {
      currentStepId: null,
      values: {},
      nodes: {},
      validation: { valid: true, errors: [], warnings: [] },
      submit: { status: "idle", lastCorrelationId: null, message: null, fieldErrors: null },
      hostContextSnapshot: null,
    },
    listeners: [],
    traceEntries: [],
    emittedEvents: [],
    stateDiff: {
      currentStepChanged: false,
      valuesChanged: [],
      nodesChanged: [],
      validationChanged: false,
      submitChanged: false,
    },
  };
}

test("open: sets open=true and replaces selection", () => {
  const selection = makeSelection({ sourceId: "src-1", eventType: "component.click" });
  const next = testPanelReducer(initialTestPanelState, { type: "open", selection });
  assert.equal(next.open, true);
  assert.deepEqual(next.selection, selection);
});

test("edit-payload: marks payloadEdited=true and updates field", () => {
  const baseSelection = makeSelection({ sourceId: "src-1", eventType: "component.click" });
  const opened = testPanelReducer(initialTestPanelState, { type: "open", selection: baseSelection });
  const edited = testPanelReducer(opened, { type: "edit-payload", name: "foo", value: "bar" });
  assert.equal(edited.selection.payloadEdited, true);
  assert.equal(edited.selection.payload.foo, "bar");
});

test("mirror-selection: preserves user-edited payload (sticky)", () => {
  const opened = testPanelReducer(initialTestPanelState, {
    type: "open",
    selection: makeSelection({ sourceId: "src-1", eventType: "component.click", payload: { foo: "auto" } }),
  });
  const edited = testPanelReducer(opened, { type: "edit-payload", name: "foo", value: "manual" });
  // selection changes (new sourceId), but mirror-selection brings a fresh payload
  const mirrored = testPanelReducer(edited, {
    type: "mirror-selection",
    selection: makeSelection({ sourceId: "src-2", eventType: "field.change", payload: { foo: "fresh", bar: "new" } }),
  });
  assert.equal(mirrored.selection.sourceId, "src-2");
  assert.equal(mirrored.selection.eventType, "field.change");
  // Edited payload should win, not fresh
  assert.deepEqual(mirrored.selection.payload, { foo: "manual" });
  assert.equal(mirrored.selection.payloadEdited, true);
});

test("mirror-selection: preserves user-picked source (sticky) — auto-mirror does not clobber", () => {
  // User opens the panel pre-filled from authoring.
  const opened = testPanelReducer(initialTestPanelState, {
    type: "open",
    selection: makeSelection({ sourceId: "src-auto-1", eventType: "field.change" }),
  });
  // User manually picks a different source via the panel UI (sourceEditedByUser=true).
  const userPicked = testPanelReducer(opened, {
    type: "mirror-selection",
    selection: makeSelection({
      sourceId: "src-user-pick",
      eventType: "component.click",
      sourceEditedByUser: true,
    }),
  });
  assert.equal(userPicked.selection.sourceId, "src-user-pick");
  assert.equal(userPicked.selection.eventType, "component.click");
  assert.equal(userPicked.selection.sourceEditedByUser, true);

  // Now an auto-mirror tick fires (authoring selection changed). It MUST NOT clobber the user pick.
  const afterAutoMirror = testPanelReducer(userPicked, {
    type: "mirror-selection",
    selection: makeSelection({ sourceId: "src-auto-2", eventType: "field.change" }),
  });
  assert.equal(afterAutoMirror.selection.sourceId, "src-user-pick");
  assert.equal(afterAutoMirror.selection.eventType, "component.click");
  // Flag is still set for subsequent auto-mirror ticks.
  assert.equal(afterAutoMirror.selection.sourceEditedByUser, true);
});

test("open: resets sourceEditedByUser flag for a fresh panel session", () => {
  const userPicked = testPanelReducer(initialTestPanelState, {
    type: "mirror-selection",
    selection: makeSelection({ sourceId: "src-user", eventType: "component.click", sourceEditedByUser: true }),
  });
  assert.equal(userPicked.selection.sourceEditedByUser, true);
  // Reopening the panel must clear the flag so auto-mirror can pre-fill again.
  const reopened = testPanelReducer(userPicked, {
    type: "open",
    selection: makeSelection({ sourceId: "src-fresh", eventType: "field.change" }),
  });
  assert.equal(reopened.selection.sourceEditedByUser, false);
  assert.equal(reopened.selection.sourceId, "src-fresh");
  assert.equal(reopened.selection.eventType, "field.change");
});

test("mirror-selection: auto-mirror (no user pick) still updates source + event", () => {
  // No user pick has happened yet — sourceEditedByUser is false.
  const opened = testPanelReducer(initialTestPanelState, {
    type: "open",
    selection: makeSelection({ sourceId: "src-1", eventType: "field.change" }),
  });
  // Auto-mirror brings a new selection. It should be applied.
  const mirrored = testPanelReducer(opened, {
    type: "mirror-selection",
    selection: makeSelection({ sourceId: "src-2", eventType: "component.click" }),
  });
  assert.equal(mirrored.selection.sourceId, "src-2");
  assert.equal(mirrored.selection.eventType, "component.click");
  assert.equal(mirrored.selection.sourceEditedByUser, false);
});

test("set-mode: updates mode without touching other state", () => {
  const next = testPanelReducer(initialTestPanelState, { type: "set-mode", mode: "record" });
  assert.equal(next.mode, "record");
  assert.equal(next.open, initialTestPanelState.open);
  assert.equal(next.dockSide, initialTestPanelState.dockSide);
});

test("set-status-snapshot writes the snapshot field", () => {
  const snapshot = {
    currentStepLabel: "Personal Info",
    currentStepIndex: 0,
    totalSteps: 3,
    validationValid: true,
    submitStatus: "idle" as const,
    pendingCorrelationId: null,
  };
  const next = testPanelReducer(initialTestPanelState, {
    type: "set-status-snapshot",
    snapshot,
  });
  assert.deepEqual(next.statusSnapshot, snapshot);
});

test("set-status-snapshot can clear the snapshot to null", () => {
  const seeded = testPanelReducer(initialTestPanelState, {
    type: "set-status-snapshot",
    snapshot: {
      currentStepLabel: "Step",
      currentStepIndex: 0,
      totalSteps: 1,
      validationValid: true,
      submitStatus: "idle",
      pendingCorrelationId: null,
    },
  });
  const cleared = testPanelReducer(seeded, { type: "set-status-snapshot", snapshot: null });
  assert.equal(cleared.statusSnapshot, null);
});

test("set-mode accepts session mode", () => {
  const next = testPanelReducer(initialTestPanelState, { type: "set-mode", mode: "session" });
  assert.equal(next.mode, "session");
});

test("append-report: enforces RECORD_BUFFER_CAP via FIFO eviction", () => {
  let state: TestPanelState = initialTestPanelState;
  for (let i = 0; i < RECORD_BUFFER_CAP + 5; i += 1) {
    state = testPanelReducer(state, {
      type: "append-report",
      entry: {
        id: `r-${i}`,
        timestamp: `2026-05-11T12:00:${String(i).padStart(2, "0")}.000Z`,
        report: makeReport(`corr-${i}`),
      },
    });
  }
  assert.equal(state.recordedReports.length, RECORD_BUFFER_CAP);
  // FIFO: the oldest IDs (0..4) should have been dropped; first remaining should be r-5
  assert.equal(state.recordedReports[0].id, "r-5");
  // Last entry is the newest
  assert.equal(state.recordedReports[state.recordedReports.length - 1].id, `r-${RECORD_BUFFER_CAP + 4}`);
});

test("set-mock-host-config writes config", () => {
  const config: MockHostConfig = {
    defaults: { presetId: "submit-success", payload: null, delayMs: 0, failureMode: "none" },
  };
  const next = testPanelReducer(initialTestPanelState, { type: "set-mock-host-config", config });
  assert.deepEqual(next.mockHostConfig, config);
});

test("set-pending-continuations replaces list", () => {
  const next = testPanelReducer(initialTestPanelState, {
    type: "set-pending-continuations",
    entries: [
      { correlationId: "c", listenerId: "L", actionId: "A", handlerKey: "submit", createdAt: 1, source: "builder" },
    ],
  });
  assert.equal(next.pendingContinuations.length, 1);
});

test("append-collision enforces FIFO cap of 20", () => {
  let state = initialTestPanelState;
  for (let i = 0; i < 25; i++) {
    state = testPanelReducer(state, {
      type: "append-collision",
      entry: {
        correlationId: `c-${i}`,
        handlerKey: "x",
        timestamp: "2026-05-13T00:00:00Z",
        trace: { direction: "internal", event: { type: "x" } } as never,
      },
    });
  }
  assert.equal(state.collisionEvents.length, 20);
  assert.equal(state.collisionEvents[0]!.correlationId, "c-5");
});

test("set-mode accepts host", () => {
  const next = testPanelReducer(initialTestPanelState, { type: "set-mode", mode: "host" });
  assert.equal(next.mode, "host");
});
