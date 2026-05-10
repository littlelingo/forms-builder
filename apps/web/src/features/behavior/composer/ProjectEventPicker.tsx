import { useMemo, useState } from "react";

import type { RuntimeEventTypeDefinition } from "@form-builder/schema";

import { actionButtonClass } from "../../../lib/ui-utils";

export interface ProjectEventPickerEntry {
  /** Stable ID of the event definition. */
  id: string;
  /** Event type string (e.g. "form.submitted"). */
  type: string;
  /** Optional human label. */
  label?: string | null;
  description?: string | null;
  scope: "project" | "form" | "node";
  /** Source form id when scope === "form" or "node". */
  formId?: string | null;
  /** Source form title for display. */
  formTitle?: string | null;
}

export interface ProjectEventPickerProps {
  /** When false, the picker renders nothing — caller controls visibility. */
  open: boolean;
  /** All known project-scope events. */
  projectEvents: RuntimeEventTypeDefinition[];
  /** Optional cross-form catalog so authors can see events from other forms in the same project. */
  crossFormEntries?: ProjectEventPickerEntry[];
  /** Optional pre-selected event id. */
  selectedEventId?: string | null;
  /** Called with the picked entry when the author confirms. */
  onPick: (entry: ProjectEventPickerEntry) => void;
  /** Called when the picker should close without selection. */
  onCancel: () => void;
  /**
   * Optional "create new project event" affordance. When provided, the picker shows a
   * "+ New project event" button; the caller is responsible for the create flow.
   */
  onRequestCreate?: () => void;
}

function buildProjectEntries(projectEvents: RuntimeEventTypeDefinition[]): ProjectEventPickerEntry[] {
  return projectEvents
    .map((def) => ({
      id: def.id,
      type: def.type ?? def.name ?? "",
      label: def.name ?? def.type ?? null,
      description: def.description ?? null,
      scope: "project" as const,
    }))
    .filter((entry) => entry.type.length > 0);
}

export function ProjectEventPicker({
  open,
  projectEvents,
  crossFormEntries = [],
  selectedEventId = null,
  onPick,
  onCancel,
  onRequestCreate,
}: ProjectEventPickerProps) {
  const [query, setQuery] = useState("");

  const entries: ProjectEventPickerEntry[] = useMemo(() => {
    return [...buildProjectEntries(projectEvents), ...crossFormEntries].sort((left, right) => {
      if (left.scope !== right.scope) return left.scope === "project" ? -1 : 1;
      return left.type.localeCompare(right.type);
    });
  }, [projectEvents, crossFormEntries]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((entry) =>
      [entry.type, entry.label ?? "", entry.description ?? "", entry.formTitle ?? ""].some((field) =>
        field.toLowerCase().includes(needle),
      ),
    );
  }, [entries, query]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pick a project-scope event"
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4"
    >
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-soft bg-white shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Project event picker</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-950">Pick an event</h3>
            <p className="mt-1 text-sm text-slate-600">
              Choose a project-scope event, or browse events defined elsewhere in this project.
            </p>
          </div>
          <button type="button" onClick={onCancel} className={actionButtonClass("secondary")}>
            Close
          </button>
        </header>

        <div className="border-b border-slate-200 px-5 py-3">
          <label
            className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"
            htmlFor="project-event-picker-search"
          >
            Search
          </label>
          <input
            id="project-event-picker-search"
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by type, label, description, or form"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {filtered.length === 0 ? (
            <div className="rounded-md bg-slate-50 px-3 py-6 text-center text-sm text-slate-600">
              No events match.{" "}
              {onRequestCreate ? (
                <button type="button" onClick={onRequestCreate} className="text-blue-600 underline">
                  Create a new project event
                </button>
              ) : (
                <span>Try a different search.</span>
              )}
            </div>
          ) : (
            <ul className="space-y-2">
              {filtered.map((entry) => {
                const isSelected = entry.id === selectedEventId;
                return (
                  <li key={`${entry.scope}-${entry.id}`}>
                    <button
                      type="button"
                      onClick={() => onPick(entry)}
                      className={`flex w-full flex-col items-start gap-1 rounded-md border px-3 py-2 text-left text-sm hover:border-blue-300 hover:bg-blue-50 ${isSelected ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white"}`}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase ${entry.scope === "project" ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-700"}`}
                        >
                          {entry.scope}
                        </span>
                        <span className="font-semibold text-slate-900">{entry.label ?? entry.type}</span>
                        <span className="text-xs text-slate-500">{entry.type}</span>
                      </span>
                      {entry.description ? <span className="text-xs text-slate-600">{entry.description}</span> : null}
                      {entry.formTitle ? (
                        <span className="text-xs text-slate-500">Defined in: {entry.formTitle}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {onRequestCreate ? (
          <footer className="flex items-center justify-end border-t border-slate-200 px-5 py-3">
            <button type="button" onClick={onRequestCreate} className={actionButtonClass("secondary")}>
              + New project event
            </button>
          </footer>
        ) : null}
      </div>
    </div>
  );
}
