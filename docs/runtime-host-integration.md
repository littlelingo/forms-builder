# Runtime Host Integration

## Purpose

This guide explains how an application shell embeds the shared runtime and
communicates with it.

Examples of host shells:

- the current builder preview
- a future VA.gov form shell
- an internal admin or case-management app

The runtime is intentionally generic. The host shell owns environment-specific
concerns such as authentication, session context, transport, routing, and
integration wiring.

## Integration Model

The runtime and host communicate through a structured event envelope.

The runtime:

- loads authored form JSON
- manages runtime session state
- emits runtime events outward
- ingests host events inward

The host:

- mounts the runtime
- provides context
- observes outbound events
- performs host-owned work
- dispatches success, error, or context events back in

## Current Runtime API

The shared runtime currently exposes:

```ts
import { createRuntimeEngine } from "@form-builder/runtime";

const engine = createRuntimeEngine();

engine.mount(document, {
  runtimeId: "runtime_preview",
  projectId: "project_123",
  hostContext: {
    environment: "builder-preview",
    session: {},
    auth: {},
    app: {},
    data: {},
  },
});

const unsubscribe = engine.subscribe((event) => {
  // host receives outbound and routed events here
});

engine.dispatch(inboundEvent);
engine.getState();
engine.getSubmitPayload();
```

Key methods:

- `mount(document, options)`
- `unmount()`
- `dispatch(eventEnvelope)`
- `invoke(action)`
- `subscribe(handler)`
- `getState()`
- `setState(partialState)`
- `validate()`
- `getSubmitPayload()`
- `getTrace()`

## Host Context

Host context is passed at mount time and can be refreshed later.

Current shape:

```ts
{
  environment: string,
  session: Record<string, unknown>,
  auth: Record<string, unknown>,
  app: Record<string, unknown>,
  data: Record<string, unknown>,
}
```

Use it for:

- environment name
- host session identifiers
- auth-derived context
- app-specific flags
- host-provided data needed by authored behavior

The runtime may read this context, but it should not own or mutate host auth and
session lifecycle itself.

## Outbound Events

The host should expect outbound events such as:

- `form.load`
- `step.enter`
- `step.leave`
- `field.change`
- `component.click`
- `form.validation_failed`
- `form.submit`
- `host.action_requested`
- custom events emitted through `emit_event`

Some events are authored behavior. Others are runtime lifecycle signals.

## Inbound Events

The host can dispatch inbound events such as:

- `form.submit_success`
- `form.submit_error`
- `host.context_updated`
- custom host-originated events

Example:

```ts
engine.dispatch({
  type: "form.submit_success",
  version: "1.0",
  source: {
    runtimeId: "runtime_preview",
    formId: document.id,
    projectId: "project_123",
    nodeId: document.id,
    nodeType: "form",
  },
  payload: {
    message: "Saved successfully",
  },
  correlationId: submitCorrelationId,
  timestamp: new Date().toISOString(),
});
```

## Submit Contract

The current submit model uses the event-driven baseline.

### Runtime side

1. authored behavior triggers `submit_form`
2. runtime validates
3. if invalid, runtime emits `form.validation_failed`
4. if valid, runtime emits `form.submit`

### Host side

1. observe `form.submit`
2. inspect `event.payload.submit`
3. decide what submission means in that environment
4. perform transport or delegate to another service
5. dispatch either:
   - `form.submit_success`
   - `form.submit_error`

This keeps the runtime portable and lets different apps define submission
differently.

## Submit Payload

The runtime currently emits:

- `formId`
- `projectId`
- `stepId`
- `values`
- `validation`
- `hostContext`

The host should treat this as the runtime-owned view of the submission request,
not as a final server transport contract.

## Host Actions

The runtime currently supports a `host_action` action kind.

This does not execute arbitrary code inside the runtime.

Instead, it emits:

- `host.action_requested`

with a payload that includes:

- `handlerKey`
- `actionId`
- `target`
- `config`

Recommended host flow:

1. observe `host.action_requested`
2. route by `handlerKey`
3. execute host-owned behavior
4. optionally emit additional runtime events if the host wants to inform the
   runtime about the outcome

Current limitation:

- host actions are fire-and-forget only in this slice

## Session State

Session state is runtime execution state, not authoring state.

Use it to:

- restore the current step
- restore entered values
- preserve runtime visibility/enabled/required flags
- preserve validation state
- preserve submit state

The current builder preview exposes this through dev-only import/export tools.
A future host shell can use the same contract for draft restore or recovery.

## Recommended Host Shell Pattern

Use a thin adapter around the runtime:

```ts
const engine = createRuntimeEngine();

engine.mount(document, {
  projectId,
  hostContext,
  initialSessionState,
});

const unsubscribe = engine.subscribe((event) => {
  switch (event.type) {
    case "form.submit": {
      const submit = event.payload.submit;
      submitToHostApi(submit)
        .then(() => {
          engine.dispatch(buildInboundEvent("form.submit_success", event.correlationId, {
            message: "Saved successfully",
          }));
        })
        .catch((error) => {
          engine.dispatch(buildInboundEvent("form.submit_error", event.correlationId, {
            message: error instanceof Error ? error.message : "Submit failed.",
          }));
        });
      break;
    }
    case "host.action_requested": {
      routeHostAction(event.payload);
      break;
    }
  }
});
```

This keeps the runtime reusable while still giving the host full control over
its environment.

## Current Limits

The current host contract is stable enough for early integration, but still has
intentional limits:

- no arbitrary scripting
- no async action chaining inside the runtime
- no returned values from host actions yet
- no polished external shell package yet
- no environment-specific VA.gov adapter yet

Those should be added only after the current event-driven contract is exercised
through more real host integrations.
