from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal
from uuid import uuid4

from pydantic import Field

from .base import CamelModel
from .canonical import (
    ChoiceOption,
    DocumentClass,
    ExtractionIssue,
    FormDefinition,
    ReviewStatus,
    SemanticType,
    ValidationRule,
)
from .runtime import RuntimeDocumentBehavior, RuntimeNodeBehavior


class ProjectStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"


class AuthoringField(CamelModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    dispatch_key: str | None = None
    stable_key: str
    label: str
    help_text: str | None = None
    semantic_type: SemanticType
    required: bool = False
    confidence: float | None = Field(default=None, ge=0, le=1)
    options: list[ChoiceOption] = Field(default_factory=list)
    validations: list[ValidationRule] = Field(default_factory=list)
    layout_hints: dict[str, str] = Field(default_factory=dict)
    renderer_hints: dict[str, str] = Field(default_factory=dict)
    source_priority: list[str] = Field(default_factory=list)
    source_conflicts: list[str] = Field(default_factory=list)
    lineage: list[str] = Field(default_factory=list)
    source_field_ids: list[str] = Field(default_factory=list)
    provenance_anchor_ids: list[str] = Field(default_factory=list)
    runtime: RuntimeNodeBehavior | None = None


class AuthoringGroup(CamelModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    dispatch_key: str | None = None
    label: str
    description: str | None = None
    layout_hints: dict[str, str] = Field(default_factory=dict)
    renderer_hints: dict[str, str] = Field(default_factory=dict)
    lineage: list[str] = Field(default_factory=list)
    source_group_ids: list[str] = Field(default_factory=list)
    provenance_anchor_ids: list[str] = Field(default_factory=list)
    fields: list[AuthoringField] = Field(default_factory=list)
    runtime: RuntimeNodeBehavior | None = None


class AuthoringSection(CamelModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    dispatch_key: str | None = None
    title: str
    description: str | None = None
    layout_hints: dict[str, str] = Field(default_factory=dict)
    lineage: list[str] = Field(default_factory=list)
    source_section_ids: list[str] = Field(default_factory=list)
    provenance_anchor_ids: list[str] = Field(default_factory=list)
    groups: list[AuthoringGroup] = Field(default_factory=list)
    fields: list[AuthoringField] = Field(default_factory=list)
    runtime: RuntimeNodeBehavior | None = None


class AuthoringStep(CamelModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    dispatch_key: str | None = None
    title: str
    description: str | None = None
    kind: str = "collect"
    layout_hints: dict[str, str] = Field(default_factory=dict)
    source_page_ids: list[str] = Field(default_factory=list)
    provenance_anchor_ids: list[str] = Field(default_factory=list)
    sections: list[AuthoringSection] = Field(default_factory=list)
    runtime: RuntimeNodeBehavior | None = None


class AuthoringDocument(CamelModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    dispatch_key: str | None = None
    title: str
    document_class: DocumentClass
    review_status: ReviewStatus = ReviewStatus.REVIEWED
    target_runtime: str = "va_web_form"
    visual_baseline: str = "va.gov"
    source_priority: list[str] = Field(default_factory=list)
    source_conflicts: list[str] = Field(default_factory=list)
    steps: list[AuthoringStep] = Field(default_factory=list)
    metadata: dict[str, str] = Field(default_factory=dict)
    runtime: RuntimeDocumentBehavior | None = None


class ProjectSourceContext(CamelModel):
    conversion_id: str
    filename: str
    document_class: DocumentClass | None = None
    review_status: ReviewStatus
    confidence: float = Field(ge=0, le=1, default=0)
    extractor_path: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    issues: list[ExtractionIssue] = Field(default_factory=list)
    imported_draft: FormDefinition


class AuthoringProjectRecord(CamelModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    status: ProjectStatus = ProjectStatus.DRAFT
    target_runtime: str = "va_web_form"
    visual_baseline: str = "va.gov"
    source_conversion_id: str
    document_class: DocumentClass | None = None
    current_revision_id: str | None = None
    revision_count: int = Field(default=0, ge=0)
    created_at: datetime
    updated_at: datetime


class AuthoringProjectDetail(CamelModel):
    project: AuthoringProjectRecord
    document: AuthoringDocument
    source_context: ProjectSourceContext


class ProjectRevision(CamelModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    project_id: str
    created_at: datetime
    note: str
    document: AuthoringDocument


class ProjectPatch(CamelModel):
    name: str | None = None
    status: ProjectStatus | None = None


BehaviorLibraryParameterType = Literal[
    "string",
    "number",
    "boolean",
    "enum",
    "nodeRef",
    "eventRef",
    "fieldKey",
    "list",
]

BehaviorLibraryScope = Literal["system", "project"]

BehaviorLibraryCategory = Literal[
    "validation",
    "visibility",
    "host",
    "events",
    "data",
    "repeatables",
    "custom",
]


class BehaviorLibraryParameterConstraints(CamelModel):
    regex: str | None = None
    min: float | None = None
    max: float | None = None


class BehaviorLibraryParameter(CamelModel):
    key: str
    type: BehaviorLibraryParameterType
    label: str
    description: str | None = None
    required: bool = False
    default: object | None = None
    options: list[str] | None = None
    item_type: BehaviorLibraryParameterType | None = None
    constraints: BehaviorLibraryParameterConstraints | None = None


class BehaviorLibraryEntryI18nText(CamelModel):
    name: str
    description: str


class BehaviorLibraryEntry(CamelModel):
    id: str
    name: str
    description: str
    category: BehaviorLibraryCategory
    scope: BehaviorLibraryScope
    revision: int
    icon: str | None = None
    parameters: list[BehaviorLibraryParameter] = Field(default_factory=list)
    binds_to: list[str] = Field(default_factory=list)
    template: object  # opaque per Phase 1A
    i18n: dict[str, BehaviorLibraryEntryI18nText] | None = None
