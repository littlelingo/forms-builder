import type { RuntimeEventSourceCandidate } from "../behavior/utils/runtime-helpers";

import type { SourcePickerNode, SourcePickerTree } from "./types";

export function buildSourcePickerTree(candidates: RuntimeEventSourceCandidate[]): SourcePickerTree {
  const byId = new Map<string, SourcePickerNode>();
  for (const candidate of candidates) {
    byId.set(candidate.id, {
      id: candidate.id,
      candidate,
      label: candidate.componentLabel ?? candidate.id,
      pathLabels: [],
      childIds: [],
      parentId: null,
    });
  }
  const byPath = new Map<string, string>();
  for (const candidate of candidates) {
    byPath.set(candidate.pathIds.join("/"), candidate.id);
  }
  const rootIds: string[] = [];
  for (const node of byId.values()) {
    const path = node.candidate.pathIds;
    if (path.length <= 1) {
      rootIds.push(node.id);
      continue;
    }
    const parentPath = path.slice(0, -1).join("/");
    const parentId = byPath.get(parentPath);
    if (parentId) {
      node.parentId = parentId;
      byId.get(parentId)!.childIds.push(node.id);
    } else {
      rootIds.push(node.id);
    }
  }
  for (const node of byId.values()) {
    const labels: string[] = [];
    let cursor: SourcePickerNode | undefined = node;
    while (cursor) {
      labels.unshift(cursor.label);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    node.pathLabels = labels;
  }
  return { rootIds, byId };
}

export function ancestorIds(tree: SourcePickerTree, leafId: string): string[] {
  const chain: string[] = [];
  let cursor: SourcePickerNode | undefined = tree.byId.get(leafId);
  while (cursor && cursor.parentId) {
    chain.unshift(cursor.parentId);
    cursor = tree.byId.get(cursor.parentId);
  }
  return chain;
}

export interface FlatRankResult {
  node: SourcePickerNode;
  score: number;
  matchSpans: Array<{ start: number; end: number }>;
}

export function flatRank(tree: SourcePickerTree, query: string): FlatRankResult[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const results: FlatRankResult[] = [];
  for (const node of tree.byId.values()) {
    const haystack = node.pathLabels.join(" › ").toLowerCase();
    const labelLower = node.label.toLowerCase();

    // every token must appear in the haystack
    const tokenPositions = tokens.map((t) => haystack.indexOf(t));
    if (tokenPositions.some((p) => p === -1)) continue;

    // score: smaller earliest position is better; label-prefix bonus
    const earliestPosition = Math.min(...tokenPositions);
    const labelPrefixBonus = tokens.some((t) => labelLower.startsWith(t)) ? 1000 : 0;
    const score = -earliestPosition + labelPrefixBonus;

    // Collect all occurrences of each token in the joined path
    const spans: Array<{ start: number; end: number }> = [];
    for (const token of tokens) {
      let idx = haystack.indexOf(token);
      while (idx !== -1) {
        spans.push({ start: idx, end: idx + token.length });
        idx = haystack.indexOf(token, idx + token.length);
      }
    }
    spans.sort((a, b) => a.start - b.start);

    results.push({ node, score, matchSpans: spans });
  }
  return results.sort((a, b) => b.score - a.score);
}
