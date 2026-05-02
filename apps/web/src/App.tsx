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
  PageNode,
  ProjectStatus,
  ReviewStatus,
  RuntimeActionDefinition,
  RuntimeActionKind,
  RuntimeDocumentBehavior,
  RuntimeEventEnvelope,
  RuntimeEventDefinition,
  RuntimeListenerDefinition,
  RuntimeNodeBehavior,
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
  getSelectionContext,
  refreshChoiceOptions,
} from "./lib/authoring-utils";
import type { ConversionRecord, ProcessingStepStatus } from "./lib/types";

type AppStage = "review" | "builder" | "publish";
type ReviewPreviewMode = "overlay" | "pdf";
type InspectorTab = "properties" | "logic" | "events";
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

function stageButtonClass(active: boolean): string {
  return active
    ? "inline-flex h-9 items-center rounded-lg border border-blue-200 bg-blue-50 px-3.5 text-sm font-medium text-blue-700 shadow-sm"
    : "inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-950";
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
  const [stage, setStage] = useState<AppStage>("review");
  const [reviewPreviewMode, setReviewPreviewMode] = useState<ReviewPreviewMode>("overlay");
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
  const [projectDirty, setProjectDirty] = useState(false);
  const [projectRevisions, setProjectRevisions] = useState<Array<{ id: string; note: string; createdAt: string }>>([]);
  const [isEditingDocumentTitle, setIsEditingDocumentTitle] = useState(false);
  const [editingRuleIndex, setEditingRuleIndex] = useState<number | null>(null);
  const [runtimeToolsOpen, setRuntimeToolsOpen] = useState(false);
  const [runtimePayloadEditors, setRuntimePayloadEditors] = useState<Record<string, RuntimePayloadEditorState>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isImportingJson, setIsImportingJson] = useState(false);
  const [isSavingReview, setIsSavingReview] = useState(false);
  const [isPromoting, setIsPromoting] = useState(false);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [isPublishingProject, setIsPublishingProject] = useState(false);
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
          if (records[0]) {
            setActiveProjectId(null);
            setActiveProjectDetail(null);
            setProjectRevisions([]);
            setSelectedAuthoring(null);
            setStage("review");
          } else if (projectRecords[0]) {
            setActiveProjectId((current) => current ?? projectRecords[0]?.id ?? null);
            setStage("builder");
          }
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
    if (!activeProjectId) {
      setActiveProjectDetail(null);
      setProjectRevisions([]);
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
          setProjectRevisions(
            revisions.map((revision) => ({
              id: revision.id,
              note: revision.note,
              createdAt: revision.createdAt,
            })),
          );
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
  const builderSelection = activeDocument ? getSelectionContext(activeDocument, selectedAuthoring) : null;
  const runtimeStepId = runtimeSessionState?.currentStepId ?? null;
  const runtimeActiveStep =
    activeDocument && runtimeStepId ? activeDocument.steps.find((step) => step.id === runtimeStepId) ?? null : null;
  const activeStep = runtimeActiveStep ?? builderSelection?.step ?? activeDocument?.steps[0] ?? null;
  const activeSection = builderSelection?.section ?? activeStep?.sections[0] ?? null;
  const activeGroup = builderSelection?.group ?? null;
  const activeBuilderField = builderSelection?.field ?? null;
  const activeStepSummary = activeStep ? summarizeAuthoringStep(activeStep) : null;
  const activeStepIndex = activeDocument && activeStep ? activeDocument.steps.findIndex((step) => step.id === activeStep.id) : -1;
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

  async function handleUpload(file: File) {
    setSelectedFile(file);
    setErrorMessage(null);
    setFlashMessage(null);
    setIsUploading(true);
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

  async function handleOpenJson(file: File) {
    setSelectedFile(file);
    setErrorMessage(null);
    setFlashMessage(null);
    setIsImportingJson(true);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const document = importedDocumentFromPayload(parsed);
      if (!document) {
        throw new Error("The selected JSON file does not contain an authoring document.");
      }
      const detail = await importProjectDocument(document);
      applyProjectDetail(detail);
      setProjectDirty(false);
      setActiveConversionId(null);
      setSelectedPageId(null);
      setSelectedAuthoring(detail.document.steps[0] ? { kind: "step", stepId: detail.document.steps[0].id } : null);
      setStage("builder");
      setSourceDrawerOpen(false);
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
        setLocalPreviewUrl(null);
        setLocalPreviewConversionId(null);
      }
      setMessage("JSON opened directly in the builder.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "JSON import failed.");
    } finally {
      setIsImportingJson(false);
    }
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
      setActiveProjectId(matchedProjectForActiveConversion.id);
      setStage("builder");
      setSourceDrawerOpen(false);
      setMessage("Opened the existing builder project for this conversion.");
      return;
    }
    setIsPromoting(true);
    try {
      const detail = await promoteConversion(activeConversion.id);
      applyProjectDetail(detail);
      setSelectedAuthoring(detail.document.steps[0] ? { kind: "step", stepId: detail.document.steps[0].id } : null);
      setProjectDirty(false);
      setStage("builder");
      setSourceDrawerOpen(false);
      setMessage("Review complete. The draft is now a project you can reshape into a VA-style web flow.");
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
    setIsSavingProject(true);
    try {
      const detail = await saveProjectDocument(activeProjectDetail.project.id, activeProjectDetail.document);
      applyProjectDetail(detail);
      const revisions = await listProjectRevisions(detail.project.id);
      setProjectRevisions(
        revisions.map((revision) => ({
          id: revision.id,
          note: revision.note,
          createdAt: revision.createdAt,
        })),
      );
      setProjectDirty(false);
      setMessage("Project saved.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save project.");
    } finally {
      setIsSavingProject(false);
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
        setProjectRevisions(
          revisions.map((revision) => ({
            id: revision.id,
            note: revision.note,
            createdAt: revision.createdAt,
          })),
        );
        setProjectDirty(false);
      }
      const nextStatus: ProjectStatus = detail.project.status === "published" ? "draft" : "published";
      const updatedDetail = await patchProject(detail.project.id, { status: nextStatus });
      applyProjectDetail(updatedDetail);
      setStage("publish");
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
  }

  function handleDropTarget(event: DragEvent<HTMLElement>, target: Parameters<typeof applyDragMove>[2]) {
    event.preventDefault();
    if (!dragPayload) {
      return;
    }
    updateAuthoringDocument((document) => {
      applyDragMove(document, dragPayload, target);
    });
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

  const workspaceTitle = activeProjectDetail?.project.name ?? activeConversion?.filename ?? selectedFile?.name ?? "No file loaded";
  const workspaceStatus = activeProjectDetail
    ? formatLabel(activeProjectDetail.project.status)
    : activeConversion
      ? formatLabel(activeConversion.reviewStatus)
      : "Idle";

  return (
    <main className="min-h-screen">
      <div className="mx-auto flex max-w-[1720px] flex-col gap-3 px-3 py-3 sm:px-5 lg:px-6">
        <header className="app-shell px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[0.64rem] font-semibold uppercase tracking-[0.22em] text-slate-500">Form Builder</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h1 className="text-base font-semibold text-slate-950">{workspaceTitle}</h1>
                <StatusBadge tone={activeProjectDetail ? badgeToneFromProjectStatus(activeProjectDetail.project.status) : activeConversion ? badgeToneFromReview(activeConversion.reviewStatus) : "neutral"}>
                  {workspaceStatus}
                </StatusBadge>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {stage === "review"
                  ? "Validate the import against the source."
                  : stage === "builder"
                    ? "Refine the authoring flow step by step."
                    : "Finalize and hand off the authored project."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {stage === "review" ? <span className="app-pill">{conversions.length} conversions</span> : null}
              {activeProjectDetail ? <span className="app-pill">{projectRevisions.length} revisions</span> : null}
              {activeConversion ? <span className="app-pill">{activeConversion.documentSignals?.pageCount ?? 0} pages</span> : null}
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button type="button" onClick={() => setStage("review")} className={stageButtonClass(stage === "review")}>
              1. Import + Review
            </button>
            <button
              type="button"
              onClick={() => activeProjectId && setStage("builder")}
              className={stageButtonClass(stage === "builder")}
              disabled={!activeProjectId}
            >
              2. Build
            </button>
            <button
              type="button"
              onClick={() => activeProjectId && setStage("publish")}
              className={stageButtonClass(stage === "publish")}
              disabled={!activeProjectId}
            >
              3. Publish
            </button>
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

        {stage === "review" ? (
          <StageShell
            eyebrow="Intake"
            title="Import and review against the source"
            summary="Keep the source dominant. Confirm that page structure, ordering, and control mapping are accurate before moving into build."
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
                    title="Source Preview"
                    eyebrow="Review workspace"
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
                    className="min-h-[42rem]"
                  >
                  <div className={`mb-4 flex flex-wrap items-center gap-2 rounded-[1rem] border px-3 py-2.5 ${dragActive ? "border-blue-300 bg-blue-50" : "border-soft bg-slate-50"}`}>
                    <div className="min-w-[11rem]">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[#103975]/65">Intake</p>
                      <p className="mt-1 text-sm text-slate-600">Import a PDF or open saved authoring JSON.</p>
                    </div>
                    <button type="button" onClick={() => inputRef.current?.click()} className={actionButtonClass("primary")}>
                      {isUploading ? "Importing..." : "Import PDF"}
                    </button>
                    <button
                      type="button"
                      onClick={() => jsonInputRef.current?.click()}
                      disabled={isImportingJson}
                      className={actionButtonClass()}
                    >
                      {isImportingJson ? "Opening..." : "Open JSON"}
                    </button>
                    <div className="ml-auto rounded-full border border-soft bg-white px-3 py-1.5 text-sm text-slate-600">
                      {selectedFile ? `${selectedFile.name} · ${formatBytes(selectedFile.size)}` : "Drop a PDF here"}
                    </div>
                  </div>
                  {reviewPreviewMode === "pdf" ? (
                    previewUrl ? (
                      <object data={previewUrl} type="application/pdf" className="h-[42rem] w-full rounded-[1.2rem] border border-soft bg-white">
                        <div className="app-muted-card p-6 text-sm text-slate-500">Inline PDF preview is unavailable in this browser.</div>
                      </object>
                    ) : (
                      <div className="app-muted-card p-6 text-sm text-slate-500">Import a PDF to inspect the source preview here.</div>
                    )
                  ) : pagePreviewImageUrl && activeReviewPage ? (
                    <div className="overflow-hidden rounded-[1.5rem] border border-soft bg-slate-950">
                      <svg viewBox={`0 0 ${reviewPageDimensions.width} ${reviewPageDimensions.height}`} className="h-[42rem] w-full">
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
                  title="Review Panel"
                  eyebrow="Mapping and issues"
                  aside={
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="app-pill">{activeReviewFields.length} mapped</span>
                      <span className="app-pill">{activeConversion?.issues.length ?? 0} issues</span>
                    </div>
                  }
                  className="min-h-[34rem]"
                >
                  <div className="space-y-3">
                    {activeReviewPage ? (
                      <div className="app-muted-card p-3.5">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Selected page</p>
                        <h3 className="mt-1 text-lg font-semibold text-slate-950">{primaryPageHeading(activeReviewPage)}</h3>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          {secondaryPageHeading(activeReviewPage) ?? activePageSummary?.evidenceSnippet ?? "No evidence summary available."}
                        </p>
                      </div>
                    ) : null}
                    <div className="space-y-3 rounded-[1rem] border border-soft bg-white p-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Mapped structure</p>
                          <p className="mt-2 text-sm text-slate-600">Click in the overlay or the list to move the active selection.</p>
                        </div>
                        {activeReviewField ? <StatusBadge tone="info">{formatLabel(activeReviewField.semanticType)}</StatusBadge> : null}
                      </div>
                      <div className="max-h-[24rem] space-y-2.5 overflow-y-auto pr-1">
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
                    <div className="space-y-3 rounded-[1rem] border border-soft bg-white p-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Issues</p>
                          <p className="mt-2 text-sm text-slate-600">Keep surfaced issues visible without leaving the mapping view.</p>
                        </div>
                        <StatusBadge tone={(activeConversion?.issues.length ?? 0) > 0 ? "warning" : "success"}>
                          {(activeConversion?.issues.length ?? 0) > 0 ? `${activeConversion?.issues.length ?? 0} open` : "Clear"}
                        </StatusBadge>
                      </div>
                      <div className="max-h-[11rem] space-y-2.5 overflow-y-auto pr-1">
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
                  </div>
                </PanelCard>

                <PanelCard
                  title="Move Forward"
                  eyebrow="User judgment"
                  aside={
                    activeConversion ? (
                      <StatusBadge tone={badgeToneFromReview(activeConversion.reviewStatus)}>
                        {formatLabel(activeConversion.reviewStatus)}
                      </StatusBadge>
                    ) : undefined
                  }
                >
                  <div className="space-y-3">
                    <p className="text-sm leading-6 text-slate-600">
                      You decide when this is good enough. Mark it reviewed or accepted, then promote it into the builder.
                    </p>
                    <div className="grid gap-3">
                      <button
                        type="button"
                        onClick={() => void handleReviewUpdate("reviewed")}
                        disabled={!activeConversion || isSavingReview}
                        className={actionButtonClass("secondary")}
                      >
                        {isSavingReview ? "Saving..." : "Looks good enough to build"}
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
                          ? "Open builder project"
                          : isPromoting
                            ? "Promoting..."
                            : "Promote into builder"}
                      </button>
                    </div>
                  </div>
                </PanelCard>

                <PanelCard
                  title="Recent Imports"
                  eyebrow="Queue"
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
                        onClick={() => {
                          setActiveConversionId(conversion.id);
                          setSelectedPageId(conversion.draft?.pages[0]?.id ?? null);
                        }}
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

        {stage === "builder" ? (
          <StageShell
            eyebrow="Builder"
            title="Shape the runtime flow"
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
                  onClick={() => setSourceDrawerOpen((current) => !current)}
                  disabled={!sourceContextDraft}
                  className={actionButtonClass()}
                >
                  {sourceDrawerOpen ? "Hide source context" : "Show source context"}
                </button>
                <button type="button" onClick={() => void handleSaveProject()} disabled={!activeProjectDetail || isSavingProject} className={actionButtonClass("primary")}>
                  {isSavingProject ? "Saving..." : projectDirty ? "Save" : "Saved"}
                </button>
              </div>
            }
          >
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
                    <div
                      key={step.id}
                      draggable
                      onDragStart={() => handleSelectionDragStart({ kind: "step", stepId: step.id })}
                      onDragEnd={() => setDragPayload(null)}
                      onDragOver={(event) => event.preventDefault()}
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
                  ))}
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
                        {activeStep.sections.map((section, sectionIndex) => (
                          <section
                            key={section.id}
                            draggable
                            onDragStart={() => handleSelectionDragStart({ kind: "section", stepId: activeStep.id, sectionId: section.id })}
                            onDragEnd={() => setDragPayload(null)}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) =>
                              handleDropTarget(event, {
                                kind: "section-list",
                                stepId: activeStep.id,
                                index: sectionIndex,
                              })
                            }
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
                              {section.groups.map((group, groupIndex) => (
                                <div
                                  key={group.id}
                                  draggable
                                  onDragStart={() => handleSelectionDragStart({ kind: "group", stepId: activeStep.id, sectionId: section.id, groupId: group.id })}
                                  onDragEnd={() => setDragPayload(null)}
                                  onDragOver={(event) => event.preventDefault()}
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
                                    onDragOver={(event) => event.preventDefault()}
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
                                  {group.fields.map((field, fieldIndex) => {
                                    const isButtonComponent = field.rendererHints.component === "button";
                                    const isSelected =
                                      selectedAuthoring?.kind === "field" && selectedAuthoring.fieldId === field.id;
                                    const fieldTone =
                                      isSelected
                                        ? "border-blue-300 bg-[#e8f0ff]"
                                        : field.required
                                          ? "border-rose-300 bg-rose-50/60"
                                          : "border-soft bg-slate-50";

                                    return isButtonComponent ? (
                                      <div
                                        key={field.id}
                                        draggable
                                        onDragStart={() =>
                                          handleSelectionDragStart({
                                            kind: "field",
                                            stepId: activeStep.id,
                                            sectionId: section.id,
                                            groupId: group.id,
                                            fieldId: field.id,
                                          })
                                        }
                                        onDragEnd={() => setDragPayload(null)}
                                        onDragOver={(event) => event.preventDefault()}
                                        onDrop={(event) =>
                                          handleDropTarget(event, {
                                            kind: "field-list",
                                            stepId: activeStep.id,
                                            sectionId: section.id,
                                            groupId: group.id,
                                            index: fieldIndex,
                                          })
                                        }
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          setSelectedAuthoring({
                                            kind: "field",
                                            stepId: activeStep.id,
                                            sectionId: section.id,
                                            groupId: group.id,
                                            fieldId: field.id,
                                          });
                                        }}
                                        className={`rounded-[1.1rem] border p-4 text-left ${fieldTone}`}
                                      >
                                        {fieldPreview(field)}
                                        <div className="mt-3">
                                          <button
                                            type="button"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              handleRuntimeButtonClick(field);
                                            }}
                                            className={actionButtonClass(
                                              getButtonBehaviorSummary(field).action === "submit" || getButtonBehaviorSummary(field).action === "next_step"
                                                ? "primary"
                                                : "secondary",
                                            )}
                                          >
                                            {field.label}
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <button
                                        key={field.id}
                                        type="button"
                                        draggable
                                        onDragStart={() =>
                                          handleSelectionDragStart({
                                            kind: "field",
                                            stepId: activeStep.id,
                                            sectionId: section.id,
                                            groupId: group.id,
                                            fieldId: field.id,
                                          })
                                        }
                                        onDragEnd={() => setDragPayload(null)}
                                        onDragOver={(event) => event.preventDefault()}
                                        onDrop={(event) =>
                                          handleDropTarget(event, {
                                            kind: "field-list",
                                            stepId: activeStep.id,
                                            sectionId: section.id,
                                            groupId: group.id,
                                            index: fieldIndex,
                                          })
                                        }
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          setSelectedAuthoring({
                                            kind: "field",
                                            stepId: activeStep.id,
                                            sectionId: section.id,
                                            groupId: group.id,
                                            fieldId: field.id,
                                          });
                                        }}
                                        className={`rounded-[1.1rem] border p-4 text-left ${fieldTone}`}
                                      >
                                        {fieldPreview(field)}
                                      </button>
                                    );
                                  })}
                                  </div>
                                </div>
                              ))}

                              <div
                                className="grid gap-4 md:grid-cols-2"
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={(event) =>
                                  handleDropTarget(event, {
                                    kind: "field-list",
                                    stepId: activeStep.id,
                                    sectionId: section.id,
                                    index: section.fields.length,
                                  })
                                }
                              >
                                {section.fields.map((field, fieldIndex) => {
                                  const isButtonComponent = field.rendererHints.component === "button";
                                  const isSelected =
                                    selectedAuthoring?.kind === "field" && selectedAuthoring.fieldId === field.id;
                                  const fieldTone =
                                    isSelected
                                      ? "border-blue-300 bg-[#e8f0ff]"
                                      : field.required
                                        ? "border-rose-300 bg-rose-50/60"
                                        : "border-soft bg-slate-50";

                                  return isButtonComponent ? (
                                    <div
                                      key={field.id}
                                      draggable
                                      onDragStart={() =>
                                        handleSelectionDragStart({
                                          kind: "field",
                                          stepId: activeStep.id,
                                          sectionId: section.id,
                                          fieldId: field.id,
                                        })
                                      }
                                      onDragEnd={() => setDragPayload(null)}
                                      onDragOver={(event) => event.preventDefault()}
                                      onDrop={(event) =>
                                        handleDropTarget(event, {
                                          kind: "field-list",
                                          stepId: activeStep.id,
                                          sectionId: section.id,
                                          index: fieldIndex,
                                        })
                                      }
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setSelectedAuthoring({
                                          kind: "field",
                                          stepId: activeStep.id,
                                          sectionId: section.id,
                                          fieldId: field.id,
                                        });
                                      }}
                                      className={`rounded-[1.1rem] border p-4 text-left ${fieldTone}`}
                                    >
                                      {fieldPreview(field)}
                                      <div className="mt-3">
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            handleRuntimeButtonClick(field);
                                          }}
                                          className={actionButtonClass(
                                            getButtonBehaviorSummary(field).action === "submit" || getButtonBehaviorSummary(field).action === "next_step"
                                              ? "primary"
                                              : "secondary",
                                          )}
                                        >
                                          {field.label}
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      key={field.id}
                                      type="button"
                                      draggable
                                      onDragStart={() =>
                                        handleSelectionDragStart({
                                          kind: "field",
                                          stepId: activeStep.id,
                                          sectionId: section.id,
                                          fieldId: field.id,
                                        })
                                      }
                                      onDragEnd={() => setDragPayload(null)}
                                      onDragOver={(event) => event.preventDefault()}
                                      onDrop={(event) =>
                                        handleDropTarget(event, {
                                          kind: "field-list",
                                          stepId: activeStep.id,
                                          sectionId: section.id,
                                          index: fieldIndex,
                                        })
                                      }
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setSelectedAuthoring({
                                          kind: "field",
                                          stepId: activeStep.id,
                                          sectionId: section.id,
                                          fieldId: field.id,
                                        });
                                      }}
                                      className={`rounded-[1.1rem] border p-4 text-left ${fieldTone}`}
                                    >
                                      {fieldPreview(field)}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </section>
                        ))}
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
                  title="Source Context"
                  eyebrow="Imported evidence on demand"
                  aside={
                    <button type="button" onClick={() => setSourceDrawerOpen(false)} className={actionButtonClass()}>
                      Hide
                    </button>
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
                        Keep this open while reshaping the flow when you need to compare the imported source structure against the current step.
                      </p>
                    </div>
                    <div className="space-y-3">
                      {sourceContextDraft.pages.map((page) => (
                        <div key={page.id} className="rounded-[1.1rem] border border-soft bg-slate-50 p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Page {page.orderIndex + 1}</p>
                          <p className="mt-2 font-semibold text-slate-950">{page.label}</p>
                          <div className="mt-3 space-y-2">
                            {page.sections.map((section) => (
                              <div key={section.id} className="rounded-[0.95rem] border border-soft bg-white p-3">
                                <p className="font-semibold text-slate-950">{section.title}</p>
                                <p className="mt-1 text-sm text-slate-600">
                                  {[...section.fields, ...section.groups.flatMap((group) => group.fields)].length} extracted fields
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </PanelCard>
              ) : null}
            </section>
          </StageShell>
        ) : null}

        {stage === "publish" ? (
          <StageShell
            eyebrow="Project state"
            title="Save and release"
            summary="Persist the authoring JSON, toggle published state, and confirm the stored project artifacts."
            actions={
              <div className="flex flex-wrap gap-2">
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
                    : activeProjectDetail?.project.status === "published"
                      ? "Mark unpublished"
                      : "Mark published"}
                </button>
              </div>
            }
          >
            <section className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              <PanelCard title="Release state" eyebrow="Current output">
                {activeProjectDetail ? (
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
                          {projectDirty ? "Unsaved local changes in builder" : "Current document persisted to disk"}
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
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">What this stage does now</p>
                      <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                        <p>Save writes the structured authoring JSON and a revision snapshot to the project folder.</p>
                        <p>Published state is a reversible toggle while the runtime/export contract is still evolving.</p>
                        <p>This stage stays intentionally lightweight and separate from day-to-day editing.</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="app-muted-card p-6 text-sm text-slate-500">No project selected.</div>
                )}
              </PanelCard>

              <PanelCard title="Stored artifacts" eyebrow="Local files">
                {activeProjectDetail && projectArtifactPaths ? (
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
                  <div className="app-muted-card p-6 text-sm text-slate-500">No project selected.</div>
                )}
              </PanelCard>
            </section>
          </StageShell>
        ) : null}
      </div>
    </main>
  );
}
