import type { ChangeEvent, DragEvent, ReactNode } from "react";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";

import { createRuntimeEngine } from "@form-builder/runtime";
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
type InspectorTab = "properties" | "logic" | "events" | "map";
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

interface LogicMapConditionalEntry {
  id: string;
  title: string;
  detail: string;
  sourceSelection: AuthoringSelection;
  ruleIndex: number;
}

interface LogicMapListenerEntry {
  id: string;
  scopeLabel: string;
  eventName: string;
  actionsSummary: string;
  selection: AuthoringSelection | null;
}

interface LogicMapStepEntry {
  id: string;
  title: string;
  selection: AuthoringSelection;
  sectionCount: number;
  fieldCount: number;
  conditionalRules: LogicMapConditionalEntry[];
  runtimeListeners: LogicMapListenerEntry[];
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

function formatLabel(value: string | undefined | null): string {
  if (!value) {
    return "Unknown";
  }
  return value.replaceAll("_", " ");
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRuntimeActionPayload(action: RuntimeActionDefinition): Record<string, unknown> {
  return isRecord(action.config.payload) ? action.config.payload : {};
}

function stringifyRuntimePayloadValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  return JSON.stringify(value);
}

function coerceRuntimePayloadValue(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "";
  }
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  if (trimmed === "null") {
    return null;
  }
  if (!Number.isNaN(Number(trimmed)) && trimmed !== "") {
    return Number(trimmed);
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function runtimePayloadEntries(payload: Record<string, unknown>): Array<{ key: string; value: string }> {
  return Object.entries(payload).map(([key, value]) => ({
    key,
    value: stringifyRuntimePayloadValue(value),
  }));
}

function runtimePayloadFromEntries(entries: Array<{ key: string; value: string }>): Record<string, unknown> {
  return entries.reduce<Record<string, unknown>>((accumulator, entry) => {
    const key = entry.key.trim();
    if (!key) {
      return accumulator;
    }
    accumulator[key] = coerceRuntimePayloadValue(entry.value);
    return accumulator;
  }, {});
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

function WidthIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2.75 4.5V3h2M13.25 4.5V3h-2M2.75 11.5V13h2M13.25 11.5V13h-2" />
      <rect x="4.5" y="4.5" width="7" height="7" rx="1.25" />
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
  const [stage, setStage] = useState<AppStage>("home");
  const [reviewPreviewMode, setReviewPreviewMode] = useState<ReviewPreviewMode>("overlay");
  const [reviewFlowMode, setReviewFlowMode] = useState<ReviewFlowMode>("new_project");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("properties");
  const [sourceDrawerOpen, setSourceDrawerOpen] = useState(false);
  const [inspectorWide, setInspectorWide] = useState(true);
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
  const [runtimeToolsOpen, setRuntimeToolsOpen] = useState(false);
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);
  const [openProjectDialogOpen, setOpenProjectDialogOpen] = useState(false);
  const [projectDetailsOpen, setProjectDetailsOpen] = useState(false);
  const [revisionHistoryOpen, setRevisionHistoryOpen] = useState(false);
  const [sourceReferenceFilterMode, setSourceReferenceFilterMode] = useState<"all" | "matches">("all");
  const [workspaceLandingMode, setWorkspaceLandingMode] = useState<WorkspaceLandingMode | null>(null);
  const [openedRevisionView, setOpenedRevisionView] = useState<OpenedRevisionView | null>(null);
  const [pendingWorkspaceTransition, setPendingWorkspaceTransition] = useState<WorkspaceTransitionRequest | null>(null);
  const [runtimePayloadEditors, setRuntimePayloadEditors] = useState<Record<string, RuntimePayloadEditorState>>({});
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
      ? "Hide source reference"
      : "Open source reference"
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

    const formListeners =
      activeDocument.runtime?.formListeners.map<LogicMapListenerEntry>((listener) => ({
        id: listener.id,
        scopeLabel: "Form runtime",
        eventName: listener.eventName,
        actionsSummary: summarizeListenerActions(listener.actions),
        selection: null,
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
            selection: { kind: "step", stepId: step.id } as AuthoringSelection,
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
              selection: { kind: "section", stepId: step.id, sectionId: section.id } as AuthoringSelection,
            })),
          );
        }

        section.fields.forEach((field) => {
          field.conditionals.forEach((rule, ruleIndex) => {
            conditionalRules.push({
              id: rule.ruleId,
              title: `${field.label} reacts to ${fieldLabelById.get(rule.whenFieldId) ?? "another field"}`,
              detail: `When ${fieldLabelById.get(rule.whenFieldId) ?? "that field"} ${describeRuleOperator(rule)}, ${describeRuleEffect(rule)} ${field.label}.`,
              sourceSelection: { kind: "field", stepId: step.id, sectionId: section.id, fieldId: field.id },
              ruleIndex,
            });
          });
          if (field.runtime?.listeners.length) {
            runtimeListeners.push(
              ...field.runtime.listeners.map((listener) => ({
                id: listener.id,
                scopeLabel: `Field · ${field.label}`,
                eventName: listener.eventName,
                actionsSummary: summarizeListenerActions(listener.actions),
                selection: { kind: "field", stepId: step.id, sectionId: section.id, fieldId: field.id } as AuthoringSelection,
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
                selection: { kind: "group", stepId: step.id, sectionId: section.id, groupId: group.id } as AuthoringSelection,
              })),
            );
          }
          group.fields.forEach((field) => {
            field.conditionals.forEach((rule, ruleIndex) => {
              conditionalRules.push({
                id: rule.ruleId,
                title: `${field.label} reacts to ${fieldLabelById.get(rule.whenFieldId) ?? "another field"}`,
                detail: `When ${fieldLabelById.get(rule.whenFieldId) ?? "that field"} ${describeRuleOperator(rule)}, ${describeRuleEffect(rule)} ${field.label}.`,
                sourceSelection: { kind: "field", stepId: step.id, sectionId: section.id, groupId: group.id, fieldId: field.id },
                ruleIndex,
              });
            });
            if (field.runtime?.listeners.length) {
              runtimeListeners.push(
                ...field.runtime.listeners.map((listener) => ({
                  id: listener.id,
                  scopeLabel: `Field · ${field.label}`,
                  eventName: listener.eventName,
                  actionsSummary: summarizeListenerActions(listener.actions),
                  selection: { kind: "field", stepId: step.id, sectionId: section.id, groupId: group.id, fieldId: field.id } as AuthoringSelection,
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

  useEffect(() => {
    if (selectedAuthoring?.kind !== "field") {
      setEditingRuleIndex(null);
    }
  }, [selectedAuthoring]);

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
            if (current?.stepId === stepId && current.kind === "step") {
              return current;
            }
            return { kind: "step", stepId };
          });
        }
      }

      if (event.type === "form.submit") {
        setFlashMessage("Preview runtime emitted a submit event. Return a host success or error response from Runtime tools to complete the loop.");
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

  function openSourceReference(mode: "all" | "matches" = "all") {
    setSourceReferenceFilterMode(mode);
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

  function removeRuntimeListener(listenerId: string) {
    updateRuntimeScope((runtime, scopeKind) => {
      const listeners = scopeKind === "form" ? (runtime as RuntimeDocumentBehavior).formListeners : (runtime as RuntimeNodeBehavior).listeners;
      const index = listeners.findIndex((candidate) => candidate.id === listenerId);
      if (index >= 0) {
        listeners.splice(index, 1);
      }
    });
  }

  function addRuntimeActionToListener(listenerId: string) {
    updateRuntimeListener(listenerId, (listener) => {
      listener.actions.push(createRuntimeAction("emit_event", { eventName: "custom.event", payload: {} }));
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
          id: "button-emit",
          label: "Emit custom event",
          description: "Fire a named runtime event for the host shell or other listeners.",
          apply: () =>
            createRuntimeListener(
              "component.click",
              [createRuntimeAction("emit_event", { eventName: "custom.event", payload: {} })],
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

  function addConditionalRule() {
    const nextIndex = activeBuilderField?.conditionals.length ?? 0;
    updateSelectedField((field) => {
      field.conditionals.push({
        ruleId: crypto.randomUUID(),
        whenFieldId: builderFieldOptions[0]?.id ?? "",
        operator: "equals",
        expectedValue: "",
        effect: "show",
      });
    });
    setEditingRuleIndex(nextIndex);
  }

  function removeConditionalRule(index: number) {
    updateSelectedField((field) => {
      field.conditionals.splice(index, 1);
    });
    setEditingRuleIndex((current) => (current === index ? null : current !== null && current > index ? current - 1 : current));
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
          ? "Project created from the reviewed PDF. Continue authoring here, and open the imported source reference only when you need to compare against the original paper structure."
          : isPdfBackedProject && workspaceLandingMode === "reopened_import"
            ? "This PDF-backed project is already durable. Keep editing in the workspace and pull the imported source reference back in only when it helps."
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
                  onClick={() => setSourceDrawerOpen((current) => !current)}
                  disabled={!sourceContextDraft}
                  className={actionButtonClass()}
                >
                  {workspaceSourceButtonLabel}
                </button>
                <button
                  type="button"
                  onClick={() => setRuntimeToolsOpen(true)}
                  disabled={!activeDocument}
                  className={actionButtonClass()}
                >
                  Runtime tools
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
            <section
              className={`grid gap-5 ${
                sourceDrawerOpen
                  ? inspectorWide
                    ? "xl:grid-cols-[12.5rem_minmax(0,1fr)_24rem_15rem]"
                    : "xl:grid-cols-[12.5rem_minmax(0,1fr)_18rem_15rem]"
                  : inspectorWide
                    ? "xl:grid-cols-[12.5rem_minmax(0,1fr)_24rem]"
                    : "xl:grid-cols-[12.5rem_minmax(0,1fr)_18rem]"
              }`}
            >
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
                  <div className="space-y-4">
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
                              onClick={() => {
                                setSourceDrawerOpen(true);
                                setWorkspaceLandingMode(null);
                              }}
                              className={actionButtonClass("primary")}
                            >
                              Open source reference
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
                              onClick={() => openSourceReference(sourceReferenceFocusHasMatches ? "matches" : "all")}
                              disabled={!sourceContextDraft}
                              className={actionButtonClass()}
                            >
                              {sourceReferenceFocusHasMatches ? "Compare source" : "Open source"}
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
                                    </div>
                                    <div className="flex gap-2">
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
                                              </div>
                                              <div className="flex gap-2">
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
                eyebrow="Properties and logic"
                aside={
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      title={inspectorWide ? "Use standard inspector width" : "Use wider inspector width"}
                      aria-label={inspectorWide ? "Use standard inspector width" : "Use wider inspector width"}
                      onClick={() => setInspectorWide((current) => !current)}
                      className={iconButtonClass(inspectorWide ? "primary" : "secondary")}
                    >
                      <WidthIcon />
                    </button>
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
                      title="Logic"
                      aria-label="Logic"
                      onClick={() => setInspectorTab("logic")}
                      className={iconButtonClass(inspectorTab === "logic" ? "primary" : "secondary")}
                    >
                      <LogicIcon />
                    </button>
                    <button
                      type="button"
                      title="Events"
                      aria-label="Events"
                      onClick={() => setInspectorTab("events")}
                      className={iconButtonClass(inspectorTab === "events" ? "primary" : "secondary")}
                    >
                      <EventsIcon />
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
                              onClick={() => openSourceReference(sourceReferenceFocusHasMatches ? "matches" : "all")}
                              className={actionButtonClass(sourceReferenceFocusHasMatches ? "primary" : "secondary")}
                            >
                              {sourceReferenceFocusHasMatches ? "Compare source" : "Open source"}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedAuthoring(null);
                              setInspectorTab("events");
                            }}
                            className={actionButtonClass(selectedAuthoring === null ? "primary" : "secondary")}
                          >
                            Form events
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
                                Buttons are runtime components. Configure their behavior from the Events tab so the runtime engine and builder preview stay in sync.
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
                                  <button type="button" onClick={() => setInspectorTab("events")} className={actionButtonClass("primary")}>
                                    Open Events
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
                    ) : inspectorTab === "logic" ? (
                      <div className="space-y-4">
                        {selectedAuthoring?.kind === "field" && activeBuilderField ? (
                          <div className="rounded-[1.15rem] border border-soft bg-white p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Logic rules</p>
                                <p className="mt-2 font-semibold text-slate-950">Visibility and requirement behavior</p>
                              </div>
                              <button type="button" onClick={addConditionalRule} className={actionButtonClass()}>
                                Add rule
                              </button>
                            </div>
                            <div className="mt-4 space-y-3">
                              {activeBuilderField.conditionals.map((rule, index) => (
                                <div key={rule.ruleId} className="rounded-[1rem] border border-soft bg-slate-50 p-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-slate-950">
                                        {builderFieldOptions.find((option) => option.id === rule.whenFieldId)?.label ?? "Choose field"} {rule.operator.replaceAll("_", " ")}
                                      </p>
                                      <p className="mt-1 text-sm text-slate-600">
                                        {rule.operator === "exists"
                                          ? `${rule.effect} when any value is present`
                                          : `${rule.effect} when value is "${rule.expectedValue ?? ""}"`}
                                      </p>
                                    </div>
                                    <div className="flex shrink-0 gap-2">
                                      <button type="button" onClick={() => setEditingRuleIndex(index)} className={actionButtonClass()}>
                                        Edit
                                      </button>
                                      <button type="button" onClick={() => removeConditionalRule(index)} className={actionButtonClass("danger")}>
                                        Remove
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                              {!activeBuilderField.conditionals.length ? (
                                <div className="app-muted-card p-4 text-sm text-slate-500">
                                  No behavior rules yet. Add visibility or requirement logic here.
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          <div className="app-muted-card p-4 text-sm text-slate-500">
                            Select a field to edit its branching and visibility rules.
                          </div>
                        )}
                      </div>
                    ) : inspectorTab === "map" ? (
                      <div className="space-y-4">
                        {logicMapData ? (
                          <>
                            <div className="rounded-[1.15rem] border border-soft bg-white p-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Flow map</p>
                              <h4 className="mt-2 text-lg font-semibold text-slate-950">Document logic and runtime graph</h4>
                              <p className="mt-2 text-sm leading-6 text-slate-600">
                                Use this as the high-level map for branching rules and listener chains, then jump into the focused editor only when you need to change a specific rule or event.
                              </p>
                              <div className="mt-4 flex flex-wrap gap-2">
                                <span className="app-pill">{logicMapData.steps.length} steps</span>
                                <span className="app-pill">{logicMapData.totalConditionals} logic rules</span>
                                <span className="app-pill">{logicMapData.totalListeners} runtime listeners</span>
                              </div>
                            </div>

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
                                    setSelectedAuthoring(null);
                                    setInspectorTab("events");
                                  }}
                                  className={actionButtonClass("primary")}
                                >
                                  Open form events
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
                                            setSelectedAuthoring(null);
                                            setInspectorTab("events");
                                          }}
                                          className={actionButtonClass()}
                                        >
                                          Edit
                                        </button>
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <div className="app-muted-card p-4 text-sm text-slate-500">
                                    No form-level listeners yet. Use the Events editor when the document needs load, submit, or host-level behavior.
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
                                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Path rules</p>
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
                                                    setSelectedAuthoring(rule.sourceSelection);
                                                    setInspectorTab("logic");
                                                    setEditingRuleIndex(rule.ruleIndex);
                                                  }}
                                                  className={actionButtonClass()}
                                                >
                                                  Edit rule
                                                </button>
                                              </div>
                                            </div>
                                          ))
                                        ) : (
                                          <div className="app-muted-card p-4 text-sm text-slate-500">
                                            No field logic rules in this step yet.
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    <div className="rounded-[1rem] border border-soft bg-slate-50 p-4">
                                      <div className="flex items-center justify-between gap-3">
                                        <div>
                                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Runtime graph</p>
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
                                                    setSelectedAuthoring(listener.selection);
                                                    setInspectorTab("events");
                                                  }}
                                                  className={actionButtonClass()}
                                                >
                                                  Edit events
                                                </button>
                                              </div>
                                            </div>
                                          ))
                                        ) : (
                                          <div className="app-muted-card p-4 text-sm text-slate-500">
                                            No runtime listeners in this step yet.
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : (
                          <div className="app-muted-card p-4 text-sm text-slate-500">
                            No logic map is available until a document is loaded.
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {activeRuntimeScope ? (
                          <>
                            <div className="rounded-[1.15rem] border border-soft bg-white p-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Events scope</p>
                              <h4 className="mt-2 text-lg font-semibold text-slate-950">{activeRuntimeScope.label}</h4>
                              <p className="mt-2 text-sm leading-6 text-slate-600">{activeRuntimeScope.description}</p>
                            </div>

                            <div className="rounded-[1.15rem] border border-soft bg-white p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Starter presets</p>
                                  <p className="mt-2 text-sm text-slate-700">
                                    Start with a canned behavior, then refine it below if you need more control.
                                  </p>
                                </div>
                              </div>
                              <div className="mt-4 grid gap-3">
                                {runtimePresets.length ? (
                                  runtimePresets.map((preset) => (
                                    <button
                                      key={preset.id}
                                      type="button"
                                      onClick={() => addRuntimeListener(preset.apply(activeRuntimeScope, activeBuilderField))}
                                      className="rounded-[1rem] border border-soft bg-slate-50 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-white"
                                    >
                                      <p className="font-semibold text-slate-950">{preset.label}</p>
                                      <p className="mt-1 text-sm leading-6 text-slate-600">{preset.description}</p>
                                    </button>
                                  ))
                                ) : (
                                  <div className="app-muted-card p-4 text-sm text-slate-500">
                                    Select a field, button, or switch to form events to unlock guided runtime presets.
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="rounded-[1.15rem] border border-soft bg-white p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Listeners</p>
                                  <p className="mt-2 text-sm text-slate-700">Use these for the detailed event, guard, and action chain setup.</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    addRuntimeListener(
                                      createRuntimeListener(
                                        activeRuntimeScope.scopeKind === "component"
                                          ? "component.click"
                                          : activeRuntimeScope.scopeKind === "field"
                                            ? "field.change"
                                            : activeRuntimeScope.scopeKind === "form"
                                              ? "form.load"
                                              : "component.click",
                                        [createRuntimeAction("emit_event", { eventName: "custom.event", payload: {} })],
                                        selectedAuthoring?.kind === "field" ? selectedAuthoring.fieldId : null,
                                      ),
                                    )
                                  }
                                  className={actionButtonClass()}
                                >
                                  Add listener
                                </button>
                              </div>

                              <div className="mt-4 space-y-4">
                                {activeRuntimeScope.listeners.length ? (
                                  activeRuntimeScope.listeners.map((listener, listenerIndex) => (
                                    <div key={listener.id} className="rounded-[1rem] border border-soft bg-slate-50 p-4">
                                      <div className="flex items-start justify-between gap-3">
                                        <div>
                                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Listener {listenerIndex + 1}</p>
                                          <p className="mt-2 font-semibold text-slate-950">
                                            When {formatLabel(listener.eventName)}
                                          </p>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => removeRuntimeListener(listener.id)}
                                          className={actionButtonClass("danger")}
                                        >
                                          Remove
                                        </button>
                                      </div>

                                      <div className="mt-4 grid gap-3">
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

                                      <div className="mt-4 space-y-3">
                                        {listener.actions.map((action, actionIndex) => (
                                          <div key={action.id} className="rounded-[0.95rem] border border-soft bg-white p-4">
                                            <div className="flex items-start justify-between gap-3">
                                              <div>
                                                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Action {actionIndex + 1}</p>
                                                <p className="mt-2 text-sm text-slate-600">{describeRuntimeAction(action)}</p>
                                              </div>
                                              <button
                                                type="button"
                                                onClick={() => removeRuntimeAction(listener.id, action.id)}
                                                className={actionButtonClass("danger")}
                                              >
                                                Remove
                                              </button>
                                            </div>

                                            <div className="mt-4 grid gap-3">
                                              <div>
                                                <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Do this</label>
                                                <select
                                                  value={action.kind}
                                                  onChange={(event) =>
                                                    {
                                                      updateRuntimeAction(listener.id, action.id, (current) => {
                                                        current.kind = event.target.value as RuntimeActionKind;
                                                        current.config =
                                                          event.target.value === "emit_event"
                                                            ? { eventName: "custom.event", payload: {} }
                                                            : event.target.value === "host_action"
                                                              ? { handlerKey: "host.action", payload: {} }
                                                              : event.target.value === "go_to_step"
                                                                ? { stepId: builderStepOptions[0]?.id ?? "" }
                                                                : event.target.value === "set_field_value"
                                                                  ? { fieldId: builderFieldOptions[0]?.id ?? "", value: "" }
                                                                  : event.target.value === "show_node" ||
                                                                      event.target.value === "hide_node" ||
                                                                      event.target.value === "enable_node" ||
                                                                      event.target.value === "disable_node" ||
                                                                      event.target.value === "mark_required" ||
                                                                      event.target.value === "mark_optional"
                                                                    ? { nodeId: builderNodeOptions[0]?.id ?? "" }
                                                                    : {};
                                                      });
                                                      setRuntimePayloadEditors((current) => {
                                                        const next = { ...current };
                                                        delete next[action.id];
                                                        return next;
                                                      });
                                                    }
                                                  }
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
                                                    <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Event name</label>
                                                    <input
                                                      value={String(action.config.eventName ?? "")}
                                                      onChange={(event) =>
                                                        updateRuntimeAction(listener.id, action.id, (current) => {
                                                          current.config.eventName = event.target.value;
                                                        })
                                                      }
                                                      className="mt-2 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                                                    />
                                                  </div>
                                                  <div className="rounded-[0.95rem] border border-soft bg-slate-50 p-4">
                                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                                      <div>
                                                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Payload</p>
                                                        <p className="mt-2 text-sm text-slate-700">
                                                          Start with simple key/value pairs. Switch to raw JSON only when the event needs a more complex payload.
                                                        </p>
                                                      </div>
                                                      <div className="flex gap-2">
                                                        <button
                                                          type="button"
                                                          onClick={() => setRuntimePayloadEditorMode(action, "key_value")}
                                                          className={actionButtonClass(getRuntimePayloadEditorState(action).mode === "key_value" ? "primary" : "secondary")}
                                                        >
                                                          Key/value
                                                        </button>
                                                        <button
                                                          type="button"
                                                          onClick={() => setRuntimePayloadEditorMode(action, "json")}
                                                          className={actionButtonClass(getRuntimePayloadEditorState(action).mode === "json" ? "primary" : "secondary")}
                                                        >
                                                          JSON
                                                        </button>
                                                      </div>
                                                    </div>

                                                    {getRuntimePayloadEditorState(action).mode === "key_value" ? (
                                                      <div className="mt-4 space-y-3">
                                                        {runtimePayloadEntries(getRuntimeActionPayload(action)).map((entry, payloadIndex, payloadEntries) => (
                                                          <div key={`${action.id}-payload-${payloadIndex}`} className="grid gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto]">
                                                            <input
                                                              value={entry.key}
                                                              onChange={(event) => {
                                                                const nextEntries = payloadEntries.map((candidate, candidateIndex) =>
                                                                  candidateIndex === payloadIndex ? { ...candidate, key: event.target.value } : candidate,
                                                                );
                                                                const payload = runtimePayloadFromEntries(nextEntries);
                                                                updateRuntimeAction(listener.id, action.id, (current) => {
                                                                  current.config.payload = payload;
                                                                });
                                                                syncRuntimePayloadEditor(action.id, payload);
                                                              }}
                                                              placeholder="key"
                                                              className="rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                                                            />
                                                            <input
                                                              value={entry.value}
                                                              onChange={(event) => {
                                                                const nextEntries = payloadEntries.map((candidate, candidateIndex) =>
                                                                  candidateIndex === payloadIndex ? { ...candidate, value: event.target.value } : candidate,
                                                                );
                                                                const payload = runtimePayloadFromEntries(nextEntries);
                                                                updateRuntimeAction(listener.id, action.id, (current) => {
                                                                  current.config.payload = payload;
                                                                });
                                                                syncRuntimePayloadEditor(action.id, payload);
                                                              }}
                                                              placeholder='value, true, 42, {"deep":"json"}'
                                                              className="rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                                                            />
                                                            <button
                                                              type="button"
                                                              onClick={() => {
                                                                const nextEntries = payloadEntries.filter((_, candidateIndex) => candidateIndex !== payloadIndex);
                                                                const payload = runtimePayloadFromEntries(nextEntries);
                                                                updateRuntimeAction(listener.id, action.id, (current) => {
                                                                  current.config.payload = payload;
                                                                });
                                                                syncRuntimePayloadEditor(action.id, payload);
                                                              }}
                                                              className={actionButtonClass("danger")}
                                                            >
                                                              Remove
                                                            </button>
                                                          </div>
                                                        ))}
                                                        {!runtimePayloadEntries(getRuntimeActionPayload(action)).length ? (
                                                          <div className="app-muted-card p-4 text-sm text-slate-500">
                                                            No payload values yet. Add a pair if this event should tell the host or runtime more than its name.
                                                          </div>
                                                        ) : null}
                                                        <button
                                                          type="button"
                                                          onClick={() => {
                                                            const nextEntries = [
                                                              ...runtimePayloadEntries(getRuntimeActionPayload(action)),
                                                              {
                                                                key: `field_${runtimePayloadEntries(getRuntimeActionPayload(action)).length + 1}`,
                                                                value: "",
                                                              },
                                                            ];
                                                            const payload = runtimePayloadFromEntries(nextEntries);
                                                            updateRuntimeAction(listener.id, action.id, (current) => {
                                                              current.config.payload = payload;
                                                            });
                                                            syncRuntimePayloadEditor(action.id, payload);
                                                          }}
                                                          className={actionButtonClass()}
                                                        >
                                                          Add payload field
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
                                                      className="mt-2 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                                                    />
                                                  </div>
                                                  <div className="rounded-[0.95rem] border border-soft bg-slate-50 p-4">
                                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                                      <div>
                                                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Request payload</p>
                                                        <p className="mt-2 text-sm text-slate-700">
                                                          Use a small structured request by default. Switch to JSON when the host action needs a richer envelope.
                                                        </p>
                                                      </div>
                                                      <div className="flex gap-2">
                                                        <button
                                                          type="button"
                                                          onClick={() => setRuntimePayloadEditorMode(action, "key_value")}
                                                          className={actionButtonClass(getRuntimePayloadEditorState(action).mode === "key_value" ? "primary" : "secondary")}
                                                        >
                                                          Key/value
                                                        </button>
                                                        <button
                                                          type="button"
                                                          onClick={() => setRuntimePayloadEditorMode(action, "json")}
                                                          className={actionButtonClass(getRuntimePayloadEditorState(action).mode === "json" ? "primary" : "secondary")}
                                                        >
                                                          JSON
                                                        </button>
                                                      </div>
                                                    </div>

                                                    {getRuntimePayloadEditorState(action).mode === "key_value" ? (
                                                      <div className="mt-4 space-y-3">
                                                        {runtimePayloadEntries(getRuntimeActionPayload(action)).map((entry, payloadIndex, payloadEntries) => (
                                                          <div key={`${action.id}-host-payload-${payloadIndex}`} className="grid gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto]">
                                                            <input
                                                              value={entry.key}
                                                              onChange={(event) => {
                                                                const nextEntries = payloadEntries.map((candidate, candidateIndex) =>
                                                                  candidateIndex === payloadIndex ? { ...candidate, key: event.target.value } : candidate,
                                                                );
                                                                const payload = runtimePayloadFromEntries(nextEntries);
                                                                updateRuntimeAction(listener.id, action.id, (current) => {
                                                                  current.config.payload = payload;
                                                                });
                                                                syncRuntimePayloadEditor(action.id, payload);
                                                              }}
                                                              placeholder="key"
                                                              className="rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                                                            />
                                                            <input
                                                              value={entry.value}
                                                              onChange={(event) => {
                                                                const nextEntries = payloadEntries.map((candidate, candidateIndex) =>
                                                                  candidateIndex === payloadIndex ? { ...candidate, value: event.target.value } : candidate,
                                                                );
                                                                const payload = runtimePayloadFromEntries(nextEntries);
                                                                updateRuntimeAction(listener.id, action.id, (current) => {
                                                                  current.config.payload = payload;
                                                                });
                                                                syncRuntimePayloadEditor(action.id, payload);
                                                              }}
                                                              placeholder='value, true, 42, {"deep":"json"}'
                                                              className="rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                                                            />
                                                            <button
                                                              type="button"
                                                              onClick={() => {
                                                                const nextEntries = payloadEntries.filter((_, candidateIndex) => candidateIndex !== payloadIndex);
                                                                const payload = runtimePayloadFromEntries(nextEntries);
                                                                updateRuntimeAction(listener.id, action.id, (current) => {
                                                                  current.config.payload = payload;
                                                                });
                                                                syncRuntimePayloadEditor(action.id, payload);
                                                              }}
                                                              className={actionButtonClass("danger")}
                                                            >
                                                              Remove
                                                            </button>
                                                          </div>
                                                        ))}
                                                        {!runtimePayloadEntries(getRuntimeActionPayload(action)).length ? (
                                                          <div className="app-muted-card p-4 text-sm text-slate-500">
                                                            No request payload yet. Add fields only if the host action needs extra context beyond the handler key.
                                                          </div>
                                                        ) : null}
                                                        <button
                                                          type="button"
                                                          onClick={() => {
                                                            const nextEntries = [
                                                              ...runtimePayloadEntries(getRuntimeActionPayload(action)),
                                                              {
                                                                key: `field_${runtimePayloadEntries(getRuntimeActionPayload(action)).length + 1}`,
                                                                value: "",
                                                              },
                                                            ];
                                                            const payload = runtimePayloadFromEntries(nextEntries);
                                                            updateRuntimeAction(listener.id, action.id, (current) => {
                                                              current.config.payload = payload;
                                                            });
                                                            syncRuntimePayloadEditor(action.id, payload);
                                                          }}
                                                          className={actionButtonClass()}
                                                        >
                                                          Add payload field
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

                                              {action.kind === "show_node" ||
                                              action.kind === "hide_node" ||
                                              action.kind === "enable_node" ||
                                              action.kind === "disable_node" ||
                                              action.kind === "mark_required" ||
                                              action.kind === "mark_optional" ? (
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
                                            </div>
                                          </div>
                                        ))}
                                        <button type="button" onClick={() => addRuntimeActionToListener(listener.id)} className={actionButtonClass()}>
                                          Add action
                                        </button>
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <div className="app-muted-card p-4 text-sm text-slate-500">
                                    No listeners yet. Start with a preset above or add a blank listener for advanced editing.
                                  </div>
                                )}
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="app-muted-card p-4 text-sm text-slate-500">
                            Select a node, or switch to form events, to author runtime behavior.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="app-muted-card p-6 text-sm text-slate-500">No project selected.</div>
                )}
                {selectedAuthoring?.kind === "field" &&
                activeBuilderField &&
                editingRuleIndex !== null &&
                activeBuilderField.conditionals[editingRuleIndex] ? (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/28 p-4">
                    <div className="w-full max-w-[32rem] rounded-[1.35rem] border border-soft bg-white p-5 shadow-[0_30px_70px_rgba(19,32,51,0.18)]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Rule editor</p>
                          <h4 className="mt-1 text-lg font-semibold text-slate-950">{activeBuilderField.label}</h4>
                        </div>
                        <button type="button" onClick={() => setEditingRuleIndex(null)} className={iconButtonClass()}>
                          ×
                        </button>
                      </div>
                      <div className="mt-4 grid gap-3">
                        <select
                          value={activeBuilderField.conditionals[editingRuleIndex].whenFieldId}
                          onChange={(event) => updateConditionalRule(editingRuleIndex, (current) => { current.whenFieldId = event.target.value; })}
                          className="rounded-2xl border border-soft px-4 py-2.5 text-sm text-slate-800"
                        >
                          {builderFieldOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <select
                            value={activeBuilderField.conditionals[editingRuleIndex].operator}
                            onChange={(event) =>
                              updateConditionalRule(editingRuleIndex, (current) => {
                                current.operator = event.target.value as ConditionalRule["operator"];
                              })
                            }
                            className="rounded-2xl border border-soft px-4 py-2.5 text-sm text-slate-800"
                          >
                            <option value="equals">equals</option>
                            <option value="not_equals">does not equal</option>
                            <option value="contains">contains</option>
                            <option value="exists">has any value</option>
                          </select>
                          <select
                            value={activeBuilderField.conditionals[editingRuleIndex].effect}
                            onChange={(event) =>
                              updateConditionalRule(editingRuleIndex, (current) => {
                                current.effect = event.target.value as ConditionalRule["effect"];
                              })
                            }
                            className="rounded-2xl border border-soft px-4 py-2.5 text-sm text-slate-800"
                          >
                            <option value="show">show</option>
                            <option value="hide">hide</option>
                            <option value="require">require</option>
                            <option value="disable">disable</option>
                          </select>
                        </div>
                        {activeBuilderField.conditionals[editingRuleIndex].operator !== "exists" ? (
                          <input
                            value={activeBuilderField.conditionals[editingRuleIndex].expectedValue ?? ""}
                            onChange={(event) => updateConditionalRule(editingRuleIndex, (current) => { current.expectedValue = event.target.value; })}
                            placeholder="Expected value"
                            className="rounded-2xl border border-soft px-4 py-2.5 text-sm text-slate-800"
                          />
                        ) : null}
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => removeConditionalRule(editingRuleIndex)} className={actionButtonClass("danger")}>
                            Remove
                          </button>
                          <button type="button" onClick={() => setEditingRuleIndex(null)} className={actionButtonClass("primary")}>
                            Done
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
                {runtimeToolsOpen && activeDocument ? (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/28 p-4">
                    <div className="w-full max-w-[56rem] rounded-[1.35rem] border border-soft bg-white p-5 shadow-[0_30px_70px_rgba(19,32,51,0.18)]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Dev-only runtime tools</p>
                          <h4 className="mt-1 text-lg font-semibold text-slate-950">Session roundtrip and trace inspection</h4>
                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            Export and restore runtime session state, inspect the submit payload, and simulate host responses against the real shared runtime.
                          </p>
                        </div>
                        <button type="button" onClick={() => setRuntimeToolsOpen(false)} className={iconButtonClass()}>
                          ×
                        </button>
                      </div>

                      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                        <div className="space-y-4">
                          <div className="rounded-[1rem] border border-soft bg-slate-50 p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <button type="button" onClick={handleExportRuntimeSession} className={actionButtonClass("primary")}>
                                Export session JSON
                              </button>
                              <button type="button" onClick={() => runtimeSessionInputRef.current?.click()} className={actionButtonClass()}>
                                Import session JSON
                              </button>
                              <button type="button" onClick={handlePopulateRequiredRuntimeValues} className={actionButtonClass()}>
                                Seed required values
                              </button>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-slate-600">
                              Export captures the runtime execution state exactly as the preview sees it. Import restores that state into the mounted runtime to validate roundtrip behavior.
                            </p>
                          </div>

                          <div className="rounded-[1rem] border border-soft bg-slate-50 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Submit cycle</p>
                                <p className="mt-2 text-sm text-slate-700">
                                  Current submit status: {runtimeSessionState?.submit.status ?? "idle"}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={handleMockSubmitSuccess} className={actionButtonClass()}>
                                  Mock success
                                </button>
                                <button type="button" onClick={handleMockSubmitError} className={actionButtonClass("danger")}>
                                  Mock error
                                </button>
                              </div>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-slate-600">
                              Use these after the runtime enters submitting state to validate the host response loop before a real host shell is attached.
                            </p>
                          </div>

                          <div className="rounded-[1rem] border border-soft bg-slate-50 p-4">
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Current session snapshot</p>
                            <pre className="mt-3 max-h-[18rem] overflow-auto rounded-[0.9rem] bg-slate-950 p-4 text-xs leading-6 text-slate-100">
                              {JSON.stringify(runtimeSessionState, null, 2)}
                            </pre>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="rounded-[1rem] border border-soft bg-slate-50 p-4">
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Current submit payload</p>
                            <pre className="mt-3 max-h-[14rem] overflow-auto rounded-[0.9rem] bg-slate-950 p-4 text-xs leading-6 text-slate-100">
                              {JSON.stringify(runtimeSubmitPreview, null, 2)}
                            </pre>
                          </div>

                          <div className="rounded-[1rem] border border-soft bg-slate-50 p-4">
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Recent runtime events</p>
                            <div className="mt-3 max-h-[24rem] space-y-3 overflow-auto">
                              {runtimeTraceEntries.length ? (
                                runtimeTraceEntries.map((entry, index) => (
                                  <div key={`${entry.event.correlationId}-${entry.event.timestamp}-${index}`} className="rounded-[0.95rem] border border-soft bg-white p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <p className="font-semibold text-slate-950">{entry.event.type}</p>
                                      <span className="app-pill">{entry.direction}</span>
                                    </div>
                                    <p className="mt-1 text-xs text-slate-500">
                                      {entry.event.timestamp} · source {entry.event.source.nodeType ?? "unknown"} {entry.event.source.nodeId ?? ""}
                                    </p>
                                    <pre className="mt-3 overflow-auto rounded-[0.85rem] bg-slate-950 p-3 text-[11px] leading-5 text-slate-100">
                                      {JSON.stringify(entry.event.payload, null, 2)}
                                    </pre>
                                  </div>
                                ))
                              ) : (
                                <div className="app-muted-card p-4 text-sm text-slate-500">
                                  No runtime events captured yet. Interact with the preview, submit, or mock host responses to build a trace.
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </PanelCard>
              {sourceDrawerOpen && sourceContextDraft ? (
                <PanelCard
                  title="Source Reference"
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
                        Hide reference
                      </button>
                    </div>
                  }
                  className="min-h-[52rem] min-w-0 overflow-hidden"
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
                              : "This authored selection no longer has direct imported IDs attached, so the full source reference stays available instead."}
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
                                                {matchingGroups.map((group) => {
                                                  const groupSelection = resolveSelectionForSourceTarget("group", page, section, group);
                                                  const groupSelectionIsActive = authoringSelectionsEqual(groupSelection, selectedAuthoring);

                                                  return groupSelection ? (
                                                    <button
                                                      key={group.id}
                                                      type="button"
                                                      onClick={() => focusAuthoringSelectionFromSource("group", page, section, group)}
                                                      className={subtleButtonClass(groupSelectionIsActive)}
                                                    >
                                                      {group.label}
                                                    </button>
                                                  ) : (
                                                    <span key={group.id} className="app-pill">
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
                                                {matchingFields.slice(0, 8).map((field) => {
                                                  const fieldSelection = resolveSelectionForSourceTarget("field", page, section, undefined, field);
                                                  const fieldSelectionIsActive = authoringSelectionsEqual(fieldSelection, selectedAuthoring);

                                                  return fieldSelection ? (
                                                    <button
                                                      key={field.id}
                                                      type="button"
                                                      onClick={() => focusAuthoringSelectionFromSource("field", page, section, undefined, field)}
                                                      className={subtleButtonClass(fieldSelectionIsActive)}
                                                    >
                                                      {field.label}
                                                    </button>
                                                  ) : (
                                                    <span key={field.id} className="app-pill">
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
