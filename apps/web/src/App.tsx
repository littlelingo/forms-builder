import type { CSSProperties, ChangeEvent, DragEvent, MouseEvent, ReactNode } from "react";
import { Fragment, startTransition, useEffect, useMemo, useRef, useState } from "react";

import { createRuntimeEngine } from "@form-builder/runtime";
import type { RuntimeTraceEntry } from "@form-builder/runtime";
import type {
  AuthoringDocument,
  AuthoringField,
  AuthoringGroup,
  AuthoringProjectDetail,
  AuthoringProjectRecord,
  AuthoringSection,
  AuthoringStep,
  ConditionalRule,
  Coordinates,
  FieldNode,
  GroupNode,
  PageNode,
  ProjectStatus,
  ProjectRevision,
  ReviewStatus,
  RuntimeActionDefinition,
  RuntimeActionKind,
  RuntimeDocumentBehavior,
  RuntimeEventEnvelope,
  RuntimeEventDefinition,
  RuntimeListenerDefinition,
  RuntimeNodeBehavior,
  RuntimeNodeState,
  RuntimePayloadMode,
  RuntimeSessionState,
  SemanticType,
  SectionNode,
} from "@form-builder/schema";
import { PanelCard, StatusBadge } from "@form-builder/ui";

import {
  clearConversions,
  deleteConversion,
  getConversionPagePreviewUrl,
  getConversionSourceUrl,
  getProject,
  importProjectDocument,
  listConversions,
  listProjectRevisions,
  listProjects,
  patchConversionReviewStatus,
  patchProject,
  promoteConversion,
  saveProjectDocument,
  uploadConversion,
} from "./lib/api";
import {
  applyDragMove,
  type AuthoringSelection,
  cloneDocument,
  convertFieldToActionButton,
  createField,
  createGroup,
  createSection,
  createStep,
  type DragPayload,
  type DropTarget,
  getSelectionContext,
  refreshChoiceOptions,
} from "./lib/authoring-utils";
import type { ConversionRecord, ProcessingStepStatus } from "./lib/types";

type AppStage = "home" | "review" | "workspace";
type ReviewPreviewMode = "overlay" | "pdf";
type ReviewFlowMode = "new_project" | "resume_import";
type WorkspaceLandingMode = "promoted_import" | "reopened_import";
type InspectorTab = "properties" | "behavior" | "map";
type BuilderFieldTypeOption = SemanticType | "action_button";

interface RuntimeEditorScope {
  scopeKind: "form" | "step" | "section" | "group" | "field" | "component";
  label: string;
  description: string;
  eventSources: RuntimeEventDefinition[];
  listeners: RuntimeListenerDefinition[];
}

interface RuntimePreset {
  id: string;
  label: string;
  description: string;
  apply: (scope: RuntimeEditorScope, currentField: AuthoringField | null) => RuntimeListenerDefinition;
}

interface PageSummary {
  page: PageNode;
  fields: FieldNode[];
  evidenceSnippet: string | null;
  flaggedFields: number;
  dominantTypes: SemanticType[];
}

interface StepSummary {
  fieldCount: number;
  statementCount: number;
  interactiveCount: number;
  longLabelCount: number;
}

interface RuntimePayloadEditorState {
  mode: RuntimePayloadMode;
  raw: string;
}

type RuntimePayloadFieldType = "string" | "number" | "boolean" | "json" | "null" | "runtime";

type RuntimePayloadReferenceKey =
  | "current.field.id"
  | "current.field.key"
  | "current.step.id"
  | "current.step.title"
  | "current.form.id"
  | "current.form.title"
  | "current.project.id"
  | "current.source.node.id"
  | "current.source.node.type"
  | "current.runtime.value";

interface RuntimePayloadEntry {
  key: string;
  value: string;
  type: RuntimePayloadFieldType;
}

interface RuntimePayloadTemplate {
  id: string;
  label: string;
  description: string;
  entries: RuntimePayloadEntry[];
}

interface RuntimePayloadReferenceOption {
  key: RuntimePayloadReferenceKey;
  label: string;
  description: string;
}

interface StructuredRuntimeTraceEvidence {
  entryKey: string;
  heading: string;
  title: string;
  summary: string;
  pills: Array<{ label: string; value: string }>;
  payloadEntries: Array<{ key: string; value: string }>;
  footer: string;
}

interface RuntimeTraceContextSummary {
  entryKey: string;
  title: string;
  detail: string;
  direction: string;
  timestamp: string;
  inspectable: boolean;
}

interface RuntimeTraceChainStep {
  entryKey: string;
  role: "trigger" | "selected" | "after" | "before";
  title: string;
  detail: string;
  direction: string;
  timestamp: string;
  inspectable: boolean;
}

interface RuntimeTraceChainSummary {
  correlationId: string;
  entryKey: string;
  title: string;
  summary: string;
  stepLabels: string[];
  authoredCount: number;
  latestTimestamp: string;
  active: boolean;
}

type BehaviorGraphFilter = "all" | "state" | "interaction";
type BehaviorGraphMode = "focus" | "overview";
type BehaviorGraphDensity = "comfortable" | "dense";
type BehaviorStudioView = "studio" | "advanced";
type BehaviorStudioMode = "create" | "manage" | "test" | "graph";
type BehaviorStudioManagerMode = "all" | "rules" | "flows" | "index";
type BehaviorStudioCreationKind = "rule" | "listener" | "event";
type BehaviorStudioAnchor = {
  top: number;
  bottom: number;
  centerX: number;
  width: number;
};
type BehaviorStudioPlacement = "above" | "below" | "center";
type BehaviorStudioPositionLayout = {
  dialogStyle?: CSSProperties;
  arrowStyle?: CSSProperties;
  placement: BehaviorStudioPlacement;
  anchored: boolean;
};
type BehaviorIndexObjectView = "all" | "impacts" | "started";
type BehaviorIndexStatusFilter = "all" | "enabled" | "disabled";
type DocumentBehaviorSurfaceMode = "board" | "minimap" | "canvas";
type DocumentBehaviorClusterFocus = "all" | "field" | "group" | "section" | "step";
type DocumentBehaviorClusterFamily = Exclude<DocumentBehaviorClusterFocus, "all">;
type DocumentBehaviorCanvasDensity = "comfortable" | "dense";
type DocumentBehaviorExpandedTarget = "form" | string | null;
type BehaviorWorkspaceMode = "authoring" | "document_graph";

interface LogicMapConditionalEntry {
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

interface LogicMapListenerEntry {
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
}

type BehaviorGraphSelection =
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

interface LogicMapStepEntry {
  id: string;
  title: string;
  selection: AuthoringSelection;
  sectionCount: number;
  fieldCount: number;
  conditionalRules: LogicMapConditionalEntry[];
  runtimeListeners: LogicMapListenerEntry[];
}

interface BehaviorScopeCluster {
  key: string;
  title: string;
  kindLabel: string;
  detail: string;
  rules: LogicMapConditionalEntry[];
  listeners: LogicMapListenerEntry[];
  selection: AuthoringSelection | null;
}

interface ConditionalRuleGroupMember {
  rule: ConditionalRule;
  index: number;
}

interface ConditionalRuleGroup {
  key: string;
  sourceFieldLabel: string;
  conditionTitle: string;
  conditionDetail: string;
  effectsSummary: string;
  members: ConditionalRuleGroupMember[];
}

interface DocumentBehaviorClusterGroupSummary {
  key: Exclude<DocumentBehaviorClusterFocus, "all">;
  label: string;
  firstLaneId: string | null;
  scopeCount: number;
  laneCount: number;
  ruleCount: number;
  listenerCount: number;
}

interface RuntimeActionChainTemplate {
  id: string;
  label: string;
  description: string;
  createActions: () => RuntimeActionDefinition[];
}

type MapViewMode = "graph" | "summary";

interface BehaviorGraphEntryContext {
  source: "map" | "navigator" | "clusters";
  title: string;
  detail: string;
}

interface SourceReferenceMatchState {
  pageIds: Set<string>;
  sectionIds: Set<string>;
  groupIds: Set<string>;
  fieldIds: Set<string>;
  anchorIds: Set<string>;
}

interface SourceReferenceFocus extends SourceReferenceMatchState {
  title: string;
  kindLabel: string;
}

type SourceReferenceTargetKind = "page" | "section" | "group" | "field";

interface OpenedRevisionView {
  id: string;
  note: string;
  createdAt: string;
}

type WorkspaceTransitionRequest =
  | { kind: "open_project"; projectId: string; workspaceLandingMode?: WorkspaceLandingMode | null }
  | { kind: "go_home" }
  | { kind: "open_revision"; revisionId: string }
  | { kind: "return_latest_revision" }
  | { kind: "create_blank_project" }
  | { kind: "open_json"; file: File; fileName: string }
  | { kind: "upload_pdf"; file: File; fileName: string }
  | { kind: "resume_import"; conversionId: string };

type TransitionExecutionOptions = {
  skipDirtyCheck?: boolean;
};

const builderFieldTypeOptions: Array<{ value: BuilderFieldTypeOption; label: string }> = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Textarea" },
  { value: "select", label: "Select" },
  { value: "radio", label: "Radio" },
  { value: "checkbox", label: "Checkbox" },
  { value: "date", label: "Date" },
  { value: "number", label: "Number" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "statement", label: "Content" },
  { value: "action_button", label: "Button" },
];

const runtimeActionOptions: Array<{ value: RuntimeActionKind; label: string }> = [
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
  { value: "emit_event", label: "Emit custom event" },
  { value: "host_action", label: "Request host action" },
];

const builtInRuntimeEventNames = new Set<string>([
  "form.load",
  "form.submit",
  "form.submit_success",
  "form.submit_error",
  "form.validation_failed",
  "step.enter",
  "step.leave",
  "field.change",
  "field.focus",
  "field.blur",
  "component.click",
  "host.context_updated",
]);

function formatLabel(value: string | undefined | null): string {
  if (!value) {
    return "Unknown";
  }
  return value.replaceAll("_", " ");
}

function normalizeDocumentBehaviorClusterKind(kindLabel: string): DocumentBehaviorClusterFamily {
  const normalized = kindLabel.trim().toLowerCase();
  if (normalized === "field" || normalized === "group" || normalized === "section" || normalized === "step") {
    return normalized;
  }
  return "step";
}

function documentBehaviorClusterFocusLabel(focus: DocumentBehaviorClusterFocus): string {
  if (focus === "all") {
    return "All scopes";
  }
  return `${focus[0]?.toUpperCase() ?? ""}${focus.slice(1)} scopes`;
}

function createRuntimeNodeBehavior(): RuntimeNodeBehavior {
  return {
    eventSources: [],
    listeners: [],
  };
}

function createRuntimeDocumentBehavior(): RuntimeDocumentBehavior {
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

function createBlankAuthoringDocument(): AuthoringDocument {
  return {
    id: crypto.randomUUID(),
    title: "Untitled form",
    documentClass: "born_digital_nonfillable",
    reviewStatus: "draft",
    targetRuntime: "va_web_form",
    visualBaseline: "va.gov",
    sourcePriority: [],
    sourceConflicts: [],
    steps: [createStep(1)],
    metadata: {
      creationMode: "blank",
      createdIn: "builder",
    },
    runtime: createRuntimeDocumentBehavior(),
  };
}

function createRuntimeEventSource(name: string, scope: RuntimeEditorScope, nodeId?: string): RuntimeEventDefinition {
  return {
    id: crypto.randomUUID(),
    name,
    sourceNodeId: nodeId ?? null,
    sourceNodeType: scope.scopeKind,
    payloadShape: null,
    description: null,
  };
}

function createRuntimeAction(kind: RuntimeActionKind, config: Record<string, unknown> = {}): RuntimeActionDefinition {
  return {
    id: crypto.randomUUID(),
    kind,
    label: null,
    target: null,
    config,
    continueOnError: false,
  };
}

function createRuntimeListener(
  eventName: string,
  actions: RuntimeActionDefinition[],
  sourceNodeId?: string | null,
): RuntimeListenerDefinition {
  return {
    id: crypto.randomUUID(),
    label: null,
    eventName,
    sourceNodeId: sourceNodeId ?? null,
    enabled: true,
    ruleGuards: [],
    actions,
  };
}

function isConditionalRuleEnabled(rule: ConditionalRule): boolean {
  return rule.enabled !== false;
}

function setConditionalRuleEnabled(rule: ConditionalRule, enabled: boolean): void {
  rule.enabled = enabled;
}

function createListenerGraphSelection(listener: RuntimeListenerDefinition): BehaviorGraphSelection {
  return {
    kind: "listener",
    listenerId: listener.id,
    phase: listener.actions.length ? "action" : "trigger",
    actionId: listener.actions[0]?.id,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRuntimeActionPayload(action: RuntimeActionDefinition): Record<string, unknown> {
  return isRecord(action.config.payload) ? action.config.payload : {};
}

const runtimePayloadFieldTypeOptions: Array<{ value: RuntimePayloadFieldType; label: string }> = [
  { value: "string", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "True/false" },
  { value: "json", label: "JSON" },
  { value: "null", label: "Null" },
  { value: "runtime", label: "Runtime ref" },
];

const runtimePayloadReferenceOptions: RuntimePayloadReferenceOption[] = [
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
    key: "current.source.node.type",
    label: "Current source node type",
    description: "Resolve the runtime source node type that triggered this action.",
  },
  {
    key: "current.runtime.value",
    label: "Current runtime value",
    description: "Resolve the current source field value from the runtime session.",
  },
];

function isRuntimePayloadReference(value: unknown): value is { $runtime: RuntimePayloadReferenceKey } {
  return (
    isRecord(value) &&
    typeof value.$runtime === "string" &&
    runtimePayloadReferenceOptions.some((option) => option.key === value.$runtime)
  );
}

const runtimeIdentifierPattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

function inferRuntimePayloadFieldType(value: unknown): RuntimePayloadFieldType {
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

function stringifyRuntimePayloadValue(value: unknown, type?: RuntimePayloadFieldType): string {
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

function runtimePayloadValueFromEntry(entry: RuntimePayloadEntry): unknown {
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

function runtimePayloadEntryValueForType(type: RuntimePayloadFieldType, currentValue: string): string {
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
      return runtimePayloadReferenceOptions.some((option) => option.key === currentValue)
        ? currentValue
        : runtimePayloadReferenceOptions[0]?.key ?? "current.field.id";
    default:
      return currentValue;
  }
}

function runtimePayloadEntries(payload: Record<string, unknown>): RuntimePayloadEntry[] {
  return Object.entries(payload).map(([key, value]) => ({
    key,
    type: inferRuntimePayloadFieldType(value),
    value: stringifyRuntimePayloadValue(value, inferRuntimePayloadFieldType(value)),
  }));
}

function runtimePayloadFromEntries(entries: RuntimePayloadEntry[]): Record<string, unknown> {
  return entries.reduce<Record<string, unknown>>((accumulator, entry) => {
    const key = entry.key.trim();
    if (!key) {
      return accumulator;
    }
    accumulator[key] = runtimePayloadValueFromEntry(entry);
    return accumulator;
  }, {});
}

function runtimePayloadIssues(entries: RuntimePayloadEntry[]): string[] {
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
      runtimePayloadReferenceOptions.some((option) => option.key === entry.value)
        ? []
        : [entry.key.trim() || "Unnamed runtime field"],
    );

  if (blankKeys) {
    issues.push(blankKeys === 1 ? "Every payload field needs a name." : `${blankKeys} payload fields still need names.`);
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

function createRuntimePayloadEntry(
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

function createRuntimePayloadReferenceEntry(key: string, referenceKey: RuntimePayloadReferenceKey): RuntimePayloadEntry {
  return createRuntimePayloadEntry(key, { $runtime: referenceKey }, "runtime");
}

function sanitizeRuntimeIdentifier(value: string | undefined | null, fallback: string): string {
  const normalized = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.{2,}/g, ".");
  return normalized || fallback;
}

function validateRuntimeIdentifier(value: string | undefined | null, label: string, example: string): string | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return `${label} is required. Try ${example}.`;
  }
  if (!runtimeIdentifierPattern.test(trimmed)) {
    return `${label} should use lowercase words separated by dots, dashes, or underscores. Try ${example}.`;
  }
  return null;
}

function estimateJsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value ?? null)).length;
}

function ensureUniqueEventSource(
  eventSources: RuntimeEventDefinition[],
  name: string,
  scope: RuntimeEditorScope,
  nodeId?: string,
): void {
  if (eventSources.some((source) => source.name === name && (source.sourceNodeId ?? null) === (nodeId ?? null))) {
    return;
  }
  eventSources.push(createRuntimeEventSource(name, scope, nodeId));
}

function describeRuntimeAction(action: RuntimeActionDefinition): string {
  switch (action.kind) {
    case "go_to_next_step":
      return "Go to the next step.";
    case "go_to_previous_step":
      return "Go to the previous step.";
    case "go_to_step":
      return `Go to step ${String(action.config.stepId ?? action.target?.nodeId ?? "target")}.`;
    case "submit_form":
      return "Validate and emit the form submit event.";
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
    case "emit_event":
      return `Emit ${String(action.config.eventName ?? "custom.event")}.`;
    case "host_action":
      return `Request host action ${String(action.config.handlerKey ?? "handler")}.`;
    default:
      return formatLabel(action.kind);
  }
}

function getButtonBehaviorSummary(field: AuthoringField): { action: string; eventName: string | null } {
  const explicitListener = field.runtime?.listeners.find((listener) => listener.eventName === "component.click");
  const firstAction = explicitListener?.actions[0];
  if (firstAction) {
    if (firstAction.kind === "go_to_previous_step") {
      return { action: "previous_step", eventName: null };
    }
    if (firstAction.kind === "submit_form") {
      return { action: "submit", eventName: null };
    }
    if (firstAction.kind === "emit_event") {
      return { action: "custom_event", eventName: String(firstAction.config.eventName ?? "custom.event") };
    }
    return { action: "next_step", eventName: null };
  }
  return {
    action: field.rendererHints.action ?? "next_step",
    eventName: field.rendererHints.eventName ?? null,
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatRuntimeEvidenceValue(value: unknown): string {
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

function getRuntimeTraceEntryKey(entry: RuntimeTraceEntry): string {
  return `${entry.event.correlationId}:${entry.event.timestamp}:${entry.event.type}`;
}

function isAuthoredRuntimeEvidenceEntry(entry: RuntimeTraceEntry): boolean {
  if (entry.direction === "inbound") {
    return false;
  }
  if (entry.event.type === "host.action_requested") {
    return true;
  }
  return !builtInRuntimeEventNames.has(entry.event.type);
}

function buildStructuredRuntimeTraceEvidence(
  entry: RuntimeTraceEntry,
  resolveNodeLabel: (nodeId: unknown, fallbackType?: string | null) => string,
): StructuredRuntimeTraceEvidence {
  const sourceLabel = resolveNodeLabel(entry.event.source.nodeId, entry.event.source.nodeType);
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
    heading: "Latest emitted event",
    title: entry.event.type,
    summary: `Emitted from ${sourceLabel}.`,
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

function buildRuntimeTraceContextSummary(
  entry: RuntimeTraceEntry,
  resolveNodeLabel: (nodeId: unknown, fallbackType?: string | null) => string,
): RuntimeTraceContextSummary {
  const sourceLabel = resolveNodeLabel(entry.event.source.nodeId, entry.event.source.nodeType);
  const detail =
    entry.event.type === "host.action_requested"
      ? `Host request from ${sourceLabel}`
      : isAuthoredRuntimeEvidenceEntry(entry)
        ? `Emitted from ${sourceLabel}`
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

function isRuntimeTraceChainRelevantEntry(entry: RuntimeTraceEntry): boolean {
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

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 64) || "runtime-session";
}

function downloadJsonFile(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function badgeToneFromReview(status: ReviewStatus): "neutral" | "warning" | "success" {
  if (status === "accepted" || status === "reviewed") {
    return "success";
  }
  if (status === "needs_review") {
    return "warning";
  }
  return "neutral";
}

function badgeToneFromStatus(status: ConversionRecord["status"]): "neutral" | "warning" | "error" | "success" {
  if (status === "failed") {
    return "error";
  }
  if (status === "accepted") {
    return "success";
  }
  if (status === "in_review") {
    return "warning";
  }
  return "neutral";
}

function badgeToneFromStep(status: ProcessingStepStatus): "neutral" | "warning" | "error" | "success" {
  if (status === "completed") {
    return "success";
  }
  if (status === "warning") {
    return "warning";
  }
  if (status === "failed") {
    return "error";
  }
  return "neutral";
}

function badgeToneFromProjectStatus(status: ProjectStatus): "neutral" | "success" {
  return status === "published" ? "success" : "neutral";
}

function flattenSectionFields(page: PageNode): FieldNode[] {
  return page.sections.flatMap((section) => orderedReviewSectionFields(section));
}

function summarizePage(page: PageNode): PageSummary {
  const fields = flattenSectionFields(page);
  const typeCounts = new Map<SemanticType, number>();
  for (const field of fields) {
    typeCounts.set(field.semanticType, (typeCounts.get(field.semanticType) ?? 0) + 1);
  }

  return {
    page,
    fields,
    evidenceSnippet: page.evidence?.[0]?.snippet ?? fields[0]?.label ?? null,
    flaggedFields: fields.filter((field) => field.sourceConflicts.length > 0 || field.label.startsWith("F[")).length,
    dominantTypes: [...typeCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([type]) => type),
  };
}

function flattenAuthoringFields(step: AuthoringStep): AuthoringField[] {
  return step.sections.flatMap((section) => [
    ...section.fields,
    ...section.groups.flatMap((group) => group.fields),
  ]);
}

function summarizeAuthoringStep(step: AuthoringStep): StepSummary {
  const fields = flattenAuthoringFields(step);
  const statementCount = fields.filter((field) => field.semanticType === "statement").length;
  const longLabelCount = fields.filter((field) => field.label.trim().length > 120).length;
  return {
    fieldCount: fields.length,
    statementCount,
    interactiveCount: fields.length - statementCount,
    longLabelCount,
  };
}

function summarizeAuthoringDocument(document: AuthoringDocument): StepSummary & { stepCount: number; sectionCount: number } {
  return document.steps.reduce<StepSummary & { stepCount: number; sectionCount: number }>(
    (summary, step) => {
      const stepSummary = summarizeAuthoringStep(step);
      return {
        stepCount: summary.stepCount + 1,
        sectionCount: summary.sectionCount + step.sections.length,
        fieldCount: summary.fieldCount + stepSummary.fieldCount,
        statementCount: summary.statementCount + stepSummary.statementCount,
        interactiveCount: summary.interactiveCount + stepSummary.interactiveCount,
        longLabelCount: summary.longLabelCount + stepSummary.longLabelCount,
      };
    },
    {
      stepCount: 0,
      sectionCount: 0,
      fieldCount: 0,
      statementCount: 0,
      interactiveCount: 0,
      longLabelCount: 0,
    },
  );
}

function defaultRuntimeFieldValue(field: AuthoringField): unknown {
  if (field.rendererHints.component === "button" || field.semanticType === "statement") {
    return undefined;
  }
  switch (field.semanticType) {
    case "select":
    case "radio":
      return field.options[0]?.value ?? "option_1";
    case "checkbox":
      return field.options[0]?.value ? [field.options[0].value] : ["checked"];
    case "date":
      return "2026-05-01";
    case "number":
      return "1";
    case "phone":
      return "555-555-5555";
    case "email":
      return "person@example.com";
    case "textarea":
      return "Sample response";
    default:
      return "Sample value";
  }
}

function guidanceForStep(step: AuthoringStep | null): string {
  if (!step) {
    return "Start by selecting a step, then shape it into a cleaner VA-style flow.";
  }
  const summary = summarizeAuthoringStep(step);
  if (summary.statementCount > summary.interactiveCount) {
    return "This step is still source-heavy. Split long paper content into calmer intro/help content, then isolate the interactive fields you want users to complete.";
  }
  if (summary.longLabelCount > 0) {
    return "Some imported labels are still too long for a clean web form. Tighten the wording and move overflow into help text.";
  }
  return "This step is in a good place for detailed shaping. Reorder fields, refine labels, and add logic where the web flow should branch.";
}

function subtleButtonClass(active: boolean): string {
  return active
    ? "inline-flex h-8 items-center rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-medium text-blue-700"
    : "inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-950";
}

function actionButtonClass(kind: "primary" | "secondary" | "danger" = "secondary"): string {
  if (kind === "primary") {
    return "inline-flex h-9 items-center justify-center rounded-md border border-blue-600 bg-blue-600 px-3.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:pointer-events-none disabled:opacity-50";
  }
  if (kind === "danger") {
    return "inline-flex h-9 items-center justify-center rounded-md border border-rose-200 bg-white px-3.5 text-sm font-medium text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:pointer-events-none disabled:opacity-50";
  }
  return "inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 disabled:pointer-events-none disabled:opacity-50";
}

function iconButtonClass(kind: "secondary" | "danger" | "primary" = "secondary"): string {
  if (kind === "primary") {
    return "inline-flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 bg-white text-sm font-medium text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50";
  }
  if (kind === "danger") {
    return "inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 bg-white text-sm font-medium text-rose-700 shadow-sm transition hover:bg-rose-50";
  }
  return "inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950";
}

function PageIcon() {
  return (
    <span className="inline-flex h-9 w-7 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-500 shadow-sm">
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.3">
        <path d="M4.25 1.75h5l2.5 2.5v10H4.25z" />
        <path d="M9.25 1.75v2.5h2.5" />
        <path d="M5.75 7h4.5M5.75 9.25h4.5M5.75 11.5h3.25" />
      </svg>
    </span>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M8 3.25v9.5M3.25 8h9.5" />
    </svg>
  );
}

function FieldIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3.5 4h9M8 4v8" />
    </svg>
  );
}

function GroupIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2.75" y="3" width="4.25" height="4.25" rx="1" />
      <rect x="9" y="3" width="4.25" height="4.25" rx="1" />
      <rect x="2.75" y="8.75" width="4.25" height="4.25" rx="1" />
      <rect x="9" y="8.75" width="4.25" height="4.25" rx="1" />
    </svg>
  );
}

function RemoveIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M4.25 4.25l7.5 7.5M11.75 4.25l-7.5 7.5" />
    </svg>
  );
}

function PropertiesIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 4.5h10M3 8h10M3 11.5h6.5" />
    </svg>
  );
}

function LogicIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="4.25" cy="4.25" r="1.75" />
      <circle cx="11.75" cy="8" r="1.75" />
      <circle cx="4.25" cy="11.75" r="1.75" />
      <path d="M6 4.25h3.5M4.25 6v3.75M6 11.75h3.5" />
    </svg>
  );
}

function EventsIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 4.5h6M3 8h10M3 11.5h7" />
      <circle cx="11.75" cy="4.5" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="13" cy="11.5" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="3.5" cy="4" r="1.5" />
      <circle cx="12.5" cy="4" r="1.5" />
      <circle cx="8" cy="12" r="1.5" />
      <path d="M5 4h6M4.5 5.2l2.4 5.1M11.5 5.2l-2.4 5.1" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M5.25 3.25v9.5L12 8z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function fieldPreview(field: AuthoringField) {
  const isActionButton = field.rendererHints.component === "button";
  const requiredBadge = field.required ? <span className="app-pill border-red-200 bg-rose-50 text-rose-700">Required</span> : null;

  if (isActionButton) {
    const behavior = getButtonBehaviorSummary(field);
    const isPrimary = behavior.action === "next_step" || behavior.action === "submit";
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-950">{field.label}</div>
          <span className="app-pill">{formatLabel(behavior.action)}</span>
        </div>
        <div className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold ${isPrimary ? "bg-[#2563eb] text-white" : "border border-soft bg-white text-slate-700"}`}>
          {field.label}
        </div>
      </div>
    );
  }
  if (field.semanticType === "statement") {
    return (
      <div className="rounded-[1rem] border border-soft bg-[#eff4fb] px-4 py-3 text-sm leading-6 text-slate-700">
        {field.label}
      </div>
    );
  }
  if (field.semanticType === "radio" || field.semanticType === "checkbox") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-950">{field.label}</div>
          {requiredBadge}
        </div>
        <div className="grid gap-2">
          {field.options.map((option) => (
            <div key={option.value} className="flex items-center gap-3 rounded-2xl border border-soft bg-white px-4 py-3">
              <span className={`h-4 w-4 border border-slate-400 ${field.semanticType === "checkbox" ? "rounded-[0.35rem]" : "rounded-full"}`} />
              <span className="text-sm text-slate-700">{option.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (field.semanticType === "select") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-950">{field.label}</div>
          {requiredBadge}
        </div>
        <div className="rounded-2xl border border-soft bg-white px-4 py-3 text-sm text-slate-500">
          {field.options[0]?.label ?? "Choose an option"}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-950">{field.label}</div>
        {requiredBadge}
      </div>
      <div className={`rounded-2xl border px-4 py-3 text-sm ${field.required ? "border-rose-300 bg-rose-50/60 text-slate-700" : "border-soft bg-white text-slate-500"}`}>
        {field.helpText || "Response field"}
      </div>
    </div>
  );
}

function defaultPreviewRuntimeValue(field: AuthoringField): unknown {
  if (field.rendererHints.component === "button" || field.semanticType === "statement") {
    return undefined;
  }
  switch (field.semanticType) {
    case "select":
    case "radio":
      return "";
    case "checkbox":
      return [];
    default:
      return "";
  }
}

function runtimeFieldValue(field: AuthoringField, sessionState: RuntimeSessionState | null): unknown {
  if (!sessionState) {
    return defaultPreviewRuntimeValue(field);
  }
  const currentValue = sessionState.values[field.id];
  return currentValue !== undefined ? currentValue : defaultPreviewRuntimeValue(field);
}

function runtimeFieldError(field: AuthoringField, sessionState: RuntimeSessionState | null): string | null {
  if (!sessionState) {
    return null;
  }
  const validationMessage = sessionState.validation.errors.find((error) => error.fieldId === field.id || error.nodeId === field.id)?.message;
  if (validationMessage) {
    return validationMessage;
  }
  return sessionState.submit.fieldErrors?.[field.id] ?? null;
}

function summarizeFieldBehavior(field: AuthoringField): { ruleCount: number; flowCount: number } {
  return {
    ruleCount: field.conditionals.length,
    flowCount: field.runtime?.listeners.length ?? 0,
  };
}

function summarizeGroupBehavior(group: AuthoringGroup): { ruleCount: number; flowCount: number } {
  let ruleCount = 0;
  let flowCount = group.runtime?.listeners.length ?? 0;
  for (const field of group.fields) {
    const fieldSummary = summarizeFieldBehavior(field);
    ruleCount += fieldSummary.ruleCount;
    flowCount += fieldSummary.flowCount;
  }
  return { ruleCount, flowCount };
}

function summarizeSectionBehavior(section: AuthoringSection): { ruleCount: number; flowCount: number } {
  let ruleCount = 0;
  let flowCount = section.runtime?.listeners.length ?? 0;
  for (const field of section.fields) {
    const fieldSummary = summarizeFieldBehavior(field);
    ruleCount += fieldSummary.ruleCount;
    flowCount += fieldSummary.flowCount;
  }
  for (const group of section.groups) {
    const groupSummary = summarizeGroupBehavior(group);
    ruleCount += groupSummary.ruleCount;
    flowCount += groupSummary.flowCount;
  }
  return { ruleCount, flowCount };
}

function summarizeStepBehavior(step: AuthoringStep): { ruleCount: number; flowCount: number } {
  let ruleCount = 0;
  let flowCount = step.runtime?.listeners.length ?? 0;
  for (const section of step.sections) {
    const sectionSummary = summarizeSectionBehavior(section);
    ruleCount += sectionSummary.ruleCount;
    flowCount += sectionSummary.flowCount;
  }
  return { ruleCount, flowCount };
}

function runtimeTextInputType(field: AuthoringField): string {
  switch (field.semanticType) {
    case "email":
      return "email";
    case "phone":
      return "tel";
    case "date":
      return "date";
    case "number":
      return "number";
    default:
      return "text";
  }
}

function checkboxRuntimeValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry));
  }
  if (typeof value === "string" && value.length > 0) {
    return [value];
  }
  return [];
}

interface RuntimeFieldPreviewProps {
  field: AuthoringField;
  value: unknown;
  nodeState: RuntimeNodeState | null;
  errorMessage: string | null;
  onValueChange: (value: unknown) => void;
  onButtonClick: () => void;
}

function RuntimeFieldPreview({
  field,
  value,
  nodeState,
  errorMessage,
  onValueChange,
  onButtonClick,
}: RuntimeFieldPreviewProps) {
  const isActionButton = field.rendererHints.component === "button";
  const isEnabled = nodeState?.enabled ?? true;
  const isVisible = nodeState?.visible ?? true;
  const isRequired = nodeState?.required ?? field.required;
  const requiredBadge = isRequired ? <span className="app-pill border-red-200 bg-rose-50 text-rose-700">Required</span> : null;

  if (!isVisible) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-950">{field.label}</div>
          <span className="app-pill">Hidden</span>
        </div>
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-500">
          Hidden by the current runtime state.
        </div>
      </div>
    );
  }

  if (isActionButton) {
    const behavior = getButtonBehaviorSummary(field);
    const isPrimary = behavior.action === "next_step" || behavior.action === "submit";
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-950">{field.label}</div>
          <span className="app-pill">{formatLabel(behavior.action)}</span>
        </div>
        <button
          type="button"
          disabled={!isEnabled}
          onClick={(event) => {
            event.stopPropagation();
            onButtonClick();
          }}
          className={actionButtonClass(isPrimary ? "primary" : "secondary")}
        >
          {field.label}
        </button>
      </div>
    );
  }

  if (field.semanticType === "statement") {
    return (
      <div className="rounded-[1rem] border border-soft bg-[#eff4fb] px-4 py-3 text-sm leading-6 text-slate-700">
        {field.label}
      </div>
    );
  }

  if (field.semanticType === "radio" || field.semanticType === "checkbox") {
    const selectedValues = checkboxRuntimeValues(value);
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-950">{field.label}</div>
          <div className="flex items-center gap-2">
            {!isEnabled ? <span className="app-pill">Disabled</span> : null}
            {requiredBadge}
          </div>
        </div>
        <div className="grid gap-2">
          {field.options.length ? (
            field.options.map((option) => {
              const checked =
                field.semanticType === "radio"
                  ? String(value ?? "") === option.value
                  : selectedValues.includes(option.value);
              return (
                <label
                  key={option.value}
                  className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${
                    checked ? "border-blue-300 bg-blue-50" : "border-soft bg-white"
                  } ${!isEnabled ? "opacity-60" : ""}`}
                >
                  <input
                    type={field.semanticType}
                    name={`runtime-preview-${field.id}`}
                    checked={checked}
                    disabled={!isEnabled}
                    onChange={(event) => {
                      if (field.semanticType === "radio") {
                        onValueChange(event.target.value);
                        return;
                      }
                      const nextValues = event.target.checked
                        ? [...selectedValues, option.value]
                        : selectedValues.filter((entry) => entry !== option.value);
                      onValueChange(nextValues);
                    }}
                    value={option.value}
                    className="h-4 w-4"
                  />
                  <span className="text-slate-700">{option.label}</span>
                </label>
              );
            })
          ) : (
            <label className={`flex items-center gap-3 rounded-2xl border border-soft bg-white px-4 py-3 text-sm ${!isEnabled ? "opacity-60" : ""}`}>
              <input
                type="checkbox"
                checked={Boolean(value)}
                disabled={!isEnabled}
                onChange={(event) => onValueChange(event.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-slate-700">{field.label}</span>
            </label>
          )}
        </div>
        {errorMessage ? <p className="text-sm text-rose-700">{errorMessage}</p> : null}
      </div>
    );
  }

  if (field.semanticType === "select") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-950">{field.label}</div>
          <div className="flex items-center gap-2">
            {!isEnabled ? <span className="app-pill">Disabled</span> : null}
            {requiredBadge}
          </div>
        </div>
        <select
          value={typeof value === "string" ? value : ""}
          disabled={!isEnabled}
          onChange={(event) => onValueChange(event.target.value)}
          className="w-full rounded-2xl border border-soft bg-white px-4 py-3 text-sm text-slate-700"
        >
          <option value="">{field.options.length ? "Choose an option" : "No options yet"}</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {errorMessage ? <p className="text-sm text-rose-700">{errorMessage}</p> : null}
      </div>
    );
  }

  if (field.semanticType === "textarea") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-950">{field.label}</div>
          <div className="flex items-center gap-2">
            {!isEnabled ? <span className="app-pill">Disabled</span> : null}
            {requiredBadge}
          </div>
        </div>
        <textarea
          value={typeof value === "string" ? value : ""}
          disabled={!isEnabled}
          placeholder={field.helpText || "Response field"}
          onChange={(event) => onValueChange(event.target.value)}
          className="min-h-[7.5rem] w-full rounded-2xl border border-soft bg-white px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400"
        />
        {errorMessage ? <p className="text-sm text-rose-700">{errorMessage}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-950">{field.label}</div>
        <div className="flex items-center gap-2">
          {!isEnabled ? <span className="app-pill">Disabled</span> : null}
          {requiredBadge}
        </div>
      </div>
      <input
        type={runtimeTextInputType(field)}
        value={typeof value === "string" ? value : value === undefined || value === null ? "" : String(value)}
        disabled={!isEnabled}
        placeholder={field.helpText || "Response field"}
        onChange={(event) => onValueChange(event.target.value)}
        className="w-full rounded-2xl border border-soft bg-white px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400"
      />
      {errorMessage ? <p className="text-sm text-rose-700">{errorMessage}</p> : null}
    </div>
  );
}

function overlayTone(field: FieldNode, selected: boolean): string {
  if (selected) {
    return "fill-blue-400/30 stroke-[#2563eb]";
  }
  if (field.semanticType === "statement") {
    return "fill-slate-400/18 stroke-slate-500";
  }
  if (field.semanticType === "radio" || field.semanticType === "checkbox" || field.semanticType === "select") {
    return "fill-amber-300/18 stroke-amber-500";
  }
  return "fill-sky-400/18 stroke-sky-600";
}

function orderedReviewSectionFields(section: SectionNode): FieldNode[] {
  const orderedItems = [
    ...section.fields.map((field) => ({
      orderIndex: field.orderIndex,
      kind: "field" as const,
      fields: [field],
    })),
    ...section.groups.map((group) => ({
      orderIndex: group.orderIndex,
      kind: "group" as const,
      fields: [...group.fields].sort((left, right) => left.orderIndex - right.orderIndex || left.label.localeCompare(right.label)),
    })),
  ].sort((left, right) => left.orderIndex - right.orderIndex || (left.kind === "field" ? -1 : 1));

  return orderedItems.flatMap((item) => item.fields);
}

function createSourceReferenceMatchState(): SourceReferenceMatchState {
  return {
    pageIds: new Set<string>(),
    sectionIds: new Set<string>(),
    groupIds: new Set<string>(),
    fieldIds: new Set<string>(),
    anchorIds: new Set<string>(),
  };
}

function addSourceMatchIds(target: Set<string>, values: string[]): void {
  for (const value of values) {
    if (value) {
      target.add(value);
    }
  }
}

function collectEvidenceAnchorIds(evidence?: Array<{ anchorId: string }>): string[] {
  return evidence?.map((anchor) => anchor.anchorId) ?? [];
}

function mergeSourceReferenceMatchState(target: SourceReferenceMatchState, source: SourceReferenceMatchState): void {
  addSourceMatchIds(target.pageIds, [...source.pageIds]);
  addSourceMatchIds(target.sectionIds, [...source.sectionIds]);
  addSourceMatchIds(target.groupIds, [...source.groupIds]);
  addSourceMatchIds(target.fieldIds, [...source.fieldIds]);
  addSourceMatchIds(target.anchorIds, [...source.anchorIds]);
}

function collectFieldSourceReferenceMatchState(field: AuthoringField): SourceReferenceMatchState {
  const matches = createSourceReferenceMatchState();
  addSourceMatchIds(matches.fieldIds, field.sourceFieldIds);
  addSourceMatchIds(matches.anchorIds, field.provenanceAnchorIds);
  return matches;
}

function collectGroupSourceReferenceMatchState(group: AuthoringGroup): SourceReferenceMatchState {
  const matches = createSourceReferenceMatchState();
  addSourceMatchIds(matches.groupIds, group.sourceGroupIds);
  addSourceMatchIds(matches.anchorIds, group.provenanceAnchorIds);
  for (const field of group.fields) {
    mergeSourceReferenceMatchState(matches, collectFieldSourceReferenceMatchState(field));
  }
  return matches;
}

function collectSectionSourceReferenceMatchState(section: AuthoringSection): SourceReferenceMatchState {
  const matches = createSourceReferenceMatchState();
  addSourceMatchIds(matches.sectionIds, section.sourceSectionIds);
  addSourceMatchIds(matches.anchorIds, section.provenanceAnchorIds);
  for (const field of section.fields) {
    mergeSourceReferenceMatchState(matches, collectFieldSourceReferenceMatchState(field));
  }
  for (const group of section.groups) {
    mergeSourceReferenceMatchState(matches, collectGroupSourceReferenceMatchState(group));
  }
  return matches;
}

function collectStepSourceReferenceMatchState(step: AuthoringStep): SourceReferenceMatchState {
  const matches = createSourceReferenceMatchState();
  addSourceMatchIds(matches.pageIds, step.sourcePageIds);
  addSourceMatchIds(matches.anchorIds, step.provenanceAnchorIds);
  for (const section of step.sections) {
    mergeSourceReferenceMatchState(matches, collectSectionSourceReferenceMatchState(section));
  }
  return matches;
}

function sourceFieldMatchesFocus(field: FieldNode, focus: SourceReferenceFocus | null): boolean {
  if (!focus) {
    return false;
  }
  return (
    focus.fieldIds.has(field.id) ||
    field.evidence.some((anchor) => focus.anchorIds.has(anchor.anchorId))
  );
}

function sourceGroupMatchesFocus(group: GroupNode, focus: SourceReferenceFocus | null): boolean {
  if (!focus) {
    return false;
  }
  return (
    focus.groupIds.has(group.id) ||
    group.evidence.some((anchor) => focus.anchorIds.has(anchor.anchorId)) ||
    group.fields.some((field) => sourceFieldMatchesFocus(field, focus))
  );
}

function sourceSectionMatchesFocus(section: SectionNode, focus: SourceReferenceFocus | null): boolean {
  if (!focus) {
    return false;
  }
  return (
    focus.sectionIds.has(section.id) ||
    orderedReviewSectionFields(section).some((field) => sourceFieldMatchesFocus(field, focus)) ||
    section.groups.some((group) => sourceGroupMatchesFocus(group, focus))
  );
}

function sourcePageMatchesFocus(page: PageNode, focus: SourceReferenceFocus | null): boolean {
  if (!focus) {
    return false;
  }
  return (
    focus.pageIds.has(page.id) ||
    page.evidence?.some((anchor) => focus.anchorIds.has(anchor.anchorId)) === true ||
    page.sections.some((section) => sourceSectionMatchesFocus(section, focus))
  );
}

function countSourceFieldsOnPage(page: PageNode): number {
  return page.sections.reduce(
    (count, section) =>
      count +
      section.fields.length +
      section.groups.reduce((groupCount, group) => groupCount + group.fields.length, 0),
    0,
  );
}

function collectImportedFieldSourceReferenceMatchState(field: FieldNode): SourceReferenceMatchState {
  const matches = createSourceReferenceMatchState();
  addSourceMatchIds(matches.pageIds, [field.pageId]);
  addSourceMatchIds(matches.sectionIds, [field.sectionId]);
  addSourceMatchIds(matches.fieldIds, [field.id]);
  addSourceMatchIds(matches.anchorIds, collectEvidenceAnchorIds(field.evidence));
  return matches;
}

function collectImportedGroupSourceReferenceMatchState(group: GroupNode): SourceReferenceMatchState {
  const matches = createSourceReferenceMatchState();
  addSourceMatchIds(matches.pageIds, [group.pageId]);
  addSourceMatchIds(matches.sectionIds, [group.sectionId]);
  addSourceMatchIds(matches.groupIds, [group.id]);
  addSourceMatchIds(matches.anchorIds, collectEvidenceAnchorIds(group.evidence));
  for (const field of group.fields) {
    mergeSourceReferenceMatchState(matches, collectImportedFieldSourceReferenceMatchState(field));
  }
  return matches;
}

function collectImportedSectionSourceReferenceMatchState(section: SectionNode): SourceReferenceMatchState {
  const matches = createSourceReferenceMatchState();
  addSourceMatchIds(matches.pageIds, [section.pageId]);
  addSourceMatchIds(matches.sectionIds, [section.id]);
  for (const field of section.fields) {
    mergeSourceReferenceMatchState(matches, collectImportedFieldSourceReferenceMatchState(field));
  }
  for (const group of section.groups) {
    mergeSourceReferenceMatchState(matches, collectImportedGroupSourceReferenceMatchState(group));
  }
  return matches;
}

function collectImportedPageSourceReferenceMatchState(page: PageNode): SourceReferenceMatchState {
  const matches = createSourceReferenceMatchState();
  addSourceMatchIds(matches.pageIds, [page.id]);
  addSourceMatchIds(matches.anchorIds, collectEvidenceAnchorIds(page.evidence));
  for (const section of page.sections) {
    mergeSourceReferenceMatchState(matches, collectImportedSectionSourceReferenceMatchState(section));
  }
  return matches;
}

function hasSourceMatch(values: string[] | undefined, target: Set<string>): boolean {
  return values?.some((value) => target.has(value)) ?? false;
}

function authoringSelectionsEqual(left: AuthoringSelection | null, right: AuthoringSelection | null): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right || left.kind !== right.kind || left.stepId !== right.stepId) {
    return false;
  }
  if (left.kind === "step" && right.kind === "step") {
    return true;
  }
  if (left.kind === "section" && right.kind === "section") {
    return left.sectionId === right.sectionId;
  }
  if (left.kind === "group" && right.kind === "group") {
    return left.sectionId === right.sectionId && left.groupId === right.groupId;
  }
  if (left.kind === "field" && right.kind === "field") {
    return left.sectionId === right.sectionId && left.groupId === right.groupId && left.fieldId === right.fieldId;
  }
  return false;
}

function authoringStepDirectlyMatchesSourceState(step: AuthoringStep, matches: SourceReferenceMatchState): boolean {
  return hasSourceMatch(step.sourcePageIds, matches.pageIds) || hasSourceMatch(step.provenanceAnchorIds, matches.anchorIds);
}

function authoringSectionDirectlyMatchesSourceState(section: AuthoringSection, matches: SourceReferenceMatchState): boolean {
  return hasSourceMatch(section.sourceSectionIds, matches.sectionIds) || hasSourceMatch(section.provenanceAnchorIds, matches.anchorIds);
}

function authoringGroupDirectlyMatchesSourceState(group: AuthoringGroup, matches: SourceReferenceMatchState): boolean {
  return hasSourceMatch(group.sourceGroupIds, matches.groupIds) || hasSourceMatch(group.provenanceAnchorIds, matches.anchorIds);
}

function authoringFieldDirectlyMatchesSourceState(field: AuthoringField, matches: SourceReferenceMatchState): boolean {
  return hasSourceMatch(field.sourceFieldIds, matches.fieldIds) || hasSourceMatch(field.provenanceAnchorIds, matches.anchorIds);
}

function findDirectStepSelectionFromSourceState(document: AuthoringDocument, matches: SourceReferenceMatchState): AuthoringSelection | null {
  for (const step of document.steps) {
    if (authoringStepDirectlyMatchesSourceState(step, matches)) {
      return { kind: "step", stepId: step.id };
    }
  }
  return null;
}

function findDirectSectionSelectionFromSourceState(document: AuthoringDocument, matches: SourceReferenceMatchState): AuthoringSelection | null {
  for (const step of document.steps) {
    for (const section of step.sections) {
      if (authoringSectionDirectlyMatchesSourceState(section, matches)) {
        return { kind: "section", stepId: step.id, sectionId: section.id };
      }
    }
  }
  return null;
}

function findDirectGroupSelectionFromSourceState(document: AuthoringDocument, matches: SourceReferenceMatchState): AuthoringSelection | null {
  for (const step of document.steps) {
    for (const section of step.sections) {
      for (const group of section.groups) {
        if (authoringGroupDirectlyMatchesSourceState(group, matches)) {
          return { kind: "group", stepId: step.id, sectionId: section.id, groupId: group.id };
        }
      }
    }
  }
  return null;
}

function findDirectFieldSelectionFromSourceState(document: AuthoringDocument, matches: SourceReferenceMatchState): AuthoringSelection | null {
  for (const step of document.steps) {
    for (const section of step.sections) {
      for (const field of section.fields) {
        if (authoringFieldDirectlyMatchesSourceState(field, matches)) {
          return { kind: "field", stepId: step.id, sectionId: section.id, fieldId: field.id };
        }
      }
      for (const group of section.groups) {
        for (const field of group.fields) {
          if (authoringFieldDirectlyMatchesSourceState(field, matches)) {
            return { kind: "field", stepId: step.id, sectionId: section.id, groupId: group.id, fieldId: field.id };
          }
        }
      }
    }
  }
  return null;
}

function resolveAuthoringSelectionFromSourceReference(
  document: AuthoringDocument,
  matches: SourceReferenceMatchState,
  preferredKinds: AuthoringSelection["kind"][],
): AuthoringSelection | null {
  for (const preferredKind of preferredKinds) {
    if (preferredKind === "step") {
      const selection = findDirectStepSelectionFromSourceState(document, matches);
      if (selection) {
        return selection;
      }
      continue;
    }
    if (preferredKind === "section") {
      const selection = findDirectSectionSelectionFromSourceState(document, matches);
      if (selection) {
        return selection;
      }
      continue;
    }
    if (preferredKind === "group") {
      const selection = findDirectGroupSelectionFromSourceState(document, matches);
      if (selection) {
        return selection;
      }
      continue;
    }
    const selection = findDirectFieldSelectionFromSourceState(document, matches);
    if (selection) {
      return selection;
    }
  }
  return null;
}

function primaryPageHeading(page: PageNode): string {
  return page.sections[0]?.title ?? page.label;
}

function secondaryPageHeading(page: PageNode): string | null {
  const primary = primaryPageHeading(page);
  return page.label && page.label !== primary ? page.label : null;
}

function overlayRects(field: FieldNode): Coordinates[] {
  const optionRects =
    field.semanticType === "radio" || field.semanticType === "checkbox" || field.semanticType === "select"
      ? field.options.flatMap((option) =>
          option.evidence
            .map((anchor) => anchor.bounds)
            .filter((bounds): bounds is Coordinates => bounds !== undefined),
        )
      : [];

  const sourceRects = field.sourceCoordinates;
  const fallbackEvidenceRects = field.evidence
    .map((anchor) => anchor.bounds)
    .filter((bounds): bounds is Coordinates => bounds !== undefined);

  const preferredRects =
    optionRects.length > 0
      ? [...optionRects, ...sourceRects.slice(optionRects.length)]
      : sourceRects.length > 0
        ? sourceRects
        : fallbackEvidenceRects;

  const deduped = new Map<string, Coordinates>();
  for (const bounds of preferredRects) {
    const key = [bounds.page, bounds.x.toFixed(2), bounds.y.toFixed(2), bounds.width.toFixed(2), bounds.height.toFixed(2)].join(":");
    deduped.set(key, bounds);
  }
  return [...deduped.values()];
}

function importedDocumentFromPayload(payload: unknown): AuthoringDocument | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const candidate = payload as Record<string, unknown>;
  if ("document" in candidate && candidate.document && typeof candidate.document === "object") {
    const document = candidate.document as Record<string, unknown>;
    return Array.isArray(document.steps) ? (document as unknown as AuthoringDocument) : null;
  }
  return Array.isArray(candidate.steps) ? (candidate as unknown as AuthoringDocument) : null;
}

function StageShell({
  eyebrow,
  title,
  summary,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="stage-enter grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white/95 px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_8px_24px_rgba(15,23,42,0.05)]">
        <div className="min-w-0 flex-1">
          <p className="text-[0.64rem] font-semibold uppercase tracking-[0.22em] text-slate-500">{eyebrow}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h2 className="font-display text-[1.35rem] leading-none text-slate-950 sm:text-[1.5rem]">{title}</h2>
            <p className="max-w-3xl text-sm leading-6 text-slate-600">{summary}</p>
          </div>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export default function App() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const jsonInputRef = useRef<HTMLInputElement | null>(null);
  const runtimeSessionInputRef = useRef<HTMLInputElement | null>(null);
  const runtimeEngineRef = useRef(createRuntimeEngine());
  const runtimeSessionRef = useRef<RuntimeSessionState | null>(null);
  const pendingBehaviorFocusRef = useRef<string | null>(null);
  const behaviorStudioDialogRef = useRef<HTMLDivElement | null>(null);
  const behaviorStudioReturnFocusRef = useRef<HTMLElement | null>(null);
  const behaviorGraphDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const documentBehaviorGraphDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const simulatorSectionRef = useRef<HTMLDivElement | null>(null);
  const [stage, setStage] = useState<AppStage>("home");
  const [reviewPreviewMode, setReviewPreviewMode] = useState<ReviewPreviewMode>("overlay");
  const [reviewFlowMode, setReviewFlowMode] = useState<ReviewFlowMode>("new_project");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("properties");
  const [sourceDrawerOpen, setSourceDrawerOpen] = useState(false);
  const [conversions, setConversions] = useState<ConversionRecord[]>([]);
  const [projects, setProjects] = useState<AuthoringProjectRecord[]>([]);
  const [activeConversionId, setActiveConversionId] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProjectDetail, setActiveProjectDetail] = useState<AuthoringProjectDetail | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [selectedAuthoring, setSelectedAuthoring] = useState<AuthoringSelection | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [localPreviewConversionId, setLocalPreviewConversionId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null);
  const [activeDropTargetKey, setActiveDropTargetKey] = useState<string | null>(null);
  const [projectDirty, setProjectDirty] = useState(false);
  const [projectRevisions, setProjectRevisions] = useState<ProjectRevision[]>([]);
  const [isEditingDocumentTitle, setIsEditingDocumentTitle] = useState(false);
  const [editingRuleIndex, setEditingRuleIndex] = useState<number | null>(null);
  const [selectedBehaviorNode, setSelectedBehaviorNode] = useState<BehaviorGraphSelection | null>(null);
  const [behaviorFocusTarget, setBehaviorFocusTarget] = useState<"simulator" | null>(null);
  const [behaviorStudioOpen, setBehaviorStudioOpen] = useState(false);
  const [behaviorStudioView, setBehaviorStudioView] = useState<BehaviorStudioView>("studio");
  const [behaviorStudioMode, setBehaviorStudioMode] = useState<BehaviorStudioMode>("manage");
  const [behaviorStudioAnchor, setBehaviorStudioAnchor] = useState<BehaviorStudioAnchor | null>(null);
  const [behaviorStudioManagerMode, setBehaviorStudioManagerMode] = useState<BehaviorStudioManagerMode>("all");
  const [behaviorStudioManagerQuery, setBehaviorStudioManagerQuery] = useState("");
  const [behaviorStudioCreationKind, setBehaviorStudioCreationKind] = useState<BehaviorStudioCreationKind | null>(null);
  const [behaviorIndexStepFilter, setBehaviorIndexStepFilter] = useState("all");
  const [behaviorIndexScopeFilter, setBehaviorIndexScopeFilter] = useState("all");
  const [behaviorIndexTriggerFilter, setBehaviorIndexTriggerFilter] = useState("all");
  const [behaviorIndexEffectFilter, setBehaviorIndexEffectFilter] = useState("all");
  const [behaviorIndexStatusFilter, setBehaviorIndexStatusFilter] = useState<BehaviorIndexStatusFilter>("all");
  const [behaviorIndexObjectView, setBehaviorIndexObjectView] = useState<BehaviorIndexObjectView>("all");
  const [expandedBehaviorIndexObjectKey, setExpandedBehaviorIndexObjectKey] = useState<string | null>(null);
  const [behaviorWorkspaceMode, setBehaviorWorkspaceMode] = useState<BehaviorWorkspaceMode>("authoring");
  const [behaviorGraphFilter, setBehaviorGraphFilter] = useState<BehaviorGraphFilter>("all");
  const [behaviorGraphMode, setBehaviorGraphMode] = useState<BehaviorGraphMode>("focus");
  const [behaviorGraphDensity, setBehaviorGraphDensity] = useState<BehaviorGraphDensity>("comfortable");
  const [documentBehaviorSurfaceMode, setDocumentBehaviorSurfaceMode] = useState<DocumentBehaviorSurfaceMode>("canvas");
  const [expandedDocumentBehaviorTarget, setExpandedDocumentBehaviorTarget] = useState<DocumentBehaviorExpandedTarget>(null);
  const [documentBehaviorClusterFocus, setDocumentBehaviorClusterFocus] = useState<DocumentBehaviorClusterFocus>("all");
  const [documentBehaviorTrailFamilies, setDocumentBehaviorTrailFamilies] = useState<DocumentBehaviorClusterFamily[]>([]);
  const [documentBehaviorCanvasDensity, setDocumentBehaviorCanvasDensity] = useState<DocumentBehaviorCanvasDensity>("comfortable");
  const [documentBehaviorPinnedLaneIds, setDocumentBehaviorPinnedLaneIds] = useState<string[]>([]);
  const [documentBehaviorCanvasRelevantOnly, setDocumentBehaviorCanvasRelevantOnly] = useState(false);
  const [behaviorGraphZoom, setBehaviorGraphZoom] = useState(1);
  const [behaviorGraphOffset, setBehaviorGraphOffset] = useState({ x: 0, y: 0 });
  const [documentBehaviorGraphZoom, setDocumentBehaviorGraphZoom] = useState(1);
  const [documentBehaviorGraphOffset, setDocumentBehaviorGraphOffset] = useState({ x: 0, y: 0 });
  const [behaviorGraphEntryContext, setBehaviorGraphEntryContext] = useState<BehaviorGraphEntryContext | null>(null);
  const [mapViewMode, setMapViewMode] = useState<MapViewMode>("graph");
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);
  const [openProjectDialogOpen, setOpenProjectDialogOpen] = useState(false);
  const [projectDetailsOpen, setProjectDetailsOpen] = useState(false);
  const [revisionHistoryOpen, setRevisionHistoryOpen] = useState(false);
  const [sourceReferenceFilterMode, setSourceReferenceFilterMode] = useState<"all" | "matches">("all");
  const [workspaceLandingMode, setWorkspaceLandingMode] = useState<WorkspaceLandingMode | null>(null);
  const [openedRevisionView, setOpenedRevisionView] = useState<OpenedRevisionView | null>(null);
  const [pendingWorkspaceTransition, setPendingWorkspaceTransition] = useState<WorkspaceTransitionRequest | null>(null);
  const [runtimePayloadEditors, setRuntimePayloadEditors] = useState<Record<string, RuntimePayloadEditorState>>({});
  const [selectedRuntimeEvidenceKey, setSelectedRuntimeEvidenceKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isImportingJson, setIsImportingJson] = useState(false);
  const [isSavingReview, setIsSavingReview] = useState(false);
  const [isPromoting, setIsPromoting] = useState(false);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [isPublishingProject, setIsPublishingProject] = useState(false);
  const [isLoadingRevisionWorkspace, setIsLoadingRevisionWorkspace] = useState(false);
  const [isResolvingWorkspaceTransition, setIsResolvingWorkspaceTransition] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [runtimeSessionState, setRuntimeSessionState] = useState<RuntimeSessionState | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const [records, projectRecords] = await Promise.all([
          listConversions(),
          listProjects(),
        ]);
        if (cancelled) {
          return;
        }
        startTransition(() => {
          setConversions(records);
          setProjects(projectRecords);
          setActiveConversionId((current) => current ?? records[0]?.id ?? null);
          setActiveProjectId((current) => current ?? projectRecords[0]?.id ?? null);
        });
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load workspace.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
      }
    };
  }, [localPreviewUrl]);

  useEffect(() => {
    if (stage !== "workspace" || !projectDirty) {
      return;
    }
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [projectDirty, stage]);

  useEffect(() => {
    if (!activeProjectId) {
      setActiveProjectDetail(null);
      setProjectRevisions([]);
      setOpenedRevisionView(null);
      return;
    }
    let cancelled = false;
    const projectId = activeProjectId;
    setIsLoadingProject(true);
    async function loadProject() {
      try {
        const [detail, revisions] = await Promise.all([
          getProject(projectId),
          listProjectRevisions(projectId),
        ]);
        if (cancelled) {
          return;
        }
        startTransition(() => {
          setActiveProjectDetail(detail);
          setProjectRevisions(revisions);
          setOpenedRevisionView(null);
          setSelectedAuthoring((current) =>
            current ?? (detail.document.steps[0] ? { kind: "step", stepId: detail.document.steps[0].id } : null),
          );
        });
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load project.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingProject(false);
        }
      }
    }

    void loadProject();
    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);

  const activeConversion =
    conversions.find((conversion) => conversion.id === activeConversionId) ?? conversions[0] ?? null;
  const matchedProjectForActiveConversion = activeConversion
    ? projects.find((project) => project.sourceConversionId === activeConversion.id) ?? null
    : null;
  const reviewPages = activeConversion?.draft?.pages ?? [];
  const reviewPageSummaries = useMemo(() => reviewPages.map((page) => summarizePage(page)), [reviewPages]);

  useEffect(() => {
    if (matchedProjectForActiveConversion) {
      if (activeProjectId !== matchedProjectForActiveConversion.id) {
        setActiveProjectId(matchedProjectForActiveConversion.id);
      }
    }
  }, [activeProjectId, matchedProjectForActiveConversion]);

  useEffect(() => {
    if (!reviewPageSummaries.length) {
      setSelectedPageId(null);
      return;
    }
    if (selectedPageId && reviewPageSummaries.some((summary) => summary.page.id === selectedPageId)) {
      return;
    }
    setSelectedPageId(reviewPageSummaries[0].page.id);
  }, [reviewPageSummaries, selectedPageId]);

  const activePageSummary =
    reviewPageSummaries.find((summary) => summary.page.id === selectedPageId) ?? reviewPageSummaries[0] ?? null;
  const activeReviewPage = activePageSummary?.page ?? null;
  const activeReviewFields = activePageSummary?.fields ?? [];

  useEffect(() => {
    if (!activeReviewFields.length) {
      setSelectedFieldId(null);
      return;
    }
    if (selectedFieldId && activeReviewFields.some((field) => field.id === selectedFieldId)) {
      return;
    }
    setSelectedFieldId(null);
  }, [activeReviewFields, selectedFieldId]);

  useEffect(() => {
    runtimeSessionRef.current = runtimeSessionState;
  }, [runtimeSessionState]);

  const activeReviewField =
    selectedFieldId ? activeReviewFields.find((field) => field.id === selectedFieldId) ?? null : null;
  const reviewIssueCount = activeConversion?.issues.length ?? 0;
  const reviewReadyToPromote = Boolean(activeConversion && activeConversion.reviewStatus !== "needs_review");
  const activeReviewFieldConfidence = activeReviewField ? Math.round(activeReviewField.confidence * 100) : null;
  const reviewPageDimensions = useMemo(() => {
    const coordinates = activeReviewFields.flatMap((field) => overlayRects(field));
    return {
      width: Math.max(612, ...coordinates.map((coordinate) => coordinate.x + coordinate.width + 24), 612),
      height: Math.max(792, ...coordinates.map((coordinate) => coordinate.y + coordinate.height + 24), 792),
    };
  }, [activeReviewFields]);

  const previewBaseUrl =
    localPreviewUrl && activeConversion && localPreviewConversionId === activeConversion.id
      ? localPreviewUrl
      : activeConversion
        ? getConversionSourceUrl(activeConversion.id)
        : null;
  const previewUrl =
    previewBaseUrl && activeReviewPage ? `${previewBaseUrl}#page=${activeReviewPage.orderIndex + 1}` : null;
  const pagePreviewImageUrl =
    activeConversion && activeReviewPage
      ? getConversionPagePreviewUrl(activeConversion.id, activeReviewPage.orderIndex + 1)
      : null;

  const activeDocument = activeProjectDetail?.document ?? null;
  const sourceContextDraft = activeProjectDetail?.sourceContext.importedDraft ?? null;
  const isJsonImportedProject = activeProjectDetail?.sourceContext.extractorPath[0] === "json_import";
  const isPdfBackedProject = Boolean(activeProjectDetail && sourceContextDraft?.pages.length && !isJsonImportedProject);
  const builderSelection = activeDocument ? getSelectionContext(activeDocument, selectedAuthoring) : null;
  const runtimeStepId = runtimeSessionState?.currentStepId ?? null;
  const runtimeActiveStep =
    activeDocument && runtimeStepId ? activeDocument.steps.find((step) => step.id === runtimeStepId) ?? null : null;
  const activeStep = runtimeActiveStep ?? builderSelection?.step ?? activeDocument?.steps[0] ?? null;
  const activeSection = builderSelection?.section ?? activeStep?.sections[0] ?? null;
  const activeGroup = builderSelection?.group ?? null;
  const activeBuilderField = builderSelection?.field ?? null;
  const activeStepSummary = activeStep ? summarizeAuthoringStep(activeStep) : null;
  const activeDocumentSummary = activeDocument ? summarizeAuthoringDocument(activeDocument) : null;
  const activeStepIndex = activeDocument && activeStep ? activeDocument.steps.findIndex((step) => step.id === activeStep.id) : -1;
  const activeStepSourcePageIds = new Set(activeStep?.sourcePageIds ?? []);
  const sourceReferenceFocus = useMemo<SourceReferenceFocus | null>(() => {
    if (!isPdfBackedProject || !activeStep) {
      return null;
    }
    if (selectedAuthoring?.kind === "field" && activeBuilderField) {
      return {
        title: activeBuilderField.label,
        kindLabel: "Field",
        ...collectFieldSourceReferenceMatchState(activeBuilderField),
      };
    }
    if (selectedAuthoring?.kind === "group" && activeGroup) {
      return {
        title: activeGroup.label,
        kindLabel: "Group",
        ...collectGroupSourceReferenceMatchState(activeGroup),
      };
    }
    if (selectedAuthoring?.kind === "section" && activeSection) {
      return {
        title: activeSection.title,
        kindLabel: "Section",
        ...collectSectionSourceReferenceMatchState(activeSection),
      };
    }
    return {
      title: activeStep.title,
      kindLabel: "Step",
      ...collectStepSourceReferenceMatchState(activeStep),
    };
  }, [activeBuilderField, activeGroup, activeSection, activeStep, isPdfBackedProject, selectedAuthoring]);
  const sourceReferenceFocusHasMatches = Boolean(
    sourceReferenceFocus &&
      (sourceReferenceFocus.pageIds.size > 0 ||
        sourceReferenceFocus.sectionIds.size > 0 ||
        sourceReferenceFocus.groupIds.size > 0 ||
        sourceReferenceFocus.fieldIds.size > 0 ||
        sourceReferenceFocus.anchorIds.size > 0),
  );
  const sourceReferenceImportIssueCount = activeProjectDetail?.sourceContext.issues.length ?? 0;
  const sourceReferenceHasImportIssues = sourceReferenceImportIssueCount > 0;
  const sourceReferenceCanOpen = Boolean(
    sourceContextDraft && (!isPdfBackedProject || sourceReferenceFocusHasMatches || sourceReferenceHasImportIssues),
  );
  const sourceReferenceOpenMode = sourceReferenceFocusHasMatches ? "matches" : "all";
  const sourceReferenceActionLabel = sourceReferenceFocusHasMatches
    ? "Compare source"
    : sourceReferenceHasImportIssues
      ? "Review source issues"
      : "No linked source";
  const sourceReferenceVisiblePages = sourceContextDraft?.pages.filter((page) =>
    sourceReferenceFilterMode === "all" || !sourceReferenceFocusHasMatches
      ? true
      : sourcePageMatchesFocus(page, sourceReferenceFocus),
  ) ?? [];
  const importedSourcePageCount = sourceContextDraft?.pages.length ?? 0;
  const importedSourceSectionCount = sourceContextDraft?.pages.reduce((count, page) => count + page.sections.length, 0) ?? 0;
  const importedSourceFieldCount =
    sourceContextDraft?.pages.reduce(
      (count, page) =>
        count +
        page.sections.reduce(
          (sectionCount, section) =>
            sectionCount + section.fields.length + section.groups.reduce((groupCount, group) => groupCount + group.fields.length, 0),
          0,
        ),
      0,
    ) ?? 0;
  const workspaceSourceButtonLabel = isPdfBackedProject
    ? sourceDrawerOpen
      ? "Close source compare"
      : sourceReferenceActionLabel
    : sourceDrawerOpen
      ? "Hide source context"
      : "Show source context";
  const projectArtifactPaths = activeProjectDetail
    ? {
        project: `data/projects/${activeProjectDetail.project.id}/project.json`,
        document: `data/projects/${activeProjectDetail.project.id}/document.json`,
        sourceContext: `data/projects/${activeProjectDetail.project.id}/source-context.json`,
        revision: activeProjectDetail.project.currentRevisionId
          ? `data/projects/${activeProjectDetail.project.id}/revisions/${activeProjectDetail.project.currentRevisionId}.json`
          : null,
      }
    : null;
  const builderFieldOptions = useMemo(() => {
    if (!activeDocument) {
      return [];
    }
    return activeDocument.steps.flatMap((step) =>
      step.sections.flatMap((section) => [
        ...section.fields.map((field) => ({ id: field.id, label: field.label })),
        ...section.groups.flatMap((group) => group.fields.map((field) => ({ id: field.id, label: field.label }))),
      ]),
    );
  }, [activeDocument]);
  const builderStepOptions = useMemo(
    () => activeDocument?.steps.map((step) => ({ id: step.id, label: step.title })) ?? [],
    [activeDocument],
  );
  const builderNodeOptions = useMemo(() => {
    if (!activeDocument) {
      return [];
    }
    return activeDocument.steps.flatMap((step) => [
      { id: step.id, label: `Step · ${step.title}` },
      ...step.sections.flatMap((section) => [
        { id: section.id, label: `Section · ${section.title}` },
        ...section.groups.map((group) => ({ id: group.id, label: `Group · ${group.label}` })),
        ...section.fields.map((field) => ({ id: field.id, label: `Field · ${field.label}` })),
        ...section.groups.flatMap((group) =>
          group.fields.map((field) => ({ id: field.id, label: `Field · ${field.label}` })),
        ),
      ]),
    ]);
  }, [activeDocument]);
  const runtimeNodeLabelById = useMemo(() => {
    const labels = new Map<string, string>();
    if (!activeDocument) {
      return labels;
    }
    labels.set(activeDocument.id, `Form · ${activeDocument.title}`);
    builderStepOptions.forEach((option) => {
      labels.set(option.id, `Step · ${option.label}`);
    });
    builderNodeOptions.forEach((option) => {
      labels.set(option.id, option.label);
    });
    builderFieldOptions.forEach((option) => {
      labels.set(option.id, `Field · ${option.label}`);
    });
    return labels;
  }, [activeDocument, builderFieldOptions, builderNodeOptions, builderStepOptions]);
  const logicMapData = useMemo(() => {
    if (!activeDocument) {
      return null;
    }

    const fieldLabelById = new Map(builderFieldOptions.map((option) => [option.id, option.label]));
    const stepLabelById = new Map(builderStepOptions.map((option) => [option.id, option.label]));
    const nodeLabelById = new Map(builderNodeOptions.map((option) => [option.id, option.label]));
    const formatNodeLabel = (nodeId: unknown) => {
      if (typeof nodeId !== "string" || !nodeId) {
        return "target";
      }
      return nodeLabelById.get(nodeId) ?? stepLabelById.get(nodeId) ?? fieldLabelById.get(nodeId) ?? nodeId;
    };
    const formatActionSummary = (action: RuntimeActionDefinition) => {
      switch (action.kind) {
        case "go_to_next_step":
          return "Go to next step";
        case "go_to_previous_step":
          return "Go to previous step";
        case "go_to_step":
          return `Go to ${formatNodeLabel(action.config.stepId ?? action.target?.nodeId)}`;
        case "submit_form":
          return "Submit form";
        case "set_field_value":
          return `Set ${formatNodeLabel(action.config.fieldId ?? action.target?.nodeId)} to ${JSON.stringify(action.config.value ?? "")}`;
        case "clear_field_value":
          return `Clear ${formatNodeLabel(action.config.fieldId ?? action.target?.nodeId)}`;
        case "show_node":
        case "hide_node":
        case "enable_node":
        case "disable_node":
        case "mark_required":
        case "mark_optional":
          return `${formatLabel(action.kind)} ${formatNodeLabel(action.config.nodeId ?? action.target?.nodeId)}`;
        case "emit_event":
          return `Emit ${String(action.config.eventName ?? "custom.event")}`;
        case "host_action":
          return `Request ${String(action.config.handlerKey ?? "host action")}`;
        default:
          return formatLabel(action.kind);
      }
    };
    const summarizeListenerActions = (actions: RuntimeActionDefinition[]) => {
      if (!actions.length) {
        return "No actions";
      }
      const visible = actions.slice(0, 3).map(formatActionSummary);
      return actions.length > 3 ? `${visible.join(" -> ")} -> +${actions.length - 3} more` : visible.join(" -> ");
    };
    const describeRuleOperator = (rule: ConditionalRule) => {
      if (rule.operator === "exists") {
        return "has any value";
      }
      if (rule.operator === "not_equals") {
        return `does not equal "${rule.expectedValue ?? ""}"`;
      }
      if (rule.operator === "contains") {
        return `contains "${rule.expectedValue ?? ""}"`;
      }
      return `equals "${rule.expectedValue ?? ""}"`;
    };
    const describeRuleEffect = (rule: ConditionalRule) => {
      switch (rule.effect) {
        case "show":
          return "show";
        case "hide":
          return "hide";
        case "require":
          return "require";
        case "disable":
          return "disable";
        default:
          return rule.effect;
      }
    };
    const countStepFields = (step: AuthoringStep) =>
      step.sections.reduce(
        (total, section) =>
          total + section.fields.length + section.groups.reduce((groupTotal, group) => groupTotal + group.fields.length, 0),
        0,
      );
    const collectActionTargetIds = (actions: RuntimeActionDefinition[]) => {
      const ids = new Set<string>();
      actions.forEach((action) => {
        [action.target?.nodeId, action.config.nodeId, action.config.fieldId, action.config.stepId].forEach((candidate) => {
          if (typeof candidate === "string" && candidate) {
            ids.add(candidate);
          }
        });
      });
      return Array.from(ids);
    };

    const formListeners =
      activeDocument.runtime?.formListeners.map<LogicMapListenerEntry>((listener) => ({
        id: listener.id,
        scopeLabel: "Form runtime",
        eventName: listener.eventName,
        actionsSummary: summarizeListenerActions(listener.actions),
        actionKinds: listener.actions.map((action) => action.kind),
        enabled: listener.enabled,
        sourceNodeId: listener.sourceNodeId ?? activeDocument.id,
        targetNodeIds: collectActionTargetIds(listener.actions),
        actionCount: listener.actions.length,
        stepId: null,
        selection: null,
        graphSelection: createListenerGraphSelection(listener),
      })) ?? [];

    const steps = activeDocument.steps.map<LogicMapStepEntry>((step) => {
      const conditionalRules: LogicMapConditionalEntry[] = [];
      const runtimeListeners: LogicMapListenerEntry[] = [];

      if (step.runtime?.listeners.length) {
        runtimeListeners.push(
            ...step.runtime.listeners.map((listener) => ({
              id: listener.id,
              scopeLabel: `Step · ${step.title}`,
              eventName: listener.eventName,
              actionsSummary: summarizeListenerActions(listener.actions),
              actionKinds: listener.actions.map((action) => action.kind),
              enabled: listener.enabled,
              sourceNodeId: listener.sourceNodeId ?? step.id,
              targetNodeIds: collectActionTargetIds(listener.actions),
              actionCount: listener.actions.length,
              stepId: step.id,
              selection: { kind: "step", stepId: step.id } as AuthoringSelection,
              graphSelection: createListenerGraphSelection(listener),
            })),
        );
      }

      step.sections.forEach((section) => {
        if (section.runtime?.listeners.length) {
          runtimeListeners.push(
            ...section.runtime.listeners.map((listener) => ({
              id: listener.id,
              scopeLabel: `Section · ${section.title}`,
              eventName: listener.eventName,
              actionsSummary: summarizeListenerActions(listener.actions),
              actionKinds: listener.actions.map((action) => action.kind),
              enabled: listener.enabled,
              sourceNodeId: listener.sourceNodeId ?? section.id,
              targetNodeIds: collectActionTargetIds(listener.actions),
              actionCount: listener.actions.length,
              stepId: step.id,
              selection: { kind: "section", stepId: step.id, sectionId: section.id } as AuthoringSelection,
              graphSelection: createListenerGraphSelection(listener),
            })),
          );
        }

        section.fields.forEach((field) => {
          field.conditionals.forEach((rule, ruleIndex) => {
            conditionalRules.push({
              id: rule.ruleId,
              title: `${field.label} reacts to ${fieldLabelById.get(rule.whenFieldId) ?? "another field"}`,
              detail: `When ${fieldLabelById.get(rule.whenFieldId) ?? "that field"} ${describeRuleOperator(rule)}, ${describeRuleEffect(rule)} ${field.label}.`,
              scopeLabel: `Field · ${field.label}`,
              sourceFieldLabel: fieldLabelById.get(rule.whenFieldId) ?? "another field",
              sourceFieldId: rule.whenFieldId,
              targetFieldLabel: field.label,
              targetFieldId: field.id,
                effectLabel: describeRuleEffect(rule),
                enabled: isConditionalRuleEnabled(rule),
                stepId: step.id,
                sectionId: section.id,
                sourceSelection: { kind: "field", stepId: step.id, sectionId: section.id, fieldId: field.id },
                ruleIndex,
                graphSelection: {
                kind: "rule",
                ruleId: rule.ruleId,
                phase: "condition",
              },
            });
          });
          if (field.runtime?.listeners.length) {
            runtimeListeners.push(
              ...field.runtime.listeners.map((listener) => ({
                id: listener.id,
                scopeLabel: `Field · ${field.label}`,
                eventName: listener.eventName,
                actionsSummary: summarizeListenerActions(listener.actions),
                actionKinds: listener.actions.map((action) => action.kind),
                enabled: listener.enabled,
                sourceNodeId: listener.sourceNodeId ?? field.id,
                targetNodeIds: collectActionTargetIds(listener.actions),
                actionCount: listener.actions.length,
                stepId: step.id,
                selection: { kind: "field", stepId: step.id, sectionId: section.id, fieldId: field.id } as AuthoringSelection,
                graphSelection: createListenerGraphSelection(listener),
              })),
            );
          }
        });

        section.groups.forEach((group) => {
          if (group.runtime?.listeners.length) {
            runtimeListeners.push(
              ...group.runtime.listeners.map((listener) => ({
                id: listener.id,
                scopeLabel: `Group · ${group.label}`,
                eventName: listener.eventName,
                actionsSummary: summarizeListenerActions(listener.actions),
                actionKinds: listener.actions.map((action) => action.kind),
                enabled: listener.enabled,
                sourceNodeId: listener.sourceNodeId ?? group.id,
                targetNodeIds: collectActionTargetIds(listener.actions),
                actionCount: listener.actions.length,
                stepId: step.id,
                selection: { kind: "group", stepId: step.id, sectionId: section.id, groupId: group.id } as AuthoringSelection,
                graphSelection: createListenerGraphSelection(listener),
              })),
            );
          }
          group.fields.forEach((field) => {
            field.conditionals.forEach((rule, ruleIndex) => {
              conditionalRules.push({
                id: rule.ruleId,
                title: `${field.label} reacts to ${fieldLabelById.get(rule.whenFieldId) ?? "another field"}`,
                detail: `When ${fieldLabelById.get(rule.whenFieldId) ?? "that field"} ${describeRuleOperator(rule)}, ${describeRuleEffect(rule)} ${field.label}.`,
                scopeLabel: `Field · ${field.label}`,
                sourceFieldLabel: fieldLabelById.get(rule.whenFieldId) ?? "another field",
                sourceFieldId: rule.whenFieldId,
                targetFieldLabel: field.label,
                targetFieldId: field.id,
                effectLabel: describeRuleEffect(rule),
                enabled: isConditionalRuleEnabled(rule),
                stepId: step.id,
                sectionId: section.id,
                sourceSelection: { kind: "field", stepId: step.id, sectionId: section.id, groupId: group.id, fieldId: field.id },
                ruleIndex,
                graphSelection: {
                  kind: "rule",
                  ruleId: rule.ruleId,
                  phase: "condition",
                },
              });
            });
            if (field.runtime?.listeners.length) {
              runtimeListeners.push(
                ...field.runtime.listeners.map((listener) => ({
                id: listener.id,
                scopeLabel: `Field · ${field.label}`,
                eventName: listener.eventName,
                actionsSummary: summarizeListenerActions(listener.actions),
                actionKinds: listener.actions.map((action) => action.kind),
                enabled: listener.enabled,
                sourceNodeId: listener.sourceNodeId ?? field.id,
                targetNodeIds: collectActionTargetIds(listener.actions),
                actionCount: listener.actions.length,
                stepId: step.id,
                selection: { kind: "field", stepId: step.id, sectionId: section.id, groupId: group.id, fieldId: field.id } as AuthoringSelection,
                graphSelection: createListenerGraphSelection(listener),
              })),
              );
            }
          });
        });
      });

      return {
        id: step.id,
        title: step.title,
        selection: { kind: "step", stepId: step.id },
        sectionCount: step.sections.length,
        fieldCount: countStepFields(step),
        conditionalRules,
        runtimeListeners,
      };
    });

    return {
      totalConditionals: steps.reduce((total, step) => total + step.conditionalRules.length, 0),
      totalListeners: formListeners.length + steps.reduce((total, step) => total + step.runtimeListeners.length, 0),
      formListeners,
      steps,
    };
  }, [activeDocument, builderFieldOptions, builderNodeOptions, builderStepOptions]);
  const activeRuntimeScope: RuntimeEditorScope | null = useMemo(() => {
    if (!activeDocument) {
      return null;
    }
    if (selectedAuthoring === null) {
      const runtime = activeDocument.runtime ?? createRuntimeDocumentBehavior();
      return {
        scopeKind: "form",
        label: activeDocument.title,
        description: "Form-level events let the runtime react to load, submit, validation, and host lifecycle events.",
        eventSources: runtime.formEvents,
        listeners: runtime.formListeners,
      };
    }
    if (selectedAuthoring.kind === "field" && activeBuilderField) {
      const runtime = activeBuilderField.runtime ?? createRuntimeNodeBehavior();
      return {
        scopeKind: activeBuilderField.rendererHints.component === "button" ? "component" : "field",
        label: activeBuilderField.label,
        description:
          activeBuilderField.rendererHints.component === "button"
            ? "Buttons are event sources. Use presets to wire click behavior without dropping into raw JSON."
            : "Field events usually start with a value change, then trigger one or more follow-up actions.",
        eventSources: runtime.eventSources,
        listeners: runtime.listeners,
      };
    }
    if (selectedAuthoring.kind === "group" && activeGroup) {
      const runtime = activeGroup.runtime ?? createRuntimeNodeBehavior();
      return {
        scopeKind: "group",
        label: activeGroup.label,
        description: "Group-level listeners are useful when a cluster of controls should react together.",
        eventSources: runtime.eventSources,
        listeners: runtime.listeners,
      };
    }
    if (selectedAuthoring.kind === "section" && activeSection) {
      const runtime = activeSection.runtime ?? createRuntimeNodeBehavior();
      return {
        scopeKind: "section",
        label: activeSection.title,
        description: "Section-level listeners can coordinate visibility and structure around the current page area.",
        eventSources: runtime.eventSources,
        listeners: runtime.listeners,
      };
    }
    if (selectedAuthoring.kind === "step" && activeStep) {
      const runtime = activeStep.runtime ?? createRuntimeNodeBehavior();
      return {
        scopeKind: "step",
        label: activeStep.title,
        description: "Step-level listeners are best for navigation and page lifecycle reactions.",
        eventSources: runtime.eventSources,
        listeners: runtime.listeners,
      };
    }
    return null;
  }, [activeDocument, activeBuilderField, activeGroup, activeSection, activeStep, selectedAuthoring]);
  const runtimeTraceEntries = useMemo(() => {
    if (!activeDocument) {
      return [];
    }
    return runtimeEngineRef.current.getTrace().slice(-12).reverse();
  }, [activeDocument, runtimeSessionState]);
  const runtimeSubmitPreview = useMemo(() => {
    if (!activeDocument) {
      return null;
    }
    try {
      return runtimeEngineRef.current.getSubmitPayload();
    } catch {
      return null;
    }
  }, [activeDocument, runtimeSessionState]);

  useEffect(() => {
    setSelectedRuntimeEvidenceKey(null);
  }, [activeDocument?.id]);

  useEffect(() => {
    if (!selectedRuntimeEvidenceKey) {
      return;
    }
    if (runtimeTraceEntries.some((entry) => getRuntimeTraceEntryKey(entry) === selectedRuntimeEvidenceKey)) {
      return;
    }
    setSelectedRuntimeEvidenceKey(null);
  }, [runtimeTraceEntries, selectedRuntimeEvidenceKey]);

  function getRuntimePayloadEditorState(action: RuntimeActionDefinition): RuntimePayloadEditorState {
    const current = runtimePayloadEditors[action.id];
    if (current) {
      return current;
    }
    return {
      mode: "key_value",
      raw: JSON.stringify(getRuntimeActionPayload(action), null, 2),
    };
  }

  function setRuntimePayloadEditorMode(action: RuntimeActionDefinition, mode: RuntimePayloadMode) {
    setRuntimePayloadEditors((current) => ({
      ...current,
      [action.id]: {
        mode,
        raw: current[action.id]?.raw ?? JSON.stringify(getRuntimeActionPayload(action), null, 2),
      },
    }));
  }

  function updateRuntimePayloadEditorRaw(actionId: string, raw: string) {
    setRuntimePayloadEditors((current) => ({
      ...current,
      [actionId]: {
        mode: current[actionId]?.mode ?? "json",
        raw,
      },
    }));
  }

  function syncRuntimePayloadEditor(actionId: string, payload: Record<string, unknown>) {
    setRuntimePayloadEditors((current) => ({
      ...current,
      [actionId]: {
        mode: current[actionId]?.mode ?? "key_value",
        raw: JSON.stringify(payload, null, 2),
      },
    }));
  }

  function applyRuntimePayloadEntries(
    listenerId: string,
    actionId: string,
    entries: RuntimePayloadEntry[],
  ) {
    const payload = runtimePayloadFromEntries(entries);
    updateRuntimeAction(listenerId, actionId, (current) => {
      current.config.payload = payload;
    });
    syncRuntimePayloadEditor(actionId, payload);
  }

  function runtimePayloadTemplatesForAction(
    action: RuntimeActionDefinition,
    listener: RuntimeListenerDefinition,
  ): RuntimePayloadTemplate[] {
    if (action.kind === "emit_event") {
      const templates: RuntimePayloadTemplate[] = [];
      if (listener.eventName === "field.change" || activeRuntimeScope?.scopeKind === "field") {
        templates.push({
          id: "field-changed",
          label: "Field changed",
          description: "Send live field, step, and project context with the current runtime value.",
          entries: [
            createRuntimePayloadReferenceEntry("fieldId", "current.field.id"),
            createRuntimePayloadReferenceEntry("fieldKey", "current.field.key"),
            createRuntimePayloadReferenceEntry("stepId", "current.step.id"),
            createRuntimePayloadReferenceEntry("stepTitle", "current.step.title"),
            createRuntimePayloadReferenceEntry("projectId", "current.project.id"),
            createRuntimePayloadReferenceEntry("sourceNodeType", "current.source.node.type"),
            createRuntimePayloadReferenceEntry("value", "current.runtime.value"),
            createRuntimePayloadEntry("changeOrigin", "runtime", "string"),
          ],
        });
      }
      if (listener.eventName === "form.submit") {
        templates.push({
          id: "form-submit-dispatched",
          label: "Form submit dispatched",
          description: "Send the current form, step, and project identity with the submit signal.",
          entries: [
            createRuntimePayloadReferenceEntry("formId", "current.form.id"),
            createRuntimePayloadReferenceEntry("formTitle", "current.form.title"),
            createRuntimePayloadReferenceEntry("stepId", "current.step.id"),
            createRuntimePayloadReferenceEntry("stepTitle", "current.step.title"),
            createRuntimePayloadReferenceEntry("projectId", "current.project.id"),
            createRuntimePayloadEntry("submitOrigin", "runtime", "string"),
          ],
        });
      }
      if (listener.eventName === "form.validation_failed") {
        templates.push({
          id: "validation-blocked",
          label: "Validation blocked",
          description: "Send a reusable blocked-submit signal for runtime or host QA.",
          entries: [
            createRuntimePayloadReferenceEntry("formId", "current.form.id"),
            createRuntimePayloadReferenceEntry("formTitle", "current.form.title"),
            createRuntimePayloadReferenceEntry("stepId", "current.step.id"),
            createRuntimePayloadReferenceEntry("stepTitle", "current.step.title"),
            createRuntimePayloadReferenceEntry("projectId", "current.project.id"),
            createRuntimePayloadEntry("reason", "required_fields", "string"),
          ],
        });
      }
      return templates;
    }

    if (action.kind === "host_action") {
      const handlerKey = String(action.config.handlerKey ?? "");
      const templates: RuntimePayloadTemplate[] = [];
      if (handlerKey.includes("lookup") || activeRuntimeScope?.scopeKind === "field") {
        templates.push({
          id: "host-lookup",
          label: "Host lookup",
          description: "Start a field-level lookup request with live field, step, and project context.",
          entries: [
            createRuntimePayloadReferenceEntry("fieldId", "current.field.id"),
            createRuntimePayloadReferenceEntry("fieldKey", "current.field.key"),
            createRuntimePayloadReferenceEntry("stepId", "current.step.id"),
            createRuntimePayloadReferenceEntry("stepTitle", "current.step.title"),
            createRuntimePayloadReferenceEntry("projectId", "current.project.id"),
            createRuntimePayloadReferenceEntry("sourceNodeType", "current.source.node.type"),
            createRuntimePayloadReferenceEntry("query", "current.runtime.value"),
            createRuntimePayloadEntry("requestSource", "runtime", "string"),
          ],
        });
      }
      if (handlerKey.includes("prefill") || activeRuntimeScope?.scopeKind === "form" || activeRuntimeScope?.scopeKind === "field") {
        templates.push({
          id: "host-prefill",
          label: "Host prefill",
          description: "Request a prefill response for the selected field or the wider form.",
          entries: [
            createRuntimePayloadReferenceEntry("targetFieldId", "current.field.id"),
            createRuntimePayloadReferenceEntry("targetFieldKey", "current.field.key"),
            createRuntimePayloadReferenceEntry("stepId", "current.step.id"),
            createRuntimePayloadReferenceEntry("stepTitle", "current.step.title"),
            createRuntimePayloadReferenceEntry("projectId", "current.project.id"),
            createRuntimePayloadEntry("mergeMode", "replace_empty", "string"),
            createRuntimePayloadEntry("requestSource", "runtime", "string"),
          ],
        });
      }
      if (handlerKey.includes("submit") || listener.eventName === "form.submit") {
        templates.push({
          id: "host-submit",
          label: "Host submit",
          description: "Hand off the authored submit identity to a host workflow.",
          entries: [
            createRuntimePayloadReferenceEntry("formId", "current.form.id"),
            createRuntimePayloadReferenceEntry("formTitle", "current.form.title"),
            createRuntimePayloadReferenceEntry("stepId", "current.step.id"),
            createRuntimePayloadReferenceEntry("stepTitle", "current.step.title"),
            createRuntimePayloadReferenceEntry("projectId", "current.project.id"),
            createRuntimePayloadReferenceEntry("sourceNodeId", "current.source.node.id"),
            createRuntimePayloadEntry("submitEvent", "form.submit", "string"),
            createRuntimePayloadEntry("requestSource", "runtime", "string"),
          ],
        });
      }
      return templates;
    }

    return [];
  }

  useEffect(() => {
    if (selectedAuthoring?.kind !== "field") {
      setEditingRuleIndex(null);
    }
  }, [selectedAuthoring]);

  useEffect(() => {
    if (!selectedBehaviorNode) {
      return;
    }
    if (selectedBehaviorNode.kind === "rule" && behaviorGraphFilter === "interaction") {
      setSelectedBehaviorNode(null);
      setEditingRuleIndex(null);
    }
    if (selectedBehaviorNode.kind === "listener" && behaviorGraphFilter === "state") {
      setSelectedBehaviorNode(null);
    }
  }, [behaviorGraphFilter, selectedBehaviorNode]);

  useEffect(() => {
    if (!selectedBehaviorNode) {
      return;
    }
    if (selectedBehaviorNode.kind === "rule") {
      const focusKey = `rule:${selectedBehaviorNode.ruleId}`;
      if (activeBuilderField?.conditionals.some((rule) => rule.ruleId === selectedBehaviorNode.ruleId)) {
        if (pendingBehaviorFocusRef.current === focusKey) {
          pendingBehaviorFocusRef.current = null;
        }
        return;
      }
      if (pendingBehaviorFocusRef.current !== focusKey) {
        setSelectedBehaviorNode(null);
        setEditingRuleIndex(null);
      }
      return;
    }
    const focusKey = `listener:${selectedBehaviorNode.listenerId}`;
    if (activeRuntimeScope?.listeners.some((listener) => listener.id === selectedBehaviorNode.listenerId)) {
      if (pendingBehaviorFocusRef.current === focusKey) {
        pendingBehaviorFocusRef.current = null;
      }
      return;
    }
    if (pendingBehaviorFocusRef.current !== focusKey) {
      setSelectedBehaviorNode(null);
    }
  }, [activeBuilderField, activeRuntimeScope, selectedBehaviorNode]);

  useEffect(() => {
    if (behaviorStudioOpen || inspectorTab !== "behavior" || behaviorFocusTarget !== "simulator") {
      return;
    }
    simulatorSectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    setBehaviorFocusTarget(null);
  }, [behaviorFocusTarget, behaviorStudioOpen, inspectorTab]);

  useEffect(() => {
    if (behaviorStudioOpen) {
      behaviorStudioDialogRef.current?.focus();
      return;
    }
    behaviorStudioReturnFocusRef.current?.focus();
  }, [behaviorStudioOpen]);

  useEffect(() => {
    if (!behaviorStudioOpen) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    const previousOverscrollBehavior = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscrollBehavior;
    };
  }, [behaviorStudioOpen]);

  useEffect(() => {
    if (!activeDocument) {
      runtimeEngineRef.current.unmount();
      runtimeSessionRef.current = null;
      setRuntimeSessionState(null);
      return;
    }

    const engine = runtimeEngineRef.current;
    const unsubscribe = engine.subscribe((event) => {
      const nextState = engine.getState();
      runtimeSessionRef.current = nextState;
      setRuntimeSessionState(nextState);

      if (event.type === "step.enter") {
        const stepId = typeof event.payload.stepId === "string" ? event.payload.stepId : null;
        if (stepId) {
          setSelectedAuthoring((current) => {
            if (current === null) {
              return current;
            }
            if (current.stepId === stepId) {
              return current;
            }
            return { kind: "step", stepId };
          });
        }
      }

      if (event.type === "form.submit") {
        setFlashMessage("Preview runtime emitted a submit event. Use the simulator success or error controls to complete the host loop.");
        setErrorMessage(null);
      } else if (event.type === "form.validation_failed") {
        setErrorMessage("Complete the required fields in this runtime preview before submitting.");
      } else if (event.type === "form.submit_success") {
        setFlashMessage(typeof event.payload.message === "string" ? event.payload.message : "Preview submit succeeded.");
        setErrorMessage(null);
      } else if (event.type === "form.submit_error") {
        setErrorMessage(typeof event.payload.message === "string" ? event.payload.message : "Preview submit failed.");
      }
    });

    const initialSelectionStepId =
      selectedAuthoring?.stepId && activeDocument.steps.some((step) => step.id === selectedAuthoring.stepId)
        ? selectedAuthoring.stepId
        : activeDocument.steps[0]?.id ?? null;

    const nextState = engine.mount(activeDocument, {
      projectId: activeProjectDetail?.project.id ?? null,
      initialSessionState: runtimeSessionRef.current ?? { currentStepId: initialSelectionStepId },
      hostContext: {
        environment: "builder-preview",
        session: { projectId: activeProjectDetail?.project.id ?? null },
        auth: {},
        app: { stage: "builder" },
        data: {},
      },
    });
    runtimeSessionRef.current = nextState;
    setRuntimeSessionState(nextState);

    return () => {
      unsubscribe();
    };
  }, [activeDocument, activeProjectDetail?.project.id]);

  useEffect(() => {
    const selectedStepId = selectedAuthoring?.stepId ?? null;
    if (!selectedStepId || !runtimeSessionRef.current || selectedStepId === runtimeSessionRef.current.currentStepId) {
      return;
    }

    const nextState = runtimeEngineRef.current.invoke({
      id: `host_go_to_step_${selectedStepId}`,
      kind: "go_to_step",
      target: {
        nodeId: selectedStepId,
        nodeType: "step",
      },
      config: {
        stepId: selectedStepId,
      },
      continueOnError: false,
    });
    runtimeSessionRef.current = nextState;
    setRuntimeSessionState(nextState);
  }, [selectedAuthoring?.stepId]);

  function setMessage(message: string | null) {
    setFlashMessage(message);
    if (message) {
      setErrorMessage(null);
    }
  }

  function runtimeScopeIdentifierBase(scope: RuntimeEditorScope | null, field: AuthoringField | null): string {
    if (field?.stableKey) {
      return sanitizeRuntimeIdentifier(field.stableKey, "field");
    }
    return sanitizeRuntimeIdentifier(scope?.label ?? scope?.scopeKind ?? "runtime", "runtime");
  }

  function runtimeTriggerSuggestions(scope: RuntimeEditorScope | null, field: AuthoringField | null): string[] {
    const base = runtimeScopeIdentifierBase(scope, field);
    switch (scope?.scopeKind) {
      case "component":
        return ["component.click", `${base}.requested`];
      case "field":
        return ["field.change", `${base}.changed`];
      case "form":
        return ["form.load", "form.submit", "form.validation_failed"];
      case "step":
        return ["step.enter", "step.leave", `${base}.opened`];
      case "section":
      case "group":
        return [`${base}.changed`, `${base}.updated`];
      default:
        return ["form.load"];
    }
  }

  function runtimeEventNameSuggestions(
    scope: RuntimeEditorScope | null,
    field: AuthoringField | null,
    listener?: RuntimeListenerDefinition | null,
  ): string[] {
    const base = runtimeScopeIdentifierBase(scope, field);
    if (listener?.eventName === "form.load") {
      return ["form.loaded", "form.ready"];
    }
    if (listener?.eventName === "form.submit") {
      return ["form.submit.dispatched", "form.submit.requested"];
    }
    if (listener?.eventName === "form.validation_failed") {
      return ["form.validation_failed", "form.submit.blocked"];
    }
    switch (scope?.scopeKind) {
      case "component":
        return [`${base}.clicked`, `${base}.requested`, "form.submit.requested"];
      case "field":
        return [`${base}.changed`, `${base}.updated`, `${base}.validated`];
      case "step":
        return [`${base}.entered`, `${base}.completed`, `${base}.updated`];
      case "section":
      case "group":
        return [`${base}.updated`, `${base}.expanded`, `${base}.completed`];
      case "form":
        return ["form.updated", "form.ready", "form.runtime.changed"];
      default:
        return ["custom.event"];
    }
  }

  function runtimeHostHandlerSuggestions(
    scope: RuntimeEditorScope | null,
    field: AuthoringField | null,
    listener?: RuntimeListenerDefinition | null,
  ): string[] {
    const base = runtimeScopeIdentifierBase(scope, field);
    if (listener?.eventName === "form.submit") {
      return ["host.submit", "host.audit", "host.analytics"];
    }
    switch (scope?.scopeKind) {
      case "component":
        return ["host.submit", "host.navigate", "host.audit"];
      case "field":
        return [`host.${base}.lookup`, "host.lookup", "host.prefill"];
      case "form":
        return ["host.prefill", "host.audit", "host.analytics"];
      default:
        return ["host.audit", "host.sync", "host.workflow"];
    }
  }

  function defaultRuntimeActionConfigForScope(
    kind: RuntimeActionKind,
    options?: { scope?: RuntimeEditorScope | null; field?: AuthoringField | null; listener?: RuntimeListenerDefinition | null },
  ): Record<string, unknown> {
    const scope = options?.scope ?? activeRuntimeScope;
    const field = options?.field ?? activeBuilderField;
    const listener = options?.listener ?? null;
    switch (kind) {
      case "emit_event":
        return { eventName: runtimeEventNameSuggestions(scope, field, listener)[0] ?? "custom.event", payload: {} };
      case "host_action":
        return { handlerKey: runtimeHostHandlerSuggestions(scope, field, listener)[0] ?? "host.action", payload: {} };
      case "go_to_step":
        return { stepId: builderStepOptions[0]?.id ?? "" };
      case "set_field_value":
        return { fieldId: builderFieldOptions[0]?.id ?? "", value: "" };
      case "show_node":
      case "hide_node":
      case "enable_node":
      case "disable_node":
      case "mark_required":
      case "mark_optional":
        return { nodeId: builderNodeOptions[0]?.id ?? "" };
      default:
        return {};
    }
  }

  function cloneRuntimeActionConfig(config: Record<string, unknown>): Record<string, unknown> {
    return JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
  }

  function createConditionalRuleGroupKey(rule: ConditionalRule) {
    return [rule.whenFieldId, rule.operator, rule.expectedValue ?? ""].join("::");
  }

  function buildConditionalRuleGroups(rules: ConditionalRule[]) {
    const groups = new Map<string, ConditionalRuleGroup>();
    rules.forEach((rule, index) => {
      const sourceFieldLabel = builderFieldOptions.find((option) => option.id === rule.whenFieldId)?.label ?? "Choose field";
      const key = createConditionalRuleGroupKey(rule);
      const existing = groups.get(key);
      const conditionTitle = rule.operator === "exists" ? "Has any value" : formatLabel(rule.operator);
      const conditionDetail =
        rule.operator === "exists"
          ? `${sourceFieldLabel} has any value`
          : `${sourceFieldLabel} ${rule.operator.replaceAll("_", " ")} ${rule.expectedValue ? `"${rule.expectedValue}"` : "a value"}`;
      if (existing) {
        existing.members.push({ rule, index });
        existing.effectsSummary = existing.members.map((member) => formatLabel(member.rule.effect)).join(" + ");
        return;
      }
      groups.set(key, {
        key,
        sourceFieldLabel,
        conditionTitle,
        conditionDetail,
        effectsSummary: formatLabel(rule.effect),
        members: [{ rule, index }],
      });
    });
    return Array.from(groups.values());
  }

  function openSourceReference(mode: "all" | "matches" = "all") {
    if (!sourceContextDraft) {
      setMessage("No imported source context is available for this project.");
      return;
    }
    if (isPdfBackedProject && !sourceReferenceCanOpen) {
      setMessage("Select imported content with provenance or review retained import issues before opening source compare.");
      return;
    }
    setSourceReferenceFilterMode(mode === "matches" && sourceReferenceFocusHasMatches ? "matches" : "all");
    setSourceDrawerOpen(true);
    setWorkspaceLandingMode(null);
  }

  function resolveSelectionForSourceTarget(
    targetKind: SourceReferenceTargetKind,
    page: PageNode,
    section?: SectionNode,
    group?: GroupNode,
    field?: FieldNode,
  ): AuthoringSelection | null {
    if (!activeDocument) {
      return null;
    }
    const matches =
      targetKind === "field" && field
        ? collectImportedFieldSourceReferenceMatchState(field)
        : targetKind === "group" && group
          ? collectImportedGroupSourceReferenceMatchState(group)
          : targetKind === "section" && section
            ? collectImportedSectionSourceReferenceMatchState(section)
            : collectImportedPageSourceReferenceMatchState(page);
    const preferredKinds: AuthoringSelection["kind"][] =
      targetKind === "field"
        ? ["field", "group", "section", "step"]
        : targetKind === "group"
          ? ["group", "field", "section", "step"]
          : targetKind === "section"
            ? ["section", "group", "field", "step"]
            : ["step", "section", "group", "field"];
    return resolveAuthoringSelectionFromSourceReference(activeDocument, matches, preferredKinds);
  }

  function focusAuthoringSelectionFromSource(
    targetKind: SourceReferenceTargetKind,
    page: PageNode,
    section?: SectionNode,
    group?: GroupNode,
    field?: FieldNode,
  ) {
    const nextSelection = resolveSelectionForSourceTarget(targetKind, page, section, group, field);
    if (!nextSelection) {
      return;
    }
    setSelectedAuthoring(nextSelection);
    setWorkspaceLandingMode(null);
    setSourceDrawerOpen(true);
  }

  function applyProjectDetail(detail: AuthoringProjectDetail) {
    startTransition(() => {
      setActiveProjectDetail(detail);
      setProjects((current) => {
        const next = current.filter((project) => project.id !== detail.project.id);
        return [detail.project, ...next];
      });
      setActiveProjectId(detail.project.id);
    });
  }

  function updateAuthoringDocument(
    mutate: (document: AuthoringDocument) => void,
    nextSelection?: AuthoringSelection | null,
  ) {
    if (!activeProjectDetail) {
      return;
    }
    const nextDocument = cloneDocument(activeProjectDetail.document);
    mutate(nextDocument);
    setProjectDirty(true);
    startTransition(() => {
      setActiveProjectDetail({
        ...activeProjectDetail,
        document: nextDocument,
        project: {
          ...activeProjectDetail.project,
          name: nextDocument.title,
        },
      });
      if (nextSelection !== undefined) {
        setSelectedAuthoring(nextSelection);
      }
    });
  }

  function invokeRuntimeAction(action: RuntimeActionDefinition) {
    const nextState = runtimeEngineRef.current.invoke(action);
    runtimeSessionRef.current = nextState;
    setRuntimeSessionState(nextState);
  }

  function dispatchRuntimeEvent(event: RuntimeEventEnvelope) {
    const nextState = runtimeEngineRef.current.dispatch(event);
    runtimeSessionRef.current = nextState;
    setRuntimeSessionState(nextState);
  }

  function handleRuntimeFieldValueChange(field: AuthoringField, nextValue: unknown) {
    if (!activeDocument) {
      return;
    }
    const shouldRevalidate =
      runtimeSessionRef.current !== null &&
      (!runtimeSessionRef.current.validation.valid || runtimeSessionRef.current.submit.status !== "idle");

    let nextState = runtimeEngineRef.current.dispatch({
      type: "field.change",
      version: "1.0",
      source: {
        runtimeId: "builder-preview",
        formId: activeDocument.id,
        projectId: activeProjectDetail?.project.id ?? null,
        nodeId: field.id,
        nodeType: "field",
      },
      payload: {
        fieldId: field.id,
        nextValue,
      },
      correlationId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    });

    if (shouldRevalidate) {
      runtimeEngineRef.current.validate();
      nextState = runtimeEngineRef.current.getState();
      if (nextState.submit.status !== "idle") {
        nextState = runtimeEngineRef.current.setState({
          submit: {
            status: "idle",
            lastCorrelationId: null,
            message: null,
            fieldErrors: null,
          },
        });
      }
      if (nextState.validation.valid) {
        setErrorMessage((current) =>
          current === "Complete the required fields in this runtime preview before submitting." ? null : current,
        );
      }
    }

    runtimeSessionRef.current = nextState;
    setRuntimeSessionState(nextState);
  }

  function runtimeNodeStateForField(field: AuthoringField): RuntimeNodeState | null {
    return runtimeSessionState?.nodes[field.id] ?? null;
  }

  function handleRuntimeButtonClick(field: AuthoringField) {
    dispatchRuntimeEvent({
      type: "component.click",
      version: "1.0",
      source: {
        runtimeId: "builder-preview",
        formId: activeDocument?.id ?? "unknown-form",
        projectId: activeProjectDetail?.project.id ?? null,
        nodeId: field.id,
        nodeType: "component",
      },
      payload: {
        componentId: field.id,
        label: field.label,
        stepId: activeStep?.id ?? null,
      },
      correlationId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    });
  }

  async function handleImportRuntimeSession(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as Partial<RuntimeSessionState>;
      const nextState = runtimeEngineRef.current.setState(parsed);
      runtimeSessionRef.current = nextState;
      setRuntimeSessionState(nextState);
      if (nextState.currentStepId) {
        setSelectedAuthoring((current) => current ?? { kind: "step", stepId: nextState.currentStepId! });
      }
      setMessage("Runtime session state loaded into the preview.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to import runtime session state.");
    } finally {
      if (runtimeSessionInputRef.current) {
        runtimeSessionInputRef.current.value = "";
      }
    }
  }

  function handleExportRuntimeSession() {
    if (!runtimeSessionState) {
      setErrorMessage("No runtime session state is available to export.");
      return;
    }
    const projectName = activeProjectDetail?.project.name ?? activeDocument?.title ?? "runtime-session";
    downloadJsonFile(`${slugify(projectName)}-runtime-session.json`, runtimeSessionState);
    setMessage("Runtime session state exported.");
  }

  function handleResetRuntimeSession() {
    if (!activeDocument) {
      return;
    }
    const initialSelectionStepId =
      selectedAuthoring?.stepId && activeDocument.steps.some((step) => step.id === selectedAuthoring.stepId)
        ? selectedAuthoring.stepId
        : activeDocument.steps[0]?.id ?? null;

    const nextState = runtimeEngineRef.current.mount(activeDocument, {
      projectId: activeProjectDetail?.project.id ?? null,
      initialSessionState: { currentStepId: initialSelectionStepId },
      hostContext: {
        environment: "builder-preview",
        session: { projectId: activeProjectDetail?.project.id ?? null },
        auth: {},
        app: { stage: "builder" },
        data: {},
      },
    });
    runtimeSessionRef.current = nextState;
    setRuntimeSessionState(nextState);
    setMessage("Simulator session reset to the current authored step.");
  }

  function handleMockSubmitSuccess() {
    if (!activeDocument) {
      return;
    }
    dispatchRuntimeEvent({
      type: "form.submit_success",
      version: "1.0",
      source: {
        runtimeId: "builder-preview",
        formId: activeDocument.id,
        projectId: activeProjectDetail?.project.id ?? null,
        nodeId: activeDocument.id,
        nodeType: "form",
      },
      payload: {
        message: "Mock host success received.",
        submissionId: crypto.randomUUID(),
      },
      correlationId: runtimeSessionState?.submit.lastCorrelationId ?? crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    });
  }

  function handleMockSubmitError() {
    if (!activeDocument) {
      return;
    }
    dispatchRuntimeEvent({
      type: "form.submit_error",
      version: "1.0",
      source: {
        runtimeId: "builder-preview",
        formId: activeDocument.id,
        projectId: activeProjectDetail?.project.id ?? null,
        nodeId: activeDocument.id,
        nodeType: "form",
      },
      payload: {
        message: "Mock host error received.",
        fieldErrors: {},
      },
      correlationId: runtimeSessionState?.submit.lastCorrelationId ?? crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    });
  }

  function handlePopulateRequiredRuntimeValues() {
    if (!activeDocument || !runtimeSessionState) {
      return;
    }

    const nextValues = { ...runtimeSessionState.values };
    for (const step of activeDocument.steps) {
      for (const section of step.sections) {
        for (const field of section.fields) {
          if (!field.required) {
            continue;
          }
          if (nextValues[field.id] === undefined || nextValues[field.id] === null || nextValues[field.id] === "") {
            const seed = defaultRuntimeFieldValue(field);
            if (seed !== undefined) {
              nextValues[field.id] = seed;
            }
          }
        }
        for (const group of section.groups) {
          for (const field of group.fields) {
            if (!field.required) {
              continue;
            }
            if (nextValues[field.id] === undefined || nextValues[field.id] === null || nextValues[field.id] === "") {
              const seed = defaultRuntimeFieldValue(field);
              if (seed !== undefined) {
                nextValues[field.id] = seed;
              }
            }
          }
        }
      }
    }

    const nextState = runtimeEngineRef.current.setState({ values: nextValues });
    runtimeSessionRef.current = nextState;
    setRuntimeSessionState(nextState);
    setMessage("Required runtime fields were seeded with sample values for roundtrip testing.");
  }

  function handleRunCurrentRuntimeStep() {
    if (!activeStep) {
      return;
    }
    const nextState = runtimeEngineRef.current.invoke({
      id: `simulator_go_to_step_${activeStep.id}`,
      kind: "go_to_step",
      target: {
        nodeId: activeStep.id,
        nodeType: "step",
      },
      config: {
        stepId: activeStep.id,
      },
      continueOnError: false,
    });
    runtimeSessionRef.current = nextState;
    setRuntimeSessionState(nextState);
    setMessage(`Simulator focused ${activeStep.title}.`);
  }

  function handleRunRuntimeSubmit() {
    if (!activeDocument) {
      return;
    }
    const nextState = runtimeEngineRef.current.invoke({
      id: `simulator_submit_${activeDocument.id}`,
      kind: "submit_form",
      target: {
        nodeId: activeDocument.id,
        nodeType: "form",
      },
      config: {},
      continueOnError: false,
    });
    runtimeSessionRef.current = nextState;
    setRuntimeSessionState(nextState);
  }

  function updateRuntimeScope(
    mutate: (
      runtime: RuntimeNodeBehavior | RuntimeDocumentBehavior,
      scopeKind: RuntimeEditorScope["scopeKind"],
      field?: AuthoringField,
    ) => void,
  ) {
    if (!activeDocument) {
      return;
    }
    updateAuthoringDocument((document) => {
      if (selectedAuthoring === null) {
        const runtime = document.runtime ?? (document.runtime = createRuntimeDocumentBehavior());
        mutate(runtime, "form");
        return;
      }

      if (selectedAuthoring.kind === "step") {
        const step = document.steps.find((candidate) => candidate.id === selectedAuthoring.stepId);
        if (step) {
          step.runtime ??= createRuntimeNodeBehavior();
          mutate(step.runtime, "step");
        }
        return;
      }

      const step = document.steps.find((candidate) => candidate.id === selectedAuthoring.stepId);
      const section = step?.sections.find((candidate) => candidate.id === selectedAuthoring.sectionId);
      if (!section) {
        return;
      }

      if (selectedAuthoring.kind === "section") {
        section.runtime ??= createRuntimeNodeBehavior();
        mutate(section.runtime, "section");
        return;
      }

      if (selectedAuthoring.kind === "group") {
        const group = section.groups.find((candidate) => candidate.id === selectedAuthoring.groupId);
        if (group) {
          group.runtime ??= createRuntimeNodeBehavior();
          mutate(group.runtime, "group");
        }
        return;
      }

      const field = selectedAuthoring.groupId
        ? section.groups.find((candidate) => candidate.id === selectedAuthoring.groupId)?.fields.find((candidate) => candidate.id === selectedAuthoring.fieldId)
        : section.fields.find((candidate) => candidate.id === selectedAuthoring.fieldId);
      if (field) {
        field.runtime ??= createRuntimeNodeBehavior();
        mutate(field.runtime, field.rendererHints.component === "button" ? "component" : "field", field);
      }
    }, selectedAuthoring);
  }

  function addRuntimeListener(listener: RuntimeListenerDefinition) {
    updateRuntimeScope((runtime, scopeKind, field) => {
      if (scopeKind === "form") {
        const formRuntime = runtime as RuntimeDocumentBehavior;
        const nodeId = activeDocument?.id;
        ensureUniqueEventSource(formRuntime.formEvents, listener.eventName, activeRuntimeScope ?? {
          scopeKind: "form",
          label: activeDocument?.title ?? "Form",
          description: "",
          eventSources: formRuntime.formEvents,
          listeners: formRuntime.formListeners,
        }, nodeId);
        formRuntime.formListeners.push(listener);
      } else {
        const nodeRuntime = runtime as RuntimeNodeBehavior;
        const nodeId =
          selectedAuthoring?.kind === "field"
            ? selectedAuthoring.fieldId
            : selectedAuthoring?.kind === "group"
              ? selectedAuthoring.groupId
              : selectedAuthoring?.kind === "section"
                ? selectedAuthoring.sectionId
                : selectedAuthoring?.kind === "step"
                  ? selectedAuthoring.stepId
                  : undefined;
        if (activeRuntimeScope) {
          ensureUniqueEventSource(nodeRuntime.eventSources, listener.eventName, activeRuntimeScope, nodeId);
        }
        nodeRuntime.listeners.push(listener);
        if (field?.rendererHints.component === "button") {
          const firstAction = listener.actions[0];
          if (firstAction?.kind === "go_to_previous_step") {
            field.rendererHints.action = "previous_step";
            field.rendererHints.eventName = "";
          } else if (firstAction?.kind === "submit_form") {
            field.rendererHints.action = "submit";
            field.rendererHints.eventName = "";
          } else if (firstAction?.kind === "emit_event") {
            field.rendererHints.action = "custom_event";
            field.rendererHints.eventName = String(firstAction.config.eventName ?? "custom.event");
          } else {
            field.rendererHints.action = "next_step";
            field.rendererHints.eventName = "";
          }
        }
      }
    });
    pendingBehaviorFocusRef.current = `listener:${listener.id}`;
    setSelectedBehaviorNode({
      kind: "listener",
      listenerId: listener.id,
      phase: listener.actions.length ? "action" : "trigger",
      actionId: listener.actions[0]?.id,
    });
  }

  function updateRuntimeListener(listenerId: string, mutate: (listener: RuntimeListenerDefinition) => void) {
    updateRuntimeScope((runtime, scopeKind) => {
      const listeners = scopeKind === "form" ? (runtime as RuntimeDocumentBehavior).formListeners : (runtime as RuntimeNodeBehavior).listeners;
      const listener = listeners.find((candidate) => candidate.id === listenerId);
      if (listener) {
        mutate(listener);
      }
    });
  }

  function mutableRuntimeListenersForSelection(
    document: AuthoringDocument,
    selection: AuthoringSelection | null,
  ): RuntimeListenerDefinition[] | null {
    if (selection === null) {
      document.runtime ??= createRuntimeDocumentBehavior();
      return document.runtime.formListeners;
    }

    const context = getSelectionContext(document, selection);
    if (selection.kind === "step" && context.step) {
      context.step.runtime ??= createRuntimeNodeBehavior();
      return context.step.runtime.listeners;
    }
    if (selection.kind === "section" && context.section) {
      context.section.runtime ??= createRuntimeNodeBehavior();
      return context.section.runtime.listeners;
    }
    if (selection.kind === "group" && context.group) {
      context.group.runtime ??= createRuntimeNodeBehavior();
      return context.group.runtime.listeners;
    }
    if (selection.kind === "field" && context.field) {
      context.field.runtime ??= createRuntimeNodeBehavior();
      return context.field.runtime.listeners;
    }
    return null;
  }

  function toggleConditionalRuleForSelection(selection: AuthoringSelection, ruleId: string) {
    let nextEnabled: boolean | null = null;
    updateAuthoringDocument((document) => {
      const field = getSelectionContext(document, selection).field;
      const rule = field?.conditionals.find((candidate) => candidate.ruleId === ruleId);
      if (!rule) {
        return;
      }
      nextEnabled = !isConditionalRuleEnabled(rule);
      setConditionalRuleEnabled(rule, nextEnabled);
    }, selection);
    if (nextEnabled !== null) {
      setMessage(`Rule ${nextEnabled ? "enabled" : "disabled"}.`);
    }
  }

  function duplicateConditionalRuleForSelection(selection: AuthoringSelection, ruleId: string) {
    const nextRuleId = crypto.randomUUID();
    let duplicated = false;
    updateAuthoringDocument((document) => {
      const field = getSelectionContext(document, selection).field;
      const ruleIndex = field?.conditionals.findIndex((candidate) => candidate.ruleId === ruleId) ?? -1;
      if (!field || ruleIndex < 0) {
        return;
      }
      field.conditionals.splice(ruleIndex + 1, 0, {
        ...field.conditionals[ruleIndex],
        ruleId: nextRuleId,
      });
      duplicated = true;
    }, selection);
    if (!duplicated) {
      return;
    }
    pendingBehaviorFocusRef.current = `rule:${nextRuleId}`;
    setSelectedBehaviorNode({ kind: "rule", ruleId: nextRuleId, phase: "condition" });
    setExpandedBehaviorIndexObjectKey(`rule:${nextRuleId}`);
    setMessage("Rule duplicated.");
  }

  function removeConditionalRuleForSelection(selection: AuthoringSelection, ruleId: string) {
    updateAuthoringDocument((document) => {
      const field = getSelectionContext(document, selection).field;
      if (!field) {
        return;
      }
      field.conditionals = field.conditionals.filter((rule) => rule.ruleId !== ruleId);
    }, selection);
    setEditingRuleIndex(null);
    setExpandedBehaviorIndexObjectKey((current) => (current === `rule:${ruleId}` ? null : current));
    setSelectedBehaviorNode((current) => (current?.kind === "rule" && current.ruleId === ruleId ? null : current));
    setMessage("Rule deleted.");
  }

  function toggleRuntimeListenerForSelection(selection: AuthoringSelection | null, listenerId: string) {
    let nextEnabled: boolean | null = null;
    updateAuthoringDocument((document) => {
      const listeners = mutableRuntimeListenersForSelection(document, selection);
      const listener = listeners?.find((candidate) => candidate.id === listenerId);
      if (!listener) {
        return;
      }
      listener.enabled = !listener.enabled;
      nextEnabled = listener.enabled;
    }, selection);
    if (nextEnabled !== null) {
      setMessage(`Flow ${nextEnabled ? "enabled" : "disabled"}.`);
    }
  }

  function duplicateRuntimeListenerForSelection(selection: AuthoringSelection | null, listenerId: string) {
    const nextListenerId = crypto.randomUUID();
    let firstActionId: string | undefined;
    let duplicated = false;
    updateAuthoringDocument((document) => {
      const listeners = mutableRuntimeListenersForSelection(document, selection);
      const listenerIndex = listeners?.findIndex((candidate) => candidate.id === listenerId) ?? -1;
      if (!listeners || listenerIndex < 0) {
        return;
      }
      const sourceListener = listeners[listenerIndex];
      const actions = sourceListener.actions.map((action) => {
        const duplicate = createRuntimeAction(action.kind, cloneRuntimeActionConfig(action.config));
        duplicate.label = action.label;
        duplicate.target = action.target ? structuredClone(action.target) : action.target;
        duplicate.continueOnError = action.continueOnError;
        return duplicate;
      });
      firstActionId = actions[0]?.id;
      listeners.splice(listenerIndex + 1, 0, {
        ...sourceListener,
        id: nextListenerId,
        ruleGuards: sourceListener.ruleGuards.map((guard) => ({ ...guard })),
        actions,
      });
      duplicated = true;
    }, selection);
    if (!duplicated) {
      return;
    }
    pendingBehaviorFocusRef.current = `listener:${nextListenerId}`;
    setSelectedBehaviorNode({
      kind: "listener",
      listenerId: nextListenerId,
      phase: firstActionId ? "action" : "trigger",
      actionId: firstActionId,
    });
    setExpandedBehaviorIndexObjectKey(`flow:${nextListenerId}`);
    setMessage("Flow duplicated.");
  }

  function removeRuntimeListenerForSelection(selection: AuthoringSelection | null, listenerId: string) {
    updateAuthoringDocument((document) => {
      const listeners = mutableRuntimeListenersForSelection(document, selection);
      const listenerIndex = listeners?.findIndex((candidate) => candidate.id === listenerId) ?? -1;
      if (listeners && listenerIndex >= 0) {
        listeners.splice(listenerIndex, 1);
      }
    }, selection);
    setExpandedBehaviorIndexObjectKey((current) => (current === `flow:${listenerId}` ? null : current));
    setSelectedBehaviorNode((current) => (current?.kind === "listener" && current.listenerId === listenerId ? null : current));
    setMessage("Flow deleted.");
  }

  function addRuntimeActionToListener(listenerId: string, kind: RuntimeActionKind = "emit_event") {
    let nextActionId: string | null = null;
    updateRuntimeListener(listenerId, (listener) => {
      const nextAction = createRuntimeAction(kind, defaultRuntimeActionConfigForScope(kind, { listener }));
      nextActionId = nextAction.id;
      listener.actions.push(nextAction);
    });
    if (!nextActionId) {
      return;
    }
    pendingBehaviorFocusRef.current = `listener:${listenerId}`;
    setSelectedBehaviorNode({
      kind: "listener",
      listenerId,
      phase: "action",
      actionId: nextActionId,
    });
  }

  function updateRuntimeAction(listenerId: string, actionId: string, mutate: (action: RuntimeActionDefinition) => void) {
    updateRuntimeListener(listenerId, (listener) => {
      const action = listener.actions.find((candidate) => candidate.id === actionId);
      if (action) {
        mutate(action);
      }
    });
  }

  function removeRuntimeAction(listenerId: string, actionId: string) {
    updateRuntimeListener(listenerId, (listener) => {
      const actionIndex = listener.actions.findIndex((candidate) => candidate.id === actionId);
      if (actionIndex >= 0) {
        listener.actions.splice(actionIndex, 1);
      }
    });
    setRuntimePayloadEditors((current) => {
      const next = { ...current };
      delete next[actionId];
      return next;
    });
    setSelectedBehaviorNode((current) =>
      current?.kind === "listener" && current.listenerId === listenerId && current.actionId === actionId
        ? { kind: "listener", listenerId, phase: "trigger" }
        : current,
    );
  }

  function moveRuntimeAction(listenerId: string, actionId: string, direction: "earlier" | "later") {
    updateRuntimeListener(listenerId, (listener) => {
      const actionIndex = listener.actions.findIndex((candidate) => candidate.id === actionId);
      if (actionIndex < 0) {
        return;
      }
      const targetIndex = direction === "earlier" ? actionIndex - 1 : actionIndex + 1;
      if (targetIndex < 0 || targetIndex >= listener.actions.length) {
        return;
      }
      const [action] = listener.actions.splice(actionIndex, 1);
      listener.actions.splice(targetIndex, 0, action);
    });
    setSelectedBehaviorNode((current) =>
      current?.kind === "listener" && current.listenerId === listenerId && current.actionId === actionId
        ? { ...current, phase: "action", actionId }
        : current,
    );
  }

  function duplicateRuntimeAction(listenerId: string, actionId: string) {
    let nextActionId: string | null = null;
    updateRuntimeListener(listenerId, (listener) => {
      const actionIndex = listener.actions.findIndex((candidate) => candidate.id === actionId);
      if (actionIndex < 0) {
        return;
      }
      const sourceAction = listener.actions[actionIndex];
      const duplicate = createRuntimeAction(sourceAction.kind, cloneRuntimeActionConfig(sourceAction.config));
      nextActionId = duplicate.id;
      listener.actions.splice(actionIndex + 1, 0, duplicate);
    });
    if (!nextActionId) {
      return;
    }
    pendingBehaviorFocusRef.current = `listener:${listenerId}`;
    setSelectedBehaviorNode({
      kind: "listener",
      listenerId,
      phase: "action",
      actionId: nextActionId,
    });
  }

  function insertRuntimeActionAfter(listenerId: string, actionId: string, kind: RuntimeActionKind = "emit_event") {
    let nextActionId: string | null = null;
    updateRuntimeListener(listenerId, (listener) => {
      const actionIndex = listener.actions.findIndex((candidate) => candidate.id === actionId);
      if (actionIndex < 0) {
        return;
      }
      const nextAction = createRuntimeAction(kind, defaultRuntimeActionConfigForScope(kind, { listener }));
      nextActionId = nextAction.id;
      listener.actions.splice(actionIndex + 1, 0, nextAction);
    });
    if (!nextActionId) {
      return;
    }
    pendingBehaviorFocusRef.current = `listener:${listenerId}`;
    setSelectedBehaviorNode({
      kind: "listener",
      listenerId,
      phase: "action",
      actionId: nextActionId,
    });
  }

  function replaceRuntimeActionChain(listenerId: string, createActions: () => RuntimeActionDefinition[], templateLabel: string) {
    const nextActions = createActions();
    let removedActionIds: string[] = [];
    updateRuntimeListener(listenerId, (listener) => {
      removedActionIds = listener.actions.map((action) => action.id);
      listener.actions = nextActions;
    });
    setRuntimePayloadEditors((current) => {
      const next = { ...current };
      removedActionIds.forEach((actionId) => {
        delete next[actionId];
      });
      return next;
    });
    pendingBehaviorFocusRef.current = `listener:${listenerId}`;
    setSelectedBehaviorNode({
      kind: "listener",
      listenerId,
      phase: nextActions.length ? "action" : "trigger",
      actionId: nextActions[0]?.id,
    });
    setMessage(`${templateLabel} chain applied.`);
  }

  const runtimePresets = useMemo<RuntimePreset[]>(() => {
    if (!activeRuntimeScope) {
      return [];
    }
    if (activeRuntimeScope.scopeKind === "component") {
      return [
        {
          id: "button-next",
          label: "Continue to next step",
          description: "Wire this button to the next runtime step.",
          apply: (scope) =>
            createRuntimeListener(
              "component.click",
              [createRuntimeAction("go_to_next_step")],
              selectedAuthoring?.kind === "field" ? selectedAuthoring.fieldId : null,
            ),
        },
        {
          id: "button-previous",
          label: "Go to previous step",
          description: "Use this for back navigation inside the runtime.",
          apply: () =>
            createRuntimeListener(
              "component.click",
              [createRuntimeAction("go_to_previous_step")],
              selectedAuthoring?.kind === "field" ? selectedAuthoring.fieldId : null,
            ),
        },
        {
          id: "button-submit",
          label: "Submit form",
          description: "Validate and emit the host-facing submit event.",
          apply: () =>
            createRuntimeListener(
              "component.click",
              [createRuntimeAction("submit_form")],
              selectedAuthoring?.kind === "field" ? selectedAuthoring.fieldId : null,
            ),
        },
        {
          id: "button-next-emit",
          label: "Continue then emit event",
          description: "Move forward and immediately broadcast a follow-up runtime event.",
          apply: () =>
            createRuntimeListener(
              "component.click",
              [
                createRuntimeAction("go_to_next_step"),
                createRuntimeAction("emit_event", defaultRuntimeActionConfigForScope("emit_event")),
              ],
              selectedAuthoring?.kind === "field" ? selectedAuthoring.fieldId : null,
            ),
        },
        {
          id: "button-emit",
          label: "Emit custom event",
          description: "Fire a named runtime event for the host shell or other listeners.",
          apply: () =>
            createRuntimeListener(
              "component.click",
              [createRuntimeAction("emit_event", defaultRuntimeActionConfigForScope("emit_event"))],
              selectedAuthoring?.kind === "field" ? selectedAuthoring.fieldId : null,
            ),
        },
      ];
    }
    if (activeRuntimeScope.scopeKind === "field") {
      return [
        {
          id: "field-change-event",
          label: "Emit event on change",
          description: "Broadcast a custom event whenever this field changes.",
          apply: () =>
            createRuntimeListener(
              "field.change",
              [createRuntimeAction("emit_event", { eventName: `${activeBuilderField?.stableKey ?? "field"}.changed`, payload: {} })],
              selectedAuthoring?.kind === "field" ? selectedAuthoring.fieldId : null,
            ),
        },
        {
          id: "field-show-node",
          label: "Show another node on change",
          description: "Create a change listener and target another node.",
          apply: () =>
            createRuntimeListener(
              "field.change",
              [createRuntimeAction("show_node", { nodeId: builderNodeOptions[0]?.id ?? "" })],
              selectedAuthoring?.kind === "field" ? selectedAuthoring.fieldId : null,
            ),
        },
        {
          id: "field-set-value",
          label: "Set another field on change",
          description: "Create a change listener that writes into another field.",
          apply: () =>
            createRuntimeListener(
              "field.change",
              [createRuntimeAction("set_field_value", { fieldId: builderFieldOptions[0]?.id ?? "", value: "" })],
              selectedAuthoring?.kind === "field" ? selectedAuthoring.fieldId : null,
            ),
        },
        {
          id: "field-change-host",
          label: "Emit then request host action",
          description: "Broadcast a field event first, then hand the same change context to the host.",
          apply: () =>
            createRuntimeListener(
              "field.change",
              [
                createRuntimeAction("emit_event", { eventName: `${activeBuilderField?.stableKey ?? "field"}.changed`, payload: {} }),
                createRuntimeAction("host_action", defaultRuntimeActionConfigForScope("host_action")),
              ],
              selectedAuthoring?.kind === "field" ? selectedAuthoring.fieldId : null,
            ),
        },
      ];
    }
    if (activeRuntimeScope.scopeKind === "form") {
      return [
        {
          id: "form-load",
          label: "Emit event on load",
          description: "Useful when the host needs a clean runtime-ready signal.",
          apply: () => createRuntimeListener("form.load", [createRuntimeAction("emit_event", { eventName: "form.loaded", payload: {} })]),
        },
        {
          id: "form-submit",
          label: "Emit event on submit",
          description: "Add a follow-up event after the runtime creates the submit payload.",
          apply: () => createRuntimeListener("form.submit", [createRuntimeAction("emit_event", { eventName: "form.submit.dispatched", payload: {} })]),
        },
        {
          id: "form-submit-host",
          label: "Emit then request host action on submit",
          description: "Keep the authored submit event and host handoff together in one reusable chain.",
          apply: () =>
            createRuntimeListener("form.submit", [
              createRuntimeAction("emit_event", { eventName: "form.submit.dispatched", payload: {} }),
              createRuntimeAction("host_action", { handlerKey: "host.audit", payload: {} }),
            ]),
        },
        {
          id: "form-validation",
          label: "Emit event on validation failure",
          description: "Surface a reusable event when submit is blocked.",
          apply: () =>
            createRuntimeListener("form.validation_failed", [createRuntimeAction("emit_event", { eventName: "form.validation_failed", payload: {} })]),
        },
      ];
    }
    return [];
  }, [activeRuntimeScope, activeBuilderField?.stableKey, builderFieldOptions, builderNodeOptions, selectedAuthoring]);

  function createBehaviorStudioAnchor(element: HTMLElement | null): BehaviorStudioAnchor | null {
    if (!element || typeof window === "undefined" || window.innerWidth < 760) {
      return null;
    }
    const rect = element.getBoundingClientRect();
    return {
      bottom: rect.bottom,
      centerX: rect.left + rect.width / 2,
      top: rect.top,
      width: rect.width,
    };
  }

  function behaviorStudioUsesWorkspaceShell() {
    return (
      behaviorStudioMode === "graph" ||
      (behaviorStudioMode === "test" && behaviorStudioView === "advanced" && behaviorStudioAnchor === null) ||
      (behaviorStudioMode === "manage" && behaviorStudioManagerMode === "index" && behaviorStudioAnchor === null)
    );
  }

  function behaviorStudioEstimatedSize() {
    if (typeof window === "undefined") {
      return { width: 768, height: 480 };
    }
    const usesWorkspaceShell = behaviorStudioUsesWorkspaceShell();
    const width =
      behaviorStudioMode === "graph"
        ? 1344
        : behaviorStudioMode === "test" && behaviorStudioView === "advanced" && behaviorStudioAnchor === null
          ? 896
        : usesWorkspaceShell
          ? 1120
          : 752;
    const height =
      behaviorStudioMode === "graph"
        ? window.innerHeight - 32
        : behaviorStudioMode === "test" && behaviorStudioView === "advanced" && behaviorStudioAnchor === null
          ? Math.min(window.innerHeight * 0.74, 620)
        : usesWorkspaceShell
          ? Math.min(window.innerHeight * 0.82, 720)
          : Math.min(window.innerHeight * 0.72, 540);

    return {
      width: Math.min(width, window.innerWidth - 24),
      height: Math.min(height, window.innerHeight - 24),
    };
  }

  function behaviorStudioPositionLayout(): BehaviorStudioPositionLayout {
    if (!behaviorStudioAnchor || behaviorStudioUsesWorkspaceShell() || typeof window === "undefined" || window.innerWidth < 760) {
      return { anchored: false, placement: "center" };
    }
    const shellSize = behaviorStudioEstimatedSize();
    const gutter = 12;
    const gap = 12;
    const arrowInset = 28;
    const spaceBelow = window.innerHeight - behaviorStudioAnchor.bottom - gap - gutter;
    const spaceAbove = behaviorStudioAnchor.top - gap - gutter;
    const placement: BehaviorStudioPlacement = spaceBelow >= shellSize.height || spaceBelow >= spaceAbove ? "below" : "above";
    const left = Math.min(
      Math.max(behaviorStudioAnchor.centerX - shellSize.width / 2, gutter),
      Math.max(gutter, window.innerWidth - shellSize.width - gutter),
    );
    const preferredTop =
      placement === "below"
        ? behaviorStudioAnchor.bottom + gap
        : behaviorStudioAnchor.top - shellSize.height - gap;
    const top = Math.min(Math.max(preferredTop, gutter), Math.max(gutter, window.innerHeight - shellSize.height - gutter));
    const arrowLeft = Math.min(Math.max(behaviorStudioAnchor.centerX - left, arrowInset), shellSize.width - arrowInset);

    return {
      anchored: true,
      arrowStyle: {
        left: arrowLeft,
      },
      dialogStyle: {
        left,
        position: "fixed",
        top,
        transformOrigin: `${arrowLeft}px ${placement === "below" ? "top" : "bottom"}`,
        width: shellSize.width,
      },
      placement,
    };
  }

  function openBehaviorStudio(view: BehaviorStudioView = "studio", mode?: BehaviorStudioMode, anchor: BehaviorStudioAnchor | null = null) {
    behaviorStudioReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setBehaviorStudioView(view);
    setBehaviorStudioAnchor(anchor);
    setBehaviorStudioMode(
      mode ??
        (view === "advanced"
          ? "graph"
          : logicMapData && (logicMapData.totalConditionals > 0 || logicMapData.totalListeners > 0)
            ? "manage"
            : "create"),
    );
    if (view === "advanced") {
      setBehaviorStudioCreationKind(null);
      setBehaviorWorkspaceMode("authoring");
    } else if (!behaviorStudioCreationKind) {
      setBehaviorStudioManagerMode("all");
    }
    setBehaviorStudioOpen(true);
    setInspectorTab("behavior");
  }

  function closeBehaviorStudio() {
    setBehaviorStudioOpen(false);
    setBehaviorFocusTarget(null);
    setBehaviorStudioCreationKind(null);
    setBehaviorStudioAnchor(null);
  }

  function defaultBehaviorTriggerName() {
    if (activeRuntimeScope?.scopeKind === "component") {
      return "component.click";
    }
    if (activeRuntimeScope?.scopeKind === "field") {
      return "field.change";
    }
    if (activeRuntimeScope?.scopeKind === "form") {
      return "form.load";
    }
    if (activeRuntimeScope?.scopeKind === "step") {
      return "step.enter";
    }
    if (activeRuntimeScope?.scopeKind === "section") {
      return "section.enter";
    }
    if (activeRuntimeScope?.scopeKind === "group") {
      return "group.enter";
    }
    return "component.click";
  }

  function openBehaviorRulesManager() {
    setBehaviorStudioCreationKind(null);
    setBehaviorStudioAnchor(null);
    setBehaviorStudioMode("manage");
    setBehaviorStudioManagerMode("index");
    setBehaviorStudioView("studio");
    setBehaviorStudioOpen(true);
    setInspectorTab("behavior");
  }

  function openBehaviorNodeInStudio(node: BehaviorGraphSelection, ruleIndex?: number | null) {
    setBehaviorStudioCreationKind(null);
    setBehaviorStudioAnchor(null);
    setBehaviorStudioManagerMode(node.kind === "rule" ? "rules" : "flows");
    setEditingRuleIndex(node.kind === "rule" ? ruleIndex ?? null : null);
    setSelectedBehaviorNode(node);
    setBehaviorStudioMode("create");
    setBehaviorStudioView("studio");
    setBehaviorStudioOpen(true);
    setInspectorTab("behavior");
  }

  function openBehaviorObjectInRulesManager(options: {
    objectKey?: string | null;
    selection?: AuthoringSelection | null;
    graphSelection?: BehaviorGraphSelection | null;
    ruleIndex?: number | null;
  }) {
    if ("selection" in options) {
      setSelectedAuthoring(options.selection ?? null);
    }
    if ("graphSelection" in options) {
      setSelectedBehaviorNode(options.graphSelection ?? null);
    }
    setEditingRuleIndex(
      options.graphSelection?.kind === "rule" && typeof options.ruleIndex === "number" ? options.ruleIndex : null,
    );
    setBehaviorStudioCreationKind(null);
    setBehaviorStudioManagerMode("index");
    setBehaviorIndexStepFilter("all");
    setBehaviorIndexScopeFilter("all");
    setBehaviorIndexTriggerFilter("all");
    setBehaviorIndexEffectFilter("all");
    setBehaviorIndexStatusFilter("all");
    setBehaviorIndexObjectView("all");
    setExpandedBehaviorIndexObjectKey(options.objectKey ?? null);
    setBehaviorStudioAnchor(null);
    setBehaviorStudioMode("manage");
    setBehaviorStudioView("studio");
    setBehaviorStudioOpen(true);
    setInspectorTab("behavior");
  }

  function runtimeSourceForCurrentSelection() {
    const nodeId =
      selectedAuthoring?.kind === "field"
        ? selectedAuthoring.fieldId
        : selectedAuthoring?.kind === "group"
          ? selectedAuthoring.groupId
          : selectedAuthoring?.kind === "section"
            ? selectedAuthoring.sectionId
            : selectedAuthoring?.kind === "step"
              ? selectedAuthoring.stepId
              : activeDocument?.id ?? "unknown-form";
    const nodeType =
      selectedAuthoring?.kind === "field"
        ? activeBuilderField?.rendererHints.component === "button"
          ? "component"
          : "field"
        : selectedAuthoring?.kind === "group"
          ? "group"
          : selectedAuthoring?.kind === "section"
            ? "section"
            : selectedAuthoring?.kind === "step"
              ? "step"
              : "form";

    return {
      runtimeId: "builder-simulator",
      formId: activeDocument?.id ?? "unknown-form",
      projectId: activeProjectDetail?.project.id ?? null,
      nodeId,
      nodeType,
    } as RuntimeEventEnvelope["source"];
  }

  function handleTestSelectedRule(rule: ConditionalRule | null) {
    if (!activeDocument || !rule) {
      setMessage("Select a rule before running a targeted rule test.");
      return;
    }
    dispatchRuntimeEvent({
      type: "field.change",
      version: "1.0",
      source: {
        runtimeId: "builder-simulator",
        formId: activeDocument.id,
        projectId: activeProjectDetail?.project.id ?? null,
        nodeId: rule.whenFieldId,
        nodeType: "field",
      },
      payload: {
        fieldId: rule.whenFieldId,
        nextValue: rule.expectedValue ?? "",
        testedRuleId: rule.ruleId,
      },
      correlationId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    });
    setSelectedRuntimeEvidenceKey(null);
    setMessage("Test this rule dispatched a field.change event through the simulator.");
  }

  function handleTestSelectedChain(listener: RuntimeListenerDefinition | null) {
    if (!activeDocument || !listener) {
      setMessage("Select a listener or event flow before running a targeted chain test.");
      return;
    }
    dispatchRuntimeEvent({
      type: listener.eventName,
      version: "1.0",
      source: runtimeSourceForCurrentSelection(),
      payload: {
        listenerId: listener.id,
        testOrigin: "behavior_studio",
      },
      correlationId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    });
    setSelectedRuntimeEvidenceKey(null);
    setMessage(`Test this chain dispatched ${listener.eventName}.`);
  }

  function beginBehaviorStudioCreation(kind: BehaviorStudioCreationKind, anchor: BehaviorStudioAnchor | null = null) {
    setBehaviorStudioCreationKind(kind);
    setSelectedBehaviorNode(null);
    setEditingRuleIndex(null);
    setBehaviorFocusTarget(null);
    setBehaviorStudioManagerMode("all");
    openBehaviorStudio("studio", "create", anchor);
  }

  function openBehaviorStudioRule() {
    beginBehaviorStudioCreation("rule");
  }

  function openBehaviorStudioListener(seedAction: "listener" | "event") {
    beginBehaviorStudioCreation(seedAction === "event" ? "event" : "listener");
  }

  function runtimeActionChainTemplatesForListener(listener: RuntimeListenerDefinition): RuntimeActionChainTemplate[] {
    const templates: RuntimeActionChainTemplate[] = [
      {
        id: `${listener.id}-emit-host`,
        label: "Emit then request host action",
        description: "Broadcast a runtime event first, then pass the resolved payload to a host handler.",
        createActions: () => [
          createRuntimeAction("emit_event", defaultRuntimeActionConfigForScope("emit_event", { listener })),
          createRuntimeAction("host_action", defaultRuntimeActionConfigForScope("host_action", { listener })),
        ],
      },
    ];
    if (activeRuntimeScope?.scopeKind === "component") {
      templates.unshift({
        id: `${listener.id}-next-emit`,
        label: "Continue then emit event",
        description: "Advance the workflow and immediately fire a follow-up runtime event from the same chain.",
        createActions: () => [
          createRuntimeAction("go_to_next_step"),
          createRuntimeAction("emit_event", defaultRuntimeActionConfigForScope("emit_event", { listener })),
        ],
      });
    }
    if (activeRuntimeScope?.scopeKind === "field") {
      templates.push({
        id: `${listener.id}-show-require`,
        label: "Show then require target node",
        description: "Reveal the target node and mark it required as one grouped reaction to this trigger.",
        createActions: () => [
          createRuntimeAction("show_node", defaultRuntimeActionConfigForScope("show_node", { listener })),
          createRuntimeAction("mark_required", defaultRuntimeActionConfigForScope("mark_required", { listener })),
        ],
      });
    }
    if (activeRuntimeScope?.scopeKind === "form") {
      templates.unshift({
        id: `${listener.id}-submit-audit`,
        label: "Submit dispatch then host audit",
        description: "Keep the authored submit event and host audit request together in one chain.",
        createActions: () => [
          createRuntimeAction("emit_event", { eventName: "form.submit.dispatched", payload: {} }),
          createRuntimeAction("host_action", { handlerKey: "host.audit", payload: {} }),
        ],
      });
    }
    return templates;
  }

  async function handleUpload(file: File, options?: TransitionExecutionOptions) {
    if (!options?.skipDirtyCheck && stage === "workspace" && projectDirty && activeProjectDetail) {
      setPendingWorkspaceTransition({ kind: "upload_pdf", file, fileName: file.name });
      setErrorMessage(null);
      setFlashMessage(null);
      return;
    }
    setSelectedFile(file);
    setErrorMessage(null);
    setFlashMessage(null);
    setIsUploading(true);
    setReviewFlowMode("new_project");
    setNewProjectDialogOpen(false);
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
    }
    const nextPreviewUrl = URL.createObjectURL(file);
    setLocalPreviewUrl(nextPreviewUrl);
    setLocalPreviewConversionId(null);

    try {
      const record = await uploadConversion(file);
      startTransition(() => {
        setConversions((current) => {
          const remaining = current.filter((item) => item.id !== record.id);
          return [record, ...remaining];
        });
        setActiveConversionId(record.id);
        setActiveProjectId(null);
        setActiveProjectDetail(null);
        setProjectRevisions([]);
        setOpenedRevisionView(null);
        setSelectedAuthoring(null);
        setSelectedPageId(record.draft?.pages[0]?.id ?? null);
        setLocalPreviewConversionId(record.id);
      });
      setStage("review");
      setMessage("PDF imported. Review the extraction directly against the source preview.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleCreateBlankProject(options?: TransitionExecutionOptions) {
    if (!options?.skipDirtyCheck && stage === "workspace" && projectDirty && activeProjectDetail) {
      setPendingWorkspaceTransition({ kind: "create_blank_project" });
      setErrorMessage(null);
      setFlashMessage(null);
      return;
    }
    setErrorMessage(null);
    setFlashMessage(null);
    setIsImportingJson(true);
    setNewProjectDialogOpen(false);
    setWorkspaceLandingMode(null);
    try {
      const detail = await importProjectDocument(createBlankAuthoringDocument());
      applyProjectDetail(detail);
      setProjectDirty(false);
      setOpenedRevisionView(null);
      setActiveConversionId(null);
      setSelectedPageId(null);
      setSelectedAuthoring(detail.document.steps[0] ? { kind: "step", stepId: detail.document.steps[0].id } : null);
      setStage("workspace");
      setSourceReferenceFilterMode("all");
      setSourceDrawerOpen(false);
      setProjectDetailsOpen(false);
      setRevisionHistoryOpen(false);
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
        setLocalPreviewUrl(null);
        setLocalPreviewConversionId(null);
      }
      setMessage("Blank project created.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create a blank project.");
    } finally {
      setIsImportingJson(false);
    }
  }

  async function handleOpenJson(file: File, options?: TransitionExecutionOptions) {
    if (!options?.skipDirtyCheck && stage === "workspace" && projectDirty && activeProjectDetail) {
      setPendingWorkspaceTransition({ kind: "open_json", file, fileName: file.name });
      setErrorMessage(null);
      setFlashMessage(null);
      return;
    }
    setSelectedFile(file);
    setErrorMessage(null);
    setFlashMessage(null);
    setIsImportingJson(true);
    setNewProjectDialogOpen(false);
    setOpenProjectDialogOpen(false);
    setWorkspaceLandingMode(null);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const document = importedDocumentFromPayload(parsed);
      if (!document) {
        throw new Error("The selected JSON file does not contain an authoring document.");
      }
      const detail = await importProjectDocument(document);
      applyProjectDetail(detail);
      setProjectDirty(false);
      setOpenedRevisionView(null);
      setActiveConversionId(null);
      setSelectedPageId(null);
      setSelectedAuthoring(detail.document.steps[0] ? { kind: "step", stepId: detail.document.steps[0].id } : null);
      setStage("workspace");
      setSourceReferenceFilterMode("all");
      setSourceDrawerOpen(false);
      setProjectDetailsOpen(false);
      setRevisionHistoryOpen(false);
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
        setLocalPreviewUrl(null);
        setLocalPreviewConversionId(null);
      }
      setMessage("JSON opened directly in the workspace.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "JSON import failed.");
    } finally {
      setIsImportingJson(false);
    }
  }

  async function saveActiveProject(options?: { successMessage?: string }): Promise<boolean> {
    if (!activeProjectDetail) {
      return false;
    }
    if (!projectDirty) {
      return true;
    }
    setIsSavingProject(true);
    try {
      const detail = await saveProjectDocument(activeProjectDetail.project.id, activeProjectDetail.document);
      applyProjectDetail(detail);
      const revisions = await listProjectRevisions(detail.project.id);
      setProjectRevisions(revisions);
      setProjectDirty(false);
      setOpenedRevisionView(null);
      if (options?.successMessage) {
        setMessage(options.successMessage);
      }
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save project.");
      return false;
    } finally {
      setIsSavingProject(false);
    }
  }

  async function performReturnToLatestProjectRevision() {
    if (!activeProjectId) {
      return;
    }
    setIsLoadingRevisionWorkspace(true);
    try {
      const [detail, revisions] = await Promise.all([
        getProject(activeProjectId),
        listProjectRevisions(activeProjectId),
      ]);
      applyProjectDetail(detail);
      setProjectRevisions(revisions);
      setOpenedRevisionView(null);
      setProjectDirty(false);
      setSelectedAuthoring(detail.document.steps[0] ? { kind: "step", stepId: detail.document.steps[0].id } : null);
      setRevisionHistoryOpen(false);
      setProjectDetailsOpen(false);
      setOpenProjectDialogOpen(false);
      setWorkspaceLandingMode(null);
      setMessage("Returned to the latest saved project revision.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to reload the latest project revision.");
    } finally {
      setIsLoadingRevisionWorkspace(false);
    }
  }

  function performOpenRevisionSnapshot(revisionId: string) {
    if (!activeProjectDetail) {
      return;
    }
    const revision = projectRevisions.find((candidate) => candidate.id === revisionId);
    if (!revision) {
      setErrorMessage("Revision snapshot not found.");
      return;
    }
    startTransition(() => {
      setActiveProjectDetail({
        ...activeProjectDetail,
        document: cloneDocument(revision.document),
        project: {
          ...activeProjectDetail.project,
          name: revision.document.title,
        },
      });
      setSelectedAuthoring(revision.document.steps[0] ? { kind: "step", stepId: revision.document.steps[0].id } : null);
      setWorkspaceLandingMode(null);
      setOpenedRevisionView({
        id: revision.id,
        note: revision.note,
        createdAt: revision.createdAt,
      });
    });
    setProjectDirty(true);
    setRevisionHistoryOpen(false);
    setProjectDetailsOpen(false);
    setMessage(`Opened revision snapshot from ${new Date(revision.createdAt).toLocaleString()}. Save to restore it as the current project document.`);
  }

  function performOpenProject(projectId: string, options?: { workspaceLandingMode?: WorkspaceLandingMode | null }) {
    if (projectId === activeProjectId) {
      setOpenProjectDialogOpen(false);
      setProjectDetailsOpen(false);
      setRevisionHistoryOpen(false);
      setWorkspaceLandingMode(options?.workspaceLandingMode ?? null);
      setStage("workspace");
      void performReturnToLatestProjectRevision();
      return;
    }
    setActiveProjectId(projectId);
    setActiveConversionId(null);
    setSelectedPageId(null);
    setSelectedFieldId(null);
    setSelectedAuthoring(null);
    setSourceReferenceFilterMode("all");
    setSourceDrawerOpen(false);
    setOpenProjectDialogOpen(false);
    setProjectDetailsOpen(false);
    setRevisionHistoryOpen(false);
    setWorkspaceLandingMode(options?.workspaceLandingMode ?? null);
    setOpenedRevisionView(null);
    setStage("workspace");
    setErrorMessage(null);
    setFlashMessage(null);
  }

  function performReturnHomeFromWorkspace() {
    setOpenProjectDialogOpen(false);
    setProjectDetailsOpen(false);
    setRevisionHistoryOpen(false);
    setSourceDrawerOpen(false);
    setWorkspaceLandingMode(null);
    setOpenedRevisionView(null);
    setStage("home");
    setErrorMessage(null);
    setFlashMessage(null);
  }

  async function executeWorkspaceTransition(transition: WorkspaceTransitionRequest): Promise<void> {
    if (transition.kind === "open_project") {
      performOpenProject(transition.projectId, { workspaceLandingMode: transition.workspaceLandingMode ?? null });
      return;
    }
    if (transition.kind === "go_home") {
      performReturnHomeFromWorkspace();
      return;
    }
    if (transition.kind === "open_revision") {
      performOpenRevisionSnapshot(transition.revisionId);
      return;
    }
    if (transition.kind === "create_blank_project") {
      await handleCreateBlankProject({ skipDirtyCheck: true });
      return;
    }
    if (transition.kind === "open_json") {
      await handleOpenJson(transition.file, { skipDirtyCheck: true });
      return;
    }
    if (transition.kind === "upload_pdf") {
      await handleUpload(transition.file, { skipDirtyCheck: true });
      return;
    }
    if (transition.kind === "resume_import") {
      const conversion = conversions.find((candidate) => candidate.id === transition.conversionId);
      if (conversion) {
        handleResumeImport(conversion, { skipDirtyCheck: true });
      } else {
        setErrorMessage("Import session not found.");
      }
      return;
    }
    await performReturnToLatestProjectRevision();
  }

  function requestWorkspaceTransition(transition: WorkspaceTransitionRequest) {
    if (stage === "workspace" && projectDirty && activeProjectDetail) {
      setPendingWorkspaceTransition(transition);
      setErrorMessage(null);
      setFlashMessage(null);
      return;
    }
    void executeWorkspaceTransition(transition);
  }

  async function handleConfirmWorkspaceTransitionSave() {
    if (!pendingWorkspaceTransition) {
      return;
    }
    setIsResolvingWorkspaceTransition(true);
    const saved = await saveActiveProject({
      successMessage:
        pendingWorkspaceTransition.kind === "open_project"
          ? "Project saved before switching workspaces."
          : pendingWorkspaceTransition.kind === "go_home"
            ? "Project saved before returning home."
            : pendingWorkspaceTransition.kind === "create_blank_project"
              ? "Project saved before creating the blank workspace."
              : pendingWorkspaceTransition.kind === "open_json"
                ? "Project saved before opening the JSON workspace."
                : pendingWorkspaceTransition.kind === "upload_pdf"
                  ? "Project saved before starting the PDF import."
                  : pendingWorkspaceTransition.kind === "resume_import"
                    ? "Project saved before resuming the import."
            : pendingWorkspaceTransition.kind === "open_revision"
              ? "Project saved before opening the revision snapshot."
              : "Project saved before reloading the latest revision.",
    });
    if (saved) {
      const transition = pendingWorkspaceTransition;
      setPendingWorkspaceTransition(null);
      await executeWorkspaceTransition(transition);
    }
    setIsResolvingWorkspaceTransition(false);
  }

  async function handleConfirmWorkspaceTransitionDiscard() {
    if (!pendingWorkspaceTransition) {
      return;
    }
    setIsResolvingWorkspaceTransition(true);
    const transition = pendingWorkspaceTransition;
    setPendingWorkspaceTransition(null);
    setProjectDirty(false);
    await executeWorkspaceTransition(transition);
    setIsResolvingWorkspaceTransition(false);
  }

  function handleOpenRevisionSnapshot(revisionId: string) {
    requestWorkspaceTransition({ kind: "open_revision", revisionId });
  }

  function handleOpenProject(projectId: string, options?: { workspaceLandingMode?: WorkspaceLandingMode | null }) {
    requestWorkspaceTransition({
      kind: "open_project",
      projectId,
      workspaceLandingMode: options?.workspaceLandingMode ?? null,
    });
  }

  function handleReturnToLatestProjectRevision() {
    requestWorkspaceTransition({ kind: "return_latest_revision" });
  }

  function handleResumeImport(conversion: ConversionRecord, options?: TransitionExecutionOptions) {
    if (!options?.skipDirtyCheck && stage === "workspace" && projectDirty && activeProjectDetail) {
      setPendingWorkspaceTransition({ kind: "resume_import", conversionId: conversion.id });
      setErrorMessage(null);
      setFlashMessage(null);
      return;
    }
    setReviewFlowMode("resume_import");
    setActiveConversionId(conversion.id);
    setActiveProjectId(null);
    setActiveProjectDetail(null);
    setProjectRevisions([]);
    setSelectedPageId(conversion.draft?.pages[0]?.id ?? null);
    setSelectedFieldId(null);
    setSelectedAuthoring(null);
    setSourceReferenceFilterMode("all");
    setSourceDrawerOpen(false);
    setOpenProjectDialogOpen(false);
    setProjectDetailsOpen(false);
    setRevisionHistoryOpen(false);
    setWorkspaceLandingMode(null);
    setOpenedRevisionView(null);
    setStage("review");
    setErrorMessage(null);
    setFlashMessage(null);
  }

  function handleReturnHomeFromReview() {
    setStage("home");
    setSelectedPageId(null);
    setSelectedFieldId(null);
    setSourceReferenceFilterMode("all");
    setWorkspaceLandingMode(null);
    setRevisionHistoryOpen(false);
    setOpenedRevisionView(null);
    setErrorMessage(null);
    setFlashMessage(null);
  }

  function handleReturnHomeFromWorkspace() {
    requestWorkspaceTransition({ kind: "go_home" });
  }

  async function handleReviewUpdate(reviewStatus: ReviewStatus) {
    if (!activeConversion) {
      return;
    }
    setIsSavingReview(true);
    try {
      const updated = await patchConversionReviewStatus(activeConversion.id, reviewStatus);
      startTransition(() => {
        setConversions((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      });
      setMessage(`Marked the conversion as ${formatLabel(reviewStatus)}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update review state.");
    } finally {
      setIsSavingReview(false);
    }
  }

  async function handlePromoteConversion() {
    if (!activeConversion) {
      return;
    }
    if (matchedProjectForActiveConversion) {
      handleOpenProject(matchedProjectForActiveConversion.id, { workspaceLandingMode: "reopened_import" });
      setMessage("Opened the existing project workspace for this import.");
      return;
    }
    setIsPromoting(true);
    try {
      const detail = await promoteConversion(activeConversion.id);
      applyProjectDetail(detail);
      setSelectedAuthoring(detail.document.steps[0] ? { kind: "step", stepId: detail.document.steps[0].id } : null);
      setProjectDirty(false);
      setOpenedRevisionView(null);
      setStage("workspace");
      setSourceReferenceFilterMode("all");
      setSourceDrawerOpen(false);
      setProjectDetailsOpen(false);
      setRevisionHistoryOpen(false);
      setWorkspaceLandingMode("promoted_import");
      setMessage("Review complete. The project workspace is ready, and the imported PDF reference is now available from inside the builder.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to promote project.");
    } finally {
      setIsPromoting(false);
    }
  }

  async function handleSaveProject() {
    if (!activeProjectDetail) {
      return;
    }
    if (!projectDirty) {
      setMessage("Project is already saved.");
      return;
    }
    const saved = await saveActiveProject({
      successMessage: openedRevisionView ? "Revision snapshot restored as the current project document." : "Project saved.",
    });
    if (!saved) {
      return;
    }
  }

  async function handleTogglePublishProject() {
    if (!activeProjectDetail) {
      return;
    }
    setIsPublishingProject(true);
    try {
      let detail = activeProjectDetail;
      if (projectDirty) {
        detail = await saveProjectDocument(activeProjectDetail.project.id, activeProjectDetail.document);
        applyProjectDetail(detail);
        const revisions = await listProjectRevisions(detail.project.id);
        setProjectRevisions(revisions);
        setProjectDirty(false);
        setOpenedRevisionView(null);
      }
      const nextStatus: ProjectStatus = detail.project.status === "published" ? "draft" : "published";
      const updatedDetail = await patchProject(detail.project.id, { status: nextStatus });
      applyProjectDetail(updatedDetail);
      setProjectDetailsOpen(true);
      setMessage(nextStatus === "published" ? "Project marked published." : "Project returned to draft.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update publish state.");
    } finally {
      setIsPublishingProject(false);
    }
  }

  async function handleDeleteConversion(conversionId: string) {
    try {
      await deleteConversion(conversionId);
      startTransition(() => {
        const remaining = conversions.filter((conversion) => conversion.id !== conversionId);
        setConversions(remaining);
        setActiveConversionId((current) => (current === conversionId ? (remaining[0]?.id ?? null) : current));
      });
      setMessage("Conversion removed.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to remove conversion.");
    }
  }

  async function handleClearConversions() {
    setIsClearingHistory(true);
    try {
      const deleted = await clearConversions();
      startTransition(() => {
        setConversions([]);
        setActiveConversionId(null);
        setSelectedPageId(null);
      });
      setMessage(`Cleared ${deleted} conversion${deleted === 1 ? "" : "s"}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to clear conversions.");
    } finally {
      setIsClearingHistory(false);
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      void handleUpload(file);
    }
    event.target.value = "";
  }

  function onJsonFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      void handleOpenJson(file);
    }
    event.target.value = "";
  }

  function onDropImport(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void handleUpload(file);
    }
  }

  function handleAddStep() {
    const nextStep = createStep((activeDocument?.steps.length ?? 0) + 1);
    updateAuthoringDocument((document) => {
      document.steps.push(nextStep);
    }, { kind: "step", stepId: nextStep.id });
  }

  function handleAddSectionToStep(stepId: string) {
    const nextSection = createSection();
    updateAuthoringDocument((document) => {
      const step = document.steps.find((candidate) => candidate.id === stepId);
      step?.sections.push(nextSection);
    }, { kind: "section", stepId, sectionId: nextSection.id });
  }

  function handleAddGroupToSection(stepId: string, sectionId: string) {
    const nextGroup = createGroup();
    updateAuthoringDocument((document) => {
      const step = document.steps.find((candidate) => candidate.id === stepId);
      const section = step?.sections.find((candidate) => candidate.id === sectionId);
      section?.groups.push(nextGroup);
    }, { kind: "group", stepId, sectionId, groupId: nextGroup.id });
  }

  function handleAddField(container: "section" | "group") {
    if (!activeSection) {
      return;
    }
    if (container === "group" && activeGroup) {
      handleAddFieldToContainer(activeStep!.id, activeSection.id, activeGroup.id);
      return;
    }
    handleAddFieldToContainer(activeStep!.id, activeSection.id);
  }

  function handleAddFieldToContainer(stepId: string, sectionId: string, groupId?: string) {
    const nextField = createField();
    updateAuthoringDocument((document) => {
      const step = document.steps.find((candidate) => candidate.id === stepId);
      const section = step?.sections.find((candidate) => candidate.id === sectionId);
      if (!section) {
        return;
      }
      if (groupId) {
        const group = section.groups.find((candidate) => candidate.id === groupId);
        group?.fields.push(nextField);
        return;
      }
      section.fields.push(nextField);
    }, {
      kind: "field",
      stepId,
      sectionId,
      ...(groupId ? { groupId } : {}),
      fieldId: nextField.id,
    });
  }

  function handleRemoveStep(stepId: string) {
    if (!activeDocument) {
      return;
    }
    const index = activeDocument.steps.findIndex((step) => step.id === stepId);
    const nextStep = activeDocument.steps[index + 1] ?? activeDocument.steps[index - 1] ?? null;
    updateAuthoringDocument((document) => {
      const currentIndex = document.steps.findIndex((step) => step.id === stepId);
      if (currentIndex >= 0) {
        document.steps.splice(currentIndex, 1);
      }
    }, nextStep ? { kind: "step", stepId: nextStep.id } : null);
  }

  function handleRemoveSection(stepId: string, sectionId: string) {
    const step = activeDocument?.steps.find((candidate) => candidate.id === stepId);
    const index = step?.sections.findIndex((section) => section.id === sectionId) ?? -1;
    const nextSection = index >= 0 ? step?.sections[index + 1] ?? step?.sections[index - 1] ?? null : null;
    updateAuthoringDocument((document) => {
      const currentStep = document.steps.find((candidate) => candidate.id === stepId);
      const currentIndex = currentStep?.sections.findIndex((section) => section.id === sectionId) ?? -1;
      if (currentStep && currentIndex >= 0) {
        currentStep.sections.splice(currentIndex, 1);
      }
    }, nextSection ? { kind: "section", stepId, sectionId: nextSection.id } : { kind: "step", stepId });
  }

  function handleRemoveGroup(stepId: string, sectionId: string, groupId: string) {
    const section = activeDocument?.steps.find((candidate) => candidate.id === stepId)?.sections.find((candidate) => candidate.id === sectionId);
    const index = section?.groups.findIndex((group) => group.id === groupId) ?? -1;
    const nextGroup = index >= 0 ? section?.groups[index + 1] ?? section?.groups[index - 1] ?? null : null;
    updateAuthoringDocument((document) => {
      const currentSection = document.steps.find((candidate) => candidate.id === stepId)?.sections.find((candidate) => candidate.id === sectionId);
      const currentIndex = currentSection?.groups.findIndex((group) => group.id === groupId) ?? -1;
      if (currentSection && currentIndex >= 0) {
        currentSection.groups.splice(currentIndex, 1);
      }
    }, nextGroup ? { kind: "group", stepId, sectionId, groupId: nextGroup.id } : { kind: "section", stepId, sectionId });
  }

  function handleRemoveField(stepId: string, sectionId: string, fieldId: string, groupId?: string) {
    const section = activeDocument?.steps.find((candidate) => candidate.id === stepId)?.sections.find((candidate) => candidate.id === sectionId);
    const fields = groupId ? section?.groups.find((group) => group.id === groupId)?.fields : section?.fields;
    const index = fields?.findIndex((field) => field.id === fieldId) ?? -1;
    const nextField = index >= 0 ? fields?.[index + 1] ?? fields?.[index - 1] ?? null : null;
    updateAuthoringDocument((document) => {
      const currentSection = document.steps.find((candidate) => candidate.id === stepId)?.sections.find((candidate) => candidate.id === sectionId);
      const currentFields = groupId ? currentSection?.groups.find((group) => group.id === groupId)?.fields : currentSection?.fields;
      const currentIndex = currentFields?.findIndex((field) => field.id === fieldId) ?? -1;
      if (currentFields && currentIndex >= 0) {
        currentFields.splice(currentIndex, 1);
      }
    }, nextField ? { kind: "field", stepId, sectionId, ...(groupId ? { groupId } : {}), fieldId: nextField.id } : groupId ? { kind: "group", stepId, sectionId, groupId } : { kind: "section", stepId, sectionId });
  }

  function handleSelectionDragStart(payload: DragPayload) {
    setDragPayload(payload);
    setActiveDropTargetKey(null);
  }

  function clearDragInteraction() {
    setDragPayload(null);
    setActiveDropTargetKey(null);
  }

  function dropTargetKey(target: DropTarget): string {
    switch (target.kind) {
      case "step-list":
        return `step:${target.index}`;
      case "section-list":
        return `section:${target.stepId}:${target.index}`;
      case "group-list":
        return `group:${target.stepId}:${target.sectionId}:${target.index}`;
      case "field-list":
        return `field:${target.stepId}:${target.sectionId}:${target.groupId ?? "section"}:${target.index}`;
    }
  }

  function isCompatibleDropTarget(payload: DragPayload | null, target: DropTarget): boolean {
    if (!payload) {
      return false;
    }
    return (
      (payload.kind === "step" && target.kind === "step-list") ||
      (payload.kind === "section" && target.kind === "section-list") ||
      (payload.kind === "group" && target.kind === "group-list") ||
      (payload.kind === "field" && target.kind === "field-list")
    );
  }

  function dragPayloadLabel(payload: DragPayload | null): string {
    if (!payload) {
      return "item";
    }
    switch (payload.kind) {
      case "step":
        return "step";
      case "section":
        return "section";
      case "group":
        return "group";
      case "field":
        return "field";
    }
  }

  function handleDropZoneDragOver(event: DragEvent<HTMLElement>, target: DropTarget) {
    event.preventDefault();
    if (!isCompatibleDropTarget(dragPayload, target)) {
      return;
    }
    setActiveDropTargetKey(dropTargetKey(target));
  }

  function handleDropZoneDragLeave(target: DropTarget) {
    if (activeDropTargetKey === dropTargetKey(target)) {
      setActiveDropTargetKey(null);
    }
  }

  function handleDropTarget(event: DragEvent<HTMLElement>, target: DropTarget) {
    event.preventDefault();
    if (!dragPayload || !isCompatibleDropTarget(dragPayload, target)) {
      return;
    }
    const payload = dragPayload;
    updateAuthoringDocument((document) => {
      applyDragMove(document, payload, target);
    });
    clearDragInteraction();
  }

  function renderDropMarker(target: DropTarget, options?: { gridSpan?: boolean; label?: string }) {
    if (!dragPayload || !isCompatibleDropTarget(dragPayload, target)) {
      return null;
    }
    const isActive = activeDropTargetKey === dropTargetKey(target);

    return (
      <div
        key={dropTargetKey(target)}
        onDragOver={(event) => handleDropZoneDragOver(event, target)}
        onDragLeave={() => handleDropZoneDragLeave(target)}
        onDrop={(event) => handleDropTarget(event, target)}
        className={`${options?.gridSpan ? "md:col-span-2" : ""} rounded-[0.95rem] px-2 py-1.5`}
      >
        <div
          className={`flex items-center gap-2 rounded-full border border-dashed px-3 py-1.5 transition ${
            isActive ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-300/80 bg-slate-50 text-slate-400"
          }`}
        >
          <span className={`h-1.5 flex-1 rounded-full ${isActive ? "bg-blue-500" : "bg-slate-300"}`} />
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.18em]">
            {options?.label ?? `Insert ${dragPayloadLabel(dragPayload)} here`}
          </span>
          <span className={`h-1.5 flex-1 rounded-full ${isActive ? "bg-blue-500" : "bg-slate-300"}`} />
        </div>
      </div>
    );
  }

  function renderEmptyDropZone(
    target: DropTarget,
    copy: { title: string; description: string; activeTitle?: string },
    options?: { gridSpan?: boolean },
  ) {
    const compatible = isCompatibleDropTarget(dragPayload, target);
    const isActive = compatible && activeDropTargetKey === dropTargetKey(target);
    return (
      <div
        onDragOver={(event) => handleDropZoneDragOver(event, target)}
        onDragLeave={() => handleDropZoneDragLeave(target)}
        onDrop={(event) => handleDropTarget(event, target)}
        className={`${options?.gridSpan ? "md:col-span-2" : ""} rounded-[1.2rem] border border-dashed px-4 py-4 transition ${
          isActive
            ? "border-blue-400 bg-blue-50/80 shadow-[0_14px_28px_rgba(37,99,235,0.10)]"
            : compatible
              ? "border-blue-200 bg-[#f8fbff]"
              : "border-slate-200 bg-slate-50/80"
        }`}
      >
        <p className={`text-sm font-semibold ${isActive ? "text-blue-700" : "text-slate-700"}`}>
          {isActive ? copy.activeTitle ?? `Drop ${dragPayloadLabel(dragPayload)} here` : copy.title}
        </p>
        <p className="mt-1 text-sm leading-6 text-slate-500">{copy.description}</p>
      </div>
    );
  }

  function updateSelectedField(mutator: (field: AuthoringField) => void) {
    if (!selectedAuthoring || selectedAuthoring.kind !== "field") {
      return;
    }
    updateAuthoringDocument((document) => {
      const step = document.steps.find((candidate) => candidate.id === selectedAuthoring.stepId);
      const section = step?.sections.find((candidate) => candidate.id === selectedAuthoring.sectionId);
      if (!section) {
        return;
      }
      const field = selectedAuthoring.groupId
        ? section.groups.find((candidate) => candidate.id === selectedAuthoring.groupId)?.fields.find((candidate) => candidate.id === selectedAuthoring.fieldId)
        : section.fields.find((candidate) => candidate.id === selectedAuthoring.fieldId);
      if (field) {
        mutator(field);
      }
    });
  }

  function renderBuilderFieldCard(stepId: string, sectionId: string, field: AuthoringField, fieldIndex: number, groupId?: string) {
    const selection: AuthoringSelection = {
      kind: "field",
      stepId,
      sectionId,
      ...(groupId ? { groupId } : {}),
      fieldId: field.id,
    };
    const isSelected = selectedAuthoring?.kind === "field" && selectedAuthoring.fieldId === field.id;
    const fieldState = runtimeNodeStateForField(field);
    const isVisible = fieldState?.visible ?? true;
    const isRequired = fieldState?.required ?? field.required;
    const behaviorSummary = summarizeFieldBehavior(field);
    const fieldTone =
      isSelected
        ? "border-blue-300 bg-[#e8f0ff]"
        : !isVisible
          ? "border-slate-200 bg-slate-100/70"
          : isRequired
            ? "border-rose-300 bg-rose-50/60"
            : "border-soft bg-slate-50";

    return (
      <div
        key={field.id}
        draggable
        onDragStart={() =>
          handleSelectionDragStart({
            kind: "field",
            stepId,
            sectionId,
            ...(groupId ? { groupId } : {}),
            fieldId: field.id,
          })
        }
        onDragEnd={clearDragInteraction}
        onDragOver={(event) => handleDropZoneDragOver(event, {
          kind: "field-list",
          stepId,
          sectionId,
          ...(groupId ? { groupId } : {}),
          index: fieldIndex,
        })}
        onDragLeave={() =>
          handleDropZoneDragLeave({
            kind: "field-list",
            stepId,
            sectionId,
            ...(groupId ? { groupId } : {}),
            index: fieldIndex,
          })}
        onDrop={(event) =>
          handleDropTarget(event, {
            kind: "field-list",
            stepId,
            sectionId,
            ...(groupId ? { groupId } : {}),
            index: fieldIndex,
          })
        }
        onClick={(event) => {
          event.stopPropagation();
          setSelectedAuthoring(selection);
        }}
        className={`rounded-[1.1rem] border p-4 text-left ${fieldTone}`}
      >
        {isSelected ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            {renderBehaviorQuickToolbar({ compact: true, stopPropagation: true, label: "Behavior" })}
          </div>
        ) : null}
        {behaviorSummary.ruleCount || behaviorSummary.flowCount ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {behaviorSummary.ruleCount ? <span className="app-pill">{behaviorSummary.ruleCount} rule{behaviorSummary.ruleCount === 1 ? "" : "s"}</span> : null}
            {behaviorSummary.flowCount ? <span className="app-pill">{behaviorSummary.flowCount} flow{behaviorSummary.flowCount === 1 ? "" : "s"}</span> : null}
          </div>
        ) : null}
        <RuntimeFieldPreview
          field={field}
          value={runtimeFieldValue(field, runtimeSessionState)}
          nodeState={fieldState}
          errorMessage={runtimeFieldError(field, runtimeSessionState)}
          onValueChange={(nextValue) => handleRuntimeFieldValueChange(field, nextValue)}
          onButtonClick={() => handleRuntimeButtonClick(field)}
        />
      </div>
    );
  }

  function updateConditionalRule(index: number, mutate: (rule: ConditionalRule) => void) {
    updateSelectedField((field) => {
      if (!field.conditionals[index]) {
        return;
      }
      mutate(field.conditionals[index]);
    });
  }

  function addConditionalRule(config?: Partial<ConditionalRule>) {
    const nextIndex = activeBuilderField?.conditionals.length ?? 0;
    const ruleId = crypto.randomUUID();
    updateSelectedField((field) => {
      field.conditionals.push({
        ruleId,
        whenFieldId: config?.whenFieldId ?? builderFieldOptions[0]?.id ?? "",
        operator: config?.operator ?? "equals",
        expectedValue: config?.expectedValue ?? "",
        effect: config?.effect ?? "show",
      });
    });
    pendingBehaviorFocusRef.current = `rule:${ruleId}`;
    setEditingRuleIndex(nextIndex);
    setSelectedBehaviorNode({
      kind: "rule",
      ruleId,
      phase: config ? "effect" : "condition",
    });
  }

  function addConditionalRuleBundle(effects: ConditionalRule["effect"][], config?: Partial<ConditionalRule>) {
    if (!effects.length) {
      return;
    }
    const nextIndex = activeBuilderField?.conditionals.length ?? 0;
    const nextRules = effects.map((effect) => ({
      ruleId: crypto.randomUUID(),
      whenFieldId: config?.whenFieldId ?? builderFieldOptions[0]?.id ?? "",
      operator: config?.operator ?? "equals",
      expectedValue: config?.expectedValue ?? "",
      effect,
    }));
    updateSelectedField((field) => {
      field.conditionals.push(...nextRules);
    });
    const focusRule = nextRules[0];
    pendingBehaviorFocusRef.current = `rule:${focusRule.ruleId}`;
    setEditingRuleIndex(nextIndex);
    setSelectedBehaviorNode({
      kind: "rule",
      ruleId: focusRule.ruleId,
      phase: "condition",
    });
    setMessage(`${effects.map((effect) => formatLabel(effect)).join(" + ")} bundle added for ${activeBuilderField?.label ?? "this field"}.`);
  }

  function removeConditionalRule(index: number) {
    const removedRuleId = activeBuilderField?.conditionals[index]?.ruleId ?? null;
    updateSelectedField((field) => {
      field.conditionals.splice(index, 1);
    });
    setEditingRuleIndex((current) => (current === index ? null : current !== null && current > index ? current - 1 : current));
    setSelectedBehaviorNode((current) =>
      current?.kind === "rule" && current.ruleId === removedRuleId ? null : current,
    );
  }

  function addSiblingConditionalRule(ruleId: string, effect: ConditionalRule["effect"]) {
    const sourceRule = activeBuilderField?.conditionals.find((candidate) => candidate.ruleId === ruleId);
    if (!sourceRule) {
      return;
    }
    const existingMatch = activeBuilderField?.conditionals.some(
      (candidate) => createConditionalRuleGroupKey(candidate) === createConditionalRuleGroupKey(sourceRule) && candidate.effect === effect,
    );
    if (existingMatch) {
      setMessage(`${formatLabel(effect)} is already part of this conditional bundle.`);
      return;
    }
    addConditionalRule({
      whenFieldId: sourceRule.whenFieldId,
      operator: sourceRule.operator,
      expectedValue: sourceRule.expectedValue,
      effect,
    });
  }

  function finalizeBehaviorStudioCreation() {
    setBehaviorStudioCreationKind(null);
  }

  function applyBehaviorRuleStarter(
    starter:
      | { mode: "single"; effect?: ConditionalRule["effect"] }
      | { mode: "bundle"; effects: ConditionalRule["effect"][] },
  ) {
    if (selectedAuthoring?.kind !== "field" || !activeBuilderField) {
      setMessage("Select a field to create a state rule.");
      return;
    }
    if (starter.mode === "bundle") {
      addConditionalRuleBundle(starter.effects, { operator: "equals", expectedValue: "" });
    } else {
      addConditionalRule(starter.effect ? { effect: starter.effect, operator: "equals", expectedValue: "" } : undefined);
    }
    setBehaviorStudioManagerMode("rules");
    finalizeBehaviorStudioCreation();
  }

  function createBlankBehaviorStudioListener(seedAction: "listener" | "event") {
    if (!activeRuntimeScope) {
      setMessage("Select a form, button, or interactive field to create a behavior flow.");
      return;
    }
    const triggerName = defaultBehaviorTriggerName();
    const actions =
      seedAction === "event"
        ? [createRuntimeAction("emit_event", defaultRuntimeActionConfigForScope("emit_event"))]
        : [];
    addRuntimeListener(
      createRuntimeListener(
        triggerName,
        actions,
        selectedAuthoring?.kind === "field" ? selectedAuthoring.fieldId : null,
      ),
    );
    setBehaviorStudioManagerMode("flows");
    finalizeBehaviorStudioCreation();
  }

  function applyBehaviorFlowPreset(presetId: string) {
    const preset = runtimePresets.find((candidate) => candidate.id === presetId);
    if (!preset || !activeRuntimeScope) {
      setMessage("Select a compatible scope before applying this starter flow.");
      return;
    }
    addRuntimeListener(preset.apply(activeRuntimeScope, activeBuilderField));
    setBehaviorStudioManagerMode("flows");
    finalizeBehaviorStudioCreation();
  }

  function renderConditionalRuleEditor(rule: ConditionalRule, index: number, options?: { compact?: boolean }) {
    const conditionalGroup = buildConditionalRuleGroups(activeBuilderField?.conditionals ?? []).find((group) =>
      group.members.some((member) => member.rule.ruleId === rule.ruleId),
    );
    const availableSiblingEffects = (["show", "hide", "require", "disable"] as const).filter(
      (effect) => !conditionalGroup?.members.some((member) => member.rule.effect === effect),
    );
    return (
      <div className={`rounded-[1rem] border border-blue-200 bg-blue-50/60 ${options?.compact ? "p-4" : "p-5"}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-blue-700">Rule editor</p>
            <p className="mt-2 text-sm text-slate-700">Refine the condition and effect here without leaving the current field selection.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingRuleIndex(null);
              setSelectedBehaviorNode(null);
            }}
            className={iconButtonClass()}
          >
            ×
          </button>
        </div>
        {conditionalGroup ? (
          <div className="mt-4 rounded-[0.95rem] border border-blue-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Conditional bundle</p>
                <p className="mt-2 text-sm text-slate-700">
                  One condition can drive several effects. Keep related visibility, required, and enabled-state rules grouped here.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {conditionalGroup.members.map((member) => (
                  <button
                    key={member.rule.ruleId}
                    type="button"
                    onClick={() => {
                      setEditingRuleIndex(member.index);
                      setSelectedBehaviorNode({ kind: "rule", ruleId: member.rule.ruleId, phase: "effect" });
                    }}
                    className={actionButtonClass(member.rule.ruleId === rule.ruleId ? "primary" : "secondary")}
                  >
                    {formatLabel(member.rule.effect)}
                  </button>
                ))}
              </div>
            </div>
            {availableSiblingEffects.length ? (
              <div className="mt-3">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Add related effect</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {availableSiblingEffects.map((effect) => (
                    <button
                      key={`${rule.ruleId}-${effect}`}
                      type="button"
                      onClick={() => addSiblingConditionalRule(rule.ruleId, effect)}
                      className={actionButtonClass("secondary")}
                    >
                      Add {formatLabel(effect)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="mt-4 grid gap-3">
          <div>
            <label className="text-xs uppercase tracking-[0.18em] text-slate-500">When this field matches</label>
            <select
              value={rule.whenFieldId}
              onChange={(event) => updateConditionalRule(index, (current) => { current.whenFieldId = event.target.value; })}
              className="mt-2 w-full rounded-2xl border border-soft px-4 py-2.5 text-sm text-slate-800"
            >
              {builderFieldOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Condition</label>
              <select
                value={rule.operator}
                onChange={(event) =>
                  updateConditionalRule(index, (current) => {
                    current.operator = event.target.value as ConditionalRule["operator"];
                  })
                }
                className="mt-2 w-full rounded-2xl border border-soft px-4 py-2.5 text-sm text-slate-800"
              >
                <option value="equals">equals</option>
                <option value="not_equals">does not equal</option>
                <option value="contains">contains</option>
                <option value="exists">has any value</option>
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Effect</label>
              <select
                value={rule.effect}
                onChange={(event) =>
                  updateConditionalRule(index, (current) => {
                    current.effect = event.target.value as ConditionalRule["effect"];
                  })
                }
                className="mt-2 w-full rounded-2xl border border-soft px-4 py-2.5 text-sm text-slate-800"
              >
                <option value="show">show</option>
                <option value="hide">hide</option>
                <option value="require">require</option>
                <option value="disable">disable</option>
              </select>
            </div>
          </div>
          {rule.operator !== "exists" ? (
            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Expected value</label>
              <input
                value={rule.expectedValue ?? ""}
                onChange={(event) => updateConditionalRule(index, (current) => { current.expectedValue = event.target.value; })}
                placeholder="Expected value"
                className="mt-2 w-full rounded-2xl border border-soft px-4 py-2.5 text-sm text-slate-800"
              />
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => removeConditionalRule(index)} className={actionButtonClass("danger")}>
              Remove
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingRuleIndex(null);
                setSelectedBehaviorNode(null);
              }}
              className={actionButtonClass("primary")}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderBehaviorGraphNode(config: {
    eyebrow: string;
    title: string;
    detail: string;
    tone: "blue" | "emerald" | "amber";
    active?: boolean;
    compact?: boolean;
    onClick?: () => void;
  }) {
    const toneClass =
      config.tone === "blue"
        ? config.active
          ? "border-blue-400 bg-blue-50 text-blue-950 shadow-[0_10px_24px_rgba(37,99,235,0.12)]"
          : "border-blue-200 bg-blue-50/70 text-slate-900"
        : config.tone === "emerald"
          ? config.active
            ? "border-emerald-400 bg-emerald-50 text-emerald-950 shadow-[0_10px_24px_rgba(5,150,105,0.12)]"
            : "border-emerald-200 bg-emerald-50/70 text-slate-900"
          : config.active
            ? "border-amber-400 bg-amber-50 text-amber-950 shadow-[0_10px_24px_rgba(217,119,6,0.12)]"
            : "border-amber-200 bg-amber-50/80 text-slate-900";
    return (
      <button
        type="button"
        onClick={config.onClick}
        className={`rounded-[1rem] border text-left transition hover:-translate-y-0.5 hover:border-slate-300 ${
          config.compact ? "min-w-[10rem] px-3 py-2.5" : "min-w-[12rem] px-4 py-3"
        } ${toneClass}`}
      >
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">{config.eyebrow}</p>
        <p className={`font-semibold ${config.compact ? "mt-1.5 text-sm" : "mt-2"}`}>{config.title}</p>
        <p className={`text-slate-600 ${config.compact ? "mt-1.5 text-xs leading-5" : "mt-2 text-sm leading-6"}`}>{config.detail}</p>
      </button>
    );
  }

  function renderSuggestionChips(config: {
    label: string;
    suggestions: string[];
    onApply: (value: string) => void;
  }) {
    if (!config.suggestions.length) {
      return null;
    }
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">{config.label}</span>
        {config.suggestions.map((suggestion) => (
          <button
            key={`${config.label}-${suggestion}`}
            type="button"
            onClick={() => config.onApply(suggestion)}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-950"
          >
            {suggestion}
          </button>
        ))}
      </div>
    );
  }

  function renderRuntimePayloadTemplates(config: {
    label: string;
    templates: RuntimePayloadTemplate[];
    onApply: (template: RuntimePayloadTemplate) => void;
  }) {
    if (!config.templates.length) {
      return null;
    }
    return (
      <div className="rounded-[0.95rem] border border-slate-200 bg-white p-3">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">{config.label}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {config.templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => config.onApply(template)}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white hover:text-slate-950"
            >
              {template.label}
            </button>
          ))}
        </div>
        <div className="mt-3 space-y-2">
          {config.templates.map((template) => (
            <p key={`${template.id}-description`} className="text-sm text-slate-600">
              <span className="font-medium text-slate-800">{template.label}:</span> {template.description}
            </p>
          ))}
        </div>
      </div>
    );
  }

  function renderRuntimeActionEditor(
    listener: RuntimeListenerDefinition,
    action: RuntimeActionDefinition,
    actionIndex: number,
    options?: { highlighted?: boolean; actionCount?: number },
  ) {
    const actionTone = options?.highlighted ? "border-blue-300 bg-blue-50/60" : "border-soft bg-white";
    const structuredPayloadEntries = runtimePayloadEntries(getRuntimeActionPayload(action));
    const payloadIssues = runtimePayloadIssues(structuredPayloadEntries);
    const payloadTemplates = runtimePayloadTemplatesForAction(action, listener);
    const emittedEventSuggestions = runtimeEventNameSuggestions(activeRuntimeScope, activeBuilderField, listener);
    const hostHandlerSuggestions = runtimeHostHandlerSuggestions(activeRuntimeScope, activeBuilderField, listener);
    const emittedEventIssue =
      action.kind === "emit_event"
        ? validateRuntimeIdentifier(String(action.config.eventName ?? ""), "Event name", emittedEventSuggestions[0] ?? "custom.event")
        : null;
    const hostHandlerIssue =
      action.kind === "host_action"
        ? validateRuntimeIdentifier(String(action.config.handlerKey ?? ""), "Host handler key", hostHandlerSuggestions[0] ?? "host.action")
        : null;
    return (
      <div key={action.id} className={`rounded-[0.95rem] border p-4 ${actionTone}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Action {actionIndex + 1}
              {options?.actionCount ? ` of ${options.actionCount}` : ""}
            </p>
            <p className="mt-2 text-sm text-slate-600">{describeRuntimeAction(action)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => moveRuntimeAction(listener.id, action.id, "earlier")}
              disabled={actionIndex === 0}
              className={actionButtonClass()}
            >
              Move earlier
            </button>
            <button
              type="button"
              onClick={() => moveRuntimeAction(listener.id, action.id, "later")}
              disabled={actionIndex === (options?.actionCount ?? listener.actions.length) - 1}
              className={actionButtonClass()}
            >
              Move later
            </button>
            <button type="button" onClick={() => duplicateRuntimeAction(listener.id, action.id)} className={actionButtonClass("secondary")}>
              Duplicate
            </button>
            <button
              type="button"
              onClick={() => removeRuntimeAction(listener.id, action.id)}
              className={actionButtonClass("danger")}
            >
              Remove
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          <div>
            <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Do this</label>
            <select
              value={action.kind}
              onChange={(event) => {
                updateRuntimeAction(listener.id, action.id, (current) => {
                  current.kind = event.target.value as RuntimeActionKind;
                  current.config = defaultRuntimeActionConfigForScope(event.target.value as RuntimeActionKind, { listener });
                });
                setRuntimePayloadEditors((current) => {
                  const next = { ...current };
                  delete next[action.id];
                  return next;
                });
              }}
              className="mt-2 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
            >
              {runtimeActionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {action.kind === "go_to_step" ? (
            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Target step</label>
              <select
                value={String(action.config.stepId ?? "")}
                onChange={(event) =>
                  updateRuntimeAction(listener.id, action.id, (current) => {
                    current.config.stepId = event.target.value;
                  })
                }
                className="mt-2 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
              >
                {builderStepOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {action.kind === "set_field_value" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Target field</label>
                <select
                  value={String(action.config.fieldId ?? "")}
                  onChange={(event) =>
                    updateRuntimeAction(listener.id, action.id, (current) => {
                      current.config.fieldId = event.target.value;
                    })
                  }
                  className="mt-2 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                >
                  {builderFieldOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Value</label>
                <input
                  value={String(action.config.value ?? "")}
                  onChange={(event) =>
                    updateRuntimeAction(listener.id, action.id, (current) => {
                      current.config.value = event.target.value;
                    })
                  }
                  className="mt-2 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                />
              </div>
            </div>
          ) : null}

          {action.kind === "emit_event" ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Event name to emit</label>
                <input
                  value={String(action.config.eventName ?? "")}
                  onChange={(event) =>
                    updateRuntimeAction(listener.id, action.id, (current) => {
                      current.config.eventName = event.target.value;
                    })
                  }
                  placeholder="custom.event"
                  className="mt-2 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                />
                {renderSuggestionChips({
                  label: "Suggested",
                  suggestions: emittedEventSuggestions,
                  onApply: (value) =>
                    updateRuntimeAction(listener.id, action.id, (current) => {
                      current.config.eventName = value;
                    }),
                })}
                {emittedEventIssue ? <p className="mt-2 text-sm text-rose-600">{emittedEventIssue}</p> : null}
              </div>
              <div className="rounded-[0.95rem] border border-soft bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Event payload</p>
                    <p className="mt-2 text-sm text-slate-700">
                      Name the signal first, then add only the extra context the runtime or host needs to receive with it.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setRuntimePayloadEditorMode(action, "key_value")}
                      className={actionButtonClass(getRuntimePayloadEditorState(action).mode === "key_value" ? "primary" : "secondary")}
                    >
                      Structured fields
                    </button>
                    <button
                      type="button"
                      onClick={() => setRuntimePayloadEditorMode(action, "json")}
                      className={actionButtonClass(getRuntimePayloadEditorState(action).mode === "json" ? "primary" : "secondary")}
                    >
                      Raw JSON
                    </button>
                  </div>
                </div>

                {getRuntimePayloadEditorState(action).mode === "key_value" ? (
                  <div className="mt-4 space-y-3">
                    {renderRuntimePayloadTemplates({
                      label: "Quick payload templates",
                      templates: payloadTemplates,
                      onApply: (template) => {
                        applyRuntimePayloadEntries(listener.id, action.id, template.entries);
                        setMessage(`${template.label} payload template applied.`);
                      },
                    })}
                    {structuredPayloadEntries.map((entry, payloadIndex, payloadEntries) => (
                      <div
                        key={`${action.id}-payload-${payloadIndex}`}
                        className="grid gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,0.65fr)_minmax(0,1.15fr)_auto]"
                      >
                        <input
                          value={entry.key}
                          onChange={(event) => {
                            const nextEntries = payloadEntries.map((candidate, candidateIndex) =>
                              candidateIndex === payloadIndex ? { ...candidate, key: event.target.value } : candidate,
                            );
                            applyRuntimePayloadEntries(listener.id, action.id, nextEntries);
                          }}
                          placeholder="field name"
                          className="rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                        />
                        <select
                          value={entry.type}
                          onChange={(event) => {
                            const nextType = event.target.value as RuntimePayloadFieldType;
                            const nextEntries = payloadEntries.map((candidate, candidateIndex) =>
                              candidateIndex === payloadIndex
                                ? { ...candidate, type: nextType, value: runtimePayloadEntryValueForType(nextType, candidate.value) }
                                : candidate,
                            );
                            applyRuntimePayloadEntries(listener.id, action.id, nextEntries);
                          }}
                          className="rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                        >
                          {runtimePayloadFieldTypeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {entry.type === "boolean" ? (
                          <select
                            value={entry.value}
                            onChange={(event) => {
                              const nextEntries = payloadEntries.map((candidate, candidateIndex) =>
                                candidateIndex === payloadIndex ? { ...candidate, value: event.target.value } : candidate,
                              );
                              applyRuntimePayloadEntries(listener.id, action.id, nextEntries);
                            }}
                            className="rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                          >
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </select>
                        ) : entry.type === "json" ? (
                          <textarea
                            value={entry.value}
                            onChange={(event) => {
                              const nextEntries = payloadEntries.map((candidate, candidateIndex) =>
                                candidateIndex === payloadIndex ? { ...candidate, value: event.target.value } : candidate,
                              );
                              applyRuntimePayloadEntries(listener.id, action.id, nextEntries);
                            }}
                            rows={3}
                            placeholder='{"nested":"json"}'
                            className="rounded-2xl border border-soft px-4 py-3 font-mono text-sm text-slate-800"
                          />
                        ) : entry.type === "runtime" ? (
                          <div className="space-y-2">
                            <select
                              value={entry.value}
                              onChange={(event) => {
                                const nextEntries = payloadEntries.map((candidate, candidateIndex) =>
                                  candidateIndex === payloadIndex ? { ...candidate, value: event.target.value } : candidate,
                                );
                                applyRuntimePayloadEntries(listener.id, action.id, nextEntries);
                              }}
                              className="rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                            >
                              {runtimePayloadReferenceOptions.map((option) => (
                                <option key={option.key} value={option.key}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <p className="text-xs text-slate-500">
                              {runtimePayloadReferenceOptions.find((option) => option.key === entry.value)?.description ??
                                "Resolve this value from runtime context when the action runs."}
                            </p>
                          </div>
                        ) : entry.type === "null" ? (
                          <div className="flex items-center rounded-2xl border border-soft bg-slate-100 px-4 py-3 text-sm text-slate-500">
                            This field will send `null`.
                          </div>
                        ) : (
                          <input
                            type={entry.type === "number" ? "number" : "text"}
                            value={entry.value}
                            onChange={(event) => {
                              const nextEntries = payloadEntries.map((candidate, candidateIndex) =>
                                candidateIndex === payloadIndex ? { ...candidate, value: event.target.value } : candidate,
                              );
                              applyRuntimePayloadEntries(listener.id, action.id, nextEntries);
                            }}
                            placeholder={entry.type === "number" ? "0" : "plain text"}
                            className="rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const nextEntries = payloadEntries.filter((_, candidateIndex) => candidateIndex !== payloadIndex);
                            applyRuntimePayloadEntries(listener.id, action.id, nextEntries);
                          }}
                          className={actionButtonClass("danger")}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    {!runtimePayloadEntries(getRuntimeActionPayload(action)).length ? (
                      <div className="app-muted-card p-4 text-sm text-slate-500">
                        No payload fields yet. Add one only if the event should send more than its name.
                      </div>
                    ) : null}
                    {payloadIssues.length ? (
                      <div className="rounded-[0.95rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {payloadIssues.map((issue) => (
                          <p key={issue}>{issue}</p>
                        ))}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        const nextEntries = [
                          ...structuredPayloadEntries,
                          {
                            key: `field_${structuredPayloadEntries.length + 1}`,
                            value: "",
                            type: "string" as RuntimePayloadFieldType,
                          },
                        ];
                        applyRuntimePayloadEntries(listener.id, action.id, nextEntries);
                      }}
                      className={actionButtonClass()}
                    >
                      Add event field
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    <textarea
                      value={getRuntimePayloadEditorState(action).raw}
                      onChange={(event) => updateRuntimePayloadEditorRaw(action.id, event.target.value)}
                      rows={8}
                      className="w-full rounded-2xl border border-soft px-4 py-3 font-mono text-sm text-slate-800"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          try {
                            const parsed = JSON.parse(getRuntimePayloadEditorState(action).raw);
                            if (!isRecord(parsed)) {
                              throw new Error("Payload JSON must be an object.");
                            }
                            updateRuntimeAction(listener.id, action.id, (current) => {
                              current.config.payload = parsed;
                            });
                            syncRuntimePayloadEditor(action.id, parsed);
                            setMessage("Runtime payload JSON applied.");
                          } catch (error) {
                            setErrorMessage(error instanceof Error ? error.message : "Invalid payload JSON.");
                          }
                        }}
                        className={actionButtonClass("primary")}
                      >
                        Apply JSON
                      </button>
                      <button
                        type="button"
                        onClick={() => syncRuntimePayloadEditor(action.id, getRuntimeActionPayload(action))}
                        className={actionButtonClass()}
                      >
                        Reset from payload
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {action.kind === "host_action" ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Host handler key</label>
                <input
                  value={String(action.config.handlerKey ?? "")}
                  onChange={(event) =>
                    updateRuntimeAction(listener.id, action.id, (current) => {
                      current.config.handlerKey = event.target.value;
                    })
                  }
                  placeholder="host.action"
                  className="mt-2 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                />
                {renderSuggestionChips({
                  label: "Suggested",
                  suggestions: hostHandlerSuggestions,
                  onApply: (value) =>
                    updateRuntimeAction(listener.id, action.id, (current) => {
                      current.config.handlerKey = value;
                    }),
                })}
                {hostHandlerIssue ? <p className="mt-2 text-sm text-rose-600">{hostHandlerIssue}</p> : null}
              </div>
              <div className="rounded-[0.95rem] border border-soft bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Request payload</p>
                    <p className="mt-2 text-sm text-slate-700">
                      Point this action at the host handler first, then add only the request fields the host actually expects.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setRuntimePayloadEditorMode(action, "key_value")}
                      className={actionButtonClass(getRuntimePayloadEditorState(action).mode === "key_value" ? "primary" : "secondary")}
                    >
                      Structured fields
                    </button>
                    <button
                      type="button"
                      onClick={() => setRuntimePayloadEditorMode(action, "json")}
                      className={actionButtonClass(getRuntimePayloadEditorState(action).mode === "json" ? "primary" : "secondary")}
                    >
                      Raw JSON
                    </button>
                  </div>
                </div>

                {getRuntimePayloadEditorState(action).mode === "key_value" ? (
                  <div className="mt-4 space-y-3">
                    {renderRuntimePayloadTemplates({
                      label: "Quick payload templates",
                      templates: payloadTemplates,
                      onApply: (template) => {
                        applyRuntimePayloadEntries(listener.id, action.id, template.entries);
                        setMessage(`${template.label} payload template applied.`);
                      },
                    })}
                    {structuredPayloadEntries.map((entry, payloadIndex, payloadEntries) => (
                      <div
                        key={`${action.id}-host-payload-${payloadIndex}`}
                        className="grid gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,0.65fr)_minmax(0,1.15fr)_auto]"
                      >
                        <input
                          value={entry.key}
                          onChange={(event) => {
                            const nextEntries = payloadEntries.map((candidate, candidateIndex) =>
                              candidateIndex === payloadIndex ? { ...candidate, key: event.target.value } : candidate,
                            );
                            applyRuntimePayloadEntries(listener.id, action.id, nextEntries);
                          }}
                          placeholder="field name"
                          className="rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                        />
                        <select
                          value={entry.type}
                          onChange={(event) => {
                            const nextType = event.target.value as RuntimePayloadFieldType;
                            const nextEntries = payloadEntries.map((candidate, candidateIndex) =>
                              candidateIndex === payloadIndex
                                ? { ...candidate, type: nextType, value: runtimePayloadEntryValueForType(nextType, candidate.value) }
                                : candidate,
                            );
                            applyRuntimePayloadEntries(listener.id, action.id, nextEntries);
                          }}
                          className="rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                        >
                          {runtimePayloadFieldTypeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {entry.type === "boolean" ? (
                          <select
                            value={entry.value}
                            onChange={(event) => {
                              const nextEntries = payloadEntries.map((candidate, candidateIndex) =>
                                candidateIndex === payloadIndex ? { ...candidate, value: event.target.value } : candidate,
                              );
                              applyRuntimePayloadEntries(listener.id, action.id, nextEntries);
                            }}
                            className="rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                          >
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </select>
                        ) : entry.type === "json" ? (
                          <textarea
                            value={entry.value}
                            onChange={(event) => {
                              const nextEntries = payloadEntries.map((candidate, candidateIndex) =>
                                candidateIndex === payloadIndex ? { ...candidate, value: event.target.value } : candidate,
                              );
                              applyRuntimePayloadEntries(listener.id, action.id, nextEntries);
                            }}
                            rows={3}
                            placeholder='{"nested":"json"}'
                            className="rounded-2xl border border-soft px-4 py-3 font-mono text-sm text-slate-800"
                          />
                        ) : entry.type === "runtime" ? (
                          <div className="space-y-2">
                            <select
                              value={entry.value}
                              onChange={(event) => {
                                const nextEntries = payloadEntries.map((candidate, candidateIndex) =>
                                  candidateIndex === payloadIndex ? { ...candidate, value: event.target.value } : candidate,
                                );
                                applyRuntimePayloadEntries(listener.id, action.id, nextEntries);
                              }}
                              className="rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                            >
                              {runtimePayloadReferenceOptions.map((option) => (
                                <option key={option.key} value={option.key}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <p className="text-xs text-slate-500">
                              {runtimePayloadReferenceOptions.find((option) => option.key === entry.value)?.description ??
                                "Resolve this value from runtime context when the action runs."}
                            </p>
                          </div>
                        ) : entry.type === "null" ? (
                          <div className="flex items-center rounded-2xl border border-soft bg-slate-100 px-4 py-3 text-sm text-slate-500">
                            This field will send `null`.
                          </div>
                        ) : (
                          <input
                            type={entry.type === "number" ? "number" : "text"}
                            value={entry.value}
                            onChange={(event) => {
                              const nextEntries = payloadEntries.map((candidate, candidateIndex) =>
                                candidateIndex === payloadIndex ? { ...candidate, value: event.target.value } : candidate,
                              );
                              applyRuntimePayloadEntries(listener.id, action.id, nextEntries);
                            }}
                            placeholder={entry.type === "number" ? "0" : "plain text"}
                            className="rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const nextEntries = payloadEntries.filter((_, candidateIndex) => candidateIndex !== payloadIndex);
                            applyRuntimePayloadEntries(listener.id, action.id, nextEntries);
                          }}
                          className={actionButtonClass("danger")}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    {!runtimePayloadEntries(getRuntimeActionPayload(action)).length ? (
                      <div className="app-muted-card p-4 text-sm text-slate-500">
                        No request fields yet. Add them only if the host action needs context beyond the handler key.
                      </div>
                    ) : null}
                    {payloadIssues.length ? (
                      <div className="rounded-[0.95rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {payloadIssues.map((issue) => (
                          <p key={issue}>{issue}</p>
                        ))}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        const nextEntries = [
                          ...structuredPayloadEntries,
                          {
                            key: `field_${structuredPayloadEntries.length + 1}`,
                            value: "",
                            type: "string" as RuntimePayloadFieldType,
                          },
                        ];
                        applyRuntimePayloadEntries(listener.id, action.id, nextEntries);
                      }}
                      className={actionButtonClass()}
                    >
                      Add request field
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    <textarea
                      value={getRuntimePayloadEditorState(action).raw}
                      onChange={(event) => updateRuntimePayloadEditorRaw(action.id, event.target.value)}
                      rows={8}
                      className="w-full rounded-2xl border border-soft px-4 py-3 font-mono text-sm text-slate-800"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          try {
                            const parsed = JSON.parse(getRuntimePayloadEditorState(action).raw);
                            if (!isRecord(parsed)) {
                              throw new Error("Payload JSON must be an object.");
                            }
                            updateRuntimeAction(listener.id, action.id, (current) => {
                              current.config.payload = parsed;
                            });
                            syncRuntimePayloadEditor(action.id, parsed);
                            setMessage("Host action payload JSON applied.");
                          } catch (error) {
                            setErrorMessage(error instanceof Error ? error.message : "Invalid payload JSON.");
                          }
                        }}
                        className={actionButtonClass("primary")}
                      >
                        Apply JSON
                      </button>
                      <button
                        type="button"
                        onClick={() => syncRuntimePayloadEditor(action.id, getRuntimeActionPayload(action))}
                        className={actionButtonClass()}
                      >
                        Reset from payload
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {(action.kind === "show_node" ||
            action.kind === "hide_node" ||
            action.kind === "enable_node" ||
            action.kind === "disable_node" ||
            action.kind === "mark_required" ||
            action.kind === "mark_optional") ? (
            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Target node</label>
              <select
                value={String(action.config.nodeId ?? "")}
                onChange={(event) =>
                  updateRuntimeAction(listener.id, action.id, (current) => {
                    current.config.nodeId = event.target.value;
                  })
                }
                className="mt-2 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
              >
                {builderNodeOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => insertRuntimeActionAfter(listener.id, action.id)} className={actionButtonClass()}>
              Insert event after
            </button>
            <button
              type="button"
              onClick={() => insertRuntimeActionAfter(listener.id, action.id, "host_action")}
              className={actionButtonClass("secondary")}
            >
              Insert host action
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderRuntimeListenerComposer(
    listener: RuntimeListenerDefinition,
    listenerIndex: number,
    options?: { selectedActionId?: string | null },
  ) {
    const triggerSuggestions = runtimeTriggerSuggestions(activeRuntimeScope, activeBuilderField);
    const triggerIssue = validateRuntimeIdentifier(listener.eventName, "Trigger key", triggerSuggestions[0] ?? "form.load");
    const chainTemplates = runtimeActionChainTemplatesForListener(listener);
    return (
      <div className="space-y-4 rounded-[1rem] border border-blue-200 bg-blue-50/60 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-blue-700">Node composer</p>
            <p className="mt-2 font-semibold text-slate-950">Interaction flow {listenerIndex + 1}</p>
            <p className="mt-2 text-sm text-slate-700">Triggers, enablement, and action chain all stay in one docked editor.</p>
          </div>
          <button type="button" onClick={() => setSelectedBehaviorNode(null)} className={iconButtonClass()}>
            ×
          </button>
        </div>

        <div className="grid gap-3">
          <div>
            <label className="text-xs uppercase tracking-[0.18em] text-slate-500">When this happens</label>
            <input
              value={listener.eventName}
              onChange={(event) =>
                updateRuntimeListener(listener.id, (current) => {
                  current.eventName = event.target.value;
                })
              }
              className="mt-2 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
            />
            {renderSuggestionChips({
              label: "Suggested",
              suggestions: triggerSuggestions,
              onApply: (value) =>
                updateRuntimeListener(listener.id, (current) => {
                  current.eventName = value;
                }),
            })}
            <p className="mt-2 text-sm text-slate-600">
              Keep trigger keys stable and dot-separated so the graph, map, and simulator all refer to the same event language.
            </p>
            {triggerIssue ? <p className="mt-2 text-sm text-rose-600">{triggerIssue}</p> : null}
          </div>
          <label className="flex items-center gap-3 rounded-2xl border border-soft bg-white px-4 py-3">
            <input
              type="checkbox"
              checked={listener.enabled}
              onChange={(event) =>
                updateRuntimeListener(listener.id, (current) => {
                  current.enabled = event.target.checked;
                })
              }
            />
            <span className="text-sm text-slate-700">Listener enabled</span>
          </label>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Action chain</p>
              <p className="mt-2 text-sm text-slate-700">Select an action node in the graph or add another action to extend the chain.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => addRuntimeActionToListener(listener.id)} className={actionButtonClass()}>
                Add action
              </button>
              <button
                type="button"
                onClick={() => addRuntimeActionToListener(listener.id, "host_action")}
                className={actionButtonClass("secondary")}
              >
                Add host action
              </button>
            </div>
          </div>
          {listener.actions.length ? (
            <div className="rounded-[0.95rem] border border-soft bg-white p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Chain path</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="app-pill">Trigger {formatLabel(listener.eventName)}</span>
                {listener.actions.map((action, actionIndex) => (
                  <Fragment key={`${listener.id}-summary-${action.id}`}>
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Then</span>
                    <span className={`app-pill ${options?.selectedActionId === action.id ? "ring-2 ring-blue-300" : ""}`}>
                      {actionIndex + 1}. {formatLabel(action.kind)}
                    </span>
                  </Fragment>
                ))}
              </div>
            </div>
          ) : null}
          {chainTemplates.length ? (
            <div className="rounded-[0.95rem] border border-soft bg-white p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Common chains</p>
              <p className="mt-2 text-sm text-slate-700">Use a starter chain when this flow needs more than one action and you do not want to build it node by node.</p>
              <div className="mt-3 grid gap-3">
                {chainTemplates.map((template) => (
                  <div key={template.id} className="rounded-[0.95rem] border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{template.label}</p>
                        <p className="mt-1 text-sm text-slate-600">{template.description}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => replaceRuntimeActionChain(listener.id, template.createActions, template.label)}
                        className={actionButtonClass(listener.actions.length ? "secondary" : "primary")}
                      >
                        {listener.actions.length ? "Replace chain" : "Apply chain"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {listener.actions.length ? (
            listener.actions.map((action, actionIndex) =>
              renderRuntimeActionEditor(listener, action, actionIndex, {
                highlighted: options?.selectedActionId === action.id,
                actionCount: listener.actions.length,
              }),
            )
          ) : (
            <div className="app-muted-card p-4 text-sm text-slate-500">
              No actions yet. Add one to define what this interaction flow should do.
            </div>
          )}
        </div>
      </div>
    );
  }

  function focusBehaviorGraphNode(options: {
    selection: AuthoringSelection | null;
    graphSelection?: BehaviorGraphSelection | null;
    ruleIndex?: number | null;
    filter?: BehaviorGraphFilter;
    mode?: BehaviorGraphMode;
    viewport?: "preserve" | "reset";
    entryContext?: BehaviorGraphEntryContext | null;
  }) {
    if (options.filter) {
      setBehaviorGraphFilter(options.filter);
    }
    if (options.mode) {
      setBehaviorGraphMode(options.mode);
    }
    setSelectedAuthoring(options.selection);
    setInspectorTab("behavior");
    setBehaviorStudioMode("graph");
    setBehaviorStudioView("advanced");
    setBehaviorStudioOpen(true);
    setBehaviorStudioCreationKind(null);
    setBehaviorWorkspaceMode("authoring");
    setSelectedBehaviorNode(options.graphSelection ?? null);
    setEditingRuleIndex(
      options.graphSelection?.kind === "rule" && typeof options.ruleIndex === "number" ? options.ruleIndex : null,
    );
    setBehaviorFocusTarget(null);
    setBehaviorGraphEntryContext(options.entryContext ?? null);
    if (options.viewport === "reset") {
      resetBehaviorGraphViewport();
    }
  }

  function renderBehaviorEdgeLabel(label: string, compact = false) {
    return (
      <span
        className={`inline-flex items-center rounded-full border border-slate-200 bg-white font-semibold uppercase tracking-[0.16em] text-slate-500 ${
          compact ? "px-2.5 py-1 text-[0.62rem]" : "px-3 py-1 text-[0.68rem]"
        }`}
      >
        {label}
      </span>
    );
  }

  function resetBehaviorGraphViewport() {
    setBehaviorGraphZoom(1);
    setBehaviorGraphOffset({ x: 0, y: 0 });
  }

  function currentBehaviorSelectionSummary(selectedRule?: ConditionalRule | null, selectedListener?: RuntimeListenerDefinition | null) {
    if (selectedBehaviorNode?.kind === "rule" && selectedRule) {
      return `Conditional bundle on ${activeBuilderField?.label ?? "current field"}`;
    }
    if (selectedBehaviorNode?.kind === "listener" && selectedListener) {
      return `Interaction flow on ${activeRuntimeScope?.label ?? "current selection"}`;
    }
    if (selectedAuthoring === null) {
      return "Form-level simulation target";
    }
    if (selectedAuthoring.kind === "field") {
      return activeBuilderField?.label ?? "Current field";
    }
    if (selectedAuthoring.kind === "group") {
      return activeGroup?.label ?? "Current group";
    }
    if (selectedAuthoring.kind === "section") {
      return activeSection?.title ?? "Current section";
    }
    return activeStep?.title ?? "Current step";
  }

  function renderBehaviorQuickToolbar(options?: { compact?: boolean; stopPropagation?: boolean; label?: string }) {
    if (!activeDocument) {
      return null;
    }
    const canCreateRule = selectedAuthoring?.kind === "field" && Boolean(activeBuilderField);
    const canCreateFlow = Boolean(activeRuntimeScope);
    const isCompact = options?.compact ?? false;
    const toolButtonClass = `group relative inline-flex ${isCompact ? "h-8 w-8" : "h-9 w-9"} items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:pointer-events-none disabled:opacity-45`;
    const tooltipClass =
      "pointer-events-none absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-950 px-2 py-1 text-[0.68rem] font-semibold text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100";
    const runToolbarAction = (event: MouseEvent<HTMLButtonElement>, action: (anchor: BehaviorStudioAnchor | null) => void) => {
      if (options?.stopPropagation) {
        event.stopPropagation();
      }
      action(createBehaviorStudioAnchor(event.currentTarget));
    };
    const openRuntimeLab = (anchor: BehaviorStudioAnchor | null) => {
      setBehaviorStudioMode("test");
      setBehaviorFocusTarget(null);
      openBehaviorStudio("studio", "test", anchor);
    };

    return (
      <div className={`${isCompact ? "inline-flex" : "flex"} rounded-full border border-blue-100 bg-white/92 px-2 py-1.5 shadow-[0_10px_24px_rgba(37,99,235,0.12)] backdrop-blur`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-blue-700">
            {options?.label ?? "Behavior"}
          </span>
          <div className="flex items-center gap-1.5" role="toolbar" aria-label="Behavior quick actions">
            <button
              type="button"
              title={canCreateRule ? "Add rule" : "Select a field to add a rule"}
              aria-label={canCreateRule ? "Add rule" : "Select a field to add a rule"}
              disabled={!canCreateRule}
              onClick={(event) => runToolbarAction(event, (anchor) => beginBehaviorStudioCreation("rule", anchor))}
              className={toolButtonClass}
            >
              <LogicIcon />
              <span className={tooltipClass}>Add rule</span>
            </button>
            <button
              type="button"
              title={canCreateFlow ? "Add listener" : "Select a behavior-capable scope"}
              aria-label={canCreateFlow ? "Add listener" : "Select a behavior-capable scope"}
              disabled={!canCreateFlow}
              onClick={(event) => runToolbarAction(event, (anchor) => beginBehaviorStudioCreation("listener", anchor))}
              className={toolButtonClass}
            >
              <EventsIcon />
              <span className={tooltipClass}>Add listener</span>
            </button>
            <button
              type="button"
              title={canCreateFlow ? "Add event flow" : "Select a behavior-capable scope"}
              aria-label={canCreateFlow ? "Add event flow" : "Select a behavior-capable scope"}
              disabled={!canCreateFlow}
              onClick={(event) => runToolbarAction(event, (anchor) => beginBehaviorStudioCreation("event", anchor))}
              className={toolButtonClass}
            >
              <PlusIcon />
              <span className={tooltipClass}>Add event</span>
            </button>
            <button
              type="button"
              title="Test selected behavior"
              aria-label="Test selected behavior"
              onClick={(event) => runToolbarAction(event, openRuntimeLab)}
              className={toolButtonClass}
            >
              <PlayIcon />
              <span className={tooltipClass}>Test</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderBehaviorInspectorPanel() {
    const conditionalGroups =
      selectedAuthoring?.kind === "field" && activeBuilderField ? buildConditionalRuleGroups(activeBuilderField.conditionals) : [];
    const scopeListeners = activeRuntimeScope?.listeners ?? [];
    const currentScopeTitle =
      selectedAuthoring === null
        ? "Form behavior"
        : activeRuntimeScope?.label ?? activeBuilderField?.label ?? activeStep?.title ?? "Current selection";

    return (
      <div className="space-y-4">
        <div className="rounded-[1.15rem] border border-soft bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Behavior launchpad</p>
              <h4 className="mt-2 text-lg font-semibold text-slate-950">{currentScopeTitle}</h4>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Keep the inspector lightweight. Launch deeper behavior work in the studio instead of stacking rule and graph editing here.
              </p>
            </div>
            <button type="button" onClick={() => openBehaviorStudio("studio")} className={actionButtonClass("primary")}>
              Open studio
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {conditionalGroups.length ? <span className="app-pill">{conditionalGroups.length} bundles</span> : null}
            {scopeListeners.length ? <span className="app-pill">{scopeListeners.length} flows</span> : null}
            {activeRuntimeScope ? <span className="app-pill">{activeRuntimeScope.label}</span> : null}
            <span className="app-pill">{currentBehaviorSelectionSummary()}</span>
          </div>
          <div className="mt-4 rounded-[0.95rem] border border-dashed border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-600">
            Use the behavior toolbar in the step preview for quick rule, listener, event, and test actions. Keep this rail for status and inspection only.
          </div>
        </div>

        <div className="rounded-[1.15rem] border border-soft bg-white p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">At a glance</p>
          <div className="mt-3 grid gap-3">
            <div className="rounded-[0.95rem] border border-soft bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Rules</p>
              <p className="mt-2 font-semibold text-slate-950">{conditionalGroups.length ? `${conditionalGroups.length} available` : "None yet"}</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">State logic belongs in the studio-managed rules list, not inside the rail.</p>
            </div>
            <div className="rounded-[0.95rem] border border-soft bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Flows</p>
              <p className="mt-2 font-semibold text-slate-950">{scopeListeners.length ? `${scopeListeners.length} available` : "None yet"}</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">Trigger and action-chain work now lives in the studio and advanced workspace.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderBehaviorStudioManager() {
    const conditionalGroups =
      selectedAuthoring?.kind === "field" && activeBuilderField ? buildConditionalRuleGroups(activeBuilderField.conditionals) : [];
    const scopeListeners = activeRuntimeScope?.listeners ?? [];
    const currentScopeTitle =
      selectedAuthoring === null
        ? "Form behavior"
        : activeRuntimeScope?.label ?? activeBuilderField?.label ?? activeStep?.title ?? "Current selection";
    const managerQuery = behaviorStudioManagerQuery.trim().toLowerCase();
    const visibleRuleGroups = conditionalGroups.filter((group) => {
      if (!managerQuery) {
        return true;
      }
      const haystack = `${group.conditionTitle} ${group.conditionDetail} ${group.effectsSummary} ${group.sourceFieldLabel}`.toLowerCase();
      return haystack.includes(managerQuery);
    });
    const visibleListeners = scopeListeners.filter((listener) => {
      if (!managerQuery) {
        return true;
      }
      const actionSummary = listener.actions.map((action) => formatLabel(action.kind)).join(" ");
      const haystack = `${listener.eventName} ${actionSummary} ${listener.enabled ? "enabled" : "disabled"}`.toLowerCase();
      return haystack.includes(managerQuery);
    });
    const behaviorIndexFieldId = selectedAuthoring?.kind === "field" ? selectedAuthoring.fieldId : null;
    const allRuleObjects =
      logicMapData?.steps.flatMap((step) =>
        step.conditionalRules.map((rule) => ({
          id: rule.id,
          kind: "rule" as const,
          objectLabel: "Rule",
          title: rule.title,
          detail: rule.detail,
          stepId: step.id,
          stepTitle: step.title,
          scopeLabel: rule.scopeLabel,
          triggerType: "field condition",
          effectType: rule.effectLabel,
          status: rule.enabled ? "enabled" as const : "disabled" as const,
          startedIds: [rule.sourceFieldId],
          impactsIds: [rule.targetFieldId],
          startedLabel: rule.sourceFieldLabel,
          impactsLabel: rule.targetFieldLabel,
          selection: rule.sourceSelection,
          graphSelection: rule.graphSelection,
          ruleIndex: rule.ruleIndex,
          rule,
          listener: null,
        })),
      ) ?? [];
    const allFlowObjects =
      [
        ...(logicMapData?.formListeners ?? []),
        ...(logicMapData?.steps.flatMap((step) => step.runtimeListeners) ?? []),
      ].map((listener) => ({
        id: listener.id,
        kind: "flow" as const,
        objectLabel: listener.actionKinds.includes("emit_event") ? "Event flow" : "Listener",
        title: `When ${formatLabel(listener.eventName)}`,
        detail: listener.actionsSummary,
        stepId: listener.stepId ?? "form",
        stepTitle: listener.stepId ? (logicMapData?.steps.find((step) => step.id === listener.stepId)?.title ?? "Step") : "Form runtime",
        scopeLabel: listener.scopeLabel,
        triggerType: listener.eventName,
        effectType: listener.actionKinds.length ? listener.actionKinds.map(formatLabel).join(", ") : "No actions",
        status: listener.enabled ? "enabled" as const : "disabled" as const,
        startedIds: [listener.sourceNodeId, listener.selection?.kind === "field" ? listener.selection.fieldId : null].filter(
          (value): value is string => Boolean(value),
        ),
        impactsIds: listener.targetNodeIds,
        startedLabel: listener.scopeLabel,
        impactsLabel: listener.targetNodeIds.map((id) => runtimeNodeLabelById.get(id) ?? id).join(", ") || listener.actionsSummary,
        selection: listener.selection,
        graphSelection: listener.graphSelection,
        ruleIndex: null,
        rule: null,
        listener,
      }));
    const behaviorIndexObjects = [...allRuleObjects, ...allFlowObjects];
    const stepFilterOptions = [
      { value: "all", label: "All steps" },
      { value: "form", label: "Form runtime" },
      ...(logicMapData?.steps.map((step) => ({ value: step.id, label: step.title })) ?? []),
    ];
    const scopeFilterOptions = [
      "all",
      ...Array.from(new Set(behaviorIndexObjects.map((item) => item.scopeLabel))).sort((left, right) => left.localeCompare(right)),
    ];
    const triggerFilterOptions = [
      "all",
      ...Array.from(new Set(behaviorIndexObjects.map((item) => item.triggerType))).sort((left, right) => left.localeCompare(right)),
    ];
    const effectFilterOptions = [
      "all",
      ...Array.from(new Set(behaviorIndexObjects.map((item) => item.effectType))).sort((left, right) => left.localeCompare(right)),
    ];
    const visibleBehaviorIndexObjects = behaviorIndexObjects.filter((item) => {
      const queryMatch =
        !managerQuery ||
        `${item.objectLabel} ${item.title} ${item.detail} ${item.stepTitle} ${item.scopeLabel} ${item.triggerType} ${item.effectType} ${item.status} ${item.startedLabel} ${item.impactsLabel}`
          .toLowerCase()
          .includes(managerQuery);
      const stepMatch = behaviorIndexStepFilter === "all" || item.stepId === behaviorIndexStepFilter;
      const scopeMatch = behaviorIndexScopeFilter === "all" || item.scopeLabel === behaviorIndexScopeFilter;
      const triggerMatch = behaviorIndexTriggerFilter === "all" || item.triggerType === behaviorIndexTriggerFilter;
      const effectMatch = behaviorIndexEffectFilter === "all" || item.effectType === behaviorIndexEffectFilter;
      const statusMatch = behaviorIndexStatusFilter === "all" || item.status === behaviorIndexStatusFilter;
      const objectViewMatch =
        behaviorIndexObjectView === "all" ||
        !behaviorIndexFieldId ||
        (behaviorIndexObjectView === "impacts"
          ? item.impactsIds.includes(behaviorIndexFieldId)
          : item.startedIds.includes(behaviorIndexFieldId));
      return queryMatch && stepMatch && scopeMatch && triggerMatch && effectMatch && statusMatch && objectViewMatch;
    });
    const openBehaviorIndexObject = (item: (typeof behaviorIndexObjects)[number]) => {
      if (item.selection !== undefined) {
        setSelectedAuthoring(item.selection);
      }
      openBehaviorNodeInStudio(item.graphSelection, item.ruleIndex);
    };
    const openBehaviorIndexObjectInSimulator = (item: (typeof behaviorIndexObjects)[number]) => {
      if (item.selection !== undefined) {
        setSelectedAuthoring(item.selection);
      }
      setSelectedBehaviorNode(item.graphSelection);
      setBehaviorStudioCreationKind(null);
      setBehaviorFocusTarget(null);
      setBehaviorStudioMode("test");
      setBehaviorStudioView("studio");
      setBehaviorStudioOpen(true);
      setInspectorTab("behavior");
    };
    const behaviorIndexObjectKey = (item: (typeof behaviorIndexObjects)[number]) => `${item.kind}:${item.id}`;
    const toggleBehaviorIndexObject = (item: (typeof behaviorIndexObjects)[number]) => {
      if (item.kind === "rule" && item.selection) {
        toggleConditionalRuleForSelection(item.selection, item.id);
        return;
      }
      if (item.kind === "flow") {
        toggleRuntimeListenerForSelection(item.selection, item.id);
      }
    };
    const duplicateBehaviorIndexObject = (item: (typeof behaviorIndexObjects)[number]) => {
      if (item.kind === "rule" && item.selection) {
        duplicateConditionalRuleForSelection(item.selection, item.id);
        return;
      }
      if (item.kind === "flow") {
        duplicateRuntimeListenerForSelection(item.selection, item.id);
      }
    };
    const removeBehaviorIndexObject = (item: (typeof behaviorIndexObjects)[number]) => {
      if (item.kind === "rule" && item.selection) {
        removeConditionalRuleForSelection(item.selection, item.id);
        return;
      }
      if (item.kind === "flow") {
        removeRuntimeListenerForSelection(item.selection, item.id);
      }
    };
    const showIndex = behaviorStudioManagerMode === "index";
    const showRules = behaviorStudioManagerMode !== "flows" && !showIndex;
    const showFlows = behaviorStudioManagerMode !== "rules" && !showIndex;

    if (!showIndex) {
      const scopedObjectCount = visibleRuleGroups.length + visibleListeners.length;
      return (
        <div className="space-y-3">
          <div className="rounded-[0.95rem] border border-soft bg-white p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Attached behavior</p>
                <h4 className="mt-1 truncate text-base font-semibold text-slate-950">{currentScopeTitle}</h4>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="app-pill">{visibleRuleGroups.length} rules</span>
                  <span className="app-pill">{visibleListeners.length} listeners/events</span>
                  {activeRuntimeScope ? <span className="app-pill">{activeRuntimeScope.label}</span> : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setBehaviorStudioAnchor(null);
                  setBehaviorStudioCreationKind(null);
                  setBehaviorStudioManagerMode("index");
                  setBehaviorStudioMode("manage");
                  setBehaviorStudioView("studio");
                }}
                className={actionButtonClass("secondary")}
              >
                Open full manager
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={openBehaviorStudioRule} disabled={selectedAuthoring?.kind !== "field"} className={actionButtonClass("primary")}>
                Add rule
              </button>
              <button type="button" onClick={() => openBehaviorStudioListener("listener")} disabled={!activeRuntimeScope} className={actionButtonClass()}>
                Add listener
              </button>
              <button type="button" onClick={() => openBehaviorStudioListener("event")} disabled={!activeRuntimeScope} className={actionButtonClass("secondary")}>
                Add event flow
              </button>
            </div>
          </div>

          {scopedObjectCount ? (
            <div className="space-y-2">
              {visibleRuleGroups.map((group) => {
                const focusRule = group.members[0];
                return (
                  <div key={`compact-rule-${group.key}`} className="rounded-[0.9rem] border border-soft bg-white px-3 py-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap gap-1.5">
                          <span className="app-pill">Rule</span>
                          {group.members.map((member) => (
                            <span key={`compact-rule-effect-${member.rule.ruleId}`} className="app-pill">
                              {formatLabel(member.rule.effect)}
                            </span>
                          ))}
                        </div>
                        <p className="mt-2 text-sm font-semibold text-slate-950">{group.conditionTitle}</p>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{group.conditionDetail}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setBehaviorStudioCreationKind(null);
                            setEditingRuleIndex(focusRule.index);
                            setSelectedBehaviorNode({ kind: "rule", ruleId: focusRule.rule.ruleId, phase: "condition" });
                            setBehaviorStudioMode("create");
                            setBehaviorStudioView("studio");
                          }}
                          className={actionButtonClass("secondary")}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedBehaviorNode({ kind: "rule", ruleId: focusRule.rule.ruleId, phase: "condition" });
                            handleTestSelectedRule(focusRule.rule);
                            setBehaviorStudioMode("test");
                            setBehaviorStudioView("studio");
                          }}
                          className={actionButtonClass("secondary")}
                        >
                          Test
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {visibleListeners.map((listener) => {
                const listenerIndex = scopeListeners.findIndex((candidate) => candidate.id === listener.id);
                return (
                  <div key={`compact-listener-${listener.id}`} className="rounded-[0.9rem] border border-soft bg-white px-3 py-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap gap-1.5">
                          <span className="app-pill">{listener.actions.some((action) => action.kind === "emit_event") ? "Event flow" : "Listener"}</span>
                          <span className="app-pill">{listener.enabled ? "Enabled" : "Disabled"}</span>
                          <span className="app-pill">{listener.actions.length} actions</span>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-slate-950">When {formatLabel(listener.eventName)}</p>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
                          {listener.actions.length
                            ? listener.actions.map((action) => formatLabel(action.kind)).join(" -> ")
                            : "No actions yet"}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setBehaviorStudioCreationKind(null);
                            setSelectedBehaviorNode({
                              kind: "listener",
                              listenerId: listener.id,
                              phase: listener.actions.length ? "action" : "trigger",
                              actionId: listener.actions[0]?.id,
                            });
                            setBehaviorStudioMode("create");
                            setBehaviorStudioView("studio");
                          }}
                          className={actionButtonClass("secondary")}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedBehaviorNode({
                              kind: "listener",
                              listenerId: listener.id,
                              phase: listener.actions.length ? "action" : "trigger",
                              actionId: listener.actions[0]?.id,
                            });
                            handleTestSelectedChain(listener);
                            setBehaviorStudioMode("test");
                            setBehaviorStudioView("studio");
                          }}
                          className={actionButtonClass("secondary")}
                        >
                          Test
                        </button>
                      </div>
                    </div>
                    {listenerIndex >= 0 ? <p className="mt-2 text-[0.68rem] text-slate-500">Flow {listenerIndex + 1} on this selection</p> : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[0.95rem] border border-dashed border-slate-300 bg-white px-4 py-5 text-sm leading-6 text-slate-600">
              No rules, listeners, or event flows are attached to this selection yet. Add one here, or open the full manager to inspect document-wide behavior.
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="rounded-[1.15rem] border border-soft bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Rules and flows manager</p>
              <h4 className="mt-2 text-lg font-semibold text-slate-950">{currentScopeTitle}</h4>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                This is the primary manager for behavior authoring. Search, filter, create, and reopen rule bundles and interaction flows from one dedicated surface.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={openBehaviorStudioRule} className={actionButtonClass("primary")}>
                Add rule
              </button>
              <button type="button" onClick={() => openBehaviorStudioListener("listener")} className={actionButtonClass()}>
                Add listener
              </button>
              <button type="button" onClick={() => openBehaviorStudioListener("event")} className={actionButtonClass("secondary")}>
                Add event flow
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {conditionalGroups.length ? <span className="app-pill">{conditionalGroups.length} rule bundle{conditionalGroups.length === 1 ? "" : "s"}</span> : null}
            {scopeListeners.length ? <span className="app-pill">{scopeListeners.length} interaction flow{scopeListeners.length === 1 ? "" : "s"}</span> : null}
            {activeRuntimeScope ? <span className="app-pill">{activeRuntimeScope.label}</span> : null}
            <span className="app-pill">{currentBehaviorSelectionSummary()}</span>
          </div>
          <div className="mt-4 grid gap-3">
            <input
              value={behaviorStudioManagerQuery}
              onChange={(event) => setBehaviorStudioManagerQuery(event.target.value)}
              placeholder="Search rules, events, and actions"
              className="w-full rounded-2xl border border-soft bg-slate-50 px-4 py-3 text-sm text-slate-800"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setBehaviorStudioManagerMode("all")}
                className={actionButtonClass("secondary")}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setBehaviorStudioManagerMode("rules")}
                className={actionButtonClass("secondary")}
              >
                Rules
              </button>
              <button
                type="button"
                onClick={() => setBehaviorStudioManagerMode("flows")}
                className={actionButtonClass("secondary")}
              >
                Flows
              </button>
              <button
                type="button"
                onClick={() => setBehaviorStudioManagerMode("index")}
                className={actionButtonClass("primary")}
              >
                Full index
              </button>
              <button type="button" onClick={() => openBehaviorStudio("advanced", "graph")} className={actionButtonClass("secondary")}>
                Graph view
              </button>
              <button
                type="button"
                onClick={() => {
                  setBehaviorFocusTarget(null);
                  openBehaviorStudio("advanced", "test");
                }}
                className={actionButtonClass("secondary")}
              >
                Runtime lab
              </button>
            </div>
          </div>
        </div>

        {showIndex ? (
          <div className="rounded-[1.15rem] border border-soft bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Rules Manager</p>
                <h5 className="mt-2 text-base font-semibold text-slate-950">Document behavior index</h5>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Manage rules, listeners, and event flows as objects first. The graph is now an overview and trace target, not the primary list.
                </p>
              </div>
              <span className="app-pill">{visibleBehaviorIndexObjects.length} shown</span>
            </div>

            <div className="mt-4 grid gap-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs uppercase tracking-[0.16em] text-slate-500">
                  Step
                  <select
                    value={behaviorIndexStepFilter}
                    onChange={(event) => setBehaviorIndexStepFilter(event.target.value)}
                    className="mt-1 w-full rounded-2xl border border-soft bg-slate-50 px-3 py-2.5 text-sm normal-case tracking-normal text-slate-800"
                  >
                    {stepFilterOptions.map((option) => (
                      <option key={`behavior-step-filter-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs uppercase tracking-[0.16em] text-slate-500">
                  Scope
                  <select
                    value={behaviorIndexScopeFilter}
                    onChange={(event) => setBehaviorIndexScopeFilter(event.target.value)}
                    className="mt-1 w-full rounded-2xl border border-soft bg-slate-50 px-3 py-2.5 text-sm normal-case tracking-normal text-slate-800"
                  >
                    {scopeFilterOptions.map((option) => (
                      <option key={`behavior-scope-filter-${option}`} value={option}>
                        {option === "all" ? "All scopes" : option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs uppercase tracking-[0.16em] text-slate-500">
                  Trigger
                  <select
                    value={behaviorIndexTriggerFilter}
                    onChange={(event) => setBehaviorIndexTriggerFilter(event.target.value)}
                    className="mt-1 w-full rounded-2xl border border-soft bg-slate-50 px-3 py-2.5 text-sm normal-case tracking-normal text-slate-800"
                  >
                    {triggerFilterOptions.map((option) => (
                      <option key={`behavior-trigger-filter-${option}`} value={option}>
                        {option === "all" ? "All triggers" : formatLabel(option)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs uppercase tracking-[0.16em] text-slate-500">
                  Effect / action
                  <select
                    value={behaviorIndexEffectFilter}
                    onChange={(event) => setBehaviorIndexEffectFilter(event.target.value)}
                    className="mt-1 w-full rounded-2xl border border-soft bg-slate-50 px-3 py-2.5 text-sm normal-case tracking-normal text-slate-800"
                  >
                    {effectFilterOptions.map((option) => (
                      <option key={`behavior-effect-filter-${option}`} value={option}>
                        {option === "all" ? "All effects" : option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                {(["all", "enabled", "disabled"] as const).map((status) => (
                  <button
                    key={`behavior-status-${status}`}
                    type="button"
                    onClick={() => setBehaviorIndexStatusFilter(status)}
                    className={actionButtonClass(behaviorIndexStatusFilter === status ? "primary" : "secondary")}
                  >
                    {status === "all" ? "Any status" : formatLabel(status)}
                  </button>
                ))}
                {(["all", "impacts", "started"] as const).map((view) => (
                  <button
                    key={`behavior-view-${view}`}
                    type="button"
                    onClick={() => setBehaviorIndexObjectView(view)}
                    className={actionButtonClass(behaviorIndexObjectView === view ? "primary" : "secondary")}
                    disabled={view !== "all" && !behaviorIndexFieldId}
                  >
                    {view === "all" ? "All objects" : view === "impacts" ? "Impacts this field" : "Started from this field"}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {visibleBehaviorIndexObjects.length ? (
                visibleBehaviorIndexObjects.map((item) => {
                  const itemKey = behaviorIndexObjectKey(item);
                  const detailsOpen = expandedBehaviorIndexObjectKey === itemKey;
                  const canTest = item.kind === "flow" || item.rule !== null;
                  return (
                    <div key={`behavior-index-${item.kind}-${item.id}`} className="rounded-[0.95rem] border border-soft bg-slate-50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap gap-2">
                            <span className="app-pill">{item.objectLabel}</span>
                            <span className="app-pill">{item.status}</span>
                            <span className="app-pill">{item.stepTitle}</span>
                          </div>
                          <p className="mt-3 font-semibold text-slate-950">{item.title}</p>
                          <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
                          <div className="mt-3 grid gap-2 text-sm text-slate-600">
                            <span>Started from: {item.startedLabel}</span>
                            <span>Impacts: {item.impactsLabel}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => openBehaviorIndexObject(item)} className={actionButtonClass("primary")}>
                            Open in studio
                          </button>
                          <button
                            type="button"
                            onClick={() => openBehaviorIndexObjectInSimulator(item)}
                            className={actionButtonClass("secondary")}
                            disabled={!canTest}
                          >
                            Test
                          </button>
                          <button
                            type="button"
                            onClick={() => setExpandedBehaviorIndexObjectKey(detailsOpen ? null : itemKey)}
                            className={actionButtonClass("secondary")}
                          >
                            {detailsOpen ? "Hide details" : "Details"}
                          </button>
                        </div>
                      </div>

                      {detailsOpen ? (
                        <div className="mt-4 grid gap-3 rounded-[0.95rem] border border-slate-200 bg-white p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Object detail</p>
                            <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                              <span>Scope: {item.scopeLabel}</span>
                              <span>Trigger: {formatLabel(item.triggerType)}</span>
                              <span>Effect/action: {item.effectType}</span>
                              <span>Status: {formatLabel(item.status)}</span>
                              <span>Object id: {item.id}</span>
                              <span>Step: {item.stepTitle}</span>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-slate-600">
                              Use these object operations for lifecycle management. Open the studio when the wiring itself needs to change.
                            </p>
                          </div>
                          <div className="flex flex-wrap content-start gap-2 lg:max-w-[18rem]">
                            <button type="button" onClick={() => toggleBehaviorIndexObject(item)} className={actionButtonClass("secondary")}>
                              {item.status === "enabled" ? "Disable" : "Enable"}
                            </button>
                            <button type="button" onClick={() => duplicateBehaviorIndexObject(item)} className={actionButtonClass("secondary")}>
                              Duplicate
                            </button>
                            <button type="button" onClick={() => removeBehaviorIndexObject(item)} className={actionButtonClass("danger")}>
                              Delete
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <div className="app-muted-card p-4 text-sm text-slate-500">
                  No behavior objects match the current manager filters.
                </div>
              )}
            </div>
          </div>
        ) : null}

        {showRules ? (
        <div className="rounded-[1.15rem] border border-soft bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Rules manager</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Rules should read as explicit objects you can inspect and reopen, not hidden branches inside the graph.
              </p>
            </div>
            {selectedAuthoring?.kind === "field" ? (
              <button type="button" onClick={openBehaviorStudioRule} className={actionButtonClass()}>
                New rule
              </button>
            ) : null}
          </div>
          {selectedAuthoring?.kind === "field" && activeBuilderField ? (
            visibleRuleGroups.length ? (
              <div className="mt-4 space-y-3">
                {visibleRuleGroups.map((group) => {
                  const focusRule = group.members[0];
                  return (
                    <div key={`behavior-rule-group-${group.key}`} className="rounded-[0.95rem] border border-soft bg-slate-50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-950">{group.conditionTitle}</p>
                          <p className="mt-2 text-sm leading-6 text-slate-600">{group.conditionDetail}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {group.members.map((member) => (
                              <span key={member.rule.ruleId} className="app-pill">
                                {formatLabel(member.rule.effect)}
                              </span>
                            ))}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setBehaviorStudioCreationKind(null);
                            setEditingRuleIndex(focusRule.index);
                            setSelectedBehaviorNode({ kind: "rule", ruleId: focusRule.rule.ruleId, phase: "condition" });
                            openBehaviorStudio("studio");
                          }}
                          className={actionButtonClass("secondary")}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="app-muted-card mt-4 p-4 text-sm text-slate-500">
                {conditionalGroups.length
                  ? "No rule bundles match the current search."
                  : "No field rules yet. Create the first rule in the behavior studio so conditions and effects can be wired with room to breathe."}
              </div>
            )
          ) : (
            <div className="app-muted-card mt-4 p-4 text-sm text-slate-500">
              Select a field to manage state rules. Step, section, and form behavior can still use listeners and events.
            </div>
          )}
        </div>
        ) : null}

        {showFlows ? (
        <div className="rounded-[1.15rem] border border-soft bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Listeners and events</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Build flows around triggers and action chains, then reopen them in the studio when they need deeper wiring.
              </p>
            </div>
            {activeRuntimeScope ? (
              <button type="button" onClick={() => openBehaviorStudioListener("listener")} className={actionButtonClass()}>
                New flow
              </button>
            ) : null}
          </div>
          {visibleListeners.length ? (
            <div className="mt-4 space-y-3">
              {visibleListeners.map((listener) => {
                const listenerIndex = scopeListeners.findIndex((candidate) => candidate.id === listener.id);
                return (
                <div key={`behavior-listener-${listener.id}`} className="rounded-[0.95rem] border border-soft bg-slate-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-950">
                        Flow {listenerIndex + 1}: {formatLabel(listener.eventName)}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {listener.actions.length
                          ? `${listener.actions.length} action${listener.actions.length === 1 ? "" : "s"} in this chain`
                          : "No actions yet. Open the studio to finish wiring this listener."}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="app-pill">{listener.enabled ? "Enabled" : "Disabled"}</span>
                        {listener.actions.map((action) => (
                          <span key={`${listener.id}-${action.id}`} className="app-pill">
                            {formatLabel(action.kind)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setBehaviorStudioCreationKind(null);
                        setSelectedBehaviorNode({
                          kind: "listener",
                          listenerId: listener.id,
                          phase: listener.actions.length ? "action" : "trigger",
                          actionId: listener.actions[0]?.id,
                        });
                        openBehaviorStudio("studio");
                      }}
                      className={actionButtonClass("secondary")}
                    >
                      Edit
                    </button>
                  </div>
                </div>
              );
              })}
            </div>
          ) : (
            <div className="app-muted-card mt-4 p-4 text-sm text-slate-500">
              {scopeListeners.length
                ? "No interaction flows match the current search."
                : "No behavior flows yet for this scope. Start a listener or event flow in the studio instead of building it inline in the inspector."}
            </div>
          )}
        </div>
        ) : null}
      </div>
    );
  }

  function renderBehaviorCreationGuide() {
    if (!behaviorStudioCreationKind) {
      return null;
    }

    const isRuleCreation = behaviorStudioCreationKind === "rule";
    const isEventCreation = behaviorStudioCreationKind === "event";
    const availableEventPresets = runtimePresets.filter((preset) =>
      preset.label.toLowerCase().includes("emit") || preset.id.includes("emit") || preset.id.includes("event"),
    );
    const visibleFlowPresets = isEventCreation && availableEventPresets.length ? availableEventPresets : runtimePresets;
    const title =
      behaviorStudioCreationKind === "rule"
        ? "Create rule"
        : behaviorStudioCreationKind === "event"
          ? "Create event flow"
          : "Create listener";
    const summary =
      behaviorStudioCreationKind === "rule"
        ? "Choose the state change this field should control, then refine the condition in the editor."
        : behaviorStudioCreationKind === "event"
          ? "Choose the event pattern to emit, then refine payload and follow-up actions in the editor."
          : "Choose a trigger/action starter, then refine the chain in the editor.";

    return (
      <div className="rounded-[0.95rem] border border-blue-200 bg-blue-50/60 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-blue-700">Guided setup</p>
            <h5 className="mt-1 text-base font-semibold text-slate-950">{title}</h5>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-700">{summary}</p>
          </div>
          <button type="button" onClick={() => setBehaviorStudioCreationKind(null)} className={actionButtonClass("secondary")}>
            Cancel setup
          </button>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-[0.85rem] border border-blue-200 bg-white p-3">
            <p className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">1. Scope</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-950">{currentBehaviorSelectionSummary()}</p>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
              {activeRuntimeScope?.label ?? (selectedAuthoring?.kind === "field" ? activeBuilderField?.label : activeStep?.title) ?? "Current selection"}
            </p>
          </div>
          <div className="rounded-[0.85rem] border border-blue-200 bg-white p-3">
            <p className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">2. Starter</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">
              {isRuleCreation ? "Condition and effect" : isEventCreation ? "Event and payload" : "Trigger and actions"}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              {isRuleCreation ? "Pick the state effect first." : "Pick the flow shape first."}
            </p>
          </div>
          <div className="rounded-[0.85rem] border border-blue-200 bg-white p-3">
            <p className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">3. Edit</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">Refine in editor</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">Starter opens as a focused editor.</p>
          </div>
        </div>

        {isRuleCreation ? (
          selectedAuthoring?.kind === "field" && activeBuilderField ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {[
                { id: "show", label: "Show or hide", detail: "Control whether this field is visible.", starter: { mode: "single" as const, effect: "show" as const } },
                { id: "require", label: "Require or relax", detail: "Control when this field is required.", starter: { mode: "single" as const, effect: "require" as const } },
                { id: "disable", label: "Enable or disable", detail: "Control whether this field can be edited.", starter: { mode: "single" as const, effect: "disable" as const } },
                { id: "show-require", label: "Show and require", detail: "Use one condition for visibility and required state.", starter: { mode: "bundle" as const, effects: ["show", "require"] as ConditionalRule["effect"][] } },
                { id: "show-lock", label: "Show and lock", detail: "Use one condition for visibility and editability.", starter: { mode: "bundle" as const, effects: ["show", "disable"] as ConditionalRule["effect"][] } },
              ].map((option) => (
                <button
                  key={`creation-rule-${option.id}`}
                  type="button"
                  onClick={() => applyBehaviorRuleStarter(option.starter)}
                  className="rounded-[0.85rem] border border-blue-200 bg-white px-3 py-2.5 text-left transition hover:border-blue-400 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                >
                  <p className="text-sm font-semibold text-slate-950">{option.label}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{option.detail}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="app-muted-card mt-3 p-4 text-sm text-slate-500">Select a field before creating a state rule.</div>
          )
        ) : activeRuntimeScope ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {visibleFlowPresets.map((preset) => (
              <button
                key={`creation-flow-${preset.id}`}
                type="button"
                onClick={() => applyBehaviorFlowPreset(preset.id)}
                className="rounded-[0.85rem] border border-blue-200 bg-white px-3 py-2.5 text-left transition hover:border-blue-400 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              >
                <p className="text-sm font-semibold text-slate-950">{preset.label}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{preset.description}</p>
              </button>
            ))}
            <button
              type="button"
              onClick={() => createBlankBehaviorStudioListener(isEventCreation ? "event" : "listener")}
              className="rounded-[0.85rem] border border-dashed border-blue-300 bg-white px-3 py-2.5 text-left transition hover:border-blue-400 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            >
              <p className="text-sm font-semibold text-slate-950">{isEventCreation ? "Blank event flow" : "Blank listener"}</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Start with {formatLabel(defaultBehaviorTriggerName())} and refine the action chain manually.
              </p>
            </button>
          </div>
        ) : (
          <div className="app-muted-card mt-3 p-4 text-sm text-slate-500">Select a form, button, or interactive field before creating a listener.</div>
        )}
        <div className="sticky bottom-0 -mx-3 mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-blue-100 bg-blue-50/95 px-3 py-2 backdrop-blur">
          <span className="text-xs text-slate-600">Pick a starter to create the behavior object.</span>
          <button type="button" onClick={() => setBehaviorStudioCreationKind(null)} className={actionButtonClass("secondary")}>
            Cancel setup
          </button>
        </div>
      </div>
    );
  }

  function renderBehaviorStudioSurface() {
    const selectedRuleIndex =
      selectedBehaviorNode?.kind === "rule" && selectedAuthoring?.kind === "field" && activeBuilderField
        ? activeBuilderField.conditionals.findIndex((rule) => rule.ruleId === selectedBehaviorNode.ruleId)
        : -1;
    const selectedRule = selectedRuleIndex >= 0 && activeBuilderField ? activeBuilderField.conditionals[selectedRuleIndex] : null;
    const selectedListenerIndex =
      selectedBehaviorNode?.kind === "listener" && activeRuntimeScope
        ? activeRuntimeScope.listeners.findIndex((listener) => listener.id === selectedBehaviorNode.listenerId)
        : -1;
    const selectedListener =
      selectedListenerIndex >= 0 && activeRuntimeScope ? activeRuntimeScope.listeners[selectedListenerIndex] : null;
    const studioBehaviorSummary = currentBehaviorSelectionSummary(selectedRule, selectedListener);

    return (
      <div className="mx-auto max-w-3xl space-y-3">
        {behaviorStudioCreationKind ? (
          renderBehaviorCreationGuide()
        ) : (
          <div className="rounded-[1.05rem] border border-soft bg-white p-3.5 shadow-[0_16px_32px_rgba(15,23,42,0.07)] sm:p-4">
            {selectedRule && selectedRuleIndex >= 0 ? (
              renderConditionalRuleEditor(selectedRule, selectedRuleIndex)
            ) : selectedListener && selectedListenerIndex >= 0 ? (
              renderRuntimeListenerComposer(selectedListener, selectedListenerIndex, {
                selectedActionId:
                  selectedBehaviorNode?.kind === "listener" && selectedBehaviorNode.phase === "action"
                    ? selectedBehaviorNode.actionId ?? null
                    : null,
              })
            ) : (
              <div className="rounded-[0.95rem] border border-dashed border-slate-300 bg-slate-50 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Create behavior</p>
                <h5 className="mt-1.5 text-base font-semibold text-slate-950">Choose the next behavior object for this selection</h5>
                <p className="mt-2 max-w-2xl text-sm leading-5 text-slate-600">
                  The create path keeps one rule, listener, or event flow in focus so wiring does not start with a long manager stack.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={openBehaviorStudioRule} disabled={selectedAuthoring?.kind !== "field"} className={actionButtonClass("primary")}>
                    Add rule
                  </button>
                  <button type="button" onClick={() => openBehaviorStudioListener("listener")} disabled={!activeRuntimeScope} className={actionButtonClass()}>
                    Add listener
                  </button>
                  <button type="button" onClick={() => openBehaviorStudioListener("event")} disabled={!activeRuntimeScope} className={actionButtonClass("secondary")}>
                    Add event flow
                  </button>
                  <button type="button" onClick={() => setBehaviorStudioMode("manage")} className={actionButtonClass("secondary")}>
                    Open manager
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="app-pill">{studioBehaviorSummary}</span>
                  {activeRuntimeScope ? <span className="app-pill">{activeRuntimeScope.label}</span> : null}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderBehaviorStudioTestPanel() {
    const selectedRuleIndex =
      selectedBehaviorNode?.kind === "rule" && selectedAuthoring?.kind === "field" && activeBuilderField
        ? activeBuilderField.conditionals.findIndex((rule) => rule.ruleId === selectedBehaviorNode.ruleId)
        : -1;
    const selectedRule = selectedRuleIndex >= 0 && activeBuilderField ? activeBuilderField.conditionals[selectedRuleIndex] : null;
    const selectedListenerIndex =
      selectedBehaviorNode?.kind === "listener" && activeRuntimeScope
        ? activeRuntimeScope.listeners.findIndex((listener) => listener.id === selectedBehaviorNode.listenerId)
        : -1;
    const selectedListener =
      selectedListenerIndex >= 0 && activeRuntimeScope ? activeRuntimeScope.listeners[selectedListenerIndex] : null;
    const selectedBehaviorSummary = currentBehaviorSelectionSummary(selectedRule, selectedListener);
    const authoredRuntimeTraceEntries = runtimeTraceEntries.filter(isAuthoredRuntimeEvidenceEntry);
    const selectedAuthoredTraceEvidence =
      authoredRuntimeTraceEntries.find((entry) => getRuntimeTraceEntryKey(entry) === selectedRuntimeEvidenceKey) ??
      authoredRuntimeTraceEntries[0] ??
      null;
    const resolveRuntimeEvidenceNodeLabel = (nodeId: unknown, fallbackType?: string | null) => {
      if (typeof nodeId === "string" && nodeId) {
        return runtimeNodeLabelById.get(nodeId) ?? nodeId;
      }
      if (fallbackType === "form") {
        return activeDocument ? `Form · ${activeDocument.title}` : "Form";
      }
      return "Unknown node";
    };
    const selectedStructuredTraceEvidence = selectedAuthoredTraceEvidence
      ? buildStructuredRuntimeTraceEvidence(selectedAuthoredTraceEvidence, resolveRuntimeEvidenceNodeLabel)
      : null;

    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <div className="rounded-[0.95rem] border border-soft bg-white p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Simulator</p>
              <h4 className="mt-1 truncate text-base font-semibold text-slate-950">{selectedBehaviorSummary}</h4>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Run the selected behavior without leaving the anchored authoring context.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="app-pill">Submit {runtimeSessionState?.submit.status ?? "idle"}</span>
              <span className="app-pill">
                {runtimeSessionState?.validation.valid === false ? "Validation blocked" : "Validation ready"}
              </span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleTestSelectedRule(selectedRule)}
              disabled={!selectedRule}
              className={actionButtonClass(selectedRule ? "primary" : "secondary")}
            >
              Test this rule
            </button>
            <button
              type="button"
              onClick={() => handleTestSelectedChain(selectedListener)}
              disabled={!selectedListener}
              className={actionButtonClass(selectedListener ? "primary" : "secondary")}
            >
              Test this chain
            </button>
            <button type="button" onClick={handleRunCurrentRuntimeStep} disabled={!activeStep} className={actionButtonClass()}>
              Run current step
            </button>
            <button type="button" onClick={handleResetRuntimeSession} className={actionButtonClass("secondary")}>
              Reset
            </button>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-[0.85rem] border border-soft bg-white p-3">
            <p className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">Runtime step</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-950">{runtimeActiveStep?.title ?? activeStep?.title ?? "No active step"}</p>
          </div>
          <div className="rounded-[0.85rem] border border-soft bg-white p-3">
            <p className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">Latest event</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-950">{runtimeTraceEntries[0]?.event.type ?? "No runtime events"}</p>
          </div>
          <div className="rounded-[0.85rem] border border-soft bg-white p-3">
            <p className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">Authored effects</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">{authoredRuntimeTraceEntries.length}</p>
          </div>
        </div>

        <div className="rounded-[0.95rem] border border-blue-200 bg-blue-50/60 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-blue-700">Latest runtime effect</p>
              <h5 className="mt-1 text-sm font-semibold text-slate-950">
                {selectedStructuredTraceEvidence?.heading ?? "No authored runtime evidence yet"}
              </h5>
              <p className="mt-1 text-xs leading-5 text-slate-700">
                {selectedStructuredTraceEvidence?.summary ??
                  "Run a selected rule or chain to inspect emitted events and host actions here."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedRuntimeEvidenceKey(null)}
              disabled={!authoredRuntimeTraceEntries.length}
              className={actionButtonClass("secondary")}
            >
              Show latest
            </button>
          </div>
          {selectedStructuredTraceEvidence ? (
            <div className="mt-3 grid gap-2">
              {selectedStructuredTraceEvidence.payloadEntries.slice(0, 4).map((entry) => (
                <div key={`studio-test-payload-${entry.key}`} className="flex items-start justify-between gap-3 rounded-[0.8rem] border border-blue-100 bg-white px-3 py-2">
                  <span className="text-xs font-semibold text-slate-700">{entry.key}</span>
                  <span className="max-w-[62%] truncate text-right text-xs text-slate-600">{entry.value}</span>
                </div>
              ))}
              {selectedStructuredTraceEvidence.payloadEntries.length > 4 ? (
                <span className="text-xs text-slate-500">
                  {selectedStructuredTraceEvidence.payloadEntries.length - 4} more payload fields available in Runtime lab.
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="sticky bottom-0 -mx-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-[#f5f7fb]/95 px-3 py-2 backdrop-blur">
          <span className="text-xs text-slate-600">Need raw traces, host loop, or session JSON?</span>
          <button
            type="button"
            onClick={() => {
              setBehaviorStudioAnchor(null);
              setBehaviorStudioCreationKind(null);
              setBehaviorFocusTarget(null);
              setBehaviorStudioMode("test");
              setBehaviorStudioView("advanced");
            }}
            className={actionButtonClass("secondary")}
          >
            Open runtime lab
          </button>
        </div>
      </div>
    );
  }

  function handleBehaviorGraphPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary) {
      return;
    }
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("button, input, textarea, select, label, a")) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    behaviorGraphDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: behaviorGraphOffset.x,
      originY: behaviorGraphOffset.y,
    };
  }

  function handleBehaviorGraphPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = behaviorGraphDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    setBehaviorGraphOffset({
      x: drag.originX + (event.clientX - drag.startX),
      y: drag.originY + (event.clientY - drag.startY),
    });
  }

  function handleBehaviorGraphPointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (behaviorGraphDragRef.current?.pointerId !== event.pointerId) {
      return;
    }
    behaviorGraphDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleBehaviorGraphViewportKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }
    const panStep = event.shiftKey ? 120 : 48;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setBehaviorGraphOffset((current) => ({ ...current, x: current.x + panStep }));
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setBehaviorGraphOffset((current) => ({ ...current, x: current.x - panStep }));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setBehaviorGraphOffset((current) => ({ ...current, y: current.y + panStep }));
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setBehaviorGraphOffset((current) => ({ ...current, y: current.y - panStep }));
      return;
    }
    if (event.key === "Home" || event.key === "0") {
      event.preventDefault();
      resetBehaviorGraphViewport();
    }
  }

  function resetDocumentBehaviorGraphViewport() {
    setDocumentBehaviorGraphZoom(1);
    setDocumentBehaviorGraphOffset({ x: 0, y: 0 });
  }

  function handleDocumentBehaviorGraphPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary) {
      return;
    }
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("button, input, textarea, select, label, a")) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    documentBehaviorGraphDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: documentBehaviorGraphOffset.x,
      originY: documentBehaviorGraphOffset.y,
    };
  }

  function handleDocumentBehaviorGraphPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = documentBehaviorGraphDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    setDocumentBehaviorGraphOffset({
      x: drag.originX + (event.clientX - drag.startX),
      y: drag.originY + (event.clientY - drag.startY),
    });
  }

  function handleDocumentBehaviorGraphPointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (documentBehaviorGraphDragRef.current?.pointerId !== event.pointerId) {
      return;
    }
    documentBehaviorGraphDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleDocumentBehaviorGraphViewportKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }
    const panStep = event.shiftKey ? 140 : 56;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setDocumentBehaviorGraphOffset((current) => ({ ...current, x: current.x + panStep }));
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setDocumentBehaviorGraphOffset((current) => ({ ...current, x: current.x - panStep }));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setDocumentBehaviorGraphOffset((current) => ({ ...current, y: current.y + panStep }));
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setDocumentBehaviorGraphOffset((current) => ({ ...current, y: current.y - panStep }));
      return;
    }
    if (event.key === "Home" || event.key === "0") {
      event.preventDefault();
      resetDocumentBehaviorGraphViewport();
    }
  }

  function renderMapRuleFlowCard(rule: LogicMapConditionalEntry) {
    return (
      <div key={rule.id} className="rounded-[1rem] border border-soft bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">State flow</p>
            <p className="mt-2 font-semibold text-slate-950">{rule.targetFieldLabel}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{rule.detail}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              focusBehaviorGraphNode({
                selection: rule.sourceSelection,
                graphSelection: rule.graphSelection,
                ruleIndex: rule.ruleIndex,
                filter: "state",
                mode: "focus",
                viewport: "reset",
                entryContext: {
                  source: "map",
                  title: "Opened from Map",
                  detail: `State flow handoff from ${mapViewMode === "graph" ? "Graph overview" : "Summary list"} into the focused graph workspace.`,
                },
              });
            }}
            className={actionButtonClass()}
          >
            Open in graph
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {renderBehaviorGraphNode({
            eyebrow: "Trigger",
            title: `Watch ${rule.sourceFieldLabel}`,
            detail: `Observe ${rule.sourceFieldLabel} as the source input.`,
            tone: "blue",
          })}
          {renderBehaviorEdgeLabel("When")}
          {renderBehaviorGraphNode({
            eyebrow: "Condition",
            title: "Evaluate rule",
            detail: rule.detail,
            tone: "amber",
          })}
          {renderBehaviorEdgeLabel("Then")}
          {renderBehaviorGraphNode({
            eyebrow: "Effect",
            title: `${formatLabel(rule.effectLabel)} ${rule.targetFieldLabel}`,
            detail: `Apply the ${rule.effectLabel} effect to ${rule.targetFieldLabel}.`,
            tone: "emerald",
          })}
        </div>
      </div>
    );
  }

  function renderMapListenerFlowCard(listener: LogicMapListenerEntry) {
    return (
      <div key={listener.id} className="rounded-[1rem] border border-soft bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{listener.scopeLabel}</p>
            <p className="mt-2 font-semibold text-slate-950">When {formatLabel(listener.eventName)}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{listener.actionsSummary}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              focusBehaviorGraphNode({
                selection: listener.selection,
                graphSelection: listener.graphSelection,
                filter: "interaction",
                mode: "focus",
                viewport: "reset",
                entryContext: {
                  source: "map",
                  title: "Opened from Map",
                  detail: `Interaction flow handoff from ${mapViewMode === "graph" ? "Graph overview" : "Summary list"} into the focused graph workspace.`,
                },
              });
            }}
            className={actionButtonClass()}
          >
            Open in graph
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {renderBehaviorGraphNode({
            eyebrow: "Trigger",
            title: `When ${formatLabel(listener.eventName)}`,
            detail: `${listener.scopeLabel} listens for this event.`,
            tone: "blue",
          })}
          {renderBehaviorEdgeLabel("Then")}
          {renderBehaviorGraphNode({
            eyebrow: "Action",
            title: `${listener.actionCount} action${listener.actionCount === 1 ? "" : "s"}`,
            detail: listener.actionsSummary,
            tone: "emerald",
          })}
        </div>
      </div>
    );
  }

  function buildBehaviorScopeClustersForStep(step: LogicMapStepEntry): BehaviorScopeCluster[] {
    const clusters = new Map<string, BehaviorScopeCluster>();
    const ensureCluster = (config: {
      key: string;
      title: string;
      kindLabel: string;
      selection: AuthoringSelection | null;
    }) => {
      const existing = clusters.get(config.key);
      if (existing) {
        return existing;
      }
      const cluster: BehaviorScopeCluster = {
        key: config.key,
        title: config.title,
        kindLabel: config.kindLabel,
        detail: "",
        rules: [],
        listeners: [],
        selection: config.selection,
      };
      clusters.set(config.key, cluster);
      return cluster;
    };

    step.conditionalRules.forEach((rule) => {
      const [kindLabel, ...labelParts] = rule.scopeLabel.split(" · ");
      const title = labelParts.join(" · ") || rule.targetFieldLabel;
      ensureCluster({
        key: rule.scopeLabel,
        title,
        kindLabel,
        selection: rule.sourceSelection,
      }).rules.push(rule);
    });

    step.runtimeListeners.forEach((listener) => {
      const [kindLabel, ...labelParts] = listener.scopeLabel.split(" · ");
      const title = labelParts.join(" · ") || listener.scopeLabel;
      ensureCluster({
        key: listener.scopeLabel,
        title,
        kindLabel,
        selection: listener.selection,
      }).listeners.push(listener);
    });

    return Array.from(clusters.values()).map((cluster) => ({
      ...cluster,
      detail: `${cluster.rules.length} state rule${cluster.rules.length === 1 ? "" : "s"} · ${cluster.listeners.length} interaction flow${
        cluster.listeners.length === 1 ? "" : "s"
      }`,
    }));
  }

function buildBehaviorScopeClustersForDocument(steps: LogicMapStepEntry[]): BehaviorScopeCluster[] {
  return steps.map((step) => ({
      key: step.id,
      title: step.title,
      kindLabel: "Step",
      detail: `${step.conditionalRules.length} state rule${step.conditionalRules.length === 1 ? "" : "s"} · ${step.runtimeListeners.length} interaction flow${
        step.runtimeListeners.length === 1 ? "" : "s"
      }`,
      rules: step.conditionalRules,
      listeners: step.runtimeListeners,
      selection: step.selection,
  }));
}

function authoringSelectionsMatch(left: AuthoringSelection | null, right: AuthoringSelection | null) {
  if (!left || !right || left.kind !== right.kind) {
    return false;
  }
  if (left.stepId !== right.stepId) {
    return false;
  }
  switch (left.kind) {
    case "step":
      return true;
    case "section":
      return left.sectionId === (right.kind === "section" ? right.sectionId : null);
    case "group":
      return left.sectionId === (right.kind === "group" ? right.sectionId : null) && left.groupId === (right.kind === "group" ? right.groupId : null);
    case "field":
      return (
        left.sectionId === (right.kind === "field" ? right.sectionId : null) &&
        (left.groupId ?? null) === (right.kind === "field" ? right.groupId ?? null : null) &&
        left.fieldId === (right.kind === "field" ? right.fieldId : null)
      );
  }
}

  function renderMapGraphOverview() {
    if (!logicMapData) {
      return (
        <div className="app-muted-card p-4 text-sm text-slate-500">
          No logic map is available until a document is loaded.
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="rounded-[1.15rem] border border-soft bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Graph overview</p>
              <h4 className="mt-2 text-lg font-semibold text-slate-950">Document-wide behavior graph</h4>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Scan the same trigger, condition, and effect language across the whole document, then jump into focused editing only when needed.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setBehaviorGraphEntryContext({
                  source: "map",
                  title: "Opened from Map",
                  detail: "Graph overview handed you into the behavior workspace. Choose a step, rule, or flow to continue editing.",
                });
                resetBehaviorGraphViewport();
                setInspectorTab("behavior");
                setBehaviorStudioMode("graph");
                setBehaviorStudioView("advanced");
                setBehaviorStudioOpen(true);
              }}
              className={actionButtonClass("secondary")}
            >
              Open behavior
            </button>
          </div>
	          <div className="mt-4 flex flex-wrap gap-2">
	            <span className="app-pill">{logicMapData.steps.length} steps</span>
	            <span className="app-pill">{logicMapData.totalConditionals} state rules</span>
	            <span className="app-pill">{logicMapData.totalListeners} behavior flows</span>
	          </div>
	        </div>
	        <div className="rounded-[1.15rem] border border-soft bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Form runtime</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                Document-level orchestration stays in the same graph language as node-level behavior.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                focusBehaviorGraphNode({
                  selection: null,
                  graphSelection: logicMapData.formListeners[0]?.graphSelection ?? null,
                  filter: "interaction",
                  mode: "focus",
                  viewport: "reset",
                  entryContext: {
                    source: "map",
                    title: "Opened from Map",
                    detail: "Form-level runtime opened from Graph overview into the focused behavior workspace.",
                  },
                })
              }
              className={actionButtonClass(logicMapData.formListeners.length ? "primary" : "secondary")}
              disabled={!logicMapData.formListeners.length}
            >
              Open form behavior
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {logicMapData.formListeners.length ? (
              logicMapData.formListeners.map((listener) => renderMapListenerFlowCard(listener))
            ) : (
              <div className="app-muted-card p-4 text-sm text-slate-500">
                No form-level behavior yet. Use the Behavior editor when the document needs load, submit, or host-level orchestration.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {logicMapData.steps.map((step) => (
            <div key={step.id} className="rounded-[1.15rem] border border-soft bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Step graph</p>
                  <h4 className="mt-2 text-lg font-semibold text-slate-950">{step.title}</h4>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="app-pill">{step.sectionCount} sections</span>
                    <span className="app-pill">{step.fieldCount} fields</span>
                    <span className="app-pill">{step.conditionalRules.length} rules</span>
                    <span className="app-pill">{step.runtimeListeners.length} flows</span>
                  </div>
                </div>
                <button type="button" onClick={() => setSelectedAuthoring(step.selection)} className={actionButtonClass()}>
                  Focus step
                </button>
              </div>

              <div className="mt-4 space-y-4">
                <div className="rounded-[1rem] border border-soft bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">State rules</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    Visibility, requirement, and field-state logic read here as rule chains instead of summaries.
                  </p>
                  <div className="mt-4 space-y-3">
                    {step.conditionalRules.length ? (
                      step.conditionalRules.map((rule) => renderMapRuleFlowCard(rule))
                    ) : (
                      <div className="app-muted-card p-4 text-sm text-slate-500">
                        No field state rules in this step yet.
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-[1rem] border border-soft bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Interaction flows</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    Step, section, group, and field listeners all compress into the same trigger-to-action graph pattern.
                  </p>
                  <div className="mt-4 space-y-3">
                    {step.runtimeListeners.length ? (
                      step.runtimeListeners.map((listener) => renderMapListenerFlowCard(listener))
                    ) : (
                      <div className="app-muted-card p-4 text-sm text-slate-500">
                        No interaction flows in this step yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderBehaviorWorkspace() {
    const selectedRuleIndex =
      selectedBehaviorNode?.kind === "rule" && selectedAuthoring?.kind === "field" && activeBuilderField
        ? activeBuilderField.conditionals.findIndex((rule) => rule.ruleId === selectedBehaviorNode.ruleId)
        : -1;
    const selectedRule =
      selectedRuleIndex >= 0 && activeBuilderField ? activeBuilderField.conditionals[selectedRuleIndex] : null;
    const selectedListenerIndex =
      selectedBehaviorNode?.kind === "listener" && activeRuntimeScope
        ? activeRuntimeScope.listeners.findIndex((listener) => listener.id === selectedBehaviorNode.listenerId)
        : -1;
    const selectedListener =
      selectedListenerIndex >= 0 && activeRuntimeScope ? activeRuntimeScope.listeners[selectedListenerIndex] : null;
    const stateRules = activeBuilderField?.conditionals ?? [];
    const interactionFlows = activeRuntimeScope?.listeners ?? [];
    const hasStateRules = Boolean(stateRules.length);
    const hasInteractionFlows = Boolean(interactionFlows.length);
    const hasGraph = hasStateRules || hasInteractionFlows;
    const showStateFlows = behaviorGraphFilter === "all" || behaviorGraphFilter === "state";
    const showInteractionFlows = behaviorGraphFilter === "all" || behaviorGraphFilter === "interaction";
    const visibleStateRules = showStateFlows ? stateRules : [];
    const visibleInteractionFlows = showInteractionFlows ? interactionFlows : [];
    const visibleStateRuleGroups = buildConditionalRuleGroups(visibleStateRules);
    const hasVisibleGraph = Boolean(visibleStateRules.length || visibleInteractionFlows.length);
    const focusedRuleId =
      selectedBehaviorNode?.kind === "rule" && visibleStateRules.some((rule) => rule.ruleId === selectedBehaviorNode.ruleId)
        ? selectedBehaviorNode.ruleId
        : visibleStateRules[0]?.ruleId ?? null;
    const focusedListenerId =
      selectedBehaviorNode?.kind === "listener" &&
      visibleInteractionFlows.some((listener) => listener.id === selectedBehaviorNode.listenerId)
        ? selectedBehaviorNode.listenerId
        : visibleInteractionFlows[0]?.id ?? null;
    const displayedStateRules =
      behaviorGraphMode === "focus" && focusedRuleId
        ? visibleStateRules.filter((rule) => rule.ruleId === focusedRuleId)
        : visibleStateRules;
    const displayedStateRuleGroups =
      behaviorGraphMode === "focus" && focusedRuleId
        ? visibleStateRuleGroups.filter((group) => group.members.some((member) => member.rule.ruleId === focusedRuleId))
        : visibleStateRuleGroups;
    const displayedInteractionFlows =
      behaviorGraphMode === "focus" && focusedListenerId
        ? visibleInteractionFlows.filter((listener) => listener.id === focusedListenerId)
        : visibleInteractionFlows;
    const totalVisibleFlows = visibleStateRules.length + visibleInteractionFlows.length;
    const hasFlowNavigator =
      behaviorGraphMode === "focus" &&
      (visibleStateRules.length + visibleInteractionFlows.length > 1 ||
        visibleStateRules.length > 1 ||
        visibleInteractionFlows.length > 1);
    const graphZoomPercent = Math.round(behaviorGraphZoom * 100);
    const graphCompact = behaviorGraphDensity === "dense";
    const graphFitZoom =
      behaviorGraphMode === "overview"
        ? totalVisibleFlows >= 6
          ? 0.78
          : totalVisibleFlows >= 4
            ? 0.88
            : 0.96
        : totalVisibleFlows >= 3
          ? 0.92
          : 1;
    const graphPanStyle = {
      transform: `translate3d(${behaviorGraphOffset.x}px, ${behaviorGraphOffset.y}px, 0)`,
    } satisfies React.CSSProperties;
    const graphViewportStyle = {
      transform: `scale(${behaviorGraphZoom})`,
      transformOrigin: "top left",
      width: `${100 / behaviorGraphZoom}%`,
    } satisfies React.CSSProperties;
    const graphSectionGridClass =
      behaviorGraphMode === "overview"
        ? graphCompact
          ? "grid gap-3 2xl:grid-cols-3"
          : "grid gap-3 xl:grid-cols-2"
        : graphCompact
          ? "grid gap-3 xl:grid-cols-2"
          : "space-y-3";
    const selectedBehaviorSummary = currentBehaviorSelectionSummary(selectedRule, selectedListener);
    const currentGraphLocationLabel =
      selectedAuthoring === null
        ? "Form runtime"
        : selectedAuthoring.kind === "field"
          ? `Field · ${activeBuilderField?.label ?? "Current field"}`
          : selectedAuthoring.kind === "group"
            ? `Group · ${activeGroup?.label ?? "Current group"}`
            : selectedAuthoring.kind === "section"
              ? `Section · ${activeSection?.title ?? "Current section"}`
              : `Step · ${activeStep?.title ?? "Current step"}`;
    const latestTraceEntry = runtimeTraceEntries[0] ?? null;
    const authoredRuntimeTraceEntries = runtimeTraceEntries.filter(isAuthoredRuntimeEvidenceEntry);
    const selectedAuthoredTraceEvidence =
      authoredRuntimeTraceEntries.find((entry) => getRuntimeTraceEntryKey(entry) === selectedRuntimeEvidenceKey) ??
      authoredRuntimeTraceEntries[0] ??
      null;
    const selectedAuthoredTraceEvidenceKey = selectedAuthoredTraceEvidence
      ? getRuntimeTraceEntryKey(selectedAuthoredTraceEvidence)
      : null;
    const isShowingLatestAuthoredEvidence =
      selectedAuthoredTraceEvidence !== null &&
      authoredRuntimeTraceEntries[0] !== undefined &&
      getRuntimeTraceEntryKey(selectedAuthoredTraceEvidence) === getRuntimeTraceEntryKey(authoredRuntimeTraceEntries[0]);
    const resolveRuntimeEvidenceNodeLabel = (nodeId: unknown, fallbackType?: string | null) => {
      if (typeof nodeId === "string" && nodeId) {
        return runtimeNodeLabelById.get(nodeId) ?? nodeId;
      }
      if (fallbackType === "form") {
        return activeDocument ? `Form · ${activeDocument.title}` : "Form";
      }
      return "Unknown node";
    };
    const selectedStructuredTraceEvidence = selectedAuthoredTraceEvidence
      ? buildStructuredRuntimeTraceEvidence(selectedAuthoredTraceEvidence, resolveRuntimeEvidenceNodeLabel)
      : null;
    const selectedTraceIndex = selectedAuthoredTraceEvidence
      ? runtimeTraceEntries.findIndex((entry) => getRuntimeTraceEntryKey(entry) === getRuntimeTraceEntryKey(selectedAuthoredTraceEvidence))
      : -1;
    const selectedTraceChain = selectedTraceIndex >= 0
        ? (() => {
          const olderRelevantIndices: number[] = [];
          for (let index = selectedTraceIndex + 1; index < runtimeTraceEntries.length && olderRelevantIndices.length < 2; index += 1) {
            if (isRuntimeTraceChainRelevantEntry(runtimeTraceEntries[index])) {
              olderRelevantIndices.push(index);
            }
          }
          const newerRelevantIndices: number[] = [];
          for (let index = selectedTraceIndex - 1; index >= 0 && newerRelevantIndices.length < 1; index -= 1) {
            if (isRuntimeTraceChainRelevantEntry(runtimeTraceEntries[index])) {
              newerRelevantIndices.push(index);
            }
          }
          const chronologicalOlderIndices = [...olderRelevantIndices].reverse();
          const relevantIndices = [...chronologicalOlderIndices, selectedTraceIndex, ...newerRelevantIndices];
          return relevantIndices.map<RuntimeTraceChainStep>((index) => {
            const entry = runtimeTraceEntries[index];
            const summary = buildRuntimeTraceContextSummary(entry, resolveRuntimeEvidenceNodeLabel);
            return {
              ...summary,
              role:
                index === selectedTraceIndex
                  ? "selected"
                  : index > selectedTraceIndex
                    ? chronologicalOlderIndices.length > 0 && index === chronologicalOlderIndices[0]
                      ? "trigger"
                      : "before"
                    : "after",
            };
          });
        })()
      : [];
    const authoredTraceChainSummaries = authoredRuntimeTraceEntries.reduce<RuntimeTraceChainSummary[]>((groups, entry) => {
      const correlationId = entry.event.correlationId;
      if (groups.some((group) => group.correlationId === correlationId)) {
        return groups;
      }
      const correlationEntries = runtimeTraceEntries.filter(
        (candidate) => candidate.event.correlationId === correlationId && isRuntimeTraceChainRelevantEntry(candidate),
      );
      const authoredEntries = correlationEntries.filter(isAuthoredRuntimeEvidenceEntry);
      if (!authoredEntries.length) {
        return groups;
      }
      const chronologicalEntries = [...correlationEntries].reverse();
      const triggerEntry = chronologicalEntries.find((candidate) => !isAuthoredRuntimeEvidenceEntry(candidate)) ?? null;
      const primaryEntry = authoredEntries[0];
      const sourceLabel = triggerEntry
        ? resolveRuntimeEvidenceNodeLabel(triggerEntry.event.source.nodeId, triggerEntry.event.source.nodeType)
        : resolveRuntimeEvidenceNodeLabel(primaryEntry.event.source.nodeId, primaryEntry.event.source.nodeType);
      const stepLabels = chronologicalEntries.map((candidate) => candidate.event.type);
      groups.push({
        correlationId,
        entryKey: getRuntimeTraceEntryKey(primaryEntry),
        title: stepLabels.join(" -> "),
        summary: `Started from ${sourceLabel} with ${authoredEntries.length} authored ${
          authoredEntries.length === 1 ? "step" : "steps"
        } captured in this chain.`,
        stepLabels,
        authoredCount: authoredEntries.length,
        latestTimestamp: primaryEntry.event.timestamp,
        active: selectedAuthoredTraceEvidenceKey
          ? authoredEntries.some((candidate) => getRuntimeTraceEntryKey(candidate) === selectedAuthoredTraceEvidenceKey)
          : false,
      });
      return groups;
    }, []);
    const canRunSubmit = Boolean(activeDocument);
    const canResolveHostLoop = runtimeSessionState?.submit.status === "submitting";
    const runtimeSubmitPayloadBytes = formatBytes(estimateJsonBytes(runtimeSubmitPreview));
    const runtimeSessionSnapshotBytes = formatBytes(estimateJsonBytes(runtimeSessionState));
    const activeLogicMapStep =
      selectedAuthoring?.kind === "step" ? logicMapData?.steps.find((step) => step.id === selectedAuthoring.stepId) ?? null : null;
    const activeNavigatorStepId = selectedAuthoring === null ? null : activeStep?.id ?? null;
    const behaviorScopeClusters =
      selectedAuthoring === null && logicMapData
        ? buildBehaviorScopeClustersForDocument(logicMapData.steps)
        : activeLogicMapStep
          ? buildBehaviorScopeClustersForStep(activeLogicMapStep)
          : [];
    const documentBehaviorOverviewLanes =
      logicMapData?.steps.map((step) => ({
        step,
        clusters: buildBehaviorScopeClustersForStep(step),
      })) ?? [];
    const clusterMatchesDocumentBehaviorFilters = (cluster: BehaviorScopeCluster) =>
      (behaviorGraphFilter === "all"
        ? cluster.rules.length || cluster.listeners.length
        : behaviorGraphFilter === "state"
          ? cluster.rules.length
          : cluster.listeners.length) &&
      (documentBehaviorClusterFocus === "all" || normalizeDocumentBehaviorClusterKind(cluster.kindLabel) === documentBehaviorClusterFocus);
    const getVisibleDocumentBehaviorClusters = (clusters: BehaviorScopeCluster[]) => clusters.filter((cluster) => clusterMatchesDocumentBehaviorFilters(cluster));
  const documentBehaviorGlobalClusterGroups = Array.from(
      documentBehaviorOverviewLanes.reduce((groupMap, { step, clusters }) => {
        getVisibleDocumentBehaviorClusters(clusters).forEach((cluster) => {
          const key = normalizeDocumentBehaviorClusterKind(cluster.kindLabel);
          const existing = groupMap.get(key) ?? {
            key,
            label: `${cluster.kindLabel} scopes`,
            firstLaneId: step.id,
            scopeCount: 0,
            laneIds: new Set<string>(),
            ruleCount: 0,
            listenerCount: 0,
          };
          existing.scopeCount += 1;
          existing.laneIds.add(step.id);
          existing.ruleCount += cluster.rules.length;
          existing.listenerCount += cluster.listeners.length;
          groupMap.set(key, existing);
        });
        return groupMap;
      }, new Map<DocumentBehaviorClusterFamily, {
        key: DocumentBehaviorClusterFamily;
        label: string;
        firstLaneId: string | null;
        scopeCount: number;
        laneIds: Set<string>;
        ruleCount: number;
        listenerCount: number;
      }>()),
    )
      .map(([, value]): DocumentBehaviorClusterGroupSummary => ({
        key: value.key,
        label: value.label,
        firstLaneId: value.firstLaneId,
        scopeCount: value.scopeCount,
        laneCount: value.laneIds.size,
        ruleCount: value.ruleCount,
        listenerCount: value.listenerCount,
      }))
      .sort((left, right) => right.scopeCount - left.scopeCount || left.label.localeCompare(right.label));
    const documentBehaviorPinnedLaneIdSet = new Set(documentBehaviorPinnedLaneIds);
    const documentBehaviorVisibleLaneCount =
      1 +
      documentBehaviorOverviewLanes.filter(({ step, clusters }) =>
        step.conditionalRules.length || step.runtimeListeners.length || getVisibleDocumentBehaviorClusters(clusters).length,
      ).length;
    const documentBehaviorMaxClusterCount = documentBehaviorOverviewLanes.reduce((max, { clusters }) => {
      const visibleClusterCount = getVisibleDocumentBehaviorClusters(clusters).length;
      return Math.max(max, visibleClusterCount);
    }, 0);
    const documentBehaviorFitZoom = Math.max(
      0.7,
      Math.min(1, Number((1 - Math.min(0.22, Math.max(0, documentBehaviorVisibleLaneCount - 3) * 0.035 + Math.max(0, documentBehaviorMaxClusterCount - 2) * 0.025)).toFixed(2))),
    );
    const activeDocumentBehaviorTarget: DocumentBehaviorExpandedTarget =
      expandedDocumentBehaviorTarget ?? (selectedAuthoring === null ? "form" : activeNavigatorStepId ?? null);
    const getDocumentBehaviorClustersForFamily = (
      clusters: BehaviorScopeCluster[],
      family: DocumentBehaviorClusterFamily | null,
    ) =>
      family
        ? getVisibleDocumentBehaviorClusters(clusters).filter(
            (cluster) => normalizeDocumentBehaviorClusterKind(cluster.kindLabel) === family,
          )
        : [];
    const getDocumentBehaviorClustersForFamilies = (
      clusters: BehaviorScopeCluster[],
      families: DocumentBehaviorClusterFamily[],
    ) => {
      if (!families.length) {
        return [];
      }
      const familySet = new Set<DocumentBehaviorClusterFamily>(families);
      return getVisibleDocumentBehaviorClusters(clusters).filter((cluster) =>
        familySet.has(normalizeDocumentBehaviorClusterKind(cluster.kindLabel)),
      );
    };
    const documentBehaviorSelectedOverviewCluster =
      documentBehaviorOverviewLanes
        .flatMap(({ clusters }) => getVisibleDocumentBehaviorClusters(clusters))
        .find((cluster) => authoringSelectionsMatch(cluster.selection, selectedAuthoring)) ?? null;
    const documentBehaviorActiveClusterFamily: DocumentBehaviorClusterFamily | null =
      documentBehaviorClusterFocus !== "all"
        ? documentBehaviorClusterFocus
        : documentBehaviorSelectedOverviewCluster
          ? normalizeDocumentBehaviorClusterKind(documentBehaviorSelectedOverviewCluster.kindLabel)
          : null;
    const documentBehaviorTrackedTrailFamilies: DocumentBehaviorClusterFamily[] = Array.from(
      new Set<DocumentBehaviorClusterFamily>([
        ...documentBehaviorTrailFamilies,
        ...(documentBehaviorActiveClusterFamily ? [documentBehaviorActiveClusterFamily] : []),
      ]),
    ).filter((family) => documentBehaviorGlobalClusterGroups.some((group) => group.key === family));
    const documentBehaviorCanvasLanes = [...documentBehaviorOverviewLanes].sort((left, right) => {
      const leftActive = activeDocumentBehaviorTarget === left.step.id ? 1 : 0;
      const rightActive = activeDocumentBehaviorTarget === right.step.id ? 1 : 0;
      if (leftActive !== rightActive) {
        return rightActive - leftActive;
      }
      const leftPinned = documentBehaviorPinnedLaneIdSet.has(left.step.id) ? 1 : 0;
      const rightPinned = documentBehaviorPinnedLaneIdSet.has(right.step.id) ? 1 : 0;
      if (leftPinned !== rightPinned) {
        return rightPinned - leftPinned;
      }
      return left.step.title.localeCompare(right.step.title);
    });
    const documentBehaviorCanvasVisibleLanes = documentBehaviorCanvasLanes.filter(({ step, clusters }) => {
      if (!documentBehaviorCanvasRelevantOnly) {
        return true;
      }
      if (activeDocumentBehaviorTarget === step.id || documentBehaviorPinnedLaneIdSet.has(step.id)) {
        return true;
      }
      if (documentBehaviorTrackedTrailFamilies.length) {
        return getDocumentBehaviorClustersForFamilies(clusters, documentBehaviorTrackedTrailFamilies).length > 0;
      }
      return getVisibleDocumentBehaviorClusters(clusters).length > 0;
    });
    const documentBehaviorCanvasLaneBuckets = [
      {
        key: "featured",
        title: "Focused and pinned lanes",
        description: "Keep the lane you are actively editing and any pinned references together at the top of the canvas.",
        lanes: documentBehaviorCanvasVisibleLanes.filter(
          ({ step }) => activeDocumentBehaviorTarget === step.id || documentBehaviorPinnedLaneIdSet.has(step.id),
        ),
      },
      {
        key: "active",
        title: "Behavior lanes",
        description: "Lanes with authored rules, flows, or currently visible scope clusters stay grouped here for fast scanning.",
        lanes: documentBehaviorCanvasVisibleLanes.filter(({ step, clusters }) => {
          if (activeDocumentBehaviorTarget === step.id || documentBehaviorPinnedLaneIdSet.has(step.id)) {
            return false;
          }
          return Boolean(step.conditionalRules.length || step.runtimeListeners.length || getVisibleDocumentBehaviorClusters(clusters).length);
        }),
      },
      {
        key: "quiet",
        title: "Quiet lanes",
        description: "Lanes without current authored behavior stay out of the way until you need to expand the broader document context.",
        lanes: documentBehaviorCanvasVisibleLanes.filter(({ step, clusters }) => {
          if (activeDocumentBehaviorTarget === step.id || documentBehaviorPinnedLaneIdSet.has(step.id)) {
            return false;
          }
          return !step.conditionalRules.length && !step.runtimeListeners.length && !getVisibleDocumentBehaviorClusters(clusters).length;
        }),
      },
    ].filter((bucket) => bucket.lanes.length);
    const documentBehaviorSelectedCanvasCluster =
      documentBehaviorCanvasVisibleLanes
        .flatMap(({ clusters }) => getVisibleDocumentBehaviorClusters(clusters))
        .find((cluster) => authoringSelectionsMatch(cluster.selection, selectedAuthoring)) ?? null;
    const getDocumentBehaviorRelatedClusters = (clusters: BehaviorScopeCluster[]) =>
      getDocumentBehaviorClustersForFamily(clusters, documentBehaviorActiveClusterFamily);
    const documentBehaviorRelatedLanes = documentBehaviorActiveClusterFamily
      ? documentBehaviorCanvasVisibleLanes
          .map(({ step, clusters }) => ({
            step,
            matchingClusters: getDocumentBehaviorRelatedClusters(clusters),
          }))
          .filter(({ matchingClusters }) => matchingClusters.length)
      : [];
    const activeDocumentBehaviorRelatedLaneIndex =
      documentBehaviorActiveClusterFamily && activeDocumentBehaviorTarget && activeDocumentBehaviorTarget !== "form"
        ? documentBehaviorRelatedLanes.findIndex(({ step }) => step.id === activeDocumentBehaviorTarget)
        : -1;
    const documentBehaviorFamilyTrails = documentBehaviorGlobalClusterGroups
      .map((group) => {
        const lanes = documentBehaviorCanvasVisibleLanes
          .map(({ step, clusters }) => ({
            step,
            matchingClusters: getDocumentBehaviorClustersForFamily(clusters, group.key),
          }))
          .filter(({ matchingClusters }) => matchingClusters.length);
        return {
          ...group,
          lanes,
          activeLaneIndex:
            activeDocumentBehaviorTarget && activeDocumentBehaviorTarget !== "form"
              ? lanes.findIndex(({ step }) => step.id === activeDocumentBehaviorTarget)
              : -1,
          isActive: documentBehaviorActiveClusterFamily === group.key,
          isTracked: documentBehaviorTrackedTrailFamilies.includes(group.key),
        };
      })
      .filter((trail) => trail.lanes.length)
      .sort(
        (left, right) =>
          Number(right.isActive) - Number(left.isActive) ||
          Number(right.isTracked) - Number(left.isTracked) ||
          right.scopeCount - left.scopeCount ||
          left.label.localeCompare(right.label),
      );
    const documentBehaviorTrackedTrailLanes = documentBehaviorTrackedTrailFamilies.length
      ? documentBehaviorCanvasVisibleLanes
          .map(({ step, clusters }) => ({
            step,
            matchingClusters: getDocumentBehaviorClustersForFamilies(clusters, documentBehaviorTrackedTrailFamilies),
          }))
          .filter(({ matchingClusters }) => matchingClusters.length)
      : [];
    const documentBehaviorTrailIntersections = documentBehaviorTrackedTrailFamilies.length > 1
      ? documentBehaviorCanvasVisibleLanes
          .map(({ step, clusters }) => {
            const familyClusters = documentBehaviorTrackedTrailFamilies
              .map((family) => ({
                family,
                clusters: getDocumentBehaviorClustersForFamily(clusters, family),
              }))
              .filter(({ clusters: matchingClusters }) => matchingClusters.length);
            return {
              step,
              familyClusters,
            };
          })
          .filter(({ familyClusters }) => familyClusters.length > 1)
          .sort(
            (left, right) =>
              right.familyClusters.length - left.familyClusters.length ||
              right.familyClusters.reduce((count, entry) => count + entry.clusters.length, 0) -
                left.familyClusters.reduce((count, entry) => count + entry.clusters.length, 0) ||
              left.step.title.localeCompare(right.step.title),
          )
      : [];
    const activeDocumentBehaviorTrailFamilyIndex =
      documentBehaviorActiveClusterFamily && documentBehaviorTrackedTrailFamilies.length
        ? documentBehaviorTrackedTrailFamilies.findIndex((family) => family === documentBehaviorActiveClusterFamily)
        : -1;
    const focusDocumentBehaviorTrailSet = (families: DocumentBehaviorClusterFamily[], stepId?: string | null) => {
      const dedupedFamilies = Array.from(new Set(families)).filter((family) =>
        documentBehaviorGlobalClusterGroups.some((group) => group.key === family),
      );
      setDocumentBehaviorTrailFamilies(dedupedFamilies);
      setDocumentBehaviorCanvasRelevantOnly(true);
      if (dedupedFamilies[0]) {
        setDocumentBehaviorClusterFocus(dedupedFamilies[0]);
      }
      if (stepId) {
        setExpandedDocumentBehaviorTarget(stepId);
      }
    };
    const focusDocumentBehaviorTrailIntersection = (
      stepId: string,
      families: DocumentBehaviorClusterFamily[],
      preferredFamily?: DocumentBehaviorClusterFamily | null,
    ) => {
      const dedupedFamilies = Array.from(new Set(families)).filter((family) =>
        documentBehaviorGlobalClusterGroups.some((group) => group.key === family),
      );
      if (preferredFamily && dedupedFamilies.includes(preferredFamily)) {
        setDocumentBehaviorClusterFocus(preferredFamily);
      } else if (dedupedFamilies[0]) {
        setDocumentBehaviorClusterFocus(dedupedFamilies[0]);
      }
      setDocumentBehaviorTrailFamilies(dedupedFamilies);
      setExpandedDocumentBehaviorTarget(stepId);
      setDocumentBehaviorCanvasRelevantOnly(true);
    };
    const toggleDocumentBehaviorTrailFamily = (family: DocumentBehaviorClusterFamily) => {
      setDocumentBehaviorTrailFamilies((current) => {
        if (current.includes(family)) {
          const nextFamilies = current.filter((item) => item !== family);
          if (documentBehaviorActiveClusterFamily === family) {
            if (nextFamilies[0]) {
              setDocumentBehaviorClusterFocus(nextFamilies[0]);
            } else {
              setDocumentBehaviorClusterFocus("all");
            }
          }
          return nextFamilies;
        }
        return [...current, family];
      });
    };
    const focusDocumentBehaviorRelatedLane = (
      stepId: string,
      family: DocumentBehaviorClusterFamily | null = documentBehaviorActiveClusterFamily,
    ) => {
      if (family) {
        setDocumentBehaviorClusterFocus(family);
        setDocumentBehaviorTrailFamilies((current) => (current.includes(family) ? current : [...current, family]));
      }
      setExpandedDocumentBehaviorTarget(stepId);
      setDocumentBehaviorCanvasRelevantOnly(true);
    };
    const focusDocumentBehaviorFamilyTrail = (family: DocumentBehaviorClusterFamily, stepId?: string | null) => {
      setDocumentBehaviorClusterFocus(family);
      setDocumentBehaviorTrailFamilies((current) => (current.includes(family) ? current : [...current, family]));
      setDocumentBehaviorCanvasRelevantOnly(true);
      if (stepId) {
        setExpandedDocumentBehaviorTarget(stepId);
      }
    };
    const expandedDocumentBehaviorLane =
      activeDocumentBehaviorTarget && activeDocumentBehaviorTarget !== "form"
        ? documentBehaviorOverviewLanes.find(({ step }) => step.id === activeDocumentBehaviorTarget) ?? null
        : null;
    const expandedDocumentBehaviorVisibleClusters = expandedDocumentBehaviorLane
      ? getVisibleDocumentBehaviorClusters(expandedDocumentBehaviorLane.clusters)
      : [];
    const isSelectedBehaviorCluster = (cluster: BehaviorScopeCluster) => authoringSelectionsMatch(cluster.selection, selectedAuthoring);
    const behaviorGraphSummary =
      behaviorGraphMode === "overview"
        ? "Overview mode compresses the same graph so you can scan authored behavior before diving back into the composer."
        : "Focus mode keeps the selected flow and its graph nodes close to the composer for direct editing.";
    const focusDocumentBehaviorTarget = (options: {
      selection: AuthoringSelection | null;
      graphSelection?: BehaviorGraphSelection | null;
      ruleIndex?: number | null;
      filter?: BehaviorGraphFilter;
      entryContext?: BehaviorGraphEntryContext | null;
    }) => {
      setExpandedDocumentBehaviorTarget(options.selection?.stepId ?? "form");
      setBehaviorWorkspaceMode("authoring");
      focusBehaviorGraphNode({
        selection: options.selection,
        graphSelection: options.graphSelection,
        ruleIndex: options.ruleIndex,
        filter: options.filter,
        mode: behaviorGraphMode,
        viewport: "reset",
        entryContext: options.entryContext ?? {
          source: "navigator",
          title: "Opened from Document graph",
          detail: "Document-level graph navigation recenters the graph on the selected form or step scope.",
        },
      });
    };
    const focusDocumentBehaviorCluster = (
      cluster: BehaviorScopeCluster,
      filter: BehaviorGraphFilter,
      originLabel = "Document graph overview",
    ) => {
      setExpandedDocumentBehaviorTarget(cluster.selection?.stepId ?? "form");
      setBehaviorWorkspaceMode("authoring");
      if (filter !== "interaction" && cluster.rules.length) {
        focusBehaviorGraphNode({
          selection: cluster.rules[0].sourceSelection,
          graphSelection: cluster.rules[0].graphSelection,
          ruleIndex: cluster.rules[0].ruleIndex,
          filter: "state",
          mode: "focus",
          viewport: "reset",
          entryContext: {
            source: "navigator",
            title: `Opened from ${originLabel}`,
            detail: `State rules for ${cluster.title} were opened from the ${originLabel.toLowerCase()} and the graph viewport was recentered on that scope.`,
          },
        });
        return;
      }
      if (filter !== "state" && cluster.listeners.length) {
        focusBehaviorGraphNode({
          selection: cluster.listeners[0].selection,
          graphSelection: cluster.listeners[0].graphSelection,
          filter: "interaction",
          mode: "focus",
          viewport: "reset",
          entryContext: {
            source: "navigator",
            title: `Opened from ${originLabel}`,
            detail: `Interaction flows for ${cluster.title} were opened from the ${originLabel.toLowerCase()} and the graph viewport was recentered on that scope.`,
          },
        });
        return;
      }
      if (cluster.selection) {
        setSelectedAuthoring(cluster.selection);
        setInspectorTab("behavior");
        setBehaviorGraphEntryContext({
          source: "navigator",
          title: `Opened from ${originLabel}`,
          detail: `${cluster.kindLabel} ${cluster.title} was selected from the ${originLabel.toLowerCase()}.`,
        });
        resetBehaviorGraphViewport();
      }
    };
    const renderDocumentBehaviorCanvasLaneCard = ({ step, clusters }: (typeof documentBehaviorCanvasVisibleLanes)[number]) => {
      const visibleClusters = getVisibleDocumentBehaviorClusters(clusters);
      const relatedClusters = getDocumentBehaviorRelatedClusters(clusters);
      const trailFamilyMatches = documentBehaviorTrackedTrailFamilies.filter(
        (family) => getDocumentBehaviorClustersForFamily(clusters, family).length > 0,
      );
      const isTrailIntersectionLane = trailFamilyMatches.length > 1;
      const isActiveLane = activeNavigatorStepId === step.id;
      const isFocusedLane = activeDocumentBehaviorTarget === step.id;
      const isPinnedLane = documentBehaviorPinnedLaneIdSet.has(step.id);
      const isExpandedLane = isFocusedLane || isPinnedLane;
      const laneDensity =
        step.conditionalRules.length + step.runtimeListeners.length >= 6
          ? "High activity"
          : step.conditionalRules.length + step.runtimeListeners.length >= 3
            ? "Moderate activity"
            : step.conditionalRules.length + step.runtimeListeners.length > 0
              ? "Light activity"
              : "No behavior yet";
      return (
        <div
          key={`document-canvas-lane-${step.id}`}
          className={`rounded-[1rem] border p-4 shadow-[0_18px_50px_rgba(15,23,42,0.05)] ${
            isExpandedLane ? "border-slate-900 bg-white" : "border-soft bg-white/90"
          } ${activeDocumentBehaviorTarget && !isExpandedLane ? "opacity-75" : ""}`}
        >
          <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
            <div className="rounded-[0.95rem] border border-soft bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Step lane</p>
              <p className="mt-2 font-semibold text-slate-950">{step.title}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="app-pill">{step.fieldCount} fields</span>
                {step.conditionalRules.length ? <span className="app-pill">{step.conditionalRules.length} rules</span> : null}
                {step.runtimeListeners.length ? <span className="app-pill">{step.runtimeListeners.length} flows</span> : null}
                <span className="app-pill">{laneDensity}</span>
                {isActiveLane ? <span className="app-pill">Current lane</span> : null}
                {isFocusedLane ? <span className="app-pill">Focused</span> : null}
                {isPinnedLane ? <span className="app-pill">Pinned</span> : null}
                {documentBehaviorActiveClusterFamily && relatedClusters.length ? (
                  <span className="app-pill">Matches {documentBehaviorClusterFocusLabel(documentBehaviorActiveClusterFamily).toLowerCase()}</span>
                ) : null}
                {trailFamilyMatches.length > 1 ? <span className="app-pill">{trailFamilyMatches.length} trail families</span> : null}
                {isTrailIntersectionLane ? <span className="app-pill">Shared hotspot</span> : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setDocumentBehaviorPinnedLaneIds((current) =>
                      current.includes(step.id) ? current.filter((id) => id !== step.id) : [...current, step.id],
                    )
                  }
                  className={actionButtonClass(isPinnedLane ? "primary" : "secondary")}
                >
                  {isPinnedLane ? "Unpin lane" : "Pin lane"}
                </button>
                <button
                  type="button"
                  onClick={() => setExpandedDocumentBehaviorTarget(step.id)}
                  className={actionButtonClass(isFocusedLane ? "primary" : "secondary")}
                >
                  {isFocusedLane ? "Focused lane" : "Focus lane"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    focusDocumentBehaviorTarget({
                      selection: step.selection,
                      graphSelection: null,
                      filter: "all",
                      entryContext: {
                        source: "navigator",
                        title: "Opened from Document graph canvas",
                        detail: `Step-level behavior for ${step.title} was opened from the document graph canvas and the graph viewport was recentered on that step.`,
                      },
                    })
                  }
                  className={actionButtonClass("secondary")}
                >
                  Open lane
                </button>
                {step.runtimeListeners.length ? (
                  <button
                    type="button"
                    onClick={() =>
                      focusDocumentBehaviorTarget({
                        selection: step.runtimeListeners[0]?.selection ?? step.selection,
                        graphSelection: step.runtimeListeners[0]?.graphSelection ?? null,
                        filter: "interaction",
                        entryContext: {
                          source: "navigator",
                          title: "Opened from Document graph canvas",
                          detail: `Interaction flows for ${step.title} were opened from the document graph canvas and the graph viewport was recentered on that step.`,
                        },
                      })
                    }
                    className={actionButtonClass("primary")}
                  >
                    Open flows
                  </button>
                ) : null}
              </div>
            </div>
            <div className={`rounded-[0.95rem] border border-dashed border-slate-200 bg-slate-50/85 p-4 ${isExpandedLane ? "min-h-[16rem]" : "min-h-[11rem]"}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Scope clusters on canvas</p>
                <span className="app-pill">{visibleClusters.length} visible scopes</span>
              </div>
              {visibleClusters.length ? (
                <div
                  className={`mt-4 grid gap-3 ${
                    documentBehaviorCanvasDensity === "dense"
                      ? isExpandedLane
                        ? "md:grid-cols-3 xl:grid-cols-4"
                        : "md:grid-cols-3 xl:grid-cols-5"
                      : isExpandedLane
                        ? "md:grid-cols-2 xl:grid-cols-3"
                        : "md:grid-cols-2 xl:grid-cols-4"
                  }`}
                >
                  {visibleClusters.map((cluster) => (
                    <div
                      key={`document-canvas-cluster-${step.id}-${cluster.key}`}
                      className={`rounded-[0.95rem] border p-4 ${
                        isSelectedBehaviorCluster(cluster) ? "border-slate-900 bg-white" : "border-soft bg-white/90"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{cluster.kindLabel}</p>
                          <p className="mt-1 font-semibold text-slate-950">{cluster.title}</p>
                          <p className="mt-2 text-sm leading-6 text-slate-600">{cluster.detail}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {documentBehaviorActiveClusterFamily &&
                          normalizeDocumentBehaviorClusterKind(cluster.kindLabel) === documentBehaviorActiveClusterFamily ? (
                            <span className="app-pill">Related family</span>
                          ) : null}
                          {isSelectedBehaviorCluster(cluster) ? <span className="app-pill">Active</span> : null}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setExpandedDocumentBehaviorTarget(step.id)}
                          className={actionButtonClass(isFocusedLane ? "primary" : "secondary")}
                        >
                          {isFocusedLane ? "Focused lane" : "Focus lane"}
                        </button>
                        {cluster.selection ? (
                          <button
                            type="button"
                            onClick={() => focusDocumentBehaviorCluster(cluster, "all", "Document graph canvas")}
                            className={actionButtonClass("secondary")}
                          >
                            Open scope
                          </button>
                        ) : null}
                        {cluster.rules.length ? (
                          <button
                            type="button"
                            onClick={() => focusDocumentBehaviorCluster(cluster, "state", "Document graph canvas")}
                            className={actionButtonClass(behaviorGraphFilter === "interaction" ? "secondary" : "primary")}
                          >
                            Open rules
                          </button>
                        ) : null}
                        {cluster.listeners.length ? (
                          <button
                            type="button"
                            onClick={() => focusDocumentBehaviorCluster(cluster, "interaction", "Document graph canvas")}
                            className={actionButtonClass(behaviorGraphFilter === "state" ? "secondary" : "primary")}
                          >
                            Open flows
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {cluster.rules.length ? <span className="app-pill">{cluster.rules.length} state rules</span> : null}
                        {cluster.listeners.length ? <span className="app-pill">{cluster.listeners.length} interaction flows</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="app-muted-card mt-4 p-4 text-sm text-slate-500">
                  {behaviorGraphFilter === "all"
                    ? "No authored behavior in this lane yet."
                    : behaviorGraphFilter === "state"
                      ? "No state-rule scopes match this lane."
                      : "No interaction-flow scopes match this lane."}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    };

    return (
      <div className="space-y-4">
        <div className="rounded-[1.15rem] border border-soft bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Behavior graph</p>
              <h4 className="mt-2 text-lg font-semibold text-slate-950">Trigger, condition, and effect flows</h4>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                The graph is now a secondary visualization for tracing and debugging. Create and manage behavior in the Rules Manager, then open specific nodes here only when the shape needs inspection.
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-500">{behaviorGraphSummary}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={openBehaviorRulesManager} className={actionButtonClass("primary")}>
                Open Rules Manager
              </button>
              <button
                type="button"
                onClick={() => {
                  setBehaviorStudioMode("create");
                  setBehaviorStudioView("studio");
                }}
                className={actionButtonClass("secondary")}
              >
                Create in studio
              </button>
              <button
                type="button"
                onClick={() => setBehaviorWorkspaceMode((current) => (current === "document_graph" ? "authoring" : "document_graph"))}
                className={actionButtonClass(behaviorWorkspaceMode === "document_graph" ? "primary" : "secondary")}
              >
                {behaviorWorkspaceMode === "document_graph" ? "Return to authoring" : "Document graph workspace"}
              </button>
              {behaviorWorkspaceMode === "document_graph" ? (
                <button
                  type="button"
                  onClick={() => {
                    closeBehaviorStudio();
                    setInspectorTab("map");
                  }}
                  className={actionButtonClass("secondary")}
                >
                  Open full map
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {hasStateRules ? <span className="app-pill">{stateRules.length} state rules</span> : null}
            {hasInteractionFlows ? <span className="app-pill">{interactionFlows.length} interaction flows</span> : null}
            {activeRuntimeScope ? <span className="app-pill">{activeRuntimeScope.label}</span> : null}
            <span className="app-pill">{selectedBehaviorSummary}</span>
            <span className="app-pill">{behaviorGraphMode === "overview" ? "Overview mode" : "Focus mode"}</span>
            <span className="app-pill">{behaviorWorkspaceMode === "document_graph" ? "Document graph workspace" : "Node authoring workspace"}</span>
          </div>

          {behaviorGraphEntryContext ? (
            <div className="mt-4 rounded-[1rem] border border-soft bg-slate-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Graph context</p>
                  <h5 className="mt-2 text-sm font-semibold text-slate-950">{behaviorGraphEntryContext.title}</h5>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{behaviorGraphEntryContext.detail}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {behaviorGraphEntryContext.source === "map" ? (
                    <button
                      type="button"
                      onClick={() => {
                        closeBehaviorStudio();
                        setInspectorTab("map");
                      }}
                      className={actionButtonClass("secondary")}
                    >
                      Back to map
                    </button>
                  ) : null}
                  <button type="button" onClick={() => setBehaviorGraphEntryContext(null)} className={actionButtonClass("secondary")}>
                    Clear context
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="app-pill">{behaviorGraphEntryContext.source === "map" ? "From Map" : "From Document graph"}</span>
                <span className="app-pill">{currentGraphLocationLabel}</span>
                <span className="app-pill">{behaviorGraphMode === "overview" ? "Viewport reset to overview" : "Viewport reset to focus"}</span>
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[1rem] border border-soft bg-slate-50 p-3">
            <div className="flex flex-wrap gap-2">
              {[
                { value: "all" as const, label: "All flows" },
                { value: "state" as const, label: "State rules" },
                { value: "interaction" as const, label: "Interaction flows" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setBehaviorGraphFilter(option.value)}
                  className={actionButtonClass(behaviorGraphFilter === option.value ? "primary" : "secondary")}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[
                { value: "focus" as const, label: "Focus mode" },
                { value: "overview" as const, label: "Overview mode" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setBehaviorGraphMode(option.value)}
                  className={actionButtonClass(behaviorGraphMode === option.value ? "primary" : "secondary")}
                >
                  {option.label}
                </button>
              ))}
              <div className="ml-1 flex flex-wrap items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1">
                <button
                  type="button"
                  onClick={() => setBehaviorGraphZoom((current) => Math.max(0.7, Math.round((current - 0.1) * 100) / 100))}
                  className={actionButtonClass("secondary")}
                  disabled={!hasVisibleGraph}
                >
                  Zoom -
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBehaviorGraphZoom(graphFitZoom);
                    setBehaviorGraphOffset({ x: 0, y: 0 });
                  }}
                  className={actionButtonClass("secondary")}
                  disabled={!hasVisibleGraph}
                >
                  Fit flows
                </button>
                <button
                  type="button"
                  onClick={resetBehaviorGraphViewport}
                  className={actionButtonClass("secondary")}
                  disabled={!hasVisibleGraph}
                >
                  {graphZoomPercent}%
                </button>
                <button
                  type="button"
                  onClick={() => setBehaviorGraphZoom((current) => Math.min(1.35, Math.round((current + 0.1) * 100) / 100))}
                  className={actionButtonClass("secondary")}
                  disabled={!hasVisibleGraph}
                >
                  Zoom +
                </button>
                <button
                  type="button"
                  onClick={() => setBehaviorGraphDensity((current) => (current === "comfortable" ? "dense" : "comfortable"))}
                  className={actionButtonClass(behaviorGraphDensity === "dense" ? "primary" : "secondary")}
                  disabled={!hasVisibleGraph}
                >
                  {behaviorGraphDensity === "dense" ? "Dense lanes" : "Comfortable lanes"}
                </button>
                <button
                  type="button"
                  onClick={resetBehaviorGraphViewport}
                  className={actionButtonClass("secondary")}
                  disabled={!hasVisibleGraph}
                >
                  Reset view
                </button>
              </div>
            </div>
          </div>

          {behaviorWorkspaceMode === "document_graph" && logicMapData ? (
            <div className="mt-4 rounded-[1rem] border border-soft bg-slate-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Document graph overview</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    Scan authored behavior for the whole document from one surface. Use the board for dense clustered summaries or switch to the minimap when you need a more spatial sense of where each step lane sits inside the document-wide graph.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="app-pill">{logicMapData.steps.length} step lanes</span>
                  <span className="app-pill">{logicMapData.totalConditionals} rules</span>
                  <span className="app-pill">{logicMapData.totalListeners} flows</span>
                  <button
                    type="button"
                    onClick={() => setDocumentBehaviorSurfaceMode("canvas")}
                    className={actionButtonClass(documentBehaviorSurfaceMode === "canvas" ? "primary" : "secondary")}
                  >
                    Canvas view
                  </button>
                  <button
                    type="button"
                    onClick={() => setDocumentBehaviorSurfaceMode("board")}
                    className={actionButtonClass(documentBehaviorSurfaceMode === "board" ? "primary" : "secondary")}
                  >
                    Board view
                  </button>
                  <button
                    type="button"
                    onClick={() => setDocumentBehaviorSurfaceMode("minimap")}
                    className={actionButtonClass(documentBehaviorSurfaceMode === "minimap" ? "primary" : "secondary")}
                  >
                    Mini-map
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      closeBehaviorStudio();
                      setInspectorTab("map");
                    }}
                    className={actionButtonClass("secondary")}
                  >
                    Open full map
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="app-pill">
                  {documentBehaviorSurfaceMode === "canvas" ? "Global canvas" : documentBehaviorSurfaceMode === "minimap" ? "Spatial mini-map" : "Clustered board"}
                </span>
                <span className="app-pill">{behaviorGraphFilter === "all" ? "All behavior" : behaviorGraphFilter === "state" ? "State rules only" : "Interaction flows only"}</span>
                <span className="app-pill">{documentBehaviorClusterFocusLabel(documentBehaviorClusterFocus)}</span>
              </div>
              <div className="mt-3 rounded-[0.95rem] border border-soft bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Cross-lane clusters</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      Filter the document graph by shared scope kind so field, group, section, and step behavior can be scanned across lanes without reading every lane in full.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setDocumentBehaviorClusterFocus("all")}
                      className={actionButtonClass(documentBehaviorClusterFocus === "all" ? "primary" : "secondary")}
                    >
                      All scopes
                    </button>
                    {documentBehaviorGlobalClusterGroups.map((group) => (
                      <button
                        key={`document-cluster-focus-${group.key}`}
                        type="button"
                        onClick={() => setDocumentBehaviorClusterFocus(group.key)}
                        className={actionButtonClass(documentBehaviorClusterFocus === group.key ? "primary" : "secondary")}
                      >
                        {group.label}
                      </button>
                    ))}
                  </div>
                </div>
                {documentBehaviorGlobalClusterGroups.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {documentBehaviorGlobalClusterGroups.map((group) => (
                      <span key={`document-cluster-summary-${group.key}`} className="app-pill">
                        {group.label}: {group.scopeCount} scopes / {group.laneCount} lanes
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="app-muted-card mt-3 p-4 text-sm text-slate-500">
                    No authored scope clusters match the current behavior filter yet.
                  </div>
                )}
              </div>

              <div className="mt-4 rounded-[0.95rem] border border-soft bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Form runtime lane</p>
                    <p className="mt-2 font-semibold text-slate-950">Document orchestration</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Use this lane for load, submit, validation, and host-level orchestration that belongs to the whole document.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="app-pill">{logicMapData.formListeners.length} form listeners</span>
                    <button
                      type="button"
                      onClick={() =>
                        focusDocumentBehaviorTarget({
                          selection: null,
                          graphSelection: logicMapData.formListeners[0]?.graphSelection ?? null,
                          filter: "interaction",
                          entryContext: {
                            source: "navigator",
                            title: "Opened from Document graph overview",
                            detail: "Form-level runtime was opened from the document graph overview and the graph viewport was recentered on the form scope.",
                          },
                        })
                      }
                      className={actionButtonClass(logicMapData.formListeners.length ? "primary" : "secondary")}
                    >
                      {logicMapData.formListeners.length ? "Open form runtime" : "Open form behavior"}
                    </button>
                  </div>
                </div>
                {logicMapData.formListeners.length ? (
                  <div className="mt-4 grid gap-3 xl:grid-cols-2">
                    {logicMapData.formListeners.map((listener) => (
                      <button
                        key={`document-overview-form-${listener.id}`}
                        type="button"
                        onClick={() =>
                          focusBehaviorGraphNode({
                            selection: null,
                            graphSelection: listener.graphSelection,
                            filter: "interaction",
                            mode: "focus",
                            viewport: "reset",
                            entryContext: {
                              source: "navigator",
                              title: "Opened from Document graph overview",
                              detail: `Form runtime flow ${formatLabel(listener.eventName)} was opened from the document graph overview.`,
                            },
                          })
                        }
                        className="rounded-[0.95rem] border border-soft bg-slate-50 p-4 text-left transition hover:border-slate-300 hover:bg-white"
                      >
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Form flow</p>
                        <p className="mt-2 font-semibold text-slate-950">When {formatLabel(listener.eventName)}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{listener.actionsSummary}</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="app-muted-card mt-4 p-4 text-sm text-slate-500">
                    No form-level runtime yet. Seed it from `Form behavior` once the document needs global orchestration.
                  </div>
                )}
              </div>

              {documentBehaviorSurfaceMode === "board" ? (
                <div className="mt-4 grid gap-4 2xl:grid-cols-2">
                  {documentBehaviorOverviewLanes.map(({ step, clusters }) => {
                    const visibleClusters = getVisibleDocumentBehaviorClusters(clusters);
                    const isActiveLane = activeNavigatorStepId === step.id;
                    const laneDensity =
                      step.conditionalRules.length + step.runtimeListeners.length >= 6
                        ? "High activity"
                        : step.conditionalRules.length + step.runtimeListeners.length >= 3
                          ? "Moderate activity"
                          : step.conditionalRules.length + step.runtimeListeners.length > 0
                            ? "Light activity"
                            : "No behavior yet";
                    return (
                      <div
                        key={`document-overview-lane-${step.id}`}
                        className={`rounded-[1rem] border bg-white p-4 ${
                          isActiveLane ? "border-slate-900 shadow-[0_0_0_1px_rgba(15,23,42,0.06)]" : "border-soft"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Step lane</p>
                            <p className="mt-2 font-semibold text-slate-950">{step.title}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className="app-pill">{step.fieldCount} fields</span>
                              {step.conditionalRules.length ? <span className="app-pill">{step.conditionalRules.length} rules</span> : null}
                              {step.runtimeListeners.length ? <span className="app-pill">{step.runtimeListeners.length} flows</span> : null}
                              <span className="app-pill">{laneDensity}</span>
                              {isActiveLane ? <span className="app-pill">Current lane</span> : null}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setExpandedDocumentBehaviorTarget((current) => (current === step.id ? null : step.id))}
                              className={actionButtonClass(activeDocumentBehaviorTarget === step.id ? "primary" : "secondary")}
                            >
                              {activeDocumentBehaviorTarget === step.id ? "Collapse lane" : "Expand lane"}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                focusDocumentBehaviorTarget({
                                  selection: step.selection,
                                  graphSelection: null,
                                  filter: "all",
                                  entryContext: {
                                    source: "navigator",
                                    title: "Opened from Document graph overview",
                                    detail: `Step-level behavior for ${step.title} was opened from the document graph overview and the graph viewport was recentered on that step.`,
                                  },
                                })
                              }
                              className={actionButtonClass("secondary")}
                            >
                              Open lane
                            </button>
                            {step.runtimeListeners.length ? (
                              <button
                                type="button"
                                onClick={() =>
                                  focusDocumentBehaviorTarget({
                                    selection: step.runtimeListeners[0]?.selection ?? step.selection,
                                    graphSelection: step.runtimeListeners[0]?.graphSelection ?? null,
                                    filter: "interaction",
                                    entryContext: {
                                      source: "navigator",
                                      title: "Opened from Document graph overview",
                                      detail: `Interaction flows for ${step.title} were opened from the document graph overview and the graph viewport was recentered on that step.`,
                                    },
                                  })
                                }
                                className={actionButtonClass("primary")}
                              >
                                Open flows
                              </button>
                            ) : null}
                          </div>
                        </div>

                        {visibleClusters.length ? (
                          <div className="mt-4 grid gap-3">
                            {visibleClusters.map((cluster) => (
                              <div
                                key={`document-overview-cluster-${step.id}-${cluster.key}`}
                                className={`rounded-[0.95rem] border p-4 ${
                                  isSelectedBehaviorCluster(cluster) ? "border-slate-900 bg-white" : "border-soft bg-slate-50"
                                }`}
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{cluster.kindLabel}</p>
                                    <p className="mt-2 font-semibold text-slate-950">{cluster.title}</p>
                                    <p className="mt-2 text-sm leading-6 text-slate-600">{cluster.detail}</p>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {cluster.rules.length ? (
                                      <button
                                        type="button"
                                        onClick={() => focusDocumentBehaviorCluster(cluster, "state")}
                                        className={actionButtonClass(behaviorGraphFilter === "interaction" ? "secondary" : "primary")}
                                      >
                                        Open rules
                                      </button>
                                    ) : null}
                                    {cluster.listeners.length ? (
                                      <button
                                        type="button"
                                        onClick={() => focusDocumentBehaviorCluster(cluster, "interaction")}
                                        className={actionButtonClass(behaviorGraphFilter === "state" ? "secondary" : "primary")}
                                      >
                                        Open flows
                                      </button>
                                    ) : null}
                                    {cluster.selection ? (
                                      <button
                                        type="button"
                                        onClick={() => focusDocumentBehaviorCluster(cluster, "all")}
                                        className={actionButtonClass("secondary")}
                                      >
                                        Open scope
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {cluster.rules.length ? <span className="app-pill">{cluster.rules.length} state rules</span> : null}
                                  {cluster.listeners.length ? <span className="app-pill">{cluster.listeners.length} interaction flows</span> : null}
                                  {isSelectedBehaviorCluster(cluster) ? <span className="app-pill">Current scope</span> : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="app-muted-card mt-4 p-4 text-sm text-slate-500">
                            {behaviorGraphFilter === "all"
                              ? "No authored behavior in this step yet."
                              : behaviorGraphFilter === "state"
                                ? "No state-rule scopes match the current filter in this step."
                                : "No interaction-flow scopes match the current filter in this step."}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : documentBehaviorSurfaceMode === "minimap" ? (
                <div className="mt-4 rounded-[1rem] border border-soft bg-[radial-gradient(circle_at_top,_rgba(226,232,240,0.65),_rgba(248,250,252,0.95)_48%,_rgba(241,245,249,1))] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Global graph mini-map</p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        Use the central spine to read the whole document as one graph system. Step lanes stay in sequence while active field and section scopes orbit around the lane they belong to.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="app-pill">{logicMapData.formListeners.length} form flows</span>
                      <span className="app-pill">{documentBehaviorOverviewLanes.filter(({ step }) => step.conditionalRules.length || step.runtimeListeners.length).length} active step lanes</span>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[1rem] border border-soft bg-white/75 px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <span className="app-pill">{activeDocumentBehaviorTarget ? "Focused lane" : "Whole document"}</span>
                      <button
                        type="button"
                        onClick={() => setExpandedDocumentBehaviorTarget("form")}
                        className={actionButtonClass(activeDocumentBehaviorTarget === "form" ? "primary" : "secondary")}
                      >
                        Form runtime
                      </button>
                      {documentBehaviorOverviewLanes.map(({ step }) => (
                        <button
                          key={`document-mini-nav-${step.id}`}
                          type="button"
                          onClick={() => setExpandedDocumentBehaviorTarget((current) => (current === step.id ? null : step.id))}
                          className={actionButtonClass(activeDocumentBehaviorTarget === step.id ? "primary" : "secondary")}
                        >
                          {step.title}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDocumentBehaviorGraphZoom((current) => Math.max(0.7, Math.round((current - 0.1) * 100) / 100))}
                        className={actionButtonClass("secondary")}
                      >
                        Zoom -
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDocumentBehaviorGraphZoom(documentBehaviorFitZoom);
                          setDocumentBehaviorGraphOffset({ x: 0, y: 0 });
                        }}
                        className={actionButtonClass("secondary")}
                      >
                        Fit map
                      </button>
                      <button type="button" onClick={resetDocumentBehaviorGraphViewport} className={actionButtonClass("secondary")}>
                        {Math.round(documentBehaviorGraphZoom * 100)}%
                      </button>
                      <button
                        type="button"
                        onClick={() => setDocumentBehaviorGraphZoom((current) => Math.min(1.3, Math.round((current + 0.1) * 100) / 100))}
                        className={actionButtonClass("secondary")}
                      >
                        Zoom +
                      </button>
                      <button type="button" onClick={resetDocumentBehaviorGraphViewport} className={actionButtonClass("secondary")}>
                        Reset view
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 overflow-hidden rounded-[1rem] border border-soft bg-white/40 p-4">
                    <div
                      role="application"
                      aria-label="Document behavior mini-map"
                      tabIndex={0}
                      onPointerDown={handleDocumentBehaviorGraphPointerDown}
                      onPointerMove={handleDocumentBehaviorGraphPointerMove}
                      onPointerUp={handleDocumentBehaviorGraphPointerEnd}
                      onPointerCancel={handleDocumentBehaviorGraphPointerEnd}
                      onKeyDown={handleDocumentBehaviorGraphViewportKeyDown}
                      className="min-h-[34rem] cursor-grab overflow-hidden rounded-[1rem] outline-none focus-visible:ring-2 focus-visible:ring-slate-300 active:cursor-grabbing"
                    >
                      <div
                        style={{
                          transform: `translate(${documentBehaviorGraphOffset.x}px, ${documentBehaviorGraphOffset.y}px) scale(${documentBehaviorGraphZoom})`,
                          transformOrigin: "top center",
                        }}
                        className="transition-transform duration-150 ease-out"
                      >
                  <div className="relative mt-5">
                    <div className="absolute bottom-6 left-1/2 top-6 hidden w-px -translate-x-1/2 bg-[linear-gradient(to_bottom,rgba(15,23,42,0.12),rgba(15,23,42,0.28),rgba(15,23,42,0.12))] lg:block" />
                    <div className="space-y-4">
                      <div className="relative mx-auto max-w-2xl rounded-[1rem] border border-slate-200 bg-white/95 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
                        <div className="absolute left-1/2 top-0 hidden h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-slate-900 lg:block" />
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Form runtime lane</p>
                            <p className="mt-2 font-semibold text-slate-950">Document orchestration</p>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                              Load, submit, validation, and host-level orchestration stay anchored here before the mini-map fans out into step-level behavior.
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span className="app-pill">{logicMapData.formListeners.length} flows</span>
                            {activeDocumentBehaviorTarget === "form" ? <span className="app-pill">Current lane</span> : null}
                            <button
                              type="button"
                              onClick={() =>
                                focusDocumentBehaviorTarget({
                                  selection: null,
                                  graphSelection: logicMapData.formListeners[0]?.graphSelection ?? null,
                                  filter: "interaction",
                                  entryContext: {
                                    source: "navigator",
                                    title: "Opened from Document graph overview",
                                    detail: "Form-level runtime was opened from the document graph overview and the graph viewport was recentered on the form scope.",
                                  },
                                })
                              }
                              className={actionButtonClass(logicMapData.formListeners.length ? "primary" : "secondary")}
                            >
                              {logicMapData.formListeners.length ? "Open form runtime" : "Open form behavior"}
                            </button>
                          </div>
                        </div>
                      </div>

                      {documentBehaviorOverviewLanes.map(({ step, clusters }, laneIndex) => {
                        const visibleClusters = getVisibleDocumentBehaviorClusters(clusters);
                        const isActiveLane = activeNavigatorStepId === step.id;
                        const isFocusedLane = activeDocumentBehaviorTarget === step.id;
                        const laneDensity =
                          step.conditionalRules.length + step.runtimeListeners.length >= 6
                            ? "High activity"
                            : step.conditionalRules.length + step.runtimeListeners.length >= 3
                              ? "Moderate activity"
                              : step.conditionalRules.length + step.runtimeListeners.length > 0
                                ? "Light activity"
                                : "No behavior yet";
                        const clustersOnLeft = laneIndex % 2 === 0;
                        return (
                          <div
                            key={`document-minimap-lane-${step.id}`}
                            className="relative grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)_minmax(0,1fr)] lg:items-center"
                          >
                            <div className={`${clustersOnLeft ? "lg:col-start-1" : "lg:col-start-3"} space-y-2 ${activeDocumentBehaviorTarget && !isFocusedLane ? "opacity-55" : ""}`}>
                              {visibleClusters.length ? (
                                visibleClusters.map((cluster) => (
                                  <div
                                    key={`document-minimap-cluster-${step.id}-${cluster.key}`}
                                    className={`rounded-[0.95rem] border p-3 shadow-[0_8px_24px_rgba(15,23,42,0.04)] ${
                                      isSelectedBehaviorCluster(cluster) ? "border-slate-900 bg-white" : "border-soft bg-white/85"
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{cluster.kindLabel}</p>
                                        <p className="mt-1 font-semibold text-slate-950">{cluster.title}</p>
                                        <p className="mt-1 text-sm leading-6 text-slate-600">{cluster.detail}</p>
                                      </div>
                                      {isSelectedBehaviorCluster(cluster) ? <span className="app-pill">Active</span> : null}
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setExpandedDocumentBehaviorTarget(step.id)}
                                        className={actionButtonClass(activeDocumentBehaviorTarget === step.id ? "primary" : "secondary")}
                                      >
                                        {activeDocumentBehaviorTarget === step.id ? "Expanded lane" : "Expand lane"}
                                      </button>
                                      {cluster.rules.length ? (
                                        <button
                                          type="button"
                                          onClick={() => focusDocumentBehaviorCluster(cluster, "state")}
                                          className={actionButtonClass(behaviorGraphFilter === "interaction" ? "secondary" : "primary")}
                                        >
                                          Open rules
                                        </button>
                                      ) : null}
                                      {cluster.listeners.length ? (
                                        <button
                                          type="button"
                                          onClick={() => focusDocumentBehaviorCluster(cluster, "interaction")}
                                          className={actionButtonClass(behaviorGraphFilter === "state" ? "secondary" : "primary")}
                                        >
                                          Open flows
                                        </button>
                                      ) : null}
                                      {cluster.selection ? (
                                        <button
                                          type="button"
                                          onClick={() => focusDocumentBehaviorCluster(cluster, "all")}
                                          className={actionButtonClass("secondary")}
                                        >
                                          Open scope
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="app-muted-card p-3 text-sm text-slate-500">
                                  {behaviorGraphFilter === "all"
                                    ? "No authored behavior in this lane yet."
                                    : behaviorGraphFilter === "state"
                                      ? "No state-rule scopes match this lane."
                                      : "No interaction-flow scopes match this lane."}
                                </div>
                              )}
                            </div>

                            <div
                              className={`relative rounded-[1rem] border bg-white/95 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] ${
                                isActiveLane || isFocusedLane ? "border-slate-900" : "border-soft"
                              } lg:col-start-2`}
                            >
                              <div className="absolute left-1/2 top-0 hidden h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-slate-900 lg:block" />
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Step lane</p>
                                  <p className="mt-2 font-semibold text-slate-950">{step.title}</p>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    <span className="app-pill">{step.fieldCount} fields</span>
                                    {step.conditionalRules.length ? <span className="app-pill">{step.conditionalRules.length} rules</span> : null}
                                    {step.runtimeListeners.length ? <span className="app-pill">{step.runtimeListeners.length} flows</span> : null}
                                    <span className="app-pill">{laneDensity}</span>
                                    {isActiveLane ? <span className="app-pill">Current lane</span> : null}
                                    {isFocusedLane ? <span className="app-pill">Focused lane</span> : null}
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedDocumentBehaviorTarget((current) => (current === step.id ? null : step.id))}
                                    className={actionButtonClass(isFocusedLane ? "primary" : "secondary")}
                                  >
                                    {isFocusedLane ? "Collapse lane" : "Expand lane"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      focusDocumentBehaviorTarget({
                                        selection: step.selection,
                                        graphSelection: null,
                                        filter: "all",
                                        entryContext: {
                                          source: "navigator",
                                          title: "Opened from Document graph overview",
                                          detail: `Step-level behavior for ${step.title} was opened from the document graph overview and the graph viewport was recentered on that step.`,
                                        },
                                      })
                                    }
                                    className={actionButtonClass("secondary")}
                                  >
                                    Open lane
                                  </button>
                                  {step.runtimeListeners.length ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        focusDocumentBehaviorTarget({
                                          selection: step.runtimeListeners[0]?.selection ?? step.selection,
                                          graphSelection: step.runtimeListeners[0]?.graphSelection ?? null,
                                          filter: "interaction",
                                          entryContext: {
                                            source: "navigator",
                                            title: "Opened from Document graph overview",
                                            detail: `Interaction flows for ${step.title} were opened from the document graph overview and the graph viewport was recentered on that step.`,
                                          },
                                        })
                                      }
                                      className={actionButtonClass("primary")}
                                    >
                                      Open flows
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </div>

                            <div className={`${clustersOnLeft ? "lg:col-start-3" : "lg:col-start-1"} hidden lg:block`} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-[1rem] border border-soft bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(241,245,249,0.98))] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Global graph canvas</p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        Read the document as one direct canvas instead of lane cards first. Expand lanes inline, keep related scopes clustered together, and pan the whole behavior system as one surface.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="app-pill">{documentBehaviorGlobalClusterGroups.length} cross-lane cluster groups</span>
                      <span className="app-pill">{documentBehaviorOverviewLanes.length} step lanes</span>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[1rem] border border-soft bg-white px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <span className="app-pill">{activeDocumentBehaviorTarget ? "Focused lane" : "Whole document"}</span>
                      {activeDocumentBehaviorTarget && activeDocumentBehaviorTarget !== "form" ? (
                        <span className="app-pill">
                          {documentBehaviorOverviewLanes.find(({ step }) => step.id === activeDocumentBehaviorTarget)?.step.title ?? "Focused step"}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setExpandedDocumentBehaviorTarget("form")}
                        className={actionButtonClass(activeDocumentBehaviorTarget === "form" ? "primary" : "secondary")}
                      >
                        Form runtime
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedDocumentBehaviorTarget(null)}
                        className={actionButtonClass(activeDocumentBehaviorTarget === null ? "primary" : "secondary")}
                      >
                        Show all lanes
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDocumentBehaviorCanvasRelevantOnly((current) => !current)}
                        className={actionButtonClass(documentBehaviorCanvasRelevantOnly ? "primary" : "secondary")}
                      >
                        {documentBehaviorCanvasRelevantOnly ? "Relevant lanes only" : "All lanes visible"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDocumentBehaviorCanvasDensity((current) => (current === "comfortable" ? "dense" : "comfortable"))}
                        className={actionButtonClass(documentBehaviorCanvasDensity === "dense" ? "primary" : "secondary")}
                      >
                        {documentBehaviorCanvasDensity === "dense" ? "Dense canvas" : "Comfortable canvas"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDocumentBehaviorGraphZoom((current) => Math.max(0.65, Math.round((current - 0.1) * 100) / 100))}
                        className={actionButtonClass("secondary")}
                      >
                        Zoom -
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDocumentBehaviorGraphZoom(documentBehaviorFitZoom);
                          setDocumentBehaviorGraphOffset({ x: 0, y: 0 });
                        }}
                        className={actionButtonClass("secondary")}
                      >
                        Fit canvas
                      </button>
                      <button type="button" onClick={resetDocumentBehaviorGraphViewport} className={actionButtonClass("secondary")}>
                        {Math.round(documentBehaviorGraphZoom * 100)}%
                      </button>
                      <button
                        type="button"
                        onClick={() => setDocumentBehaviorGraphZoom((current) => Math.min(1.4, Math.round((current + 0.1) * 100) / 100))}
                        className={actionButtonClass("secondary")}
                      >
                        Zoom +
                      </button>
                      <button type="button" onClick={resetDocumentBehaviorGraphViewport} className={actionButtonClass("secondary")}>
                        Reset view
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(18rem,0.75fr)_minmax(0,1fr)]">
                    <div className="rounded-[1rem] border border-soft bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Canvas navigator</p>
                          <p className="mt-2 text-sm leading-6 text-slate-700">
                            Jump by scope kind and narrow the canvas to the lanes that matter instead of traversing every lane from the top strip.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="app-pill">{documentBehaviorCanvasVisibleLanes.length} visible lanes</span>
                          {documentBehaviorPinnedLaneIds.length ? <span className="app-pill">{documentBehaviorPinnedLaneIds.length} pinned</span> : null}
                        </div>
                      </div>
                      {documentBehaviorGlobalClusterGroups.length ? (
                        <div className="mt-4 space-y-3">
                          {documentBehaviorGlobalClusterGroups.map((group) => (
                            <div
                              key={`document-canvas-group-${group.key}`}
                              className={`rounded-[0.95rem] border p-4 ${
                                documentBehaviorClusterFocus === group.key ? "border-slate-900 bg-slate-50" : "border-soft bg-white"
                              }`}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="font-semibold text-slate-950">{group.label}</p>
                                  <p className="mt-2 text-sm leading-6 text-slate-600">
                                    {group.scopeCount} scopes across {group.laneCount} lanes · {group.ruleCount} rules · {group.listenerCount} flows
                                  </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDocumentBehaviorClusterFocus(group.key);
                                      setDocumentBehaviorCanvasRelevantOnly(true);
                                      if (group.firstLaneId) {
                                        setExpandedDocumentBehaviorTarget(group.firstLaneId);
                                      }
                                    }}
                                    className={actionButtonClass(documentBehaviorClusterFocus === group.key ? "primary" : "secondary")}
                                  >
                                    Show on canvas
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="app-muted-card mt-4 p-4 text-sm text-slate-500">
                          No cluster groups match the current behavior filter yet.
                        </div>
                      )}
                      {documentBehaviorTrackedTrailFamilies.length ? (
                        <div className="mt-4 rounded-[0.95rem] border border-soft bg-slate-50 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Whole-form trail set</p>
                              <p className="mt-2 text-sm leading-6 text-slate-700">
                                Keep several behavior families live at once so the canvas can stay narrowed to the same document-wide set while you pivot between families.
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <span className="app-pill">{documentBehaviorTrackedTrailFamilies.length} tracked families</span>
                              <span className="app-pill">{documentBehaviorTrackedTrailLanes.length} visible lanes</span>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const previousFamily =
                                  activeDocumentBehaviorTrailFamilyIndex > 0
                                    ? documentBehaviorTrackedTrailFamilies[activeDocumentBehaviorTrailFamilyIndex - 1]
                                    : null;
                                if (previousFamily) {
                                  focusDocumentBehaviorFamilyTrail(previousFamily);
                                }
                              }}
                              className={actionButtonClass("secondary")}
                              disabled={activeDocumentBehaviorTrailFamilyIndex <= 0}
                            >
                              Previous family
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const nextFamily =
                                  activeDocumentBehaviorTrailFamilyIndex >= 0 &&
                                  activeDocumentBehaviorTrailFamilyIndex < documentBehaviorTrackedTrailFamilies.length - 1
                                    ? documentBehaviorTrackedTrailFamilies[activeDocumentBehaviorTrailFamilyIndex + 1]
                                    : null;
                                if (nextFamily) {
                                  focusDocumentBehaviorFamilyTrail(nextFamily);
                                }
                              }}
                              className={actionButtonClass("secondary")}
                              disabled={
                                activeDocumentBehaviorTrailFamilyIndex < 0 ||
                                activeDocumentBehaviorTrailFamilyIndex >= documentBehaviorTrackedTrailFamilies.length - 1
                              }
                            >
                              Next family
                            </button>
                            <button
                              type="button"
                              onClick={() => focusDocumentBehaviorTrailSet(documentBehaviorTrackedTrailFamilies)}
                              className={actionButtonClass(documentBehaviorCanvasRelevantOnly ? "primary" : "secondary")}
                            >
                              {documentBehaviorCanvasRelevantOnly ? "Trail set on canvas" : "Show trail set on canvas"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDocumentBehaviorTrailFamilies(documentBehaviorActiveClusterFamily ? [documentBehaviorActiveClusterFamily] : [])}
                              className={actionButtonClass("secondary")}
                              disabled={documentBehaviorTrackedTrailFamilies.length <= 1}
                            >
                              Clear extra trails
                            </button>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {documentBehaviorTrackedTrailFamilies.map((family) => {
                              const matchingGroup = documentBehaviorGlobalClusterGroups.find((group) => group.key === family) ?? null;
                              const isCurrentFamily = documentBehaviorActiveClusterFamily === family;
                              return (
                                <div
                                  key={`document-trail-family-${family}`}
                                  className={`flex flex-wrap items-center gap-2 rounded-full border px-3 py-2 ${
                                    isCurrentFamily ? "border-slate-900 bg-white" : "border-soft bg-white/90"
                                  }`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => focusDocumentBehaviorFamilyTrail(family, matchingGroup?.firstLaneId ?? null)}
                                    className="text-sm font-semibold text-slate-900"
                                  >
                                    {documentBehaviorClusterFocusLabel(family)}
                                  </button>
                                  {matchingGroup ? (
                                    <span className="text-xs text-slate-500">
                                      {matchingGroup.scopeCount} scopes · {matchingGroup.laneCount} lanes
                                    </span>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => toggleDocumentBehaviorTrailFamily(family)}
                                    className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500"
                                    disabled={isCurrentFamily && documentBehaviorTrackedTrailFamilies.length === 1}
                                  >
                                    Remove
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                          {documentBehaviorTrailIntersections.length ? (
                            <div className="mt-4 rounded-[0.9rem] border border-soft bg-white/80 p-4">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Shared lane hotspots</p>
                                  <p className="mt-2 text-sm leading-6 text-slate-700">
                                    These lanes carry more than one tracked family at once. Use them as the fastest entry points when you need to pivot from one family context into another without scanning the full board.
                                  </p>
                                </div>
                                <span className="app-pill">{documentBehaviorTrailIntersections.length} hotspots</span>
                              </div>
                              <div className="mt-4 space-y-3">
                                {documentBehaviorTrailIntersections.map(({ step, familyClusters }) => (
                                  <div key={`document-trail-hotspot-${step.id}`} className="rounded-[0.9rem] border border-soft bg-white p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div>
                                        <p className="font-semibold text-slate-950">{step.title}</p>
                                        <p className="mt-2 text-sm leading-6 text-slate-600">
                                          {familyClusters.length} overlapping families ·{" "}
                                          {familyClusters.reduce((count, entry) => count + entry.clusters.length, 0)} visible scopes
                                        </p>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => focusDocumentBehaviorTrailIntersection(step.id, familyClusters.map((entry) => entry.family))}
                                        className={actionButtonClass("secondary")}
                                      >
                                        Show hotspot
                                      </button>
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      {familyClusters.map(({ family, clusters }) => {
                                        const primaryCluster = clusters[0] ?? null;
                                        return (
                                          <button
                                            key={`document-trail-hotspot-family-${step.id}-${family}`}
                                            type="button"
                                            onClick={() => {
                                              focusDocumentBehaviorTrailIntersection(step.id, familyClusters.map((entry) => entry.family), family);
                                              if (primaryCluster) {
                                                focusDocumentBehaviorCluster(primaryCluster, "all", "Document graph hotspot");
                                              }
                                            }}
                                            className={actionButtonClass(documentBehaviorActiveClusterFamily === family ? "primary" : "secondary")}
                                          >
                                            Open {documentBehaviorClusterFocusLabel(family).toLowerCase()}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {documentBehaviorFamilyTrails.length ? (
                        <div className="mt-4 rounded-[0.95rem] border border-soft bg-slate-50 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Family trails</p>
                              <p className="mt-2 text-sm leading-6 text-slate-700">
                                Keep multiple behavior families in reach so you can pivot from one document-wide trail to another without rebuilding the canvas context each time.
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <span className="app-pill">{documentBehaviorFamilyTrails.length} active families</span>
                              {documentBehaviorActiveClusterFamily ? <span className="app-pill">Current trail: {documentBehaviorClusterFocusLabel(documentBehaviorActiveClusterFamily)}</span> : null}
                            </div>
                          </div>
                          <div className="mt-4 space-y-3">
                            {documentBehaviorFamilyTrails.map((trail) => {
                              const primaryLane = trail.lanes[0] ?? null;
                              const currentTrailLane =
                                trail.activeLaneIndex >= 0 && trail.activeLaneIndex < trail.lanes.length ? trail.lanes[trail.activeLaneIndex] : null;
                              const nextTrailLane =
                                trail.activeLaneIndex >= 0 && trail.activeLaneIndex < trail.lanes.length - 1 ? trail.lanes[trail.activeLaneIndex + 1] : null;
                              const previousTrailLane = trail.activeLaneIndex > 0 ? trail.lanes[trail.activeLaneIndex - 1] : null;
                              const currentTrailCluster = currentTrailLane?.matchingClusters[0] ?? primaryLane?.matchingClusters[0] ?? null;
                              return (
                                <div
                                  key={`document-family-trail-${trail.key}`}
                                  className={`rounded-[0.9rem] border p-4 ${
                                    trail.isActive ? "border-slate-900 bg-white" : "border-soft bg-white/90"
                                  }`}
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <p className="font-semibold text-slate-950">{trail.label}</p>
                                      <p className="mt-2 text-sm leading-6 text-slate-600">
                                        {trail.scopeCount} scopes across {trail.laneCount} lanes · {trail.ruleCount} rules · {trail.listenerCount} flows
                                      </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {trail.isActive ? <span className="app-pill">Current trail</span> : null}
                                      {trail.isTracked ? <span className="app-pill">Tracked</span> : null}
                                      <button
                                        type="button"
                                        onClick={() => focusDocumentBehaviorFamilyTrail(trail.key, primaryLane?.step.id ?? null)}
                                        className={actionButtonClass(trail.isActive ? "primary" : "secondary")}
                                      >
                                        {trail.isActive ? "Trail in view" : "Follow family"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => toggleDocumentBehaviorTrailFamily(trail.key)}
                                        className={actionButtonClass(trail.isTracked ? "secondary" : "secondary")}
                                      >
                                        {trail.isTracked ? "Remove from trail set" : "Keep in trail set"}
                                      </button>
                                      {currentTrailCluster?.selection ? (
                                        <button
                                          type="button"
                                          onClick={() => focusDocumentBehaviorCluster(currentTrailCluster, "all", "Document graph canvas")}
                                          className={actionButtonClass("secondary")}
                                        >
                                          Open matching scope
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (previousTrailLane) {
                                          focusDocumentBehaviorRelatedLane(previousTrailLane.step.id, trail.key);
                                        }
                                      }}
                                      className={actionButtonClass("secondary")}
                                      disabled={!previousTrailLane}
                                    >
                                      Previous lane
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const targetLane = nextTrailLane ?? primaryLane;
                                        if (targetLane) {
                                          focusDocumentBehaviorRelatedLane(targetLane.step.id, trail.key);
                                        }
                                      }}
                                      className={actionButtonClass("secondary")}
                                      disabled={!trail.lanes.length || (trail.activeLaneIndex === trail.lanes.length - 1 && !primaryLane)}
                                    >
                                      Next lane
                                    </button>
                                  </div>
                                  <div className="mt-4 flex flex-wrap gap-2">
                                    {trail.lanes.map(({ step, matchingClusters }) => (
                                      <button
                                        key={`document-family-trail-lane-${trail.key}-${step.id}`}
                                        type="button"
                                        onClick={() => focusDocumentBehaviorRelatedLane(step.id, trail.key)}
                                        className={actionButtonClass(activeDocumentBehaviorTarget === step.id && trail.isActive ? "primary" : "secondary")}
                                      >
                                        {step.title}
                                        {matchingClusters.length ? ` · ${matchingClusters.length}` : ""}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                      {documentBehaviorActiveClusterFamily && documentBehaviorRelatedLanes.length ? (
                        <div className="mt-4 rounded-[0.95rem] border border-soft bg-slate-50 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Follow this behavior across lanes</p>
                              <p className="mt-2 text-sm leading-6 text-slate-700">
                                {documentBehaviorClusterFocusLabel(documentBehaviorActiveClusterFamily)} stay visible across {documentBehaviorRelatedLanes.length} lanes. Move lane to lane here without dropping back into the broader summary stack.
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <span className="app-pill">{documentBehaviorRelatedLanes.length} related lanes</span>
                              <button
                                type="button"
                                onClick={() => setDocumentBehaviorCanvasRelevantOnly(true)}
                                className={actionButtonClass(documentBehaviorCanvasRelevantOnly ? "primary" : "secondary")}
                              >
                                {documentBehaviorCanvasRelevantOnly ? "Related lanes only" : "Keep related lanes only"}
                              </button>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const previousLane = activeDocumentBehaviorRelatedLaneIndex > 0
                                  ? documentBehaviorRelatedLanes[activeDocumentBehaviorRelatedLaneIndex - 1]
                                  : null;
                                if (previousLane) {
                                  focusDocumentBehaviorRelatedLane(previousLane.step.id);
                                }
                              }}
                              className={actionButtonClass("secondary")}
                              disabled={activeDocumentBehaviorRelatedLaneIndex <= 0}
                            >
                              Previous related lane
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const nextLane =
                                  activeDocumentBehaviorRelatedLaneIndex >= 0 &&
                                  activeDocumentBehaviorRelatedLaneIndex < documentBehaviorRelatedLanes.length - 1
                                    ? documentBehaviorRelatedLanes[activeDocumentBehaviorRelatedLaneIndex + 1]
                                    : documentBehaviorRelatedLanes.length
                                      ? documentBehaviorRelatedLanes[0]
                                      : null;
                                if (nextLane) {
                                  focusDocumentBehaviorRelatedLane(nextLane.step.id);
                                }
                              }}
                              className={actionButtonClass("secondary")}
                              disabled={!documentBehaviorRelatedLanes.length || activeDocumentBehaviorRelatedLaneIndex === documentBehaviorRelatedLanes.length - 1}
                            >
                              Next related lane
                            </button>
                          </div>
                          <div className="mt-4 grid gap-3 xl:grid-cols-2">
                            {documentBehaviorRelatedLanes.map(({ step, matchingClusters }) => {
                              const isCurrentRelatedLane = activeDocumentBehaviorTarget === step.id;
                              const primaryCluster = matchingClusters[0] ?? null;
                              return (
                                <div
                                  key={`document-related-lane-${step.id}`}
                                  className={`rounded-[0.9rem] border p-4 ${
                                    isCurrentRelatedLane ? "border-slate-900 bg-white" : "border-soft bg-white/90"
                                  }`}
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <p className="font-semibold text-slate-950">{step.title}</p>
                                      <p className="mt-2 text-sm leading-6 text-slate-600">
                                        {matchingClusters.length} matching scopes · {matchingClusters.reduce((count, cluster) => count + cluster.rules.length, 0)} rules · {matchingClusters.reduce((count, cluster) => count + cluster.listeners.length, 0)} flows
                                      </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {isCurrentRelatedLane ? <span className="app-pill">Current lane</span> : null}
                                      <button
                                        type="button"
                                        onClick={() => focusDocumentBehaviorRelatedLane(step.id)}
                                        className={actionButtonClass(isCurrentRelatedLane ? "primary" : "secondary")}
                                      >
                                        {isCurrentRelatedLane ? "Lane in view" : "Show lane"}
                                      </button>
                                      {primaryCluster?.selection ? (
                                        <button
                                          type="button"
                                          onClick={() => focusDocumentBehaviorCluster(primaryCluster, "all", "Document graph canvas")}
                                          className={actionButtonClass("secondary")}
                                        >
                                          Open matching scope
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <div className="rounded-[1rem] border border-soft bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Visible lanes</p>
                          <p className="mt-2 text-sm leading-6 text-slate-700">
                            These are the lanes currently on canvas after applying pinning, focus, and scope filters.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setDocumentBehaviorClusterFocus("all");
                            setDocumentBehaviorCanvasRelevantOnly(false);
                            setExpandedDocumentBehaviorTarget(null);
                          }}
                          className={actionButtonClass("secondary")}
                        >
                          Reset canvas filters
                        </button>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {documentBehaviorCanvasVisibleLanes.map(({ step }) => (
                          <button
                            key={`document-canvas-visible-${step.id}`}
                            type="button"
                            onClick={() => setExpandedDocumentBehaviorTarget(step.id)}
                            className={actionButtonClass(activeDocumentBehaviorTarget === step.id ? "primary" : "secondary")}
                          >
                            {step.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 overflow-hidden rounded-[1rem] border border-soft bg-white/55 p-4">
                    <div
                      role="application"
                      aria-label="Document behavior canvas"
                      tabIndex={0}
                      onPointerDown={handleDocumentBehaviorGraphPointerDown}
                      onPointerMove={handleDocumentBehaviorGraphPointerMove}
                      onPointerUp={handleDocumentBehaviorGraphPointerEnd}
                      onPointerCancel={handleDocumentBehaviorGraphPointerEnd}
                      onKeyDown={handleDocumentBehaviorGraphViewportKeyDown}
                      className="min-h-[38rem] cursor-grab overflow-hidden rounded-[1rem] outline-none focus-visible:ring-2 focus-visible:ring-slate-300 active:cursor-grabbing"
                    >
                      <div
                        style={{
                          transform: `translate(${documentBehaviorGraphOffset.x}px, ${documentBehaviorGraphOffset.y}px) scale(${documentBehaviorGraphZoom})`,
                          transformOrigin: "top left",
                        }}
                        className="min-w-[76rem] space-y-5 transition-transform duration-150 ease-out"
                      >
                        <div className="rounded-[1rem] border border-slate-200 bg-white/95 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Form runtime lane</p>
                              <p className="mt-2 font-semibold text-slate-950">Document orchestration</p>
                              <p className="mt-2 text-sm leading-6 text-slate-600">
                                Global submit, validation, and host orchestration stay pinned here while the step lanes branch below.
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <span className="app-pill">{logicMapData.formListeners.length} flows</span>
                              {activeDocumentBehaviorTarget === "form" ? <span className="app-pill">Current lane</span> : null}
                              <button
                                type="button"
                                onClick={() =>
                                  focusDocumentBehaviorTarget({
                                    selection: null,
                                    graphSelection: logicMapData.formListeners[0]?.graphSelection ?? null,
                                    filter: "interaction",
                                    entryContext: {
                                      source: "navigator",
                                      title: "Opened from Document graph canvas",
                                      detail: "Form-level runtime was opened from the document graph canvas and the graph viewport was recentered on the form scope.",
                                    },
                                  })
                                }
                                className={actionButtonClass(logicMapData.formListeners.length ? "primary" : "secondary")}
                              >
                                {logicMapData.formListeners.length ? "Open form runtime" : "Open form behavior"}
                              </button>
                            </div>
                          </div>
                        </div>
                        {documentBehaviorCanvasLaneBuckets.map((bucket) => (
                          <section key={`document-canvas-bucket-${bucket.key}`} className="space-y-3">
                            <div className="rounded-[1rem] border border-slate-200 bg-white/90 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{bucket.title}</p>
                                  <p className="mt-2 text-sm leading-6 text-slate-600">{bucket.description}</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <span className="app-pill">{bucket.lanes.length} lanes</span>
                                  {bucket.key === "featured" ? <span className="app-pill">Top priority</span> : null}
                                </div>
                              </div>
                            </div>
                            <div className="space-y-4">
                              {bucket.lanes.map((lane) => renderDocumentBehaviorCanvasLaneCard(lane))}
                            </div>
                          </section>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeDocumentBehaviorTarget === "form" || (expandedDocumentBehaviorLane && documentBehaviorSurfaceMode !== "canvas") ? (
                <div className="mt-4 rounded-[0.95rem] border border-soft bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Expanded lane detail</p>
                      <h5 className="mt-2 text-base font-semibold text-slate-950">
                        {activeDocumentBehaviorTarget === "form"
                          ? "Document orchestration"
                          : expandedDocumentBehaviorLane?.step.title ?? "Focused lane"}
                      </h5>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {activeDocumentBehaviorTarget === "form"
                          ? "Stay at the document level to inspect global host/load/submit behavior before diving into a specific step lane."
                          : "Use the expanded lane to move from the global document graph into a specific scope, then hand off into the focused behavior graph only when you need node-level editing."}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="app-pill">Form runtime</span>
                      {expandedDocumentBehaviorLane ? <span className="app-pill">{expandedDocumentBehaviorLane.step.title}</span> : null}
                      {expandedDocumentBehaviorLane ? (
                        <button
                          type="button"
                          onClick={() => setExpandedDocumentBehaviorTarget(null)}
                          className={actionButtonClass("secondary")}
                        >
                          Collapse lane
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {activeDocumentBehaviorTarget === "form" ? (
                    <div className="mt-4 grid gap-3 xl:grid-cols-2">
                      {logicMapData.formListeners.length ? (
                        logicMapData.formListeners.map((listener) => (
                          <div key={`expanded-form-${listener.id}`} className="rounded-[0.9rem] border border-soft bg-slate-50 p-4">
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Form flow</p>
                            <p className="mt-2 font-semibold text-slate-950">When {formatLabel(listener.eventName)}</p>
                            <p className="mt-2 text-sm leading-6 text-slate-600">{listener.actionsSummary}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  focusBehaviorGraphNode({
                                    selection: null,
                                    graphSelection: listener.graphSelection,
                                    filter: "interaction",
                                    mode: "focus",
                                    viewport: "reset",
                                    entryContext: {
                                      source: "navigator",
                                      title: "Opened from Expanded lane detail",
                                      detail: `Form runtime flow ${formatLabel(listener.eventName)} was opened from the expanded document lane detail.`,
                                    },
                                  })
                                }
                                className={actionButtonClass("primary")}
                              >
                                Open flow
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="app-muted-card xl:col-span-2 p-4 text-sm text-slate-500">
                          No form-level runtime has been authored yet. Seed it from `Form behavior`, then use this lane to jump directly into the resulting chain.
                        </div>
                      )}
                    </div>
                  ) : expandedDocumentBehaviorLane ? (
                    <div className="mt-4 space-y-4">
                      <div className="flex flex-wrap gap-2">
                        <span className="app-pill">{expandedDocumentBehaviorLane.step.fieldCount} fields</span>
                        {expandedDocumentBehaviorLane.step.conditionalRules.length ? (
                          <span className="app-pill">{expandedDocumentBehaviorLane.step.conditionalRules.length} rules</span>
                        ) : null}
                        {expandedDocumentBehaviorLane.step.runtimeListeners.length ? (
                          <span className="app-pill">{expandedDocumentBehaviorLane.step.runtimeListeners.length} flows</span>
                        ) : null}
                        <span className="app-pill">{expandedDocumentBehaviorVisibleClusters.length} visible scopes</span>
                      </div>
                      {expandedDocumentBehaviorVisibleClusters.length ? (
                        <div className="grid gap-3 xl:grid-cols-2">
                          {expandedDocumentBehaviorVisibleClusters.map((cluster) => (
                            <div
                              key={`expanded-lane-${expandedDocumentBehaviorLane.step.id}-${cluster.key}`}
                              className={`rounded-[0.9rem] border p-4 ${
                                isSelectedBehaviorCluster(cluster) ? "border-slate-900 bg-white" : "border-soft bg-slate-50"
                              }`}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{cluster.kindLabel}</p>
                                  <p className="mt-2 font-semibold text-slate-950">{cluster.title}</p>
                                  <p className="mt-2 text-sm leading-6 text-slate-600">{cluster.detail}</p>
                                </div>
                                {isSelectedBehaviorCluster(cluster) ? <span className="app-pill">Current scope</span> : null}
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {cluster.selection ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedAuthoring(cluster.selection);
                                      setBehaviorGraphEntryContext({
                                        source: "navigator",
                                        title: "Opened from Expanded lane detail",
                                        detail: `${cluster.kindLabel} ${cluster.title} was selected from the expanded document lane detail.`,
                                      });
                                      resetBehaviorGraphViewport();
                                      setBehaviorWorkspaceMode("authoring");
                                    }}
                                    className={actionButtonClass("secondary")}
                                  >
                                    Open scope
                                  </button>
                                ) : null}
                                {cluster.rules.length ? (
                                  <button
                                    type="button"
                                    onClick={() => focusDocumentBehaviorCluster(cluster, "state", "Expanded lane detail")}
                                    className={actionButtonClass(behaviorGraphFilter === "interaction" ? "secondary" : "primary")}
                                  >
                                    Open rules
                                  </button>
                                ) : null}
                                {cluster.listeners.length ? (
                                  <button
                                    type="button"
                                    onClick={() => focusDocumentBehaviorCluster(cluster, "interaction", "Expanded lane detail")}
                                    className={actionButtonClass(behaviorGraphFilter === "state" ? "secondary" : "primary")}
                                  >
                                    Open flows
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="app-muted-card p-4 text-sm text-slate-500">
                          {behaviorGraphFilter === "all"
                            ? "No authored behavior exists in the expanded lane yet."
                            : behaviorGraphFilter === "state"
                              ? "No state-rule scopes match the current filter inside this lane."
                              : "No interaction-flow scopes match the current filter inside this lane."}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {behaviorWorkspaceMode === "document_graph" ? (
            <div className="mt-4 rounded-[1rem] border border-soft bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Workspace split</p>
                  <h4 className="mt-2 text-lg font-semibold text-slate-950">Document-scale orchestration is active</h4>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    The document graph is now using the larger workspace mode. Use the lane strip, mini-map viewport, and graph handoff actions above to navigate the whole form, then return to authoring when you want the node graph, composer, and simulator back in view.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setBehaviorWorkspaceMode("authoring")} className={actionButtonClass("primary")}>
                    Return to authoring
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
          {behaviorScopeClusters.length ? (
            <div className="mt-4 rounded-[1rem] border border-soft bg-slate-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Scope clusters</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    Larger behavior sets are grouped by scope here so you can jump into the right field, group, step, or document lane without reading one long repeated stack.
                  </p>
                </div>
                <span className="app-pill">{behaviorScopeClusters.length} clusters</span>
              </div>
              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                {behaviorScopeClusters.map((cluster) => (
                  <div key={cluster.key} className="rounded-[0.95rem] border border-soft bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{cluster.kindLabel}</p>
                        <p className="mt-2 font-semibold text-slate-950">{cluster.title}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{cluster.detail}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {cluster.selection ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedAuthoring(cluster.selection);
                              setBehaviorGraphEntryContext({
                                source: "clusters",
                                title: "Opened from Scope clusters",
                                detail: `${cluster.kindLabel} ${cluster.title} was selected from the clustered behavior view.`,
                              });
                              resetBehaviorGraphViewport();
                            }}
                            className={actionButtonClass("secondary")}
                          >
                            Open scope
                          </button>
                        ) : null}
                        {cluster.rules.length ? (
                          <button
                            type="button"
                            onClick={() =>
                              focusBehaviorGraphNode({
                                selection: cluster.rules[0].sourceSelection,
                                graphSelection: cluster.rules[0].graphSelection,
                                ruleIndex: cluster.rules[0].ruleIndex,
                                filter: "state",
                                mode: "focus",
                                viewport: "reset",
                                entryContext: {
                                  source: "clusters",
                                  title: "Opened from Scope clusters",
                                  detail: `State rules for ${cluster.title} were opened from the clustered behavior view.`,
                                },
                              })
                            }
                            className={actionButtonClass("secondary")}
                          >
                            Open rules
                          </button>
                        ) : null}
                        {cluster.listeners.length ? (
                          <button
                            type="button"
                            onClick={() =>
                              focusBehaviorGraphNode({
                                selection: cluster.listeners[0].selection,
                                graphSelection: cluster.listeners[0].graphSelection,
                                filter: "interaction",
                                mode: "focus",
                                viewport: "reset",
                                entryContext: {
                                  source: "clusters",
                                  title: "Opened from Scope clusters",
                                  detail: `Interaction flows for ${cluster.title} were opened from the clustered behavior view.`,
                                },
                              })
                            }
                            className={actionButtonClass("primary")}
                          >
                            Open flows
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {cluster.rules.length ? <span className="app-pill">{cluster.rules.length} rules</span> : null}
                      {cluster.listeners.length ? <span className="app-pill">{cluster.listeners.length} flows</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {hasFlowNavigator ? (
            <div className="mt-4 rounded-[1rem] border border-soft bg-slate-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Flow navigator</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    Focus mode now keeps one flow in view at a time. Use these jump points to swap flows without scrolling a long stack, or switch to overview mode to scan everything at once.
                  </p>
                </div>
                <span className="app-pill">{visibleStateRules.length + visibleInteractionFlows.length} focus targets</span>
              </div>
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {visibleStateRules.length ? (
                  <div className="space-y-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">State flows</p>
                    <div className="flex gap-3 overflow-x-auto pb-1">
                      {visibleStateRules.map((rule, index) => {
                        const sourceLabel = builderFieldOptions.find((option) => option.id === rule.whenFieldId)?.label ?? "Choose field";
                        const active = rule.ruleId === focusedRuleId;
                        return (
                          <button
                            key={`state-nav-${rule.ruleId}`}
                            type="button"
                            onClick={() => {
                              setEditingRuleIndex(index);
                              setSelectedBehaviorNode({ kind: "rule", ruleId: rule.ruleId, phase: "trigger" });
                            }}
                            className={`min-w-[15rem] rounded-[0.95rem] border px-4 py-3 text-left transition ${
                              active
                                ? "border-slate-900 bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.06)]"
                                : "border-soft bg-white hover:border-slate-300"
                            }`}
                          >
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">State flow {index + 1}</p>
                            <p className="mt-2 font-semibold text-slate-950">{formatLabel(rule.effect)} this field</p>
                            <p className="mt-1 text-sm leading-6 text-slate-600">Watch {sourceLabel}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                {visibleInteractionFlows.length ? (
                  <div className="space-y-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Interaction flows</p>
                    <div className="flex gap-3 overflow-x-auto pb-1">
                      {visibleInteractionFlows.map((listener, listenerIndex) => {
                        const active = listener.id === focusedListenerId;
                        return (
                          <button
                            key={`interaction-nav-${listener.id}`}
                            type="button"
                            onClick={() => setSelectedBehaviorNode({ kind: "listener", listenerId: listener.id, phase: "trigger" })}
                            className={`min-w-[15rem] rounded-[0.95rem] border px-4 py-3 text-left transition ${
                              active
                                ? "border-slate-900 bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.06)]"
                                : "border-soft bg-white hover:border-slate-300"
                            }`}
                          >
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Interaction flow {listenerIndex + 1}</p>
                            <p className="mt-2 font-semibold text-slate-950">{formatLabel(listener.eventName)}</p>
                            <p className="mt-1 text-sm leading-6 text-slate-600">
                              {listener.actions.length} action{listener.actions.length === 1 ? "" : "s"} · {listener.enabled ? "Enabled" : "Disabled"}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {hasGraph ? (
            <div
              className={`mt-4 overflow-auto rounded-[1rem] border border-soft bg-slate-50/70 p-3 outline-none ${
                hasVisibleGraph ? "cursor-grab active:cursor-grabbing touch-none" : ""
              }`}
              tabIndex={hasVisibleGraph ? 0 : -1}
              onPointerDown={handleBehaviorGraphPointerDown}
              onPointerMove={handleBehaviorGraphPointerMove}
              onPointerUp={handleBehaviorGraphPointerEnd}
              onPointerCancel={handleBehaviorGraphPointerEnd}
              onKeyDown={handleBehaviorGraphViewportKeyDown}
              aria-label="Behavior graph viewport"
            >
              <div style={graphPanStyle}>
              <div style={graphViewportStyle} className="grid gap-3 xl:grid-cols-2">
              {showStateFlows && selectedAuthoring?.kind === "field" && activeBuilderField ? (
                <div className="rounded-[1rem] border border-soft bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">State rule handoff</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    Creation and lifecycle edits now belong in Rules Manager or the guided studio. Use this graph only to inspect how state rules connect.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={openBehaviorRulesManager} className={actionButtonClass("primary")}>
                      Open Rules Manager
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBehaviorStudioMode("create");
                        setBehaviorStudioView("studio");
                      }}
                      className={actionButtonClass("secondary")}
                    >
                      Return to studio
                    </button>
                  </div>
                </div>
              ) : null}

              {showInteractionFlows && activeRuntimeScope ? (
                <div className="rounded-[1rem] border border-soft bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Interaction handoff</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    Listener and event creation starts in the studio. This graph stays focused on overview, tracing, and debugging.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={openBehaviorRulesManager} className={actionButtonClass("primary")}>
                      Open Rules Manager
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBehaviorStudioMode("create");
                        setBehaviorStudioView("studio");
                      }}
                      className={actionButtonClass("secondary")}
                    >
                      Return to studio
                    </button>
                  </div>
                </div>
              ) : null}
              </div>
              </div>
            </div>
          ) : null}

          {hasVisibleGraph ? (
            <div
              className="mt-5 overflow-auto rounded-[1rem] border border-soft bg-slate-50/70 p-3 outline-none cursor-grab active:cursor-grabbing touch-none"
              tabIndex={0}
              onPointerDown={handleBehaviorGraphPointerDown}
              onPointerMove={handleBehaviorGraphPointerMove}
              onPointerUp={handleBehaviorGraphPointerEnd}
              onPointerCancel={handleBehaviorGraphPointerEnd}
              onKeyDown={handleBehaviorGraphViewportKeyDown}
              aria-label="Behavior flow canvas"
            >
              <div style={graphPanStyle}>
              <div style={graphViewportStyle} className="space-y-4">
              {displayedStateRuleGroups.length ? (
                <div className={`space-y-3 ${behaviorGraphMode === "overview" ? "rounded-[1rem] border border-soft bg-slate-50/60 p-4" : ""}`}>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">State flows</p>
                  <div className={graphSectionGridClass}>
                  {displayedStateRuleGroups.map((group, groupIndex) => {
                    const representativeRule = group.members[0]?.rule ?? null;
                    return (
                      <div key={group.key} className="rounded-[1rem] border border-soft bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-950">
                              Conditional bundle {groupIndex + 1}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className="app-pill">Watch {group.sourceFieldLabel}</span>
                              <span className="app-pill">
                                {group.members.length} effect{group.members.length === 1 ? "" : "s"}
                              </span>
                              <span className="app-pill">{group.effectsSummary}</span>
                            </div>
                          </div>
                          {representativeRule ? (
                            <button
                              type="button"
                              onClick={() =>
                                openBehaviorObjectInRulesManager({
                                  objectKey: `rule:${representativeRule.ruleId}`,
                                  selection: selectedAuthoring,
                                  graphSelection: { kind: "rule", ruleId: representativeRule.ruleId, phase: "condition" },
                                  ruleIndex: group.members[0]?.index ?? null,
                                })
                              }
                              className={actionButtonClass("secondary")}
                            >
                              Manage bundle
                            </button>
                          ) : null}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {renderBehaviorGraphNode({
                            eyebrow: "Trigger",
                            title: "Watch a field",
                            detail: `Observe ${group.sourceFieldLabel} as the source input.`,
                            tone: "blue",
                            compact: graphCompact,
                            active:
                              selectedBehaviorNode?.kind === "rule" &&
                              group.members.some((member) => member.rule.ruleId === selectedBehaviorNode.ruleId) &&
                              selectedBehaviorNode.phase === "trigger",
                            onClick: () => {
                              if (!representativeRule) {
                                return;
                              }
                              openBehaviorNodeInStudio({ kind: "rule", ruleId: representativeRule.ruleId, phase: "trigger" }, group.members[0]?.index ?? null);
                            },
                          })}
                          {renderBehaviorEdgeLabel("When", graphCompact)}
                          {renderBehaviorGraphNode({
                            eyebrow: "Shared condition",
                            title: group.conditionTitle,
                            detail: group.conditionDetail,
                            tone: "amber",
                            compact: graphCompact,
                            active:
                              selectedBehaviorNode?.kind === "rule" &&
                              group.members.some((member) => member.rule.ruleId === selectedBehaviorNode.ruleId) &&
                              selectedBehaviorNode.phase === "condition",
                            onClick: () => {
                              if (!representativeRule) {
                                return;
                              }
                              openBehaviorNodeInStudio({ kind: "rule", ruleId: representativeRule.ruleId, phase: "condition" }, group.members[0]?.index ?? null);
                            },
                          })}
                          {group.members.map((member) => (
                            <Fragment key={`${group.key}-${member.rule.ruleId}`}>
                              {renderBehaviorEdgeLabel("Then", graphCompact)}
                              {renderBehaviorGraphNode({
                                eyebrow: "Effect",
                                title: `${formatLabel(member.rule.effect)} this field`,
                                detail: `Apply the ${member.rule.effect} effect to ${activeBuilderField?.label ?? "this field"}.`,
                                tone: "emerald",
                                compact: graphCompact,
                                active:
                                  selectedBehaviorNode?.kind === "rule" &&
                                  selectedBehaviorNode.ruleId === member.rule.ruleId &&
                                  selectedBehaviorNode.phase === "effect",
                                onClick: () => openBehaviorNodeInStudio({ kind: "rule", ruleId: member.rule.ruleId, phase: "effect" }, member.index),
                              })}
                            </Fragment>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              ) : null}

              {displayedInteractionFlows.length ? (
                <div className={`space-y-3 ${behaviorGraphMode === "overview" ? "rounded-[1rem] border border-soft bg-slate-50/60 p-4" : ""}`}>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Interaction flows</p>
                  <div className={graphSectionGridClass}>
                  {displayedInteractionFlows.map((listener) => {
                    const listenerIndex = visibleInteractionFlows.findIndex((candidate) => candidate.id === listener.id);
                    return (
                    <div key={listener.id} className="rounded-[1rem] border border-soft bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-950">Interaction flow {listenerIndex + 1}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span className="app-pill">Trigger {formatLabel(listener.eventName)}</span>
                            <span className="app-pill">{listener.actions.length} action{listener.actions.length === 1 ? "" : "s"}</span>
                            <span className="app-pill">{listener.enabled ? "Enabled" : "Disabled"}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            openBehaviorObjectInRulesManager({
                              objectKey: `flow:${listener.id}`,
                              selection: selectedAuthoring,
                              graphSelection: { kind: "listener", listenerId: listener.id, phase: "trigger" },
                            })
                          }
                          className={actionButtonClass("secondary")}
                        >
                          Manage flow
                        </button>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {renderBehaviorGraphNode({
                          eyebrow: "Trigger",
                          title: `When ${formatLabel(listener.eventName)}`,
                          detail: listener.enabled ? "This listener is enabled." : "This listener is currently disabled.",
                          tone: "blue",
                          compact: graphCompact,
                          active: selectedBehaviorNode?.kind === "listener" && selectedBehaviorNode.listenerId === listener.id && selectedBehaviorNode.phase === "trigger",
                          onClick: () => openBehaviorNodeInStudio({ kind: "listener", listenerId: listener.id, phase: "trigger" }),
                        })}
                        {listener.actions.map((action) => (
                          <div key={`${listener.id}-${action.id}`} className="contents">
                            {renderBehaviorEdgeLabel("Then", graphCompact)}
                            {renderBehaviorGraphNode({
                              eyebrow: "Action",
                              title: formatLabel(action.kind),
                              detail: describeRuntimeAction(action),
                              tone: "emerald",
                              compact: graphCompact,
                              active:
                                selectedBehaviorNode?.kind === "listener" &&
                                selectedBehaviorNode.listenerId === listener.id &&
                                selectedBehaviorNode.phase === "action" &&
                                selectedBehaviorNode.actionId === action.id,
                              onClick: () =>
                                openBehaviorNodeInStudio({
                                  kind: "listener",
                                  listenerId: listener.id,
                                  phase: "action",
                                  actionId: action.id,
                                }),
                            })}
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openBehaviorNodeInStudio({ kind: "listener", listenerId: listener.id, phase: "trigger" })}
                          className={actionButtonClass("primary")}
                        >
                          Edit chain in studio
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            openBehaviorObjectInRulesManager({
                              objectKey: `flow:${listener.id}`,
                              selection: selectedAuthoring,
                              graphSelection: { kind: "listener", listenerId: listener.id, phase: "trigger" },
                            })
                          }
                          className={actionButtonClass("secondary")}
                        >
                          Open lifecycle details
                        </button>
                      </div>
                    </div>
                  );
                  })}
                  </div>
                </div>
              ) : null}
              </div>
              </div>
            </div>
          ) : hasGraph ? (
            <div className="app-muted-card mt-5 p-4 text-sm text-slate-500">
              No flows match the current filter. Switch back to `All flows` or choose the other behavior type.
            </div>
          ) : (
            <div className="app-muted-card mt-5 p-4 text-sm text-slate-500">
              No behavior graph yet. Create the first rule or flow from Studio, then return here for visualization and runtime testing.
            </div>
          )}
            </>
          )}

        </div>

        {behaviorWorkspaceMode !== "document_graph" ? (
          <div className="space-y-4">
            <div className="rounded-[1.15rem] border border-soft bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Graph selection</p>
                  <h4 className="mt-2 text-lg font-semibold text-slate-950">Inspect here, edit in Studio</h4>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Graph nodes now act as traceable handoffs. Use Studio for wiring and Rules Manager for lifecycle controls instead of editing directly in the graph workspace.
                  </p>
                </div>
                {selectedBehaviorNode ? (
                  <button type="button" onClick={() => setSelectedBehaviorNode(null)} className={actionButtonClass()}>
                    Clear focus
                  </button>
                ) : null}
              </div>

              <div className="mt-4">
                {selectedRule && selectedRuleIndex >= 0 ? (
                  <div className="rounded-[1rem] border border-blue-200 bg-blue-50/60 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-blue-700">Selected state rule</p>
                    <p className="mt-2 font-semibold text-slate-950">{formatLabel(selectedRule.effect)} this field</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      Open this rule in the guided editor to change the condition/effect, or manage its lifecycle from the full Rules Manager index.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          openBehaviorNodeInStudio(
                            selectedBehaviorNode?.kind === "rule" && selectedBehaviorNode.ruleId === selectedRule.ruleId
                              ? selectedBehaviorNode
                              : { kind: "rule", ruleId: selectedRule.ruleId, phase: "condition" },
                            selectedRuleIndex,
                          )
                        }
                        className={actionButtonClass("primary")}
                      >
                        Open in Studio
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          openBehaviorObjectInRulesManager({
                            objectKey: `rule:${selectedRule.ruleId}`,
                            selection: selectedAuthoring,
                            graphSelection:
                              selectedBehaviorNode?.kind === "rule" && selectedBehaviorNode.ruleId === selectedRule.ruleId
                                ? selectedBehaviorNode
                                : { kind: "rule", ruleId: selectedRule.ruleId, phase: "condition" },
                            ruleIndex: selectedRuleIndex,
                          })
                        }
                        className={actionButtonClass("secondary")}
                      >
                        Manage details
                      </button>
                    </div>
                  </div>
                ) : selectedListener && selectedListenerIndex >= 0 ? (
                  <div className="rounded-[1rem] border border-blue-200 bg-blue-50/60 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-blue-700">Selected interaction flow</p>
                    <p className="mt-2 font-semibold text-slate-950">When {formatLabel(selectedListener.eventName)}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      Open this flow in Studio to edit the action chain, or manage enablement, duplication, and deletion from Rules Manager.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          openBehaviorNodeInStudio(
                            selectedBehaviorNode?.kind === "listener" && selectedBehaviorNode.listenerId === selectedListener.id
                              ? selectedBehaviorNode
                              : { kind: "listener", listenerId: selectedListener.id, phase: "trigger" },
                          )
                        }
                        className={actionButtonClass("primary")}
                      >
                        Open in Studio
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          openBehaviorObjectInRulesManager({
                            objectKey: `flow:${selectedListener.id}`,
                            selection: selectedAuthoring,
                            graphSelection:
                              selectedBehaviorNode?.kind === "listener" && selectedBehaviorNode.listenerId === selectedListener.id
                                ? selectedBehaviorNode
                                : { kind: "listener", listenerId: selectedListener.id, phase: "trigger" },
                          })
                        }
                        className={actionButtonClass("secondary")}
                      >
                        Manage details
                      </button>
                    </div>
                  </div>
                ) : hasGraph ? (
                  <div className="app-muted-card p-4 text-sm text-slate-500">
                    Select a graph node to inspect the focused object. Editing will open in Studio rather than expanding another graph-local editor.
                  </div>
                ) : (
                  <div className="app-muted-card p-4 text-sm text-slate-500">
                    No behavior graph yet. Create the first rule or flow from Studio, then return here for visualization and runtime testing.
                  </div>
                )}
              </div>
            </div>

            {!hasGraph ? (
              <div className="rounded-[1.15rem] border border-soft bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Creation handoff</p>
                    <h4 className="mt-2 text-lg font-semibold text-slate-950">Start in Studio, not on the graph</h4>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      The graph stays empty until Studio creates a real rule, listener, or event flow. This keeps creation guided and keeps the graph useful for tracing.
                    </p>
                  </div>
                  <button type="button" onClick={openBehaviorRulesManager} className={actionButtonClass("primary")}>
                    Open Rules Manager
                  </button>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedAuthoring?.kind === "field" && activeBuilderField ? (
                    <button type="button" onClick={openBehaviorStudioRule} className={actionButtonClass()}>
                      Create rule in Studio
                    </button>
                  ) : null}
                  {activeRuntimeScope ? (
                    <>
                      <button type="button" onClick={() => openBehaviorStudioListener("listener")} className={actionButtonClass()}>
                        Create listener in Studio
                      </button>
                      <button type="button" onClick={() => openBehaviorStudioListener("event")} className={actionButtonClass("secondary")}>
                        Create event flow in Studio
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div ref={simulatorSectionRef} className="rounded-[1.15rem] border border-soft bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Simulator</p>
              <h4 className="mt-2 text-lg font-semibold text-slate-950">Exercise the authored behavior in context</h4>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Run the live runtime loop against the selected rule, listener, or event chain. Keep basic controls upfront and use advanced session debug only when needed.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleTestSelectedRule(selectedRule)}
                disabled={!selectedRule}
                className={actionButtonClass(selectedRule ? "primary" : "secondary")}
              >
                Test this rule
              </button>
              <button
                type="button"
                onClick={() => handleTestSelectedChain(selectedListener)}
                disabled={!selectedListener}
                className={actionButtonClass(selectedListener ? "primary" : "secondary")}
              >
                Test this chain
              </button>
              <button type="button" onClick={handleResetRuntimeSession} className={actionButtonClass()}>
                Reset session
              </button>
              <button type="button" onClick={handlePopulateRequiredRuntimeValues} className={actionButtonClass()}>
                Fill required
              </button>
              <button type="button" onClick={handleRunCurrentRuntimeStep} disabled={!activeStep} className={actionButtonClass()}>
                Run current step
              </button>
              <button type="button" onClick={handleRunRuntimeSubmit} disabled={!canRunSubmit} className={actionButtonClass("primary")}>
                Run submit
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-[1rem] border border-blue-200 bg-blue-50/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-blue-700">Selected runtime target</p>
                <p className="mt-2 font-semibold text-slate-950">{selectedBehaviorSummary}</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {selectedRule
                    ? "Testing dispatches a field.change event for the watched field so the rule can resolve in the live session."
                    : selectedListener
                      ? `Testing dispatches ${selectedListener.eventName} through the current runtime scope and shows the resulting authored evidence.`
                      : "Pick a rule or flow from the Rules Manager, studio, or graph before using targeted tests."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRuntimeEvidenceKey(null)}
                disabled={!authoredRuntimeTraceEntries.length}
                className={actionButtonClass("secondary")}
              >
                Show latest runtime effect
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="space-y-4">
              <div className="rounded-[1rem] border border-soft bg-slate-50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="app-pill">{selectedBehaviorSummary}</span>
                  {runtimeSessionState?.submit.status ? <span className="app-pill">Submit {runtimeSessionState.submit.status}</span> : null}
                  <span className="app-pill">
                    {runtimeSessionState?.validation.valid === false ? "Validation blocked" : "Validation ready"}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-[0.95rem] border border-soft bg-white p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Current runtime step</p>
                    <p className="mt-2 font-semibold text-slate-950">{runtimeActiveStep?.title ?? activeStep?.title ?? "No active step"}</p>
                  </div>
                  <div className="rounded-[0.95rem] border border-soft bg-white p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Latest runtime status</p>
                    <p className="mt-2 font-semibold text-slate-950">
                      {runtimeSessionState?.submit.status === "submitting"
                        ? "Awaiting host response"
                        : runtimeSessionState?.submit.status === "success"
                          ? "Submit succeeded"
                          : runtimeSessionState?.submit.status === "error"
                            ? "Submit failed"
                            : runtimeSessionState?.validation.valid === false
                              ? "Validation blocked"
                              : "Idle"}
                    </p>
                  </div>
                  <div className="rounded-[0.95rem] border border-soft bg-white p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Latest trace event</p>
                    <p className="mt-2 font-semibold text-slate-950">{latestTraceEntry?.event.type ?? "No runtime events yet"}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-[1rem] border border-soft bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Host response loop</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      Once submit enters the `submitting` state, drive the host loop from here to confirm the behavior graph resolves the way the authored flow expects.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleMockSubmitSuccess}
                      disabled={!canResolveHostLoop}
                      className={actionButtonClass()}
                    >
                      Simulate success
                    </button>
                    <button
                      type="button"
                      onClick={handleMockSubmitError}
                      disabled={!canResolveHostLoop}
                      className={actionButtonClass("danger")}
                    >
                      Simulate error
                    </button>
                  </div>
                </div>
                <div className="mt-4 rounded-[0.95rem] border border-soft bg-white p-3 text-sm leading-6 text-slate-700">
                  {canResolveHostLoop
                    ? `Submit correlation ${runtimeSessionState?.submit.lastCorrelationId ?? "unknown"} is waiting for a host decision.`
                    : "Run submit first. The host loop controls become active once the runtime is waiting on a response."}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[1rem] border border-soft bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Authored runtime evidence</p>
                    <p className="mt-2 font-semibold text-slate-950">
                      {selectedStructuredTraceEvidence?.heading ?? "No authored runtime evidence yet"}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {selectedStructuredTraceEvidence?.summary ??
                        "Trigger a custom emit or host action from the preview or simulator to inspect its resolved payload here."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedStructuredTraceEvidence ? <span className="app-pill">{selectedStructuredTraceEvidence.title}</span> : null}
                    {selectedStructuredTraceEvidence && !isShowingLatestAuthoredEvidence ? (
                      <button
                        type="button"
                        onClick={() => setSelectedRuntimeEvidenceKey(null)}
                        className={actionButtonClass("secondary")}
                      >
                        Back to latest
                      </button>
                    ) : null}
                  </div>
                </div>
                {selectedStructuredTraceEvidence ? (
                  <div className="mt-4 space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {selectedStructuredTraceEvidence.pills.map((pill) => (
                        <span key={`${pill.label}-${pill.value}`} className="app-pill">
                          {pill.label}: {pill.value}
                        </span>
                      ))}
                    </div>
                    <div className="rounded-[0.95rem] border border-soft bg-white p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Resolved payload</p>
                      {selectedStructuredTraceEvidence.payloadEntries.length ? (
                        <div className="mt-3 space-y-2">
                          {selectedStructuredTraceEvidence.payloadEntries.map((entry) => (
                            <div key={entry.key} className="flex items-start justify-between gap-3 rounded-[0.85rem] border border-soft bg-slate-50 px-3 py-2">
                              <p className="text-sm font-medium text-slate-700">{entry.key}</p>
                              <p className="max-w-[70%] text-right text-sm text-slate-600">{entry.value}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-3 rounded-[0.85rem] border border-dashed border-soft bg-slate-50 px-3 py-4 text-sm text-slate-500">
                          This action fired without a structured payload.
                        </div>
                      )}
                    </div>
                    <div className="rounded-[0.95rem] border border-soft bg-white p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Authored trace chain</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        This compresses the nearby trigger and follow-up runtime events into one small chain before dropping back to the longer raw trace list.
                      </p>
                      <div className="mt-3 grid gap-3">
                        {selectedTraceChain.length ? (
                          selectedTraceChain.map((step) => (
                            <div key={step.entryKey} className="rounded-[0.85rem] border border-soft bg-slate-50 p-3">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                                    {step.role === "trigger"
                                      ? "Trigger"
                                      : step.role === "selected"
                                        ? "Selected evidence"
                                        : step.role === "after"
                                          ? "Follow-up"
                                          : "Context"}
                                  </p>
                                  <p className="mt-2 font-semibold text-slate-950">{step.title}</p>
                                  <p className="mt-1 text-sm leading-6 text-slate-600">{step.detail}</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <span className="app-pill">{step.direction}</span>
                                  {step.role === "selected" ? (
                                    <span className="app-pill">Active</span>
                                  ) : step.inspectable && step.entryKey !== selectedRuntimeEvidenceKey ? (
                                    <button
                                      type="button"
                                      onClick={() => setSelectedRuntimeEvidenceKey(step.entryKey)}
                                      className={actionButtonClass("secondary")}
                                    >
                                      Inspect
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                              <p className="mt-2 text-xs text-slate-500">{step.timestamp}</p>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-[0.85rem] border border-dashed border-soft bg-slate-50 px-3 py-4 text-sm text-slate-500">
                            No nearby runtime chain is available for this evidence item yet.
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">{selectedStructuredTraceEvidence.footer}</p>
                  </div>
                ) : null}
              </div>

              <details className="rounded-[1rem] border border-soft bg-slate-50 p-4">
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Advanced session debug</p>
                      <p className="mt-2 font-semibold text-slate-950">Payloads, traces, and session JSON are tucked away by default</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Open this only when the authored runtime evidence above is not enough.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="app-pill">{runtimeTraceEntries.length} trace events</span>
                      <span className="app-pill">{runtimeSubmitPayloadBytes} payload</span>
                      <span className="app-pill">{runtimeSessionSnapshotBytes} snapshot</span>
                    </div>
                  </div>
                </summary>
                <div className="mt-4 space-y-4">
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-[0.95rem] border border-soft bg-white p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Session tools</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Export captures the runtime execution state exactly as the preview sees it. Import restores that state into the mounted runtime to validate roundtrip behavior.
                      </p>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button type="button" onClick={handleExportRuntimeSession} className={actionButtonClass("primary")}>
                          Export session JSON
                        </button>
                        <button type="button" onClick={() => runtimeSessionInputRef.current?.click()} className={actionButtonClass()}>
                          Import session JSON
                        </button>
                      </div>
                    </div>

                    <div className="rounded-[0.95rem] border border-soft bg-white p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Runtime summary</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[0.85rem] border border-soft bg-slate-50 p-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Latest event</p>
                          <p className="mt-2 font-semibold text-slate-950">{latestTraceEntry?.event.type ?? "No events yet"}</p>
                        </div>
                        <div className="rounded-[0.85rem] border border-soft bg-slate-50 p-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Submit state</p>
                          <p className="mt-2 font-semibold text-slate-950">{runtimeSessionState?.submit.status ?? "idle"}</p>
                        </div>
                        <div className="rounded-[0.85rem] border border-soft bg-slate-50 p-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Submit payload size</p>
                          <p className="mt-2 font-semibold text-slate-950">{runtimeSubmitPayloadBytes}</p>
                        </div>
                        <div className="rounded-[0.85rem] border border-soft bg-slate-50 p-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Session snapshot size</p>
                          <p className="mt-2 font-semibold text-slate-950">{runtimeSessionSnapshotBytes}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-[0.95rem] border border-soft bg-white p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Current submit payload</p>
                      <pre className="mt-3 max-h-[12rem] overflow-auto rounded-[0.85rem] bg-slate-950 p-3 text-[11px] leading-5 text-slate-100">
                        {JSON.stringify(runtimeSubmitPreview, null, 2)}
                      </pre>
                    </div>

                    <div className="rounded-[0.95rem] border border-soft bg-white p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Current session snapshot</p>
                      <pre className="mt-3 max-h-[12rem] overflow-auto rounded-[0.85rem] bg-slate-950 p-3 text-[11px] leading-5 text-slate-100">
                        {JSON.stringify(runtimeSessionState, null, 2)}
                      </pre>
                    </div>
                  </div>

                  <div className="rounded-[0.95rem] border border-soft bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Recent runtime events</p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          Scan grouped authored chains first, then click into a recent emitted event or host action to load its evidence into the simulator card above.
                        </p>
                      </div>
                      {authoredRuntimeTraceEntries.length ? <span className="app-pill">{authoredRuntimeTraceEntries.length} authored</span> : null}
                    </div>
                    {authoredTraceChainSummaries.length ? (
                      <div className="mt-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Authored chain summaries</p>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                              Review multiple trigger-to-action sequences side by side before drilling into one evidence item.
                            </p>
                          </div>
                          <span className="app-pill">{authoredTraceChainSummaries.length} chains</span>
                        </div>
                        <div className="mt-3 grid gap-3 xl:grid-cols-2">
                          {authoredTraceChainSummaries.map((chain) => (
                            <div
                              key={chain.correlationId}
                              className={`rounded-[0.9rem] border p-3 ${
                                chain.active
                                  ? "border-slate-900 bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.06)]"
                                  : "border-soft bg-slate-50"
                              }`}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Authored chain</p>
                                  <p className="mt-2 font-semibold text-slate-950">{chain.title}</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <span className="app-pill">{chain.authoredCount} authored</span>
                                  {chain.active ? <span className="app-pill">Viewing chain</span> : null}
                                </div>
                              </div>
                              <p className="mt-2 text-sm leading-6 text-slate-600">{chain.summary}</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {chain.stepLabels.map((label, index) => (
                                  <span key={`${chain.correlationId}-${label}-${index}`} className="app-pill">
                                    {label}
                                  </span>
                                ))}
                              </div>
                              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs text-slate-500">{chain.latestTimestamp}</p>
                                {!chain.active ? (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedRuntimeEvidenceKey(chain.entryKey)}
                                    className={actionButtonClass("secondary")}
                                  >
                                    Inspect chain
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-3 max-h-[14rem] space-y-3 overflow-auto">
                      {runtimeTraceEntries.length ? (
                        runtimeTraceEntries.map((entry, index) => (
                          <div
                            key={`${entry.event.correlationId}-${entry.event.timestamp}-${index}`}
                            className={`rounded-[0.85rem] border p-3 ${
                              getRuntimeTraceEntryKey(entry) === selectedRuntimeEvidenceKey
                                ? "border-slate-900 bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.06)]"
                                : "border-soft bg-slate-50"
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-semibold text-slate-950">{entry.event.type}</p>
                              <div className="flex flex-wrap gap-2">
                                <span className="app-pill">{entry.direction}</span>
                                {isAuthoredRuntimeEvidenceEntry(entry) ? (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedRuntimeEvidenceKey(getRuntimeTraceEntryKey(entry))}
                                    className={actionButtonClass(
                                      getRuntimeTraceEntryKey(entry) === selectedRuntimeEvidenceKey ? "primary" : "secondary",
                                    )}
                                  >
                                    {getRuntimeTraceEntryKey(entry) === selectedRuntimeEvidenceKey ? "Viewing evidence" : "Inspect evidence"}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                              {entry.event.timestamp} · source {entry.event.source.nodeType ?? "unknown"} {entry.event.source.nodeId ?? ""}
                            </p>
                          </div>
                        ))
                      ) : (
                        <div className="app-muted-card p-4 text-sm text-slate-500">
                          No runtime events captured yet. Interact with the preview or run submit to build a trace.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const workspaceTitle =
    stage === "home"
      ? "Project Home"
      : activeProjectDetail?.project.name ?? activeConversion?.filename ?? selectedFile?.name ?? "No file loaded";
  const workspaceStatus = activeProjectDetail
    ? formatLabel(activeProjectDetail.project.status)
    : activeConversion
      ? formatLabel(activeConversion.reviewStatus)
      : "Ready";
  const shellStatus =
    stage === "home"
      ? "Ready"
      : workspaceStatus;
  const shellStatusTone =
    stage === "home"
      ? "neutral"
      : activeProjectDetail
        ? badgeToneFromProjectStatus(activeProjectDetail.project.status)
        : activeConversion
          ? badgeToneFromReview(activeConversion.reviewStatus)
          : "neutral";
  const workspaceSummary =
    stage === "home"
      ? "Start with a new form or open an existing project, then work inside one persistent builder workspace."
      : stage === "review"
        ? "Review PDF-backed imports against the source before turning them into a durable project."
        : openedRevisionView
          ? `Viewing the saved revision from ${new Date(openedRevisionView.createdAt).toLocaleString()}. Return to the latest project head or save this snapshot forward as the new current document.`
        : isPdfBackedProject && workspaceLandingMode === "promoted_import"
          ? "Project created from the reviewed PDF. Continue authoring here, and open the imported source compare workspace only when you need to check the original paper structure."
          : isPdfBackedProject && workspaceLandingMode === "reopened_import"
            ? "This PDF-backed project is already durable. Keep editing in the workspace and open the imported source compare workspace only when it helps."
        : "Work inside the project workspace. Save, publish, inspect source context, and shape the runtime flow without switching stages.";
  const reviewFlowTitle = reviewFlowMode === "new_project" ? "Create a new project from PDF" : "Resume PDF import review";
  const reviewFlowSummary =
    reviewFlowMode === "new_project"
      ? "This is step two of project creation: inspect the extracted structure, confirm the mapping against the source, then create the project workspace."
      : "Resume an earlier PDF intake, finish the review decisions, and create or reopen the associated project workspace.";
  const pendingWorkspaceTransitionProject =
    pendingWorkspaceTransition?.kind === "open_project"
      ? projects.find((project) => project.id === pendingWorkspaceTransition.projectId) ?? null
      : null;
  const pendingWorkspaceTransitionRevision =
    pendingWorkspaceTransition?.kind === "open_revision"
      ? projectRevisions.find((revision) => revision.id === pendingWorkspaceTransition.revisionId) ?? null
      : null;
  const pendingWorkspaceTransitionConversion =
    pendingWorkspaceTransition?.kind === "resume_import"
      ? conversions.find((conversion) => conversion.id === pendingWorkspaceTransition.conversionId) ?? null
      : null;
  const pendingWorkspaceTransitionCopy =
    pendingWorkspaceTransition?.kind === "open_project"
      ? pendingWorkspaceTransition.projectId === activeProjectId
        ? {
            title: "Reload the latest saved project head?",
            description: `The current workspace has unsaved edits. Save before reloading ${activeProjectDetail?.project.name ?? "this project"}, or reload the latest saved head without those changes.`,
            saveLabel: "Save and reload",
            discardLabel: "Reload without saving",
          }
        : {
            title: "Switch projects with unsaved changes?",
            description: `Save before opening ${pendingWorkspaceTransitionProject?.name ?? "the selected project"}, or discard the current workspace edits and switch immediately.`,
            saveLabel: "Save and switch",
            discardLabel: "Discard and switch",
          }
      : pendingWorkspaceTransition?.kind === "go_home"
        ? {
            title: "Return home with unsaved changes?",
            description: "Save before leaving the workspace, or discard the current local edits and return to Project Home.",
            saveLabel: "Save and go home",
            discardLabel: "Discard and go home",
          }
        : pendingWorkspaceTransition?.kind === "create_blank_project"
          ? {
              title: "Start a blank project with unsaved changes?",
              description: "Save before creating a new blank project, or discard the current local edits and replace this workspace with a fresh starter project.",
              saveLabel: "Save and create blank",
              discardLabel: "Discard and create blank",
            }
          : pendingWorkspaceTransition?.kind === "open_json"
            ? {
                title: "Open JSON with unsaved changes?",
                description: `Save before opening ${pendingWorkspaceTransition.fileName}, or discard the current local edits and replace this workspace with that JSON document.`,
                saveLabel: "Save and open JSON",
                discardLabel: "Discard and open JSON",
              }
            : pendingWorkspaceTransition?.kind === "upload_pdf"
              ? {
                  title: "Import PDF with unsaved changes?",
                  description: `Save before importing ${pendingWorkspaceTransition.fileName}, or discard the current local edits and move into the PDF intake flow.`,
                  saveLabel: "Save and import PDF",
                  discardLabel: "Discard and import PDF",
                }
              : pendingWorkspaceTransition?.kind === "resume_import"
                ? {
                    title: "Resume an import with unsaved changes?",
                    description: `Save before resuming ${pendingWorkspaceTransitionConversion?.filename ?? "the selected import"}, or discard the current local edits and reopen that intake flow.`,
                    saveLabel: "Save and resume import",
                    discardLabel: "Discard and resume import",
                  }
        : pendingWorkspaceTransition?.kind === "open_revision"
          ? {
              title: "Open a revision snapshot with unsaved changes?",
              description: `Save before opening ${pendingWorkspaceTransitionRevision?.note ?? "the selected revision snapshot"}, or discard the current local edits and open that saved snapshot directly in the builder.`,
              saveLabel: "Save and open snapshot",
              discardLabel: "Discard and open snapshot",
            }
          : pendingWorkspaceTransition?.kind === "return_latest_revision"
            ? {
                title: "Return to the latest saved head with unsaved changes?",
                description: "Save before reloading the latest project head, or discard the current local edits and reload the last saved revision.",
                saveLabel: "Save and return",
                discardLabel: "Reload without saving",
              }
            : null;
  const behaviorStudioPosition = behaviorStudioPositionLayout();
  const behaviorStudioWorkspaceShell = behaviorStudioUsesWorkspaceShell();

  return (
    <main className="min-h-screen">
      <div className="mx-auto flex max-w-[1720px] flex-col gap-3 px-3 py-3 sm:px-5 lg:px-6">
        <header className="app-shell px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[0.64rem] font-semibold uppercase tracking-[0.22em] text-slate-500">Form Builder</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h1 className="text-base font-semibold text-slate-950">{workspaceTitle}</h1>
                <StatusBadge tone={shellStatusTone}>
                  {shellStatus}
                </StatusBadge>
              </div>
              <p className="mt-1 text-sm text-slate-500">{workspaceSummary}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="app-pill">{projects.length} projects</span>
              {conversions.length ? <span className="app-pill">{conversions.length} imports</span> : null}
              {stage !== "home" && activeProjectDetail ? <span className="app-pill">{projectRevisions.length} revisions</span> : null}
              {stage !== "home" && activeConversion ? <span className="app-pill">{activeConversion.documentSignals?.pageCount ?? 0} pages</span> : null}
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button type="button" onClick={() => setNewProjectDialogOpen(true)} className={actionButtonClass("primary")}>
              New
            </button>
            <button
              type="button"
              onClick={() => setOpenProjectDialogOpen(true)}
              className={actionButtonClass()}
            >
              Open
            </button>
            {stage === "workspace" ? (
              <>
                <button
                  type="button"
                  onClick={() => setRevisionHistoryOpen(true)}
                  disabled={!activeProjectDetail}
                  className={actionButtonClass()}
                >
                  History
                </button>
                <button
                  type="button"
                  onClick={() => setProjectDetailsOpen(true)}
                  disabled={!activeProjectDetail}
                  className={actionButtonClass()}
                >
                  Project details
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (sourceDrawerOpen) {
                      setSourceDrawerOpen(false);
                    } else {
                      openSourceReference(sourceReferenceOpenMode);
                    }
                  }}
                  disabled={!sourceDrawerOpen && !sourceReferenceCanOpen}
                  className={actionButtonClass()}
                >
                  {workspaceSourceButtonLabel}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInspectorTab("behavior");
                    setBehaviorFocusTarget("simulator");
                  }}
                  disabled={!activeDocument}
                  className={actionButtonClass()}
                >
                  Simulator
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveProject()}
                  disabled={!activeProjectDetail || isSavingProject}
                  className={actionButtonClass()}
                >
                  {isSavingProject ? "Saving..." : projectDirty ? "Save" : "Saved"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleTogglePublishProject()}
                  disabled={!activeProjectDetail || isPublishingProject}
                  className={actionButtonClass("primary")}
                >
                  {isPublishingProject
                    ? "Updating status..."
                    : activeProjectDetail?.project.status === "published"
                      ? "Mark draft"
                      : "Publish"}
                </button>
              </>
            ) : null}
          </div>
          <input ref={inputRef} hidden type="file" accept="application/pdf,.pdf" onChange={onFileChange} />
          <input ref={jsonInputRef} hidden type="file" accept="application/json,.json" onChange={onJsonFileChange} />
        </header>

        {(flashMessage || errorMessage) && (
          <div className="grid gap-3 md:grid-cols-2">
            {flashMessage ? (
              <div className="rounded-[1.2rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                {flashMessage}
              </div>
            ) : null}
            {errorMessage ? (
              <div className="rounded-[1.2rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                {errorMessage}
              </div>
            ) : null}
          </div>
        )}

        {stage === "home" ? (
          <StageShell
            eyebrow="Start"
            title="New or open a project"
            summary="Treat this as a durable creation tool. Start blank, import a PDF, reopen a saved JSON file, or jump back into a recent project."
          >
            <section className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              <div className="grid gap-5">
                <PanelCard title="New" eyebrow="Create a project">
                  <div className="grid gap-4 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => void handleCreateBlankProject()}
                      disabled={isImportingJson}
                      className="rounded-[1.35rem] border border-blue-200 bg-[linear-gradient(135deg,#eff6ff_0%,#ffffff_62%)] p-5 text-left shadow-sm transition hover:border-blue-300"
                    >
                      <p className="text-xs uppercase tracking-[0.18em] text-blue-700">Blank form</p>
                      <h3 className="mt-2 text-lg font-semibold text-slate-950">Start from scratch</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Create a clean project with one starter step and begin authoring directly in the workspace.
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewProjectDialogOpen(false);
                        inputRef.current?.click();
                      }}
                      disabled={isUploading}
                      className="rounded-[1.35rem] border border-slate-200 bg-[linear-gradient(135deg,#fff7ed_0%,#ffffff_62%)] p-5 text-left shadow-sm transition hover:border-slate-300"
                    >
                      <p className="text-xs uppercase tracking-[0.18em] text-amber-700">Import PDF</p>
                      <h3 className="mt-2 text-lg font-semibold text-slate-950">Create from source</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Start a PDF-backed intake flow, review the extraction against the source, then promote it into a project.
                      </p>
                    </button>
                  </div>
                </PanelCard>

                <PanelCard title="Recent Projects" eyebrow="Open existing">
                  <div className="space-y-3">
                    {projects.length ? (
                      projects.slice(0, 6).map((project) => (
                        <button
                          key={project.id}
                          type="button"
                          onClick={() => handleOpenProject(project.id)}
                          className="block w-full rounded-[1rem] border border-soft bg-white px-4 py-3 text-left transition hover:border-slate-300"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-950">{project.name}</p>
                              <p className="mt-1 text-sm text-slate-600">
                                {project.revisionCount} revisions · updated {new Date(project.updatedAt).toLocaleString()}
                              </p>
                            </div>
                            <StatusBadge tone={badgeToneFromProjectStatus(project.status)}>{formatLabel(project.status)}</StatusBadge>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="app-muted-card p-4 text-sm text-slate-500">No saved projects yet. Start with a blank form or import a PDF.</div>
                    )}
                  </div>
                </PanelCard>
              </div>

              <div className="grid gap-5">
                <PanelCard
                  title="Open"
                  eyebrow="Files and history"
                  aside={
                    <button
                      type="button"
                      onClick={() => jsonInputRef.current?.click()}
                      disabled={isImportingJson}
                      className={actionButtonClass("primary")}
                    >
                      {isImportingJson ? "Opening..." : "Open JSON"}
                    </button>
                  }
                >
                  <div className="space-y-4">
                    <div className="app-muted-card p-4">
                      <p className="text-sm font-semibold text-slate-950">Authoring JSON</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Load a previously created authoring document and reopen it as a durable project.
                      </p>
                    </div>
                    <div className="app-muted-card p-4">
                      <p className="text-sm font-semibold text-slate-950">Traditional tool flow</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        `New` creates a project. `Open` returns you to saved work. Review is now part of PDF intake, not the identity of the whole app.
                      </p>
                    </div>
                  </div>
                </PanelCard>

                <PanelCard title="Recent Imports" eyebrow="Resume intake">
                  <div className="space-y-3">
                    {conversions.length ? (
                      conversions.slice(0, 6).map((conversion) => (
                        <button
                          key={conversion.id}
                          type="button"
                          onClick={() => handleResumeImport(conversion)}
                          className="block w-full rounded-[1rem] border border-soft bg-white px-4 py-3 text-left transition hover:border-slate-300"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-950">{conversion.filename}</p>
                              <p className="mt-1 text-sm text-slate-600">
                                {conversion.documentSignals?.pageCount ?? 0} pages · {Math.round(conversion.confidence * 100)}% confidence
                              </p>
                            </div>
                            <StatusBadge tone={badgeToneFromReview(conversion.reviewStatus)}>{formatLabel(conversion.reviewStatus)}</StatusBadge>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="app-muted-card p-4 text-sm text-slate-500">No imports in the queue. Use `New` to start from a PDF.</div>
                    )}
                  </div>
                </PanelCard>
              </div>
            </section>
          </StageShell>
        ) : null}

        {stage === "review" ? (
          <StageShell
            eyebrow="Creation Preflight"
            title={reviewFlowTitle}
            summary={reviewFlowSummary}
            actions={
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={handleReturnHomeFromReview} className={actionButtonClass()}>
                  Back to Home
                </button>
                <button type="button" onClick={() => inputRef.current?.click()} disabled={isUploading} className={actionButtonClass("primary")}>
                  {isUploading ? "Importing..." : "Replace PDF"}
                </button>
              </div>
            }
          >
            <section className="grid gap-5 xl:grid-cols-[1.52fr_0.78fr]">
              <div className="grid gap-5">
                <div
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    setDragActive(false);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={onDropImport}
                >
                  <PanelCard
                    title="Source Review"
                    eyebrow="Creation step 2 of 3"
                    aside={
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button type="button" onClick={() => setReviewPreviewMode("overlay")} className={subtleButtonClass(reviewPreviewMode === "overlay")}>
                          Overlay
                        </button>
                        <button type="button" onClick={() => setReviewPreviewMode("pdf")} className={subtleButtonClass(reviewPreviewMode === "pdf")}>
                          PDF
                        </button>
                      </div>
                    }
                    className="min-h-[40rem]"
                  >
                  <div className={`mb-4 flex flex-wrap items-center gap-2 rounded-[1rem] border px-3 py-2.5 ${dragActive ? "border-blue-300 bg-blue-50" : "border-soft bg-slate-50"}`}>
                    <div className="min-w-[11rem]">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[#103975]/65">Source file</p>
                      <p className="mt-1 text-sm text-slate-600">Inspect the imported PDF against the extracted mapping before creating the project workspace.</p>
                    </div>
                    <button type="button" onClick={() => inputRef.current?.click()} className={actionButtonClass("primary")}>
                      {isUploading ? "Importing..." : "Replace PDF"}
                    </button>
                    <div className="ml-auto rounded-full border border-soft bg-white px-3 py-1.5 text-sm text-slate-600">
                      {selectedFile ? `${selectedFile.name} · ${formatBytes(selectedFile.size)}` : "Drop a replacement PDF here"}
                    </div>
                  </div>
                  {reviewPreviewMode === "pdf" ? (
                    previewUrl ? (
                      <object data={previewUrl} type="application/pdf" className="h-[38rem] w-full rounded-[1.2rem] border border-soft bg-white">
                        <div className="app-muted-card p-6 text-sm text-slate-500">Inline PDF preview is unavailable in this browser.</div>
                      </object>
                    ) : (
                      <div className="app-muted-card p-6 text-sm text-slate-500">Import a PDF to inspect the source preview here.</div>
                    )
                  ) : pagePreviewImageUrl && activeReviewPage ? (
                    <div className="overflow-hidden rounded-[1.5rem] border border-soft bg-slate-950">
                      <svg viewBox={`0 0 ${reviewPageDimensions.width} ${reviewPageDimensions.height}`} className="h-[38rem] w-full">
                        <image href={pagePreviewImageUrl} x="0" y="0" width={reviewPageDimensions.width} height={reviewPageDimensions.height} preserveAspectRatio="xMidYMid meet" />
                        {activeReviewFields.flatMap((field, fieldIndex) =>
                          overlayRects(field).map((bounds, index) => (
                            <rect
                              key={`${field.id}-${fieldIndex}-${index}`}
                              x={bounds.x}
                              y={bounds.y}
                              width={bounds.width}
                              height={bounds.height}
                              rx="8"
                              onClick={() => setSelectedFieldId(field.id)}
                              className={`${overlayTone(field, field.id === activeReviewField?.id)} cursor-pointer stroke-[2]`}
                            />
                          )),
                        )}
                      </svg>
                    </div>
                  ) : (
                    <div className="app-muted-card p-6 text-sm text-slate-500">Import a PDF to start review.</div>
                  )}

                  <div className="mt-4 overflow-x-auto">
                    <div className="flex min-w-max gap-2">
                      {reviewPageSummaries.map((summary) => (
                        <button
                          key={summary.page.id}
                          type="button"
                          onClick={() => {
                            setSelectedPageId(summary.page.id);
                            setSelectedFieldId(null);
                          }}
                          className={`min-w-[11.5rem] rounded-[1rem] border px-3 py-2.5 text-left transition ${
                            summary.page.id === activeReviewPage?.id
                              ? "border-blue-300 bg-[#e8f0ff]"
                              : "border-soft bg-white hover:border-slate-300"
                          }`}
                        >
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Page {summary.page.orderIndex + 1}</p>
                          <p className="mt-1 font-semibold text-slate-950">{primaryPageHeading(summary.page)}</p>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
                            {secondaryPageHeading(summary.page) ?? summary.evidenceSnippet ?? "No evidence snippet recovered."}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-slate-500">
                            <span className="app-pill">{summary.fields.length} mapped fields</span>
                            {summary.flaggedFields ? <span className="app-pill">{summary.flaggedFields} flagged</span> : null}
                          </div>
                        </button>
                      ))}
                    </div>
                    </div>
                  </PanelCard>
                </div>
              </div>

              <div className="grid gap-5">
                <PanelCard
                  title="Project Creation"
                  eyebrow="Compact preflight"
                  aside={
                    activeConversion ? (
                      <StatusBadge tone={badgeToneFromReview(activeConversion.reviewStatus)}>
                        {reviewReadyToPromote ? "Ready to create" : "Needs review decision"}
                      </StatusBadge>
                    ) : undefined
                  }
                >
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-[1rem] border border-emerald-200 bg-emerald-50 px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-emerald-700">1. Import</p>
                        <p className="mt-1 text-sm text-emerald-900">{activeConversion ? activeConversion.filename : "PDF loaded"}</p>
                      </div>
                      <div className="rounded-[1rem] border border-blue-200 bg-blue-50 px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-blue-700">2. Preflight</p>
                        <p className="mt-1 text-sm text-blue-900">{activeReviewFields.length} mapped fields · {reviewIssueCount} issues</p>
                      </div>
                      <div className="rounded-[1rem] border border-slate-200 bg-white px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">3. Workspace</p>
                        <p className="mt-1 text-sm text-slate-700">
                          {matchedProjectForActiveConversion ? "Reopen the existing project workspace." : "Create the durable project workspace."}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-[1.1rem] border border-soft bg-[linear-gradient(135deg,#f8fafc_0%,#ffffff_100%)] p-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Current source</p>
                          <p className="mt-2 text-sm font-semibold text-slate-950">{activeConversion?.filename ?? "No PDF selected"}</p>
                          <p className="mt-1 text-xs text-slate-600">
                            {activeConversion?.documentSignals?.pageCount ?? reviewPageSummaries.length} pages · {Math.round((activeConversion?.confidence ?? 0) * 100)}% confidence
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Project handoff</p>
                          <p className="mt-2 text-sm font-semibold text-slate-950">
                            {matchedProjectForActiveConversion ? "Existing workspace available" : reviewReadyToPromote ? "Ready to create project" : "Hold until reviewed"}
                          </p>
                          <p className="mt-1 text-xs text-slate-600">
                            Source reference stays available after promotion, so this step only needs enough review to start authoring.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3">
                      <button
                        type="button"
                        onClick={() => void handleReviewUpdate("reviewed")}
                        disabled={!activeConversion || isSavingReview}
                        className={actionButtonClass("secondary")}
                      >
                        {isSavingReview ? "Saving..." : "Mark reviewed"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleReviewUpdate("accepted")}
                        disabled={!activeConversion || isSavingReview}
                        className={actionButtonClass("secondary")}
                      >
                        Mark accepted
                      </button>
                      <button
                        type="button"
                        onClick={() => void handlePromoteConversion()}
                        disabled={!activeConversion || activeConversion.reviewStatus === "needs_review" || isPromoting}
                        className={actionButtonClass("primary")}
                      >
                        {matchedProjectForActiveConversion
                          ? "Open project workspace"
                          : isPromoting
                            ? "Promoting..."
                            : "Create project workspace"}
                      </button>
                    </div>

                    <div className="app-muted-card p-4 text-sm leading-6 text-slate-600">
                      Treat this as a preflight, not a permanent audit workspace. Confirm the structure is directionally usable, then continue shaping the form inside the main builder.
                    </div>
                  </div>
                </PanelCard>

                <PanelCard title="Current Review" eyebrow="Page and selection">
                  <div className="space-y-3">
                    {activeReviewPage ? (
                      <div className="app-muted-card p-3.5">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Selected page</p>
                        <h3 className="mt-1 text-lg font-semibold text-slate-950">{primaryPageHeading(activeReviewPage)}</h3>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          {secondaryPageHeading(activeReviewPage) ?? activePageSummary?.evidenceSnippet ?? "No evidence summary available."}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="app-pill">{activeReviewFields.length} mapped</span>
                          {activePageSummary?.flaggedFields ? <span className="app-pill">{activePageSummary.flaggedFields} flagged</span> : null}
                          {(activePageSummary?.dominantTypes.length ?? 0) > 0 ? (
                            <span className="app-pill">
                              {activePageSummary?.dominantTypes.slice(0, 2).map((type) => formatLabel(type)).join(" · ")}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    {activeReviewField ? (
                      <div className="rounded-[1rem] border border-blue-200 bg-blue-50/70 p-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-blue-700">Active selection</p>
                            <h4 className="mt-1 text-sm font-semibold text-slate-950">{activeReviewField.label}</h4>
                            <p className="mt-1 text-sm text-slate-600">
                              {formatLabel(activeReviewField.semanticType)} · confidence {activeReviewFieldConfidence}%
                            </p>
                          </div>
                          <StatusBadge tone={activeReviewField.sourceConflicts.length ? "warning" : "info"}>
                            {formatLabel(activeReviewField.reviewStatus)}
                          </StatusBadge>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </PanelCard>

                <PanelCard
                  title="Mapped Structure"
                  eyebrow="Active page"
                  aside={
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="app-pill">{activeReviewFields.length} mapped</span>
                    </div>
                  }
                >
                  <div className="space-y-3 rounded-[1rem] border border-soft bg-white p-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Mapped structure</p>
                          <p className="mt-2 text-sm text-slate-600">Use this only to confirm the extracted structure is workable.</p>
                        </div>
                        {activeReviewField ? <StatusBadge tone="info">{formatLabel(activeReviewField.semanticType)}</StatusBadge> : null}
                      </div>
                      <div className="max-h-[16rem] space-y-2.5 overflow-y-auto pr-1">
                        {activeReviewPage?.sections.map((section) => (
                          <div key={section.id} className="rounded-[0.95rem] border border-soft bg-slate-50 p-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Section</p>
                            <h4 className="mt-1 text-sm font-semibold text-slate-950">{section.title}</h4>
                            <div className="mt-2 space-y-2">
                              {orderedReviewSectionFields(section).map((field, fieldIndex) => (
                                <button
                                  key={`${field.id}-${fieldIndex}`}
                                  type="button"
                                  onClick={() => setSelectedFieldId(field.id)}
                                  className={`block w-full rounded-[0.9rem] border px-3 py-2.5 text-left ${
                                    field.id === activeReviewField?.id
                                      ? "border-blue-300 bg-[#e8f0ff]"
                                      : "border-soft bg-white"
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <p className="font-semibold text-slate-950">{field.label}</p>
                                      <p className="mt-1 text-sm text-slate-600">
                                        {formatLabel(field.semanticType)} · confidence {Math.round(field.confidence * 100)}%
                                      </p>
                                    </div>
                                    <StatusBadge tone={field.sourceConflicts.length ? "warning" : "neutral"}>
                                      {formatLabel(field.reviewStatus)}
                                    </StatusBadge>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                  </div>
                </PanelCard>

                <PanelCard
                  title="Import Issues"
                  eyebrow="Carry forward context"
                  aside={
                    <StatusBadge tone={reviewIssueCount > 0 ? "warning" : "success"}>
                      {reviewIssueCount > 0 ? `${reviewIssueCount} open` : "Clear"}
                    </StatusBadge>
                  }
                >
                  <div className="space-y-3 rounded-[1rem] border border-soft bg-white p-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Issues</p>
                          <p className="mt-2 text-sm text-slate-600">Keep only the essential warnings visible before you move into the workspace.</p>
                        </div>
                      </div>
                      <div className="max-h-[10rem] space-y-2.5 overflow-y-auto pr-1">
                        {(activeConversion?.issues ?? []).map((issue) => (
                          <div key={`${issue.code}-${issue.nodeId ?? "global"}`} className="rounded-[0.95rem] border border-soft bg-slate-50 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-slate-950">{issue.message}</p>
                                {issue.suggestedAction ? (
                                  <p className="mt-2 text-sm leading-6 text-slate-600">{issue.suggestedAction}</p>
                                ) : null}
                              </div>
                              <StatusBadge tone={issue.severity === "error" ? "error" : issue.severity === "warning" ? "warning" : "info"}>
                                {issue.severity}
                              </StatusBadge>
                            </div>
                          </div>
                        ))}
                        {!activeConversion?.issues.length ? (
                          <div className="app-muted-card p-4 text-sm text-slate-500">No surfaced issues on this conversion.</div>
                        ) : null}
                      </div>
                  </div>
                </PanelCard>

                <PanelCard
                  title="Other Imports"
                  eyebrow="Resume queue"
                  aside={
                    <button type="button" onClick={() => void handleClearConversions()} disabled={!conversions.length || isClearingHistory} className={actionButtonClass()}>
                      {isClearingHistory ? "Clearing..." : "Clear"}
                    </button>
                  }
                >
                  <div className="max-h-[14rem] space-y-2.5 overflow-y-auto pr-1">
                    {conversions.map((conversion) => (
                      <button
                        key={conversion.id}
                        type="button"
                        onClick={() => handleResumeImport(conversion)}
                        className={`block w-full rounded-[0.95rem] border px-3 py-2.5 text-left ${
                          conversion.id === activeConversion?.id
                            ? "border-blue-300 bg-[#e8f0ff]"
                            : "border-soft bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-950">{conversion.filename}</p>
                            <p className="mt-1 text-sm text-slate-600">
                              {conversion.documentSignals?.pageCount ?? 0} pages
                            </p>
                          </div>
                          <StatusBadge tone={badgeToneFromStatus(conversion.status)}>
                            {formatLabel(conversion.status)}
                          </StatusBadge>
                        </div>
                        <div className="mt-3 flex justify-between gap-2">
                          <span className="text-xs text-slate-500">{Math.round(conversion.confidence * 100)}% confidence</span>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleDeleteConversion(conversion.id);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                void handleDeleteConversion(conversion.id);
                              }
                            }}
                            className="text-xs font-semibold text-slate-500"
                          >
                            Remove
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </PanelCard>
              </div>
            </section>
          </StageShell>
        ) : null}

        {stage === "workspace" ? (
          <StageShell
            eyebrow="Workspace"
            title="Shape the project"
            summary="Keep the step strip concise, then do the real editing directly in the page preview and inspector."
            actions={
              <div className="flex flex-wrap gap-2">
                <input
                  ref={runtimeSessionInputRef}
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void handleImportRuntimeSession(file);
                    }
                  }}
                />
                <StatusBadge tone={projectDirty ? "warning" : "success"}>
                  {projectDirty ? "Unsaved changes" : "Saved"}
                </StatusBadge>
                {openedRevisionView ? <StatusBadge tone="info">Revision view</StatusBadge> : null}
                {activeProjectDetail ? (
                  <StatusBadge tone={badgeToneFromProjectStatus(activeProjectDetail.project.status)}>
                    {formatLabel(activeProjectDetail.project.status)}
                  </StatusBadge>
                ) : null}
              </div>
            }
          >
            <div className="space-y-4">
              {openedRevisionView ? (
                <div className="rounded-[1.2rem] border border-amber-200 bg-[linear-gradient(135deg,#fff7ed_0%,#ffffff_65%)] p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-amber-700">Revision history</p>
                      <h3 className="mt-1 text-lg font-semibold text-slate-950">
                        Viewing snapshot from {new Date(openedRevisionView.createdAt).toLocaleString()}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        {openedRevisionView.note}. This is a saved revision snapshot opened inside the current workspace.
                        Return to the latest saved project head when you are done inspecting it, or save now to restore this snapshot as the current document.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleReturnToLatestProjectRevision()}
                        disabled={isLoadingRevisionWorkspace}
                        className={actionButtonClass()}
                      >
                        {isLoadingRevisionWorkspace ? "Returning..." : "Return to latest"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRevisionHistoryOpen(true)}
                        className={actionButtonClass("primary")}
                      >
                        Open history
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            <section className="grid gap-5 xl:grid-cols-[12.5rem_minmax(0,1fr)_24rem]">
              <PanelCard
                title="Steps"
                eyebrow="Page strip"
                aside={
                  <div className="flex gap-2">
                    <button
                      type="button"
                      title="Add step"
                      aria-label="Add step"
                      onClick={handleAddStep}
                      className={iconButtonClass()}
                    >
                      <PlusIcon />
                    </button>
                  </div>
                }
                className="min-h-[52rem] min-w-0 overflow-hidden"
              >
                <div className="space-y-2 overflow-y-auto pr-1">
                  {activeDocument?.steps.map((step, stepIndex) => (
                    <div key={step.id} className="space-y-2">
                      {renderDropMarker({ kind: "step-list", index: stepIndex }, { label: "Insert step here" })}
                      <div
                        draggable
                        onDragStart={() => handleSelectionDragStart({ kind: "step", stepId: step.id })}
                        onDragEnd={clearDragInteraction}
                        onDragOver={(event) => handleDropZoneDragOver(event, { kind: "step-list", index: stepIndex })}
                        onDragLeave={() => handleDropZoneDragLeave({ kind: "step-list", index: stepIndex })}
                        onDrop={(event) => handleDropTarget(event, { kind: "step-list", index: stepIndex })}
                        className="min-w-0"
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedAuthoring({ kind: "step", stepId: step.id })}
                          className={`flex w-full min-w-0 items-start gap-3 rounded-[1rem] border px-2.5 py-2.5 text-left transition ${
                            selectedAuthoring?.stepId === step.id
                              ? "border-blue-300 bg-[#e8f0ff] shadow-[0_12px_24px_rgba(37,99,235,0.10)]"
                              : "border-soft bg-white hover:border-slate-300"
                          }`}
                        >
                          <PageIcon />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                              Step {stepIndex + 1}
                            </span>
                            <span className="mt-1 block truncate text-sm font-semibold text-slate-950">
                              {step.title}
                            </span>
                            <span className="mt-1 block truncate text-xs text-slate-500">
                              {step.sections.length} sections
                            </span>
                            {(() => {
                              const behaviorSummary = summarizeStepBehavior(step);
                              return behaviorSummary.ruleCount || behaviorSummary.flowCount ? (
                                <span className="mt-2 flex flex-wrap gap-1.5">
                                  {behaviorSummary.ruleCount ? <span className="app-pill">{behaviorSummary.ruleCount} rules</span> : null}
                                  {behaviorSummary.flowCount ? <span className="app-pill">{behaviorSummary.flowCount} flows</span> : null}
                                </span>
                              ) : null;
                            })()}
                          </span>
                        </button>
                      </div>
                    </div>
                  ))}
                  {activeDocument?.steps?.length ? renderDropMarker({ kind: "step-list", index: activeDocument.steps.length }, { label: "Insert step at end" }) : null}
                </div>
              </PanelCard>

              <PanelCard
                title="Step Preview"
                eyebrow="Inline editing"
                aside={
                  activeProjectDetail ? (
                    <div className="flex items-center gap-2">
                      <StatusBadge tone={projectDirty ? "warning" : "success"}>
                        {projectDirty ? "Unsaved changes" : "Saved"}
                      </StatusBadge>
                      <StatusBadge tone={badgeToneFromProjectStatus(activeProjectDetail.project.status)}>
                        {formatLabel(activeProjectDetail.project.status)}
                      </StatusBadge>
                    </div>
                  ) : undefined
                }
                className="min-h-[52rem] min-w-0 overflow-hidden"
              >
                {activeDocument && activeStep ? (
                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                    {isPdfBackedProject && workspaceLandingMode ? (
                      <div className="rounded-[1.35rem] border border-blue-200 bg-[linear-gradient(135deg,#eff6ff_0%,#ffffff_62%)] p-4 shadow-[0_20px_40px_rgba(37,99,235,0.10)]">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="max-w-3xl">
                            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-blue-700">Imported project handoff</p>
                            <h3 className="mt-2 text-xl font-semibold text-slate-950">
                              {workspaceLandingMode === "promoted_import" ? "Project workspace created from review" : "Imported project reopened in the workspace"}
                            </h3>
                            <p className="mt-2 text-sm leading-6 text-slate-700">
                              The intake step is finished. Continue reshaping the digital flow here, and bring the imported PDF reference back in only when you need evidence, page structure, or field provenance.
                            </p>
                          </div>
                          <StatusBadge tone={workspaceLandingMode === "promoted_import" ? "success" : "info"}>
                            {workspaceLandingMode === "promoted_import" ? "Ready to author" : "Workspace reopened"}
                          </StatusBadge>
                        </div>
                        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                          <div className="grid gap-3 sm:grid-cols-3">
                            <div className="rounded-[1rem] border border-blue-100 bg-white/90 px-4 py-3">
                              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Source file</p>
                              <p className="mt-2 text-sm font-semibold text-slate-950">{activeProjectDetail?.sourceContext.filename}</p>
                            </div>
                            <div className="rounded-[1rem] border border-blue-100 bg-white/90 px-4 py-3">
                              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Imported scope</p>
                              <p className="mt-2 text-sm font-semibold text-slate-950">
                                {importedSourcePageCount} pages · {importedSourceSectionCount} sections
                              </p>
                              <p className="mt-1 text-xs text-slate-600">{importedSourceFieldCount} extracted fields</p>
                            </div>
                            <div className="rounded-[1rem] border border-blue-100 bg-white/90 px-4 py-3">
                              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Review state</p>
                              <p className="mt-2 text-sm font-semibold text-slate-950">
                                {formatLabel(activeProjectDetail?.sourceContext.reviewStatus ?? "reviewed")}
                              </p>
                              <p className="mt-1 text-xs text-slate-600">
                                {activeProjectDetail?.sourceContext.issues.length ?? 0} imported issues retained for reference
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openSourceReference(sourceReferenceOpenMode)}
                              disabled={!sourceReferenceCanOpen}
                              className={actionButtonClass("primary")}
                            >
                              {sourceReferenceActionLabel}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setProjectDetailsOpen(true);
                                setWorkspaceLandingMode(null);
                              }}
                              className={actionButtonClass()}
                            >
                              Project details
                            </button>
                            <button
                              type="button"
                              onClick={() => setWorkspaceLandingMode(null)}
                              className={actionButtonClass()}
                            >
                              Continue editing
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <div className="rounded-xl border border-soft bg-white px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => setSelectedAuthoring({ kind: "step", stepId: activeStep.id })}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Current step</p>
                          <div className="mt-1 flex min-w-0 items-center gap-3">
                            <PageIcon />
                            <h3 className="truncate text-xl font-semibold text-slate-950">{activeStep.title}</h3>
                          </div>
                          {activeStepSummary ? (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span className="app-pill">{activeStepSummary.fieldCount} fields</span>
                              <span className="app-pill">{activeStepSummary.interactiveCount} interactive</span>
                              <span className="app-pill">{activeStepSummary.statementCount} content</span>
                              {(() => {
                                const behaviorSummary = summarizeStepBehavior(activeStep);
                                return (
                                  <>
                                    {behaviorSummary.ruleCount ? <span className="app-pill">{behaviorSummary.ruleCount} rules</span> : null}
                                    {behaviorSummary.flowCount ? <span className="app-pill">{behaviorSummary.flowCount} flows</span> : null}
                                  </>
                                );
                              })()}
                            </div>
                          ) : null}
                          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{guidanceForStep(activeStep)}</p>
                        </button>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="app-pill">
                            Step {activeStepIndex + 1} of {activeDocument.steps.length}
                          </div>
                          {isPdfBackedProject ? (
                            <button
                              type="button"
                              onClick={() => openSourceReference(sourceReferenceOpenMode)}
                              disabled={!sourceReferenceCanOpen}
                              className={actionButtonClass()}
                            >
                              {sourceReferenceActionLabel}
                            </button>
                          ) : null}
                          <button type="button" title="Add section" aria-label="Add section" onClick={() => handleAddSectionToStep(activeStep.id)} className={iconButtonClass("primary")}>
                            <PlusIcon />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[1.45rem] border border-soft bg-white p-4 shadow-[0_20px_44px_rgba(19,32,51,0.08)]">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Runtime page preview</p>
                          {isEditingDocumentTitle ? (
                            <div className="mt-1 flex items-center gap-2">
                              <input
                                value={activeDocument.title}
                                onChange={(event) =>
                                  updateAuthoringDocument((document) => {
                                    document.title = event.target.value;
                                  })
                                }
                                className="w-full max-w-[24rem] rounded-2xl border border-soft px-4 py-2.5 text-sm text-slate-800"
                              />
                              <button type="button" title="Done editing title" aria-label="Done editing title" onClick={() => setIsEditingDocumentTitle(false)} className={actionButtonClass("primary")}>
                                Done
                              </button>
                            </div>
                          ) : (
                            <div className="mt-1 flex items-center gap-2">
                              <p className="text-lg font-semibold text-slate-950">{activeDocument.title}</p>
                              <button type="button" title="Edit title" aria-label="Edit title" onClick={() => setIsEditingDocumentTitle(true)} className={actionButtonClass()}>
                                Edit
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-4">
                        {activeStep.sections.length
                          ? activeStep.sections.map((section, sectionIndex) => (
                              <div key={section.id} className="space-y-3">
                                {renderDropMarker(
                                  {
                                    kind: "section-list",
                                    stepId: activeStep.id,
                                    index: sectionIndex,
                                  },
                                  { label: "Insert section here" },
                                )}
                                <section
                                  draggable
                                  onDragStart={() => handleSelectionDragStart({ kind: "section", stepId: activeStep.id, sectionId: section.id })}
                                  onDragEnd={clearDragInteraction}
                                  onDragOver={(event) =>
                                    handleDropZoneDragOver(event, {
                                      kind: "section-list",
                                      stepId: activeStep.id,
                                      index: sectionIndex,
                                    })}
                                  onDragLeave={() =>
                                    handleDropZoneDragLeave({
                                      kind: "section-list",
                                      stepId: activeStep.id,
                                      index: sectionIndex,
                                    })}
                                  onDrop={(event) =>
                                    handleDropTarget(event, {
                                      kind: "section-list",
                                      stepId: activeStep.id,
                                      index: sectionIndex,
                                    })}
                                  onClick={() => setSelectedAuthoring({ kind: "section", stepId: activeStep.id, sectionId: section.id })}
                                  className={`cursor-pointer rounded-[1.45rem] border p-5 ${
                                    selectedAuthoring?.kind === "section" && selectedAuthoring.sectionId === section.id
                                      ? "border-blue-300 bg-[#f6f9ff]"
                                      : "border-soft bg-[#fbfcff]"
                                  }`}
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <h4 className="text-xl font-semibold text-slate-950">{section.title}</h4>
                                      {section.description ? (
                                        <p className="mt-2 text-sm leading-6 text-slate-600">{section.description}</p>
                                      ) : null}
                                      {(() => {
                                        const behaviorSummary = summarizeSectionBehavior(section);
                                        return behaviorSummary.ruleCount || behaviorSummary.flowCount ? (
                                          <div className="mt-3 flex flex-wrap gap-2">
                                            {behaviorSummary.ruleCount ? <span className="app-pill">{behaviorSummary.ruleCount} rules</span> : null}
                                            {behaviorSummary.flowCount ? <span className="app-pill">{behaviorSummary.flowCount} flows</span> : null}
                                          </div>
                                        ) : null;
                                      })()}
                                    </div>
                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                      {selectedAuthoring?.kind === "section" && selectedAuthoring.sectionId === section.id
                                        ? renderBehaviorQuickToolbar({ compact: true, stopPropagation: true, label: "Behavior" })
                                        : null}
                                      <button type="button" title="Add group" aria-label="Add group" onClick={(event) => { event.stopPropagation(); handleAddGroupToSection(activeStep.id, section.id); }} className={iconButtonClass("primary")}>
                                        <GroupIcon />
                                      </button>
                                      <button type="button" title="Add field" aria-label="Add field" onClick={(event) => { event.stopPropagation(); handleAddFieldToContainer(activeStep.id, section.id); }} className={iconButtonClass()}>
                                        <FieldIcon />
                                      </button>
                                      <button type="button" title="Remove section" aria-label="Remove section" onClick={(event) => { event.stopPropagation(); handleRemoveSection(activeStep.id, section.id); }} className={iconButtonClass("danger")}>
                                        <RemoveIcon />
                                      </button>
                                    </div>
                                  </div>

                                  <div className="mt-4 space-y-4">
                                    {section.groups.length ? (
                                      section.groups.map((group, groupIndex) => (
                                        <div key={group.id} className="space-y-3">
                                          {renderDropMarker(
                                            {
                                              kind: "group-list",
                                              stepId: activeStep.id,
                                              sectionId: section.id,
                                              index: groupIndex,
                                            },
                                            { label: "Insert group here" },
                                          )}
                                          <div
                                            draggable
                                            onDragStart={() => handleSelectionDragStart({ kind: "group", stepId: activeStep.id, sectionId: section.id, groupId: group.id })}
                                            onDragEnd={clearDragInteraction}
                                            onDragOver={(event) =>
                                              handleDropZoneDragOver(event, {
                                                kind: "group-list",
                                                stepId: activeStep.id,
                                                sectionId: section.id,
                                                index: groupIndex,
                                              })}
                                            onDragLeave={() =>
                                              handleDropZoneDragLeave({
                                                kind: "group-list",
                                                stepId: activeStep.id,
                                                sectionId: section.id,
                                                index: groupIndex,
                                              })}
                                            onDrop={(event) =>
                                              handleDropTarget(event, {
                                                kind: "group-list",
                                                stepId: activeStep.id,
                                                sectionId: section.id,
                                                index: groupIndex,
                                              })
                                            }
                                            onClick={() => setSelectedAuthoring({ kind: "group", stepId: activeStep.id, sectionId: section.id, groupId: group.id })}
                                            className={`cursor-pointer rounded-[1.2rem] border p-4 ${
                                              selectedAuthoring?.kind === "group" && selectedAuthoring.groupId === group.id
                                                ? "border-blue-300 bg-white"
                                                : "border-soft bg-white"
                                            }`}
                                          >
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                              <div>
                                                <p className="text-sm font-semibold text-slate-950">{group.label}</p>
                                                {group.description ? (
                                                  <p className="mt-1 text-sm leading-6 text-slate-600">{group.description}</p>
                                                ) : null}
                                                {(() => {
                                                  const behaviorSummary = summarizeGroupBehavior(group);
                                                  return behaviorSummary.ruleCount || behaviorSummary.flowCount ? (
                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                      {behaviorSummary.ruleCount ? <span className="app-pill">{behaviorSummary.ruleCount} rules</span> : null}
                                                      {behaviorSummary.flowCount ? <span className="app-pill">{behaviorSummary.flowCount} flows</span> : null}
                                                    </div>
                                                  ) : null;
                                                })()}
                                              </div>
                                              <div className="flex flex-wrap items-center justify-end gap-2">
                                                {selectedAuthoring?.kind === "group" && selectedAuthoring.groupId === group.id
                                                  ? renderBehaviorQuickToolbar({ compact: true, stopPropagation: true, label: "Behavior" })
                                                  : null}
                                                <button type="button" title="Add field" aria-label="Add field" onClick={(event) => { event.stopPropagation(); handleAddFieldToContainer(activeStep.id, section.id, group.id); }} className={iconButtonClass("primary")}>
                                                  <FieldIcon />
                                                </button>
                                                <button type="button" title="Remove group" aria-label="Remove group" onClick={(event) => { event.stopPropagation(); handleRemoveGroup(activeStep.id, section.id, group.id); }} className={iconButtonClass("danger")}>
                                                  <RemoveIcon />
                                                </button>
                                              </div>
                                            </div>
                                            <div
                                              className="mt-4 grid gap-4 md:grid-cols-2"
                                              onDragOver={(event) =>
                                                handleDropZoneDragOver(event, {
                                                  kind: "field-list",
                                                  stepId: activeStep.id,
                                                  sectionId: section.id,
                                                  groupId: group.id,
                                                  index: group.fields.length,
                                                })}
                                              onDragLeave={() =>
                                                handleDropZoneDragLeave({
                                                  kind: "field-list",
                                                  stepId: activeStep.id,
                                                  sectionId: section.id,
                                                  groupId: group.id,
                                                  index: group.fields.length,
                                                })}
                                              onDrop={(event) =>
                                                handleDropTarget(event, {
                                                  kind: "field-list",
                                                  stepId: activeStep.id,
                                                  sectionId: section.id,
                                                  groupId: group.id,
                                                  index: group.fields.length,
                                                })
                                              }
                                            >
                                              {group.fields.length
                                                ? group.fields.map((field, fieldIndex) => (
                                                    <div key={field.id} className="contents">
                                                      {renderDropMarker(
                                                        {
                                                          kind: "field-list",
                                                          stepId: activeStep.id,
                                                          sectionId: section.id,
                                                          groupId: group.id,
                                                          index: fieldIndex,
                                                        },
                                                        { gridSpan: true, label: "Insert field here" },
                                                      )}
                                                      {renderBuilderFieldCard(activeStep.id, section.id, field, fieldIndex, group.id)}
                                                    </div>
                                                  ))
                                                : renderEmptyDropZone(
                                                    {
                                                      kind: "field-list",
                                                      stepId: activeStep.id,
                                                      sectionId: section.id,
                                                      groupId: group.id,
                                                      index: 0,
                                                    },
                                                    {
                                                      title: "No fields in this group yet",
                                                      description: "Drop a field here or use Add field to start the grouped layout.",
                                                      activeTitle: "Drop field into this group",
                                                    },
                                                    { gridSpan: true },
                                                  )}
                                              {group.fields.length
                                                ? renderDropMarker(
                                                    {
                                                      kind: "field-list",
                                                      stepId: activeStep.id,
                                                      sectionId: section.id,
                                                      groupId: group.id,
                                                      index: group.fields.length,
                                                    },
                                                    { gridSpan: true, label: "Insert field at end" },
                                                  )
                                                : null}
                                            </div>
                                          </div>
                                        </div>
                                      ))
                                    ) : (
                                      renderEmptyDropZone(
                                        {
                                          kind: "group-list",
                                          stepId: activeStep.id,
                                          sectionId: section.id,
                                          index: 0,
                                        },
                                        {
                                          title: "No groups in this section yet",
                                          description: "Drop a group here to create a grouped block, or use Add group when you want a fresh container.",
                                          activeTitle: "Drop group into this section",
                                        },
                                      )
                                    )}
                                    {section.groups.length
                                      ? renderDropMarker(
                                          {
                                            kind: "group-list",
                                            stepId: activeStep.id,
                                            sectionId: section.id,
                                            index: section.groups.length,
                                          },
                                          { label: "Insert group at end" },
                                        )
                                      : null}

                                    <div
                                      className="grid gap-4 md:grid-cols-2"
                                      onDragOver={(event) =>
                                        handleDropZoneDragOver(event, {
                                          kind: "field-list",
                                          stepId: activeStep.id,
                                          sectionId: section.id,
                                          index: section.fields.length,
                                        })}
                                      onDragLeave={() =>
                                        handleDropZoneDragLeave({
                                          kind: "field-list",
                                          stepId: activeStep.id,
                                          sectionId: section.id,
                                          index: section.fields.length,
                                        })}
                                      onDrop={(event) =>
                                        handleDropTarget(event, {
                                          kind: "field-list",
                                          stepId: activeStep.id,
                                          sectionId: section.id,
                                          index: section.fields.length,
                                        })
                                      }
                                    >
                                      {section.fields.length
                                        ? section.fields.map((field, fieldIndex) => (
                                            <div key={field.id} className="contents">
                                              {renderDropMarker(
                                                {
                                                  kind: "field-list",
                                                  stepId: activeStep.id,
                                                  sectionId: section.id,
                                                  index: fieldIndex,
                                                },
                                                { gridSpan: true, label: "Insert field here" },
                                              )}
                                              {renderBuilderFieldCard(activeStep.id, section.id, field, fieldIndex)}
                                            </div>
                                          ))
                                        : renderEmptyDropZone(
                                            {
                                              kind: "field-list",
                                              stepId: activeStep.id,
                                              sectionId: section.id,
                                              index: 0,
                                            },
                                            {
                                              title: "No standalone fields in this section",
                                              description: "Drop a field here for direct section content, or use Add field to seed the layout.",
                                              activeTitle: "Drop field into this section",
                                            },
                                            { gridSpan: true },
                                          )}
                                      {section.fields.length
                                        ? renderDropMarker(
                                            {
                                              kind: "field-list",
                                              stepId: activeStep.id,
                                              sectionId: section.id,
                                              index: section.fields.length,
                                            },
                                            { gridSpan: true, label: "Insert field at end" },
                                          )
                                        : null}
                                    </div>
                                  </div>
                                </section>
                              </div>
                            ))
                          : renderEmptyDropZone(
                              {
                                kind: "section-list",
                                stepId: activeStep.id,
                                index: 0,
                              },
                              {
                                title: "No sections in this step yet",
                                description: "Drop a section here or use Add section to give this step a clearer structure before you add fields.",
                                activeTitle: "Drop section into this step",
                              },
                            )}
                        {activeStep.sections.length
                          ? renderDropMarker(
                              {
                                kind: "section-list",
                                stepId: activeStep.id,
                                index: activeStep.sections.length,
                              },
                              { label: "Insert section at end" },
                            )
                          : null}
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.15rem] border border-soft bg-[#f8fbff] px-4 py-3">
                          <span className="text-sm text-slate-600">Runtime navigation preview</span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                invokeRuntimeAction({
                                  id: "preview_previous_step",
                                  kind: "go_to_previous_step",
                                  config: {},
                                  continueOnError: false,
                                })
                              }
                              disabled={activeStepIndex <= 0}
                              className={actionButtonClass()}
                            >
                              Previous
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                invokeRuntimeAction({
                                  id: activeStepIndex === activeDocument.steps.length - 1 ? "preview_submit" : "preview_next_step",
                                  kind: activeStepIndex === activeDocument.steps.length - 1 ? "submit_form" : "go_to_next_step",
                                  config: {},
                                  continueOnError: false,
                                })
                              }
                              className={actionButtonClass("primary")}
                            >
                              {activeStepIndex === activeDocument.steps.length - 1 ? "Submit" : "Continue"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="app-muted-card p-6 text-sm text-slate-500">Promote a reviewed conversion to start building.</div>
                )}
              </PanelCard>

              <PanelCard
                title="Inspector"
                eyebrow="Properties and behavior"
                aside={
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      title="Properties"
                      aria-label="Properties"
                      onClick={() => setInspectorTab("properties")}
                      className={iconButtonClass(inspectorTab === "properties" ? "primary" : "secondary")}
                    >
                      <PropertiesIcon />
                    </button>
                    <button
                      type="button"
                      title="Behavior"
                      aria-label="Behavior"
                      onClick={() => {
                        setBehaviorGraphEntryContext(null);
                        setInspectorTab("behavior");
                      }}
                      className={iconButtonClass(inspectorTab === "behavior" ? "primary" : "secondary")}
                    >
                      <LogicIcon />
                    </button>
                    <button
                      type="button"
                      title="Map"
                      aria-label="Map"
                      onClick={() => setInspectorTab("map")}
                      className={iconButtonClass(inspectorTab === "map" ? "primary" : "secondary")}
                    >
                      <MapIcon />
                    </button>
                  </div>
                }
                className="min-h-[52rem] min-w-0 overflow-hidden"
              >
                {activeDocument ? (
                  <div className="space-y-4">
                    <div className="app-muted-card p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Current selection</p>
                        <div className="flex gap-2">
                          {isPdfBackedProject && selectedAuthoring !== null ? (
                            <button
                              type="button"
                              onClick={() => openSourceReference(sourceReferenceOpenMode)}
                              disabled={!sourceReferenceCanOpen}
                              className={actionButtonClass(sourceReferenceFocusHasMatches ? "primary" : "secondary")}
                            >
                              {sourceReferenceActionLabel}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedAuthoring(null);
                              setBehaviorGraphEntryContext(null);
                              setInspectorTab("behavior");
                            }}
                            className={actionButtonClass(selectedAuthoring === null ? "primary" : "secondary")}
                          >
                            Form behavior
                          </button>
                          {selectedAuthoring === null && activeStep ? (
                            <button
                              type="button"
                              onClick={() => setSelectedAuthoring({ kind: "step", stepId: activeStep.id })}
                              className={actionButtonClass()}
                            >
                              Return to step
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <h3 className="mt-2 text-lg font-semibold text-slate-950">
                        {selectedAuthoring === null
                          ? activeDocument.title
                          : selectedAuthoring?.kind === "field"
                          ? activeBuilderField?.label
                          : selectedAuthoring?.kind === "group"
                            ? activeGroup?.label
                            : selectedAuthoring?.kind === "section"
                              ? activeSection?.title
                              : activeStep?.title ?? activeDocument.title}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {selectedAuthoring === null
                          ? "You are editing form-level runtime behavior. Switch back to a selected node any time from the preview."
                          : "The preview is the main editing surface. Use this panel to refine the selected node."}
                      </p>
                    </div>

                    {inspectorTab === "properties" ? (
                      <div className="space-y-4">
                        {selectedAuthoring?.kind === "step" && activeStep ? (
                          <div className="rounded-[1.15rem] border border-soft bg-white p-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Step title</label>
                              <button type="button" onClick={() => handleRemoveStep(activeStep.id)} className={actionButtonClass("danger")}>
                                Remove step
                              </button>
                            </div>
                            <input
                              value={activeStep.title}
                              onChange={(event) =>
                                updateAuthoringDocument((document) => {
                                  const step = document.steps.find((candidate) => candidate.id === activeStep.id);
                                  if (step) {
                                    step.title = event.target.value;
                                  }
                                })
                              }
                              className="mt-2 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                            />
                            <textarea
                              value={activeStep.description ?? ""}
                              onChange={(event) =>
                                updateAuthoringDocument((document) => {
                                  const step = document.steps.find((candidate) => candidate.id === activeStep.id);
                                  if (step) {
                                    step.description = event.target.value;
                                  }
                                })
                              }
                              rows={3}
                              className="mt-3 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                            />
                          </div>
                        ) : null}

                        {selectedAuthoring?.kind === "section" && activeSection ? (
                          <div className="rounded-[1.15rem] border border-soft bg-white p-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Section title</label>
                              <button
                                type="button"
                                onClick={() => handleRemoveSection(selectedAuthoring.stepId, selectedAuthoring.sectionId)}
                                className={actionButtonClass("danger")}
                              >
                                Remove section
                              </button>
                            </div>
                            <input
                              value={activeSection.title}
                              onChange={(event) =>
                                updateAuthoringDocument((document) => {
                                  const step = document.steps.find((candidate) => candidate.id === selectedAuthoring.stepId);
                                  const section = step?.sections.find((candidate) => candidate.id === selectedAuthoring.sectionId);
                                  if (section) {
                                    section.title = event.target.value;
                                  }
                                })
                              }
                              className="mt-2 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                            />
                            <textarea
                              value={activeSection.description ?? ""}
                              onChange={(event) =>
                                updateAuthoringDocument((document) => {
                                  const step = document.steps.find((candidate) => candidate.id === selectedAuthoring.stepId);
                                  const section = step?.sections.find((candidate) => candidate.id === selectedAuthoring.sectionId);
                                  if (section) {
                                    section.description = event.target.value;
                                  }
                                })
                              }
                              rows={3}
                              className="mt-3 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                            />
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button type="button" onClick={() => handleAddGroupToSection(selectedAuthoring.stepId, selectedAuthoring.sectionId)} className={actionButtonClass()}>
                                Add group
                              </button>
                              <button type="button" onClick={() => handleAddField("section")} className={actionButtonClass()}>
                                Add field
                              </button>
                            </div>
                          </div>
                        ) : null}

                        {selectedAuthoring?.kind === "group" && activeGroup ? (
                          <div className="rounded-[1.15rem] border border-soft bg-white p-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Group label</label>
                              <button
                                type="button"
                                onClick={() => handleRemoveGroup(selectedAuthoring.stepId, selectedAuthoring.sectionId, selectedAuthoring.groupId)}
                                className={actionButtonClass("danger")}
                              >
                                Remove group
                              </button>
                            </div>
                            <input
                              value={activeGroup.label}
                              onChange={(event) =>
                                updateAuthoringDocument((document) => {
                                  const step = document.steps.find((candidate) => candidate.id === selectedAuthoring.stepId);
                                  const section = step?.sections.find((candidate) => candidate.id === selectedAuthoring.sectionId);
                                  const group = section?.groups.find((candidate) => candidate.id === selectedAuthoring.groupId);
                                  if (group) {
                                    group.label = event.target.value;
                                  }
                                })
                              }
                              className="mt-2 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                            />
                            <textarea
                              value={activeGroup.description ?? ""}
                              onChange={(event) =>
                                updateAuthoringDocument((document) => {
                                  const step = document.steps.find((candidate) => candidate.id === selectedAuthoring.stepId);
                                  const section = step?.sections.find((candidate) => candidate.id === selectedAuthoring.sectionId);
                                  const group = section?.groups.find((candidate) => candidate.id === selectedAuthoring.groupId);
                                  if (group) {
                                    group.description = event.target.value;
                                  }
                                })
                              }
                              rows={3}
                              className="mt-3 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                            />
                            <div className="mt-3">
                              <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => handleAddField("group")} className={actionButtonClass()}>
                                  Add field to group
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : null}

                        {selectedAuthoring?.kind === "field" && activeBuilderField ? (
                          <div className="space-y-4 rounded-[1.15rem] border border-soft bg-white p-4">
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => handleRemoveField(selectedAuthoring.stepId, selectedAuthoring.sectionId, selectedAuthoring.fieldId, selectedAuthoring.groupId)}
                                className={actionButtonClass("danger")}
                              >
                                Remove field
                              </button>
                            </div>
                            <div>
                              <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Field label</label>
                              <input
                                value={activeBuilderField.label}
                                onChange={(event) => updateSelectedField((field) => { field.label = event.target.value; })}
                                className="mt-2 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                              />
                            </div>
                            <div>
                              <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Help text</label>
                              <textarea
                                value={activeBuilderField.helpText ?? ""}
                                onChange={(event) => updateSelectedField((field) => { field.helpText = event.target.value; })}
                                rows={3}
                                className="mt-2 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                              />
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div>
                                <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Field type</label>
                                <select
                                  value={activeBuilderField.rendererHints.component === "button" ? "action_button" : activeBuilderField.semanticType}
                                  onChange={(event) =>
                                    updateSelectedField((field) => {
                                      if (event.target.value === "action_button") {
                                        convertFieldToActionButton(field);
                                        return;
                                      }
                                      refreshChoiceOptions(field, event.target.value as SemanticType);
                                    })
                                  }
                                  className="mt-2 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                                >
                                  {builderFieldTypeOptions.map((type) => (
                                    <option key={type.value} value={type.value}>
                                      {type.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <label className="mt-6 flex items-center gap-3 rounded-2xl border border-soft bg-slate-50 px-4 py-3">
                                <input
                                  type="checkbox"
                                  checked={activeBuilderField.required}
                                  onChange={(event) => updateSelectedField((field) => { field.required = event.target.checked; })}
                                />
                                <span className="text-sm text-slate-700">Required</span>
                              </label>
                            </div>
                            {activeBuilderField.rendererHints.component === "button" ? (
                              <p className="text-sm leading-6 text-slate-500">
                                Buttons are runtime components. Configure their behavior from the Behavior tab so the runtime engine and builder preview stay in sync.
                              </p>
                            ) : null}
                            {activeBuilderField.rendererHints.component === "button" ? (
                              <div className="rounded-[1rem] border border-soft bg-slate-50 p-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div>
                                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Runtime behavior</p>
                                    <p className="mt-2 text-sm text-slate-700">
                                      Current button behavior: {formatLabel(getButtonBehaviorSummary(activeBuilderField).action)}
                                    </p>
                                  </div>
                                  <button type="button" onClick={() => setInspectorTab("behavior")} className={actionButtonClass("primary")}>
                                    Open Behavior
                                  </button>
                                </div>
                              </div>
                            ) : null}
                            {(activeBuilderField.semanticType === "radio" ||
                              activeBuilderField.semanticType === "checkbox" ||
                              activeBuilderField.semanticType === "select") ? (
                              <div className="rounded-[1rem] border border-soft bg-slate-50 p-4">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Options</p>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateSelectedField((field) => {
                                        field.options.push({
                                          value: `option_${field.options.length + 1}`,
                                          label: `Option ${field.options.length + 1}`,
                                          orderIndex: field.options.length,
                                          selectedByDefault: false,
                                          evidence: [],
                                        });
                                      })
                                    }
                                    className={actionButtonClass()}
                                  >
                                    Add option
                                  </button>
                                </div>
                                <div className="mt-3 space-y-2">
                                  {activeBuilderField.options.map((option, index) => (
                                    <div key={`${activeBuilderField.id}-${option.value}-${index}`} className="flex items-center gap-2">
                                      <input
                                        value={option.label}
                                        onChange={(event) =>
                                          updateSelectedField((field) => {
                                            if (field.options[index]) {
                                              field.options[index].label = event.target.value;
                                              field.options[index].value = event.target.value.toLowerCase().replaceAll(/\s+/g, "_");
                                            }
                                          })
                                        }
                                        className="flex-1 rounded-2xl border border-soft px-4 py-2 text-sm text-slate-800"
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateSelectedField((field) => {
                                            if (field.options.length > 1) {
                                              field.options.splice(index, 1);
                                              field.options.forEach((current, currentIndex) => {
                                                current.orderIndex = currentIndex;
                                              });
                                            }
                                          })
                                        }
                                        className={actionButtonClass("danger")}
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : inspectorTab === "map" ? (
                      <div className="space-y-4">
                        {logicMapData ? (
                          <>
                            <div className="rounded-[1.15rem] border border-soft bg-white p-4">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Flow map</p>
                                  <h4 className="mt-2 text-lg font-semibold text-slate-950">Document logic and runtime graph</h4>
                                  <p className="mt-2 text-sm leading-6 text-slate-600">
                                    Use this as the high-level map for behavior flows, then jump into the focused behavior editor only when you need to change a specific rule or interaction.
                                  </p>
                                  <div className="mt-4 flex flex-wrap gap-2">
                                    <span className="app-pill">{logicMapData.steps.length} steps</span>
                                    <span className="app-pill">{logicMapData.totalConditionals} state rules</span>
                                    <span className="app-pill">{logicMapData.totalListeners} behavior flows</span>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setMapViewMode("graph")}
                                    className={actionButtonClass(mapViewMode === "graph" ? "primary" : "secondary")}
                                  >
                                    Graph overview
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setMapViewMode("summary")}
                                    className={actionButtonClass(mapViewMode === "summary" ? "primary" : "secondary")}
                                  >
                                    Summary list
                                  </button>
                                </div>
                              </div>
                            </div>

                            {mapViewMode === "graph" ? (
                              renderMapGraphOverview()
                            ) : (
                              <>
                            <div className="rounded-[1.15rem] border border-soft bg-white p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Form runtime</p>
                                  <p className="mt-2 text-sm text-slate-700">
                                    These listeners are global to the document and fire outside any single step or field.
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    focusBehaviorGraphNode({
                                      selection: null,
                                      graphSelection: logicMapData.formListeners[0]?.graphSelection ?? null,
                                      viewport: "reset",
                                      entryContext: {
                                        source: "map",
                                        title: "Opened from Map",
                                        detail: "Form-level runtime opened from Summary list into the focused behavior workspace.",
                                      },
                                    });
                                  }}
                                  className={actionButtonClass("primary")}
                                >
                                  Open form behavior
                                </button>
                              </div>
                              <div className="mt-4 space-y-3">
                                {logicMapData.formListeners.length ? (
                                  logicMapData.formListeners.map((listener) => (
                                    <div key={listener.id} className="rounded-[1rem] border border-soft bg-slate-50 p-4">
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{listener.scopeLabel}</p>
                                          <p className="mt-2 font-semibold text-slate-950">When {formatLabel(listener.eventName)}</p>
                                          <p className="mt-2 text-sm leading-6 text-slate-600">{listener.actionsSummary}</p>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            focusBehaviorGraphNode({
                                              selection: null,
                                              graphSelection: listener.graphSelection,
                                              viewport: "reset",
                                              entryContext: {
                                                source: "map",
                                                title: "Opened from Map",
                                                detail: "Form-level runtime flow opened from Summary list into the focused behavior workspace.",
                                              },
                                            });
                                          }}
                                          className={actionButtonClass()}
                                        >
                                          Open in graph
                                        </button>
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <div className="app-muted-card p-4 text-sm text-slate-500">
                                    No form-level behavior yet. Use the Behavior editor when the document needs load, submit, or host-level orchestration.
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="space-y-4">
                              {logicMapData.steps.map((step) => (
                                <div key={step.id} className="rounded-[1.15rem] border border-soft bg-white p-4">
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Step map</p>
                                      <h4 className="mt-2 text-lg font-semibold text-slate-950">{step.title}</h4>
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        <span className="app-pill">{step.sectionCount} sections</span>
                                        <span className="app-pill">{step.fieldCount} fields</span>
                                        <span className="app-pill">{step.conditionalRules.length} rules</span>
                                        <span className="app-pill">{step.runtimeListeners.length} listeners</span>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setSelectedAuthoring(step.selection)}
                                      className={actionButtonClass()}
                                    >
                                      Focus step
                                    </button>
                                  </div>

                                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                                    <div className="rounded-[1rem] border border-soft bg-slate-50 p-4">
                                      <div className="flex items-center justify-between gap-3">
                                        <div>
                                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">State rules</p>
                                          <p className="mt-2 text-sm text-slate-700">
                                            Visibility and requirement logic authored on fields in this step.
                                          </p>
                                        </div>
                                      </div>
                                      <div className="mt-4 space-y-3">
                                        {step.conditionalRules.length ? (
                                          step.conditionalRules.map((rule) => (
                                            <div key={rule.id} className="rounded-[0.95rem] border border-soft bg-white p-4">
                                              <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                  <p className="font-semibold text-slate-950">{rule.title}</p>
                                                  <p className="mt-2 text-sm leading-6 text-slate-600">{rule.detail}</p>
                                                </div>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    focusBehaviorGraphNode({
                                                      selection: rule.sourceSelection,
                                                      graphSelection: rule.graphSelection,
                                                      ruleIndex: rule.ruleIndex,
                                                      viewport: "reset",
                                                      entryContext: {
                                                        source: "map",
                                                        title: "Opened from Map",
                                                        detail: `State flow opened from Summary list for ${step.title}.`,
                                                      },
                                                    });
                                                  }}
                                                  className={actionButtonClass()}
                                                >
                                                  Open in graph
                                                </button>
                                              </div>
                                            </div>
                                          ))
                                        ) : (
                                          <div className="app-muted-card p-4 text-sm text-slate-500">
                                            No field state rules in this step yet.
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    <div className="rounded-[1rem] border border-soft bg-slate-50 p-4">
                                      <div className="flex items-center justify-between gap-3">
                                        <div>
                                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Interaction flows</p>
                                          <p className="mt-2 text-sm text-slate-700">
                                            Listener chains attached to the step and its descendant nodes.
                                          </p>
                                        </div>
                                      </div>
                                      <div className="mt-4 space-y-3">
                                        {step.runtimeListeners.length ? (
                                          step.runtimeListeners.map((listener) => (
                                            <div key={listener.id} className="rounded-[0.95rem] border border-soft bg-white p-4">
                                              <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{listener.scopeLabel}</p>
                                                  <p className="mt-2 font-semibold text-slate-950">When {formatLabel(listener.eventName)}</p>
                                                  <p className="mt-2 text-sm leading-6 text-slate-600">{listener.actionsSummary}</p>
                                                </div>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    focusBehaviorGraphNode({
                                                      selection: listener.selection,
                                                      graphSelection: listener.graphSelection,
                                                      viewport: "reset",
                                                      entryContext: {
                                                        source: "map",
                                                        title: "Opened from Map",
                                                        detail: `Interaction flow opened from Summary list for ${step.title}.`,
                                                      },
                                                    });
                                                  }}
                                                  className={actionButtonClass()}
                                                >
                                                  Open in graph
                                                </button>
                                              </div>
                                            </div>
                                          ))
                                        ) : (
                                          <div className="app-muted-card p-4 text-sm text-slate-500">
                                            No interaction flows in this step yet.
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                              </>
                            )}
                          </>
                        ) : (
                          <div className="app-muted-card p-4 text-sm text-slate-500">
                            No logic map is available until a document is loaded.
                          </div>
                        )}
                      </div>
                    ) : (
                      renderBehaviorInspectorPanel()
                    )}
                  </div>
                ) : (
                  <div className="app-muted-card p-6 text-sm text-slate-500">No project selected.</div>
                )}
              </PanelCard>
              {behaviorStudioOpen && activeDocument ? (
                <div
                  className={`fixed inset-0 z-[55] overflow-hidden overscroll-contain bg-slate-950/28 p-2 pt-3 sm:p-4 ${
                    behaviorStudioPosition.anchored ? "" : "flex items-start justify-center"
                  }`}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      closeBehaviorStudio();
                    }
                  }}
                >
                  <div
                    ref={behaviorStudioDialogRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="behavior-studio-title"
                    tabIndex={-1}
                    style={behaviorStudioPosition.dialogStyle}
                    className={`relative flex w-full flex-col overflow-hidden rounded-[1.15rem] border border-soft bg-[#f5f7fb] shadow-[0_24px_64px_rgba(15,23,42,0.24)] outline-none ${
                      behaviorStudioMode === "graph"
                        ? "h-[calc(100dvh-2rem)] max-w-[84rem]"
                        : behaviorStudioWorkspaceShell
                          ? behaviorStudioMode === "test"
                            ? "h-[min(74dvh,38.75rem)] max-w-[56rem]"
                            : "h-[min(82dvh,45rem)] max-w-[70rem]"
                          : "h-[min(72dvh,33.75rem)] max-w-[47rem]"
                    }`}
                  >
                    {behaviorStudioPosition.anchored ? (
                      <span
                        aria-hidden="true"
                        style={behaviorStudioPosition.arrowStyle}
                        className={`pointer-events-none absolute z-10 h-3 w-3 -translate-x-1/2 rotate-45 border-slate-200 ${
                          behaviorStudioPosition.placement === "below"
                            ? "-top-1.5 border-l border-t bg-white/96"
                            : "-bottom-1.5 border-b border-r bg-[#f5f7fb]"
                        }`}
                      />
                    ) : null}
                    <div className="shrink-0 border-b border-slate-200 bg-white/96 px-3 py-2.5 backdrop-blur sm:px-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Behavior studio</p>
                          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
                            <h3 id="behavior-studio-title" className="text-lg font-semibold text-slate-950">
                              {behaviorStudioMode === "create"
                                ? "Create behavior"
                                : behaviorStudioMode === "manage"
                                  ? "Rules Manager"
                                  : behaviorStudioMode === "test"
                                    ? "Runtime lab"
                                    : "Graph view"}
                            </h3>
                            <span className="app-pill max-w-[22rem] truncate">{currentBehaviorSelectionSummary()}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setBehaviorFocusTarget(null);
                              setBehaviorStudioMode("create");
                              setBehaviorStudioView("studio");
                            }}
                            className={actionButtonClass(behaviorStudioMode === "create" ? "primary" : "secondary")}
                          >
                            Create
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setBehaviorStudioCreationKind(null);
                              setBehaviorFocusTarget(null);
                              setBehaviorStudioManagerMode("all");
                              setBehaviorStudioMode("manage");
                              setBehaviorStudioView("studio");
                            }}
                            className={actionButtonClass(behaviorStudioMode === "manage" ? "primary" : "secondary")}
                          >
                            Manage
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setBehaviorStudioCreationKind(null);
                              setBehaviorFocusTarget(null);
                              setBehaviorStudioMode("test");
                              setBehaviorStudioView("studio");
                            }}
                            className={actionButtonClass(behaviorStudioMode === "test" ? "primary" : "secondary")}
                          >
                            Test
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setBehaviorStudioCreationKind(null);
                              setBehaviorFocusTarget(null);
                              setBehaviorStudioAnchor(null);
                              setBehaviorStudioMode("graph");
                              setBehaviorStudioView("advanced");
                            }}
                            className={actionButtonClass(behaviorStudioMode === "graph" ? "primary" : "secondary")}
                          >
                            Graph
                          </button>
                          <button type="button" aria-label="Close behavior studio" onClick={closeBehaviorStudio} className={iconButtonClass()}>
                            ×
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4">
                      {behaviorStudioMode === "manage"
                        ? renderBehaviorStudioManager()
                        : behaviorStudioMode === "create"
                          ? renderBehaviorStudioSurface()
                          : behaviorStudioMode === "test"
                            ? renderBehaviorStudioTestPanel()
                            : renderBehaviorWorkspace()}
                    </div>
                  </div>
                </div>
              ) : null}
              {sourceDrawerOpen && sourceContextDraft ? (
                <div className="fixed inset-0 z-50 bg-slate-950/35 p-4 backdrop-blur-sm">
                  <div className="mx-auto flex h-full max-w-[92rem] flex-col overflow-hidden rounded-[1.5rem] border border-soft bg-white shadow-[0_32px_90px_rgba(15,23,42,0.28)]">
                <PanelCard
                  title="Source Compare Workspace"
                  eyebrow="Imported PDF evidence on demand"
                  aside={
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSourceReferenceFilterMode("matches")}
                        disabled={!sourceReferenceFocusHasMatches}
                        className={subtleButtonClass(sourceReferenceFilterMode === "matches" && sourceReferenceFocusHasMatches)}
                      >
                        Matching only
                      </button>
                      <button
                        type="button"
                        onClick={() => setSourceReferenceFilterMode("all")}
                        className={subtleButtonClass(sourceReferenceFilterMode === "all")}
                      >
                        All source
                      </button>
                      <button type="button" onClick={() => setSourceDrawerOpen(false)} className={actionButtonClass()}>
                        Close compare
                      </button>
                    </div>
                  }
                  className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                >
                  <div className="space-y-4">
                    <div className="app-muted-card p-4">
                      <p className="text-sm font-semibold text-slate-950">{activeProjectDetail?.sourceContext.filename}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {activeProjectDetail?.sourceContext.issues.length ?? 0} imported issues · source conversion {activeProjectDetail?.sourceContext.conversionId}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Keep this open only when it helps. Use it to compare the current authored step against the imported PDF structure, then return to shaping the digital flow in the main workspace.
                      </p>
                      {activeStepSourcePageIds.size ? (
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          The current step traces back to {activeStepSourcePageIds.size} imported page{activeStepSourcePageIds.size === 1 ? "" : "s"} highlighted below.
                        </p>
                      ) : null}
                      {sourceReferenceFocus ? (
                        <div className="mt-4 rounded-[1rem] border border-blue-200 bg-blue-50/70 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-xs uppercase tracking-[0.18em] text-blue-700">Current compare target</p>
                              <p className="mt-2 text-sm font-semibold text-slate-950">
                                {sourceReferenceFocus.kindLabel}: {sourceReferenceFocus.title}
                              </p>
                              <p className="mt-1 text-xs text-slate-600">
                                {sourceReferenceFocus.pageIds.size} pages · {sourceReferenceFocus.sectionIds.size} sections · {sourceReferenceFocus.groupIds.size} groups · {sourceReferenceFocus.fieldIds.size} fields
                              </p>
                            </div>
                            <StatusBadge tone={sourceReferenceFocusHasMatches ? "info" : "warning"}>
                              {sourceReferenceFocusHasMatches ? "Linked source found" : "No direct source IDs"}
                            </StatusBadge>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-slate-700">
                            {sourceReferenceFocusHasMatches
                              ? "Use `Matching only` to collapse this reference down to the imported pages, sections, groups, and fields tied to the current authored selection."
                              : "This authored selection no longer has direct imported IDs attached, so the full source compare workspace stays available instead."}
                          </p>
                        </div>
                      ) : null}
                    </div>
                    <div className="space-y-3">
                      {sourceReferenceVisiblePages.length ? (
                        sourceReferenceVisiblePages.map((page) => {
                          const pageMatchesCurrentSelection = sourcePageMatchesFocus(page, sourceReferenceFocus);
                          const pageSelection = resolveSelectionForSourceTarget("page", page);
                          const pageSelectionIsActive = authoringSelectionsEqual(pageSelection, selectedAuthoring);
                          const visibleSections = page.sections.filter((section) =>
                            sourceReferenceFilterMode === "all" || !sourceReferenceFocusHasMatches
                              ? true
                              : sourceSectionMatchesFocus(section, sourceReferenceFocus),
                          );
                          const matchingFieldCount = visibleSections.reduce(
                            (count, section) =>
                              count + orderedReviewSectionFields(section).filter((field) => sourceFieldMatchesFocus(field, sourceReferenceFocus)).length,
                            0,
                          );
                          const matchingGroupCount = visibleSections.reduce(
                            (count, section) => count + section.groups.filter((group) => sourceGroupMatchesFocus(group, sourceReferenceFocus)).length,
                            0,
                          );

                          return (
                            <div
                              key={page.id}
                              className={`rounded-[1.1rem] border p-4 ${
                                pageMatchesCurrentSelection || activeStepSourcePageIds.has(page.id)
                                  ? "border-blue-200 bg-blue-50/70 shadow-[0_16px_32px_rgba(37,99,235,0.08)]"
                                  : "border-soft bg-slate-50"
                              }`}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Page {page.orderIndex + 1}</p>
                                  <p className="mt-2 font-semibold text-slate-950">{page.label}</p>
                                  <p className="mt-1 text-sm text-slate-600">
                                    {countSourceFieldsOnPage(page)} extracted fields · {visibleSections.length} visible sections
                                  </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {pageSelection ? (
                                    <button
                                      type="button"
                                      onClick={() => focusAuthoringSelectionFromSource("page", page)}
                                      className={actionButtonClass(pageSelectionIsActive ? "primary" : "secondary")}
                                    >
                                      {pageSelectionIsActive ? "Focused in builder" : "Focus in builder"}
                                    </button>
                                  ) : null}
                                  {activeStepSourcePageIds.has(page.id) ? <StatusBadge tone="info">Current step source</StatusBadge> : null}
                                  {pageMatchesCurrentSelection ? <StatusBadge tone="info">Current selection match</StatusBadge> : null}
                                  {matchingFieldCount ? <span className="app-pill">{matchingFieldCount} matching fields</span> : null}
                                  {matchingGroupCount ? <span className="app-pill">{matchingGroupCount} matching groups</span> : null}
                                </div>
                              </div>
                              <div className="mt-3 space-y-2">
                                {visibleSections.map((section) => {
                                  const sectionMatchesCurrentSelection = sourceSectionMatchesFocus(section, sourceReferenceFocus);
                                  const matchingFields = orderedReviewSectionFields(section).filter((field) => sourceFieldMatchesFocus(field, sourceReferenceFocus));
                                  const matchingGroups = section.groups.filter((group) => sourceGroupMatchesFocus(group, sourceReferenceFocus));
                                  const sectionSelection = resolveSelectionForSourceTarget("section", page, section);
                                  const sectionSelectionIsActive = authoringSelectionsEqual(sectionSelection, selectedAuthoring);

                                  return (
                                    <div
                                      key={section.id}
                                      className={`rounded-[0.95rem] border p-3 ${
                                        sectionMatchesCurrentSelection ? "border-blue-200 bg-white shadow-sm" : "border-soft bg-white"
                                      }`}
                                    >
                                      <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                          <p className="font-semibold text-slate-950">{section.title}</p>
                                          <p className="mt-1 text-sm text-slate-600">
                                            {[...section.fields, ...section.groups.flatMap((group) => group.fields)].length} extracted fields
                                          </p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                          {sectionSelection ? (
                                            <button
                                              type="button"
                                              onClick={() => focusAuthoringSelectionFromSource("section", page, section)}
                                              className={subtleButtonClass(sectionSelectionIsActive)}
                                            >
                                              {sectionSelectionIsActive ? "Focused in builder" : "Focus in builder"}
                                            </button>
                                          ) : null}
                                          {sourceReferenceFocus?.sectionIds.has(section.id) ? <StatusBadge tone="info">Direct section match</StatusBadge> : null}
                                          {matchingFields.length ? <span className="app-pill">{matchingFields.length} matching fields</span> : null}
                                          {matchingGroups.length ? <span className="app-pill">{matchingGroups.length} matching groups</span> : null}
                                        </div>
                                      </div>
                                      {matchingGroups.length || matchingFields.length ? (
                                        <div className="mt-3 space-y-2">
                                          {matchingGroups.length ? (
                                            <div>
                                              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Matching groups</p>
                                              <div className="mt-2 flex flex-wrap gap-2">
                                                {matchingGroups.map((group, matchingGroupIndex) => {
                                                  const groupSelection = resolveSelectionForSourceTarget("group", page, section, group);
                                                  const groupSelectionIsActive = authoringSelectionsEqual(groupSelection, selectedAuthoring);
                                                  const sourceGroupKey = `${page.id}-${section.id}-${group.id}-${matchingGroupIndex}`;

                                                  return groupSelection ? (
                                                    <button
                                                      key={sourceGroupKey}
                                                      type="button"
                                                      onClick={() => focusAuthoringSelectionFromSource("group", page, section, group)}
                                                      className={subtleButtonClass(groupSelectionIsActive)}
                                                    >
                                                      {group.label}
                                                    </button>
                                                  ) : (
                                                    <span key={sourceGroupKey} className="app-pill">
                                                      {group.label}
                                                    </span>
                                                  );
                                                })}
                                              </div>
                                            </div>
                                          ) : null}
                                          {matchingFields.length ? (
                                            <div>
                                              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Matching fields</p>
                                              <div className="mt-2 flex flex-wrap gap-2">
                                                {matchingFields.slice(0, 8).map((field, matchingFieldIndex) => {
                                                  const fieldSelection = resolveSelectionForSourceTarget("field", page, section, undefined, field);
                                                  const fieldSelectionIsActive = authoringSelectionsEqual(fieldSelection, selectedAuthoring);
                                                  const sourceFieldKey = `${page.id}-${section.id}-${field.id}-${matchingFieldIndex}`;

                                                  return fieldSelection ? (
                                                    <button
                                                      key={sourceFieldKey}
                                                      type="button"
                                                      onClick={() => focusAuthoringSelectionFromSource("field", page, section, undefined, field)}
                                                      className={subtleButtonClass(fieldSelectionIsActive)}
                                                    >
                                                      {field.label}
                                                    </button>
                                                  ) : (
                                                    <span key={sourceFieldKey} className="app-pill">
                                                      {field.label}
                                                    </span>
                                                  );
                                                })}
                                                {matchingFields.length > 8 ? <span className="app-pill">+{matchingFields.length - 8} more</span> : null}
                                              </div>
                                            </div>
                                          ) : null}
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                })}
                                {!visibleSections.length ? (
                                  <div className="app-muted-card p-4 text-sm text-slate-500">
                                    No imported sections match the current selection on this page.
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="app-muted-card p-4 text-sm text-slate-500">
                          No imported pages matched the current authored selection. Switch back to `All source` to inspect the full imported reference.
                        </div>
                      )}
                    </div>
                  </div>
                </PanelCard>
                  </div>
                </div>
              ) : null}
            </section>
            </div>
          </StageShell>
        ) : null}

        {newProjectDialogOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/28 p-4">
            <div className="w-full max-w-[42rem] rounded-[1.35rem] border border-soft bg-white p-5 shadow-[0_30px_70px_rgba(19,32,51,0.18)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">New project</p>
                  <h4 className="mt-1 text-lg font-semibold text-slate-950">Choose how to begin</h4>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Start from a blank authoring document or bring in a PDF and review it before promotion.
                  </p>
                </div>
                <button type="button" onClick={() => setNewProjectDialogOpen(false)} className={iconButtonClass()}>
                  ×
                </button>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void handleCreateBlankProject()}
                  disabled={isImportingJson}
                  className="rounded-[1.35rem] border border-blue-200 bg-[linear-gradient(135deg,#eff6ff_0%,#ffffff_62%)] p-5 text-left shadow-sm transition hover:border-blue-300"
                >
                  <p className="text-xs uppercase tracking-[0.18em] text-blue-700">Blank form</p>
                  <h5 className="mt-2 text-lg font-semibold text-slate-950">Start from scratch</h5>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Create a fresh project and begin editing inside the main workspace immediately.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewProjectDialogOpen(false);
                    inputRef.current?.click();
                  }}
                  disabled={isUploading}
                  className="rounded-[1.35rem] border border-slate-200 bg-[linear-gradient(135deg,#fff7ed_0%,#ffffff_62%)] p-5 text-left shadow-sm transition hover:border-slate-300"
                >
                  <p className="text-xs uppercase tracking-[0.18em] text-amber-700">Import PDF</p>
                  <h5 className="mt-2 text-lg font-semibold text-slate-950">Create from source</h5>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Run the intake and review flow, then promote the imported structure into a project.
                  </p>
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {openProjectDialogOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/28 p-4">
            <div className="w-full max-w-[58rem] rounded-[1.35rem] border border-soft bg-white p-5 shadow-[0_30px_70px_rgba(19,32,51,0.18)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Open</p>
                  <h4 className="mt-1 text-lg font-semibold text-slate-950">Return to existing work</h4>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Switch projects, reopen authoring JSON, or jump back to the main home screen without leaving the builder shell.
                  </p>
                </div>
                <button type="button" onClick={() => setOpenProjectDialogOpen(false)} className={iconButtonClass()}>
                  ×
                </button>
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.9fr)]">
                <div className="rounded-[1.2rem] border border-soft bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Saved projects</p>
                      <h5 className="mt-1 text-base font-semibold text-slate-950">Recent workspaces</h5>
                    </div>
                    <span className="app-pill">{projects.length} total</span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {projects.length ? (
                      projects.slice(0, 8).map((project) => {
                        const isActiveProject = activeProjectId === project.id;
                        return (
                          <button
                            key={project.id}
                            type="button"
                            onClick={() => handleOpenProject(project.id)}
                            className={`block w-full rounded-[1rem] border px-4 py-3 text-left transition ${
                              isActiveProject
                                ? "border-blue-300 bg-blue-50/70 shadow-[0_12px_28px_rgba(59,130,246,0.12)]"
                                : "border-soft bg-white hover:border-slate-300"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-950">{project.name}</p>
                                <p className="mt-1 text-sm text-slate-600">
                                  {project.revisionCount} revisions · updated {new Date(project.updatedAt).toLocaleString()}
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-2">
                                <StatusBadge tone={badgeToneFromProjectStatus(project.status)}>{formatLabel(project.status)}</StatusBadge>
                                {isActiveProject ? <span className="text-xs font-medium uppercase tracking-[0.16em] text-blue-700">Current</span> : null}
                              </div>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="app-muted-card p-4 text-sm text-slate-500">
                        No saved projects yet. Create a blank form or import a PDF to start building.
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-[1.2rem] border border-soft bg-[linear-gradient(135deg,#f8fafc_0%,#ffffff_100%)] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Open from file</p>
                    <h5 className="mt-1 text-base font-semibold text-slate-950">Authoring JSON</h5>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Load a saved authoring document directly into a durable project workspace.
                    </p>
                    <button
                      type="button"
                      onClick={() => jsonInputRef.current?.click()}
                      disabled={isImportingJson}
                      className={`mt-4 ${actionButtonClass("primary")}`}
                    >
                      {isImportingJson ? "Opening..." : "Open JSON"}
                    </button>
                  </div>

                  <div className="rounded-[1.2rem] border border-soft bg-[linear-gradient(135deg,#fff7ed_0%,#ffffff_100%)] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Resume intake</p>
                    <h5 className="mt-1 text-base font-semibold text-slate-950">Recent imports</h5>
                    <div className="mt-3 space-y-3">
                      {conversions.length ? (
                        conversions.slice(0, 4).map((conversion) => (
                          <button
                            key={conversion.id}
                            type="button"
                            onClick={() => handleResumeImport(conversion)}
                            className="block w-full rounded-[1rem] border border-soft bg-white px-4 py-3 text-left transition hover:border-slate-300"
                          >
                            <p className="font-semibold text-slate-950">{conversion.filename}</p>
                            <p className="mt-1 text-sm text-slate-600">
                              {formatLabel(conversion.reviewStatus)} · updated {new Date(conversion.updatedAt).toLocaleString()}
                            </p>
                          </button>
                        ))
                      ) : (
                        <div className="app-muted-card p-4 text-sm text-slate-500">
                          No import reviews are waiting right now.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[1.2rem] border border-soft bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Home</p>
                    <h5 className="mt-1 text-base font-semibold text-slate-950">Return to Project Home</h5>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Go back to the start screen for the full creation and open overview.
                    </p>
                    <button
                      type="button"
                      onClick={handleReturnHomeFromWorkspace}
                      className={`mt-4 ${actionButtonClass()}`}
                    >
                      Go to Home
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {revisionHistoryOpen && activeProjectDetail ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/28 p-4">
            <div className="w-full max-w-[68rem] rounded-[1.35rem] border border-soft bg-white p-5 shadow-[0_30px_70px_rgba(19,32,51,0.18)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Revision history</p>
                  <h4 className="mt-1 text-lg font-semibold text-slate-950">Inspect and reopen saved workspace snapshots</h4>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Revisions are the durable checkpoints for this project. Open an older snapshot into the current workspace, then return to the latest head or save it forward as the new current document.
                  </p>
                </div>
                <button type="button" onClick={() => setRevisionHistoryOpen(false)} className={iconButtonClass()}>
                  ×
                </button>
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.9fr)]">
                <div className="rounded-[1.2rem] border border-soft bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Saved revisions</p>
                      <h5 className="mt-1 text-base font-semibold text-slate-950">Project timeline</h5>
                    </div>
                    <span className="app-pill">{projectRevisions.length} total</span>
                  </div>
                  <div className="mt-4 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                    {projectRevisions.length ? (
                      projectRevisions.map((revision) => {
                        const summary = summarizeAuthoringDocument(revision.document);
                        const isCurrentHead = activeProjectDetail.project.currentRevisionId === revision.id;
                        const isOpenedRevision = openedRevisionView?.id === revision.id;
                        return (
                          <div
                            key={revision.id}
                            className={`rounded-[1rem] border px-4 py-3 ${
                              isOpenedRevision
                                ? "border-amber-300 bg-amber-50/70 shadow-[0_12px_28px_rgba(245,158,11,0.12)]"
                                : isCurrentHead
                                  ? "border-blue-300 bg-blue-50/70 shadow-[0_12px_28px_rgba(59,130,246,0.12)]"
                                  : "border-soft bg-white"
                            }`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-950">{revision.note}</p>
                                <p className="mt-1 text-sm text-slate-600">{new Date(revision.createdAt).toLocaleString()}</p>
                                <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">{revision.document.title}</p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {isCurrentHead ? <StatusBadge tone="info">Current head</StatusBadge> : null}
                                {isOpenedRevision ? <StatusBadge tone="warning">Opened in workspace</StatusBadge> : null}
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                              <span className="app-pill">{summary.stepCount} steps</span>
                              <span className="app-pill">{summary.sectionCount} sections</span>
                              <span className="app-pill">{summary.fieldCount} fields</span>
                              <span className="app-pill">{summary.interactiveCount} interactive</span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {isCurrentHead ? (
                                <button
                                  type="button"
                                  onClick={() => void handleReturnToLatestProjectRevision()}
                                  disabled={!openedRevisionView || isLoadingRevisionWorkspace}
                                  className={actionButtonClass(isOpenedRevision ? "primary" : "secondary")}
                                >
                                  {isLoadingRevisionWorkspace && isOpenedRevision ? "Returning..." : isOpenedRevision ? "Return to this head" : "Current head"}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleOpenRevisionSnapshot(revision.id)}
                                  disabled={isLoadingRevisionWorkspace}
                                  className={actionButtonClass(isOpenedRevision ? "primary" : "secondary")}
                                >
                                  {isOpenedRevision ? "Opened in workspace" : "Open snapshot"}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="app-muted-card p-4 text-sm text-slate-500">
                        No saved revisions yet. Save the project to create the first durable snapshot.
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-[1.2rem] border border-soft bg-[linear-gradient(135deg,#f8fafc_0%,#ffffff_100%)] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Current workspace</p>
                    <h5 className="mt-1 text-base font-semibold text-slate-950">{activeProjectDetail.project.name}</h5>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {openedRevisionView
                        ? `You are viewing a saved snapshot from ${new Date(openedRevisionView.createdAt).toLocaleString()}.`
                        : "You are on the latest saved project head."}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="app-pill">{activeDocumentSummary?.stepCount ?? 0} steps</span>
                      <span className="app-pill">{activeDocumentSummary?.sectionCount ?? 0} sections</span>
                      <span className="app-pill">{activeDocumentSummary?.fieldCount ?? 0} fields</span>
                    </div>
                  </div>

                  <div className="rounded-[1.2rem] border border-soft bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">How restore works</p>
                    <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                      <p>Opening a snapshot swaps the workspace to that saved revision without leaving the builder.</p>
                      <p>Return to the latest head any time if you only needed inspection.</p>
                      <p>Save after opening a snapshot to make that older revision the current project document again.</p>
                    </div>
                  </div>

                  <div className="rounded-[1.2rem] border border-soft bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Current revision file</p>
                    <p className="mt-2 break-all font-mono text-sm text-slate-800">
                      {projectArtifactPaths?.revision ?? "Save the project to create the first revision file."}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {pendingWorkspaceTransition && pendingWorkspaceTransitionCopy ? (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/38 p-4">
            <div className="w-full max-w-[32rem] rounded-[1.35rem] border border-soft bg-white p-5 shadow-[0_30px_70px_rgba(19,32,51,0.24)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-amber-700">Unsaved workspace changes</p>
                  <h4 className="mt-1 text-lg font-semibold text-slate-950">{pendingWorkspaceTransitionCopy.title}</h4>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{pendingWorkspaceTransitionCopy.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingWorkspaceTransition(null)}
                  disabled={isResolvingWorkspaceTransition}
                  className={iconButtonClass()}
                >
                  ×
                </button>
              </div>
              <div className="mt-5 rounded-[1.1rem] border border-amber-200 bg-amber-50/70 p-4 text-sm leading-6 text-amber-900">
                Save keeps the current workspace edits before the next move. Discard or reload continues immediately from the last saved state on disk.
              </div>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPendingWorkspaceTransition(null)}
                  disabled={isResolvingWorkspaceTransition}
                  className={actionButtonClass()}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmWorkspaceTransitionDiscard()}
                  disabled={isResolvingWorkspaceTransition}
                  className={actionButtonClass("danger")}
                >
                  {isResolvingWorkspaceTransition ? "Working..." : pendingWorkspaceTransitionCopy.discardLabel}
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmWorkspaceTransitionSave()}
                  disabled={isResolvingWorkspaceTransition || isSavingProject}
                  className={actionButtonClass("primary")}
                >
                  {isResolvingWorkspaceTransition || isSavingProject ? "Saving..." : pendingWorkspaceTransitionCopy.saveLabel}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {projectDetailsOpen && activeProjectDetail ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/28 p-4">
            <div className="w-full max-w-[68rem] rounded-[1.35rem] border border-soft bg-white p-5 shadow-[0_30px_70px_rgba(19,32,51,0.18)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Project details</p>
                  <h4 className="mt-1 text-lg font-semibold text-slate-950">Save, publish, and inspect stored artifacts</h4>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Publishing is a project action now. Use this panel to save, toggle release state, and verify what is stored on disk.
                  </p>
                </div>
                <button type="button" onClick={() => setProjectDetailsOpen(false)} className={iconButtonClass()}>
                  ×
                </button>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setRevisionHistoryOpen(true)}
                  disabled={!activeProjectDetail}
                  className={actionButtonClass()}
                >
                  Revision history
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveProject()}
                  disabled={!activeProjectDetail || isSavingProject}
                  className={actionButtonClass()}
                >
                  {isSavingProject ? "Saving..." : projectDirty ? "Save JSON" : "JSON saved"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleTogglePublishProject()}
                  disabled={!activeProjectDetail || isPublishingProject}
                  className={actionButtonClass("primary")}
                >
                  {isPublishingProject
                    ? "Updating status..."
                    : activeProjectDetail.project.status === "published"
                      ? "Mark draft"
                      : "Publish"}
                </button>
              </div>
              <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                <PanelCard title="Release state" eyebrow="Current output">
                  <div className="space-y-4">
                    <div className="rounded-[1.15rem] border border-soft bg-white p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Project</p>
                          <h3 className="mt-2 text-2xl font-semibold text-slate-950">{activeProjectDetail.project.name}</h3>
                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            Runtime target: {activeProjectDetail.project.targetRuntime} · baseline {activeProjectDetail.project.visualBaseline}
                          </p>
                        </div>
                        <StatusBadge tone={badgeToneFromProjectStatus(activeProjectDetail.project.status)}>
                          {formatLabel(activeProjectDetail.project.status)}
                        </StatusBadge>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="app-muted-card p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Saved document</p>
                        <p className="mt-2 text-sm font-semibold text-slate-950">
                          {projectDirty ? "Unsaved local changes in workspace" : "Current document persisted to disk"}
                        </p>
                        <p className="mt-2 break-all font-mono text-sm text-slate-600">
                          {projectArtifactPaths?.document ?? "No document file yet"}
                        </p>
                      </div>
                      <div className="app-muted-card p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Latest revision</p>
                        <p className="mt-2 text-sm font-semibold text-slate-950">
                          {projectRevisions[0]?.note ?? "No revisions recorded yet"}
                        </p>
                        <p className="mt-2 text-sm text-slate-600">
                          {projectRevisions[0]?.createdAt
                            ? new Date(projectRevisions[0].createdAt).toLocaleString()
                            : "Save the project to create a revision snapshot."}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-[1.15rem] border border-soft bg-white p-5">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">What this panel does</p>
                      <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                        <p>Save writes the structured authoring JSON and a revision snapshot to the project folder.</p>
                        <p>Published state is a reversible project flag while the runtime/export contract is still evolving.</p>
                        <p>This stays separate from the main editing canvas so the workspace remains creation-first.</p>
                      </div>
                    </div>
                  </div>
                </PanelCard>

                <PanelCard title="Stored artifacts" eyebrow="Local files">
                  {projectArtifactPaths ? (
                    <div className="space-y-4">
                      <div className="app-muted-card p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Project metadata</p>
                        <p className="mt-2 break-all font-mono text-sm text-slate-800">{projectArtifactPaths.project}</p>
                      </div>
                      <div className="app-muted-card p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Authoring document JSON</p>
                        <p className="mt-2 break-all font-mono text-sm text-slate-800">{projectArtifactPaths.document}</p>
                      </div>
                      <div className="app-muted-card p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Source context JSON</p>
                        <p className="mt-2 break-all font-mono text-sm text-slate-800">{projectArtifactPaths.sourceContext}</p>
                      </div>
                      <div className="app-muted-card p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Current revision snapshot</p>
                        <p className="mt-2 break-all font-mono text-sm text-slate-800">
                          {projectArtifactPaths.revision ?? "Save the project to create the first revision file."}
                        </p>
                      </div>
                      <div className="rounded-[1.15rem] border border-soft bg-white p-5">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Source lineage</p>
                        <p className="mt-2 font-semibold text-slate-950">{activeProjectDetail.sourceContext.filename}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          The imported draft remains preserved as provenance. Toggling published state does not alter the source lineage.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="app-muted-card p-6 text-sm text-slate-500">No project artifacts are available.</div>
                  )}
                </PanelCard>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
