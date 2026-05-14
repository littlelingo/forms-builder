import type {
  RuntimeActionDefinition,
  RuntimeConditionDefinition,
  RuntimeConditionOperator,
  RuntimeListenerDefinition,
} from "@form-builder/schema";
import { isRuntimeConditionAtom } from "@form-builder/schema";

export type FieldRuleEffect = "show" | "hide" | "require" | "optional";

export interface FieldRule {
  listenerId: string;
  triggerFieldId: string;
  operator: RuntimeConditionOperator;
  expectedValue: string;
  effect: FieldRuleEffect;
  affectedFieldId: string;
}

const ACTION_KIND_TO_EFFECT: Record<string, FieldRuleEffect> = {
  show_node: "show",
  hide_node: "hide",
  mark_required: "require",
  mark_optional: "optional",
};

export function isFieldRuleListener(listener: RuntimeListenerDefinition): boolean {
  if (listener.eventName !== "field.change") return false;
  if (!listener.eventSourceNodeId) return false;
  const conditions = listener.conditions ?? [];
  if (conditions.length !== 1) return false;
  const cond = conditions[0];
  if (!isRuntimeConditionAtom(cond)) return false;
  const source = cond.source as { kind?: string; fieldId?: string };
  if (source.kind !== "field_value") return false;
  if (source.fieldId !== listener.eventSourceNodeId) return false;
  const actions = listener.actions ?? [];
  if (actions.length !== 1) return false;
  const action = actions[0];
  if (!action || !(action.kind in ACTION_KIND_TO_EFFECT)) return false;
  const config = action.config as { nodeId?: string } | undefined;
  if (!config?.nodeId) return false;
  return true;
}

export function decodeFieldRule(listener: RuntimeListenerDefinition): FieldRule | null {
  if (!isFieldRuleListener(listener)) return null;
  const cond = listener.conditions[0] as RuntimeConditionDefinition;
  const action = listener.actions[0] as RuntimeActionDefinition;
  const config = action.config as { nodeId: string };
  return {
    listenerId: listener.id,
    triggerFieldId: listener.eventSourceNodeId as string,
    operator: cond.operator,
    expectedValue: cond.expectedValue == null ? "" : String(cond.expectedValue),
    effect: ACTION_KIND_TO_EFFECT[action.kind],
    affectedFieldId: config.nodeId,
  };
}

const EFFECT_TO_ACTION_KIND: Record<FieldRuleEffect, string> = {
  show: "show_node",
  hide: "hide_node",
  require: "mark_required",
  optional: "mark_optional",
};

function randomId(prefix: string): string {
  const buf = new Uint8Array(8);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
  }
  return `${prefix}-${Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function encodeFieldRule(rule: Omit<FieldRule, "listenerId">, listenerId?: string): RuntimeListenerDefinition {
  const id = listenerId ?? randomId("L");
  const cond: RuntimeConditionDefinition = {
    id: randomId("C"),
    source: { kind: "field_value", fieldId: rule.triggerFieldId },
    operator: rule.operator,
    expectedValue: rule.expectedValue,
    enabled: true,
  } as unknown as RuntimeConditionDefinition;
  const action: RuntimeActionDefinition = {
    id: randomId("A"),
    kind: EFFECT_TO_ACTION_KIND[rule.effect],
    config: { nodeId: rule.affectedFieldId },
  } as unknown as RuntimeActionDefinition;
  return {
    id,
    type: "field.change",
    eventName: "field.change",
    eventSourceNodeId: rule.triggerFieldId,
    eventSourceNodeType: "field",
    dispatcherId: rule.triggerFieldId,
    dispatcherType: "field",
    targetNodeId: rule.triggerFieldId,
    targetNodeType: "field",
    wiringMode: "local",
    enabled: true,
    conditions: [cond],
    actions: [action],
  } as unknown as RuntimeListenerDefinition;
}
