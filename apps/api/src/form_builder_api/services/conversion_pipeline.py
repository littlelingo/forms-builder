from __future__ import annotations

from form_builder_api.models.api import (
    ConversionRecord,
    ConversionStatus,
    ProcessingStep,
    ProcessingStepStatus,
)
from form_builder_api.models.canonical import ReviewStatus
from form_builder_api.services.classification import ClassificationResult, DocumentInspectionError, classify_document
from form_builder_api.services.extraction import build_form_definition


def _default_steps() -> list[ProcessingStep]:
    return [
        ProcessingStep(
            key="ingestion",
            label="Ingestion",
            status=ProcessingStepStatus.COMPLETED,
            detail="PDF bytes were received by the API.",
        ),
        ProcessingStep(
            key="classification",
            label="Classification",
            status=ProcessingStepStatus.PENDING,
            detail="Waiting for document inspection signals.",
        ),
        ProcessingStep(
            key="extraction",
            label="Extraction",
            status=ProcessingStepStatus.PENDING,
            detail="Waiting for canonical draft generation.",
        ),
        ProcessingStep(
            key="review",
            label="Review",
            status=ProcessingStepStatus.PENDING,
            detail="Waiting for human review.",
        ),
    ]


def _mark_step(
    steps: list[ProcessingStep],
    key: str,
    *,
    status: ProcessingStepStatus,
    detail: str,
) -> None:
    for step in steps:
        if step.key == key:
            step.status = status
            step.detail = detail
            break


def ingest_conversion(filename: str, payload: bytes, content_type: str | None) -> ConversionRecord:
    record = ConversionRecord(
        filename=filename,
        content_type=content_type,
        file_size=len(payload),
        status=ConversionStatus.ANALYZING,
        processing_steps=_default_steps(),
    )

    try:
        classification = classify_document(payload)
    except DocumentInspectionError as exc:
        record.status = ConversionStatus.FAILED
        record.errors.append(str(exc))
        _mark_step(
            record.processing_steps,
            "classification",
            status=ProcessingStepStatus.FAILED,
            detail=str(exc),
        )
        return record

    _apply_classification(record, classification)

    try:
        draft = build_form_definition(filename, payload, classification)
    except Exception as exc:
        record.status = ConversionStatus.FAILED
        record.errors.append(f"Canonical extraction failed: {exc}")
        _mark_step(
            record.processing_steps,
            "extraction",
            status=ProcessingStepStatus.FAILED,
            detail="Canonical draft generation failed.",
        )
        return record

    record.draft = draft
    record.issues = draft.issues
    record.status = ConversionStatus.IN_REVIEW
    record.review_status = ReviewStatus.NEEDS_REVIEW
    _mark_step(
        record.processing_steps,
        "extraction",
        status=ProcessingStepStatus.COMPLETED,
        detail="A draft canonical JSON definition was generated.",
    )
    _mark_step(
        record.processing_steps,
        "review",
        status=ProcessingStepStatus.WARNING if draft.issues else ProcessingStepStatus.PENDING,
        detail=(
            "Draft is ready for human review with surfaced issues."
            if draft.issues
            else "Draft is ready for human review."
        ),
    )
    return record


def _apply_classification(record: ConversionRecord, classification: ClassificationResult) -> None:
    record.document_class = classification.document_class
    record.document_signals = classification.signals
    record.extractor_path = classification.extractor_path
    record.confidence = classification.confidence
    record.notes = classification.notes
    record.status = ConversionStatus.CLASSIFIED
    _mark_step(
        record.processing_steps,
        "classification",
        status=ProcessingStepStatus.COMPLETED,
        detail=f"Identified {classification.document_class.value} using ingestion-time PDF inspection.",
    )
