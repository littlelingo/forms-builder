import type { CSSProperties } from "react";

import type { RuntimeTraceEntry } from "@form-builder/runtime";
import type {
  AuthoringDocument,
  AuthoringField,
  BehaviorProvenance,
  RuntimeActionDefinition,
  RuntimeActionKind,
  RuntimeConditionDefinition,
  RuntimeDocumentBehavior,
  RuntimeEventDefinition,
  RuntimeListenerDefinition,
  RuntimeNodeBehavior,
  RuntimeNodeType,
  RuntimePayloadField,
  RuntimePayloadMode,
  RuntimePayloadShape,
  SemanticType,
} from "@form-builder/schema";
import { runtimeCoreEventType, runtimeCoreEventTypes, runtimeStandardEventPayloadFields } from "@form-builder/schema";

import type { AuthoringSelection } from "../../../lib/authoring-utils";
import { formatLabel } from "../../../lib/ui-utils";

// ---------------------------------------------------------------------------
// Local behavior types (previously in App.tsx)
// ---------------------------------------------------------------------------

export type BehaviorPresetCategory =
  | "recommended"
  | "source"
  | "visibility"
  | "validation"
  | "data"
  | "navigation"
  | "events"
  | "advanced";
export type BehaviorPresetGroupCategory = Exclude<BehaviorPresetCategory, "recommended" | "source" | "advanced">;

export interface RuntimeEditorScope {
  scopeKind: "form" | "step" | "section" | "group" | "field" | "component";
  label: string;
  description: string;
  eventSources: RuntimeEventDefinition[];
  listeners: RuntimeListenerDefinition[];
}

export interface BehaviorPresetBase {
  id: string;
  label: string;
  description: string;
  category: BehaviorPresetGroupCategory;
  actionSummary: string;
  componentLabel?: string;
}

export interface RuntimeSourceEventOption {
  type: string;
  label: string;
  bubbles: boolean;
  description?: string | null;
}

export interface RuntimeEventSourceCandidate {
  id: string;
  dispatchKey?: string | null;
  nodeType: RuntimeNodeType;
  label: string;
  componentLabel: string;
  locationLabel: string;
  semanticType?: SemanticType | null;
  pathIds: string[];
  events: RuntimeSourceEventOption[];
  eventDefinitions: RuntimeEventDefinition[];
}

export interface CrossItemActionStarter {
  id: string;
  label: string;
  description: string;
  actionSummary: string;
  createActions: () => RuntimeActionDefinition[];
}

export interface LegacyConditionalRule {
  ruleId: string;
  whenFieldId: string;
  operator: RuntimeConditionDefinition["operator"];
  expectedValue?: string;
  effect: "show" | "hide" | "require" | "disable";
  enabled?: boolean;
}

export interface LegacyConditionalRuleGroupMember {
  rule: LegacyConditionalRule;
  index: number;
}

export interface LegacyConditionalRuleGroup {
  key: string;
  sourceFieldLabel: string;
  conditionTitle: string;
  conditionDetail: string;
  effectsSummary: string;
  members: LegacyConditionalRuleGroupMember[];
}

export interface RuntimePreset extends BehaviorPresetBase {
  triggerName: string;
  actionKinds: RuntimeActionKind[];
  apply: (scope: RuntimeEditorScope, currentField: AuthoringField | null) => RuntimeListenerDefinition;
}

export interface RuntimePayloadEditorState {
  mode: RuntimePayloadMode;
  raw: string;
}

export type RuntimePayloadFieldType = "string" | "number" | "boolean" | "json" | "null" | "runtime";

export type RuntimePayloadReferenceKey =
  | "current.field.id"
  | "current.field.key"
  | "current.step.id"
  | "current.step.title"
  | "current.form.id"
  | "current.form.title"
  | "current.project.id"
  | "current.source.node.id"
  | "current.source.node.key"
  | "current.source.node.type"
  | "current.event.type"
  | "current.event.target.id"
  | "current.event.target.key"
  | "current.event.target.type"
  | "current.event.currentTarget.id"
  | "current.event.currentTarget.key"
  | "current.event.currentTarget.type"
  | "current.event.phase"
  | "current.runtime.value"
  | `current.event.payload.${string}`;

export interface RuntimePayloadEntry {
  key: string;
  value: string;
  type: RuntimePayloadFieldType;
}

export interface RuntimePayloadTemplate {
  id: string;
  label: string;
  description: string;
  entries: RuntimePayloadEntry[];
}

export interface RuntimePayloadReferenceOption {
  key: RuntimePayloadReferenceKey;
  label: string;
  description: string;
}

export interface RuntimeListenerActionChoice {
  id: string;
  label: string;
  description: string;
  kind: RuntimeActionKind;
  group: "target" | "value" | "event" | "advanced";
  createAction: () => RuntimeActionDefinition;
}

export type RuntimeReactionBooleanValue = "unset" | "true" | "false";
export type RuntimeReactionValueMode = "unset" | "static" | "payload" | "clear";
export type RuntimeReactionNavigationValue =
  | "unset"
  | "go_to_next_step"
  | "go_to_previous_step"
  | "go_to_step"
  | "submit_form";

export type EventFlowPayloadValues = Record<string, string>;

export interface RuntimeReactionTargetOption {
  candidate: RuntimeEventSourceCandidate;
  relationshipLabel: string;
  group: "path" | "all";
}

export interface StructuredRuntimeTraceEvidence {
  entryKey: string;
  heading: string;
  title: string;
  summary: string;
  pills: Array<{ label: string; value: string }>;
  payloadEntries: Array<{ key: string; value: string }>;
  footer: string;
}

export interface RuntimeTraceContextSummary {
  entryKey: string;
  title: string;
  detail: string;
  direction: string;
  timestamp: string;
  inspectable: boolean;
}

export interface RuntimeTraceChainStep {
  entryKey: string;
  role: "trigger" | "selected" | "after" | "before";
  title: string;
  detail: string;
  direction: string;
  timestamp: string;
  inspectable: boolean;
}

export interface RuntimeTraceChainSummary {
  correlationId: string;
  entryKey: string;
  title: string;
  summary: string;
  stepLabels: string[];
  authoredCount: number;
  latestTimestamp: string;
  active: boolean;
}

export type BehaviorGraphFilter = "all" | "state" | "interaction";
export type BehaviorGraphMode = "focus" | "overview";
export type BehaviorGraphDensity = "comfortable" | "dense";
export type BehaviorStudioView = "studio" | "advanced";
export type BehaviorStudioMode = "create" | "event" | "listener" | "action" | "manage" | "test" | "graph";
export type BehaviorStudioManagerMode = "all" | "conditions" | "flows" | "index";
export type BehaviorStudioCreationPath = "choice" | "event" | "listener";
export type BehaviorListenerSourceType = RuntimeNodeType;
export type BehaviorStudioAnchor = {
  top: number;
  bottom: number;
  centerX: number;
  pointerX: number;
  width: number;
};
export type BehaviorStudioPlacement = "above" | "below" | "center";
export type BehaviorStudioPositionLayout = {
  dialogStyle?: CSSProperties;
  arrowStyle?: CSSProperties;
  placement: BehaviorStudioPlacement;
  anchored: boolean;
};
export type BehaviorIndexObjectView = "all" | "impacts" | "started";
/**
 * Phase 2C: Manager layout switcher. `table` is the legacy flat list;
 * `by_event` groups behaviors by event-type so reverse-index queries
 * ("who raises X?", "who consumes X?") read at a glance.
 */
export type BehaviorIndexLayout = "table" | "by_event";
export type BehaviorIndexStatusFilter = "all" | "enabled" | "disabled";
export type DocumentBehaviorSurfaceMode = "board" | "minimap" | "canvas";
export type DocumentBehaviorClusterFocus = "all" | "field" | "group" | "section" | "step";
export type DocumentBehaviorClusterFamily = Exclude<DocumentBehaviorClusterFocus, "all">;
export type DocumentBehaviorCanvasDensity = "comfortable" | "dense";
export type DocumentBehaviorExpandedTarget = "form" | string | null;
export type BehaviorWorkspaceMode = "authoring" | "document_graph";

export interface LogicMapConditionalEntry {
  id: string;
  title: string;
  detail: string;
  scopeLabel: string;
  sourceFieldLabel: string;
  sourceFieldId: string;
  targetFieldLabel: string;
  targetFieldId: string;
  effectLabel: string;
  enabled: boolean;
  stepId: string;
  sectionId: string;
  sourceSelection: AuthoringSelection;
  ruleIndex: number;
  graphSelection: BehaviorGraphSelection;
}

export interface LogicMapListenerEntry {
  id: string;
  scopeLabel: string;
  eventName: string;
  actionsSummary: string;
  actionKinds: RuntimeActionKind[];
  enabled: boolean;
  sourceNodeId?: string | null;
  targetNodeIds: string[];
  actionCount: number;
  stepId?: string | null;
  selection: AuthoringSelection | null;
  graphSelection: BehaviorGraphSelection;
  provenance?: BehaviorProvenance;
}

export type BehaviorGraphSelection =
  | {
      kind: "rule";
      ruleId: string;
      phase: "trigger" | "condition" | "effect";
    }
  | {
      kind: "listener";
      listenerId: string;
      phase: "trigger" | "action";
      actionId?: string;
    };

export interface LogicMapStepEntry {
  id: string;
  title: string;
  selection: AuthoringSelection;
  sectionCount: number;
  fieldCount: number;
  conditionalBehavior: LogicMapConditionalEntry[];
  runtimeListeners: LogicMapListenerEntry[];
}

export interface BehaviorScopeCluster {
  key: string;
  title: string;
  kindLabel: string;
  detail: string;
  conditions: LogicMapConditionalEntry[];
  listeners: LogicMapListenerEntry[];
  selection: AuthoringSelection | null;
}

export interface DocumentBehaviorClusterGroupSummary {
  key: Exclude<DocumentBehaviorClusterFocus, "all">;
  label: string;
  firstLaneId: string | null;
  scopeCount: number;
  laneCount: number;
  ruleCount: number;
  listenerCount: number;
}

export interface RuntimeActionChainTemplate {
  id: string;
  label: string;
  description: string;
  category: BehaviorPresetGroupCategory;
  actionSummary: string;
  createActions: () => RuntimeActionDefinition[];
}

export type MapViewMode = "graph" | "summary";

export interface BehaviorGraphEntryContext {
  source: "map" | "navigator" | "clusters";
  title: string;
  detail: string;
}

// ---------------------------------------------------------------------------
// Runtime/behavior utility helpers (previously top-level in App.tsx)
// ---------------------------------------------------------------------------

export const runtimeActionOptions: Array<{ value: RuntimeActionKind; label: string }> = [
  { value: "go_to_next_step", label: "Go to next step" },
  { value: "go_to_previous_step", label: "Go to previous step" },
  { value: "go_to_step", label: "Go to a specific step" },
  { value: "submit_form", label: "Submit form" },
  { value: "set_field_value", label: "Set a field value" },
  { value: "clear_field_value", label: "Clear a field value" },
  { value: "show_node", label: "Show a node" },
  { value: "hide_node", label: "Hide a node" },
  { value: "enable_node", label: "Enable a node" },
  { value: "disable_node", label: "Disable a node" },
  { value: "mark_required", label: "Mark required" },
  { value: "mark_optional", label: "Mark optional" },
  { value: "dispatch_event", label: "Dispatch event" },
  { value: "host_action", label: "Request host action" },
];

export const builtInRuntimeEventNames = new Set<string>(runtimeCoreEventTypes.map((eventType) => eventType.type));

export const behaviorPresetCategoryLabels: Record<BehaviorPresetCategory, string> = {
  recommended: "This item",
  source: "Another item",
  visibility: "Visibility",
  validation: "Validation",
  data: "Data",
  navigation: "Navigation",
  events: "Event actions",
  advanced: "Advanced",
};

export function normalizeDocumentBehaviorClusterKind(kindLabel: string): DocumentBehaviorClusterFamily {
  const normalized = kindLabel.trim().toLowerCase();
  if (normalized === "field" || normalized === "group" || normalized === "section" || normalized === "step") {
    return normalized;
  }
  return "step";
}

export function documentBehaviorClusterFocusLabel(focus: DocumentBehaviorClusterFocus): string {
  if (focus === "all") {
    return "All scopes";
  }
  return `${focus[0]?.toUpperCase() ?? ""}${focus.slice(1)} scopes`;
}

export function createRuntimeNodeBehavior(): RuntimeNodeBehavior {
  return {
    eventSources: [],
    listeners: [],
  };
}

export function createRuntimeDocumentBehavior(): RuntimeDocumentBehavior {
  return {
    version: "1.0",
    formEvents: [],
    formListeners: [],
    hostBindings: [],
    submitEventName: "form.submit",
    sessionStateShape: {
      mode: "key_value",
      fields: [],
      example: {},
      notes: [],
    },
  };
}

export function cloneRuntimePayloadShape(shape: RuntimePayloadShape | null | undefined): RuntimePayloadShape | null {
  return shape ? (JSON.parse(JSON.stringify(shape)) as RuntimePayloadShape) : null;
}

export function createRuntimeEventSource(
  name: string,
  scope: RuntimeEditorScope,
  nodeId?: string,
  options: {
    id?: string | null;
    bubbles?: boolean | null;
    payloadShape?: RuntimePayloadShape | null;
    description?: string | null;
  } = {},
): RuntimeEventDefinition {
  const coreEvent = runtimeCoreEventType(name);
  return {
    id: options.id ?? crypto.randomUUID(),
    type: name,
    dispatcherId: nodeId ?? null,
    dispatcherType: scope.scopeKind,
    bubbles: options.bubbles ?? coreEvent?.bubbles ?? (name.includes(".") ? undefined : true),
    name,
    sourceNodeId: nodeId ?? null,
    sourceNodeType: scope.scopeKind,
    payloadShape: cloneRuntimePayloadShape(options.payloadShape ?? coreEvent?.payloadShape ?? null),
    description: options.description ?? coreEvent?.description ?? null,
  };
}

export function createRuntimeAction(
  kind: RuntimeActionKind,
  config: Record<string, unknown> = {},
): RuntimeActionDefinition {
  return {
    id: crypto.randomUUID(),
    kind,
    label: null,
    target: null,
    config,
    continueOnError: false,
  };
}

export function createFieldValueCondition(
  fieldId: string,
  operator: RuntimeConditionDefinition["operator"],
  expectedValue?: unknown,
  label?: string,
): RuntimeConditionDefinition {
  return {
    id: crypto.randomUUID(),
    label: label ?? null,
    enabled: true,
    source: {
      kind: "field_value",
      fieldId,
    },
    operator,
    expectedValue,
  };
}

export function createEventPayloadCondition(
  path: string,
  operator: RuntimeConditionDefinition["operator"],
  expectedValue?: unknown,
  label?: string,
): RuntimeConditionDefinition {
  return {
    id: crypto.randomUUID(),
    label: label ?? null,
    enabled: true,
    source: {
      kind: "event_payload",
      path,
    },
    operator,
    expectedValue,
  };
}

export function createRuntimeListener(
  eventName: string,
  actions: RuntimeActionDefinition[],
  sourceNodeId?: string | null,
): RuntimeListenerDefinition {
  return {
    id: crypto.randomUUID(),
    label: null,
    type: eventName,
    dispatcherId: sourceNodeId ?? null,
    dispatcherType: null,
    eventSourceNodeId: sourceNodeId ?? null,
    eventSourceNodeType: null,
    eventSourceLabel: null,
    targetNodeId: sourceNodeId ?? null,
    targetNodeType: null,
    wiringMode: "local",
    useCapture: false,
    priority: 0,
    eventName,
    sourceNodeId: sourceNodeId ?? null,
    enabled: true,
    conditions: [],
    actions,
  };
}

export type LegacyRuleField = AuthoringField & { conditionals?: LegacyConditionalRule[] };

export function legacyFieldConditionals(field: AuthoringField | null | undefined): LegacyConditionalRule[] {
  return (field as LegacyRuleField | null | undefined)?.conditionals ?? [];
}

export function mutableLegacyFieldConditionals(field: AuthoringField): LegacyConditionalRule[] {
  const legacyField = field as LegacyRuleField;
  legacyField.conditionals ??= [];
  return legacyField.conditionals;
}

export function isLegacyConditionalRuleEnabled(rule: LegacyConditionalRule): boolean {
  return rule.enabled !== false;
}

export function setLegacyConditionalRuleEnabled(rule: LegacyConditionalRule, enabled: boolean): void {
  rule.enabled = enabled;
}

export function createListenerGraphSelection(listener: RuntimeListenerDefinition): BehaviorGraphSelection {
  return {
    kind: "listener",
    listenerId: listener.id,
    phase: listener.actions.length ? "action" : "trigger",
    actionId: listener.actions[0]?.id,
  };
}

export function findAuthoringFieldById(document: AuthoringDocument, fieldId: string): AuthoringField | null {
  for (const step of document.steps) {
    for (const section of step.sections) {
      const sectionField = section.fields.find((field) => field.id === fieldId);
      if (sectionField) {
        return sectionField;
      }
      for (const group of section.groups) {
        const groupField = group.fields.find((field) => field.id === fieldId);
        if (groupField) {
          return groupField;
        }
      }
    }
  }
  return null;
}

export function formatDispatchKey(dispatchKey: string | null | undefined): string {
  return dispatchKey?.trim() ? dispatchKey : "no dispatch key";
}

export function formatNodeOptionLabel(
  kindLabel: string,
  label: string,
  dispatchKey: string | null | undefined,
): string {
  return `${kindLabel} · ${label || "Untitled"} · ${formatDispatchKey(dispatchKey)}`;
}

export function formatRuntimeSourceCandidateLabel(candidate: RuntimeEventSourceCandidate): string {
  return formatNodeOptionLabel(candidate.componentLabel, candidate.label, candidate.dispatchKey);
}

export function runtimeNodeTypeLabel(nodeType: RuntimeNodeType): string {
  switch (nodeType) {
    case "form":
      return "Form";
    case "step":
      return "Step";
    case "section":
      return "Section";
    case "group":
      return "Group";
    case "component":
      return "Component / button";
    case "field":
      return "Field";
    default:
      return formatLabel(nodeType);
  }
}

export function runtimeEntityTypeLabel(nodeType: RuntimeNodeType): string {
  switch (nodeType) {
    case "form":
      return "Form";
    case "step":
      return "Step";
    case "section":
      return "Section";
    case "group":
      return "Group / container";
    case "field":
      return "Field / input";
    case "component":
      return "Component / button";
    default:
      return formatLabel(nodeType);
  }
}

export function formatRuntimeDiagnosticValue(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return value || '""';
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getRuntimeActionPayload(action: RuntimeActionDefinition): Record<string, unknown> {
  return isRecord(action.config.payload) ? action.config.payload : {};
}

export function getRuntimeActionEventType(action: RuntimeActionDefinition): string {
  return String(action.config.eventType ?? action.config.eventName ?? "custom.event");
}

export function getRuntimeListenerEventType(listener: RuntimeListenerDefinition): string {
  return listener.type ?? listener.eventName;
}

export const runtimePayloadFieldTypeOptions: Array<{ value: RuntimePayloadFieldType; label: string }> = [
  { value: "string", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "True/false" },
  { value: "json", label: "JSON" },
  { value: "null", label: "Null" },
  { value: "runtime", label: "Runtime ref" },
];

export const runtimePayloadReferenceOptions: RuntimePayloadReferenceOption[] = [
  {
    key: "current.field.id",
    label: "Current field id",
    description: "Resolve the current source field id when this action runs.",
  },
  {
    key: "current.field.key",
    label: "Current field key",
    description: "Resolve the current source field stable key when this action runs.",
  },
  {
    key: "current.step.id",
    label: "Current step id",
    description: "Resolve the active step id from the runtime session.",
  },
  {
    key: "current.step.title",
    label: "Current step title",
    description: "Resolve the active step title from the runtime document.",
  },
  {
    key: "current.form.id",
    label: "Current form id",
    description: "Resolve the mounted form id at runtime.",
  },
  {
    key: "current.form.title",
    label: "Current form title",
    description: "Resolve the mounted form title at runtime.",
  },
  {
    key: "current.project.id",
    label: "Current project id",
    description: "Resolve the mounted project id from the runtime session.",
  },
  {
    key: "current.source.node.id",
    label: "Current source node id",
    description: "Resolve the runtime source node id that triggered this action.",
  },
  {
    key: "current.source.node.key",
    label: "Current source key",
    description: "Resolve the readable dispatch key for the node that triggered this action.",
  },
  {
    key: "current.source.node.type",
    label: "Current source node type",
    description: "Resolve the runtime source node type that triggered this action.",
  },
  {
    key: "current.event.type",
    label: "Event type",
    description: "Resolve the AS3-style event type currently being handled.",
  },
  {
    key: "current.event.target.id",
    label: "Event target id",
    description: "Resolve the original dispatcher id that dispatched the event.",
  },
  {
    key: "current.event.target.key",
    label: "Event target key",
    description: "Resolve the readable dispatch key for the original event target.",
  },
  {
    key: "current.event.target.type",
    label: "Event target type",
    description: "Resolve the original dispatcher type that dispatched the event.",
  },
  {
    key: "current.event.currentTarget.id",
    label: "Current target id",
    description: "Resolve the dispatcher id whose listener is currently running.",
  },
  {
    key: "current.event.currentTarget.key",
    label: "Current target key",
    description: "Resolve the readable dispatch key for the dispatcher whose listener is currently running.",
  },
  {
    key: "current.event.currentTarget.type",
    label: "Current target type",
    description: "Resolve the dispatcher type whose listener is currently running.",
  },
  {
    key: "current.event.phase",
    label: "Event phase",
    description: "Resolve capture, target, or bubble for the current listener invocation.",
  },
  {
    key: "current.runtime.value",
    label: "Current runtime value",
    description: "Resolve the current source field value from the runtime session.",
  },
  {
    key: "current.event.payload.value",
    label: "Event payload value",
    description: "Resolve the value property from the event payload.",
  },
  {
    key: "current.event.payload.nextValue",
    label: "Event payload next value",
    description: "Resolve the nextValue property from the event payload.",
  },
  {
    key: "current.event.payload.selectedValue",
    label: "Event payload selected value",
    description: "Resolve the selectedValue property from the event payload.",
  },
  {
    key: "current.event.payload.selectedValues",
    label: "Event payload selected values",
    description: "Resolve the selectedValues array from the event payload.",
  },
  {
    key: "current.event.payload.changedOption",
    label: "Event payload changed option",
    description: "Resolve the changedOption property from the event payload.",
  },
  {
    key: "current.event.payload.optionValue",
    label: "Event payload option value",
    description: "Resolve the optionValue property from the event payload.",
  },
  {
    key: "current.event.payload.checked",
    label: "Event payload checked",
    description: "Resolve the checked property from the event payload.",
  },
];

export function isRuntimePayloadReferenceKey(value: string): value is RuntimePayloadReferenceKey {
  return (
    runtimePayloadReferenceOptions.some((option) => option.key === value) ||
    /^current\.event\.payload\.[A-Za-z0-9_.-]+$/.test(value)
  );
}

export function isRuntimePayloadReference(value: unknown): value is { $runtime: RuntimePayloadReferenceKey } {
  return isRecord(value) && typeof value.$runtime === "string" && isRuntimePayloadReferenceKey(value.$runtime);
}

const runtimeIdentifierPattern = /^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/;

export function inferRuntimePayloadFieldType(value: unknown): RuntimePayloadFieldType {
  if (isRuntimePayloadReference(value)) {
    return "runtime";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "number") {
    return "number";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "string") {
    return "string";
  }
  return "json";
}

export function stringifyRuntimePayloadValue(value: unknown, type?: RuntimePayloadFieldType): string {
  if (type === "runtime" && isRuntimePayloadReference(value)) {
    return value.$runtime;
  }
  if (type === "null" || value === null || value === undefined) {
    return "";
  }
  if (type === "boolean" && typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

export function runtimePayloadValueFromEntry(entry: RuntimePayloadEntry): unknown {
  switch (entry.type) {
    case "string":
      return entry.value;
    case "number":
      return Number(entry.value || "0");
    case "boolean":
      return entry.value === "false" ? false : true;
    case "json":
      try {
        return JSON.parse(entry.value);
      } catch {
        return {};
      }
    case "null":
      return null;
    case "runtime":
      return { $runtime: entry.value };
    default:
      return entry.value;
  }
}

export function runtimePayloadEntryValueForType(type: RuntimePayloadFieldType, currentValue: string): string {
  switch (type) {
    case "string":
      return currentValue;
    case "number":
      return Number.isFinite(Number(currentValue)) && currentValue.trim().length ? currentValue : "0";
    case "boolean":
      return currentValue === "false" ? "false" : "true";
    case "json":
      return currentValue.trim().length ? currentValue : "{}";
    case "null":
      return "";
    case "runtime":
      return isRuntimePayloadReferenceKey(currentValue)
        ? currentValue
        : (runtimePayloadReferenceOptions[0]?.key ?? "current.field.id");
    default:
      return currentValue;
  }
}

export function runtimePayloadEntries(payload: Record<string, unknown>): RuntimePayloadEntry[] {
  return Object.entries(payload).map(([key, value]) => ({
    key,
    type: inferRuntimePayloadFieldType(value),
    value: stringifyRuntimePayloadValue(value, inferRuntimePayloadFieldType(value)),
  }));
}

export function runtimePayloadFromEntries(entries: RuntimePayloadEntry[]): Record<string, unknown> {
  return entries.reduce<Record<string, unknown>>((accumulator, entry) => {
    const key = entry.key.trim();
    if (!key) {
      return accumulator;
    }
    accumulator[key] = runtimePayloadValueFromEntry(entry);
    return accumulator;
  }, {});
}

export function runtimePayloadIssues(entries: RuntimePayloadEntry[]): string[] {
  const issues: string[] = [];
  const blankKeys = entries.filter((entry) => !entry.key.trim()).length;
  const duplicateKeys = Array.from(
    entries.reduce<Map<string, number>>((accumulator, entry) => {
      const key = entry.key.trim();
      if (!key) {
        return accumulator;
      }
      accumulator.set(key, (accumulator.get(key) ?? 0) + 1);
      return accumulator;
    }, new Map<string, number>()),
  )
    .filter(([, count]) => count > 1)
    .map(([key]) => key);
  const invalidJsonKeys = entries
    .filter((entry) => entry.type === "json")
    .flatMap((entry) => {
      try {
        JSON.parse(entry.value);
        return [];
      } catch {
        return [entry.key.trim() || "Unnamed JSON field"];
      }
    });
  const invalidRuntimeKeys = entries
    .filter((entry) => entry.type === "runtime")
    .flatMap((entry) =>
      isRuntimePayloadReferenceKey(entry.value) ? [] : [entry.key.trim() || "Unnamed runtime field"],
    );

  if (blankKeys) {
    issues.push(
      blankKeys === 1 ? "Every payload field needs a name." : `${blankKeys} payload fields still need names.`,
    );
  }
  if (duplicateKeys.length) {
    issues.push(`Duplicate payload field names: ${duplicateKeys.join(", ")}.`);
  }
  if (invalidJsonKeys.length) {
    issues.push(`Fix the JSON value for: ${invalidJsonKeys.join(", ")}.`);
  }
  if (invalidRuntimeKeys.length) {
    issues.push(`Choose a runtime reference for: ${invalidRuntimeKeys.join(", ")}.`);
  }
  return issues;
}

export function createRuntimePayloadEntry(
  key: string,
  value: unknown,
  type: RuntimePayloadFieldType = inferRuntimePayloadFieldType(value),
): RuntimePayloadEntry {
  return {
    key,
    type,
    value: stringifyRuntimePayloadValue(value, type),
  };
}

export function createRuntimePayloadReferenceEntry(
  key: string,
  referenceKey: RuntimePayloadReferenceKey,
): RuntimePayloadEntry {
  return createRuntimePayloadEntry(key, { $runtime: referenceKey }, "runtime");
}

export function sanitizeRuntimeIdentifier(value: string | undefined | null, fallback: string): string {
  const normalized = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.{2,}/g, ".");
  return normalized || fallback;
}

export function validateRuntimeIdentifier(
  value: string | undefined | null,
  label: string,
  example: string,
): string | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return `${label} is required. Try ${example}.`;
  }
  if (!runtimeIdentifierPattern.test(trimmed)) {
    return `${label} should use letters or numbers separated by dots, dashes, or underscores. Try ${example}.`;
  }
  return null;
}

export function estimateJsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value ?? null)).length;
}

export function ensureUniqueEventSource(
  eventSources: RuntimeEventDefinition[],
  name: string,
  scope: RuntimeEditorScope,
  nodeId?: string,
): void {
  if (
    eventSources.some(
      (source) =>
        (source.type ?? source.name) === name &&
        (source.dispatcherId ?? source.sourceNodeId ?? null) === (nodeId ?? null),
    )
  ) {
    return;
  }
  eventSources.push(createRuntimeEventSource(name, scope, nodeId));
}

export function runtimeEventDefinitionType(eventDefinition: RuntimeEventDefinition | null | undefined): string {
  return eventDefinition?.type ?? eventDefinition?.name ?? "";
}

export function runtimeEventBubblesForSource(source: RuntimeEventSourceCandidate, eventType: string): boolean {
  const eventDefinition = source.eventDefinitions.find(
    (candidate) => runtimeEventDefinitionType(candidate) === eventType,
  );
  if (typeof eventDefinition?.bubbles === "boolean") {
    return eventDefinition.bubbles;
  }
  const eventOption = source.events.find((candidate) => candidate.type === eventType);
  return eventOption?.bubbles ?? runtimeCoreEventType(eventType)?.bubbles ?? true;
}

export const runtimeAutomaticEventPayloadFieldNames = new Set(
  [
    ...runtimeStandardEventPayloadFields.map((field) => field.name),
    "componentId",
    "componentKey",
    "componentType",
    "fieldId",
    "fieldKey",
    "fieldLabel",
    "formId",
    "formTitle",
    "label",
    "nodeId",
    "nodeKey",
    "nodeType",
    "projectId",
    "sourceLabel",
    "stepTitle",
  ].filter((fieldName) => fieldName !== "metadata"),
);

export function isAutomaticRuntimePayloadField(fieldName: string): boolean {
  return runtimeAutomaticEventPayloadFieldNames.has(fieldName);
}

export function mergeRuntimePayloadFieldsWithStandardFields(fields: RuntimePayloadField[]): RuntimePayloadField[] {
  const seen = new Set<string>();
  const fieldByName = new Map(fields.map((field) => [field.name, field]));
  const standardFields = runtimeStandardEventPayloadFields.map((field) => {
    const override = field.name === "metadata" ? fieldByName.get(field.name) : null;
    return override ? { ...field, ...override, name: field.name, valueType: field.valueType } : field;
  });
  return [...standardFields, ...fields]
    .map((field) => ({ ...field }))
    .filter((field) => {
      if (seen.has(field.name)) {
        return false;
      }
      seen.add(field.name);
      return true;
    });
}

export function createRuntimePayloadShapeFromFields(
  fields: RuntimePayloadField[],
  example: Record<string, unknown> = {},
): RuntimePayloadShape {
  return {
    mode: "key_value",
    fields: mergeRuntimePayloadFieldsWithStandardFields(fields),
    example,
    notes: [],
  };
}

export function fallbackRuntimePayloadFieldsForEvent(eventType: string): RuntimePayloadField[] {
  if (eventType.includes("key")) {
    return [
      { name: "key", label: "Key", valueType: "string", required: false, description: "Keyboard key value." },
      { name: "code", label: "Code", valueType: "string", required: false, description: "Physical key code." },
    ];
  }
  if (eventType.includes("pointer") || eventType.includes("click")) {
    return [
      {
        name: "componentId",
        label: "Component id",
        valueType: "string",
        required: true,
        description: "Runtime component id.",
      },
      { name: "label", label: "Label", valueType: "string", required: false, description: "Component label." },
    ];
  }
  if (eventType.includes("change") || eventType.includes("input")) {
    return [
      { name: "value", label: "Value", valueType: "unknown", required: false, description: "Current value." },
      { name: "nextValue", label: "Next value", valueType: "unknown", required: false, description: "New value." },
    ];
  }
  return [
    {
      name: "sourceNodeId",
      label: "Source node id",
      valueType: "string",
      required: false,
      description: "Dispatcher node id.",
    },
  ];
}

export function runtimePayloadFieldsForEventType(eventType: string): RuntimePayloadField[] {
  const coreShape = runtimeCoreEventType(eventType)?.payloadShape;
  return mergeRuntimePayloadFieldsWithStandardFields(
    coreShape?.fields.length ? coreShape.fields : fallbackRuntimePayloadFieldsForEvent(eventType),
  );
}

export function upsertRuntimeEventSource(
  eventSources: RuntimeEventDefinition[],
  nextEvent: RuntimeEventDefinition,
): "created" | "updated" {
  const existing = findRuntimeEventSourceForUpsert(eventSources, nextEvent);
  if (!existing) {
    eventSources.push(nextEvent);
    return "created";
  }
  existing.type = nextEvent.type;
  existing.name = nextEvent.name;
  existing.dispatcherId = nextEvent.dispatcherId;
  existing.dispatcherType = nextEvent.dispatcherType;
  existing.sourceNodeId = nextEvent.sourceNodeId;
  existing.sourceNodeType = nextEvent.sourceNodeType;
  existing.bubbles = nextEvent.bubbles;
  existing.payloadShape = cloneRuntimePayloadShape(nextEvent.payloadShape);
  existing.description = nextEvent.description;
  return "updated";
}

export function findRuntimeEventSourceForUpsert(
  eventSources: RuntimeEventDefinition[],
  nextEvent: RuntimeEventDefinition,
): RuntimeEventDefinition | undefined {
  const eventType = runtimeEventDefinitionType(nextEvent);
  const dispatcherId = nextEvent.dispatcherId ?? nextEvent.sourceNodeId ?? null;
  return eventSources.find(
    (source) =>
      source.id === nextEvent.id ||
      (runtimeEventDefinitionType(source) === eventType &&
        (source.dispatcherId ?? source.sourceNodeId ?? null) === dispatcherId),
  );
}

export function describeRuntimeAction(action: RuntimeActionDefinition): string {
  switch (action.kind) {
    case "go_to_next_step":
      return "Go to the next step.";
    case "go_to_previous_step":
      return "Go to the previous step.";
    case "go_to_step":
      return `Go to step ${String(action.config.stepId ?? action.target?.nodeId ?? "target")}.`;
    case "submit_form":
      return "Validate and dispatch the form submit event.";
    case "set_field_value":
      return `Set ${String(action.config.fieldId ?? action.target?.nodeId ?? "field")} to ${JSON.stringify(action.config.value ?? "")}.`;
    case "clear_field_value":
      return `Clear ${String(action.config.fieldId ?? action.target?.nodeId ?? "field")}.`;
    case "show_node":
      return `Show ${String(action.config.nodeId ?? action.target?.nodeId ?? "node")}.`;
    case "hide_node":
      return `Hide ${String(action.config.nodeId ?? action.target?.nodeId ?? "node")}.`;
    case "enable_node":
      return `Enable ${String(action.config.nodeId ?? action.target?.nodeId ?? "node")}.`;
    case "disable_node":
      return `Disable ${String(action.config.nodeId ?? action.target?.nodeId ?? "node")}.`;
    case "mark_required":
      return `Make ${String(action.config.nodeId ?? action.target?.nodeId ?? "node")} required.`;
    case "mark_optional":
      return `Make ${String(action.config.nodeId ?? action.target?.nodeId ?? "node")} optional.`;
    case "dispatch_event":
    case "emit_event":
      return `Dispatch ${getRuntimeActionEventType(action)}.`;
    case "host_action":
      return `Request host action ${String(action.config.handlerKey ?? "handler")}.`;
    default:
      return formatLabel(action.kind);
  }
}

export function runtimeNodeActionTargetId(action: RuntimeActionDefinition): string | null {
  if (
    action.kind === "show_node" ||
    action.kind === "hide_node" ||
    action.kind === "enable_node" ||
    action.kind === "disable_node" ||
    action.kind === "mark_required" ||
    action.kind === "mark_optional"
  ) {
    return (
      (typeof action.target?.nodeId === "string" && action.target.nodeId) ||
      (typeof action.config.nodeId === "string" && action.config.nodeId) ||
      null
    );
  }
  return null;
}

export function runtimeFieldActionTargetId(action: RuntimeActionDefinition): string | null {
  if (action.kind === "set_field_value" || action.kind === "clear_field_value") {
    return (
      (typeof action.config.fieldId === "string" && action.config.fieldId) ||
      (typeof action.target?.nodeId === "string" && action.target.nodeId) ||
      null
    );
  }
  return null;
}

export function runtimeNavigationActionTargetId(action: RuntimeActionDefinition): string | null {
  if (
    action.kind === "go_to_next_step" ||
    action.kind === "go_to_previous_step" ||
    action.kind === "go_to_step" ||
    action.kind === "submit_form"
  ) {
    return (typeof action.target?.nodeId === "string" && action.target.nodeId) || null;
  }
  return null;
}

export function getButtonBehaviorSummary(field: AuthoringField): { action: string; eventName: string | null } {
  const explicitListener = field.runtime?.listeners.find(
    (listener) => getRuntimeListenerEventType(listener) === "component.click",
  );
  const firstAction = explicitListener?.actions[0];
  if (firstAction) {
    if (firstAction.kind === "go_to_previous_step") {
      return { action: "previous_step", eventName: null };
    }
    if (firstAction.kind === "submit_form") {
      return { action: "submit", eventName: null };
    }
    if (firstAction.kind === "dispatch_event" || firstAction.kind === "emit_event") {
      return { action: "custom_event", eventName: getRuntimeActionEventType(firstAction) };
    }
    return { action: "next_step", eventName: null };
  }
  return {
    action: field.rendererHints.action ?? "next_step",
    eventName: field.rendererHints.eventName ?? null,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatRuntimeEvidenceValue(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "undefined";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

export function getRuntimeTraceEntryKey(entry: RuntimeTraceEntry): string {
  return `${entry.event.correlationId}:${entry.event.timestamp}:${entry.event.type}`;
}

export function isAuthoredRuntimeEvidenceEntry(entry: RuntimeTraceEntry): boolean {
  if (entry.direction === "inbound") {
    return false;
  }
  if (entry.event.type === "host.action_requested") {
    return true;
  }
  return !builtInRuntimeEventNames.has(entry.event.type);
}

export function buildStructuredRuntimeTraceEvidence(
  entry: RuntimeTraceEntry,
  resolveNodeLabel: (nodeId: unknown, fallbackType?: string | null) => string,
): StructuredRuntimeTraceEvidence {
  const sourceLabel = resolveNodeLabel(
    entry.event.target?.nodeId ?? entry.event.source.nodeId,
    entry.event.target?.nodeType ?? entry.event.source.nodeType,
  );
  if (entry.event.type === "host.action_requested") {
    const payload = entry.event.payload;
    const configPayload = isRecord(payload.config) && isRecord(payload.config.payload) ? payload.config.payload : {};
    const target = isRecord(payload.target) ? payload.target : null;
    const targetLabel =
      target && ("nodeId" in target || "nodeType" in target)
        ? resolveNodeLabel(target.nodeId, typeof target.nodeType === "string" ? target.nodeType : null)
        : null;
    const handlerKey =
      typeof payload.handlerKey === "string"
        ? payload.handlerKey
        : isRecord(payload.config) && typeof payload.config.handlerKey === "string"
          ? payload.config.handlerKey
          : "host action";
    return {
      entryKey: getRuntimeTraceEntryKey(entry),
      heading: "Latest host action",
      title: handlerKey,
      summary: `Requested from ${sourceLabel}${targetLabel ? ` toward ${targetLabel}` : ""}.`,
      pills: [
        { label: "Source", value: sourceLabel },
        { label: "Correlation", value: entry.event.correlationId },
        { label: "Direction", value: entry.direction },
      ],
      payloadEntries: Object.entries(configPayload).map(([key, value]) => ({
        key,
        value: formatRuntimeEvidenceValue(value),
      })),
      footer: entry.event.timestamp,
    };
  }
  return {
    entryKey: getRuntimeTraceEntryKey(entry),
    heading: "Latest dispatched event",
    title: entry.event.type,
    summary: `Dispatchted from ${sourceLabel}.`,
    pills: [
      { label: "Source", value: sourceLabel },
      { label: "Correlation", value: entry.event.correlationId },
      { label: "Direction", value: entry.direction },
    ],
    payloadEntries: Object.entries(entry.event.payload).map(([key, value]) => ({
      key,
      value: formatRuntimeEvidenceValue(value),
    })),
    footer: entry.event.timestamp,
  };
}

export function buildRuntimeTraceContextSummary(
  entry: RuntimeTraceEntry,
  resolveNodeLabel: (nodeId: unknown, fallbackType?: string | null) => string,
): RuntimeTraceContextSummary {
  const sourceLabel = resolveNodeLabel(
    entry.event.target?.nodeId ?? entry.event.source.nodeId,
    entry.event.target?.nodeType ?? entry.event.source.nodeType,
  );
  const detail =
    entry.event.type === "host.action_requested"
      ? `Host request from ${sourceLabel}`
      : isAuthoredRuntimeEvidenceEntry(entry)
        ? `Dispatchted from ${sourceLabel}`
        : `${formatLabel(entry.event.type)} from ${sourceLabel}`;
  return {
    entryKey: getRuntimeTraceEntryKey(entry),
    title: entry.event.type,
    detail,
    direction: entry.direction,
    timestamp: entry.event.timestamp,
    inspectable: isAuthoredRuntimeEvidenceEntry(entry),
  };
}

export function isRuntimeTraceChainRelevantEntry(entry: RuntimeTraceEntry): boolean {
  if (isAuthoredRuntimeEvidenceEntry(entry)) {
    return true;
  }
  return (
    entry.event.type === "field.change" ||
    entry.event.type === "component.click" ||
    entry.event.type === "form.submit" ||
    entry.event.type === "form.validation_failed"
  );
}
