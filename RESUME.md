# Resume

## Workspace

- Repo: `/Users/clint/Workspace/form-builder`
- Current focus: `Phase 2A - promote reviewed imports into durable authoring projects`
- Baseline target: `VA.gov-style web form flow`, not PDF round-trip

## Current State

- Phase 1 review is still live:
  - browser PDF upload and local corpus sample import both work
  - backend classification/extraction and page-image preview are live
  - review UI still supports page-by-page evidence inspection, review-state updates, and raw draft inspection
- Phase 2A foundation is now live:
  - reviewed conversions can be promoted with `POST /conversions/{id}/promote`
  - promotion creates a durable authoring project under `data/projects/<project-id>/`
  - persisted project artifacts are split into `project.json`, `document.json`, `source-context.json`, and revision snapshots under `revisions/`
  - authoring JSON is now separate from extraction JSON and is the new source of truth after promotion
- The frontend has been reset into a staged workflow:
  - `Import + Review` makes the source preview dominant and keeps mapping details secondary
  - `Build` combines flow shaping, step editing, and first-pass logic editing
  - `Publish` is now a distinct end-state screen rather than being mixed into authoring
  - `Open JSON` is now a first-class intake path alongside `Import PDF`

## What Was Just Completed

- Added shared authoring contracts in:
  - [apps/api/src/form_builder_api/models/authoring.py](/Users/clint/Workspace/form-builder/apps/api/src/form_builder_api/models/authoring.py)
  - [packages/schema/src/authoring.ts](/Users/clint/Workspace/form-builder/packages/schema/src/authoring.ts)
- Added reviewed-conversion promotion and file-backed project persistence:
  - [apps/api/src/form_builder_api/services/authoring.py](/Users/clint/Workspace/form-builder/apps/api/src/form_builder_api/services/authoring.py)
  - [apps/api/src/form_builder_api/repository.py](/Users/clint/Workspace/form-builder/apps/api/src/form_builder_api/repository.py)
  - [apps/api/src/form_builder_api/main.py](/Users/clint/Workspace/form-builder/apps/api/src/form_builder_api/main.py)
- Added project APIs:
  - `GET /projects`
  - `GET /projects/{id}`
  - `PATCH /projects/{id}`
  - `GET /projects/{id}/document`
  - `PUT /projects/{id}/document`
  - `GET /projects/{id}/source-context`
  - `GET /projects/{id}/revisions`
- Replaced the monolithic review-only web app with a dual-workspace UI in [apps/web/src/App.tsx](/Users/clint/Workspace/form-builder/apps/web/src/App.tsx):
  - explicit `Promote to project` gate
  - project list and project loading
  - hybrid authoring surface with structure tree, VA-baseline live preview, and inspector
  - first editing loop for step/section/group/field updates, add/remove, reordering, field-type switching, option editing, and section/group reparenting
- Replaced that first Phase 2 UI pass with a more guided staged application flow in [apps/web/src/App.tsx](/Users/clint/Workspace/form-builder/apps/web/src/App.tsx):
  - `Import + Review`, `Build`, and `Publish` are now explicit top-level stages
  - the review screen is source-dominant, with structure/page mapping ahead of issues/confidence
  - the builder now combines flow editing, realistic VA step preview, and logic editing in one stage
  - the builder left rail is tabbed between `Flow` and `Imported`
  - drag and drop is now first-class for steps, sections, groups, and fields
  - imported source context moved into a collapsible drawer instead of a permanent side-by-side pane
- Tightened the builder interaction model in [apps/web/src/App.tsx](/Users/clint/Workspace/form-builder/apps/web/src/App.tsx):
  - removed add-section/add-field controls from the builder header and moved editing actions closer to the step canvas
  - narrowed the builder sidebar to a fixed-width accordion outline so it no longer consumes roughly half of the workspace
  - removed the low-value `Imported` sidebar mode; the sidebar is now organization-first and source context stays in the drawer
  - made step-preview selection primary for sections, groups, and fields, with inspector updates driven from canvas clicks
  - moved document-title editing out of the inspector and into the preview header
  - replaced the inline rule expander with a bounded modal rule editor so logic editing cannot blow out the inspector column
  - added runtime-navigation preview buttons (`Previous`, `Continue` / `Submit`) at the bottom of the step canvas
  - runtime preview navigation now actually moves through steps and disables/enables appropriately
  - added a lightweight authored action-button primitive via `rendererHints.component = "button"` so buttons can be inserted into sections/groups before the full actions-events model lands
- Tightened the builder again around a step-first editing model in [apps/web/src/App.tsx](/Users/clint/Workspace/form-builder/apps/web/src/App.tsx):
  - replaced the expanded builder tree with a compact step strip that only lists draggable steps plus `Add step`
  - kept the real editing work in the step preview and inspector instead of the sidebar
  - added page-style step cards so the left rail behaves more like a page strip than a nested outline
  - exposed `Button` directly in the field-type inspector so authored runtime controls are discoverable without knowing the old action-button path
- Tightened builder and publish controls around real operator behavior in [apps/web/src/App.tsx](/Users/clint/Workspace/form-builder/apps/web/src/App.tsx):
  - defaulted the inspector to the wider column and moved inspector switching to icon-only controls with hover titles
  - made the builder save button always available so save state is clearer even when the project is already persisted
  - removed the special canvas-only action-button add path so buttons now read more like a normal field-type choice
  - replaced the bulky publish screen with a leaner save-and-release stage that shows actual stored file paths and a reversible published/unpublished toggle
- Locked the runtime behavior contract in shared schema and docs:
  - added shared runtime event/action/listener/host-binding/session-state contracts in [packages/schema/src/runtime.ts](/Users/clint/Workspace/form-builder/packages/schema/src/runtime.ts)
  - extended [packages/schema/src/authoring.ts](/Users/clint/Workspace/form-builder/packages/schema/src/authoring.ts) so authoring nodes and documents can optionally carry runtime behavior metadata
  - added backend model parity in [apps/api/src/form_builder_api/models/runtime.py](/Users/clint/Workspace/form-builder/apps/api/src/form_builder_api/models/runtime.py) and [apps/api/src/form_builder_api/models/authoring.py](/Users/clint/Workspace/form-builder/apps/api/src/form_builder_api/models/authoring.py)
  - added initial runtime contract docs in [docs/runtime-architecture.md](/Users/clint/Workspace/form-builder/docs/runtime-architecture.md) and [docs/runtime-schema.md](/Users/clint/Workspace/form-builder/docs/runtime-schema.md)
- Added the first shared runtime package and wired the builder preview into it:
  - created [packages/runtime/src/engine.ts](/Users/clint/Workspace/form-builder/packages/runtime/src/engine.ts), [packages/runtime/src/document-index.ts](/Users/clint/Workspace/form-builder/packages/runtime/src/document-index.ts), [packages/runtime/src/session-state.ts](/Users/clint/Workspace/form-builder/packages/runtime/src/session-state.ts), and [packages/runtime/src/validation.ts](/Users/clint/Workspace/form-builder/packages/runtime/src/validation.ts)
  - the runtime now indexes authoring nodes, initializes session state, evaluates conditional-rule guards, validates required/basic field rules, executes built-in actions, and emits runtime events
  - existing button fields now get implicit `component.click` listeners so the current builder model still works before the dedicated `Events` tab lands
  - the builder preview in [apps/web/src/App.tsx](/Users/clint/Workspace/form-builder/apps/web/src/App.tsx) now mounts the shared runtime, drives `Previous` / `Continue` / `Submit` through runtime actions, syncs preview step selection from `step.enter`, and dispatches authored button clicks as real runtime events
  - refreshed the workspace install with `npm install` so Vite resolves `@form-builder/runtime` during live dev-server validation
- Added the first guided runtime authoring surface in [apps/web/src/App.tsx](/Users/clint/Workspace/form-builder/apps/web/src/App.tsx):
  - inspector now has a dedicated `Events` mode alongside `Properties` and `Logic`
  - `Form events` is now an explicit scope inside the inspector, so authors can edit form-level listeners without leaving the builder
  - form-level presets now support `Emit event on load`, `Emit event on submit`, and `Emit event on validation failure`
  - selected fields/components now expose node-level listener/action editing, with button and field presets designed for guided no-code authoring first
  - the old button-action dropdown in `Properties` was removed as the primary editing path and replaced with a handoff into `Events`
  - explicit button listeners now override the compatibility-only implicit button listener path in the runtime index
- Added dev-only runtime roundtrip tooling in [apps/web/src/App.tsx](/Users/clint/Workspace/form-builder/apps/web/src/App.tsx):
  - builder header now exposes `Runtime tools` alongside normal authoring controls
  - the modal can export the live runtime session JSON and import it back into the mounted runtime
  - the modal shows the current submit payload, current session snapshot, and a recent runtime event trace
  - mock host-response controls exist for `success` and `error` flows while the shared runtime is still hosted only inside the builder preview
- Added deterministic runtime roundtrip coverage in [packages/runtime/src/engine.test.ts](/Users/clint/Workspace/form-builder/packages/runtime/src/engine.test.ts):
  - session export/import style restore
  - validation-blocked submit
  - submit success/error host roundtrip
  - explicit authored button listeners overriding the old implicit compatibility path
- Fixed a real runtime engine bug in [packages/runtime/src/engine.ts](/Users/clint/Workspace/form-builder/packages/runtime/src/engine.ts):
  - runtime-built events were being traced and emitted twice because `buildEvent` and `routeEvent` both pushed them through the bus
  - trace/event emission now runs through `routeEvent`, which removed duplicate `form.load`, `step.enter`, `form.validation_failed`, and custom-event entries from the runtime tools modal
- Added runtime roundtrip guidance in [docs/runtime-roundtrip-testing.md](/Users/clint/Workspace/form-builder/docs/runtime-roundtrip-testing.md)
- Added light payload authoring in the `Events` tab in [apps/web/src/App.tsx](/Users/clint/Workspace/form-builder/apps/web/src/App.tsx):
  - `emit_event` and `host_action` now support guided key/value payload editing by default
  - each payload editor also supports a raw JSON mode with explicit apply/reset controls
  - the key/value editor now seeds visible placeholder keys like `field_1` so payload rows are actually usable in the live inspector
- Tightened the runtime QA loop in [apps/web/src/App.tsx](/Users/clint/Workspace/form-builder/apps/web/src/App.tsx):
  - preview `form.submit` no longer forces an immediate stage switch to `Publish`, so the host-response loop can be validated in place
  - `Runtime tools` now includes `Seed required values` so submit success/error flows can be exercised without hand-filling long imported forms first
  - live browser validation now covers authored button dispatch, `form.submit`, `form.submit_success`, and `form.submit_error`
- Added deeper runtime documentation in:
  - [docs/runtime-authoring-guide.md](/Users/clint/Workspace/form-builder/docs/runtime-authoring-guide.md)
  - [docs/runtime-host-integration.md](/Users/clint/Workspace/form-builder/docs/runtime-host-integration.md)
  - [docs/runtime-cookbook.md](/Users/clint/Workspace/form-builder/docs/runtime-cookbook.md)
  - refreshed [docs/runtime-roundtrip-testing.md](/Users/clint/Workspace/form-builder/docs/runtime-roundtrip-testing.md) so the current validation status and remaining gaps reflect the actual runtime/browser state
- Tightened the shell toward a shadcn-style default UI system:
  - updated shared cards and badges in [packages/ui/src/components/panel-card.tsx](/Users/clint/Workspace/form-builder/packages/ui/src/components/panel-card.tsx), [packages/ui/src/components/status-badge.tsx](/Users/clint/Workspace/form-builder/packages/ui/src/components/status-badge.tsx), and [packages/ui/src/components/metric-tile.tsx](/Users/clint/Workspace/form-builder/packages/ui/src/components/metric-tile.tsx)
  - shifted global shell styling in [apps/web/src/styles.css](/Users/clint/Workspace/form-builder/apps/web/src/styles.css) to a denser neutral surface, subtler shadows, and tighter pills
  - tightened builder/review chrome in [apps/web/src/App.tsx](/Users/clint/Workspace/form-builder/apps/web/src/App.tsx) with smaller stage headers, more compact action geometry, denser stage tabs, refined iconography, and lower panel minimum heights
  - this pass keeps the app/builder shell on the shadcn-style side while leaving the step/runtime surface as the separate output-facing layer
- Replaced the previous visual system with a cleaner blue/neutral product palette in [apps/web/src/styles.css](/Users/clint/Workspace/form-builder/apps/web/src/styles.css)
- Added backend regression coverage for promotion, disk reload, and direct authoring-JSON import in [apps/api/tests/test_smoke.py](/Users/clint/Workspace/form-builder/apps/api/tests/test_smoke.py)

## Key Files

- [apps/api/src/form_builder_api/main.py](/Users/clint/Workspace/form-builder/apps/api/src/form_builder_api/main.py)
- [apps/api/src/form_builder_api/repository.py](/Users/clint/Workspace/form-builder/apps/api/src/form_builder_api/repository.py)
- [apps/api/src/form_builder_api/models/authoring.py](/Users/clint/Workspace/form-builder/apps/api/src/form_builder_api/models/authoring.py)
- [apps/api/src/form_builder_api/services/authoring.py](/Users/clint/Workspace/form-builder/apps/api/src/form_builder_api/services/authoring.py)
- [packages/schema/src/authoring.ts](/Users/clint/Workspace/form-builder/packages/schema/src/authoring.ts)
- [packages/schema/src/runtime.ts](/Users/clint/Workspace/form-builder/packages/schema/src/runtime.ts)
- [apps/web/src/App.tsx](/Users/clint/Workspace/form-builder/apps/web/src/App.tsx)
- [apps/web/src/lib/api.ts](/Users/clint/Workspace/form-builder/apps/web/src/lib/api.ts)
- [apps/web/src/lib/authoring-utils.ts](/Users/clint/Workspace/form-builder/apps/web/src/lib/authoring-utils.ts)
- [apps/api/src/form_builder_api/models/runtime.py](/Users/clint/Workspace/form-builder/apps/api/src/form_builder_api/models/runtime.py)
- [packages/runtime/src/engine.ts](/Users/clint/Workspace/form-builder/packages/runtime/src/engine.ts)
- [packages/runtime/src/document-index.ts](/Users/clint/Workspace/form-builder/packages/runtime/src/document-index.ts)
- [packages/runtime/src/session-state.ts](/Users/clint/Workspace/form-builder/packages/runtime/src/session-state.ts)
- [packages/runtime/src/validation.ts](/Users/clint/Workspace/form-builder/packages/runtime/src/validation.ts)
- [docs/runtime-authoring-guide.md](/Users/clint/Workspace/form-builder/docs/runtime-authoring-guide.md)
- [docs/runtime-host-integration.md](/Users/clint/Workspace/form-builder/docs/runtime-host-integration.md)
- [docs/runtime-cookbook.md](/Users/clint/Workspace/form-builder/docs/runtime-cookbook.md)

## Last Verified

- Backend:
  - `PYTHONPATH=apps/api/src ./.venv/bin/pytest apps/api/tests/test_smoke.py apps/api/tests/test_extraction.py apps/api/tests/test_extraction_adapters.py`
  - result: `49 passed`
- Frontend:
  - `npm run build:schema`
  - `npm run build:runtime`
  - `npm run test:runtime`
  - `npm run typecheck:web`
  - `npm run build:web`
- Workspace:
  - `npm install`
- Backend:
  - `PYTHONPATH=apps/api/src ./.venv/bin/pytest apps/api/tests/test_smoke.py`
- Browser:
  - live pass on `http://127.0.0.1:5173/` validating the repaired `@form-builder/runtime` workspace import, runtime-driven builder step progression from `Continue`, and the new form-level `Events` presets/listener editor
  - live pass on `http://127.0.0.1:5173/` validating the `Runtime tools` modal, session snapshot / submit payload / trace visibility, step-to-step runtime navigation, and `form.validation_failed` emission on preview submit
  - live pass on `http://127.0.0.1:5173/` validating that the runtime trace no longer duplicates `form.load` / `step.enter` entries after the engine fix
  - live pass on `http://127.0.0.1:5173/` validating `Events` payload editing in both key/value and JSON modes for `emit_event`
  - live pass on `http://127.0.0.1:5173/` validating the denser shell treatment, updated iconography, tighter builder chrome, and default shadcn-style app surface
  - live pass on `http://127.0.0.1:5173/` validating authored button dispatch through explicit runtime listeners, seeded-value submit through `Runtime tools`, `form.submit` hold-in-place behavior, and both `form.submit_success` and `form.submit_error` roundtrip responses

## Known Gaps

- Promotion currently requires a reviewed conversion and always derives the initial project from the current extraction draft; there is no partial-review promotion path yet.
- Project persistence is file-backed and single-user oriented; there is no concurrency model, database storage, or shared workflow yet.
- The staged app flow is much clearer, but the builder still needs a second interaction pass:
  - drag/drop is present, but it still needs richer empty-state drop zones and clearer insertion markers
  - logic editing is now bounded and recoverable, but there is still no separate path-map or event graph visualization yet
  - the publish stage is now leaner and more concrete, but it is still a status/storage surface rather than a full runtime/export pipeline
- Provenance is retained, but field-level evidence is still lighter-weight in the builder than in the review stage.
- Runtime behavior authoring is still shallow:
  - the shared runtime package now exists and preview step progression runs through it, but field inputs are still mostly static preview rather than full runtime value editing
  - the `Events` tab now supports basic payload authoring, but payload typing/validation is still intentionally light and session import/export is still dev-only rather than part of a mature runtime QA surface
  - node-level runtime presets now have deterministic engine coverage and live browser coverage for the current authored button + host success/error loop, but richer preview field interaction and multi-action authoring still need deeper validation
  - runtime docs now cover architecture, schema, roundtrip testing, authoring, host integration, and recipes, but they still need to evolve with richer payload typing and a more capable host shell
- The shell is now closer to the desired direction, but there is still no explicit component-system toggle between `shadcn-style default` and `USWDS shell mode`; this pass establishes the default look rather than a live switch.

## Best Next

- Stay in the staged UI direction and deepen the builder interaction model before doing more visual restyling.
- Recommended next slice:
  1. Add persistence-style regression checks around session export/import so the roundtrip story is test-backed through API/load-save seams too.
  2. Deepen runtime preview interactivity so field-value editing is less synthetic during runtime QA and authored behavior can be exercised with fewer dev-only shortcuts.
  3. Extend browser validation around richer multi-action listeners and authored payload usage now that the base host-response loop is live.
  4. Decide whether to add a real shell component-system toggle or keep the current default-only shadcn-style direction until the host-shell layer is deeper.

## Restart Notes

1. Start the stack with `npm run dev`.
2. Review a PDF in `Review Workspace`.
3. Mark it `Reviewed` or `Accepted`.
4. Use `Promote to project`.
5. Switch to `Authoring Workspace` to edit the persisted project.
6. Inspect saved artifacts under `data/projects/` if you need to verify disk state directly.
