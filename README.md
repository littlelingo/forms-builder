# Form Builder Platform

Phase 1 scaffolds a monorepo for PDF-to-canonical-form extraction, review, and runtime preview.

## Workspace Layout

- `apps/web`: React + TypeScript + Vite review and authoring shell
- `apps/api`: FastAPI extraction API with a phase-1 in-memory workflow
- `packages/schema`: canonical schema source, JSON Schema, and TypeScript types
- `packages/ui`: shared React UI primitives for review and runtime surfaces
- `docs`: living project tracker and design-system mapping notes

## Local Setup

### Development Scripts

```bash
npm run dev:web
npm run dev:api
npm run dev
```

- `npm run dev:web` starts the Vite frontend with hot reload on `http://127.0.0.1:5173`
- `npm run dev:api` starts the FastAPI backend with Uvicorn reload on `http://127.0.0.1:8000`
- `npm run dev` starts both and stops both when you exit

Environment overrides:

```bash
WEB_HOST=0.0.0.0 WEB_PORT=4173 npm run dev:web
API_HOST=0.0.0.0 API_PORT=9000 npm run dev:api
WEB_PORT=4173 API_PORT=9000 npm run dev
```

Frontend API target override:

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev:web
```

### Frontend

```bash
npm install
npm run dev:web
```

### API

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e 'apps/api[dev]'
npm run dev:api
```

## Phase 1 Focus

- classify mixed PDF form inputs
- preserve field order, flow, and evidence
- require human review before acceptance
- keep USWDS as the runtime baseline and VADS as reference-only input

## Current Importer Flow

- Upload a PDF from the browser UI.
- The backend inspects the uploaded bytes at ingestion time using actual PDF signals, not filename conventions.
- The UI surfaces conversion status, processing steps, document signals, issues, errors, and the canonical JSON draft.
- Local PDF preview is browser-side for the current session; the API does not persist PDF bytes yet.
