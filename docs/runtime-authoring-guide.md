# Runtime Authoring Guide

## Purpose

This guide explains how a form author configures runtime behavior in the
builder without needing to think in engine internals first.

The current model is intentionally simple:

1. choose what should happen
2. choose when it should happen
3. optionally add conditions
4. choose what the runtime should do next

In the UI, this lives in the builder inspector under `Events`.

## Mental Model

Use this vocabulary consistently:

- `Event`
  - something happened
  - examples: a button was clicked, a field changed, the form loaded, submit failed
- `Rule guard`
  - a condition that must be true before the listener runs
- `Listener`
  - connects an event to one or more actions
- `Action`
  - what the runtime should do in response

Plain-language mapping:

- `When this happens` = event
- `If these conditions are true` = optional rule guard
- `Do these things` = action chain

## Where To Author Behavior

The `Events` tab works in two scopes.

### Form scope

Use `Form events` when no specific preview node should own the behavior.

This is the right place for:

- `form.load`
- `form.submit`
- `form.validation_failed`
- host-facing orchestration events

Form-level listeners can target any node in the form.

### Node scope

Select a step, section, group, field, or button component in the preview first.

Then use `Events` for behavior that belongs to that selected node, such as:

- button click handling
- field change handling
- show or hide another node
- set another field value
- request a host action

The preview is the primary selection surface. The inspector is where the
selected behavior is refined.

## Current Authoring Flow

1. Open a project in `Build`
2. Select the step, section, group, or field in the preview
3. Open the `Events` tab in the inspector
4. Add a preset or create a listener manually
5. Adjust the event, optional rule guards, and action chain
6. Use `Runtime tools` to validate the flow

## Starter Presets

The current builder favors presets before raw configuration.

Current examples include:

- `Form loaded`
- `Form submit dispatched`
- `Validation failed`
- field-change presets
- button click flows

Presets are meant to make common flows obvious first. Authors can then edit the
resulting listener and actions instead of building everything from scratch.

## Buttons

Buttons are runtime components, not a separate hidden action system.

Current authoring pattern:

1. add a field
2. change its field type to `Button`
3. open `Events`
4. attach `component.click` behavior
5. add one or more actions

Typical button actions:

- `go_to_next_step`
- `go_to_previous_step`
- `go_to_step`
- `submit_form`
- `emit_event`
- `host_action`

If a button has no explicit authored listener yet, the runtime still maintains a
compatibility path so older preview behavior keeps working. Explicit listeners
override that path.

## Action Chains

Each listener can run multiple actions in order.

Current built-in action kinds:

- `go_to_next_step`
- `go_to_previous_step`
- `go_to_step`
- `submit_form`
- `set_field_value`
- `clear_field_value`
- `show_node`
- `hide_node`
- `enable_node`
- `disable_node`
- `mark_required`
- `mark_optional`
- `emit_event`
- `host_action`

Use multiple actions when one event needs to:

- update state
- then navigate
- then tell the host something happened

Action order matters. The runtime executes them in the order shown in the
listener.

## Rules And Guards

Rules remain separate from event wiring.

Use a rule guard when the same event should only fire actions in certain cases.

Example:

- event: `field.change`
- guard: selected value equals `Yes`
- actions:
  - `show_node`
  - `mark_required`

Current rule support is still lighter than the long-term target, but the model
is already correct: conditions guard listeners rather than replacing them.

## Payload Authoring

Two payload editing modes are supported for `emit_event` and `host_action`.

### Key/value mode

Default authoring path.

Use it when:

- the payload is small
- the event only needs a few fields
- the host action request is straightforward

This mode is the recommended starting point for non-engineers.

### JSON mode

Advanced path.

Use it when:

- the payload is nested
- arrays or object fragments matter
- the host contract already expects a richer envelope

The builder supports applying JSON back into the action config and resetting the
editor from the current payload.

## Runtime Tools

Use `Runtime tools` while authoring behavior.

Current capabilities:

- inspect the current runtime session snapshot
- inspect the current submit payload
- inspect the recent runtime trace
- export session state
- import session state
- seed required fields for runtime QA
- simulate host success
- simulate host error

This is the current runtime QA loop:

1. trigger the behavior in preview
2. inspect the trace
3. inspect session state
4. if submit entered `submitting`, use mock host success or error

## Common Patterns

### Navigate to the next step

- select button field
- event: `component.click`
- action: `go_to_next_step`

### Submit the form

- select button field or use form-level orchestration
- event: `component.click`
- action: `submit_form`

If validation fails, the runtime emits `form.validation_failed`.

If validation passes, the runtime emits `form.submit`.

### Request host behavior

- choose action: `host_action`
- provide a `handlerKey`
- optionally provide payload fields

Current host actions are fire-and-forget requests. They are intended to trigger
host-owned behavior, not return inline values to the runtime yet.

### Emit a custom event

- choose action: `emit_event`
- provide `eventName`
- optionally provide payload

Use this when the runtime should broadcast intent without directly owning the
result.

## Current Limits

The current authoring UX is intentionally guided first.

Known limits:

- field editing in preview is still shallow compared with the long-term runtime
- payload typing is light by design
- there is no event graph or path map yet
- runtime QA tools are still dev-oriented, not end-user polished

These are acceptable for the current slice as long as the core engine and event
contracts stay stable.
