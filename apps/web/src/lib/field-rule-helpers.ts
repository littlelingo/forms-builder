import type {
  RuntimeActionDefinition,
  RuntimeConditionDefinition,
  RuntimeConditionOperator,
  RuntimeListenerDefinition,
} from "@form-builder/schema";

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

function isAtomCondition(c: unknown): c is RuntimeConditionDefinition {
  if (!c || typeof c !== "object") return false;
  const obj = c as { kind?: string; source?: unknown };
  if (obj.kind === "group") return false;
  if (!obj.source || typeof obj.source !== "object") return false;
  return true;
}

export function isFieldRuleListener(listener: RuntimeListenerDefinition): boolean {
  if (listener.eventName !== "field.change") return false;
  if (!listener.eventSourceNodeId) return false;
  const conditions = listener.conditions ?? [];
  if (conditions.length !== 1) return false;
  const cond = conditions[0];
  if (!isAtomCondition(cond)) return false;
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
    expectedValue: cond.expectedValue ?? "",
    effect: ACTION_KIND_TO_EFFECT[action.kind],
    affectedFieldId: config.nodeId,
  };
}
