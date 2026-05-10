import { createPortal } from "react-dom";

import type { BehaviorLibraryEntry } from "@form-builder/schema";

import { actionButtonClass, iconButtonClass } from "../../../lib/ui-utils";

export interface LibraryPageProps {
  isOpen: boolean;
  onClose: () => void;
  systemEntries: BehaviorLibraryEntry[];
  projectEntries: BehaviorLibraryEntry[];
  onDeleteProjectEntry: (entryId: string) => void;
}

const CATEGORY_ICON: Record<string, string> = {
  validation: "✓",
  visibility: "👁",
  host: "⚙",
  events: "⚡",
  data: "⊞",
  repeatables: "↺",
  custom: "✦",
};

function entryIcon(entry: BehaviorLibraryEntry): string {
  if (entry.icon) {
    const iconMap: Record<string, string> = {
      eye: "👁",
      check: "✓",
      fire: "⚡",
      data: "⊞",
      repeat: "↺",
      host: "⚙",
    };
    return iconMap[entry.icon] ?? CATEGORY_ICON[entry.category] ?? "◆";
  }
  return CATEGORY_ICON[entry.category] ?? "◆";
}

interface EntryRowProps {
  entry: BehaviorLibraryEntry;
  onDelete?: (entryId: string) => void;
}

function EntryRow({ entry, onDelete }: EntryRowProps) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-base"
      >
        {entryIcon(entry)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{entry.name}</p>
        <p className="truncate text-xs text-slate-500">{entry.description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="app-pill">{entry.category}</span>
        {entry.parameters.length > 0 ? (
          <span className="app-pill text-slate-500">{entry.parameters.length}p</span>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            onClick={() => onDelete(entry.id)}
            className={actionButtonClass("danger")}
            style={{ height: "1.75rem", padding: "0 0.6rem", fontSize: "0.78rem" }}
            title="Delete entry"
          >
            Delete
          </button>
        ) : null}
      </div>
    </li>
  );
}

export function LibraryPage({
  isOpen,
  onClose,
  systemEntries,
  projectEntries,
  onDeleteProjectEntry,
}: LibraryPageProps) {
  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/30 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-page-title"
        tabIndex={-1}
        className="relative flex h-[min(88dvh,48rem)] w-full max-w-[56rem] flex-col overflow-hidden rounded-[1.15rem] border border-slate-200 bg-[#f5f7fb] shadow-[0_24px_64px_rgba(15,23,42,0.24)] outline-none"
      >
        {/* Header */}
        <div className="shrink-0 border-b border-slate-200 bg-white/96 px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Library</p>
              <h3 id="library-page-title" className="mt-0.5 text-lg font-semibold text-slate-950">
                Behavior library
              </h3>
            </div>
            <button type="button" aria-label="Close library" onClick={onClose} className={iconButtonClass()}>
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-6">
          {/* System entries */}
          <section>
            <div className="mb-2 flex items-center gap-2">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                System ({systemEntries.length})
              </p>
              <span className="app-pill text-slate-400">read-only</span>
            </div>
            {systemEntries.length === 0 ? (
              <p className="text-sm text-slate-400">No system entries.</p>
            ) : (
              <ul className="space-y-1.5">
                {systemEntries.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} />
                ))}
              </ul>
            )}
          </section>

          {/* Project entries */}
          <section>
            <div className="mb-2 flex items-center gap-2">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Project ({projectEntries.length})
              </p>
            </div>
            {projectEntries.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-sm text-slate-500">
                No project entries yet. Use the <strong>☆</strong> button on any behavior row to save it to this
                library.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {projectEntries.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} onDelete={onDeleteProjectEntry} />
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-slate-200 bg-white/80 px-4 py-2 text-xs text-slate-400">
          {systemEntries.length + projectEntries.length} total entries &nbsp;·&nbsp; {systemEntries.length} system
          &nbsp;·&nbsp; {projectEntries.length} project
        </div>
      </div>
    </div>,
    document.body,
  );
}
