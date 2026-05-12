import { Fragment } from "react";
import type {
  AuthoringDocument,
  AuthoringField,
  RuntimeActionKind,
  RuntimeConditionDefinition,
  RuntimeListenerDefinition,
  RuntimePayloadField,
  RuntimePayloadMode,
} from "@form-builder/schema";
import { isRuntimeConditionGroup } from "@form-builder/schema";
import {
  createEventPayloadCondition,
  createFieldValueCondition,
  findAuthoringFieldById,
  formatRuntimeSourceCandidateLabel,
  getRuntimeListenerEventType,
  sanitizeRuntimeIdentifier,
  validateRuntimeIdentifier,
} from "../utils/runtime-helpers";
import { actionButtonClass, formatLabel } from "../../../lib/ui-utils";
import type {
  BehaviorPresetGroupCategory,
  RuntimeActionChainTemplate,
  RuntimeEditorScope,
  RuntimeEventSourceCandidate,
  RuntimePayloadEditorState,
  RuntimePayloadEntry,
  RuntimePayloadFieldType,
  RuntimePayloadReferenceOption,
  RuntimePayloadTemplate,
  RuntimeReactionBooleanValue,
  RuntimeReactionNavigationValue,
  RuntimeReactionTargetOption,
  RuntimeReactionValueMode,
} from "../utils/runtime-helpers";
import { RuntimeReactionProperties } from "../cards/RuntimeReactionProperties";
import { ActionEditor } from "./ActionEditor";
import { SuggestionChips } from "./SuggestionChips";

function iconButtonClass(kind: "secondary" | "danger" | "primary" = "secondary"): string {
  if (kind === "primary") {
    return "inline-flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 bg-white text-sm font-medium text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50";
  }
  if (kind === "danger") {
    return "inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 bg-white text-sm font-medium text-rose-700 shadow-sm transition hover:bg-rose-50";
  }
  return "inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950";
}

export interface BehaviorComposerProps {
  listener: RuntimeListenerDefinition;
  listenerIndex: number;
  options?: { selectedActionId?: string | null };
  activeRuntimeScope: RuntimeEditorScope | null;
  activeRuntimeTarget: RuntimeEventSourceCandidate | null;
  activeBuilderField: AuthoringField | null;
  activeDocument: AuthoringDocument | null;
  runtimeEventSourceCandidates: RuntimeEventSourceCandidate[];
  runtimeEventSourceCandidateById: Map<string, RuntimeEventSourceCandidate>;
  builderStepOptions: Array<{ id: string; optionLabel: string }>;
  builderFieldOptions: Array<{ id: string; optionLabel: string }>;
  builderNodeOptions: Array<{ id: string; optionLabel: string }>;
  reactionTargetSearch: string;
  runtimeReactionTargetOptions: (
    listener: RuntimeListenerDefinition,
    target: RuntimeEventSourceCandidate | null,
  ) => RuntimeReactionTargetOption[];
  runtimeNodeTypeIsContainer: (nodeType: import("@form-builder/schema").RuntimeNodeType) => boolean;
  booleanReactionValue: (
    listener: RuntimeListenerDefinition,
    targetId: string,
    trueKind: RuntimeActionKind,
    falseKind: RuntimeActionKind,
  ) => RuntimeReactionBooleanValue | "conflict";
  booleanReactionActions: (
    listener: RuntimeListenerDefinition,
    targetId: string,
    trueKind: RuntimeActionKind,
    falseKind: RuntimeActionKind,
  ) => import("@form-builder/schema").RuntimeActionDefinition[];
  valueReactionMode: (listener: RuntimeListenerDefinition, targetId: string) => RuntimeReactionValueMode | "conflict";
  valueReactionActions: (
    listener: RuntimeListenerDefinition,
    targetId: string,
  ) => import("@form-builder/schema").RuntimeActionDefinition[];
  listenerPayloadReferenceOptions: (listener: RuntimeListenerDefinition) => RuntimePayloadReferenceOption[];
  navigationReactionValue: (
    listener: RuntimeListenerDefinition,
    targetId: string,
  ) => RuntimeReactionNavigationValue | "conflict";
  navigationReactionActions: (
    listener: RuntimeListenerDefinition,
    targetId: string,
  ) => import("@form-builder/schema").RuntimeActionDefinition[];
  runtimePayloadTemplatesForAction: (
    action: import("@form-builder/schema").RuntimeActionDefinition,
    listener: RuntimeListenerDefinition,
  ) => RuntimePayloadTemplate[];
  runtimeEventNameSuggestions: (
    scope: RuntimeEditorScope | null,
    field: AuthoringField | null,
    listener: RuntimeListenerDefinition,
  ) => string[];
  runtimeHostHandlerSuggestions: (
    scope: RuntimeEditorScope | null,
    field: AuthoringField | null,
    listener: RuntimeListenerDefinition,
  ) => string[];
  runtimeTriggerSuggestions: (scope: RuntimeEditorScope | null, field: AuthoringField | null) => string[];
  runtimeActionChainTemplatesForListener: (listener: RuntimeListenerDefinition) => RuntimeActionChainTemplate[];
  listenerSourcePayloadFields: (listener: RuntimeListenerDefinition) => RuntimePayloadField[];
  firstListenerPayloadReference: (listener: RuntimeListenerDefinition, keys: string[]) => string | null | undefined;
  defaultEventPayloadConditionPath: (listener: RuntimeListenerDefinition) => string;
  defaultConditionOperatorForField: (
    field: AuthoringField | null | undefined,
  ) => RuntimeConditionDefinition["operator"];
  defaultConditionExpectedValueForField: (field: AuthoringField | null | undefined) => string;
  defaultRuntimeActionConfigForScope: (
    kind: RuntimeActionKind,
    context: { listener: RuntimeListenerDefinition },
  ) => import("@form-builder/schema").RuntimeActionDefinition["config"];
  behaviorPresetCategoryLabels: Record<BehaviorPresetGroupCategory | "recommended" | "advanced", string>;
  getRuntimePayloadEditorState: (
    action: import("@form-builder/schema").RuntimeActionDefinition,
  ) => RuntimePayloadEditorState;
  onUpdateRuntimeListener: (listenerId: string, mutate: (listener: RuntimeListenerDefinition) => void) => void;
  onSetSelectedBehaviorNode: (selection: null) => void;
  onAddRuntimeActionToListener: (listenerId: string, kind?: RuntimeActionKind) => void;
  onMoveRuntimeAction: (listenerId: string, actionId: string, direction: "earlier" | "later") => void;
  onDuplicateRuntimeAction: (listenerId: string, actionId: string) => void;
  onRemoveRuntimeAction: (listenerId: string, actionId: string) => void;
  onUpdateRuntimeAction: (
    listenerId: string,
    actionId: string,
    mutate: (current: import("@form-builder/schema").RuntimeActionDefinition) => void,
  ) => void;
  onSetRuntimePayloadEditorMode: (
    action: import("@form-builder/schema").RuntimeActionDefinition,
    mode: RuntimePayloadMode,
  ) => void;
  onUpdateRuntimePayloadEditorRaw: (actionId: string, raw: string) => void;
  onApplyRuntimePayloadEntries: (listenerId: string, actionId: string, entries: RuntimePayloadEntry[]) => void;
  onSyncRuntimePayloadEditor: (actionId: string, payload: Record<string, unknown>) => void;
  onInsertRuntimeActionAfter: (listenerId: string, actionId: string, kind?: RuntimeActionKind) => void;
  onApplyRuntimePayloadTemplate: (listenerId: string, actionId: string, template: RuntimePayloadTemplate) => void;
  onReplaceRuntimeActionChain: (
    listenerId: string,
    createActions: () => import("@form-builder/schema").RuntimeActionDefinition[],
    label: string,
  ) => void;
  onUpdateReactionTarget: (listenerId: string, targetId: string) => void;
  onSetReactionTargetSearch: (search: string) => void;
  onSetBooleanReactionProperty: (
    listenerId: string,
    target: RuntimeEventSourceCandidate,
    trueKind: RuntimeActionKind,
    falseKind: RuntimeActionKind,
    value: RuntimeReactionBooleanValue,
    label: string,
  ) => void;
  onSetValueReactionMode: (
    listenerId: string,
    target: RuntimeEventSourceCandidate,
    mode: RuntimeReactionValueMode,
  ) => void;
  onUpdateValueReactionStatic: (listenerId: string, target: RuntimeEventSourceCandidate, value: string) => void;
  onUpdateValueReactionPayload: (
    listenerId: string,
    target: RuntimeEventSourceCandidate,
    referenceKey: import("../utils/runtime-helpers").RuntimePayloadReferenceKey,
  ) => void;
  onSetNavigationReaction: (
    listenerId: string,
    target: RuntimeEventSourceCandidate,
    value: RuntimeReactionNavigationValue,
  ) => void;
  onUpdateNavigationStep: (listenerId: string, target: RuntimeEventSourceCandidate, stepId: string) => void;
  onSetMessage: (message: string) => void;
  onSetErrorMessage: (message: string) => void;
}

export function BehaviorComposer({
  listener,
  listenerIndex,
  options,
  activeRuntimeScope,
  activeRuntimeTarget,
  activeBuilderField,
  activeDocument,
  runtimeEventSourceCandidates,
  runtimeEventSourceCandidateById,
  builderStepOptions,
  builderFieldOptions,
  builderNodeOptions,
  reactionTargetSearch,
  runtimeReactionTargetOptions,
  runtimeNodeTypeIsContainer,
  booleanReactionValue,
  booleanReactionActions,
  valueReactionMode,
  valueReactionActions,
  listenerPayloadReferenceOptions,
  navigationReactionValue,
  navigationReactionActions,
  runtimePayloadTemplatesForAction,
  runtimeEventNameSuggestions,
  runtimeHostHandlerSuggestions,
  runtimeTriggerSuggestions,
  runtimeActionChainTemplatesForListener,
  listenerSourcePayloadFields,
  firstListenerPayloadReference,
  defaultEventPayloadConditionPath,
  defaultConditionOperatorForField,
  defaultConditionExpectedValueForField,
  defaultRuntimeActionConfigForScope,
  behaviorPresetCategoryLabels,
  getRuntimePayloadEditorState,
  onUpdateRuntimeListener,
  onSetSelectedBehaviorNode,
  onAddRuntimeActionToListener,
  onMoveRuntimeAction,
  onDuplicateRuntimeAction,
  onRemoveRuntimeAction,
  onUpdateRuntimeAction,
  onSetRuntimePayloadEditorMode,
  onUpdateRuntimePayloadEditorRaw,
  onApplyRuntimePayloadEntries,
  onSyncRuntimePayloadEditor,
  onInsertRuntimeActionAfter,
  onApplyRuntimePayloadTemplate,
  onReplaceRuntimeActionChain,
  onUpdateReactionTarget,
  onSetReactionTargetSearch,
  onSetBooleanReactionProperty,
  onSetValueReactionMode,
  onUpdateValueReactionStatic,
  onUpdateValueReactionPayload,
  onSetNavigationReaction,
  onUpdateNavigationStep,
  onSetMessage,
  onSetErrorMessage,
}: BehaviorComposerProps) {
  const listenerSource = listener.eventSourceNodeId
    ? (runtimeEventSourceCandidateById.get(listener.eventSourceNodeId) ?? null)
    : null;
  const listenerTarget = listener.targetNodeId
    ? (runtimeEventSourceCandidateById.get(listener.targetNodeId) ?? null)
    : activeRuntimeTarget;
  const listenerDispatcher = listener.dispatcherId
    ? (runtimeEventSourceCandidateById.get(listener.dispatcherId) ?? null)
    : null;
  const triggerSuggestions =
    listenerSource?.events.map((eventOption) => eventOption.type) ??
    runtimeTriggerSuggestions(activeRuntimeScope, activeBuilderField);
  const eventType = getRuntimeListenerEventType(listener);
  const triggerIssue = validateRuntimeIdentifier(eventType, "Event type", triggerSuggestions[0] ?? "form.load");
  const chainTemplates = runtimeActionChainTemplatesForListener(listener);
  const payloadFields = listenerSourcePayloadFields(listener);
  const payloadPathListId = `${sanitizeRuntimeIdentifier(listener.id, "listener")}-payload-path-options`;

  const addEventPayloadCondition = () => {
    const payloadPath = defaultEventPayloadConditionPath(listener);
    onUpdateRuntimeListener(listener.id, (current) => {
      current.conditions.push(
        createEventPayloadCondition(payloadPath, "exists", undefined, `${formatLabel(payloadPath)} exists`),
      );
    });
  };

  const addFieldValueCondition = () => {
    const defaultFieldId =
      listenerSource?.nodeType === "field"
        ? listenerSource.id
        : (activeBuilderField?.id ?? builderFieldOptions[0]?.id ?? "");
    if (!defaultFieldId) {
      addEventPayloadCondition();
      return;
    }
    const sourceField = activeDocument ? findAuthoringFieldById(activeDocument, defaultFieldId) : null;
    onUpdateRuntimeListener(listener.id, (current) => {
      current.conditions.push(
        createFieldValueCondition(
          defaultFieldId,
          defaultConditionOperatorForField(sourceField),
          defaultConditionExpectedValueForField(sourceField),
          `${sourceField?.label ?? "Selected field"} matches`,
        ),
      );
    });
  };

  return (
    <div className="space-y-4 rounded-[1rem] border border-blue-200 bg-blue-50/60 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-blue-700">Listener composer</p>
          <p className="mt-2 font-semibold text-slate-950">Listener {listenerIndex + 1}</p>
          <p className="mt-2 text-sm text-slate-700">
            Choose the event source, AS3 event phase, optional conditions, and the actions that run in response.
          </p>
        </div>
        <button type="button" onClick={() => onSetSelectedBehaviorNode(null)} className={iconButtonClass()}>
          ×
        </button>
      </div>

      <div className="grid gap-3">
        <div>
          <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Event type</label>
          <input
            value={eventType}
            onChange={(event) =>
              onUpdateRuntimeListener(listener.id, (current) => {
                current.type = event.target.value;
                current.eventName = event.target.value;
              })
            }
            className="mt-2 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
          />
          {triggerSuggestions.length ? (
            <SuggestionChips
              label="Suggested"
              suggestions={triggerSuggestions}
              onApply={(suggestion) =>
                onUpdateRuntimeListener(listener.id, (current) => {
                  current.type = suggestion;
                  current.eventName = suggestion;
                })
              }
            />
          ) : null}
          <p className="mt-2 text-sm text-slate-600">
            Core event types are provided by the selected dispatcher type. Custom event types stay stable and
            dot-separated.
          </p>
          {triggerIssue ? <p className="mt-2 text-sm text-rose-600">{triggerIssue}</p> : null}
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(9rem,12rem)]">
          <div className="rounded-2xl border border-soft bg-white px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Dispatcher</p>
            <select
              value={listener.dispatcherId ?? activeRuntimeTarget?.id ?? activeDocument?.id ?? ""}
              onChange={(event) =>
                onUpdateRuntimeListener(listener.id, (current) => {
                  const dispatcher = runtimeEventSourceCandidateById.get(event.target.value);
                  current.dispatcherId = dispatcher?.id ?? event.target.value;
                  current.dispatcherType = dispatcher?.nodeType ?? current.dispatcherType ?? null;
                  current.wiringMode = current.wiringMode === "cross_item" ? "cross_item" : "advanced_dispatcher";
                })
              }
              className="mt-2 w-full rounded-2xl border border-soft bg-white px-3 py-2 text-sm text-slate-800"
            >
              {runtimeEventSourceCandidates.map((candidate) => (
                <option key={`listener-dispatcher-${listener.id}-${candidate.id}`} value={candidate.id}>
                  {formatRuntimeSourceCandidateLabel(candidate)}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-slate-500">
              {listener.wiringMode === "cross_item" && listenerSource && listenerTarget
                ? `Smart wiring: listen at ${listenerDispatcher?.label ?? "shared dispatcher"} for ${listenerSource.label}, then update ${listenerTarget.label}.`
                : "Target events run here; bubbled descendant events can be heard here when the event bubbles."}
            </p>
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Priority</label>
            <input
              type="number"
              value={listener.priority ?? 0}
              onChange={(event) =>
                onUpdateRuntimeListener(listener.id, (current) => {
                  current.priority = Number.parseInt(event.target.value || "0", 10);
                })
              }
              className="mt-2 w-full rounded-2xl border border-soft bg-white px-4 py-3 text-sm text-slate-800"
            />
          </div>
        </div>
        <label className="flex items-center gap-3 rounded-2xl border border-soft bg-white px-4 py-3">
          <input
            type="checkbox"
            checked={listener.useCapture === true}
            onChange={(event) =>
              onUpdateRuntimeListener(listener.id, (current) => {
                current.useCapture = event.target.checked;
              })
            }
          />
          <span className="text-sm text-slate-700">Use capture phase before the event reaches the target</span>
        </label>
        <label className="flex items-center gap-3 rounded-2xl border border-soft bg-white px-4 py-3">
          <input
            type="checkbox"
            checked={listener.enabled}
            onChange={(event) =>
              onUpdateRuntimeListener(listener.id, (current) => {
                current.enabled = event.target.checked;
              })
            }
          />
          <span className="text-sm text-slate-700">Behavior enabled</span>
        </label>
      </div>

      <div className="rounded-[0.95rem] border border-blue-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-blue-700">Intercepted event</p>
            <p className="mt-2 text-sm font-semibold text-slate-950">{eventType || "Event type not set"}</p>
          </div>
          <span className="app-pill">{payloadFields.length} payload properties</span>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-500">Source</p>
            <p className="mt-1 truncate text-sm text-slate-800">
              {listenerSource ? formatRuntimeSourceCandidateLabel(listenerSource) : "Selected dispatcher"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-500">Dispatcher</p>
            <p className="mt-1 truncate text-sm text-slate-800">
              {listenerDispatcher ? formatRuntimeSourceCandidateLabel(listenerDispatcher) : "Runtime dispatcher"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-500">Listener target</p>
            <p className="mt-1 truncate text-sm text-slate-800">
              {listenerTarget ? formatRuntimeSourceCandidateLabel(listenerTarget) : "Current item"}
            </p>
          </div>
        </div>
        {payloadFields.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {payloadFields.slice(0, 12).map((field) => (
              <span key={`${listener.id}-payload-${field.name}`} className="app-pill">
                {field.label ?? formatLabel(field.name)} · {field.valueType}
              </span>
            ))}
            {payloadFields.length > 12 ? <span className="app-pill">+{payloadFields.length - 12} more</span> : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No payload schema is defined for this source event yet.</p>
        )}
      </div>

      <div className="rounded-[0.95rem] border border-soft bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Event checks</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Check intercepted payload values or field values before this listener runs its reactions.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={addEventPayloadCondition} className={actionButtonClass("secondary")}>
              Check event payload
            </button>
            <button type="button" onClick={addFieldValueCondition} className={actionButtonClass()}>
              Check field value
            </button>
          </div>
        </div>
        {payloadFields.length ? (
          <datalist id={payloadPathListId}>
            {payloadFields.map((field) => (
              <option key={`${listener.id}-payload-path-${field.name}`} value={field.name}>
                {field.label ?? formatLabel(field.name)}
              </option>
            ))}
          </datalist>
        ) : null}
        {listener.conditions.length ? (
          <div className="mt-3 space-y-3">
            {listener.conditions.map((conditionNode, conditionIndex) => {
              if (isRuntimeConditionGroup(conditionNode)) {
                // Phase 2B engine ships groups; this composer still edits
                // atoms only. Surface a read-only placeholder so authored
                // groups stay visible until the Phase 2C composer lands.
                return (
                  <div
                    key={conditionNode.id}
                    className="rounded-[0.85rem] border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"
                  >
                    Condition group ({conditionNode.operator}) · edit in Behavior Manager.
                  </div>
                );
              }
              const condition = conditionNode;
              const sourceFieldId = condition.source.kind === "field_value" ? condition.source.fieldId : "";
              const payloadPath = condition.source.kind === "event_payload" ? condition.source.path : "value";
              return (
                <div key={condition.id} className="rounded-[0.85rem] border border-slate-200 bg-slate-50 p-3">
                  <div className="grid gap-3 md:grid-cols-[minmax(8rem,10rem)_minmax(0,1fr)_minmax(8rem,10rem)_minmax(0,1fr)_auto]">
                    <label className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      Source
                      <select
                        value={condition.source.kind}
                        onChange={(event) =>
                          onUpdateRuntimeListener(listener.id, (current) => {
                            const nextCondition = current.conditions[conditionIndex];
                            if (!nextCondition || isRuntimeConditionGroup(nextCondition)) {
                              return;
                            }
                            if (event.target.value === "event_payload") {
                              nextCondition.source = {
                                kind: "event_payload",
                                path: payloadPath || defaultEventPayloadConditionPath(listener),
                              };
                              return;
                            }
                            const nextFieldId =
                              sourceFieldId ||
                              (listenerSource?.nodeType === "field" ? listenerSource.id : "") ||
                              activeBuilderField?.id ||
                              builderFieldOptions[0]?.id ||
                              "";
                            const sourceField = activeDocument
                              ? findAuthoringFieldById(activeDocument, nextFieldId)
                              : null;
                            nextCondition.source = { kind: "field_value", fieldId: nextFieldId };
                            nextCondition.operator = defaultConditionOperatorForField(sourceField);
                            nextCondition.expectedValue = defaultConditionExpectedValueForField(sourceField);
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-soft bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-800"
                      >
                        <option value="field_value">Field value</option>
                        <option value="event_payload">Event payload</option>
                      </select>
                    </label>
                    {condition.source.kind === "field_value" ? (
                      <label className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Field
                        <select
                          value={sourceFieldId}
                          onChange={(event) =>
                            onUpdateRuntimeListener(listener.id, (current) => {
                              const nextCondition = current.conditions[conditionIndex];
                              if (!nextCondition || isRuntimeConditionGroup(nextCondition)) {
                                return;
                              }
                              const sourceField = activeDocument
                                ? findAuthoringFieldById(activeDocument, event.target.value)
                                : null;
                              nextCondition.source = { kind: "field_value", fieldId: event.target.value };
                              nextCondition.operator = defaultConditionOperatorForField(sourceField);
                              nextCondition.expectedValue = defaultConditionExpectedValueForField(sourceField);
                            })
                          }
                          className="mt-1 w-full rounded-xl border border-soft bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-800"
                        >
                          {builderFieldOptions.map((option) => (
                            <option key={`listener-condition-field-${condition.id}-${option.id}`} value={option.id}>
                              {option.optionLabel}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <label className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Payload path
                        <input
                          list={payloadPathListId}
                          value={payloadPath}
                          placeholder={defaultEventPayloadConditionPath(listener)}
                          onChange={(event) =>
                            onUpdateRuntimeListener(listener.id, (current) => {
                              const nextCondition = current.conditions[conditionIndex];
                              if (nextCondition && !isRuntimeConditionGroup(nextCondition)) {
                                nextCondition.source = { kind: "event_payload", path: event.target.value };
                              }
                            })
                          }
                          className="mt-1 w-full rounded-xl border border-soft bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-800"
                        />
                      </label>
                    )}
                    <label className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      Operator
                      <select
                        value={condition.operator}
                        onChange={(event) =>
                          onUpdateRuntimeListener(listener.id, (current) => {
                            const nextCondition = current.conditions[conditionIndex];
                            if (nextCondition && !isRuntimeConditionGroup(nextCondition)) {
                              nextCondition.operator = event.target.value as RuntimeConditionDefinition["operator"];
                            }
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-soft bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-800"
                      >
                        <option value="equals">equals</option>
                        <option value="not_equals">does not equal</option>
                        <option value="contains">contains</option>
                        <option value="exists">has any value</option>
                      </select>
                    </label>
                    <label className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      Value
                      <input
                        value={
                          condition.expectedValue === undefined || condition.expectedValue === null
                            ? ""
                            : String(condition.expectedValue)
                        }
                        disabled={condition.operator === "exists"}
                        onChange={(event) =>
                          onUpdateRuntimeListener(listener.id, (current) => {
                            const nextCondition = current.conditions[conditionIndex];
                            if (nextCondition && !isRuntimeConditionGroup(nextCondition)) {
                              nextCondition.expectedValue = event.target.value;
                            }
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-soft bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-800 disabled:bg-slate-100"
                      />
                    </label>
                    <div className="flex items-end gap-2">
                      <label className="flex items-center gap-2 rounded-xl border border-soft bg-white px-3 py-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={condition.enabled !== false}
                          onChange={(event) =>
                            onUpdateRuntimeListener(listener.id, (current) => {
                              const nextCondition = current.conditions[conditionIndex];
                              if (nextCondition && !isRuntimeConditionGroup(nextCondition)) {
                                nextCondition.enabled = event.target.checked;
                              }
                            })
                          }
                        />
                        Enabled
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateRuntimeListener(listener.id, (current) => {
                            current.conditions.splice(conditionIndex, 1);
                          })
                        }
                        className={actionButtonClass("danger")}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="app-muted-card mt-3 p-3 text-sm text-slate-500">
            No conditions. This listener runs whenever the selected event reaches the dispatcher.
          </div>
        )}
      </div>

      <div className="space-y-3">
        <RuntimeReactionProperties
          listener={listener}
          target={listenerTarget}
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
          onUpdateReactionTarget={onUpdateReactionTarget}
          onSetReactionTargetSearch={onSetReactionTargetSearch}
          onSetBooleanReactionProperty={onSetBooleanReactionProperty}
          onSetValueReactionMode={onSetValueReactionMode}
          onUpdateValueReactionStatic={onUpdateValueReactionStatic}
          onUpdateValueReactionPayload={onUpdateValueReactionPayload}
          onSetNavigationReaction={onSetNavigationReaction}
          onUpdateNavigationStep={onUpdateNavigationStep}
        />

        <details className="rounded-[0.95rem] border border-soft bg-white p-4">
          <summary className="cursor-pointer list-none rounded-[0.75rem] px-1 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500">
            <span className="flex flex-wrap items-center justify-between gap-3">
              <span>
                <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">Advanced action chain</span>
                <span className="mt-2 block text-sm text-slate-700">
                  Inspect ordered actions, host requests, dispatches, and chain templates when the property rows are not
                  enough.
                </span>
              </span>
              <span className="app-pill">{listener.actions.length} actions</span>
            </span>
          </summary>

          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onAddRuntimeActionToListener(listener.id)}
                className={actionButtonClass()}
              >
                Add dispatch
              </button>
              <button
                type="button"
                onClick={() => onAddRuntimeActionToListener(listener.id, "host_action")}
                className={actionButtonClass("secondary")}
              >
                Add host action
              </button>
            </div>

            {listener.actions.length ? (
              <div className="rounded-[0.95rem] border border-soft bg-slate-50 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Chain path</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="app-pill">Listen for {formatLabel(eventType)}</span>
                  <span className="app-pill">{listener.useCapture ? "Capture" : "Target + bubble"}</span>
                  {listener.wiringMode === "cross_item" && listenerSource ? (
                    <span className="app-pill">From {listenerSource.label}</span>
                  ) : null}
                  {listener.wiringMode === "cross_item" && listenerTarget ? (
                    <span className="app-pill">Update {listenerTarget.label}</span>
                  ) : null}
                  {listener.actions.map((action, actionIndex) => (
                    <Fragment key={`${listener.id}-summary-${action.id}`}>
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Then</span>
                      <span
                        className={`app-pill ${options?.selectedActionId === action.id ? "ring-2 ring-blue-300" : ""}`}
                      >
                        {actionIndex + 1}. {formatLabel(action.kind)}
                      </span>
                    </Fragment>
                  ))}
                </div>
              </div>
            ) : (
              <div className="app-muted-card p-4 text-sm text-slate-500">
                No ordered actions yet. Property rows above will add the common visibility, enabled, required, value,
                and navigation actions.
              </div>
            )}

            {chainTemplates.length ? (
              <div className="rounded-[0.95rem] border border-soft bg-slate-50 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Common chains</p>
                <p className="mt-2 text-sm text-slate-700">
                  Use a starter chain when this flow needs more than one action and you do not want to build it node by
                  node.
                </p>
                <div className="mt-3 grid gap-3">
                  {chainTemplates.map((template) => (
                    <div key={template.id} className="rounded-[0.95rem] border border-slate-200 bg-white p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{template.label}</p>
                          <p className="mt-1 text-sm text-slate-600">{template.description}</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <span className="app-pill">Then {template.actionSummary}</span>
                            <span className="app-pill">{behaviorPresetCategoryLabels[template.category]}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            onReplaceRuntimeActionChain(listener.id, template.createActions, template.label)
                          }
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

            {listener.actions.length
              ? listener.actions.map((action, actionIndex) => (
                  <ActionEditor
                    key={action.id}
                    listener={listener}
                    action={action}
                    actionIndex={actionIndex}
                    options={{
                      highlighted: options?.selectedActionId === action.id,
                      actionCount: listener.actions.length,
                    }}
                    runtimeEventSourceCandidates={runtimeEventSourceCandidates}
                    builderStepOptions={builderStepOptions}
                    builderFieldOptions={builderFieldOptions}
                    builderNodeOptions={builderNodeOptions}
                    payloadTemplates={runtimePayloadTemplatesForAction(action, listener)}
                    emittedEventSuggestions={runtimeEventNameSuggestions(
                      activeRuntimeScope,
                      activeBuilderField,
                      listener,
                    )}
                    hostHandlerSuggestions={runtimeHostHandlerSuggestions(
                      activeRuntimeScope,
                      activeBuilderField,
                      listener,
                    )}
                    getRuntimePayloadEditorState={getRuntimePayloadEditorState}
                    onMoveRuntimeAction={onMoveRuntimeAction}
                    onDuplicateRuntimeAction={onDuplicateRuntimeAction}
                    onRemoveRuntimeAction={onRemoveRuntimeAction}
                    onUpdateRuntimeAction={onUpdateRuntimeAction}
                    onSetRuntimePayloadEditorMode={onSetRuntimePayloadEditorMode}
                    onUpdateRuntimePayloadEditorRaw={onUpdateRuntimePayloadEditorRaw}
                    onApplyRuntimePayloadEntries={onApplyRuntimePayloadEntries}
                    onSyncRuntimePayloadEditor={onSyncRuntimePayloadEditor}
                    onInsertRuntimeActionAfter={onInsertRuntimeActionAfter}
                    onApplyRuntimePayloadTemplate={onApplyRuntimePayloadTemplate}
                    onSetMessage={onSetMessage}
                    onSetErrorMessage={onSetErrorMessage}
                    defaultRuntimeActionConfigForScope={defaultRuntimeActionConfigForScope}
                    firstListenerPayloadReference={firstListenerPayloadReference}
                  />
                ))
              : null}
          </div>
        </details>
      </div>
    </div>
  );
}
