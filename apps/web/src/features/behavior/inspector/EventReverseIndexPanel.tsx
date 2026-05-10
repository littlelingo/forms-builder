import { useMemo, useState } from "react";

import type { EventReverseIndexEntry } from "./reverse-index-helpers";

export interface EventReverseIndexPanelProps {
  entries: EventReverseIndexEntry[];
  /** Optional pre-expanded event type. */
  defaultOpenEventType?: string | null;
  /** Called when the user wants the manager view, by-event layout, filtered to this event type. */
  onOpenInManager?: (eventType: string) => void;
  /** Called when the user selects a listener row to focus it. */
  onSelectListener?: (listenerId: string) => void;
}

export function EventReverseIndexPanel({
  entries,
  defaultOpenEventType,
  onOpenInManager,
  onSelectListener,
}: EventReverseIndexPanelProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    defaultOpenEventType ? { [defaultOpenEventType]: true } : {},
  );

  const sortedEntries = useMemo(
    () =>
      [...entries].sort((left, right) => {
        const leftCount = left.raisedBy.length + left.consumedBy.length;
        const rightCount = right.raisedBy.length + right.consumedBy.length;
        if (rightCount !== leftCount) return rightCount - leftCount;
        return left.eventType.localeCompare(right.eventType);
      }),
    [entries],
  );

  if (sortedEntries.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
      <header className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">Events touching this scope</h4>
        <span className="text-xs text-slate-500">
          {sortedEntries.length} event{sortedEntries.length === 1 ? "" : "s"}
        </span>
      </header>
      <ul className="space-y-2">
        {sortedEntries.map((entry) => {
          const isOpen = expanded[entry.eventType] ?? false;
          return (
            <li key={entry.eventType} className="rounded-md border border-slate-200 bg-white">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
                aria-expanded={isOpen}
                aria-controls={`reverse-index-body-${entry.eventType}`}
                onClick={() => setExpanded((prev) => ({ ...prev, [entry.eventType]: !isOpen }))}
              >
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold text-slate-900">{entry.eventType}</span>
                  <span className="text-xs text-slate-500">
                    {entry.scopeLabel} · Raised by {entry.raisedBy.length} · Consumed by {entry.consumedBy.length}
                  </span>
                </span>
                <span className="text-xs text-slate-400" aria-hidden="true">
                  {isOpen ? "−" : "+"}
                </span>
              </button>
              {isOpen ? (
                <div
                  id={`reverse-index-body-${entry.eventType}`}
                  className="grid gap-3 border-t border-slate-100 px-3 py-3 sm:grid-cols-2"
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Raised by ({entry.raisedBy.length})
                    </p>
                    {entry.raisedBy.length === 0 ? (
                      <p className="mt-1 text-xs text-slate-500">No raisers in this document.</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {entry.raisedBy.map((row) => (
                          <li key={row.key} className="rounded-sm bg-slate-50 px-2 py-1 text-xs text-slate-700">
                            <span
                              className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase ${row.kind === "event_source" ? "bg-sky-100 text-sky-800" : "bg-emerald-100 text-emerald-800"}`}
                            >
                              {row.kind === "event_source" ? "source" : "dispatch"}
                            </span>
                            <span className="ml-1 font-medium text-slate-900">{row.ownerLabel}</span>
                            <span className="ml-1 text-slate-500">{row.detail}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Consumed by ({entry.consumedBy.length})
                    </p>
                    {entry.consumedBy.length === 0 ? (
                      <p className="mt-1 text-xs text-slate-500">No listeners match this event.</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {entry.consumedBy.map((row) => (
                          <li key={row.key} className="rounded-sm bg-slate-50 px-2 py-1 text-xs text-slate-700">
                            <button
                              type="button"
                              className="text-left"
                              onClick={() => onSelectListener?.(row.listenerId)}
                              disabled={!onSelectListener}
                            >
                              <span
                                className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase ${row.enabled ? "bg-blue-100 text-blue-800" : "bg-slate-200 text-slate-600"}`}
                              >
                                {row.enabled ? "listener" : "disabled"}
                              </span>
                              <span className="ml-1 font-medium text-slate-900">{row.ownerLabel}</span>
                              <span className="ml-1 text-slate-500">{row.detail}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {onOpenInManager ? (
                    <div className="sm:col-span-2">
                      <button
                        type="button"
                        onClick={() => onOpenInManager(entry.eventType)}
                        className="text-xs text-blue-600 underline-offset-2 hover:underline"
                      >
                        Open in manager · by event
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
