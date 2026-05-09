import type { AuthoringField, RuntimePayloadField } from "@form-builder/schema";
import type { AuthoringSelection } from "../../../lib/authoring-utils";
import type {
  BehaviorGraphSelection,
  BehaviorListenerSourceType,
  BehaviorStudioCreationPath,
  BehaviorStudioMode,
  RuntimeEditorScope,
  RuntimeEventSourceCandidate,
  RuntimeSourceEventOption,
} from "../utils/runtime-helpers";
import { EventCreationForm } from "../composer/EventCreationForm";
import { ListenerCreationForm } from "../composer/ListenerCreationForm";
import { actionButtonClass } from "../../../lib/ui-utils";

export interface CreationGuideProps {
  isBehaviorStudioCreating: boolean;
  behaviorCreationPath: BehaviorStudioCreationPath;
  editingBehaviorEventId: string | null;
  activeRuntimeScope: RuntimeEditorScope | null;
  activeRuntimeTarget: RuntimeEventSourceCandidate | null;
  activeBuilderField: AuthoringField | null;
  selectedAuthoring: AuthoringSelection | null;
  runtimeEventSourceCandidates: RuntimeEventSourceCandidate[];
  runtimeEventSourceCandidateById: Map<string, RuntimeEventSourceCandidate>;
  currentBehaviorSelectionSummary: () => string;
  behaviorFieldComponentLabel: (field: AuthoringField | null | undefined) => string;
  // Event creation form props
  behaviorEventType: string;
  behaviorEventPayloadFields: RuntimePayloadField[];
  behaviorEventBubbles: boolean;
  behaviorEventDescription: string;
  behaviorEventAdvancedOpen: boolean;
  behaviorEventMetadataExample: string;
  behaviorStudioMode: string;
  runtimeEventOptionsForScope: (scope: RuntimeEditorScope, field: AuthoringField | null) => RuntimeSourceEventOption[];
  runtimeScopeIdentifierBase: (scope: RuntimeEditorScope | null, field: AuthoringField | null) => string;
  defaultBehaviorTriggerName: () => string;
  // Listener creation form props
  behaviorListenerSourceType: BehaviorListenerSourceType;
  behaviorListenerEventType: string;
  behaviorListenerSourceId: string;
  behaviorListenerShowRawEvents: boolean;
  behaviorListenerUseCapture: boolean;
  behaviorListenerPriority: number;
  // Callbacks
  onFinalizeBehaviorStudioCreation: () => void;
  onBeginBehaviorEventCreationPath: () => void;
  onBeginBehaviorListenerCreationPath: () => void;
  // Event creation setters
  onSetBehaviorEventType: (type: string) => void;
  onSetBehaviorEventBubbles: (bubbles: boolean) => void;
  onSetBehaviorEventDescription: (description: string) => void;
  onSetBehaviorEventPayloadFields: (
    fields: RuntimePayloadField[] | ((current: RuntimePayloadField[]) => RuntimePayloadField[]),
  ) => void;
  onSetBehaviorEventMetadataExample: (example: string) => void;
  onSetBehaviorCreationPath: (path: BehaviorStudioCreationPath) => void;
  onSetBehaviorStudioCreating: (creating: boolean) => void;
  onSetEditingBehaviorEventId: (id: string | null) => void;
  onSetBehaviorEventAdvancedOpen: (open: boolean) => void;
  onSetErrorMessage: (message: string) => void;
  onAddRuntimeEventSourceToScope: (params: {
    eventId: string | null;
    eventType: string;
    bubbles: boolean;
    payloadFields: RuntimePayloadField[];
    payloadExample: Record<string, unknown>;
    description: string;
  }) => void;
  onOpenRuntimeEventEditorForSelection: (selection: AuthoringSelection | null, eventId: string) => void;
  // Listener creation setters
  onSetBehaviorListenerSourceType: (type: BehaviorListenerSourceType) => void;
  onSetBehaviorListenerEventType: (type: string) => void;
  onSetBehaviorListenerSourceId: (id: string) => void;
  onSetBehaviorListenerShowRawEvents: (show: boolean) => void;
  onSetBehaviorListenerUseCapture: (capture: boolean) => void;
  onSetBehaviorListenerPriority: (priority: number) => void;
  onSetSelectedBehaviorNode: (selection: BehaviorGraphSelection | null) => void;
  onSetBehaviorStudioMode: (mode: BehaviorStudioMode) => void;
  onCreateAuthoredEventBehaviorListener: (source: RuntimeEventSourceCandidate, eventType: string) => void;
}

export function CreationGuide({
  isBehaviorStudioCreating,
  behaviorCreationPath,
  editingBehaviorEventId,
  activeRuntimeScope,
  activeRuntimeTarget,
  activeBuilderField,
  selectedAuthoring,
  runtimeEventSourceCandidates,
  runtimeEventSourceCandidateById,
  currentBehaviorSelectionSummary,
  behaviorFieldComponentLabel,
  behaviorEventType,
  behaviorEventPayloadFields,
  behaviorEventBubbles,
  behaviorEventDescription,
  behaviorEventAdvancedOpen,
  behaviorEventMetadataExample,
  behaviorStudioMode,
  runtimeEventOptionsForScope,
  runtimeScopeIdentifierBase,
  defaultBehaviorTriggerName,
  behaviorListenerSourceType,
  behaviorListenerEventType,
  behaviorListenerSourceId,
  behaviorListenerShowRawEvents,
  behaviorListenerUseCapture,
  behaviorListenerPriority,
  onFinalizeBehaviorStudioCreation,
  onBeginBehaviorEventCreationPath,
  onBeginBehaviorListenerCreationPath,
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
  onAddRuntimeEventSourceToScope,
  onOpenRuntimeEventEditorForSelection,
  onSetBehaviorListenerSourceType,
  onSetBehaviorListenerEventType,
  onSetBehaviorListenerSourceId,
  onSetBehaviorListenerShowRawEvents,
  onSetBehaviorListenerUseCapture,
  onSetBehaviorListenerPriority,
  onSetSelectedBehaviorNode,
  onSetBehaviorStudioMode,
  onCreateAuthoredEventBehaviorListener,
}: CreationGuideProps) {
  if (!isBehaviorStudioCreating) {
    return null;
  }

  const renderHeader = (title: string, summary: string) => (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-blue-700">Behavior Studio</p>
        <h5 className="mt-1 text-base font-semibold text-slate-950">{title}</h5>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-700">{summary}</p>
      </div>
      <button
        type="button"
        onClick={() => onFinalizeBehaviorStudioCreation()}
        className={actionButtonClass("secondary")}
      >
        Cancel
      </button>
    </div>
  );

  return (
    <div className="rounded-[0.95rem] border border-blue-200 bg-blue-50/60 p-3">
      {behaviorCreationPath === "event"
        ? renderHeader(
            editingBehaviorEventId ? "Edit event" : "Add event",
            "Define an event this selected component can dispatch, then save its payload properties.",
          )
        : behaviorCreationPath === "listener"
          ? renderHeader(
              "Add listener",
              "Choose an authored event from another component and attach a listener to the current selection.",
            )
          : renderHeader(
              "Add behavior",
              "Start by deciding whether this component defines an event or listens for one.",
            )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="app-pill">{currentBehaviorSelectionSummary()}</span>
        {activeBuilderField ? (
          <span className="app-pill">{behaviorFieldComponentLabel(activeBuilderField)}</span>
        ) : null}
        {activeRuntimeScope ? <span className="app-pill">{activeRuntimeScope.label}</span> : null}
      </div>
      {behaviorCreationPath === "event" ? (
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
          onSetBehaviorEventType={onSetBehaviorEventType}
          onSetBehaviorEventBubbles={onSetBehaviorEventBubbles}
          onSetBehaviorEventDescription={onSetBehaviorEventDescription}
          onSetBehaviorEventPayloadFields={onSetBehaviorEventPayloadFields}
          onSetBehaviorEventMetadataExample={onSetBehaviorEventMetadataExample}
          onSetBehaviorCreationPath={onSetBehaviorCreationPath}
          onSetBehaviorStudioCreating={onSetBehaviorStudioCreating}
          onSetEditingBehaviorEventId={onSetEditingBehaviorEventId}
          onSetBehaviorEventAdvancedOpen={onSetBehaviorEventAdvancedOpen}
          onSetErrorMessage={onSetErrorMessage}
          onBeginBehaviorEventCreationPath={onBeginBehaviorEventCreationPath}
          onAddRuntimeEventSourceToScope={onAddRuntimeEventSourceToScope}
          onOpenRuntimeEventEditorForSelection={onOpenRuntimeEventEditorForSelection}
        />
      ) : behaviorCreationPath === "listener" ? (
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
          onSetBehaviorListenerSourceType={onSetBehaviorListenerSourceType}
          onSetBehaviorListenerEventType={onSetBehaviorListenerEventType}
          onSetBehaviorListenerSourceId={onSetBehaviorListenerSourceId}
          onSetBehaviorListenerShowRawEvents={onSetBehaviorListenerShowRawEvents}
          onSetBehaviorListenerUseCapture={onSetBehaviorListenerUseCapture}
          onSetBehaviorListenerPriority={onSetBehaviorListenerPriority}
          onSetBehaviorCreationPath={onSetBehaviorCreationPath}
          onSetSelectedBehaviorNode={onSetSelectedBehaviorNode}
          onSetBehaviorStudioMode={onSetBehaviorStudioMode}
          onSetBehaviorStudioCreating={onSetBehaviorStudioCreating}
          onCreateAuthoredEventBehaviorListener={onCreateAuthoredEventBehaviorListener}
        />
      ) : (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <button
            type="button"
            onClick={() => onBeginBehaviorEventCreationPath()}
            disabled={!activeRuntimeScope}
            className="rounded-[0.9rem] border border-blue-200 bg-white px-4 py-4 text-left transition hover:border-blue-400 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            <p className="text-sm font-semibold text-slate-950">Add event</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Define a dispatchable event and its payload properties for the selected component.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="app-pill">{activeRuntimeScope?.scopeKind ?? "No scope"}</span>
              <span className="app-pill">{activeRuntimeScope?.eventSources.length ?? 0} saved events</span>
            </div>
          </button>
          <button
            type="button"
            onClick={onBeginBehaviorListenerCreationPath}
            disabled={!activeRuntimeTarget}
            className="rounded-[0.9rem] border border-blue-200 bg-white px-4 py-4 text-left transition hover:border-blue-400 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            <p className="text-sm font-semibold text-slate-950">Add listener</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Listen for an event already defined on a form, step, section, group, field, or button.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="app-pill">{activeRuntimeTarget?.componentLabel ?? "No target"}</span>
              <span className="app-pill">
                {runtimeEventSourceCandidates.reduce(
                  (total, candidate) => total + candidate.eventDefinitions.length,
                  0,
                )}{" "}
                authored events
              </span>
            </div>
          </button>
          {!activeRuntimeScope ? (
            <div className="app-muted-card md:col-span-2 p-4 text-sm text-slate-500">
              Select a form, button, or field-capable item before creating event behavior.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
