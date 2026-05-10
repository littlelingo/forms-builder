# Runtime Architecture

## Purpose

The runtime layer is the executable counterpart to the authoring model.

The builder remains the place where authors shape structure and behavior. The
runtime is the shared engine that loads authored forms, manages interaction
state, dispatches events, runs listeners and actions, and communicates with the
host environment through a strict event contract.

This layer is intended to be embedded into multiple host environments, with the
builder preview becoming the first host shell.

## Layers

1. `packages/schema`
   - Shared contracts for authored forms, runtime behavior, host context, and
     session state.
2. `packages/runtime`
   - Shared execution engine.
   - Loads authoring JSON.
   - Manages session state.
   - Dispatches events.
   - Evaluates listener conditions.
   - Executes actions.
   - Emits runtime events to the host shell.
3. `apps/web`
   - Builder UI.
   - First runtime host shell through the preview surface.
4. `Host shell`
   - Environment-specific wrapper such as a VA.gov integration.
   - Provides auth/session/app context.
   - Handles submit transport.
   - Observes outbound runtime events.
   - Dispatches inbound success/error or host-originated events.

## Runtime Responsibilities

The runtime owns:

- document loading
- session-state initialization and restoration
- current-step state
- field/component value state
- visibility/enabled/required state
- event dispatch
- listener execution
- listener-condition evaluation
- built-in action execution
- validation
- submit payload generation

The runtime does not own:

- authentication or session lifecycle
- network transport
- application routing
- environment-specific persistence
- arbitrary host scripting

## Submit Flow

The baseline submit model is event-driven.

1. A component or listener triggers `submit_form`.
2. The runtime validates the form.
3. If invalid, it emits `form.validation_failed`.
4. If valid, it emits `form.submit`.
5. The host handles the transport/persistence work.
6. The host dispatches back either:
   - `form.submit_success`
   - `form.submit_error`
7. The runtime updates submit state accordingly.

This keeps transport concerns outside the runtime while preserving a portable
submit contract.

## Host Bridge

The runtime must support both directions of communication.

Outbound:

- `form.load`
- `field.change`
- `component.click`
- `form.validation_failed`
- `form.submit`
- `step.enter`
- `step.leave`
- custom emitted events

Inbound:

- `form.submit_success`
- `form.submit_error`
- `host.context_updated`
- custom host-originated events

The host bridge is responsible for:

- mounting the runtime
- passing host context through
- observing outbound events
- dispatching inbound events
- providing registered host actions

## Session State

Session state is separate from authoring JSON.

Authoring JSON stores design-time structure and behavior definitions.

Session-state JSON stores execution-time values and UI state:

- current step
- values
- node visibility/enabled/required flags
- validation state
- submit state
- host context snapshot

This separation allows reliable runtime roundtrip testing.

## Builder Preview

The builder preview will become the first real runtime host shell.

That means preview behavior should move from ad hoc UI logic into the shared
runtime package. Navigation, submit behavior, and authored button/listener
execution should all run through the same engine that a later VA.gov shell will
embed.

## Roundtrip Validation

The runtime slice must support three forms of roundtrip validation.

1. Authoring roundtrip
   - save authoring JSON
   - reload
   - preserve behavior definitions

2. Runtime roundtrip
   - load document
   - simulate interaction
   - export session state
   - reload session state
   - preserve execution state

3. Host roundtrip
   - emit `form.submit`
   - receive host success/error event
   - land in expected runtime state

## Node Descriptor Resolution

`resolveNodeDescriptor(id, tombstones?)` is a method on `RuntimeDocumentIndex`
(returned by `createRuntimeDocumentIndex`). It returns a `NodeDescriptor`:

```ts
interface NodeDescriptor {
  id: string;
  dispatchKey?: string;
  labelHint?: string;
  broken?: boolean;
  lastSeenLabel?: string;
}
```

Resolution order:

1. Live node index lookup. If found, `dispatchKey` comes from the node's
   `dispatchKey` field and `labelHint` from the node's label or title.
2. Tombstone map fallback. If the node is not in the live index, `broken` is
   set to `true` and `lastSeenLabel` comes from the tombstone entry when
   available.

The engine surfaces `resolvedTarget` descriptors inside
`dispatchWithReport.listeners[n].resolvedTarget` so Behavior Studio can show
which concrete node a listener targets — even when that node has since been
deleted.

Phase 1C will use broken descriptors to render broken-ref UI on listener cards.

## Listener Resolution Precedence

When the engine resolves the source, target, and event type for a listener it
follows this precedence:

1. **Source node.** `listener.source?.id` is preferred over legacy
   `listener.eventSourceNodeId`. Either may be null, in which case no
   source-filter is applied and all dispatchers pass.

2. **Target node.** `listener.target?.id` is preferred over legacy
   `listener.targetNodeId`. Used for `resolveNodeDescriptor` lookups and
   surfaced in dispatch reports; not used to gate dispatch routing in Phase 1A.

3. **Event type.** `listener.eventRef?.id` is preferred over legacy free-text
   `listener.type` / `listener.eventName`. When `eventRef` is present, the
   engine scans `document.runtime.formEvents` then each node's
   `runtime.eventSources` to resolve the actual event type string.

4. **EventRef scan order.** Form-scope event defs (`document.runtime.formEvents`)
   are scanned first; node-scope event sources (`field.runtime.eventSources`,
   etc.) are scanned second.

5. **Broken refs.** If `listener.eventRef.id` is present but cannot be resolved,
   the listener is skipped with `skippedReason: "broken_event_ref"` in the
   dispatch report. If `listener.libraryRef` points to an entry that the
   registry cannot find, the listener is skipped with
   `skippedReason: "broken_library_ref"`.

See [Runtime Schema](./runtime-schema.md#phase-1a-type-additions) for the
`NodeRef`, `EventRef`, and `BehaviorLibraryRef` type shapes.

## Library Materialisation

When a listener carries a `libraryRef` and `libraryRef.detached` is absent or
`false`, the engine materialises the listener at evaluation time rather than
reading its fields directly:

1. The optional `BehaviorLibraryRegistry` passed to `createRuntimeEngine` is
   called with `(entry.id, entry.revision)`.
2. If the registry returns `undefined`, the listener is skipped with
   `skippedReason: "broken_library_ref"`.
3. `applyTemplateTokens(entry.template, ref.params)` performs a pure recursive
   substitution of `{{paramKey}}` placeholders:
   - A string that is entirely a single `{{key}}` token returns the raw param
     value, preserving its type.
   - A string with embedded tokens coerces substituted values to string.
   - Arrays and plain objects are walked recursively.
4. The materialised listener is cached by `(entry.id + "::" + revision + "::" + stableStringify(params))`.
   Subsequent dispatches reuse the cached entry until the engine is unmounted.
5. `listener.id` and `listener.libraryRef` always come from the listener
   envelope, not from the template, so they survive the merge.

When `libraryRef.detached` is `true`, the listener's own fields are used
as-is; the registry is not consulted.

`applyTemplateTokens` and `stableStringify` are pure functions exported from
`packages/runtime/src/template-tokens.ts`.

## Telemetry Sink

`createRuntimeEngine({ telemetrySink })` accepts an optional callback:

```ts
type TelemetrySink = (event: BehaviorExecutedEvent) => void;

interface BehaviorExecutedEvent {
  listenerId: string;
  durationMs: number;
  error?: { message: string; actionId?: string };
}
```

The engine emits exactly one `BehaviorExecutedEvent` per fired listener, after
all of the listener's actions have run (or after the first action that throws).
`durationMs` is measured using `performance.now()`.

When no `telemetrySink` is supplied the default is a no-op. The sink is called
synchronously inside the dispatch loop; implementations should be fast. The
`branchTaken` field on `BehaviorExecutedEvent` is reserved for Phase 3
conditional branching and is not set in Phase 1A.

## Migration (Phase 1B)

Phase 1B introduces a one-shot migration that promotes legacy listener shapes to
the Phase 1A schema. The CLI, snapshot pattern, audit log, and load-time
rejection together form the hard cutover described in the spec.

### Migration marker

Migrated documents carry `runtime.migrationVersion = "phase-1"`. The marker is
set on the `runtime` block of every `document.json` and every revision under
`revisions/`. Documents without a `runtime` block (fresh PDF promotion output)
pass through cleanly — they have no listeners to migrate.

### Promotion mapping

For each `RuntimeListenerDefinition`:

- `eventSourceNodeId != null && source is null` → set `source = { id: eventSourceNodeId }`.
  Legacy field stays in place; new field becomes authoritative.
- `targetNodeId != null && target is null` → set `target = { id: targetNodeId }`.
- `eventName` is a built-in event type (matches the `BUILT_IN_EVENT_NAMES`
  registry in `services/migration.py`) → leave alone. Built-in events don't need
  an `EventRef`.
- `eventName` is custom (not in built-in registry) AND `eventRef is null` → look
  up or create a `RuntimeEventTypeDefinition` on the closest enclosing scope:
  1. The owning node's `runtime.eventSources` first.
  2. Otherwise, the form's `runtime.formEvents`.
  3. Match by `name` (or `type`) field; reuse existing def's id if found.
  4. Create a new def with a fresh UUID if none exists.
  5. Set listener's `eventRef = { id: <def-id> }`.

### Backup + audit log

Before mutating any file, the migration script copies `document.json` and every
`revisions/*.json` to `data/projects/<id>/migration-backup/<ISO-timestamp>/`.
The backup directory is permanent — it's the rollback path.

Each migration run appends a JSON entry to `data/projects/<id>/migration-log.json`.
Each entry records: `project_id`, `started_at`, `finished_at`,
`documents_migrated`, `event_defs_created`, `collisions[]`, and `noop` boolean.

### Idempotency

A document with `runtime.migrationVersion == "phase-1"` is a no-op on subsequent
runs — no snapshot, no mutation, no audit log entry. This makes the CLI safe to
re-run.

### Hard cutover at load time

`InMemoryRepository._load_projects_from_disk` raises `UnmigratedDocumentError`
when a document has a non-null `runtime` block lacking
`migrationVersion == "phase-1"`. The FastAPI app surfaces this as 409 Conflict
with a remediation message pointing at `npm run migrate:behaviors`.

Documents written through the API also get the marker stamped automatically via
`_stamp_and_write_document`. Legacy documents only show up via direct file
imports or external project syncs.

### CLI

```bash
npm run migrate:behaviors
```

Wraps `python -m form_builder_api.scripts.migrate_behaviors`, which in turn
calls `migrate_all()` from `services/migration.py`. Prints a summary: project
counts migrated/skipped, total event defs created, and any collisions.

### Test fixture

`apps/api/tests/fixtures/pre-migration-document.json` carries both legacy paths:

- A field listener with `eventSourceNodeId` + `targetNodeId` (no `source`/`target`).
- A field listener with a custom event name (`zipResolved`) (no `eventRef`).
- A form-level listener on `form.submit` (built-in event) — verified untouched
  after migration.

`test_migration_promotes_legacy_listener_fields` round-trips the fixture;
`test_migration_is_idempotent` verifies a second run is a no-op with
byte-identical output.

### Extraction synthesis (new in Phase 1B)

Promotion of a reviewed conversion to an authoring project (`POST /conversions/{id}/promote`) now synthesises a `signature.attested → submit_form` listener for every field of semantic type `signature_attestation`. The synthesised listener is tagged `provenance: "extraction"`. Authors can filter or override these via the Behavior Manager (Phase 1C). This is a behavior addition over pre-1B promotion, where signature attestation did not auto-submit.

## Phase 3 · Async dispatch + control flow + time (RFC)

Phase 3 of the behavior-authoring redesign extends the engine with async-aware
dispatch, branching action chains, time controls (debounce/throttle/wait),
and an `await`-able host call. This RFC is the precondition for any code
landing under the Phase 3 PRs and is the canonical reference for the
semantics that the engine must implement.

### Async dispatch and suspension model

The engine grows two new public methods alongside existing `dispatch` and
`dispatchWithReport`:

- `dispatchAsync(event): Promise<RuntimeSessionState>` resolves once every
  matched listener chain has run to completion, including any `wait` or
  `host_call_await` suspensions inside those chains.
- `dispatchWithReportAsync(event): Promise<RuntimeDispatchReport>` is the
  async-aware twin of `dispatchWithReport`, returning the same trace +
  per-listener diagnostic shape but only after suspensions have resolved.

`dispatch` remains synchronous and is the default entry point. It must
never `await` an async path; if a chain encounters an async-only action
under sync dispatch, the engine throws so callers see the bug immediately
instead of dropping a Promise. (Authoring validators flag any listener
that uses async-only actions when the host is known to use sync dispatch.)

Inbound events arriving while an async chain is suspended are placed on
a per-engine FIFO `dispatchQueue`. The queue drains after the active
chain fully resolves. Sync `dispatch` calls bypass the queue entirely —
they only see committed state.

### Branch action semantics

`kind: "branch"` actions evaluate a `RuntimeConditionNode` tree
synchronously using the same `evaluateConditionTree` logic the listener
match path already uses (see Phase 2B). On `true`, the `actions` arm
runs; on `false`, the optional `else` arm runs. Missing `else` is a
no-op on false.

Trace entries: `branch_take` (with `actionId` and `arm: "then" | "else"`)
or `branch_skip` (with `actionId` when no else arm exists). Both carry
the resolved condition tree result for inspector replay.

Nesting depth is capped at **3**. The engine increments a depth counter
each time it recurses into a `branch` arm; on entry at depth ≥ 3 it
emits `branch_depth_exceeded` and halts the chain via `halt_and_raise`.
Authoring validators reject save attempts with deeper nesting so the
runtime path is a defense-in-depth guard.

`$response` scope inside a branch arm is a shallow clone of the parent
chain's response scope. Sibling arms cannot leak data through the scope
because each arm receives its own clone. The clone is taken on arm
entry, before any inner `host_call_await` runs.

### Suspension and resume rules

`host_call_await` actions emit `host.action_requested` (same payload
shape as the existing fire-and-forget `host_action`) and then suspend
the listener chain at the action boundary. The engine registers a
`PendingContinuation` record keyed by `correlationId`:

```
PendingContinuation = {
  correlationId
  listenerId
  resolve(responsePayload) -> void
  reject(reason) -> void
  timeoutHandle | null
  responseScope: Record<string, unknown>  // mutable accumulator
}
```

`correlationId` defaults to a fresh `randomId()` when the action does
not supply one. Author-supplied static literals are allowed; the
authoring validator surfaces a warning when two `host_call_await`
actions in the same listener share a literal id, since the second
registration will collide and `halt_and_raise`.

Resumption: the host dispatches `host.action_response` with
`payload.correlationId` set. `applyInboundState` looks up the
continuation, calls `resolve(payload)`, clears the timeout handle, and
deletes the entry from the pending map.

Mismatch handling:

- Unknown `correlationId` → `runtime.continuation_mismatch` trace event;
  payload discarded silently. (No assumption of a stale-receive recovery
  path in MVP.)
- Timeout reached before any `host.action_response` → engine emits
  `runtime.continuation_timeout`, then runs the action's `onError`
  policy.
- Collision (an `host_call_await` registers a `correlationId` that is
  already in the pending map) → engine emits
  `runtime.continuation_collision` and rejects the second registration
  via `halt_and_raise` on its owning chain. The first continuation
  remains in place.

### onError policies

Per-action `onError` controls error fan-out. Three policies:

- `continue` — push a trace entry, advance to the next action in the
  chain. State changes from the failed action are discarded; subsequent
  actions still run against the pre-failure state.
- `halt` — stop the listener chain silently. No outbound event fires.
- `halt_and_raise` — stop the chain **and** emit `runtime.action_error`
  with `{ listenerId, actionId, reason }`. Default for new action kinds
  unless authors opt out.

Phase 1's `continueOnError: boolean` field stays as a deprecated alias.
The engine reads `action.onError` first, falling back to
`action.continueOnError ? "continue" : "halt_and_raise"` for
pre-Phase-3 documents. Authoring writes always populate `onError`
going forward; persistence layer does not migrate.

### `$response` token grammar

`$response` resolves to the most recent resumed `host.action_response`
payload **in the current listener-chain scope**. The token's resolver
walks the same dotted-path semantics as `$payload` / `$state`:
`$response.user.id` → `responseScope.user.id`.

Scope rules:

- A fresh `responseScope: {}` is created when an async chain begins.
- `host_call_await` writes the resolved payload into `responseScope`
  on resume. Subsequent actions in the same chain see it.
- `branch` arms receive a shallow clone of the parent `responseScope`
  on entry; mutations inside one arm are not visible to siblings.
- Sync chains never have a `responseScope`. The resolver returns
  `{ ok: false, reason: "response_not_in_scope" }` for any `$response`
  access in a sync chain. Authoring validators flag any `$response`
  use in a chain with no `host_call_await` action above it.

### Debounce and throttle scheduling

`listener.timing.debounce_ms` and `listener.timing.throttle_ms` exist
in the schema since Phase 1 but are inert. Phase 3 makes them active
via a per-engine listener scheduler:

- **Debounce**: clears any pending timer for the listener and arms a
  new `setTimeout(fn, debounce_ms)`. Only the most recent enqueued
  evaluation runs.
- **Throttle**: if `now - lastRun >= throttle_ms`, runs immediately and
  records `lastRun = now`. Otherwise the dispatch is dropped.
- When both are set, **debounce wins**. The full evaluation
  (conditions + actions) is wrapped, not just action execution — this
  matters because debounced field changes should not fire conditions
  on every keystroke.

Timer state is per-listener, keyed by `listener.id`. `unmount()` calls
`scheduler.reset()` to cancel pending timers and prevent leakage
between mounts.

### FIFO ordering guarantees

Per-engine `dispatchQueue` is a flat FIFO. When a synchronous
`dispatch` arrives while an async chain is suspended it bypasses the
queue and runs immediately against committed state, but its trace
entries are interleaved with the suspended chain's resume entries.
Authoring/test code that needs strict total ordering should use
`dispatchAsync` exclusively.

For multi-listener chains on the same event, intra-event ordering
follows existing capture-target-bubble + priority rules from Phase 1A.
Async listeners run **sequentially** within a single event dispatch —
listener N+1 waits for listener N's chain (including suspensions) to
complete before its conditions evaluate. This avoids interleaved state
mutations that would break determinism.

The fuzz test in `packages/runtime/src/fuzz.test.ts` is the
enforcement gate: a 100-event seeded run with 30% await-action
listeners must produce the same final trace order across three
consecutive invocations.

### Trace entries (new)

| Kind | Payload |
|---|---|
| `branch_take` | `{ actionId, arm: "then" \| "else" }` |
| `branch_skip` | `{ actionId }` (no else arm) |
| `branch_depth_exceeded` | `{ actionId, depth }` |
| `wait_started` | `{ actionId, mode, durationMs?, eventType? }` |
| `wait_resolved` | `{ actionId, reason: "elapsed" \| "event" }` |
| `wait_timeout` | `{ actionId }` |
| `host_call_await_started` | `{ actionId, correlationId, timeoutMs? }` |
| `host_call_await_resumed` | `{ actionId, correlationId, payload }` |
| `runtime.continuation_mismatch` | `{ correlationId }` (outbound event + trace) |
| `runtime.continuation_timeout` | `{ correlationId, listenerId, actionId }` |
| `runtime.continuation_collision` | `{ correlationId, listenerId, actionId }` |
| `runtime.action_error` | `{ listenerId, actionId, reason }` |
