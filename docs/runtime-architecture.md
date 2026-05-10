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
