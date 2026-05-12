import type {
  AuthoringDocument,
  AuthoringField,
  AuthoringGroup,
  AuthoringSection,
  AuthoringStep,
  AuthoringProjectRecord,
  RuntimeListenerDefinition,
} from "@form-builder/schema";

import { createRuntimeDocumentBehavior, createRuntimeNodeBehavior } from "../features/behavior/utils/runtime-helpers";

/**
 * One-way behavior export (MVP scope assessment #3 — export half).
 *
 * Produces a versioned JSON artefact containing one or more authored
 * listeners plus the document-context needed to read them offline (step,
 * section, group, field ids and labels for the owning node). The artefact
 * is intentionally read-only — import is deferred until NodeRef remapping
 * and EventRef resolution policies are designed.
 *
 * Format: { version: "1.0", exportedAt, source, entries: ExportEntry[] }.
 * Single-listener exports use the same envelope with one entry.
 */

export const BEHAVIOR_EXPORT_VERSION = "1.0";

export interface ExportSource {
  projectId: string | null;
  projectName: string | null;
  documentId: string;
  documentTitle: string;
}

export interface ExportNodeContext {
  ownerKind: "form" | "step" | "section" | "group" | "field";
  ownerId: string;
  ownerLabel: string;
  /** Path of ancestors for human readability (form → step → … → owner). */
  ancestry: { kind: string; id: string; label: string }[];
}

export interface BehaviorExportEntry {
  context: ExportNodeContext;
  listener: RuntimeListenerDefinition;
}

export interface BehaviorExportEnvelope {
  version: string;
  exportedAt: string;
  source: ExportSource;
  entries: BehaviorExportEntry[];
}

function makeAncestry(
  document: AuthoringDocument,
  step: AuthoringStep | null,
  section: AuthoringSection | null,
  group: AuthoringGroup | null,
): ExportNodeContext["ancestry"] {
  const path: ExportNodeContext["ancestry"] = [{ kind: "form", id: document.id, label: document.title }];
  if (step) path.push({ kind: "step", id: step.id, label: step.title });
  if (section) path.push({ kind: "section", id: section.id, label: section.title });
  if (group) path.push({ kind: "group", id: group.id, label: group.label });
  return path;
}

function makeFieldContext(
  document: AuthoringDocument,
  step: AuthoringStep,
  section: AuthoringSection,
  group: AuthoringGroup | null,
  field: AuthoringField,
): ExportNodeContext {
  return {
    ownerKind: "field",
    ownerId: field.id,
    ownerLabel: field.label,
    ancestry: makeAncestry(document, step, section, group),
  };
}

/**
 * Walks the document and yields every authored listener with its node-owner
 * context. The form-level listeners (document.runtime.formListeners) come
 * first, then each step in order, then section/group/field within step.
 */
export function collectExportEntries(document: AuthoringDocument): BehaviorExportEntry[] {
  const entries: BehaviorExportEntry[] = [];

  const formListeners = document.runtime?.formListeners ?? [];
  for (const listener of formListeners) {
    entries.push({
      context: {
        ownerKind: "form",
        ownerId: document.id,
        ownerLabel: document.title,
        ancestry: makeAncestry(document, null, null, null),
      },
      listener,
    });
  }

  for (const step of document.steps) {
    const stepListeners = step.runtime?.listeners ?? [];
    for (const listener of stepListeners) {
      entries.push({
        context: {
          ownerKind: "step",
          ownerId: step.id,
          ownerLabel: step.title,
          ancestry: makeAncestry(document, step, null, null),
        },
        listener,
      });
    }

    for (const section of step.sections) {
      const sectionListeners = section.runtime?.listeners ?? [];
      for (const listener of sectionListeners) {
        entries.push({
          context: {
            ownerKind: "section",
            ownerId: section.id,
            ownerLabel: section.title,
            ancestry: makeAncestry(document, step, section, null),
          },
          listener,
        });
      }

      for (const group of section.groups) {
        const groupListeners = group.runtime?.listeners ?? [];
        for (const listener of groupListeners) {
          entries.push({
            context: {
              ownerKind: "group",
              ownerId: group.id,
              ownerLabel: group.label,
              ancestry: makeAncestry(document, step, section, group),
            },
            listener,
          });
        }

        for (const field of group.fields) {
          const fieldListeners = field.runtime?.listeners ?? [];
          for (const listener of fieldListeners) {
            entries.push({
              context: makeFieldContext(document, step, section, group, field),
              listener,
            });
          }
        }
      }

      for (const field of section.fields) {
        const fieldListeners = field.runtime?.listeners ?? [];
        for (const listener of fieldListeners) {
          entries.push({
            context: makeFieldContext(document, step, section, null, field),
            listener,
          });
        }
      }
    }
  }

  return entries;
}

function makeSource(document: AuthoringDocument, project: AuthoringProjectRecord | null): ExportSource {
  return {
    projectId: project?.id ?? null,
    projectName: project?.name ?? null,
    documentId: document.id,
    documentTitle: document.title,
  };
}

export function buildDocumentExportEnvelope(
  document: AuthoringDocument,
  project: AuthoringProjectRecord | null,
): BehaviorExportEnvelope {
  return {
    version: BEHAVIOR_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    source: makeSource(document, project),
    entries: collectExportEntries(document),
  };
}

export function buildListenerExportEnvelope(
  document: AuthoringDocument,
  project: AuthoringProjectRecord | null,
  listenerId: string,
): BehaviorExportEnvelope | null {
  const entry = collectExportEntries(document).find((e) => e.listener.id === listenerId);
  if (!entry) return null;
  return {
    version: BEHAVIOR_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    source: makeSource(document, project),
    entries: [entry],
  };
}

/** Slugify a project/document name for the exported filename. */
function fileSafe(value: string, fallback: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || fallback;
}

export function envelopeFilename(envelope: BehaviorExportEnvelope, kind: "document" | "listener"): string {
  const namePart = fileSafe(envelope.source.projectName ?? envelope.source.documentTitle, "project");
  const stamp = envelope.exportedAt.slice(0, 19).replace(/[:T]/g, "-");
  if (kind === "listener") {
    const listenerId = envelope.entries[0]?.listener.id ?? "listener";
    return `behaviors-${namePart}-${fileSafe(listenerId, "listener")}-${stamp}.json`;
  }
  return `behaviors-${namePart}-${stamp}.json`;
}

/**
 * Locate the runtime node-behavior container that owns this entry, creating
 * a default block on the node if none exists. Returns null when the node id
 * referenced by the entry's context no longer exists in the document — the
 * MVP import does not attempt NodeRef remapping; cross-project transplants
 * are out of scope until a follow-up RFC.
 */
function findListenerContainer(
  doc: AuthoringDocument,
  entry: BehaviorExportEntry,
): { listeners: import("@form-builder/schema").RuntimeListenerDefinition[] } | null {
  const { ownerKind, ownerId } = entry.context;
  if (ownerKind === "form") {
    if (!doc.runtime) doc.runtime = createRuntimeDocumentBehavior();
    return { listeners: doc.runtime.formListeners };
  }
  for (const step of doc.steps) {
    if (ownerKind === "step" && step.id === ownerId) {
      if (!step.runtime) step.runtime = createRuntimeNodeBehavior();
      return { listeners: step.runtime.listeners };
    }
    for (const section of step.sections) {
      if (ownerKind === "section" && section.id === ownerId) {
        if (!section.runtime) section.runtime = createRuntimeNodeBehavior();
        return { listeners: section.runtime.listeners };
      }
      for (const group of section.groups) {
        if (ownerKind === "group" && group.id === ownerId) {
          if (!group.runtime) group.runtime = createRuntimeNodeBehavior();
          return { listeners: group.runtime.listeners };
        }
        for (const field of group.fields) {
          if (ownerKind === "field" && field.id === ownerId) {
            if (!field.runtime) field.runtime = createRuntimeNodeBehavior();
            return { listeners: field.runtime.listeners };
          }
        }
      }
      for (const field of section.fields) {
        if (ownerKind === "field" && field.id === ownerId) {
          if (!field.runtime) field.runtime = createRuntimeNodeBehavior();
          return { listeners: field.runtime.listeners };
        }
      }
    }
  }
  return null;
}

export interface BehaviorImportResult {
  imported: number;
  skipped: number;
  reasons: string[];
}

export interface BehaviorImportValidation {
  ok: boolean;
  envelope?: BehaviorExportEnvelope;
  error?: string;
}

/** Light schema validation for an arbitrary parsed-JSON payload. */
export function validateExportEnvelope(payload: unknown): BehaviorImportValidation {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Payload is not an object." };
  }
  const obj = payload as Record<string, unknown>;
  if (obj.version !== BEHAVIOR_EXPORT_VERSION) {
    return {
      ok: false,
      error: `Unsupported version: expected ${BEHAVIOR_EXPORT_VERSION}, got ${String(obj.version)}.`,
    };
  }
  if (!Array.isArray(obj.entries)) {
    return { ok: false, error: "Envelope missing entries[]." };
  }
  for (const entry of obj.entries) {
    if (!entry || typeof entry !== "object") return { ok: false, error: "Entry is not an object." };
    const e = entry as Record<string, unknown>;
    if (!e.context || typeof e.context !== "object") return { ok: false, error: "Entry missing context." };
    if (!e.listener || typeof e.listener !== "object") return { ok: false, error: "Entry missing listener." };
  }
  return { ok: true, envelope: payload as BehaviorExportEnvelope };
}

function freshListenerId(prefix = "lst"): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `${prefix}_${ts}_${rand}`;
}

/**
 * Append every entry from `envelope` into `doc`, stamping fresh ids to
 * avoid collisions with pre-existing listeners. Entries whose owner node
 * is missing in the target document are recorded as skipped — no
 * NodeRef remapping is attempted.
 *
 * Mutates `doc` in place to fit the existing `updateAuthoringDocument`
 * pattern in App.tsx.
 */
export function applyEnvelopeToDocument(
  doc: AuthoringDocument,
  envelope: BehaviorExportEnvelope,
): BehaviorImportResult {
  const result: BehaviorImportResult = { imported: 0, skipped: 0, reasons: [] };
  for (const entry of envelope.entries) {
    const container = findListenerContainer(doc, entry);
    if (!container) {
      result.skipped += 1;
      result.reasons.push(
        `Owner ${entry.context.ownerKind} "${entry.context.ownerLabel}" (${entry.context.ownerId}) not found in this document.`,
      );
      continue;
    }
    const cloned: import("@form-builder/schema").RuntimeListenerDefinition = {
      ...entry.listener,
      id: freshListenerId(),
      provenance: entry.listener.provenance ?? "manual",
    };
    container.listeners.push(cloned);
    result.imported += 1;
  }
  return result;
}

/** Browser-only: trigger a JSON download of the envelope. */
export function downloadEnvelope(envelope: BehaviorExportEnvelope, kind: "document" | "listener"): void {
  const filename = envelopeFilename(envelope, kind);
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
