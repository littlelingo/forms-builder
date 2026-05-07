# Runtime Schema

## Overview

The runtime schema adds first-class behavior contracts to the authoring model.

Behavior should not live only in `rendererHints`. Instead, authored forms should
be able to declare:

- custom event type metadata
- event listeners
- action chains
- inline listener conditions
- host bindings
- runtime session-state shape

## Core Concepts

### Event

An event describes something that happened.

Examples:

- `component.click`
- `field.change`
- `form.submit`
- `form.submit_success`
- `host.context_updated`

The model follows the ActionScript 3 event-dispatcher shape. Every event has an
original target dispatcher, a current target dispatcher while a listener is
running, an event phase, and a bubbling flag.

Events carry a standard envelope:

- `type`
- `version`
- `target`
- `currentTarget`
- `eventPhase`
- `bubbles`
- `source` as a legacy alias for `target`
- `payload`
- `correlationId`
- `timestamp`

`target`, `currentTarget`, and legacy `source` can include both:

- `nodeId`: immutable internal id used for persistence and dispatch routing
- `nodeKey`: human-readable dispatch key used in authoring, traces, payload
  references, and test reports

`nodeKey` is descriptive, not the primary foreign key. References that change
runtime behavior still use immutable ids.

Core event types are code-defined and do not need author definitions. Examples:

- universal: `component.show`, `component.hide`, `state.change`
- form: `form.load`, `form.submit`, `form.validation_failed`, `form.reset`
- step/structure: `step.enter`, `section.enter`, `group.enter`, `group.change`
- controls: `component.click`, `button.click`, `field.input`, `field.change`
- checkbox: `checkboxGroup.change`, `checkbox.change`, `checkbox.checked`, `checkbox.unchecked`
- radio/select/input: `radio.change`, `select.change`, `input.change`, `input.textChange`
- signature/repeatable: `signature.attested`, `repeatableGroup.item_added`

See [Runtime Item Event Reference](./runtime-event-reference.md) for the full
item-type matrix.

Custom event type definitions are metadata only. Runtime behavior dispatches an
event instance with `dispatch_event`.

### Listener Condition

A listener condition is a declarative check that must be true before a listener
executes.

Conditions are stored directly on the listener they gate. There is no
standalone behavior-rule object in the runtime schema.

Supported condition sources:

- `field_value`
  - reads the current runtime value of a field by `fieldId`
- `event_payload`
  - reads a dot-path from the received event payload

Supported operators:

- `equals`
- `not_equals`
- `contains`
- `exists`

### Listener

A listener says:

- which dispatcher it is attached to
- which event type it listens for
- whether it uses capture phase
- what priority it has within the phase
- and these listener conditions pass
- execute these actions in order

Listeners support multiple ordered actions. Dispatch walks capture from form to
target parent, runs target listeners, then bubbles through ancestors when
`bubbles` is true.

### Action

An action is an executable runtime behavior.

Built-in action kinds:

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

### Host Binding

A host binding documents how runtime events relate to the embedding environment.

Directions:

- `inbound`
- `outbound`
- `bidirectional`

## Node-Level Behavior

The following authoring nodes can optionally carry runtime behavior:

- field
- group
- section
- step

Each node can declare:

- `eventSources` for optional custom event type metadata
- `listeners`

These are stored in `runtime` on the node.

Listeners may also carry authoring metadata for smart cross-item wiring:

- `eventSourceNodeId` / `eventSourceNodeType`
- `eventSourceLabel`
- `targetNodeId` / `targetNodeType`
- `wiringMode`

The runtime still executes from `dispatcherId`, `type`, `useCapture`, and
`priority`. The extra fields let Behavior Studio explain that, for example, a
radio group is reacting to a checkbox group event through a shared section
dispatcher.

## Dispatch Keys

Every event-capable authoring item can carry an optional `dispatchKey`:

- document/form
- step
- section
- group
- field
- button-like component fields

The builder backfills missing keys with stable readable values such as
`p4.checkbox-group.type-of-benefits` or `p4.radio.sex`. The immutable `id` stays
the routing key, while `dispatchKey` gives users a clear target in long source,
target, listener, payload, and trace lists.

## Form-Level Behavior

The document itself can declare runtime behavior through a document-level
runtime config.

Form-level runtime config includes:

- `formEvents` for optional custom event type metadata
- `formListeners`
- `hostBindings`
- `submitEventName`
- `sessionStateShape`

Form-level listeners attach to the form dispatcher. They can receive bubbling
events from descendant dispatchers.

## Payload Authoring

Payloads are intentionally flexible at first.

Authors should be able to work in two modes:

1. simple key/value fields
2. raw JSON

The schema still keeps a loose structure:

- `mode`
- `fields`
- `example`
- `notes`

This allows guided authoring first, with raw JSON available when needed.

## Session State

Session state is part of the runtime contract and should be serializable.

It includes:

- `currentStepId`
- `values`
- `nodes`
- `validation`
- `submit`
- `hostContextSnapshot`

`nodes` stores state by node id:

- `visible`
- `enabled`
- `required`

`submit` stores runtime submit state:

- `idle`
- `submitting`
- `success`
- `error`

## Dispatch Reports

The runtime exposes `dispatchWithReport(event)` for authoring tools. It runs the
same dispatch path as `dispatch(event)`, then returns:

- normalized root event
- state before and after dispatch
- listener diagnostics for reached listeners
- condition pass/fail evidence with actual and expected values
- action diagnostics
- emitted trace entries
- a compact state diff

Behavior Studio uses this report for guided behavior tests. The same report
shape is intended to power a later preview-based test flow where authors test by
interacting with the rendered form directly.

## Submit Payload

The runtime generates a structured submit payload containing:

- `formId`
- `projectId`
- `stepId`
- `values`
- `validation`
- `hostContext`

This payload is dispatched with `form.submit`. The host decides what to do with it.

## Host Context

Host context is read-only runtime context passed in by the shell.

It currently supports these buckets:

- `environment`
- `session`
- `auth`
- `app`
- `data`

This lets the runtime respond to host conditions without owning the host
environment itself.
