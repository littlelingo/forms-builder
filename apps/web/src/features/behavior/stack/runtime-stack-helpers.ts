import type {
  AuthoringDocument,
  AuthoringField,
  AuthoringGroup,
  AuthoringSection,
  AuthoringStep,
  BehaviorLibraryEntry,
} from "@form-builder/schema";
import type { RuntimeListenerDefinition } from "@form-builder/schema";
import { describeRuntimeAction } from "../utils/runtime-helpers";
import { SYSTEM_LIBRARY } from "../library/system-library";

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

// ---------------------------------------------------------------------------
// Broken-ref computation
// ---------------------------------------------------------------------------

export type BrokenRefEntry = {
  kind: "source" | "target" | "eventRef" | "libraryRef";
  lastSeenLabel?: string;
};

/**
 * Returns an array describing any broken references in the listener.
 * A ref is "broken" when its id is not resolvable in the current document /
 * library, or when the tombstone map indicates it was recently deleted.
 *
 * Pass `tombstones` for deleted-node awareness (lastSeenLabel is taken from
 * there when available).  Pass `projectLibrary` for libraryRef resolution.
 */
export function computeBrokenRefs(
  listener: RuntimeListenerDefinition,
  document: AuthoringDocument,
  projectLibrary: BehaviorLibraryEntry[],
  tombstones: Record<string, { lastSeenLabel?: string }>,
): BrokenRefEntry[] {
  const broken: BrokenRefEntry[] = [];

  // Build a quick node-id set from the document.
  const nodeIds = buildNodeIdSet(document);

  // source ref
  const sourceId = listener.source?.id;
  if (sourceId && !nodeIds.has(sourceId)) {
    broken.push({ kind: "source", lastSeenLabel: tombstones[sourceId]?.lastSeenLabel });
  }

  // target ref
  const targetId = listener.target?.id;
  if (targetId && !nodeIds.has(targetId)) {
    broken.push({ kind: "target", lastSeenLabel: tombstones[targetId]?.lastSeenLabel });
  }

  // eventRef
  const eventRefId = listener.eventRef?.id;
  if (eventRefId && !resolveEventRefExists(document, eventRefId)) {
    broken.push({ kind: "eventRef", lastSeenLabel: tombstones[eventRefId]?.lastSeenLabel });
  }

  // libraryRef (only check when not detached)
  const libraryRef = listener.libraryRef;
  if (libraryRef && !libraryRef.detached) {
    const refId = libraryRef.id;
    const inSystem = SYSTEM_LIBRARY.some((entry) => entry.id === refId);
    const inProject = projectLibrary.some((entry) => entry.id === refId);
    if (!inSystem && !inProject) {
      broken.push({ kind: "libraryRef", lastSeenLabel: tombstones[refId]?.lastSeenLabel });
    }
  }

  return broken;
}

/** Build a Set of all node ids present in the document. */
function buildNodeIdSet(document: AuthoringDocument): Set<string> {
  const ids = new Set<string>();
  ids.add(document.id);
  const visitNode = (node: AuthoringStep | AuthoringSection | AuthoringGroup | AuthoringField | undefined): void => {
    if (!node) return;
    const id = (node as { id?: string }).id;
    if (id) ids.add(id);
    const asStep = node as Partial<AuthoringStep>;
    if (Array.isArray(asStep.sections)) {
      for (const child of asStep.sections) visitNode(child);
    }
    const asSection = node as Partial<AuthoringSection>;
    if (Array.isArray(asSection.groups)) {
      for (const child of asSection.groups) visitNode(child);
    }
    const asHasFields = node as Partial<AuthoringSection | AuthoringGroup>;
    if (Array.isArray(asHasFields.fields)) {
      for (const child of asHasFields.fields) visitNode(child);
    }
  };
  for (const step of document.steps ?? []) {
    visitNode(step);
  }
  return ids;
}

/** Returns true if the given eventRef id is resolvable anywhere in the document. */
function resolveEventRefExists(document: AuthoringDocument, refId: string): boolean {
  const formEvents = document.runtime?.formEvents ?? [];
  if (formEvents.some((def) => def.id === refId)) return true;
  const visitNode = (node: AuthoringStep | AuthoringSection | AuthoringGroup | AuthoringField | undefined): boolean => {
    if (!node) return false;
    const sources = (node as { runtime?: { eventSources?: { id: string }[] } }).runtime?.eventSources ?? [];
    if (sources.some((s) => s.id === refId)) return true;
    const asStep = node as Partial<AuthoringStep>;
    if (Array.isArray(asStep.sections)) {
      for (const child of asStep.sections) {
        if (visitNode(child)) return true;
      }
    }
    const asSection = node as Partial<AuthoringSection>;
    if (Array.isArray(asSection.groups)) {
      for (const child of asSection.groups) {
        if (visitNode(child)) return true;
      }
    }
    const asHasFields = node as Partial<AuthoringSection | AuthoringGroup>;
    if (Array.isArray(asHasFields.fields)) {
      for (const child of asHasFields.fields) {
        if (visitNode(child)) return true;
      }
    }
    return false;
  };
  for (const step of document.steps ?? []) {
    if (visitNode(step)) return true;
  }
  return false;
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
