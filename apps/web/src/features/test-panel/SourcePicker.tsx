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
import type { ReactElement, ReactNode } from "react";

import type { RuntimeEventSourceCandidate } from "../behavior/utils/runtime-helpers";

import { ancestorIds, buildSourcePickerTree, flatRank } from "./source-picker-logic";
import type { FlatRankResult } from "./source-picker-logic";
import type { SourcePickerTree } from "./types";

/**
 * Highlight every occurrence of any token within the given text. Spans are
 * computed against the visible string itself (not a joined path) so highlights
 * land exactly on what the user sees. Overlapping ranges are merged.
 */
function highlightTokens(text: string, tokens: string[]): ReactNode {
  if (tokens.length === 0) return text;
  const lower = text.toLowerCase();
  const ranges: Array<{ start: number; end: number }> = [];
  for (const token of tokens) {
    if (!token) continue;
    let idx = lower.indexOf(token);
    while (idx !== -1) {
      ranges.push({ start: idx, end: idx + token.length });
      idx = lower.indexOf(token, idx + token.length);
    }
  }
  if (ranges.length === 0) return text;
  ranges.sort((a, b) => a.start - b.start);

  // Merge overlapping ranges
  const merged: Array<{ start: number; end: number }> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }

  const out: ReactNode[] = [];
  let cursor = 0;
  for (const range of merged) {
    if (range.start > cursor) out.push(text.slice(cursor, range.start));
    out.push(
      <mark key={`m-${range.start}`} className="bg-yellow-200">
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return <>{out}</>;
}

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
  // When non-null, the tree renders this node's children only — effectively
  // starting the tree at the scoped root. Set by clicking a breadcrumb chip.
  const [scopedRootId, setScopedRootId] = useState<string | null>(null);
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

  // When scoped (chip click), tree renders the scoped node's children.
  // Otherwise, full tree from rootIds. A scoped non-existent id falls back to full tree.
  const treeRootIdsToRender = useMemo(() => {
    if (!scopedRootId) return tree.rootIds;
    const scoped = tree.byId.get(scopedRootId);
    return scoped?.childIds ?? tree.rootIds;
  }, [scopedRootId, tree]);

  const flatRows = useMemo(
    () => buildFlatRows(tree, expandedIds, treeRootIdsToRender),
    [tree, expandedIds, treeRootIdsToRender],
  );
  const ranked = useMemo<FlatRankResult[]>(() => (query.trim() ? flatRank(tree, query) : []), [tree, query]);
  const isSearching = query.trim().length > 0;

  // Tokens for highlight in flat list (mirrors flatRank tokenization).
  const tokens = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return normalized.split(/\s+/).filter(Boolean);
  }, [query]);

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
      setScopedRootId(null);
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
          {(() => {
            // Build [{id, label}] pairs so each chip knows its corresponding node id.
            // Path = ancestor chain (root → … → parent) + the selected node itself.
            const chainIds = [...ancestorIds(tree, selectedNode.id), selectedNode.id];
            return chainIds.map((chipNodeId, idx) => {
              const label = selectedNode.pathLabels[idx] ?? chipNodeId;
              return (
                <button
                  key={`chip-${idx}-${chipNodeId}`}
                  type="button"
                  onClick={() => {
                    // Scope to the chip's PARENT so the user sees its siblings at that level.
                    // Top-level (root) chip → scope to null (full tree).
                    const chipNode = tree.byId.get(chipNodeId);
                    setScopedRootId(chipNode?.parentId ?? null);
                    setOpen(true);
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 transition hover:bg-slate-300"
                >
                  {label}
                </button>
              );
            });
          })()}
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
              tokens={tokens}
              query={query}
              onHoverIndex={setActiveIndex}
              onSelect={commitSelection}
            />
          ) : candidates.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-500">No sources available in this document.</div>
          ) : (
            <TreeList
              tree={tree}
              rootIds={treeRootIdsToRender}
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

function buildFlatRows(tree: SourcePickerTree, expandedIds: Set<string>, rootIds: string[]): FlatRow[] {
  const rows: FlatRow[] = [];
  const walk = (id: string, depth: number) => {
    const node = tree.byId.get(id);
    if (!node) return;
    rows.push({ id, depth });
    if (expandedIds.has(id)) {
      for (const childId of node.childIds) walk(childId, depth + 1);
    }
  };
  for (const rootId of rootIds) walk(rootId, 0);
  return rows;
}

interface TreeListProps {
  tree: SourcePickerTree;
  rootIds: string[];
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
  rootIds,
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
  return <div role="tree">{rootIds.map((rootId) => renderNode(rootId, 0))}</div>;
}

interface FlatListProps {
  results: FlatRankResult[];
  activeIndex: number;
  selectedId: string | null;
  popoverId: string;
  tokens: string[];
  query: string;
  onHoverIndex: (index: number) => void;
  onSelect: (id: string) => void;
}

function FlatList({
  results,
  activeIndex,
  selectedId,
  popoverId,
  tokens,
  query,
  onHoverIndex,
  onSelect,
}: FlatListProps): ReactElement {
  if (results.length === 0) {
    return <div className="px-3 py-2 text-sm text-slate-500">No matches for &ldquo;{query.trim()}&rdquo;.</div>;
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
              <div className="font-semibold text-slate-900">{highlightTokens(res.node.label, tokens)}</div>
              {breadcrumb ? <div className="text-xs text-slate-500">{highlightTokens(breadcrumb, tokens)}</div> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
