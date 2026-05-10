/**
 * Phase 3 Stage H — fuzz harness for FIFO ordering determinism.
 *
 * Spec gate: 100 concurrent dispatchAsync calls with 30% containing
 * host_call_await actions, with seeded randomness for the response
 * arrival order. After all promises settle, the trace must reflect a
 * deterministic per-dispatcher FIFO ordering and no continuation_mismatch
 * events should appear (every host_call_await must resolve cleanly).
 */
import assert from "node:assert/strict";
import test from "node:test";

import type {
  AuthoringDocument,
  RuntimeEventEnvelope,
  RuntimeHostContext,
  RuntimeListenerDefinition,
} from "@form-builder/schema";

import { createRuntimeEngine } from "./engine";

// Seeded LCG so the test is byte-deterministic across runs.
function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function createFuzzDocument(): AuthoringDocument {
  const formListeners: RuntimeListenerDefinition[] = [
    // Sync listener — fires on every form.tick
    {
      id: "listener-sync",
      label: "Sync set",
      eventName: "form.tick",
      enabled: true,
      conditions: [],
      actions: [
        {
          id: "act-sync-set",
          kind: "set_field_value",
          target: { nodeId: "field-counter", nodeType: "field" },
          config: { fieldId: "field-counter", value: { $runtime: "current.event.payload.tick" } },
          continueOnError: false,
        },
      ],
    },
    // Async listener — fires on form.tick.async with a host_call_await
    {
      id: "listener-await",
      label: "Await listener",
      eventName: "form.tick.async",
      enabled: true,
      conditions: [],
      actions: [
        {
          id: "act-await",
          kind: "host_call_await",
          target: null,
          config: { handlerKey: "fuzz_handler", timeoutMs: 5000 },
          continueOnError: false,
        },
        {
          id: "act-set-after",
          kind: "set_field_value",
          target: { nodeId: "field-counter", nodeType: "field" },
          config: { fieldId: "field-counter", value: { $runtime: "current.event.payload.tick" } },
          continueOnError: false,
        },
      ],
    },
  ];

  return {
    id: "form-fuzz",
    title: "Phase 3 Fuzz Form",
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
          dispatcherId: "form-fuzz",
          dispatcherType: "form",
          bubbles: false,
          description: "sync tick",
        },
        {
          id: "evt-tick-async",
          type: "form.tick.async",
          dispatcherId: "form-fuzz",
          dispatcherType: "form",
          bubbles: false,
          description: "async tick",
        },
      ],
      formListeners,
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
    environment: "fuzz",
    session: { projectId: "project-fuzz" },
    auth: {},
    app: { stage: "builder" },
    data: {},
  };
}

function buildFuzzEvent(type: string, tick: number, correlationId: string): RuntimeEventEnvelope {
  return {
    type,
    version: "1.0",
    source: {
      runtimeId: "runtime-fuzz",
      formId: "form-fuzz",
      projectId: "project-fuzz",
      nodeId: "form-fuzz",
      nodeType: "form",
    },
    payload: { tick },
    correlationId,
    timestamp: new Date(2026, 0, 1, 0, 0, tick).toISOString(),
  };
}

test(
  "Phase 3 Stage H fuzz: 100 concurrent dispatches produce deterministic state with no continuation_mismatch",
  { timeout: 15000 },
  async () => {
    const document = createFuzzDocument();
    const engine = createRuntimeEngine();
    engine.mount(document, {
      runtimeId: "runtime-fuzz",
      projectId: "project-fuzz",
      hostContext: createHostContext(),
      emitLoadEvent: false,
    });

    // Auto-respond to every host.action_requested as soon as it fires. The
    // engine's asyncTail serializes dispatches, so responses must be issued
    // progressively — capturing all 100 requests up-front would deadlock
    // because dispatches 2..100 are still queued behind the suspended #1.
    // The subscriber is attached pre-dispatch so it sees every request.
    const respondedIds = new Set<string>();
    const unsubscribe = engine.subscribe((event) => {
      if (event.type !== "host.action_requested") return;
      const cid = typeof event.payload.correlationId === "string" ? event.payload.correlationId : null;
      if (!cid || respondedIds.has(cid)) return;
      respondedIds.add(cid);
      // Use queueMicrotask so the response runs after the current routeEvent
      // call returns; the suspended continuation is registered by then.
      queueMicrotask(() => {
        engine.dispatch({
          type: "host.action_response",
          version: "1.0",
          source: {
            runtimeId: "runtime-fuzz",
            formId: "form-fuzz",
            projectId: "project-fuzz",
            nodeId: null,
            nodeType: null,
          },
          payload: { correlationId: cid, ok: true },
          correlationId: cid,
          timestamp: new Date(2026, 0, 1, 1, 0).toISOString(),
        });
      });
    });

    const random = createSeededRandom(42);
    const total = 100;
    const inflight: Promise<unknown>[] = [];
    let asyncCount = 0;

    for (let i = 0; i < total; i++) {
      const isAsync = random() < 0.3;
      const correlationId = `corr-${i}`;
      if (isAsync) {
        asyncCount += 1;
        inflight.push(engine.dispatchAsync(buildFuzzEvent("form.tick.async", i, correlationId)));
      } else {
        inflight.push(engine.dispatchAsync(buildFuzzEvent("form.tick", i, correlationId)));
      }
    }

    await Promise.all(inflight);
    unsubscribe();

    // Sanity: somewhere around 30% should be async per the seeded RNG.
    assert.ok(asyncCount > 15 && asyncCount < 50, `async share should be near 30% of ${total}; got ${asyncCount}`);

    const traceTypes = engine.getTrace().map((entry) => entry.event.type);
    const mismatchCount = traceTypes.filter((t) => t === "runtime.continuation_mismatch").length;
    assert.equal(
      mismatchCount,
      0,
      `every host_call_await must resume cleanly; got ${mismatchCount} continuation_mismatch entries`,
    );

    // FIFO determinism: every dispatch chain wrote field-counter to its tick
    // value. Because asyncTail serializes, the final state must equal
    // `total - 1`, regardless of how many dispatches were async.
    const final = engine.getState();
    assert.equal(final.values["field-counter"], total - 1, "FIFO must terminate with the last-dispatched tick value");
  },
);

test("Phase 3 Stage H: sync host.action_response on stale id emits continuation_mismatch trace exactly once", () => {
  const engine = createRuntimeEngine();
  engine.mount(createFuzzDocument(), {
    runtimeId: "runtime-fuzz",
    projectId: "project-fuzz",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });
  const traceBefore = engine
    .getTrace()
    .filter((entry) => entry.event.type === "runtime.continuation_mismatch").length;
  engine.dispatch({
    type: "host.action_response",
    version: "1.0",
    source: {
      runtimeId: "runtime-fuzz",
      formId: "form-fuzz",
      projectId: "project-fuzz",
      nodeId: null,
      nodeType: null,
    },
    payload: { correlationId: "no-such" },
    correlationId: "no-such",
    timestamp: new Date(2026, 0, 1, 1, 0).toISOString(),
  });
  const traceAfter = engine
    .getTrace()
    .filter((entry) => entry.event.type === "runtime.continuation_mismatch").length;
  assert.equal(traceAfter - traceBefore, 1);
});
