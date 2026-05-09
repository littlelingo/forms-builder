# Workspace Flow Plan

## Goal

Shift the web app from a staged conversion funnel into a traditional creation tool.

The target mental model is:

- users start by choosing `New` or `Open`
- a project is the main durable object
- editing happens inside one primary workspace
- `Publish` is an action/state on the project, not a separate screen
- `Import + Review` is only part of the intake path for PDF-backed projects, not the top-level shape of the whole app

## Current Mismatch

The repo already has durable project persistence and direct JSON open/create seams, but the frontend still frames the product as a three-stage pipeline:

- `Import + Review`
- `Build`
- `Publish`

That creates several UX problems:

- scratch authoring feels secondary even though project editing is now the durable source of truth
- `Open JSON` behaves like a side intake path instead of a first-class `Open project` action
- imported PDF work dominates the shell even after promotion into a project
- `Publish` reads like a place you go rather than a capability you invoke
- the app looks like a one-shot converter instead of a long-lived creation environment

## Recommended Product Model

Use a two-level model:

1. Entry shell
   - `New`
   - `Open`
   - recent projects

2. Workspace shell
   - one main authoring workspace for the currently open project
   - file/project actions in the header
   - optional secondary tools and drawers for import review, source context, revisions, and publish

## Recommended Entry Flow

### New

`New` should open a creation chooser:

- `Blank form`
- `Import PDF`

Optional later:

- `Start from template`

Behavior:

- `Blank form` creates a new authoring project immediately and lands in the builder workspace
- `Import PDF` starts an import flow that ends in a project, then lands in the builder workspace

### Open

`Open` should support:

- recent persisted projects from `/projects`
- opening an authoring JSON file

Behavior:

- selecting a recent project loads it directly into the builder workspace
- opening JSON imports it into a project, then loads it into the builder workspace

## Recommended Treatment Of Import Review

`Import + Review` should stop being a top-level app stage.

Instead, review should become one of these:

- an `Import review` flow shown only when creating a project from PDF
- a `Source review` tool/drawer inside the builder for imported projects

Recommended rule:

- if the project came from a PDF, preserve the source context and make it inspectable from inside the workspace
- if the project was created from scratch, there is no review surface because there is no source conversion to validate against

This keeps import review powerful without forcing every project into a conversion-first frame.

## Recommended Treatment Of Publish

`Publish` should become:

- a toolbar action
- a project status badge/toggle
- later, a publish dialog or sheet with target/runtime options

It should not be a primary navigation destination.

Recommended near-term behavior:

- keep `project.status` as the durable state
- expose `Publish` / `Mark draft` from the workspace header
- keep artifact paths and revision info in a secondary panel, drawer, or project details area

## Recommended Information Architecture

### App level

- Home / Start screen
- Workspace

### Workspace header

- `New`
- `Open`
- `Import PDF` if a project is already open and the tool later supports source replacement or source attach
- `Save`
- `Publish`
- project name
- dirty state
- publish status

### Workspace body

- page/step strip
- builder canvas / live preview
- inspector
- optional source drawer

### Secondary surfaces

- import review panel
- revisions/history panel
- project details panel
- runtime tools

## Existing Repo Seams To Reuse

Current seams already support most of this direction:

- `GET /projects` and `GET /projects/{id}` already support `Open existing project`
- `POST /projects/from-document` already supports `Open JSON` and can support `New blank project` if the client posts a generated starter document
- `POST /conversions` plus `POST /conversions/{id}/promote` already support the PDF-to-project path
- project save and revision history already exist

That means the first implementation pass can mostly be frontend architecture work.

## Suggested Implementation Plan

### Phase 1: Replace stage-first shell with entry/workspace shell

- remove `Build` and `Publish` as top-level stage tabs
- introduce `home` vs `workspace` as the main app shell states
- keep the existing builder as the core workspace body

### Phase 2: Add a real start screen

- show `New` and `Open` as the two primary actions
- add recent projects under them
- move PDF import and JSON open under those flows instead of treating them as the app's root structure

### Phase 3: Add `New project` flow

- `Blank form`
- `Import PDF`

Implementation note:

- the fastest slice is to create a client-side blank starter document and post it through `POST /projects/from-document`
- a dedicated `POST /projects/blank` endpoint can come later if we want stronger server-owned defaults

### Phase 4: Fold review into the import flow

- keep review rich for PDF-backed creation
- once promoted, land in the builder workspace
- preserve source review as a builder tool rather than a separate application stage

### Phase 5: Move publish to a workspace action

- replace the `Publish` stage screen with header actions and a lighter project-details surface
- keep status toggle, revision metadata, and saved artifact references

### Phase 6: Resume editor/runtime polish after shell reset

- payload typing and validation in the `Events` editor
- richer import/source comparison inside the builder
- stronger project management affordances

## Best Immediate Next Slice

Implement Phase 1 and Phase 2 first.

That is the highest-leverage move because it changes the app's mental model without requiring a backend rewrite:

- add a real home/start screen
- make `New` and `Open` the top-level entry points
- move the current review/builder UI behind that shell
- demote `Publish` from stage navigation to project action

## Concrete Frontend Seams To Change First

- [apps/web/src/App.tsx](/Users/clint/Workspace/forms-builder/apps/web/src/App.tsx)
  - replace `type AppStage = "review" | "builder" | "publish"` with a shell model like `home` / `workspace`
  - remove the numbered stage buttons in the header
  - reframe `handleUpload`, `handleOpenJson`, `handlePromoteConversion`, and `handleTogglePublishProject` around the new shell
- [apps/web/src/lib/api.ts](/Users/clint/Workspace/forms-builder/apps/web/src/lib/api.ts)
  - reuse existing project and import APIs; likely no immediate changes required for the first shell pass
