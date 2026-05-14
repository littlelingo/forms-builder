import {
  runtimeCoreEventType,
  type AuthoringDocument,
  type RuntimeEventTypeDefinition,
  type RuntimePayloadField,
} from "@form-builder/schema";
import { mergeRuntimePayloadFieldsWithStandardFields } from "../features/behavior/utils/runtime-helpers";

export function listPayloadFieldsForEventType(
  eventType: string,
  doc: AuthoringDocument | null,
): RuntimePayloadField[] {
  const core = runtimeCoreEventType(eventType);
  if (core) {
    return mergeRuntimePayloadFieldsWithStandardFields(core.payloadShape?.fields ?? []);
  }

  if (!doc) return [];

  const docEvents = (doc.runtime?.formEvents ?? []) as RuntimeEventTypeDefinition[];
  for (const def of docEvents) {
    if (def.type === eventType) return def.payloadShape?.fields ?? [];
  }

  for (const step of doc.steps ?? []) {
    const fromNode = findEventSourceInNode(step, eventType);
    if (fromNode) return fromNode;
  }

  return [];
}

export interface CrossStepInfo {
  sourceStepId: string;
  sourceStepTitle: string;
  targetStepId: string;
  targetStepTitle: string;
}

export interface CrossStepRef extends CrossStepInfo {
  sourceNodeId: string;
}

interface NodeStepLocation {
  stepId: string;
  stepTitle: string;
}

function findNodeStep(doc: AuthoringDocument, nodeId: string): NodeStepLocation | null {
  for (const step of doc.steps ?? []) {
    if (containsNodeId(step, nodeId)) {
      return { stepId: step.id, stepTitle: step.title };
    }
  }
  return null;
}

function containsNodeId(node: unknown, nodeId: string): boolean {
  if (!node || typeof node !== "object") return false;
  const c = node as {
    id?: string;
    sections?: unknown[];
    groups?: unknown[];
    fields?: unknown[];
  };
  if (c.id === nodeId) return true;
  for (const child of [...(c.sections ?? []), ...(c.groups ?? []), ...(c.fields ?? [])]) {
    if (containsNodeId(child, nodeId)) return true;
  }
  return false;
}

export function isCrossStepReference(
  doc: AuthoringDocument,
  sourceNodeId: string,
  targetNodeId: string,
): CrossStepInfo | null {
  const sourceStep = findNodeStep(doc, sourceNodeId);
  const targetStep = findNodeStep(doc, targetNodeId);
  if (!sourceStep || !targetStep) return null;
  if (sourceStep.stepId === targetStep.stepId) return null;
  return {
    sourceStepId: sourceStep.stepId,
    sourceStepTitle: sourceStep.stepTitle,
    targetStepId: targetStep.stepId,
    targetStepTitle: targetStep.stepTitle,
  };
}

export function collectCrossStepRefsForListener(
  doc: AuthoringDocument,
  listener: { eventSourceNodeId?: string | null; dispatcherId?: string | null },
  hostNodeId: string,
): CrossStepRef[] {
  const sources: string[] = [];
  if (listener.eventSourceNodeId) sources.push(listener.eventSourceNodeId);
  if (listener.dispatcherId && listener.dispatcherId !== listener.eventSourceNodeId) {
    sources.push(listener.dispatcherId);
  }
  const refs: CrossStepRef[] = [];
  const seen = new Set<string>();
  for (const sourceNodeId of sources) {
    if (seen.has(sourceNodeId)) continue;
    seen.add(sourceNodeId);
    const info = isCrossStepReference(doc, sourceNodeId, hostNodeId);
    if (info) refs.push({ ...info, sourceNodeId });
  }
  return refs;
}

function findEventSourceInNode(node: unknown, eventType: string): RuntimePayloadField[] | null {
  if (!node || typeof node !== "object") return null;
  const candidate = node as {
    runtime?: { eventSources?: RuntimeEventTypeDefinition[] };
    sections?: unknown[];
    groups?: unknown[];
    fields?: unknown[];
  };
  for (const def of candidate.runtime?.eventSources ?? []) {
    if (def.type === eventType) return def.payloadShape?.fields ?? [];
  }
  for (const child of [
    ...(candidate.sections ?? []),
    ...(candidate.groups ?? []),
    ...(candidate.fields ?? []),
  ]) {
    const found = findEventSourceInNode(child, eventType);
    if (found) return found;
  }
  return null;
}
