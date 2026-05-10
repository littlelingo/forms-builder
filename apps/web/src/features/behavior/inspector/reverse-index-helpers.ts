import type {
  AuthoringDocument,
  AuthoringField,
  AuthoringGroup,
  AuthoringSection,
  AuthoringStep,
  RuntimeEventTypeDefinition,
  RuntimeListenerDefinition,
} from "@form-builder/schema";

/**
 * Phase 2D-2 — Inspector reverse-index per-event panels.
 *
 * For each event type seen anywhere in the document or project catalog, build
 * a "raised by / consumed by" entry so the inspector can show per-event panels
 * for the selected node (or the whole document when nothing is selected).
 */

export type EventReverseIndexScope = "form" | "node" | "project" | "unknown";

export interface ReverseIndexRaisedEntry {
  /** Distinguishes a node-owned event-type definition from a dispatch_event action. */
  kind: "event_source" | "action_dispatch";
  /** Stable key for React keying + open-handoff resolution. */
  key: string;
  /** Node that owns the event source, or owns the listener firing the dispatch. */
  ownerNodeId: string | null;
  ownerLabel: string;
  /** When kind === "action_dispatch", the listener that owns the dispatcher. */
  listenerId?: string;
  detail: string;
}

export interface ReverseIndexConsumedEntry {
  key: string;
  listenerId: string;
  /** Node owning the listener; null for form-level. */
  ownerNodeId: string | null;
  ownerLabel: string;
  detail: string;
  enabled: boolean;
}

export interface EventReverseIndexEntry {
  /** Resolved event-type string (e.g. "field.change"). */
  eventType: string;
  /** Optional event-def id when one exists for this type. */
  eventDefId?: string | null;
  scope: EventReverseIndexScope;
  scopeLabel: string;
  raisedBy: ReverseIndexRaisedEntry[];
  consumedBy: ReverseIndexConsumedEntry[];
}

const FORM_SCOPE_LABEL = "Form-level";
const PROJECT_SCOPE_LABEL = "Project-level";

interface NodeWalkContext {
  nodeId: string;
  label: string;
  kind: "step" | "section" | "group" | "field";
  scopeLabel: string;
}

function nodeKindOf(
  node: AuthoringStep | AuthoringSection | AuthoringGroup | AuthoringField,
): "step" | "section" | "group" | "field" {
  if ("sections" in node) return "step";
  if ("groups" in node) return "section";
  if ("fields" in node) return "group";
  return "field";
}

function nodeLabelOf(node: AuthoringStep | AuthoringSection | AuthoringGroup | AuthoringField): string {
  const asField = node as Partial<AuthoringField>;
  const asStep = node as Partial<AuthoringStep>;
  const asAny = node as { name?: string; id?: string };
  return asField.label ?? asStep.title ?? asAny.name ?? asAny.id ?? "unknown";
}

function walkNodes(
  document: AuthoringDocument,
  visit: (node: AuthoringStep | AuthoringSection | AuthoringGroup | AuthoringField, context: NodeWalkContext) => void,
): void {
  const recurse = (node: AuthoringStep | AuthoringSection | AuthoringGroup | AuthoringField | undefined): void => {
    if (!node) return;
    const nodeId = (node as { id?: string }).id;
    if (!nodeId) return;
    const kind = nodeKindOf(node);
    const label = nodeLabelOf(node);
    const scopeLabel = `${label} (${kind})`;
    visit(node, { nodeId, label, kind, scopeLabel });
    const asStep = node as Partial<AuthoringStep>;
    if (Array.isArray(asStep.sections)) {
      for (const child of asStep.sections) recurse(child);
    }
    const asSection = node as Partial<AuthoringSection>;
    if (Array.isArray(asSection.groups)) {
      for (const child of asSection.groups) recurse(child);
    }
    const asHasFields = node as Partial<AuthoringSection | AuthoringGroup>;
    if (Array.isArray(asHasFields.fields)) {
      for (const child of asHasFields.fields) recurse(child);
    }
  };
  for (const step of document.steps ?? []) {
    recurse(step);
  }
}

function eventTypeOfDefinition(def: RuntimeEventTypeDefinition): string {
  return def.type ?? def.name ?? "";
}

function eventTypeOfListener(listener: RuntimeListenerDefinition, eventDefsById: Map<string, string>): string {
  const refId = listener.eventRef?.id;
  if (refId) {
    const resolved = eventDefsById.get(refId);
    if (resolved) return resolved;
  }
  return listener.type ?? listener.eventName ?? "";
}

function eventTypeOfDispatchAction(action: { kind: string; config: Record<string, unknown> }): string | null {
  if (action.kind !== "dispatch_event" && action.kind !== "emit_event") return null;
  const fromType = typeof action.config.eventType === "string" ? action.config.eventType.trim() : "";
  if (fromType) return fromType;
  const fromName = typeof action.config.eventName === "string" ? action.config.eventName.trim() : "";
  if (fromName) return fromName;
  return null;
}

function ensureEntry(
  byType: Map<string, EventReverseIndexEntry>,
  eventType: string,
  base: Partial<EventReverseIndexEntry>,
): EventReverseIndexEntry {
  const existing = byType.get(eventType);
  if (existing) {
    if (base.eventDefId && !existing.eventDefId) existing.eventDefId = base.eventDefId;
    if (base.scope && existing.scope === "unknown") {
      existing.scope = base.scope;
      existing.scopeLabel = base.scopeLabel ?? existing.scopeLabel;
    }
    return existing;
  }
  const created: EventReverseIndexEntry = {
    eventType,
    eventDefId: base.eventDefId ?? null,
    scope: base.scope ?? "unknown",
    scopeLabel: base.scopeLabel ?? "No definition",
    raisedBy: [],
    consumedBy: [],
  };
  byType.set(eventType, created);
  return created;
}

/**
 * Build a per-event reverse index covering form-level, node-level, and
 * project-level events seen anywhere in the document. Each entry lists who
 * raises the event (event-source definition or `dispatch_event` action) and
 * who consumes it (listeners).
 */
export function computeEventReverseIndex(
  document: AuthoringDocument,
  projectEvents: RuntimeEventTypeDefinition[] = [],
): EventReverseIndexEntry[] {
  const byType = new Map<string, EventReverseIndexEntry>();
  const eventDefsById = new Map<string, string>();

  for (const def of document.runtime?.formEvents ?? []) {
    const type = eventTypeOfDefinition(def);
    if (!type) continue;
    eventDefsById.set(def.id, type);
    const entry = ensureEntry(byType, type, {
      eventDefId: def.id,
      scope: "form",
      scopeLabel: FORM_SCOPE_LABEL,
    });
    entry.raisedBy.push({
      kind: "event_source",
      key: `form-event-${def.id}`,
      ownerNodeId: null,
      ownerLabel: FORM_SCOPE_LABEL,
      detail: def.description ?? (def.bubbles === false ? "non-bubbling" : "bubbles"),
    });
  }

  for (const def of projectEvents) {
    const type = eventTypeOfDefinition(def);
    if (!type) continue;
    eventDefsById.set(def.id, type);
    const entry = ensureEntry(byType, type, {
      eventDefId: def.id,
      scope: "project",
      scopeLabel: PROJECT_SCOPE_LABEL,
    });
    entry.raisedBy.push({
      kind: "event_source",
      key: `project-event-${def.id}`,
      ownerNodeId: null,
      ownerLabel: PROJECT_SCOPE_LABEL,
      detail: def.description ?? "Project scope",
    });
  }

  walkNodes(document, (node, context) => {
    const runtime = (node as { runtime?: { eventSources?: RuntimeEventTypeDefinition[] } }).runtime;
    const sources = runtime?.eventSources ?? [];
    for (const def of sources) {
      const type = eventTypeOfDefinition(def);
      if (!type) continue;
      eventDefsById.set(def.id, type);
      const entry = ensureEntry(byType, type, {
        eventDefId: def.id,
        scope: "node",
        scopeLabel: context.scopeLabel,
      });
      entry.raisedBy.push({
        kind: "event_source",
        key: `node-event-${def.id}`,
        ownerNodeId: context.nodeId,
        ownerLabel: context.scopeLabel,
        detail: def.description ?? "Node event",
      });
    }
  });

  const handleListener = (listener: RuntimeListenerDefinition, scopeLabel: string, ownerNodeId: string | null) => {
    const consumedType = eventTypeOfListener(listener, eventDefsById);
    if (consumedType) {
      const entry = ensureEntry(byType, consumedType, {
        eventDefId: listener.eventRef?.id ?? null,
      });
      entry.consumedBy.push({
        key: `listener-${listener.id}`,
        listenerId: listener.id,
        ownerNodeId,
        ownerLabel: scopeLabel,
        detail: listener.label ?? `When ${consumedType}`,
        enabled: listener.enabled !== false,
      });
    }
    for (const action of listener.actions ?? []) {
      const dispatchType = eventTypeOfDispatchAction(action as { kind: string; config: Record<string, unknown> });
      if (!dispatchType) continue;
      const entry = ensureEntry(byType, dispatchType, {});
      const dispatcherNodeId = action.target?.nodeId ?? ownerNodeId;
      entry.raisedBy.push({
        kind: "action_dispatch",
        key: `dispatch-${listener.id}-${action.id}`,
        listenerId: listener.id,
        ownerNodeId: dispatcherNodeId,
        ownerLabel: scopeLabel,
        detail: `Dispatched by ${listener.label ?? `When ${consumedType || "?"}`}`,
      });
    }
  };

  for (const listener of document.runtime?.formListeners ?? []) {
    handleListener(listener, FORM_SCOPE_LABEL, null);
  }
  walkNodes(document, (node, context) => {
    const runtime = (node as { runtime?: { listeners?: RuntimeListenerDefinition[] } }).runtime;
    for (const listener of runtime?.listeners ?? []) {
      handleListener(listener, context.scopeLabel, context.nodeId);
    }
  });

  return Array.from(byType.values()).sort((left, right) => left.eventType.localeCompare(right.eventType));
}

/**
 * Filter a precomputed reverse index to entries that mention the given node id
 * either as a raiser (event_source owner or dispatcher) or as a listener owner.
 */
export function filterReverseIndexByNode(entries: EventReverseIndexEntry[], nodeId: string): EventReverseIndexEntry[] {
  if (!nodeId) return entries;
  return entries.filter((entry) => {
    const inRaised = entry.raisedBy.some((row) => row.ownerNodeId === nodeId);
    const inConsumed = entry.consumedBy.some((row) => row.ownerNodeId === nodeId);
    return inRaised || inConsumed;
  });
}
