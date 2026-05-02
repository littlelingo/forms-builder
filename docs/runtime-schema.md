# Runtime Schema

## Overview

The runtime schema adds first-class behavior contracts to the authoring model.

Behavior should not live only in `rendererHints`. Instead, authored forms should
be able to declare:

- event sources
- listeners
- action chains
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

Events carry a standard envelope:

- `type`
- `version`
- `source`
- `payload`
- `correlationId`
- `timestamp`

### Rule Guard

A rule guard references a declarative condition that must be true before a
listener executes.

Rules stay separate from events and actions. They act as guards, not as event
definitions or action lists.

### Listener

A listener says:

- when this event occurs
- and these rule guards pass
- execute these actions in order

Listeners support multiple ordered actions.

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
- `emit_event`
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

- `eventSources`
- `listeners`

These are stored in `runtime` on the node.

## Form-Level Behavior

The document itself can declare runtime behavior through a document-level
runtime config.

Form-level runtime config includes:

- `formEvents`
- `formListeners`
- `hostBindings`
- `submitEventName`
- `sessionStateShape`

Form-level listeners can target any node in the form.

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

## Submit Payload

The runtime generates a structured submit payload containing:

- `formId`
- `projectId`
- `stepId`
- `values`
- `validation`
- `hostContext`

This payload is emitted with `form.submit`. The host decides what to do with it.

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
