import type {
  AuthoringDocument,
  AuthoringField,
  AuthoringGroup,
  AuthoringSection,
  AuthoringStep,
} from "@form-builder/schema";
import type { RuntimeListenerDefinition } from "@form-builder/schema";
import { describeRuntimeAction } from "../utils/runtime-helpers";

/** One-line summary of a behavior row's collapsed display. */
export function summariseListener(listener: RuntimeListenerDefinition): string {
  const actions = listener.actions ?? [];
  if (actions.length === 0) {
    return "(no actions)";
  }
  const first = describeRuntimeAction(actions[0]);
  if (actions.length === 1) {
    return first;
  }
  return `${first} · +${actions.length - 1} more`;
}

/** Trigger pill label (short). Falls back to the legacy eventName when no eventRef. */
export function listenerTriggerPill(listener: RuntimeListenerDefinition, document?: AuthoringDocument): string {
  // Resolve eventRef -> def name when present.
  const refId = listener.eventRef?.id;
  if (refId && document) {
    const resolved = resolveEventRefDefName(document, refId);
    if (resolved) {
      return shortenEventLabel(resolved);
    }
  }
  const name = listener.eventName ?? "";
  return shortenEventLabel(name);
}

function shortenEventLabel(eventName: string): string {
  if (!eventName) return "event";
  // For dotted names like "field.change", drop the prefix.
  const dotIdx = eventName.indexOf(".");
  if (dotIdx >= 0) {
    return eventName.slice(dotIdx + 1);
  }
  return eventName;
}

function resolveEventRefDefName(document: AuthoringDocument, refId: string): string | null {
  const formEvents = document.runtime?.formEvents ?? [];
  for (const def of formEvents) {
    if (def.id === refId) {
      return def.name ?? def.type ?? null;
    }
  }
  // Walk node tree for node-scope eventSources
  const visit = (
    node: AuthoringStep | AuthoringSection | AuthoringGroup | AuthoringField | undefined,
  ): string | null => {
    if (!node) return null;
    const sources =
      (node as { runtime?: { eventSources?: { id: string; name?: string; type?: string }[] } }).runtime?.eventSources ??
      [];
    for (const def of sources) {
      if (def.id === refId) {
        return def.name ?? def.type ?? null;
      }
    }
    // Recurse into children — AuthoringStep has sections, AuthoringSection has groups + fields,
    // AuthoringGroup has fields. AuthoringField has no children.
    const asStep = node as Partial<AuthoringStep>;
    if (Array.isArray(asStep.sections)) {
      for (const child of asStep.sections) {
        const found = visit(child);
        if (found) return found;
      }
    }
    const asSection = node as Partial<AuthoringSection>;
    if (Array.isArray(asSection.groups)) {
      for (const child of asSection.groups) {
        const found = visit(child);
        if (found) return found;
      }
    }
    const asHasFields = node as Partial<AuthoringSection | AuthoringGroup>;
    if (Array.isArray(asHasFields.fields)) {
      for (const child of asHasFields.fields) {
        const found = visit(child);
        if (found) return found;
      }
    }
    return null;
  };
  for (const step of document.steps ?? []) {
    const found = visit(step);
    if (found) return found;
  }
  return null;
}

/** Counts behaviors elsewhere in the document that reference the given node id.
 *  Excludes listeners owned by the queried node itself.
 */
export function countListenersReferencingNode(document: AuthoringDocument, nodeId: string): number {
  if (!nodeId) return 0;
  let count = 0;
  const matchesRef = (listener: RuntimeListenerDefinition): boolean => {
    return (
      listener.source?.id === nodeId ||
      listener.target?.id === nodeId ||
      listener.eventSourceNodeId === nodeId ||
      listener.targetNodeId === nodeId
    );
  };
  // Form-level listeners
  for (const listener of document.runtime?.formListeners ?? []) {
    if (matchesRef(listener)) count++;
  }
  // Walk node tree; exclude listeners owned by the queried node itself.
  const visit = (node: AuthoringStep | AuthoringSection | AuthoringGroup | AuthoringField | undefined): void => {
    if (!node) return;
    const ownerId = (node as { id?: string }).id;
    const listeners = (node as { runtime?: { listeners?: RuntimeListenerDefinition[] } }).runtime?.listeners ?? [];
    if (ownerId !== nodeId) {
      for (const listener of listeners) {
        if (matchesRef(listener)) count++;
      }
    }
    const asStep = node as Partial<AuthoringStep>;
    if (Array.isArray(asStep.sections)) {
      for (const child of asStep.sections) {
        visit(child);
      }
    }
    const asSection = node as Partial<AuthoringSection>;
    if (Array.isArray(asSection.groups)) {
      for (const child of asSection.groups) {
        visit(child);
      }
    }
    const asHasFields = node as Partial<AuthoringSection | AuthoringGroup>;
    if (Array.isArray(asHasFields.fields)) {
      for (const child of asHasFields.fields) {
        visit(child);
      }
    }
  };
  for (const step of document.steps ?? []) {
    visit(step);
  }
  return count;
}
