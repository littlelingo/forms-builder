import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeFieldRule, encodeFieldRule, isFieldRuleListener, type FieldRule } from "./field-rule-helpers";
import type { RuntimeListenerDefinition } from "@form-builder/schema";

function buildRuleListener(opts: {
  id?: string;
  triggerFieldId: string;
  operator: string;
  expectedValue: string;
  actionKind: string;
  affectedFieldId: string;
}): RuntimeListenerDefinition {
  return {
    id: opts.id ?? "L1",
    type: "field.change",
    eventName: "field.change",
    eventSourceNodeId: opts.triggerFieldId,
    eventSourceNodeType: "field",
    dispatcherId: opts.triggerFieldId,
    dispatcherType: "field",
    targetNodeId: opts.triggerFieldId,
    targetNodeType: "field",
    wiringMode: "local",
    enabled: true,
    conditions: [
      {
        id: "C1",
        source: { kind: "field_value", fieldId: opts.triggerFieldId },
        operator: opts.operator as "equals" | "not_equals" | "contains" | "exists",
        expectedValue: opts.expectedValue,
      },
    ],
    actions: [
      {
        id: "A1",
        kind: opts.actionKind as "show_node" | "hide_node" | "mark_required" | "mark_optional",
        config: { nodeId: opts.affectedFieldId },
      },
    ],
  } as unknown as RuntimeListenerDefinition;
}

test("isFieldRuleListener accepts a canonical show_node rule", () => {
  const listener = buildRuleListener({
    triggerFieldId: "f-a",
    operator: "equals",
    expectedValue: "yes",
    actionKind: "show_node",
    affectedFieldId: "f-b",
  });
  assert.equal(isFieldRuleListener(listener), true);
});

test("isFieldRuleListener rejects a listener with multiple actions", () => {
  const listener = buildRuleListener({
    triggerFieldId: "f-a",
    operator: "equals",
    expectedValue: "yes",
    actionKind: "show_node",
    affectedFieldId: "f-b",
  });
  listener.actions.push({
    id: "A2",
    kind: "hide_node",
    config: { nodeId: "f-c" },
  } as never);
  assert.equal(isFieldRuleListener(listener), false);
});

test("decodeFieldRule returns the typed FieldRule on a canonical listener", () => {
  const listener = buildRuleListener({
    id: "L7",
    triggerFieldId: "f-a",
    operator: "equals",
    expectedValue: "yes",
    actionKind: "mark_required",
    affectedFieldId: "f-b",
  });
  const rule = decodeFieldRule(listener);
  assert.ok(rule);
  assert.equal(rule!.listenerId, "L7");
  assert.equal(rule!.triggerFieldId, "f-a");
  assert.equal(rule!.operator, "equals");
  assert.equal(rule!.expectedValue, "yes");
  assert.equal(rule!.effect, "require");
  assert.equal(rule!.affectedFieldId, "f-b");
});

test("decodeFieldRule returns null when listener has a group condition", () => {
  const listener = buildRuleListener({
    triggerFieldId: "f-a",
    operator: "equals",
    expectedValue: "yes",
    actionKind: "show_node",
    affectedFieldId: "f-b",
  });
  (listener.conditions as unknown[]) = [{ kind: "group", operator: "and", members: [] }];
  assert.equal(decodeFieldRule(listener), null);
});

test("decodeFieldRule returns null when listener uses a non-rule action kind", () => {
  const listener = buildRuleListener({
    triggerFieldId: "f-a",
    operator: "equals",
    expectedValue: "yes",
    actionKind: "set_field_value",
    affectedFieldId: "f-b",
  });
  assert.equal(decodeFieldRule(listener), null);
});

test("encodeFieldRule produces a listener whose decode round-trips to the source rule", () => {
  const source = {
    triggerFieldId: "f-trigger",
    operator: "not_equals" as const,
    expectedValue: "veteran",
    effect: "hide" as const,
    affectedFieldId: "f-target",
  };
  const listener = encodeFieldRule(source);
  const decoded = decodeFieldRule(listener);
  assert.ok(decoded);
  assert.equal(decoded!.triggerFieldId, source.triggerFieldId);
  assert.equal(decoded!.operator, source.operator);
  assert.equal(decoded!.expectedValue, source.expectedValue);
  assert.equal(decoded!.effect, source.effect);
  assert.equal(decoded!.affectedFieldId, source.affectedFieldId);
  assert.equal(decoded!.listenerId.length > 0, true);
});

test("encodeFieldRule reuses provided listener id when supplied", () => {
  const listener = encodeFieldRule(
    {
      triggerFieldId: "f-a",
      operator: "equals",
      expectedValue: "yes",
      effect: "show",
      affectedFieldId: "f-b",
    },
    "L-existing",
  );
  assert.equal(listener.id, "L-existing");
});

test("encodeFieldRule round-trips for all four effects", () => {
  const effects: FieldRule["effect"][] = ["show", "require", "optional"];
  for (const effect of effects) {
    const source = {
      triggerFieldId: "f-trigger",
      operator: "equals" as const,
      expectedValue: "yes",
      effect,
      affectedFieldId: "f-target",
    };
    const listener = encodeFieldRule(source);
    const decoded = decodeFieldRule(listener);
    assert.ok(decoded, `expected decode to succeed for effect=${effect}`);
    assert.equal(decoded!.effect, effect, `effect should round-trip (${effect})`);
  }
});
