# Runtime Item Event Reference

This reference lists the core events that form authors can listen for or dispatch
inside Behavior Studio. Core events are built into the runtime catalog and do
not require a user-created event definition. Custom events can still be added
when a form needs a domain-specific signal.

The event system follows the ActionScript 3 dispatcher model: an event has a
type, a target dispatcher, a current dispatcher while each listener runs, a
capture/target/bubble phase, a bubbling flag, and listener priority. The naming
uses builder-friendly dot-separated event types instead of raw AS3 constants or
browser DOM names.

Behavior Studio uses the same catalog to filter `Add event` choices for the
selected component type. Events can carry payload-shape metadata so the author
can save event-specific properties such as `selectedValues`, `selectedValue`,
`componentId`, keyboard fields, pointer fields, submit context, or validation
errors on the selected dispatcher.

References:

- ActionScript 3 event flow and listener options: [AIR SDK EventDispatcher](https://airsdk.dev/reference/actionscript/3.0/flash/events/EventDispatcher.html)
- AS3 mouse and keyboard families: [AIR SDK MouseEvent](https://airsdk.dev/reference/actionscript/3.0/flash/events/MouseEvent.html), [AIR SDK KeyboardEvent](https://airsdk.dev/reference/actionscript/3.0/flash/events/KeyboardEvent.html)
- Browser listener model and event options: [MDN EventTarget.addEventListener](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener)
- Browser form events: [MDN HTMLFormElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLFormElement)
- Browser input/change behavior: [WHATWG HTML input event behavior](https://html.spec.whatwg.org/multipage/input.html#common-event-behaviors)

## Dispatch Model

- `type`: the event name, such as `checkboxGroup.change`.
- `target`: the dispatcher where the event originated.
- `currentTarget`: the dispatcher whose listener is currently running.
- `eventPhase`: `capture`, `target`, or `bubble`.
- `bubbles`: when `false`, only target listeners run.
- `useCapture`: when `true`, the listener runs during capture only.
- `priority`: higher priority listeners run first within the same phase.

## Universal Item Events

These events apply to every dispatcher type listed in the catalog. They are
closest to AS3 display-object lifecycle/state concepts and common UI state
transitions.

| Event               | Applies to                                   | Bubbles | Notes                                 |
| ------------------- | -------------------------------------------- | ------- | ------------------------------------- |
| `component.mount`   | form, step, section, group, field, component | No      | Item became part of the runtime tree. |
| `component.unmount` | form, step, section, group, field, component | No      | Item left the runtime tree.           |
| `component.show`    | section, group, field, component             | Yes     | Item became visible.                  |
| `component.hide`    | section, group, field, component             | Yes     | Item became hidden.                   |
| `component.enable`  | field, component                             | Yes     | Item became enabled.                  |
| `component.disable` | field, component                             | Yes     | Item became disabled.                 |
| `state.change`      | form, step, section, group, field, component | Yes     | Generic runtime state changed.        |

## Form Events

Form events are document-level signals. They map to the browser form lifecycle
where useful and to runtime submit/host outcomes where the builder has a higher
level concept than HTML.

| Event                    | Bubbles | HTML5 / AS3 relationship                     | Payload notes                                                          |
| ------------------------ | ------- | -------------------------------------------- | ---------------------------------------------------------------------- |
| `form.load`              | No      | AS3-style load/init concept.                 | Form id, project context.                                              |
| `form.submit`            | No      | HTML `submit`; AS3-style dispatched command. | Submit payload, validation state, correlation id.                      |
| `form.submit_success`    | No      | Host/runtime completion signal.              | Host message, submission id when available.                            |
| `form.submit_error`      | No      | Host/runtime failure signal.                 | Message and optional field errors.                                     |
| `form.validation_failed` | No      | HTML `invalid` summarized at form level.     | Validation errors and blocked submit context.                          |
| `form.reset`             | No      | HTML `reset`.                                | Reset source and current values when available.                        |
| `form.formdata`          | No      | HTML `formdata`.                             | Prepared form-data payload or submit payload snapshot.                 |
| `host.context_updated`   | No      | Host integration event, not a DOM event.     | Host context changes available to runtime listener conditions/actions. |

## Step / Page Events

Steps are page-like dispatchers in the authoring flow. These events are closest
to AS3 navigation/lifecycle events rather than native HTML events.

| Event                    | Bubbles | Notes                                               |
| ------------------------ | ------- | --------------------------------------------------- |
| `step.enter`             | Yes     | User/runtime entered the step.                      |
| `step.leave`             | Yes     | User/runtime left the step.                         |
| `step.completed`         | Yes     | Step passed the runtime completion boundary.        |
| `step.validation_failed` | Yes     | Step-level validation blocked navigation or submit. |

## Section Events

Sections are structural dispatchers. They can receive bubbled events from child
groups and fields, and they can dispatch their own lifecycle/state events.

| Event            | Bubbles | Notes                                             |
| ---------------- | ------- | ------------------------------------------------- |
| `section.enter`  | Yes     | Section became the active section context.        |
| `section.leave`  | Yes     | Section stopped being the active section context. |
| `section.change` | Yes     | Section-level state or child aggregate changed.   |

## Group Events

Groups are structural dispatchers for related controls. They are useful for
listening to child field events with AS3-style bubbling.

| Event          | Bubbles | Notes                                         |
| -------------- | ------- | --------------------------------------------- |
| `group.enter`  | Yes     | Group became the active group context.        |
| `group.leave`  | Yes     | Group stopped being the active group context. |
| `group.change` | Yes     | Group-level state or child aggregate changed. |

## All Interactive Field Events

Interactive field events map to browser control events while preserving the
AS3-style dispatcher envelope.

| Event            | Bubbles | HTML5 / AS3 relationship                              | Payload notes                     |
| ---------------- | ------- | ----------------------------------------------------- | --------------------------------- |
| `field.input`    | Yes     | HTML `input`; closest generic live-edit signal.       | Field id, value or nextValue.     |
| `field.change`   | Yes     | HTML `change`; AS3 `Event.CHANGE` concept.            | Field id, value or nextValue.     |
| `field.focus`    | Yes     | HTML `focus` / `focusin`; AS3 `FocusEvent.FOCUS_IN`.  | Field id and source node context. |
| `field.blur`     | Yes     | HTML `blur` / `focusout`; AS3 `FocusEvent.FOCUS_OUT`. | Field id and source node context. |
| `field.invalid`  | Yes     | HTML `invalid`.                                       | Validation message and field id.  |
| `field.key_down` | Yes     | HTML `keydown`; AS3 `KeyboardEvent.KEY_DOWN`.         | Key metadata when available.      |
| `field.key_up`   | Yes     | HTML `keyup`; AS3 `KeyboardEvent.KEY_UP`.             | Key metadata when available.      |

Statement/content fields are not interactive value controls. They can use
universal item events like `component.show`, `component.hide`, and
`state.change`, but they do not emit value-change events by default.

## Checkbox Group Events

Checkboxes are represented as a group-level field because one question can have
multiple checked values.

| Event                  | Bubbles | HTML5 / AS3 relationship                                  | Payload notes                                                        |
| ---------------------- | ------- | --------------------------------------------------------- | -------------------------------------------------------------------- |
| `checkboxGroup.change` | Yes     | Aggregate of HTML checkbox `change`.                      | `selectedValues`, `selectionMode: multi`, changed option when known. |
| `checkbox.change`      | Yes     | Individual checkbox `change`; AS3 `Event.CHANGE` concept. | Changed option and checked state when available.                     |
| `checkbox.checked`     | Yes     | Higher-level checked transition.                          | Option value and checked state.                                      |
| `checkbox.unchecked`   | Yes     | Higher-level unchecked transition.                        | Option value and checked state.                                      |

Checkbox groups also support the generic interactive field events:
`field.input`, `field.change`, `field.focus`, `field.blur`, `field.invalid`,
`field.key_down`, and `field.key_up`.

## Radio Group Events

Radio groups emit single-selection events.

| Event            | Bubbles | HTML5 / AS3 relationship                         | Payload notes                               |
| ---------------- | ------- | ------------------------------------------------ | ------------------------------------------- |
| `radio.change`   | Yes     | HTML radio `change`; AS3 `Event.CHANGE` concept. | `selectedValue`, changed option when known. |
| `radio.selected` | Yes     | Higher-level selected transition.                | Selected option value.                      |
| `radio.cleared`  | Yes     | Builder-level clear transition.                  | Previous value when available.              |

Radio groups also support the generic interactive field events:
`field.input`, `field.change`, `field.focus`, `field.blur`, `field.invalid`,
`field.key_down`, and `field.key_up`.

## Select Events

Select events cover single-selection dropdown behavior.

| Event             | Bubbles | HTML5 / AS3 relationship                            | Payload notes                               |
| ----------------- | ------- | --------------------------------------------------- | ------------------------------------------- |
| `select.change`   | Yes     | HTML `select` `change`; AS3 `Event.CHANGE` concept. | `selectedValue`, changed option when known. |
| `select.selected` | Yes     | Higher-level selected transition.                   | Selected option value.                      |
| `select.cleared`  | Yes     | Builder-level clear transition.                     | Previous value when available.              |
| `select.opened`   | Yes     | Builder-level dropdown open signal.                 | Option list context when available.         |
| `select.closed`   | Yes     | Builder-level dropdown close signal.                | Final selection context when available.     |

Select fields also support the generic interactive field events:
`field.input`, `field.change`, `field.focus`, `field.blur`, `field.invalid`,
`field.key_down`, and `field.key_up`.

## Text-Like Input Events

Text-like fields include `text`, `textarea`, `date`, `number`, `phone`, and
`email`. Composition events apply to text and textarea controls.

| Event                      | Applies to                                 | Bubbles | HTML5 / AS3 relationship                              |
| -------------------------- | ------------------------------------------ | ------- | ----------------------------------------------------- |
| `input.change`             | text, textarea, date, number, phone, email | Yes     | HTML `change`; AS3 `Event.CHANGE` concept.            |
| `input.textChange`         | text, textarea                             | Yes     | AS3 text-change concept, mapped to live text editing. |
| `input.before_input`       | text, textarea                             | Yes     | HTML `beforeinput`.                                   |
| `input.composition_start`  | text, textarea                             | Yes     | HTML `compositionstart`.                              |
| `input.composition_update` | text, textarea                             | Yes     | HTML `compositionupdate`.                             |
| `input.composition_end`    | text, textarea                             | Yes     | HTML `compositionend`.                                |

Text-like fields also support the generic interactive field events:
`field.input`, `field.change`, `field.focus`, `field.blur`, `field.invalid`,
`field.key_down`, and `field.key_up`.

## Signature Attestation Events

Signature attestation fields are form-specific controls, so their core events
use builder-level names instead of raw DOM names.

| Event                | Bubbles | Notes                              |
| -------------------- | ------- | ---------------------------------- |
| `signature.change`   | Yes     | Signature state changed.           |
| `signature.attested` | Yes     | User attested or signed.           |
| `signature.cleared`  | Yes     | Signature/attestation was cleared. |

Signature fields also support the generic interactive field events:
`field.input`, `field.change`, `field.focus`, `field.blur`, `field.invalid`,
`field.key_down`, and `field.key_up`.

## Repeatable Group Events

Repeatable groups represent repeated field sets. Their item events are modeled
after collection changes rather than native DOM events.

| Event                          | Bubbles | Notes                                     |
| ------------------------------ | ------- | ----------------------------------------- |
| `repeatableGroup.change`       | Yes     | Aggregate repeatable group state changed. |
| `repeatableGroup.item_added`   | Yes     | A repeated item was added.                |
| `repeatableGroup.item_removed` | Yes     | A repeated item was removed.              |
| `repeatableGroup.item_moved`   | Yes     | A repeated item was reordered.            |

## Component / Button Events

Components cover authored controls such as buttons. These events map to common
HTML pointer/keyboard events and AS3 mouse/keyboard event families, but use
builder names.

| Event                    | Bubbles | HTML5 / AS3 relationship                        | Payload notes                                  |
| ------------------------ | ------- | ----------------------------------------------- | ---------------------------------------------- |
| `component.click`        | Yes     | HTML `click`; AS3 `MouseEvent.CLICK`.           | Component id and label.                        |
| `button.click`           | Yes     | Button-specific click alias.                    | Component id, label, configured button action. |
| `component.double_click` | Yes     | HTML `dblclick`; AS3 `MouseEvent.DOUBLE_CLICK`. | Component id and pointer context.              |
| `component.pointer_down` | Yes     | HTML `pointerdown`; AS3 mouse-down concept.     | Pointer metadata when available.               |
| `component.pointer_up`   | Yes     | HTML `pointerup`; AS3 mouse-up concept.         | Pointer metadata when available.               |
| `component.key_down`     | Yes     | HTML `keydown`; AS3 `KeyboardEvent.KEY_DOWN`.   | Key metadata when available.                   |
| `component.key_up`       | Yes     | HTML `keyup`; AS3 `KeyboardEvent.KEY_UP`.       | Key metadata when available.                   |

Buttons and components also support universal item events:
`component.mount`, `component.unmount`, `component.show`, `component.hide`,
`component.enable`, `component.disable`, and `state.change`.

## Custom Events

Use a custom event when the form needs a domain-specific signal that is not tied
to a core item behavior, such as `benefits.eligibility.changed` or
`supporting_documents.ready`.

Custom events should:

- use lowercase dot-separated names
- describe what happened, not what action will run
- define payload metadata only when authors or host integrations need it
- be dispatched with `dispatch_event`

## $-Token Grammar (Strict Path-Only)

Action configs and payload templates can reference runtime values using
`$`-prefixed tokens. The resolver (`resolveRuntimeToken` in
`packages/runtime/src/tokens.ts`) enforces a strict, locked grammar — no new
roots are added without a spec change.

### Locked roots

Only these roots are valid:

| Root        | Description                                                                |
| ----------- | -------------------------------------------------------------------------- |
| `$payload`  | Current event payload object.                                              |
| `$response` | Phase 3 only. Returns `{ ok: false, reason: "phase_3_only" }` in Phase 1A. |
| `$field`    | Current field values from session state (`state.values`).                  |
| `$state`    | Full session state object (nodes, validation, submit, currentStepId, ...). |
| `$source`   | Descriptor of the dispatcher node (`{ id, key, type, label }`).            |
| `$current`  | Composite view of `{ form, step, project, event, runtime }` keys.          |
| `$host`     | Host-injected read-only context snapshot.                                  |
| `$now`      | ISO 8601 timestamp string at evaluation time. Takes no path.               |
| `$uuid`     | Fresh `crypto.randomUUID()` at evaluation time. Takes no path.             |

### Path semantics

Paths are dot-separated segments after the root. Examples:

```
$payload.value
$payload.nextValue
$state.nodes.field-1.visible
$field.employment-status
$source.key
$current.form.id
$host.session.userId
$now
$uuid
```

No bracket notation. No operators. No arithmetic. Comparisons belong in
listener conditions, not in token expressions.

`$now` and `$uuid` are generative roots — any trailing path is ignored.

### Result type

```ts
type TokenResolution<T = unknown> = { ok: true; value: T } | { ok: false; reason: string; pathRemainder?: string };
```

Failure reasons:

| Reason           | Meaning                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `unknown_root`   | Token starts with `$` but the root is not in the locked set.                             |
| `phase_3_only`   | Token uses `$response`, which is reserved for Phase 3.                                   |
| `missing_path`   | Root resolved but a nested segment is absent. `pathRemainder` holds the unresolved tail. |
| `missing_dollar` | Token does not start with `$`.                                                           |

### Backward compatibility

The existing `resolveRuntimePayloadValue` function (used by action configs for
payload field references such as `current.field.id`, `current.event.type`, etc.)
continues to function unchanged. It uses a closed `$runtime` reference key list
and is independent of `resolveRuntimeToken`.

Phase 1C authoring UI surfaces will adopt `resolveRuntimeToken` for token-input
autocomplete and inline validation in Behavior Studio action editors.
