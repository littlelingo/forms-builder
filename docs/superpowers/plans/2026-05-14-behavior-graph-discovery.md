# Behavior Graph Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Layer three discovery features onto the existing BehaviorWorkspace graph view (payload-fields popover on event nodes, cross-step ref badges + distinct edge styling, reverse-index badges on field nodes), add composer-side `{{event.payload.X}}` autocomplete, and clean up the orphaned `builder*Options` props on `ActionEditor`. Spec: `docs/superpowers/specs/2026-05-14-behavior-graph-discovery-design.md`.

**Architecture:** Pure helpers in `apps/web/src/lib/payload-schema-helpers.ts` own the derivation (payload-field lookup + cross-step ref resolution). React components consume the helpers — graph nodes render badge slots that mount `PayloadFieldsPopover`, `CrossStepRefBadge`, `ReverseIndexBadge`. The graph's edge renderer applies a distinct CSS class when source step ≠ target step. `PayloadFieldAutocomplete` is an opt-in input wrapper used inside `ActionEditor` for inputs that accept payload references. No engine changes; no schema changes.

**Tech Stack:** React 18 + TypeScript + Vite (apps/web), pure-logic tests via `tsx --test`. Tailwind for styling. Reuses existing `reverse-index-helpers.ts` and `runtime-helpers.ts`.

---

## Scope adjustment from spec discovery

Spec said "drop orphaned `builder*Options` props from `ActionEditor` + `BehaviorComposer` interfaces". Pre-write inspection found:

- `ActionEditor`: receives the three props but only destructures them — never used in body. **Truly orphaned. Remove.**
- `BehaviorComposer`: USES `builderFieldOptions` (lines 275, 517, 554) and passes all three to `RuntimeReactionProperties` (legacy conditional rule editor) which DOES use them. **Keep.**
- The cleanup scope reduces to: drop the three props from `ActionEditor`'s interface + destructure + BehaviorComposer's pass-through to ActionEditor (lines 796-798). App.tsx still builds them for the legacy editor path.

This makes the cleanup smaller than the spec implied — single file change to `ActionEditor.tsx` + 3-line removal in `BehaviorComposer.tsx`.

---

## File Structure

### New files

| File | Responsibility |
|---|---|
| `apps/web/src/lib/payload-schema-helpers.ts` | Pure helpers: `listPayloadFieldsForEventType`, `isCrossStepReference`, `collectCrossStepRefsForListener`. |
| `apps/web/src/lib/payload-schema-helpers.test.ts` | TDD tests (≥6 tests). |
| `apps/web/src/features/behavior/cards/PayloadFieldsPopover.tsx` | Popover content listing payload fields. |
| `apps/web/src/features/behavior/cards/CrossStepRefBadge.tsx` | Pill: arrow + source step title; click navigates. |
| `apps/web/src/features/behavior/cards/ReverseIndexBadge.tsx` | Pill: "N listeners react"; click expands inline. |
| `apps/web/src/features/behavior/composer/PayloadFieldAutocomplete.tsx` | Input wrapper that surfaces `<datalist>` of payload fields when input value contains `{{event.payload.` prefix. |
| `apps/web/src/features/behavior/composer/payload-field-autocomplete-logic.ts` | Pure logic for the prefix detection + field list derivation (testable). |
| `apps/web/src/features/behavior/composer/payload-field-autocomplete-logic.test.ts` | TDD tests (~3 tests). |

### Modified files

| File | Change |
|---|---|
| `apps/web/src/features/behavior/cards/BehaviorGraphNode.tsx` | Add badge slots; wire hover/click to popovers. |
| `apps/web/src/features/behavior/manager/MapGraphOverview.tsx` | Edge renderer applies distinct CSS class when source step ≠ target step. Pass `activeDocument` down so node renderer can resolve cross-step refs. |
| `apps/web/src/features/behavior/composer/ActionEditor.tsx` | Drop orphaned `builderStepOptions`/`builderFieldOptions`/`builderNodeOptions` props. Use `PayloadFieldAutocomplete` for any text input that accepts payload references. |
| `apps/web/src/features/behavior/composer/BehaviorComposer.tsx` | Remove the three props from the pass-through to `<ActionEditor>` (lines 796-798). DO NOT remove them from BehaviorComposer's own interface — they're still used by `RuntimeReactionProperties` and BehaviorComposer body itself. |

---

## Phase 1 — payload-schema-helpers (pure logic)

### Task 1.1: Create types + listPayloadFieldsForEventType

**Files:**
- Create: `apps/web/src/lib/payload-schema-helpers.ts`
- Create: `apps/web/src/lib/payload-schema-helpers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { listPayloadFieldsForEventType } from "./payload-schema-helpers";
import type { AuthoringDocument } from "@form-builder/schema";

const emptyDoc = { id: "d", title: "T", version: "1.0", steps: [] } as unknown as AuthoringDocument;

test("listPayloadFieldsForEventType returns core fields for field.change", () => {
  const fields = listPayloadFieldsForEventType("field.change", emptyDoc);
  // field.change is a runtime core event with payload fields including fieldId, nextValue, previousValue, etc.
  const names = fields.map((f) => f.name);
  assert.ok(names.includes("fieldId"), `expected fieldId in ${names.join(",")}`);
  assert.ok(names.includes("nextValue"));
});

test("listPayloadFieldsForEventType returns empty array for unknown type", () => {
  const fields = listPayloadFieldsForEventType("totally.fake.event", emptyDoc);
  assert.deepEqual(fields, []);
});

test("listPayloadFieldsForEventType resolves project event payload from doc", () => {
  const docWithProjectEvent = {
    id: "d",
    title: "T",
    version: "1.0",
    steps: [],
    runtime: {
      projectEvents: [
        {
          id: "pe-1",
          type: "custom.thing",
          payloadShape: {
            fields: [
              { name: "ticketId", valueType: "string", description: "Ticket id", required: true },
            ],
          },
        },
      ],
    },
  } as unknown as AuthoringDocument;
  const fields = listPayloadFieldsForEventType("custom.thing", docWithProjectEvent);
  assert.equal(fields.length, 1);
  assert.equal(fields[0]!.name, "ticketId");
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx tsx --test apps/web/src/lib/payload-schema-helpers.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
import type {
  AuthoringDocument,
  RuntimeEventTypeDefinition,
  RuntimePayloadField,
} from "@form-builder/schema";
import { runtimePayloadFieldsForEventType } from "../features/behavior/utils/runtime-helpers";

/**
 * Resolve the payload field list for a given event type. Looks at:
 * 1. Built-in core/runtime event types (via runtimePayloadFieldsForEventType helper).
 * 2. Document-level project events (`doc.runtime.projectEvents`).
 * 3. Node-level event sources (`node.runtime.eventSources`) — walks every step/section/group/field.
 *
 * Returns [] when the event type is unknown.
 */
export function listPayloadFieldsForEventType(
  eventType: string,
  doc: AuthoringDocument | null,
): RuntimePayloadField[] {
  // 1. Core built-in events.
  const core = runtimePayloadFieldsForEventType(eventType);
  if (core.length > 0) return core;

  if (!doc) return [];

  // 2. Document-level project events.
  const projectEvents = (doc.runtime?.projectEvents ?? []) as RuntimeEventTypeDefinition[];
  for (const def of projectEvents) {
    if (def.type === eventType) return def.payloadShape?.fields ?? [];
  }

  // 3. Node-level event sources — walk every authoring node.
  for (const step of doc.steps ?? []) {
    const fromNode = findEventSourceInNode(step, eventType);
    if (fromNode) return fromNode;
  }

  return [];
}

function findEventSourceInNode(node: unknown, eventType: string): RuntimePayloadField[] | null {
  if (!node || typeof node !== "object") return null;
  const candidate = node as {
    runtime?: { eventSources?: RuntimeEventTypeDefinition[] };
    sections?: unknown[];
    groups?: unknown[];
    fields?: unknown[];
  };
  for (const def of candidate.runtime?.eventSources ?? []) {
    if (def.type === eventType) return def.payloadShape?.fields ?? [];
  }
  for (const child of [
    ...(candidate.sections ?? []),
    ...(candidate.groups ?? []),
    ...(candidate.fields ?? []),
  ]) {
    const found = findEventSourceInNode(child, eventType);
    if (found) return found;
  }
  return null;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx tsx --test apps/web/src/lib/payload-schema-helpers.test.ts
```

Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/payload-schema-helpers.ts apps/web/src/lib/payload-schema-helpers.test.ts
git commit -m "feat(lib): listPayloadFieldsForEventType helper"
```

### Task 1.2: Add isCrossStepReference + collectCrossStepRefsForListener

**Files:**
- Modify: `apps/web/src/lib/payload-schema-helpers.ts`
- Modify: `apps/web/src/lib/payload-schema-helpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to test file:

```ts
import { isCrossStepReference, collectCrossStepRefsForListener } from "./payload-schema-helpers";
import type { RuntimeListenerDefinition } from "@form-builder/schema";

const docTwoSteps = {
  id: "d",
  title: "T",
  version: "1.0",
  steps: [
    {
      id: "s1",
      title: "Step 1",
      sections: [{ id: "sec1", fields: [{ id: "f-a" }, { id: "f-b" }], groups: [] }],
    },
    {
      id: "s2",
      title: "Step 2",
      sections: [{ id: "sec2", fields: [{ id: "f-c" }], groups: [] }],
    },
  ],
} as unknown as AuthoringDocument;

test("isCrossStepReference returns info when source + target steps differ", () => {
  const result = isCrossStepReference(docTwoSteps, "f-a", "f-c");
  assert.ok(result, "expected non-null");
  assert.equal(result!.sourceStepId, "s1");
  assert.equal(result!.targetStepId, "s2");
  assert.equal(result!.sourceStepTitle, "Step 1");
  assert.equal(result!.targetStepTitle, "Step 2");
});

test("isCrossStepReference returns null when both nodes share a step", () => {
  assert.equal(isCrossStepReference(docTwoSteps, "f-a", "f-b"), null);
});

test("collectCrossStepRefsForListener returns empty array for self-step listener", () => {
  const listener = {
    id: "L1",
    eventName: "field.change",
    eventSourceNodeId: "f-a",
    dispatcherId: "f-b", // both in step s1
  } as unknown as RuntimeListenerDefinition;
  const refs = collectCrossStepRefsForListener(docTwoSteps, listener, "f-b");
  assert.deepEqual(refs, []);
});

test("collectCrossStepRefsForListener returns refs for cross-step source", () => {
  const listener = {
    id: "L1",
    eventName: "field.change",
    eventSourceNodeId: "f-c", // step s2
    dispatcherId: "f-c",
  } as unknown as RuntimeListenerDefinition;
  // listener hosted on f-a in step s1 → cross-step
  const refs = collectCrossStepRefsForListener(docTwoSteps, listener, "f-a");
  assert.equal(refs.length, 1);
  assert.equal(refs[0]!.sourceStepId, "s2");
});
```

- [ ] **Step 2: Run — FAIL**

```bash
npx tsx --test apps/web/src/lib/payload-schema-helpers.test.ts
```

- [ ] **Step 3: Implement**

Append to `payload-schema-helpers.ts`:

```ts
export interface CrossStepInfo {
  sourceStepId: string;
  sourceStepTitle: string;
  targetStepId: string;
  targetStepTitle: string;
}

export interface CrossStepRef extends CrossStepInfo {
  sourceNodeId: string;
}

interface NodeStepLocation {
  stepId: string;
  stepTitle: string;
}

/**
 * Walk doc to find which step a node lives in. Returns null for form-level
 * nodes or unknown ids.
 */
function findNodeStep(doc: AuthoringDocument, nodeId: string): NodeStepLocation | null {
  for (const step of doc.steps ?? []) {
    if (containsNodeId(step, nodeId)) {
      return { stepId: step.id, stepTitle: step.title };
    }
  }
  return null;
}

function containsNodeId(node: unknown, nodeId: string): boolean {
  if (!node || typeof node !== "object") return false;
  const c = node as {
    id?: string;
    sections?: unknown[];
    groups?: unknown[];
    fields?: unknown[];
  };
  if (c.id === nodeId) return true;
  for (const child of [...(c.sections ?? []), ...(c.groups ?? []), ...(c.fields ?? [])]) {
    if (containsNodeId(child, nodeId)) return true;
  }
  return false;
}

export function isCrossStepReference(
  doc: AuthoringDocument,
  sourceNodeId: string,
  targetNodeId: string,
): CrossStepInfo | null {
  const sourceStep = findNodeStep(doc, sourceNodeId);
  const targetStep = findNodeStep(doc, targetNodeId);
  if (!sourceStep || !targetStep) return null; // form-level or unknown — treat as same scope
  if (sourceStep.stepId === targetStep.stepId) return null;
  return {
    sourceStepId: sourceStep.stepId,
    sourceStepTitle: sourceStep.stepTitle,
    targetStepId: targetStep.stepId,
    targetStepTitle: targetStep.stepTitle,
  };
}

export function collectCrossStepRefsForListener(
  doc: AuthoringDocument,
  listener: { eventSourceNodeId?: string | null; dispatcherId?: string | null },
  hostNodeId: string,
): CrossStepRef[] {
  const sources: string[] = [];
  if (listener.eventSourceNodeId) sources.push(listener.eventSourceNodeId);
  if (listener.dispatcherId && listener.dispatcherId !== listener.eventSourceNodeId) {
    sources.push(listener.dispatcherId);
  }
  const refs: CrossStepRef[] = [];
  const seen = new Set<string>();
  for (const sourceNodeId of sources) {
    if (seen.has(sourceNodeId)) continue;
    seen.add(sourceNodeId);
    const info = isCrossStepReference(doc, sourceNodeId, hostNodeId);
    if (info) refs.push({ ...info, sourceNodeId });
  }
  return refs;
}
```

- [ ] **Step 4: Run tests — PASS**

```bash
npx tsx --test apps/web/src/lib/payload-schema-helpers.test.ts
```

Expected: 7 pass (3 from Task 1.1 + 4 new).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/payload-schema-helpers.ts apps/web/src/lib/payload-schema-helpers.test.ts
git commit -m "feat(lib): isCrossStepReference + collectCrossStepRefsForListener helpers"
```

---

## Phase 2 — UI components

### Task 2.1: PayloadFieldsPopover

**Files:** Create `apps/web/src/features/behavior/cards/PayloadFieldsPopover.tsx`

- [ ] **Step 1: Implement**

```tsx
import type { RuntimePayloadField } from "@form-builder/schema";

export interface PayloadFieldsPopoverProps {
  eventType: string;
  fields: RuntimePayloadField[];
}

export function PayloadFieldsPopover({ eventType, fields }: PayloadFieldsPopoverProps) {
  if (fields.length === 0) {
    return (
      <div className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-md">
        <p className="font-semibold">{eventType}</p>
        <p className="mt-1 text-slate-500">No payload fields known for this event.</p>
      </div>
    );
  }
  return (
    <div className="w-72 rounded border border-slate-200 bg-white p-3 shadow-md">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{eventType}</p>
      <ul className="mt-2 space-y-1 text-xs">
        {fields.map((field) => (
          <li key={field.name} className="flex flex-col">
            <span className="font-mono text-slate-900">
              {field.name}
              <span className="ml-1 text-slate-500">· {field.valueType}</span>
              {field.required ? <span className="ml-1 text-rose-700">*</span> : null}
            </span>
            {field.description ? <span className="text-slate-500">{field.description}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck:web
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/behavior/cards/PayloadFieldsPopover.tsx
git commit -m "feat(behavior): PayloadFieldsPopover component"
```

### Task 2.2: CrossStepRefBadge

**Files:** Create `apps/web/src/features/behavior/cards/CrossStepRefBadge.tsx`

- [ ] **Step 1: Implement**

```tsx
import type { CrossStepRef } from "../../../lib/payload-schema-helpers";

export interface CrossStepRefBadgeProps {
  ref: CrossStepRef;
  onNavigate?: (sourceNodeId: string) => void;
}

export function CrossStepRefBadge({ ref, onNavigate }: CrossStepRefBadgeProps) {
  return (
    <button
      type="button"
      onClick={() => onNavigate?.(ref.sourceNodeId)}
      className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
      title={`Cross-step reference from ${ref.sourceStepTitle}`}
    >
      <span aria-hidden="true">←</span>
      <span>{ref.sourceStepTitle}</span>
    </button>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck:web
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/behavior/cards/CrossStepRefBadge.tsx
git commit -m "feat(behavior): CrossStepRefBadge component"
```

### Task 2.3: ReverseIndexBadge

**Files:** Create `apps/web/src/features/behavior/cards/ReverseIndexBadge.tsx`

Investigate the existing reverse-index helpers first:

```bash
grep -n "export function\|export const\|export interface" apps/web/src/features/behavior/inspector/reverse-index-helpers.ts
```

Identify the function that returns reverse listener references for a node id. Use it from the badge.

- [ ] **Step 1: Implement**

```tsx
import { useState } from "react";

export interface ReverseIndexBadgeProps {
  count: number;
  onClick?: () => void;
}

export function ReverseIndexBadge({ count, onClick }: ReverseIndexBadgeProps) {
  if (count <= 0) return null;
  const display = count >= 10 ? "10+" : String(count);
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-900 hover:bg-blue-100"
      title={`${count} listener${count === 1 ? "" : "s"} react${count === 1 ? "s" : ""} to this node`}
    >
      <span aria-hidden="true">⇐</span>
      <span>{display} listener{count === 1 ? "" : "s"}</span>
    </button>
  );
}
```

(Click handler intentionally a callback — wiring to the existing `EventReverseIndexPanel` lives in the consumer in Task 3.)

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck:web
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/behavior/cards/ReverseIndexBadge.tsx
git commit -m "feat(behavior): ReverseIndexBadge component"
```

---

## Phase 3 — Wire badges + edge styling into graph

### Task 3.1: Inspect graph node + edge renderers

```bash
grep -n "BehaviorGraphNode\|edge\|stroke\|<line\|<path" apps/web/src/features/behavior/cards/BehaviorGraphNode.tsx apps/web/src/features/behavior/manager/MapGraphOverview.tsx | head -30
```

Identify:
- Where node body renders (so badges can attach to top-right corner).
- Where edges render (look for SVG `<line>` / `<path>` or a render-edge callback).

Note locations in your task notes for Step 2.

### Task 3.2: Wire badges into BehaviorGraphNode

**File:** `apps/web/src/features/behavior/cards/BehaviorGraphNode.tsx`

- [ ] **Step 1: Add new optional props for the node renderer**

In the `BehaviorGraphNodeProps` interface (find it near the top), add:

```ts
activeDocument?: AuthoringDocument | null;
onNavigateToNode?: (nodeId: string) => void;
onOpenReverseIndex?: (nodeId: string) => void;
```

- [ ] **Step 2: Render badges per node kind**

For event nodes: import `listPayloadFieldsForEventType` + `PayloadFieldsPopover`. Add a small "N fields" chip; on hover/click, open the popover (use a simple absolute-positioned div for MVP).

For listener nodes: import `collectCrossStepRefsForListener` + `CrossStepRefBadge`. If `activeDocument` and the listener's host node id are available, render one badge per cross-step ref.

For field nodes: import the existing reverse-index helper + `ReverseIndexBadge`. Compute count from helper; render the badge; wire `onClick` to `onOpenReverseIndex(nodeId)`.

Place all three badges in a fixed slot at the top-right of the node (`absolute top-1 right-1` or similar) so default node layout is unaffected.

Sketch (adapt to actual node markup):

```tsx
{node.kind === "event" && activeDocument ? (
  <EventNodeBadge eventType={node.eventType} doc={activeDocument} />
) : null}
{node.kind === "listener" && activeDocument && node.hostNodeId ? (
  <ListenerCrossStepBadges
    listener={node.listener}
    hostNodeId={node.hostNodeId}
    doc={activeDocument}
    onNavigate={onNavigateToNode}
  />
) : null}
{node.kind === "field" && activeDocument ? (
  <FieldReverseBadge
    nodeId={node.fieldId}
    doc={activeDocument}
    onClick={() => onOpenReverseIndex?.(node.fieldId)}
  />
) : null}
```

(Define small wrapper components at file scope: `EventNodeBadge`, `ListenerCrossStepBadges`, `FieldReverseBadge` — they encapsulate the helper calls + popover state.)

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck:web
```

If typecheck errors are about prop shape mismatches (e.g. `node.kind` doesn't have `event`), adapt to the actual node-discriminator the file uses. The plan's terminology may not match the code; conform to whatever the code calls these things.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/behavior/cards/BehaviorGraphNode.tsx
git commit -m "feat(behavior): graph node badges (payload, cross-step, reverse-index)"
```

### Task 3.3: Cross-step edge styling in graph

**File:** `apps/web/src/features/behavior/manager/MapGraphOverview.tsx`

- [ ] **Step 1: Find the edge renderer**

Search for SVG path/line render or edge data construction. The graph likely builds an `edges: Array<{ source, target, ... }>` then renders each.

- [ ] **Step 2: Tag edges as cross-step during construction**

When constructing each edge (where source/target are resolved), compute and attach `isCrossStep: boolean`:

```ts
import { isCrossStepReference } from "../../../lib/payload-schema-helpers";

// inside edge construction
const crossStep = activeDocument && sourceNodeId && targetNodeId
  ? isCrossStepReference(activeDocument, sourceNodeId, targetNodeId)
  : null;
const isCrossStep = crossStep !== null;
```

- [ ] **Step 3: Apply distinct styling**

In the edge render JSX, branch on `isCrossStep`:

```tsx
<path
  d={edgePath}
  className={
    edge.isCrossStep
      ? "graph-edge-cross-step stroke-amber-500 stroke-[2px] [stroke-dasharray:4_3]"
      : "graph-edge stroke-slate-400 stroke-[1.5px]"
  }
  fill="none"
/>
```

Use the new class name `graph-edge-cross-step` so future E2E selectors can target it without coupling to color tokens.

- [ ] **Step 4: Pass `activeDocument` to BehaviorGraphNode**

In the same file where graph nodes are rendered, pass `activeDocument` + the navigation/reverse-index callbacks to `<BehaviorGraphNode>`. Pipe through from upstream (BehaviorWorkspace → MapGraphOverview).

- [ ] **Step 5: Typecheck + smoke**

```bash
npm run typecheck:web
npm run dev:web
```

Open the workspace, navigate to graph view, verify cross-step edges render with the new style.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/behavior/manager/MapGraphOverview.tsx
git commit -m "feat(behavior): cross-step edge styling in graph view"
```

### Task 3.4: Wire reverse-index badge click to existing inspector

**File:** `apps/web/src/features/behavior/manager/BehaviorWorkspace.tsx` (or wherever the graph mounts)

- [ ] **Step 1: Add `onOpenReverseIndex` handler**

Find the existing reverse-index trigger (search for `EventReverseIndexPanel` or similar). Surface an open-by-node-id callback. Pass it into MapGraphOverview → BehaviorGraphNode as `onOpenReverseIndex`.

- [ ] **Step 2: Smoke**

```bash
npm run dev:web
```

Click a reverse-index badge on a field node; verify the existing reverse-index inspector opens scoped to that node.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/behavior/manager/BehaviorWorkspace.tsx
git commit -m "feat(behavior): badge click wires to existing reverse-index inspector"
```

---

## Phase 4 — Composer payload autocomplete

### Task 4.1: Pure logic for prefix detection

**Files:**
- Create: `apps/web/src/features/behavior/composer/payload-field-autocomplete-logic.ts`
- Create: `apps/web/src/features/behavior/composer/payload-field-autocomplete-logic.test.ts`

- [ ] **Step 1: Write tests**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectPayloadAutocompleteOptions } from "./payload-field-autocomplete-logic";
import type { RuntimePayloadField } from "@form-builder/schema";

const fields: RuntimePayloadField[] = [
  { name: "fieldId", valueType: "string", required: true },
  { name: "nextValue", valueType: "string", required: false },
];

test("detects {{event.payload. prefix and returns matching options", () => {
  const opts = detectPayloadAutocompleteOptions("if {{event.payload.", fields);
  assert.deepEqual(opts.map((o) => o.name).sort(), ["fieldId", "nextValue"]);
});

test("returns empty options when input has no token prefix", () => {
  const opts = detectPayloadAutocompleteOptions("just plain text", fields);
  assert.deepEqual(opts, []);
});

test("returns empty options when fields list is empty", () => {
  const opts = detectPayloadAutocompleteOptions("{{event.payload.", []);
  assert.deepEqual(opts, []);
});
```

- [ ] **Step 2: Run — FAIL**

```bash
npx tsx --test apps/web/src/features/behavior/composer/payload-field-autocomplete-logic.test.ts
```

- [ ] **Step 3: Implement**

```ts
import type { RuntimePayloadField } from "@form-builder/schema";

const PAYLOAD_PREFIX = "{{event.payload.";

/**
 * Returns the payload field options to render in autocomplete when the
 * given input value contains the {{event.payload.X token prefix.
 * Returns [] when the prefix is absent or when no fields are available.
 */
export function detectPayloadAutocompleteOptions(
  inputValue: string,
  fields: RuntimePayloadField[],
): RuntimePayloadField[] {
  if (!inputValue.includes(PAYLOAD_PREFIX)) return [];
  return fields;
}
```

- [ ] **Step 4: Run — PASS**

```bash
npx tsx --test apps/web/src/features/behavior/composer/payload-field-autocomplete-logic.test.ts
```

Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/behavior/composer/payload-field-autocomplete-logic.ts apps/web/src/features/behavior/composer/payload-field-autocomplete-logic.test.ts
git commit -m "feat(behavior): payload-field autocomplete prefix-detection logic"
```

### Task 4.2: PayloadFieldAutocomplete component

**File:** Create `apps/web/src/features/behavior/composer/PayloadFieldAutocomplete.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useId, useMemo } from "react";
import type { AuthoringDocument } from "@form-builder/schema";
import { listPayloadFieldsForEventType } from "../../../lib/payload-schema-helpers";
import { detectPayloadAutocompleteOptions } from "./payload-field-autocomplete-logic";

export interface PayloadFieldAutocompleteProps {
  value: string;
  onChange: (next: string) => void;
  /** Event type whose payload schema drives the suggestions. */
  eventType: string;
  /** Active doc, used to resolve project event payload shapes. */
  doc: AuthoringDocument | null;
  /** Forwarded to the underlying input. */
  className?: string;
  placeholder?: string;
  id?: string;
  "aria-label"?: string;
}

export function PayloadFieldAutocomplete({
  value,
  onChange,
  eventType,
  doc,
  className,
  placeholder,
  id,
  "aria-label": ariaLabel,
}: PayloadFieldAutocompleteProps) {
  const fields = useMemo(() => listPayloadFieldsForEventType(eventType, doc), [eventType, doc]);
  const options = useMemo(() => detectPayloadAutocompleteOptions(value, fields), [value, fields]);
  const datalistId = useId();
  return (
    <>
      <input
        type="text"
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        list={options.length > 0 ? datalistId : undefined}
        className={className}
      />
      {options.length > 0 ? (
        <datalist id={datalistId}>
          {options.map((field) => (
            <option key={field.name} value={`{{event.payload.${field.name}}}`}>
              {field.name} · {field.valueType}
            </option>
          ))}
        </datalist>
      ) : null}
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck:web
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/behavior/composer/PayloadFieldAutocomplete.tsx
git commit -m "feat(behavior): PayloadFieldAutocomplete input wrapper"
```

---

## Phase 5 — ActionEditor cleanup + autocomplete wiring

### Task 5.1: Drop orphan props from ActionEditor

**Files:**
- Modify: `apps/web/src/features/behavior/composer/ActionEditor.tsx`
- Modify: `apps/web/src/features/behavior/composer/BehaviorComposer.tsx`

- [ ] **Step 1: Verify orphan in ActionEditor**

```bash
grep -c "builderStepOptions\|builderFieldOptions\|builderNodeOptions" apps/web/src/features/behavior/composer/ActionEditor.tsx
```

Expected: 6 (3 in interface, 3 in destructure). Confirm by scanning the body — no actual usage.

- [ ] **Step 2: Remove from ActionEditor**

In `apps/web/src/features/behavior/composer/ActionEditor.tsx`:
- Delete the three lines from the `ActionEditorProps` interface (around lines 394-396).
- Delete the three lines from the destructure (around lines 431-433).

- [ ] **Step 3: Remove from BehaviorComposer pass-through**

In `apps/web/src/features/behavior/composer/BehaviorComposer.tsx`, find the `<ActionEditor>` mount (around lines 796-798). Delete the three prop lines:

```tsx
builderStepOptions={builderStepOptions}
builderFieldOptions={builderFieldOptions}
builderNodeOptions={builderNodeOptions}
```

DO NOT remove the same props from `BehaviorComposer`'s own interface or destructure — they're still used by `RuntimeReactionProperties` (line 665 in the same file) and the BehaviorComposer body itself (lines 275, 517, 554).

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck:web
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/behavior/composer/ActionEditor.tsx apps/web/src/features/behavior/composer/BehaviorComposer.tsx
git commit -m "refactor(behavior): drop orphan builder*Options props from ActionEditor"
```

### Task 5.2: Use PayloadFieldAutocomplete in ActionEditor's payload-ref inputs

**File:** `apps/web/src/features/behavior/composer/ActionEditor.tsx`

- [ ] **Step 1: Identify payload-ref inputs**

Search for inputs that accept user-typed values that may include `{{event.payload.X}}` references. Likely candidates:
- `set_field_value` action's "value" input (when the field is a literal/expression)
- `dispatch_event` action's payload field values
- `host_call_await` / `host_action` action payload values
- Condition `expectedValue` inputs

Inspect the file to find the actual `<input type="text">` elements that fit this pattern.

- [ ] **Step 2: Swap to PayloadFieldAutocomplete**

For each identified input, swap the `<input>` for `<PayloadFieldAutocomplete>`. The component takes `eventType` prop — derive it from the action's parent listener's `eventName` (passed via prop or context).

You may need to add a new prop `currentEventType: string | null` to `ActionEditorProps` and thread it from `BehaviorComposer` (which knows the listener being edited).

Sketch:

```tsx
import { PayloadFieldAutocomplete } from "./PayloadFieldAutocomplete";

// existing input:
// <input type="text" value={config.value} onChange={...} />

// becomes:
<PayloadFieldAutocomplete
  value={String(config.value ?? "")}
  onChange={(next) => onChangeConfig({ ...config, value: next })}
  eventType={currentEventType ?? ""}
  doc={activeDocument}
  className={existingClassName}
/>
```

- [ ] **Step 3: Pipe `currentEventType` from BehaviorComposer**

Find where `<ActionEditor>` is mounted; pass the active listener's `eventName` as `currentEventType`. Add the prop to `ActionEditorProps`.

- [ ] **Step 4: Typecheck + smoke**

```bash
npm run typecheck:web
npm run dev:web
```

Edit a `set_field_value` action; type `{{event.payload.` in the value field; verify datalist suggestions appear.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/behavior/composer/ActionEditor.tsx apps/web/src/features/behavior/composer/BehaviorComposer.tsx
git commit -m "feat(behavior): payload-field autocomplete wired into ActionEditor inputs"
```

---

## Phase 6 — Final gates + RESUME

### Task 6.1: Full gate sweep

- [ ] **Step 1: All gates**

```bash
npm run typecheck:web
npm run build:schema
npm run build:runtime
npm run build:web
npm run test --workspace @form-builder/runtime
.venv/bin/pytest apps/api/tests
npm run e2e:phase3
npm run e2e:test-panel
npm run e2e:walkthrough
npm run format:check
```

Expected:
- Runtime tests: 110/110 (no engine change)
- API tests: 99/99
- E2E: 3/3
- typecheck/build/format: clean
- payload-schema-helpers.test.ts: 7 pass
- payload-field-autocomplete-logic.test.ts: 3 pass

- [ ] **Step 2: Format if dirty**

```bash
npm run format
git add -A
git diff --cached --quiet || git commit -m "chore: format after behavior graph discovery implementation"
```

### Task 6.2: RESUME refresh

**Files:**
- Modify: `RESUME.md`
- Modify: `docs/project-plan.md`

- [ ] **Step 1: Append to RESUME.md**

```markdown
- **Behavior graph discovery** (this run):
  - Layered three discovery features onto the existing BehaviorWorkspace
    graph view: payload-fields popover on event nodes, cross-step ref
    badges + distinct edge styling, reverse-index badges on field nodes.
  - Composer-side `{{event.payload.X}}` autocomplete in `ActionEditor`
    payload-ref inputs.
  - Cleanup: dropped orphaned `builder*Options` props from `ActionEditor`
    (still used by `RuntimeReactionProperties` via BehaviorComposer —
    those kept).
  - New pure helpers in `apps/web/src/lib/payload-schema-helpers.ts`
    own derivation (10 unit tests).
  - No engine changes; no schema changes.
  - Gates: typecheck/builds clean, runtime 110, API 99/99, E2E 3/3.
```

- [ ] **Step 2: Update docs/project-plan.md**

Tick the discovery work as done; reference spec + plan paths.

- [ ] **Step 3: Commit**

```bash
git add RESUME.md docs/project-plan.md
git commit -m "docs: RESUME + project-plan refresh for behavior graph discovery ship"
```

---

## Self-Review

**Spec coverage:**

- Payload schema discovery — graph hover popover (Phase 2.1 + Phase 3.2) + composer autocomplete (Phase 4.2 + 5.2). ✓
- Cross-step refs — distinct edge style (Phase 3.3) + listener badge (Phase 3.2 via Phase 2.2). ✓
- Reverse-index promotion — field node badge (Phase 3.2 via Phase 2.3) + click-to-expand (Phase 3.4). ✓
- Orphan-prop cleanup — Phase 5.1. ✓ (corrected scope to ActionEditor + BehaviorComposer pass-through only).
- Pure helpers as single source of truth — Phase 1.1 + 1.2. ✓

**Placeholder scan:** none — every step has concrete code or commands.

**Type consistency:** `CrossStepInfo`, `CrossStepRef`, `RuntimePayloadField`, `RuntimeListenerDefinition` names stable across helpers + components + tests.

**Gap fix applied inline:** Spec said to drop orphan props from BehaviorComposer's interface — discovery showed they're still used there. Plan adjusted to scope cleanup to ActionEditor + BehaviorComposer's pass-through only. Documented at top.

**One callout for execution:** Phase 3 tasks (graph wiring) require inspecting the actual `BehaviorGraphNode.tsx` + `MapGraphOverview.tsx` shape because the plan's terminology may not match the code's discriminator names. Adapt to actual schema while preserving badge placement + cross-step class name (`graph-edge-cross-step`).
