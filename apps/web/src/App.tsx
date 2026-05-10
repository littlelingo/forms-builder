import type { CSSProperties, ChangeEvent, DragEvent, MouseEvent, PointerEvent, ReactNode } from "react";
import { Fragment, startTransition, useEffect, useMemo, useRef, useState } from "react";

import { createRuntimeEngine } from "@form-builder/runtime";
import type { RuntimeDispatchReport, RuntimeTraceEntry } from "@form-builder/runtime";
import type {
  AuthoringDocument,
  AuthoringField,
  AuthoringGroup,
  AuthoringProjectDetail,
  AuthoringProjectRecord,
  AuthoringSection,
  AuthoringStep,
  BehaviorLibraryEntry,
  FieldNode,
  GroupNode,
  PageNode,
  ProjectStatus,
  ProjectRevision,
  ReviewStatus,
  RuntimeActionDefinition,
  RuntimeActionKind,
  RuntimeConditionDefinition,
  RuntimeDocumentBehavior,
  RuntimeEventEnvelope,
  RuntimeEventDefinition,
  RuntimeListenerDefinition,
  RuntimeNodeBehavior,
  RuntimeNodeType,
  RuntimeNodeState,
  RuntimePayloadField,
  RuntimePayloadMode,
  RuntimePayloadShape,
  RuntimeSessionState,
  SemanticType,
  SectionNode,
} from "@form-builder/schema";
import {
  runtimeCoreEventType,
  runtimeCoreEventTypes,
  runtimeCoreEventsForDispatcher,
  runtimeStandardEventPayloadFields,
} from "@form-builder/schema";
import { PanelCard, StatusBadge } from "@form-builder/ui";

import {
  clearConversions,
  deleteConversion,
  deleteProjectLibraryEntry,
  getConversionPagePreviewUrl,
  getConversionSourceUrl,
  getProject,
  importProjectDocument,
  listConversions,
  listProjectLibrary,
  listProjectRevisions,
  listProjects,
  patchConversionReviewStatus,
  patchProject,
  promoteConversion,
  saveProjectDocument,
  saveProjectLibraryEntry,
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
  ensureDocumentDispatchKeys,
  type DragPayload,
  type DropTarget,
  getSelectionContext,
  refreshChoiceOptions,
} from "./lib/authoring-utils";
import type { ConversionRecord } from "./lib/types";
import { BuilderStage, PreviewCanvas, StepStrip } from "./features/builder";
import { BuilderFieldCard } from "./features/builder/cards/BuilderFieldCard";
import { DragHandle, DropMarker, EmptyDropZone } from "./features/builder/dnd/drag-handles";
import { dropTargetKey, isCompatibleDropTarget, summarizeAuthoringStep } from "./features/builder/utils/builder-utils";
import { actionButtonClass, formatLabel, iconButtonClass } from "./lib/ui-utils";
import { HomeStage, badgeToneFromProjectStatus } from "./features/project";
import { ReviewStage } from "./features/review/ReviewStage";
import { badgeToneFromReview, badgeToneFromStatus, overlayRects } from "./features/review/utils/review-utils";
import { InspectorRail } from "./features/inspector";
import type { InspectorTab } from "./features/inspector";
import {
  ActionEditor,
  ApplyParametersDialog,
  BehaviorComposer,
  BehaviorInspectorPanel,
  BehaviorManager,
  countListenersReferencingNode,
  BehaviorQuickToolbar,
  BehaviorStudioModal,
  BehaviorWorkspace,
  CreationGuide,
  CrossItemEventPicker,
  EventCreationForm,
  EventFlowStudio,
  LegacyConditionalRuleEditor,
  LibraryPage,
  LibraryPicker,
  ListenerCreationForm,
  MapGraphOverview,
  RuntimeReactionProperties,
  SYSTEM_LIBRARY,
  applyEntryToListener,
  behaviorPresetCategoryLabels,
  builtInRuntimeEventNames,
  buildStructuredRuntimeTraceEvidence,
  cloneRuntimePayloadShape,
  createEventPayloadCondition,
  createFieldValueCondition,
  createListenerGraphSelection,
  createRuntimeAction,
  createRuntimeDocumentBehavior,
  createRuntimeEventSource,
  createRuntimeListener,
  createRuntimeNodeBehavior,
  createRuntimePayloadEntry,
  createRuntimePayloadReferenceEntry,
  createRuntimePayloadShapeFromFields,
  describeRuntimeAction,
  ensureUniqueEventSource,
  fallbackRuntimePayloadFieldsForEvent,
  findAuthoringFieldById,
  findRuntimeEventSourceForUpsert,
  formatDispatchKey,
  formatNodeOptionLabel,
  formatRuntimeDiagnosticValue,
  formatRuntimeSourceCandidateLabel,
  getButtonBehaviorSummary,
  getRuntimeActionEventType,
  getRuntimeActionPayload,
  getRuntimeListenerEventType,
  getRuntimeTraceEntryKey,
  inferRuntimePayloadFieldType,
  isAuthoredRuntimeEvidenceEntry,
  isAutomaticRuntimePayloadField,
  isLegacyConditionalRuleEnabled,
  isRecord,
  isRuntimePayloadReference,
  isRuntimePayloadReferenceKey,
  legacyFieldConditionals,
  mergeRuntimePayloadFieldsWithStandardFields,
  mutableLegacyFieldConditionals,
  runtimeActionOptions,
  runtimeAutomaticEventPayloadFieldNames,
  runtimeEntityTypeLabel,
  runtimeEventBubblesForSource,
  runtimeEventDefinitionType,
  runtimeFieldActionTargetId,
  runtimeNavigationActionTargetId,
  runtimeNodeActionTargetId,
  runtimeNodeTypeLabel,
  runtimePayloadEntries,
  runtimePayloadEntryValueForType,
  runtimePayloadFieldTypeOptions,
  runtimePayloadFieldsForEventType,
  runtimePayloadFromEntries,
  runtimePayloadIssues,
  runtimePayloadReferenceOptions,
  runtimePayloadValueFromEntry,
  sanitizeRuntimeIdentifier,
  setLegacyConditionalRuleEnabled,
  stringifyRuntimePayloadValue,
  upsertRuntimeEventSource,
  validateRuntimeIdentifier,
} from "./features/behavior";
import type {
  BehaviorGraphDensity,
  BehaviorGraphEntryContext,
  BehaviorGraphFilter,
  BehaviorGraphMode,
  BehaviorGraphSelection,
  BehaviorIndexObjectView,
  BehaviorIndexStatusFilter,
  BehaviorListenerSourceType,
  BehaviorPresetBase,
  BehaviorPresetCategory,
  BehaviorPresetGroupCategory,
  BehaviorStudioAnchor,
  BehaviorStudioCreationPath,
  BehaviorStudioManagerMode,
  BehaviorStudioMode,
  BehaviorStudioPlacement,
  BehaviorStudioPositionLayout,
  BehaviorStudioView,
  BehaviorWorkspaceMode,
  CrossItemActionStarter,
  DocumentBehaviorCanvasDensity,
  DocumentBehaviorClusterFamily,
  DocumentBehaviorClusterFocus,
  DocumentBehaviorExpandedTarget,
  DocumentBehaviorSurfaceMode,
  EventFlowPayloadValues,
  LegacyConditionalRule,
  LegacyRuleField,
  LegacyConditionalRuleGroup,
  LogicMapConditionalEntry,
  LogicMapListenerEntry,
  LogicMapStepEntry,
  MapViewMode,
  RuntimeActionChainTemplate,
  RuntimeEditorScope,
  RuntimeEventSourceCandidate,
  RuntimeListenerActionChoice,
  RuntimePayloadEditorState,
  RuntimePayloadEntry,
  RuntimePayloadFieldType,
  RuntimePayloadReferenceKey,
  RuntimePayloadReferenceOption,
  RuntimePayloadTemplate,
  RuntimePreset,
  RuntimeReactionBooleanValue,
  RuntimeReactionNavigationValue,
  RuntimeReactionTargetOption,
  RuntimeReactionValueMode,
  RuntimeSourceEventOption,
} from "./features/behavior";

type AppStage = "home" | "review" | "workspace";
type ReviewPreviewMode = "overlay" | "pdf";
type ReviewFlowMode = "new_project" | "resume_import";
type WorkspaceLandingMode = "promoted_import" | "reopened_import";
type BuilderFieldTypeOption = SemanticType | "action_button";
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

function createBlankAuthoringDocument(): AuthoringDocument {
  const document: AuthoringDocument = {
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
  ensureDocumentDispatchKeys(document);
  return document;
}

function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-+|-+$/g, "")
      .slice(0, 64) || "runtime-session"
  );
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

function summarizeAuthoringDocument(
  document: AuthoringDocument,
): StepSummary & { stepCount: number; sectionCount: number } {
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

function subtleButtonClass(active: boolean): string {
  return active
    ? "inline-flex h-8 items-center rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-medium text-blue-700"
    : "inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-950";
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

function fieldPreview(field: AuthoringField) {
  const isActionButton = field.rendererHints.component === "button";
  const requiredBadge = field.required ? (
    <span className="app-pill border-red-200 bg-rose-50 text-rose-700">Required</span>
  ) : null;

  if (isActionButton) {
    const behavior = getButtonBehaviorSummary(field);
    const isPrimary = behavior.action === "next_step" || behavior.action === "submit";
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-950">{field.label}</div>
          <span className="app-pill">{formatLabel(behavior.action)}</span>
        </div>
        <div
          className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold ${isPrimary ? "bg-[#2563eb] text-white" : "border border-soft bg-white text-slate-700"}`}
        >
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
            <div
              key={option.value}
              className="flex items-center gap-3 rounded-2xl border border-soft bg-white px-4 py-3"
            >
              <span
                className={`h-4 w-4 border border-slate-400 ${field.semanticType === "checkbox" ? "rounded-[0.35rem]" : "rounded-full"}`}
              />
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
      <div
        className={`rounded-2xl border px-4 py-3 text-sm ${field.required ? "border-rose-300 bg-rose-50/60 text-slate-700" : "border-soft bg-white text-slate-500"}`}
      >
        {field.helpText || "Response field"}
      </div>
    </div>
  );
}

function componentChromeLabel(field: AuthoringField): string {
  if (field.rendererHints.component === "button") {
    return "Button";
  }
  switch (field.semanticType) {
    case "checkbox":
      return "Checkbox group";
    case "radio":
      return "Radio group";
    case "select":
      return "Select input";
    case "statement":
      return "Statement";
    case "textarea":
      return "Textarea";
    default:
      return `${formatLabel(field.semanticType)} field`;
  }
}

function behaviorFieldComponentLabel(field: AuthoringField | null | undefined): string {
  return field ? componentChromeLabel(field) : "Field";
}

function runtimeNodeTypeForAuthoringField(field: AuthoringField | null | undefined): RuntimeNodeType {
  if (field?.rendererHints.component === "button" || field?.semanticType === "statement") {
    return "component";
  }
  return "field";
}

function fieldValueNoun(field: AuthoringField | null | undefined): string {
  switch (field?.semanticType) {
    case "checkbox":
      return "checkbox selections";
    case "radio":
      return "radio selection";
    case "select":
      return "selected option";
    case "textarea":
      return "text response";
    case "date":
      return "date value";
    case "number":
      return "number value";
    case "phone":
      return "phone value";
    case "email":
      return "email value";
    case "signature_attestation":
      return "signature attestation";
    default:
      return "field value";
  }
}

function fieldSelectionMode(field: AuthoringField | null | undefined): "multi" | "single" | null {
  if (field?.semanticType === "checkbox") {
    return "multi";
  }
  if (field?.semanticType === "radio" || field?.semanticType === "select") {
    return "single";
  }
  return null;
}

function fieldFirstOptionValue(field: AuthoringField | null | undefined): string {
  return field?.options[0]?.value ?? field?.options[0]?.label ?? "";
}

function defaultConditionOperatorForField(
  field: AuthoringField | null | undefined,
): RuntimeConditionDefinition["operator"] {
  return field?.semanticType === "checkbox" ? "contains" : "equals";
}

function defaultConditionExpectedValueForField(field: AuthoringField | null | undefined): string {
  return field?.semanticType === "checkbox" || field?.semanticType === "radio" || field?.semanticType === "select"
    ? fieldFirstOptionValue(field)
    : "";
}

function runtimeFieldChangedEventName(field: AuthoringField | null | undefined): string {
  switch (field?.semanticType) {
    case "checkbox":
      return "checkboxGroup.change";
    case "radio":
      return "radio.change";
    case "select":
      return "select.change";
    case "text":
    case "textarea":
      return "input.textChange";
    case "date":
      return "input.change";
    case "number":
      return "input.change";
    case "phone":
      return "input.change";
    case "email":
      return "input.change";
    case "signature_attestation":
      return "signature.change";
    case "repeatable_group":
      return "repeatableGroup.change";
    case "statement":
      return "state.change";
    default:
      return "field.change";
  }
}

function runtimeFieldEventNameSuggestions(field: AuthoringField | null | undefined): string[] {
  const base = sanitizeRuntimeIdentifier(field?.stableKey ?? field?.label, "field");
  const coreEvents = runtimeCoreEventsForDispatcher("field", field?.semanticType).map((eventType) => eventType.type);
  switch (field?.semanticType) {
    case "checkbox":
      return uniqueRuntimeEventTypes([
        "checkboxGroup.change",
        "checkbox.change",
        "checkbox.checked",
        "checkbox.unchecked",
        ...coreEvents,
        `${base}.checkbox.changed`,
      ]);
    case "radio":
      return uniqueRuntimeEventTypes([
        "radio.change",
        "radio.selected",
        "radio.cleared",
        ...coreEvents,
        `${base}.radio.changed`,
      ]);
    case "select":
      return uniqueRuntimeEventTypes([
        "select.change",
        "select.selected",
        "select.cleared",
        "select.opened",
        "select.closed",
        ...coreEvents,
        `${base}.selection.changed`,
      ]);
    case "text":
    case "textarea":
      return uniqueRuntimeEventTypes([
        "input.textChange",
        "field.input",
        "input.change",
        "input.before_input",
        "input.composition_start",
        "input.composition_update",
        "input.composition_end",
        ...coreEvents,
        `${base}.text.changed`,
        `${base}.changed`,
      ]);
    case "date":
      return uniqueRuntimeEventTypes(["input.change", ...coreEvents, `${base}.date.changed`, `${base}.changed`]);
    case "number":
      return uniqueRuntimeEventTypes(["input.change", ...coreEvents, `${base}.number.changed`, `${base}.changed`]);
    case "phone":
      return uniqueRuntimeEventTypes(["input.change", ...coreEvents, `${base}.phone.changed`, `${base}.changed`]);
    case "email":
      return uniqueRuntimeEventTypes(["input.change", ...coreEvents, `${base}.email.changed`, `${base}.changed`]);
    case "signature_attestation":
      return uniqueRuntimeEventTypes([
        "signature.change",
        "signature.attested",
        "signature.cleared",
        ...coreEvents,
        `${base}.signature.changed`,
        `${base}.changed`,
      ]);
    case "repeatable_group":
      return uniqueRuntimeEventTypes([
        "repeatableGroup.change",
        "repeatableGroup.item_added",
        "repeatableGroup.item_removed",
        "repeatableGroup.item_moved",
        ...coreEvents,
        `${base}.items.changed`,
      ]);
    case "statement":
      return uniqueRuntimeEventTypes([...coreEvents, `${base}.viewed`, `${base}.updated`]);
    default:
      return uniqueRuntimeEventTypes([...coreEvents, `${base}.changed`, `${base}.updated`, `${base}.validated`]);
  }
}

function uniqueRuntimeEventTypes(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  return values.filter((value): value is string => {
    if (!value || seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

function runtimeFieldTriggerSuggestions(field: AuthoringField | null | undefined): string[] {
  const eventNames = runtimeFieldEventNameSuggestions(field);
  const primaryEvent = eventNames[0] ?? runtimeFieldChangedEventName(field);
  const secondaryEvent = eventNames[1];
  switch (field?.semanticType) {
    case "checkbox":
      return uniqueRuntimeEventTypes([
        "checkboxGroup.change",
        "checkbox.change",
        primaryEvent,
        secondaryEvent,
        "field.change",
      ]);
    case "radio":
      return uniqueRuntimeEventTypes(["radio.change", "radio.selected", primaryEvent, secondaryEvent, "field.change"]);
    case "select":
      return uniqueRuntimeEventTypes([
        "select.change",
        "select.selected",
        primaryEvent,
        secondaryEvent,
        "field.change",
      ]);
    case "text":
    case "textarea":
      return uniqueRuntimeEventTypes([
        "input.textChange",
        "field.input",
        "input.change",
        "field.change",
        "field.focus",
        "field.blur",
      ]);
    case "signature_attestation":
      return uniqueRuntimeEventTypes(["signature.change", "signature.attested", "signature.cleared", "field.change"]);
    case "repeatable_group":
      return uniqueRuntimeEventTypes([
        "repeatableGroup.change",
        "repeatableGroup.item_added",
        "repeatableGroup.item_removed",
        "repeatableGroup.item_moved",
      ]);
    case "statement":
      return uniqueRuntimeEventTypes(["component.show", "component.hide", "state.change"]);
    case "date":
    case "number":
    case "phone":
    case "email":
      return uniqueRuntimeEventTypes(["field.change", "field.focus", "field.blur", primaryEvent]);
    default:
      return uniqueRuntimeEventTypes(["field.change", primaryEvent]);
  }
}

function runtimeNodeDefaultTriggerSuggestions(nodeType: RuntimeNodeType): string[] {
  switch (nodeType) {
    case "form":
      return ["form.load", "form.submit", "form.validation_failed", "form.reset"];
    case "step":
      return ["step.enter", "step.leave", "step.completed", "step.validation_failed"];
    case "section":
      return ["section.enter", "section.leave", "section.change"];
    case "group":
      return ["group.enter", "group.leave", "group.change"];
    case "component":
      return ["component.click", "button.click", "component.double_click", "component.key_down", "component.key_up"];
    case "field":
      return ["field.change", "field.input", "field.focus", "field.blur", "field.invalid"];
    default:
      return ["state.change"];
  }
}

function runtimeSourceEventOptionsForNode(
  nodeType: RuntimeNodeType,
  semanticType: SemanticType | null | undefined,
  eventSources: RuntimeEventDefinition[] | null | undefined,
  field?: AuthoringField | null,
): RuntimeSourceEventOption[] {
  const coreDefinitionsByType = new Map(runtimeCoreEventTypes.map((eventType) => [eventType.type, eventType]));
  const preferredEventTypes =
    nodeType === "field" && field
      ? runtimeFieldTriggerSuggestions(field)
      : runtimeNodeDefaultTriggerSuggestions(nodeType);
  const coreEventTypes = runtimeCoreEventsForDispatcher(nodeType, semanticType).map((eventType) => eventType.type);
  const options = new Map<string, RuntimeSourceEventOption>();
  const addType = (type: string, bubbles?: boolean | null) => {
    if (!type || options.has(type)) {
      return;
    }
    const core = coreDefinitionsByType.get(type);
    options.set(type, {
      type,
      label: core?.label ?? formatLabel(type),
      bubbles: bubbles ?? core?.bubbles ?? true,
      description: core?.description ?? null,
    });
  };

  [...preferredEventTypes, ...coreEventTypes].forEach((type) => addType(type));
  eventSources?.forEach((eventSource) => addType(eventSource.type ?? eventSource.name ?? "", eventSource.bubbles));
  return Array.from(options.values());
}

function collectRuntimeEventSourceCandidates(document: AuthoringDocument): RuntimeEventSourceCandidate[] {
  const candidates: RuntimeEventSourceCandidate[] = [];
  const pushCandidate = (candidate: RuntimeEventSourceCandidate) => {
    candidates.push(candidate);
  };

  pushCandidate({
    id: document.id,
    dispatchKey: document.dispatchKey,
    nodeType: "form",
    label: document.title,
    componentLabel: "Form",
    locationLabel: "Document",
    pathIds: [document.id],
    events: runtimeSourceEventOptionsForNode("form", null, document.runtime?.formEvents),
    eventDefinitions: document.runtime?.formEvents ?? [],
  });

  for (const step of document.steps) {
    const stepLocation = step.title;
    pushCandidate({
      id: step.id,
      dispatchKey: step.dispatchKey,
      nodeType: "step",
      label: step.title,
      componentLabel: "Step",
      locationLabel: stepLocation,
      pathIds: [document.id, step.id],
      events: runtimeSourceEventOptionsForNode("step", null, step.runtime?.eventSources),
      eventDefinitions: step.runtime?.eventSources ?? [],
    });

    for (const section of step.sections) {
      const sectionLocation = `${step.title} / ${section.title}`;
      pushCandidate({
        id: section.id,
        dispatchKey: section.dispatchKey,
        nodeType: "section",
        label: section.title,
        componentLabel: "Section",
        locationLabel: sectionLocation,
        pathIds: [document.id, step.id, section.id],
        events: runtimeSourceEventOptionsForNode("section", null, section.runtime?.eventSources),
        eventDefinitions: section.runtime?.eventSources ?? [],
      });

      for (const field of section.fields) {
        const nodeType = runtimeNodeTypeForAuthoringField(field);
        pushCandidate({
          id: field.id,
          dispatchKey: field.dispatchKey,
          nodeType,
          label: field.label,
          componentLabel: componentChromeLabel(field),
          locationLabel: sectionLocation,
          semanticType: field.semanticType,
          pathIds: [document.id, step.id, section.id, field.id],
          events: runtimeSourceEventOptionsForNode(nodeType, field.semanticType, field.runtime?.eventSources, field),
          eventDefinitions: field.runtime?.eventSources ?? [],
        });
      }

      for (const group of section.groups) {
        const groupLocation = `${sectionLocation} / ${group.label}`;
        pushCandidate({
          id: group.id,
          dispatchKey: group.dispatchKey,
          nodeType: "group",
          label: group.label,
          componentLabel: "Group",
          locationLabel: groupLocation,
          pathIds: [document.id, step.id, section.id, group.id],
          events: runtimeSourceEventOptionsForNode("group", null, group.runtime?.eventSources),
          eventDefinitions: group.runtime?.eventSources ?? [],
        });

        for (const field of group.fields) {
          const nodeType = runtimeNodeTypeForAuthoringField(field);
          pushCandidate({
            id: field.id,
            dispatchKey: field.dispatchKey,
            nodeType,
            label: field.label,
            componentLabel: componentChromeLabel(field),
            locationLabel: groupLocation,
            semanticType: field.semanticType,
            pathIds: [document.id, step.id, section.id, group.id, field.id],
            events: runtimeSourceEventOptionsForNode(nodeType, field.semanticType, field.runtime?.eventSources, field),
            eventDefinitions: field.runtime?.eventSources ?? [],
          });
        }
      }
    }
  }

  return candidates;
}

function authoringSelectionForRuntimeCandidate(candidate: RuntimeEventSourceCandidate): AuthoringSelection | null {
  if (candidate.nodeType === "form") {
    return null;
  }
  const [, stepId, sectionId, groupOrFieldId, nestedFieldId] = candidate.pathIds;
  if (candidate.nodeType === "step" && stepId) {
    return { kind: "step", stepId };
  }
  if (candidate.nodeType === "section" && stepId && sectionId) {
    return { kind: "section", stepId, sectionId };
  }
  if (candidate.nodeType === "group" && stepId && sectionId && groupOrFieldId) {
    return { kind: "group", stepId, sectionId, groupId: groupOrFieldId };
  }
  if ((candidate.nodeType === "field" || candidate.nodeType === "component") && stepId && sectionId) {
    return nestedFieldId
      ? { kind: "field", stepId, sectionId, groupId: groupOrFieldId, fieldId: nestedFieldId }
      : { kind: "field", stepId, sectionId, fieldId: groupOrFieldId };
  }
  return null;
}

function findNearestSharedDispatcher(
  source: RuntimeEventSourceCandidate,
  target: RuntimeEventSourceCandidate,
  candidatesById: Map<string, RuntimeEventSourceCandidate>,
): RuntimeEventSourceCandidate {
  const targetPath = new Set(target.pathIds);
  const sharedId = [...source.pathIds].reverse().find((pathId) => targetPath.has(pathId));
  return (sharedId ? candidatesById.get(sharedId) : null) ?? candidatesById.get(source.pathIds[0] ?? "") ?? target;
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
  const validationMessage = sessionState.validation.errors.find(
    (error) => error.fieldId === field.id || error.nodeId === field.id,
  )?.message;
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
  const requiredBadge = isRequired ? (
    <span className="app-pill border-red-200 bg-rose-50 text-rose-700">Required</span>
  ) : null;

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
            <label
              className={`flex items-center gap-3 rounded-2xl border border-soft bg-white px-4 py-3 text-sm ${!isEnabled ? "opacity-60" : ""}`}
            >
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
      fields: [...group.fields].sort(
        (left, right) => left.orderIndex - right.orderIndex || left.label.localeCompare(right.label),
      ),
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
  return focus.fieldIds.has(field.id) || field.evidence.some((anchor) => focus.anchorIds.has(anchor.anchorId));
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
      count + section.fields.length + section.groups.reduce((groupCount, group) => groupCount + group.fields.length, 0),
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
  return (
    hasSourceMatch(step.sourcePageIds, matches.pageIds) || hasSourceMatch(step.provenanceAnchorIds, matches.anchorIds)
  );
}

function authoringSectionDirectlyMatchesSourceState(
  section: AuthoringSection,
  matches: SourceReferenceMatchState,
): boolean {
  return (
    hasSourceMatch(section.sourceSectionIds, matches.sectionIds) ||
    hasSourceMatch(section.provenanceAnchorIds, matches.anchorIds)
  );
}

function authoringGroupDirectlyMatchesSourceState(group: AuthoringGroup, matches: SourceReferenceMatchState): boolean {
  return (
    hasSourceMatch(group.sourceGroupIds, matches.groupIds) ||
    hasSourceMatch(group.provenanceAnchorIds, matches.anchorIds)
  );
}

function authoringFieldDirectlyMatchesSourceState(field: AuthoringField, matches: SourceReferenceMatchState): boolean {
  return (
    hasSourceMatch(field.sourceFieldIds, matches.fieldIds) ||
    hasSourceMatch(field.provenanceAnchorIds, matches.anchorIds)
  );
}

function findDirectStepSelectionFromSourceState(
  document: AuthoringDocument,
  matches: SourceReferenceMatchState,
): AuthoringSelection | null {
  for (const step of document.steps) {
    if (authoringStepDirectlyMatchesSourceState(step, matches)) {
      return { kind: "step", stepId: step.id };
    }
  }
  return null;
}

function findDirectSectionSelectionFromSourceState(
  document: AuthoringDocument,
  matches: SourceReferenceMatchState,
): AuthoringSelection | null {
  for (const step of document.steps) {
    for (const section of step.sections) {
      if (authoringSectionDirectlyMatchesSourceState(section, matches)) {
        return { kind: "section", stepId: step.id, sectionId: section.id };
      }
    }
  }
  return null;
}

function findDirectGroupSelectionFromSourceState(
  document: AuthoringDocument,
  matches: SourceReferenceMatchState,
): AuthoringSelection | null {
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

function findDirectFieldSelectionFromSourceState(
  document: AuthoringDocument,
  matches: SourceReferenceMatchState,
): AuthoringSelection | null {
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
  const activeDropTargetRef = useRef<DropTarget | null>(null);
  const handledDropRef = useRef(false);
  const pointerDragRef = useRef<{
    active: boolean;
    payload: DragPayload;
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const simulatorSectionRef = useRef<HTMLDivElement | null>(null);
  const justCreatedListenerIdsRef = useRef<Set<string>>(new Set());
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
  const activeProjectDetailRef = useRef<AuthoringProjectDetail | null>(null);
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
  const [isBehaviorStudioCreating, setBehaviorStudioCreating] = useState(false);
  const [behaviorCreationPath, setBehaviorCreationPath] = useState<BehaviorStudioCreationPath>("choice");
  const [behaviorEventType, setBehaviorEventType] = useState("");
  const [behaviorEventBubbles, setBehaviorEventBubbles] = useState(true);
  const [behaviorEventDescription, setBehaviorEventDescription] = useState("");
  const [behaviorEventPayloadFields, setBehaviorEventPayloadFields] = useState<RuntimePayloadField[]>([]);
  const [behaviorEventMetadataExample, setBehaviorEventMetadataExample] = useState("{}");
  const [behaviorEventAdvancedOpen, setBehaviorEventAdvancedOpen] = useState(false);
  const [editingBehaviorEventId, setEditingBehaviorEventId] = useState<string | null>(null);
  const [pendingBehaviorEventEditId, setPendingBehaviorEventEditId] = useState<string | null>(null);
  const [behaviorListenerSourceType, setBehaviorListenerSourceType] = useState<BehaviorListenerSourceType>("field");
  const [selectedBehaviorListenerId, setSelectedBehaviorListenerId] = useState<string | null>(null);
  const [editingListenerId, setEditingListenerId] = useState<string | null>(null);
  const [behaviorListenerEventType, setBehaviorListenerEventType] = useState("");
  const [behaviorListenerSourceId, setBehaviorListenerSourceId] = useState("");
  const [behaviorListenerUseCapture, setBehaviorListenerUseCapture] = useState(false);
  const [behaviorListenerPriority, setBehaviorListenerPriority] = useState(0);
  const [behaviorListenerShowRawEvents, setBehaviorListenerShowRawEvents] = useState(false);
  const [behaviorPresetSearch, setBehaviorPresetSearch] = useState("");
  const [reactionTargetSearch, setReactionTargetSearch] = useState("");
  const [behaviorPresetCategory, setBehaviorPresetCategory] = useState<BehaviorPresetCategory>("recommended");
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
  const [expandedDocumentBehaviorTarget, setExpandedDocumentBehaviorTarget] =
    useState<DocumentBehaviorExpandedTarget>(null);
  const [documentBehaviorClusterFocus, setDocumentBehaviorClusterFocus] = useState<DocumentBehaviorClusterFocus>("all");
  const [documentBehaviorTrailFamilies, setDocumentBehaviorTrailFamilies] = useState<DocumentBehaviorClusterFamily[]>(
    [],
  );
  const [documentBehaviorCanvasDensity, setDocumentBehaviorCanvasDensity] =
    useState<DocumentBehaviorCanvasDensity>("comfortable");
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
  const [listenerTestValues, setListenerTestValues] = useState<Record<string, unknown>>({});
  const [eventFlowSourceId, setEventFlowSourceId] = useState("");
  const [eventFlowEventType, setEventFlowEventType] = useState("");
  const [eventFlowPayloadValues, setEventFlowPayloadValues] = useState<EventFlowPayloadValues>({});
  const [lastDispatchReport, setLastDispatchReport] = useState<RuntimeDispatchReport | null>(null);
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

  // Library system state
  const [projectLibrary, setProjectLibrary] = useState<BehaviorLibraryEntry[]>([]);
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
  const [libraryPageOpen, setLibraryPageOpen] = useState(false);
  const [pendingLibraryEntry, setPendingLibraryEntry] = useState<BehaviorLibraryEntry | null>(null);
  const [savingFromExistingListenerId, setSavingFromExistingListenerId] = useState<string | null>(null);
  const [saveToLibraryName, setSaveToLibraryName] = useState("");
  const [saveToLibraryDescription, setSaveToLibraryDescription] = useState("");
  const [saveToLibraryCategory, setSaveToLibraryCategory] = useState("custom");
  const [isSavingLibraryEntry, setIsSavingLibraryEntry] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const [records, projectRecords] = await Promise.all([listConversions(), listProjects()]);
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
      activeProjectDetailRef.current = null;
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
        const [detail, revisions] = await Promise.all([getProject(projectId), listProjectRevisions(projectId)]);
        if (cancelled) {
          return;
        }
        const nextDetail = {
          ...detail,
          document: cloneDocument(detail.document),
        };
        ensureDocumentDispatchKeys(nextDetail.document);
        activeProjectDetailRef.current = nextDetail;
        startTransition(() => {
          setActiveProjectDetail(nextDetail);
          setProjectRevisions(revisions);
          setOpenedRevisionView(null);
          setSelectedAuthoring(
            (current) =>
              current ??
              (nextDetail.document.steps[0] ? { kind: "step", stepId: nextDetail.document.steps[0].id } : null),
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

  // Fetch project library when a project is opened
  useEffect(() => {
    if (!activeProjectId) {
      setProjectLibrary([]);
      return;
    }
    listProjectLibrary(activeProjectId)
      .then(setProjectLibrary)
      .catch(() => setProjectLibrary([]));
  }, [activeProjectId]);

  const activeConversion =
    conversions.find((conversion) => conversion.id === activeConversionId) ?? conversions[0] ?? null;
  const matchedProjectForActiveConversion = activeConversion
    ? (projects.find((project) => project.sourceConversionId === activeConversion.id) ?? null)
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

  const activeReviewField = selectedFieldId
    ? (activeReviewFields.find((field) => field.id === selectedFieldId) ?? null)
    : null;
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

  useEffect(() => {
    activeProjectDetailRef.current = activeProjectDetail;
  }, [activeProjectDetail]);

  const activeDocument = activeProjectDetail?.document ?? null;
  const sourceContextDraft = activeProjectDetail?.sourceContext.importedDraft ?? null;
  const isJsonImportedProject = activeProjectDetail?.sourceContext.extractorPath[0] === "json_import";
  const isPdfBackedProject = Boolean(activeProjectDetail && sourceContextDraft?.pages.length && !isJsonImportedProject);
  const builderSelection = activeDocument ? getSelectionContext(activeDocument, selectedAuthoring) : null;
  const runtimeStepId = runtimeSessionState?.currentStepId ?? null;
  const runtimeActiveStep =
    activeDocument && runtimeStepId ? (activeDocument.steps.find((step) => step.id === runtimeStepId) ?? null) : null;
  const activeStep = runtimeActiveStep ?? builderSelection?.step ?? activeDocument?.steps[0] ?? null;
  const activeSection = builderSelection?.section ?? activeStep?.sections[0] ?? null;
  const activeGroup = builderSelection?.group ?? null;
  const activeBuilderField = builderSelection?.field ?? null;
  const activeStepSummary = activeStep ? summarizeAuthoringStep(activeStep) : null;
  const activeDocumentSummary = activeDocument ? summarizeAuthoringDocument(activeDocument) : null;
  const activeStepIndex =
    activeDocument && activeStep ? activeDocument.steps.findIndex((step) => step.id === activeStep.id) : -1;
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
  const sourceReferenceVisiblePages =
    sourceContextDraft?.pages.filter((page) =>
      sourceReferenceFilterMode === "all" || !sourceReferenceFocusHasMatches
        ? true
        : sourcePageMatchesFocus(page, sourceReferenceFocus),
    ) ?? [];
  const importedSourcePageCount = sourceContextDraft?.pages.length ?? 0;
  const importedSourceSectionCount =
    sourceContextDraft?.pages.reduce((count, page) => count + page.sections.length, 0) ?? 0;
  const importedSourceFieldCount =
    sourceContextDraft?.pages.reduce(
      (count, page) =>
        count +
        page.sections.reduce(
          (sectionCount, section) =>
            sectionCount +
            section.fields.length +
            section.groups.reduce((groupCount, group) => groupCount + group.fields.length, 0),
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
        ...section.fields.map((field) => ({
          id: field.id,
          label: field.label,
          optionLabel: formatNodeOptionLabel(componentChromeLabel(field), field.label, field.dispatchKey),
          dispatchKey: field.dispatchKey ?? null,
          semanticType: field.semanticType,
          stepId: step.id,
        })),
        ...section.groups.flatMap((group) =>
          group.fields.map((field) => ({
            id: field.id,
            label: field.label,
            optionLabel: formatNodeOptionLabel(componentChromeLabel(field), field.label, field.dispatchKey),
            dispatchKey: field.dispatchKey ?? null,
            semanticType: field.semanticType,
            stepId: step.id,
          })),
        ),
      ]),
    );
  }, [activeDocument]);
  const builderStepOptions = useMemo(
    () =>
      activeDocument?.steps.map((step) => ({
        id: step.id,
        label: step.title,
        optionLabel: formatNodeOptionLabel("Step", step.title, step.dispatchKey),
        dispatchKey: step.dispatchKey ?? null,
      })) ?? [],
    [activeDocument],
  );
  const builderNodeOptions = useMemo(() => {
    if (!activeDocument) {
      return [];
    }
    return activeDocument.steps.flatMap((step) => [
      {
        id: step.id,
        label: `Step · ${step.title}`,
        optionLabel: formatNodeOptionLabel("Step", step.title, step.dispatchKey),
        dispatchKey: step.dispatchKey ?? null,
      },
      ...step.sections.flatMap((section) => [
        {
          id: section.id,
          label: `Section · ${section.title}`,
          optionLabel: formatNodeOptionLabel("Section", section.title, section.dispatchKey),
          dispatchKey: section.dispatchKey ?? null,
        },
        ...section.groups.map((group) => ({
          id: group.id,
          label: `Group · ${group.label}`,
          optionLabel: formatNodeOptionLabel("Group", group.label, group.dispatchKey),
          dispatchKey: group.dispatchKey ?? null,
        })),
        ...section.fields.map((field) => ({
          id: field.id,
          label: `${runtimeNodeTypeLabel(runtimeNodeTypeForAuthoringField(field))} · ${field.label}`,
          optionLabel: formatNodeOptionLabel(componentChromeLabel(field), field.label, field.dispatchKey),
          dispatchKey: field.dispatchKey ?? null,
        })),
        ...section.groups.flatMap((group) =>
          group.fields.map((field) => ({
            id: field.id,
            label: `${runtimeNodeTypeLabel(runtimeNodeTypeForAuthoringField(field))} · ${field.label}`,
            optionLabel: formatNodeOptionLabel(componentChromeLabel(field), field.label, field.dispatchKey),
            dispatchKey: field.dispatchKey ?? null,
          })),
        ),
      ]),
    ]);
  }, [activeDocument]);
  const runtimeEventSourceCandidates = useMemo(
    () => (activeDocument ? collectRuntimeEventSourceCandidates(activeDocument) : []),
    [activeDocument],
  );
  const runtimeEventSourceCandidateById = useMemo(
    () => new Map(runtimeEventSourceCandidates.map((candidate) => [candidate.id, candidate])),
    [runtimeEventSourceCandidates],
  );
  const activeRuntimeTarget = useMemo(() => {
    if (!activeDocument) {
      return null;
    }
    if (!selectedAuthoring) {
      return runtimeEventSourceCandidateById.get(activeDocument.id) ?? null;
    }
    const nodeId =
      selectedAuthoring.kind === "step"
        ? selectedAuthoring.stepId
        : selectedAuthoring.kind === "section"
          ? selectedAuthoring.sectionId
          : selectedAuthoring.kind === "group"
            ? selectedAuthoring.groupId
            : selectedAuthoring.fieldId;
    return runtimeEventSourceCandidateById.get(nodeId) ?? null;
  }, [activeDocument, runtimeEventSourceCandidateById, selectedAuthoring]);
  const runtimeNodeLabelById = useMemo(() => {
    const labels = new Map<string, string>();
    if (!activeDocument) {
      return labels;
    }
    labels.set(activeDocument.id, formatNodeOptionLabel("Form", activeDocument.title, activeDocument.dispatchKey));
    builderStepOptions.forEach((option) => {
      labels.set(option.id, option.optionLabel);
    });
    builderNodeOptions.forEach((option) => {
      labels.set(option.id, option.optionLabel);
    });
    builderFieldOptions.forEach((option) => {
      labels.set(option.id, option.optionLabel);
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
        case "dispatch_event":
          return `Dispatch ${getRuntimeActionEventType(action)}`;
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
    const describeRuleOperator = (rule: LegacyConditionalRule) => {
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
    const describeRuleEffect = (rule: LegacyConditionalRule) => {
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
          total +
          section.fields.length +
          section.groups.reduce((groupTotal, group) => groupTotal + group.fields.length, 0),
        0,
      );
    const collectActionTargetIds = (actions: RuntimeActionDefinition[]) => {
      const ids = new Set<string>();
      actions.forEach((action) => {
        [action.target?.nodeId, action.config.nodeId, action.config.fieldId, action.config.stepId].forEach(
          (candidate) => {
            if (typeof candidate === "string" && candidate) {
              ids.add(candidate);
            }
          },
        );
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
      const conditionalBehavior: LogicMapConditionalEntry[] = [];
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
          mutableLegacyFieldConditionals(field).forEach((rule, ruleIndex) => {
            conditionalBehavior.push({
              id: rule.ruleId,
              title: `${field.label} reacts to ${fieldLabelById.get(rule.whenFieldId) ?? "another field"}`,
              detail: `When ${fieldLabelById.get(rule.whenFieldId) ?? "that field"} ${describeRuleOperator(rule)}, ${describeRuleEffect(rule)} ${field.label}.`,
              scopeLabel: `${runtimeNodeTypeLabel(runtimeNodeTypeForAuthoringField(field))} · ${field.label}`,
              sourceFieldLabel: fieldLabelById.get(rule.whenFieldId) ?? "another field",
              sourceFieldId: rule.whenFieldId,
              targetFieldLabel: field.label,
              targetFieldId: field.id,
              effectLabel: describeRuleEffect(rule),
              enabled: isLegacyConditionalRuleEnabled(rule),
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
                scopeLabel: `${runtimeNodeTypeLabel(runtimeNodeTypeForAuthoringField(field))} · ${field.label}`,
                eventName: listener.eventName,
                actionsSummary: summarizeListenerActions(listener.actions),
                actionKinds: listener.actions.map((action) => action.kind),
                enabled: listener.enabled,
                sourceNodeId: listener.sourceNodeId ?? field.id,
                targetNodeIds: collectActionTargetIds(listener.actions),
                actionCount: listener.actions.length,
                stepId: step.id,
                selection: {
                  kind: "field",
                  stepId: step.id,
                  sectionId: section.id,
                  fieldId: field.id,
                } as AuthoringSelection,
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
                selection: {
                  kind: "group",
                  stepId: step.id,
                  sectionId: section.id,
                  groupId: group.id,
                } as AuthoringSelection,
                graphSelection: createListenerGraphSelection(listener),
              })),
            );
          }
          group.fields.forEach((field) => {
            mutableLegacyFieldConditionals(field).forEach((rule, ruleIndex) => {
              conditionalBehavior.push({
                id: rule.ruleId,
                title: `${field.label} reacts to ${fieldLabelById.get(rule.whenFieldId) ?? "another field"}`,
                detail: `When ${fieldLabelById.get(rule.whenFieldId) ?? "that field"} ${describeRuleOperator(rule)}, ${describeRuleEffect(rule)} ${field.label}.`,
                scopeLabel: `${runtimeNodeTypeLabel(runtimeNodeTypeForAuthoringField(field))} · ${field.label}`,
                sourceFieldLabel: fieldLabelById.get(rule.whenFieldId) ?? "another field",
                sourceFieldId: rule.whenFieldId,
                targetFieldLabel: field.label,
                targetFieldId: field.id,
                effectLabel: describeRuleEffect(rule),
                enabled: isLegacyConditionalRuleEnabled(rule),
                stepId: step.id,
                sectionId: section.id,
                sourceSelection: {
                  kind: "field",
                  stepId: step.id,
                  sectionId: section.id,
                  groupId: group.id,
                  fieldId: field.id,
                },
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
                  scopeLabel: `${runtimeNodeTypeLabel(runtimeNodeTypeForAuthoringField(field))} · ${field.label}`,
                  eventName: listener.eventName,
                  actionsSummary: summarizeListenerActions(listener.actions),
                  actionKinds: listener.actions.map((action) => action.kind),
                  enabled: listener.enabled,
                  sourceNodeId: listener.sourceNodeId ?? field.id,
                  targetNodeIds: collectActionTargetIds(listener.actions),
                  actionCount: listener.actions.length,
                  stepId: step.id,
                  selection: {
                    kind: "field",
                    stepId: step.id,
                    sectionId: section.id,
                    groupId: group.id,
                    fieldId: field.id,
                  } as AuthoringSelection,
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
        conditionalBehavior,
        runtimeListeners,
      };
    });

    return {
      totalConditionals: steps.reduce((total, step) => total + step.conditionalBehavior.length, 0),
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
      const scopeKind = runtimeNodeTypeForAuthoringField(activeBuilderField);
      return {
        scopeKind,
        label: activeBuilderField.label,
        description:
          scopeKind === "component"
            ? "Components and buttons are event sources. Use behavior starters to wire click behavior without dropping into raw JSON."
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
  const scopeListeners: RuntimeListenerDefinition[] = useMemo(
    () => activeRuntimeScope?.listeners ?? activeDocument?.runtime?.formListeners ?? [],
    [activeRuntimeScope, activeDocument],
  );
  const activeSelectionNodeId: string | null = useMemo(() => {
    if (!selectedAuthoring) return null;
    if (selectedAuthoring.kind === "field") return selectedAuthoring.fieldId;
    if (selectedAuthoring.kind === "group") return selectedAuthoring.groupId;
    if (selectedAuthoring.kind === "section") return selectedAuthoring.sectionId;
    if (selectedAuthoring.kind === "step") return selectedAuthoring.stepId;
    return null;
  }, [selectedAuthoring]);
  const externalReferenceCount = useMemo(() => {
    if (!activeDocument || !activeSelectionNodeId) return 0;
    return countListenersReferencingNode(activeDocument, activeSelectionNodeId);
  }, [activeDocument, activeSelectionNodeId]);
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
    if (!pendingBehaviorEventEditId || !activeRuntimeScope) {
      return;
    }
    const eventDefinition = activeRuntimeScope.eventSources.find(
      (candidate) => candidate.id === pendingBehaviorEventEditId,
    );
    if (!eventDefinition) {
      return;
    }
    beginBehaviorEventCreationPath(eventDefinition);
    setPendingBehaviorEventEditId(null);
  }, [activeRuntimeScope, pendingBehaviorEventEditId]);

  useEffect(() => {
    if (!activeRuntimeTarget) {
      if (eventFlowSourceId) {
        setEventFlowSourceId("");
      }
      return;
    }
    if (!eventFlowSourceId || !runtimeEventSourceCandidateById.has(eventFlowSourceId)) {
      setEventFlowSourceId(activeRuntimeTarget.id);
    }
  }, [activeRuntimeTarget, eventFlowSourceId, runtimeEventSourceCandidateById]);

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

  function applyRuntimePayloadEntries(listenerId: string, actionId: string, entries: RuntimePayloadEntry[]) {
    const payload = runtimePayloadFromEntries(entries);
    updateRuntimeAction(listenerId, actionId, (current) => {
      current.config.payload = payload;
    });
    syncRuntimePayloadEditor(actionId, payload);
  }

  function applyRuntimePayloadTemplate(listenerId: string, actionId: string, template: RuntimePayloadTemplate) {
    applyRuntimePayloadEntries(listenerId, actionId, template.entries);
  }

  function runtimePayloadTemplatesForAction(
    action: RuntimeActionDefinition,
    listener: RuntimeListenerDefinition,
  ): RuntimePayloadTemplate[] {
    if (action.kind === "dispatch_event") {
      const templates: RuntimePayloadTemplate[] = [];
      const listenerType = getRuntimeListenerEventType(listener);
      if (listenerType === "field.change" || activeRuntimeScope?.scopeKind === "field") {
        const componentLabel = behaviorFieldComponentLabel(activeBuilderField);
        const valueNoun = fieldValueNoun(activeBuilderField);
        templates.push({
          id: "field-changed",
          label: `${componentLabel} changed`,
          description: `Send live ${valueNoun}, step, and project context for this ${componentLabel.toLowerCase()}.`,
          entries: createFieldChangedPayloadEntries(activeBuilderField),
        });
      }
      if (listenerType === "form.submit") {
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
      if (listenerType === "form.validation_failed") {
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
        const componentLabel = behaviorFieldComponentLabel(activeBuilderField);
        const valueNoun = fieldValueNoun(activeBuilderField);
        templates.push({
          id: "host-lookup",
          label: activeBuilderField?.semanticType === "checkbox" ? "Checkbox selection sync" : "Host lookup",
          description: `Start a field-level host request with live ${valueNoun}, step, and project context for this ${componentLabel.toLowerCase()}.`,
          entries: createHostLookupPayloadEntries(activeBuilderField),
        });
      }
      if (
        handlerKey.includes("prefill") ||
        activeRuntimeScope?.scopeKind === "form" ||
        activeRuntimeScope?.scopeKind === "field"
      ) {
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
      if (handlerKey.includes("submit") || getRuntimeListenerEventType(listener) === "form.submit") {
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
      if (legacyFieldConditionals(activeBuilderField).some((rule) => rule.ruleId === selectedBehaviorNode.ruleId)) {
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
      behaviorStudioDialogRef.current?.focus({ preventScroll: true });
      return;
    }
    behaviorStudioReturnFocusRef.current?.focus({ preventScroll: true });
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
        setFlashMessage(
          "Preview runtime dispatched a submit event. Use the simulator success or error controls to complete the host loop.",
        );
        setErrorMessage(null);
      } else if (event.type === "form.validation_failed") {
        setErrorMessage("Complete the required fields in this runtime preview before submitting.");
      } else if (event.type === "form.submit_success") {
        setFlashMessage(
          typeof event.payload.message === "string" ? event.payload.message : "Preview submit succeeded.",
        );
        setErrorMessage(null);
      } else if (event.type === "form.submit_error") {
        setErrorMessage(typeof event.payload.message === "string" ? event.payload.message : "Preview submit failed.");
      }
    });

    const initialSelectionStepId =
      selectedAuthoring?.stepId && activeDocument.steps.some((step) => step.id === selectedAuthoring.stepId)
        ? selectedAuthoring.stepId
        : (activeDocument.steps[0]?.id ?? null);

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

  function copyDispatchKey(dispatchKey: string | null | undefined) {
    if (!dispatchKey) {
      return;
    }
    if (!navigator.clipboard) {
      setMessage(`Dispatch key: ${dispatchKey}`);
      return;
    }
    void navigator.clipboard
      .writeText(dispatchKey)
      .then(() => setMessage(`Copied dispatch key ${dispatchKey}.`))
      .catch(() => setMessage(`Dispatch key: ${dispatchKey}`));
  }

  function renderDispatchKeyBadge(dispatchKey: string | null | undefined, label = "ID") {
    return dispatchKey ? (
      <button
        type="button"
        title={`Copy behavior ID: ${dispatchKey}`}
        aria-label={`Copy behavior ID ${dispatchKey}`}
        onClick={(event) => {
          event.stopPropagation();
          copyDispatchKey(dispatchKey);
        }}
        className="app-pill min-w-0 max-w-[min(18rem,100%)] cursor-copy text-left font-mono"
      >
        <span className="shrink-0">{label}</span>
        <span className="min-w-0 truncate">{dispatchKey}</span>
      </button>
    ) : null;
  }

  function runtimeScopeIdentifierBase(scope: RuntimeEditorScope | null, field: AuthoringField | null): string {
    if (field?.stableKey) {
      return sanitizeRuntimeIdentifier(field.stableKey, "field");
    }
    return sanitizeRuntimeIdentifier(scope?.label ?? scope?.scopeKind ?? "runtime", "runtime");
  }

  function runtimeTriggerSuggestions(scope: RuntimeEditorScope | null, field: AuthoringField | null): string[] {
    const base = runtimeScopeIdentifierBase(scope, field);
    const coreEvents = scope
      ? runtimeCoreEventsForDispatcher(scope.scopeKind, field?.semanticType).map((eventType) => eventType.type)
      : [];
    switch (scope?.scopeKind) {
      case "component":
        return uniqueRuntimeEventTypes([
          "component.click",
          "button.click",
          "component.double_click",
          "component.pointer_down",
          "component.pointer_up",
          "component.key_down",
          "component.key_up",
          ...coreEvents,
          `${base}.requested`,
        ]);
      case "field":
        return runtimeFieldTriggerSuggestions(field);
      case "form":
        return uniqueRuntimeEventTypes(["form.load", "form.submit", "form.validation_failed", ...coreEvents]);
      case "step":
        return uniqueRuntimeEventTypes([
          "step.enter",
          "step.leave",
          "step.completed",
          "step.validation_failed",
          ...coreEvents,
          `${base}.opened`,
        ]);
      case "section":
        return uniqueRuntimeEventTypes([
          "section.enter",
          "section.leave",
          "section.change",
          ...coreEvents,
          `${base}.updated`,
        ]);
      case "group":
        return uniqueRuntimeEventTypes([
          "group.enter",
          "group.leave",
          "group.change",
          ...coreEvents,
          `${base}.changed`,
          `${base}.updated`,
        ]);
      default:
        return ["form.load"];
    }
  }

  function runtimeEventOptionsForScope(
    scope: RuntimeEditorScope,
    field: AuthoringField | null,
  ): RuntimeSourceEventOption[] {
    const coreEvents = runtimeCoreEventsForDispatcher(scope.scopeKind, field?.semanticType);
    const coreEventsByType = new Map(coreEvents.map((eventType) => [eventType.type, eventType]));
    return uniqueRuntimeEventTypes([
      ...runtimeTriggerSuggestions(scope, field),
      ...coreEvents.map((eventType) => eventType.type),
    ])
      .map((eventType) => {
        const coreEvent = coreEventsByType.get(eventType);
        return {
          type: eventType,
          label: coreEvent?.label ?? formatLabel(eventType),
          bubbles: coreEvent?.bubbles ?? true,
          description: coreEvent?.description ?? null,
        };
      })
      .filter((eventOption) => coreEventsByType.has(eventOption.type));
  }

  function defaultRuntimeEventOptionForNewDefinition(
    scope: RuntimeEditorScope,
    field: AuthoringField | null,
  ): RuntimeSourceEventOption | null {
    const eventOptions = runtimeEventOptionsForScope(scope, field);
    const savedTypes = new Set(scope.eventSources.map(runtimeEventDefinitionType));
    return eventOptions.find((option) => !savedTypes.has(option.type)) ?? eventOptions[0] ?? null;
  }

  function runtimeEventNameSuggestions(
    scope: RuntimeEditorScope | null,
    field: AuthoringField | null,
    listener?: RuntimeListenerDefinition | null,
  ): string[] {
    const base = runtimeScopeIdentifierBase(scope, field);
    const listenerType = listener ? getRuntimeListenerEventType(listener) : null;
    if (listenerType === "form.load") {
      return ["form.loaded", "form.ready"];
    }
    if (listenerType === "form.submit") {
      return ["form.submit.dispatched", "form.submit.requested"];
    }
    if (listenerType === "form.validation_failed") {
      return ["form.validation_failed", "form.submit.blocked"];
    }
    switch (scope?.scopeKind) {
      case "component":
        return [`${base}.clicked`, `${base}.requested`, "form.submit.requested"];
      case "field":
        return runtimeFieldEventNameSuggestions(field);
      case "step":
        return [`${base}.entered`, `${base}.completed`, `${base}.updated`];
      case "section":
        return [`${base}.section.updated`, `${base}.section.entered`, `${base}.section.completed`];
      case "group":
        return [`${base}.group.changed`, `${base}.group.updated`, `${base}.group.completed`];
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
    const listenerType = listener ? getRuntimeListenerEventType(listener) : null;
    if (listenerType === "form.submit") {
      return ["host.submit", "host.audit", "host.analytics"];
    }
    switch (scope?.scopeKind) {
      case "component":
        return ["host.submit", "host.navigate", "host.audit"];
      case "field":
        if (field?.semanticType === "checkbox") {
          return [`host.${base}.checkbox.sync`, "host.checkbox.sync", "host.selection.sync", "host.lookup"];
        }
        if (field?.semanticType === "radio" || field?.semanticType === "select") {
          return [`host.${base}.selection.sync`, "host.selection.sync", "host.lookup", "host.prefill"];
        }
        return [`host.${base}.lookup`, "host.lookup", "host.prefill"];
      case "form":
        return ["host.prefill", "host.audit", "host.analytics"];
      default:
        return ["host.audit", "host.sync", "host.workflow"];
    }
  }

  function defaultConditionalSourceFieldId(): string {
    const candidates = builderFieldOptions.filter((option) => option.id !== activeBuilderField?.id);
    const interactiveCandidates = candidates.filter((option) => option.semanticType !== "statement");
    const selectedStepId =
      selectedAuthoring?.kind === "field"
        ? selectedAuthoring.stepId
        : selectedAuthoring?.kind === "step"
          ? selectedAuthoring.stepId
          : null;
    return (
      interactiveCandidates.find((option) => option.stepId === selectedStepId)?.id ??
      interactiveCandidates[0]?.id ??
      candidates[0]?.id ??
      builderFieldOptions[0]?.id ??
      ""
    );
  }

  function defaultActionTargetFieldId(): string {
    const candidates = builderFieldOptions.filter((option) => option.id !== activeBuilderField?.id);
    const interactiveCandidates = candidates.filter((option) => option.semanticType !== "statement");
    const selectedStepId =
      selectedAuthoring?.kind === "field"
        ? selectedAuthoring.stepId
        : selectedAuthoring?.kind === "step"
          ? selectedAuthoring.stepId
          : null;
    return (
      interactiveCandidates.find((option) => option.stepId === selectedStepId)?.id ??
      interactiveCandidates[0]?.id ??
      activeBuilderField?.id ??
      candidates[0]?.id ??
      builderFieldOptions[0]?.id ??
      ""
    );
  }

  function defaultConditionalSourceField(): AuthoringField | null {
    const sourceFieldId = defaultConditionalSourceFieldId();
    return activeDocument && sourceFieldId ? findAuthoringFieldById(activeDocument, sourceFieldId) : null;
  }

  function defaultRuntimeActionConfigForScope(
    kind: RuntimeActionKind,
    options?: {
      scope?: RuntimeEditorScope | null;
      field?: AuthoringField | null;
      listener?: RuntimeListenerDefinition | null;
    },
  ): Record<string, unknown> {
    const scope = options?.scope ?? activeRuntimeScope;
    const field = options?.field ?? activeBuilderField;
    const listener = options?.listener ?? null;
    switch (kind) {
      case "dispatch_event":
        return {
          eventType: runtimeEventNameSuggestions(scope, field, listener)[0] ?? "custom.event",
          bubbles: true,
          payload: {},
        };
      case "host_action":
        return { handlerKey: runtimeHostHandlerSuggestions(scope, field, listener)[0] ?? "host.action", payload: {} };
      case "go_to_step":
        return { stepId: builderStepOptions[0]?.id ?? "" };
      case "set_field_value":
        return { fieldId: defaultActionTargetFieldId(), value: "" };
      case "clear_field_value":
        return { fieldId: defaultActionTargetFieldId() };
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

  function eventPayloadReferenceKey(path: string): RuntimePayloadReferenceKey {
    return `current.event.payload.${sanitizeRuntimeIdentifier(path, "value")}`;
  }

  function listenerSourcePayloadFields(listener: RuntimeListenerDefinition): RuntimePayloadField[] {
    const eventType = getRuntimeListenerEventType(listener);
    const source = listener.eventSourceNodeId ? runtimeEventSourceCandidateById.get(listener.eventSourceNodeId) : null;
    const authoredShape = source?.eventDefinitions.find(
      (eventDefinition) => runtimeEventDefinitionType(eventDefinition) === eventType,
    )?.payloadShape;
    if (authoredShape?.fields?.length) {
      return authoredShape.fields.map((field) => ({ ...field }));
    }
    return runtimePayloadFieldsForEventType(eventType);
  }

  function firstListenerPayloadReference(
    listener: RuntimeListenerDefinition,
    preferredNames: string[],
  ): RuntimePayloadReferenceKey | null {
    const payloadFields = listenerSourcePayloadFields(listener);
    const preferredField = preferredNames
      .map((name) => payloadFields.find((field) => field.name === name))
      .find((field): field is RuntimePayloadField => Boolean(field));
    const fallbackField = payloadFields.find(
      (field) => !["fieldId", "fieldKey", "fieldLabel", "componentId", "label"].includes(field.name),
    );
    const payloadField = preferredField ?? fallbackField;
    return payloadField ? eventPayloadReferenceKey(payloadField.name) : null;
  }

  function listenerTargetCandidate(listener: RuntimeListenerDefinition): RuntimeEventSourceCandidate | null {
    return (
      (listener.targetNodeId ? (runtimeEventSourceCandidateById.get(listener.targetNodeId) ?? null) : null) ??
      activeRuntimeTarget
    );
  }

  function createTargetedRuntimeAction(
    kind: RuntimeActionKind,
    listener: RuntimeListenerDefinition,
    config: Record<string, unknown> = {},
  ): RuntimeActionDefinition {
    const target = listenerTargetCandidate(listener);
    const baseConfig = defaultRuntimeActionConfigForScope(kind, { listener });
    const nextAction = createRuntimeAction(kind, { ...baseConfig, ...config });
    if (target) {
      nextAction.target = { nodeId: target.id, nodeType: target.nodeType };
      if (
        kind === "show_node" ||
        kind === "hide_node" ||
        kind === "enable_node" ||
        kind === "disable_node" ||
        kind === "mark_required" ||
        kind === "mark_optional"
      ) {
        nextAction.config.nodeId = target.id;
      }
      if ((kind === "set_field_value" || kind === "clear_field_value") && target.nodeType === "field") {
        nextAction.config.fieldId = target.id;
      }
      if (kind === "go_to_step") {
        nextAction.config.stepId = target.pathIds[1] ?? builderStepOptions[0]?.id ?? "";
      }
    }
    return nextAction;
  }

  function createRuntimeReactionAction(
    kind: RuntimeActionKind,
    target: RuntimeEventSourceCandidate,
    config: Record<string, unknown> = {},
  ): RuntimeActionDefinition {
    const nextAction = createRuntimeAction(kind, config);
    nextAction.target = { nodeId: target.id, nodeType: target.nodeType };
    if (
      kind === "show_node" ||
      kind === "hide_node" ||
      kind === "enable_node" ||
      kind === "disable_node" ||
      kind === "mark_required" ||
      kind === "mark_optional"
    ) {
      nextAction.config.nodeId = target.id;
    }
    if ((kind === "set_field_value" || kind === "clear_field_value") && target.nodeType === "field") {
      nextAction.config.fieldId = target.id;
    }
    if (kind === "go_to_step") {
      nextAction.config.stepId =
        typeof config.stepId === "string" ? config.stepId : (target.pathIds[1] ?? builderStepOptions[0]?.id ?? "");
    }
    return nextAction;
  }

  function runtimeNodeTypeIsContainer(nodeType: RuntimeNodeType): boolean {
    return nodeType === "form" || nodeType === "step" || nodeType === "section" || nodeType === "group";
  }

  function runtimeReactionRelationshipLabel(candidate: RuntimeEventSourceCandidate): string {
    if (activeRuntimeTarget?.id === candidate.id) {
      return "Current item";
    }
    if (activeRuntimeTarget?.pathIds.includes(candidate.id)) {
      if (candidate.nodeType === "form") {
        return "Parent form";
      }
      if (runtimeNodeTypeIsContainer(candidate.nodeType)) {
        return `Parent ${runtimeNodeTypeLabel(candidate.nodeType).toLowerCase()}`;
      }
      return `Parent ${runtimeNodeTypeLabel(candidate.nodeType).toLowerCase()}`;
    }
    return "Other node";
  }

  function runtimeReactionTargetOptions(
    listener: RuntimeListenerDefinition,
    target: RuntimeEventSourceCandidate | null,
  ): RuntimeReactionTargetOption[] {
    const pathIds = activeRuntimeTarget?.pathIds ?? target?.pathIds ?? [];
    const options = new Map<string, RuntimeReactionTargetOption>();
    pathIds
      .map((id) => runtimeEventSourceCandidateById.get(id))
      .filter((candidate): candidate is RuntimeEventSourceCandidate => Boolean(candidate))
      .forEach((candidate) => {
        options.set(candidate.id, {
          candidate,
          relationshipLabel: runtimeReactionRelationshipLabel(candidate),
          group: "path",
        });
      });

    if (target && !options.has(target.id)) {
      options.set(target.id, {
        candidate: target,
        relationshipLabel: "Selected target",
        group: "path",
      });
    }

    const normalizedSearch = reactionTargetSearch.trim().toLowerCase();
    runtimeEventSourceCandidates
      .filter((candidate) => {
        if (options.has(candidate.id)) {
          return false;
        }
        if (!normalizedSearch) {
          return true;
        }
        return `${candidate.componentLabel} ${candidate.label} ${candidate.locationLabel} ${candidate.dispatchKey ?? ""}`
          .toLowerCase()
          .includes(normalizedSearch);
      })
      .slice(0, normalizedSearch ? 24 : 10)
      .forEach((candidate) => {
        options.set(candidate.id, {
          candidate,
          relationshipLabel: "Search result",
          group: "all",
        });
      });

    if (listener.targetNodeId && !options.has(listener.targetNodeId)) {
      const fallbackTarget = runtimeEventSourceCandidateById.get(listener.targetNodeId);
      if (fallbackTarget) {
        options.set(fallbackTarget.id, {
          candidate: fallbackTarget,
          relationshipLabel: "Selected target",
          group: "path",
        });
      }
    }

    return Array.from(options.values());
  }

  function updateRuntimeReactionTarget(listenerId: string, targetId: string) {
    const target = runtimeEventSourceCandidateById.get(targetId);
    if (!target) {
      return;
    }
    updateRuntimeListener(listenerId, (listener) => {
      listener.targetNodeId = target.id;
      listener.targetNodeType = target.nodeType;
    });
    setMessage(`Listener reaction target set to ${target.label}.`);
  }

  function booleanReactionActions(
    listener: RuntimeListenerDefinition,
    targetId: string,
    trueKind: RuntimeActionKind,
    falseKind: RuntimeActionKind,
  ): RuntimeActionDefinition[] {
    return listener.actions.filter(
      (action) =>
        (action.kind === trueKind || action.kind === falseKind) && runtimeNodeActionTargetId(action) === targetId,
    );
  }

  function booleanReactionValue(
    listener: RuntimeListenerDefinition,
    targetId: string,
    trueKind: RuntimeActionKind,
    falseKind: RuntimeActionKind,
  ): RuntimeReactionBooleanValue | "conflict" {
    const matches = booleanReactionActions(listener, targetId, trueKind, falseKind);
    if (!matches.length) {
      return "unset";
    }
    if (matches.length > 1) {
      return "conflict";
    }
    return matches[0]?.kind === trueKind ? "true" : "false";
  }

  function setRuntimeBooleanReactionProperty(
    listenerId: string,
    target: RuntimeEventSourceCandidate,
    trueKind: RuntimeActionKind,
    falseKind: RuntimeActionKind,
    value: RuntimeReactionBooleanValue,
    label: string,
  ) {
    let nextActionId: string | null = null;
    let removedActionIds: string[] = [];
    updateRuntimeListener(listenerId, (listener) => {
      removedActionIds = booleanReactionActions(listener, target.id, trueKind, falseKind).map((action) => action.id);
      listener.actions = listener.actions.filter((action) => !removedActionIds.includes(action.id));
      if (value === "unset") {
        return;
      }
      const nextAction = createRuntimeReactionAction(value === "true" ? trueKind : falseKind, target);
      nextActionId = nextAction.id;
      listener.actions.push(nextAction);
    });
    if (removedActionIds.length) {
      setRuntimePayloadEditors((current) => {
        const next = { ...current };
        removedActionIds.forEach((actionId) => {
          delete next[actionId];
        });
        return next;
      });
    }
    if (nextActionId) {
      setSelectedBehaviorNode({ kind: "listener", listenerId, phase: "action", actionId: nextActionId });
    }
    setMessage(
      value === "unset" ? `${label} reaction unset for ${target.label}.` : `${label} reaction set for ${target.label}.`,
    );
  }

  function valueReactionActions(listener: RuntimeListenerDefinition, targetId: string): RuntimeActionDefinition[] {
    return listener.actions.filter(
      (action) =>
        (action.kind === "set_field_value" || action.kind === "clear_field_value") &&
        runtimeFieldActionTargetId(action) === targetId,
    );
  }

  function valueReactionMode(
    listener: RuntimeListenerDefinition,
    targetId: string,
  ): RuntimeReactionValueMode | "conflict" {
    const matches = valueReactionActions(listener, targetId);
    if (!matches.length) {
      return "unset";
    }
    if (matches.length > 1) {
      return "conflict";
    }
    const action = matches[0];
    if (action?.kind === "clear_field_value") {
      return "clear";
    }
    return isRuntimePayloadReference(action?.config.value) ? "payload" : "static";
  }

  function listenerPayloadReferenceOptions(listener: RuntimeListenerDefinition): RuntimePayloadReferenceOption[] {
    const seen = new Set<RuntimePayloadReferenceKey>();
    const options = listenerSourcePayloadFields(listener).map<RuntimePayloadReferenceOption>((field) => {
      const key = eventPayloadReferenceKey(field.name);
      seen.add(key);
      return {
        key,
        label: field.label ?? formatLabel(field.name),
        description: field.description ?? `Use ${field.name} from the source event payload.`,
      };
    });
    runtimePayloadReferenceOptions
      .filter((option) => option.key.startsWith("current.event.payload.") && !seen.has(option.key))
      .forEach((option) => {
        seen.add(option.key);
        options.push(option);
      });
    return options;
  }

  function defaultEventPayloadConditionPath(listener: RuntimeListenerDefinition): string {
    const payloadFields = listenerSourcePayloadFields(listener);
    const preferredNames = [
      "selectedValue",
      "selectedValues",
      "value",
      "nextValue",
      "checked",
      "changedOption",
      "optionValue",
    ];
    const preferredField = preferredNames
      .map((name) => payloadFields.find((field) => field.name === name))
      .find((field): field is RuntimePayloadField => Boolean(field));
    const firstNonIdentityField = payloadFields.find(
      (field) => !["nodeId", "nodeKey", "nodeType", "fieldId", "fieldKey", "fieldLabel"].includes(field.name),
    );
    return preferredField?.name ?? firstNonIdentityField?.name ?? payloadFields[0]?.name ?? "value";
  }

  function defaultPayloadReferenceForValue(listener: RuntimeListenerDefinition): RuntimePayloadReferenceKey | null {
    return firstListenerPayloadReference(listener, [
      "selectedValue",
      "selectedValues",
      "changedOption",
      "optionValue",
      "value",
      "nextValue",
    ]);
  }

  function setRuntimeValueReactionMode(
    listenerId: string,
    target: RuntimeEventSourceCandidate,
    mode: RuntimeReactionValueMode,
  ) {
    if (target.nodeType !== "field") {
      return;
    }
    let nextActionId: string | null = null;
    let removedActionIds: string[] = [];
    updateRuntimeListener(listenerId, (listener) => {
      const matches = valueReactionActions(listener, target.id);
      const existingSet = matches.find((action) => action.kind === "set_field_value");
      const existingValue =
        existingSet && !isRuntimePayloadReference(existingSet.config.value) ? existingSet.config.value : "";
      const existingReference = isRuntimePayloadReference(existingSet?.config.value)
        ? existingSet.config.value.$runtime
        : null;
      removedActionIds = matches.map((action) => action.id);
      listener.actions = listener.actions.filter((action) => !removedActionIds.includes(action.id));
      if (mode === "unset") {
        return;
      }
      const nextAction =
        mode === "clear"
          ? createRuntimeReactionAction("clear_field_value", target)
          : createRuntimeReactionAction("set_field_value", target, {
              value:
                mode === "payload"
                  ? {
                      $runtime:
                        existingReference ?? defaultPayloadReferenceForValue(listener) ?? "current.event.payload.value",
                    }
                  : existingValue,
            });
      nextActionId = nextAction.id;
      listener.actions.push(nextAction);
    });
    if (removedActionIds.length) {
      setRuntimePayloadEditors((current) => {
        const next = { ...current };
        removedActionIds.forEach((actionId) => {
          delete next[actionId];
        });
        return next;
      });
    }
    if (nextActionId) {
      setSelectedBehaviorNode({ kind: "listener", listenerId, phase: "action", actionId: nextActionId });
    }
    setMessage(
      mode === "unset" ? `Value reaction unset for ${target.label}.` : `Value reaction set for ${target.label}.`,
    );
  }

  function updateRuntimeValueReactionStatic(listenerId: string, target: RuntimeEventSourceCandidate, value: string) {
    if (target.nodeType !== "field") {
      return;
    }
    let nextActionId: string | null = null;
    updateRuntimeListener(listenerId, (listener) => {
      const matches = valueReactionActions(listener, target.id);
      if (matches.length !== 1 || matches[0]?.kind !== "set_field_value") {
        const removedIds = matches.map((action) => action.id);
        listener.actions = listener.actions.filter((action) => !removedIds.includes(action.id));
        const nextAction = createRuntimeReactionAction("set_field_value", target, { value });
        nextActionId = nextAction.id;
        listener.actions.push(nextAction);
        return;
      }
      matches[0].config.value = value;
    });
    if (nextActionId) {
      setSelectedBehaviorNode({ kind: "listener", listenerId, phase: "action", actionId: nextActionId });
    }
  }

  function updateRuntimeValueReactionPayload(
    listenerId: string,
    target: RuntimeEventSourceCandidate,
    reference: RuntimePayloadReferenceKey,
  ) {
    if (target.nodeType !== "field") {
      return;
    }
    let nextActionId: string | null = null;
    updateRuntimeListener(listenerId, (listener) => {
      const matches = valueReactionActions(listener, target.id);
      if (matches.length !== 1 || matches[0]?.kind !== "set_field_value") {
        const removedIds = matches.map((action) => action.id);
        listener.actions = listener.actions.filter((action) => !removedIds.includes(action.id));
        const nextAction = createRuntimeReactionAction("set_field_value", target, { value: { $runtime: reference } });
        nextActionId = nextAction.id;
        listener.actions.push(nextAction);
        return;
      }
      matches[0].config.value = { $runtime: reference };
    });
    if (nextActionId) {
      setSelectedBehaviorNode({ kind: "listener", listenerId, phase: "action", actionId: nextActionId });
    }
  }

  function navigationReactionActions(listener: RuntimeListenerDefinition, targetId: string): RuntimeActionDefinition[] {
    return listener.actions.filter(
      (action) =>
        (action.kind === "go_to_next_step" ||
          action.kind === "go_to_previous_step" ||
          action.kind === "go_to_step" ||
          action.kind === "submit_form") &&
        runtimeNavigationActionTargetId(action) === targetId,
    );
  }

  function navigationReactionValue(
    listener: RuntimeListenerDefinition,
    targetId: string,
  ): RuntimeReactionNavigationValue | "conflict" {
    const matches = navigationReactionActions(listener, targetId);
    if (!matches.length) {
      return "unset";
    }
    if (matches.length > 1) {
      return "conflict";
    }
    const kind = matches[0]?.kind;
    return kind === "go_to_next_step" ||
      kind === "go_to_previous_step" ||
      kind === "go_to_step" ||
      kind === "submit_form"
      ? kind
      : "unset";
  }

  function setRuntimeNavigationReaction(
    listenerId: string,
    target: RuntimeEventSourceCandidate,
    value: RuntimeReactionNavigationValue,
  ) {
    let nextActionId: string | null = null;
    let removedActionIds: string[] = [];
    updateRuntimeListener(listenerId, (listener) => {
      removedActionIds = navigationReactionActions(listener, target.id).map((action) => action.id);
      listener.actions = listener.actions.filter((action) => !removedActionIds.includes(action.id));
      if (value === "unset") {
        return;
      }
      const nextAction = createRuntimeReactionAction(value, target, {
        stepId:
          builderStepOptions.find((option) => option.id !== activeStep?.id)?.id ?? builderStepOptions[0]?.id ?? "",
      });
      nextActionId = nextAction.id;
      listener.actions.push(nextAction);
    });
    if (removedActionIds.length) {
      setRuntimePayloadEditors((current) => {
        const next = { ...current };
        removedActionIds.forEach((actionId) => {
          delete next[actionId];
        });
        return next;
      });
    }
    if (nextActionId) {
      setSelectedBehaviorNode({ kind: "listener", listenerId, phase: "action", actionId: nextActionId });
    }
    setMessage(
      value === "unset"
        ? `Navigation reaction unset for ${target.label}.`
        : `Navigation reaction set for ${target.label}.`,
    );
  }

  function updateRuntimeNavigationStep(listenerId: string, target: RuntimeEventSourceCandidate, stepId: string) {
    updateRuntimeListener(listenerId, (listener) => {
      const matches = navigationReactionActions(listener, target.id).filter((action) => action.kind === "go_to_step");
      if (matches.length === 1) {
        matches[0].config.stepId = stepId;
      }
    });
  }

  function runtimeActionChoicesForListener(listener: RuntimeListenerDefinition): RuntimeListenerActionChoice[] {
    const target = listenerTargetCandidate(listener);
    const targetLabel = target?.label ?? activeRuntimeScope?.label ?? "this component";
    const targetField =
      target && activeDocument && target.nodeType === "field"
        ? findAuthoringFieldById(activeDocument, target.id)
        : null;
    const choices: RuntimeListenerActionChoice[] = [];
    const addChoice = (
      id: string,
      label: string,
      description: string,
      kind: RuntimeActionKind,
      group: RuntimeListenerActionChoice["group"],
      createAction: () => RuntimeActionDefinition,
    ) => {
      choices.push({ id, label, description, kind, group, createAction });
    };

    if (target) {
      addChoice(
        "show-target",
        `Show ${targetLabel}`,
        "Make the listening component visible when this event is heard.",
        "show_node",
        "target",
        () => createTargetedRuntimeAction("show_node", listener),
      );
      addChoice(
        "hide-target",
        `Hide ${targetLabel}`,
        "Make the listening component invisible when this event is heard.",
        "hide_node",
        "target",
        () => createTargetedRuntimeAction("hide_node", listener),
      );
      addChoice(
        "enable-target",
        `Enable ${targetLabel}`,
        "Allow the listening component to be used when this event is heard.",
        "enable_node",
        "target",
        () => createTargetedRuntimeAction("enable_node", listener),
      );
      addChoice(
        "disable-target",
        `Disable ${targetLabel}`,
        "Prevent edits to the listening component when this event is heard.",
        "disable_node",
        "target",
        () => createTargetedRuntimeAction("disable_node", listener),
      );
      addChoice(
        "require-target",
        `Require ${targetLabel}`,
        "Make the listening component required when this event is heard.",
        "mark_required",
        "target",
        () => createTargetedRuntimeAction("mark_required", listener),
      );
      addChoice(
        "optional-target",
        `Make ${targetLabel} optional`,
        "Remove the required state from the listening component.",
        "mark_optional",
        "target",
        () => createTargetedRuntimeAction("mark_optional", listener),
      );
    }

    if (target?.nodeType === "field") {
      const preferredReference =
        targetField?.semanticType === "checkbox"
          ? firstListenerPayloadReference(listener, ["selectedValues", "value", "nextValue"])
          : targetField?.semanticType === "radio" || targetField?.semanticType === "select"
            ? firstListenerPayloadReference(listener, [
                "selectedValue",
                "changedOption",
                "optionValue",
                "value",
                "nextValue",
              ])
            : firstListenerPayloadReference(listener, ["value", "nextValue", "selectedValue", "changedOption"]);
      if (preferredReference) {
        addChoice(
          "set-target-from-payload",
          `Set ${targetLabel} from event payload`,
          "Use a payload property from the source event as the listening field value.",
          "set_field_value",
          "value",
          () => createTargetedRuntimeAction("set_field_value", listener, { value: { $runtime: preferredReference } }),
        );
      }
      addChoice(
        "set-target-static",
        `Set ${targetLabel} value`,
        "Set a specific value on the listening field, then edit the value in the action details.",
        "set_field_value",
        "value",
        () => createTargetedRuntimeAction("set_field_value", listener, { value: "" }),
      );
      addChoice(
        "clear-target",
        `Clear ${targetLabel}`,
        "Remove the listening field value when this event is heard.",
        "clear_field_value",
        "value",
        () => createTargetedRuntimeAction("clear_field_value", listener),
      );
    }

    if (target?.nodeType === "component") {
      addChoice(
        "go-next",
        "Go to next step",
        "Move the runtime flow forward from this component reaction.",
        "go_to_next_step",
        "target",
        () => createTargetedRuntimeAction("go_to_next_step", listener),
      );
      addChoice(
        "submit-form",
        "Submit form",
        "Run form submission from this component reaction.",
        "submit_form",
        "target",
        () => createTargetedRuntimeAction("submit_form", listener),
      );
    }

    addChoice(
      "dispatch-event",
      "Dispatch follow-up event",
      "Broadcast another runtime event from this listener action chain.",
      "dispatch_event",
      "event",
      () =>
        createTargetedRuntimeAction("dispatch_event", listener, {
          payload: createSourceEventPayload(),
        }),
    );
    addChoice(
      "request-host",
      "Request host action",
      "Ask the embedding host to perform work using runtime payload context.",
      "host_action",
      "advanced",
      () =>
        createTargetedRuntimeAction("host_action", listener, {
          payload: createSourceEventPayload(),
        }),
    );
    return choices;
  }

  function createCrossItemPayload(
    source: RuntimeEventSourceCandidate,
    eventOption: RuntimeSourceEventOption,
    dispatcher: RuntimeEventSourceCandidate,
    target: RuntimeEventSourceCandidate,
  ): Record<string, unknown> {
    return {
      sourceNodeId: source.id,
      sourceNodeKey: source.dispatchKey ?? null,
      sourceNodeType: source.nodeType,
      sourceLabel: source.label,
      sourceEventType: eventOption.type,
      dispatcherId: dispatcher.id,
      dispatcherKey: dispatcher.dispatchKey ?? null,
      dispatcherType: dispatcher.nodeType,
      targetNodeId: target.id,
      targetNodeKey: target.dispatchKey ?? null,
      targetNodeType: target.nodeType,
      targetLabel: target.label,
      eventType: { $runtime: "current.event.type" },
      eventTargetId: { $runtime: "current.event.target.id" },
      eventTargetKey: { $runtime: "current.event.target.key" },
      eventTargetType: { $runtime: "current.event.target.type" },
      eventPhase: { $runtime: "current.event.phase" },
    };
  }

  function crossItemActionStartersForTarget(
    source: RuntimeEventSourceCandidate,
    eventOption: RuntimeSourceEventOption,
    dispatcher: RuntimeEventSourceCandidate,
    target: RuntimeEventSourceCandidate,
  ): CrossItemActionStarter[] {
    const targetLabel = target.componentLabel.toLowerCase();
    const payload = createCrossItemPayload(source, eventOption, dispatcher, target);
    const targetField = activeDocument ? findAuthoringFieldById(activeDocument, target.id) : null;
    const targetValue = targetField ? fieldFirstOptionValue(targetField) : "";
    const starters: CrossItemActionStarter[] = [];

    if (target.nodeType !== "form") {
      starters.push(
        {
          id: "show-target",
          label: `Show this ${targetLabel}`,
          description: `Show ${target.label} when ${source.label} dispatches ${eventOption.type}.`,
          actionSummary: "Show target",
          createActions: () => [createRuntimeAction("show_node", { nodeId: target.id })],
        },
        {
          id: "hide-target",
          label: `Hide this ${targetLabel}`,
          description: `Hide ${target.label} when ${source.label} dispatches ${eventOption.type}.`,
          actionSummary: "Hide target",
          createActions: () => [createRuntimeAction("hide_node", { nodeId: target.id })],
        },
      );
    }

    if (target.nodeType === "field") {
      starters.push(
        {
          id: "require-target",
          label: `Require this ${targetLabel}`,
          description: `Mark ${target.label} required when ${source.label} dispatches ${eventOption.type}.`,
          actionSummary: "Mark required",
          createActions: () => [createRuntimeAction("mark_required", { nodeId: target.id })],
        },
        {
          id: "clear-target",
          label: `Clear this ${targetLabel}`,
          description: `Clear ${target.label} when ${source.label} dispatches ${eventOption.type}.`,
          actionSummary: "Clear value",
          createActions: () => [createRuntimeAction("clear_field_value", { fieldId: target.id })],
        },
        {
          id: "set-target",
          label: `Set this ${targetLabel}`,
          description: `Set ${target.label} to a starter value when ${source.label} dispatches ${eventOption.type}.`,
          actionSummary: "Set value",
          createActions: () => [createRuntimeAction("set_field_value", { fieldId: target.id, value: targetValue })],
        },
      );
    }

    if (target.nodeType === "field" || target.nodeType === "component") {
      starters.push({
        id: "enable-target",
        label: `Enable this ${targetLabel}`,
        description: `Enable ${target.label} when ${source.label} dispatches ${eventOption.type}.`,
        actionSummary: "Enable target",
        createActions: () => [createRuntimeAction("enable_node", { nodeId: target.id })],
      });
    }

    starters.push(
      {
        id: "host-cross-item",
        label: "Request host action",
        description: `Send ${source.label} event context and ${target.label} target context to the host.`,
        actionSummary: "Request host action",
        createActions: () => [
          createRuntimeAction("host_action", {
            handlerKey: `host.${sanitizeRuntimeIdentifier(target.label, "target")}.sync`,
            payload,
          }),
        ],
      },
      {
        id: "dispatch-follow-up",
        label: "Dispatch follow-up event",
        description: `Broadcast that ${target.label} reacted to ${source.label}.`,
        actionSummary: "Dispatch follow-up",
        createActions: () => [
          createRuntimeAction("dispatch_event", {
            eventType: `${sanitizeRuntimeIdentifier(target.label, "target")}.reacted`,
            bubbles: true,
            payload,
          }),
        ],
      },
    );

    return starters;
  }

  function defaultConditionForCrossItemSource(source: RuntimeEventSourceCandidate): RuntimeConditionDefinition | null {
    if (source.nodeType !== "field" || !activeDocument) {
      return null;
    }
    const sourceField = findAuthoringFieldById(activeDocument, source.id);
    if (!sourceField || sourceField.semanticType === "statement") {
      return null;
    }
    const operator = defaultConditionOperatorForField(sourceField);
    const expectedValue = defaultConditionExpectedValueForField(sourceField);
    return createFieldValueCondition(
      source.id,
      operator,
      expectedValue,
      operator === "exists"
        ? `${source.label} has a value`
        : `${source.label} matches ${expectedValue || "the selected value"}`,
    );
  }

  function cloneRuntimeActionConfig(config: Record<string, unknown>): Record<string, unknown> {
    return JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
  }

  function createLegacyConditionalRuleDraft(
    effect: LegacyConditionalRule["effect"],
    config?: Partial<LegacyConditionalRule>,
  ): LegacyConditionalRule {
    const whenFieldId = config?.whenFieldId ?? defaultConditionalSourceFieldId();
    const sourceField = activeDocument && whenFieldId ? findAuthoringFieldById(activeDocument, whenFieldId) : null;
    return {
      ruleId: crypto.randomUUID(),
      whenFieldId,
      operator: config?.operator ?? defaultConditionOperatorForField(sourceField),
      expectedValue: config?.expectedValue ?? defaultConditionExpectedValueForField(sourceField),
      effect,
    };
  }

  function createLegacyConditionalRuleGroupKey(rule: LegacyConditionalRule) {
    return [rule.whenFieldId, rule.operator, rule.expectedValue ?? ""].join("::");
  }

  function buildLegacyConditionalRuleGroups(conditions: LegacyConditionalRule[]) {
    const groups = new Map<string, LegacyConditionalRuleGroup>();
    conditions.forEach((rule, index) => {
      const sourceFieldLabel =
        builderFieldOptions.find((option) => option.id === rule.whenFieldId)?.label ?? "Choose field";
      const key = createLegacyConditionalRuleGroupKey(rule);
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
      setMessage(
        "Select imported content with provenance or review retained import issues before opening source compare.",
      );
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
    const nextDetail = {
      ...detail,
      document: cloneDocument(detail.document),
    };
    ensureDocumentDispatchKeys(nextDetail.document);
    activeProjectDetailRef.current = nextDetail;
    startTransition(() => {
      setActiveProjectDetail(nextDetail);
      setProjects((current) => {
        const next = current.filter((project) => project.id !== nextDetail.project.id);
        return [nextDetail.project, ...next];
      });
      setActiveProjectId(nextDetail.project.id);
    });
  }

  function updateAuthoringDocument(
    mutate: (document: AuthoringDocument) => void,
    nextSelection?: AuthoringSelection | null,
  ) {
    const currentDetail = activeProjectDetailRef.current ?? activeProjectDetail;
    if (!currentDetail) {
      return;
    }
    const nextDocument = cloneDocument(currentDetail.document);
    mutate(nextDocument);
    ensureDocumentDispatchKeys(nextDocument);
    const nextDetail = {
      ...currentDetail,
      document: nextDocument,
      project: {
        ...currentDetail.project,
        name: nextDocument.title,
      },
    };
    activeProjectDetailRef.current = nextDetail;
    setProjectDirty(true);
    setActiveProjectDetail(nextDetail);
    if (nextSelection !== undefined) {
      setSelectedAuthoring(nextSelection);
    }
  }

  function invokeRuntimeAction(action: RuntimeActionDefinition) {
    const nextState = runtimeEngineRef.current.invoke(action);
    runtimeSessionRef.current = nextState;
    setRuntimeSessionState(nextState);
    setLastDispatchReport(null);
  }

  function dispatchRuntimeEvent(event: RuntimeEventEnvelope) {
    const nextState = runtimeEngineRef.current.dispatch(event);
    runtimeSessionRef.current = nextState;
    setRuntimeSessionState(nextState);
    setLastDispatchReport(null);
  }

  function handleRuntimeFieldValueChange(field: AuthoringField, nextValue: unknown) {
    if (!activeDocument) {
      return;
    }
    const shouldRevalidate =
      runtimeSessionRef.current !== null &&
      (!runtimeSessionRef.current.validation.valid || runtimeSessionRef.current.submit.status !== "idle");

    const target: NonNullable<RuntimeEventEnvelope["target"]> = {
      runtimeId: "builder-preview",
      formId: activeDocument.id,
      projectId: activeProjectDetail?.project.id ?? null,
      nodeId: field.id,
      nodeKey: field.dispatchKey ?? null,
      nodeType: "field",
    };
    const correlationId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const fieldPayload = {
      fieldId: field.id,
      nextValue,
      componentType: field.semanticType,
      selectionMode: fieldSelectionMode(field),
      selectedValues: field.semanticType === "checkbox" ? nextValue : undefined,
      selectedValue: field.semanticType === "radio" || field.semanticType === "select" ? nextValue : undefined,
      changedOption: fieldFirstOptionValue(field) || null,
    };

    let nextState = runtimeEngineRef.current.dispatch({
      type: "field.change",
      version: "1.0",
      target,
      source: target,
      bubbles: true,
      payload: fieldPayload,
      correlationId,
      timestamp,
    });

    const typedEventName = runtimeFieldChangedEventName(field);
    if (typedEventName !== "field.change") {
      nextState = runtimeEngineRef.current.dispatch({
        type: typedEventName,
        version: "1.0",
        target,
        source: target,
        bubbles: true,
        payload: fieldPayload,
        correlationId,
        timestamp,
      });
    }

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
    const target: NonNullable<RuntimeEventEnvelope["target"]> = {
      runtimeId: "builder-preview",
      formId: activeDocument?.id ?? "unknown-form",
      projectId: activeProjectDetail?.project.id ?? null,
      nodeId: field.id,
      nodeKey: field.dispatchKey ?? null,
      nodeType: "component",
    };
    const correlationId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    dispatchRuntimeEvent({
      type: "component.click",
      version: "1.0",
      target,
      source: target,
      bubbles: true,
      payload: {
        componentId: field.id,
        label: field.label,
        stepId: activeStep?.id ?? null,
      },
      correlationId,
      timestamp,
    });
    dispatchRuntimeEvent({
      type: "button.click",
      version: "1.0",
      target,
      source: target,
      bubbles: true,
      payload: {
        componentId: field.id,
        label: field.label,
        stepId: activeStep?.id ?? null,
      },
      correlationId,
      timestamp,
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
        : (activeDocument.steps[0]?.id ?? null);

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
      target: {
        runtimeId: "builder-preview",
        formId: activeDocument.id,
        projectId: activeProjectDetail?.project.id ?? null,
        nodeId: activeDocument.id,
        nodeType: "form",
      },
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
      target: {
        runtimeId: "builder-preview",
        formId: activeDocument.id,
        projectId: activeProjectDetail?.project.id ?? null,
        nodeId: activeDocument.id,
        nodeType: "form",
      },
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

  function selectedRuntimeNodeIdForScope(scopeKind: RuntimeEditorScope["scopeKind"]): string | undefined {
    if (scopeKind === "form") {
      return activeDocument?.id;
    }
    if (selectedAuthoring?.kind === "step") {
      return selectedAuthoring.stepId;
    }
    if (selectedAuthoring?.kind === "section") {
      return selectedAuthoring.sectionId;
    }
    if (selectedAuthoring?.kind === "group") {
      return selectedAuthoring.groupId;
    }
    if (selectedAuthoring?.kind === "field") {
      return selectedAuthoring.fieldId;
    }
    return undefined;
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
        ? section.groups
            .find((candidate) => candidate.id === selectedAuthoring.groupId)
            ?.fields.find((candidate) => candidate.id === selectedAuthoring.fieldId)
        : section.fields.find((candidate) => candidate.id === selectedAuthoring.fieldId);
      if (field) {
        field.runtime ??= createRuntimeNodeBehavior();
        mutate(field.runtime, runtimeNodeTypeForAuthoringField(field), field);
      }
    }, selectedAuthoring);
  }

  function addRuntimeEventSourceToScope(config: {
    eventId?: string | null;
    eventType: string;
    bubbles: boolean;
    payloadFields: RuntimePayloadField[];
    payloadExample?: Record<string, unknown>;
    description?: string | null;
  }) {
    if (!activeRuntimeScope) {
      setMessage("Select a form, button, or interactive field before adding an event.");
      return;
    }
    const eventIssue = validateRuntimeIdentifier(config.eventType, "Event type", defaultBehaviorTriggerName());
    const payloadIssue = config.payloadFields.find((field) =>
      validateRuntimeIdentifier(field.name, "Payload field", "fieldId"),
    );
    if (eventIssue) {
      setErrorMessage(eventIssue);
      return;
    }
    if (payloadIssue) {
      setErrorMessage(validateRuntimeIdentifier(payloadIssue.name, "Payload field", "fieldId"));
      return;
    }

    let status: "created" | "updated" | null = null;
    let savedEventId: string | null = config.eventId ?? null;
    updateRuntimeScope((runtime, scopeKind) => {
      const nodeId = selectedRuntimeNodeIdForScope(scopeKind);
      const eventDefinition = createRuntimeEventSource(config.eventType, activeRuntimeScope, nodeId, {
        id: config.eventId,
        bubbles: config.bubbles,
        payloadShape: createRuntimePayloadShapeFromFields(config.payloadFields, config.payloadExample ?? {}),
        description: config.description?.trim() || null,
      });
      status = upsertRuntimeEventSource(
        scopeKind === "form"
          ? (runtime as RuntimeDocumentBehavior).formEvents
          : (runtime as RuntimeNodeBehavior).eventSources,
        eventDefinition,
      );
      const eventSources =
        scopeKind === "form"
          ? (runtime as RuntimeDocumentBehavior).formEvents
          : (runtime as RuntimeNodeBehavior).eventSources;
      savedEventId = findRuntimeEventSourceForUpsert(eventSources, eventDefinition)?.id ?? eventDefinition.id;
    });

    if (status) {
      setErrorMessage(null);
      setMessage(`${formatLabel(config.eventType)} event ${status} for ${activeRuntimeScope.label}.`);
      if (behaviorStudioMode === "event") {
        setBehaviorStudioCreating(true);
        setBehaviorCreationPath("event");
        setEditingBehaviorEventId(savedEventId);
      } else {
        finalizeBehaviorStudioCreation();
        setBehaviorStudioMode("manage");
      }
    }
  }

  function addRuntimeListener(listener: RuntimeListenerDefinition) {
    updateRuntimeScope((runtime, scopeKind, field) => {
      const eventType = getRuntimeListenerEventType(listener);
      if (scopeKind === "form") {
        const formRuntime = runtime as RuntimeDocumentBehavior;
        const nodeId = activeDocument?.id;
        listener.dispatcherId ??= nodeId ?? null;
        listener.dispatcherType ??= "form";
        listener.eventSourceNodeId ??= nodeId ?? null;
        listener.eventSourceNodeType ??= "form";
        listener.targetNodeId ??= nodeId ?? null;
        listener.targetNodeType ??= "form";
        listener.wiringMode ??= "local";
        listener.type = eventType;
        listener.eventName = eventType;
        if (listener.wiringMode !== "cross_item") {
          ensureUniqueEventSource(
            formRuntime.formEvents,
            eventType,
            activeRuntimeScope ?? {
              scopeKind: "form",
              label: activeDocument?.title ?? "Form",
              description: "",
              eventSources: formRuntime.formEvents,
              listeners: formRuntime.formListeners,
            },
            nodeId,
          );
        }
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
        listener.dispatcherId ??= nodeId ?? null;
        listener.dispatcherType ??= scopeKind;
        listener.eventSourceNodeId ??= nodeId ?? null;
        listener.eventSourceNodeType ??= scopeKind;
        listener.targetNodeId ??= nodeId ?? null;
        listener.targetNodeType ??= scopeKind;
        listener.wiringMode ??= "local";
        listener.type = eventType;
        listener.eventName = eventType;
        if (activeRuntimeScope && listener.wiringMode !== "cross_item") {
          ensureUniqueEventSource(nodeRuntime.eventSources, eventType, activeRuntimeScope, nodeId);
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
          } else if (firstAction?.kind === "dispatch_event" || firstAction?.kind === "emit_event") {
            field.rendererHints.action = "custom_event";
            field.rendererHints.eventName = getRuntimeActionEventType(firstAction);
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
      const listeners =
        scopeKind === "form"
          ? (runtime as RuntimeDocumentBehavior).formListeners
          : (runtime as RuntimeNodeBehavior).listeners;
      const listener = listeners.find((candidate) => candidate.id === listenerId);
      if (listener) {
        mutate(listener);
      }
    });
  }

  function mutableRuntimeEventSourcesForSelection(
    document: AuthoringDocument,
    selection: AuthoringSelection | null,
  ): RuntimeEventDefinition[] | null {
    if (selection === null) {
      document.runtime ??= createRuntimeDocumentBehavior();
      return document.runtime.formEvents;
    }

    const context = getSelectionContext(document, selection);
    if (selection.kind === "step" && context.step) {
      context.step.runtime ??= createRuntimeNodeBehavior();
      return context.step.runtime.eventSources;
    }
    if (selection.kind === "section" && context.section) {
      context.section.runtime ??= createRuntimeNodeBehavior();
      return context.section.runtime.eventSources;
    }
    if (selection.kind === "group" && context.group) {
      context.group.runtime ??= createRuntimeNodeBehavior();
      return context.group.runtime.eventSources;
    }
    if (selection.kind === "field" && context.field) {
      context.field.runtime ??= createRuntimeNodeBehavior();
      return context.field.runtime.eventSources;
    }
    return null;
  }

  function openRuntimeEventEditorForSelection(selection: AuthoringSelection | null, eventId: string) {
    if (selection !== selectedAuthoring) {
      setSelectedAuthoring(selection);
      setPendingBehaviorEventEditId(eventId);
    } else {
      const eventDefinition = activeRuntimeScope?.eventSources.find((candidate) => candidate.id === eventId) ?? null;
      if (eventDefinition) {
        beginBehaviorEventCreationPath(eventDefinition);
      }
    }
    setBehaviorStudioCreating(true);
    setBehaviorCreationPath("event");
    setSelectedBehaviorNode(null);
    setBehaviorStudioMode("event");
    setBehaviorStudioView("studio");
    setBehaviorStudioOpen(true);
    setInspectorTab("behavior");
  }

  function nextRuntimeEventCopyType(eventSources: RuntimeEventDefinition[], eventType: string): string {
    const baseType = sanitizeRuntimeIdentifier(`${eventType}.copy`, "custom.event.copy");
    let nextType = baseType;
    let copyIndex = 2;
    while (eventSources.some((eventSource) => runtimeEventDefinitionType(eventSource) === nextType)) {
      nextType = sanitizeRuntimeIdentifier(`${baseType}.${copyIndex}`, "custom.event.copy");
      copyIndex += 1;
    }
    return nextType;
  }

  function duplicateRuntimeEventSourceForSelection(selection: AuthoringSelection | null, eventId: string) {
    let duplicatedType: string | null = null;
    updateAuthoringDocument((document) => {
      const eventSources = mutableRuntimeEventSourcesForSelection(document, selection);
      const eventDefinition = eventSources?.find((candidate) => candidate.id === eventId);
      if (!eventSources || !eventDefinition) {
        return;
      }
      duplicatedType = nextRuntimeEventCopyType(eventSources, runtimeEventDefinitionType(eventDefinition));
      eventSources.push({
        ...eventDefinition,
        id: crypto.randomUUID(),
        type: duplicatedType,
        name: duplicatedType,
        payloadShape: cloneRuntimePayloadShape(eventDefinition.payloadShape),
      });
    }, selection);
    if (duplicatedType) {
      setMessage(`${formatLabel(duplicatedType)} event duplicated.`);
    }
  }

  function removeRuntimeEventSourceForSelection(selection: AuthoringSelection | null, eventId: string) {
    let removedType: string | null = null;
    updateAuthoringDocument((document) => {
      const eventSources = mutableRuntimeEventSourcesForSelection(document, selection);
      const eventIndex = eventSources?.findIndex((candidate) => candidate.id === eventId) ?? -1;
      if (!eventSources || eventIndex < 0) {
        return;
      }
      const [removed] = eventSources.splice(eventIndex, 1);
      removedType = runtimeEventDefinitionType(removed);
    }, selection);
    if (removedType) {
      setMessage(`${formatLabel(removedType)} event removed. Existing listeners were left in place.`);
    }
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

  function toggleLegacyConditionalRuleForSelection(selection: AuthoringSelection, ruleId: string) {
    let nextEnabled: boolean | null = null;
    updateAuthoringDocument((document) => {
      const field = getSelectionContext(document, selection).field;
      const rule = legacyFieldConditionals(field).find((candidate) => candidate.ruleId === ruleId);
      if (!rule) {
        return;
      }
      nextEnabled = !isLegacyConditionalRuleEnabled(rule);
      setLegacyConditionalRuleEnabled(rule, nextEnabled);
    }, selection);
    if (nextEnabled !== null) {
      setMessage(`Condition flow ${nextEnabled ? "enabled" : "disabled"}.`);
    }
  }

  function duplicateLegacyConditionalRuleForSelection(selection: AuthoringSelection, ruleId: string) {
    const nextRuleId = crypto.randomUUID();
    let duplicated = false;
    updateAuthoringDocument((document) => {
      const field = getSelectionContext(document, selection).field;
      const ruleIndex = legacyFieldConditionals(field).findIndex((candidate) => candidate.ruleId === ruleId) ?? -1;
      if (!field || ruleIndex < 0) {
        return;
      }
      mutableLegacyFieldConditionals(field).splice(ruleIndex + 1, 0, {
        ...mutableLegacyFieldConditionals(field)[ruleIndex],
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
    setMessage("Condition flow duplicated.");
  }

  function removeLegacyConditionalRuleForSelection(selection: AuthoringSelection, ruleId: string) {
    updateAuthoringDocument((document) => {
      const field = getSelectionContext(document, selection).field;
      if (!field) {
        return;
      }
      (field as LegacyRuleField).conditionals = legacyFieldConditionals(field).filter((rule) => rule.ruleId !== ruleId);
    }, selection);
    setEditingRuleIndex(null);
    setExpandedBehaviorIndexObjectKey((current) => (current === `rule:${ruleId}` ? null : current));
    setSelectedBehaviorNode((current) => (current?.kind === "rule" && current.ruleId === ruleId ? null : current));
    setMessage("Condition flow deleted.");
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
        conditions: sourceListener.conditions.map((guard) => ({ ...guard })),
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
    setSelectedBehaviorNode((current) =>
      current?.kind === "listener" && current.listenerId === listenerId ? null : current,
    );
    setMessage("Flow deleted.");
  }

  function addRuntimeActionToListener(listenerId: string, kind: RuntimeActionKind = "dispatch_event") {
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

  function addChosenRuntimeActionToListener(
    listenerId: string,
    createAction: () => RuntimeActionDefinition,
    label: string,
  ) {
    let nextActionId: string | null = null;
    updateRuntimeListener(listenerId, (listener) => {
      const nextAction = createAction();
      nextActionId = nextAction.id;
      listener.actions.push(nextAction);
    });
    if (!nextActionId) {
      return;
    }
    pendingBehaviorFocusRef.current = `listener:${listenerId}`;
    setSelectedBehaviorNode({ kind: "listener", listenerId, phase: "action", actionId: nextActionId });
    setMessage(`${label} action added.`);
  }

  function updateRuntimeAction(
    listenerId: string,
    actionId: string,
    mutate: (action: RuntimeActionDefinition) => void,
  ) {
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

  function insertRuntimeActionAfter(listenerId: string, actionId: string, kind: RuntimeActionKind = "dispatch_event") {
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

  function replaceRuntimeActionChain(
    listenerId: string,
    createActions: () => RuntimeActionDefinition[],
    templateLabel: string,
  ) {
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

  function createFieldChangedPayloadEntries(field: AuthoringField | null = activeBuilderField): RuntimePayloadEntry[] {
    const entries: RuntimePayloadEntry[] = [
      createRuntimePayloadReferenceEntry("fieldId", "current.field.id"),
      createRuntimePayloadReferenceEntry("fieldKey", "current.field.key"),
      createRuntimePayloadReferenceEntry("stepId", "current.step.id"),
      createRuntimePayloadReferenceEntry("stepTitle", "current.step.title"),
      createRuntimePayloadReferenceEntry("projectId", "current.project.id"),
      createRuntimePayloadReferenceEntry("sourceNodeType", "current.source.node.type"),
      createRuntimePayloadReferenceEntry("eventType", "current.event.type"),
      createRuntimePayloadReferenceEntry("eventPhase", "current.event.phase"),
      createRuntimePayloadReferenceEntry("value", "current.runtime.value"),
      createRuntimePayloadEntry("componentType", field?.semanticType ?? "field", "string"),
      createRuntimePayloadEntry("changeOrigin", "runtime", "string"),
    ];
    const selectionMode = fieldSelectionMode(field);
    if (selectionMode) {
      entries.push(createRuntimePayloadEntry("selectionMode", selectionMode, "string"));
      entries.push(
        createRuntimePayloadReferenceEntry(
          field?.semanticType === "checkbox" ? "selectedValues" : "selectedValue",
          "current.runtime.value",
        ),
      );
      entries.push(createRuntimePayloadEntry("changedOption", fieldFirstOptionValue(field), "string"));
    }
    return entries;
  }

  function createFieldChangedPayload(field: AuthoringField | null = activeBuilderField): Record<string, unknown> {
    return runtimePayloadFromEntries(createFieldChangedPayloadEntries(field));
  }

  function createHostLookupPayloadEntries(field: AuthoringField | null = activeBuilderField): RuntimePayloadEntry[] {
    const entries: RuntimePayloadEntry[] = [
      createRuntimePayloadReferenceEntry("fieldId", "current.field.id"),
      createRuntimePayloadReferenceEntry("fieldKey", "current.field.key"),
      createRuntimePayloadReferenceEntry("stepId", "current.step.id"),
      createRuntimePayloadReferenceEntry("stepTitle", "current.step.title"),
      createRuntimePayloadReferenceEntry("projectId", "current.project.id"),
      createRuntimePayloadReferenceEntry("sourceNodeType", "current.source.node.type"),
      createRuntimePayloadReferenceEntry("value", "current.runtime.value"),
      createRuntimePayloadEntry("componentType", field?.semanticType ?? "field", "string"),
      createRuntimePayloadEntry("requestSource", "runtime", "string"),
    ];
    const selectionMode = fieldSelectionMode(field);
    if (selectionMode) {
      entries.push(createRuntimePayloadEntry("selectionMode", selectionMode, "string"));
      entries.push(
        createRuntimePayloadReferenceEntry(
          field?.semanticType === "checkbox" ? "selectedValues" : "selectedValue",
          "current.runtime.value",
        ),
      );
    } else {
      entries.push(createRuntimePayloadReferenceEntry("query", "current.runtime.value"));
    }
    return entries;
  }

  function createHostLookupPayload(field: AuthoringField | null = activeBuilderField): Record<string, unknown> {
    return runtimePayloadFromEntries(createHostLookupPayloadEntries(field));
  }

  function createStepLifecyclePayload(): Record<string, unknown> {
    return runtimePayloadFromEntries([
      createRuntimePayloadReferenceEntry("stepId", "current.step.id"),
      createRuntimePayloadReferenceEntry("stepTitle", "current.step.title"),
      createRuntimePayloadReferenceEntry("formId", "current.form.id"),
      createRuntimePayloadReferenceEntry("projectId", "current.project.id"),
      createRuntimePayloadEntry("source", "runtime", "string"),
    ]);
  }

  function createSourceEventPayload(): Record<string, unknown> {
    return runtimePayloadFromEntries([
      createRuntimePayloadReferenceEntry("sourceNodeId", "current.source.node.id"),
      createRuntimePayloadReferenceEntry("sourceNodeType", "current.source.node.type"),
      createRuntimePayloadReferenceEntry("stepId", "current.step.id"),
      createRuntimePayloadReferenceEntry("formId", "current.form.id"),
      createRuntimePayloadReferenceEntry("projectId", "current.project.id"),
      createRuntimePayloadEntry("source", "runtime", "string"),
    ]);
  }

  function createFormLifecyclePayload(): Record<string, unknown> {
    return runtimePayloadFromEntries([
      createRuntimePayloadReferenceEntry("formId", "current.form.id"),
      createRuntimePayloadReferenceEntry("formTitle", "current.form.title"),
      createRuntimePayloadReferenceEntry("projectId", "current.project.id"),
      createRuntimePayloadEntry("source", "runtime", "string"),
    ]);
  }

  function createFormSubmitPayload(): Record<string, unknown> {
    return runtimePayloadFromEntries([
      createRuntimePayloadReferenceEntry("formId", "current.form.id"),
      createRuntimePayloadReferenceEntry("formTitle", "current.form.title"),
      createRuntimePayloadReferenceEntry("stepId", "current.step.id"),
      createRuntimePayloadReferenceEntry("stepTitle", "current.step.title"),
      createRuntimePayloadReferenceEntry("projectId", "current.project.id"),
      createRuntimePayloadEntry("submitOrigin", "runtime", "string"),
    ]);
  }

  function createFormPrefillPayload(): Record<string, unknown> {
    return runtimePayloadFromEntries([
      createRuntimePayloadReferenceEntry("formId", "current.form.id"),
      createRuntimePayloadReferenceEntry("formTitle", "current.form.title"),
      createRuntimePayloadReferenceEntry("projectId", "current.project.id"),
      createRuntimePayloadEntry("mergeMode", "replace_empty", "string"),
      createRuntimePayloadEntry("requestSource", "runtime", "string"),
    ]);
  }

  const runtimePresets = useMemo<RuntimePreset[]>(() => {
    if (!activeRuntimeScope) {
      return [];
    }
    const scopedSourceNodeId = selectedAuthoring?.kind === "field" ? selectedAuthoring.fieldId : null;
    const fieldComponentLabel = behaviorFieldComponentLabel(activeBuilderField);
    const fieldComponentLabelLower = fieldComponentLabel.toLowerCase();
    const fieldRuntimeValueNoun = fieldValueNoun(activeBuilderField);
    const changedEventName = runtimeFieldChangedEventName(activeBuilderField);
    const fieldChangeTriggerName = runtimeFieldTriggerSuggestions(activeBuilderField)[0] ?? "field.change";
    const fieldHostTriggerName =
      activeBuilderField?.semanticType === "checkbox"
        ? "checkboxGroup.change"
        : activeBuilderField?.semanticType === "radio"
          ? "radio.change"
          : activeBuilderField?.semanticType === "select"
            ? "select.change"
            : "field.blur";
    const preset = (
      config: Omit<RuntimePreset, "apply"> & {
        create: () => RuntimeListenerDefinition;
      },
    ): RuntimePreset => ({
      id: config.id,
      label: config.label,
      description: config.description,
      category: config.category,
      componentLabel: config.componentLabel,
      triggerName: config.triggerName,
      actionKinds: config.actionKinds,
      actionSummary: config.actionSummary,
      apply: config.create,
    });

    if (activeRuntimeScope.scopeKind === "component") {
      return [
        preset({
          id: "button-next",
          label: "Continue to next step",
          description: "Wire this button to the next runtime step.",
          category: "navigation",
          triggerName: "component.click",
          actionSummary: "Go to next step",
          actionKinds: ["go_to_next_step"],
          create: () =>
            createRuntimeListener("component.click", [createRuntimeAction("go_to_next_step")], scopedSourceNodeId),
        }),
        preset({
          id: "button-previous",
          label: "Go to previous step",
          description: "Use this for back navigation inside the runtime.",
          category: "navigation",
          triggerName: "component.click",
          actionSummary: "Go to previous step",
          actionKinds: ["go_to_previous_step"],
          create: () =>
            createRuntimeListener("component.click", [createRuntimeAction("go_to_previous_step")], scopedSourceNodeId),
        }),
        preset({
          id: "button-submit",
          label: "Submit form",
          description: "Validate and dispatch the host-facing submit event.",
          category: "navigation",
          triggerName: "component.click",
          actionSummary: "Submit form",
          actionKinds: ["submit_form"],
          create: () =>
            createRuntimeListener("component.click", [createRuntimeAction("submit_form")], scopedSourceNodeId),
        }),
        preset({
          id: "button-next-emit",
          label: "Continue then dispatch event",
          description: "Move forward and immediately broadcast a follow-up runtime event.",
          category: "navigation",
          triggerName: "component.click",
          actionSummary: "Continue + dispatch event",
          actionKinds: ["go_to_next_step", "dispatch_event"],
          create: () =>
            createRuntimeListener(
              "component.click",
              [
                createRuntimeAction("go_to_next_step"),
                createRuntimeAction("dispatch_event", {
                  ...defaultRuntimeActionConfigForScope("dispatch_event"),
                  payload: createSourceEventPayload(),
                }),
              ],
              scopedSourceNodeId,
            ),
        }),
        preset({
          id: "button-emit",
          label: "Dispatch custom event",
          description: "Fire a named runtime event for the host shell or other behaviors.",
          category: "events",
          triggerName: "component.click",
          actionSummary: "Dispatch event",
          actionKinds: ["dispatch_event"],
          create: () =>
            createRuntimeListener(
              "component.click",
              [
                createRuntimeAction("dispatch_event", {
                  ...defaultRuntimeActionConfigForScope("dispatch_event"),
                  payload: createSourceEventPayload(),
                }),
              ],
              scopedSourceNodeId,
            ),
        }),
        preset({
          id: "button-host-action",
          label: "Request host action",
          description: "Let the host application handle this button click.",
          category: "data",
          triggerName: "component.click",
          actionSummary: "Request host action",
          actionKinds: ["host_action"],
          create: () =>
            createRuntimeListener(
              "component.click",
              [
                createRuntimeAction("host_action", {
                  ...defaultRuntimeActionConfigForScope("host_action"),
                  payload: createSourceEventPayload(),
                }),
              ],
              scopedSourceNodeId,
            ),
        }),
      ];
    }
    if (activeRuntimeScope.scopeKind === "field") {
      return [
        preset({
          id: "field-show-require",
          label: `Show and require from ${fieldRuntimeValueNoun}`,
          description: `Reveal a related target and make it required when this ${fieldComponentLabelLower} changes.`,
          category: "visibility",
          componentLabel: fieldComponentLabel,
          triggerName: fieldChangeTriggerName,
          actionSummary: "Show target + mark required",
          actionKinds: ["show_node", "mark_required"],
          create: () =>
            createRuntimeListener(
              fieldChangeTriggerName,
              [
                createRuntimeAction("show_node", defaultRuntimeActionConfigForScope("show_node")),
                createRuntimeAction("mark_required", defaultRuntimeActionConfigForScope("mark_required")),
              ],
              scopedSourceNodeId,
            ),
        }),
        preset({
          id: "field-show-node",
          label: `Show content from ${fieldRuntimeValueNoun}`,
          description: `Reveal another field, group, or section when this ${fieldComponentLabelLower} changes.`,
          category: "visibility",
          componentLabel: fieldComponentLabel,
          triggerName: fieldChangeTriggerName,
          actionSummary: "Show target",
          actionKinds: ["show_node"],
          create: () =>
            createRuntimeListener(
              fieldChangeTriggerName,
              [createRuntimeAction("show_node", defaultRuntimeActionConfigForScope("show_node"))],
              scopedSourceNodeId,
            ),
        }),
        preset({
          id: "field-hide-node",
          label: `Hide content from ${fieldRuntimeValueNoun}`,
          description: `Hide another field, group, or section when this ${fieldComponentLabelLower} changes.`,
          category: "visibility",
          componentLabel: fieldComponentLabel,
          triggerName: fieldChangeTriggerName,
          actionSummary: "Hide target",
          actionKinds: ["hide_node"],
          create: () =>
            createRuntimeListener(
              fieldChangeTriggerName,
              [createRuntimeAction("hide_node", defaultRuntimeActionConfigForScope("hide_node"))],
              scopedSourceNodeId,
            ),
        }),
        preset({
          id: "field-require-node",
          label: `Require target from ${fieldRuntimeValueNoun}`,
          description: `Mark a target required when this ${fieldComponentLabelLower} changes.`,
          category: "validation",
          componentLabel: fieldComponentLabel,
          triggerName: fieldChangeTriggerName,
          actionSummary: "Mark required",
          actionKinds: ["mark_required"],
          create: () =>
            createRuntimeListener(
              fieldChangeTriggerName,
              [createRuntimeAction("mark_required", defaultRuntimeActionConfigForScope("mark_required"))],
              scopedSourceNodeId,
            ),
        }),
        preset({
          id: "field-clear-value",
          label: `Clear dependent answer from ${fieldRuntimeValueNoun}`,
          description: `Clear another field when this controlling ${fieldComponentLabelLower} changes.`,
          category: "data",
          componentLabel: fieldComponentLabel,
          triggerName: fieldChangeTriggerName,
          actionSummary: "Clear field value",
          actionKinds: ["clear_field_value"],
          create: () =>
            createRuntimeListener(
              fieldChangeTriggerName,
              [createRuntimeAction("clear_field_value", defaultRuntimeActionConfigForScope("clear_field_value"))],
              scopedSourceNodeId,
            ),
        }),
        preset({
          id: "field-set-value",
          label: `Set another field from ${fieldRuntimeValueNoun}`,
          description: `Create a change behavior that writes this ${fieldComponentLabelLower} context into another field.`,
          category: "data",
          componentLabel: fieldComponentLabel,
          triggerName: fieldChangeTriggerName,
          actionSummary: "Set field value",
          actionKinds: ["set_field_value"],
          create: () =>
            createRuntimeListener(
              fieldChangeTriggerName,
              [createRuntimeAction("set_field_value", defaultRuntimeActionConfigForScope("set_field_value"))],
              scopedSourceNodeId,
            ),
        }),
        preset({
          id: "field-host-sync",
          label:
            activeBuilderField?.semanticType === "checkbox"
              ? "Sync checkbox selections with host"
              : `Request host data for ${fieldRuntimeValueNoun}`,
          description:
            activeBuilderField?.semanticType === "checkbox"
              ? "Send checkbox selection context to the host whenever this checkbox group changes."
              : `Ask the host application for data using this ${fieldComponentLabelLower} context.`,
          category: "data",
          componentLabel: fieldComponentLabel,
          triggerName: fieldHostTriggerName,
          actionSummary:
            activeBuilderField?.semanticType === "checkbox" ? "Sync checkbox selections" : "Request host lookup",
          actionKinds: ["host_action"],
          create: () =>
            createRuntimeListener(
              fieldHostTriggerName,
              [
                createRuntimeAction("host_action", {
                  ...defaultRuntimeActionConfigForScope("host_action"),
                  payload: createHostLookupPayload(activeBuilderField),
                }),
              ],
              scopedSourceNodeId,
            ),
        }),
        preset({
          id: "field-change-event",
          label:
            activeBuilderField?.semanticType === "checkbox"
              ? "Dispatch checkbox selection change"
              : `Dispatch ${fieldRuntimeValueNoun} change`,
          description:
            activeBuilderField?.semanticType === "checkbox"
              ? "Broadcast selected checkbox values whenever this checkbox group changes."
              : `Broadcast a typed event whenever this ${fieldComponentLabelLower} changes.`,
          category: "events",
          componentLabel: fieldComponentLabel,
          triggerName: fieldChangeTriggerName,
          actionSummary: "Dispatch event",
          actionKinds: ["dispatch_event"],
          create: () =>
            createRuntimeListener(
              fieldChangeTriggerName,
              [
                createRuntimeAction("dispatch_event", {
                  eventType: changedEventName,
                  payload: createFieldChangedPayload(activeBuilderField),
                }),
              ],
              scopedSourceNodeId,
            ),
        }),
        preset({
          id: "field-change-host",
          label:
            activeBuilderField?.semanticType === "checkbox"
              ? "Dispatch and sync checkbox selections"
              : `Dispatch and sync ${fieldRuntimeValueNoun}`,
          description:
            activeBuilderField?.semanticType === "checkbox"
              ? "Broadcast checkbox changes first, then hand the same selected-values context to the host."
              : `Broadcast this ${fieldComponentLabelLower} event first, then hand the same change context to the host.`,
          category: "data",
          componentLabel: fieldComponentLabel,
          triggerName: fieldChangeTriggerName,
          actionSummary:
            activeBuilderField?.semanticType === "checkbox"
              ? "Dispatch checkbox event + sync host"
              : "Dispatch event + request host",
          actionKinds: ["dispatch_event", "host_action"],
          create: () =>
            createRuntimeListener(
              fieldChangeTriggerName,
              [
                createRuntimeAction("dispatch_event", {
                  eventType: changedEventName,
                  payload: createFieldChangedPayload(activeBuilderField),
                }),
                createRuntimeAction("host_action", {
                  ...defaultRuntimeActionConfigForScope("host_action"),
                  payload: createHostLookupPayload(activeBuilderField),
                }),
              ],
              scopedSourceNodeId,
            ),
        }),
      ];
    }
    if (activeRuntimeScope.scopeKind === "form") {
      return [
        preset({
          id: "form-prefill",
          label: "Prefill from host",
          description: "Ask the host application for known data when the form opens.",
          category: "data",
          triggerName: "form.load",
          actionSummary: "Request host prefill",
          actionKinds: ["host_action"],
          create: () =>
            createRuntimeListener("form.load", [
              createRuntimeAction("host_action", { handlerKey: "host.prefill", payload: createFormPrefillPayload() }),
            ]),
        }),
        preset({
          id: "form-load",
          label: "Dispatch event on load",
          description: "Useful when the host needs a clean runtime-ready signal.",
          category: "events",
          triggerName: "form.load",
          actionSummary: "Dispatch form loaded",
          actionKinds: ["dispatch_event"],
          create: () =>
            createRuntimeListener("form.load", [
              createRuntimeAction("dispatch_event", {
                eventType: "form.loaded",
                payload: createFormLifecyclePayload(),
              }),
            ]),
        }),
        preset({
          id: "form-submit",
          label: "Dispatch event on submit",
          description: "Add a follow-up event after the runtime creates the submit payload.",
          category: "validation",
          triggerName: "form.submit",
          actionSummary: "Dispatch submit event",
          actionKinds: ["dispatch_event"],
          create: () =>
            createRuntimeListener("form.submit", [
              createRuntimeAction("dispatch_event", {
                eventType: "form.submit.dispatched",
                payload: createFormSubmitPayload(),
              }),
            ]),
        }),
        preset({
          id: "form-submit-host",
          label: "Dispatch then request host action on submit",
          description: "Keep the authored submit event and host handoff together in one reusable chain.",
          category: "validation",
          triggerName: "form.submit",
          actionSummary: "Dispatch submit + request host",
          actionKinds: ["dispatch_event", "host_action"],
          create: () =>
            createRuntimeListener("form.submit", [
              createRuntimeAction("dispatch_event", {
                eventType: "form.submit.dispatched",
                payload: createFormSubmitPayload(),
              }),
              createRuntimeAction("host_action", { handlerKey: "host.submit", payload: createFormSubmitPayload() }),
            ]),
        }),
        preset({
          id: "form-validation",
          label: "Dispatch event on validation failure",
          description: "Surface a reusable event when submit is blocked.",
          category: "validation",
          triggerName: "form.validation_failed",
          actionSummary: "Dispatch validation event",
          actionKinds: ["dispatch_event"],
          create: () =>
            createRuntimeListener("form.validation_failed", [
              createRuntimeAction("dispatch_event", {
                eventType: "form.validation_failed",
                bubbles: false,
                payload: {
                  ...createFormSubmitPayload(),
                  reason: "required_fields",
                },
              }),
            ]),
        }),
        preset({
          id: "form-submit-success",
          label: "Dispatch event on submit success",
          description: "Broadcast a completion event after the host reports success.",
          category: "validation",
          triggerName: "form.submit_success",
          actionSummary: "Dispatch success event",
          actionKinds: ["dispatch_event"],
          create: () =>
            createRuntimeListener("form.submit_success", [
              createRuntimeAction("dispatch_event", {
                eventType: "form.completed",
                payload: createFormSubmitPayload(),
              }),
            ]),
        }),
        preset({
          id: "form-submit-error",
          label: "Dispatch event on submit error",
          description: "Broadcast a recoverable failure event after the host reports an error.",
          category: "validation",
          triggerName: "form.submit_error",
          actionSummary: "Dispatch error event",
          actionKinds: ["dispatch_event"],
          create: () =>
            createRuntimeListener("form.submit_error", [
              createRuntimeAction("dispatch_event", {
                eventType: "form.submit.failed",
                payload: createFormSubmitPayload(),
              }),
            ]),
        }),
      ];
    }
    if (activeRuntimeScope.scopeKind === "step") {
      return [
        preset({
          id: "step-enter-event",
          label: "Dispatch event when step opens",
          description: "Broadcast that the current step became active.",
          category: "events",
          triggerName: "step.enter",
          actionSummary: "Dispatch step event",
          actionKinds: ["dispatch_event"],
          create: () =>
            createRuntimeListener("step.enter", [
              createRuntimeAction("dispatch_event", {
                ...defaultRuntimeActionConfigForScope("dispatch_event"),
                payload: createStepLifecyclePayload(),
              }),
            ]),
        }),
        preset({
          id: "step-leave-host-save",
          label: "Save progress when leaving step",
          description: "Ask the host shell to persist progress when the user leaves this step.",
          category: "data",
          triggerName: "step.leave",
          actionSummary: "Request host save",
          actionKinds: ["host_action"],
          create: () =>
            createRuntimeListener("step.leave", [
              createRuntimeAction("host_action", {
                handlerKey: "host.saveDraft",
                payload: createStepLifecyclePayload(),
              }),
            ]),
        }),
        preset({
          id: "step-enter-set-value",
          label: "Initialize value on step open",
          description: "Set a field value when this step opens.",
          category: "data",
          triggerName: "step.enter",
          actionSummary: "Set field value",
          actionKinds: ["set_field_value"],
          create: () =>
            createRuntimeListener("step.enter", [
              createRuntimeAction("set_field_value", defaultRuntimeActionConfigForScope("set_field_value")),
            ]),
        }),
      ];
    }
    if (activeRuntimeScope.scopeKind === "section" || activeRuntimeScope.scopeKind === "group") {
      const triggerName = defaultBehaviorTriggerName();
      const scopeComponentLabel = activeRuntimeScope.scopeKind === "section" ? "Section" : "Group";
      return [
        preset({
          id: `${activeRuntimeScope.scopeKind}-emit-event`,
          label: `Dispatch ${activeRuntimeScope.scopeKind} lifecycle event`,
          description: `Broadcast when this ${activeRuntimeScope.scopeKind} scope changes its lifecycle state.`,
          category: "events",
          componentLabel: scopeComponentLabel,
          triggerName,
          actionSummary: "Dispatch event",
          actionKinds: ["dispatch_event"],
          create: () =>
            createRuntimeListener(triggerName, [
              createRuntimeAction("dispatch_event", {
                ...defaultRuntimeActionConfigForScope("dispatch_event"),
                payload: createSourceEventPayload(),
              }),
            ]),
        }),
        preset({
          id: `${activeRuntimeScope.scopeKind}-host-sync`,
          label: `Sync ${activeRuntimeScope.scopeKind} with host`,
          description: `Request a host sync for this selected ${activeRuntimeScope.scopeKind} scope.`,
          category: "data",
          componentLabel: scopeComponentLabel,
          triggerName,
          actionSummary: "Request host sync",
          actionKinds: ["host_action"],
          create: () =>
            createRuntimeListener(triggerName, [
              createRuntimeAction("host_action", {
                ...defaultRuntimeActionConfigForScope("host_action"),
                payload: createSourceEventPayload(),
              }),
            ]),
        }),
      ];
    }
    return [];
  }, [
    activeRuntimeScope,
    activeBuilderField,
    builderFieldOptions,
    builderNodeOptions,
    builderStepOptions,
    selectedAuthoring,
  ]);

  function createBehaviorStudioAnchor(element: HTMLElement | null): BehaviorStudioAnchor | null {
    if (!element || typeof window === "undefined" || window.innerWidth < 760) {
      return null;
    }
    const anchorElement = element.closest("[data-behavior-toolbar-anchor]");
    const surfaceElement = element.closest("[data-behavior-studio-surface]");
    const rect = element.getBoundingClientRect();
    const toolbarRect = anchorElement instanceof HTMLElement ? anchorElement.getBoundingClientRect() : rect;
    const surfaceRect = surfaceElement instanceof HTMLElement ? surfaceElement.getBoundingClientRect() : toolbarRect;
    return {
      bottom: toolbarRect.bottom,
      centerX: surfaceRect.left + surfaceRect.width / 2,
      pointerX: toolbarRect.left + toolbarRect.width / 2,
      top: toolbarRect.top,
      width: surfaceRect.width,
    };
  }

  function behaviorStudioUsesWorkspaceShell() {
    return (
      behaviorStudioMode === "create" ||
      behaviorStudioMode === "event" ||
      behaviorStudioMode === "listener" ||
      behaviorStudioMode === "action" ||
      behaviorStudioMode === "graph" ||
      (behaviorStudioMode === "test" && behaviorStudioView === "advanced" && behaviorStudioAnchor === null) ||
      (behaviorStudioMode === "manage" && behaviorStudioManagerMode === "index" && behaviorStudioAnchor === null)
    );
  }

  function behaviorStudioEstimatedSize() {
    if (typeof window === "undefined") {
      return { width: 896, height: 624 };
    }
    const usesWorkspaceShell = behaviorStudioUsesWorkspaceShell();
    const viewportGutter = window.innerWidth < 760 ? 16 : 32;
    const width =
      behaviorStudioMode === "graph"
        ? 1120
        : behaviorStudioMode === "test" && behaviorStudioView === "advanced" && behaviorStudioAnchor === null
          ? 960
          : usesWorkspaceShell
            ? 1120
            : 896;
    const height =
      behaviorStudioMode === "graph"
        ? Math.min(window.innerHeight * 0.86, 760)
        : behaviorStudioMode === "test" && behaviorStudioView === "advanced" && behaviorStudioAnchor === null
          ? Math.min(window.innerHeight * 0.82, 672)
          : usesWorkspaceShell
            ? Math.min(window.innerHeight * 0.84, 736)
            : Math.min(window.innerHeight * 0.78, 624);

    return {
      width: Math.min(width, window.innerWidth - viewportGutter),
      height: Math.min(height, window.innerHeight - viewportGutter),
    };
  }

  function behaviorStudioPositionLayout(): BehaviorStudioPositionLayout {
    if (typeof window === "undefined") {
      return { anchored: false, placement: "center" };
    }
    const shellSize = behaviorStudioEstimatedSize();
    return {
      dialogStyle: {
        height: shellSize.height,
        transformOrigin: "center",
        width: shellSize.width,
      },
      anchored: false,
      placement: "center",
    };
  }

  function openBehaviorStudio(
    view: BehaviorStudioView = "studio",
    mode?: BehaviorStudioMode,
    anchor: BehaviorStudioAnchor | null = null,
  ) {
    setEditingListenerId(null);
    behaviorStudioReturnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setBehaviorStudioView(view);
    setBehaviorStudioAnchor(anchor);
    setBehaviorStudioMode(mode ?? (view === "advanced" ? "graph" : "event"));
    if (view === "advanced") {
      setBehaviorStudioCreating(false);
      setBehaviorWorkspaceMode("authoring");
    } else if (!isBehaviorStudioCreating) {
      setBehaviorStudioManagerMode("all");
    }
    setBehaviorStudioOpen(true);
    setInspectorTab("behavior");
  }

  function closeBehaviorStudio() {
    setBehaviorStudioOpen(false);
    setBehaviorFocusTarget(null);
    setBehaviorStudioCreating(false);
    setBehaviorCreationPath("choice");
    setEditingBehaviorEventId(null);
    setPendingBehaviorEventEditId(null);
    setBehaviorStudioAnchor(null);
  }

  function defaultBehaviorTriggerName() {
    if (activeRuntimeScope?.scopeKind === "component") {
      return "component.click";
    }
    if (activeRuntimeScope?.scopeKind === "field") {
      return runtimeFieldTriggerSuggestions(activeBuilderField)[0] ?? "field.change";
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

  function openBehaviorBehaviorManager() {
    setEditingListenerId(null);
    setBehaviorStudioCreating(false);
    setBehaviorStudioAnchor(null);
    setBehaviorStudioMode("manage");
    setBehaviorStudioManagerMode("index");
    setBehaviorStudioView("studio");
    setBehaviorStudioOpen(true);
    setInspectorTab("behavior");
  }

  function openBehaviorStudioEventSection() {
    setBehaviorStudioCreating(true);
    setBehaviorCreationPath("event");
    setSelectedBehaviorNode(null);
    setBehaviorStudioMode("event");
    setBehaviorStudioView("studio");
  }

  function openBehaviorStudioListenerSection() {
    setBehaviorStudioCreating(true);
    setSelectedBehaviorNode(null);
    beginBehaviorListenerCreationPath();
    setBehaviorStudioMode("listener");
    setBehaviorStudioView("studio");
  }

  function openBehaviorStudioActionSection() {
    setBehaviorStudioCreating(false);
    setBehaviorFocusTarget(null);
    setBehaviorStudioMode("action");
    setBehaviorStudioView("studio");
  }

  function openBehaviorStudioTestSection() {
    setBehaviorStudioCreating(false);
    setBehaviorFocusTarget(null);
    setBehaviorStudioMode("test");
    setBehaviorStudioView("studio");
  }

  function openBehaviorNodeInStudio(node: BehaviorGraphSelection, ruleIndex?: number | null) {
    setEditingListenerId(null);
    setBehaviorStudioCreating(false);
    setBehaviorStudioAnchor(null);
    setBehaviorStudioManagerMode(node.kind === "rule" ? "conditions" : "flows");
    setEditingRuleIndex(node.kind === "rule" ? (ruleIndex ?? null) : null);
    setSelectedBehaviorNode(node);
    setBehaviorStudioMode(node.kind === "listener" ? "action" : "manage");
    setBehaviorStudioView("studio");
    setBehaviorStudioOpen(true);
    setInspectorTab("behavior");
  }

  function openBehaviorObjectInBehaviorManager(options: {
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
    setBehaviorStudioCreating(false);
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

  function runtimeTargetForCurrentSelection(): NonNullable<RuntimeEventEnvelope["target"]> {
    const nodeId =
      selectedAuthoring?.kind === "field"
        ? selectedAuthoring.fieldId
        : selectedAuthoring?.kind === "group"
          ? selectedAuthoring.groupId
          : selectedAuthoring?.kind === "section"
            ? selectedAuthoring.sectionId
            : selectedAuthoring?.kind === "step"
              ? selectedAuthoring.stepId
              : (activeDocument?.id ?? "unknown-form");
    const nodeType =
      selectedAuthoring?.kind === "field"
        ? runtimeNodeTypeForAuthoringField(activeBuilderField)
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
      nodeKey: runtimeEventSourceCandidateById.get(nodeId)?.dispatchKey ?? null,
      nodeType,
    } as NonNullable<RuntimeEventEnvelope["target"]>;
  }

  function handleTestSelectedRule(rule: LegacyConditionalRule | null) {
    if (!activeDocument || !rule) {
      setMessage("Select a behavior before running a targeted behavior test.");
      return;
    }
    const sourceField = findAuthoringFieldById(activeDocument, rule.whenFieldId);
    const nextValue =
      sourceField?.semanticType === "checkbox" && rule.operator === "contains"
        ? [rule.expectedValue ?? fieldFirstOptionValue(sourceField)]
        : (rule.expectedValue ?? "");
    dispatchRuntimeEvent({
      type: "field.change",
      version: "1.0",
      target: {
        runtimeId: "builder-simulator",
        formId: activeDocument.id,
        projectId: activeProjectDetail?.project.id ?? null,
        nodeId: rule.whenFieldId,
        nodeKey: sourceField?.dispatchKey ?? null,
        nodeType: "field",
      },
      source: {
        runtimeId: "builder-simulator",
        formId: activeDocument.id,
        projectId: activeProjectDetail?.project.id ?? null,
        nodeId: rule.whenFieldId,
        nodeKey: sourceField?.dispatchKey ?? null,
        nodeType: "field",
      },
      payload: {
        eventType: "field.change",
        sourceNodeId: rule.whenFieldId,
        sourceNodeKey: sourceField?.dispatchKey ?? null,
        sourceNodeType: "field",
        targetNodeId: rule.whenFieldId,
        targetNodeKey: sourceField?.dispatchKey ?? null,
        targetNodeType: "field",
        metadata: "{}",
        fieldId: rule.whenFieldId,
        nextValue,
        testedRuleId: rule.ruleId,
      },
      correlationId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    });
    setSelectedRuntimeEvidenceKey(null);
    setMessage("Behavior test dispatched a field.change event through the simulator.");
  }

  function resolveListenerTestSource(listener: RuntimeListenerDefinition): RuntimeEventSourceCandidate | null {
    return (
      (listener.eventSourceNodeId ? (runtimeEventSourceCandidateById.get(listener.eventSourceNodeId) ?? null) : null) ??
      (listener.dispatcherId ? (runtimeEventSourceCandidateById.get(listener.dispatcherId) ?? null) : null) ??
      (listener.targetNodeId ? (runtimeEventSourceCandidateById.get(listener.targetNodeId) ?? null) : null) ??
      activeRuntimeTarget ??
      (activeDocument ? (runtimeEventSourceCandidateById.get(activeDocument.id) ?? null) : null)
    );
  }

  function defaultListenerTestValue(listener: RuntimeListenerDefinition, sourceField: AuthoringField | null): unknown {
    if (!sourceField || sourceField.rendererHints.component === "button" || sourceField.semanticType === "statement") {
      return "";
    }
    const conditionValue = listener.conditions.find(
      (condition) =>
        condition.enabled !== false &&
        condition.source.kind === "field_value" &&
        condition.source.fieldId === sourceField.id &&
        condition.expectedValue !== undefined &&
        condition.expectedValue !== null &&
        String(condition.expectedValue).length > 0,
    )?.expectedValue;
    const optionValue = conditionValue !== undefined ? String(conditionValue) : fieldFirstOptionValue(sourceField);
    if (sourceField.semanticType === "checkbox") {
      return optionValue ? [optionValue] : [];
    }
    if (sourceField.semanticType === "radio" || sourceField.semanticType === "select") {
      return optionValue;
    }
    return conditionValue !== undefined ? String(conditionValue) : "Test value";
  }

  function listenerTestValue(listener: RuntimeListenerDefinition, sourceField: AuthoringField | null): unknown {
    return listenerTestValues[listener.id] ?? defaultListenerTestValue(listener, sourceField);
  }

  function updateListenerTestValue(listenerId: string, nextValue: unknown) {
    setListenerTestValues((current) => ({
      ...current,
      [listenerId]: nextValue,
    }));
  }

  function buildGuidedListenerTestEvent(listener: RuntimeListenerDefinition): RuntimeEventEnvelope | null {
    if (!activeDocument) {
      return null;
    }
    const source = resolveListenerTestSource(listener);
    if (!source) {
      return null;
    }
    const sourceField =
      source.nodeType === "field" || source.nodeType === "component"
        ? findAuthoringFieldById(activeDocument, source.id)
        : null;
    const nextValue = listenerTestValue(listener, sourceField);
    const eventType = getRuntimeListenerEventType(listener);
    const sourceEvent = source.events.find((eventOption) => eventOption.type === eventType);
    const target: NonNullable<RuntimeEventEnvelope["target"]> = {
      runtimeId: "builder-simulator",
      formId: activeDocument.id,
      projectId: activeProjectDetail?.project.id ?? null,
      nodeId: source.id,
      nodeKey: source.dispatchKey ?? null,
      nodeType: source.nodeType,
    };
    const payload: Record<string, unknown> = {
      listenerId: listener.id,
      testOrigin: "behavior_studio",
      eventType,
      sourceNodeId: source.id,
      sourceNodeKey: source.dispatchKey ?? null,
      sourceNodeType: source.nodeType,
      sourceLabel: source.label,
      targetNodeId: target.nodeId,
      targetNodeKey: target.nodeKey ?? null,
      targetNodeType: target.nodeType,
      metadata: "{}",
      nextValue,
      value: nextValue,
    };
    if (sourceField) {
      const selectedValues =
        sourceField.semanticType === "checkbox"
          ? Array.isArray(nextValue)
            ? nextValue
            : nextValue
              ? [String(nextValue)]
              : []
          : undefined;
      payload.fieldId = sourceField.id;
      payload.componentType = sourceField.semanticType;
      payload.selectionMode = fieldSelectionMode(sourceField);
      payload.selectedValues = selectedValues;
      payload.selectedValue =
        sourceField.semanticType === "radio" || sourceField.semanticType === "select" ? nextValue : undefined;
      payload.changedOption = Array.isArray(selectedValues)
        ? (selectedValues[0] ?? null)
        : fieldFirstOptionValue(sourceField) || null;
    }
    return {
      type: eventType,
      version: "1.0",
      target,
      source: target,
      bubbles: sourceEvent?.bubbles ?? true,
      payload,
      correlationId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };
  }

  function handleRunGuidedListenerTest(listener: RuntimeListenerDefinition | null) {
    if (!activeDocument || !listener) {
      setMessage("Select a behavior before running a targeted behavior test.");
      return;
    }
    const event = buildGuidedListenerTestEvent(listener);
    if (!event) {
      setMessage("Choose a source item before running this behavior test.");
      return;
    }
    try {
      const report = runtimeEngineRef.current.dispatchWithReport(event);
      runtimeSessionRef.current = report.stateAfter;
      setRuntimeSessionState(report.stateAfter);
      setLastDispatchReport(report);
      setSelectedRuntimeEvidenceKey(null);
      const selectedListenerReport = report.listeners.find((entry) => entry.listenerId === listener.id);
      if (!selectedListenerReport) {
        setMessage(
          `${event.type} dispatched from ${event.target?.nodeKey ?? event.target?.nodeId ?? "the source"}, but this behavior was not reached.`,
        );
        return;
      }
      if (!selectedListenerReport.matched) {
        setMessage(
          `${event.type} reached the behavior but did not run because ${formatLabel(selectedListenerReport.skippedReason ?? "conditions_failed")}.`,
        );
        return;
      }
      setMessage(
        `${event.type} reached the behavior and ran ${selectedListenerReport.actions.length} action${selectedListenerReport.actions.length === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Guided behavior test failed.");
    }
  }

  function handleTestSelectedChain(listener: RuntimeListenerDefinition | null) {
    handleRunGuidedListenerTest(listener);
  }

  function eventFlowOptionsForSource(source: RuntimeEventSourceCandidate): RuntimeSourceEventOption[] {
    const options = new Map<string, RuntimeSourceEventOption>();
    source.events.forEach((eventOption) => {
      options.set(eventOption.type, eventOption);
    });
    source.eventDefinitions.forEach((eventDefinition) => {
      const eventType = runtimeEventDefinitionType(eventDefinition);
      if (!eventType || options.has(eventType)) {
        return;
      }
      options.set(eventType, {
        type: eventType,
        label: formatLabel(eventType),
        bubbles: eventDefinition.bubbles ?? runtimeCoreEventType(eventType)?.bubbles ?? true,
        description: eventDefinition.description ?? null,
      });
    });
    return Array.from(options.values());
  }

  function defaultEventFlowPayloadValue(
    field: RuntimePayloadField,
    source: RuntimeEventSourceCandidate,
    sourceField: AuthoringField | null,
    eventType: string,
    target: RuntimeEventSourceCandidate | null,
  ): string {
    const firstOptionValue = fieldFirstOptionValue(sourceField);
    const authoredExampleValue = source.eventDefinitions.find(
      (eventDefinition) => runtimeEventDefinitionType(eventDefinition) === eventType,
    )?.payloadShape?.example?.[field.name];
    if (authoredExampleValue !== undefined) {
      return typeof authoredExampleValue === "string"
        ? authoredExampleValue
        : JSON.stringify(authoredExampleValue, null, 2);
    }
    switch (field.name) {
      case "eventType":
        return eventType;
      case "fieldId":
      case "componentId":
      case "nodeId":
      case "sourceNodeId":
        return source.id;
      case "targetNodeId":
        return target?.id ?? source.id;
      case "fieldKey":
      case "componentKey":
      case "nodeKey":
      case "sourceNodeKey":
        return source.dispatchKey ?? "";
      case "targetNodeKey":
        return target?.dispatchKey ?? "";
      case "fieldLabel":
      case "label":
      case "sourceLabel":
        return source.label;
      case "nodeType":
      case "sourceNodeType":
      case "componentType":
        return sourceField?.semanticType ?? source.nodeType;
      case "targetNodeType":
        return target?.nodeType ?? source.nodeType;
      case "metadata":
        return "{}";
      case "selectedValue":
      case "changedOption":
      case "optionValue":
      case "value":
      case "nextValue":
        return firstOptionValue || (field.valueType === "number" ? "0" : "Test value");
      case "selectedValues":
        return JSON.stringify(firstOptionValue ? [firstOptionValue] : []);
      default:
        if (field.valueType === "boolean") {
          return "false";
        }
        if (field.valueType === "number") {
          return "0";
        }
        if (field.valueType === "object") {
          return "{}";
        }
        if (field.valueType === "array") {
          return "[]";
        }
        return "";
    }
  }

  function eventFlowPayloadRawValue(
    field: RuntimePayloadField,
    source: RuntimeEventSourceCandidate,
    sourceField: AuthoringField | null,
    eventType: string,
    target: RuntimeEventSourceCandidate | null,
  ): string {
    return (
      eventFlowPayloadValues[field.name] ?? defaultEventFlowPayloadValue(field, source, sourceField, eventType, target)
    );
  }

  function coerceEventFlowPayloadValue(field: RuntimePayloadField, rawValue: string): unknown {
    if (field.valueType === "boolean") {
      return rawValue === "true";
    }
    if (field.valueType === "number") {
      const nextValue = Number(rawValue);
      if (Number.isNaN(nextValue)) {
        throw new Error(`${field.label ?? field.name} must be a number.`);
      }
      return nextValue;
    }
    if (field.valueType === "object" || field.valueType === "array") {
      try {
        const parsed = JSON.parse(rawValue || (field.valueType === "array" ? "[]" : "{}"));
        if (field.valueType === "array" && !Array.isArray(parsed)) {
          throw new Error("Expected an array.");
        }
        if (field.valueType === "object" && (!isRecord(parsed) || Array.isArray(parsed))) {
          throw new Error("Expected an object.");
        }
        return parsed;
      } catch (error) {
        throw new Error(
          `${field.label ?? field.name} must be valid JSON${error instanceof Error ? `: ${error.message}` : "."}`,
        );
      }
    }
    return rawValue;
  }

  function buildEventFlowPayload(
    source: RuntimeEventSourceCandidate,
    eventType: string,
    payloadFields: RuntimePayloadField[],
  ): Record<string, unknown> {
    const sourceField =
      activeDocument && (source.nodeType === "field" || source.nodeType === "component")
        ? findAuthoringFieldById(activeDocument, source.id)
        : null;
    const target = activeRuntimeTarget ?? source;
    const payload = Object.fromEntries(
      payloadFields.map((field) => [
        field.name,
        coerceEventFlowPayloadValue(field, eventFlowPayloadRawValue(field, source, sourceField, eventType, target)),
      ]),
    );
    payload.eventType ??= eventType;
    payload.sourceNodeId ??= source.id;
    payload.sourceNodeKey ??= source.dispatchKey ?? null;
    payload.sourceNodeType ??= source.nodeType;
    payload.sourceLabel ??= source.label;
    payload.targetNodeId ??= target.id;
    payload.targetNodeKey ??= target.dispatchKey ?? null;
    payload.targetNodeType ??= target.nodeType;
    payload.metadata ??= "{}";
    if (sourceField) {
      const firstOptionValue = fieldFirstOptionValue(sourceField);
      payload.fieldId ??= sourceField.id;
      payload.fieldKey ??= sourceField.dispatchKey ?? null;
      payload.componentType ??= sourceField.semanticType;
      payload.value ??= firstOptionValue || "Test value";
      payload.nextValue ??= payload.value;
      if (sourceField.semanticType === "radio" || sourceField.semanticType === "select") {
        payload.selectedValue ??= firstOptionValue;
      }
      if (sourceField.semanticType === "checkbox") {
        payload.selectedValues ??= firstOptionValue ? [firstOptionValue] : [];
      }
      payload.changedOption ??= firstOptionValue || null;
    }
    return payload;
  }

  function buildEventFlowTestEvent(
    source: RuntimeEventSourceCandidate,
    eventType: string,
    payloadFields: RuntimePayloadField[],
  ): RuntimeEventEnvelope | null {
    if (!activeDocument || !eventType) {
      return null;
    }
    const eventOption = source.events.find((candidate) => candidate.type === eventType);
    const target: NonNullable<RuntimeEventEnvelope["target"]> = {
      runtimeId: "builder-simulator",
      formId: activeDocument.id,
      projectId: activeProjectDetail?.project.id ?? null,
      nodeId: source.id,
      nodeKey: source.dispatchKey ?? null,
      nodeType: source.nodeType,
    };
    return {
      type: eventType,
      version: "1.0",
      target,
      source: target,
      bubbles: eventOption?.bubbles ?? runtimeEventBubblesForSource(source, eventType),
      payload: buildEventFlowPayload(source, eventType, payloadFields),
      correlationId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };
  }

  function runEventFlowDispatch(
    source: RuntimeEventSourceCandidate,
    eventType: string,
    payloadFields: RuntimePayloadField[],
  ) {
    const event = buildEventFlowTestEvent(source, eventType, payloadFields);
    if (!event) {
      setMessage("Choose an event source and event type before firing the event.");
      return;
    }
    try {
      const report = runtimeEngineRef.current.dispatchWithReport(event);
      runtimeSessionRef.current = report.stateAfter;
      setRuntimeSessionState(report.stateAfter);
      setLastDispatchReport(report);
      setSelectedRuntimeEvidenceKey(null);
      const matchedCount = report.listeners.filter((listener) => listener.matched).length;
      setErrorMessage(null);
      setMessage(
        `${event.type} fired from ${source.label}; ${matchedCount} of ${report.listeners.length} listener${report.listeners.length === 1 ? "" : "s"} ran.`,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Test dispatch failed.");
    }
  }

  function saveEventFlowEvent(
    source: RuntimeEventSourceCandidate,
    eventType: string,
    payloadFields: RuntimePayloadField[],
  ): boolean {
    const eventIssue = validateRuntimeIdentifier(eventType, "Event type", defaultBehaviorTriggerName());
    const payloadIssue = payloadFields.find((field) => validateRuntimeIdentifier(field.name, "Payload field", "value"));
    if (eventIssue) {
      setErrorMessage(eventIssue);
      return false;
    }
    if (payloadIssue) {
      setErrorMessage(validateRuntimeIdentifier(payloadIssue.name, "Payload field", "value"));
      return false;
    }
    const selection = authoringSelectionForRuntimeCandidate(source);
    const scope: RuntimeEditorScope = {
      scopeKind: source.nodeType === "component" ? "component" : source.nodeType,
      label: source.label,
      description: "",
      eventSources: [],
      listeners: [],
    };
    let status: "created" | "updated" | null = null;
    updateAuthoringDocument((document) => {
      const eventSources = mutableRuntimeEventSourcesForSelection(document, selection);
      if (!eventSources) {
        return;
      }
      status = upsertRuntimeEventSource(
        eventSources,
        createRuntimeEventSource(eventType, scope, source.id, {
          bubbles: runtimeEventBubblesForSource(source, eventType),
          payloadShape: createRuntimePayloadShapeFromFields(payloadFields),
          description: runtimeCoreEventType(eventType)?.description ?? null,
        }),
      );
    });
    if (!status) {
      setErrorMessage("Could not save the event on the selected source.");
      return false;
    }
    setEventFlowSourceId(source.id);
    setEventFlowEventType(eventType);
    setErrorMessage(null);
    setMessage(`${formatLabel(eventType)} event ${status} for ${source.label}.`);
    return true;
  }

  function addEventFlowListenerReaction(
    source: RuntimeEventSourceCandidate,
    eventType: string,
    payloadFields: RuntimePayloadField[],
  ) {
    if (!activeRuntimeTarget) {
      setMessage("Select the item that should react before adding a listener.");
      return;
    }
    if (!source.eventDefinitions.some((eventDefinition) => runtimeEventDefinitionType(eventDefinition) === eventType)) {
      const saved = saveEventFlowEvent(source, eventType, payloadFields);
      if (!saved) {
        return;
      }
    }
    createAuthoredEventBehaviorListener(source, eventType);
  }

  function addEventFlowPayloadCondition(listener: RuntimeListenerDefinition, payloadFieldName: string) {
    updateRuntimeListener(listener.id, (current) => {
      current.conditions.push(
        createEventPayloadCondition(payloadFieldName, "exists", undefined, `${formatLabel(payloadFieldName)} exists`),
      );
    });
    setSelectedBehaviorNode({ kind: "listener", listenerId: listener.id, phase: "trigger" });
    setMessage(`${formatLabel(payloadFieldName)} payload check added.`);
  }

  function renderGuidedListenerValueControl(listener: RuntimeListenerDefinition, sourceField: AuthoringField | null) {
    if (!sourceField || sourceField.rendererHints.component === "button" || sourceField.semanticType === "statement") {
      return (
        <div className="rounded-[0.85rem] border border-soft bg-slate-50 px-3 py-2 text-sm text-slate-500">
          This event source does not need a field value.
        </div>
      );
    }
    const value = listenerTestValue(listener, sourceField);
    if (sourceField.semanticType === "checkbox") {
      const selectedValues = Array.isArray(value) ? value.map((entry) => String(entry)) : [];
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {sourceField.options.map((option) => {
            const optionValue = option.value || option.label;
            return (
              <label
                key={`${listener.id}-test-checkbox-${optionValue}`}
                className="flex items-center gap-2 rounded-[0.8rem] border border-soft bg-white px-3 py-2 text-sm text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={selectedValues.includes(optionValue)}
                  onChange={(event) => {
                    const nextValues = event.target.checked
                      ? [...selectedValues, optionValue]
                      : selectedValues.filter((entry) => entry !== optionValue);
                    updateListenerTestValue(listener.id, nextValues);
                  }}
                />
                <span>{option.label || optionValue}</span>
              </label>
            );
          })}
        </div>
      );
    }
    if (sourceField.semanticType === "radio" || sourceField.semanticType === "select") {
      return (
        <select
          value={typeof value === "string" ? value : ""}
          onChange={(event) => updateListenerTestValue(listener.id, event.target.value)}
          className="w-full rounded-2xl border border-soft bg-white px-4 py-3 text-sm text-slate-800"
        >
          <option value="">No selection</option>
          {sourceField.options.map((option) => {
            const optionValue = option.value || option.label;
            return (
              <option key={`${listener.id}-test-option-${optionValue}`} value={optionValue}>
                {option.label || optionValue}
              </option>
            );
          })}
        </select>
      );
    }
    return (
      <input
        value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
        onChange={(event) => updateListenerTestValue(listener.id, event.target.value)}
        className="w-full rounded-2xl border border-soft bg-white px-4 py-3 text-sm text-slate-800"
      />
    );
  }

  function beginBehaviorStudioCreation(anchor: BehaviorStudioAnchor | null = null) {
    setBehaviorStudioCreating(true);
    setBehaviorCreationPath("choice");
    setBehaviorPresetSearch("");
    setBehaviorPresetCategory("recommended");
    setBehaviorEventAdvancedOpen(false);
    setEditingBehaviorEventId(null);
    setBehaviorListenerShowRawEvents(false);
    setBehaviorListenerUseCapture(false);
    setBehaviorListenerPriority(0);
    setSelectedBehaviorNode(null);
    setEditingRuleIndex(null);
    setBehaviorFocusTarget(null);
    setBehaviorStudioManagerMode("all");
    openBehaviorStudio("studio", "event", anchor);
  }

  function openBehaviorStudioAddBehavior(anchor: BehaviorStudioAnchor | null = null) {
    setBehaviorStudioCreating(true);
    setBehaviorCreationPath("event");
    setEventFlowSourceId(activeRuntimeTarget?.id ?? "");
    setEventFlowEventType("");
    setEventFlowPayloadValues({});
    setLastDispatchReport(null);
    setSelectedBehaviorNode(null);
    setEditingRuleIndex(null);
    setBehaviorFocusTarget(null);
    openBehaviorStudio("studio", "event", anchor);
  }

  function openBehaviorStudioReactToAnotherItem(anchor: BehaviorStudioAnchor | null = null) {
    beginBehaviorStudioCreation(anchor);
    beginBehaviorListenerCreationPath();
  }

  function beginBehaviorEventCreationPath(eventDefinition?: RuntimeEventDefinition | null) {
    if (!activeRuntimeScope) {
      setMessage("Select a form, button, or interactive field before adding an event.");
      return;
    }
    const eventOption = eventDefinition
      ? (runtimeEventOptionsForScope(activeRuntimeScope, activeBuilderField).find(
          (option) => option.type === runtimeEventDefinitionType(eventDefinition),
        ) ?? null)
      : defaultRuntimeEventOptionForNewDefinition(activeRuntimeScope, activeBuilderField);
    const eventType = runtimeEventDefinitionType(eventDefinition) || eventOption?.type || defaultBehaviorTriggerName();
    const existingCore = runtimeCoreEventType(eventType);
    setBehaviorCreationPath("event");
    setBehaviorStudioCreating(true);
    setEditingBehaviorEventId(eventDefinition?.id ?? null);
    setBehaviorEventType(eventType);
    setBehaviorEventBubbles(eventDefinition?.bubbles ?? eventOption?.bubbles ?? existingCore?.bubbles ?? true);
    setBehaviorEventDescription(
      eventDefinition?.description ?? eventOption?.description ?? existingCore?.description ?? "",
    );
    setBehaviorEventPayloadFields(
      eventDefinition?.payloadShape?.fields?.length
        ? mergeRuntimePayloadFieldsWithStandardFields(eventDefinition.payloadShape.fields)
        : runtimePayloadFieldsForEventType(eventType),
    );
    const metadataExample = eventDefinition?.payloadShape?.example?.metadata;
    setBehaviorEventMetadataExample(
      typeof metadataExample === "string"
        ? metadataExample
        : metadataExample === undefined
          ? "{}"
          : JSON.stringify(metadataExample, null, 2),
    );
    setBehaviorEventAdvancedOpen(Boolean(eventDefinition));
  }

  function beginBehaviorListenerCreationPath() {
    const firstType =
      (["field", "component", "form", "step", "section", "group"] as BehaviorListenerSourceType[]).find((nodeType) =>
        runtimeEventSourceCandidates.some(
          (candidate) => candidate.nodeType === nodeType && candidate.eventDefinitions.length > 0,
        ),
      ) ?? "field";
    setBehaviorCreationPath("listener");
    setBehaviorListenerSourceType(firstType);
    setBehaviorListenerShowRawEvents(false);
    setBehaviorListenerUseCapture(false);
    setBehaviorListenerPriority(0);
    const firstEvent =
      runtimeEventSourceCandidates
        .filter((candidate) => candidate.nodeType === firstType)
        .flatMap((candidate) => candidate.eventDefinitions.map(runtimeEventDefinitionType))
        .find(Boolean) ?? "";
    setBehaviorListenerEventType(firstEvent);
    const firstSource =
      runtimeEventSourceCandidates.find(
        (candidate) =>
          candidate.nodeType === firstType &&
          candidate.eventDefinitions.some(
            (eventDefinition) => runtimeEventDefinitionType(eventDefinition) === firstEvent,
          ),
      )?.id ?? "";
    setBehaviorListenerSourceId(firstSource);
  }

  function runtimeActionChainTemplatesForListener(listener: RuntimeListenerDefinition): RuntimeActionChainTemplate[] {
    const componentLabel = behaviorFieldComponentLabel(activeBuilderField);
    const componentLabelLower = componentLabel.toLowerCase();
    const valueNoun = fieldValueNoun(activeBuilderField);
    const templates: RuntimeActionChainTemplate[] = [
      {
        id: `${listener.id}-emit-host`,
        label:
          activeRuntimeScope?.scopeKind === "field" && activeBuilderField?.semanticType === "checkbox"
            ? "Dispatch then sync checkbox selections"
            : "Dispatch then request host action",
        description:
          activeRuntimeScope?.scopeKind === "field"
            ? `Broadcast this ${componentLabelLower} event first, then pass the ${valueNoun} context to a host handler.`
            : "Broadcast a runtime event first, then pass the resolved payload to a host handler.",
        category: "data",
        actionSummary:
          activeRuntimeScope?.scopeKind === "field" && activeBuilderField?.semanticType === "checkbox"
            ? "Dispatch checkbox event + sync host"
            : "Dispatch event + request host",
        createActions: () => [
          createRuntimeAction("dispatch_event", {
            ...defaultRuntimeActionConfigForScope("dispatch_event", { listener }),
            payload:
              activeRuntimeScope?.scopeKind === "field"
                ? createFieldChangedPayload(activeBuilderField)
                : createSourceEventPayload(),
          }),
          createRuntimeAction("host_action", {
            ...defaultRuntimeActionConfigForScope("host_action", { listener }),
            payload:
              activeRuntimeScope?.scopeKind === "field"
                ? createHostLookupPayload(activeBuilderField)
                : createSourceEventPayload(),
          }),
        ],
      },
    ];
    if (activeRuntimeScope?.scopeKind === "component") {
      templates.unshift({
        id: `${listener.id}-next-emit`,
        label: "Continue then dispatch event",
        description: "Advance the workflow and immediately fire a follow-up runtime event from the same chain.",
        category: "navigation",
        actionSummary: "Continue + dispatch event",
        createActions: () => [
          createRuntimeAction("go_to_next_step"),
          createRuntimeAction("dispatch_event", {
            ...defaultRuntimeActionConfigForScope("dispatch_event", { listener }),
            payload: createSourceEventPayload(),
          }),
        ],
      });
    }
    if (activeRuntimeScope?.scopeKind === "field") {
      templates.push({
        id: `${listener.id}-show-require`,
        label: `Show then require from ${valueNoun}`,
        description: `Reveal the target node and mark it required as one grouped reaction to this ${componentLabelLower} trigger.`,
        category: "visibility",
        actionSummary: "Show target + mark required",
        createActions: () => [
          createRuntimeAction("show_node", defaultRuntimeActionConfigForScope("show_node", { listener })),
          createRuntimeAction("mark_required", defaultRuntimeActionConfigForScope("mark_required", { listener })),
        ],
      });
      templates.push({
        id: `${listener.id}-clear-dependent`,
        label:
          activeBuilderField?.semanticType === "checkbox"
            ? "Clear dependent answer from checkbox"
            : "Clear dependent answer",
        description: `Clear a target field value as a grouped reaction to this ${componentLabelLower} event.`,
        category: "data",
        actionSummary: "Clear field value",
        createActions: () => [
          createRuntimeAction(
            "clear_field_value",
            defaultRuntimeActionConfigForScope("clear_field_value", { listener }),
          ),
        ],
      });
    }
    if (activeRuntimeScope?.scopeKind === "form") {
      templates.unshift({
        id: `${listener.id}-submit-audit`,
        label: "Submit dispatch then host audit",
        description: "Keep the authored submit event and host audit request together in one chain.",
        category: "validation",
        actionSummary: "Dispatch submit + host submit",
        createActions: () => [
          createRuntimeAction("dispatch_event", {
            eventType: "form.submit.dispatched",
            payload: createFormSubmitPayload(),
          }),
          createRuntimeAction("host_action", { handlerKey: "host.submit", payload: createFormSubmitPayload() }),
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
        activeProjectDetailRef.current = null;
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
      const documentToImport = cloneDocument(document);
      ensureDocumentDispatchKeys(documentToImport);
      const detail = await importProjectDocument(documentToImport);
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
      const documentToSave = cloneDocument(activeProjectDetail.document);
      ensureDocumentDispatchKeys(documentToSave);
      const detail = await saveProjectDocument(activeProjectDetail.project.id, documentToSave);
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
    const revisionDocument = cloneDocument(revision.document);
    ensureDocumentDispatchKeys(revisionDocument);
    const nextDetail = {
      ...activeProjectDetail,
      document: revisionDocument,
      project: {
        ...activeProjectDetail.project,
        name: revisionDocument.title,
      },
    };
    activeProjectDetailRef.current = nextDetail;
    startTransition(() => {
      setActiveProjectDetail(nextDetail);
      setSelectedAuthoring(revisionDocument.steps[0] ? { kind: "step", stepId: revisionDocument.steps[0].id } : null);
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
    setMessage(
      `Opened revision snapshot from ${new Date(revision.createdAt).toLocaleString()}. Save to restore it as the current project document.`,
    );
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
    activeProjectDetailRef.current = null;
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
      setMessage(
        "Review complete. The project workspace is ready, and the imported PDF reference is now available from inside the builder.",
      );
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
      successMessage: openedRevisionView
        ? "Revision snapshot restored as the current project document."
        : "Project saved.",
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
        const documentToSave = cloneDocument(activeProjectDetail.document);
        ensureDocumentDispatchKeys(documentToSave);
        detail = await saveProjectDocument(activeProjectDetail.project.id, documentToSave);
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
    updateAuthoringDocument(
      (document) => {
        document.steps.push(nextStep);
      },
      { kind: "step", stepId: nextStep.id },
    );
  }

  function handleAddSectionToStep(stepId: string) {
    const nextSection = createSection();
    updateAuthoringDocument(
      (document) => {
        const step = document.steps.find((candidate) => candidate.id === stepId);
        step?.sections.push(nextSection);
      },
      { kind: "section", stepId, sectionId: nextSection.id },
    );
  }

  function handleAddGroupToSection(stepId: string, sectionId: string) {
    const nextGroup = createGroup();
    updateAuthoringDocument(
      (document) => {
        const step = document.steps.find((candidate) => candidate.id === stepId);
        const section = step?.sections.find((candidate) => candidate.id === sectionId);
        section?.groups.push(nextGroup);
      },
      { kind: "group", stepId, sectionId, groupId: nextGroup.id },
    );
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
    updateAuthoringDocument(
      (document) => {
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
      },
      {
        kind: "field",
        stepId,
        sectionId,
        ...(groupId ? { groupId } : {}),
        fieldId: nextField.id,
      },
    );
  }

  function handleRemoveStep(stepId: string) {
    if (!activeDocument) {
      return;
    }
    const index = activeDocument.steps.findIndex((step) => step.id === stepId);
    const nextStep = activeDocument.steps[index + 1] ?? activeDocument.steps[index - 1] ?? null;
    updateAuthoringDocument(
      (document) => {
        const currentIndex = document.steps.findIndex((step) => step.id === stepId);
        if (currentIndex >= 0) {
          document.steps.splice(currentIndex, 1);
        }
      },
      nextStep ? { kind: "step", stepId: nextStep.id } : null,
    );
  }

  function handleRemoveSection(stepId: string, sectionId: string) {
    const step = activeDocument?.steps.find((candidate) => candidate.id === stepId);
    const index = step?.sections.findIndex((section) => section.id === sectionId) ?? -1;
    const nextSection = index >= 0 ? (step?.sections[index + 1] ?? step?.sections[index - 1] ?? null) : null;
    updateAuthoringDocument(
      (document) => {
        const currentStep = document.steps.find((candidate) => candidate.id === stepId);
        const currentIndex = currentStep?.sections.findIndex((section) => section.id === sectionId) ?? -1;
        if (currentStep && currentIndex >= 0) {
          currentStep.sections.splice(currentIndex, 1);
        }
      },
      nextSection ? { kind: "section", stepId, sectionId: nextSection.id } : { kind: "step", stepId },
    );
  }

  function handleRemoveGroup(stepId: string, sectionId: string, groupId: string) {
    const section = activeDocument?.steps
      .find((candidate) => candidate.id === stepId)
      ?.sections.find((candidate) => candidate.id === sectionId);
    const index = section?.groups.findIndex((group) => group.id === groupId) ?? -1;
    const nextGroup = index >= 0 ? (section?.groups[index + 1] ?? section?.groups[index - 1] ?? null) : null;
    updateAuthoringDocument(
      (document) => {
        const currentSection = document.steps
          .find((candidate) => candidate.id === stepId)
          ?.sections.find((candidate) => candidate.id === sectionId);
        const currentIndex = currentSection?.groups.findIndex((group) => group.id === groupId) ?? -1;
        if (currentSection && currentIndex >= 0) {
          currentSection.groups.splice(currentIndex, 1);
        }
      },
      nextGroup ? { kind: "group", stepId, sectionId, groupId: nextGroup.id } : { kind: "section", stepId, sectionId },
    );
  }

  function handleRemoveField(stepId: string, sectionId: string, fieldId: string, groupId?: string) {
    const section = activeDocument?.steps
      .find((candidate) => candidate.id === stepId)
      ?.sections.find((candidate) => candidate.id === sectionId);
    const fields = groupId ? section?.groups.find((group) => group.id === groupId)?.fields : section?.fields;
    const index = fields?.findIndex((field) => field.id === fieldId) ?? -1;
    const nextField = index >= 0 ? (fields?.[index + 1] ?? fields?.[index - 1] ?? null) : null;
    updateAuthoringDocument(
      (document) => {
        const currentSection = document.steps
          .find((candidate) => candidate.id === stepId)
          ?.sections.find((candidate) => candidate.id === sectionId);
        const currentFields = groupId
          ? currentSection?.groups.find((group) => group.id === groupId)?.fields
          : currentSection?.fields;
        const currentIndex = currentFields?.findIndex((field) => field.id === fieldId) ?? -1;
        if (currentFields && currentIndex >= 0) {
          currentFields.splice(currentIndex, 1);
        }
      },
      nextField
        ? { kind: "field", stepId, sectionId, ...(groupId ? { groupId } : {}), fieldId: nextField.id }
        : groupId
          ? { kind: "group", stepId, sectionId, groupId }
          : { kind: "section", stepId, sectionId },
    );
  }

  function handleSelectionDragStart(event: DragEvent<HTMLElement>, payload: DragPayload) {
    event.stopPropagation();
    handledDropRef.current = false;
    activeDropTargetRef.current = null;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-form-builder-drag", JSON.stringify(payload));
    event.dataTransfer.setData("text/plain", payload.kind);
    setDragPayload(payload);
    setActiveDropTargetKey(null);
  }

  function dragPayloadFromTransfer(event: DragEvent<HTMLElement>): DragPayload | null {
    const rawPayload = event.dataTransfer.getData("application/x-form-builder-drag");
    if (!rawPayload) {
      return null;
    }
    try {
      const parsed = JSON.parse(rawPayload) as DragPayload;
      if (
        parsed &&
        (parsed.kind === "step" || parsed.kind === "section" || parsed.kind === "group" || parsed.kind === "field")
      ) {
        return parsed;
      }
    } catch {
      return null;
    }
    return null;
  }

  function currentDragPayload(event?: DragEvent<HTMLElement>): DragPayload | null {
    return dragPayload ?? (event ? dragPayloadFromTransfer(event) : null);
  }

  function clearDragInteraction() {
    setDragPayload(null);
    setActiveDropTargetKey(null);
    activeDropTargetRef.current = null;
  }

  function readDropTargetElement(
    element: Element | null,
  ): { element: HTMLElement; exact: boolean; target: DropTarget } | null {
    const targetElement =
      element instanceof HTMLElement ? element.closest<HTMLElement>("[data-authoring-drop-target]") : null;
    if (!targetElement) {
      return null;
    }
    const kind = targetElement.dataset.authoringDropTarget;
    const index = Number(targetElement.dataset.dropIndex);
    if (!Number.isFinite(index)) {
      return null;
    }
    const stepId = targetElement.dataset.dropStepId;
    const sectionId = targetElement.dataset.dropSectionId;
    const groupId = targetElement.dataset.dropGroupId;
    const exact = targetElement.dataset.authoringDropExact === "true";
    switch (kind) {
      case "step-list":
        return { element: targetElement, exact, target: { kind, index } };
      case "section-list":
        return stepId ? { element: targetElement, exact, target: { kind, stepId, index } } : null;
      case "group-list":
        return stepId && sectionId
          ? { element: targetElement, exact, target: { kind, stepId, sectionId, index } }
          : null;
      case "field-list":
        return stepId && sectionId
          ? {
              element: targetElement,
              exact,
              target: { kind, stepId, sectionId, ...(groupId ? { groupId } : {}), index },
            }
          : null;
      default:
        return null;
    }
  }

  function sourceIndexForDropTarget(payload: DragPayload, target: DropTarget): number | null {
    const document = activeProjectDetail?.document;
    if (!document || payload.kind !== target.kind.replace("-list", "")) {
      return null;
    }
    if (payload.kind === "step" && target.kind === "step-list") {
      return document.steps.findIndex((step) => step.id === payload.stepId);
    }
    if (payload.kind === "section" && target.kind === "section-list" && payload.stepId === target.stepId) {
      return (
        document.steps
          .find((step) => step.id === payload.stepId)
          ?.sections.findIndex((section) => section.id === payload.sectionId) ?? null
      );
    }
    if (
      payload.kind === "group" &&
      target.kind === "group-list" &&
      payload.stepId === target.stepId &&
      payload.sectionId === target.sectionId
    ) {
      return (
        document.steps
          .find((step) => step.id === payload.stepId)
          ?.sections.find((section) => section.id === payload.sectionId)
          ?.groups.findIndex((group) => group.id === payload.groupId) ?? null
      );
    }
    if (
      payload.kind === "field" &&
      target.kind === "field-list" &&
      payload.stepId === target.stepId &&
      payload.sectionId === target.sectionId &&
      payload.groupId === target.groupId
    ) {
      const section = document.steps
        .find((step) => step.id === payload.stepId)
        ?.sections.find((candidate) => candidate.id === payload.sectionId);
      const fields = payload.groupId
        ? section?.groups.find((group) => group.id === payload.groupId)?.fields
        : section?.fields;
      return fields?.findIndex((field) => field.id === payload.fieldId) ?? null;
    }
    return null;
  }

  function dropTargetFromPointerPosition(
    clientY: number,
    rect: DOMRect,
    target: DropTarget,
    payload: DragPayload | null,
  ): DropTarget {
    const sourceIndex = payload ? sourceIndexForDropTarget(payload, target) : null;
    const afterThreshold =
      sourceIndex === null || sourceIndex === target.index ? 0.5 : sourceIndex > target.index ? 0.82 : 0.18;
    const isAfter = clientY > rect.top + rect.height * afterThreshold;
    if (!isAfter) {
      return target;
    }
    return { ...target, index: target.index + 1 } as DropTarget;
  }

  function dropTargetFromPointer(event: DragEvent<HTMLElement>, target: DropTarget): DropTarget {
    const rect = event.currentTarget.getBoundingClientRect();
    const payload = currentDragPayload(event);
    return dropTargetFromPointerPosition(event.clientY, rect, target, payload);
  }

  function handleDropZoneDragOver(
    event: DragEvent<HTMLElement>,
    target: DropTarget,
    options?: { positionByPointer?: boolean },
  ) {
    event.preventDefault();
    event.stopPropagation();
    const resolvedTarget = options?.positionByPointer ? dropTargetFromPointer(event, target) : target;
    if (!isCompatibleDropTarget(currentDragPayload(event), resolvedTarget)) {
      return;
    }
    event.dataTransfer.dropEffect = "move";
    activeDropTargetRef.current = resolvedTarget;
    setActiveDropTargetKey(dropTargetKey(resolvedTarget));
  }

  function handleDropZoneDragLeave(_target: DropTarget) {
    setActiveDropTargetKey(null);
  }

  function handleDropTarget(
    event: DragEvent<HTMLElement>,
    target: DropTarget,
    options?: { positionByPointer?: boolean },
  ) {
    event.preventDefault();
    event.stopPropagation();
    const resolvedTarget = options?.positionByPointer ? dropTargetFromPointer(event, target) : target;
    const payload = currentDragPayload(event);
    if (!payload || !isCompatibleDropTarget(payload, resolvedTarget)) {
      return;
    }
    handledDropRef.current = true;
    updateAuthoringDocument((document) => {
      applyDragMove(document, payload, resolvedTarget);
    });
    clearDragInteraction();
  }

  function handleSelectionDragEnd(event: DragEvent<HTMLElement>) {
    const payload = currentDragPayload(event);
    const target = activeDropTargetRef.current;
    const shouldCommitFallback =
      !handledDropRef.current && payload && target && isCompatibleDropTarget(payload, target);
    if (shouldCommitFallback) {
      updateAuthoringDocument((document) => {
        applyDragMove(document, payload, target);
      });
    }
    clearDragInteraction();
  }

  function resolvePointerDropTarget(clientX: number, clientY: number, payload: DragPayload): DropTarget | null {
    let element = document.elementFromPoint(clientX, clientY);
    while (element) {
      const targetCandidate = readDropTargetElement(element);
      if (!targetCandidate) {
        element = element.parentElement;
        continue;
      }
      const resolvedTarget = targetCandidate.exact
        ? targetCandidate.target
        : dropTargetFromPointerPosition(
            clientY,
            targetCandidate.element.getBoundingClientRect(),
            targetCandidate.target,
            payload,
          );
      if (isCompatibleDropTarget(payload, resolvedTarget)) {
        return resolvedTarget;
      }
      element = targetCandidate.element.parentElement;
    }
    return null;
  }

  function updatePointerDropTarget(clientX: number, clientY: number, payload: DragPayload) {
    const resolvedTarget = resolvePointerDropTarget(clientX, clientY, payload);
    activeDropTargetRef.current = resolvedTarget;
    setActiveDropTargetKey(resolvedTarget ? dropTargetKey(resolvedTarget) : null);
  }

  function commitPointerDragTarget(payload: DragPayload) {
    const target = activeDropTargetRef.current;
    if (!target || !isCompatibleDropTarget(payload, target)) {
      return;
    }
    updateAuthoringDocument((document) => {
      applyDragMove(document, payload, target);
    });
  }

  function handleSelectionPointerDown(event: PointerEvent<HTMLButtonElement>, payload: DragPayload) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    handledDropRef.current = false;
    activeDropTargetRef.current = null;
    pointerDragRef.current = {
      active: false,
      payload,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleSelectionPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const dragState = pointerDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
    if (!dragState.active && distance < 4) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (!dragState.active) {
      dragState.active = true;
      setDragPayload(dragState.payload);
    }
    updatePointerDropTarget(event.clientX, event.clientY, dragState.payload);
  }

  function handleSelectionPointerUp(event: PointerEvent<HTMLButtonElement>) {
    const dragState = pointerDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (dragState.active) {
      updatePointerDropTarget(event.clientX, event.clientY, dragState.payload);
      commitPointerDragTarget(dragState.payload);
    } else {
      setSelectedAuthoring(dragState.payload);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerDragRef.current = null;
    clearDragInteraction();
  }

  function handleSelectionPointerCancel(event: PointerEvent<HTMLButtonElement>) {
    const dragState = pointerDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerDragRef.current = null;
    clearDragInteraction();
  }

  function renderDragHandle(label: string, payload: DragPayload, options?: { compact?: boolean }) {
    return (
      <DragHandle
        label={label}
        payload={payload}
        compact={options?.compact}
        onPointerDown={handleSelectionPointerDown}
        onPointerMove={handleSelectionPointerMove}
        onPointerUp={handleSelectionPointerUp}
        onPointerCancel={handleSelectionPointerCancel}
        onSelect={setSelectedAuthoring}
      />
    );
  }

  function renderDropMarker(target: DropTarget, options?: { gridSpan?: boolean; label?: string }) {
    return (
      <DropMarker
        target={target}
        gridSpan={options?.gridSpan}
        label={options?.label}
        dragPayload={dragPayload}
        activeDropTargetKey={activeDropTargetKey}
        onDragOver={handleDropZoneDragOver}
        onDragLeave={handleDropZoneDragLeave}
        onDrop={handleDropTarget}
      />
    );
  }

  function renderEmptyDropZone(
    target: DropTarget,
    copy: { title: string; description: string; activeTitle?: string },
    options?: { gridSpan?: boolean },
  ) {
    return (
      <EmptyDropZone
        target={target}
        copy={copy}
        gridSpan={options?.gridSpan}
        dragPayload={dragPayload}
        activeDropTargetKey={activeDropTargetKey}
        onDragOver={handleDropZoneDragOver}
        onDragLeave={handleDropZoneDragLeave}
        onDrop={handleDropTarget}
      />
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
        ? section.groups
            .find((candidate) => candidate.id === selectedAuthoring.groupId)
            ?.fields.find((candidate) => candidate.id === selectedAuthoring.fieldId)
        : section.fields.find((candidate) => candidate.id === selectedAuthoring.fieldId);
      if (field) {
        mutator(field);
      }
    });
  }

  function renderBuilderFieldCard(
    stepId: string,
    sectionId: string,
    field: AuthoringField,
    fieldIndex: number,
    groupId?: string,
  ) {
    const fieldState = runtimeNodeStateForField(field);
    const isSelected = selectedAuthoring?.kind === "field" && selectedAuthoring.fieldId === field.id;
    return (
      <BuilderFieldCard
        key={field.id}
        stepId={stepId}
        sectionId={sectionId}
        field={field}
        fieldIndex={fieldIndex}
        groupId={groupId}
        selectedAuthoring={selectedAuthoring}
        dragPayload={dragPayload}
        fieldState={fieldState}
        componentLabel={componentChromeLabel(field)}
        onDragHandlePointerDown={handleSelectionPointerDown}
        onDragHandlePointerMove={handleSelectionPointerMove}
        onDragHandlePointerUp={handleSelectionPointerUp}
        onDragHandlePointerCancel={handleSelectionPointerCancel}
        onDragHandleSelect={setSelectedAuthoring}
        onDragOver={handleDropZoneDragOver}
        onDragLeave={handleDropZoneDragLeave}
        onDrop={handleDropTarget}
        onSelect={setSelectedAuthoring}
        behaviorToolbar={
          isSelected ? (
            <BehaviorQuickToolbar
              compact
              stopPropagation
              label="Behavior"
              activeDocument={activeDocument}
              activeRuntimeScope={activeRuntimeScope}
              onOpenBehaviorStudioAddBehavior={openBehaviorStudioAddBehavior}
              onSetBehaviorStudioMode={setBehaviorStudioMode}
              onSetBehaviorFocusTarget={setBehaviorFocusTarget}
              onOpenBehaviorStudio={openBehaviorStudio}
              onCreateBehaviorStudioAnchor={createBehaviorStudioAnchor}
            />
          ) : null
        }
        dispatchKeyBadge={isSelected ? renderDispatchKeyBadge(field.dispatchKey) : null}
        fieldPreview={
          <RuntimeFieldPreview
            field={field}
            value={runtimeFieldValue(field, runtimeSessionState)}
            nodeState={fieldState}
            errorMessage={runtimeFieldError(field, runtimeSessionState)}
            onValueChange={(nextValue) => handleRuntimeFieldValueChange(field, nextValue)}
            onButtonClick={() => handleRuntimeButtonClick(field)}
          />
        }
      />
    );
  }

  function updateLegacyConditionalRule(index: number, mutate: (rule: LegacyConditionalRule) => void) {
    updateSelectedField((field) => {
      if (!mutableLegacyFieldConditionals(field)[index]) {
        return;
      }
      mutate(mutableLegacyFieldConditionals(field)[index]);
    });
  }

  function addLegacyConditionalRule(config?: Partial<LegacyConditionalRule>) {
    const nextIndex = legacyFieldConditionals(activeBuilderField).length;
    const nextRule = createLegacyConditionalRuleDraft(config?.effect ?? "show", config);
    updateSelectedField((field) => {
      mutableLegacyFieldConditionals(field).push(nextRule);
    });
    pendingBehaviorFocusRef.current = `rule:${nextRule.ruleId}`;
    setEditingRuleIndex(nextIndex);
    setSelectedBehaviorNode({
      kind: "rule",
      ruleId: nextRule.ruleId,
      phase: config ? "effect" : "condition",
    });
  }

  function addLegacyConditionalRuleBundle(
    effects: LegacyConditionalRule["effect"][],
    config?: Partial<LegacyConditionalRule>,
  ) {
    if (!effects.length) {
      return;
    }
    const nextIndex = legacyFieldConditionals(activeBuilderField).length;
    const nextBehavior = effects.map((effect) => createLegacyConditionalRuleDraft(effect, config));
    updateSelectedField((field) => {
      mutableLegacyFieldConditionals(field).push(...nextBehavior);
    });
    const focusRule = nextBehavior[0];
    pendingBehaviorFocusRef.current = `rule:${focusRule.ruleId}`;
    setEditingRuleIndex(nextIndex);
    setSelectedBehaviorNode({
      kind: "rule",
      ruleId: focusRule.ruleId,
      phase: "condition",
    });
    setMessage(
      `${effects.map((effect) => formatLabel(effect)).join(" + ")} bundle added for ${activeBuilderField?.label ?? "this field"}.`,
    );
  }

  function removeLegacyConditionalRule(index: number) {
    const removedRuleId = legacyFieldConditionals(activeBuilderField)[index]?.ruleId ?? null;
    updateSelectedField((field) => {
      mutableLegacyFieldConditionals(field).splice(index, 1);
    });
    setEditingRuleIndex((current) =>
      current === index ? null : current !== null && current > index ? current - 1 : current,
    );
    setSelectedBehaviorNode((current) =>
      current?.kind === "rule" && current.ruleId === removedRuleId ? null : current,
    );
  }

  function addSiblingLegacyConditionalRule(ruleId: string, effect: LegacyConditionalRule["effect"]) {
    const sourceRule = legacyFieldConditionals(activeBuilderField).find((candidate) => candidate.ruleId === ruleId);
    if (!sourceRule) {
      return;
    }
    const existingMatch = legacyFieldConditionals(activeBuilderField).some(
      (candidate) =>
        createLegacyConditionalRuleGroupKey(candidate) === createLegacyConditionalRuleGroupKey(sourceRule) &&
        candidate.effect === effect,
    );
    if (existingMatch) {
      setMessage(`${formatLabel(effect)} is already part of this conditional bundle.`);
      return;
    }
    addLegacyConditionalRule({
      whenFieldId: sourceRule.whenFieldId,
      operator: sourceRule.operator,
      expectedValue: sourceRule.expectedValue,
      effect,
    });
  }

  function finalizeBehaviorStudioCreation() {
    setBehaviorStudioCreating(false);
    setBehaviorCreationPath("choice");
    setBehaviorPresetSearch("");
    setBehaviorPresetCategory("recommended");
    setBehaviorEventAdvancedOpen(false);
    setEditingBehaviorEventId(null);
    setBehaviorListenerShowRawEvents(false);
  }

  function createBlankBehaviorStudioListener(triggerName = defaultBehaviorTriggerName()) {
    if (!activeRuntimeScope) {
      setMessage("Select a form, button, or interactive field to create a behavior.");
      return;
    }
    addRuntimeListener(
      createRuntimeListener(triggerName, [], selectedAuthoring?.kind === "field" ? selectedAuthoring.fieldId : null),
    );
    setBehaviorStudioManagerMode("flows");
    finalizeBehaviorStudioCreation();
  }

  function createCrossItemBehaviorListener(
    source: RuntimeEventSourceCandidate,
    eventOption: RuntimeSourceEventOption,
    starter: CrossItemActionStarter | null,
  ) {
    if (!activeRuntimeScope || !activeRuntimeTarget) {
      setMessage("Select the item that should react before creating a cross-item behavior.");
      return;
    }
    if (!eventOption.bubbles && source.id !== activeRuntimeTarget.id) {
      setMessage(
        `${eventOption.type} does not bubble, so it cannot be heard from another item through a shared dispatcher.`,
      );
      return;
    }

    const dispatcher = findNearestSharedDispatcher(source, activeRuntimeTarget, runtimeEventSourceCandidateById);
    const listener = createRuntimeListener(eventOption.type, starter?.createActions() ?? [], activeRuntimeTarget.id);
    listener.label = `${activeRuntimeTarget.label} reacts to ${source.label}`;
    listener.dispatcherId = dispatcher.id;
    listener.dispatcherType = dispatcher.nodeType;
    listener.eventSourceNodeId = source.id;
    listener.eventSourceNodeType = source.nodeType;
    listener.eventSourceLabel = source.label;
    listener.targetNodeId = activeRuntimeTarget.id;
    listener.targetNodeType = activeRuntimeTarget.nodeType;
    listener.wiringMode = "cross_item";
    const defaultCondition = defaultConditionForCrossItemSource(source);
    if (defaultCondition) {
      listener.conditions = [defaultCondition];
    }

    addRuntimeListener(listener);
    setBehaviorStudioManagerMode("flows");
    finalizeBehaviorStudioCreation();
    setMessage(`${activeRuntimeTarget.label} now reacts to ${eventOption.type} from ${source.label}.`);
  }

  function createAuthoredEventBehaviorListener(source: RuntimeEventSourceCandidate, eventType: string) {
    if (!activeRuntimeScope || !activeRuntimeTarget) {
      setMessage("Select the item that should listen before creating a listener.");
      return;
    }
    if (!eventType) {
      setErrorMessage("Choose an authored event before applying the listener.");
      return;
    }
    const eventBubbles = runtimeEventBubblesForSource(source, eventType);
    if (!eventBubbles && source.id !== activeRuntimeTarget.id) {
      setErrorMessage(
        `${eventType} does not bubble, so it cannot be heard from another item through a shared dispatcher.`,
      );
      return;
    }
    const dispatcher =
      source.id === activeRuntimeTarget.id
        ? source
        : findNearestSharedDispatcher(source, activeRuntimeTarget, runtimeEventSourceCandidateById);
    const listener = createRuntimeListener(eventType, [], activeRuntimeTarget.id);
    listener.label =
      source.id === activeRuntimeTarget.id
        ? `${activeRuntimeTarget.label} listens for ${formatLabel(eventType)}`
        : `${activeRuntimeTarget.label} listens for ${formatLabel(eventType)} from ${source.label}`;
    listener.dispatcherId = dispatcher.id;
    listener.dispatcherType = dispatcher.nodeType;
    listener.eventSourceNodeId = source.id;
    listener.eventSourceNodeType = source.nodeType;
    listener.eventSourceLabel = source.label;
    listener.targetNodeId = activeRuntimeTarget.id;
    listener.targetNodeType = activeRuntimeTarget.nodeType;
    listener.wiringMode = source.id === activeRuntimeTarget.id ? "local" : "cross_item";
    listener.useCapture = behaviorListenerUseCapture;
    listener.priority = behaviorListenerPriority;

    addRuntimeListener(listener);
    finalizeBehaviorStudioCreation();
    setSelectedBehaviorNode(createListenerGraphSelection(listener));
    setBehaviorStudioMode("action");
    setBehaviorStudioView("studio");
    setErrorMessage(null);
    setMessage(`${activeRuntimeTarget.label} now listens for ${eventType} from ${source.label}. Add actions next.`);
  }

  function applyBehaviorFlowPreset(presetId: string) {
    const preset = runtimePresets.find((candidate) => candidate.id === presetId);
    if (!preset || !activeRuntimeScope) {
      setMessage("Select a compatible scope before applying this behavior starter.");
      return;
    }
    addRuntimeListener(preset.apply(activeRuntimeScope, activeBuilderField));
    setBehaviorStudioManagerMode("flows");
    finalizeBehaviorStudioCreation();
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
    setBehaviorStudioCreating(false);
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

  function openGraphInspectorSurface() {
    setBehaviorStudioOpen(false);
    setBehaviorStudioCreating(false);
    setBehaviorStudioAnchor(null);
    setBehaviorStudioView("studio");
    setBehaviorStudioMode("manage");
    setBehaviorFocusTarget(null);
    setInspectorTab("map");
    setMapViewMode("graph");
  }

  function resetBehaviorGraphViewport() {
    setBehaviorGraphZoom(1);
    setBehaviorGraphOffset({ x: 0, y: 0 });
  }

  function currentBehaviorSelectionSummary(
    selectedRule?: LegacyConditionalRule | null,
    selectedListener?: RuntimeListenerDefinition | null,
  ) {
    if (selectedBehaviorNode?.kind === "rule" && selectedRule) {
      return `Conditional bundle on ${activeBuilderField?.label ?? "current field"}`;
    }
    if (selectedBehaviorNode?.kind === "listener" && selectedListener) {
      if (selectedListener.wiringMode === "cross_item" && selectedListener.eventSourceLabel) {
        return `${activeRuntimeScope?.label ?? "Current selection"} reacts to ${selectedListener.eventSourceLabel}`;
      }
      return `Listener on ${activeRuntimeScope?.label ?? "current selection"}`;
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

  function renderBehaviorCreationGuide() {
    return (
      <CreationGuide
        isBehaviorStudioCreating={isBehaviorStudioCreating}
        behaviorCreationPath={behaviorCreationPath}
        editingBehaviorEventId={editingBehaviorEventId}
        activeRuntimeScope={activeRuntimeScope}
        activeRuntimeTarget={activeRuntimeTarget}
        activeBuilderField={activeBuilderField}
        selectedAuthoring={selectedAuthoring}
        runtimeEventSourceCandidates={runtimeEventSourceCandidates}
        runtimeEventSourceCandidateById={runtimeEventSourceCandidateById}
        currentBehaviorSelectionSummary={currentBehaviorSelectionSummary}
        behaviorFieldComponentLabel={behaviorFieldComponentLabel}
        behaviorEventType={behaviorEventType}
        behaviorEventPayloadFields={behaviorEventPayloadFields}
        behaviorEventBubbles={behaviorEventBubbles}
        behaviorEventDescription={behaviorEventDescription}
        behaviorEventAdvancedOpen={behaviorEventAdvancedOpen}
        behaviorEventMetadataExample={behaviorEventMetadataExample}
        behaviorStudioMode={behaviorStudioMode}
        runtimeEventOptionsForScope={runtimeEventOptionsForScope}
        runtimeScopeIdentifierBase={runtimeScopeIdentifierBase}
        defaultBehaviorTriggerName={defaultBehaviorTriggerName}
        behaviorListenerSourceType={behaviorListenerSourceType}
        behaviorListenerEventType={behaviorListenerEventType}
        behaviorListenerSourceId={behaviorListenerSourceId}
        behaviorListenerShowRawEvents={behaviorListenerShowRawEvents}
        behaviorListenerUseCapture={behaviorListenerUseCapture}
        behaviorListenerPriority={behaviorListenerPriority}
        onFinalizeBehaviorStudioCreation={finalizeBehaviorStudioCreation}
        onBeginBehaviorEventCreationPath={beginBehaviorEventCreationPath}
        onBeginBehaviorListenerCreationPath={beginBehaviorListenerCreationPath}
        onSetBehaviorEventType={setBehaviorEventType}
        onSetBehaviorEventBubbles={setBehaviorEventBubbles}
        onSetBehaviorEventDescription={setBehaviorEventDescription}
        onSetBehaviorEventPayloadFields={setBehaviorEventPayloadFields}
        onSetBehaviorEventMetadataExample={setBehaviorEventMetadataExample}
        onSetBehaviorCreationPath={setBehaviorCreationPath}
        onSetBehaviorStudioCreating={setBehaviorStudioCreating}
        onSetEditingBehaviorEventId={setEditingBehaviorEventId}
        onSetBehaviorEventAdvancedOpen={setBehaviorEventAdvancedOpen}
        onSetErrorMessage={setErrorMessage}
        onAddRuntimeEventSourceToScope={addRuntimeEventSourceToScope}
        onOpenRuntimeEventEditorForSelection={openRuntimeEventEditorForSelection}
        onSetBehaviorListenerSourceType={setBehaviorListenerSourceType}
        onSetBehaviorListenerEventType={setBehaviorListenerEventType}
        onSetBehaviorListenerSourceId={setBehaviorListenerSourceId}
        onSetBehaviorListenerShowRawEvents={setBehaviorListenerShowRawEvents}
        onSetBehaviorListenerUseCapture={setBehaviorListenerUseCapture}
        onSetBehaviorListenerPriority={setBehaviorListenerPriority}
        onSetSelectedBehaviorNode={setSelectedBehaviorNode}
        onSetBehaviorStudioMode={setBehaviorStudioMode}
        onCreateAuthoredEventBehaviorListener={createAuthoredEventBehaviorListener}
      />
    );
  }

  function renderBehaviorEventCreationForm() {
    return (
      <EventCreationForm
        activeRuntimeScope={activeRuntimeScope}
        activeBuilderField={activeBuilderField}
        selectedAuthoring={selectedAuthoring}
        behaviorEventType={behaviorEventType}
        behaviorEventPayloadFields={behaviorEventPayloadFields}
        behaviorEventBubbles={behaviorEventBubbles}
        behaviorEventDescription={behaviorEventDescription}
        behaviorEventAdvancedOpen={behaviorEventAdvancedOpen}
        behaviorEventMetadataExample={behaviorEventMetadataExample}
        editingBehaviorEventId={editingBehaviorEventId}
        behaviorStudioMode={behaviorStudioMode}
        runtimeEventOptionsForScope={runtimeEventOptionsForScope}
        runtimeScopeIdentifierBase={runtimeScopeIdentifierBase}
        defaultBehaviorTriggerName={defaultBehaviorTriggerName}
        onSetBehaviorEventType={setBehaviorEventType}
        onSetBehaviorEventBubbles={setBehaviorEventBubbles}
        onSetBehaviorEventDescription={setBehaviorEventDescription}
        onSetBehaviorEventPayloadFields={setBehaviorEventPayloadFields}
        onSetBehaviorEventMetadataExample={setBehaviorEventMetadataExample}
        onSetBehaviorCreationPath={setBehaviorCreationPath}
        onSetBehaviorStudioCreating={setBehaviorStudioCreating}
        onSetEditingBehaviorEventId={setEditingBehaviorEventId}
        onSetBehaviorEventAdvancedOpen={setBehaviorEventAdvancedOpen}
        onSetErrorMessage={setErrorMessage}
        onBeginBehaviorEventCreationPath={beginBehaviorEventCreationPath}
        onAddRuntimeEventSourceToScope={addRuntimeEventSourceToScope}
        onOpenRuntimeEventEditorForSelection={openRuntimeEventEditorForSelection}
      />
    );
  }

  function renderBehaviorListenerCreationForm() {
    return (
      <ListenerCreationForm
        activeRuntimeTarget={activeRuntimeTarget}
        activeRuntimeScope={activeRuntimeScope}
        runtimeEventSourceCandidates={runtimeEventSourceCandidates}
        runtimeEventSourceCandidateById={runtimeEventSourceCandidateById}
        behaviorListenerSourceType={behaviorListenerSourceType}
        behaviorListenerEventType={behaviorListenerEventType}
        behaviorListenerSourceId={behaviorListenerSourceId}
        behaviorListenerShowRawEvents={behaviorListenerShowRawEvents}
        behaviorListenerUseCapture={behaviorListenerUseCapture}
        behaviorListenerPriority={behaviorListenerPriority}
        behaviorStudioMode={behaviorStudioMode}
        onSetBehaviorListenerSourceType={setBehaviorListenerSourceType}
        onSetBehaviorListenerEventType={setBehaviorListenerEventType}
        onSetBehaviorListenerSourceId={setBehaviorListenerSourceId}
        onSetBehaviorListenerShowRawEvents={setBehaviorListenerShowRawEvents}
        onSetBehaviorListenerUseCapture={setBehaviorListenerUseCapture}
        onSetBehaviorListenerPriority={setBehaviorListenerPriority}
        onSetBehaviorCreationPath={setBehaviorCreationPath}
        onSetSelectedBehaviorNode={setSelectedBehaviorNode}
        onSetBehaviorStudioMode={setBehaviorStudioMode}
        onSetBehaviorStudioCreating={setBehaviorStudioCreating}
        onCreateAuthoredEventBehaviorListener={createAuthoredEventBehaviorListener}
      />
    );
  }

  function renderBehaviorEventAuthoringStudio() {
    return (
      <div className="mx-auto max-w-[62rem] space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.18em] text-blue-700">Event</p>
            <h4 className="mt-1 text-lg font-semibold text-slate-950">
              {editingBehaviorEventId ? "Edit event definition" : "Define event definition"}
            </h4>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              Events belong to the selected dispatcher and describe the payload that listeners can inspect.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="app-pill">{currentBehaviorSelectionSummary()}</span>
          {activeRuntimeScope ? (
            <span className="app-pill">{activeRuntimeScope.eventSources.length} saved events</span>
          ) : null}
        </div>
        {renderBehaviorEventCreationForm()}
      </div>
    );
  }

  function renderBehaviorListenerAuthoringStudio() {
    return (
      <div className="mx-auto max-w-[62rem] space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.18em] text-blue-700">Listener</p>
            <h4 className="mt-1 text-lg font-semibold text-slate-950">Create listener</h4>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              A listener belongs to the component that reacts. After applying it, use Action to set what that component
              changes.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="app-pill">{currentBehaviorSelectionSummary()}</span>
          {activeRuntimeTarget ? <span className="app-pill">Target {activeRuntimeTarget.label}</span> : null}
          {activeRuntimeScope ? (
            <span className="app-pill">
              {activeRuntimeScope.listeners.length} saved listener
              {activeRuntimeScope.listeners.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
        {renderBehaviorListenerCreationForm()}
      </div>
    );
  }

  function renderBehaviorActionStudio() {
    const selectedListenerId = selectedBehaviorNode?.kind === "listener" ? selectedBehaviorNode.listenerId : null;
    const selectedListener =
      selectedListenerId && activeRuntimeScope
        ? (activeRuntimeScope.listeners.find((listener) => listener.id === selectedListenerId) ?? null)
        : null;
    const selectedListenerTarget = selectedListener?.targetNodeId
      ? (runtimeEventSourceCandidateById.get(selectedListener.targetNodeId) ?? activeRuntimeTarget)
      : activeRuntimeTarget;
    const allRuntimeListenerEntries = [
      ...(logicMapData?.formListeners ?? []),
      ...(logicMapData?.steps.flatMap((step) => step.runtimeListeners) ?? []),
    ];
    const selectedEntry = selectedListenerId
      ? (allRuntimeListenerEntries.find((entry) => entry.id === selectedListenerId) ?? null)
      : null;
    const currentScopeListeners = activeRuntimeScope?.listeners ?? [];
    const visibleEntries = currentScopeListeners.length
      ? currentScopeListeners.map((listener) => ({
          id: listener.id,
          title: listener.label ?? `When ${formatLabel(getRuntimeListenerEventType(listener))}`,
          detail: listener.actions.length
            ? listener.actions.map((action) => formatLabel(action.kind)).join(", ")
            : "No actions set",
          selection: selectedAuthoring,
          graphSelection: createListenerGraphSelection(listener),
        }))
      : allRuntimeListenerEntries.slice(0, 8).map((entry) => ({
          id: entry.id,
          title: `When ${formatLabel(entry.eventName)}`,
          detail: `${entry.scopeLabel} · ${entry.actionsSummary}`,
          selection: entry.selection,
          graphSelection: entry.graphSelection,
        }));

    return (
      <div className="mx-auto max-w-[62rem] space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.18em] text-blue-700">Action</p>
            <h4 className="mt-1 text-lg font-semibold text-slate-950">Set listener actions</h4>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              Actions are edited on the reacting component. Select a listener, then set properties such as visibility,
              value, required state, and target scope.
            </p>
          </div>
        </div>

        {selectedEntry && !selectedListener ? (
          <div className="rounded-[0.95rem] border border-blue-200 bg-blue-50/70 p-4">
            <p className="text-sm font-semibold text-slate-950">Open the listener scope to edit its actions.</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {selectedEntry.scopeLabel} owns this listener, so the action properties load from that component.
            </p>
            <button
              type="button"
              onClick={() => setSelectedAuthoring(selectedEntry.selection)}
              className={`${actionButtonClass("primary")} mt-3`}
            >
              Open listener scope
            </button>
          </div>
        ) : selectedListener ? (
          <div className="space-y-3">
            <div className="rounded-[0.95rem] border border-blue-200 bg-blue-50/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs uppercase tracking-[0.18em] text-blue-700">Selected listener</p>
                  <h5 className="mt-1 text-base font-semibold text-slate-950">
                    {selectedListener.label ?? formatLabel(getRuntimeListenerEventType(selectedListener))}
                  </h5>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {selectedListener.actions.length} action{selectedListener.actions.length === 1 ? "" : "s"} on this
                    listener.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedBehaviorNode(null)}
                  className={actionButtonClass("secondary")}
                >
                  Choose another
                </button>
              </div>
              <div className="mt-3 overflow-hidden rounded-[0.8rem] border border-blue-100 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-100 bg-slate-50 px-3 py-2">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Actions on this listener
                  </p>
                  <span className="app-pill">
                    {selectedListener.actions.length} action{selectedListener.actions.length === 1 ? "" : "s"}
                  </span>
                </div>
                {selectedListener.actions.length ? (
                  selectedListener.actions.map((action, actionIndex) => {
                    const actionTargetId =
                      runtimeNodeActionTargetId(action) ??
                      runtimeFieldActionTargetId(action) ??
                      runtimeNavigationActionTargetId(action);
                    const actionTarget =
                      actionTargetId && runtimeEventSourceCandidateById.has(actionTargetId)
                        ? runtimeEventSourceCandidateById.get(actionTargetId)
                        : null;
                    return (
                      <div
                        key={`selected-listener-action-${action.id}`}
                        className="grid gap-2 border-b border-blue-100 px-3 py-2.5 last:border-b-0 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center"
                      >
                        <span className="app-pill">Action {actionIndex + 1}</span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950">{formatLabel(action.kind)}</p>
                          <p className="mt-1 truncate text-xs text-slate-600">
                            {actionTarget
                              ? `${runtimeEntityTypeLabel(actionTarget.nodeType)} · ${actionTarget.label}`
                              : describeRuntimeAction(action)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeRuntimeAction(selectedListener.id, action.id)}
                          className={actionButtonClass("secondary")}
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="px-3 py-2.5 text-sm text-slate-500">
                    Set a property below to create the first action.
                  </div>
                )}
              </div>
            </div>
            <RuntimeReactionProperties
              listener={selectedListener}
              target={selectedListenerTarget}
              reactionTargetSearch={reactionTargetSearch}
              builderStepOptions={builderStepOptions}
              runtimeReactionTargetOptions={runtimeReactionTargetOptions}
              runtimeNodeTypeIsContainer={runtimeNodeTypeIsContainer}
              booleanReactionValue={booleanReactionValue}
              booleanReactionActions={booleanReactionActions}
              valueReactionMode={valueReactionMode}
              valueReactionActions={valueReactionActions}
              listenerPayloadReferenceOptions={listenerPayloadReferenceOptions}
              navigationReactionValue={navigationReactionValue}
              navigationReactionActions={navigationReactionActions}
              onUpdateReactionTarget={updateRuntimeReactionTarget}
              onSetReactionTargetSearch={setReactionTargetSearch}
              onSetBooleanReactionProperty={setRuntimeBooleanReactionProperty}
              onSetValueReactionMode={setRuntimeValueReactionMode}
              onUpdateValueReactionStatic={updateRuntimeValueReactionStatic}
              onUpdateValueReactionPayload={updateRuntimeValueReactionPayload}
              onSetNavigationReaction={setRuntimeNavigationReaction}
              onUpdateNavigationStep={updateRuntimeNavigationStep}
            />
          </div>
        ) : (
          <div className="rounded-[0.95rem] border border-soft bg-white p-4">
            <p className="text-sm font-semibold text-slate-950">Choose a listener to edit actions</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Current selection listeners are shown first. If this component has none, recent project listeners are
              listed so you can jump to their owner.
            </p>
            <div className="mt-3 grid gap-2">
              {visibleEntries.map((entry) => (
                <button
                  key={`action-listener-entry-${entry.id}`}
                  type="button"
                  onClick={() => {
                    setSelectedAuthoring(entry.selection);
                    setSelectedBehaviorNode(entry.graphSelection);
                  }}
                  className="rounded-[0.85rem] border border-soft bg-slate-50 px-3 py-2 text-left transition hover:border-blue-300 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                >
                  <span className="block text-sm font-semibold text-slate-950">{entry.title}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-600">{entry.detail}</span>
                </button>
              ))}
              {!visibleEntries.length ? (
                <div className="app-muted-card p-3 text-sm text-slate-500">
                  No listeners have been created yet. Create a listener before assigning actions.
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderBehaviorStudioSurface() {
    const selectedRuleIndex =
      selectedBehaviorNode?.kind === "rule" && selectedAuthoring?.kind === "field" && activeBuilderField
        ? legacyFieldConditionals(activeBuilderField).findIndex((rule) => rule.ruleId === selectedBehaviorNode.ruleId)
        : -1;
    const selectedRule =
      selectedRuleIndex >= 0 && activeBuilderField
        ? legacyFieldConditionals(activeBuilderField)[selectedRuleIndex]
        : null;
    return (
      <div className="mx-auto max-w-[62rem] space-y-3">
        {isBehaviorStudioCreating ? (
          renderBehaviorCreationGuide()
        ) : selectedRule && selectedRuleIndex >= 0 ? (
          <div className="rounded-[1.05rem] border border-soft bg-white p-3.5 shadow-[0_16px_32px_rgba(15,23,42,0.07)] sm:p-4">
            <LegacyConditionalRuleEditor
              rule={selectedRule}
              index={selectedRuleIndex}
              conditionalGroup={buildLegacyConditionalRuleGroups(legacyFieldConditionals(activeBuilderField)).find(
                (group) => group.members.some((member) => member.rule.ruleId === selectedRule.ruleId),
              )}
              builderFieldOptions={builderFieldOptions}
              onClose={() => {
                setEditingRuleIndex(null);
                setSelectedBehaviorNode(null);
              }}
              onSelectMember={(memberIndex, ruleId) => {
                setEditingRuleIndex(memberIndex);
                setSelectedBehaviorNode({ kind: "rule", ruleId, phase: "effect" });
              }}
              onAddSibling={addSiblingLegacyConditionalRule}
              onUpdate={updateLegacyConditionalRule}
              onRemove={removeLegacyConditionalRule}
            />
          </div>
        ) : (
          <EventFlowStudio
            eventFlowSourceId={eventFlowSourceId}
            eventFlowEventType={eventFlowEventType}
            activeRuntimeTarget={activeRuntimeTarget}
            activeRuntimeScope={activeRuntimeScope}
            activeDocument={activeDocument}
            runtimeEventSourceCandidates={runtimeEventSourceCandidates}
            runtimeEventSourceCandidateById={runtimeEventSourceCandidateById}
            runtimeNodeLabelById={runtimeNodeLabelById}
            selectedBehaviorNode={selectedBehaviorNode}
            lastDispatchReport={lastDispatchReport}
            logicMapData={logicMapData}
            eventFlowOptionsForSource={eventFlowOptionsForSource}
            eventFlowPayloadRawValue={eventFlowPayloadRawValue}
            defaultBehaviorTriggerName={defaultBehaviorTriggerName}
            onRunEventFlowDispatch={runEventFlowDispatch}
            onSaveEventFlowEvent={saveEventFlowEvent}
            onAddEventFlowPayloadCondition={addEventFlowPayloadCondition}
            onOpenBehaviorStudioListenerSection={openBehaviorStudioListenerSection}
            onOpenRuntimeEventEditorForSelection={openRuntimeEventEditorForSelection}
            onSetEventFlowSourceId={setEventFlowSourceId}
            onSetEventFlowEventType={setEventFlowEventType}
            onSetEventFlowPayloadValues={setEventFlowPayloadValues}
            onSetSelectedBehaviorNode={setSelectedBehaviorNode}
            onSetLastDispatchReport={setLastDispatchReport}
            onSetSelectedAuthoring={setSelectedAuthoring}
            onSetBehaviorStudioCreating={setBehaviorStudioCreating}
            onSetBehaviorStudioManagerMode={setBehaviorStudioManagerMode}
            onSetBehaviorStudioMode={setBehaviorStudioMode}
            onSetBehaviorEventType={setBehaviorEventType}
            onSetBehaviorEventBubbles={setBehaviorEventBubbles}
            onSetBehaviorEventDescription={setBehaviorEventDescription}
            onSetBehaviorEventPayloadFields={setBehaviorEventPayloadFields}
            onSetBehaviorEventMetadataExample={setBehaviorEventMetadataExample}
            onSetBehaviorCreationPath={setBehaviorCreationPath}
          />
        )}
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

  const workspaceTitle =
    stage === "home"
      ? "Project Home"
      : (activeProjectDetail?.project.name ?? activeConversion?.filename ?? selectedFile?.name ?? "No file loaded");
  const workspaceStatus = activeProjectDetail
    ? formatLabel(activeProjectDetail.project.status)
    : activeConversion
      ? formatLabel(activeConversion.reviewStatus)
      : "Ready";
  const shellStatus = stage === "home" ? "Ready" : workspaceStatus;
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
  const reviewFlowTitle =
    reviewFlowMode === "new_project" ? "Create a new project from PDF" : "Resume PDF import review";
  const reviewFlowSummary =
    reviewFlowMode === "new_project"
      ? "This is step two of project creation: inspect the extracted structure, confirm the mapping against the source, then create the project workspace."
      : "Resume an earlier PDF intake, finish the review decisions, and create or reopen the associated project workspace.";
  const pendingWorkspaceTransitionProject =
    pendingWorkspaceTransition?.kind === "open_project"
      ? (projects.find((project) => project.id === pendingWorkspaceTransition.projectId) ?? null)
      : null;
  const pendingWorkspaceTransitionRevision =
    pendingWorkspaceTransition?.kind === "open_revision"
      ? (projectRevisions.find((revision) => revision.id === pendingWorkspaceTransition.revisionId) ?? null)
      : null;
  const pendingWorkspaceTransitionConversion =
    pendingWorkspaceTransition?.kind === "resume_import"
      ? (conversions.find((conversion) => conversion.id === pendingWorkspaceTransition.conversionId) ?? null)
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
            description:
              "Save before leaving the workspace, or discard the current local edits and return to Project Home.",
            saveLabel: "Save and go home",
            discardLabel: "Discard and go home",
          }
        : pendingWorkspaceTransition?.kind === "create_blank_project"
          ? {
              title: "Start a blank project with unsaved changes?",
              description:
                "Save before creating a new blank project, or discard the current local edits and replace this workspace with a fresh starter project.",
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
                        description:
                          "Save before reloading the latest project head, or discard the current local edits and reload the last saved revision.",
                        saveLabel: "Save and return",
                        discardLabel: "Reload without saving",
                      }
                    : null;
  const behaviorStudioPosition = behaviorStudioPositionLayout();
  const behaviorStudioWorkspaceShell = behaviorStudioUsesWorkspaceShell();
  function onToggleListenerEnabled(listenerId: string, enabled: boolean) {
    updateAuthoringDocument((doc) => {
      const toggle = (listeners: RuntimeListenerDefinition[]) => {
        const target = listeners.find((l) => l.id === listenerId);
        if (target) {
          target.enabled = enabled;
        }
      };
      toggle(doc.runtime?.formListeners ?? []);
      for (const step of doc.steps as AuthoringStep[]) {
        toggle(step.runtime?.listeners ?? []);
        for (const section of step.sections as AuthoringSection[]) {
          toggle(section.runtime?.listeners ?? []);
          for (const group of section.groups as AuthoringGroup[]) {
            toggle(group.runtime?.listeners ?? []);
            for (const field of group.fields as AuthoringField[]) {
              toggle(field.runtime?.listeners ?? []);
            }
          }
          for (const field of section.fields as AuthoringField[]) {
            toggle(field.runtime?.listeners ?? []);
          }
        }
      }
    });
  }

  function onReorderListener(listenerId: string, fromIndex: number, toIndex: number) {
    updateAuthoringDocument((doc) => {
      const reorder = (listeners: RuntimeListenerDefinition[]) => {
        if (listeners[fromIndex]?.id !== listenerId) return false;
        const [moved] = listeners.splice(fromIndex, 1);
        listeners.splice(toIndex, 0, moved);
        return true;
      };
      if (reorder(doc.runtime?.formListeners ?? [])) return;
      for (const step of doc.steps as AuthoringStep[]) {
        if (reorder(step.runtime?.listeners ?? [])) return;
        for (const section of step.sections as AuthoringSection[]) {
          if (reorder(section.runtime?.listeners ?? [])) return;
          for (const group of section.groups as AuthoringGroup[]) {
            if (reorder(group.runtime?.listeners ?? [])) return;
            for (const field of group.fields as AuthoringField[]) {
              if (reorder(field.runtime?.listeners ?? [])) return;
            }
          }
          for (const field of section.fields as AuthoringField[]) {
            if (reorder(field.runtime?.listeners ?? [])) return;
          }
        }
      }
    });
  }

  function handleCloseInlineEditor() {
    const id = editingListenerId;
    if (id && justCreatedListenerIdsRef.current.has(id)) {
      const listener = scopeListeners.find((l) => l.id === id) ?? null;
      if (listener && listener.actions.length === 0 && (listener.conditions ?? []).length === 0) {
        removeRuntimeListenerForSelection(selectedAuthoring, id);
      }
      justCreatedListenerIdsRef.current.delete(id);
    }
    setEditingListenerId(null);
  }

  const inlineEditingListener = editingListenerId
    ? (scopeListeners.find((l) => l.id === editingListenerId) ?? null)
    : null;
  const inlineComposerNode =
    inlineEditingListener && activeDocument ? (
      <BehaviorComposer
        listener={inlineEditingListener}
        listenerIndex={scopeListeners.indexOf(inlineEditingListener)}
        activeRuntimeScope={activeRuntimeScope}
        activeRuntimeTarget={activeRuntimeTarget}
        activeBuilderField={activeBuilderField}
        activeDocument={activeDocument}
        runtimeEventSourceCandidates={runtimeEventSourceCandidates}
        runtimeEventSourceCandidateById={runtimeEventSourceCandidateById}
        builderStepOptions={builderStepOptions}
        builderFieldOptions={builderFieldOptions}
        builderNodeOptions={builderNodeOptions}
        reactionTargetSearch={reactionTargetSearch}
        runtimeReactionTargetOptions={runtimeReactionTargetOptions}
        runtimeNodeTypeIsContainer={runtimeNodeTypeIsContainer}
        booleanReactionValue={booleanReactionValue}
        booleanReactionActions={booleanReactionActions}
        valueReactionMode={valueReactionMode}
        valueReactionActions={valueReactionActions}
        listenerPayloadReferenceOptions={listenerPayloadReferenceOptions}
        navigationReactionValue={navigationReactionValue}
        navigationReactionActions={navigationReactionActions}
        runtimePayloadTemplatesForAction={runtimePayloadTemplatesForAction}
        runtimeEventNameSuggestions={runtimeEventNameSuggestions}
        runtimeHostHandlerSuggestions={runtimeHostHandlerSuggestions}
        runtimeTriggerSuggestions={runtimeTriggerSuggestions}
        runtimeActionChainTemplatesForListener={runtimeActionChainTemplatesForListener}
        listenerSourcePayloadFields={listenerSourcePayloadFields}
        firstListenerPayloadReference={firstListenerPayloadReference}
        defaultEventPayloadConditionPath={defaultEventPayloadConditionPath}
        defaultConditionOperatorForField={defaultConditionOperatorForField}
        defaultConditionExpectedValueForField={defaultConditionExpectedValueForField}
        defaultRuntimeActionConfigForScope={defaultRuntimeActionConfigForScope}
        behaviorPresetCategoryLabels={behaviorPresetCategoryLabels}
        getRuntimePayloadEditorState={getRuntimePayloadEditorState}
        onUpdateRuntimeListener={updateRuntimeListener}
        onSetSelectedBehaviorNode={handleCloseInlineEditor}
        onAddRuntimeActionToListener={addRuntimeActionToListener}
        onMoveRuntimeAction={moveRuntimeAction}
        onDuplicateRuntimeAction={duplicateRuntimeAction}
        onRemoveRuntimeAction={removeRuntimeAction}
        onUpdateRuntimeAction={updateRuntimeAction}
        onSetRuntimePayloadEditorMode={setRuntimePayloadEditorMode}
        onUpdateRuntimePayloadEditorRaw={updateRuntimePayloadEditorRaw}
        onApplyRuntimePayloadEntries={applyRuntimePayloadEntries}
        onSyncRuntimePayloadEditor={syncRuntimePayloadEditor}
        onInsertRuntimeActionAfter={insertRuntimeActionAfter}
        onApplyRuntimePayloadTemplate={applyRuntimePayloadTemplate}
        onReplaceRuntimeActionChain={replaceRuntimeActionChain}
        onUpdateReactionTarget={updateRuntimeReactionTarget}
        onSetReactionTargetSearch={setReactionTargetSearch}
        onSetBooleanReactionProperty={setRuntimeBooleanReactionProperty}
        onSetValueReactionMode={setRuntimeValueReactionMode}
        onUpdateValueReactionStatic={updateRuntimeValueReactionStatic}
        onUpdateValueReactionPayload={updateRuntimeValueReactionPayload}
        onSetNavigationReaction={setRuntimeNavigationReaction}
        onUpdateNavigationStep={updateRuntimeNavigationStep}
        onSetMessage={setMessage}
        onSetErrorMessage={setErrorMessage}
      />
    ) : null;

  const behaviorsContent = activeDocument ? (
    <BehaviorInspectorPanel
      document={activeDocument}
      scopeListeners={scopeListeners}
      selectedListenerId={selectedBehaviorListenerId}
      onSelectListener={setSelectedBehaviorListenerId}
      onEditListener={(listenerId) => {
        setSelectedBehaviorListenerId(listenerId);
        setEditingListenerId(listenerId);
        setBehaviorStudioOpen(false);
      }}
      onToggleListenerEnabled={onToggleListenerEnabled}
      onReorderListener={onReorderListener}
      onAddBehavior={() => {
        const newListener = createRuntimeListener(defaultBehaviorTriggerName(), []);
        addRuntimeListener(newListener);
        justCreatedListenerIdsRef.current.add(newListener.id);
        setEditingListenerId(newListener.id);
        setSelectedBehaviorListenerId(newListener.id);
        setBehaviorStudioOpen(false);
      }}
      onAddFromLibrary={() => setLibraryPickerOpen(true)}
      onSaveToLibrary={(listenerId) => {
        setSavingFromExistingListenerId(listenerId);
        setSaveToLibraryName("");
        setSaveToLibraryDescription("");
        setSaveToLibraryCategory("custom");
      }}
      externalReferenceCount={externalReferenceCount}
      editingListenerId={editingListenerId}
      composer={inlineComposerNode}
      onOpenInAdvancedStudio={
        editingListenerId
          ? () => {
              handleCloseInlineEditor();
              openBehaviorStudio("studio", "manage");
            }
          : undefined
      }
    />
  ) : null;
  const mapContent = logicMapData ? (
    <>
      <div className="rounded-[1.15rem] border border-soft bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Flow map</p>
            <h4 className="mt-2 text-lg font-semibold text-slate-950">Document logic and runtime graph</h4>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Use this as the high-level map for behavior flows, then jump into the focused behavior editor only when
              you need to change a specific listener or interaction.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="app-pill">{logicMapData.steps.length} steps</span>
              <span className="app-pill">{logicMapData.totalConditionals} conditional behavior</span>
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
        <MapGraphOverview
          logicMapData={logicMapData}
          mapViewMode={mapViewMode}
          onFocusBehaviorGraphNode={focusBehaviorGraphNode}
          onSetBehaviorGraphEntryContext={setBehaviorGraphEntryContext}
          onResetBehaviorGraphViewport={resetBehaviorGraphViewport}
          onSetInspectorTab={setInspectorTab}
          onSetBehaviorStudioMode={setBehaviorStudioMode}
          onSetBehaviorStudioView={setBehaviorStudioView}
          onSetBehaviorStudioOpen={setBehaviorStudioOpen}
          onSetSelectedAuthoring={setSelectedAuthoring}
        />
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
                              detail:
                                "Form-level runtime flow opened from Summary list into the focused behavior workspace.",
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
                  No form-level behavior yet. Use the Behavior editor when the document needs load, submit, or
                  host-level orchestration.
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
                      <span className="app-pill">{step.conditionalBehavior.length} conditions</span>
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
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">State conditions</p>
                        <p className="mt-2 text-sm text-slate-700">
                          Visibility and requirement logic authored on fields in this step.
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-3">
                      {step.conditionalBehavior.length ? (
                        step.conditionalBehavior.map((rule) => (
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
                          No field conditional behavior in this step yet.
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
                                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                                  {listener.scopeLabel}
                                </p>
                                <p className="mt-2 font-semibold text-slate-950">
                                  When {formatLabel(listener.eventName)}
                                </p>
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
  );

  return (
    <main className="min-h-screen">
      <div className="mx-auto flex max-w-[1720px] flex-col gap-3 px-3 py-3 sm:px-5 lg:px-6">
        <header className="app-shell px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[0.64rem] font-semibold uppercase tracking-[0.22em] text-slate-500">Form Builder</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h1 className="text-base font-semibold text-slate-950">{workspaceTitle}</h1>
                <StatusBadge tone={shellStatusTone}>{shellStatus}</StatusBadge>
              </div>
              <p className="mt-1 text-sm text-slate-500">{workspaceSummary}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="app-pill">{projects.length} projects</span>
              {conversions.length ? <span className="app-pill">{conversions.length} imports</span> : null}
              {stage !== "home" && activeProjectDetail ? (
                <span className="app-pill">{projectRevisions.length} revisions</span>
              ) : null}
              {stage !== "home" && activeConversion ? (
                <span className="app-pill">{activeConversion.documentSignals?.pageCount ?? 0} pages</span>
              ) : null}
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setNewProjectDialogOpen(true)}
              className={actionButtonClass("primary")}
            >
              New
            </button>
            <button type="button" onClick={() => setOpenProjectDialogOpen(true)} className={actionButtonClass()}>
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
                  onClick={() => setLibraryPageOpen(true)}
                  disabled={!activeDocument}
                  className={actionButtonClass()}
                >
                  Library
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
          <HomeStage
            projects={projects}
            conversions={conversions}
            isImportingJson={isImportingJson}
            isUploading={isUploading}
            onCreateBlankProject={() => void handleCreateBlankProject()}
            onImportPdf={() => {
              setNewProjectDialogOpen(false);
              inputRef.current?.click();
            }}
            onOpenJson={() => jsonInputRef.current?.click()}
            onOpenProject={handleOpenProject}
            onResumeImport={handleResumeImport}
          />
        ) : null}

        {stage === "review" ? (
          <ReviewStage
            reviewFlowTitle={reviewFlowTitle}
            reviewFlowSummary={reviewFlowSummary}
            isUploading={isUploading}
            onReturnHome={handleReturnHomeFromReview}
            onReplacePdf={() => inputRef.current?.click()}
            reviewPreviewMode={reviewPreviewMode}
            onSetReviewPreviewMode={setReviewPreviewMode}
            dragActive={dragActive}
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
            selectedFile={selectedFile}
            previewUrl={previewUrl}
            pagePreviewImageUrl={pagePreviewImageUrl}
            activeReviewPage={activeReviewPage}
            activeReviewField={activeReviewField}
            activeReviewFields={activeReviewFields}
            reviewPageDimensions={reviewPageDimensions}
            reviewPageSummaries={reviewPageSummaries}
            onSelectPage={(pageId) => {
              setSelectedPageId(pageId);
              setSelectedFieldId(null);
            }}
            onSelectField={setSelectedFieldId}
            activeConversion={activeConversion}
            activePageSummary={activePageSummary}
            activeReviewFieldConfidence={activeReviewFieldConfidence}
            reviewReadyToPromote={reviewReadyToPromote}
            reviewIssueCount={reviewIssueCount}
            matchedProjectForActiveConversion={matchedProjectForActiveConversion}
            conversions={conversions}
            isSavingReview={isSavingReview}
            isPromoting={isPromoting}
            isClearingHistory={isClearingHistory}
            onReviewUpdate={(status) => void handleReviewUpdate(status)}
            onPromote={() => void handlePromoteConversion()}
            onClearConversions={() => void handleClearConversions()}
            onResumeImport={handleResumeImport}
            onDeleteConversion={(id) => void handleDeleteConversion(id)}
          />
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
                        {openedRevisionView.note}. This is a saved revision snapshot opened inside the current
                        workspace. Return to the latest saved project head when you are done inspecting it, or save now
                        to restore this snapshot as the current document.
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
              <BuilderStage
                expandedRailWidth={editingListenerId ? 540 : undefined}
                stepStrip={
                  <StepStrip
                    activeDocument={activeDocument}
                    selectedAuthoring={selectedAuthoring}
                    dragPayload={dragPayload}
                    activeDropTargetKey={activeDropTargetKey}
                    onAddStep={handleAddStep}
                    onSelectStep={setSelectedAuthoring}
                    onDragOver={handleDropZoneDragOver}
                    onDragLeave={handleDropZoneDragLeave}
                    onDrop={handleDropTarget}
                    onDragHandlePointerDown={handleSelectionPointerDown}
                    onDragHandlePointerMove={handleSelectionPointerMove}
                    onDragHandlePointerUp={handleSelectionPointerUp}
                    onDragHandlePointerCancel={handleSelectionPointerCancel}
                    onDragHandleSelect={setSelectedAuthoring}
                  />
                }
                previewCanvas={
                  <PreviewCanvas
                    activeProjectDetail={activeProjectDetail}
                    projectDirty={projectDirty}
                    activeDocument={activeDocument}
                    activeStep={activeStep}
                    activeStepIndex={activeStepIndex}
                    activeStepSummary={activeStepSummary}
                    isPdfBackedProject={isPdfBackedProject}
                    workspaceLandingMode={workspaceLandingMode}
                    importedSourcePageCount={importedSourcePageCount}
                    importedSourceSectionCount={importedSourceSectionCount}
                    importedSourceFieldCount={importedSourceFieldCount}
                    sourceReferenceCanOpen={sourceReferenceCanOpen}
                    sourceReferenceOpenMode={sourceReferenceOpenMode}
                    sourceReferenceActionLabel={sourceReferenceActionLabel}
                    isEditingDocumentTitle={isEditingDocumentTitle}
                    selectedAuthoring={selectedAuthoring}
                    dragPayload={dragPayload}
                    activeDropTargetKey={activeDropTargetKey}
                    onOpenSourceReference={openSourceReference}
                    onSetProjectDetailsOpen={setProjectDetailsOpen}
                    onSetWorkspaceLandingMode={setWorkspaceLandingMode}
                    onSelectAuthoring={setSelectedAuthoring}
                    onSetIsEditingDocumentTitle={setIsEditingDocumentTitle}
                    onUpdateDocumentTitle={(title) =>
                      updateAuthoringDocument((document) => {
                        document.title = title;
                      })
                    }
                    onAddSectionToStep={handleAddSectionToStep}
                    onAddGroupToSection={handleAddGroupToSection}
                    onAddFieldToContainer={handleAddFieldToContainer}
                    onRemoveSection={handleRemoveSection}
                    onRemoveGroup={handleRemoveGroup}
                    onDragOver={handleDropZoneDragOver}
                    onDragLeave={handleDropZoneDragLeave}
                    onDrop={handleDropTarget}
                    onDragHandlePointerDown={handleSelectionPointerDown}
                    onDragHandlePointerMove={handleSelectionPointerMove}
                    onDragHandlePointerUp={handleSelectionPointerUp}
                    onDragHandlePointerCancel={handleSelectionPointerCancel}
                    onDragHandleSelect={setSelectedAuthoring}
                    onNavigatePreviousStep={() =>
                      invokeRuntimeAction({
                        id: "preview_previous_step",
                        kind: "go_to_previous_step",
                        config: {},
                        continueOnError: false,
                      })
                    }
                    onNavigateNextStep={() =>
                      invokeRuntimeAction({
                        id:
                          activeStepIndex === (activeDocument?.steps.length ?? 0) - 1
                            ? "preview_submit"
                            : "preview_next_step",
                        kind:
                          activeStepIndex === (activeDocument?.steps.length ?? 0) - 1
                            ? "submit_form"
                            : "go_to_next_step",
                        config: {},
                        continueOnError: false,
                      })
                    }
                    renderBehaviorToolbar={(opts) => (
                      <BehaviorQuickToolbar
                        {...opts}
                        activeDocument={activeDocument}
                        activeRuntimeScope={activeRuntimeScope}
                        onOpenBehaviorStudioAddBehavior={openBehaviorStudioAddBehavior}
                        onSetBehaviorStudioMode={setBehaviorStudioMode}
                        onSetBehaviorFocusTarget={setBehaviorFocusTarget}
                        onOpenBehaviorStudio={openBehaviorStudio}
                        onCreateBehaviorStudioAnchor={createBehaviorStudioAnchor}
                      />
                    )}
                    renderDispatchKeyBadge={renderDispatchKeyBadge}
                    renderBuilderFieldCard={renderBuilderFieldCard}
                  />
                }
                inspector={
                  <InspectorRail
                    activeTab={inspectorTab}
                    onTabChange={setInspectorTab}
                    expandedWidth={editingListenerId ? 540 : undefined}
                    behaviorsSlot={behaviorsContent}
                    mapSlot={<div className="space-y-4">{mapContent}</div>}
                    activeDocument={activeDocument}
                    isPdfBackedProject={isPdfBackedProject}
                    selectedAuthoring={selectedAuthoring}
                    activeStep={activeStep}
                    activeSection={activeSection}
                    activeGroup={activeGroup}
                    activeBuilderField={activeBuilderField}
                    sourceReferenceCanOpen={sourceReferenceCanOpen}
                    sourceReferenceOpenMode={sourceReferenceOpenMode}
                    sourceReferenceFocusHasMatches={sourceReferenceFocusHasMatches}
                    sourceReferenceActionLabel={sourceReferenceActionLabel}
                    onOpenSourceReference={openSourceReference}
                    onSelectAuthoring={setSelectedAuthoring}
                    onOpenFormBehavior={() => setBehaviorGraphEntryContext(null)}
                    onRemoveStep={handleRemoveStep}
                    onRemoveSection={handleRemoveSection}
                    onRemoveGroup={handleRemoveGroup}
                    onRemoveField={handleRemoveField}
                    onUpdateDocument={updateAuthoringDocument}
                    onUpdateField={updateSelectedField}
                    onAddGroupToSection={handleAddGroupToSection}
                    onAddField={handleAddField}
                    onOpenBehaviorTab={() => setInspectorTab("behavior")}
                    getButtonBehaviorSummary={getButtonBehaviorSummary}
                  />
                }
              />
              {behaviorStudioOpen && activeDocument && typeof document !== "undefined" ? (
                <BehaviorStudioModal
                  behaviorStudioDialogRef={behaviorStudioDialogRef}
                  behaviorStudioMode={behaviorStudioMode}
                  behaviorStudioWorkspaceShell={behaviorStudioWorkspaceShell}
                  behaviorStudioPosition={behaviorStudioPosition}
                  currentBehaviorSelectionSummary={currentBehaviorSelectionSummary}
                  bodyContent={
                    behaviorStudioMode === "manage" ? (
                      <BehaviorManager
                        selectedAuthoring={selectedAuthoring}
                        activeBuilderField={activeBuilderField}
                        activeRuntimeScope={activeRuntimeScope}
                        activeStep={activeStep}
                        logicMapData={logicMapData}
                        runtimeEventSourceCandidates={runtimeEventSourceCandidates}
                        runtimeNodeLabelById={runtimeNodeLabelById}
                        behaviorStudioManagerQuery={behaviorStudioManagerQuery}
                        behaviorStudioManagerMode={behaviorStudioManagerMode}
                        behaviorIndexStepFilter={behaviorIndexStepFilter}
                        behaviorIndexScopeFilter={behaviorIndexScopeFilter}
                        behaviorIndexTriggerFilter={behaviorIndexTriggerFilter}
                        behaviorIndexEffectFilter={behaviorIndexEffectFilter}
                        behaviorIndexStatusFilter={behaviorIndexStatusFilter}
                        behaviorIndexObjectView={behaviorIndexObjectView}
                        expandedBehaviorIndexObjectKey={expandedBehaviorIndexObjectKey}
                        conditionalGroups={
                          selectedAuthoring?.kind === "field" && activeBuilderField
                            ? buildLegacyConditionalRuleGroups(legacyFieldConditionals(activeBuilderField))
                            : []
                        }
                        currentBehaviorSelectionSummary={currentBehaviorSelectionSummary}
                        onOpenBehaviorStudioAddBehavior={openBehaviorStudioAddBehavior}
                        onOpenBehaviorStudioListenerSection={openBehaviorStudioListenerSection}
                        onOpenBehaviorStudio={openBehaviorStudio}
                        onOpenGraphInspectorSurface={openGraphInspectorSurface}
                        onOpenRuntimeEventEditorForSelection={openRuntimeEventEditorForSelection}
                        onOpenBehaviorNodeInStudio={openBehaviorNodeInStudio}
                        onSetBehaviorStudioManagerQuery={setBehaviorStudioManagerQuery}
                        onSetBehaviorStudioManagerMode={setBehaviorStudioManagerMode}
                        onSetBehaviorStudioMode={setBehaviorStudioMode}
                        onSetBehaviorStudioView={setBehaviorStudioView}
                        onSetBehaviorStudioOpen={setBehaviorStudioOpen}
                        onSetBehaviorStudioCreating={setBehaviorStudioCreating}
                        onSetBehaviorStudioAnchor={setBehaviorStudioAnchor}
                        onSetBehaviorFocusTarget={setBehaviorFocusTarget}
                        onSetInspectorTab={setInspectorTab}
                        onSetSelectedAuthoring={setSelectedAuthoring}
                        onSetSelectedBehaviorNode={setSelectedBehaviorNode}
                        onSetEditingRuleIndex={setEditingRuleIndex}
                        onSetExpandedBehaviorIndexObjectKey={setExpandedBehaviorIndexObjectKey}
                        onSetBehaviorIndexStepFilter={setBehaviorIndexStepFilter}
                        onSetBehaviorIndexScopeFilter={setBehaviorIndexScopeFilter}
                        onSetBehaviorIndexTriggerFilter={setBehaviorIndexTriggerFilter}
                        onSetBehaviorIndexEffectFilter={setBehaviorIndexEffectFilter}
                        onSetBehaviorIndexStatusFilter={setBehaviorIndexStatusFilter}
                        onSetBehaviorIndexObjectView={setBehaviorIndexObjectView}
                        onToggleLegacyConditionalRuleForSelection={toggleLegacyConditionalRuleForSelection}
                        onDuplicateLegacyConditionalRuleForSelection={duplicateLegacyConditionalRuleForSelection}
                        onRemoveLegacyConditionalRuleForSelection={removeLegacyConditionalRuleForSelection}
                        onToggleRuntimeListenerForSelection={toggleRuntimeListenerForSelection}
                        onDuplicateRuntimeListenerForSelection={duplicateRuntimeListenerForSelection}
                        onRemoveRuntimeListenerForSelection={removeRuntimeListenerForSelection}
                        onDuplicateRuntimeEventSourceForSelection={duplicateRuntimeEventSourceForSelection}
                        onRemoveRuntimeEventSourceForSelection={removeRuntimeEventSourceForSelection}
                        onHandleTestSelectedRule={handleTestSelectedRule}
                        onHandleTestSelectedChain={handleTestSelectedChain}
                      />
                    ) : behaviorStudioMode === "event" ? (
                      renderBehaviorEventAuthoringStudio()
                    ) : behaviorStudioMode === "listener" ? (
                      renderBehaviorListenerAuthoringStudio()
                    ) : behaviorStudioMode === "action" ? (
                      renderBehaviorActionStudio()
                    ) : behaviorStudioMode === "create" ? (
                      renderBehaviorStudioSurface()
                    ) : behaviorStudioMode === "test" ? (
                      <EventFlowStudio
                        eventFlowSourceId={eventFlowSourceId}
                        eventFlowEventType={eventFlowEventType}
                        activeRuntimeTarget={activeRuntimeTarget}
                        activeRuntimeScope={activeRuntimeScope}
                        activeDocument={activeDocument}
                        runtimeEventSourceCandidates={runtimeEventSourceCandidates}
                        runtimeEventSourceCandidateById={runtimeEventSourceCandidateById}
                        runtimeNodeLabelById={runtimeNodeLabelById}
                        selectedBehaviorNode={selectedBehaviorNode}
                        lastDispatchReport={lastDispatchReport}
                        logicMapData={logicMapData}
                        eventFlowOptionsForSource={eventFlowOptionsForSource}
                        eventFlowPayloadRawValue={eventFlowPayloadRawValue}
                        defaultBehaviorTriggerName={defaultBehaviorTriggerName}
                        onRunEventFlowDispatch={runEventFlowDispatch}
                        onSaveEventFlowEvent={saveEventFlowEvent}
                        onAddEventFlowPayloadCondition={addEventFlowPayloadCondition}
                        onOpenBehaviorStudioListenerSection={openBehaviorStudioListenerSection}
                        onOpenRuntimeEventEditorForSelection={openRuntimeEventEditorForSelection}
                        onSetEventFlowSourceId={setEventFlowSourceId}
                        onSetEventFlowEventType={setEventFlowEventType}
                        onSetEventFlowPayloadValues={setEventFlowPayloadValues}
                        onSetSelectedBehaviorNode={setSelectedBehaviorNode}
                        onSetLastDispatchReport={setLastDispatchReport}
                        onSetSelectedAuthoring={setSelectedAuthoring}
                        onSetBehaviorStudioCreating={setBehaviorStudioCreating}
                        onSetBehaviorStudioManagerMode={setBehaviorStudioManagerMode}
                        onSetBehaviorStudioMode={setBehaviorStudioMode}
                        onSetBehaviorEventType={setBehaviorEventType}
                        onSetBehaviorEventBubbles={setBehaviorEventBubbles}
                        onSetBehaviorEventDescription={setBehaviorEventDescription}
                        onSetBehaviorEventPayloadFields={setBehaviorEventPayloadFields}
                        onSetBehaviorEventMetadataExample={setBehaviorEventMetadataExample}
                        onSetBehaviorCreationPath={setBehaviorCreationPath}
                      />
                    ) : (
                      <BehaviorWorkspace
                        selectedAuthoring={selectedAuthoring}
                        activeBuilderField={activeBuilderField}
                        activeRuntimeScope={activeRuntimeScope}
                        activeRuntimeTarget={activeRuntimeTarget}
                        activeDocument={activeDocument}
                        activeStep={activeStep}
                        activeSection={activeSection}
                        activeGroup={activeGroup}
                        logicMapData={logicMapData}
                        runtimeNodeLabelById={runtimeNodeLabelById}
                        runtimeTraceEntries={runtimeTraceEntries}
                        runtimeSessionState={runtimeSessionState}
                        runtimeSubmitPreview={runtimeSubmitPreview}
                        runtimeActiveStep={runtimeActiveStep}
                        behaviorGraphFilter={behaviorGraphFilter}
                        behaviorGraphMode={behaviorGraphMode}
                        behaviorGraphDensity={behaviorGraphDensity}
                        behaviorGraphZoom={behaviorGraphZoom}
                        behaviorGraphOffset={behaviorGraphOffset}
                        behaviorGraphEntryContext={behaviorGraphEntryContext}
                        behaviorWorkspaceMode={behaviorWorkspaceMode}
                        documentBehaviorClusterFocus={documentBehaviorClusterFocus}
                        documentBehaviorTrailFamilies={documentBehaviorTrailFamilies}
                        documentBehaviorCanvasRelevantOnly={documentBehaviorCanvasRelevantOnly}
                        documentBehaviorCanvasDensity={documentBehaviorCanvasDensity}
                        documentBehaviorSurfaceMode={documentBehaviorSurfaceMode}
                        documentBehaviorPinnedLaneIds={documentBehaviorPinnedLaneIds}
                        expandedDocumentBehaviorTarget={expandedDocumentBehaviorTarget}
                        documentBehaviorGraphZoom={documentBehaviorGraphZoom}
                        documentBehaviorGraphOffset={documentBehaviorGraphOffset}
                        selectedBehaviorNode={selectedBehaviorNode}
                        selectedRuntimeEvidenceKey={selectedRuntimeEvidenceKey}
                        simulatorSectionRef={simulatorSectionRef}
                        runtimeSessionInputRef={runtimeSessionInputRef}
                        builderFieldOptions={builderFieldOptions}
                        buildLegacyConditionalRuleGroups={buildLegacyConditionalRuleGroups}
                        currentBehaviorSelectionSummary={currentBehaviorSelectionSummary}
                        onFocusBehaviorGraphNode={focusBehaviorGraphNode}
                        onResetBehaviorGraphViewport={resetBehaviorGraphViewport}
                        onResetDocumentBehaviorGraphViewport={resetDocumentBehaviorGraphViewport}
                        onOpenBehaviorBehaviorManager={openBehaviorBehaviorManager}
                        onOpenBehaviorNodeInStudio={openBehaviorNodeInStudio}
                        onOpenBehaviorObjectInBehaviorManager={openBehaviorObjectInBehaviorManager}
                        onOpenBehaviorStudioAddBehavior={openBehaviorStudioAddBehavior}
                        onOpenBehaviorStudioReactToAnotherItem={openBehaviorStudioReactToAnotherItem}
                        onCloseBehaviorStudio={closeBehaviorStudio}
                        onHandleTestSelectedRule={handleTestSelectedRule}
                        onHandleTestSelectedChain={handleTestSelectedChain}
                        onHandleResetRuntimeSession={handleResetRuntimeSession}
                        onHandlePopulateRequiredRuntimeValues={handlePopulateRequiredRuntimeValues}
                        onHandleRunCurrentRuntimeStep={handleRunCurrentRuntimeStep}
                        onHandleRunRuntimeSubmit={handleRunRuntimeSubmit}
                        onHandleExportRuntimeSession={handleExportRuntimeSession}
                        onHandleMockSubmitSuccess={handleMockSubmitSuccess}
                        onHandleMockSubmitError={handleMockSubmitError}
                        onHandleBehaviorGraphPointerDown={handleBehaviorGraphPointerDown}
                        onHandleBehaviorGraphPointerMove={handleBehaviorGraphPointerMove}
                        onHandleBehaviorGraphPointerEnd={handleBehaviorGraphPointerEnd}
                        onHandleBehaviorGraphViewportKeyDown={handleBehaviorGraphViewportKeyDown}
                        onHandleDocumentBehaviorGraphPointerDown={handleDocumentBehaviorGraphPointerDown}
                        onHandleDocumentBehaviorGraphPointerMove={handleDocumentBehaviorGraphPointerMove}
                        onHandleDocumentBehaviorGraphPointerEnd={handleDocumentBehaviorGraphPointerEnd}
                        onHandleDocumentBehaviorGraphViewportKeyDown={handleDocumentBehaviorGraphViewportKeyDown}
                        onSetBehaviorGraphFilter={setBehaviorGraphFilter}
                        onSetBehaviorGraphMode={setBehaviorGraphMode}
                        onSetBehaviorGraphDensity={setBehaviorGraphDensity}
                        onSetBehaviorGraphZoom={setBehaviorGraphZoom}
                        onSetBehaviorGraphOffset={setBehaviorGraphOffset}
                        onSetBehaviorGraphEntryContext={setBehaviorGraphEntryContext}
                        onSetBehaviorWorkspaceMode={setBehaviorWorkspaceMode}
                        onSetBehaviorStudioMode={setBehaviorStudioMode}
                        onSetBehaviorStudioView={setBehaviorStudioView}
                        onSetDocumentBehaviorClusterFocus={setDocumentBehaviorClusterFocus}
                        onSetDocumentBehaviorTrailFamilies={setDocumentBehaviorTrailFamilies}
                        onSetDocumentBehaviorCanvasRelevantOnly={setDocumentBehaviorCanvasRelevantOnly}
                        onSetDocumentBehaviorCanvasDensity={setDocumentBehaviorCanvasDensity}
                        onSetDocumentBehaviorSurfaceMode={setDocumentBehaviorSurfaceMode}
                        onSetDocumentBehaviorPinnedLaneIds={setDocumentBehaviorPinnedLaneIds}
                        onSetExpandedDocumentBehaviorTarget={setExpandedDocumentBehaviorTarget}
                        onSetDocumentBehaviorGraphZoom={setDocumentBehaviorGraphZoom}
                        onSetDocumentBehaviorGraphOffset={setDocumentBehaviorGraphOffset}
                        onSetSelectedAuthoring={setSelectedAuthoring}
                        onSetSelectedBehaviorNode={setSelectedBehaviorNode}
                        onSetEditingRuleIndex={setEditingRuleIndex}
                        onSetInspectorTab={setInspectorTab}
                        onSetSelectedRuntimeEvidenceKey={setSelectedRuntimeEvidenceKey}
                      />
                    )
                  }
                  onOpenBehaviorStudioEventSection={openBehaviorStudioEventSection}
                  onOpenBehaviorStudioListenerSection={openBehaviorStudioListenerSection}
                  onOpenBehaviorStudioActionSection={openBehaviorStudioActionSection}
                  onOpenBehaviorStudioTestSection={openBehaviorStudioTestSection}
                  onSetBehaviorStudioCreating={setBehaviorStudioCreating}
                  onSetBehaviorFocusTarget={setBehaviorFocusTarget}
                  onSetBehaviorStudioManagerMode={setBehaviorStudioManagerMode}
                  onSetBehaviorStudioMode={setBehaviorStudioMode}
                  onSetBehaviorStudioView={setBehaviorStudioView}
                  onCloseBehaviorStudio={closeBehaviorStudio}
                />
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
                            className={subtleButtonClass(
                              sourceReferenceFilterMode === "matches" && sourceReferenceFocusHasMatches,
                            )}
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
                          <button
                            type="button"
                            onClick={() => setSourceDrawerOpen(false)}
                            className={actionButtonClass()}
                          >
                            Close compare
                          </button>
                        </div>
                      }
                      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                    >
                      <div className="space-y-4">
                        <div className="app-muted-card p-4">
                          <p className="text-sm font-semibold text-slate-950">
                            {activeProjectDetail?.sourceContext.filename}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            {activeProjectDetail?.sourceContext.issues.length ?? 0} imported issues · source conversion{" "}
                            {activeProjectDetail?.sourceContext.conversionId}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            Keep this open only when it helps. Use it to compare the current authored step against the
                            imported PDF structure, then return to shaping the digital flow in the main workspace.
                          </p>
                          {activeStepSourcePageIds.size ? (
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                              The current step traces back to {activeStepSourcePageIds.size} imported page
                              {activeStepSourcePageIds.size === 1 ? "" : "s"} highlighted below.
                            </p>
                          ) : null}
                          {sourceReferenceFocus ? (
                            <div className="mt-4 rounded-[1rem] border border-blue-200 bg-blue-50/70 p-4">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="text-xs uppercase tracking-[0.18em] text-blue-700">
                                    Current compare target
                                  </p>
                                  <p className="mt-2 text-sm font-semibold text-slate-950">
                                    {sourceReferenceFocus.kindLabel}: {sourceReferenceFocus.title}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-600">
                                    {sourceReferenceFocus.pageIds.size} pages · {sourceReferenceFocus.sectionIds.size}{" "}
                                    sections · {sourceReferenceFocus.groupIds.size} groups ·{" "}
                                    {sourceReferenceFocus.fieldIds.size} fields
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
                                  count +
                                  orderedReviewSectionFields(section).filter((field) =>
                                    sourceFieldMatchesFocus(field, sourceReferenceFocus),
                                  ).length,
                                0,
                              );
                              const matchingGroupCount = visibleSections.reduce(
                                (count, section) =>
                                  count +
                                  section.groups.filter((group) => sourceGroupMatchesFocus(group, sourceReferenceFocus))
                                    .length,
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
                                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                                        Page {page.orderIndex + 1}
                                      </p>
                                      <p className="mt-2 font-semibold text-slate-950">{page.label}</p>
                                      <p className="mt-1 text-sm text-slate-600">
                                        {countSourceFieldsOnPage(page)} extracted fields · {visibleSections.length}{" "}
                                        visible sections
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
                                      {activeStepSourcePageIds.has(page.id) ? (
                                        <StatusBadge tone="info">Current step source</StatusBadge>
                                      ) : null}
                                      {pageMatchesCurrentSelection ? (
                                        <StatusBadge tone="info">Current selection match</StatusBadge>
                                      ) : null}
                                      {matchingFieldCount ? (
                                        <span className="app-pill">{matchingFieldCount} matching fields</span>
                                      ) : null}
                                      {matchingGroupCount ? (
                                        <span className="app-pill">{matchingGroupCount} matching groups</span>
                                      ) : null}
                                    </div>
                                  </div>
                                  <div className="mt-3 space-y-2">
                                    {visibleSections.map((section) => {
                                      const sectionMatchesCurrentSelection = sourceSectionMatchesFocus(
                                        section,
                                        sourceReferenceFocus,
                                      );
                                      const matchingFields = orderedReviewSectionFields(section).filter((field) =>
                                        sourceFieldMatchesFocus(field, sourceReferenceFocus),
                                      );
                                      const matchingGroups = section.groups.filter((group) =>
                                        sourceGroupMatchesFocus(group, sourceReferenceFocus),
                                      );
                                      const sectionSelection = resolveSelectionForSourceTarget(
                                        "section",
                                        page,
                                        section,
                                      );
                                      const sectionSelectionIsActive = authoringSelectionsEqual(
                                        sectionSelection,
                                        selectedAuthoring,
                                      );

                                      return (
                                        <div
                                          key={section.id}
                                          className={`rounded-[0.95rem] border p-3 ${
                                            sectionMatchesCurrentSelection
                                              ? "border-blue-200 bg-white shadow-sm"
                                              : "border-soft bg-white"
                                          }`}
                                        >
                                          <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                              <p className="font-semibold text-slate-950">{section.title}</p>
                                              <p className="mt-1 text-sm text-slate-600">
                                                {
                                                  [
                                                    ...section.fields,
                                                    ...section.groups.flatMap((group) => group.fields),
                                                  ].length
                                                }{" "}
                                                extracted fields
                                              </p>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                              {sectionSelection ? (
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    focusAuthoringSelectionFromSource("section", page, section)
                                                  }
                                                  className={subtleButtonClass(sectionSelectionIsActive)}
                                                >
                                                  {sectionSelectionIsActive ? "Focused in builder" : "Focus in builder"}
                                                </button>
                                              ) : null}
                                              {sourceReferenceFocus?.sectionIds.has(section.id) ? (
                                                <StatusBadge tone="info">Direct section match</StatusBadge>
                                              ) : null}
                                              {matchingFields.length ? (
                                                <span className="app-pill">
                                                  {matchingFields.length} matching fields
                                                </span>
                                              ) : null}
                                              {matchingGroups.length ? (
                                                <span className="app-pill">
                                                  {matchingGroups.length} matching groups
                                                </span>
                                              ) : null}
                                            </div>
                                          </div>
                                          {matchingGroups.length || matchingFields.length ? (
                                            <div className="mt-3 space-y-2">
                                              {matchingGroups.length ? (
                                                <div>
                                                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                                                    Matching groups
                                                  </p>
                                                  <div className="mt-2 flex flex-wrap gap-2">
                                                    {matchingGroups.map((group, matchingGroupIndex) => {
                                                      const groupSelection = resolveSelectionForSourceTarget(
                                                        "group",
                                                        page,
                                                        section,
                                                        group,
                                                      );
                                                      const groupSelectionIsActive = authoringSelectionsEqual(
                                                        groupSelection,
                                                        selectedAuthoring,
                                                      );
                                                      const sourceGroupKey = `${page.id}-${section.id}-${group.id}-${matchingGroupIndex}`;

                                                      return groupSelection ? (
                                                        <button
                                                          key={sourceGroupKey}
                                                          type="button"
                                                          onClick={() =>
                                                            focusAuthoringSelectionFromSource(
                                                              "group",
                                                              page,
                                                              section,
                                                              group,
                                                            )
                                                          }
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
                                                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                                                    Matching fields
                                                  </p>
                                                  <div className="mt-2 flex flex-wrap gap-2">
                                                    {matchingFields.slice(0, 8).map((field, matchingFieldIndex) => {
                                                      const fieldSelection = resolveSelectionForSourceTarget(
                                                        "field",
                                                        page,
                                                        section,
                                                        undefined,
                                                        field,
                                                      );
                                                      const fieldSelectionIsActive = authoringSelectionsEqual(
                                                        fieldSelection,
                                                        selectedAuthoring,
                                                      );
                                                      const sourceFieldKey = `${page.id}-${section.id}-${field.id}-${matchingFieldIndex}`;

                                                      return fieldSelection ? (
                                                        <button
                                                          key={sourceFieldKey}
                                                          type="button"
                                                          onClick={() =>
                                                            focusAuthoringSelectionFromSource(
                                                              "field",
                                                              page,
                                                              section,
                                                              undefined,
                                                              field,
                                                            )
                                                          }
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
                                                    {matchingFields.length > 8 ? (
                                                      <span className="app-pill">
                                                        +{matchingFields.length - 8} more
                                                      </span>
                                                    ) : null}
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
                              No imported pages matched the current authored selection. Switch back to `All source` to
                              inspect the full imported reference.
                            </div>
                          )}
                        </div>
                      </div>
                    </PanelCard>
                  </div>
                </div>
              ) : null}
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
                    Switch projects, reopen authoring JSON, or jump back to the main home screen without leaving the
                    builder shell.
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
                                  {project.revisionCount} revisions · updated{" "}
                                  {new Date(project.updatedAt).toLocaleString()}
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-2">
                                <StatusBadge tone={badgeToneFromProjectStatus(project.status)}>
                                  {formatLabel(project.status)}
                                </StatusBadge>
                                {isActiveProject ? (
                                  <span className="text-xs font-medium uppercase tracking-[0.16em] text-blue-700">
                                    Current
                                  </span>
                                ) : null}
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
                              {formatLabel(conversion.reviewStatus)} · updated{" "}
                              {new Date(conversion.updatedAt).toLocaleString()}
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
                  <h4 className="mt-1 text-lg font-semibold text-slate-950">
                    Inspect and reopen saved workspace snapshots
                  </h4>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Revisions are the durable checkpoints for this project. Open an older snapshot into the current
                    workspace, then return to the latest head or save it forward as the new current document.
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
                                <p className="mt-1 text-sm text-slate-600">
                                  {new Date(revision.createdAt).toLocaleString()}
                                </p>
                                <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                                  {revision.document.title}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {isCurrentHead ? <StatusBadge tone="info">Current head</StatusBadge> : null}
                                {isOpenedRevision ? (
                                  <StatusBadge tone="warning">Opened in workspace</StatusBadge>
                                ) : null}
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
                                  {isLoadingRevisionWorkspace && isOpenedRevision
                                    ? "Returning..."
                                    : isOpenedRevision
                                      ? "Return to this head"
                                      : "Current head"}
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
                      <p>
                        Save after opening a snapshot to make that older revision the current project document again.
                      </p>
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
                Save keeps the current workspace edits before the next move. Discard or reload continues immediately
                from the last saved state on disk.
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
                  {isResolvingWorkspaceTransition || isSavingProject
                    ? "Saving..."
                    : pendingWorkspaceTransitionCopy.saveLabel}
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
                  <h4 className="mt-1 text-lg font-semibold text-slate-950">
                    Save, publish, and inspect stored artifacts
                  </h4>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Publishing is a project action now. Use this panel to save, toggle release state, and verify what is
                    stored on disk.
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
                          <h3 className="mt-2 text-2xl font-semibold text-slate-950">
                            {activeProjectDetail.project.name}
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            Runtime target: {activeProjectDetail.project.targetRuntime} · baseline{" "}
                            {activeProjectDetail.project.visualBaseline}
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
                        <p>
                          Published state is a reversible project flag while the runtime/export contract is still
                          evolving.
                        </p>
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
                        <p className="mt-2 break-all font-mono text-sm text-slate-800">
                          {projectArtifactPaths.project}
                        </p>
                      </div>
                      <div className="app-muted-card p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Authoring document JSON</p>
                        <p className="mt-2 break-all font-mono text-sm text-slate-800">
                          {projectArtifactPaths.document}
                        </p>
                      </div>
                      <div className="app-muted-card p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Source context JSON</p>
                        <p className="mt-2 break-all font-mono text-sm text-slate-800">
                          {projectArtifactPaths.sourceContext}
                        </p>
                      </div>
                      <div className="app-muted-card p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Current revision snapshot</p>
                        <p className="mt-2 break-all font-mono text-sm text-slate-800">
                          {projectArtifactPaths.revision ?? "Save the project to create the first revision file."}
                        </p>
                      </div>
                      <div className="rounded-[1.15rem] border border-soft bg-white p-5">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Source lineage</p>
                        <p className="mt-2 font-semibold text-slate-950">
                          {activeProjectDetail.sourceContext.filename}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          The imported draft remains preserved as provenance. Toggling published state does not alter
                          the source lineage.
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

      {/* Library picker */}
      <LibraryPicker
        isOpen={libraryPickerOpen}
        onClose={() => setLibraryPickerOpen(false)}
        systemEntries={SYSTEM_LIBRARY}
        projectEntries={projectLibrary}
        onSelectEntry={(entry) => {
          setLibraryPickerOpen(false);
          setPendingLibraryEntry(entry);
        }}
      />

      {/* Apply parameters dialog */}
      <ApplyParametersDialog
        isOpen={pendingLibraryEntry !== null}
        entry={pendingLibraryEntry}
        onClose={() => setPendingLibraryEntry(null)}
        onApply={(entry, params) => {
          const partial = applyEntryToListener(entry, params);
          const newListener: RuntimeListenerDefinition = {
            id: crypto.randomUUID(),
            label: entry.name,
            enabled: true,
            provenance: "library",
            libraryRef: { id: entry.id, revision: entry.revision, params, detached: false },
            // Apply template fields
            type: (partial as RuntimeListenerDefinition).type ?? "",
            eventName: (partial as RuntimeListenerDefinition).eventName ?? "",
            conditions: (partial as RuntimeListenerDefinition).conditions ?? [],
            actions: (partial as RuntimeListenerDefinition).actions ?? [],
            ...partial,
          };
          addRuntimeListener(newListener);
          setSelectedBehaviorListenerId(newListener.id);
          setPendingLibraryEntry(null);
        }}
      />

      {/* Library page overlay */}
      <LibraryPage
        isOpen={libraryPageOpen}
        onClose={() => setLibraryPageOpen(false)}
        systemEntries={SYSTEM_LIBRARY}
        projectEntries={projectLibrary}
        onDeleteProjectEntry={(entryId) => {
          if (!activeProjectDetail) return;
          void deleteProjectLibraryEntry(activeProjectDetail.project.id, entryId).then(() => {
            setProjectLibrary((prev) => prev.filter((e) => e.id !== entryId));
          });
        }}
      />

      {/* Save to library dialog */}
      {savingFromExistingListenerId !== null ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/30 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-to-library-title"
            className="relative flex w-full max-w-[28rem] flex-col overflow-hidden rounded-[1.15rem] border border-slate-200 bg-[#f5f7fb] shadow-[0_24px_64px_rgba(15,23,42,0.24)]"
          >
            <div className="shrink-0 border-b border-slate-200 bg-white/96 px-4 py-3 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Save to library
                  </p>
                  <h3 id="save-to-library-title" className="mt-0.5 text-lg font-semibold text-slate-950">
                    Save behavior as library entry
                  </h3>
                </div>
                <button
                  type="button"
                  aria-label="Close dialog"
                  onClick={() => setSavingFromExistingListenerId(null)}
                  className={iconButtonClass()}
                >
                  ×
                </button>
              </div>
            </div>
            <div className="px-4 py-4 space-y-4">
              <p className="text-sm text-slate-500">
                This saves a copy as a reusable library entry. The current behavior stays where it is and is not
                automatically linked.
              </p>
              <div>
                <label htmlFor="stl-name" className="mb-1 block text-sm font-medium text-slate-700">
                  Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="stl-name"
                  type="text"
                  value={saveToLibraryName}
                  onChange={(e) => setSaveToLibraryName(e.target.value)}
                  placeholder="e.g. Show if field has value"
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label htmlFor="stl-description" className="mb-1 block text-sm font-medium text-slate-700">
                  Description
                </label>
                <input
                  id="stl-description"
                  type="text"
                  value={saveToLibraryDescription}
                  onChange={(e) => setSaveToLibraryDescription(e.target.value)}
                  placeholder="Optional short description"
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label htmlFor="stl-category" className="mb-1 block text-sm font-medium text-slate-700">
                  Category
                </label>
                <select
                  id="stl-category"
                  value={saveToLibraryCategory}
                  onChange={(e) => setSaveToLibraryCategory(e.target.value)}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="custom">Custom</option>
                  <option value="validation">Validation</option>
                  <option value="visibility">Visibility</option>
                  <option value="host">Host</option>
                  <option value="events">Events</option>
                  <option value="data">Data</option>
                  <option value="repeatables">Repeatables</option>
                </select>
              </div>
            </div>
            <div className="shrink-0 flex justify-end gap-2 border-t border-slate-200 bg-white/80 px-4 py-3">
              <button
                type="button"
                onClick={() => setSavingFromExistingListenerId(null)}
                className={actionButtonClass("secondary")}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!saveToLibraryName.trim() || isSavingLibraryEntry || !activeProjectDetail}
                onClick={() => {
                  const listener = scopeListeners.find((l) => l.id === savingFromExistingListenerId);
                  if (!listener || !activeProjectDetail) return;
                  const nameSlug = saveToLibraryName
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "_")
                    .slice(0, 32);
                  const rand = Math.random().toString(36).slice(2, 6);
                  const entry: BehaviorLibraryEntry = {
                    id: `lib_${nameSlug}_${rand}`,
                    name: saveToLibraryName.trim(),
                    description: saveToLibraryDescription.trim(),
                    category: saveToLibraryCategory as BehaviorLibraryEntry["category"],
                    scope: "project",
                    revision: 1,
                    parameters: [],
                    bindsTo: [],
                    template: {
                      eventName: listener.eventName,
                      conditions: listener.conditions ?? [],
                      actions: listener.actions ?? [],
                    },
                  };
                  setIsSavingLibraryEntry(true);
                  void saveProjectLibraryEntry(activeProjectDetail.project.id, entry)
                    .then((saved) => {
                      setProjectLibrary((prev) => [...prev, saved]);
                      setSavingFromExistingListenerId(null);
                      setSaveToLibraryName("");
                      setSaveToLibraryDescription("");
                      setSaveToLibraryCategory("custom");
                    })
                    .catch((err) => {
                      setErrorMessage(err instanceof Error ? err.message : "Failed to save library entry.");
                    })
                    .finally(() => {
                      setIsSavingLibraryEntry(false);
                    });
                }}
                className={actionButtonClass("primary")}
              >
                {isSavingLibraryEntry ? "Saving..." : "Save to library"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
