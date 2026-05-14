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

  const projectEvents = (doc.runtime?.projectEvents ?? []) as RuntimeEventTypeDefinition[];
  for (const def of projectEvents) {
    if (def.type === eventType) return def.payloadShape?.fields ?? [];
  }

  for (const step of doc.steps ?? []) {
    const fromNode = findEventSourceInNode(step, eventType);
    if (fromNode) return fromNode;
  }

  return [];
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
