import { formatDispatchKey, formatRuntimeSourceCandidateLabel } from "../utils/runtime-helpers";
import type { CrossItemActionStarter, RuntimeEventSourceCandidate } from "../utils/runtime-helpers";
import { actionButtonClass, formatLabel } from "../../../lib/ui-utils";

function findNearestSharedDispatcher(
  source: RuntimeEventSourceCandidate,
  target: RuntimeEventSourceCandidate,
  candidatesById: Map<string, RuntimeEventSourceCandidate>,
): RuntimeEventSourceCandidate {
  const targetPath = new Set(target.pathIds);
  const sharedId = [...source.pathIds].reverse().find((pathId) => targetPath.has(pathId));
  return (sharedId ? candidatesById.get(sharedId) : null) ?? candidatesById.get(source.pathIds[0] ?? "") ?? target;
}

export interface CrossItemEventPickerProps {
  normalizedPresetSearch: string;
  activeRuntimeTarget: RuntimeEventSourceCandidate | null;
  runtimeEventSourceCandidates: RuntimeEventSourceCandidate[];
  runtimeEventSourceCandidateById: Map<string, RuntimeEventSourceCandidate>;
  crossItemActionStartersForTarget: (
    source: RuntimeEventSourceCandidate,
    eventOption: RuntimeEventSourceCandidate["events"][number],
    dispatcher: RuntimeEventSourceCandidate,
    target: RuntimeEventSourceCandidate,
  ) => CrossItemActionStarter[];
  onCreateCrossItemBehaviorListener: (
    source: RuntimeEventSourceCandidate,
    eventOption: RuntimeEventSourceCandidate["events"][number],
    starter: CrossItemActionStarter | null,
  ) => void;
}

export function CrossItemEventPicker({
  normalizedPresetSearch,
  activeRuntimeTarget,
  runtimeEventSourceCandidates,
  runtimeEventSourceCandidateById,
  crossItemActionStartersForTarget,
  onCreateCrossItemBehaviorListener,
}: CrossItemEventPickerProps) {
  if (!activeRuntimeTarget) {
    return (
      <div className="app-muted-card p-3 text-sm text-slate-500">
        Select the item that should react before choosing another event source.
      </div>
    );
  }

  const targetStepId = activeRuntimeTarget.pathIds[1] ?? "";
  const targetSectionId = activeRuntimeTarget.pathIds[2] ?? "";
  const sourceOrderById = new Map(runtimeEventSourceCandidates.map((candidate, index) => [candidate.id, index]));
  const targetOrder = sourceOrderById.get(activeRuntimeTarget.id) ?? 0;
  const filteredSources = runtimeEventSourceCandidates
    .filter(
      (candidate) => candidate.id !== activeRuntimeTarget.id && !activeRuntimeTarget.pathIds.includes(candidate.id),
    )
    .filter((candidate) => {
      if (!normalizedPresetSearch) {
        return true;
      }
      return [
        candidate.label,
        candidate.componentLabel,
        candidate.locationLabel,
        candidate.dispatchKey ?? "",
        candidate.nodeType,
        candidate.semanticType ?? "",
        candidate.events.map((eventOption) => eventOption.type).join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedPresetSearch);
    })
    .sort((left, right) => {
      const leftSameStep = left.pathIds[1] === targetStepId ? 0 : 1;
      const rightSameStep = right.pathIds[1] === targetStepId ? 0 : 1;
      const leftSameSection = left.pathIds[2] === targetSectionId ? 0 : 1;
      const rightSameSection = right.pathIds[2] === targetSectionId ? 0 : 1;
      const leftDistance = Math.abs((sourceOrderById.get(left.id) ?? 0) - targetOrder);
      const rightDistance = Math.abs((sourceOrderById.get(right.id) ?? 0) - targetOrder);
      return (
        leftSameStep - rightSameStep ||
        leftSameSection - rightSameSection ||
        leftDistance - rightDistance ||
        left.locationLabel.localeCompare(right.locationLabel) ||
        left.label.localeCompare(right.label)
      );
    });
  const sameStepSources = filteredSources.filter((source) => source.pathIds[1] === targetStepId);
  const scopedSources = normalizedPresetSearch
    ? filteredSources
    : sameStepSources.length
      ? sameStepSources
      : filteredSources;
  const visibleSources = scopedSources.slice(0, normalizedPresetSearch ? 12 : 6);
  const hiddenSourceCount = filteredSources.length - visibleSources.length;

  return (
    <div className="grid gap-2">
      <div className="rounded-[0.85rem] border border-dashed border-blue-200 bg-blue-50/70 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">React to another item</p>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          Choose the item that dispatches the event. The behavior stays with {activeRuntimeTarget.label}, but the
          runtime listens at the nearest shared dispatcher.
        </p>
        {hiddenSourceCount > 0 ? (
          <p className="mt-1 text-xs leading-5 text-blue-700">
            Showing {visibleSources.length} of {filteredSources.length} matching sources. Search by label, component
            type, or event name to narrow the full project.
          </p>
        ) : null}
      </div>
      {visibleSources.map((source) => {
        const dispatcher = findNearestSharedDispatcher(source, activeRuntimeTarget, runtimeEventSourceCandidateById);
        const eventOptions = source.events
          .filter((eventOption) => eventOption.bubbles)
          .filter(
            (eventOption) =>
              !normalizedPresetSearch ||
              eventOption.type.toLowerCase().includes(normalizedPresetSearch) ||
              eventOption.label.toLowerCase().includes(normalizedPresetSearch) ||
              source.label.toLowerCase().includes(normalizedPresetSearch) ||
              (source.dispatchKey ?? "").toLowerCase().includes(normalizedPresetSearch),
          )
          .slice(0, normalizedPresetSearch ? 6 : 4);

        return (
          <div key={`cross-source-${source.id}`} className="rounded-[0.95rem] border border-blue-100 bg-white p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-950">{source.label}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  {source.componentLabel} · {source.locationLabel} · {formatDispatchKey(source.dispatchKey)}
                </p>
              </div>
              <span className="app-pill shrink-0">Listen at {dispatcher.componentLabel}</span>
            </div>
            {eventOptions.length ? (
              <div className="mt-3 grid gap-2">
                {eventOptions.map((eventOption) => {
                  const actionStarters = crossItemActionStartersForTarget(
                    source,
                    eventOption,
                    dispatcher,
                    activeRuntimeTarget,
                  ).slice(0, 4);
                  return (
                    <div
                      key={`cross-source-${source.id}-${eventOption.type}`}
                      className="rounded-[0.8rem] border border-soft bg-slate-50 px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">When {formatLabel(eventOption.type)}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {source.label} dispatches `{eventOption.type}`; {activeRuntimeTarget.label} reacts.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onCreateCrossItemBehaviorListener(source, eventOption, null)}
                          className={actionButtonClass("secondary")}
                        >
                          Listener only
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {actionStarters.map((starter) => (
                          <button
                            key={`cross-source-${source.id}-${eventOption.type}-${starter.id}`}
                            type="button"
                            onClick={() => onCreateCrossItemBehaviorListener(source, eventOption, starter)}
                            className={actionButtonClass(starter.id === "require-target" ? "primary" : "secondary")}
                            title={starter.description}
                          >
                            {starter.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="app-muted-card mt-3 p-3 text-sm text-slate-500">
                No bubbling events are available for this source. Use Advanced when you need strict dispatcher wiring
                for non-bubbling events.
              </div>
            )}
          </div>
        );
      })}
      {!filteredSources.length ? (
        <div className="app-muted-card p-3 text-sm text-slate-500">
          No matching event sources. Try a field label, component type, or event name.
        </div>
      ) : null}
    </div>
  );
}
