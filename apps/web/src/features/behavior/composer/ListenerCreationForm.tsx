import type { RuntimeListenerDefinition } from "@form-builder/schema";
import {
  createListenerGraphSelection,
  formatRuntimeSourceCandidateLabel,
  getRuntimeListenerEventType,
  runtimeEntityTypeLabel,
  runtimeEventBubblesForSource,
  runtimeEventDefinitionType,
} from "../utils/runtime-helpers";
import type {
  BehaviorGraphSelection,
  BehaviorListenerSourceType,
  BehaviorStudioMode,
  RuntimeEditorScope,
  RuntimeEventSourceCandidate,
} from "../utils/runtime-helpers";
import { actionButtonClass, formatLabel } from "../../../lib/ui-utils";

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

function findNearestSharedDispatcher(
  source: RuntimeEventSourceCandidate,
  target: RuntimeEventSourceCandidate,
  candidatesById: Map<string, RuntimeEventSourceCandidate>,
): RuntimeEventSourceCandidate {
  const targetPath = new Set(target.pathIds);
  const sharedId = [...source.pathIds].reverse().find((pathId) => targetPath.has(pathId));
  return (sharedId ? candidatesById.get(sharedId) : null) ?? candidatesById.get(source.pathIds[0] ?? "") ?? target;
}

export interface ListenerCreationFormProps {
  activeRuntimeTarget: RuntimeEventSourceCandidate | null;
  activeRuntimeScope: RuntimeEditorScope | null;
  runtimeEventSourceCandidates: RuntimeEventSourceCandidate[];
  runtimeEventSourceCandidateById: Map<string, RuntimeEventSourceCandidate>;
  behaviorListenerSourceType: BehaviorListenerSourceType;
  behaviorListenerEventType: string;
  behaviorListenerSourceId: string;
  behaviorListenerShowRawEvents: boolean;
  behaviorListenerUseCapture: boolean;
  behaviorListenerPriority: number;
  behaviorStudioMode: string;
  onSetBehaviorListenerSourceType: (type: BehaviorListenerSourceType) => void;
  onSetBehaviorListenerEventType: (type: string) => void;
  onSetBehaviorListenerSourceId: (id: string) => void;
  onSetBehaviorListenerShowRawEvents: (show: boolean) => void;
  onSetBehaviorListenerUseCapture: (capture: boolean) => void;
  onSetBehaviorListenerPriority: (priority: number) => void;
  onSetBehaviorCreationPath: (path: "choice" | "event" | "listener") => void;
  onSetSelectedBehaviorNode: (selection: BehaviorGraphSelection | null) => void;
  onSetBehaviorStudioMode: (mode: BehaviorStudioMode) => void;
  onSetBehaviorStudioCreating: (creating: boolean) => void;
  onCreateAuthoredEventBehaviorListener: (source: RuntimeEventSourceCandidate, eventType: string) => void;
}

export function ListenerCreationForm({
  activeRuntimeTarget,
  activeRuntimeScope,
  runtimeEventSourceCandidates,
  runtimeEventSourceCandidateById,
  behaviorListenerSourceType,
  behaviorListenerEventType,
  behaviorListenerSourceId,
  behaviorListenerShowRawEvents,
  behaviorListenerUseCapture,
  behaviorListenerPriority,
  behaviorStudioMode,
  onSetBehaviorListenerSourceType,
  onSetBehaviorListenerEventType,
  onSetBehaviorListenerSourceId,
  onSetBehaviorListenerShowRawEvents,
  onSetBehaviorListenerUseCapture,
  onSetBehaviorListenerPriority,
  onSetBehaviorCreationPath,
  onSetSelectedBehaviorNode,
  onSetBehaviorStudioMode,
  onSetBehaviorStudioCreating,
  onCreateAuthoredEventBehaviorListener,
}: ListenerCreationFormProps) {
  if (!activeRuntimeTarget) {
    return (
      <div className="app-muted-card mt-3 p-4 text-sm text-slate-500">
        Select the component that should listen before adding a listener.
      </div>
    );
  }

  const sourceTypeOrder: BehaviorListenerSourceType[] = ["form", "step", "section", "group", "field", "component"];
  const effectiveSourceType = behaviorListenerSourceType;
  const currentTargetListeners = activeRuntimeScope?.listeners ?? [];
  const sourceTypeCounts = new Map(
    sourceTypeOrder.map((nodeType) => [
      nodeType,
      runtimeEventSourceCandidates.filter((candidate) => candidate.nodeType === nodeType).length,
    ]),
  );
  const sourceCandidates = runtimeEventSourceCandidates.filter(
    (candidate) => candidate.nodeType === effectiveSourceType,
  );
  const authoredEventTypes = uniqueRuntimeEventTypes(
    sourceCandidates.flatMap((candidate) => candidate.eventDefinitions.map(runtimeEventDefinitionType)),
  );
  const rawEventTypes = behaviorListenerShowRawEvents
    ? uniqueRuntimeEventTypes(
        sourceCandidates.flatMap((candidate) => candidate.events.map((eventOption) => eventOption.type)),
      )
    : [];
  const eventTypes = uniqueRuntimeEventTypes([...authoredEventTypes, ...rawEventTypes]);
  const effectiveEventType =
    behaviorListenerEventType && eventTypes.includes(behaviorListenerEventType)
      ? behaviorListenerEventType
      : (eventTypes[0] ?? "");
  const sourceHasEvent = (candidate: RuntimeEventSourceCandidate) =>
    candidate.eventDefinitions.some(
      (eventDefinition) => runtimeEventDefinitionType(eventDefinition) === effectiveEventType,
    ) ||
    (behaviorListenerShowRawEvents && candidate.events.some((eventOption) => eventOption.type === effectiveEventType));
  const matchingSources = sourceCandidates.filter(sourceHasEvent);
  const effectiveSourceId =
    behaviorListenerSourceId && matchingSources.some((candidate) => candidate.id === behaviorListenerSourceId)
      ? behaviorListenerSourceId
      : (matchingSources[0]?.id ?? "");
  const selectedSource = matchingSources.find((candidate) => candidate.id === effectiveSourceId) ?? null;
  const selectedSourceBubbles = selectedSource
    ? runtimeEventBubblesForSource(selectedSource, effectiveEventType)
    : true;
  const selectedDispatcher = selectedSource
    ? selectedSource.id === activeRuntimeTarget.id
      ? selectedSource
      : findNearestSharedDispatcher(selectedSource, activeRuntimeTarget, runtimeEventSourceCandidateById)
    : null;
  const blocksCrossItemListener = Boolean(
    selectedSource && selectedSource.id !== activeRuntimeTarget.id && !selectedSourceBubbles,
  );

  return (
    <div className="relative z-10 mt-3 rounded-[0.9rem] border border-blue-100 bg-white/85 p-3">
      {currentTargetListeners.length ? (
        <div className="mb-3 rounded-[0.85rem] border border-soft bg-slate-50 px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Saved listeners</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                {currentTargetListeners.length} listener{currentTargetListeners.length === 1 ? "" : "s"} on{" "}
                {activeRuntimeTarget.label}
              </p>
            </div>
            <span className="app-pill">Target {runtimeEntityTypeLabel(activeRuntimeTarget.nodeType)}</span>
          </div>
          <div className="mt-2 grid gap-2">
            {currentTargetListeners.map((listener) => (
              <button
                key={`saved-listener-${listener.id}`}
                type="button"
                onClick={() => {
                  onSetSelectedBehaviorNode(createListenerGraphSelection(listener));
                  onSetBehaviorStudioMode("action");
                  onSetBehaviorStudioCreating(false);
                }}
                className="rounded-[0.75rem] border border-soft bg-white px-3 py-2 text-left transition hover:border-blue-300 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              >
                <span className="block text-sm font-semibold text-slate-950">
                  {listener.label ?? formatLabel(getRuntimeListenerEventType(listener))}
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-600">
                  {formatLabel(getRuntimeListenerEventType(listener))} · {listener.actions.length} action
                  {listener.actions.length === 1 ? "" : "s"}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label
            htmlFor="behavior-listener-source-type"
            className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-slate-500"
          >
            Entity type
          </label>
          <select
            id="behavior-listener-source-type"
            value={effectiveSourceType}
            onChange={(event) => {
              const nextType = event.target.value as BehaviorListenerSourceType;
              const nextCandidates = runtimeEventSourceCandidates.filter(
                (candidate) => candidate.nodeType === nextType,
              );
              const nextEvents = uniqueRuntimeEventTypes(
                nextCandidates.flatMap((candidate) => candidate.eventDefinitions.map(runtimeEventDefinitionType)),
              );
              onSetBehaviorListenerSourceType(nextType);
              onSetBehaviorListenerEventType(nextEvents[0] ?? "");
              onSetBehaviorListenerSourceId(
                nextCandidates.find((candidate) =>
                  candidate.eventDefinitions.some(
                    (eventDefinition) => runtimeEventDefinitionType(eventDefinition) === (nextEvents[0] ?? ""),
                  ),
                )?.id ?? "",
              );
            }}
            className="mt-1 w-full rounded-[0.8rem] border border-soft bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          >
            {sourceTypeOrder.map((nodeType) => (
              <option key={`listener-source-type-${nodeType}`} value={nodeType}>
                {runtimeEntityTypeLabel(nodeType)} ({sourceTypeCounts.get(nodeType) ?? 0})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="behavior-listener-event-type"
            className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-slate-500"
          >
            Event
          </label>
          <select
            id="behavior-listener-event-type"
            value={effectiveEventType}
            onChange={(event) => {
              const nextEventType = event.target.value;
              const nextSource = sourceCandidates.find((candidate) =>
                candidate.eventDefinitions.some(
                  (eventDefinition) => runtimeEventDefinitionType(eventDefinition) === nextEventType,
                ),
              );
              onSetBehaviorListenerEventType(nextEventType);
              onSetBehaviorListenerSourceId(nextSource?.id ?? "");
            }}
            disabled={!eventTypes.length}
            className="mt-1 w-full rounded-[0.8rem] border border-soft bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition disabled:opacity-55 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          >
            {eventTypes.map((eventType) => (
              <option key={`listener-event-type-${eventType}`} value={eventType}>
                {formatLabel(eventType)}
              </option>
            ))}
            {!eventTypes.length ? <option value="">No authored events</option> : null}
          </select>
        </div>
        <div>
          <label
            htmlFor="behavior-listener-source"
            className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-slate-500"
          >
            Source item
          </label>
          <select
            id="behavior-listener-source"
            value={effectiveSourceId}
            onChange={(event) => onSetBehaviorListenerSourceId(event.target.value)}
            disabled={!matchingSources.length}
            className="mt-1 w-full rounded-[0.8rem] border border-soft bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition disabled:opacity-55 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          >
            {matchingSources.map((source) => (
              <option key={`listener-source-${source.id}`} value={source.id}>
                {formatRuntimeSourceCandidateLabel(source)}
              </option>
            ))}
            {!matchingSources.length ? <option value="">No items define this event</option> : null}
          </select>
        </div>
      </div>

      <div className="mt-3 rounded-[0.85rem] border border-soft bg-slate-50 px-3 py-2">
        <p className="text-sm font-semibold text-slate-900">
          {selectedSource
            ? `${activeRuntimeTarget.label} listens for ${formatLabel(effectiveEventType)} from ${selectedSource.label}`
            : "No authored event source selected"}
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          Authored events only are shown by default. Use Advanced when you need to register against raw core events.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="app-pill">Target {runtimeEntityTypeLabel(activeRuntimeTarget.nodeType)}</span>
          {selectedDispatcher ? (
            <span className="app-pill">Listen at {runtimeEntityTypeLabel(selectedDispatcher.nodeType)}</span>
          ) : null}
          {selectedSource ? (
            <span className="app-pill">Source {runtimeEntityTypeLabel(selectedSource.nodeType)}</span>
          ) : null}
          {effectiveEventType ? <span className="app-pill">{effectiveEventType}</span> : null}
        </div>
      </div>

      {blocksCrossItemListener ? (
        <div className="app-muted-card mt-3 p-3 text-sm text-slate-500">
          This event is defined on {selectedSource?.label}, but it does not bubble. Select the same component as the
          target or use a bubbling authored event for cross-item listeners.
        </div>
      ) : null}

      {!authoredEventTypes.length && !behaviorListenerShowRawEvents ? (
        <div className="app-muted-card mt-3 p-3 text-sm text-slate-500">
          No {runtimeEntityTypeLabel(effectiveSourceType).toLowerCase()} sources have saved events yet. Add an event to
          a source item first, or open Advanced to inspect raw core events.
        </div>
      ) : null}

      <details className="mt-3 rounded-[0.85rem] border border-soft bg-slate-50 px-3 py-2">
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">Advanced listener options</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="flex items-center gap-2 rounded-[0.75rem] border border-soft bg-white px-3 py-2 text-sm text-slate-700 md:col-span-3">
            <input
              type="checkbox"
              checked={behaviorListenerShowRawEvents}
              onChange={(event) => {
                onSetBehaviorListenerShowRawEvents(event.target.checked);
                onSetBehaviorListenerEventType("");
                onSetBehaviorListenerSourceId("");
              }}
            />
            Include raw core events for this component type
          </label>
          <label className="flex items-center gap-2 rounded-[0.75rem] border border-soft bg-white px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={behaviorListenerUseCapture}
              onChange={(event) => onSetBehaviorListenerUseCapture(event.target.checked)}
            />
            Capture phase
          </label>
          <div>
            <label
              htmlFor="behavior-listener-priority"
              className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-slate-500"
            >
              Priority
            </label>
            <input
              id="behavior-listener-priority"
              type="number"
              value={behaviorListenerPriority}
              onChange={(event) => onSetBehaviorListenerPriority(Number(event.target.value) || 0)}
              className="mt-1 w-full rounded-[0.75rem] border border-soft bg-white px-3 py-2 text-sm text-slate-900"
            />
          </div>
          <div className="rounded-[0.75rem] border border-soft bg-white px-3 py-2 text-xs leading-5 text-slate-600">
            Listener context can read event target, current target, phase, and payload through runtime references.
          </div>
        </div>
      </details>

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
          disabled={!selectedSource || !effectiveEventType || blocksCrossItemListener}
          onClick={() => selectedSource && onCreateAuthoredEventBehaviorListener(selectedSource, effectiveEventType)}
          className={actionButtonClass("primary")}
        >
          Apply listener
        </button>
      </div>
    </div>
  );
}
