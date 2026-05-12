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
  const results: FlatRankResult[] = [];
  for (const node of tree.byId.values()) {
    const haystack = node.pathLabels.join(" › ").toLowerCase();
    const index = haystack.indexOf(normalized);
    if (index === -1) continue;
    const score = -index + (node.label.toLowerCase().startsWith(normalized) ? 1000 : 0);
    results.push({ node, score, matchSpans: [{ start: index, end: index + normalized.length }] });
  }
  return results.sort((a, b) => b.score - a.score);
}
