# Runtime Roundtrip Testing

## Purpose

Runtime behavior is only trustworthy if it survives the same loop the product
depends on:

1. author behavior
2. save behavior to `document.json`
3. load the runtime from authored JSON
4. interact with the runtime
5. export runtime session state
6. restore the runtime from that state
7. complete the host submit loop

This document defines the current roundtrip checks for the shared runtime layer.

## Roundtrip Types

### 1. Authoring roundtrip

Goal:
- authored runtime behavior survives save and reload unchanged

Checks:
- node-level listeners persist
- form-level listeners persist
- action order persists
- payload configuration persists
- host binding declarations persist

Primary validation seams:
- API persistence tests
- builder `Open JSON` / save flow

### 2. Runtime session roundtrip

Goal:
- runtime execution state can be exported, restored, and resumed

Checks:
- current step restores
- field values restore
- node flags restore
  - visible
  - enabled
  - required
- validation state restores
- submit state restores
- host context snapshot restores

Primary validation seams:
- shared runtime unit tests
- builder `Runtime tools` modal

### 3. Host submit roundtrip

Goal:
- the runtime and host shell can complete the event-driven submit loop cleanly

Checks:
- runtime emits `form.submit`
- host receives a structured submit envelope
- host dispatches back `form.submit_success` or `form.submit_error`
- runtime updates submit state correctly

Primary validation seams:
- shared runtime unit tests
- builder `Runtime tools` mock success/error controls

## Current Dev Tooling

The builder preview is the first host shell for the shared runtime.

The `Runtime tools` modal currently supports:
- export runtime session JSON
- import runtime session JSON
- inspect current runtime session state
- inspect the current submit payload
- inspect the recent runtime event trace
- simulate `submit_success`
- simulate `submit_error`

This is intentionally dev-only for now. It exists to validate the engine before
the runtime is embedded into a richer external shell.

## Current Automated Coverage

The shared runtime now has deterministic test coverage for:

- session export/import style restore
- validation-blocked submit
- submit success roundtrip
- submit error roundtrip
- explicit button listeners overriding the old implicit button compatibility path

Run:

```bash
npm run test:runtime
```

## Manual Browser Validation

Use this sequence in the builder:

1. Open a project in `Build`
2. Open `Runtime tools`
3. Confirm session snapshot and event trace are visible
4. Interact with preview controls
5. Confirm step navigation appears in the trace
6. Trigger submit from preview
7. Confirm either:
   - `form.validation_failed`, or
   - `form.submit`
8. Use mock success/error controls when the runtime is in submitting state
9. Export session JSON
10. Re-import session JSON and confirm state restore

Current live-validated behaviors:

- authored button dispatch can advance steps through explicit runtime listeners
- preview submit can remain in `submitting` until the dev tools simulate the
  host response
- mock success drives the runtime to `success`
- mock error drives the runtime to `error`

## Expected Trace Patterns

### Initial mount

- `form.load`
- `step.enter`

### Step navigation

- `component.click`
- `step.leave`
- `step.enter`

### Validation-blocked submit

- `component.click`
- `form.validation_failed`

### Successful submit cycle

- `component.click`
- `form.submit`
- inbound `form.submit_success`

### Failed submit cycle

- `component.click`
- `form.submit`
- inbound `form.submit_error`

## Current Gaps

- field editing in preview is still shallow compared with the long-term runtime
  target
- session import/export is validated in dev tooling, but not yet covered by
  API-level persistence tests
- payload authoring is still light, so most event payload testing is currently
  structural rather than author-driven
- broader end-to-end browser coverage still needs to grow as preview inputs
  become more interactive and authored behavior becomes more complex

## Recommended Next Validation Slice

1. Add persistence-style regression checks that save and reload runtime behavior
   through the project APIs
2. Extend browser validation around authored payload usage and richer
   multi-action listener flows
3. Deepen preview interactivity so field-value editing is less synthetic during
   runtime QA
