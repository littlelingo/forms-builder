# Overview

This file is the living project tracker for the Form Builder platform. Phase 1 established real PDF ingestion, extraction, and human review. Phase 2 turns reviewed imports into durable authoring projects so imported PDFs can be reshaped into modern VA.gov-style web forms rather than preserved as paper-first artifacts.

# Current Phase

- Phase: `Phase 2A - Promotion to authoring project and VA-baseline editing foundation`
- Objective: convert reviewed imports into durable project JSON and stand up the first real authoring workspace
- Status: `in progress`

# Decisions

- Monorepo structure remains `apps/web`, `apps/api`, `packages/schema`, and `packages/ui`.
- The near-term runtime baseline is explicitly `VA.gov` flow and treatment, using a VA-style step model rather than preserving PDF page structure.
- PDF import is a bootstrap path into authoring, not the long-term source of truth.
- `AuthoringDocument` is the editable source of truth after promotion; extraction drafts remain provenance artifacts.
- Promotion from review to project is explicit and requires a reviewed conversion.
- File-backed persistence is the initial durability layer for Phase 2A.
- The first authoring surface is a hybrid of structure tree, live VA-baseline preview, and inspector-driven editing.
- Treatment and heuristic registries remain visible but are not yet first-class inline authoring systems.

# Open Questions

- When should autosave become mandatory versus optional in the Phase 2 workflow?
- What is the right explicit export/runtime contract after the authoring document: direct VA runtime config, a separate adapter artifact, or both?
- How much node-level provenance and issue traceability should remain visible by default in the authoring inspector?
- When should conditional logic and path visualization become first-class compared with deeper layout/canvas manipulation?
- At what point should file-backed storage give way to a shared database-backed project model?

# Architecture

- `apps/api` still exposes conversion, draft, heuristic, and treatment endpoints for the Phase 1 workflow.
- `apps/api` now also exposes project endpoints:
  - `POST /conversions/{id}/promote`
  - `GET /projects`
  - `GET /projects/{id}`
  - `PATCH /projects/{id}`
  - `GET /projects/{id}/document`
  - `PUT /projects/{id}/document`
  - `GET /projects/{id}/source-context`
  - `GET /projects/{id}/revisions`
- Project persistence is file-backed under `data/projects/<project-id>/` with `project.json`, `document.json`, `source-context.json`, and immutable revision snapshots.
- `apps/api/src/form_builder_api/models/authoring.py` defines the new authoring/project contract.
- `packages/schema/src/authoring.ts` mirrors that contract for the frontend.
- `apps/web` now has two explicit workspaces:
  - `Review Workspace` for source-page review and promotion
  - `Authoring Workspace` for project-native editing and VA-baseline preview

# Phase Notes

## Phase 1 Carryover

- Extraction is live and no longer placeholder-only.
- Page-image preview and source PDF inspection are both available.
- Review remains mandatory before promotion.
- The extraction draft still preserves provenance, confidence, and issue surfacing.

## Phase 2A Scope

- Promote reviewed conversions into durable projects.
- Make project JSON editable and reloadable.
- Support first-pass editing for:
  - step titles and ordering
  - section titles and ordering
  - group labels and flattening
  - field label/help/type/required state
  - choice option editing
  - field movement between section-direct and group containers
- Keep the live preview aligned to a VA-style step flow instead of a paper-page layout.

## Deferred to Later Phase 2 Slices

- autosave and recovery
- path visualization and conditional logic UX
- drag/drop-heavy layout authoring
- multi-user/shared workflow
- database-backed storage
- explicit runtime/export adapters beyond the current authoring document

# Design System Direction

- VA.gov treatment is the current baseline, not just a reference source.
- USWDS remains the likely component substrate, but the authoring experience itself should be more modern, immersive, and tool-like than current government admin tooling.
- The authoring UI should optimize for clarity, speed, and co-visible structure + preview + properties rather than generic CRUD forms.
- The design system mapping matrix remains in `docs/design-system-mapping-matrix.md`.

# Progress Log

- 2026-04-29: scaffolded the monorepo root, TypeScript workspace config, and Python package structure.
- 2026-04-29: implemented phase-1 API endpoints for conversions, drafts, forms, heuristics, and treatments.
- 2026-04-29: defined the canonical schema in Python and JSON Schema plus matching TypeScript types.
- 2026-04-29: built the first React review workspace shell with overlay, flow tree, field inspector, and issue/treatment panels.
- 2026-04-29: replaced filename-based classification with ingestion-time PDF inspection and wired the frontend to a real importer workflow.
- 2026-05-01: added authoring models, project promotion, file-backed project persistence, and revision snapshots.
- 2026-05-01: added project endpoints and a new dual-workspace UI with explicit review-to-authoring transition.
- 2026-05-01: implemented the first authoring loop for structural editing, field-type switching, option editing, and VA-baseline live preview.
- 2026-05-10: Best Next 1-5 (post-Phase 2). BN-1: `packages/runtime/src/fixtures/behavior-patterns.ts` + tests cover capture/target/bubble/non-bubble dispatch, checkbox-group payloads, and host-action `$runtime` payload-ref resolution (runtime suite 55/55). BN-2: `apps/api/tests/test_cross_item_persistence.py` proves cross-item listeners survive `InMemoryRepository` save/reload through both initial load and `update_project_document` revisions. BN-3: `PreviewTestRecorder` + recording state in `App.tsx` capture dispatch reports from real preview interactions. BN-4: visible `flow` labels migrated to `behavior` across manager + workspace + map overviews. BN-5: preview field renderers now emit `field.focus` / `field.blur` core events.
- 2026-05-10: Phase 2 wrap — sub-phases `2D-2` and `2D-3` ship together. `2D-2`: inspector reverse-index expanded to per-event `Raised by` / `Consumed by` panels via new `EventReverseIndexPanel` and `computeEventReverseIndex` helper; each panel handoffs to manager · by-event layout (`openManagerByEvent`) pre-filtered to the chosen event type. `2D-3`: new reusable `ProjectEventPicker` lists project-scope events (with optional cross-form entries); wired into `ApplyParametersDialog` for `eventRef` library params and into the listener-creation form as a "Pick from project events" affordance that writes `eventRef.id` directly on the created listener. Cross-form bulk-fix still deferred until multi-form runtime exists. Phase 2 spec items complete.
- 2026-05-10: Phase 2A schema + persistence foundation for project-scope event catalogs. New `RuntimeEventScope` + `RuntimeProjectBehavior` in shared schema and Python mirror; per-project `project-events.json` persisted under `data/projects/<id>/`; `GET/PUT /projects/{id}/project-events` endpoints; runtime engine resolves cross-form `eventRef` ids against the project catalog when supplied via mount options.
- 2026-05-10: Phase 2D-1 Behavior Manager `Map` layout — `BehaviorIndexMap` renders a layered DAG (sources → listeners → targets) per event-type, capped at 200 nodes with cluster fallback that pre-fills the trigger filter. Cross-form bulk-fix deferred until multi-form runtime exists.
- 2026-05-10: Phase 2C-2 Trace-from-event sim (read-only, ephemeral engine) inside the Manager By-event view; live runtime engine + simulator now pass the project-scope `projectEvents` catalog at mount time so cross-form `eventRef` ids resolve.
- 2026-05-10: Phase 2C-1 Behavior Manager `By event` layout. New `BehaviorIndexLayout` toggle groups the index by event type with reverse-index "Raised by" / "Consumed by" panels. axe-core smoke passed.
- 2026-05-10: Phase 2B OR / NONE / AND condition groups for listener conditions. New `RuntimeConditionGroup` + `RuntimeConditionNode` union (with backward-compatible optional atom `kind`); engine `evaluateConditionTree` walks the tree recursively; schema exports `isRuntimeConditionAtom` / `isRuntimeConditionGroup` / `flattenRuntimeConditionAtoms`. Python uses a callable Pydantic discriminator that treats missing `kind` as `"atom"` so legacy listeners load without migration.

# Next Steps

- Add project autosave and unsaved-change recovery.
- Surface imported-draft provenance and linked issues more directly in the authoring inspector.
- Add the first behavior-authoring slice for required/visibility rules and simple path branching.
- Decide whether the authoring document can remain the runtime handoff artifact or whether a dedicated export adapter model is needed.
- Revisit storage only after the project-editing workflow is proven locally end to end.
