from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from uuid import uuid4

from pydantic import Field

from .canonical import DocumentClass, ExtractionIssue, FormDefinition, ReviewStatus
from .base import CamelModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ConversionStatus(str, Enum):
    UPLOADED = "uploaded"
    ANALYZING = "analyzing"
    CLASSIFIED = "classified"
    EXTRACTED = "extracted"
    IN_REVIEW = "in_review"
    FAILED = "failed"
    ACCEPTED = "accepted"


class ProcessingStepStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    WARNING = "warning"
    FAILED = "failed"


class ProcessingStep(CamelModel):
    key: str
    label: str
    status: ProcessingStepStatus
    detail: str
    timestamp: datetime = Field(default_factory=utc_now)


class DocumentSignals(CamelModel):
    page_count: int = 0
    contains_xfa: bool = False
    contains_acroform: bool = False
    acroform_field_count: int = 0
    text_page_count: int = 0
    image_only_page_count: int = 0
    mixed_page_modes: bool = False
    detected_modes: list[str] = Field(default_factory=list)
    sample_text_excerpt: str | None = None


class SamplePdfSummary(CamelModel):
    filename: str
    file_size: int = Field(ge=0, default=0)
    document_class: DocumentClass | None = None
    document_signals: DocumentSignals | None = None


class SampleImportRequest(CamelModel):
    filename: str


class ConversionRecord(CamelModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    filename: str
    content_type: str | None = None
    file_size: int = Field(ge=0, default=0)
    status: ConversionStatus = ConversionStatus.UPLOADED
    document_class: DocumentClass | None = None
    extractor_path: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1, default=0)
    notes: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    processing_steps: list[ProcessingStep] = Field(default_factory=list)
    document_signals: DocumentSignals | None = None
    issues: list[ExtractionIssue] = Field(default_factory=list)
    review_status: ReviewStatus = ReviewStatus.NEEDS_REVIEW
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    draft: FormDefinition | None = None


class DraftPatch(CamelModel):
    review_status: ReviewStatus | None = None
    notes: str | None = None
    approved_issue_codes: list[str] = Field(default_factory=list)


class FormRecord(CamelModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    source_conversion_id: str
    definition: FormDefinition
    created_at: datetime = Field(default_factory=utc_now)


class RenderPreview(CamelModel):
    form_id: str
    title: str
    document_class: DocumentClass
    page_count: int
    section_count: int
    field_count: int
    steps: list[dict[str, str | int]]


class HeuristicRecord(CamelModel):
    id: str
    name: str
    category: str
    enabled: bool = True
    version: str
    rationale: str
    scoped_to: str
    last_reviewed: datetime = Field(default_factory=utc_now)


class HeuristicPatch(CamelModel):
    enabled: bool | None = None
    rationale: str | None = None


class TreatmentRecord(CamelModel):
    id: str
    source_scope: str
    source_pattern: str
    canonical_intent: str
    recommended_digital_treatment: str
    target_runtime_pattern: str
    uswds_target: str
    rationale: str
    confidence: float = Field(ge=0, le=1)
    approval_status: str
    version: str


class TreatmentPatch(CamelModel):
    approval_status: str | None = None
    rationale: str | None = None
