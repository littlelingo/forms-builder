import type React from "react";
import type { RuntimeDispatchReport } from "@form-builder/runtime";
import type { AuthoringDocument, RuntimeListenerDefinition, RuntimePayloadField } from "@form-builder/schema";
import { runtimeCoreEventType } from "@form-builder/schema";
import type { AuthoringSelection } from "../../../lib/authoring-utils";
import {
  findAuthoringFieldById,
  formatRuntimeDiagnosticValue,
  formatRuntimeSourceCandidateLabel,
  runtimeEventBubblesForSource,
  runtimeEventDefinitionType,
  runtimePayloadFieldsForEventType,
  sanitizeRuntimeIdentifier,
} from "../utils/runtime-helpers";
import type {
  BehaviorGraphSelection,
  BehaviorStudioCreationPath,
  BehaviorStudioManagerMode,
  BehaviorStudioMode,
  LogicMapListenerEntry,
  LogicMapStepEntry,
  RuntimeEditorScope,
  RuntimeEventSourceCandidate,
  RuntimeSourceEventOption,
} from "../utils/runtime-helpers";
import { actionButtonClass, formatLabel } from "../../../lib/ui-utils";

interface LogicMapData {
  formListeners: LogicMapListenerEntry[];
  steps: LogicMapStepEntry[];
}

export interface EventFlowStudioProps {
  eventFlowSourceId: string;
  eventFlowEventType: string;
  activeRuntimeTarget: RuntimeEventSourceCandidate | null;
  activeRuntimeScope: RuntimeEditorScope | null;
  activeDocument: AuthoringDocument | null;
  runtimeEventSourceCandidates: RuntimeEventSourceCandidate[];
  runtimeEventSourceCandidateById: Map<string, RuntimeEventSourceCandidate>;
  runtimeNodeLabelById: Map<string, string>;
  selectedBehaviorNode: BehaviorGraphSelection | null;
  lastDispatchReport: RuntimeDispatchReport | null;
  logicMapData: LogicMapData | null;
  eventFlowOptionsForSource: (source: RuntimeEventSourceCandidate) => RuntimeSourceEventOption[];
  eventFlowPayloadRawValue: (
    field: RuntimePayloadField,
    source: RuntimeEventSourceCandidate,
    sourceField: import("@form-builder/schema").AuthoringField | null,
    eventType: string,
    target: RuntimeEventSourceCandidate | null,
  ) => string;
  defaultBehaviorTriggerName: () => string;
  onRunEventFlowDispatch: (
    source: RuntimeEventSourceCandidate,
    eventType: string,
    payloadFields: RuntimePayloadField[],
  ) => void;
  onSaveEventFlowEvent: (
    source: RuntimeEventSourceCandidate,
    eventType: string,
    payloadFields: RuntimePayloadField[],
  ) => void;
  onAddEventFlowPayloadCondition: (listener: RuntimeListenerDefinition, payloadFieldName: string) => void;
  onOpenBehaviorStudioListenerSection: () => void;
  onOpenRuntimeEventEditorForSelection: (selection: AuthoringSelection | null, eventId: string) => void;
  onSetEventFlowSourceId: (id: string) => void;
  onSetEventFlowEventType: (type: string) => void;
  onSetEventFlowPayloadValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSetSelectedBehaviorNode: (node: BehaviorGraphSelection | null) => void;
  onSetLastDispatchReport: (report: RuntimeDispatchReport | null) => void;
  onSetSelectedAuthoring: (selection: AuthoringSelection | null) => void;
  onSetBehaviorStudioCreating: (creating: boolean) => void;
  onSetBehaviorStudioManagerMode: (mode: BehaviorStudioManagerMode) => void;
  onSetBehaviorStudioMode: (mode: BehaviorStudioMode) => void;
  onSetBehaviorEventType: (type: string) => void;
  onSetBehaviorEventBubbles: (bubbles: boolean) => void;
  onSetBehaviorEventDescription: (description: string) => void;
  onSetBehaviorEventPayloadFields: (fields: RuntimePayloadField[]) => void;
  onSetBehaviorEventMetadataExample: (example: string) => void;
  onSetBehaviorCreationPath: (path: BehaviorStudioCreationPath) => void;
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

export function EventFlowStudio({
  eventFlowSourceId,
  eventFlowEventType,
  activeRuntimeTarget,
  activeRuntimeScope,
  activeDocument,
  runtimeEventSourceCandidates,
  runtimeEventSourceCandidateById,
  runtimeNodeLabelById,
  selectedBehaviorNode,
  lastDispatchReport,
  logicMapData,
  eventFlowOptionsForSource,
  eventFlowPayloadRawValue,
  defaultBehaviorTriggerName,
  onRunEventFlowDispatch,
  onSaveEventFlowEvent,
  onAddEventFlowPayloadCondition,
  onOpenBehaviorStudioListenerSection,
  onOpenRuntimeEventEditorForSelection,
  onSetEventFlowSourceId,
  onSetEventFlowEventType,
  onSetEventFlowPayloadValues,
  onSetSelectedBehaviorNode,
  onSetLastDispatchReport,
  onSetSelectedAuthoring,
  onSetBehaviorStudioCreating,
  onSetBehaviorStudioManagerMode,
  onSetBehaviorStudioMode,
  onSetBehaviorEventType,
  onSetBehaviorEventBubbles,
  onSetBehaviorEventDescription,
  onSetBehaviorEventPayloadFields,
  onSetBehaviorEventMetadataExample,
  onSetBehaviorCreationPath,
}: EventFlowStudioProps) {
  const source =
    (eventFlowSourceId ? (runtimeEventSourceCandidateById.get(eventFlowSourceId) ?? null) : null) ??
    activeRuntimeTarget;
  if (!source) {
    return (
      <div className="app-muted-card p-4 text-sm text-slate-500">
        Select a form, step, section, group, field, or button before opening Test.
      </div>
    );
  }
  const target = activeRuntimeTarget ?? source;
  const eventOptions = eventFlowOptionsForSource(source);
  const effectiveEventType =
    eventFlowEventType && eventOptions.some((eventOption) => eventOption.type === eventFlowEventType)
      ? eventFlowEventType
      : (eventOptions[0]?.type ?? defaultBehaviorTriggerName());
  const savedEventDefinition =
    source.eventDefinitions.find(
      (eventDefinition) => runtimeEventDefinitionType(eventDefinition) === effectiveEventType,
    ) ?? null;
  const payloadFields = (
    savedEventDefinition?.payloadShape?.fields.length
      ? savedEventDefinition.payloadShape.fields
      : runtimePayloadFieldsForEventType(effectiveEventType)
  ).map((field) => ({ ...field }));
  const sourceField =
    activeDocument && (source.nodeType === "field" || source.nodeType === "component")
      ? findAuthoringFieldById(activeDocument, source.id)
      : null;
  const selectedListenerIndex =
    selectedBehaviorNode?.kind === "listener" && activeRuntimeScope
      ? activeRuntimeScope.listeners.findIndex((listener) => listener.id === selectedBehaviorNode.listenerId)
      : -1;
  const selectedListener =
    selectedListenerIndex >= 0 && activeRuntimeScope ? activeRuntimeScope.listeners[selectedListenerIndex] : null;
  const allRuntimeListenerEntries = [
    ...(logicMapData?.formListeners ?? []),
    ...(logicMapData?.steps.flatMap((step) => step.runtimeListeners) ?? []),
  ];
  const allRuntimeListenerEntryById = new Map(allRuntimeListenerEntries.map((listener) => [listener.id, listener]));
  const flowReport =
    lastDispatchReport?.event.type === effectiveEventType &&
    (lastDispatchReport.event.target?.nodeId === source.id || lastDispatchReport.event.source.nodeId === source.id)
      ? lastDispatchReport
      : null;
  const stateDiffLabels = flowReport
    ? [
        flowReport.stateDiff.currentStepChanged ? "current step" : null,
        flowReport.stateDiff.valuesChanged.length ? `${flowReport.stateDiff.valuesChanged.length} values` : null,
        flowReport.stateDiff.nodesChanged.length ? `${flowReport.stateDiff.nodesChanged.length} nodes` : null,
        flowReport.stateDiff.validationChanged ? "validation" : null,
        flowReport.stateDiff.submitChanged ? "submit" : null,
      ].filter((entry): entry is string => Boolean(entry))
    : [];
  const savedStatus = savedEventDefinition ? "Saved event definition" : "Draft event definition";

  return (
    <div className="mx-auto max-w-[62rem] space-y-3">
      <div className="rounded-[1rem] border border-blue-200 bg-white p-4 shadow-[0_18px_42px_rgba(37,99,235,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.18em] text-blue-700">Test</p>
            <h4 className="mt-1 text-lg font-semibold text-slate-950">Fire event and inspect listeners</h4>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="app-pill">{savedStatus}</span>
              <span className="app-pill">{source.componentLabel}</span>
              {activeRuntimeTarget ? (
                <span className="app-pill">Current target {activeRuntimeTarget.label}</span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onRunEventFlowDispatch(source, effectiveEventType, payloadFields)}
              className={actionButtonClass("primary")}
            >
              Fire event
            </button>
            <button
              type="button"
              onClick={() => onSaveEventFlowEvent(source, effectiveEventType, payloadFields)}
              className={actionButtonClass("secondary")}
            >
              Save event definition
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs uppercase tracking-[0.16em] text-slate-500">
                Event source
                <select
                  value={source.id}
                  onChange={(event) => {
                    onSetEventFlowSourceId(event.target.value);
                    onSetEventFlowEventType("");
                    onSetEventFlowPayloadValues(() => ({}));
                    onSetSelectedBehaviorNode(null);
                  }}
                  className="mt-1 w-full rounded-xl border border-soft bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-900"
                >
                  {runtimeEventSourceCandidates.map((candidate) => (
                    <option key={`event-flow-source-${candidate.id}`} value={candidate.id}>
                      {formatRuntimeSourceCandidateLabel(candidate)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs uppercase tracking-[0.16em] text-slate-500">
                Event
                <select
                  value={effectiveEventType}
                  onChange={(event) => {
                    onSetEventFlowEventType(event.target.value);
                    onSetEventFlowPayloadValues(() => ({}));
                    onSetLastDispatchReport(null);
                  }}
                  className="mt-1 w-full rounded-xl border border-soft bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-900"
                >
                  {eventOptions.map((eventOption) => {
                    const eventIsSaved = source.eventDefinitions.some(
                      (eventDefinition) => runtimeEventDefinitionType(eventDefinition) === eventOption.type,
                    );
                    return (
                      <option key={`event-flow-event-${eventOption.type}`} value={eventOption.type}>
                        {eventIsSaved ? "Saved" : "Draft"} · {eventOption.label}
                      </option>
                    );
                  })}
                  {!eventOptions.some((eventOption) => eventOption.type === effectiveEventType) ? (
                    <option value={effectiveEventType}>{effectiveEventType}</option>
                  ) : null}
                </select>
              </label>
            </div>

            <div className="overflow-hidden rounded-[0.9rem] border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Payload</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {!selectedListener ? (
                    <span className="text-xs text-slate-500">Select a listener to add payload conditions</span>
                  ) : null}
                  <span className="app-pill">{payloadFields.length} fields</span>
                </div>
              </div>
              {payloadFields.length ? (
                payloadFields.map((field) => {
                  const inputId = `event-flow-payload-${sanitizeRuntimeIdentifier(field.name, "payload")}`;
                  const rawValue = eventFlowPayloadRawValue(field, source, sourceField, effectiveEventType, target);
                  const updateRawValue = (value: string) =>
                    onSetEventFlowPayloadValues((current) => ({ ...current, [field.name]: value }));
                  return (
                    <div
                      key={`event-flow-payload-row-${field.name}`}
                      className="grid gap-2 border-b border-slate-200 px-3 py-2.5 last:border-b-0 md:grid-cols-[minmax(8rem,13rem)_minmax(0,1fr)_auto] md:items-center"
                    >
                      <div className="min-w-0">
                        <label htmlFor={inputId} className="text-sm font-medium text-slate-950">
                          {field.label ?? formatLabel(field.name)}
                        </label>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {field.name} · {field.valueType}
                        </p>
                      </div>
                      {field.valueType === "boolean" ? (
                        <select
                          id={inputId}
                          value={rawValue}
                          onChange={(event) => updateRawValue(event.target.value)}
                          className="w-full rounded-lg border border-soft bg-white px-3 py-2 text-sm text-slate-900"
                        >
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </select>
                      ) : field.valueType === "object" || field.valueType === "array" ? (
                        <textarea
                          id={inputId}
                          value={rawValue}
                          rows={2}
                          onChange={(event) => updateRawValue(event.target.value)}
                          className="w-full rounded-lg border border-soft bg-white px-3 py-2 font-mono text-xs text-slate-900"
                        />
                      ) : (
                        <input
                          id={inputId}
                          type={field.valueType === "number" ? "number" : "text"}
                          value={rawValue}
                          onChange={(event) => updateRawValue(event.target.value)}
                          className="w-full rounded-lg border border-soft bg-white px-3 py-2 text-sm text-slate-900"
                        />
                      )}
                      <button
                        type="button"
                        disabled={!selectedListener}
                        onClick={() => selectedListener && onAddEventFlowPayloadCondition(selectedListener, field.name)}
                        className={actionButtonClass("secondary")}
                      >
                        Add payload condition
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="p-3 text-sm text-slate-500">This event does not define payload fields.</div>
              )}
            </div>
          </div>

          <div className="rounded-[0.9rem] border border-soft bg-slate-50 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Trace</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">
                  {flowReport ? `${flowReport.listeners.length} listener checks` : "No event fired yet"}
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenBehaviorStudioListenerSection}
                className={actionButtonClass("secondary")}
              >
                Create listener
              </button>
            </div>

            <div className="mt-3 space-y-2" role="status" aria-live="polite">
              <div className="rounded-[0.8rem] border border-blue-100 bg-white px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">Event fired</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{effectiveEventType}</p>
                <p className="mt-1 truncate text-xs text-slate-500">{formatRuntimeSourceCandidateLabel(source)}</p>
              </div>

              {flowReport ? (
                flowReport.listeners.length ? (
                  flowReport.listeners.map((listener) => {
                    const listenerEntry = allRuntimeListenerEntryById.get(listener.listenerId) ?? null;
                    const canEditListener = Boolean(listenerEntry);
                    return (
                      <div
                        key={`event-flow-listener-report-${listener.listenerId}-${listener.eventPhase}`}
                        className={`rounded-[0.8rem] border bg-white px-3 py-2 ${
                          listener.matched ? "border-emerald-200" : "border-slate-200"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                              {listener.matched ? "Listener ran" : "Listener skipped"}
                            </p>
                            <p className="mt-1 truncate text-sm font-semibold text-slate-950">
                              {listener.label ?? runtimeNodeLabelById.get(listener.dispatcherId) ?? listener.listenerId}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {listener.eventPhase ?? "target"} ·{" "}
                              {listener.matched
                                ? `${listener.actions.length} action${listener.actions.length === 1 ? "" : "s"}`
                                : formatLabel(listener.skippedReason ?? "not matched")}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={!canEditListener}
                            onClick={() => {
                              if (!listenerEntry) {
                                return;
                              }
                              onSetSelectedAuthoring(listenerEntry.selection);
                              onSetSelectedBehaviorNode({
                                kind: "listener",
                                listenerId: listener.listenerId,
                                phase: "action",
                                actionId: listener.actions[0]?.actionId,
                              });
                              onSetBehaviorStudioMode("action");
                            }}
                            className={actionButtonClass("secondary")}
                          >
                            Edit actions
                          </button>
                        </div>
                        {listener.conditions.length ? (
                          <div className="mt-2 grid gap-1.5">
                            {listener.conditions.map((condition) => (
                              <div
                                key={`event-flow-condition-${listener.listenerId}-${condition.conditionId}`}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs"
                              >
                                <span className="font-semibold text-slate-700">
                                  {condition.label ?? "Condition"} {condition.passed ? "passed" : "failed"}
                                </span>
                                <span className="text-slate-500">
                                  {formatRuntimeDiagnosticValue(condition.actualValue)}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {listener.actions.length ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {listener.actions.map((action) => (
                              <span key={`event-flow-action-${action.actionId}`} className="app-pill">
                                {formatLabel(action.kind)} · {action.status}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-[0.8rem] border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-500">
                    No listeners reached this event.
                  </div>
                )
              ) : (
                <div className="rounded-[0.8rem] border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-500">
                  Fire the event to see the listener path.
                </div>
              )}

              {flowReport ? (
                <div className="rounded-[0.8rem] border border-slate-200 bg-white px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">State changes</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(stateDiffLabels.length ? stateDiffLabels : ["no state changes"]).map((label) => (
                      <span key={`event-flow-state-${label}`} className="app-pill">
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                onSetBehaviorStudioCreating(false);
                onSetBehaviorStudioManagerMode("index");
                onSetBehaviorStudioMode("manage");
              }}
              className={actionButtonClass("secondary")}
            >
              Manage
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                const eventDefinition =
                  source.eventDefinitions.find(
                    (candidate) => runtimeEventDefinitionType(candidate) === effectiveEventType,
                  ) ?? null;
                const sourceSelection = authoringSelectionForRuntimeCandidate(source);
                if (eventDefinition) {
                  onOpenRuntimeEventEditorForSelection(sourceSelection, eventDefinition.id);
                  return;
                }
                onSetSelectedAuthoring(sourceSelection);
                onSetBehaviorEventType(effectiveEventType);
                onSetBehaviorEventBubbles(runtimeEventBubblesForSource(source, effectiveEventType));
                onSetBehaviorEventDescription(runtimeCoreEventType(effectiveEventType)?.description ?? "");
                onSetBehaviorEventPayloadFields(payloadFields);
                onSetBehaviorEventMetadataExample("{}");
                onSetBehaviorStudioCreating(true);
                onSetBehaviorCreationPath("event");
                onSetBehaviorStudioMode("event");
              }}
              className={actionButtonClass("secondary")}
            >
              Edit event
            </button>
            <button
              type="button"
              onClick={() => {
                onSetBehaviorStudioCreating(true);
                onSetBehaviorCreationPath("listener");
                onSetBehaviorStudioMode("listener");
              }}
              className={actionButtonClass("secondary")}
            >
              Create listener
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
