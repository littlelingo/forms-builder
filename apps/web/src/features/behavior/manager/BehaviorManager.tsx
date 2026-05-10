import { useState } from "react";
import type {
  AuthoringField,
  BehaviorSafetyClass,
  RuntimeEventDefinition,
  RuntimeListenerDefinition,
} from "@form-builder/schema";
import type { RuntimeDispatchReport } from "@form-builder/runtime";
import { runtimeActionSafetyClass } from "@form-builder/schema";
import type { AuthoringSelection } from "../../../lib/authoring-utils";
import { runtimeEventDefinitionType } from "../utils/runtime-helpers";
import type {
  BehaviorGraphSelection,
  BehaviorIndexLayout,
  BehaviorIndexObjectView,
  BehaviorIndexStatusFilter,
  BehaviorStudioManagerMode,
  BehaviorStudioMode,
  BehaviorStudioView,
  LegacyConditionalRule,
  LegacyConditionalRuleGroup,
  LogicMapConditionalEntry,
  LogicMapListenerEntry,
  LogicMapStepEntry,
  RuntimeEditorScope,
  RuntimeEventSourceCandidate,
} from "../utils/runtime-helpers";
import type { InspectorTab } from "../../inspector";
import { actionButtonClass, formatLabel } from "../../../lib/ui-utils";
import { BehaviorIndexMap } from "./BehaviorIndexMap";

interface LogicMapData {
  formListeners: LogicMapListenerEntry[];
  steps: LogicMapStepEntry[];
}

export interface BehaviorManagerProps {
  selectedAuthoring: AuthoringSelection | null;
  activeBuilderField: AuthoringField | null;
  activeRuntimeScope: RuntimeEditorScope | null;
  activeStep: import("@form-builder/schema").AuthoringStep | null;
  logicMapData: LogicMapData | null;
  runtimeEventSourceCandidates: RuntimeEventSourceCandidate[];
  runtimeNodeLabelById: Map<string, string>;
  behaviorStudioManagerQuery: string;
  behaviorStudioManagerMode: BehaviorStudioManagerMode;
  behaviorIndexStepFilter: string;
  behaviorIndexScopeFilter: string;
  behaviorIndexTriggerFilter: string;
  behaviorIndexEffectFilter: string;
  behaviorIndexStatusFilter: BehaviorIndexStatusFilter;
  behaviorIndexObjectView: BehaviorIndexObjectView;
  behaviorIndexLayout: BehaviorIndexLayout;
  expandedBehaviorIndexObjectKey: string | null;
  conditionalGroups: LegacyConditionalRuleGroup[];
  currentBehaviorSelectionSummary: () => string;
  onOpenBehaviorStudioAddBehavior: () => void;
  onOpenBehaviorStudioListenerSection: () => void;
  onOpenBehaviorStudio: (view?: BehaviorStudioView, mode?: BehaviorStudioMode) => void;
  onOpenGraphInspectorSurface: () => void;
  onOpenRuntimeEventEditorForSelection: (selection: AuthoringSelection | null, eventId: string) => void;
  onOpenBehaviorNodeInStudio: (node: BehaviorGraphSelection, ruleIndex?: number | null) => void;
  onSetBehaviorStudioManagerQuery: (query: string) => void;
  onSetBehaviorStudioManagerMode: (mode: BehaviorStudioManagerMode) => void;
  onSetBehaviorStudioMode: (mode: BehaviorStudioMode) => void;
  onSetBehaviorStudioView: (view: BehaviorStudioView) => void;
  onSetBehaviorStudioOpen: (open: boolean) => void;
  onSetBehaviorStudioCreating: (creating: boolean) => void;
  onSetBehaviorStudioAnchor: (anchor: null) => void;
  onSetBehaviorFocusTarget: (target: null) => void;
  onSetInspectorTab: (tab: InspectorTab) => void;
  onSetSelectedAuthoring: (selection: AuthoringSelection | null) => void;
  onSetSelectedBehaviorNode: (node: BehaviorGraphSelection | null) => void;
  onSetEditingRuleIndex: (index: number | null) => void;
  onSetExpandedBehaviorIndexObjectKey: (key: string | null) => void;
  onSetBehaviorIndexStepFilter: (filter: string) => void;
  onSetBehaviorIndexScopeFilter: (filter: string) => void;
  onSetBehaviorIndexTriggerFilter: (filter: string) => void;
  onSetBehaviorIndexEffectFilter: (filter: string) => void;
  onSetBehaviorIndexStatusFilter: (filter: BehaviorIndexStatusFilter) => void;
  onSetBehaviorIndexObjectView: (view: BehaviorIndexObjectView) => void;
  onSetBehaviorIndexLayout: (layout: BehaviorIndexLayout) => void;
  onToggleLegacyConditionalRuleForSelection: (selection: AuthoringSelection, ruleId: string) => void;
  onDuplicateLegacyConditionalRuleForSelection: (selection: AuthoringSelection, ruleId: string) => void;
  onRemoveLegacyConditionalRuleForSelection: (selection: AuthoringSelection, ruleId: string) => void;
  onToggleRuntimeListenerForSelection: (selection: AuthoringSelection | null, listenerId: string) => void;
  onDuplicateRuntimeListenerForSelection: (selection: AuthoringSelection | null, listenerId: string) => void;
  onRemoveRuntimeListenerForSelection: (selection: AuthoringSelection | null, listenerId: string) => void;
  onDuplicateRuntimeEventSourceForSelection: (selection: AuthoringSelection | null, eventId: string) => void;
  onRemoveRuntimeEventSourceForSelection: (selection: AuthoringSelection | null, eventId: string) => void;
  onHandleTestSelectedRule: (rule: LegacyConditionalRule | null) => void;
  onHandleTestSelectedChain: (listener: RuntimeListenerDefinition | null) => void;
  /**
   * Phase 2C-2: trace-from-event sim. Manager surfaces a "Trace from event"
   * action on every Raised by row in the by-event layout; the host runs an
   * ephemeral `dispatchWithReport` and pipes the matched/skipped listener
   * diagnostics back into this prop for inline rendering.
   */
  traceFromEventReport: {
    eventType: string;
    sourceId: string;
    sourceLabel: string;
    report: RuntimeDispatchReport;
  } | null;
  onRunTraceFromEvent: (eventType: string, source: RuntimeEventSourceCandidate) => void;
  onClearTraceFromEvent: () => void;
}

type ManagerFilterState = {
  provenance: "all" | "extraction" | "library" | "manual";
  safetyClass: "all" | "safe" | "destructive" | "host";
  brokenRefsOnly: boolean;
};

type BehaviorIndexObject = {
  id: string;
  kind: "rule" | "flow" | "event";
  objectLabel: string;
  title: string;
  detail: string;
  stepId: string;
  stepTitle: string;
  scopeLabel: string;
  triggerType: string;
  effectType: string;
  status: "enabled" | "disabled";
  startedIds: string[];
  impactsIds: string[];
  startedLabel: string;
  impactsLabel: string;
  selection: AuthoringSelection | null | undefined;
  graphSelection: BehaviorGraphSelection | null;
  ruleIndex: number | null;
  rule: LogicMapConditionalEntry | null;
  listener: LogicMapListenerEntry | null;
  event: RuntimeEventDefinition | null;
  eventSource: RuntimeEventSourceCandidate | null;
  provenance: "extraction" | "library" | "manual" | null;
  worstSafetyClass: BehaviorSafetyClass;
  hasBrokenRef: boolean;
};

export function BehaviorManager({
  selectedAuthoring,
  activeBuilderField,
  activeRuntimeScope,
  activeStep,
  logicMapData,
  runtimeEventSourceCandidates,
  runtimeNodeLabelById,
  behaviorStudioManagerQuery,
  behaviorStudioManagerMode,
  behaviorIndexStepFilter,
  behaviorIndexScopeFilter,
  behaviorIndexTriggerFilter,
  behaviorIndexEffectFilter,
  behaviorIndexStatusFilter,
  behaviorIndexObjectView,
  behaviorIndexLayout,
  expandedBehaviorIndexObjectKey,
  conditionalGroups,
  currentBehaviorSelectionSummary,
  onOpenBehaviorStudioAddBehavior,
  onOpenBehaviorStudioListenerSection,
  onOpenBehaviorStudio,
  onOpenGraphInspectorSurface,
  onOpenRuntimeEventEditorForSelection,
  onOpenBehaviorNodeInStudio,
  onSetBehaviorStudioManagerQuery,
  onSetBehaviorStudioManagerMode,
  onSetBehaviorStudioMode,
  onSetBehaviorStudioView,
  onSetBehaviorStudioOpen,
  onSetBehaviorStudioCreating,
  onSetBehaviorStudioAnchor,
  onSetBehaviorFocusTarget,
  onSetInspectorTab,
  onSetSelectedAuthoring,
  onSetSelectedBehaviorNode,
  onSetEditingRuleIndex,
  onSetExpandedBehaviorIndexObjectKey,
  onSetBehaviorIndexStepFilter,
  onSetBehaviorIndexScopeFilter,
  onSetBehaviorIndexTriggerFilter,
  onSetBehaviorIndexEffectFilter,
  onSetBehaviorIndexStatusFilter,
  onSetBehaviorIndexObjectView,
  onSetBehaviorIndexLayout,
  onToggleLegacyConditionalRuleForSelection,
  onDuplicateLegacyConditionalRuleForSelection,
  onRemoveLegacyConditionalRuleForSelection,
  onToggleRuntimeListenerForSelection,
  onDuplicateRuntimeListenerForSelection,
  onRemoveRuntimeListenerForSelection,
  onDuplicateRuntimeEventSourceForSelection,
  onRemoveRuntimeEventSourceForSelection,
  onHandleTestSelectedRule,
  onHandleTestSelectedChain,
  traceFromEventReport,
  onRunTraceFromEvent,
  onClearTraceFromEvent,
}: BehaviorManagerProps) {
  const [managerFilters, setManagerFilters] = useState<ManagerFilterState>({
    provenance: "all",
    safetyClass: "all",
    brokenRefsOnly: false,
  });
  const scopeListeners = activeRuntimeScope?.listeners ?? [];
  const scopeEvents = activeRuntimeScope?.eventSources ?? [];
  const currentScopeTitle =
    selectedAuthoring === null
      ? "Form behavior"
      : (activeRuntimeScope?.label ?? activeBuilderField?.label ?? activeStep?.title ?? "Current selection");
  const managerQuery = behaviorStudioManagerQuery.trim().toLowerCase();
  const visibleRuleGroups = conditionalGroups.filter((group) => {
    if (!managerQuery) {
      return true;
    }
    const haystack =
      `${group.conditionTitle} ${group.conditionDetail} ${group.effectsSummary} ${group.sourceFieldLabel}`.toLowerCase();
    return haystack.includes(managerQuery);
  });
  const visibleListeners = scopeListeners.filter((listener) => {
    if (!managerQuery) {
      return true;
    }
    const actionSummary = listener.actions.map((action) => formatLabel(action.kind)).join(" ");
    const haystack =
      `${listener.eventName} ${actionSummary} ${listener.enabled ? "enabled" : "disabled"}`.toLowerCase();
    return haystack.includes(managerQuery);
  });
  const visibleEvents = scopeEvents.filter((eventDefinition) => {
    if (!managerQuery) {
      return true;
    }
    const payloadSummary =
      eventDefinition.payloadShape?.fields.map((field) => `${field.name} ${field.label ?? ""}`).join(" ") ?? "";
    const haystack = `${runtimeEventDefinitionType(eventDefinition)} ${payloadSummary} ${
      eventDefinition.description ?? ""
    }`.toLowerCase();
    return haystack.includes(managerQuery);
  });
  const behaviorIndexFieldId = selectedAuthoring?.kind === "field" ? selectedAuthoring.fieldId : null;
  const worstSafetyClassFor = (
    actionKinds: import("@form-builder/schema").RuntimeActionKind[],
  ): BehaviorSafetyClass => {
    let worst: BehaviorSafetyClass = "safe";
    for (const kind of actionKinds) {
      const cls = runtimeActionSafetyClass(kind);
      if (cls === "destructive") return "destructive";
      if (cls === "host") worst = "host";
    }
    return worst;
  };
  const allRuleObjects =
    logicMapData?.steps.flatMap((step) =>
      step.conditionalBehavior.map((rule) => ({
        id: rule.id,
        kind: "rule" as const,
        objectLabel: "Condition",
        title: rule.title,
        detail: rule.detail,
        stepId: step.id,
        stepTitle: step.title,
        scopeLabel: rule.scopeLabel,
        triggerType: "field condition",
        effectType: rule.effectLabel,
        status: rule.enabled ? ("enabled" as const) : ("disabled" as const),
        startedIds: [rule.sourceFieldId],
        impactsIds: [rule.targetFieldId],
        startedLabel: rule.sourceFieldLabel,
        impactsLabel: rule.targetFieldLabel,
        selection: rule.sourceSelection,
        graphSelection: rule.graphSelection,
        ruleIndex: rule.ruleIndex,
        rule,
        listener: null,
        event: null,
        eventSource: null,
        provenance: null as "extraction" | "library" | "manual" | null,
        worstSafetyClass: "safe" as BehaviorSafetyClass,
        hasBrokenRef: !runtimeNodeLabelById.has(rule.sourceFieldId) || !runtimeNodeLabelById.has(rule.targetFieldId),
      })),
    ) ?? [];
  const allFlowObjects = [
    ...(logicMapData?.formListeners ?? []),
    ...(logicMapData?.steps.flatMap((step) => step.runtimeListeners) ?? []),
  ].map((listener) => {
    const hasBrokenRef =
      (listener.sourceNodeId != null && !runtimeNodeLabelById.has(listener.sourceNodeId)) ||
      listener.targetNodeIds.some((id) => !runtimeNodeLabelById.has(id));
    return {
      id: listener.id,
      kind: "flow" as const,
      objectLabel: "Listener",
      title: `When ${formatLabel(listener.eventName)}`,
      detail: listener.actionsSummary,
      stepId: listener.stepId ?? "form",
      stepTitle: listener.stepId
        ? (logicMapData?.steps.find((step) => step.id === listener.stepId)?.title ?? "Step")
        : "Form runtime",
      scopeLabel: listener.scopeLabel,
      triggerType: listener.eventName,
      effectType: listener.actionKinds.length ? listener.actionKinds.map(formatLabel).join(", ") : "No actions",
      status: listener.enabled ? ("enabled" as const) : ("disabled" as const),
      startedIds: [
        listener.sourceNodeId,
        listener.selection?.kind === "field" ? listener.selection.fieldId : null,
      ].filter((value): value is string => Boolean(value)),
      impactsIds: listener.targetNodeIds,
      startedLabel: listener.scopeLabel,
      impactsLabel:
        listener.targetNodeIds.map((id) => runtimeNodeLabelById.get(id) ?? id).join(", ") || listener.actionsSummary,
      selection: listener.selection,
      graphSelection: listener.graphSelection,
      ruleIndex: null,
      rule: null,
      listener,
      event: null,
      eventSource: null,
      provenance: (listener.provenance ?? null) as "extraction" | "library" | "manual" | null,
      worstSafetyClass: worstSafetyClassFor(listener.actionKinds),
      hasBrokenRef,
    };
  });
  const runtimeSelectionForCandidate = (candidate: RuntimeEventSourceCandidate): AuthoringSelection | null => {
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
  };
  const allEventObjects = runtimeEventSourceCandidates.flatMap((source) => {
    const selection = runtimeSelectionForCandidate(source);
    return source.eventDefinitions.map((eventDefinition) => {
      const eventType = runtimeEventDefinitionType(eventDefinition);
      const payloadCount = eventDefinition.payloadShape?.fields.length ?? 0;
      return {
        id: eventDefinition.id,
        kind: "event" as const,
        objectLabel: "Event",
        title: `Dispatches ${formatLabel(eventType)}`,
        detail: `${source.label} can dispatch ${eventType}. ${
          payloadCount ? `${payloadCount} payload field${payloadCount === 1 ? "" : "s"}.` : "No payload fields."
        }`,
        stepId: source.pathIds[1] ?? "form",
        stepTitle: source.pathIds[1]
          ? (logicMapData?.steps.find((step) => step.id === source.pathIds[1])?.title ?? source.locationLabel)
          : "Form runtime",
        scopeLabel: `${source.componentLabel} · ${source.label}`,
        triggerType: eventType,
        effectType: "Dispatchable event",
        status: "enabled" as const,
        startedIds: [source.id] as string[],
        impactsIds: [] as string[],
        startedLabel: source.label,
        impactsLabel: "Available to listeners",
        selection,
        graphSelection: null,
        ruleIndex: null,
        rule: null,
        listener: null,
        event: eventDefinition,
        eventSource: source,
        provenance: null as "extraction" | "library" | "manual" | null,
        worstSafetyClass: "safe" as BehaviorSafetyClass,
        hasBrokenRef: false,
      };
    });
  });
  const behaviorIndexObjects: BehaviorIndexObject[] = [...allEventObjects, ...allRuleObjects, ...allFlowObjects];
  const stepFilterOptions = [
    { value: "all", label: "All steps" },
    { value: "form", label: "Form runtime" },
    ...(logicMapData?.steps.map((step) => ({ value: step.id, label: step.title })) ?? []),
  ];
  const scopeFilterOptions = [
    "all",
    ...Array.from(new Set(behaviorIndexObjects.map((item) => item.scopeLabel))).sort((left, right) =>
      left.localeCompare(right),
    ),
  ];
  const triggerFilterOptions = [
    "all",
    ...Array.from(new Set(behaviorIndexObjects.map((item) => item.triggerType))).sort((left, right) =>
      left.localeCompare(right),
    ),
  ];
  const effectFilterOptions = [
    "all",
    ...Array.from(new Set(behaviorIndexObjects.map((item) => item.effectType))).sort((left, right) =>
      left.localeCompare(right),
    ),
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
    const provenanceMatch =
      managerFilters.provenance === "all" ||
      (managerFilters.provenance === "manual" && item.provenance == null) ||
      item.provenance === managerFilters.provenance;
    const safetyMatch = managerFilters.safetyClass === "all" || item.worstSafetyClass === managerFilters.safetyClass;
    const brokenMatch = !managerFilters.brokenRefsOnly || item.hasBrokenRef;
    return (
      queryMatch &&
      stepMatch &&
      scopeMatch &&
      triggerMatch &&
      effectMatch &&
      statusMatch &&
      objectViewMatch &&
      provenanceMatch &&
      safetyMatch &&
      brokenMatch
    );
  });
  const openBehaviorIndexObject = (item: BehaviorIndexObject) => {
    if (item.kind === "event") {
      onOpenRuntimeEventEditorForSelection(item.selection ?? null, item.id);
      return;
    }
    if (item.selection !== undefined) {
      onSetSelectedAuthoring(item.selection ?? null);
    }
    if (item.graphSelection) {
      onOpenBehaviorNodeInStudio(item.graphSelection, item.ruleIndex);
    }
  };
  const openBehaviorIndexObjectInSimulator = (item: BehaviorIndexObject) => {
    if (!item.graphSelection) {
      return;
    }
    if (item.selection !== undefined) {
      onSetSelectedAuthoring(item.selection ?? null);
    }
    onSetSelectedBehaviorNode(item.graphSelection);
    onSetBehaviorStudioCreating(false);
    onSetBehaviorFocusTarget(null);
    onSetBehaviorStudioMode("test");
    onSetBehaviorStudioView("studio");
    onSetBehaviorStudioOpen(true);
    onSetInspectorTab("behavior");
  };
  const behaviorIndexObjectKey = (item: BehaviorIndexObject) => `${item.kind}:${item.id}`;
  const toggleBehaviorIndexObject = (item: BehaviorIndexObject) => {
    if (item.kind === "rule" && item.selection) {
      onToggleLegacyConditionalRuleForSelection(item.selection, item.id);
      return;
    }
    if (item.kind === "flow") {
      onToggleRuntimeListenerForSelection(item.selection ?? null, item.id);
    }
  };
  const duplicateBehaviorIndexObject = (item: BehaviorIndexObject) => {
    if (item.kind === "rule" && item.selection) {
      onDuplicateLegacyConditionalRuleForSelection(item.selection, item.id);
      return;
    }
    if (item.kind === "flow") {
      onDuplicateRuntimeListenerForSelection(item.selection ?? null, item.id);
      return;
    }
    if (item.kind === "event") {
      onDuplicateRuntimeEventSourceForSelection(item.selection ?? null, item.id);
    }
  };
  const removeBehaviorIndexObject = (item: BehaviorIndexObject) => {
    if (item.kind === "rule" && item.selection) {
      onRemoveLegacyConditionalRuleForSelection(item.selection, item.id);
      return;
    }
    if (item.kind === "flow") {
      onRemoveRuntimeListenerForSelection(item.selection ?? null, item.id);
      return;
    }
    if (item.kind === "event") {
      onRemoveRuntimeEventSourceForSelection(item.selection ?? null, item.id);
    }
  };
  const showIndex = behaviorStudioManagerMode === "index";
  const showBehavior = false;
  const showFlows = behaviorStudioManagerMode !== "conditions" && !showIndex;

  if (!showIndex) {
    const scopedObjectCount = visibleEvents.length + visibleListeners.length;
    return (
      <div className="space-y-3">
        <div className="rounded-[0.95rem] border border-soft bg-white p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Event and listener manager
              </p>
              <h4 className="mt-1 truncate text-base font-semibold text-slate-950">{currentScopeTitle}</h4>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="app-pill">
                  {visibleEvents.length} event{visibleEvents.length === 1 ? "" : "s"}
                </span>
                <span className="app-pill">
                  {visibleListeners.length} listener{visibleListeners.length === 1 ? "" : "s"}
                </span>
                {activeRuntimeScope ? <span className="app-pill">{activeRuntimeScope.label}</span> : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onSetBehaviorStudioAnchor(null);
                onSetBehaviorStudioCreating(false);
                onSetBehaviorStudioManagerMode("index");
                onSetBehaviorStudioMode("manage");
                onSetBehaviorStudioView("studio");
              }}
              className={actionButtonClass("secondary")}
            >
              Open full manager
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onOpenBehaviorStudioAddBehavior()}
              disabled={!activeRuntimeScope}
              className={actionButtonClass()}
            >
              Add behavior
            </button>
          </div>
        </div>

        {scopedObjectCount ? (
          <div className="space-y-2">
            {visibleEvents.length ? (
              <div className="rounded-[0.9rem] border border-blue-100 bg-blue-50/50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-blue-700">
                      Events this component dispatches
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      Saved dispatcher definitions stay with this source item and can be reused by listeners on other
                      items.
                    </p>
                  </div>
                  <span className="app-pill">{visibleEvents.length} saved</span>
                </div>
                <div className="mt-3 space-y-2">
                  {visibleEvents.map((eventDefinition) => {
                    const eventType = runtimeEventDefinitionType(eventDefinition);
                    const payloadCount = eventDefinition.payloadShape?.fields.length ?? 0;
                    return (
                      <div
                        key={`compact-event-${eventDefinition.id}`}
                        className="rounded-[0.85rem] border border-soft bg-white px-3 py-2.5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap gap-1.5">
                              <span className="app-pill">Event</span>
                              <span className="app-pill">
                                {eventDefinition.bubbles === false ? "Target only" : "Bubbles"}
                              </span>
                              <span className="app-pill">
                                {payloadCount} payload field{payloadCount === 1 ? "" : "s"}
                              </span>
                            </div>
                            <p className="mt-2 text-sm font-semibold text-slate-950">{formatLabel(eventType)}</p>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
                              {eventDefinition.description ||
                                "This component can dispatch this event for other listeners to consume."}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                onOpenRuntimeEventEditorForSelection(selectedAuthoring, eventDefinition.id)
                              }
                              className={actionButtonClass("secondary")}
                            >
                              Edit event
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onDuplicateRuntimeEventSourceForSelection(selectedAuthoring, eventDefinition.id)
                              }
                              className={actionButtonClass("secondary")}
                            >
                              Duplicate
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onRemoveRuntimeEventSourceForSelection(selectedAuthoring, eventDefinition.id)
                              }
                              className={actionButtonClass("danger")}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {visibleRuleGroups.map((group: LegacyConditionalRuleGroup) => {
              const focusRule = group.members[0];
              return (
                <div
                  key={`compact-rule-${group.key}`}
                  className="rounded-[0.9rem] border border-soft bg-white px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap gap-1.5">
                        <span className="app-pill">Condition</span>
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
                          onSetBehaviorStudioCreating(false);
                          onSetEditingRuleIndex(focusRule?.index ?? null);
                          onSetSelectedBehaviorNode(
                            focusRule
                              ? {
                                  kind: "rule",
                                  ruleId: focusRule.rule.ruleId,
                                  phase: "condition",
                                }
                              : null,
                          );
                          onSetBehaviorStudioMode("create");
                          onSetBehaviorStudioView("studio");
                        }}
                        className={actionButtonClass("secondary")}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!focusRule) return;
                          onSetSelectedBehaviorNode({
                            kind: "rule",
                            ruleId: focusRule.rule.ruleId,
                            phase: "condition",
                          });
                          onHandleTestSelectedRule(focusRule.rule);
                          onSetBehaviorStudioMode("test");
                          onSetBehaviorStudioView("studio");
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

            {visibleListeners.length ? (
              <div className="rounded-[0.9rem] border border-emerald-100 bg-emerald-50/40 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                      Listeners on this component
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      Each listener belongs to this reacting component and owns its own action chain.
                    </p>
                  </div>
                  <span className="app-pill">{visibleListeners.length} saved</span>
                </div>
                <div className="mt-3 space-y-2">
                  {visibleListeners.map((listener) => {
                    const listenerIndex = scopeListeners.findIndex((candidate) => candidate.id === listener.id);
                    return (
                      <div
                        key={`compact-listener-${listener.id}`}
                        className="rounded-[0.85rem] border border-soft bg-white px-3 py-2.5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap gap-1.5">
                              <span className="app-pill">Listener</span>
                              <span className="app-pill">{listener.enabled ? "Enabled" : "Disabled"}</span>
                              <span className="app-pill">
                                {listener.actions.length} action{listener.actions.length === 1 ? "" : "s"}
                              </span>
                            </div>
                            <p className="mt-2 text-sm font-semibold text-slate-950">
                              When {formatLabel(listener.eventName)}
                            </p>
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
                                onSetBehaviorStudioCreating(false);
                                onSetSelectedBehaviorNode({
                                  kind: "listener",
                                  listenerId: listener.id,
                                  phase: listener.actions.length ? "action" : "trigger",
                                  actionId: listener.actions[0]?.id,
                                });
                                onSetBehaviorStudioMode("action");
                                onSetBehaviorStudioView("studio");
                              }}
                              className={actionButtonClass("secondary")}
                            >
                              Edit listener
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onSetSelectedBehaviorNode({
                                  kind: "listener",
                                  listenerId: listener.id,
                                  phase: listener.actions.length ? "action" : "trigger",
                                  actionId: listener.actions[0]?.id,
                                });
                                onHandleTestSelectedChain(listener);
                                onSetBehaviorStudioMode("test");
                                onSetBehaviorStudioView("studio");
                              }}
                              className={actionButtonClass("secondary")}
                            >
                              Test
                            </button>
                          </div>
                        </div>
                        {listenerIndex >= 0 ? (
                          <p className="mt-2 text-[0.68rem] text-slate-500">
                            Listener {listenerIndex + 1} on this selection
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-[0.95rem] border border-dashed border-slate-300 bg-white px-4 py-5 text-sm leading-6 text-slate-600">
            No events or listeners are attached to this selection yet. Add an event here, add a listener, or open the
            full manager to inspect document-wide behavior.
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
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Behavior manager</p>
            <h4 className="mt-2 text-lg font-semibold text-slate-950">{currentScopeTitle}</h4>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Search, filter, create, and reopen behavior from one dedicated surface.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onOpenBehaviorStudioAddBehavior()} className={actionButtonClass()}>
              Add event
            </button>
            <button
              type="button"
              onClick={onOpenBehaviorStudioListenerSection}
              className={actionButtonClass("secondary")}
            >
              Add listener
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {scopeListeners.length ? (
            <span className="app-pill">
              {scopeListeners.length} listener{scopeListeners.length === 1 ? "" : "s"}
            </span>
          ) : null}
          {activeRuntimeScope ? <span className="app-pill">{activeRuntimeScope.label}</span> : null}
          <span className="app-pill">{currentBehaviorSelectionSummary()}</span>
        </div>
        <div className="mt-4 grid gap-3">
          <input
            value={behaviorStudioManagerQuery}
            onChange={(event) => onSetBehaviorStudioManagerQuery(event.target.value)}
            placeholder="Search events, actions, sources, and targets"
            className="w-full rounded-2xl border border-soft bg-slate-50 px-4 py-3 text-sm text-slate-800"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onSetBehaviorStudioManagerMode("all")}
              className={actionButtonClass("secondary")}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => onSetBehaviorStudioManagerMode("flows")}
              className={actionButtonClass("secondary")}
            >
              Listeners
            </button>
            <button
              type="button"
              onClick={() => onSetBehaviorStudioManagerMode("index")}
              className={actionButtonClass("primary")}
            >
              Full index
            </button>
            <button type="button" onClick={onOpenGraphInspectorSurface} className={actionButtonClass("secondary")}>
              Graph view
            </button>
            <button
              type="button"
              onClick={() => {
                onSetBehaviorFocusTarget(null);
                onOpenBehaviorStudio("advanced", "test");
              }}
              className={actionButtonClass("secondary")}
            >
              Test
            </button>
          </div>
        </div>
      </div>

      {showIndex ? (
        <div className="rounded-[1.15rem] border border-soft bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Behavior Manager</p>
              <h5 className="mt-2 text-base font-semibold text-slate-950">Document behavior index</h5>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Manage events, listeners, and action chains first. The graph is an overview and trace target, not the
                primary list.
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
                  onChange={(event) => onSetBehaviorIndexStepFilter(event.target.value)}
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
                  onChange={(event) => onSetBehaviorIndexScopeFilter(event.target.value)}
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
                  onChange={(event) => onSetBehaviorIndexTriggerFilter(event.target.value)}
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
                  onChange={(event) => onSetBehaviorIndexEffectFilter(event.target.value)}
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
                  onClick={() => onSetBehaviorIndexStatusFilter(status)}
                  className={actionButtonClass(behaviorIndexStatusFilter === status ? "primary" : "secondary")}
                >
                  {status === "all" ? "Any status" : formatLabel(status)}
                </button>
              ))}
              {(["all", "impacts", "started"] as const).map((view) => {
                const fieldLabel = activeBuilderField?.label?.trim() || activeBuilderField?.id || "this field";
                const label =
                  view === "all"
                    ? "All objects"
                    : view === "impacts"
                      ? activeBuilderField
                        ? `Impacts ${fieldLabel}`
                        : "Impacts this field"
                      : activeBuilderField
                        ? `Started from ${fieldLabel}`
                        : "Started from this field";
                return (
                  <button
                    key={`behavior-view-${view}`}
                    type="button"
                    onClick={() => onSetBehaviorIndexObjectView(view)}
                    className={actionButtonClass(behaviorIndexObjectView === view ? "primary" : "secondary")}
                    disabled={view !== "all" && !behaviorIndexFieldId}
                    title={view === "all" ? "Show every behavior in this form" : `Filter to behaviors that ${view === "impacts" ? "act on" : "fire from"} the currently selected field`}
                  >
                    {label}
                  </button>
                );
              })}
              {(["table", "by_event", "map"] as const).map((layout) => (
                <button
                  key={`behavior-layout-${layout}`}
                  type="button"
                  onClick={() => onSetBehaviorIndexLayout(layout)}
                  className={actionButtonClass(behaviorIndexLayout === layout ? "primary" : "secondary")}
                  title={
                    layout === "by_event"
                      ? "Group behaviors by event type — see who raises and consumes each event"
                      : layout === "map"
                        ? "Layered DAG: event sources → listeners → action targets, capped at 200 nodes"
                        : "Flat list of every behavior matching the filters"
                  }
                >
                  {layout === "table" ? "Table" : layout === "by_event" ? "By event" : "Map"}
                </button>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs uppercase tracking-[0.16em] text-slate-500">
                Provenance
                <select
                  value={managerFilters.provenance}
                  onChange={(event) =>
                    setManagerFilters((prev) => ({
                      ...prev,
                      provenance: event.target.value as ManagerFilterState["provenance"],
                    }))
                  }
                  className="mt-1 w-full rounded-2xl border border-soft bg-slate-50 px-3 py-2.5 text-sm normal-case tracking-normal text-slate-800"
                >
                  <option value="all">All provenances</option>
                  <option value="manual">Manual</option>
                  <option value="extraction">Extraction</option>
                  <option value="library">Library</option>
                </select>
              </label>
              <label className="text-xs uppercase tracking-[0.16em] text-slate-500">
                Safety class
                <select
                  value={managerFilters.safetyClass}
                  onChange={(event) =>
                    setManagerFilters((prev) => ({
                      ...prev,
                      safetyClass: event.target.value as ManagerFilterState["safetyClass"],
                    }))
                  }
                  className="mt-1 w-full rounded-2xl border border-soft bg-slate-50 px-3 py-2.5 text-sm normal-case tracking-normal text-slate-800"
                >
                  <option value="all">All classes</option>
                  <option value="safe">Safe</option>
                  <option value="host">Host</option>
                  <option value="destructive">Destructive</option>
                </select>
                {managerFilters.safetyClass !== "all" && (
                  <span className="mt-1 block text-xs normal-case tracking-normal text-slate-500">
                    Filters listener actions only — rules and events not shown.
                  </span>
                )}
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setManagerFilters((prev) => ({ ...prev, brokenRefsOnly: !prev.brokenRefsOnly }))}
                className={actionButtonClass(managerFilters.brokenRefsOnly ? "primary" : "secondary")}
              >
                {managerFilters.brokenRefsOnly ? "Broken refs only (on)" : "Broken refs only"}
              </button>
              {managerFilters.provenance !== "all" ||
              managerFilters.safetyClass !== "all" ||
              managerFilters.brokenRefsOnly ? (
                <button
                  type="button"
                  onClick={() => setManagerFilters({ provenance: "all", safetyClass: "all", brokenRefsOnly: false })}
                  className={actionButtonClass("secondary")}
                >
                  Clear extra filters
                </button>
              ) : null}
            </div>
          </div>

          {behaviorIndexLayout === "by_event" && visibleBehaviorIndexObjects.length
            ? (() => {
                const groups = new Map<
                  string,
                  { triggerType: string; raisedBy: BehaviorIndexObject[]; consumedBy: BehaviorIndexObject[] }
                >();
                for (const item of visibleBehaviorIndexObjects) {
                  const triggerType = item.triggerType || "(unspecified)";
                  const group = groups.get(triggerType) ?? {
                    triggerType,
                    raisedBy: [],
                    consumedBy: [],
                  };
                  if (item.kind === "event") {
                    group.raisedBy.push(item);
                  } else {
                    group.consumedBy.push(item);
                  }
                  groups.set(triggerType, group);
                }
                const sorted = Array.from(groups.values()).sort((left, right) =>
                  left.triggerType.localeCompare(right.triggerType),
                );
                return (
                  <div className="mt-4 space-y-4">
                    {sorted.map((group) => (
                      <div
                        key={`behavior-by-event-${group.triggerType}`}
                        className="rounded-[1.05rem] border border-soft bg-slate-50 p-4"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                              Event type
                            </p>
                            <h6 className="mt-1 text-base font-semibold text-slate-950">
                              {formatLabel(group.triggerType)}
                            </h6>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span className="app-pill">
                              Raised by {group.raisedBy.length} source{group.raisedBy.length === 1 ? "" : "s"}
                            </span>
                            <span className="app-pill">
                              Consumed by {group.consumedBy.length} listener
                              {group.consumedBy.length === 1 ? "" : "s"}
                            </span>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-3 lg:grid-cols-2">
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Raised by</p>
                            {group.raisedBy.length ? (
                              <div className="mt-2 space-y-2">
                                {group.raisedBy.map((item) => {
                                  const traceActive =
                                    traceFromEventReport?.eventType === group.triggerType &&
                                    traceFromEventReport?.sourceId === item.id;
                                  return (
                                    <div
                                      key={`raised-${behaviorIndexObjectKey(item)}`}
                                      className={`rounded-[0.85rem] border p-3 ${
                                        traceActive ? "border-sky-300 bg-sky-50" : "border-soft bg-white"
                                      }`}
                                    >
                                      <p className="text-sm font-semibold text-slate-950">{item.scopeLabel}</p>
                                      <p className="mt-1 text-xs text-slate-600">{item.detail}</p>
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        <button
                                          type="button"
                                          onClick={() => openBehaviorIndexObject(item)}
                                          className={actionButtonClass("primary")}
                                        >
                                          Open
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            item.eventSource && onRunTraceFromEvent(group.triggerType, item.eventSource)
                                          }
                                          className={actionButtonClass(traceActive ? "primary" : "secondary")}
                                          disabled={!item.eventSource}
                                        >
                                          {traceActive ? "Tracing…" : "Trace from event"}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="mt-2 text-sm text-slate-500">No declared sources for this event yet.</p>
                            )}
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Consumed by</p>
                            {group.consumedBy.length ? (
                              <div className="mt-2 space-y-2">
                                {group.consumedBy.map((item) => {
                                  const canTest = item.graphSelection !== null;
                                  return (
                                    <div
                                      key={`consumed-${behaviorIndexObjectKey(item)}`}
                                      className="rounded-[0.85rem] border border-soft bg-white p-3"
                                    >
                                      <div className="flex flex-wrap gap-2">
                                        <span className="app-pill">{item.objectLabel}</span>
                                        <span className="app-pill">{item.status}</span>
                                        <span className="app-pill">{item.stepTitle}</span>
                                        {item.hasBrokenRef ? (
                                          <span className="app-pill bg-red-100 text-red-700">broken ref</span>
                                        ) : null}
                                      </div>
                                      <p className="mt-2 text-sm font-semibold text-slate-950">{item.title}</p>
                                      <p className="mt-1 text-xs text-slate-600">{item.detail}</p>
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        <button
                                          type="button"
                                          onClick={() => openBehaviorIndexObject(item)}
                                          className={actionButtonClass("primary")}
                                        >
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
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="mt-2 text-sm text-slate-500">No listeners react to this event yet.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()
            : null}

          {behaviorIndexLayout === "by_event" && traceFromEventReport ? (
            <div className="mt-4 rounded-[1.05rem] border border-sky-300 bg-sky-50 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-sky-700">
                    Trace from event
                  </p>
                  <h6 className="mt-1 text-base font-semibold text-slate-950">
                    {formatLabel(traceFromEventReport.eventType)}
                  </h6>
                  <p className="mt-1 text-xs text-slate-600">
                    Dispatched from <span className="font-medium">{traceFromEventReport.sourceLabel}</span> against an
                    ephemeral runtime — the live preview engine is untouched.
                  </p>
                </div>
                <button type="button" onClick={onClearTraceFromEvent} className={actionButtonClass("secondary")}>
                  Close trace
                </button>
              </div>
              {traceFromEventReport.report.listeners.length ? (
                <div className="mt-3 space-y-2">
                  {traceFromEventReport.report.listeners.map((diagnostic) => (
                    <div
                      key={`trace-listener-${diagnostic.listenerId}`}
                      className={`rounded-[0.85rem] border p-3 ${
                        diagnostic.matched ? "border-emerald-300 bg-white" : "border-amber-300 bg-amber-50"
                      }`}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-950">
                          {diagnostic.label ?? `Listener ${diagnostic.listenerId}`}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <span
                            className={`app-pill ${
                              diagnostic.matched ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {diagnostic.matched ? "Matched" : "Skipped"}
                          </span>
                          <span className="app-pill">{formatLabel(diagnostic.eventPhase ?? "target")}</span>
                          {diagnostic.skippedReason ? (
                            <span className="app-pill bg-slate-100 text-slate-700">
                              {formatLabel(diagnostic.skippedReason)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        {formatLabel(diagnostic.dispatcherType)} · {diagnostic.dispatcherId}
                        {diagnostic.resolvedTarget?.labelHint
                          ? ` → ${diagnostic.resolvedTarget.labelHint}`
                          : diagnostic.resolvedTarget?.id
                            ? ` → ${diagnostic.resolvedTarget.id}`
                            : ""}
                      </p>
                      {diagnostic.conditions.length ? (
                        <ul className="mt-2 space-y-1 text-xs text-slate-700">
                          {diagnostic.conditions.map((condition) => (
                            <li key={`trace-cond-${diagnostic.listenerId}-${condition.conditionId}`}>
                              {condition.passed ? "✓" : "✗"} {condition.label ?? condition.conditionId} ·{" "}
                              {condition.operator}
                              {condition.expectedValue !== undefined
                                ? ` (expected ${String(condition.expectedValue)})`
                                : ""}
                              {!condition.passed && condition.actualValue !== undefined
                                ? ` · actual ${String(condition.actualValue)}`
                                : ""}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-600">
                  No listeners reach this event from the chosen source. Add a consumer to start a chain.
                </p>
              )}
            </div>
          ) : null}

          {behaviorIndexLayout === "map"
            ? (() => {
                const mapGroups = new Map<
                  string,
                  {
                    triggerType: string;
                    raised: { id: string; scopeLabel: string; detail: string; hasBrokenRef: boolean }[];
                    listeners: {
                      id: string;
                      title: string;
                      status: "enabled" | "disabled";
                      scopeLabel: string;
                      hasBrokenRef: boolean;
                      impactsLabel: string;
                      onOpen: () => void;
                    }[];
                  }
                >();
                for (const item of visibleBehaviorIndexObjects) {
                  const triggerType = item.triggerType || "(unspecified)";
                  const group = mapGroups.get(triggerType) ?? {
                    triggerType,
                    raised: [],
                    listeners: [],
                  };
                  if (item.kind === "event") {
                    group.raised.push({
                      id: item.id,
                      scopeLabel: item.scopeLabel,
                      detail: item.detail,
                      hasBrokenRef: item.hasBrokenRef,
                    });
                  } else {
                    group.listeners.push({
                      id: item.id,
                      title: item.title,
                      status: item.status,
                      scopeLabel: item.scopeLabel,
                      hasBrokenRef: item.hasBrokenRef,
                      impactsLabel: item.impactsLabel,
                      onOpen: () => openBehaviorIndexObject(item),
                    });
                  }
                  mapGroups.set(triggerType, group);
                }
                const sortedMapGroups = Array.from(mapGroups.values()).sort((left, right) =>
                  left.triggerType.localeCompare(right.triggerType),
                );
                const totalNodes = sortedMapGroups.reduce(
                  (sum, group) => sum + group.raised.length + group.listeners.length * 2, // listener + target
                  0,
                );
                return (
                  <BehaviorIndexMap
                    groups={sortedMapGroups}
                    totalNodes={totalNodes}
                    onSelectGroup={(triggerType) => onSetBehaviorIndexTriggerFilter(triggerType)}
                  />
                );
              })()
            : null}

          <div className={`mt-4 space-y-3 ${behaviorIndexLayout !== "table" ? "hidden" : ""}`}>
            {visibleBehaviorIndexObjects.length ? (
              visibleBehaviorIndexObjects.map((item) => {
                const itemKey = behaviorIndexObjectKey(item);
                const detailsOpen = expandedBehaviorIndexObjectKey === itemKey;
                const canTest = item.graphSelection !== null;
                return (
                  <div
                    key={`behavior-index-${item.kind}-${item.id}`}
                    className="rounded-[0.95rem] border border-soft bg-slate-50 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap gap-2">
                          <span className="app-pill">{item.objectLabel}</span>
                          <span className="app-pill">{item.status}</span>
                          <span className="app-pill">{item.stepTitle}</span>
                          {item.provenance != null ? (
                            <span
                              className={`app-pill ${
                                item.provenance === "extraction"
                                  ? "bg-slate-100 text-slate-600"
                                  : item.provenance === "library"
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-slate-100 text-slate-600"
                              }`}
                              title={`Provenance: ${item.provenance}`}
                            >
                              {item.provenance}
                            </span>
                          ) : null}
                          {item.worstSafetyClass !== "safe" ? (
                            <span
                              className={`app-pill ${
                                item.worstSafetyClass === "destructive"
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-amber-100 text-amber-700"
                              }`}
                              title={`Safety: ${item.worstSafetyClass}`}
                            >
                              {item.worstSafetyClass}
                            </span>
                          ) : null}
                          {item.hasBrokenRef ? (
                            <span className="app-pill bg-red-100 text-red-700" title="Has broken reference">
                              broken ref
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-3 font-semibold text-slate-950">{item.title}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
                        <div className="mt-3 grid gap-2 text-sm text-slate-600">
                          <span>Started from: {item.startedLabel}</span>
                          <span>Impacts: {item.impactsLabel}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openBehaviorIndexObject(item)}
                          className={actionButtonClass("primary")}
                        >
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
                          onClick={() => onSetExpandedBehaviorIndexObjectKey(detailsOpen ? null : itemKey)}
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
                            Use these object operations for lifecycle management. Open the studio when the wiring itself
                            needs to change.
                          </p>
                        </div>
                        <div className="flex flex-wrap content-start gap-2 lg:max-w-[18rem]">
                          {item.kind !== "event" ? (
                            <button
                              type="button"
                              onClick={() => toggleBehaviorIndexObject(item)}
                              className={actionButtonClass("secondary")}
                            >
                              {item.status === "enabled" ? "Disable" : "Enable"}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => duplicateBehaviorIndexObject(item)}
                            className={actionButtonClass("secondary")}
                          >
                            Duplicate
                          </button>
                          <button
                            type="button"
                            onClick={() => removeBehaviorIndexObject(item)}
                            className={actionButtonClass("danger")}
                          >
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

      {showBehavior ? (
        <div className="rounded-[1.15rem] border border-soft bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Behavior manager</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Behavior should read as explicit objects you can inspect and reopen, not hidden branches inside the
                graph.
              </p>
            </div>
            {selectedAuthoring?.kind === "field" ? (
              <button type="button" onClick={() => onOpenBehaviorStudioAddBehavior()} className={actionButtonClass()}>
                Add behavior
              </button>
            ) : null}
          </div>
          {selectedAuthoring?.kind === "field" && activeBuilderField ? (
            visibleRuleGroups.length ? (
              <div className="mt-4 space-y-3">
                {visibleRuleGroups.map((group: LegacyConditionalRuleGroup) => {
                  const focusRule = group.members[0];
                  return (
                    <div
                      key={`behavior-rule-group-${group.key}`}
                      className="rounded-[0.95rem] border border-soft bg-slate-50 p-4"
                    >
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
                            onSetBehaviorStudioCreating(false);
                            onSetEditingRuleIndex(focusRule?.index ?? null);
                            onSetSelectedBehaviorNode(
                              focusRule
                                ? {
                                    kind: "rule",
                                    ruleId: focusRule.rule.ruleId,
                                    phase: "condition",
                                  }
                                : null,
                            );
                            onOpenBehaviorStudio("studio");
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
                  ? "No conditional behavior matches the current search."
                  : "No field behavior yet. Create one in Behavior Studio so conditions and actions can be wired with room to breathe."}
              </div>
            )
          ) : (
            <div className="app-muted-card mt-4 p-4 text-sm text-slate-500">
              Select a field to manage conditional behavior. Step, section, and form behavior can still use events and
              actions.
            </div>
          )}
        </div>
      ) : null}

      {showFlows ? (
        <div className="rounded-[1.15rem] border border-soft bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Listeners</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Build listeners around events and action chains, then reopen them in the studio when they need deeper
                wiring.
              </p>
            </div>
            {activeRuntimeScope ? (
              <button type="button" onClick={() => onOpenBehaviorStudioAddBehavior()} className={actionButtonClass()}>
                Add behavior
              </button>
            ) : null}
          </div>
          {visibleListeners.length ? (
            <div className="mt-4 space-y-3">
              {visibleListeners.map((listener) => {
                const listenerIndex = scopeListeners.findIndex((candidate) => candidate.id === listener.id);
                return (
                  <div
                    key={`behavior-listener-${listener.id}`}
                    className="rounded-[0.95rem] border border-soft bg-slate-50 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-950">
                          Listener {listenerIndex + 1}: {formatLabel(listener.eventName)}
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
                          onSetBehaviorStudioCreating(false);
                          onSetSelectedBehaviorNode({
                            kind: "listener",
                            listenerId: listener.id,
                            phase: listener.actions.length ? "action" : "trigger",
                            actionId: listener.actions[0]?.id,
                          });
                          onOpenBehaviorStudio("studio");
                        }}
                        className={actionButtonClass("secondary")}
                      >
                        Edit listener
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="app-muted-card mt-4 p-4 text-sm text-slate-500">
              {scopeListeners.length
                ? "No listeners match the current search."
                : "No listeners yet for this scope. Start in the studio instead of building it inline in the inspector."}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
