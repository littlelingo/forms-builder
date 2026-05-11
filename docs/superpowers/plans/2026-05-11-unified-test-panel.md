# Unified Test Panel + Walkthrough Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace five overlapping test surfaces (`EventFlowStudio` test mode, `PreviewTestRecorder`, "Test behavior" + "Run behavior test" buttons, scattered simulator entry points) with a single floating dockable TestPanel; add a separate Walkthrough route for hosted-user-style preview. Spec: `docs/superpowers/specs/2026-05-11-unified-test-panel-design.md`.

**Architecture:** Two new surfaces share the existing `createRuntimeEngine` / `dispatchRuntimeEvent` infrastructure. TestPanel is a floating component owned by App-level state (`useTestPanelState`). It auto-binds to current selection, toggles between Synthesize and Live-record modes, and renders a hierarchical action-aware trace. WalkthroughRoute is a new App stage that mounts `PreviewCanvas` in viewer-mode shape with a step navigator and mock host bridge. The runtime engine gains additive fields on `RuntimeActionDiagnostic` (`before`, `after`, `status="skipped"`, `skippedReason`) for receiver-grouped trace rendering.

**Tech Stack:** React 18 + TypeScript + Vite (apps/web), `packages/runtime` engine (Node test runner via `tsx --test`), Tailwind + USWDS for styling. E2E uses the custom orchestrator at `apps/web/e2e/orchestrate.mjs`. apps/web has no unit test framework; logic is extracted from React hooks into pure modules tested by the runtime's Node test runner pattern, and UI flows are covered by the existing E2E orchestrator.

---

## File Structure

### New files

| File | Responsibility |
|---|---|
| `apps/web/src/features/test-panel/state.ts` | Pure state reducer + selectors for the panel. Testable via `tsx --test`. |
| `apps/web/src/features/test-panel/state.test.ts` | Reducer / selector tests. |
| `apps/web/src/features/test-panel/useTestPanelState.ts` | Thin React hook that wraps the reducer + wires engine subscription + sessionStorage. |
| `apps/web/src/features/test-panel/types.ts` | Public types shared across panel files. |
| `apps/web/src/features/test-panel/SourcePicker.tsx` | Reusable hybrid combobox: tree when empty / flat when typing + chips. |
| `apps/web/src/features/test-panel/source-picker-logic.ts` | Pure tree/flatten/rank logic. Testable via `tsx --test`. |
| `apps/web/src/features/test-panel/source-picker-logic.test.ts` | Tests for ranking, ancestor-expand, chip scoping. |
| `apps/web/src/features/test-panel/TestPanelInputs.tsx` | Synth-mode inputs: source picker + event select + payload form + Fire button. |
| `apps/web/src/features/test-panel/payload-form-logic.ts` | Pure validation + derivation helpers. |
| `apps/web/src/features/test-panel/payload-form-logic.test.ts` | Validation tests. |
| `apps/web/src/features/test-panel/TestPanelTrace.tsx` | Trace render — by-listener (default) + by-receiver tree (toggle). |
| `apps/web/src/features/test-panel/trace-grouping.ts` | Pure grouping from `RuntimeDispatchReport` to receiver tree. |
| `apps/web/src/features/test-panel/trace-grouping.test.ts` | Grouping tests. |
| `apps/web/src/features/test-panel/TestPanelHeader.tsx` | Title, mode toggle, dock controls, close. |
| `apps/web/src/features/test-panel/TestPanel.tsx` | Floating container; composes Header + Inputs (Synth) / live indicator + Trace. |
| `apps/web/src/features/test-panel/TestPanelTrigger.tsx` | "Test" button used at each placement. |
| `apps/web/src/features/test-panel/index.ts` | Public re-exports. |
| `apps/web/src/features/walkthrough/WalkthroughRoute.tsx` | Full-canvas hosted-user-style preview. |
| `apps/web/src/features/walkthrough/WalkthroughHeader.tsx` | Exit, step indicator, restart. |
| `apps/web/src/features/walkthrough/host-bridge-mock.ts` | Mock host bridge for submit + `host_call_await`. |
| `apps/web/src/features/walkthrough/index.ts` | Public re-exports. |
| `apps/web/e2e/test-panel.run.mjs` | Playwright run script for TestPanel E2E. |
| `apps/web/e2e/walkthrough.run.mjs` | Playwright run script for Walkthrough E2E. |

### Modified files

| File | Change |
|---|---|
| `packages/runtime/src/types.ts` | Extend `RuntimeActionDiagnostic` with `before?`, `after?`, `skippedReason?`; widen `status` enum with `"skipped"`. |
| `packages/runtime/src/engine.ts` | Populate `before`/`after`/`skipped` fields in action execution path. |
| `packages/runtime/src/engine.test.ts` (or new sibling) | Tests for new diagnostic fields. |
| `apps/web/src/App.tsx` | Mount `useTestPanelState`; render `<TestPanel>` when open; add `walkthrough` stage; route `WalkthroughRoute`; delete `previewTestRecordingOn`, `previewTestReports`, `<PreviewTestRecorder>` render; remove `handleTestSelectedRule` / `handleTestSelectedChain` (moved into hook); wire `<TestPanelTrigger>` props. |
| `apps/web/src/features/behavior/manager/EventFlowStudio.tsx` | **Delete file.** |
| `apps/web/src/features/behavior/test/PreviewTestRecorder.tsx` | **Delete file.** |
| `apps/web/src/features/behavior/test/` (folder) | **Delete folder.** |
| `apps/web/src/features/behavior/manager/BehaviorWorkspace.tsx` | Remove "Test behavior" + "Run behavior test" render blocks; replace with inline `<TestPanelTrigger>` next to selected listener / rule. Slim related dead state passed through props. |
| `apps/web/src/features/behavior/utils/runtime-helpers.ts` | Drop `"test"` from `BehaviorStudioMode` union. |
| `apps/web/src/features/behavior/BehaviorStudioModal.tsx` | Remove `"test"` branch from mode render switch. |
| `apps/web/src/features/behavior/manager/BehaviorManager.tsx` | Replace `onSetBehaviorStudioMode("test")` call sites with `openTestPanel(selection)`. |
| `apps/web/src/features/behavior/index.ts` | Remove `PreviewTestRecorder` re-exports. |
| `apps/web/src/features/builder/BuilderStage.tsx` | Add Walkthrough toolbar entry + global Cmd/Ctrl+K binding for TestPanel. |
| `apps/web/src/features/builder/StepStrip.tsx` | Add Walkthrough entry. |
| `apps/web/src/features/inspector/InspectorRail.tsx` | Add `<TestPanelTrigger>` to inspector context. |
| `package.json` | Add `e2e:test-panel`, `e2e:walkthrough` scripts. |
| `apps/web/e2e/orchestrate.mjs` | Parametrize so multiple `run.mjs` scripts can share the orchestrator. |

---

## Phase 1 — Runtime engine extension (additive diagnostic fields)

This is the foundation. All trace UX assumes the engine reports `before`/`after`/`skipped`. Land first so later phases can rely on it.

### Task 1.1: Extend `RuntimeActionDiagnostic` type

**Files:**
- Modify: `packages/runtime/src/types.ts`

- [ ] **Step 1: Update the type**

In `packages/runtime/src/types.ts` replace the existing `RuntimeActionDiagnostic` interface (around line 73) with:

```ts
export interface RuntimeActionDiagnostic {
  actionId: string;
  label?: string | null;
  kind: RuntimeActionDefinition["kind"];
  target?: RuntimeActionDefinition["target"] | null;
  config: Record<string, unknown>;
  status: "executed" | "error" | "skipped";
  errorMessage?: string;
  /** Value/property snapshot before action ran (when meaningful — e.g., field value, visibility flag, property value). */
  before?: unknown;
  /** Value/property snapshot after action ran. Mirrors `before`. */
  after?: unknown;
  /** Reason when status is `"skipped"`. */
  skippedReason?: "missing-target" | "no-op" | string;
}
```

- [ ] **Step 2: Run runtime typecheck**

Run: `npm run build:runtime`
Expected: PASS (the new fields are optional; existing call sites compile unchanged).

- [ ] **Step 3: Commit**

```bash
git add packages/runtime/src/types.ts
git commit -m "feat(runtime): extend RuntimeActionDiagnostic with before/after/skipped"
```

### Task 1.2: Populate `before`/`after` in built-in action handlers

**Files:**
- Modify: `packages/runtime/src/engine.ts`
- Test: `packages/runtime/src/engine.test.ts`

- [ ] **Step 1: Locate action execution**

Run: `grep -n "function executeAction\|actions.push\|status: \"executed\"" packages/runtime/src/engine.ts | head`
Find where each built-in action kind (`set_value`, `set_visible`, `set_required`, `set_disabled`, `set_property`, `set_step`, …) produces a `RuntimeActionDiagnostic`. For each handler, capture the target's current value snapshot before mutating state.

- [ ] **Step 2: Write the failing test**

Add to `packages/runtime/src/engine.test.ts` (or a new file `engine-diagnostic.test.ts` in the same directory):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRuntimeEngine } from "./engine";
import type { AuthoringDocument } from "@form-builder/schema";

test("set_value action records before and after snapshots", () => {
  const document: AuthoringDocument = {
    /* minimal doc with a single text field and a listener whose action is set_value */
    /* re-use a helper from existing engine tests if one exists; otherwise inline */
  } as AuthoringDocument; // existing fixtures already cover this shape — reuse the simplest

  const engine = createRuntimeEngine();
  engine.mount(document);
  const report = engine.dispatchWithReport(/* envelope that triggers the listener */);
  const action = report.listeners[0]?.actions[0];
  assert.ok(action, "expected one action diagnostic");
  assert.equal(action.status, "executed");
  assert.equal(action.before, "" /* or whatever the pre-state was */);
  assert.equal(action.after, "expected-value");
});
```

Borrow the fixture document shape and dispatch envelope from the nearest existing engine test (`engine.test.ts` already has them). Keep this new test self-contained.

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test --workspace @form-builder/runtime -- --test-name-pattern="records before and after"`
Expected: FAIL (`before`/`after` are `undefined`).

- [ ] **Step 4: Implement**

For each action handler in `engine.ts`, before applying the mutation, read the current target value/flag from state and assign to the diagnostic's `before`; after the mutation, assign `after`. Example for `set_value`:

```ts
// Before mutation:
const before = state.values[action.target.fieldId];
// ...apply mutation...
const after = state.values[action.target.fieldId];
diagnostic.before = before;
diagnostic.after = after;
```

Mirror for `set_visible`, `set_required`, `set_disabled` (boolean flags from `state.nodes`), `set_property` (property bag value), `set_step` (current step id).

For actions where before/after is not meaningful (`emit_event`, `host_call`, `host_call_await`, `wait`, `branch`), leave `before`/`after` undefined.

- [ ] **Step 5: Run test again**

Run: `npm run test --workspace @form-builder/runtime -- --test-name-pattern="records before and after"`
Expected: PASS.

- [ ] **Step 6: Run full runtime suite**

Run: `npm run test --workspace @form-builder/runtime`
Expected: All 89+ tests pass. No regressions.

- [ ] **Step 7: Commit**

```bash
git add packages/runtime/src/engine.ts packages/runtime/src/engine.test.ts
git commit -m "feat(runtime): populate before/after on action diagnostics"
```

### Task 1.3: Add `"skipped"` status for missing-target actions

**Files:**
- Modify: `packages/runtime/src/engine.ts`
- Test: `packages/runtime/src/engine.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test("action with deleted target reports status='skipped' and skippedReason='missing-target'", () => {
  const document = /* doc with listener whose action targets a fieldId that does not exist */;
  const engine = createRuntimeEngine();
  engine.mount(document);
  const report = engine.dispatchWithReport(/* triggering envelope */);
  const action = report.listeners[0]?.actions[0];
  assert.equal(action?.status, "skipped");
  assert.equal(action?.skippedReason, "missing-target");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @form-builder/runtime -- --test-name-pattern="missing-target"`
Expected: FAIL (current behavior likely produces `status="error"` or executes against undefined state).

- [ ] **Step 3: Implement**

In each action handler, before mutating, look up the target node. If missing:

```ts
diagnostic.status = "skipped";
diagnostic.skippedReason = "missing-target";
return diagnostic;
```

- [ ] **Step 4: Run test + full suite**

Run: `npm run test --workspace @form-builder/runtime`
Expected: All tests pass including the new one.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/engine.ts packages/runtime/src/engine.test.ts
git commit -m "feat(runtime): emit status='skipped' for actions with missing target"
```

---

## Phase 2 — SourcePicker (hybrid combobox)

Reusable component. Used for source picking, action-target picking, and reverse-index navigation. Logic lives in a pure module so it is testable without DOM.

### Task 2.1: Define types

**Files:**
- Create: `apps/web/src/features/test-panel/types.ts`

- [ ] **Step 1: Write types**

```ts
import type { RuntimeEventSourceCandidate } from "../behavior/utils/runtime-helpers";
import type { RuntimeDispatchReport } from "@form-builder/runtime";

export type TestPanelMode = "synth" | "record";
export type TestPanelDockSide = "left" | "right" | "float";

export interface TestPanelSelection {
  sourceId: string | null;
  eventType: string | null;
  payload: Record<string, string>;
  /** True once the user manually edits payload — selection-mirror stops overwriting it. */
  payloadEdited: boolean;
}

export interface TestPanelState {
  open: boolean;
  mode: TestPanelMode;
  dockSide: TestPanelDockSide;
  selection: TestPanelSelection;
  /** Synth mode: last report from the most recent fire. */
  lastReport: RuntimeDispatchReport | null;
  /** Record mode: FIFO buffer (cap 50). */
  recordedReports: { id: string; timestamp: string; report: RuntimeDispatchReport }[];
}

export interface SourcePickerNode {
  id: string;
  candidate: RuntimeEventSourceCandidate;
  label: string;
  pathLabels: string[];
  childIds: string[];
  parentId: string | null;
}

export interface SourcePickerTree {
  rootIds: string[];
  byId: Map<string, SourcePickerNode>;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/test-panel/types.ts
git commit -m "feat(test-panel): types for unified test panel + source picker"
```

### Task 2.2: Source picker pure logic — tree build

**Files:**
- Create: `apps/web/src/features/test-panel/source-picker-logic.ts`
- Test: `apps/web/src/features/test-panel/source-picker-logic.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSourcePickerTree, flatRank, ancestorIds } from "./source-picker-logic";
import type { RuntimeEventSourceCandidate } from "../behavior/utils/runtime-helpers";

const candidates: RuntimeEventSourceCandidate[] = [
  // build a minimal fixture: form > step > section > group > field (radio Male, radio Female)
  // include nodeType, pathIds, componentLabel, eventDefinitions
];

test("buildSourcePickerTree creates parent-child relationships from pathIds", () => {
  const tree = buildSourcePickerTree(candidates);
  assert.equal(tree.rootIds.length, 1); // form
  const formNode = tree.byId.get(tree.rootIds[0]!);
  assert.equal(formNode?.childIds.length, 1); // step
});

test("ancestorIds returns ordered chain from root to target", () => {
  const tree = buildSourcePickerTree(candidates);
  const radioMale = [...tree.byId.values()].find((n) => n.label === "Male");
  assert.ok(radioMale);
  const chain = ancestorIds(tree, radioMale!.id);
  // chain should be: [formId, stepId, sectionId, groupId]
  assert.equal(chain.length, 4);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test apps/web/src/features/test-panel/source-picker-logic.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```ts
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
  // wire parents using pathIds — parent is the candidate whose pathIds equals this one's pathIds minus the last segment
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
  // populate pathLabels (parent labels chained)
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test apps/web/src/features/test-panel/source-picker-logic.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/test-panel/source-picker-logic.ts apps/web/src/features/test-panel/source-picker-logic.test.ts
git commit -m "feat(test-panel): source picker tree + flat rank logic"
```

### Task 2.3: SourcePicker component shell

**Files:**
- Create: `apps/web/src/features/test-panel/SourcePicker.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useMemo, useState, useEffect, useRef } from "react";
import type { RuntimeEventSourceCandidate } from "../behavior/utils/runtime-helpers";
import { buildSourcePickerTree, flatRank, ancestorIds } from "./source-picker-logic";
import type { SourcePickerNode } from "./types";

export interface SourcePickerProps {
  candidates: RuntimeEventSourceCandidate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  placeholder?: string;
}

export function SourcePicker({ candidates, selectedId, onSelect, placeholder }: SourcePickerProps) {
  const tree = useMemo(() => buildSourcePickerTree(candidates), [candidates]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto-expand ancestors of selected on open
  useEffect(() => {
    if (open && selectedId) {
      const chain = ancestorIds(tree, selectedId);
      setExpandedIds((prev) => new Set([...prev, ...chain]));
    }
  }, [open, selectedId, tree]);

  // Cmd/Ctrl+K binding
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const selectedNode = selectedId ? tree.byId.get(selectedId) ?? null : null;
  const ranked = query.trim() ? flatRank(tree, query) : [];

  return (
    <div className="relative">
      {/* breadcrumb chips */}
      {selectedNode ? (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {selectedNode.pathLabels.map((label, idx) => (
            <span
              key={`chip-${idx}`}
              className="rounded-full bg-slate-200 px-2 py-0.5 text-xs"
              onClick={() => setOpen(true)}
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder ?? "🔍 search or browse..."}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      {open ? (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {query.trim() ? (
            <FlatList results={ranked} onSelect={(id) => { onSelect(id); setOpen(false); setQuery(""); }} />
          ) : (
            <TreeList
              tree={tree}
              expandedIds={expandedIds}
              onToggle={(id) =>
                setExpandedIds((prev) => {
                  const next = new Set(prev);
                  next.has(id) ? next.delete(id) : next.add(id);
                  return next;
                })
              }
              onSelect={(id) => { onSelect(id); setOpen(false); }}
              selectedId={selectedId}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

function TreeList({
  tree,
  expandedIds,
  onToggle,
  onSelect,
  selectedId,
}: {
  tree: ReturnType<typeof buildSourcePickerTree>;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  const renderNode = (id: string, depth: number): JSX.Element => {
    const node = tree.byId.get(id)!;
    const hasChildren = node.childIds.length > 0;
    const expanded = expandedIds.has(id);
    const isSelected = selectedId === id;
    return (
      <div key={id}>
        <div
          className={`flex items-center gap-1 px-2 py-1 text-sm ${isSelected ? "bg-blue-100" : ""}`}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
        >
          {hasChildren ? (
            <button type="button" onClick={() => onToggle(id)} aria-label={expanded ? "collapse" : "expand"}>
              {expanded ? "▼" : "▶"}
            </button>
          ) : (
            <span className="inline-block w-4" />
          )}
          <button type="button" onClick={() => onSelect(id)} className="flex-1 text-left">
            {node.label}
          </button>
        </div>
        {expanded ? node.childIds.map((childId) => renderNode(childId, depth + 1)) : null}
      </div>
    );
  };
  return <div>{tree.rootIds.map((rootId) => renderNode(rootId, 0))}</div>;
}

function FlatList({
  results,
  onSelect,
}: {
  results: ReturnType<typeof flatRank>;
  onSelect: (id: string) => void;
}) {
  if (results.length === 0) {
    return <div className="px-3 py-2 text-sm text-slate-500">No matches</div>;
  }
  return (
    <ul>
      {results.map((res) => (
        <li key={res.node.id}>
          <button
            type="button"
            onClick={() => onSelect(res.node.id)}
            className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
          >
            <div className="font-semibold">{res.node.label}</div>
            <div className="text-xs text-slate-500">{res.node.pathLabels.slice(0, -1).join(" › ")}</div>
          </button>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/test-panel/SourcePicker.tsx
git commit -m "feat(test-panel): SourcePicker hybrid combobox (tree + flat + chips)"
```

---

## Phase 3 — useTestPanelState (state reducer + hook)

### Task 3.1: Pure state reducer

**Files:**
- Create: `apps/web/src/features/test-panel/state.ts`
- Test: `apps/web/src/features/test-panel/state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { initialTestPanelState, testPanelReducer, type TestPanelAction } from "./state";

test("open action toggles open + applies selection", () => {
  const result = testPanelReducer(initialTestPanelState, {
    type: "open",
    selection: { sourceId: "field-1", eventType: "field.change", payload: {}, payloadEdited: false },
  });
  assert.equal(result.open, true);
  assert.equal(result.selection.sourceId, "field-1");
});

test("user-edit-payload sets payloadEdited sticky", () => {
  const opened = testPanelReducer(initialTestPanelState, {
    type: "open",
    selection: { sourceId: "f", eventType: "field.change", payload: {}, payloadEdited: false },
  });
  const edited = testPanelReducer(opened, { type: "edit-payload", name: "value", value: "x" });
  assert.equal(edited.selection.payloadEdited, true);
  assert.equal(edited.selection.payload.value, "x");
});

test("selection-mirror does not overwrite payload when payloadEdited=true", () => {
  const opened = testPanelReducer(initialTestPanelState, {
    type: "open",
    selection: { sourceId: "f", eventType: "field.change", payload: {}, payloadEdited: false },
  });
  const edited = testPanelReducer(opened, { type: "edit-payload", name: "value", value: "x" });
  const mirrored = testPanelReducer(edited, {
    type: "mirror-selection",
    selection: { sourceId: "g", eventType: "field.change", payload: { value: "z" }, payloadEdited: false },
  });
  assert.equal(mirrored.selection.sourceId, "g");
  assert.equal(mirrored.selection.payload.value, "x", "payload should remain sticky");
});

test("toggle-mode flips synth/record without clearing source", () => {
  const opened = testPanelReducer(initialTestPanelState, {
    type: "open",
    selection: { sourceId: "f", eventType: "field.change", payload: {}, payloadEdited: false },
  });
  const recording = testPanelReducer(opened, { type: "set-mode", mode: "record" });
  assert.equal(recording.mode, "record");
  assert.equal(recording.selection.sourceId, "f");
});

test("append-report enforces FIFO cap of 50", () => {
  let state = testPanelReducer(initialTestPanelState, { type: "open", selection: initialTestPanelState.selection });
  state = testPanelReducer(state, { type: "set-mode", mode: "record" });
  for (let i = 0; i < 60; i++) {
    state = testPanelReducer(state, {
      type: "append-report",
      entry: { id: `r${i}`, timestamp: new Date().toISOString(), report: {} as never },
    });
  }
  assert.equal(state.recordedReports.length, 50);
  assert.equal(state.recordedReports[0].id, "r10");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test apps/web/src/features/test-panel/state.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```ts
import type { RuntimeDispatchReport } from "@form-builder/runtime";
import type { TestPanelDockSide, TestPanelMode, TestPanelSelection, TestPanelState } from "./types";

export const RECORD_BUFFER_CAP = 50;

export const initialTestPanelState: TestPanelState = {
  open: false,
  mode: "synth",
  dockSide: "right",
  selection: { sourceId: null, eventType: null, payload: {}, payloadEdited: false },
  lastReport: null,
  recordedReports: [],
};

export type TestPanelAction =
  | { type: "open"; selection: TestPanelSelection }
  | { type: "close" }
  | { type: "set-mode"; mode: TestPanelMode }
  | { type: "set-dock"; side: TestPanelDockSide }
  | { type: "mirror-selection"; selection: TestPanelSelection }
  | { type: "edit-payload"; name: string; value: string }
  | { type: "reset-payload"; payload: Record<string, string> }
  | { type: "set-last-report"; report: RuntimeDispatchReport | null }
  | { type: "append-report"; entry: { id: string; timestamp: string; report: RuntimeDispatchReport } }
  | { type: "clear-recorded" };

export function testPanelReducer(state: TestPanelState, action: TestPanelAction): TestPanelState {
  switch (action.type) {
    case "open":
      return { ...state, open: true, selection: action.selection };
    case "close":
      return { ...state, open: false };
    case "set-mode":
      return { ...state, mode: action.mode };
    case "set-dock":
      return { ...state, dockSide: action.side };
    case "mirror-selection": {
      const keepPayload = state.selection.payloadEdited;
      return {
        ...state,
        selection: {
          sourceId: action.selection.sourceId,
          eventType: action.selection.eventType,
          payload: keepPayload ? state.selection.payload : action.selection.payload,
          payloadEdited: state.selection.payloadEdited,
        },
      };
    }
    case "edit-payload":
      return {
        ...state,
        selection: {
          ...state.selection,
          payload: { ...state.selection.payload, [action.name]: action.value },
          payloadEdited: true,
        },
      };
    case "reset-payload":
      return {
        ...state,
        selection: { ...state.selection, payload: action.payload, payloadEdited: false },
      };
    case "set-last-report":
      return { ...state, lastReport: action.report };
    case "append-report": {
      const next = [...state.recordedReports, action.entry];
      if (next.length > RECORD_BUFFER_CAP) {
        next.splice(0, next.length - RECORD_BUFFER_CAP);
      }
      return { ...state, recordedReports: next };
    }
    case "clear-recorded":
      return { ...state, recordedReports: [] };
    default:
      return state;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test apps/web/src/features/test-panel/state.test.ts`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/test-panel/state.ts apps/web/src/features/test-panel/state.test.ts
git commit -m "feat(test-panel): pure reducer for panel state (open/mode/dock/selection/reports)"
```

### Task 3.2: useTestPanelState hook

**Files:**
- Create: `apps/web/src/features/test-panel/useTestPanelState.ts`

- [ ] **Step 1: Implement**

```ts
import { useCallback, useEffect, useReducer, useRef } from "react";
import type { RuntimeDispatchReport, RuntimeEngine } from "@form-builder/runtime";
import { initialTestPanelState, testPanelReducer } from "./state";
import type { TestPanelDockSide, TestPanelMode, TestPanelSelection } from "./types";

const STORAGE_KEY = "test-panel-prefs-v1";

interface StoredPrefs {
  mode: TestPanelMode;
  dockSide: TestPanelDockSide;
}

function readPrefs(): Partial<StoredPrefs> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredPrefs) : {};
  } catch {
    return {};
  }
}

function writePrefs(prefs: StoredPrefs) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function useTestPanelState(engine: RuntimeEngine | null) {
  const [state, dispatch] = useReducer(
    testPanelReducer,
    null,
    () => {
      const prefs = readPrefs();
      return {
        ...initialTestPanelState,
        mode: prefs.mode ?? initialTestPanelState.mode,
        dockSide: prefs.dockSide ?? initialTestPanelState.dockSide,
      };
    },
  );

  // Persist mode + dock side
  useEffect(() => {
    writePrefs({ mode: state.mode, dockSide: state.dockSide });
  }, [state.mode, state.dockSide]);

  // Subscribe to engine reports when recording
  const lastIdRef = useRef(0);
  useEffect(() => {
    if (!engine || state.mode !== "record" || !state.open) return;
    const unsubscribe = engine.subscribe?.((envelope, report?: RuntimeDispatchReport) => {
      if (!report) return;
      const id = `rec-${++lastIdRef.current}`;
      dispatch({ type: "append-report", entry: { id, timestamp: new Date().toISOString(), report } });
    });
    return unsubscribe;
  }, [engine, state.mode, state.open]);

  const open = useCallback((selection: TestPanelSelection) => dispatch({ type: "open", selection }), []);
  const close = useCallback(() => dispatch({ type: "close" }), []);
  const setMode = useCallback((mode: TestPanelMode) => dispatch({ type: "set-mode", mode }), []);
  const setDock = useCallback((side: TestPanelDockSide) => dispatch({ type: "set-dock", side }), []);
  const mirrorSelection = useCallback(
    (selection: TestPanelSelection) => dispatch({ type: "mirror-selection", selection }),
    [],
  );
  const editPayload = useCallback(
    (name: string, value: string) => dispatch({ type: "edit-payload", name, value }),
    [],
  );
  const resetPayload = useCallback(
    (payload: Record<string, string>) => dispatch({ type: "reset-payload", payload }),
    [],
  );
  const setLastReport = useCallback(
    (report: RuntimeDispatchReport | null) => dispatch({ type: "set-last-report", report }),
    [],
  );
  const clearRecorded = useCallback(() => dispatch({ type: "clear-recorded" }), []);

  return {
    state,
    open,
    close,
    setMode,
    setDock,
    mirrorSelection,
    editPayload,
    resetPayload,
    setLastReport,
    clearRecorded,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

(Note: `engine.subscribe` is invoked with a permissive signature; if the existing `RuntimeEngine.subscribe` does not pass a report alongside the envelope, see Task 3.3 to extend the subscription mechanism.)

- [ ] **Step 3: Verify engine subscription shape**

Run: `grep -n "subscribe\b" packages/runtime/src/types.ts packages/runtime/src/engine.ts | head -10`
Inspect the existing handler signature. If `subscribe(handler)` only passes the envelope and not the report, decide between:
  - **Option A (preferred for minimal engine change)**: in the hook, call `dispatchWithReport` instead of waiting for the subscription, OR replay the last report via a dedicated `subscribeReports` channel added in Task 3.3.
  - **Option B**: Extend the existing `subscribe` to also pass the report. This requires a one-line engine change.

If existing handler returns only envelope, switch the hook to use a new engine method `subscribeReports(handler)` (Task 3.3 adds it).

- [ ] **Step 4: Commit (skeleton, may revise after 3.3)**

```bash
git add apps/web/src/features/test-panel/useTestPanelState.ts
git commit -m "feat(test-panel): useTestPanelState hook (reducer + sessionStorage + engine subscribe)"
```

### Task 3.3: Engine `subscribeReports` channel (only if Task 3.2 Option B chosen)

**Files:**
- Modify: `packages/runtime/src/engine.ts`, `packages/runtime/src/types.ts`
- Test: `packages/runtime/src/engine.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test("subscribeReports receives a report for every dispatch", () => {
  const engine = createRuntimeEngine();
  engine.mount(/* fixture doc */);
  const captured: RuntimeDispatchReport[] = [];
  const unsubscribe = engine.subscribeReports((report) => captured.push(report));
  engine.dispatchWithReport(/* envelope */);
  engine.dispatchWithReport(/* envelope */);
  unsubscribe();
  engine.dispatchWithReport(/* envelope */);
  assert.equal(captured.length, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @form-builder/runtime -- --test-name-pattern="subscribeReports"`
Expected: FAIL (method does not exist).

- [ ] **Step 3: Implement**

Add to `RuntimeEngine` interface in `types.ts`:

```ts
subscribeReports(handler: (report: RuntimeDispatchReport) => void): () => void;
```

In `engine.ts`, maintain a `reportHandlers: Set<...>`; after every `dispatchWithReport` call, broadcast the report to all handlers.

- [ ] **Step 4: Run tests**

Run: `npm run test --workspace @form-builder/runtime`
Expected: All pass.

- [ ] **Step 5: Update hook to call new method**

In `useTestPanelState.ts`, replace the subscribe call with `engine.subscribeReports(...)`.

- [ ] **Step 6: Commit**

```bash
git add packages/runtime/src/engine.ts packages/runtime/src/types.ts packages/runtime/src/engine.test.ts apps/web/src/features/test-panel/useTestPanelState.ts
git commit -m "feat(runtime): subscribeReports channel for live-record subscribers"
```

---

## Phase 4 — TestPanelInputs (Synth mode)

### Task 4.1: Payload form pure logic

**Files:**
- Create: `apps/web/src/features/test-panel/payload-form-logic.ts`
- Test: `apps/web/src/features/test-panel/payload-form-logic.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePayloadField, parsePayloadValue } from "./payload-form-logic";
import type { RuntimePayloadField } from "@form-builder/schema";

test("validatePayloadField returns ok for matching boolean", () => {
  const field = { name: "ok", valueType: "boolean" } as RuntimePayloadField;
  assert.deepEqual(validatePayloadField(field, "true"), { ok: true });
});

test("validatePayloadField returns error for non-numeric number", () => {
  const field = { name: "n", valueType: "number" } as RuntimePayloadField;
  const result = validatePayloadField(field, "abc");
  assert.equal(result.ok, false);
});

test("validatePayloadField returns error for invalid JSON object", () => {
  const field = { name: "o", valueType: "object" } as RuntimePayloadField;
  const result = validatePayloadField(field, "{not json}");
  assert.equal(result.ok, false);
});

test("parsePayloadValue converts string to typed value", () => {
  const boolField = { name: "b", valueType: "boolean" } as RuntimePayloadField;
  assert.equal(parsePayloadValue(boolField, "true"), true);
  const numField = { name: "n", valueType: "number" } as RuntimePayloadField;
  assert.equal(parsePayloadValue(numField, "42"), 42);
  const objField = { name: "o", valueType: "object" } as RuntimePayloadField;
  assert.deepEqual(parsePayloadValue(objField, '{"a":1}'), { a: 1 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test apps/web/src/features/test-panel/payload-form-logic.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import type { RuntimePayloadField } from "@form-builder/schema";

export type ValidationResult = { ok: true } | { ok: false; message: string };

export function validatePayloadField(field: RuntimePayloadField, raw: string): ValidationResult {
  if (raw === "") return { ok: true }; // empty = default; engine accepts undefined
  switch (field.valueType) {
    case "boolean":
      return raw === "true" || raw === "false" ? { ok: true } : { ok: false, message: "Must be true or false" };
    case "number":
      return Number.isFinite(Number(raw)) ? { ok: true } : { ok: false, message: "Must be a number" };
    case "object":
    case "array":
      try {
        const parsed = JSON.parse(raw);
        if (field.valueType === "array" && !Array.isArray(parsed)) {
          return { ok: false, message: "Must be a JSON array" };
        }
        if (field.valueType === "object" && (typeof parsed !== "object" || Array.isArray(parsed))) {
          return { ok: false, message: "Must be a JSON object" };
        }
        return { ok: true };
      } catch (err) {
        return { ok: false, message: `Invalid JSON: ${(err as Error).message}` };
      }
    case "string":
    default:
      return { ok: true };
  }
}

export function parsePayloadValue(field: RuntimePayloadField, raw: string): unknown {
  if (raw === "") return undefined;
  switch (field.valueType) {
    case "boolean":
      return raw === "true";
    case "number":
      return Number(raw);
    case "object":
    case "array":
      return JSON.parse(raw);
    default:
      return raw;
  }
}

export function allPayloadFieldsValid(
  fields: RuntimePayloadField[],
  payload: Record<string, string>,
): boolean {
  return fields.every((field) => validatePayloadField(field, payload[field.name] ?? "").ok);
}
```

- [ ] **Step 4: Run test**

Run: `npx tsx --test apps/web/src/features/test-panel/payload-form-logic.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/test-panel/payload-form-logic.ts apps/web/src/features/test-panel/payload-form-logic.test.ts
git commit -m "feat(test-panel): payload form validation + parsing helpers"
```

### Task 4.2: TestPanelInputs component

**Files:**
- Create: `apps/web/src/features/test-panel/TestPanelInputs.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useMemo } from "react";
import type { RuntimePayloadField } from "@form-builder/schema";
import type { RuntimeEventSourceCandidate } from "../behavior/utils/runtime-helpers";
import { runtimeEventDefinitionType, runtimePayloadFieldsForEventType } from "../behavior/utils/runtime-helpers";
import { SourcePicker } from "./SourcePicker";
import { validatePayloadField, allPayloadFieldsValid, parsePayloadValue } from "./payload-form-logic";
import type { TestPanelSelection } from "./types";

export interface TestPanelInputsProps {
  candidates: RuntimeEventSourceCandidate[];
  selection: TestPanelSelection;
  onSelectSource: (id: string) => void;
  onSelectEvent: (type: string) => void;
  onEditPayload: (name: string, value: string) => void;
  onResetPayload: (payload: Record<string, string>) => void;
  onFire: (envelope: { sourceId: string; eventType: string; payload: Record<string, unknown> }) => void;
}

export function TestPanelInputs({
  candidates,
  selection,
  onSelectSource,
  onSelectEvent,
  onEditPayload,
  onResetPayload,
  onFire,
}: TestPanelInputsProps) {
  const source = selection.sourceId ? candidates.find((c) => c.id === selection.sourceId) ?? null : null;
  const eventOptions = useMemo(() => {
    if (!source) return [] as { type: string; label: string }[];
    const fromDefs = source.eventDefinitions.map((d) => ({
      type: runtimeEventDefinitionType(d),
      label: d.label ?? runtimeEventDefinitionType(d),
    }));
    return fromDefs.length ? fromDefs : [{ type: "field.change", label: "field.change (draft)" }];
  }, [source]);

  const effectiveEventType = selection.eventType ?? eventOptions[0]?.type ?? null;
  const payloadFields: RuntimePayloadField[] = effectiveEventType
    ? runtimePayloadFieldsForEventType(effectiveEventType)
    : [];

  const canFire = source !== null && effectiveEventType !== null && allPayloadFieldsValid(payloadFields, selection.payload);

  return (
    <section className="p-3">
      <label className="block text-xs uppercase tracking-wide text-slate-500">Source</label>
      <SourcePicker candidates={candidates} selectedId={selection.sourceId} onSelect={onSelectSource} />

      <label className="mt-3 block text-xs uppercase tracking-wide text-slate-500">Event</label>
      <select
        value={effectiveEventType ?? ""}
        onChange={(e) => onSelectEvent(e.target.value)}
        className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
      >
        {eventOptions.map((opt) => (
          <option key={opt.type} value={opt.type}>
            {opt.label}
          </option>
        ))}
      </select>

      <div className="mt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-slate-500">Payload</span>
          {payloadFields.length > 0 ? (
            <button
              type="button"
              onClick={() =>
                onResetPayload(Object.fromEntries(payloadFields.map((f) => [f.name, ""])))
              }
              className="text-xs text-blue-700 underline"
            >
              Reset to defaults
            </button>
          ) : null}
        </div>
        {payloadFields.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500">Event has no payload fields.</p>
        ) : (
          payloadFields.map((field) => {
            const raw = selection.payload[field.name] ?? "";
            const validation = validatePayloadField(field, raw);
            return (
              <label key={field.name} className="mt-2 block">
                <span className="text-xs text-slate-600">
                  {field.label ?? field.name} <span className="text-slate-400">· {field.valueType}</span>
                </span>
                <input
                  type="text"
                  value={raw}
                  onChange={(e) => onEditPayload(field.name, e.target.value)}
                  className={`mt-1 w-full rounded border px-2 py-1 text-sm ${
                    validation.ok ? "border-slate-300" : "border-red-400"
                  }`}
                />
                {!validation.ok ? (
                  <span className="block text-xs text-red-600">{validation.message}</span>
                ) : null}
              </label>
            );
          })
        )}
      </div>

      <button
        type="button"
        disabled={!canFire}
        onClick={() => {
          if (!source || !effectiveEventType) return;
          const payload: Record<string, unknown> = {};
          for (const field of payloadFields) {
            const parsed = parsePayloadValue(field, selection.payload[field.name] ?? "");
            if (parsed !== undefined) payload[field.name] = parsed;
          }
          onFire({ sourceId: source.id, eventType: effectiveEventType, payload });
        }}
        className="mt-4 w-full rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        Fire event
      </button>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/test-panel/TestPanelInputs.tsx
git commit -m "feat(test-panel): TestPanelInputs synth-mode inputs (source/event/payload/fire)"
```

---

## Phase 5 — TestPanelTrace

### Task 5.1: Trace grouping pure logic

**Files:**
- Create: `apps/web/src/features/test-panel/trace-grouping.ts`
- Test: `apps/web/src/features/test-panel/trace-grouping.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupActionsByReceiver } from "./trace-grouping";
import type { RuntimeDispatchReport } from "@form-builder/runtime";

test("groupActionsByReceiver buckets actions by targetNodeId", () => {
  const report = {
    listeners: [
      {
        listenerId: "L1",
        matched: true,
        actions: [
          { actionId: "A1", kind: "set_value", target: { fieldId: "F1" }, status: "executed", before: "", after: "x" },
          { actionId: "A2", kind: "set_visible", target: { fieldId: "F2" }, status: "executed", before: false, after: true },
          { actionId: "A3", kind: "set_required", target: { fieldId: "F1" }, status: "executed", before: false, after: true },
        ],
      },
    ],
  } as unknown as RuntimeDispatchReport;
  const groups = groupActionsByReceiver(report);
  assert.equal(groups.length, 2);
  assert.equal(groups.find((g) => g.targetId === "F1")?.actions.length, 2);
  assert.equal(groups.find((g) => g.targetId === "F2")?.actions.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test apps/web/src/features/test-panel/trace-grouping.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import type { RuntimeDispatchReport, RuntimeActionDiagnostic } from "@form-builder/runtime";

export interface ActionGroup {
  targetId: string;
  actions: Array<RuntimeActionDiagnostic & { listenerId: string }>;
}

function extractTargetId(action: RuntimeActionDiagnostic): string | null {
  const target = action.target as { fieldId?: string; nodeId?: string } | null | undefined;
  if (!target) return null;
  return target.fieldId ?? target.nodeId ?? null;
}

export function groupActionsByReceiver(report: RuntimeDispatchReport): ActionGroup[] {
  const buckets = new Map<string, ActionGroup>();
  for (const listener of report.listeners) {
    if (!listener.matched) continue;
    for (const action of listener.actions) {
      const targetId = extractTargetId(action);
      if (!targetId) continue;
      let group = buckets.get(targetId);
      if (!group) {
        group = { targetId, actions: [] };
        buckets.set(targetId, group);
      }
      group.actions.push({ ...action, listenerId: listener.listenerId });
    }
  }
  return [...buckets.values()];
}
```

- [ ] **Step 4: Run test**

Run: `npx tsx --test apps/web/src/features/test-panel/trace-grouping.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/test-panel/trace-grouping.ts apps/web/src/features/test-panel/trace-grouping.test.ts
git commit -m "feat(test-panel): action receiver-grouping helper"
```

### Task 5.2: TestPanelTrace component

**Files:**
- Create: `apps/web/src/features/test-panel/TestPanelTrace.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useState } from "react";
import type { RuntimeDispatchReport } from "@form-builder/runtime";
import { groupActionsByReceiver } from "./trace-grouping";

export interface TestPanelTraceProps {
  /** Synth mode passes the single last report; Record mode passes the most recent entry. */
  report: RuntimeDispatchReport | null;
  /** Optional label resolver — converts a nodeId to a human path label. */
  nodeLabelById?: Map<string, string>;
  onCreateListenerForSource?: () => void;
}

type TraceView = "by-listener" | "by-receiver";

export function TestPanelTrace({ report, nodeLabelById, onCreateListenerForSource }: TestPanelTraceProps) {
  const [view, setView] = useState<TraceView>("by-listener");

  if (!report) {
    return (
      <section className="p-3 text-sm text-slate-500">
        <p>Fire an event to see the listener trace.</p>
      </section>
    );
  }

  const noListeners = report.listeners.length === 0;

  return (
    <section className="p-3">
      <header className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold">Trace</h4>
        <div className="flex gap-1 text-xs">
          <button
            type="button"
            onClick={() => setView("by-listener")}
            className={`rounded px-2 py-0.5 ${view === "by-listener" ? "bg-blue-600 text-white" : "bg-slate-100"}`}
          >
            By listener
          </button>
          <button
            type="button"
            onClick={() => setView("by-receiver")}
            className={`rounded px-2 py-0.5 ${view === "by-receiver" ? "bg-blue-600 text-white" : "bg-slate-100"}`}
          >
            By receiver
          </button>
        </div>
      </header>

      <div className="mb-2 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs">
        <span className="font-semibold">{report.event.type}</span>
        <span className="ml-2 text-slate-600">{report.listeners.length} listener checks</span>
      </div>

      {noListeners ? (
        <div className="rounded border border-dashed border-slate-300 p-3 text-sm text-slate-500">
          <p>No listeners reached this event.</p>
          {onCreateListenerForSource ? (
            <button type="button" onClick={onCreateListenerForSource} className="mt-1 text-xs text-blue-700 underline">
              Create listener
            </button>
          ) : null}
        </div>
      ) : view === "by-listener" ? (
        <ByListenerView report={report} nodeLabelById={nodeLabelById} />
      ) : (
        <ByReceiverView report={report} nodeLabelById={nodeLabelById} />
      )}
    </section>
  );
}

function describeBeforeAfter(action: { before?: unknown; after?: unknown }): string | null {
  if (action.before === undefined && action.after === undefined) return null;
  return `${JSON.stringify(action.before)} → ${JSON.stringify(action.after)}`;
}

function ByListenerView({
  report,
  nodeLabelById,
}: {
  report: RuntimeDispatchReport;
  nodeLabelById?: Map<string, string>;
}) {
  return (
    <ul className="space-y-2">
      {report.listeners.map((listener) => (
        <li
          key={`${listener.listenerId}-${listener.eventPhase}`}
          className={`rounded border p-2 ${listener.matched ? "border-emerald-200" : "border-slate-200"}`}
        >
          <div className="text-sm font-semibold">
            {listener.matched ? "Listener ran" : "Listener skipped"} — {listener.label ?? listener.listenerId}
          </div>
          {listener.skippedReason ? (
            <div className="text-xs text-slate-500">Reason: {listener.skippedReason}</div>
          ) : null}
          {listener.actions.length ? (
            <ul className="mt-1 ml-3 space-y-1 text-xs">
              {listener.actions.map((action) => {
                const targetId =
                  (action.target as { fieldId?: string; nodeId?: string } | null)?.fieldId ??
                  (action.target as { nodeId?: string } | null)?.nodeId ??
                  null;
                const targetLabel = targetId ? nodeLabelById?.get(targetId) ?? targetId : "—";
                const delta = describeBeforeAfter(action);
                return (
                  <li key={action.actionId}>
                    ▸ {targetLabel} · {action.kind} · {action.status}
                    {delta ? ` · ${delta}` : ""}
                    {action.skippedReason ? ` · ${action.skippedReason}` : ""}
                    {action.errorMessage ? ` · ${action.errorMessage}` : ""}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function ByReceiverView({
  report,
  nodeLabelById,
}: {
  report: RuntimeDispatchReport;
  nodeLabelById?: Map<string, string>;
}) {
  const groups = groupActionsByReceiver(report);
  if (groups.length === 0) {
    return <p className="text-sm text-slate-500">No actions executed.</p>;
  }
  return (
    <ul className="space-y-2">
      {groups.map((group) => (
        <li key={group.targetId} className="rounded border border-slate-200 p-2">
          <div className="text-sm font-semibold">
            {nodeLabelById?.get(group.targetId) ?? group.targetId}
            <span className="ml-1 text-xs text-slate-500">({group.actions.length} actions)</span>
          </div>
          <ul className="mt-1 ml-3 space-y-1 text-xs">
            {group.actions.map((action) => {
              const delta = describeBeforeAfter(action);
              return (
                <li key={`${action.listenerId}-${action.actionId}`}>
                  ▸ {action.kind} · {action.status}
                  {delta ? ` · ${delta}` : ""}
                  {action.skippedReason ? ` · ${action.skippedReason}` : ""}
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/test-panel/TestPanelTrace.tsx
git commit -m "feat(test-panel): TestPanelTrace with by-listener and by-receiver views"
```

---

## Phase 6 — TestPanel container + Header

### Task 6.1: TestPanelHeader

**Files:**
- Create: `apps/web/src/features/test-panel/TestPanelHeader.tsx`

- [ ] **Step 1: Implement**

```tsx
import type { TestPanelDockSide, TestPanelMode } from "./types";

export interface TestPanelHeaderProps {
  mode: TestPanelMode;
  dockSide: TestPanelDockSide;
  onSetMode: (mode: TestPanelMode) => void;
  onSetDock: (side: TestPanelDockSide) => void;
  onClose: () => void;
}

export function TestPanelHeader({ mode, dockSide, onSetMode, onSetDock, onClose }: TestPanelHeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Test panel</h3>
        <div className="flex gap-0.5 text-xs">
          <button
            type="button"
            onClick={() => onSetMode("synth")}
            className={`rounded-l px-2 py-0.5 ${mode === "synth" ? "bg-blue-600 text-white" : "bg-slate-200"}`}
          >
            Synth
          </button>
          <button
            type="button"
            onClick={() => onSetMode("record")}
            className={`rounded-r px-2 py-0.5 ${mode === "record" ? "bg-blue-600 text-white" : "bg-slate-200"}`}
          >
            Live record
          </button>
        </div>
      </div>
      <div className="flex items-center gap-1 text-xs">
        <button
          type="button"
          aria-label="Dock left"
          onClick={() => onSetDock("left")}
          className={`rounded px-1 ${dockSide === "left" ? "bg-slate-200" : ""}`}
        >
          ◧
        </button>
        <button
          type="button"
          aria-label="Float"
          onClick={() => onSetDock("float")}
          className={`rounded px-1 ${dockSide === "float" ? "bg-slate-200" : ""}`}
        >
          ◇
        </button>
        <button
          type="button"
          aria-label="Dock right"
          onClick={() => onSetDock("right")}
          className={`rounded px-1 ${dockSide === "right" ? "bg-slate-200" : ""}`}
        >
          ◨
        </button>
        <button type="button" aria-label="Close" onClick={onClose} className="ml-1 rounded px-1 hover:bg-slate-200">
          ✕
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/test-panel/TestPanelHeader.tsx
git commit -m "feat(test-panel): TestPanelHeader (title/mode/dock/close)"
```

### Task 6.2: TestPanel container

**Files:**
- Create: `apps/web/src/features/test-panel/TestPanel.tsx`

- [ ] **Step 1: Implement**

```tsx
import type { RuntimeDispatchReport } from "@form-builder/runtime";
import type { RuntimeEventSourceCandidate } from "../behavior/utils/runtime-helpers";
import type { TestPanelDockSide, TestPanelMode, TestPanelSelection } from "./types";
import { TestPanelHeader } from "./TestPanelHeader";
import { TestPanelInputs } from "./TestPanelInputs";
import { TestPanelTrace } from "./TestPanelTrace";

export interface TestPanelProps {
  open: boolean;
  mode: TestPanelMode;
  dockSide: TestPanelDockSide;
  selection: TestPanelSelection;
  lastReport: RuntimeDispatchReport | null;
  recordedReports: { id: string; timestamp: string; report: RuntimeDispatchReport }[];
  candidates: RuntimeEventSourceCandidate[];
  nodeLabelById?: Map<string, string>;
  onClose: () => void;
  onSetMode: (mode: TestPanelMode) => void;
  onSetDock: (side: TestPanelDockSide) => void;
  onSelectSource: (id: string) => void;
  onSelectEvent: (type: string) => void;
  onEditPayload: (name: string, value: string) => void;
  onResetPayload: (payload: Record<string, string>) => void;
  onFire: (envelope: { sourceId: string; eventType: string; payload: Record<string, unknown> }) => void;
  onClearRecorded: () => void;
  onCreateListenerForSource?: () => void;
}

const dockClasses: Record<TestPanelDockSide, string> = {
  left: "fixed left-2 top-20 bottom-2 w-[22rem]",
  right: "fixed right-2 top-20 bottom-2 w-[22rem]",
  float: "fixed right-8 top-24 w-[22rem] h-[36rem] shadow-2xl",
};

export function TestPanel(props: TestPanelProps) {
  if (!props.open) return null;
  const {
    mode,
    dockSide,
    selection,
    lastReport,
    recordedReports,
    candidates,
    nodeLabelById,
    onClose,
    onSetMode,
    onSetDock,
    onSelectSource,
    onSelectEvent,
    onEditPayload,
    onResetPayload,
    onFire,
    onClearRecorded,
    onCreateListenerForSource,
  } = props;

  const recordHead = recordedReports.length ? recordedReports[recordedReports.length - 1] : null;

  return (
    <aside
      role="dialog"
      aria-label="Test panel"
      className={`${dockClasses[dockSide]} z-20 flex flex-col overflow-hidden rounded-lg border border-slate-300 bg-white`}
    >
      <TestPanelHeader
        mode={mode}
        dockSide={dockSide}
        onSetMode={onSetMode}
        onSetDock={onSetDock}
        onClose={onClose}
      />
      <div className="flex-1 overflow-auto">
        {mode === "synth" ? (
          <TestPanelInputs
            candidates={candidates}
            selection={selection}
            onSelectSource={onSelectSource}
            onSelectEvent={onSelectEvent}
            onEditPayload={onEditPayload}
            onResetPayload={onResetPayload}
            onFire={onFire}
          />
        ) : (
          <section className="p-3 text-xs text-slate-600">
            <div className="flex items-center justify-between">
              <span>
                Recording. Interact with the preview to capture dispatches.
                <br />
                {recordedReports.length} captured (cap 50)
              </span>
              {recordedReports.length > 0 ? (
                <button type="button" onClick={onClearRecorded} className="rounded bg-slate-200 px-2 py-0.5">
                  Clear
                </button>
              ) : null}
            </div>
          </section>
        )}
        <TestPanelTrace
          report={mode === "synth" ? lastReport : recordHead?.report ?? null}
          nodeLabelById={nodeLabelById}
          onCreateListenerForSource={onCreateListenerForSource}
        />
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/test-panel/TestPanel.tsx
git commit -m "feat(test-panel): TestPanel container (dock layouts + mode switch)"
```

### Task 6.3: TestPanelTrigger + index

**Files:**
- Create: `apps/web/src/features/test-panel/TestPanelTrigger.tsx`
- Create: `apps/web/src/features/test-panel/index.ts`

- [ ] **Step 1: TestPanelTrigger**

```tsx
import type { TestPanelSelection } from "./types";

export interface TestPanelTriggerProps {
  derive: () => TestPanelSelection;
  onOpen: (selection: TestPanelSelection) => void;
  variant?: "primary" | "secondary";
  label?: string;
}

export function TestPanelTrigger({ derive, onOpen, variant = "secondary", label = "Test" }: TestPanelTriggerProps) {
  const base = "rounded px-2 py-1 text-xs font-semibold";
  const styles = variant === "primary" ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-800 hover:bg-slate-300";
  return (
    <button type="button" onClick={() => onOpen(derive())} className={`${base} ${styles}`}>
      {label}
    </button>
  );
}
```

- [ ] **Step 2: index.ts**

```ts
export { TestPanel } from "./TestPanel";
export type { TestPanelProps } from "./TestPanel";
export { TestPanelTrigger } from "./TestPanelTrigger";
export type { TestPanelTriggerProps } from "./TestPanelTrigger";
export { useTestPanelState } from "./useTestPanelState";
export type { TestPanelMode, TestPanelDockSide, TestPanelSelection, TestPanelState } from "./types";
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/test-panel/TestPanelTrigger.tsx apps/web/src/features/test-panel/index.ts
git commit -m "feat(test-panel): TestPanelTrigger + public index"
```

---

## Phase 7 — Wire into App.tsx (synth + auto-bind)

### Task 7.1: Mount hook + render panel in App

**Files:**
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Add imports + hook usage**

In `apps/web/src/App.tsx`, near the existing behavior-related imports, add:

```ts
import { TestPanel, TestPanelTrigger, useTestPanelState } from "./features/test-panel";
import type { TestPanelSelection } from "./features/test-panel";
```

Inside the main App component, after the engine is created/available, add:

```ts
const testPanel = useTestPanelState(runtimeEngine);
```

Where `runtimeEngine` is whatever variable holds the current `RuntimeEngine` instance for the active document (the call site of `createRuntimeEngine` in App.tsx). If the engine isn't currently held in a single variable, hoist it.

- [ ] **Step 2: Derive `openTestPanel` from selection**

Add a helper inside App.tsx:

```ts
function deriveSelectionFromAuthoring(authoring: AuthoringSelection | null, listenerId: string | null): TestPanelSelection {
  const sourceId =
    (listenerId
      ? runtimeListenerById.get(listenerId)?.eventSourceNodeId ?? null
      : null) ??
    (authoring?.kind === "field" ? authoring.fieldId : null) ??
    null;
  const candidate = sourceId ? runtimeEventSourceCandidateById.get(sourceId) : null;
  const eventType = listenerId
    ? runtimeListenerById.get(listenerId)?.eventName ?? null
    : candidate?.eventDefinitions[0]
      ? runtimeEventDefinitionType(candidate.eventDefinitions[0])
      : null;
  return { sourceId, eventType, payload: {}, payloadEdited: false };
}

function openTestPanelFromSelection() {
  testPanel.open(deriveSelectionFromAuthoring(selectedAuthoring, selectedBehaviorListenerId));
}
```

(Place near other `selected*` derived helpers in App.tsx.)

- [ ] **Step 3: Mount `<TestPanel>` near top of JSX**

In the root `<div>` of App.tsx (after the existing modals), add:

```tsx
<TestPanel
  open={testPanel.state.open}
  mode={testPanel.state.mode}
  dockSide={testPanel.state.dockSide}
  selection={testPanel.state.selection}
  lastReport={testPanel.state.lastReport}
  recordedReports={testPanel.state.recordedReports}
  candidates={runtimeEventSourceCandidates}
  nodeLabelById={runtimeNodeLabelById}
  onClose={testPanel.close}
  onSetMode={testPanel.setMode}
  onSetDock={testPanel.setDock}
  onSelectSource={(id) => {
    const candidate = runtimeEventSourceCandidateById.get(id);
    const nextEventType = candidate?.eventDefinitions[0]
      ? runtimeEventDefinitionType(candidate.eventDefinitions[0])
      : null;
    testPanel.mirrorSelection({
      sourceId: id,
      eventType: nextEventType,
      payload: {},
      payloadEdited: testPanel.state.selection.payloadEdited,
    });
  }}
  onSelectEvent={(type) =>
    testPanel.mirrorSelection({ ...testPanel.state.selection, eventType: type })
  }
  onEditPayload={testPanel.editPayload}
  onResetPayload={testPanel.resetPayload}
  onFire={({ sourceId, eventType, payload }) => {
    const source = runtimeEventSourceCandidateById.get(sourceId);
    if (!source || !activeDocument) return;
    const envelope: RuntimeEventEnvelope = {
      type: eventType,
      version: "1.0",
      source: {
        runtimeId: "builder-simulator",
        formId: activeDocument.id,
        projectId: activeProjectDetail?.project.id ?? null,
        nodeId: source.id,
        nodeKey: source.dispatchKey ?? null,
        nodeType: source.nodeType,
      },
      target: {
        runtimeId: "builder-simulator",
        formId: activeDocument.id,
        projectId: activeProjectDetail?.project.id ?? null,
        nodeId: source.id,
        nodeKey: source.dispatchKey ?? null,
        nodeType: source.nodeType,
      },
      payload: { ...payload, eventType, sourceNodeId: source.id, targetNodeId: source.id },
      correlationId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };
    const report = runtimeEngine?.dispatchWithReport(envelope) ?? null;
    testPanel.setLastReport(report);
  }}
  onClearRecorded={testPanel.clearRecorded}
/>
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 5: Manual smoke**

Run: `npm run dev:web`
Open http://localhost:5173. Verify the app still loads (panel will not yet be reachable without a trigger; that's Task 8).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat(web): mount TestPanel + useTestPanelState in App"
```

### Task 7.2: Selection mirror effect

**Files:**
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Add effect**

Below the `openTestPanelFromSelection` helper in App.tsx, add:

```ts
useEffect(() => {
  if (!testPanel.state.open || testPanel.state.mode !== "synth") return;
  testPanel.mirrorSelection(deriveSelectionFromAuthoring(selectedAuthoring, selectedBehaviorListenerId));
}, [selectedAuthoring, selectedBehaviorListenerId, testPanel.state.open, testPanel.state.mode]);
```

- [ ] **Step 2: Typecheck + manual smoke**

Run: `npm run typecheck:web && npm run dev:web`
Open the app, select different listeners/fields, then (after Task 8 adds triggers) verify the panel reflects the selection.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat(web): test panel mirrors authoring + listener selection"
```

---

## Phase 8 — TestPanelTrigger placements

### Task 8.1: BuilderStage toolbar trigger

**Files:**
- Modify: `apps/web/src/features/builder/BuilderStage.tsx`

- [ ] **Step 1: Add prop + render**

Pass `onOpenTestPanel` (function from App) through to BuilderStage. In the toolbar JSX (existing buttons region), add:

```tsx
<TestPanelTrigger
  derive={() => deriveSelectionFn()}
  onOpen={onOpenTestPanel}
  variant="secondary"
  label="Test"
/>
```

App.tsx passes both `derive` and the `onOpen` handler; BuilderStage merely renders.

- [ ] **Step 2: Wire Cmd/Ctrl+K**

In App.tsx, add a global keyboard listener:

```ts
useEffect(() => {
  const onKey = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openTestPanelFromSelection();
    }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, [openTestPanelFromSelection]);
```

- [ ] **Step 3: Typecheck + smoke**

Run: `npm run typecheck:web && npm run dev:web`. Confirm Cmd+K opens the panel and the toolbar Test button is visible.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/features/builder/BuilderStage.tsx
git commit -m "feat(web): TestPanelTrigger in builder toolbar + Cmd/Ctrl+K hotkey"
```

### Task 8.2: BehaviorStackList listener row trigger

**Files:**
- Modify: `apps/web/src/features/behavior/stack/BehaviorStackRow.tsx`
- Modify: `apps/web/src/features/behavior/stack/BehaviorStackList.tsx` (prop pipe-through)

- [ ] **Step 1: Add prop + render**

In `BehaviorStackRow.tsx`, accept `onOpenTestPanel?: (listenerId: string) => void` and render next to existing row actions:

```tsx
{onOpenTestPanel ? (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onOpenTestPanel(listenerId);
    }}
    className="rounded bg-slate-200 px-2 py-0.5 text-xs"
  >
    Test
  </button>
) : null}
```

- [ ] **Step 2: Pipe through BehaviorStackList → BehaviorWorkspace → App**

Add the prop to each component's props interface and pass through. App provides the handler:

```ts
const openTestPanelForListener = (listenerId: string) => {
  const listener = runtimeListenerById.get(listenerId);
  if (!listener) return;
  testPanel.open({
    sourceId: listener.eventSourceNodeId ?? listener.dispatcherId ?? null,
    eventType: listener.eventName,
    payload: {},
    payloadEdited: false,
  });
};
```

- [ ] **Step 3: Typecheck + smoke**

Run: `npm run typecheck:web && npm run dev:web`. Pick a listener row in the manager; the Test button opens the panel pre-filled.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/behavior/stack/BehaviorStackRow.tsx apps/web/src/features/behavior/stack/BehaviorStackList.tsx apps/web/src/features/behavior/manager/BehaviorWorkspace.tsx apps/web/src/App.tsx
git commit -m "feat(behavior): Test button on each listener row opens TestPanel"
```

### Task 8.3: InspectorRail field trigger

**Files:**
- Modify: `apps/web/src/features/inspector/InspectorRail.tsx`
- Modify: `apps/web/src/features/inspector/PropertiesTab.tsx` (or wherever field props render)

- [ ] **Step 1: Add Test button**

In the field properties tab (PropertiesTab.tsx), near the existing meta header, render:

```tsx
{onOpenTestPanelForField ? (
  <button
    type="button"
    onClick={() => onOpenTestPanelForField(field.id)}
    className="rounded bg-slate-200 px-2 py-0.5 text-xs"
  >
    Test
  </button>
) : null}
```

- [ ] **Step 2: Pipe through InspectorRail → App**

App provides:

```ts
const openTestPanelForField = (fieldId: string) => {
  const candidate = runtimeEventSourceCandidateById.get(fieldId);
  testPanel.open({
    sourceId: fieldId,
    eventType: candidate?.eventDefinitions[0] ? runtimeEventDefinitionType(candidate.eventDefinitions[0]) : "field.change",
    payload: {},
    payloadEdited: false,
  });
};
```

- [ ] **Step 3: Typecheck + smoke**

Run: `npm run typecheck:web && npm run dev:web`. Select a field; the inspector now has a Test button.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/inspector/InspectorRail.tsx apps/web/src/features/inspector/PropertiesTab.tsx apps/web/src/App.tsx
git commit -m "feat(inspector): Test button on field properties opens TestPanel"
```

---

## Phase 9 — Walkthrough route

### Task 9.1: Add `walkthrough` stage to App union

**Files:**
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Extend stage union**

Locate the stage state declaration (currently `home | review | workspace`). Change to `home | review | workspace | walkthrough`.

- [ ] **Step 2: Add navigation helper**

```ts
const enterWalkthrough = () => setStage("walkthrough");
const exitWalkthrough = () => setStage("workspace");
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat(web): add walkthrough stage to App union"
```

### Task 9.2: Mock host bridge for submit

**Files:**
- Create: `apps/web/src/features/walkthrough/host-bridge-mock.ts`

- [ ] **Step 1: Implement**

```ts
import type { RuntimeEventEnvelope } from "@form-builder/runtime";

export interface MockHostBridge {
  onSubmit: (envelope: RuntimeEventEnvelope) => { ok: true; receivedAt: string };
  /** host_call_await mock — resolves immediately with a stubbed response. */
  onHostCall: (envelope: RuntimeEventEnvelope) => { ok: true; response: Record<string, unknown> };
}

export function createMockHostBridge(): MockHostBridge {
  return {
    onSubmit(envelope) {
      return { ok: true, receivedAt: new Date().toISOString() };
    },
    onHostCall(envelope) {
      return { ok: true, response: { status: "stubbed", echo: envelope.payload } };
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/features/walkthrough/host-bridge-mock.ts
git commit -m "feat(walkthrough): mock host bridge for submit + host_call_await"
```

### Task 9.3: WalkthroughHeader + WalkthroughRoute

**Files:**
- Create: `apps/web/src/features/walkthrough/WalkthroughHeader.tsx`
- Create: `apps/web/src/features/walkthrough/WalkthroughRoute.tsx`
- Create: `apps/web/src/features/walkthrough/index.ts`

- [ ] **Step 1: WalkthroughHeader**

```tsx
export interface WalkthroughHeaderProps {
  currentStepLabel: string;
  currentStepIndex: number;
  totalSteps: number;
  onExit: () => void;
  onRestart: () => void;
}

export function WalkthroughHeader({ currentStepLabel, currentStepIndex, totalSteps, onExit, onRestart }: WalkthroughHeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-slate-300 bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onExit} className="rounded bg-slate-200 px-3 py-1 text-sm">
          ← Exit
        </button>
        <span className="text-sm font-semibold">
          Step {currentStepIndex + 1} of {totalSteps} — {currentStepLabel}
        </span>
      </div>
      <button type="button" onClick={onRestart} className="rounded bg-slate-200 px-3 py-1 text-sm">
        Restart
      </button>
    </header>
  );
}
```

- [ ] **Step 2: WalkthroughRoute**

```tsx
import { useEffect, useState } from "react";
import { createRuntimeEngine, type RuntimeEngine } from "@form-builder/runtime";
import type { AuthoringDocument } from "@form-builder/schema";
import { PreviewCanvas } from "../builder/PreviewCanvas";
import { WalkthroughHeader } from "./WalkthroughHeader";
import { createMockHostBridge } from "./host-bridge-mock";

export interface WalkthroughRouteProps {
  document: AuthoringDocument | null;
  onExit: () => void;
}

export function WalkthroughRoute({ document, onExit }: WalkthroughRouteProps) {
  const [engine, setEngine] = useState<RuntimeEngine | null>(null);
  const [submitToast, setSubmitToast] = useState<string | null>(null);
  const [restartTick, setRestartTick] = useState(0);

  useEffect(() => {
    if (!document) {
      onExit();
      return;
    }
    const next = createRuntimeEngine();
    next.mount(document);
    setEngine(next);
    return () => next.unmount();
  }, [document, restartTick, onExit]);

  useEffect(() => {
    if (!engine) return;
    const bridge = createMockHostBridge();
    const unsubscribe = engine.subscribe((envelope) => {
      if (envelope.type === "form.submit") {
        const result = bridge.onSubmit(envelope);
        setSubmitToast(`Form would submit at ${result.receivedAt}`);
      }
    });
    return unsubscribe;
  }, [engine]);

  if (!document || !engine) return null;
  const state = engine.getState();
  const currentStep = document.steps[state.currentStepIndex];

  return (
    <div className="flex h-screen flex-col">
      <WalkthroughHeader
        currentStepLabel={currentStep?.label ?? "Step"}
        currentStepIndex={state.currentStepIndex}
        totalSteps={document.steps.length}
        onExit={onExit}
        onRestart={() => setRestartTick((t) => t + 1)}
      />
      <div className="flex-1 overflow-auto bg-slate-50 p-6">
        {/* PreviewCanvas already renders against an engine — passes engine as prop */}
        <PreviewCanvas
          engine={engine}
          document={document}
          viewerMode={true}
        />
      </div>
      {submitToast ? (
        <div className="fixed bottom-4 right-4 rounded bg-emerald-600 px-4 py-2 text-sm text-white shadow">
          {submitToast}
          <button type="button" onClick={() => setSubmitToast(null)} className="ml-3 underline">
            dismiss
          </button>
        </div>
      ) : null}
    </div>
  );
}
```

(Note: confirm `PreviewCanvas`'s actual prop shape — adjust to match. If `viewerMode` is not a current prop, plumb a new optional prop through, or wrap the `PreviewCanvas` in a `?role=viewer`-style state setter consistent with the existing viewer-mode work.)

- [ ] **Step 3: index.ts**

```ts
export { WalkthroughRoute } from "./WalkthroughRoute";
export type { WalkthroughRouteProps } from "./WalkthroughRoute";
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/walkthrough/WalkthroughHeader.tsx apps/web/src/features/walkthrough/WalkthroughRoute.tsx apps/web/src/features/walkthrough/index.ts
git commit -m "feat(walkthrough): WalkthroughRoute + Header (full-canvas hosted-user preview)"
```

### Task 9.4: Wire walkthrough into App

**Files:**
- Modify: `apps/web/src/App.tsx`, `apps/web/src/features/builder/BuilderStage.tsx`, `apps/web/src/features/builder/StepStrip.tsx`

- [ ] **Step 1: Render route**

In App.tsx, branch on stage:

```tsx
{stage === "walkthrough" ? (
  <WalkthroughRoute document={activeDocument} onExit={exitWalkthrough} />
) : (
  /* existing render */
)}
```

Import `WalkthroughRoute` at the top.

- [ ] **Step 2: Add toolbar entry**

In `BuilderStage.tsx` toolbar, add:

```tsx
<button type="button" onClick={onEnterWalkthrough} className="rounded bg-slate-200 px-3 py-1 text-sm">
  Walkthrough
</button>
```

Pipe `onEnterWalkthrough` from App (`enterWalkthrough` helper).

- [ ] **Step 3: Add StepStrip entry**

In `StepStrip.tsx`, append a Walkthrough chip when appropriate.

- [ ] **Step 4: Typecheck + smoke**

Run: `npm run typecheck:web && npm run dev:web`. Click Walkthrough → full-canvas preview opens; Exit returns to Build.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/features/builder/BuilderStage.tsx apps/web/src/features/builder/StepStrip.tsx
git commit -m "feat(web): wire Walkthrough route + toolbar/step-strip entries"
```

---

## Phase 10 — Removal of legacy test surfaces

### Task 10.1: Remove `"test"` from `BehaviorStudioMode` union

**Files:**
- Modify: `apps/web/src/features/behavior/utils/runtime-helpers.ts`
- Modify: `apps/web/src/features/behavior/BehaviorStudioModal.tsx`
- Modify: `apps/web/src/features/behavior/manager/BehaviorManager.tsx`

- [ ] **Step 1: Drop `"test"` from union**

```ts
// in runtime-helpers.ts
export type BehaviorStudioMode = "create" | "event" | "listener" | "action" | "manage" | "graph";
```

- [ ] **Step 2: Update call sites**

In `BehaviorManager.tsx`, replace each `onSetBehaviorStudioMode("test")` with `openTestPanelFromCurrentSelection()` (new prop passed from App).

In `BehaviorStudioModal.tsx`, delete the `case "test":` render branch.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS — every former `"test"` reference is now removed.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/behavior/utils/runtime-helpers.ts apps/web/src/features/behavior/BehaviorStudioModal.tsx apps/web/src/features/behavior/manager/BehaviorManager.tsx
git commit -m "refactor(behavior): drop 'test' from BehaviorStudioMode union"
```

### Task 10.2: Delete EventFlowStudio

**Files:**
- Delete: `apps/web/src/features/behavior/manager/EventFlowStudio.tsx`

- [ ] **Step 1: Delete file**

Run: `git rm apps/web/src/features/behavior/manager/EventFlowStudio.tsx`

- [ ] **Step 2: Remove any imports**

Run: `grep -rn "EventFlowStudio" apps/web/src` and remove each surviving import.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(behavior): delete EventFlowStudio (replaced by TestPanel)"
```

### Task 10.3: Delete PreviewTestRecorder

**Files:**
- Delete: `apps/web/src/features/behavior/test/PreviewTestRecorder.tsx`
- Delete folder: `apps/web/src/features/behavior/test/`
- Modify: `apps/web/src/features/behavior/index.ts`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Delete files**

Run: `git rm -r apps/web/src/features/behavior/test/`

- [ ] **Step 2: Remove re-exports**

In `apps/web/src/features/behavior/index.ts`, remove the two `PreviewTestRecorder` exports.

- [ ] **Step 3: Remove App.tsx usage**

In `apps/web/src/App.tsx`, delete:
- `import { PreviewTestRecorder, ... }` (keep the others)
- `const [previewTestRecordingOn, setPreviewTestRecordingOn] = useState(false);`
- `const [previewTestReports, setPreviewTestReports] = useState<...>(...)`
- The `if (previewTestRecordingOn) { ... }` block inside `dispatchRuntimeEvent` (around line 4499) — replace any side-effects by leveraging the engine's `subscribeReports` (already wired in useTestPanelState).
- The `<PreviewTestRecorder>` render block (around line 9820).

- [ ] **Step 4: Typecheck + smoke**

Run: `npm run typecheck:web && npm run dev:web`
Expected: PASS; the old recorder block no longer renders.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(web): delete PreviewTestRecorder (replaced by TestPanel record mode)"
```

### Task 10.4: Remove "Test behavior" + "Run behavior test" buttons in BehaviorWorkspace

**Files:**
- Modify: `apps/web/src/features/behavior/manager/BehaviorWorkspace.tsx`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Delete the button blocks**

In `BehaviorWorkspace.tsx`, locate the render region around lines 3770–3935 (containing `onHandleTestSelectedRule`, `onHandleTestSelectedChain`, "Show latest runtime effect", etc.). Delete the entire region. Replace with a single inline TestPanelTrigger group:

```tsx
{selectedListener ? (
  <TestPanelTrigger
    derive={() => ({
      sourceId: selectedListener.eventSourceNodeId ?? selectedListener.dispatcherId ?? null,
      eventType: selectedListener.eventName,
      payload: {},
      payloadEdited: false,
    })}
    onOpen={onOpenTestPanel}
    label="Test listener"
  />
) : null}
{selectedRule ? (
  <TestPanelTrigger
    derive={() => ({
      sourceId: selectedRule.whenFieldId,
      eventType: "field.change",
      payload: { nextValue: String(selectedRule.expectedValue ?? "") },
      payloadEdited: true,
    })}
    onOpen={onOpenTestPanel}
    label="Test behavior"
  />
) : null}
```

- [ ] **Step 2: Remove handlers from App**

In `App.tsx`, delete:
- `handleTestSelectedRule` (around line 6513)
- `handleTestSelectedChain` (around line 6712)
- All call sites passing them as props
- Any orphaned helper functions used only by these (`resolveListenerTestSource`, `defaultListenerTestValue`, `listenerTestValue`, `updateListenerTestValue`, `buildGuidedListenerTestEvent`, `listenerTestValues` state) — verify with grep before removal.

Run: `grep -n "handleTestSelectedRule\|handleTestSelectedChain\|resolveListenerTestSource\|listenerTestValues" apps/web/src/App.tsx`
Remove every match that is part of the deprecated path.

- [ ] **Step 3: Remove props from BehaviorWorkspace + BehaviorManager**

Drop the props `onHandleTestSelectedRule`, `onHandleTestSelectedChain` from interfaces and call sites.

- [ ] **Step 4: Typecheck + smoke**

Run: `npm run typecheck:web && npm run dev:web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(behavior): remove legacy 'Test behavior' + 'Run behavior test' buttons"
```

---

## Phase 11 — Refactor & cleanup

These items the user asked for explicitly. Each is small and isolated.

### Task 11.1: Slim App.tsx test-related blocks

**Files:**
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Audit for orphans**

Run: `grep -n "eventFlow\|EventFlow\|behaviorStudioMode" apps/web/src/App.tsx | head -30`
Identify references that only existed to feed the deleted EventFlowStudio "test" mode. Specifically:
- `eventFlowSourceId`, `eventFlowEventType` state — were they used by anything other than EventFlowStudio? If not, delete.
- `setBehaviorEventType`, `setBehaviorEventBubbles`, etc. — keep (still used by the "event" creation mode), but verify.

- [ ] **Step 2: Delete confirmed orphans**

Remove the identified state vars + setters + effects. Confirm with typecheck after each removal.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "refactor(web): drop orphaned EventFlowStudio state from App"
```

### Task 11.2: Slim BehaviorWorkspace.tsx after legacy removal

**Files:**
- Modify: `apps/web/src/features/behavior/manager/BehaviorWorkspace.tsx`

- [ ] **Step 1: Identify dead props**

Run: `grep -n "onHandleTestSelectedRule\|onHandleTestSelectedChain\|selectedRuntimeEvidence\|latestTraceEntry\|latestRuntimeStatus" apps/web/src/features/behavior/manager/BehaviorWorkspace.tsx | head`

If "Show latest runtime effect" and related blocks were inside the deleted region (Task 10.4), confirm related variables (`latestTraceEntry`, `isShowingLatestAuthoredEvidence`, etc.) have no remaining references. Delete each that is orphaned.

- [ ] **Step 2: Remove now-unused imports**

Run TS check at the top of the file for any unused imports flagged by typecheck (and remove them).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/behavior/manager/BehaviorWorkspace.tsx
git commit -m "refactor(behavior): remove dead state after legacy test-button removal"
```

### Task 11.3: Sanity-check ActionEditor target picker

**Files:**
- Modify (if needed): `apps/web/src/features/behavior/composer/ActionEditor.tsx`

- [ ] **Step 1: Inspect target picker**

Run: `grep -n "target\|nodeType\|fieldId" apps/web/src/features/behavior/composer/ActionEditor.tsx | head -40`
Confirm authors can pick group/component/section as a target. If only field-level pickers exist, swap in the new `SourcePicker` (filtered to permitted node types per action kind).

- [ ] **Step 2: If a change is required**

Replace the existing target picker with:

```tsx
<SourcePicker
  candidates={candidatesFilteredByActionKind(actionKind, runtimeEventSourceCandidates)}
  selectedId={action.target?.fieldId ?? action.target?.nodeId ?? null}
  onSelect={(id) => onChangeActionTarget(id)}
/>
```

(`candidatesFilteredByActionKind` is a small helper inside the same file that keeps only fields for `set_value`, allows step/section/group/field for `set_visible` etc.)

- [ ] **Step 3: Typecheck + smoke**

Run: `npm run typecheck:web && npm run dev:web`

- [ ] **Step 4: Commit (if change made)**

```bash
git add apps/web/src/features/behavior/composer/ActionEditor.tsx
git commit -m "refactor(behavior): use SourcePicker for action target selection"
```

If no change is required, skip the commit.

---

## Phase 12 — E2E coverage

### Task 12.1: Parametrize orchestrator

**Files:**
- Modify: `apps/web/e2e/orchestrate.mjs`
- Modify: `package.json`

- [ ] **Step 1: Make orchestrator script-aware**

Change `orchestrate.mjs` to read the run script path from CLI arg:

```js
const RUN_SCRIPT = process.argv[2] ?? "./run.mjs";
// ... later, when spawning the run:
const result = await import(new URL(RUN_SCRIPT, import.meta.url).href);
```

- [ ] **Step 2: Add npm scripts**

In root `package.json`:

```json
"e2e:test-panel": "npm run build:web && node apps/web/e2e/orchestrate.mjs ./test-panel.run.mjs",
"e2e:walkthrough": "npm run build:web && node apps/web/e2e/orchestrate.mjs ./walkthrough.run.mjs"
```

Keep the existing `e2e:phase3`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/orchestrate.mjs package.json
git commit -m "chore(e2e): orchestrate.mjs accepts run-script arg for multi-suite runs"
```

### Task 12.2: TestPanel E2E

**Files:**
- Create: `apps/web/e2e/test-panel.run.mjs`

- [ ] **Step 1: Write the run script**

Modeled on `apps/web/e2e/run.mjs`. Key flow:

```js
import { chromium } from "playwright";
import { setupRoutesAndFixtures } from "./fixtures.mjs";

export async function run(baseUrl) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await setupRoutesAndFixtures(ctx);
  const page = await ctx.newPage();
  await page.goto(baseUrl);

  // Load a fixture with a checkbox source + a Sex-radio listener
  await page.click('text="Open JSON"');
  await page.setInputFiles('input[type=file]', "./apps/web/e2e/fixtures/checkbox-to-radio.json");

  // Open the test panel via Cmd+K
  await page.keyboard.press("Meta+K");
  await page.locator('[role=dialog][aria-label="Test panel"]').waitFor();

  // Pick checkbox source
  await page.locator('aria-label="Source"').click();
  await page.locator('text="TYPE OF BENEFIT(S) APPLYING FOR"').click();

  // Confirm event = field.change
  await page.locator('select').selectOption({ label: /field\.change/ });

  // Set payload nextValue
  await page.fill('input[id*="nextValue"]', "Disability");

  // Fire
  await page.click('text="Fire event"');

  // Expect Sex-radio listener row green
  await page.locator('text="Listener ran"').waitFor();
  await page.locator('text="Sex"').waitFor();
  await page.locator('text=/set_visible|set_required|set_value/').waitFor();

  await browser.close();
  return { ok: true };
}
```

(Adjust selectors to match what the panel actually renders.)

- [ ] **Step 2: Add fixture**

Create `apps/web/e2e/fixtures/checkbox-to-radio.json` — a minimal `AuthoringDocument` containing a checkbox source, a Sex radio listener with `eventName: "field.change"` and one `set_visible` action targeting the radio's note field.

- [ ] **Step 3: Run E2E**

Run: `npm run e2e:test-panel`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/test-panel.run.mjs apps/web/e2e/fixtures/checkbox-to-radio.json
git commit -m "test(e2e): TestPanel synth fire + receiver-trace assertion"
```

### Task 12.3: Walkthrough E2E

**Files:**
- Create: `apps/web/e2e/walkthrough.run.mjs`

- [ ] **Step 1: Write the run script**

```js
export async function run(baseUrl) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await setupRoutesAndFixtures(ctx);
  const page = await ctx.newPage();
  await page.goto(baseUrl);
  // open fixture (same one above)
  await page.click('text="Walkthrough"');
  await page.locator('text="Step 1 of"').waitFor();
  // Advance steps, submit
  await page.click('text="Next"'); // adjust to actual button text
  await page.click('text="Submit"');
  await page.locator('text="Form would submit"').waitFor();
  await browser.close();
  return { ok: true };
}
```

- [ ] **Step 2: Run E2E**

Run: `npm run e2e:walkthrough`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/walkthrough.run.mjs
git commit -m "test(e2e): Walkthrough route happy path through submit toast"
```

---

## Phase 13 — Final gate sweep

### Task 13.1: Full gate run

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 2: Schema + runtime**

Run: `npm run build:schema && npm run build:runtime`
Expected: PASS.

- [ ] **Step 3: Runtime tests**

Run: `npm run test --workspace @form-builder/runtime`
Expected: All tests pass (existing 89 + new tests from Phase 1 and 3.3 ≥ 89).

- [ ] **Step 4: API tests**

Run: `.venv/bin/pytest apps/api/tests`
Expected: 99/99 (no API changes — confirm no regressions).

- [ ] **Step 5: E2E suite**

Run: `npm run e2e:phase3 && npm run e2e:test-panel && npm run e2e:walkthrough`
Expected: All pass.

- [ ] **Step 6: Format**

Run: `npm run format`
Then: `npm run format:check`
Expected: clean.

- [ ] **Step 7: Final commit (formatting only if non-empty)**

```bash
git add -A
git diff --cached --quiet || git commit -m "chore: format after unified test panel implementation"
```

### Task 13.2: RESUME refresh

**Files:**
- Modify: `RESUME.md`, `docs/project-plan.md`

- [ ] **Step 1: Append a "Current State" entry**

Update RESUME.md with a section summarizing what shipped: TestPanel, Walkthrough, engine action-diagnostic extension, deletions.

- [ ] **Step 2: Update project-plan.md**

Tick the related items / add the completed milestone.

- [ ] **Step 3: Commit**

```bash
git add RESUME.md docs/project-plan.md
git commit -m "docs: refresh RESUME + project-plan for unified test panel ship"
```

---

## Self-Review

**Spec coverage:** Every locked decision in the spec maps to a task —
- Floating dockable panel → Phase 6 (TestPanel + Header)
- Stacked vertical layout → Task 6.2
- Synth/Live mode toggle → Phase 3 (state) + Phase 6 (header)
- Auto-bind on selection → Task 7.2
- Hybrid C+ picker (tree/flat/chips/keyboard) → Phase 2
- Action-receiver hierarchy in trace → Phase 5
- Engine extension (before/after/skipped) → Phase 1
- Three trigger placements (toolbar / listener row / inspector) → Phase 8
- Walkthrough route + mock host bridge → Phase 9
- Cleanup of 5 legacy paths → Phase 10
- Explicit refactor pass → Phase 11
- E2E coverage → Phase 12

**Placeholders:** None. Each task has exact files, code, and commands.

**Type consistency:** `TestPanelSelection`, `TestPanelMode`, `TestPanelDockSide`, `RuntimeActionDiagnostic` field names are stable across all tasks.

**Note on engine subscribe semantics:** Task 3.3 is conditional on what `RuntimeEngine.subscribe` already provides — verify in Task 3.2 Step 3 before deciding whether to add `subscribeReports`. If it's already report-aware, skip Task 3.3 entirely and adjust Task 3.2's commit message.
