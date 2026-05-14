# Behavior Graph Discovery — Design

Date: 2026-05-14
Status: Approved (brainstorm phase)
Owner: Clint

## Problem

Authoring complex behaviors requires understanding three things that the current UI hides:

| Sev | Gap |
|---|---|
| H | Event payload schema not discoverable — authors don't see what fields exist for `field.change` etc., so they guess at `{{event.payload.X}}` references in conditions/actions. |
| H | Cross-step listener references invisible — when a listener on Step A reacts to an event from Step B, nothing in the graph signals the cross-step relationship. |
| M | Reverse-index panel exists but isn't promoted from the graph — users don't discover "what listens to this field". |
| L | Orphaned `builderStepOptions` / `builderFieldOptions` / `builderNodeOptions` props on `ActionEditor` (post-SourcePicker swap) — cleanup. |

Deferred (need specific user signal first): ApplyParametersDialog UX, BranchActionCard multi-arm authoring, listener condition editor UX.

This spec extends the existing BehaviorWorkspace **graph view** with three discovery layers — payload-fields popover on event nodes, cross-step ref badges + distinct edge styling, reverse-index badges on field nodes — plus a small composer-side autocomplete that surfaces payload field names while editing. Single discovery surface, layered enhancements, no new tab/route.

## Decisions (locked during brainstorm)

| Topic | Decision |
|---|---|
| Scope shape | Discovery-first feature: payload schema + cross-step refs + reverse-index promotion in one coherent surface (Q1: D). |
| Discovery surface | Extend existing graph view with layered features. No new tab/panel/route (Q2: A). |
| Payload discovery | Hover/click popover on event node + composer autocomplete on `{{event.payload.X}}` inputs (Q3: E). |
| Cross-step refs | Distinct edge style (dashed/orange) + listener-node badge "← Step N" (Q4: E). |
| Reverse-index promotion | Field-node badge ("N listeners react") + click-to-expand inline list reusing existing inspector data (Q5: E). |
| ApplyParametersDialog | Defer pending user signal (Q6: A). |
| BranchActionCard / condition editor | Defer pending user signal (Q7: B). |
| Orphan-prop cleanup on ActionEditor | Include — mechanical hygiene (Q7: B). |

## Architecture

```
BehaviorWorkspace (existing graph view extended)
├── BehaviorGraph (existing — gets discovery layers)
│   ├── Nodes (event/listener/action/field) — get badges + popovers
│   │   ├── NEW: payload-fields popover on event-node hover/click
│   │   ├── NEW: cross-step ref badge on listener nodes ("← Step 2")
│   │   └── NEW: reverse-index badge on field nodes ("3 listeners react")
│   └── Edges
│       └── NEW: cross-step edges rendered with distinct style (dashed/orange)
└── Composer
    └── Condition / Action editors
        └── NEW: payload-field autocomplete on {{event.payload.X}} inputs

apps/web/src/lib/payload-schema-helpers.ts (NEW)
  Pure helpers (testable via tsx --test):
  - listPayloadFieldsForEventType(eventType, doc) → RuntimePayloadField[]
  - isCrossStepReference(doc, sourceNodeId, targetNodeId) → CrossStepInfo | null
  - collectCrossStepRefsForListener(doc, listener) → CrossStepRef[]

apps/web/src/features/behavior/cards/PayloadFieldsPopover.tsx (NEW)
apps/web/src/features/behavior/cards/CrossStepRefBadge.tsx (NEW)
apps/web/src/features/behavior/cards/ReverseIndexBadge.tsx (NEW)
apps/web/src/features/behavior/composer/PayloadFieldAutocomplete.tsx (NEW)

apps/web/src/features/behavior/cards/BehaviorGraphNode.tsx (modified)
  Add badge slots; wire hover/click to popovers.

apps/web/src/features/behavior/manager/BehaviorGraph.tsx (modified)
  Extend edge renderer to apply cross-step style.

apps/web/src/features/behavior/composer/ActionEditor.tsx (modified)
  Drop orphaned builder*Options props.
  Use PayloadFieldAutocomplete for payload-ref inputs.

apps/web/src/features/behavior/composer/BehaviorComposer.tsx (modified)
  Drop orphan-prop pass-through.

apps/web/src/App.tsx (modified)
  Drop orphan-prop pass-through at BehaviorComposer mount.
```

**Architecture invariants:**

- Graph view is the primary discovery surface. Layered enhancements; no new tab/route.
- Pure helpers (`payload-schema-helpers.ts`) own derivation logic so graph + composer share the same source of truth. Testable.
- Existing `reverse-index-helpers.ts` reused as-is. `EventReverseIndexPanel.tsx` reused for the inline list rendering.
- No engine changes. No authoring schema changes.
- ApplyParametersDialog, BranchActionCard nesting, listener condition editor: explicitly deferred.

## Components

### New files

| File | Responsibility |
|---|---|
| `apps/web/src/lib/payload-schema-helpers.ts` | Pure helpers: `listPayloadFieldsForEventType`, `isCrossStepReference`, `collectCrossStepRefsForListener`. |
| `apps/web/src/lib/payload-schema-helpers.test.ts` | TDD tests for the helpers (≥6 tests). |
| `apps/web/src/features/behavior/cards/PayloadFieldsPopover.tsx` | Popover content: list of payload fields (name, type, description, required marker). Used by event-node hover and composer hint. |
| `apps/web/src/features/behavior/cards/CrossStepRefBadge.tsx` | Pill: arrow + source step title. Click handler navigates / focuses the source node in graph. |
| `apps/web/src/features/behavior/cards/ReverseIndexBadge.tsx` | Pill: "N listeners react" + click-to-expand inline list reusing existing reverse-index data. |
| `apps/web/src/features/behavior/composer/PayloadFieldAutocomplete.tsx` | Input wrapper. On `{{event.payload.` substring match, shows `<datalist>` of available fields per current event type. Otherwise behaves as plain `<input>`. |
| `apps/web/src/features/behavior/composer/PayloadFieldAutocomplete.test.ts` | TDD tests for the prefix-match + field-list derivation logic (~3 tests). |

### Modified files

| File | Change |
|---|---|
| `apps/web/src/features/behavior/cards/BehaviorGraphNode.tsx` | Add badge slots: payload-count chip on event nodes; cross-step pill on listener nodes; reverse-index pill on field nodes. Wire hover/click → popover. |
| `apps/web/src/features/behavior/manager/BehaviorGraph.tsx` (or wherever edges render) | Extend edge renderer to apply distinct style when source step ≠ target step. Pass document-aware props down to graph nodes so they can resolve cross-step refs. |
| `apps/web/src/features/behavior/composer/ActionEditor.tsx` | Drop orphaned `builderStepOptions`, `builderFieldOptions`, `builderNodeOptions` props (Phase 11 leftovers post-SourcePicker swap). Use `PayloadFieldAutocomplete` in payload-ref inputs. |
| `apps/web/src/features/behavior/composer/BehaviorComposer.tsx` | Drop the same orphan props from the prop interface + pass-through. |
| `apps/web/src/App.tsx` | Drop the orphan-prop pass-through at the BehaviorComposer mount. |

### Reuse

- `apps/web/src/features/behavior/inspector/reverse-index-helpers.ts` — used as-is.
- `apps/web/src/features/behavior/inspector/EventReverseIndexPanel.tsx` — render reused for the badge's expand state (extract render content if needed).
- `apps/web/src/features/behavior/utils/runtime-helpers.ts` `runtimePayloadFieldsForEventType` — wrapped by the new helper.
- `packages/schema/src/runtime.ts` — `RuntimeEventTypeDefinition`, `RuntimePayloadShape`, `RuntimePayloadField`, `RuntimeListenerDefinition`.

### Engine + schema

No changes.

## Data Flow

### Payload-fields popover (graph hover/click)

```
user hovers / clicks event node in graph
  ↓
BehaviorGraphNode.onHover(node) → opens PayloadFieldsPopover
  ↓
popover calls listPayloadFieldsForEventType(node.eventType, activeDocument)
  ↓
returns RuntimePayloadField[] (name, valueType, description, required)
  ↓
popover renders list:
  • fieldId · string · Source field id
  • nextValue · string · New value after change
  • previousValue · string · Value before change
  ...
```

### Cross-step ref badge + edge styling

```
graph build phase (existing pipeline)
  ↓
for each listener edge { sourceNodeId → targetNodeId, sourceStepId, targetStepId }
  ↓
edge.isCrossStep = sourceStepId && targetStepId && sourceStepId !== targetStepId
  ↓
Edge renderer:
  - default: solid slate stroke
  - isCrossStep: dashed orange + slightly thicker stroke
  ↓
Listener node renderer:
  - if any incoming edge isCrossStep:
      render <CrossStepRefBadge sourceStep={sourceStepLabel} onClick={focusSource} />
```

### Reverse-index badge (field nodes)

```
field node renders
  ↓
listReverseListenersForNode(doc, fieldNodeId) → ReverseRef[] (existing reverse-index-helpers)
  ↓
if reverse refs > 0:
  render <ReverseIndexBadge count={n} />
  ↓
on click → expand inline list (uses existing EventReverseIndexPanel render path, extracted/reused)
  ↓
each row click → focus that listener in graph + open inspector
```

### Composer payload autocomplete

```
user types in condition / action input that accepts payload refs
  ↓
PayloadFieldAutocomplete watches input value
  ↓
on substring match `{{event.payload.` :
  - read currentEventType from form context (passed as prop)
  - fields = listPayloadFieldsForEventType(currentEventType, activeDocument)
  - render <datalist> with options "fieldId", "nextValue", etc.
  ↓
user picks → input value extends to "{{event.payload.fieldId}}"
  ↓
existing token resolution kicks in at runtime as today
```

### Orphan prop cleanup

```
ActionEditor previously received builderStepOptions / builderFieldOptions / builderNodeOptions
(used by old <select> dropdowns; post-SourcePicker swap they're unused)
  ↓
Remove props from interface + destructure + call sites
  ↓
ActionEditor only consumes runtimeEventSourceCandidates (already there for SourcePicker)
  ↓
BehaviorComposer interface slims; App.tsx call site slims
```

### Helpers — single source of truth

```
listPayloadFieldsForEventType(eventType, doc)
  → if eventType matches a runtimeCoreEventTypes entry → return its payloadShape.fields
  → else if doc.runtime?.projectEvents has entry with matching type → return its payloadShape.fields
  → else if any node.runtime.eventSources has matching type → return its payloadShape.fields
  → else → return []

isCrossStepReference(doc, sourceNodeId, targetNodeId)
  → walk doc to resolve which step each node lives in
  → returns null when both share a step or either is form-level
  → returns { sourceStepId, sourceStepTitle, targetStepId, targetStepTitle }

collectCrossStepRefsForListener(doc, listener)
  → for each event source the listener watches (listener.eventSourceNodeId, dispatcherId)
  → check isCrossStepReference vs listener's host node
  → return CrossStepRef[]
```

## Error Handling & Edge Cases

| Case | Behavior |
|---|---|
| Unknown event type passed to `listPayloadFieldsForEventType` | Returns `[]`. Popover renders "No payload fields known for `<eventType>`." (informational, not an error). |
| Event has zero payload fields | Popover renders "This event carries no payload." Badge omitted from event node when 0 fields. |
| Cross-step ref where source node was deleted | Edge styling skipped (no source); listener badge shows "← (deleted)" with broken-target chip. Doesn't throw. |
| Cross-step ref to form-level event (no enclosing step) | Treated as same-step. No badge rendered. |
| Reverse-index returns empty array | Badge omitted from field node. |
| Reverse-index returns ≥10 entries | Badge shows "10+"; popover paginates or limits to first 20 with "Show all" link to existing inspector panel. |
| Composer autocomplete: input doesn't match `{{event.payload.` prefix | Behaves as plain `<input>`. No datalist rendered. |
| Composer autocomplete: current event type unknown / not selected | Datalist empty; input remains free-text. |
| ActionEditor orphan-prop deletion: stale call site somewhere passes them | TypeScript catches at compile time (props removed from interface). Fix or revert. |
| Graph node hover popover overlaps with edges / other nodes | Popover positioned via simple absolute placement with auto-flip when near edge. |
| Performance: large doc (50+ steps × 20 fields × 5 listeners) | Helpers run once per render; memoize `collectCrossStepRefsForListener` per listener id; reverse-index cache invalidated on doc edits (existing pattern). |
| User clicks badge while editing in composer | Inspector / graph navigation does not unmount the composer form (composer state preserved). |

## Testing

### Untouched

- Engine + scheduler tests (110/110).
- API tests (99/99).
- Existing E2E suites (`phase3`, `test-panel`, `walkthrough`).

### New unit tests (pure logic via `tsx --test`)

`apps/web/src/lib/payload-schema-helpers.test.ts` (~6 tests):
- `listPayloadFieldsForEventType returns core fields for "field.change"`
- `listPayloadFieldsForEventType returns empty array for unknown type`
- `listPayloadFieldsForEventType resolves project event payload from doc`
- `isCrossStepReference returns info when source + target steps differ`
- `isCrossStepReference returns null when both nodes share a step`
- `collectCrossStepRefsForListener returns empty array for self-step listener`

`apps/web/src/features/behavior/composer/PayloadFieldAutocomplete.test.ts` (~3 tests):
- `detects {{event.payload. prefix and returns matching options`
- `returns empty options when no event type`
- `returns empty options when input has no token prefix`

### E2E

Skip — Area 2 is graph-view + composer work; pure-logic tests cover the derivation. Add `apps/web/e2e/behavior-graph.run.mjs` only post-implementation if a clean E2E surfaces. Don't pre-bake.

### Removal verification

After orphan-prop cleanup:
```
grep -rn "builderStepOptions\|builderFieldOptions\|builderNodeOptions" apps/web/src
```
Expected: empty (excluding spec/plan docs).

### Gates

- `npm run typecheck:web` clean
- `npm run build:runtime` clean (no engine change)
- `npm run test --workspace @form-builder/runtime` 110/110
- `.venv/bin/pytest apps/api/tests` 99/99
- `npm run e2e:phase3`, `e2e:test-panel`, `e2e:walkthrough` — green
- `npm run format:check` clean

## Out of Scope

- ApplyParametersDialog redesign.
- BranchActionCard multi-arm authoring polish.
- Listener condition editor polish.
- New "Behavior Canvas" route or tab.
- Engine changes.
- Authoring schema changes.
- Visual mini-map / overview pane (deferred even if cross-step links proliferate).
- Filter toggles for cross-step links only (Q4 option D).

## Risks

- **Graph node renderer churn**: adding badge slots to `BehaviorGraphNode.tsx` may cause layout regressions. Mitigation: add badges in a fixed slot (e.g. top-right corner) so default node bounds are unaffected.
- **Edge styling change visible in screenshots / E2E**: cross-step dashed style may unintentionally match existing test selectors. Mitigation: use a new class name (`graph-edge-cross-step`); don't rely on color tokens existing E2E asserts on.
- **Popover positioning at graph edges**: simple absolute placement may clip; auto-flip needed.
- **PayloadFieldAutocomplete activates inside any text input that uses it** — must be opt-in via the wrapper, not a global mixin, so unrelated inputs (label fields, helper text) don't try to autocomplete.

## Open Questions

None blocking. To validate during plan write-up:

1. Where exactly does the graph render edges? Inspect `BehaviorGraph.tsx` (or sibling) to confirm the edge styling extension point.
2. `EventReverseIndexPanel.tsx` render path — is it monolithic or already split into a list component? If monolithic, may need a small extraction so the badge popover can reuse the rendering.
3. `currentEventType` source for `PayloadFieldAutocomplete` in composer — what's the cleanest way to pass it? Likely already available in the composer context; verify.
