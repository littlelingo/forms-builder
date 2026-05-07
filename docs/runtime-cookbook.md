# Runtime Cookbook

## Purpose

This document collects common runtime behavior recipes using the current
builder, runtime engine, and host contract.

Use it as the practical companion to:

- `docs/runtime-authoring-guide.md`
- `docs/runtime-host-integration.md`
- `docs/runtime-schema.md`

## Navigate To The Next Step

Use when a button should continue the flow.

Authoring recipe:

1. add or select a button field
2. open `Events`
3. use `component.click`
4. add action `go_to_next_step`

Expected runtime result:

- dispatches `component.click`
- dispatches `step.leave`
- dispatches `step.enter`

## Navigate To The Previous Step

Use when a button should send the user backward.

Authoring recipe:

1. select a button field
2. open `Events`
3. attach `component.click`
4. add action `go_to_previous_step`

## Submit The Form

Use when a button should trigger the runtime submit loop.

Authoring recipe:

1. select a button field
2. open `Events`
3. attach `component.click`
4. add action `submit_form`

Expected outcomes:

- if invalid:
  - runtime dispatches `form.validation_failed`
- if valid:
  - runtime dispatches `form.submit`
  - host responds with `form.submit_success` or `form.submit_error`

## Dispatch A Custom Event

Use when the runtime should broadcast intent without directly owning the result.

Authoring recipe:

1. add or edit a listener
2. choose action `dispatch_event`
3. set `eventType`
4. choose whether it bubbles
5. optionally add payload fields

Good uses:

- analytics hooks
- coarse workflow milestones
- host-observed state changes

## Request A Host Action

Use when the host shell should perform work the runtime does not own.

Authoring recipe:

1. add or edit a listener
2. choose action `host_action`
3. provide a `handlerKey`
4. optionally add payload fields

Host examples:

- open a modal
- save a draft externally
- start a lookup
- route to another app view

Current limitation:

- host actions are fire-and-forget

## Show A Node When A Field Changes

Use when the form should reveal more UI only after a triggering answer.

Authoring recipe:

1. select the source field
2. open `Behavior`
3. attach `field.change`
4. add a listener condition for the expected value
5. add action `show_node`
6. optionally add `mark_required`

Typical pattern:

- answer `Yes`
- reveal a follow-up section
- mark the follow-up field required

## Hide A Node When A Field Changes

Same setup as above, but use:

- `hide_node`
- optionally `mark_optional`

This is useful when toggling conditional follow-up content off again.

## Set Another Field Value

Use when one event should populate or synchronize another field.

Authoring recipe:

1. attach a listener to the source node
2. add action `set_field_value`
3. target the destination field
4. provide the value in action config

Current note:

- this is best for deterministic authored values right now
- richer computed-value authoring can mature later on top of the same contract

## Validate Runtime Roundtrip

Use this after authoring behavior.

Builder recipe:

1. open the simulator/runtime lab
2. inspect session state
3. trigger the behavior in preview
4. inspect the event trace
5. export session state
6. re-import session state
7. confirm restore

For submit flows:

1. seed required values if needed
2. trigger submit
3. inspect `form.submit`
4. use mock success or mock error
5. confirm submit state changed

## Host Submit Success

Host recipe:

1. observe `form.submit`
2. complete host-side work
3. dispatch `form.submit_success`

Recommended payload:

```json
{
  "message": "Saved successfully"
}
```

## Host Submit Error

Host recipe:

1. observe `form.submit`
2. fail or reject host-side work
3. dispatch `form.submit_error`

Recommended payload:

```json
{
  "message": "Backend validation failed",
  "fieldErrors": {
    "field-id": "Problem detail"
  }
}
```

## Keep Payload Authoring Simple First

Recommended default:

- start with key/value payload editing
- switch to JSON only when the payload actually needs nested structure

That keeps the authoring experience usable for non-engineers while still giving
developers a richer escape hatch.
