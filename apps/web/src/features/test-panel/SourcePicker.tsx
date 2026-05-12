/**
 * SourcePicker — hybrid combobox (tree + flat + breadcrumb chips) used to select a
 * runtime event source (or any other hierarchical target).
 *
 * Hotkey policy: this component does NOT register any global hotkey listeners. The
 * picker is reused across multiple contexts (source picker, action-target picker,
 * etc.) and multiple instances would conflict if they each bound a global key. The
 * consumer is responsible for any global hotkey such as Cmd/Ctrl+K. To pair such a
 * hotkey with the picker, pass `autoFocus` and trigger the consumer's open/focus
 * logic from the hotkey handler — the input will focus on mount.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";

import type { RuntimeEventSourceCandidate } from "../behavior/utils/runtime-helpers";

import { ancestorIds, buildSourcePickerTree, flatRank } from "./source-picker-logic";
import type { FlatRankResult } from "./source-picker-logic";
import type { SourcePickerTree } from "./types";

export interface SourcePickerProps {
  candidates: RuntimeEventSourceCandidate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  placeholder?: string;
  /** When true, focuses the input on mount. Pair with a consumer-owned hotkey. */
  autoFocus?: boolean;
}

export function SourcePicker({
  candidates,
  selectedId,
  onSelect,
  placeholder,
  autoFocus = false,
}: SourcePickerProps): ReactElement {
  const popoverId = useId();
  const tree = useMemo(() => buildSourcePickerTree(candidates), [candidates]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const blurTimeoutRef = useRef<number | null>(null);
  const wasOpenRef = useRef(false);

  // Optional auto-focus on mount when caller opts in.
  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
    // Run only on mount: the prop is treated as an initial directive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-expand ancestors of the current selection whenever the picker opens.
  useEffect(() => {
    if (open && selectedId) {
      const chain = ancestorIds(tree, selectedId);
      setExpandedIds((prev) => {
        const next = new Set(prev);
        for (const id of chain) next.add(id);
        return next;
      });
    }
  }, [open, selectedId, tree]);

  const flatRows = useMemo(() => buildFlatRows(tree, expandedIds), [tree, expandedIds]);
  const ranked = useMemo<FlatRankResult[]>(() => (query.trim() ? flatRank(tree, query) : []), [tree, query]);
  const isSearching = query.trim().length > 0;

  // Visible rows = either ranked flat results, or the visible (expanded) subset of the tree.
  const visibleIds = useMemo(
    () => (isSearching ? ranked.map((entry) => entry.node.id) : flatRows.map((row) => row.id)),
    [flatRows, isSearching, ranked],
  );

  // On open: snap activeIndex to the persisted selection (or 0). On subsequent
  // visibleIds churn while open (typing during search), snap to top (0).
  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;

    if (!open) {
      setActiveIndex(0);
      return;
    }
    if (!wasOpen) {
      // Just opened: prefer the persisted selection's index, else 0.
      if (selectedId && visibleIds.length > 0) {
        const idx = visibleIds.indexOf(selectedId);
        setActiveIndex(idx >= 0 ? idx : 0);
      } else {
        setActiveIndex(0);
      }
      return;
    }
    // Already open and visibleIds churned (e.g. user typed): top result.
    setActiveIndex(0);
  }, [open, selectedId, visibleIds]);

  const selectedNode = selectedId ? (tree.byId.get(selectedId) ?? null) : null;

  const commitSelection = useCallback(
    (id: string) => {
      onSelect(id);
      setOpen(false);
      setQuery("");
    },
    [onSelect],
  );

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (!open) {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          setOpen(true);
          event.preventDefault();
        }
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((prev) => (visibleIds.length ? (prev + 1) % visibleIds.length : 0));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((prev) => (visibleIds.length ? (prev - 1 + visibleIds.length) % visibleIds.length : 0));
        return;
      }
      if (event.key === "Enter") {
        const id = visibleIds[activeIndex];
        if (id) {
          event.preventDefault();
          commitSelection(id);
        }
      }
    },
    [activeIndex, commitSelection, open, visibleIds],
  );

  // Click-away closes the popover (using a slight delay so click-to-select fires first).
  const handleBlur = useCallback(() => {
    if (blurTimeoutRef.current !== null) {
      window.clearTimeout(blurTimeoutRef.current);
    }
    blurTimeoutRef.current = window.setTimeout(() => {
      blurTimeoutRef.current = null;
      if (containerRef.current?.contains(document.activeElement)) return;
      setOpen(false);
    }, 150);
  }, []);

  // Clean up any pending blur timeout on unmount.
  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current !== null) {
        window.clearTimeout(blurTimeoutRef.current);
        blurTimeoutRef.current = null;
      }
    };
  }, []);

  const activeId = open && visibleIds.length > 0 ? (visibleIds[activeIndex] ?? null) : null;
  const activeRowId = activeId ? `${popoverId}-row-${activeId}` : undefined;

  return (
    <div className="relative" ref={containerRef}>
      {selectedNode ? (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {selectedNode.pathLabels.map((label, idx) => (
            <button
              key={`chip-${idx}-${label}`}
              type="button"
              onClick={() => {
                // TODO(Phase-7): scope picker to this chip's level
                setOpen(true);
                inputRef.current?.focus();
              }}
              className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 transition hover:bg-slate-300"
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? "Search or browse sources..."}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={popoverId}
        aria-activedescendant={activeRowId}
      />
      {open ? (
        <div
          id={popoverId}
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg"
        >
          {isSearching ? (
            <FlatList
              results={ranked}
              activeIndex={activeIndex}
              selectedId={selectedId}
              popoverId={popoverId}
              onHoverIndex={setActiveIndex}
              onSelect={commitSelection}
            />
          ) : (
            <TreeList
              tree={tree}
              expandedIds={expandedIds}
              onToggle={toggleExpanded}
              onSelect={commitSelection}
              selectedId={selectedId}
              activeId={activeId}
              popoverId={popoverId}
              onHover={(id) => {
                const idx = visibleIds.indexOf(id);
                if (idx >= 0) setActiveIndex(idx);
              }}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

interface FlatRow {
  id: string;
  depth: number;
}

function buildFlatRows(tree: SourcePickerTree, expandedIds: Set<string>): FlatRow[] {
  const rows: FlatRow[] = [];
  const walk = (id: string, depth: number) => {
    const node = tree.byId.get(id);
    if (!node) return;
    rows.push({ id, depth });
    if (expandedIds.has(id)) {
      for (const childId of node.childIds) walk(childId, depth + 1);
    }
  };
  for (const rootId of tree.rootIds) walk(rootId, 0);
  return rows;
}

interface TreeListProps {
  tree: SourcePickerTree;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  selectedId: string | null;
  activeId: string | null;
  popoverId: string;
  onHover: (id: string) => void;
}

function TreeList({
  tree,
  expandedIds,
  onToggle,
  onSelect,
  selectedId,
  activeId,
  popoverId,
  onHover,
}: TreeListProps): ReactElement {
  const renderNode = (id: string, depth: number): ReactElement => {
    const node = tree.byId.get(id);
    if (!node) {
      return <div key={`missing-${id}`} />;
    }
    const hasChildren = node.childIds.length > 0;
    const expanded = expandedIds.has(id);
    const isSelected = selectedId === id;
    const isActive = activeId === id;
    const rowId = `${popoverId}-row-${id}`;
    return (
      <div key={id}>
        <div
          id={rowId}
          role="treeitem"
          aria-level={depth + 1}
          aria-selected={isSelected ? true : false}
          {...(hasChildren ? { "aria-expanded": expanded } : {})}
          className={`flex items-center gap-1 px-2 py-1 text-sm ${
            isSelected ? "bg-blue-100 text-blue-900" : isActive ? "bg-slate-100" : ""
          }`}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
          onMouseEnter={() => onHover(id)}
        >
          {hasChildren ? (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onToggle(id)}
              aria-label={expanded ? "collapse" : "expand"}
              className="flex h-4 w-4 items-center justify-center text-xs text-slate-500 hover:text-slate-800"
            >
              {expanded ? "▼" : "▶"}
            </button>
          ) : (
            <span className="inline-block w-4" />
          )}
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(id)}
            className="flex-1 text-left text-slate-800"
          >
            {node.label}
          </button>
        </div>
        {expanded ? node.childIds.map((childId) => renderNode(childId, depth + 1)) : null}
      </div>
    );
  };
  return <div role="tree">{tree.rootIds.map((rootId) => renderNode(rootId, 0))}</div>;
}

interface FlatListProps {
  results: FlatRankResult[];
  activeIndex: number;
  selectedId: string | null;
  popoverId: string;
  onHoverIndex: (index: number) => void;
  onSelect: (id: string) => void;
}

function FlatList({
  results,
  activeIndex,
  selectedId,
  popoverId,
  onHoverIndex,
  onSelect,
}: FlatListProps): ReactElement {
  if (results.length === 0) {
    return <div className="px-3 py-2 text-sm text-slate-500">No matches</div>;
  }
  return (
    <ul role="listbox">
      {results.map((res, index) => {
        const breadcrumb = res.node.pathLabels.slice(0, -1).join(" › ");
        const isActive = index === activeIndex;
        const isSelected = selectedId === res.node.id;
        const rowId = `${popoverId}-row-${res.node.id}`;
        return (
          <li key={res.node.id}>
            <button
              id={rowId}
              type="button"
              role="option"
              aria-selected={isSelected ? true : false}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => onHoverIndex(index)}
              onClick={() => onSelect(res.node.id)}
              className={`block w-full px-3 py-2 text-left text-sm ${isActive ? "bg-slate-100" : "hover:bg-slate-50"}`}
            >
              <div className="font-semibold text-slate-900">{res.node.label}</div>
              {breadcrumb ? <div className="text-xs text-slate-500">{breadcrumb}</div> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
