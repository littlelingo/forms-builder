import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { BehaviorLibraryCategory, BehaviorLibraryEntry, BehaviorLibraryScope } from "@form-builder/schema";

import { actionButtonClass, iconButtonClass } from "../../../lib/ui-utils";

export interface LibraryPickerProps {
  isOpen: boolean;
  onClose: () => void;
  systemEntries: BehaviorLibraryEntry[];
  projectEntries: BehaviorLibraryEntry[];
  /** Optional: filter entries to those that bind to one of these node types */
  bindsToFilter?: string[];
  /** Called when the user picks an entry. The caller opens ApplyParametersDialog next. */
  onSelectEntry: (entry: BehaviorLibraryEntry) => void;
}

const CATEGORIES: Array<{ value: BehaviorLibraryCategory | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "validation", label: "Validation" },
  { value: "visibility", label: "Visibility" },
  { value: "host", label: "Host" },
  { value: "events", label: "Events" },
  { value: "data", label: "Data" },
  { value: "repeatables", label: "Repeatables" },
  { value: "custom", label: "Custom" },
];

const SCOPES: Array<{ value: BehaviorLibraryScope | "both"; label: string }> = [
  { value: "both", label: "Both" },
  { value: "system", label: "System" },
  { value: "project", label: "Project" },
];

const CATEGORY_ICON: Record<BehaviorLibraryCategory, string> = {
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
    // Map common icon names to simple glyphs
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

function filterEntries(
  entries: BehaviorLibraryEntry[],
  search: string,
  category: BehaviorLibraryCategory | "all",
  bindsToFilter?: string[],
): BehaviorLibraryEntry[] {
  const q = search.toLowerCase();
  return entries.filter((entry) => {
    if (q && !entry.name.toLowerCase().includes(q) && !entry.description.toLowerCase().includes(q)) {
      return false;
    }
    if (category !== "all" && entry.category !== category) {
      return false;
    }
    if (bindsToFilter && bindsToFilter.length > 0 && entry.bindsTo.length > 0) {
      if (!entry.bindsTo.some((bt) => bindsToFilter.includes(bt))) {
        return false;
      }
    }
    return true;
  });
}

export function LibraryPicker({
  isOpen,
  onClose,
  systemEntries,
  projectEntries,
  bindsToFilter,
  onSelectEntry,
}: LibraryPickerProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<BehaviorLibraryCategory | "all">("all");
  const [scope, setScope] = useState<BehaviorLibraryScope | "both">("both");
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setCategory("all");
      setScope("both");
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredSystem = scope !== "project" ? filterEntries(systemEntries, search, category, bindsToFilter) : [];
  const filteredProject = scope !== "system" ? filterEntries(projectEntries, search, category, bindsToFilter) : [];
  const totalCount = filteredSystem.length + filteredProject.length;

  const chipBase =
    "inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium transition cursor-pointer";
  const chipActive = "border-blue-600 bg-blue-600 text-white";
  const chipInactive = "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50";

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/30 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-picker-title"
        tabIndex={-1}
        className="relative flex h-[min(84dvh,42rem)] w-full max-w-[52rem] flex-col overflow-hidden rounded-[1.15rem] border border-slate-200 bg-[#f5f7fb] shadow-[0_24px_64px_rgba(15,23,42,0.24)] outline-none"
      >
        {/* Header */}
        <div className="shrink-0 border-b border-slate-200 bg-white/96 px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Behavior Library
              </p>
              <h3 id="library-picker-title" className="mt-0.5 text-lg font-semibold text-slate-950">
                Add behavior from library
              </h3>
            </div>
            <button type="button" aria-label="Close library picker" onClick={onClose} className={iconButtonClass()}>
              ×
            </button>
          </div>

          {/* Search */}
          <div className="mt-3">
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or description…"
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* Filter chips row */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {/* Category chips */}
            <div className="flex flex-wrap gap-1">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  className={`${chipBase} ${category === cat.value ? chipActive : chipInactive}`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="h-5 w-px bg-slate-200" />

            {/* Scope chips */}
            <div className="flex gap-1">
              {SCOPES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setScope(s.value)}
                  className={`${chipBase} ${scope === s.value ? chipActive : chipInactive}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Entry list */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {totalCount === 0 ? (
            <div className="flex h-full items-center justify-center py-12 text-sm text-slate-400">
              No entries match the current filters.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredSystem.length > 0 && (
                <section>
                  <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    System ({filteredSystem.length})
                  </p>
                  <ul className="space-y-1.5">
                    {filteredSystem.map((entry) => (
                      <EntryRow key={entry.id} entry={entry} onApply={onSelectEntry} />
                    ))}
                  </ul>
                </section>
              )}
              {filteredProject.length > 0 && (
                <section>
                  <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Project ({filteredProject.length})
                  </p>
                  <ul className="space-y-1.5">
                    {filteredProject.map((entry) => (
                      <EntryRow key={entry.id} entry={entry} onApply={onSelectEntry} />
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>

        {/* Footer count */}
        <div className="shrink-0 border-t border-slate-200 bg-white/80 px-4 py-2 text-xs text-slate-400">
          {totalCount} {totalCount === 1 ? "entry" : "entries"}
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface EntryRowProps {
  entry: BehaviorLibraryEntry;
  onApply: (entry: BehaviorLibraryEntry) => void;
}

function EntryRow({ entry, onApply }: EntryRowProps) {
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
      <span className="app-pill shrink-0">{entry.category}</span>
      <button type="button" onClick={() => onApply(entry)} className={actionButtonClass("primary")}>
        Apply
      </button>
    </li>
  );
}
