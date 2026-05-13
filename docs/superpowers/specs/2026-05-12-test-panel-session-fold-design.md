# TestPanel Session Tab — Fold Simulator Into Unified Test Surface — Design

Date: 2026-05-12
Status: Approved (brainstorm phase)
Owner: Clint

## Problem

The unified TestPanel (shipped 2026-05-11) consolidated five legacy test surfaces (`EventFlowStudio`, `PreviewTestRecorder`, "Test behavior" + "Run behavior test" buttons, `dispatchRuntimeEvent` infra) into one floating dock with **Synth** and **Live** modes. Phase 11 of that work explicitly deferred the **Simulator** section in `BehaviorWorkspace.tsx` (~460 lines), keeping it because it covered functionality TestPanel didn't yet have:

- **Session-lifecycle controls**: Reset session, Fill required, Run current step, Run submit
- **Host-loop stubs**: Simulate success, Simulate error (resolve pending `host_call_await`)
- **Trace inspector**: Authored runtime evidence + authored trace chain navigator + advanced session debug

Authors now have two test surfaces and must context-switch between them. From the Simulator strategy brainstorm:

> User goal: "**A** — Too many places to look — want ONE surface for all event/listener/action/session testing" + "**C** — Session-lifecycle controls (Reset/Fill/Step/Submit) feel missing from TestPanel — want them added there"

This spec folds the Simulator's session-lifecycle controls and host-loop stubs into the TestPanel as a third **Session** tab, extends the trace component with a History view (replacing the authored-evidence panel), and deletes the BehaviorWorkspace Simulator section.

## Decisions (locked during brainstorm)

| Topic                     | Decision                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal                      | Single test surface (TestPanel) covering event/listener/action/session.                                                                                                         |
| Structure                 | Third mode tab: `Synth \| Live \| Session`.                                                                                                                                     |
| Trace inspector           | Extend the existing `TestPanelTrace` with a `History` view (scroll list of past `recordedReports` + chain context). Drop the "Advanced session debug" panel — power-user noise. |
| Engine wiring             | Panel drives the **same** runtime engine that powers the builder's PreviewCanvas (matches today's Simulator behavior). Walkthrough route still uses its own dedicated engine.   |
| Discoverability / clarity | Persistent "Drives preview" badge in header (always visible). Always-visible status strip (step / validation / submit). Onboarding tooltips on Session tab controls.            |
| Layout                    | Badge in header, status strip above tabs, host-loop section always rendered (Success/Error disabled when no pending host call).                                                 |
| Cleanup                   | Delete BehaviorWorkspace Simulator section (~460 lines) and orphaned App.tsx handlers. Replace its slot with a one-line breadcrumb pointer to TestPanel.                        |
| Walkthrough               | Untouched.                                                                                                                                                                      |

## Architecture

```
TestPanel (existing floating dock)
├── Header
│   ├── Title "Test panel"
│   ├── Drives-preview badge ──► visible whenever panel open
│   └── Dock controls + Close
├── Status strip (always visible) ──── NEW
│   ├── Step X of Y · current step name
│   ├── Validation ✓/✗
│   └── Submit: idle/submitting/success/error
├── Mode tabs ───── NEW: Synth | Live | Session (was: Synth | Live)
└── Mode body
    ├── Synth tab (existing) — unchanged
    ├── Live tab (existing) — unchanged
    └── Session tab — NEW
        ├── Lifecycle controls: Reset · Fill required · Run step · Submit
        ├── Host loop: Success · Error (always rendered, disabled when N/A)
        └── Helper text + onboarding (ⓘ)
└── Trace section (existing, EXTENDED)
    ├── Toggle: By listener | By receiver | History ──── NEW: History
    └── History view: scroll list of past dispatch reports (cap 50, FIFO)
        Click report → expand inline with full by-listener detail + chain context
```

**Architecture invariants:**

- TestPanel owns all session controls. It is the single test surface for event / listener / action / session testing.
- Engine instance is shared with the builder PreviewCanvas (preserved from today's wiring). Panel actions visibly affect the preview.
- BehaviorWorkspace becomes a graph + composer surface, not a test surface. Its Simulator section is replaced with a one-line breadcrumb link.
- Walkthrough route remains a separate sandbox with its own engine — unchanged.

## Components

### New files

| File                                                        | Purpose                                                                                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/features/test-panel/TestPanelSession.tsx`     | Session tab body: lifecycle controls (Reset / Fill / Step / Submit), host loop (Success / Error), helper text + onboarding tooltips. |
| `apps/web/src/features/test-panel/TestPanelStatusStrip.tsx` | Always-visible status pills: step / validation / submit.                                                                             |
| `apps/web/src/features/test-panel/session-actions.ts`       | Pure helpers: which fields qualify as "required to fill", default value derivation per field semantic type.                          |
| `apps/web/src/features/test-panel/session-actions.test.ts`  | TDD tests for the helpers.                                                                                                           |

### Modified files

| File                                                           | Change                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/features/test-panel/types.ts`                    | `TestPanelMode = "synth" \| "record" \| "session"` (adds `"session"`). New optional field `statusSnapshot: TestPanelStatusSnapshot \| null` on `TestPanelState`. New interface `TestPanelStatusSnapshot { currentStepLabel, currentStepIndex, totalSteps, validationValid, submitStatus }`.                                                                               |
| `apps/web/src/features/test-panel/state.ts`                    | New action `set-status-snapshot`; reducer writes `statusSnapshot`.                                                                                                                                                                                                                                                                                                        |
| `apps/web/src/features/test-panel/state.test.ts`               | New tests for `set-status-snapshot` + mode union widening.                                                                                                                                                                                                                                                                                                                |
| `apps/web/src/features/test-panel/useTestPanelState.ts`        | Add `setStatusSnapshot` callback. Subscribe to `engine.subscribeReports` ALSO when `mode === "session"` (today only when `mode === "record"`).                                                                                                                                                                                                                            |
| `apps/web/src/features/test-panel/TestPanelHeader.tsx`         | Add 3rd mode button "Session" with `aria-pressed`. Add persistent "Drives preview" badge.                                                                                                                                                                                                                                                                                 |
| `apps/web/src/features/test-panel/TestPanel.tsx`               | Render `<TestPanelStatusStrip>` between header and tabs. Branch on `mode === "session"` to render `<TestPanelSession>`. Pipe new callbacks.                                                                                                                                                                                                                               |
| `apps/web/src/features/test-panel/TestPanelTrace.tsx`          | Extend toggle: `By listener \| By receiver \| History`. Add history view (scrolling list of `recordedReports`; click row to expand inline).                                                                                                                                                                                                                               |
| `apps/web/src/App.tsx`                                         | Pipe session-lifecycle callbacks into TestPanel (`onResetSession`, `onFillRequired`, `onRunStep`, `onSubmit`, `onSimulateHostSuccess`, `onSimulateHostError`). Add `useEffect` deriving status snapshot from `runtimeSessionState` → `setStatusSnapshot`. Delete the BehaviorWorkspace Simulator-related props it currently passes (`onHandleResetRuntimeSession`, etc.). |
| `apps/web/src/features/behavior/manager/BehaviorWorkspace.tsx` | Delete entire Simulator section (lines ~3781–4220). Replace with single-line breadcrumb: "Session controls moved to Test panel · open with ⌘K". Drop simulator-related props from interface.                                                                                                                                                                              |

Engine: **no changes.** Existing `dispatch`, `dispatchWithReport`, `subscribeReports`, `dispatchAsync` cover everything.

## Data Flow

### Status snapshot (always-visible strip)

```
runtime engine state changes (via subscribeReports OR explicit setState)
  ↓
App.tsx useEffect derives snapshot from runtimeSessionState:
  { currentStepLabel, currentStepIndex, totalSteps, validationValid, submitStatus }
  ↓
testPanel.setStatusSnapshot(snapshot)
  ↓
TestPanelStatusStrip renders pills
```

### Session tab — Lifecycle action

```
user clicks "Reset" (or Fill / Run step / Submit)
  ↓
TestPanelSession.onAction(kind)
  ↓
App-provided callback (one per kind):
  - onResetSession()      → engine.unmount() + engine.mount(document)
  - onFillRequired()      → for each required field, dispatch field.change with derived default
  - onRunStep()           → dispatch button.click on next-step button OR direct go_to_next_step action
  - onSubmit()            → dispatch button.click on submit button OR direct submit_form action
  ↓
engine state mutates → subscribeReports fires → status snapshot updates
  ↓
TestPanelTrace shows the resulting reports (also added to recordedReports for History view)
```

### Session tab — Host loop

```
engine state.submit.status === "submitting"
  ↓
TestPanelSession enables Success / Error buttons
  ↓
user clicks "Success"
  ↓
App-provided onSimulateHostSuccess(correlationId)
  ↓
engine.dispatchAsync(host.action_response envelope with mock success payload)
  ↓
engine resolves pending host_call_await continuation
  ↓
state.submit.status → "success"
  ↓
status strip updates; trace shows the resolution chain
```

### Trace history view

```
recordedReports (cap 50, FIFO from useTestPanelState)
  ↓
TestPanelTrace history toggle → renders scrolling list:
  ▸ 14:32:01 · field.change → 1 listener ran
  ▸ 14:32:05 · button.click → 2 listeners ran (1 skipped)
  ▸ 14:32:08 · form.submit → ...
  ↓
click row → expand inline:
  - by-listener detail (existing render)
  - chain context: prior 2 + next 2 reports for cause→effect view
```

### Cross-mode buffering

`recordedReports` is shared across all three modes. Synth fires append. Live mode appends. Session mode appends. History view reads from this single buffer. Synth's `lastReport` is still set independently for the by-listener view of the most recent fire.

`statusSnapshot` is ephemeral — rebuilt every dispatch via the App-level `useEffect`. NOT persisted to `sessionStorage`.

## Error Handling & Edge Cases

| Case                                                  | Behavior                                                                                                                                                               |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No active document                                    | Status strip shows "No document loaded". Lifecycle buttons disabled. Helper text: "Open a project to enable session controls."                                         |
| Engine not mounted yet                                | Status snapshot shows "Initializing". Buttons disabled.                                                                                                                |
| Reset during pending host loop                        | Confirm dialog: "Reset will discard the in-flight submit (correlation X). Continue?" — type "reset" or one-click confirm (consistent with destructive-action pattern). |
| Submit when validation invalid                        | Engine emits validation errors as usual; trace shows them. Submit button stays clickable but tooltip warns.                                                            |
| Host loop timeout                                     | Engine times out pending continuations after configured limit. Status pill shows "Submit: error". Helper: "Host bridge timed out. Click Reset to clear."               |
| History click on report whose source node was deleted | Render with "broken target" badge per existing pattern; chain context degrades gracefully.                                                                             |
| User on Synth tab when status changes                 | Status strip updates regardless of active tab — that's the point of always-visible.                                                                                    |

## Testing

### Untouched (existing coverage stays)

- `packages/runtime` engine + scheduler tests (105 tests). No engine change, no test change.
- API tests (99 pytest).
- Existing E2E suites (`phase3`, `walkthrough`).

### New unit tests

`apps/web/src/features/test-panel/state.test.ts` — extend with:

- `set-status-snapshot writes the snapshot field`
- `mode union accepts session value`

(Total: 8 → 11 tests.)

`apps/web/src/features/test-panel/session-actions.test.ts` (new):

- `derives required-fill list from current step's required fields`
- `default value derivation: text → "Test value", number → 0, boolean → true, radio/select → first option, checkbox → first option as array, date → today's ISO`
- `skips fields whose visibility flag is false`
- `skips fields whose enabled flag is false`

(~5–6 tests.)

### E2E

Extend `apps/web/e2e/test-panel.run.mjs` with a Session flow:

- Open panel, switch to Session tab.
- Click Fill required → expect form fields populated in preview.
- Click Submit → expect status strip "Submit: submitting".
- Click Success → expect status strip "Submit: success".
- Switch trace toggle to "History" → expect ≥3 reports listed.

### Removal verification

- BehaviorWorkspace no longer renders Simulator section (grep "Reset session" etc. → empty).
- App.tsx no longer wires legacy simulator handlers (grep `handleResetRuntimeSession` etc. → empty or moved into TestPanel handler module).

### Gates

- `npm run typecheck:web` clean.
- `npm run build:runtime` clean (no engine change expected).
- `npm run test --workspace @form-builder/runtime` 105/105.
- `.venv/bin/pytest apps/api/tests` 99/99.
- `npm run e2e:phase3` green.
- `npm run e2e:test-panel` green (extended with Session flow).
- `npm run e2e:walkthrough` green.

## Out of Scope

- Trace history search / filter (basic chronological list only).
- Saved test scenarios / replay.
- Folding the Walkthrough route into TestPanel.
- Multi-engine session debugging (one panel = one engine).
- Real host integration (Success / Error remain stubs).
- Auto-cleanup of recorded reports older than N minutes (FIFO 50 only).
- Custom payload editor for Success / Error host responses (uses fixed mock payload).

## Risks

- **History view + chain context** is the most novel piece. If it proves harder than expected, ship without History (only `By listener` / `By receiver`) and add History as a follow-up.
- **Confirm dialog for Reset** — small extra modal. Use existing `ConfirmDialog` primitive.
- **Status strip recompute frequency** — if `runtimeSessionState` updates per keystroke, the snapshot effect fires often. Memoize the derived snapshot to avoid spurious dispatches.
- **Discoverability of Session tab** for users coming from the old Simulator workflow — mitigated by the BehaviorWorkspace breadcrumb link + the always-visible "Drives preview" badge that hints the panel is the new home.

## A vs B Comparison (recap)

| Dimension                        | A (surgical relabel)       | B (this design)                                                        |
| -------------------------------- | -------------------------- | ---------------------------------------------------------------------- |
| User goal "one surface"          | partial — Simulator stays  | yes — TestPanel = single surface                                       |
| User goal "session in TestPanel" | no — stays in Simulator    | yes — Session tab                                                      |
| LoC delta                        | ~50 (relabel + cross-link) | ~+400 / -550 = -150 net                                                |
| Files touched                    | 1–2                        | ~10                                                                    |
| Risk                             | very low                   | medium (new tab + state strip + history view + delete 460-line region) |
| Time                             | ~1–2 h                     | ~6–10 h                                                                |
| New tests required               | none                       | ~10 (state + session-actions + E2E extension)                          |
| Walkthrough impact               | none                       | none                                                                   |
| Engine changes                   | none                       | none                                                                   |
| User retraining                  | minimal                    | moderate (offset by breadcrumb + badge + ⌘K)                           |
| Surface area to maintain         | same (panel + simulator)   | smaller (one panel)                                                    |

Recommendation locked: **B**.

## Open Questions

None blocking. Implementation discoveries to validate during plan write-up:

1. Does `runtimeSessionState` already include all snapshot fields (`currentStepId`, validation, submit)? Confirmed yes from prior phases — derive `currentStepLabel` from `document.steps.find(s => s.id === currentStepId)?.title`.
2. `engine.unmount() + engine.mount(document)` for Reset — verify this is the established pattern (look at `useRuntimeSession` or wherever the engine lifecycle lives).
3. Host-loop `Success` / `Error` envelopes — confirm exact `host.action_response` envelope shape from existing `handleMockSubmitSuccess` / `handleMockSubmitError` in App.tsx so the new TestPanel handlers reuse the same construction.
