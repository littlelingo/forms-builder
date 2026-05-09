import type { AuthoringField, RuntimePayloadField } from "@form-builder/schema";
import { runtimeCoreEventType } from "@form-builder/schema";
import {
  isAutomaticRuntimePayloadField,
  mergeRuntimePayloadFieldsWithStandardFields,
  runtimeEventDefinitionType,
  runtimeNodeTypeLabel,
  runtimePayloadFieldsForEventType,
} from "../utils/runtime-helpers";
import type { RuntimeEditorScope, RuntimeSourceEventOption } from "../utils/runtime-helpers";
import type { AuthoringSelection } from "../../../lib/authoring-utils";

function actionButtonClass(kind: "primary" | "secondary" | "danger" = "secondary"): string {
  if (kind === "primary") {
    return "inline-flex h-9 items-center justify-center rounded-md border border-blue-600 bg-blue-600 px-3.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:pointer-events-none disabled:opacity-50";
  }
  if (kind === "danger") {
    return "inline-flex h-9 items-center justify-center rounded-md border border-rose-200 bg-white px-3.5 text-sm font-medium text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:pointer-events-none disabled:opacity-50";
  }
  return "inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 disabled:pointer-events-none disabled:opacity-50";
}

function formatLabel(value: string | undefined | null): string {
  if (!value) {
    return "Unknown";
  }
  return value.replaceAll("_", " ");
}

export interface EventCreationFormProps {
  activeRuntimeScope: RuntimeEditorScope | null;
  activeBuilderField: AuthoringField | null;
  selectedAuthoring: AuthoringSelection | null;
  behaviorEventType: string;
  behaviorEventPayloadFields: RuntimePayloadField[];
  behaviorEventBubbles: boolean;
  behaviorEventDescription: string;
  behaviorEventAdvancedOpen: boolean;
  behaviorEventMetadataExample: string;
  editingBehaviorEventId: string | null;
  behaviorStudioMode: string;
  runtimeEventOptionsForScope: (scope: RuntimeEditorScope, field: AuthoringField | null) => RuntimeSourceEventOption[];
  runtimeScopeIdentifierBase: (scope: RuntimeEditorScope | null, field: AuthoringField | null) => string;
  defaultBehaviorTriggerName: () => string;
  onSetBehaviorEventType: (type: string) => void;
  onSetBehaviorEventBubbles: (bubbles: boolean) => void;
  onSetBehaviorEventDescription: (description: string) => void;
  onSetBehaviorEventPayloadFields: (
    fields: RuntimePayloadField[] | ((current: RuntimePayloadField[]) => RuntimePayloadField[]),
  ) => void;
  onSetBehaviorEventMetadataExample: (example: string) => void;
  onSetBehaviorCreationPath: (path: "choice" | "event" | "listener") => void;
  onSetBehaviorStudioCreating: (creating: boolean) => void;
  onSetEditingBehaviorEventId: (id: string | null) => void;
  onSetBehaviorEventAdvancedOpen: (open: boolean) => void;
  onSetErrorMessage: (message: string) => void;
  onBeginBehaviorEventCreationPath: () => void;
  onAddRuntimeEventSourceToScope: (params: {
    eventId: string | null;
    eventType: string;
    bubbles: boolean;
    payloadFields: RuntimePayloadField[];
    payloadExample: Record<string, unknown>;
    description: string;
  }) => void;
  onOpenRuntimeEventEditorForSelection: (selection: AuthoringSelection | null, eventId: string) => void;
}

export function EventCreationForm({
  activeRuntimeScope,
  activeBuilderField,
  selectedAuthoring,
  behaviorEventType,
  behaviorEventPayloadFields,
  behaviorEventBubbles,
  behaviorEventDescription,
  behaviorEventAdvancedOpen,
  behaviorEventMetadataExample,
  editingBehaviorEventId,
  behaviorStudioMode,
  runtimeEventOptionsForScope,
  runtimeScopeIdentifierBase,
  defaultBehaviorTriggerName,
  onSetBehaviorEventType,
  onSetBehaviorEventBubbles,
  onSetBehaviorEventDescription,
  onSetBehaviorEventPayloadFields,
  onSetBehaviorEventMetadataExample,
  onSetBehaviorCreationPath,
  onSetBehaviorStudioCreating,
  onSetEditingBehaviorEventId,
  onSetBehaviorEventAdvancedOpen,
  onSetErrorMessage,
  onBeginBehaviorEventCreationPath,
  onAddRuntimeEventSourceToScope,
  onOpenRuntimeEventEditorForSelection,
}: EventCreationFormProps) {
  if (!activeRuntimeScope) {
    return (
      <div className="app-muted-card mt-3 p-4 text-sm text-slate-500">
        Select a form, button, or interactive field before adding an event.
      </div>
    );
  }

  const eventOptions = runtimeEventOptionsForScope(activeRuntimeScope, activeBuilderField);
  const effectiveEventType = behaviorEventType || eventOptions[0]?.type || defaultBehaviorTriggerName();
  const selectedCoreEvent = runtimeCoreEventType(effectiveEventType);
  const payloadFields = behaviorEventPayloadFields.length
    ? mergeRuntimePayloadFieldsWithStandardFields(behaviorEventPayloadFields)
    : runtimePayloadFieldsForEventType(effectiveEventType);
  const editablePayloadFieldEntries = payloadFields
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => !isAutomaticRuntimePayloadField(field.name));
  const automaticPayloadFieldCount = payloadFields.length - editablePayloadFieldEntries.length;
  const existingEvents = activeRuntimeScope.eventSources;
  const existingEventTypes = new Set(existingEvents.map(runtimeEventDefinitionType));
  const nextUnsavedEventOption = eventOptions.find((option) => !existingEventTypes.has(option.type)) ?? null;

  const beginAdditionalEvent = () => {
    if (nextUnsavedEventOption) {
      onBeginBehaviorEventCreationPath();
      return;
    }
    const customEventType = `${runtimeScopeIdentifierBase(activeRuntimeScope, activeBuilderField)}.event`;
    onSetBehaviorCreationPath("event");
    onSetBehaviorStudioCreating(true);
    onSetEditingBehaviorEventId(null);
    onSetBehaviorEventType(customEventType);
    onSetBehaviorEventBubbles(true);
    onSetBehaviorEventDescription("");
    onSetBehaviorEventPayloadFields(runtimePayloadFieldsForEventType(customEventType));
    onSetBehaviorEventMetadataExample("{}");
    onSetBehaviorEventAdvancedOpen(true);
  };

  const metadataExamplePayload = (): Record<string, unknown> | null => {
    if (!payloadFields.some((field) => field.name === "metadata")) {
      return {};
    }
    const metadata = behaviorEventMetadataExample.trim() || "{}";
    try {
      JSON.parse(metadata);
    } catch (error) {
      onSetErrorMessage(`Metadata JSON must be valid JSON text${error instanceof Error ? `: ${error.message}` : "."}`);
      return null;
    }
    return { metadata };
  };

  const updatePayloadField = (index: number, mutate: (field: RuntimePayloadField) => RuntimePayloadField) => {
    onSetBehaviorEventPayloadFields((current) =>
      (current.length ? current : payloadFields).map((field, fieldIndex) =>
        fieldIndex === index ? mutate({ ...field }) : field,
      ),
    );
  };

  return (
    <div className="relative z-10 mt-3 rounded-[0.9rem] border border-blue-100 bg-white/85 p-3">
      <div className="grid gap-3 md:grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)]">
        <div>
          <label
            htmlFor="behavior-event-type"
            className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-slate-500"
          >
            Event
          </label>
          <select
            id="behavior-event-type"
            value={eventOptions.some((option) => option.type === effectiveEventType) ? effectiveEventType : ""}
            onChange={(event) => {
              const nextType = event.target.value;
              const nextCore = runtimeCoreEventType(nextType);
              onSetBehaviorEventType(nextType);
              onSetBehaviorEventBubbles(nextCore?.bubbles ?? true);
              onSetBehaviorEventDescription(nextCore?.description ?? "");
              onSetBehaviorEventPayloadFields(runtimePayloadFieldsForEventType(nextType));
              onSetBehaviorEventMetadataExample("{}");
            }}
            className="mt-1 w-full rounded-[0.8rem] border border-soft bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          >
            {eventOptions.map((option) => (
              <option key={`behavior-event-option-${option.type}`} value={option.type}>
                {existingEventTypes.has(option.type) ? "Saved" : "Available"} · {option.label}
              </option>
            ))}
            {!eventOptions.some((option) => option.type === effectiveEventType) ? (
              <option value="">{effectiveEventType || "Custom event"}</option>
            ) : null}
          </select>
        </div>
        <div className="rounded-[0.8rem] border border-soft bg-slate-50 px-3 py-2">
          <p className="text-xs font-semibold text-slate-900">{formatLabel(effectiveEventType)}</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {selectedCoreEvent?.description ??
              `${runtimeNodeTypeLabel(activeRuntimeScope.scopeKind)} event on ${activeRuntimeScope.label}.`}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="app-pill">Dispatcher {runtimeNodeTypeLabel(activeRuntimeScope.scopeKind)}</span>
            <span className="app-pill">{behaviorEventBubbles ? "Bubbles" : "Target only"}</span>
            <span className="app-pill">{editablePayloadFieldEntries.length} editable payload fields</span>
            {automaticPayloadFieldCount ? (
              <span className="app-pill">{automaticPayloadFieldCount} runtime fields automatic</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-[0.9rem] border border-soft bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Payload properties
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              These properties describe what listeners can inspect. Runtime identity fields are populated automatically;
              set sample values in Test when firing the event.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              onSetBehaviorEventPayloadFields((current) => [
                ...(current.length ? current : payloadFields),
                {
                  name: `payloadField${editablePayloadFieldEntries.length + 1}`,
                  label: "Payload field",
                  valueType: "string",
                  required: false,
                  description: null,
                },
              ])
            }
            className={actionButtonClass("secondary")}
          >
            Add property
          </button>
        </div>

        <div className="mt-3 grid gap-2">
          {editablePayloadFieldEntries.map(({ field, index }) => {
            const isMetadataField = field.name === "metadata";
            const requiredInputId = `behavior-event-payload-required-${index}`;
            const metadataExampleId = `behavior-event-payload-metadata-example-${index}`;
            return (
              <div
                key={`behavior-event-payload-${index}-${field.name}`}
                className="grid gap-2 rounded-[0.8rem] border border-soft bg-slate-50 p-2 md:grid-cols-[minmax(7rem,1fr)_9rem_7rem_auto]"
              >
                <div>
                  <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Name</p>
                  {isMetadataField ? (
                    <div className="mt-1 rounded-[0.7rem] border border-soft bg-white px-3 py-2 text-sm font-semibold text-slate-900">
                      metadata
                    </div>
                  ) : (
                    <input
                      id={`behavior-event-payload-name-${index}`}
                      aria-label="Payload property name"
                      value={field.name}
                      onChange={(event) =>
                        updatePayloadField(index, (current) => ({
                          ...current,
                          name: event.target.value,
                          label: current.label || event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-[0.7rem] border border-soft bg-white px-3 py-2 text-sm text-slate-900"
                    />
                  )}
                </div>
                <div>
                  <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Type</p>
                  {isMetadataField ? (
                    <div className="mt-1 rounded-[0.7rem] border border-soft bg-white px-3 py-2 text-sm font-semibold text-slate-900">
                      JSON string
                    </div>
                  ) : (
                    <select
                      id={`behavior-event-payload-type-${index}`}
                      aria-label="Payload property type"
                      value={field.valueType}
                      onChange={(event) =>
                        updatePayloadField(index, (current) => ({
                          ...current,
                          valueType: event.target.value as RuntimePayloadField["valueType"],
                        }))
                      }
                      className="mt-1 w-full rounded-[0.7rem] border border-soft bg-white px-3 py-2 text-sm text-slate-900"
                    >
                      {["string", "number", "boolean", "object", "array", "unknown"].map((valueType) => (
                        <option key={`payload-type-${valueType}`} value={valueType}>
                          {valueType}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <label
                  htmlFor={requiredInputId}
                  className="mt-6 flex items-center gap-2 rounded-[0.7rem] border border-soft bg-white px-3 py-2 text-sm text-slate-700"
                >
                  <input
                    id={requiredInputId}
                    type="checkbox"
                    checked={field.required}
                    onChange={(event) =>
                      updatePayloadField(index, (current) => ({ ...current, required: event.target.checked }))
                    }
                  />
                  Required
                </label>
                {isMetadataField ? (
                  <span className="mt-6 inline-flex min-h-10 items-center justify-center rounded-[0.7rem] border border-soft bg-white px-3 py-2 text-sm font-semibold text-slate-500">
                    Standard
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      onSetBehaviorEventPayloadFields((current) =>
                        (current.length ? current : payloadFields).filter((_, fieldIndex) => fieldIndex !== index),
                      )
                    }
                    className={actionButtonClass("secondary")}
                  >
                    Remove
                  </button>
                )}
                <div className="md:col-span-4">
                  <label
                    htmlFor={`behavior-event-payload-description-${index}`}
                    className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-slate-500"
                  >
                    Description
                  </label>
                  <input
                    id={`behavior-event-payload-description-${index}`}
                    value={field.description ?? ""}
                    onChange={(event) =>
                      updatePayloadField(index, (current) => ({ ...current, description: event.target.value }))
                    }
                    className="mt-1 w-full rounded-[0.7rem] border border-soft bg-white px-3 py-2 text-sm text-slate-900"
                  />
                </div>
                {isMetadataField ? (
                  <div className="md:col-span-4">
                    <label
                      htmlFor={metadataExampleId}
                      className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-slate-500"
                    >
                      Metadata JSON
                    </label>
                    <textarea
                      id={metadataExampleId}
                      value={behaviorEventMetadataExample}
                      onChange={(event) => onSetBehaviorEventMetadataExample(event.target.value)}
                      rows={3}
                      className="mt-1 w-full rounded-[0.7rem] border border-soft bg-white px-3 py-2 font-mono text-xs text-slate-900"
                    />
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      This example value is used as the default metadata payload in Test.
                    </p>
                  </div>
                ) : null}
              </div>
            );
          })}
          {!editablePayloadFieldEntries.length ? (
            <div className="app-muted-card p-3 text-sm text-slate-500">
              No payload properties. Add one only when listeners or host integrations need event data.
            </div>
          ) : null}
        </div>
      </div>

      <details
        className="mt-3 rounded-[0.85rem] border border-soft bg-slate-50 px-3 py-2"
        open={behaviorEventAdvancedOpen}
        onToggle={(event) => onSetBehaviorEventAdvancedOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">Advanced event options</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <label
              htmlFor="behavior-event-custom-type"
              className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-slate-500"
            >
              Event type
            </label>
            <input
              id="behavior-event-custom-type"
              value={effectiveEventType}
              onChange={(event) => {
                onSetBehaviorEventType(event.target.value);
                onSetBehaviorEventPayloadFields(runtimePayloadFieldsForEventType(event.target.value));
                onSetBehaviorEventMetadataExample("{}");
              }}
              className="mt-1 w-full rounded-[0.75rem] border border-soft bg-white px-3 py-2 text-sm text-slate-900"
            />
          </div>
          <label className="mt-6 flex items-center gap-2 rounded-[0.75rem] border border-soft bg-white px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={behaviorEventBubbles}
              onChange={(event) => onSetBehaviorEventBubbles(event.target.checked)}
            />
            Event bubbles through parent dispatchers
          </label>
          <div className="md:col-span-2">
            <label
              htmlFor="behavior-event-description"
              className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-slate-500"
            >
              Description
            </label>
            <textarea
              id="behavior-event-description"
              value={behaviorEventDescription}
              onChange={(event) => onSetBehaviorEventDescription(event.target.value)}
              rows={2}
              className="mt-1 w-full rounded-[0.75rem] border border-soft bg-white px-3 py-2 text-sm text-slate-900"
            />
          </div>
        </div>
      </details>

      {existingEvents.length ? (
        <div className="mt-3 rounded-[0.85rem] border border-soft bg-slate-50 px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Saved events</p>
            <button type="button" onClick={beginAdditionalEvent} className={actionButtonClass()}>
              Add another event
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {existingEvents.map((eventDefinition) => (
              <button
                key={eventDefinition.id}
                type="button"
                onClick={() => onOpenRuntimeEventEditorForSelection(selectedAuthoring, eventDefinition.id)}
                className="app-pill transition hover:border-blue-300 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              >
                {runtimeEventDefinitionType(eventDefinition)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {behaviorStudioMode === "create" ? (
          <button
            type="button"
            onClick={() => onSetBehaviorCreationPath("choice")}
            className={actionButtonClass("secondary")}
          >
            Back
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            const payloadExample = metadataExamplePayload();
            if (!payloadExample) {
              return;
            }
            onAddRuntimeEventSourceToScope({
              eventId: editingBehaviorEventId,
              eventType: effectiveEventType,
              bubbles: behaviorEventBubbles,
              payloadFields,
              payloadExample,
              description: behaviorEventDescription,
            });
          }}
          className={actionButtonClass("primary")}
        >
          {editingBehaviorEventId ? "Save event" : "Apply event"}
        </button>
      </div>
    </div>
  );
}
