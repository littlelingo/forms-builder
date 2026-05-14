# Mock-Host Bridge — Host Tab + Authoring Discoverability — Design

Date: 2026-05-13
Status: Approved (brainstorm phase)
Owner: Clint

## Problem

The current host-wiring surface has 9 gaps that block realistic testing of host-integrated form behaviors:

| Sev | Gap                                                                                               |
| --- | ------------------------------------------------------------------------------------------------- |
| H   | Mock host returns fixed stubbed payload — authors can't test `$response`-dependent action chains. |
| H   | No way to simulate timeout / network-error paths from authoring surface.                          |
| H   | Engine detects correlation-id collisions but the trace event is invisible to authors.             |
| M   | No schema validation on host.action_response payloads — malformed responses silently break.       |
| M   | Submit envelope shape underdocumented — hosts must reverse-engineer it.                           |
| M   | Multi-step host conversations not E2E tested.                                                     |
| L   | host_call_await authoring surface lacks handlerKey discovery — authors guess.                     |
| L   | `$response` token resolution scope limitations undocumented.                                      |
| L   | Walkthrough mock bridge ≠ TestPanel-Session mock — divergent envelope handling.                   |

This spec ships a unified mock-host control surface (a 4th **Host** tab in TestPanel) backed by a shared bridge module reused by Walkthrough; adds correlation-collision visibility (toast + queue badge + red trace row + authoring lint); adds handlerKey autocomplete in ActionEditor; and surfaces the live submit envelope. Schema validation and `$response` documentation are explicitly deferred.

## Decisions (locked during brainstorm)

| Topic                    | Decision                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope                    | Single spec covering all 9 gaps.                                                                                                                                    |
| Structure                | New 4th tab in TestPanel: `Synth \| Live \| Session \| Host`.                                                                                                       |
| Response editor          | Hybrid: per-handlerKey preset dropdown seeds JSON in a textarea editor.                                                                                             |
| Timeout / error sim      | Explicit `Time out` + `Network error` buttons + a delay slider on Success/Error.                                                                                    |
| Multi-step conversations | Per-pending-entry queue. Each entry has its own response editor + Success / Error / Timeout / Network-error buttons. Resolves independently.                        |
| Collision visibility     | Toast + queue badge + red row in TestPanelTrace history + new authoring-lint rule (warn on multiple host_call_await actions sharing handlerKey under one listener). |
| Schema validation        | Deferred. Custom payload editor covers 80% of needs; formal schema is a follow-up.                                                                                  |
| Submit envelope docs     | Live JSON preview in the Host tab when a submit is pending. (No generated TS docs / markdown ref in this spec.)                                                     |
| `$response` docs         | Deferred.                                                                                                                                                           |
| handlerKey autocomplete  | Recently-used keys from existing host_call_await + host_action actions in the doc. Pure derivation, no new schema.                                                  |
| Walkthrough alignment    | Walkthrough uses the same shared bridge module. Pending entries from both engines surface in Host tab queue with source tags `[builder]` / `[walkthrough]`.         |

## Architecture

```
TestPanel (existing floating dock)
├── Header (title, Drives-preview badge, dock, close)
├── Status strip (always visible)
├── Mode tabs ───── EXTENDED: Synth | Live | Session | Host
└── Mode body
    ├── Synth — unchanged
    ├── Live — unchanged
    ├── Session — keeps lifecycle controls; "Host loop" section slims to
    │             "{n} pending — open Host tab to configure / resolve"
    └── Host tab — NEW
        ├── Mock-host config
        │   ├── Default response (per-handlerKey preset dropdown + JSON textarea)
        │   ├── Default delay slider (0–30s)
        │   └── Default failure mode toggle (None / Timeout / NetworkError)
        ├── Pending continuations queue ───── live, both engines
        │   └── Per-entry: handlerKey, correlationId, age, source tag, payload preview
        │       └── Per-entry response editor (preset + JSON) + buttons
        │           [Success] [Error] [Time out] [Network error]
        ├── Submit envelope preview ───── live JSON when submit pending
        └── Collision banner (red) when engine detects correlation collision
└── Trace section
    └── History view ── flags `runtime.continuation_collision` rows red

apps/web/src/lib/host-bridge-shared.ts  (NEW)
  - Used by: WalkthroughRoute (replaces local mock), useTestPanelState
  - State: mockHostConfig (defaults: response, delay, failure mode),
           pendingContinuations (live, from engine subscriptions),
           collisionEvents (FIFO 20)
  - Auto-respond: on `runtime.host_call_await_pending`, schedule a delayed
                  dispatch of host.action_response per the configured payload.

ActionEditor (apps/web/src/features/behavior/composer/ActionEditor.tsx)
  - handlerKey field: native <datalist> autocomplete sourced from
    handler-key-autocomplete.collectKeys(activeDocument).

authoring-lints (packages/runtime/src/authoring-lints.ts)
  - NEW rule: warn when a listener has ≥2 host_call_await actions sharing
    handlerKey within one branch arm (or the listener body root). Different
    handlerKeys, or same handlerKey across mutually-exclusive branch arms,
    don't warn.
```

**Architecture invariants:**

- Host tab is the single mock-host control surface. Session tab's host-loop section becomes a slim pending-count + "Open Host tab" link.
- One shared mock-bridge module owns config + pending queue + response routing. Both Walkthrough and TestPanel-Host consume the same instance per engine.
- Engine adds **one** new method: `getPendingContinuations(): PendingContinuationSnapshot[]` (read-only snapshot). No change to dispatch / response semantics.
- Authoring lint is additive (new rule in existing pipeline).
- TestPanelTrace already renders trace events; we add a red-style rule for `runtime.continuation_collision`.

## Components

### New files

| File                                                                       | Purpose                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/features/test-panel/TestPanelHost.tsx`                       | Host tab body. Renders mock config + pending queue + submit envelope preview + collision banner.                                                                                                                                                                                                         |
| `apps/web/src/features/test-panel/HostConfigEditor.tsx`                    | Mock-host config sub-component: preset dropdown + JSON textarea + delay slider + failure-mode toggle. Reused for default + per-entry editor.                                                                                                                                                             |
| `apps/web/src/features/test-panel/PendingContinuationRow.tsx`              | One pending-entry row: handlerKey, correlationId, age, source tag, payload preview, response editor, action buttons.                                                                                                                                                                                     |
| `apps/web/src/features/test-panel/SubmitEnvelopePreview.tsx`               | Live JSON viewer for the form.submit envelope (when submit pending). Copy-to-clipboard.                                                                                                                                                                                                                  |
| `apps/web/src/features/test-panel/host-presets.ts`                         | Static preset library. Exports an array of `MockHostResponsePreset` with `handlerKey`, `kind: "success" \| "error" \| "timeout" \| "network-error"`, `payload: unknown`. Includes: `submit-success`, `submit-error`, `prefill-success`, `prefill-error`, `host-call-timeout`, `host-call-network-error`. |
| `apps/web/src/features/test-panel/host-presets.test.ts`                    | TDD tests for preset shape + lookup by handlerKey + kind.                                                                                                                                                                                                                                                |
| `apps/web/src/lib/host-bridge-shared.ts`                                   | Shared mock-bridge state + helpers. Owns `mockHostConfig`, `pendingContinuations`, `collisionEvents`, response presets, delay scheduling, response routing per engine.                                                                                                                                   |
| `apps/web/src/lib/host-bridge-shared.test.ts`                              | TDD tests for the bridge — auto-respond, manual resolve, failure modes, collision capture, source tagging, cleanup.                                                                                                                                                                                      |
| `apps/web/src/features/behavior/composer/handler-key-autocomplete.ts`      | Pure helper: `collectKeys(doc): Array<{ key, frequency, listenerLabels }>`. Walks every step's sections / groups / fields, finds host_call_await + host_action action configs, dedupes by handlerKey, returns frequency-sorted then alpha-sorted.                                                        |
| `apps/web/src/features/behavior/composer/handler-key-autocomplete.test.ts` | TDD tests.                                                                                                                                                                                                                                                                                               |

### Modified files

| File                                                       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/features/test-panel/types.ts`                | `TestPanelMode` adds `"host"`. New types: `MockHostConfig { defaults: { response, delayMs, failureMode } }`, `MockHostResponsePreset`, `MockHostFailureMode = "none" \| "timeout" \| "network-error"`, `PendingContinuationSnapshot { correlationId, handlerKey, listenerId, actionId, source: "builder" \| "walkthrough", createdAt }`. Add `mockHostConfig: MockHostConfig`, `pendingContinuations: PendingContinuationSnapshot[]`, `collisionEvents: RuntimeTraceEntry[]` (cap 20) to `TestPanelState`. |
| `apps/web/src/features/test-panel/state.ts`                | New actions: `set-mock-host-config`, `set-pending-continuations`, `append-collision`. Reducer cases. `initialTestPanelState` extended with sensible defaults.                                                                                                                                                                                                                                                                                                                                              |
| `apps/web/src/features/test-panel/state.test.ts`           | New tests for each action + cap-20 enforcement on collisions + mode-union widening.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `apps/web/src/features/test-panel/useTestPanelState.ts`    | New callbacks `setMockHostConfig`, `setPendingContinuations`, `appendCollision`. Subscribes to engine for `runtime.continuation_collision` and `runtime.host_call_await_pending` and `runtime.host_call_await_resolved` trace events. Persists `mockHostConfig` to `sessionStorage` under `mock-host-config-v1`.                                                                                                                                                                                           |
| `apps/web/src/features/test-panel/TestPanelHeader.tsx`     | Add 4th mode button "Host" with `aria-pressed`.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `apps/web/src/features/test-panel/TestPanel.tsx`           | Branch on `mode === "host"` to render `<TestPanelHost>`.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `apps/web/src/features/test-panel/TestPanelSession.tsx`    | Slim Host loop section: replace inline Success/Error buttons with "{n} pending — Open Host tab" + a button that calls `onSetMode("host")`.                                                                                                                                                                                                                                                                                                                                                                 |
| `apps/web/src/features/test-panel/TestPanelTrace.tsx`      | Style rule: rows whose `report.event.type === "runtime.continuation_collision"` get red border + bg in History view.                                                                                                                                                                                                                                                                                                                                                                                       |
| `apps/web/src/features/walkthrough/WalkthroughRoute.tsx`   | Replace local mock bridge with `host-bridge-shared`. Pass walkthrough's engine + `source: "walkthrough"` tag.                                                                                                                                                                                                                                                                                                                                                                                              |
| `apps/web/src/features/walkthrough/host-bridge-mock.ts`    | **Delete file** — superseded by `host-bridge-shared`.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `apps/web/src/features/behavior/composer/ActionEditor.tsx` | handlerKey field switches to a `<datalist>`-backed `<input>` with options sourced from `handler-key-autocomplete.collectKeys(activeDocument)`.                                                                                                                                                                                                                                                                                                                                                             |
| `apps/web/src/App.tsx`                                     | Instantiate the shared bridge for the builder engine. Replace `handleMockSubmitSuccess` / `handleMockSubmitError` to route through bridge.resolve. Pipe `pendingContinuations` snapshot from bridge into TestPanel state. Pipe collision events to TestPanel + emit a one-shot toast via existing `setMessage`.                                                                                                                                                                                            |
| `packages/runtime/src/engine.ts`                           | Add `getPendingContinuations(): PendingContinuationSnapshot[]` returning a sanitized snapshot (no function refs).                                                                                                                                                                                                                                                                                                                                                                                          |
| `packages/runtime/src/types.ts`                            | Add `PendingContinuationSnapshot` interface (subset of `PendingContinuation` without `resolve` / `reject` / `timeoutHandle`). Add `handlerKey` to `PendingContinuation` if not already there.                                                                                                                                                                                                                                                                                                              |
| `packages/runtime/src/engine.test.ts`                      | Tests for `getPendingContinuations` (returns snapshot, excludes function refs, handlerKey present).                                                                                                                                                                                                                                                                                                                                                                                                        |
| `packages/runtime/src/authoring-lints.ts`                  | New rule `lint-host-call-await-handlerkey-collision`. Walks each listener's actions (and recurses into branch arms — one warning if same handlerKey appears within one arm; no warning across arms).                                                                                                                                                                                                                                                                                                       |
| `packages/runtime/src/authoring-lints.test.ts`             | Tests for the new rule (4 cases).                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

### Engine changes (additive only)

- `RuntimeEngine.getPendingContinuations(): PendingContinuationSnapshot[]` — read-only view of the engine's internal `pendingContinuations` map.
- `PendingContinuation` may need a `handlerKey` field added if not already tracked. Verify during plan write-up.
- No change to dispatch / response handling.

## Data Flow

### Bridge initialization

```
App.tsx mounts → useTestPanelState mounts engine
  ↓
host-bridge-shared.createBridge(engine, getMockHostConfig, dispatchEvent) instantiated
  ↓
Bridge subscribes to engine.subscribe — watches for:
  - runtime.host_call_await_pending
  - runtime.continuation_collision
  - runtime.host_call_await_resolved
  ↓
On each event, bridge updates its own state + pushes a snapshot via callbacks:
  setPendingContinuations(engine.getPendingContinuations())
  appendCollision(event)  (only on collision)
  ↓
useTestPanelState reducer writes to TestPanelState
```

### Default response flow (auto-respond using config)

```
Listener emits host_call_await with handlerKey "submit"
  ↓
Engine schedules continuation; emits runtime.host_call_await_pending
  ↓
Bridge sees event:
  - Look up mockHostConfig.defaults for handlerKey "submit"
  - If failureMode = "timeout": let engine time out naturally (no dispatch)
  - If failureMode = "network-error": setTimeout(delay) → dispatch malformed
                                       host.action_response (engine rejects)
  - Otherwise: setTimeout(delay) → dispatch host.action_response with payload
  ↓
Engine resolves continuation, runs continuation actions
  ↓
Bridge sees runtime.host_call_await_resolved → drops entry from local pending list
```

### Per-entry manual resolution (Host tab)

```
User opens Host tab → sees pending queue with 2 entries
  ↓
User clicks one entry → expands inline editor (preset + JSON)
  ↓
User picks preset "prefill-error" → JSON pre-fills with error shape
  ↓
User edits JSON if needed → clicks "Error"
  ↓
TestPanelHost.onResolve(correlationId, kind, payload)
  ↓
bridge.resolve(correlationId, kind, payload)
  ↓
For kind = "Success" / "Error": dispatch host.action_response with payload
For kind = "Timeout": cancel any auto-respond timer + let engine time out
For kind = "NetworkError": dispatch host.action_response with malformed payload
  ↓
Engine resolves → runtime.host_call_await_resolved fires → bridge drops entry
```

### Collision detection visibility

```
Engine detects two host_call_await actions with same correlationId pending
  ↓
Engine emits runtime.continuation_collision trace event
  ↓
Bridge receives via engine.subscribe → appendCollision(event)
  ↓
TestPanelState.collisionEvents grows (cap 20, FIFO)
  ↓
Three surfaces render the collision:
  1. Toast: useTestPanelState's effect on collisionEvents → call setMessage
  2. Host tab banner: collision count badge on pending queue header + red banner
  3. TestPanelTrace history: rows with event.type === "runtime.continuation_collision"
                              get red border + bg
```

### Authoring-time lint

```
authoring-lints.lintListeners(doc) called by existing pipeline
  ↓
New rule walks each listener's actions:
  Map<handlerKey, count> of host_call_await actions in this listener body root
  If any handlerKey count >= 2 → emit warning
  Recursion into branch arms:
    - Walk `then` arm with its own Map (independent from root)
    - Walk `else` arm with its own Map
    - Same handlerKey across arms = no warning (mutually exclusive)
  ↓
Warning surfaces via existing lint UI
```

### Walkthrough integration

```
WalkthroughRoute mounts engine
  ↓
Imports host-bridge-shared
  ↓
Bridge subscribes to walkthrough's engine (separate instance from builder's)
  ↓
Walkthrough's listeners that emit host_call_await use the same auto-respond config
  ↓
If Host tab is open AND Walkthrough is running, pending continuations from
  BOTH engines surface in Host tab queue (tagged with source: "builder" | "walkthrough")
```

### handlerKey autocomplete

```
ActionEditor renders host_call_await action
  ↓
On handlerKey field focus:
  handler-key-autocomplete.collectKeys(activeDocument)
  → walks every step.sections.fields.behaviors (and groups)
  → finds host_call_await + host_action action configs
  → extracts unique handlerKey values (dedupe)
  → returns: [{ key, frequency, listenerLabels }]
  ↓
Render as <datalist> options (native browser autocomplete on the input)
```

### Submit envelope preview

```
state.submit.status === "submitting" (from runtimeSessionState in App)
  ↓
Bridge captures the form.submit envelope on engine.subscribe (event.type === "form.submit")
  ↓
SubmitEnvelopePreview reads the captured envelope from bridge
  ↓
Renders JSON pretty-print viewer with copy-to-clipboard button
```

## Error Handling & Edge Cases

| Case                                               | Behavior                                                                                                                                                                                                                         |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mock-host config invalid JSON                      | Inline `aria-invalid` + red border + helper text. Send buttons disabled until valid.                                                                                                                                             |
| Multiple pending continuations for same handlerKey | Auto-respond resolves them in arrival order (FIFO). User can manually pick a specific entry in queue. Collision banner only when engine reports `runtime.continuation_collision` (same correlationId, not just same handlerKey). |
| Resolve clicked but engine already timed out       | Bridge catches the rejection, drops the entry, shows toast: "Continuation already timed out — refresh queue".                                                                                                                    |
| Auto-respond delay fires after engine timeout      | Bridge cancels timer in cleanup; if it fires, `dispatch(host.action_response)` is a no-op (engine ignores unknown correlationId).                                                                                                |
| Network-error simulation payload                   | Send envelope with `payload: { error: { code: "NETWORK_ERROR", message: "..." } }` and a `__simulatedNetworkError: true` marker. Engine treats as malformed → emits `runtime.host_response.malformed`. Bridge drops entry.       |
| handlerKey autocomplete with empty doc             | Datalist empty; field still accepts free-text input.                                                                                                                                                                             |
| Authoring lint warning with no listener label      | Use listener id fallback.                                                                                                                                                                                                        |
| Host tab opens with no pending entries             | "No pending host calls. Auto-respond config affects future calls." Config editor remains visible.                                                                                                                                |
| Walkthrough running concurrently with builder      | Pending queue tags entries `[builder]` / `[walkthrough]`. Resolve targets the correct engine.                                                                                                                                    |
| Bridge state lifecycle                             | Bridge instance lives as long as app session. Engine swap (document reload) clears pending entries via subscribe cleanup. mockHostConfig persisted to sessionStorage.                                                            |
| User toggles failure mode mid-pending              | Already-pending entries keep their original auto-respond path. New pending entries use the new config.                                                                                                                           |
| Submit envelope preview missing                    | Render placeholder "Run Submit from Session tab to preview the envelope."                                                                                                                                                        |
| Collision in Walkthrough engine                    | Same surfaces (toast + queue badge + trace red row). Toast appears regardless of whether panel is open (uses App-level setMessage).                                                                                              |
| Reset session during pending host calls            | Existing reset-confirm guard covers this. After reset, all pending entries cleared.                                                                                                                                              |
| Lint with branch arms                              | Walk `then` and `else` arms recursively. Same handlerKey within one arm = warning. Same handlerKey across arms = no warning.                                                                                                     |
| collisionEvents buffer cap                         | FIFO 20. Older collisions evict silently.                                                                                                                                                                                        |

## Testing

### Untouched

- API tests (99 pytest).
- E2E suites: `phase3`, `walkthrough`.

### New unit tests (pure logic via `tsx --test`)

`apps/web/src/lib/host-bridge-shared.test.ts` (~10 tests):

- `createBridge wires engine subscribe + cleanup`
- `auto-respond resolves pending entry with default response after delay`
- `failureMode "timeout" lets engine time out (no dispatch from bridge)`
- `failureMode "network-error" dispatches malformed payload`
- `manual resolve(correlationId, "Success", payload) dispatches host.action_response`
- `manual resolve("Error", ...) dispatches with error envelope`
- `bridge drops entry on runtime.host_call_await_resolved`
- `bridge tags entries with engine source ("builder" | "walkthrough")`
- `delayed timer cancelled on engine reset`
- `collision event appended to collision buffer (cap 20)`

`apps/web/src/features/test-panel/host-presets.test.ts` (~4):

- preset library exports expected entries
- preset lookup by handlerKey
- preset `kind` matches expected enum
- preset payload shape valid JSON

`apps/web/src/features/behavior/composer/handler-key-autocomplete.test.ts` (~5):

- `collectKeys returns unique handlerKeys from doc`
- `collectKeys walks groups + fields recursively`
- `collectKeys finds host_call_await + host_action`
- `collectKeys returns empty array for doc with no host actions`
- `collectKeys orders by frequency desc, then alpha`

`apps/web/src/features/test-panel/state.test.ts` (extend +4):

- `set-mock-host-config writes config field`
- `set-pending-continuations replaces pending list`
- `append-collision enforces FIFO cap of 20`
- `set-mode accepts "host"`

(11 → 15 tests in state.test.ts)

`packages/runtime/src/engine.test.ts` (extend +2):

- `getPendingContinuations returns snapshot of pending entries with handlerKey + correlationId`
- `getPendingContinuations excludes function refs (resolve/reject/timeoutHandle)`

`packages/runtime/src/authoring-lints.test.ts` (extend +4):

- `lint warns when listener has 2 host_call_await actions sharing handlerKey`
- `lint passes when handlerKeys differ across actions`
- `lint passes when same handlerKey used across mutually-exclusive branch arms`
- `lint warns when same handlerKey appears within one branch arm`

### E2E

Extend `apps/web/e2e/test-panel.run.mjs` with Host-tab flow:

- Switch to Host tab.
- Pick preset "submit-success" → assert JSON populated.
- Trigger a synth event that fires host_call_await OR Submit from Session tab.
- Assert pending queue shows 1 entry.
- Click queue entry → click Success → assert queue empties + status pill shows success.
- Trigger collision: dispatch two host_call_await with same handlerKey → assert collision banner + toast + trace history red row.

### Removal verification

- `apps/web/src/features/walkthrough/host-bridge-mock.ts` deleted.
- `WalkthroughRoute` imports `host-bridge-shared` not `host-bridge-mock`.

### Gates

- `npm run typecheck:web` clean.
- `npm run build:runtime` clean (additive only).
- `npm run test --workspace @form-builder/runtime` ≥111 (105 baseline + ≥6 new).
- `.venv/bin/pytest apps/api/tests` 99/99.
- `npm run e2e:phase3`, `e2e:test-panel` (extended), `e2e:walkthrough` — green.
- `npm run format:check` clean.

## Out of Scope

- Schema validation on host responses (deferred — optional schema declared per handlerKey or per-action).
- Generated TS-doc → markdown for `RuntimeSubmitPayload`.
- `$response` token scope documentation.
- Saving / replaying named host scenarios (presets cover the common path).
- Multi-engine coordination beyond builder + walkthrough (e.g. several walkthroughs at once).
- Real host integration glue (production bridge implementation).
- Network-error simulation that mimics specific HTTP status codes (single "malformed" path covers the engine's reject path).

## Risks

- **Bridge shared state across engines**: subtle bugs if cleanup misses an engine swap. Mitigation: tests for the cleanup path + sessionStorage only stores config not pending entries.
- **`runtime.host_call_await_pending` event type may not exist yet**: verify in plan write-up; if engine doesn't emit it, add an additive emission alongside the existing pending-continuations Map insert. Single-line additive change, no contract break.
- **`handlerKey` may not be on `PendingContinuation`**: verify; add as additive field if absent.
- **Walkthrough's existing host-bridge-mock.ts has the `MockHostBridge` interface used by tests**: verify before delete; migrate any consumer first.
- **Per-entry response editor reuses HostConfigEditor**: shared component must handle both "default for all future" and "override for this entry" modes via prop variation.

## Open Questions

None blocking. To validate during plan write-up:

1. Does the engine emit `runtime.host_call_await_pending` and `runtime.host_call_await_resolved` today? If not, add additive emissions.
2. Is `handlerKey` on `PendingContinuation` today? If not, add additive field.
3. Does any existing code import `host-bridge-mock.ts` other than `WalkthroughRoute.tsx`? Verify safe deletion.
