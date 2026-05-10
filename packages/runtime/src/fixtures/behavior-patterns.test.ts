import test from "node:test";
import assert from "node:assert/strict";

import type { RuntimeEventEnvelope } from "@form-builder/schema";

import { createRuntimeEngine } from "../engine";
import { createBehaviorPatternsFixture } from "./behavior-patterns";

function tap(
  target: { nodeId: string; nodeType: "field" | "component" },
  eventType: string,
  payload: Record<string, unknown> = {},
): RuntimeEventEnvelope {
  return {
    type: eventType,
    version: "1.0",
    source: {
      runtimeId: "runtime-fixture",
      formId: "fixture-behavior-patterns",
      projectId: null,
      nodeId: target.nodeId,
      nodeType: target.nodeType,
    },
    target: {
      runtimeId: "runtime-fixture",
      formId: "fixture-behavior-patterns",
      projectId: null,
      nodeId: target.nodeId,
      nodeType: target.nodeType,
    },
    payload,
    correlationId: `corr-${target.nodeId}-${eventType}`,
    timestamp: "2026-05-10T12:00:00.000Z",
  };
}

test("behavior-patterns fixture: capture/target/bubble phases all fire for a bubbling event", () => {
  const engine = createRuntimeEngine();
  engine.mount(createBehaviorPatternsFixture());

  const state = engine.dispatch(tap({ nodeId: "btn-bubble", nodeType: "component" }, "button.tap"));

  assert.equal(state.values["echo-capture"], "capture-phase", "capture-phase form listener should run");
  assert.equal(state.values["echo-target"], "target-phase", "target-phase node listener should run");
  assert.equal(state.values["echo-bubble"], "bubble-phase", "bubble-phase form listener should run");
});

test("behavior-patterns fixture: non-bubbling dispatch only fires the target listener", () => {
  const engine = createRuntimeEngine();
  engine.mount(createBehaviorPatternsFixture());

  const state = engine.dispatch(tap({ nodeId: "btn-silent", nodeType: "component" }, "button.silent"));

  assert.equal(state.values["echo-silent"], "silent-target", "target-phase listener should still fire");
  assert.equal(state.values["echo-bubble"], undefined, "no bubble-phase listener should observe a non-bubbling event");
  assert.equal(
    state.values["echo-capture"],
    undefined,
    "no capture-phase listener should observe a non-bubbling event (no path beyond the dispatcher)",
  );
});

test("behavior-patterns fixture: checkbox-group toggle resolves host-action payload refs at dispatch", () => {
  const engine = createRuntimeEngine();
  engine.mount(createBehaviorPatternsFixture());

  const report = engine.dispatchWithReport(
    tap({ nodeId: "chk-prefs", nodeType: "field" }, "checkbox.toggle", { checked: true, optionId: "opt-a" }),
  );

  const hostAction = report.emittedEvents.find((evt) => evt.type === "host.action_requested");
  assert.ok(hostAction, "host.action_requested should be emitted");
  const payload = (hostAction!.payload as { config?: { payload?: Record<string, unknown> } }).config?.payload;
  assert.ok(payload, "host action config payload must be present");
  assert.equal(payload?.value, true, "$payload.checked resolved to true");
  assert.equal(payload?.source, "opt-a", "$payload.optionId resolved to the toggled option");
});
