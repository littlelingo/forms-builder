import type { ReactNode } from "react";
import type {
  AuthoringField,
  RuntimeActionDefinition,
  RuntimeActionKind,
  RuntimeListenerDefinition,
  RuntimePayloadMode,
} from "@form-builder/schema";
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
  RuntimeEditorScope,
  RuntimePayloadEditorState,
  RuntimePayloadEntry,
  RuntimePayloadFieldType,
  RuntimePayloadReferenceOption,
  RuntimePayloadTemplate,
} from "../utils/runtime-helpers";
import { SuggestionChips } from "./SuggestionChips";

function actionButtonClass(kind: "primary" | "secondary" | "danger" = "secondary"): string {
  if (kind === "primary") {
    return "inline-flex h-9 items-center justify-center rounded-md border border-blue-600 bg-blue-600 px-3.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:pointer-events-none disabled:opacity-50";
  }
  if (kind === "danger") {
    return "inline-flex h-9 items-center justify-center rounded-md border border-rose-200 bg-white px-3.5 text-sm font-medium text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:pointer-events-none disabled:opacity-50";
  }
  return "inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 disabled:pointer-events-none disabled:opacity-50";
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

export interface ActionEditorProps {
  listener: RuntimeListenerDefinition;
  action: RuntimeActionDefinition;
  actionIndex: number;
  options?: { highlighted?: boolean; actionCount?: number };
  activeRuntimeScope: RuntimeEditorScope | null;
  activeBuilderField: AuthoringField | null;
  builderStepOptions: Array<{ id: string; optionLabel: string }>;
  builderFieldOptions: Array<{ id: string; optionLabel: string }>;
  builderNodeOptions: Array<{ id: string; optionLabel: string }>;
  runtimePayloadReferenceOptionsForAction: RuntimePayloadReferenceOption[];
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
  builderStepOptions,
  builderFieldOptions,
  builderNodeOptions,
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
  const actionTone = options?.highlighted ? "border-blue-300 bg-blue-50/60" : "border-soft bg-white";
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
            <select
              value={String(action.config.stepId ?? "")}
              onChange={(event) =>
                onUpdateRuntimeAction(listener.id, action.id, (current) => {
                  current.config.stepId = event.target.value;
                })
              }
              className="mt-2 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
            >
              {builderStepOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.optionLabel}
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
                  onUpdateRuntimeAction(listener.id, action.id, (current) => {
                    current.config.fieldId = event.target.value;
                  })
                }
                className="mt-2 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
              >
                {builderFieldOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.optionLabel}
                  </option>
                ))}
              </select>
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
                    onClick={() => onSetRuntimePayloadEditorMode(action, "key_value")}
                    className={actionButtonClass(
                      getRuntimePayloadEditorState(action).mode === "key_value" ? "primary" : "secondary",
                    )}
                  >
                    Structured fields
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetRuntimePayloadEditorMode(action, "json")}
                    className={actionButtonClass(
                      getRuntimePayloadEditorState(action).mode === "json" ? "primary" : "secondary",
                    )}
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
                      onApplyRuntimePayloadTemplate(listener.id, action.id, template);
                      onSetMessage(`${template.label} payload template applied.`);
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
                          onApplyRuntimePayloadEntries(listener.id, action.id, nextEntries);
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
                          onApplyRuntimePayloadEntries(listener.id, action.id, nextEntries);
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
                            onApplyRuntimePayloadEntries(listener.id, action.id, nextEntries);
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
                            onApplyRuntimePayloadEntries(listener.id, action.id, nextEntries);
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
                                candidateIndex === payloadIndex
                                  ? { ...candidate, value: event.target.value }
                                  : candidate,
                              );
                              onApplyRuntimePayloadEntries(listener.id, action.id, nextEntries);
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
                            onApplyRuntimePayloadEntries(listener.id, action.id, nextEntries);
                          }}
                          placeholder={entry.type === "number" ? "0" : "plain text"}
                          className="rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const nextEntries = payloadEntries.filter(
                            (_, candidateIndex) => candidateIndex !== payloadIndex,
                          );
                          onApplyRuntimePayloadEntries(listener.id, action.id, nextEntries);
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
                      onApplyRuntimePayloadEntries(listener.id, action.id, nextEntries);
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
                    onChange={(event) => onUpdateRuntimePayloadEditorRaw(action.id, event.target.value)}
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
                          onUpdateRuntimeAction(listener.id, action.id, (current) => {
                            current.config.payload = parsed;
                          });
                          onSyncRuntimePayloadEditor(action.id, parsed);
                          onSetMessage("Runtime payload JSON applied.");
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
                      onClick={() => onSyncRuntimePayloadEditor(action.id, getRuntimeActionPayload(action))}
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
                  onUpdateRuntimeAction(listener.id, action.id, (current) => {
                    current.config.handlerKey = event.target.value;
                  })
                }
                placeholder="host.action"
                className="mt-2 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
              />
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
            <div className="rounded-[0.95rem] border border-soft bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Request payload</p>
                  <p className="mt-2 text-sm text-slate-700">
                    Point this action at the host handler first, then add only the request fields the host actually
                    expects.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onSetRuntimePayloadEditorMode(action, "key_value")}
                    className={actionButtonClass(
                      getRuntimePayloadEditorState(action).mode === "key_value" ? "primary" : "secondary",
                    )}
                  >
                    Structured fields
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetRuntimePayloadEditorMode(action, "json")}
                    className={actionButtonClass(
                      getRuntimePayloadEditorState(action).mode === "json" ? "primary" : "secondary",
                    )}
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
                      onApplyRuntimePayloadTemplate(listener.id, action.id, template);
                      onSetMessage(`${template.label} payload template applied.`);
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
                          onApplyRuntimePayloadEntries(listener.id, action.id, nextEntries);
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
                          onApplyRuntimePayloadEntries(listener.id, action.id, nextEntries);
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
                            onApplyRuntimePayloadEntries(listener.id, action.id, nextEntries);
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
                            onApplyRuntimePayloadEntries(listener.id, action.id, nextEntries);
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
                                candidateIndex === payloadIndex
                                  ? { ...candidate, value: event.target.value }
                                  : candidate,
                              );
                              onApplyRuntimePayloadEntries(listener.id, action.id, nextEntries);
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
                            onApplyRuntimePayloadEntries(listener.id, action.id, nextEntries);
                          }}
                          placeholder={entry.type === "number" ? "0" : "plain text"}
                          className="rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const nextEntries = payloadEntries.filter(
                            (_, candidateIndex) => candidateIndex !== payloadIndex,
                          );
                          onApplyRuntimePayloadEntries(listener.id, action.id, nextEntries);
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
                      onApplyRuntimePayloadEntries(listener.id, action.id, nextEntries);
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
                    onChange={(event) => onUpdateRuntimePayloadEditorRaw(action.id, event.target.value)}
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
                          onUpdateRuntimeAction(listener.id, action.id, (current) => {
                            current.config.payload = parsed;
                          });
                          onSyncRuntimePayloadEditor(action.id, parsed);
                          onSetMessage("Host action payload JSON applied.");
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
                      onClick={() => onSyncRuntimePayloadEditor(action.id, getRuntimeActionPayload(action))}
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
                onUpdateRuntimeAction(listener.id, action.id, (current) => {
                  current.config.nodeId = event.target.value;
                })
              }
              className="mt-2 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
            >
              {builderNodeOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.optionLabel}
                </option>
              ))}
            </select>
          </div>
        ) : null}

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
