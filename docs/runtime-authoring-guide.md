# Runtime Authoring Guide

## Purpose

This guide explains how a form author configures runtime behavior in the
builder without needing to think in engine internals first.

The current model leans on the ActionScript 3 event model:

1. select the component dispatcher
2. choose the event type it emits or listens for
3. choose target/bubble or capture behavior
4. optionally add behavior conditions
5. choose what actions run next

In the UI, this lives in the builder inspector under `Behavior`.

For the complete item-by-item core event catalog, see
[Runtime Item Event Reference](./runtime-event-reference.md).

## Mental Model

Use this vocabulary consistently:

- `Event dispatcher`
  - the form, step, section, group, field, or button-like component that can dispatch and receive events
- `Event`
  - an object with `type`, `target`, `currentTarget`, `eventPhase`, `bubbles`, and `payload`
- `Core event type`
  - a built-in event a dispatcher already emits; authors do not define it
- `Listener condition`
  - an inline condition that must be true before the listener runs
- `Listener`
  - attaches to a dispatcher and receives a typed event
- `Behavior`
  - the user-facing authoring object: a listener plus optional conditions and
    ordered actions
- `Action`
  - what the runtime should do in response
- `Dispatch key`
  - a readable item key shown beside the immutable internal id so users can
    recognize sources, dispatchers, and targets in dense forms

Plain-language mapping:

- `Event type` = the event object type to listen for
- `Dispatcher` = where the listener is attached
- `Capture` / `Target + bubble` = which AS3 phase receives the event
- `If these conditions are true` = optional behavior conditions
- `Do these things` = action chain

## Where To Author Behavior

Behavior Studio works in two scopes.

### Form scope

Use form scope when the form dispatcher should own the behavior.

This is the right place for:

- `form.load`
- `form.submit`
- `form.validation_failed`
- host-facing orchestration events

Form-level listeners can receive descendant events when those events bubble.

### Node scope

Select a step, section, group, field, or button component in the preview first.

Then use `Behavior` for behavior that belongs to that selected node, such as:

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
3. Open the `Behavior` tab in the inspector
4. Choose `Add behavior`
5. Choose whether the behavior reacts to this item, another item, or an advanced dispatcher
6. Adjust the event source, event type, phase, optional conditions, and action chain
7. Use the guided behavior test or simulator/runtime lab to validate the flow

For sibling behavior, start from the item that should react. For example, select
a radio group, choose `Another item`, select the checkbox group as the event
source, then choose `checkboxGroup.change`. The builder attaches the underlying
listener at the nearest shared dispatcher so the runtime still follows the AS3
capture/target/bubble model.

Each selectable event-capable item exposes a `dispatchKey` such as
`p4.checkbox-group.type-of-benefits`. Use that key as the human-readable handle
when choosing event sources, action targets, or payload references. The runtime
still routes by immutable item id.

## Starter Presets

The current builder favors presets before raw configuration.

Current examples include:

- `Form loaded`
- `Form submit dispatched`
- `Validation failed`
- component-type presets such as checkbox group change, radio change, select change, and input change
- button click flows

Presets are meant to make common flows obvious first. Authors can then edit the
resulting behavior instead of building everything from scratch.

## Buttons

Buttons are runtime components, not a separate hidden action system.

Current authoring pattern:

1. add a field
2. change its field type to `Button`
3. open `Behavior`
4. attach `component.click` behavior
5. add one or more actions

Typical button actions:

- `go_to_next_step`
- `go_to_previous_step`
- `go_to_step`
- `submit_form`
- `dispatch_event`
- `host_action`

If a button has no explicit authored behavior yet, the runtime still maintains a
compatibility path so older preview behavior keeps working. Explicit listeners
override that path.

## Action Chains

Each behavior can run multiple actions in order.

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
- `dispatch_event`
- `host_action`

Use multiple actions when one event needs to:

- update state
- then navigate
- then tell the host something happened

Action order matters. The runtime executes them in the order shown in the
behavior.

## Listener Conditions

Standalone behavior rules have been retired from the runtime contract.
Conditions now live directly on the listener they gate.

Use behavior conditions when the same event should only fire actions in certain
cases.

Example:

- event: `checkboxGroup.change`
- condition: selected value contains `Yes`
- actions:
  - `show_node`
  - `mark_required`

Conditions can read the current value of a field or a path in the event payload.
For example, a checkbox group can dispatch `checkboxGroup.change`, a radio group
can listen for it, and the behavior can require that the checkbox payload or
field value contains a specific option before running its action chain.

## Payload Authoring

Two payload editing modes are supported for `dispatch_event` and `host_action`.

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

## Simulator And Runtime Lab

Use the simulator/runtime lab while authoring behavior.

Current capabilities:

- run a selected behavior test from a specific source item
- inspect whether the behavior was reached, matched, or skipped
- inspect condition actual/expected values
- inspect which actions ran and which runtime state changed
- inspect the current runtime session snapshot
- inspect the current submit payload
- inspect the recent runtime trace
- export session state
- import session state
- seed required fields for runtime QA
- simulate host success
- simulate host error

This is the current runtime QA loop:

1. select the behavior
2. confirm the source, dispatcher, target, and source value in the guided test
3. run the behavior test
4. inspect condition/action/state evidence
5. use runtime lab for raw traces, session JSON, and host success/error flows

The next maturity step is preview-based testing that uses the same dispatch
report while the author interacts with the rendered form directly.

## Common Patterns

### Navigate to the next step

- select button field
- event: `component.click`
- action: `go_to_next_step`

### Submit the form

- select button field or use form-level orchestration
- event: `component.click`
- action: `submit_form`

If validation fails, the runtime dispatches `form.validation_failed`.

If validation passes, the runtime dispatches `form.submit`.

### Request host behavior

- choose action: `host_action`
- provide a `handlerKey`
- optionally provide payload fields

Current host actions are fire-and-forget requests. They are intended to trigger
host-owned behavior, not return inline values to the runtime yet.

### Dispatch a custom event

- choose action: `dispatch_event`
- provide `eventType`
- choose whether the event bubbles
- optionally provide payload

Use this when the runtime should broadcast intent without directly owning the
result.

## Current Limits

The current authoring UX is intentionally guided first.

Known limits:

- field editing in preview is still shallow compared with the long-term runtime
- payload typing is light by design
- preview-based tests are not yet as purposeful as the guided behavior test

These are acceptable for the current slice as long as the core engine and event
contracts stay stable.
