import type { ReactNode } from "react";

import type { RuntimeDispatchReport, RuntimeTraceEntry } from "@form-builder/runtime";
import type {
  AuthoringDocument,
  AuthoringField,
  AuthoringStep,
  RuntimeListenerDefinition,
  RuntimeSessionState,
} from "@form-builder/schema";

import type { AuthoringSelection } from "../../../lib/authoring-utils";
import { actionButtonClass } from "../../builder/utils/builder-utils";
import { formatLabel } from "../../builder/utils/builder-utils";
import {
  buildStructuredRuntimeTraceEvidence,
  findAuthoringFieldById,
  formatDispatchKey,
  formatRuntimeDiagnosticValue,
  getRuntimeListenerEventType,
  getRuntimeTraceEntryKey,
  isAuthoredRuntimeEvidenceEntry,
} from "../utils/runtime-helpers";
import type {
  BehaviorGraphSelection,
  BehaviorStudioAnchor,
  BehaviorStudioMode,
  BehaviorStudioView,
  LegacyConditionalRule,
  RuntimeEditorScope,
  RuntimeEventSourceCandidate,
} from "../utils/runtime-helpers";

export interface SimulatorPanelProps {
  selectedBehaviorNode: BehaviorGraphSelection | null;
  selectedAuthoring: AuthoringSelection | null;
  activeBuilderField: AuthoringField | null;
  activeRuntimeScope: RuntimeEditorScope | null;
  activeRuntimeTarget: RuntimeEventSourceCandidate | null;
  activeDocument: AuthoringDocument | null;
  activeStep: AuthoringStep | null;
  runtimeActiveStep: AuthoringStep | null;
  runtimeTraceEntries: RuntimeTraceEntry[];
  runtimeSessionState: RuntimeSessionState | null;
  lastDispatchReport: RuntimeDispatchReport | null;
  selectedRuntimeEvidenceKey: string | null;
  runtimeNodeLabelById: Map<string, string>;
  runtimeEventSourceCandidateById: Map<string, RuntimeEventSourceCandidate>;
  legacyFieldConditionals: (field: AuthoringField) => LegacyConditionalRule[];
  currentBehaviorSelectionSummary: (
    selectedRule?: LegacyConditionalRule | null,
    selectedListener?: RuntimeListenerDefinition | null,
  ) => string;
  resolveListenerTestSource: (listener: RuntimeListenerDefinition) => RuntimeEventSourceCandidate | null;
  renderGuidedListenerValueControl: (
    listener: RuntimeListenerDefinition,
    sourceField: AuthoringField | null,
  ) => ReactNode;
  onHandleTestSelectedRule: (rule: LegacyConditionalRule | null) => void;
  onHandleRunGuidedListenerTest: (listener: RuntimeListenerDefinition | null) => void;
  onHandleRunCurrentRuntimeStep: () => void;
  onHandleResetRuntimeSession: () => void;
  onSetSelectedRuntimeEvidenceKey: (key: string | null) => void;
  onSetBehaviorStudioAnchor: (anchor: BehaviorStudioAnchor | null) => void;
  onSetBehaviorStudioCreating: (creating: boolean) => void;
  onSetBehaviorFocusTarget: (target: "simulator" | null) => void;
  onSetBehaviorStudioMode: (mode: BehaviorStudioMode) => void;
  onSetBehaviorStudioView: (view: BehaviorStudioView) => void;
}

export function SimulatorPanel({
  selectedBehaviorNode,
  selectedAuthoring,
  activeBuilderField,
  activeRuntimeScope,
  activeRuntimeTarget,
  activeDocument,
  activeStep,
  runtimeActiveStep,
  runtimeTraceEntries,
  runtimeSessionState,
  lastDispatchReport,
  selectedRuntimeEvidenceKey,
  runtimeNodeLabelById,
  runtimeEventSourceCandidateById,
  legacyFieldConditionals,
  currentBehaviorSelectionSummary,
  resolveListenerTestSource,
  renderGuidedListenerValueControl,
  onHandleTestSelectedRule,
  onHandleRunGuidedListenerTest,
  onHandleRunCurrentRuntimeStep,
  onHandleResetRuntimeSession,
  onSetSelectedRuntimeEvidenceKey,
  onSetBehaviorStudioAnchor,
  onSetBehaviorStudioCreating,
  onSetBehaviorFocusTarget,
  onSetBehaviorStudioMode,
  onSetBehaviorStudioView,
}: SimulatorPanelProps) {
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
  const selectedListenerSource = selectedListener ? resolveListenerTestSource(selectedListener) : null;
  const selectedListenerDispatcher = selectedListener?.dispatcherId
    ? (runtimeEventSourceCandidateById.get(selectedListener.dispatcherId) ?? null)
    : selectedListenerSource;
  const selectedListenerTarget = selectedListener?.targetNodeId
    ? (runtimeEventSourceCandidateById.get(selectedListener.targetNodeId) ?? null)
    : activeRuntimeTarget;
  const selectedListenerSourceField =
    selectedListenerSource &&
    activeDocument &&
    (selectedListenerSource.nodeType === "field" || selectedListenerSource.nodeType === "component")
      ? findAuthoringFieldById(activeDocument, selectedListenerSource.id)
      : null;
  const selectedListenerReport =
    selectedListener && lastDispatchReport
      ? (lastDispatchReport.listeners.find((entry) => entry.listenerId === selectedListener.id) ?? null)
      : null;
  const selectedReportStateDiff = lastDispatchReport
    ? [
        lastDispatchReport.stateDiff.currentStepChanged ? "current step" : null,
        lastDispatchReport.stateDiff.valuesChanged.length
          ? `${lastDispatchReport.stateDiff.valuesChanged.length} value${lastDispatchReport.stateDiff.valuesChanged.length === 1 ? "" : "s"}`
          : null,
        lastDispatchReport.stateDiff.nodesChanged.length
          ? `${lastDispatchReport.stateDiff.nodesChanged.length} node${lastDispatchReport.stateDiff.nodesChanged.length === 1 ? "" : "s"}`
          : null,
        lastDispatchReport.stateDiff.validationChanged ? "validation" : null,
        lastDispatchReport.stateDiff.submitChanged ? "submit" : null,
      ].filter((entry): entry is string => Boolean(entry))
    : [];

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
            onClick={() => onHandleTestSelectedRule(selectedRule)}
            disabled={!selectedRule}
            className={actionButtonClass(selectedRule ? "primary" : "secondary")}
          >
            Test behavior
          </button>
          <button
            type="button"
            onClick={() => onHandleRunGuidedListenerTest(selectedListener)}
            disabled={!selectedListener}
            className={actionButtonClass(selectedListener ? "primary" : "secondary")}
          >
            Run behavior test
          </button>
          <button
            type="button"
            onClick={onHandleRunCurrentRuntimeStep}
            disabled={!activeStep}
            className={actionButtonClass()}
          >
            Run current step
          </button>
          <button type="button" onClick={onHandleResetRuntimeSession} className={actionButtonClass("secondary")}>
            Reset
          </button>
        </div>
      </div>

      {selectedListener ? (
        <div className="rounded-[0.95rem] border border-blue-200 bg-white p-3">
          <div className="grid gap-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-[0.85rem] border border-soft bg-slate-50 px-3 py-2">
                <p className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">Given source</p>
                <p className="mt-1 truncate text-sm font-semibold text-slate-950">
                  {selectedListenerSource ? selectedListenerSource.label : "No source"}
                </p>
                <p className="mt-1 truncate text-xs text-slate-500">
                  {selectedListenerSource ? formatDispatchKey(selectedListenerSource.dispatchKey) : "Choose a source"}
                </p>
              </div>
              <div className="rounded-[0.85rem] border border-soft bg-slate-50 px-3 py-2">
                <p className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">Observed at</p>
                <p className="mt-1 truncate text-sm font-semibold text-slate-950">
                  {selectedListenerDispatcher ? selectedListenerDispatcher.label : "Dispatcher"}
                </p>
                <p className="mt-1 truncate text-xs text-slate-500">
                  {selectedListenerDispatcher
                    ? formatDispatchKey(selectedListenerDispatcher.dispatchKey)
                    : "Nearest dispatcher"}
                </p>
              </div>
              <div className="rounded-[0.85rem] border border-soft bg-slate-50 px-3 py-2">
                <p className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">Then target</p>
                <p className="mt-1 truncate text-sm font-semibold text-slate-950">
                  {selectedListenerTarget
                    ? selectedListenerTarget.label
                    : (activeRuntimeTarget?.label ?? "Current item")}
                </p>
                <p className="mt-1 truncate text-xs text-slate-500">
                  {formatDispatchKey(selectedListenerTarget?.dispatchKey ?? activeRuntimeTarget?.dispatchKey)}
                </p>
              </div>
            </div>

            <div className="rounded-[0.85rem] border border-soft bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">When event dispatches</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">
                    {getRuntimeListenerEventType(selectedListener)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onHandleRunGuidedListenerTest(selectedListener)}
                  className={actionButtonClass("primary")}
                >
                  Run behavior test
                </button>
              </div>
              <div className="mt-3">
                {renderGuidedListenerValueControl(selectedListener, selectedListenerSourceField)}
              </div>
            </div>

            <div className="rounded-[0.85rem] border border-soft bg-slate-50 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">Then report</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">
                    {selectedListenerReport
                      ? selectedListenerReport.matched
                        ? "Behavior matched and actions ran"
                        : `Behavior skipped: ${formatLabel(selectedListenerReport.skippedReason ?? "conditions_failed")}`
                      : "Run the behavior test to see match evidence"}
                  </p>
                </div>
                {lastDispatchReport ? (
                  <span className="app-pill">{lastDispatchReport.traceEntries.length} runtime events</span>
                ) : null}
              </div>
              {selectedListenerReport ? (
                <div className="mt-3 grid gap-2">
                  {selectedListenerReport.conditions.length ? (
                    selectedListenerReport.conditions.map((condition) => (
                      <div
                        key={`listener-report-condition-${condition.conditionId}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-[0.75rem] border border-soft bg-white px-3 py-2"
                      >
                        <span className="text-xs font-semibold text-slate-700">
                          {condition.label ?? "Condition"} {condition.passed ? "passed" : "failed"}
                        </span>
                        <span className="max-w-full truncate text-xs text-slate-500">
                          actual {formatRuntimeDiagnosticValue(condition.actualValue)} · expected{" "}
                          {formatRuntimeDiagnosticValue(condition.expectedValue)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[0.75rem] border border-soft bg-white px-3 py-2 text-xs text-slate-500">
                      No conditions on this behavior.
                    </div>
                  )}
                  {selectedListenerReport.actions.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedListenerReport.actions.map((action) => (
                        <span key={`listener-report-action-${action.actionId}`} className="app-pill">
                          {formatLabel(action.kind)} · {action.status}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-1.5">
                    {(selectedReportStateDiff.length ? selectedReportStateDiff : ["no state changes"]).map((entry) => (
                      <span key={`listener-report-diff-${entry}`} className="app-pill">
                        {entry}
                      </span>
                    ))}
                  </div>
                  {lastDispatchReport?.emittedEvents.length ? (
                    <div className="rounded-[0.75rem] border border-soft bg-white px-3 py-2 text-xs text-slate-500">
                      Emitted{" "}
                      {lastDispatchReport.emittedEvents
                        .slice(0, 4)
                        .map((event) => event.type)
                        .join(", ")}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-[0.85rem] border border-soft bg-white p-3">
          <p className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">Runtime step</p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-950">
            {runtimeActiveStep?.title ?? activeStep?.title ?? "No active step"}
          </p>
        </div>
        <div className="rounded-[0.85rem] border border-soft bg-white p-3">
          <p className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">Latest event</p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-950">
            {runtimeTraceEntries[0]?.event.type ?? "No runtime events"}
          </p>
        </div>
        <div className="rounded-[0.85rem] border border-soft bg-white p-3">
          <p className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">Authored effects</p>
          <p className="mt-1 text-sm font-semibold text-slate-950">{authoredRuntimeTraceEntries.length}</p>
        </div>
      </div>

      <div className="rounded-[0.95rem] border border-blue-200 bg-blue-50/60 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-blue-700">
              Latest runtime effect
            </p>
            <h5 className="mt-1 text-sm font-semibold text-slate-950">
              {selectedStructuredTraceEvidence?.heading ?? "No authored runtime evidence yet"}
            </h5>
            <p className="mt-1 text-xs leading-5 text-slate-700">
              {selectedStructuredTraceEvidence?.summary ??
                "Run a selected behavior to inspect dispatched events and host actions here."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSetSelectedRuntimeEvidenceKey(null)}
            disabled={!authoredRuntimeTraceEntries.length}
            className={actionButtonClass("secondary")}
          >
            Show latest
          </button>
        </div>
        {selectedStructuredTraceEvidence ? (
          <div className="mt-3 grid gap-2">
            {selectedStructuredTraceEvidence.payloadEntries.slice(0, 4).map((entry) => (
              <div
                key={`studio-test-payload-${entry.key}`}
                className="flex items-start justify-between gap-3 rounded-[0.8rem] border border-blue-100 bg-white px-3 py-2"
              >
                <span className="text-xs font-semibold text-slate-700">{entry.key}</span>
                <span className="max-w-[62%] truncate text-right text-xs text-slate-600">{entry.value}</span>
              </div>
            ))}
            {selectedStructuredTraceEvidence.payloadEntries.length > 4 ? (
              <span className="text-xs text-slate-500">
                {selectedStructuredTraceEvidence.payloadEntries.length - 4} more payload fields available in Runtime
                lab.
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
            onSetBehaviorStudioAnchor(null);
            onSetBehaviorStudioCreating(false);
            onSetBehaviorFocusTarget(null);
            onSetBehaviorStudioMode("test");
            onSetBehaviorStudioView("advanced");
          }}
          className={actionButtonClass("secondary")}
        >
          Open runtime lab
        </button>
      </div>
    </div>
  );
}
