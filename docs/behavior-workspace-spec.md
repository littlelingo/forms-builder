# Behavior Workspace Spec

## Purpose

This spec resets behavior authoring around one unified system instead of the
current split between `Logic`, `Events`, `Map`, and `Runtime tools`.

The goal is to make advanced behavior feel powerful and coherent without making
common form logic feel like engineering work.

## Product Decisions

- Keep top-level inspector tabs to:
  - `Properties`
  - `Behavior`
  - `Map`
- Replace the separate `Logic` and `Events` tabs with one shared behavior model.
- Make Behavior Studio and Rules Manager the primary authoring path.
- Use the graph as secondary visualization, tracing, and debugging.
- Use the same graph language for:
  - editing behavior
  - overviewing behavior
- Keep only one graph system in the product.
- Reframe runtime testing as a simulator, not a dev-only utility.
- Reduce source reference to a small provenance helper by default.
- Use a full-width split workspace when the user explicitly enters source
  compare mode.

## Mental Model

All authored behavior should read as one sentence:

- `When X happens, if Y is true, do Z.`

The graph should express that same model with consistent node types.

## Information Architecture

### Properties

Use for static authoring details:

- labels
- help text
- field type
- options
- display text
- structural metadata

### Behavior

Use for authored dynamic behavior.

This is the main editing surface for:

- state rules
- events
- listeners
- actions
- runtime-oriented orchestration

### Map

Use the same graph system as `Behavior`, but in overview mode.

This mode is for:

- zoomed-out path understanding
- cross-step behavior inspection
- filtering
- debugging graph sprawl
- jumping into a focused edit target

`Map` is not a second editing language. It is the same graph system with a
different level of detail.

## Unified Behavior Graph

### Core node types

- `Trigger`
  - starts evaluation
  - examples: field changed, button clicked, form loaded, submit requested
- `Condition`
  - evaluates a value or state
  - examples: field equals value, field exists, node visible
- `State effect`
  - changes ongoing UI state
  - examples: show, hide, require, optional, enable, disable
- `Action`
  - runs a discrete behavior step
  - examples: go to next step, go to step, set field value, emit event, request
    host action, submit form
- `Runtime`
  - host/runtime loop transitions
  - examples: submit success, submit error, host response

### Graph grammar

- Triggers connect into conditions or directly into effects/actions.
- Conditions branch into success/failure paths.
- State effects remain visually distinct from action nodes.
- Runtime/host nodes should be visually distinct from document-local behavior.

### Authoring levels

The same graph language should support two levels of complexity:

1. Simple form logic
   - compact starter flows
   - fast creation of show/hide/require/disable behavior
2. Advanced orchestration
   - multi-step flows
   - host calls
   - emitted events
   - submit and response loops

Simple logic should still be easier to author than advanced flows, even though
both use the same graph system.

## Default Behavior Editing Flow

When a node is selected:

1. open `Behavior`
2. show a concise summary of existing behavior
3. use Behavior Studio for guided rule/listener/event creation
4. manage existing objects through Rules Manager
5. use the graph for overview, tracing, and focused handoff

Quick-start examples:

- `Show this field when another field equals a value`
- `Require this field when another field has any value`
- `On button click, continue`
- `On button click, submit`
- `On submit, request host action`

These should create first-class rule/listener/event objects. The graph should
visualize those objects after creation rather than acting as the creation
surface.

### Starter palette before graph

The default `Behavior` entry state should be guided rather than empty-canvas
first.

- Open with explicit Studio and Rules Manager entry points.
- After the user creates or selects an object, visualize the resulting graph.
- Move into graph inspection only when the user needs overview, tracing, or
  debugging context.

This keeps simple form logic approachable while preserving one shared graph
language for visualization and debugging.

## Rules Manager Ownership

Rules, listeners, and event flows are first-class objects.

Rules Manager owns:

- object search and filtering
- enable/disable
- duplicate
- delete
- lifecycle details
- field-centric views such as `Impacts this field` and `Started from this field`

Graph nodes should hand off to Studio or Rules Manager. The graph should not
become a second lifecycle editor.

## Graph Ownership

The graph is for:

- overview
- tracing
- debugging
- understanding chains and cross-step relationships
- opening a focused object in Studio
- opening lifecycle details in Rules Manager

The graph should avoid:

- direct creation controls
- direct delete controls
- hidden inline editors
- graph-local action-chain mutation controls

When a user clicks a graph node, the system should either open the focused
Studio editor or expose a short handoff card that clearly sends editing to
Studio and lifecycle management to Rules Manager.

## Selection Behavior

Selection must remain stable while authoring behavior.

- Adding a rule or listener should not bounce selection away from the active
  field or node.
- The currently selected authored node should stay pinned in the behavior
  surface while behavior is being edited.
- Editing should happen inline or in a docked detail region, not in a detached
  hidden-feeling editor lower in the page.

## Canvas Indicators

The step preview and hierarchy should expose authored behavior clearly.

Show compact visual indicators on:

- steps
- sections
- groups
- fields
- button-like components

Indicator categories:

- has state rules
- has interaction flows
- has runtime/host behavior

These indicators should be visible in both the hierarchy strip and the preview
canvas so the user can see where behavior exists before opening the inspector.

## Simulator

The current runtime tools should evolve into a simulator surface.

### Simulator goals

- help authors understand what the form does
- help QA validate authored behavior
- make runtime/host loops legible

### Placement

Use a dedicated simulator panel or bottom drawer, not a property-editor modal.

### Primary controls

- reset session
- seed/fill required values
- run current step
- run submit
- simulate host success
- simulate host error

### Advanced debug

- current session snapshot
- current submit payload
- recent runtime events
- import/export session JSON

Advanced debug should remain available, but it should not be the first thing the
author sees.

## Source Provenance And Compare

Source reference should split into two modes.

### Provenance helper

Default, lightweight surface near the current selection.

It should answer:

- what source page did this come from
- what imported node is linked
- was it imported or authored later
- are there import issues or confidence notes

This should be a small helper, not a permanent wide rail.

### Compare mode

Explicit, full-width split workspace entered on demand.

Use this when the user wants:

- side-by-side authored vs imported inspection
- stronger visual/spatial compare
- highlighted source linkage
- provenance investigation
- issue reconciliation

Compare mode is where source deserves real layout space.

## Tooling And Capability Review

The behavior workspace now has clearer ownership. The next pruning pass should
use that ownership to reduce visible surface area instead of adding more graph
controls.

Keep prominent:

- `Behavior Studio` for guided creation and focused wiring
- `Rules Manager` for search, filters, lifecycle, and field-centric impact
  views
- `Runtime lab` for testing the selected rule, listener, or event chain
- lightweight provenance in the inspector

Keep, but tuck behind secondary affordances:

- `Graph view` as visualization, trace, and debug context after an object exists
- `Document graph workspace` for dense cross-step behavior, not ordinary editing
- advanced simulator trace/session JSON tools
- full source compare

Remove or de-emphasize:

- graph-local create/delete/grow controls
- duplicate map entry points that compete with the `Map` tab
- always-visible document graph view-mode controls when there is no authored
  cross-step behavior
- source compare buttons that do not explain why compare is useful for the
  current selection

Recommended next UI cleanup:

1. make `Rules Manager` the default Studio landing when behavior already exists
2. keep `Graph view` as an explicit secondary tab, but hide document-level graph
   controls until the user opens the document graph workspace
3. collapse advanced simulator debug into one disclosure by default
4. show source compare as a contextual action only when selection has source
   provenance or import issues

## First Pruning Pass

The first pruning pass implements the ownership split above:

- `Behavior Studio` now lands on the full Rules Manager index when authored
  behavior already exists.
- `Graph view` keeps document-wide graph controls hidden until the user enters
  `Document graph workspace`.
- Simulator raw payload/session/trace tools stay behind an advanced disclosure.
- Source compare opens only when there is imported source provenance or retained
  import issue context to inspect.

The next capability review should focus on which secondary tools remain visible
in the right rail versus which belong only in Studio, Map, or on-demand
workspace overlays.

## Behavior Studio Navigation Reset

Behavior Studio should not behave like another long page below the current
workspace. It should act like a bounded workbench.

Implemented direction:

- Behavior actions are now available directly on the selected section, group,
  or field card through a compact selected-context toolbar: add rule, add
  listener, add event, and test.
- The right rail stays inspection-oriented and no longer repeats full-width
  creation controls.
- Studio is viewport-bound with a fixed shell, body-scroll lock, internal
  scrolling only where needed, Escape close, initial focus, and focus
  restoration to the opener.
- Create/Test/Manage now use smaller mode-sized shells that anchor to the
  selected behavior toolbar when viewport space allows. Placement is based on
  the toolbar container, not the individual icon, so add-rule, listener, event,
  and test actions open in the same predictable position for a selected object.
- The anchored shell is now stable across `Create`, scoped `Manage`, and scoped
  `Test`; switching those modes should not resize, re-anchor, or expose the
  broader graph/simulator stack.
- `Manage` defaults to behavior attached to the selected section, group, or
  field. Full document filtering lives behind `Open full manager`.
- `Test` defaults to a simulator mini-panel with selected-target controls and
  latest runtime effect. Raw traces, host-loop tools, and session JSON live
  behind `Open runtime lab`.
- Studio mode is explicit:
  - `Create` for one focused rule/listener/event flow
  - `Manage` for selected-object behavior, with full manager as secondary
  - `Test` for selected-object simulator checks, with runtime lab as secondary
  - `Graph` for secondary graph/debug work in a centered workspace shell

Graph and full runtime lab are deliberate workspace-level mode changes. They
should use centered shells and should not inherit the cramped icon-by-icon
popover placement from selected-object create/manage/test actions.

## Preview Reordering Reset

The step preview and page strip should expose clear drag handles instead of
making entire cards feel draggable.

Implemented direction:

- Steps, sections, groups, and field/components now have explicit drag-handle
  buttons with accessible labels.
- Dragging starts from the handle only, so selecting text, clicking controls,
  and interacting with fields does not accidentally begin a move.
- Cards still act as drop targets. Dropping on the upper half inserts before
  that card; dropping on the lower half inserts after it.
- Nested drop targets stop propagation so field, group, section, and step drops
  do not fight each other.
- Same-container moves account for the removed source item before inserting, so
  reordered items do not snap back to their original position.
- The dragged card visually dims/lifts while moving so the active source and
  intended drop location are easier to read.

## Behavior Rail Pruning

Element-scoped behavior should not be launched from two places.

Implemented direction:

- The right rail no longer shows a generic `Behavior launchpad` for selected
  section, group, field, or selected step scopes.
- Selected element scopes use the inline behavior toolbar on the selected card
  as the primary entry point for add-rule, add-listener, add-event, and test.
- The selected current-step header now exposes its own compact `Step behavior`
  toolbar for step listeners, event flows, and tests.
- The right rail stays passive for selected steps and element scopes: current
  selection, counts, and status only.
- Form-level behavior still keeps a small `Scope behavior` fallback until the
  form itself gets a better direct canvas/header affordance.

Recommended next simplification:

- Keep aligning step-level Behavior Studio placement with selected element
  placement so preview-scope behavior always opens predictably near its toolbar.
- Keep the rail as status/provenance/inspection only once all active scopes have
  a direct in-preview behavior affordance.

## Rule Listener Event Simplification

The current model is technically capable, but the creation experience still
exposes too many implementation concepts too early. The preferred model should
be:

- `Rule` = state behavior: show, require, disable, or grouped state bundles.
- `Event flow` = emit a named event with guided payload.
- `Listener` = react to an event and run one or more actions.
- `Custom` = advanced path, still guided, never just a blank empty object.

Implemented first cleanup:

- The guided setup no longer repeats separate scope/starter/edit cards.
- The sticky duplicate cancel footer was removed.
- Starters are grouped under `Recommended starters`.
- Blank listener/event creation now reads as `Custom listener` or `Custom event
  flow` so the escape hatch feels intentional instead of unfinished.

Recommended next cleanup:

- Rename `Add listener` to `React to event` in the UI. Keep `listener` as the
  underlying schema term only.
- Rename `Add event` to `Emit event` or `Send event`, because users are creating
  an emitted event flow, not an abstract event object.
- Make `Add rule` open with one recommended default: `Show and require`, plus
  secondary choices for `Require when`, `Show/hide`, and `Enable/disable`.
- Split custom creation into a small wizard: trigger -> condition/payload ->
  action -> review, with live summary always visible.
- Keep graph and full manager out of the first-create path. They should appear
  after an object exists or when explicitly opened.

## First Implementation Priorities

1. Remove the inspector width toggle and keep the current wider width.
2. Replace `Logic` + `Events` with a single `Behavior` tab shell.
3. Add behavior indicators to the hierarchy and preview canvas.
4. Replace the detached rule editor with inline or docked editing.
5. Reframe `Runtime tools` into a simulator surface.
6. Replace the persistent source side rail with:
   - a provenance helper
   - an on-demand full-width compare workspace

## Non-Goals For The First Pass

- shipping the final graph renderer for every advanced case in one slice
- preserving the old `Logic` and `Events` mental split
- maintaining multiple graph visual systems
- keeping source reference open as a permanent cramped rail
