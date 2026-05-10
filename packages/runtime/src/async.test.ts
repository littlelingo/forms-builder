/**
 * Phase 3 — async dispatch surface tests.
 *
 * Stage C scope: dispatchAsync / dispatchWithReportAsync exist, return
 * Promises that resolve to the same shape as their sync counterparts,
 * and serialize concurrent calls FIFO via the engine's promise-chain.
 *
 * Stages D-F extend this file with tests for branch / wait /
 * host_call_await / onError / $response / scheduler — each lands in
 * the same test file so the async surface is covered in one place.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { AuthoringDocument, RuntimeEventEnvelope, RuntimeHostContext } from "@form-builder/schema";

import { createRuntimeEngine } from "./engine";

function createDocument(): AuthoringDocument {
  return {
    id: "form-async",
    title: "Phase 3 Async Dispatch Form",
    documentClass: "mixed",
    reviewStatus: "accepted",
    targetRuntime: "va_web_form",
    visualBaseline: "va.gov",
    sourcePriority: [],
    sourceConflicts: [],
    metadata: {},
    runtime: {
      version: "1.0",
      formEvents: [
        {
          id: "evt-tick",
          type: "form.tick",
          dispatcherId: "form-async",
          dispatcherType: "form",
          bubbles: false,
          description: "Test event",
        },
      ],
      formListeners: [
        {
          id: "listener-tick",
          label: "Mark a field on tick",
          eventName: "form.tick",
          enabled: true,
          conditions: [],
          actions: [
            {
              id: "action-mark",
              kind: "set_field_value",
              target: { nodeId: "field-counter", nodeType: "field" },
              config: { fieldId: "field-counter", value: { $runtime: "current.event.payload.value" } },
              continueOnError: false,
            },
          ],
        },
      ],
      hostBindings: [],
      submitEventName: "form.submit",
      sessionStateShape: { mode: "key_value", fields: [], example: null, notes: null },
    },
    steps: [
      {
        id: "step-1",
        title: "Step 1",
        description: null,
        kind: "collect",
        layoutHints: {},
        sourcePageIds: [],
        provenanceAnchorIds: [],
        sections: [
          {
            id: "section-1",
            title: "Section 1",
            description: null,
            layoutHints: {},
            lineage: [],
            sourceSectionIds: [],
            provenanceAnchorIds: [],
            fields: [
              {
                id: "field-counter",
                stableKey: "field-counter",
                label: "Counter",
                helpText: null,
                semanticType: "text",
                required: false,
                confidence: 1,
                options: [],
                validations: [],
                layoutHints: {},
                rendererHints: {},
                sourcePriority: [],
                sourceConflicts: [],
                lineage: [],
                sourceFieldIds: [],
                provenanceAnchorIds: [],
                runtime: null,
              },
            ],
            groups: [],
          },
        ],
      },
    ],
  };
}

function createHostContext(): RuntimeHostContext {
  return {
    environment: "runtime-test",
    session: { projectId: "project-async" },
    auth: {},
    app: { stage: "builder" },
    data: {},
  };
}

function buildTickEvent(value: number): RuntimeEventEnvelope {
  return {
    type: "form.tick",
    version: "1.0",
    source: {
      runtimeId: "runtime-async",
      formId: "form-async",
      projectId: "project-async",
      nodeId: "form-async",
      nodeType: "form",
    },
    payload: { value },
    correlationId: `tick-${value}`,
    timestamp: `2026-06-01T00:00:0${value}.000Z`,
  };
}

test("Phase 3 Stage C: dispatchAsync resolves to RuntimeSessionState", async () => {
  const engine = createRuntimeEngine();
  engine.mount(createDocument(), {
    runtimeId: "runtime-async",
    projectId: "project-async",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });
  const result = engine.dispatchAsync(buildTickEvent(7));
  assert.ok(result instanceof Promise, "dispatchAsync must return a Promise");
  const state = await result;
  assert.equal(state.values["field-counter"], 7, "the action chain must run before the Promise resolves");
});

test("Phase 3 Stage C: dispatchWithReportAsync resolves with full report", async () => {
  const engine = createRuntimeEngine();
  engine.mount(createDocument(), {
    runtimeId: "runtime-async",
    projectId: "project-async",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });
  const report = await engine.dispatchWithReportAsync(buildTickEvent(3));
  assert.equal(report.event.type, "form.tick");
  assert.equal(report.stateAfter.values["field-counter"], 3);
  assert.equal(report.listeners.length, 1);
  assert.equal(report.listeners[0]?.matched, true);
});

test("Phase 3 Stage C: concurrent dispatchAsync calls run FIFO", async () => {
  const engine = createRuntimeEngine();
  engine.mount(createDocument(), {
    runtimeId: "runtime-async",
    projectId: "project-async",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });
  // Fire all three before awaiting any. The serializer must drain them in
  // the same order they were enqueued, so the final value sticks at 3.
  const [s1, s2, s3] = await Promise.all([
    engine.dispatchAsync(buildTickEvent(1)),
    engine.dispatchAsync(buildTickEvent(2)),
    engine.dispatchAsync(buildTickEvent(3)),
  ]);
  // Each Promise resolves with the state snapshot at the time its chain
  // completed. Because the queue is strictly FIFO, the snapshots must
  // step 1 → 2 → 3.
  assert.equal(s1.values["field-counter"], 1);
  assert.equal(s2.values["field-counter"], 2);
  assert.equal(s3.values["field-counter"], 3);
  assert.equal(engine.getState().values["field-counter"], 3);
});

test("Phase 3 Stage C: dispatchAsync on unmounted engine rejects", async () => {
  const engine = createRuntimeEngine();
  await assert.rejects(engine.dispatchAsync(buildTickEvent(0)), /not mounted/);
});

test("Phase 3 Stage C: unmount cancels asyncTail and clears continuations", async () => {
  const engine = createRuntimeEngine();
  engine.mount(createDocument(), {
    runtimeId: "runtime-async",
    projectId: "project-async",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });
  // First dispatch resolves cleanly, then unmount, then a fresh mount + dispatch
  // must not see any leaked queue entries from the prior session.
  await engine.dispatchAsync(buildTickEvent(5));
  engine.unmount();
  engine.mount(createDocument(), {
    runtimeId: "runtime-async",
    projectId: "project-async",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });
  const stateAfterRemount = await engine.dispatchAsync(buildTickEvent(9));
  assert.equal(stateAfterRemount.values["field-counter"], 9);
});
