import type React from "react";
import { Fragment } from "react";
import type {
  AuthoringDocument,
  AuthoringField,
  AuthoringGroup,
  AuthoringSection,
  AuthoringStep,
  RuntimeNodeType,
  RuntimeSessionState,
} from "@form-builder/schema";
import type { RuntimeTraceEntry } from "@form-builder/runtime";
import type { AuthoringSelection } from "../../../lib/authoring-utils";
import {
  describeRuntimeAction,
  documentBehaviorClusterFocusLabel,
  legacyFieldConditionals,
  normalizeDocumentBehaviorClusterKind,
  runtimeNodeTypeLabel,
} from "../utils/runtime-helpers";
import type {
  BehaviorGraphDensity,
  BehaviorGraphEntryContext,
  BehaviorGraphFilter,
  BehaviorGraphMode,
  BehaviorGraphSelection,
  BehaviorScopeCluster,
  BehaviorStudioMode,
  BehaviorStudioView,
  BehaviorWorkspaceMode,
  DocumentBehaviorCanvasDensity,
  DocumentBehaviorClusterFamily,
  DocumentBehaviorClusterFocus,
  DocumentBehaviorClusterGroupSummary,
  DocumentBehaviorExpandedTarget,
  DocumentBehaviorSurfaceMode,
  LegacyConditionalRule,
  LegacyConditionalRuleGroup,
  LogicMapConditionalEntry,
  LogicMapListenerEntry,
  LogicMapStepEntry,
  RuntimeEditorScope,
  RuntimeEventSourceCandidate,
} from "../utils/runtime-helpers";
import type { InspectorTab } from "../../inspector";
import { BehaviorEdgeLabel, BehaviorGraphNode } from "../cards/BehaviorGraphNode";
import { CrossStepRefBadge } from "../cards/CrossStepRefBadge";
import { EventPayloadBadge } from "../cards/EventPayloadBadge";
import { ReverseIndexBadge } from "../cards/ReverseIndexBadge";
import { collectCrossStepRefsForListener } from "../../../lib/payload-schema-helpers";
import { countListenersReferencingNode } from "../stack/runtime-stack-helpers";
import { actionButtonClass, formatLabel } from "../../../lib/ui-utils";
import type { FieldRule } from "../../../lib/field-rule-helpers";
import { FieldRulesTriggers } from "../field-rules/FieldRulesTriggers";

function runtimeNodeTypeForAuthoringField(field: AuthoringField | null | undefined): RuntimeNodeType {
  if (field?.rendererHints.component === "button" || field?.semanticType === "statement") {
    return "component";
  }
  return "field";
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
      conditions: [],
      listeners: [],
      selection: config.selection,
    };
    clusters.set(config.key, cluster);
    return cluster;
  };

  step.conditionalBehavior.forEach((rule) => {
    const [kindLabel, ...labelParts] = rule.scopeLabel.split(" · ");
    const title = labelParts.join(" · ") || rule.targetFieldLabel;
    ensureCluster({
      key: rule.scopeLabel,
      title,
      kindLabel,
      selection: rule.sourceSelection,
    }).conditions.push(rule);
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
    detail: `${cluster.conditions.length} conditional behavior${cluster.conditions.length === 1 ? "" : "s"} · ${cluster.listeners.length} event behavior${
      cluster.listeners.length === 1 ? "" : "s"
    }`,
  }));
}

function buildBehaviorScopeClustersForDocument(steps: LogicMapStepEntry[]): BehaviorScopeCluster[] {
  return steps.map((step) => ({
    key: step.id,
    title: step.title,
    kindLabel: "Step",
    detail: `${step.conditionalBehavior.length} conditional behavior${step.conditionalBehavior.length === 1 ? "" : "s"} · ${step.runtimeListeners.length} event behavior${
      step.runtimeListeners.length === 1 ? "" : "s"
    }`,
    conditions: step.conditionalBehavior,
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
      return (
        left.sectionId === (right.kind === "group" ? right.sectionId : null) &&
        left.groupId === (right.kind === "group" ? right.groupId : null)
      );
    case "field":
      return (
        left.sectionId === (right.kind === "field" ? right.sectionId : null) &&
        (left.groupId ?? null) === (right.kind === "field" ? (right.groupId ?? null) : null) &&
        left.fieldId === (right.kind === "field" ? right.fieldId : null)
      );
  }
}

interface LogicMapData {
  totalConditionals: number;
  totalListeners: number;
  formListeners: LogicMapListenerEntry[];
  steps: LogicMapStepEntry[];
}

interface FocusBehaviorGraphNodeOptions {
  selection: AuthoringSelection | null;
  graphSelection?: BehaviorGraphSelection | null;
  ruleIndex?: number | null;
  filter?: BehaviorGraphFilter;
  mode?: BehaviorGraphMode;
  viewport?: "preserve" | "reset";
  entryContext?: BehaviorGraphEntryContext | null;
}

interface OpenBehaviorObjectOptions {
  objectKey?: string | null;
  selection?: AuthoringSelection | null;
  graphSelection?: BehaviorGraphSelection | null;
  ruleIndex?: number | null;
}

export interface BehaviorWorkspaceProps {
  selectedAuthoring: AuthoringSelection | null;
  activeBuilderField: AuthoringField | null;
  activeRuntimeScope: RuntimeEditorScope | null;
  activeRuntimeTarget: RuntimeEventSourceCandidate | null;
  activeDocument: AuthoringDocument | null;
  activeStep: AuthoringStep | null;
  activeSection: AuthoringSection | null;
  activeGroup: AuthoringGroup | null;
  logicMapData: LogicMapData | null;
  runtimeNodeLabelById: Map<string, string>;
  runtimeTraceEntries: RuntimeTraceEntry[];
  runtimeSessionState: RuntimeSessionState | null;
  runtimeSubmitPreview: unknown;
  runtimeActiveStep: AuthoringStep | null;
  behaviorGraphFilter: BehaviorGraphFilter;
  behaviorGraphMode: BehaviorGraphMode;
  behaviorGraphDensity: BehaviorGraphDensity;
  behaviorGraphZoom: number;
  behaviorGraphOffset: { x: number; y: number };
  behaviorGraphEntryContext: BehaviorGraphEntryContext | null;
  behaviorWorkspaceMode: BehaviorWorkspaceMode;
  documentBehaviorClusterFocus: DocumentBehaviorClusterFocus;
  documentBehaviorTrailFamilies: DocumentBehaviorClusterFamily[];
  documentBehaviorCanvasRelevantOnly: boolean;
  documentBehaviorCanvasDensity: DocumentBehaviorCanvasDensity;
  documentBehaviorSurfaceMode: DocumentBehaviorSurfaceMode;
  documentBehaviorPinnedLaneIds: string[];
  expandedDocumentBehaviorTarget: DocumentBehaviorExpandedTarget;
  documentBehaviorGraphZoom: number;
  documentBehaviorGraphOffset: { x: number; y: number };
  selectedBehaviorNode: BehaviorGraphSelection | null;
  runtimeSessionInputRef: React.RefObject<HTMLInputElement>;
  builderFieldOptions: Array<{ id: string; label: string }>;
  buildLegacyConditionalRuleGroups: (conditions: LegacyConditionalRule[]) => LegacyConditionalRuleGroup[];
  currentBehaviorSelectionSummary: (
    selectedRule?: LegacyConditionalRule | null,
    selectedListener?: import("@form-builder/schema").RuntimeListenerDefinition | null,
  ) => string;
  onFocusBehaviorGraphNode: (options: FocusBehaviorGraphNodeOptions) => void;
  onResetBehaviorGraphViewport: () => void;
  onResetDocumentBehaviorGraphViewport: () => void;
  onOpenBehaviorBehaviorManager: () => void;
  onOpenBehaviorNodeInStudio: (node: BehaviorGraphSelection, ruleIndex?: number | null) => void;
  onOpenBehaviorObjectInBehaviorManager: (options: OpenBehaviorObjectOptions) => void;
  onOpenBehaviorStudioAddBehavior: (anchor?: null) => void;
  onOpenBehaviorStudioReactToAnotherItem: (anchor?: null) => void;
  onCloseBehaviorStudio: () => void;
  /**
   * Phase 10 — open the unified TestPanel pre-filled for the given listener.
   * Replaces the legacy "Test behavior" / "Run behavior test" buttons.
   */
  onOpenTestPanelForListener?: (listenerId: string) => void;
  /** Phase 10 — fallback for "test from current selection" (e.g. legacy rule rows). */
  onOpenTestPanelFromSelection?: () => void;
  onHandleExportRuntimeSession: () => void;
  onHandleBehaviorGraphPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onHandleBehaviorGraphPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onHandleBehaviorGraphPointerEnd: (event: React.PointerEvent<HTMLDivElement>) => void;
  onHandleBehaviorGraphViewportKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onHandleDocumentBehaviorGraphPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onHandleDocumentBehaviorGraphPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onHandleDocumentBehaviorGraphPointerEnd: (event: React.PointerEvent<HTMLDivElement>) => void;
  onHandleDocumentBehaviorGraphViewportKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onSetBehaviorGraphFilter: (filter: BehaviorGraphFilter) => void;
  onSetBehaviorGraphMode: (mode: BehaviorGraphMode) => void;
  onSetBehaviorGraphDensity: React.Dispatch<React.SetStateAction<BehaviorGraphDensity>>;
  onSetBehaviorGraphZoom: React.Dispatch<React.SetStateAction<number>>;
  onSetBehaviorGraphOffset: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  onSetBehaviorGraphEntryContext: (context: BehaviorGraphEntryContext | null) => void;
  onSetBehaviorWorkspaceMode: React.Dispatch<React.SetStateAction<BehaviorWorkspaceMode>>;
  onSetBehaviorStudioMode: (mode: BehaviorStudioMode) => void;
  onSetBehaviorStudioView: (view: BehaviorStudioView) => void;
  onSetDocumentBehaviorClusterFocus: (focus: DocumentBehaviorClusterFocus) => void;
  onSetDocumentBehaviorTrailFamilies: React.Dispatch<React.SetStateAction<DocumentBehaviorClusterFamily[]>>;
  onSetDocumentBehaviorCanvasRelevantOnly: React.Dispatch<React.SetStateAction<boolean>>;
  onSetDocumentBehaviorCanvasDensity: React.Dispatch<React.SetStateAction<DocumentBehaviorCanvasDensity>>;
  onSetDocumentBehaviorSurfaceMode: (mode: DocumentBehaviorSurfaceMode) => void;
  onSetDocumentBehaviorPinnedLaneIds: React.Dispatch<React.SetStateAction<string[]>>;
  onSetExpandedDocumentBehaviorTarget: React.Dispatch<React.SetStateAction<DocumentBehaviorExpandedTarget>>;
  onSetDocumentBehaviorGraphZoom: React.Dispatch<React.SetStateAction<number>>;
  onSetDocumentBehaviorGraphOffset: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  onSetSelectedAuthoring: (selection: AuthoringSelection | null) => void;
  onSetSelectedBehaviorNode: (node: BehaviorGraphSelection | null) => void;
  onSetEditingRuleIndex: (index: number | null) => void;
  onSetInspectorTab: (tab: InspectorTab) => void;
  onOpenFieldRuleWizardForTrigger?: (fieldId: string) => void;
  onOpenFieldRuleWizardForEdit?: (rule: FieldRule) => void;
  onDeleteFieldRule?: (rule: FieldRule) => void;
  fieldRuleLabelOf?: (id: string) => string;
}

export function BehaviorWorkspace({
  selectedAuthoring,
  activeBuilderField,
  activeRuntimeScope,
  activeRuntimeTarget,
  activeDocument,
  activeStep,
  activeSection,
  activeGroup,
  logicMapData,
  runtimeNodeLabelById,
  runtimeTraceEntries,
  runtimeSessionState,
  runtimeSubmitPreview,
  runtimeActiveStep,
  behaviorGraphFilter,
  behaviorGraphMode,
  behaviorGraphDensity,
  behaviorGraphZoom,
  behaviorGraphOffset,
  behaviorGraphEntryContext,
  behaviorWorkspaceMode,
  documentBehaviorClusterFocus,
  documentBehaviorTrailFamilies,
  documentBehaviorCanvasRelevantOnly,
  documentBehaviorCanvasDensity,
  documentBehaviorSurfaceMode,
  documentBehaviorPinnedLaneIds,
  expandedDocumentBehaviorTarget,
  documentBehaviorGraphZoom,
  documentBehaviorGraphOffset,
  selectedBehaviorNode,
  runtimeSessionInputRef,
  builderFieldOptions,
  buildLegacyConditionalRuleGroups,
  currentBehaviorSelectionSummary,
  onFocusBehaviorGraphNode: focusBehaviorGraphNode,
  onResetBehaviorGraphViewport: resetBehaviorGraphViewport,
  onResetDocumentBehaviorGraphViewport: resetDocumentBehaviorGraphViewport,
  onOpenBehaviorBehaviorManager: openBehaviorBehaviorManager,
  onOpenBehaviorNodeInStudio: openBehaviorNodeInStudio,
  onOpenBehaviorObjectInBehaviorManager: openBehaviorObjectInBehaviorManager,
  onOpenBehaviorStudioAddBehavior: openBehaviorStudioAddBehavior,
  onOpenBehaviorStudioReactToAnotherItem: openBehaviorStudioReactToAnotherItem,
  onCloseBehaviorStudio: closeBehaviorStudio,
  onOpenTestPanelForListener,
  onOpenTestPanelFromSelection,
  onHandleExportRuntimeSession: handleExportRuntimeSession,
  onHandleBehaviorGraphPointerDown: handleBehaviorGraphPointerDown,
  onHandleBehaviorGraphPointerMove: handleBehaviorGraphPointerMove,
  onHandleBehaviorGraphPointerEnd: handleBehaviorGraphPointerEnd,
  onHandleBehaviorGraphViewportKeyDown: handleBehaviorGraphViewportKeyDown,
  onHandleDocumentBehaviorGraphPointerDown: handleDocumentBehaviorGraphPointerDown,
  onHandleDocumentBehaviorGraphPointerMove: handleDocumentBehaviorGraphPointerMove,
  onHandleDocumentBehaviorGraphPointerEnd: handleDocumentBehaviorGraphPointerEnd,
  onHandleDocumentBehaviorGraphViewportKeyDown: handleDocumentBehaviorGraphViewportKeyDown,
  onSetBehaviorGraphFilter: setBehaviorGraphFilter,
  onSetBehaviorGraphMode: setBehaviorGraphMode,
  onSetBehaviorGraphDensity: setBehaviorGraphDensity,
  onSetBehaviorGraphZoom: setBehaviorGraphZoom,
  onSetBehaviorGraphOffset: setBehaviorGraphOffset,
  onSetBehaviorGraphEntryContext: setBehaviorGraphEntryContext,
  onSetBehaviorWorkspaceMode: setBehaviorWorkspaceMode,
  onSetBehaviorStudioMode: setBehaviorStudioMode,
  onSetBehaviorStudioView: setBehaviorStudioView,
  onSetDocumentBehaviorClusterFocus: setDocumentBehaviorClusterFocus,
  onSetDocumentBehaviorTrailFamilies: setDocumentBehaviorTrailFamilies,
  onSetDocumentBehaviorCanvasRelevantOnly: setDocumentBehaviorCanvasRelevantOnly,
  onSetDocumentBehaviorCanvasDensity: setDocumentBehaviorCanvasDensity,
  onSetDocumentBehaviorSurfaceMode: setDocumentBehaviorSurfaceMode,
  onSetDocumentBehaviorPinnedLaneIds: setDocumentBehaviorPinnedLaneIds,
  onSetExpandedDocumentBehaviorTarget: setExpandedDocumentBehaviorTarget,
  onSetDocumentBehaviorGraphZoom: setDocumentBehaviorGraphZoom,
  onSetDocumentBehaviorGraphOffset: setDocumentBehaviorGraphOffset,
  onSetSelectedAuthoring: setSelectedAuthoring,
  onSetSelectedBehaviorNode: setSelectedBehaviorNode,
  onSetEditingRuleIndex: setEditingRuleIndex,
  onSetInspectorTab: setInspectorTab,
  onOpenFieldRuleWizardForTrigger,
  onOpenFieldRuleWizardForEdit,
  onDeleteFieldRule,
  fieldRuleLabelOf,
}: BehaviorWorkspaceProps) {
  const selectedRuleIndex =
    selectedBehaviorNode?.kind === "rule" && selectedAuthoring?.kind === "field" && activeBuilderField
      ? legacyFieldConditionals(activeBuilderField).findIndex((rule) => rule.ruleId === selectedBehaviorNode.ruleId)
      : -1;
  const selectedRule =
    selectedRuleIndex >= 0 && activeBuilderField
      ? legacyFieldConditionals(activeBuilderField)[selectedRuleIndex]
      : null;
  const selectedListenerIndex =
    selectedBehaviorNode?.kind === "listener" && activeRuntimeScope
      ? activeRuntimeScope.listeners.findIndex((listener) => listener.id === selectedBehaviorNode.listenerId)
      : -1;
  const selectedListener =
    selectedListenerIndex >= 0 && activeRuntimeScope ? activeRuntimeScope.listeners[selectedListenerIndex] : null;
  const stateBehavior = legacyFieldConditionals(activeBuilderField);
  const interactionFlows = activeRuntimeScope?.listeners ?? [];
  const hasStateBehavior = Boolean(stateBehavior.length);
  const hasInteractionFlows = Boolean(interactionFlows.length);
  const hasGraph = hasStateBehavior || hasInteractionFlows;
  const showStateFlows = behaviorGraphFilter === "all" || behaviorGraphFilter === "state";
  const showInteractionFlows = behaviorGraphFilter === "all" || behaviorGraphFilter === "interaction";
  const visibleStateBehavior = showStateFlows ? stateBehavior : [];
  const visibleInteractionFlows = showInteractionFlows ? interactionFlows : [];
  const visibleStateRuleGroups = buildLegacyConditionalRuleGroups(visibleStateBehavior);
  const hasVisibleGraph = Boolean(visibleStateBehavior.length || visibleInteractionFlows.length);
  const focusedRuleId =
    selectedBehaviorNode?.kind === "rule" &&
    visibleStateBehavior.some((rule) => rule.ruleId === selectedBehaviorNode.ruleId)
      ? selectedBehaviorNode.ruleId
      : (visibleStateBehavior[0]?.ruleId ?? null);
  const focusedListenerId =
    selectedBehaviorNode?.kind === "listener" &&
    visibleInteractionFlows.some((listener) => listener.id === selectedBehaviorNode.listenerId)
      ? selectedBehaviorNode.listenerId
      : (visibleInteractionFlows[0]?.id ?? null);
  const displayedStateBehavior =
    behaviorGraphMode === "focus" && focusedRuleId
      ? visibleStateBehavior.filter((rule) => rule.ruleId === focusedRuleId)
      : visibleStateBehavior;
  const displayedStateRuleGroups =
    behaviorGraphMode === "focus" && focusedRuleId
      ? visibleStateRuleGroups.filter((group) => group.members.some((member) => member.rule.ruleId === focusedRuleId))
      : visibleStateRuleGroups;
  const displayedInteractionFlows =
    behaviorGraphMode === "focus" && focusedListenerId
      ? visibleInteractionFlows.filter((listener) => listener.id === focusedListenerId)
      : visibleInteractionFlows;
  const totalVisibleFlows = visibleStateBehavior.length + visibleInteractionFlows.length;
  const hasFlowNavigator =
    behaviorGraphMode === "focus" &&
    (visibleStateBehavior.length + visibleInteractionFlows.length > 1 ||
      visibleStateBehavior.length > 1 ||
      visibleInteractionFlows.length > 1);

  function findSelectionForNodeId(nodeId: string): AuthoringSelection | null {
    if (!activeDocument) return null;
    for (const step of activeDocument.steps ?? []) {
      if (step.id === nodeId) return { kind: "step", stepId: step.id };
      for (const section of step.sections ?? []) {
        if (section.id === nodeId) return { kind: "section", stepId: step.id, sectionId: section.id };
        for (const field of section.fields ?? []) {
          if (field.id === nodeId) return { kind: "field", stepId: step.id, sectionId: section.id, fieldId: field.id };
        }
        for (const group of section.groups ?? []) {
          if (group.id === nodeId) return { kind: "group", stepId: step.id, sectionId: section.id, groupId: group.id };
          for (const field of group.fields ?? []) {
            if (field.id === nodeId)
              return {
                kind: "field",
                stepId: step.id,
                sectionId: section.id,
                fieldId: field.id,
                groupId: group.id,
              };
          }
        }
      }
    }
    return null;
  }

  function handleOpenReverseIndexForNode(nodeId: string) {
    const selection = findSelectionForNodeId(nodeId);
    if (!selection) return;
    setSelectedAuthoring(selection);
    setInspectorTab("behavior");
  }
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
        ? `${runtimeNodeTypeLabel(runtimeNodeTypeForAuthoringField(activeBuilderField))} · ${activeBuilderField?.label ?? "Current field"}`
        : selectedAuthoring.kind === "group"
          ? `Group · ${activeGroup?.label ?? "Current group"}`
          : selectedAuthoring.kind === "section"
            ? `Section · ${activeSection?.title ?? "Current section"}`
            : `Step · ${activeStep?.title ?? "Current step"}`;
  const activeLogicMapStep =
    selectedAuthoring?.kind === "step"
      ? (logicMapData?.steps.find((step) => step.id === selectedAuthoring.stepId) ?? null)
      : null;
  const activeNavigatorStepId = selectedAuthoring === null ? null : (activeStep?.id ?? null);
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
      ? cluster.conditions.length || cluster.listeners.length
      : behaviorGraphFilter === "state"
        ? cluster.conditions.length
        : cluster.listeners.length) &&
    (documentBehaviorClusterFocus === "all" ||
      normalizeDocumentBehaviorClusterKind(cluster.kindLabel) === documentBehaviorClusterFocus);
  const getVisibleDocumentBehaviorClusters = (clusters: BehaviorScopeCluster[]) =>
    clusters.filter((cluster) => clusterMatchesDocumentBehaviorFilters(cluster));
  const documentBehaviorGlobalClusterGroups = Array.from(
    documentBehaviorOverviewLanes.reduce(
      (groupMap, { step, clusters }) => {
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
          existing.ruleCount += cluster.conditions.length;
          existing.listenerCount += cluster.listeners.length;
          groupMap.set(key, existing);
        });
        return groupMap;
      },
      new Map<
        DocumentBehaviorClusterFamily,
        {
          key: DocumentBehaviorClusterFamily;
          label: string;
          firstLaneId: string | null;
          scopeCount: number;
          laneIds: Set<string>;
          ruleCount: number;
          listenerCount: number;
        }
      >(),
    ),
  )
    .map(
      ([, value]): DocumentBehaviorClusterGroupSummary => ({
        key: value.key,
        label: value.label,
        firstLaneId: value.firstLaneId,
        scopeCount: value.scopeCount,
        laneCount: value.laneIds.size,
        ruleCount: value.ruleCount,
        listenerCount: value.listenerCount,
      }),
    )
    .sort((left, right) => right.scopeCount - left.scopeCount || left.label.localeCompare(right.label));
  const documentBehaviorPinnedLaneIdSet = new Set(documentBehaviorPinnedLaneIds);
  const documentBehaviorVisibleLaneCount =
    1 +
    documentBehaviorOverviewLanes.filter(
      ({ step, clusters }) =>
        step.conditionalBehavior.length ||
        step.runtimeListeners.length ||
        getVisibleDocumentBehaviorClusters(clusters).length,
    ).length;
  const documentBehaviorMaxClusterCount = documentBehaviorOverviewLanes.reduce((max, { clusters }) => {
    const visibleClusterCount = getVisibleDocumentBehaviorClusters(clusters).length;
    return Math.max(max, visibleClusterCount);
  }, 0);
  const documentBehaviorFitZoom = Math.max(
    0.7,
    Math.min(
      1,
      Number(
        (
          1 -
          Math.min(
            0.22,
            Math.max(0, documentBehaviorVisibleLaneCount - 3) * 0.035 +
              Math.max(0, documentBehaviorMaxClusterCount - 2) * 0.025,
          )
        ).toFixed(2),
      ),
    ),
  );
  const activeDocumentBehaviorTarget: DocumentBehaviorExpandedTarget =
    expandedDocumentBehaviorTarget ?? (selectedAuthoring === null ? "form" : (activeNavigatorStepId ?? null));
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
      description:
        "Keep the lane you are actively editing and any pinned references together at the top of the canvas.",
      lanes: documentBehaviorCanvasVisibleLanes.filter(
        ({ step }) => activeDocumentBehaviorTarget === step.id || documentBehaviorPinnedLaneIdSet.has(step.id),
      ),
    },
    {
      key: "active",
      title: "Behavior lanes",
      description:
        "Lanes with authored conditions, flows, or currently visible scope clusters stay grouped here for fast scanning.",
      lanes: documentBehaviorCanvasVisibleLanes.filter(({ step, clusters }) => {
        if (activeDocumentBehaviorTarget === step.id || documentBehaviorPinnedLaneIdSet.has(step.id)) {
          return false;
        }
        return Boolean(
          step.conditionalBehavior.length ||
          step.runtimeListeners.length ||
          getVisibleDocumentBehaviorClusters(clusters).length,
        );
      }),
    },
    {
      key: "quiet",
      title: "Quiet lanes",
      description:
        "Lanes without current authored behavior stay out of the way until you need to expand the broader document context.",
      lanes: documentBehaviorCanvasVisibleLanes.filter(({ step, clusters }) => {
        if (activeDocumentBehaviorTarget === step.id || documentBehaviorPinnedLaneIdSet.has(step.id)) {
          return false;
        }
        return (
          !step.conditionalBehavior.length &&
          !step.runtimeListeners.length &&
          !getVisibleDocumentBehaviorClusters(clusters).length
        );
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
  const documentBehaviorTrailIntersections =
    documentBehaviorTrackedTrailFamilies.length > 1
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
      ? (documentBehaviorOverviewLanes.find(({ step }) => step.id === activeDocumentBehaviorTarget) ?? null)
      : null;
  const expandedDocumentBehaviorVisibleClusters = expandedDocumentBehaviorLane
    ? getVisibleDocumentBehaviorClusters(expandedDocumentBehaviorLane.clusters)
    : [];
  const isSelectedBehaviorCluster = (cluster: BehaviorScopeCluster) =>
    authoringSelectionsMatch(cluster.selection, selectedAuthoring);
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
    if (filter !== "interaction" && cluster.conditions.length) {
      focusBehaviorGraphNode({
        selection: cluster.conditions[0].sourceSelection,
        graphSelection: cluster.conditions[0].graphSelection,
        ruleIndex: cluster.conditions[0].ruleIndex,
        filter: "state",
        mode: "focus",
        viewport: "reset",
        entryContext: {
          source: "navigator",
          title: `Opened from ${originLabel}`,
          detail: `State conditions for ${cluster.title} were opened from the ${originLabel.toLowerCase()} and the graph viewport was recentered on that scope.`,
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
  const renderDocumentBehaviorCanvasLaneCard = ({
    step,
    clusters,
  }: (typeof documentBehaviorCanvasVisibleLanes)[number]) => {
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
      step.conditionalBehavior.length + step.runtimeListeners.length >= 6
        ? "High activity"
        : step.conditionalBehavior.length + step.runtimeListeners.length >= 3
          ? "Moderate activity"
          : step.conditionalBehavior.length + step.runtimeListeners.length > 0
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
              {step.conditionalBehavior.length ? (
                <span className="app-pill">{step.conditionalBehavior.length} conditions</span>
              ) : null}
              {step.runtimeListeners.length ? (
                <span className="app-pill">{step.runtimeListeners.length} flows</span>
              ) : null}
              <span className="app-pill">{laneDensity}</span>
              {isActiveLane ? <span className="app-pill">Current lane</span> : null}
              {isFocusedLane ? <span className="app-pill">Focused</span> : null}
              {isPinnedLane ? <span className="app-pill">Pinned</span> : null}
              {documentBehaviorActiveClusterFamily && relatedClusters.length ? (
                <span className="app-pill">
                  Matches {documentBehaviorClusterFocusLabel(documentBehaviorActiveClusterFamily).toLowerCase()}
                </span>
              ) : null}
              {trailFamilyMatches.length > 1 ? (
                <span className="app-pill">{trailFamilyMatches.length} trail families</span>
              ) : null}
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
                  Open behaviors
                </button>
              ) : null}
            </div>
          </div>
          <div
            className={`rounded-[0.95rem] border border-dashed border-slate-200 bg-slate-50/85 p-4 ${isExpandedLane ? "min-h-[16rem]" : "min-h-[11rem]"}`}
          >
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
                        normalizeDocumentBehaviorClusterKind(cluster.kindLabel) ===
                          documentBehaviorActiveClusterFamily ? (
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
                      {cluster.conditions.length ? (
                        <button
                          type="button"
                          onClick={() => focusDocumentBehaviorCluster(cluster, "state", "Document graph canvas")}
                          className={actionButtonClass(behaviorGraphFilter === "interaction" ? "secondary" : "primary")}
                        >
                          Open condition flows
                        </button>
                      ) : null}
                      {cluster.listeners.length ? (
                        <button
                          type="button"
                          onClick={() => focusDocumentBehaviorCluster(cluster, "interaction", "Document graph canvas")}
                          className={actionButtonClass(behaviorGraphFilter === "state" ? "secondary" : "primary")}
                        >
                          Open behaviors
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {cluster.conditions.length ? (
                        <span className="app-pill">{cluster.conditions.length} conditional behavior</span>
                      ) : null}
                      {cluster.listeners.length ? (
                        <span className="app-pill">{cluster.listeners.length} interaction flows</span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="app-muted-card mt-4 p-4 text-sm text-slate-500">
                {behaviorGraphFilter === "all"
                  ? "No authored behavior in this lane yet."
                  : behaviorGraphFilter === "state"
                    ? "No conditional behavior scopes match this lane."
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
              The graph is now a secondary visualization for tracing and debugging. Create and manage behavior in the
              Behavior Manager, then open specific nodes here only when the shape needs inspection.
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-500">{behaviorGraphSummary}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={openBehaviorBehaviorManager} className={actionButtonClass("primary")}>
              Open Behavior Manager
            </button>
            <button
              type="button"
              onClick={() => {
                setBehaviorStudioMode("event");
                setBehaviorStudioView("studio");
              }}
              className={actionButtonClass("secondary")}
            >
              Create in studio
            </button>
            <button
              type="button"
              onClick={() =>
                setBehaviorWorkspaceMode((current) => (current === "document_graph" ? "authoring" : "document_graph"))
              }
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
          {hasStateBehavior ? <span className="app-pill">{stateBehavior.length} conditional behavior</span> : null}
          {hasInteractionFlows ? <span className="app-pill">{interactionFlows.length} interaction flows</span> : null}
          {activeRuntimeScope ? <span className="app-pill">{activeRuntimeScope.label}</span> : null}
          <span className="app-pill">{selectedBehaviorSummary}</span>
          <span className="app-pill">{behaviorGraphMode === "overview" ? "Overview mode" : "Focus mode"}</span>
          <span className="app-pill">
            {behaviorWorkspaceMode === "document_graph" ? "Document graph workspace" : "Node authoring workspace"}
          </span>
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
                <button
                  type="button"
                  onClick={() => setBehaviorGraphEntryContext(null)}
                  className={actionButtonClass("secondary")}
                >
                  Clear context
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="app-pill">
                {behaviorGraphEntryContext.source === "map" ? "From Map" : "From Document graph"}
              </span>
              <span className="app-pill">{currentGraphLocationLabel}</span>
              <span className="app-pill">
                {behaviorGraphMode === "overview" ? "Viewport reset to overview" : "Viewport reset to focus"}
              </span>
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[1rem] border border-soft bg-slate-50 p-3">
          <div className="flex flex-wrap gap-2">
            {[
              { value: "all" as const, label: "All flows" },
              { value: "state" as const, label: "State conditions" },
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
                onClick={() =>
                  setBehaviorGraphZoom((current) => Math.max(0.7, Math.round((current - 0.1) * 100) / 100))
                }
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
                onClick={() =>
                  setBehaviorGraphZoom((current) => Math.min(1.35, Math.round((current + 0.1) * 100) / 100))
                }
                className={actionButtonClass("secondary")}
                disabled={!hasVisibleGraph}
              >
                Zoom +
              </button>
              <button
                type="button"
                onClick={() =>
                  setBehaviorGraphDensity((current) => (current === "comfortable" ? "dense" : "comfortable"))
                }
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
                  Scan authored behavior for the whole document from one surface. Use the board for dense clustered
                  summaries or switch to the minimap when you need a more spatial sense of where each step lane sits
                  inside the document-wide graph.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="app-pill">{logicMapData.steps.length} step lanes</span>
                <span className="app-pill">{logicMapData.totalConditionals} conditions</span>
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
                {documentBehaviorSurfaceMode === "canvas"
                  ? "Global canvas"
                  : documentBehaviorSurfaceMode === "minimap"
                    ? "Spatial mini-map"
                    : "Clustered board"}
              </span>
              <span className="app-pill">
                {behaviorGraphFilter === "all"
                  ? "All behavior"
                  : behaviorGraphFilter === "state"
                    ? "Conditional flows only"
                    : "Interaction flows only"}
              </span>
              <span className="app-pill">{documentBehaviorClusterFocusLabel(documentBehaviorClusterFocus)}</span>
            </div>
            <div className="mt-3 rounded-[0.95rem] border border-soft bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Cross-lane clusters</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    Filter the document graph by shared scope kind so field, group, section, and step behavior can be
                    scanned across lanes without reading every lane in full.
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
                      className={actionButtonClass(
                        documentBehaviorClusterFocus === group.key ? "primary" : "secondary",
                      )}
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
                    Use this lane for load, submit, validation, and host-level orchestration that belongs to the whole
                    document.
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
                          detail:
                            "Form-level runtime was opened from the document graph overview and the graph viewport was recentered on the form scope.",
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
                    step.conditionalBehavior.length + step.runtimeListeners.length >= 6
                      ? "High activity"
                      : step.conditionalBehavior.length + step.runtimeListeners.length >= 3
                        ? "Moderate activity"
                        : step.conditionalBehavior.length + step.runtimeListeners.length > 0
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
                            {step.conditionalBehavior.length ? (
                              <span className="app-pill">{step.conditionalBehavior.length} conditions</span>
                            ) : null}
                            {step.runtimeListeners.length ? (
                              <span className="app-pill">{step.runtimeListeners.length} flows</span>
                            ) : null}
                            <span className="app-pill">{laneDensity}</span>
                            {isActiveLane ? <span className="app-pill">Current lane</span> : null}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedDocumentBehaviorTarget((current) => (current === step.id ? null : step.id))
                            }
                            className={actionButtonClass(
                              activeDocumentBehaviorTarget === step.id ? "primary" : "secondary",
                            )}
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
                              Open behaviors
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
                                isSelectedBehaviorCluster(cluster)
                                  ? "border-slate-900 bg-white"
                                  : "border-soft bg-slate-50"
                              }`}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                                    {cluster.kindLabel}
                                  </p>
                                  <p className="mt-2 font-semibold text-slate-950">{cluster.title}</p>
                                  <p className="mt-2 text-sm leading-6 text-slate-600">{cluster.detail}</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {cluster.conditions.length ? (
                                    <button
                                      type="button"
                                      onClick={() => focusDocumentBehaviorCluster(cluster, "state")}
                                      className={actionButtonClass(
                                        behaviorGraphFilter === "interaction" ? "secondary" : "primary",
                                      )}
                                    >
                                      Open condition flows
                                    </button>
                                  ) : null}
                                  {cluster.listeners.length ? (
                                    <button
                                      type="button"
                                      onClick={() => focusDocumentBehaviorCluster(cluster, "interaction")}
                                      className={actionButtonClass(
                                        behaviorGraphFilter === "state" ? "secondary" : "primary",
                                      )}
                                    >
                                      Open behaviors
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
                                {cluster.conditions.length ? (
                                  <span className="app-pill">{cluster.conditions.length} conditional behavior</span>
                                ) : null}
                                {cluster.listeners.length ? (
                                  <span className="app-pill">{cluster.listeners.length} interaction flows</span>
                                ) : null}
                                {isSelectedBehaviorCluster(cluster) ? (
                                  <span className="app-pill">Current scope</span>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="app-muted-card mt-4 p-4 text-sm text-slate-500">
                          {behaviorGraphFilter === "all"
                            ? "No authored behavior in this step yet."
                            : behaviorGraphFilter === "state"
                              ? "No conditional behavior scopes match the current filter in this step."
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
                      Use the central spine to read the whole document as one graph system. Step lanes stay in sequence
                      while active field and section scopes orbit around the lane they belong to.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="app-pill">{logicMapData.formListeners.length} form flows</span>
                    <span className="app-pill">
                      {
                        documentBehaviorOverviewLanes.filter(
                          ({ step }) => step.conditionalBehavior.length || step.runtimeListeners.length,
                        ).length
                      }{" "}
                      active step lanes
                    </span>
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
                        onClick={() =>
                          setExpandedDocumentBehaviorTarget((current) => (current === step.id ? null : step.id))
                        }
                        className={actionButtonClass(
                          activeDocumentBehaviorTarget === step.id ? "primary" : "secondary",
                        )}
                      >
                        {step.title}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setDocumentBehaviorGraphZoom((current) =>
                          Math.max(0.7, Math.round((current - 0.1) * 100) / 100),
                        )
                      }
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
                    <button
                      type="button"
                      onClick={resetDocumentBehaviorGraphViewport}
                      className={actionButtonClass("secondary")}
                    >
                      {Math.round(documentBehaviorGraphZoom * 100)}%
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDocumentBehaviorGraphZoom((current) =>
                          Math.min(1.3, Math.round((current + 0.1) * 100) / 100),
                        )
                      }
                      className={actionButtonClass("secondary")}
                    >
                      Zoom +
                    </button>
                    <button
                      type="button"
                      onClick={resetDocumentBehaviorGraphViewport}
                      className={actionButtonClass("secondary")}
                    >
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
                    className="min-h-[24rem] cursor-grab overflow-hidden rounded-[1rem] outline-none focus-visible:ring-2 focus-visible:ring-slate-300 active:cursor-grabbing lg:min-h-[34rem]"
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
                                  Load, submit, validation, and host-level orchestration stay anchored here before the
                                  mini-map fans out into step-level behavior.
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <span className="app-pill">{logicMapData.formListeners.length} flows</span>
                                {activeDocumentBehaviorTarget === "form" ? (
                                  <span className="app-pill">Current lane</span>
                                ) : null}
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
                                        detail:
                                          "Form-level runtime was opened from the document graph overview and the graph viewport was recentered on the form scope.",
                                      },
                                    })
                                  }
                                  className={actionButtonClass(
                                    logicMapData.formListeners.length ? "primary" : "secondary",
                                  )}
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
                              step.conditionalBehavior.length + step.runtimeListeners.length >= 6
                                ? "High activity"
                                : step.conditionalBehavior.length + step.runtimeListeners.length >= 3
                                  ? "Moderate activity"
                                  : step.conditionalBehavior.length + step.runtimeListeners.length > 0
                                    ? "Light activity"
                                    : "No behavior yet";
                            const clustersOnLeft = laneIndex % 2 === 0;
                            return (
                              <div
                                key={`document-minimap-lane-${step.id}`}
                                className="relative grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)_minmax(0,1fr)] lg:items-center"
                              >
                                <div
                                  className={`${clustersOnLeft ? "lg:col-start-1" : "lg:col-start-3"} space-y-2 ${activeDocumentBehaviorTarget && !isFocusedLane ? "opacity-55" : ""}`}
                                >
                                  {visibleClusters.length ? (
                                    visibleClusters.map((cluster) => (
                                      <div
                                        key={`document-minimap-cluster-${step.id}-${cluster.key}`}
                                        className={`rounded-[0.95rem] border p-3 shadow-[0_8px_24px_rgba(15,23,42,0.04)] ${
                                          isSelectedBehaviorCluster(cluster)
                                            ? "border-slate-900 bg-white"
                                            : "border-soft bg-white/85"
                                        }`}
                                      >
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="min-w-0">
                                            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                                              {cluster.kindLabel}
                                            </p>
                                            <p className="mt-1 font-semibold text-slate-950">{cluster.title}</p>
                                            <p className="mt-1 text-sm leading-6 text-slate-600">{cluster.detail}</p>
                                          </div>
                                          {isSelectedBehaviorCluster(cluster) ? (
                                            <span className="app-pill">Active</span>
                                          ) : null}
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                          <button
                                            type="button"
                                            onClick={() => setExpandedDocumentBehaviorTarget(step.id)}
                                            className={actionButtonClass(
                                              activeDocumentBehaviorTarget === step.id ? "primary" : "secondary",
                                            )}
                                          >
                                            {activeDocumentBehaviorTarget === step.id ? "Expanded lane" : "Expand lane"}
                                          </button>
                                          {cluster.conditions.length ? (
                                            <button
                                              type="button"
                                              onClick={() => focusDocumentBehaviorCluster(cluster, "state")}
                                              className={actionButtonClass(
                                                behaviorGraphFilter === "interaction" ? "secondary" : "primary",
                                              )}
                                            >
                                              Open condition flows
                                            </button>
                                          ) : null}
                                          {cluster.listeners.length ? (
                                            <button
                                              type="button"
                                              onClick={() => focusDocumentBehaviorCluster(cluster, "interaction")}
                                              className={actionButtonClass(
                                                behaviorGraphFilter === "state" ? "secondary" : "primary",
                                              )}
                                            >
                                              Open behaviors
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
                                          ? "No conditional behavior scopes match this lane."
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
                                        {step.conditionalBehavior.length ? (
                                          <span className="app-pill">{step.conditionalBehavior.length} conditions</span>
                                        ) : null}
                                        {step.runtimeListeners.length ? (
                                          <span className="app-pill">{step.runtimeListeners.length} flows</span>
                                        ) : null}
                                        <span className="app-pill">{laneDensity}</span>
                                        {isActiveLane ? <span className="app-pill">Current lane</span> : null}
                                        {isFocusedLane ? <span className="app-pill">Focused lane</span> : null}
                                      </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setExpandedDocumentBehaviorTarget((current) =>
                                            current === step.id ? null : step.id,
                                          )
                                        }
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
                                          Open behaviors
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>

                                <div
                                  className={`${clustersOnLeft ? "lg:col-start-3" : "lg:col-start-1"} hidden lg:block`}
                                />
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
                      Read the document as one direct canvas instead of lane cards first. Expand lanes inline, keep
                      related scopes clustered together, and pan the whole behavior system as one surface.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="app-pill">
                      {documentBehaviorGlobalClusterGroups.length} cross-lane cluster groups
                    </span>
                    <span className="app-pill">{documentBehaviorOverviewLanes.length} step lanes</span>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[1rem] border border-soft bg-white px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    <span className="app-pill">{activeDocumentBehaviorTarget ? "Focused lane" : "Whole document"}</span>
                    {activeDocumentBehaviorTarget && activeDocumentBehaviorTarget !== "form" ? (
                      <span className="app-pill">
                        {documentBehaviorOverviewLanes.find(({ step }) => step.id === activeDocumentBehaviorTarget)
                          ?.step.title ?? "Focused step"}
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
                      onClick={() =>
                        setDocumentBehaviorCanvasDensity((current) =>
                          current === "comfortable" ? "dense" : "comfortable",
                        )
                      }
                      className={actionButtonClass(documentBehaviorCanvasDensity === "dense" ? "primary" : "secondary")}
                    >
                      {documentBehaviorCanvasDensity === "dense" ? "Dense canvas" : "Comfortable canvas"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDocumentBehaviorGraphZoom((current) =>
                          Math.max(0.65, Math.round((current - 0.1) * 100) / 100),
                        )
                      }
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
                    <button
                      type="button"
                      onClick={resetDocumentBehaviorGraphViewport}
                      className={actionButtonClass("secondary")}
                    >
                      {Math.round(documentBehaviorGraphZoom * 100)}%
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDocumentBehaviorGraphZoom((current) =>
                          Math.min(1.4, Math.round((current + 0.1) * 100) / 100),
                        )
                      }
                      className={actionButtonClass("secondary")}
                    >
                      Zoom +
                    </button>
                    <button
                      type="button"
                      onClick={resetDocumentBehaviorGraphViewport}
                      className={actionButtonClass("secondary")}
                    >
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
                          Jump by scope kind and narrow the canvas to the lanes that matter instead of traversing every
                          lane from the top strip.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="app-pill">{documentBehaviorCanvasVisibleLanes.length} visible lanes</span>
                        {documentBehaviorPinnedLaneIds.length ? (
                          <span className="app-pill">{documentBehaviorPinnedLaneIds.length} pinned</span>
                        ) : null}
                      </div>
                    </div>
                    {documentBehaviorGlobalClusterGroups.length ? (
                      <div className="mt-4 space-y-3">
                        {documentBehaviorGlobalClusterGroups.map((group) => (
                          <div
                            key={`document-canvas-group-${group.key}`}
                            className={`rounded-[0.95rem] border p-4 ${
                              documentBehaviorClusterFocus === group.key
                                ? "border-slate-900 bg-slate-50"
                                : "border-soft bg-white"
                            }`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-slate-950">{group.label}</p>
                                <p className="mt-2 text-sm leading-6 text-slate-600">
                                  {group.scopeCount} scopes across {group.laneCount} lanes · {group.ruleCount}{" "}
                                  conditions · {group.listenerCount} flows
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
                                  className={actionButtonClass(
                                    documentBehaviorClusterFocus === group.key ? "primary" : "secondary",
                                  )}
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
                              Keep several behavior families live at once so the canvas can stay narrowed to the same
                              document-wide set while you pivot between families.
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span className="app-pill">
                              {documentBehaviorTrackedTrailFamilies.length} tracked families
                            </span>
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
                            onClick={() =>
                              setDocumentBehaviorTrailFamilies(
                                documentBehaviorActiveClusterFamily ? [documentBehaviorActiveClusterFamily] : [],
                              )
                            }
                            className={actionButtonClass("secondary")}
                            disabled={documentBehaviorTrackedTrailFamilies.length <= 1}
                          >
                            Clear extra trails
                          </button>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {documentBehaviorTrackedTrailFamilies.map((family) => {
                            const matchingGroup =
                              documentBehaviorGlobalClusterGroups.find((group) => group.key === family) ?? null;
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
                                  onClick={() =>
                                    focusDocumentBehaviorFamilyTrail(family, matchingGroup?.firstLaneId ?? null)
                                  }
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
                                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                                  Shared lane hotspots
                                </p>
                                <p className="mt-2 text-sm leading-6 text-slate-700">
                                  These lanes carry more than one tracked family at once. Use them as the fastest entry
                                  points when you need to pivot from one family context into another without scanning
                                  the full board.
                                </p>
                              </div>
                              <span className="app-pill">{documentBehaviorTrailIntersections.length} hotspots</span>
                            </div>
                            <div className="mt-4 space-y-3">
                              {documentBehaviorTrailIntersections.map(({ step, familyClusters }) => (
                                <div
                                  key={`document-trail-hotspot-${step.id}`}
                                  className="rounded-[0.9rem] border border-soft bg-white p-4"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <p className="font-semibold text-slate-950">{step.title}</p>
                                      <p className="mt-2 text-sm leading-6 text-slate-600">
                                        {familyClusters.length} overlapping families ·{" "}
                                        {familyClusters.reduce((count, entry) => count + entry.clusters.length, 0)}{" "}
                                        visible scopes
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        focusDocumentBehaviorTrailIntersection(
                                          step.id,
                                          familyClusters.map((entry) => entry.family),
                                        )
                                      }
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
                                            focusDocumentBehaviorTrailIntersection(
                                              step.id,
                                              familyClusters.map((entry) => entry.family),
                                              family,
                                            );
                                            if (primaryCluster) {
                                              focusDocumentBehaviorCluster(
                                                primaryCluster,
                                                "all",
                                                "Document graph hotspot",
                                              );
                                            }
                                          }}
                                          className={actionButtonClass(
                                            documentBehaviorActiveClusterFamily === family ? "primary" : "secondary",
                                          )}
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
                              Keep multiple behavior families in reach so you can pivot from one document-wide trail to
                              another without rebuilding the canvas context each time.
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span className="app-pill">{documentBehaviorFamilyTrails.length} active families</span>
                            {documentBehaviorActiveClusterFamily ? (
                              <span className="app-pill">
                                Current trail: {documentBehaviorClusterFocusLabel(documentBehaviorActiveClusterFamily)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="mt-4 space-y-3">
                          {documentBehaviorFamilyTrails.map((trail) => {
                            const primaryLane = trail.lanes[0] ?? null;
                            const currentTrailLane =
                              trail.activeLaneIndex >= 0 && trail.activeLaneIndex < trail.lanes.length
                                ? trail.lanes[trail.activeLaneIndex]
                                : null;
                            const nextTrailLane =
                              trail.activeLaneIndex >= 0 && trail.activeLaneIndex < trail.lanes.length - 1
                                ? trail.lanes[trail.activeLaneIndex + 1]
                                : null;
                            const previousTrailLane =
                              trail.activeLaneIndex > 0 ? trail.lanes[trail.activeLaneIndex - 1] : null;
                            const currentTrailCluster =
                              currentTrailLane?.matchingClusters[0] ?? primaryLane?.matchingClusters[0] ?? null;
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
                                      {trail.scopeCount} scopes across {trail.laneCount} lanes · {trail.ruleCount}{" "}
                                      conditions · {trail.listenerCount} flows
                                    </p>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {trail.isActive ? <span className="app-pill">Current trail</span> : null}
                                    {trail.isTracked ? <span className="app-pill">Tracked</span> : null}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        focusDocumentBehaviorFamilyTrail(trail.key, primaryLane?.step.id ?? null)
                                      }
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
                                        onClick={() =>
                                          focusDocumentBehaviorCluster(
                                            currentTrailCluster,
                                            "all",
                                            "Document graph canvas",
                                          )
                                        }
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
                                    disabled={
                                      !trail.lanes.length ||
                                      (trail.activeLaneIndex === trail.lanes.length - 1 && !primaryLane)
                                    }
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
                                      className={actionButtonClass(
                                        activeDocumentBehaviorTarget === step.id && trail.isActive
                                          ? "primary"
                                          : "secondary",
                                      )}
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
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                              Follow this behavior across lanes
                            </p>
                            <p className="mt-2 text-sm leading-6 text-slate-700">
                              {documentBehaviorClusterFocusLabel(documentBehaviorActiveClusterFamily)} stay visible
                              across {documentBehaviorRelatedLanes.length} lanes. Move lane to lane here without
                              dropping back into the broader summary stack.
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span className="app-pill">{documentBehaviorRelatedLanes.length} related lanes</span>
                            <button
                              type="button"
                              onClick={() => setDocumentBehaviorCanvasRelevantOnly(true)}
                              className={actionButtonClass(
                                documentBehaviorCanvasRelevantOnly ? "primary" : "secondary",
                              )}
                            >
                              {documentBehaviorCanvasRelevantOnly ? "Related lanes only" : "Keep related lanes only"}
                            </button>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const previousLane =
                                activeDocumentBehaviorRelatedLaneIndex > 0
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
                            disabled={
                              !documentBehaviorRelatedLanes.length ||
                              activeDocumentBehaviorRelatedLaneIndex === documentBehaviorRelatedLanes.length - 1
                            }
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
                                      {matchingClusters.length} matching scopes ·{" "}
                                      {matchingClusters.reduce(
                                        (count, cluster) => count + cluster.conditions.length,
                                        0,
                                      )}{" "}
                                      conditions ·{" "}
                                      {matchingClusters.reduce((count, cluster) => count + cluster.listeners.length, 0)}{" "}
                                      flows
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
                                        onClick={() =>
                                          focusDocumentBehaviorCluster(primaryCluster, "all", "Document graph canvas")
                                        }
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
                          className={actionButtonClass(
                            activeDocumentBehaviorTarget === step.id ? "primary" : "secondary",
                          )}
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
                    className="min-h-[28rem] cursor-grab overflow-hidden rounded-[1rem] outline-none focus-visible:ring-2 focus-visible:ring-slate-300 active:cursor-grabbing lg:min-h-[38rem]"
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
                              Global submit, validation, and host orchestration stay pinned here while the step lanes
                              branch below.
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span className="app-pill">{logicMapData.formListeners.length} flows</span>
                            {activeDocumentBehaviorTarget === "form" ? (
                              <span className="app-pill">Current lane</span>
                            ) : null}
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
                                    detail:
                                      "Form-level runtime was opened from the document graph canvas and the graph viewport was recentered on the form scope.",
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

            {activeDocumentBehaviorTarget === "form" ||
            (expandedDocumentBehaviorLane && documentBehaviorSurfaceMode !== "canvas") ? (
              <div className="mt-4 rounded-[0.95rem] border border-soft bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Expanded lane detail</p>
                    <h5 className="mt-2 text-base font-semibold text-slate-950">
                      {activeDocumentBehaviorTarget === "form"
                        ? "Document orchestration"
                        : (expandedDocumentBehaviorLane?.step.title ?? "Focused lane")}
                    </h5>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {activeDocumentBehaviorTarget === "form"
                        ? "Stay at the document level to inspect global host/load/submit behavior before diving into a specific step lane."
                        : "Use the expanded lane to move from the global document graph into a specific scope, then hand off into the focused behavior graph only when you need node-level editing."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="app-pill">Form runtime</span>
                    {expandedDocumentBehaviorLane ? (
                      <span className="app-pill">{expandedDocumentBehaviorLane.step.title}</span>
                    ) : null}
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
                        <div
                          key={`expanded-form-${listener.id}`}
                          className="rounded-[0.9rem] border border-soft bg-slate-50 p-4"
                        >
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
                              Open behavior
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="app-muted-card xl:col-span-2 p-4 text-sm text-slate-500">
                        No form-level runtime has been authored yet. Seed it from `Form behavior`, then use this lane to
                        jump directly into the resulting chain.
                      </div>
                    )}
                  </div>
                ) : expandedDocumentBehaviorLane ? (
                  <div className="mt-4 space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <span className="app-pill">{expandedDocumentBehaviorLane.step.fieldCount} fields</span>
                      {expandedDocumentBehaviorLane.step.conditionalBehavior.length ? (
                        <span className="app-pill">
                          {expandedDocumentBehaviorLane.step.conditionalBehavior.length} conditions
                        </span>
                      ) : null}
                      {expandedDocumentBehaviorLane.step.runtimeListeners.length ? (
                        <span className="app-pill">
                          {expandedDocumentBehaviorLane.step.runtimeListeners.length} flows
                        </span>
                      ) : null}
                      <span className="app-pill">{expandedDocumentBehaviorVisibleClusters.length} visible scopes</span>
                    </div>
                    {expandedDocumentBehaviorVisibleClusters.length ? (
                      <div className="grid gap-3 xl:grid-cols-2">
                        {expandedDocumentBehaviorVisibleClusters.map((cluster) => (
                          <div
                            key={`expanded-lane-${expandedDocumentBehaviorLane.step.id}-${cluster.key}`}
                            className={`rounded-[0.9rem] border p-4 ${
                              isSelectedBehaviorCluster(cluster)
                                ? "border-slate-900 bg-white"
                                : "border-soft bg-slate-50"
                            }`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                                  {cluster.kindLabel}
                                </p>
                                <p className="mt-2 font-semibold text-slate-950">{cluster.title}</p>
                                <p className="mt-2 text-sm leading-6 text-slate-600">{cluster.detail}</p>
                              </div>
                              {isSelectedBehaviorCluster(cluster) ? (
                                <span className="app-pill">Current scope</span>
                              ) : null}
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
                              {cluster.conditions.length ? (
                                <button
                                  type="button"
                                  onClick={() => focusDocumentBehaviorCluster(cluster, "state", "Expanded lane detail")}
                                  className={actionButtonClass(
                                    behaviorGraphFilter === "interaction" ? "secondary" : "primary",
                                  )}
                                >
                                  Open condition flows
                                </button>
                              ) : null}
                              {cluster.listeners.length ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    focusDocumentBehaviorCluster(cluster, "interaction", "Expanded lane detail")
                                  }
                                  className={actionButtonClass(
                                    behaviorGraphFilter === "state" ? "secondary" : "primary",
                                  )}
                                >
                                  Open behaviors
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
                            ? "No conditional behavior scopes match the current filter inside this lane."
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
                  The document graph is now using the larger workspace mode. Use the lane strip, mini-map viewport, and
                  graph handoff actions above to navigate the whole form, then return to authoring when you want the
                  node graph, composer, and simulator back in view.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setBehaviorWorkspaceMode("authoring")}
                  className={actionButtonClass("primary")}
                >
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
                      Larger behavior sets are grouped by scope here so you can jump into the right field, group, step,
                      or document lane without reading one long repeated stack.
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
                          {cluster.conditions.length ? (
                            <button
                              type="button"
                              onClick={() =>
                                focusBehaviorGraphNode({
                                  selection: cluster.conditions[0].sourceSelection,
                                  graphSelection: cluster.conditions[0].graphSelection,
                                  ruleIndex: cluster.conditions[0].ruleIndex,
                                  filter: "state",
                                  mode: "focus",
                                  viewport: "reset",
                                  entryContext: {
                                    source: "clusters",
                                    title: "Opened from Scope clusters",
                                    detail: `State conditions for ${cluster.title} were opened from the clustered behavior view.`,
                                  },
                                })
                              }
                              className={actionButtonClass("secondary")}
                            >
                              Open condition flows
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
                              Open behaviors
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {cluster.conditions.length ? (
                          <span className="app-pill">{cluster.conditions.length} conditions</span>
                        ) : null}
                        {cluster.listeners.length ? (
                          <span className="app-pill">{cluster.listeners.length} flows</span>
                        ) : null}
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
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Behavior navigator</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      Focus mode keeps one behavior in view at a time. Use these jump points to swap behaviors without
                      scrolling a long stack, or switch to overview mode to scan everything at once.
                    </p>
                  </div>
                  <span className="app-pill">
                    {visibleStateBehavior.length + visibleInteractionFlows.length} focus targets
                  </span>
                </div>
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  {visibleStateBehavior.length ? (
                    <div className="space-y-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">State flows</p>
                      <div className="flex gap-3 overflow-x-auto pb-1">
                        {visibleStateBehavior.map((rule, index) => {
                          const sourceLabel =
                            builderFieldOptions.find((option) => option.id === rule.whenFieldId)?.label ??
                            "Choose field";
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
                              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                                State flow {index + 1}
                              </p>
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
                              onClick={() =>
                                setSelectedBehaviorNode({
                                  kind: "listener",
                                  listenerId: listener.id,
                                  phase: "trigger",
                                })
                              }
                              className={`min-w-[15rem] rounded-[0.95rem] border px-4 py-3 text-left transition ${
                                active
                                  ? "border-slate-900 bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.06)]"
                                  : "border-soft bg-white hover:border-slate-300"
                              }`}
                            >
                              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                                Interaction flow {listenerIndex + 1}
                              </p>
                              <p className="mt-2 font-semibold text-slate-950">{formatLabel(listener.eventName)}</p>
                              <p className="mt-1 text-sm leading-6 text-slate-600">
                                {listener.actions.length} action{listener.actions.length === 1 ? "" : "s"} ·{" "}
                                {listener.enabled ? "Enabled" : "Disabled"}
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
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Conditional flow handoff</p>
                        <p className="mt-2 text-sm leading-6 text-slate-700">
                          Creation and lifecycle edits now belong in Behavior Manager or the guided studio. Use this
                          graph only to inspect how conditional behavior connects.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={openBehaviorBehaviorManager}
                            className={actionButtonClass("primary")}
                          >
                            Open Behavior Manager
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setBehaviorStudioMode("event");
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
                          Listener and event creation starts in the studio. This graph stays focused on overview,
                          tracing, and debugging.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={openBehaviorBehaviorManager}
                            className={actionButtonClass("primary")}
                          >
                            Open Behavior Manager
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setBehaviorStudioMode("event");
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
                aria-label="Behavior canvas"
              >
                <div style={graphPanStyle}>
                  <div style={graphViewportStyle} className="space-y-4">
                    {displayedStateRuleGroups.length ? (
                      <div
                        className={`space-y-3 ${behaviorGraphMode === "overview" ? "rounded-[1rem] border border-soft bg-slate-50/60 p-4" : ""}`}
                      >
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
                                        openBehaviorObjectInBehaviorManager({
                                          objectKey: `rule:${representativeRule.ruleId}`,
                                          selection: selectedAuthoring,
                                          graphSelection: {
                                            kind: "rule",
                                            ruleId: representativeRule.ruleId,
                                            phase: "condition",
                                          },
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
                                  <BehaviorGraphNode
                                    eyebrow="Trigger"
                                    title="Watch a field"
                                    detail={`Observe ${group.sourceFieldLabel} as the source input.`}
                                    tone="blue"
                                    compact={graphCompact}
                                    active={
                                      selectedBehaviorNode?.kind === "rule" &&
                                      group.members.some(
                                        (member) => member.rule.ruleId === selectedBehaviorNode.ruleId,
                                      ) &&
                                      selectedBehaviorNode.phase === "trigger"
                                    }
                                    badges={
                                      representativeRule && activeDocument ? (
                                        <ReverseIndexBadge
                                          count={countListenersReferencingNode(
                                            activeDocument,
                                            representativeRule.whenFieldId,
                                          )}
                                          onClick={() => handleOpenReverseIndexForNode(representativeRule.whenFieldId)}
                                        />
                                      ) : null
                                    }
                                    onClick={() => {
                                      if (!representativeRule) {
                                        return;
                                      }
                                      openBehaviorNodeInStudio(
                                        { kind: "rule", ruleId: representativeRule.ruleId, phase: "trigger" },
                                        group.members[0]?.index ?? null,
                                      );
                                    }}
                                  />
                                  <BehaviorEdgeLabel label="When" compact={graphCompact} />
                                  <BehaviorGraphNode
                                    eyebrow="Shared condition"
                                    title={group.conditionTitle}
                                    detail={group.conditionDetail}
                                    tone="amber"
                                    compact={graphCompact}
                                    active={
                                      selectedBehaviorNode?.kind === "rule" &&
                                      group.members.some(
                                        (member) => member.rule.ruleId === selectedBehaviorNode.ruleId,
                                      ) &&
                                      selectedBehaviorNode.phase === "condition"
                                    }
                                    onClick={() => {
                                      if (!representativeRule) {
                                        return;
                                      }
                                      openBehaviorNodeInStudio(
                                        { kind: "rule", ruleId: representativeRule.ruleId, phase: "condition" },
                                        group.members[0]?.index ?? null,
                                      );
                                    }}
                                  />
                                  {group.members.map((member) => (
                                    <Fragment key={`${group.key}-${member.rule.ruleId}`}>
                                      <BehaviorEdgeLabel label="Then" compact={graphCompact} />
                                      <BehaviorGraphNode
                                        eyebrow="Effect"
                                        title={`${formatLabel(member.rule.effect)} this field`}
                                        detail={`Apply the ${member.rule.effect} effect to ${activeBuilderField?.label ?? "this field"}.`}
                                        tone="emerald"
                                        compact={graphCompact}
                                        active={
                                          selectedBehaviorNode?.kind === "rule" &&
                                          selectedBehaviorNode.ruleId === member.rule.ruleId &&
                                          selectedBehaviorNode.phase === "effect"
                                        }
                                        badges={
                                          activeBuilderField && activeDocument ? (
                                            <ReverseIndexBadge
                                              count={countListenersReferencingNode(
                                                activeDocument,
                                                activeBuilderField.id,
                                              )}
                                              onClick={() => handleOpenReverseIndexForNode(activeBuilderField.id)}
                                            />
                                          ) : null
                                        }
                                        onClick={() =>
                                          openBehaviorNodeInStudio(
                                            { kind: "rule", ruleId: member.rule.ruleId, phase: "effect" },
                                            member.index,
                                          )
                                        }
                                      />
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
                      <div
                        className={`space-y-3 ${behaviorGraphMode === "overview" ? "rounded-[1rem] border border-soft bg-slate-50/60 p-4" : ""}`}
                      >
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Interaction flows</p>
                        <div className={graphSectionGridClass}>
                          {displayedInteractionFlows.map((listener) => {
                            const listenerIndex = visibleInteractionFlows.findIndex(
                              (candidate) => candidate.id === listener.id,
                            );
                            return (
                              <div key={listener.id} className="rounded-[1rem] border border-soft bg-slate-50 p-4">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-950">
                                      Interaction flow {listenerIndex + 1}
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      <span className="app-pill">Trigger {formatLabel(listener.eventName)}</span>
                                      <span className="app-pill">
                                        {listener.actions.length} action{listener.actions.length === 1 ? "" : "s"}
                                      </span>
                                      <span className="app-pill">{listener.enabled ? "Enabled" : "Disabled"}</span>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openBehaviorObjectInBehaviorManager({
                                        objectKey: `flow:${listener.id}`,
                                        selection: selectedAuthoring,
                                        graphSelection: {
                                          kind: "listener",
                                          listenerId: listener.id,
                                          phase: "trigger",
                                        },
                                      })
                                    }
                                    className={actionButtonClass("secondary")}
                                  >
                                    Manage flow
                                  </button>
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                  <BehaviorGraphNode
                                    eyebrow="Trigger"
                                    title={`When ${formatLabel(listener.eventName)}`}
                                    detail={
                                      listener.enabled
                                        ? "This listener is enabled."
                                        : "This listener is currently disabled."
                                    }
                                    tone="blue"
                                    compact={graphCompact}
                                    active={
                                      selectedBehaviorNode?.kind === "listener" &&
                                      selectedBehaviorNode.listenerId === listener.id &&
                                      selectedBehaviorNode.phase === "trigger"
                                    }
                                    badges={(() => {
                                      const hostNodeId =
                                        selectedAuthoring?.kind === "field"
                                          ? selectedAuthoring.fieldId
                                          : selectedAuthoring?.kind === "group"
                                            ? selectedAuthoring.groupId
                                            : selectedAuthoring?.kind === "section"
                                              ? selectedAuthoring.sectionId
                                              : selectedAuthoring?.kind === "step"
                                                ? selectedAuthoring.stepId
                                                : null;
                                      const crossStepRefs =
                                        activeDocument && hostNodeId
                                          ? collectCrossStepRefsForListener(activeDocument, listener, hostNodeId)
                                          : [];
                                      return (
                                        <>
                                          <EventPayloadBadge eventType={listener.eventName} doc={activeDocument} />
                                          {crossStepRefs.map((ref) => (
                                            <CrossStepRefBadge
                                              key={ref.sourceNodeId}
                                              crossStepRef={ref}
                                              onNavigate={handleOpenReverseIndexForNode}
                                            />
                                          ))}
                                        </>
                                      );
                                    })()}
                                    onClick={() =>
                                      openBehaviorNodeInStudio({
                                        kind: "listener",
                                        listenerId: listener.id,
                                        phase: "trigger",
                                      })
                                    }
                                  />
                                  {listener.actions.map((action) => (
                                    <div key={`${listener.id}-${action.id}`} className="contents">
                                      <BehaviorEdgeLabel label="Then" compact={graphCompact} />
                                      <BehaviorGraphNode
                                        eyebrow="Action"
                                        title={formatLabel(action.kind)}
                                        detail={describeRuntimeAction(action)}
                                        tone="emerald"
                                        compact={graphCompact}
                                        active={
                                          selectedBehaviorNode?.kind === "listener" &&
                                          selectedBehaviorNode.listenerId === listener.id &&
                                          selectedBehaviorNode.phase === "action" &&
                                          selectedBehaviorNode.actionId === action.id
                                        }
                                        onClick={() =>
                                          openBehaviorNodeInStudio({
                                            kind: "listener",
                                            listenerId: listener.id,
                                            phase: "action",
                                            actionId: action.id,
                                          })
                                        }
                                      />
                                    </div>
                                  ))}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openBehaviorNodeInStudio({
                                        kind: "listener",
                                        listenerId: listener.id,
                                        phase: "trigger",
                                      })
                                    }
                                    className={actionButtonClass("primary")}
                                  >
                                    Edit chain in studio
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openBehaviorObjectInBehaviorManager({
                                        objectKey: `flow:${listener.id}`,
                                        selection: selectedAuthoring,
                                        graphSelection: {
                                          kind: "listener",
                                          listenerId: listener.id,
                                          phase: "trigger",
                                        },
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
                No behavior graph yet. Create the first behavior in Studio, then return here for visualization and
                runtime testing.
              </div>
            )}
          </>
        )}
      </div>

      {behaviorWorkspaceMode !== "document_graph" ? (
        <div className="space-y-4">
          {selectedAuthoring?.kind === "field" && onOpenFieldRuleWizardForTrigger ? (
            <FieldRulesTriggers
              doc={activeDocument}
              fieldId={selectedAuthoring.fieldId}
              fieldOptionLabel={fieldRuleLabelOf ?? ((id) => id)}
              onAdd={() => onOpenFieldRuleWizardForTrigger(selectedAuthoring.fieldId)}
              onEdit={(rule) => onOpenFieldRuleWizardForEdit?.(rule)}
              onDelete={(rule) => onDeleteFieldRule?.(rule)}
            />
          ) : null}

          <div className="rounded-[1.15rem] border border-soft bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Graph selection</p>
                <h4 className="mt-2 text-lg font-semibold text-slate-950">Inspect here, edit in Studio</h4>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Graph nodes now act as traceable handoffs. Use Studio for wiring and Behavior Manager for lifecycle
                  controls instead of editing directly in the graph workspace.
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
                  <p className="text-xs uppercase tracking-[0.18em] text-blue-700">Selected behavior</p>
                  <p className="mt-2 font-semibold text-slate-950">{formatLabel(selectedRule.effect)} this field</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    Open this behavior in the guided editor to change the condition/effect, or manage its lifecycle from
                    the full Behavior Manager index.
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
                        openBehaviorObjectInBehaviorManager({
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
                    Open this flow in Studio to edit the action chain, or manage enablement, duplication, and deletion
                    from Behavior Manager.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        openBehaviorNodeInStudio(
                          selectedBehaviorNode?.kind === "listener" &&
                            selectedBehaviorNode.listenerId === selectedListener.id
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
                        openBehaviorObjectInBehaviorManager({
                          objectKey: `flow:${selectedListener.id}`,
                          selection: selectedAuthoring,
                          graphSelection:
                            selectedBehaviorNode?.kind === "listener" &&
                            selectedBehaviorNode.listenerId === selectedListener.id
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
                  Select a graph node to inspect the focused object. Editing will open in Studio rather than expanding
                  another graph-local editor.
                </div>
              ) : (
                <div className="app-muted-card p-4 text-sm text-slate-500">
                  No behavior graph yet. Create the first behavior in Studio, then return here for visualization and
                  runtime testing.
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
                    The graph stays empty until Studio creates real behavior. This keeps creation guided and keeps the
                    graph useful for tracing.
                  </p>
                </div>
                <button type="button" onClick={openBehaviorBehaviorManager} className={actionButtonClass("primary")}>
                  Open Behavior Manager
                </button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {activeRuntimeTarget ? (
                  <button
                    type="button"
                    onClick={() => openBehaviorStudioReactToAnotherItem()}
                    className={actionButtonClass()}
                  >
                    Add listener
                  </button>
                ) : null}
                {activeRuntimeScope ? (
                  <button type="button" onClick={() => openBehaviorStudioAddBehavior()} className={actionButtonClass()}>
                    Create behavior in Studio
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-[1.15rem] border border-soft bg-white p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Session debug</p>
        <h4 className="mt-2 text-lg font-semibold text-slate-950">Moved to Test panel</h4>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Session-lifecycle controls (Reset, Fill required, Run step, Submit) and host-loop simulation now live in the
          unified Test panel — open with <kbd className="rounded bg-slate-200 px-1.5 py-0.5 text-xs">⌘K</kbd> /
          <kbd className="rounded bg-slate-200 px-1.5 py-0.5 text-xs">Ctrl+K</kbd>, then switch to the
          <strong> Session</strong> tab.
        </p>
      </div>
    </div>
  );
}
