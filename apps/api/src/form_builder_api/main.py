from __future__ import annotations

from fastapi import FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from form_builder_api.models.api import (
    ConversionRecord,
    DraftPatch,
    FormRecord,
    HeuristicPatch,
    RenderPreview,
    SampleImportRequest,
    SamplePdfSummary,
    TreatmentPatch,
)
from form_builder_api.models.authoring import (
    AuthoringDocument,
    AuthoringProjectDetail,
    AuthoringProjectRecord,
    ProjectPatch,
    ProjectRevision,
)
from form_builder_api.repository import InMemoryRepository, UnmigratedDocumentError
from form_builder_api.services.authoring import (
    build_authoring_project,
    build_authoring_project_from_document,
)
from form_builder_api.services.conversion_pipeline import ingest_conversion
from form_builder_api.services.preview import build_render_preview
from form_builder_api.services.sample_library import list_sample_pdfs, load_sample_pdf
from form_builder_api.services.source_preview import render_conversion_page_png

app = FastAPI(
    title="Form Builder Extraction API",
    version="0.1.0",
    summary="Phase 1 extraction and review workflow for canonical form definitions.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(UnmigratedDocumentError)
async def unmigrated_document_handler(request: Request, exc: UnmigratedDocumentError) -> JSONResponse:
    return JSONResponse(status_code=409, content={"error": str(exc), "project_id": exc.project_id})


repository = InMemoryRepository()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/conversions", response_model=list[ConversionRecord])
def list_conversions() -> list[ConversionRecord]:
    return repository.list_conversions()


@app.get("/sample-pdfs", response_model=list[SamplePdfSummary])
def get_sample_pdfs() -> list[SamplePdfSummary]:
    return list_sample_pdfs()


@app.post("/conversions", response_model=ConversionRecord)
async def create_conversion(file: UploadFile = File(...)) -> ConversionRecord:
    payload = await file.read()
    record = ingest_conversion(
        file.filename or "uploaded.pdf",
        payload,
        file.content_type,
    )
    saved = repository.save_conversion(record)
    repository.save_conversion_source(saved.id, payload, file.content_type)
    return saved


@app.post("/conversions/from-sample", response_model=ConversionRecord)
def create_conversion_from_sample(request: SampleImportRequest) -> ConversionRecord:
    try:
        filename, payload = load_sample_pdf(request.filename)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    record = ingest_conversion(
        filename,
        payload,
        "application/pdf",
    )
    saved = repository.save_conversion(record)
    repository.save_conversion_source(saved.id, payload, "application/pdf")
    return saved


@app.get("/conversions/{conversion_id}", response_model=ConversionRecord)
def get_conversion(conversion_id: str) -> ConversionRecord:
    record = repository.get_conversion(conversion_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Conversion not found")
    return record


@app.get("/conversions/{conversion_id}/source")
def get_conversion_source(conversion_id: str) -> Response:
    source = repository.get_conversion_source(conversion_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Conversion source not found")
    payload, content_type = source
    return Response(
        content=payload,
        media_type=content_type or "application/pdf",
        headers={"Content-Disposition": 'inline; filename="source.pdf"'},
    )


@app.get("/conversions/{conversion_id}/pages/{page_number}/preview.png")
def get_conversion_page_preview(conversion_id: str, page_number: int) -> Response:
    source = repository.get_conversion_source(conversion_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Conversion source not found")
    payload, _content_type = source
    try:
        image_bytes = render_conversion_page_png(payload, page_number)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return Response(content=image_bytes, media_type="image/png")


@app.get("/conversions/{conversion_id}/draft")
def get_conversion_draft(conversion_id: str):
    record = repository.get_conversion(conversion_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Conversion not found")
    return record.draft


@app.patch("/conversions/{conversion_id}/draft", response_model=ConversionRecord)
def patch_conversion_draft(conversion_id: str, patch: DraftPatch) -> ConversionRecord:
    if repository.get_conversion(conversion_id) is None:
        raise HTTPException(status_code=404, detail="Conversion not found")
    return repository.patch_conversion(conversion_id, patch)


@app.delete("/conversions/{conversion_id}", status_code=204)
def delete_conversion(conversion_id: str) -> Response:
    deleted = repository.delete_conversion(conversion_id)
    if deleted is None:
        raise HTTPException(status_code=404, detail="Conversion not found")
    return Response(status_code=204)


@app.delete("/conversions", response_model=dict[str, int])
def clear_conversions() -> dict[str, int]:
    return {"deleted": repository.clear_conversions()}


@app.post("/conversions/{conversion_id}/promote", response_model=AuthoringProjectDetail)
def promote_conversion(conversion_id: str) -> AuthoringProjectDetail:
    record = repository.get_conversion(conversion_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Conversion not found")
    if record.review_status == "needs_review":
        raise HTTPException(status_code=409, detail="Review the conversion before promoting it to a project.")
    try:
        detail = build_authoring_project(record)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return repository.create_project(detail, note="Promoted from reviewed conversion")


@app.get("/projects", response_model=list[AuthoringProjectRecord])
def list_projects() -> list[AuthoringProjectRecord]:
    return repository.list_projects()


@app.get("/projects/{project_id}", response_model=AuthoringProjectDetail)
def get_project(project_id: str) -> AuthoringProjectDetail:
    detail = repository.get_project(project_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return detail


@app.post("/projects/from-document", response_model=AuthoringProjectDetail)
def create_project_from_document(document: AuthoringDocument) -> AuthoringProjectDetail:
    detail = build_authoring_project_from_document(document)
    return repository.create_project(detail, note="Imported from authoring JSON")


@app.patch("/projects/{project_id}", response_model=AuthoringProjectDetail)
def patch_project(project_id: str, patch: ProjectPatch) -> AuthoringProjectDetail:
    if repository.get_project(project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return repository.update_project(project_id, patch)


@app.get("/projects/{project_id}/document", response_model=AuthoringDocument)
def get_project_document(project_id: str) -> AuthoringDocument:
    detail = repository.get_project(project_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return detail.document


@app.put("/projects/{project_id}/document", response_model=AuthoringProjectDetail)
def put_project_document(project_id: str, document: AuthoringDocument) -> AuthoringProjectDetail:
    if repository.get_project(project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return repository.update_project_document(project_id, document)


@app.get("/projects/{project_id}/source-context")
def get_project_source_context(project_id: str):
    detail = repository.get_project(project_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return detail.source_context


@app.get("/projects/{project_id}/revisions", response_model=list[ProjectRevision])
def get_project_revisions(project_id: str) -> list[ProjectRevision]:
    if repository.get_project(project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return repository.list_project_revisions(project_id)


@app.post("/forms", response_model=FormRecord)
def create_form(payload: FormRecord) -> FormRecord:
    return repository.save_form(payload)


@app.get("/forms/{form_id}", response_model=FormRecord)
def get_form(form_id: str) -> FormRecord:
    record = repository.get_form(form_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Form not found")
    return record


@app.post("/forms/{form_id}/render-preview", response_model=RenderPreview)
def render_preview(form_id: str) -> RenderPreview:
    record = repository.get_form(form_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Form not found")
    return build_render_preview(form_id, record.definition)


@app.get("/heuristics")
def get_heuristics():
    return repository.list_heuristics()


@app.patch("/heuristics/{heuristic_id}")
def patch_heuristic(heuristic_id: str, patch: HeuristicPatch):
    try:
        return repository.patch_heuristic(heuristic_id, patch)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Heuristic not found") from exc


@app.get("/treatments")
def get_treatments():
    return repository.list_treatments()


@app.patch("/treatments/{treatment_id}")
def patch_treatment(treatment_id: str, patch: TreatmentPatch):
    try:
        return repository.patch_treatment(treatment_id, patch)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Treatment not found") from exc
