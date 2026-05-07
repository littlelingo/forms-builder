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
