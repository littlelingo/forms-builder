import type { RuntimeActionDiagnostic, RuntimeDispatchReport } from "@form-builder/runtime";

export interface ActionGroup {
  targetId: string;
  actions: Array<RuntimeActionDiagnostic & { listenerId: string }>;
}

function extractTargetId(action: RuntimeActionDiagnostic): string | null {
  const target = action.target as { fieldId?: string; nodeId?: string } | null | undefined;
  if (!target) return null;
  return target.fieldId ?? target.nodeId ?? null;
}

/**
 * Bucket every action executed by a matched listener by its target node/field id.
 * Insertion order is preserved (driven by the order in which target ids are first
 * encountered while iterating `report.listeners[].actions`). Listeners that did
 * not match (`matched === false`) contribute nothing. Actions without an
 * extractable target id are skipped.
 */
export function groupActionsByReceiver(report: RuntimeDispatchReport): ActionGroup[] {
  const buckets = new Map<string, ActionGroup>();
  for (const listener of report.listeners) {
    if (!listener.matched) continue;
    for (const action of listener.actions) {
      const targetId = extractTargetId(action);
      if (!targetId) continue;
      let group = buckets.get(targetId);
      if (!group) {
        group = { targetId, actions: [] };
        buckets.set(targetId, group);
      }
      group.actions.push({ ...action, listenerId: listener.listenerId });
    }
  }
  return [...buckets.values()];
}
