import type { ReactNode } from "react";
import { useId, useMemo } from "react";
import type {
  AuthoringDocument,
  AuthoringField,
  RuntimeActionDefinition,
  RuntimeActionKind,
  RuntimeListenerDefinition,
  RuntimePayloadMode,
} from "@form-builder/schema";
import { runtimeActionSafetyClass } from "@form-builder/schema";
import {
  describeRuntimeAction,
  getRuntimeActionEventType,
  getRuntimeActionPayload,
  isRecord,
  isRuntimePayloadReference,
  runtimeActionOptions,
  runtimePayloadEntries,
  runtimePayloadEntryValueForType,
  runtimePayloadFieldTypeOptions,
  runtimePayloadIssues,
  runtimePayloadReferenceOptions,
  validateRuntimeIdentifier,
} from "../utils/runtime-helpers";
import type {
  RuntimeEventSourceCandidate,
  RuntimePayloadEditorState,
  RuntimePayloadEntry,
  RuntimePayloadFieldType,
  RuntimePayloadTemplate,
} from "../utils/runtime-helpers";
import { collectKeys } from "./handler-key-autocomplete";
import { SuggestionChips } from "./SuggestionChips";
import { actionButtonClass } from "../../../lib/ui-utils";
import { BranchActionCard } from "../cards/BranchActionCard";
import { SourcePicker } from "../../test-panel/SourcePicker";

/**
 * Filter the document's runtime event source candidates down to the subset
 * appropriate for an action's "target" picker. Kinds without a target picker
 * return an empty list. The picker won't render when the list is empty, which
 * matches the prior `<select>` behaviour for those kinds.
 */
function candidatesFilteredByActionKind(
  kind: RuntimeActionKind,
  all: RuntimeEventSourceCandidate[],
): RuntimeEventSourceCandidate[] {
  switch (kind) {
    case "set_field_value":
    case "clear_field_value":
      // Fields and field-like components are valid targets for value mutations.
      return all.filter((c) => c.nodeType === "field" || c.nodeType === "component");
    case "go_to_step":
      return all.filter((c) => c.nodeType === "step");
    case "show_node":
    case "hide_node":
    case "enable_node":
    case "disable_node":
    case "mark_required":
    case "mark_optional":
      // Authoring nodes inside the form. Exclude the form itself.
      return all.filter((c) => c.nodeType !== "form");
    default:
      // No target picker for: emit_event, dispatch_event, host_action, branch,
      // wait, host_call_await, submit_form, go_to_next_step, go_to_previous_step.
      return [];
  }
}

function renderRuntimePayloadTemplates(config: {
  label: string;
  templates: RuntimePayloadTemplate[];
  onApply: (template: RuntimePayloadTemplate) => void;
}): ReactNode {
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

interface PayloadEditorProps {
  heading: string;
  description: string;
  keyNamespace: string;
  addLabel: string;
  emptyLabel: string;
  applySuccessMessage: string;
  structuredPayloadEntries: RuntimePayloadEntry[];
  payloadIssues: string[];
  payloadTemplates: RuntimePayloadTemplate[];
  editorState: RuntimePayloadEditorState;
  listenerId: string;
  actionId: string;
  onSetEditorMode: (mode: RuntimePayloadMode) => void;
  onApplyRuntimePayloadTemplate: (template: RuntimePayloadTemplate) => void;
  onApplyRuntimePayloadEntries: (listenerId: string, actionId: string, entries: RuntimePayloadEntry[]) => void;
  onUpdateRuntimePayloadEditorRaw: (actionId: string, raw: string) => void;
  onUpdateRuntimeAction: (
    listenerId: string,
    actionId: string,
    mutate: (current: RuntimeActionDefinition) => void,
  ) => void;
  onSyncRuntimePayloadEditor: (actionId: string, payload: Record<string, unknown>) => void;
  getCurrentPayload: () => Record<string, unknown>;
  onSetMessage: (message: string) => void;
  onSetErrorMessage: (message: string) => void;
}

function PayloadEditor({
  heading,
  description,
  keyNamespace,
  addLabel,
  emptyLabel,
  applySuccessMessage,
  structuredPayloadEntries,
  payloadIssues,
  payloadTemplates,
  editorState,
  listenerId,
  actionId,
  onSetEditorMode,
  onApplyRuntimePayloadTemplate,
  onApplyRuntimePayloadEntries,
  onUpdateRuntimePayloadEditorRaw,
  onUpdateRuntimeAction,
  onSyncRuntimePayloadEditor,
  getCurrentPayload,
  onSetMessage,
  onSetErrorMessage,
}: PayloadEditorProps) {
  return (
    <div className="rounded-[0.95rem] border border-soft bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{heading}</p>
          <p className="mt-2 text-sm text-slate-700">{description}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onSetEditorMode("key_value")}
            className={actionButtonClass(editorState.mode === "key_value" ? "primary" : "secondary")}
          >
            Structured fields
          </button>
          <button
            type="button"
            onClick={() => onSetEditorMode("json")}
            className={actionButtonClass(editorState.mode === "json" ? "primary" : "secondary")}
          >
            Raw JSON
          </button>
        </div>
      </div>

      {editorState.mode === "key_value" ? (
        <div className="mt-4 space-y-3">
          {renderRuntimePayloadTemplates({
            label: "Quick payload templates",
            templates: payloadTemplates,
            onApply: (template) => {
              onApplyRuntimePayloadTemplate(template);
              onSetMessage(`${template.label} payload template applied.`);
            },
          })}
          {structuredPayloadEntries.map((entry, payloadIndex, payloadEntries) => (
            <div
              key={`${keyNamespace}-${payloadIndex}`}
              className="grid gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,0.65fr)_minmax(0,1.15fr)_auto]"
            >
              <input
                value={entry.key}
                onChange={(event) => {
                  const nextEntries = payloadEntries.map((candidate, candidateIndex) =>
                    candidateIndex === payloadIndex ? { ...candidate, key: event.target.value } : candidate,
                  );
                  onApplyRuntimePayloadEntries(listenerId, actionId, nextEntries);
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
                      ? {
                          ...candidate,
                          type: nextType,
                          value: runtimePayloadEntryValueForType(nextType, candidate.value),
                        }
                      : candidate,
                  );
                  onApplyRuntimePayloadEntries(listenerId, actionId, nextEntries);
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
                    onApplyRuntimePayloadEntries(listenerId, actionId, nextEntries);
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
                    onApplyRuntimePayloadEntries(listenerId, actionId, nextEntries);
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
                      onApplyRuntimePayloadEntries(listenerId, actionId, nextEntries);
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
                    onApplyRuntimePayloadEntries(listenerId, actionId, nextEntries);
                  }}
                  placeholder={entry.type === "number" ? "0" : "plain text"}
                  className="rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                />
              )}
              <button
                type="button"
                onClick={() => {
                  const nextEntries = payloadEntries.filter((_, candidateIndex) => candidateIndex !== payloadIndex);
                  onApplyRuntimePayloadEntries(listenerId, actionId, nextEntries);
                }}
                className={actionButtonClass("danger")}
              >
                Remove
              </button>
            </div>
          ))}
          {!structuredPayloadEntries.length ? (
            <div className="app-muted-card p-4 text-sm text-slate-500">{emptyLabel}</div>
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
              onApplyRuntimePayloadEntries(listenerId, actionId, nextEntries);
            }}
            className={actionButtonClass()}
          >
            {addLabel}
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <textarea
            value={editorState.raw}
            onChange={(event) => onUpdateRuntimePayloadEditorRaw(actionId, event.target.value)}
            rows={8}
            className="w-full rounded-2xl border border-soft px-4 py-3 font-mono text-sm text-slate-800"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                try {
                  const parsed = JSON.parse(editorState.raw);
                  if (!isRecord(parsed)) {
                    throw new Error("Payload JSON must be an object.");
                  }
                  onUpdateRuntimeAction(listenerId, actionId, (current) => {
                    current.config.payload = parsed;
                  });
                  onSyncRuntimePayloadEditor(actionId, parsed);
                  onSetMessage(applySuccessMessage);
                } catch (error) {
                  onSetErrorMessage(error instanceof Error ? error.message : "Invalid payload JSON.");
                }
              }}
              className={actionButtonClass("primary")}
            >
              Apply JSON
            </button>
            <button
              type="button"
              onClick={() => onSyncRuntimePayloadEditor(actionId, getCurrentPayload())}
              className={actionButtonClass()}
            >
              Reset from payload
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export interface ActionEditorProps {
  listener: RuntimeListenerDefinition;
  action: RuntimeActionDefinition;
  actionIndex: number;
  options?: { highlighted?: boolean; actionCount?: number };
  /**
   * Active authoring document — used to power the handlerKey datalist
   * autocomplete (Phase 8 Task 8.3). When `null`, the datalist renders
   * empty and the input degrades to a plain text field.
   */
  activeDocument: AuthoringDocument | null;
  runtimeEventSourceCandidates: RuntimeEventSourceCandidate[];
  payloadTemplates: RuntimePayloadTemplate[];
  emittedEventSuggestions: string[];
  hostHandlerSuggestions: string[];
  getRuntimePayloadEditorState: (action: RuntimeActionDefinition) => RuntimePayloadEditorState;
  onMoveRuntimeAction: (listenerId: string, actionId: string, direction: "earlier" | "later") => void;
  onDuplicateRuntimeAction: (listenerId: string, actionId: string) => void;
  onRemoveRuntimeAction: (listenerId: string, actionId: string) => void;
  onUpdateRuntimeAction: (
    listenerId: string,
    actionId: string,
    mutate: (current: RuntimeActionDefinition) => void,
  ) => void;
  onSetRuntimePayloadEditorMode: (action: RuntimeActionDefinition, mode: RuntimePayloadMode) => void;
  onUpdateRuntimePayloadEditorRaw: (actionId: string, raw: string) => void;
  onApplyRuntimePayloadEntries: (listenerId: string, actionId: string, entries: RuntimePayloadEntry[]) => void;
  onSyncRuntimePayloadEditor: (actionId: string, payload: Record<string, unknown>) => void;
  onInsertRuntimeActionAfter: (listenerId: string, actionId: string, kind?: RuntimeActionKind) => void;
  onApplyRuntimePayloadTemplate: (listenerId: string, actionId: string, template: RuntimePayloadTemplate) => void;
  onSetMessage: (message: string) => void;
  onSetErrorMessage: (message: string) => void;
  defaultRuntimeActionConfigForScope: (
    kind: RuntimeActionKind,
    context: { listener: RuntimeListenerDefinition },
  ) => RuntimeActionDefinition["config"];
  firstListenerPayloadReference: (listener: RuntimeListenerDefinition, keys: string[]) => string | null | undefined;
}

export function ActionEditor({
  listener,
  action,
  actionIndex,
  options,
  activeDocument,
  runtimeEventSourceCandidates,
  payloadTemplates,
  emittedEventSuggestions,
  hostHandlerSuggestions,
  getRuntimePayloadEditorState,
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
  onSetMessage,
  onSetErrorMessage,
  defaultRuntimeActionConfigForScope,
  firstListenerPayloadReference,
}: ActionEditorProps) {
  // Phase 8 Task 8.3: handlerKey datalist autocomplete data. Sourced once
  // per render from the active authoring document; collectKeys walks every
  // listener (including branch arms) and returns each unique handlerKey
  // with its frequency and the listener labels using it.
  const handlerKeyOptions = useMemo(() => (activeDocument ? collectKeys(activeDocument) : []), [activeDocument]);
  const handlerKeyDatalistId = useId();
  const safetyClassName = (() => {
    switch (runtimeActionSafetyClass(action.kind)) {
      case "destructive":
        return "border-rose-300 bg-rose-50";
      case "host":
        return "border-amber-300 bg-amber-50";
      case "safe":
      default:
        return "";
    }
  })();
  const actionTone = options?.highlighted ? "border-blue-300 bg-blue-50/60" : safetyClassName || "border-soft bg-white";
  const structuredPayloadEntries = runtimePayloadEntries(getRuntimeActionPayload(action));
  const payloadIssues = runtimePayloadIssues(structuredPayloadEntries);
  const emittedEventIssue =
    action.kind === "dispatch_event"
      ? validateRuntimeIdentifier(
          getRuntimeActionEventType(action),
          "Event type",
          emittedEventSuggestions[0] ?? "custom.event",
        )
      : null;
  const hostHandlerIssue =
    action.kind === "host_action"
      ? validateRuntimeIdentifier(
          String(action.config.handlerKey ?? ""),
          "Host handler key",
          hostHandlerSuggestions[0] ?? "host.action",
        )
      : null;
  const runtimeValueReference = isRuntimePayloadReference(action.config.value) ? action.config.value.$runtime : null;

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
            onClick={() => onMoveRuntimeAction(listener.id, action.id, "earlier")}
            disabled={actionIndex === 0}
            className={actionButtonClass()}
          >
            Move earlier
          </button>
          <button
            type="button"
            onClick={() => onMoveRuntimeAction(listener.id, action.id, "later")}
            disabled={actionIndex === (options?.actionCount ?? listener.actions.length) - 1}
            className={actionButtonClass()}
          >
            Move later
          </button>
          <button
            type="button"
            onClick={() => onDuplicateRuntimeAction(listener.id, action.id)}
            className={actionButtonClass("secondary")}
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => onRemoveRuntimeAction(listener.id, action.id)}
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
              onUpdateRuntimeAction(listener.id, action.id, (current) => {
                current.kind = event.target.value as RuntimeActionKind;
                current.config = defaultRuntimeActionConfigForScope(event.target.value as RuntimeActionKind, {
                  listener,
                });
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
            {(() => {
              const stepCandidates = candidatesFilteredByActionKind("go_to_step", runtimeEventSourceCandidates);
              return stepCandidates.length > 0 ? (
                <div className="mt-2">
                  <SourcePicker
                    candidates={stepCandidates}
                    selectedId={action.config.stepId ? String(action.config.stepId) : null}
                    onSelect={(id) =>
                      onUpdateRuntimeAction(listener.id, action.id, (current) => {
                        current.config.stepId = id;
                      })
                    }
                    placeholder="Search steps..."
                  />
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No steps available in this form.</p>
              );
            })()}
          </div>
        ) : null}

        {action.kind === "set_field_value" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Target field</label>
              {(() => {
                const fieldCandidates = candidatesFilteredByActionKind("set_field_value", runtimeEventSourceCandidates);
                return fieldCandidates.length > 0 ? (
                  <div className="mt-2">
                    <SourcePicker
                      candidates={fieldCandidates}
                      selectedId={action.config.fieldId ? String(action.config.fieldId) : null}
                      onSelect={(id) =>
                        onUpdateRuntimeAction(listener.id, action.id, (current) => {
                          current.config.fieldId = id;
                        })
                      }
                      placeholder="Search fields..."
                    />
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">No fields available in this form.</p>
                );
              })()}
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Value</label>
              {runtimeValueReference ? (
                <div className="mt-2 space-y-2">
                  <select
                    value={runtimeValueReference}
                    onChange={(event) =>
                      onUpdateRuntimeAction(listener.id, action.id, (current) => {
                        current.config.value = { $runtime: event.target.value };
                      })
                    }
                    className="w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                  >
                    {runtimePayloadReferenceOptions.map((option) => (
                      <option key={`set-value-ref-${option.key}`} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                    {!runtimePayloadReferenceOptions.some((option) => option.key === runtimeValueReference) ? (
                      <option value={runtimeValueReference}>{runtimeValueReference}</option>
                    ) : null}
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateRuntimeAction(listener.id, action.id, (current) => {
                        current.config.value = "";
                      })
                    }
                    className={actionButtonClass("secondary")}
                  >
                    Use static value
                  </button>
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  <input
                    value={String(action.config.value ?? "")}
                    onChange={(event) =>
                      onUpdateRuntimeAction(listener.id, action.id, (current) => {
                        current.config.value = event.target.value;
                      })
                    }
                    className="w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                  />
                  {firstListenerPayloadReference(listener, [
                    "selectedValue",
                    "selectedValues",
                    "changedOption",
                    "optionValue",
                    "value",
                    "nextValue",
                  ]) ? (
                    <button
                      type="button"
                      onClick={() => {
                        const reference = firstListenerPayloadReference(listener, [
                          "selectedValue",
                          "selectedValues",
                          "changedOption",
                          "optionValue",
                          "value",
                          "nextValue",
                        ]);
                        if (reference) {
                          onUpdateRuntimeAction(listener.id, action.id, (current) => {
                            current.config.value = { $runtime: reference };
                          });
                        }
                      }}
                      className={actionButtonClass("secondary")}
                    >
                      Use event payload
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {action.kind === "dispatch_event" ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Event type to dispatch</label>
              <input
                value={getRuntimeActionEventType(action)}
                onChange={(event) =>
                  onUpdateRuntimeAction(listener.id, action.id, (current) => {
                    current.config.eventType = event.target.value;
                    delete current.config.eventName;
                  })
                }
                placeholder="custom.event"
                className="mt-2 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
              />
              <SuggestionChips
                label="Suggested"
                suggestions={emittedEventSuggestions}
                onApply={(value) =>
                  onUpdateRuntimeAction(listener.id, action.id, (current) => {
                    current.config.eventType = value;
                    delete current.config.eventName;
                  })
                }
              />
              {emittedEventIssue ? <p className="mt-2 text-sm text-rose-600">{emittedEventIssue}</p> : null}
            </div>
            <label className="flex items-center gap-3 rounded-2xl border border-soft bg-white px-4 py-3">
              <input
                type="checkbox"
                checked={action.config.bubbles !== false}
                onChange={(event) =>
                  onUpdateRuntimeAction(listener.id, action.id, (current) => {
                    current.config.bubbles = event.target.checked;
                  })
                }
              />
              <span className="text-sm text-slate-700">Event bubbles to ancestor dispatchers</span>
            </label>
            <PayloadEditor
              heading="Event payload"
              description="Name the signal first, then add only the extra context the runtime or host needs to receive with it."
              keyNamespace={`${action.id}-payload`}
              addLabel="Add event field"
              emptyLabel="No payload fields yet. Add one only if the event should send more than its name."
              applySuccessMessage="Runtime payload JSON applied."
              structuredPayloadEntries={structuredPayloadEntries}
              payloadIssues={payloadIssues}
              payloadTemplates={payloadTemplates}
              editorState={getRuntimePayloadEditorState(action)}
              listenerId={listener.id}
              actionId={action.id}
              onSetEditorMode={(mode) => onSetRuntimePayloadEditorMode(action, mode)}
              onApplyRuntimePayloadTemplate={(template) =>
                onApplyRuntimePayloadTemplate(listener.id, action.id, template)
              }
              onApplyRuntimePayloadEntries={onApplyRuntimePayloadEntries}
              onUpdateRuntimePayloadEditorRaw={onUpdateRuntimePayloadEditorRaw}
              onUpdateRuntimeAction={onUpdateRuntimeAction}
              onSyncRuntimePayloadEditor={onSyncRuntimePayloadEditor}
              getCurrentPayload={() => getRuntimeActionPayload(action)}
              onSetMessage={onSetMessage}
              onSetErrorMessage={onSetErrorMessage}
            />
          </div>
        ) : null}

        {action.kind === "host_action" ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Host handler key</label>
              <input
                list={handlerKeyDatalistId}
                value={String(action.config.handlerKey ?? "")}
                onChange={(event) =>
                  onUpdateRuntimeAction(listener.id, action.id, (current) => {
                    current.config.handlerKey = event.target.value;
                  })
                }
                placeholder="host.action"
                className="mt-2 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
              />
              <datalist id={handlerKeyDatalistId}>
                {handlerKeyOptions.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.frequency > 1 ? `${opt.key} (${opt.frequency} uses)` : opt.key}
                  </option>
                ))}
              </datalist>
              <SuggestionChips
                label="Suggested"
                suggestions={hostHandlerSuggestions}
                onApply={(value) =>
                  onUpdateRuntimeAction(listener.id, action.id, (current) => {
                    current.config.handlerKey = value;
                  })
                }
              />
              {hostHandlerIssue ? <p className="mt-2 text-sm text-rose-600">{hostHandlerIssue}</p> : null}
            </div>
            <PayloadEditor
              heading="Request payload"
              description="Point this action at the host handler first, then add only the request fields the host actually expects."
              keyNamespace={`${action.id}-host-payload`}
              addLabel="Add request field"
              emptyLabel="No request fields yet. Add them only if the host action needs context beyond the handler key."
              applySuccessMessage="Host action payload JSON applied."
              structuredPayloadEntries={structuredPayloadEntries}
              payloadIssues={payloadIssues}
              payloadTemplates={payloadTemplates}
              editorState={getRuntimePayloadEditorState(action)}
              listenerId={listener.id}
              actionId={action.id}
              onSetEditorMode={(mode) => onSetRuntimePayloadEditorMode(action, mode)}
              onApplyRuntimePayloadTemplate={(template) =>
                onApplyRuntimePayloadTemplate(listener.id, action.id, template)
              }
              onApplyRuntimePayloadEntries={onApplyRuntimePayloadEntries}
              onUpdateRuntimePayloadEditorRaw={onUpdateRuntimePayloadEditorRaw}
              onUpdateRuntimeAction={onUpdateRuntimeAction}
              onSyncRuntimePayloadEditor={onSyncRuntimePayloadEditor}
              getCurrentPayload={() => getRuntimeActionPayload(action)}
              onSetMessage={onSetMessage}
              onSetErrorMessage={onSetErrorMessage}
            />
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
            {(() => {
              const nodeCandidates = candidatesFilteredByActionKind(action.kind, runtimeEventSourceCandidates);
              return nodeCandidates.length > 0 ? (
                <div className="mt-2">
                  <SourcePicker
                    candidates={nodeCandidates}
                    selectedId={action.config.nodeId ? String(action.config.nodeId) : null}
                    onSelect={(id) =>
                      onUpdateRuntimeAction(listener.id, action.id, (current) => {
                        current.config.nodeId = id;
                      })
                    }
                    placeholder="Search nodes..."
                  />
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No nodes available in this form.</p>
              );
            })()}
          </div>
        ) : null}

        {/* Phase 3: wait config — fixed_ms duration or until_event */}
        {action.kind === "wait" ? (
          <div className="grid gap-3 rounded-md border border-slate-200 bg-white px-3 py-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Mode
                <select
                  value={String(action.config.mode ?? "fixed_ms")}
                  onChange={(event) =>
                    onUpdateRuntimeAction(listener.id, action.id, (current) => {
                      current.config.mode = event.target.value;
                    })
                  }
                  className="mt-1 w-full rounded-2xl border border-soft px-3 py-2 text-sm text-slate-800"
                >
                  <option value="fixed_ms">Fixed delay</option>
                  <option value="until_event">Until event</option>
                </select>
              </label>
              {action.config.mode === "until_event" ? (
                <>
                  <label className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Event type
                    <input
                      type="text"
                      value={String(action.config.eventType ?? "")}
                      onChange={(event) =>
                        onUpdateRuntimeAction(listener.id, action.id, (current) => {
                          current.config.eventType = event.target.value;
                        })
                      }
                      className="mt-1 w-full rounded-2xl border border-soft px-3 py-2 text-sm text-slate-800"
                    />
                  </label>
                  <label className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Timeout (ms)
                    <input
                      type="number"
                      min={0}
                      value={Number(action.config.timeoutMs ?? 0)}
                      onChange={(event) =>
                        onUpdateRuntimeAction(listener.id, action.id, (current) => {
                          current.config.timeoutMs = Number(event.target.value) || 0;
                        })
                      }
                      className="mt-1 w-full rounded-2xl border border-soft px-3 py-2 text-sm text-slate-800"
                    />
                  </label>
                </>
              ) : (
                <label className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  Duration (ms)
                  <input
                    type="number"
                    min={0}
                    value={Number(action.config.durationMs ?? 0)}
                    onChange={(event) =>
                      onUpdateRuntimeAction(listener.id, action.id, (current) => {
                        current.config.durationMs = Number(event.target.value) || 0;
                      })
                    }
                    className="mt-1 w-full rounded-2xl border border-soft px-3 py-2 text-sm text-slate-800"
                  />
                </label>
              )}
            </div>
          </div>
        ) : null}

        {/* Phase 3: host_call_await — handler key + optional correlationId + timeout */}
        {action.kind === "host_call_await" ? (
          <div className="grid gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3">
            <p className="text-[0.7rem] text-amber-900">
              Suspends the listener chain until the host dispatches{" "}
              <code className="rounded bg-amber-100 px-1 py-0.5">host.action_response</code> with a matching{" "}
              <code className="rounded bg-amber-100 px-1 py-0.5">correlationId</code>.
            </p>
            <label className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Handler key
              <input
                type="text"
                list={handlerKeyDatalistId}
                value={String(action.config.handlerKey ?? "")}
                onChange={(event) =>
                  onUpdateRuntimeAction(listener.id, action.id, (current) => {
                    current.config.handlerKey = event.target.value;
                  })
                }
                className="mt-1 w-full rounded-2xl border border-soft px-3 py-2 text-sm text-slate-800"
              />
              <datalist id={handlerKeyDatalistId}>
                {handlerKeyOptions.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.frequency > 1 ? `${opt.key} (${opt.frequency} uses)` : opt.key}
                  </option>
                ))}
              </datalist>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Correlation id (optional)
                <input
                  type="text"
                  value={String(action.config.correlationId ?? "")}
                  placeholder="auto-generated when blank"
                  onChange={(event) =>
                    onUpdateRuntimeAction(listener.id, action.id, (current) => {
                      const next = event.target.value.trim();
                      if (next) {
                        current.config.correlationId = next;
                      } else {
                        delete current.config.correlationId;
                      }
                    })
                  }
                  className="mt-1 w-full rounded-2xl border border-soft px-3 py-2 text-sm text-slate-800"
                />
              </label>
              <label className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Timeout (ms)
                <input
                  type="number"
                  min={0}
                  value={Number(action.config.timeoutMs ?? 0)}
                  onChange={(event) =>
                    onUpdateRuntimeAction(listener.id, action.id, (current) => {
                      current.config.timeoutMs = Number(event.target.value) || 0;
                    })
                  }
                  className="mt-1 w-full rounded-2xl border border-soft px-3 py-2 text-sm text-slate-800"
                />
              </label>
            </div>
          </div>
        ) : null}

        {/* Phase 3 #17: branch editor — conditions, then-arm, optional else-arm, depth-aware. */}
        {action.kind === "branch" ? (
          <BranchActionCard
            action={action}
            depth={0}
            availableActionKinds={runtimeActionOptions}
            onUpdate={(mutate) =>
              onUpdateRuntimeAction(listener.id, action.id, (current) => {
                if (typeof current.config !== "object" || current.config === null) {
                  current.config = {};
                }
                mutate(current.config as Record<string, unknown>);
              })
            }
          />
        ) : null}

        {/* Phase 3: per-action error policy. Applies to every kind. */}
        <div>
          <label className="text-xs uppercase tracking-[0.18em] text-slate-500">
            On error
            <select
              value={String(action.onError ?? (action.continueOnError ? "continue" : "halt_and_raise"))}
              onChange={(event) =>
                onUpdateRuntimeAction(listener.id, action.id, (current) => {
                  current.onError = event.target.value as "continue" | "halt" | "halt_and_raise";
                  // Keep continueOnError in sync for backwards compat: only the new field drives the engine,
                  // but old consumers might still inspect it.
                  current.continueOnError = current.onError === "continue";
                })
              }
              className="mt-2 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
            >
              <option value="halt_and_raise">Halt and emit runtime.action_error (default)</option>
              <option value="halt">Halt the chain silently</option>
              <option value="continue">Continue past errors</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onInsertRuntimeActionAfter(listener.id, action.id)}
            className={actionButtonClass()}
          >
            Insert dispatch after
          </button>
          <button
            type="button"
            onClick={() => onInsertRuntimeActionAfter(listener.id, action.id, "host_action")}
            className={actionButtonClass("secondary")}
          >
            Insert host action
          </button>
        </div>
      </div>
    </div>
  );
}
