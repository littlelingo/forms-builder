# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

npm workspaces monorepo + a Python FastAPI app outside the npm graph.

- `apps/web` — React 18 + TypeScript + Vite + Tailwind. Uses USWDS as runtime baseline.
- `apps/api` — FastAPI (Python 3.12+), Pydantic v2. Installed editable into `.venv` at repo root.
- `packages/schema` — canonical TS types + JSON Schema. Source of truth for cross-layer contracts.
- `packages/runtime` — framework-agnostic execution engine that consumes `AuthoringDocument`.
- `packages/ui` — shared React primitives (`PanelCard`, `StatusBadge`, `MetricTile`).

TS path aliases (`tsconfig.base.json`) point `@form-builder/*` directly at `packages/*/src/index.ts` — no build step required between workspaces during dev.

## Commands

Dev servers (scripts in `scripts/`):

```bash
npm run dev            # both web (5173) and api (8000), Ctrl+C kills both
npm run dev:web        # vite, port via WEB_PORT
npm run dev:api        # uvicorn --reload, needs .venv populated, port via API_PORT
npm run stop           # stop:web + stop:api
```

Frontend → API target override: `VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev:web`.

Build / typecheck / test:

```bash
npm run build:web              # tsc -p + vite build
npm run typecheck:web
npm run build:schema           # tsc --noEmit (validates schema package)
npm run build:runtime          # tsc --noEmit
npm run test:runtime           # tsx --test src/**/*.test.ts (node test runner)
npm run generate:schema-types  # json2ts → packages/schema/src/generated.ts
npm run format                 # prettier write
npm run format:check
npm run validate:corpus        # python sweep over local PDF corpus
```

Single runtime test: `npm run test --workspace @form-builder/runtime -- --test-name-pattern="<regex>"` (or pass a path: `npx tsx --test packages/runtime/src/engine.test.ts`).

API tests / install:

```bash
python3 -m venv .venv
.venv/bin/pip install -e 'apps/api[dev]'
.venv/bin/pytest apps/api/tests              # all
.venv/bin/pytest apps/api/tests/test_extraction.py::test_name   # single
```

## Architecture

The repo splits cleanly into **authoring** (build the form), **extraction** (PDF → draft), and **runtime** (execute the form). Understanding which layer owns a concern is the fastest path to changes.

### Schema as contract

`packages/schema/src/generated.ts` is generated from `packages/schema/schema/form-definition.schema.json` — never edit `generated.ts` by hand; regenerate with `npm run generate:schema-types`. `authoring.ts` and `runtime.ts` add hand-written types on top. `index.ts` re-exports types and the small set of runtime constants (`runtimeCoreEventType`, etc.). The Python side mirrors these in `apps/api/src/form_builder_api/models/{canonical,authoring,runtime}.py` — keep both in sync when changing the contract.

### Runtime engine (`packages/runtime`)

`createRuntimeEngine` loads an `AuthoringDocument` and exposes a strict event-driven API. Responsibilities owned by the engine:

- session-state init / restoration, current step, field values, visibility/enabled/required
- event dispatch + listener evaluation + condition matching + built-in actions
- validation, submit-payload generation

Explicitly **not** owned: auth, network transport, routing, host persistence, arbitrary scripting. Submit is event-driven — engine emits `form.submit`, host handles transport, host dispatches `form.submit_success` / `form.submit_error` back. See `docs/runtime-architecture.md` for the host-bridge contract.

The web app is the first runtime host; future VA.gov-style hosts will reuse the same package.

### Backend extraction → authoring promotion (`apps/api`)

Phase 1 flow (real, not stub):

1. `POST /conversions` (PDF upload) → `services/conversion_pipeline.ingest_conversion` runs `services/extraction*` adapters, produces a `ConversionRecord` with draft + provenance + issues.
2. Reviewer edits draft via `PATCH /conversions/{id}/draft`; mandatory before promotion.
3. `POST /conversions/{id}/promote` → `services/authoring.build_authoring_project` produces an `AuthoringProjectDetail`.

Phase 2A persistence: file-backed under `data/projects/<project-id>/` (`project.json`, `document.json`, `source-context.json`, immutable revision snapshots). `repository.InMemoryRepository` is the single seam — swap when moving to a real DB.

`AuthoringDocument` is the editable source of truth post-promotion; the extraction draft remains provenance only.

### Frontend (`apps/web`)

`apps/web/src/App.tsx` is the entire shell — large file, three stages: `home`, `review`, `workspace`. `lib/api.ts` is the API client. `lib/authoring-utils.ts` holds the document-mutation helpers used by the workspace (drag/drop, create field/section/step, etc.).

Two workspaces in the UI map to the two phases: **Review Workspace** (source-page review + promotion) and **Authoring Workspace** (project-native editing + VA-baseline live preview using the runtime package).

## Conventions worth knowing

- Prettier: 120 cols, double quotes, semis, trailing commas — run `npm run format` before commits.
- Runtime tests use Node's built-in test runner via `tsx --test`, not Jest/Vitest.
- The runtime package's `build` script is `tsc --noEmit` — it validates types only; consumers import from source via TS paths.
- `.venv` lives at repo root (not under `apps/api`) — scripts assume `.venv/bin/python3`.
- `RESUME.md` and `docs/project-plan.md` are the living trackers; they describe phase, decisions, and open questions and are kept current — read them when picking up unfamiliar context.
- `docs/runtime-*.md` is the canonical reference for runtime event contract, host integration, and authoring guide. When changing event types or listener semantics, update these.
