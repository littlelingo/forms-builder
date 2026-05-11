# Unified Test Panel + Walkthrough — Design

Date: 2026-05-11
Status: Approved (brainstorm phase)
Owner: Clint

## Problem

Today the app has five overlapping ways to "test" a behavior wiring (event → listener → action):

1. `EventFlowStudio` ("test" mode in `BehaviorStudioModal`) — pick source / event / payload, fire, view trace.
2. `PreviewTestRecorder` — toggle recording, interact with preview, capture dispatch reports.
3. "Test behavior" button in `BehaviorWorkspace` — `handleTestSelectedRule` (legacy `LegacyConditionalRule`).
4. "Run behavior test" button in `BehaviorWorkspace` — `handleTestSelectedChain` (`RuntimeListenerDefinition`).
5. Underlying `dispatchRuntimeEvent` simulator infra used by all of the above.

Concrete pain (real scenario): a checkbox group "TYPE OF BENEFIT(S) APPLYING FOR" fires `field.change`; a listener attached to the "Sex" radio reacts. The author cannot easily decide which surface to use, where their selection lands, or how to express the payload — they end up trying multiple paths.

Goal: **one clean way** to validate event/listener/action wiring (with valid payload), plus a **separate macro walkthrough** for experiencing the form as a hosted user would.

## Decisions (locked during brainstorm)

| Topic | Decision |
|---|---|
| Number of test surfaces | One unified test panel; multiple entry points share one destination. |
| Panel placement | Floating / dockable (left, right, or detached float). |
| Layout shape | Stacked vertical (inputs top, trace bottom) — narrow-friendly for dock. |
| Modes | Toggle: **Synthesize** (manual payload, explicit Fire button) ↔ **Live record** (subscribe to engine reports from real preview interactions; no Fire button — trace appends as user interacts). Switching modes preserves separate state per mode (synth inputs persist across mode flips; record buffer persists). |
| Auto-bind | On selection change, panel pre-fills source / event / payload. Sticky for user-edited payload. |
| Walkthrough | Separate route (Build → Walkthrough). Full canvas, step nav, no panel chrome. |
| Cleanup approach | Replace — delete the four existing UI surfaces; keep underlying engine handlers. |
| Source/target picker | Hybrid combobox ("C+"): empty input → hierarchical tree; typed → flat ranked list. Breadcrumb chips above input show selected path. Cmd/Ctrl+K opens picker globally. |
| Action surfacing | Trace shows per-action target, before → after. Two trace views: by listener (default), by receiver tree. |
| Hierarchy support | Source and target can be any of: form / step / section / group / component / field. Picker renders full hierarchy; trace renders full path. |

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│ Builder shell                                            │
│                                                          │
│ ┌────────────┐  ┌─────────────────┐  ┌────────────────┐ │
│ │ Inspector  │  │ Builder canvas  │  │ TestPanel      │ │
│ │ rail       │  │ / BehaviorMgr   │  │ (floating dock)│ │
│ │            │  │                 │  │                │ │
│ │ [Test btn] │──▶  selection ────▶│  auto-bind src/  │ │
│ └────────────┘  └─────────────────┘  │  event/payload │ │
│                                       │                │ │
│                  ┌────────────────────│  Mode: Synth   │ │
│                  │ runtime engine    │◀── │  / Live   │ │
│                  │ (dispatchEvent)   │──▶ │  trace    │ │
│                  └────────────────────┘  └────────────────┘ │
│                                                          │
│ [Walkthrough route — Build → Walkthrough]                │
│   full-canvas form preview, step nav, no panel chrome   │
└──────────────────────────────────────────────────────────┘
```

- **TestPanel**: single floating/dockable component. Two modes (Synth, Live record). Auto-binds to current `selectedAuthoring` / `selectedBehaviorListenerId`. Calls `dispatchRuntimeEvent` for synth; subscribes to engine dispatch reports for live.
- **Walkthrough route**: sibling of `home` / `review` / `workspace` in the App stage union. Reuses `createRuntimeEngine` + `PreviewCanvas` in viewer-mode shape, hides authoring chrome.
- **Engine**: untouched. Same `createRuntimeEngine`, `dispatchRuntimeEvent`, `RuntimeDispatchReport`. The new panel is observer + invoker, not new infra.

## Components

### New files

| File | Purpose |
|---|---|
| `apps/web/src/features/test-panel/TestPanel.tsx` | Floating dockable container. |
| `apps/web/src/features/test-panel/TestPanelHeader.tsx` | Title, mode toggle, dock controls (left/right/float), close. |
| `apps/web/src/features/test-panel/TestPanelInputs.tsx` | Synth-mode inputs: source picker (C+), event picker, payload form. |
| `apps/web/src/features/test-panel/TestPanelTrace.tsx` | Listener trace + state diff render. Used by both modes. |
| `apps/web/src/features/test-panel/TestPanelTrigger.tsx` | "Test" button. **Required placements**: (a) BuilderStage toolbar (always visible while in Build), (b) per-listener row in `BehaviorStackList`, (c) per-field row in `InspectorRail` field properties tab. Each placement passes its own selection context to `openTestPanel(selection)`. |
| `apps/web/src/features/test-panel/SourcePicker.tsx` | Hybrid combobox (tree-when-empty / flat-when-typing). Reusable for source + action target picking. |
| `apps/web/src/features/test-panel/useTestPanelState.ts` | Hook owning open/close, mode, dock side, source/event/payload, last reports. Mounted at App root. |
| `apps/web/src/features/test-panel/index.ts` | Public re-exports. |
| `apps/web/src/features/walkthrough/WalkthroughRoute.tsx` | Full-canvas preview, hosted-user shape. |
| `apps/web/src/features/walkthrough/WalkthroughHeader.tsx` | Exit, step indicator, restart. |

### Modified files

| File | Change |
|---|---|
| `apps/web/src/App.tsx` | Mount `useTestPanelState` at root. Render `<TestPanel>` when open. Add `walkthrough` to stage union; route `WalkthroughRoute`. Delete `previewTestRecordingOn`, `previewTestReports`, `<PreviewTestRecorder>` render. Move dispatch-report subscription into hook. |
| `apps/web/src/features/behavior/manager/EventFlowStudio.tsx` | **Delete** (test-mode region replaced by TestPanel). |
| `apps/web/src/features/behavior/test/PreviewTestRecorder.tsx` | **Delete**. |
| `apps/web/src/features/behavior/manager/BehaviorWorkspace.tsx` | Remove "Test behavior" + "Run behavior test" render blocks (~lines 3770–3935). Replace with `<TestPanelTrigger>` next to selected listener/rule. |
| `apps/web/src/features/behavior/utils/runtime-helpers.ts` | `BehaviorStudioMode` drops `"test"`. |
| `apps/web/src/features/behavior/BehaviorStudioModal.tsx` | Remove "test" mode rendering branch. |
| `apps/web/src/features/behavior/manager/BehaviorManager.tsx` | Remove `onSetBehaviorStudioMode("test")` call sites; replace with `openTestPanel(selection)`. |
| `apps/web/src/features/builder/BuilderStage.tsx` | Add Walkthrough toolbar button + global "Open test panel" affordance (Cmd/Ctrl+K). |
| `apps/web/src/features/builder/StepStrip.tsx` | Add "Walkthrough" entry. |
| `apps/web/src/features/inspector/InspectorRail.tsx` | Add `<TestPanelTrigger>` in inspector context. |

Engine handlers (`handleTestSelectedRule`, `handleTestSelectedChain`, `dispatchRuntimeEvent`) are kept and pulled into / referenced from `useTestPanelState`.

## Data Flow

### Open + bind

```
user clicks TestPanelTrigger
  ↓
useTestPanelState.open(selection?)
  ↓
panel renders with derived inputs:
  - source  = selection.dispatcher OR last source OR null
  - event   = listener.eventName OR source.firstEvent OR null
  - payload = listener condition expectedValue OR field.firstOption OR ""
```

### Synthesize fire

```
user clicks Fire
  ↓
TestPanel.onFire(source, event, payload)
  ↓
dispatchRuntimeEvent(envelope)            ← existing
  ↓
engine returns RuntimeDispatchReport
  ↓
useTestPanelState.lastReport = report
  ↓
TestPanelTrace renders listeners[], stateDiff
```

### Live record

```
user toggles mode → "Record"
  ↓
useTestPanelState subscribes to engine.onDispatchReport
  ↓
preview interactions fire envelopes through engine
  ↓
each report appended to reports[] (cap 50, FIFO)
  ↓
TestPanelTrace renders scrolling list, click to expand one
```

### Selection mirror (auto-bind)

```
selectedAuthoring or selectedBehaviorListenerId changes
  ↓
useTestPanelState reads selection (when panel open + Synth mode)
  ↓
recompute derived source / event / payload (debounced)
  ↓
DOES NOT overwrite user-edited payload values (sticky once edited)
```

### Walkthrough

```
user navigates Build → Walkthrough
  ↓
WalkthroughRoute mounts: PreviewCanvas (full width) + step nav header
  ↓
form runs through createRuntimeEngine session
  ↓
exit returns to last builder stage
```

### Action surfacing

`RuntimeDispatchReport.listeners[].actions[]` is rendered with full hierarchical context:

```
Per action row:
  ▸ Step 1 › Section "Demographics" › Group "Sex selector" › Radio "Male"
            · set_disabled · false → true

Per receiver (toggle: by-receiver tree):
  ▼ Step 1 › Section "Demographics" (3 actions)
    ▼ Group "Sex selector" (2 actions)
      ▸ Radio "Male"   · set_disabled · false → true
      ▸ Radio "Female" · set_disabled · false → true
    ▸ Field "Note text" · set_visible · hidden → visible
```

**Engine extension confirmed required** (additive, non-breaking). Today `RuntimeActionDiagnostic` exposes:

```ts
interface RuntimeActionDiagnostic {
  actionId: string;
  label?: string | null;
  kind: RuntimeActionDefinition["kind"];
  target?: RuntimeActionDefinition["target"] | null;
  config: Record<string, unknown>;
  status: "executed" | "error";
  errorMessage?: string;
}
```

For the receiver-grouped trace and before→after rendering we will add (in `packages/runtime/src/types.ts`):

- `before?: unknown` — value/property snapshot before action ran (when meaningful)
- `after?: unknown` — value/property snapshot after action ran
- `status: "executed" | "error" | "skipped"` (extend enum)
- `skippedReason?: "missing-target" | "no-op" | string` — populated when status is `"skipped"`

The runtime engine populates these from the action handlers it already runs. No change to existing consumers (fields are optional).

### Source/target picker (C+)

Hybrid combobox component:

- **Open empty**: full hierarchical tree visible. Current selection highlighted; ancestors auto-expanded.
- **Type**: flips to flat ranked list. Match on label + path; highlight match span.
- **Clear input**: returns to tree mode (selection preserved).
- **Breadcrumb chips above input**: render full selection path. Click any chip to re-open picker scoped to siblings at that level.
- **Keyboard**: ↑↓ navigate, Enter select, Esc close. Cmd/Ctrl+K opens picker globally.

Reused for: source picker, action target picker, event reverse-index navigation.

## Error Handling & Edge Cases

| Case | Behavior |
|---|---|
| No selection / no document | Panel opens with empty source picker. Prompt: "Pick a source above or open a project first". Walkthrough route redirects to Build if no `activeDocument`. |
| Invalid payload (Synth) | Inline validation per field (number, boolean, JSON shape). Red border + helper text. Fire button disabled until valid. "Reset to defaults" link restores derived values. |
| Event has no listeners | Trace renders "Event fired. No listeners reached." with a "Create listener" link that opens `BehaviorComposer` pre-bound to source + event. |
| Broken references | Listener row shows "Broken target" warning chip; action row degrades to "Skipped — target missing". Uses existing `brokenRefsByListenerId`. |
| Live record — engine error | Caught in panel subscription; rendered as red row in trace timeline with message + correlationId. Recording continues. |
| Action target deleted mid-session | Engine returns `action.status="skipped"`, `skippedReason="missing-target"` (new fields, see Action Surfacing). Trace surfaces as gray row with reason. |
| Walkthrough submit | `form.submit` event fires. Walkthrough route mocks host bridge: shows toast "Form would submit with payload" + collapsible payload viewer. Same envelope shape as host integration; no network call. |
| Panel state lifecycle | Survives Build/Map/Map-graph navigation. Resets when stage switches to `home` or `review`. Persisted to `sessionStorage`: mode + dock side only (not last-report). |
| Selection mirror conflict | If user edited payload, selection change does NOT overwrite payload (sticky). Source + event auto-update; "Reset to selection" affordance appears if values diverge. |

## Testing

### Untouched (existing coverage stays)

- `packages/runtime` engine + scheduler tests (89 tests).
- API tests (99 pytest).

### New unit tests (web)

`apps/web/src/features/test-panel/__tests__/`:

- `useTestPanelState.test.ts` — open/close, mode toggle, dock side, payload edit stickiness, selection-mirror auto-bind.
- `TestPanelInputs.test.tsx` — picker C+ (tree empty / flat typed / chip click), payload validation, fire-button disabled state.
- `TestPanelTrace.test.tsx` — by-listener vs by-receiver toggle, action row hierarchy render, empty/error states.
- `SourcePicker.test.tsx` — tree expansion, flat search ranking, chip-click scoping, keyboard nav.

`apps/web/src/features/walkthrough/__tests__/`:

- `WalkthroughRoute.test.tsx` — mount/unmount, exit returns last builder stage, missing document redirects.

### Integration

- Mock engine via `createRuntimeEngine` against fixture document (existing pattern in `apps/web/src/lib/__tests__/`).
- Verify auto-bind for fixture: select listener → panel inputs match `listener.eventSource` + `listener.eventName`.

### E2E (Playwright, extends `apps/web/e2e/`)

- `test-panel.spec.ts` — open panel, pick source (checkbox group), event (`field.change`), payload value, fire; expect Sex-radio listener row green + action row "set_visible · hidden → visible".
- `walkthrough.spec.ts` — Build → Walkthrough, advance steps, submit, expect mock-host toast.

### Removal verification

- `EventFlowStudio` "test" mode no longer reachable.
- `PreviewTestRecorder.tsx` deleted; no dangling imports (typecheck catches).
- "Test behavior" / "Run behavior test" buttons absent in `BehaviorWorkspace` render.

### Gates

- `npm run typecheck:web` clean.
- `npm run build:runtime` clean (no contract changes expected; if action.targetNodeId/before/after extension needed, update both schema + runtime).
- `npm run test --workspace @form-builder/runtime` 89/89.
- `.venv/bin/pytest apps/api/tests` 99/99.
- `npx playwright test` (apps/web/e2e) green.

## Out of Scope

- Test result history / diffing across runs.
- Saving and re-running named test scenarios.
- Walkthrough as multi-user shared session.
- Importing real host responses for `host_call_await` test fixtures.
- Editing engine internals beyond the small additive `RuntimeDispatchReport` extension (if needed).

## Open Questions

None blocking design. Items to validate during plan write-up:

1. ~~Does `RuntimeDispatchReport.listeners[].actions[]` already include `targetNodeId` + `before` / `after`?~~ **Confirmed: extension required.** See Action Surfacing for exact fields to add to `RuntimeActionDiagnostic`.
2. Does `ActionEditor.tsx` already let authors choose group / component / section as action target? If not, small composer extension needed.
3. Cmd/Ctrl+K global hotkey — confirm no conflict with existing app shortcuts.
