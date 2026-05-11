/**
 * Phase 3 Stage #19 — authoring-lints tests.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { RuntimeListenerDefinition } from "@form-builder/schema";

import { lintRuntimeListener } from "./authoring-lints";

function makeListener(actions: RuntimeListenerDefinition["actions"]): RuntimeListenerDefinition {
  return {
    id: "test-listener",
    label: "Test",
    eventName: "form.tick",
    enabled: true,
    conditions: [],
    actions,
  };
}

test("authoring-lints: clean listener returns empty findings", () => {
  const listener = makeListener([
    {
      id: "act-1",
      kind: "set_field_value",
      target: null,
      config: { fieldId: "f", value: "x" },
      continueOnError: false,
    },
  ]);
  assert.deepEqual(lintRuntimeListener(listener), []);
});

test("authoring-lints: detects correlationId collision across two host_call_await actions", () => {
  const listener = makeListener([
    {
      id: "act-await-1",
      kind: "host_call_await",
      target: null,
      config: { handlerKey: "h", correlationId: "shared-id" },
      continueOnError: false,
    },
    {
      id: "act-await-2",
      kind: "host_call_await",
      target: null,
      config: { handlerKey: "h2", correlationId: "shared-id" },
      continueOnError: false,
    },
  ]);
  const findings = lintRuntimeListener(listener);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, "correlation_id_collision");
  assert.equal(findings[0].actionId, "act-await-2");
  assert.equal((findings[0].details as { correlationId: string }).correlationId, "shared-id");
});

test("authoring-lints: distinct correlationIds across host_call_await actions are clean", () => {
  const listener = makeListener([
    {
      id: "act-await-1",
      kind: "host_call_await",
      target: null,
      config: { handlerKey: "h", correlationId: "id-1" },
      continueOnError: false,
    },
    {
      id: "act-await-2",
      kind: "host_call_await",
      target: null,
      config: { handlerKey: "h2", correlationId: "id-2" },
      continueOnError: false,
    },
  ]);
  assert.deepEqual(lintRuntimeListener(listener), []);
});

test("authoring-lints: blank/missing correlationId never flags collision", () => {
  const listener = makeListener([
    { id: "a1", kind: "host_call_await", target: null, config: { handlerKey: "h" }, continueOnError: false },
    { id: "a2", kind: "host_call_await", target: null, config: { handlerKey: "h" }, continueOnError: false },
    { id: "a3", kind: "host_call_await", target: null, config: { handlerKey: "h", correlationId: "" }, continueOnError: false },
  ]);
  assert.deepEqual(lintRuntimeListener(listener), []);
});

test("authoring-lints: collision detection walks into branch arms", () => {
  const listener = makeListener([
    {
      id: "branch-outer",
      kind: "branch",
      target: null,
      config: {
        conditions: [],
        actions: [
          {
            id: "act-inner-await-1",
            kind: "host_call_await",
            target: null,
            config: { handlerKey: "h", correlationId: "branched-id" },
            continueOnError: false,
          },
        ],
        else: [],
      },
      continueOnError: false,
    },
    {
      id: "act-outer-await",
      kind: "host_call_await",
      target: null,
      config: { handlerKey: "h2", correlationId: "branched-id" },
      continueOnError: false,
    },
  ]);
  const findings = lintRuntimeListener(listener);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, "correlation_id_collision");
});

test("authoring-lints: $response token in action before host_call_await is flagged", () => {
  const listener = makeListener([
    {
      id: "act-set-early",
      kind: "set_field_value",
      target: null,
      config: { fieldId: "city", value: { $runtime: "current.response.city" } },
      continueOnError: false,
    },
    {
      id: "act-await",
      kind: "host_call_await",
      target: null,
      config: { handlerKey: "h" },
      continueOnError: false,
    },
  ]);
  const findings = lintRuntimeListener(listener);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, "response_token_out_of_scope");
  assert.equal(findings[0].actionId, "act-set-early");
});

test("authoring-lints: $response token after host_call_await is clean", () => {
  const listener = makeListener([
    {
      id: "act-await",
      kind: "host_call_await",
      target: null,
      config: { handlerKey: "h" },
      continueOnError: false,
    },
    {
      id: "act-set-late",
      kind: "set_field_value",
      target: null,
      config: { fieldId: "city", value: { $runtime: "current.response.city" } },
      continueOnError: false,
    },
  ]);
  assert.deepEqual(lintRuntimeListener(listener), []);
});

test("authoring-lints: literal $response string in config is detected too", () => {
  const listener = makeListener([
    {
      id: "act-bad",
      kind: "dispatch_event",
      target: null,
      config: { eventType: "x", payload: { user: "$response.user.id" } },
      continueOnError: false,
    },
  ]);
  const findings = lintRuntimeListener(listener);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, "response_token_out_of_scope");
});
