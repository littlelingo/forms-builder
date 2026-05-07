from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import Field

from .base import CamelModel


class DocumentClass(str, Enum):
    XFA_BACKED = "xfa_backed_fillable"
    ACROFORM = "acroform_only"
    BORN_DIGITAL = "born_digital_nonfillable"
    SCANNED = "scanned_image_heavy"
    MIXED = "mixed"


class SemanticType(str, Enum):
    TEXT = "text"
    TEXTAREA = "textarea"
    SELECT = "select"
    RADIO = "radio"
    CHECKBOX = "checkbox"
    DATE = "date"
    NUMBER = "number"
    PHONE = "phone"
    EMAIL = "email"
    SIGNATURE_ATTESTATION = "signature_attestation"
    REPEATABLE_GROUP = "repeatable_group"
    STATEMENT = "statement"


class ReviewStatus(str, Enum):
    DRAFT = "draft"
    NEEDS_REVIEW = "needs_review"
    REVIEWED = "reviewed"
    ACCEPTED = "accepted"


class SourcePriority(str, Enum):
    XFA_XML = "xfa_xml"
    WIDGET_GEOMETRY = "widget_geometry"
    ACROFORM = "acroform"
    LAYOUT = "layout"
    OCR = "ocr"
    HEURISTIC = "heuristic"
    REVIEWER = "reviewer_override"


class IssueCode(str, Enum):
    XFA_VISUAL_MISMATCH = "xfa_visual_mismatch"
    AMBIGUOUS_FIELD_TYPE = "ambiguous_field_type"
    LABEL_MISMATCH = "label_mismatch"
    DUPLICATE_NODE = "duplicate_node"
    ORPHANED_NODE = "orphaned_node"
    ORDER_CONFLICT = "page_flow_order_conflict"
    HEURISTIC_APPLIED = "learned_heuristic_application"
    TREATMENT_PROPOSAL = "treatment_mapping_proposal"


class ConfidenceBand(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class Coordinates(CamelModel):
    page: int = Field(ge=1)
    x: float
    y: float
    width: float = Field(gt=0)
    height: float = Field(gt=0)


class EvidenceAnchor(CamelModel):
    anchor_id: str
    source_priority: SourcePriority
    page: int = Field(ge=1)
    snippet: str
    bounds: Coordinates | None = None
    confidence: float = Field(ge=0, le=1)
    notes: str | None = None


class ExtractionIssue(CamelModel):
    code: IssueCode
    severity: Literal["info", "warning", "error"]
    message: str
    node_id: str | None = None
    evidence_anchor_ids: list[str] = Field(default_factory=list)
    confidence_band: ConfidenceBand = ConfidenceBand.MEDIUM
    suggested_action: str | None = None


class ChoiceOption(CamelModel):
    value: str
    label: str
    order_index: int = Field(ge=0)
    selected_by_default: bool = False
    evidence: list[EvidenceAnchor] = Field(default_factory=list)


class ValidationRule(CamelModel):
    rule_id: str
    rule_type: Literal["required", "regex", "min", "max", "length", "custom"]
    message: str
    value: str | float | int | None = None


class FieldNode(CamelModel):
    id: str
    stable_key: str
    order_index: int = Field(ge=0)
    lineage: list[str] = Field(default_factory=list)
    page_id: str
    section_id: str
    semantic_type: SemanticType
    label: str
    help_text: str | None = None
    required: bool = False
    source_coordinates: list[Coordinates] = Field(default_factory=list)
    evidence: list[EvidenceAnchor] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)
    source_priority: list[SourcePriority] = Field(default_factory=list)
    source_conflicts: list[str] = Field(default_factory=list)
    review_status: ReviewStatus = ReviewStatus.NEEDS_REVIEW
    options: list[ChoiceOption] = Field(default_factory=list)
    validations: list[ValidationRule] = Field(default_factory=list)
    renderer_hints: dict[str, str] = Field(default_factory=dict)


class GroupNode(CamelModel):
    id: str
    order_index: int = Field(ge=0)
    label: str
    description: str | None = None
    page_id: str
    section_id: str
    lineage: list[str] = Field(default_factory=list)
    source_coordinates: list[Coordinates] = Field(default_factory=list)
    evidence: list[EvidenceAnchor] = Field(default_factory=list)
    fields: list[FieldNode] = Field(default_factory=list)
    renderer_hints: dict[str, str] = Field(default_factory=dict)


class SectionNode(CamelModel):
    id: str
    order_index: int = Field(ge=0)
    title: str
    description: str | None = None
    page_id: str
    lineage: list[str] = Field(default_factory=list)
    groups: list[GroupNode] = Field(default_factory=list)
    fields: list[FieldNode] = Field(default_factory=list)


class PageNode(CamelModel):
    id: str
    order_index: int = Field(ge=0)
    label: str
    sections: list[SectionNode] = Field(default_factory=list)
    evidence: list[EvidenceAnchor] = Field(default_factory=list)


class FormDefinition(CamelModel):
    id: str
    title: str
    document_class: DocumentClass
    review_status: ReviewStatus = ReviewStatus.DRAFT
    source_priority: list[SourcePriority] = Field(default_factory=list)
    source_conflicts: list[str] = Field(default_factory=list)
    pages: list[PageNode] = Field(default_factory=list)
    issues: list[ExtractionIssue] = Field(default_factory=list)
    metadata: dict[str, str] = Field(default_factory=dict)
