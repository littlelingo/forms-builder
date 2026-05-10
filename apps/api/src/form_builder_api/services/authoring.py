from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from form_builder_api.models.api import ConversionRecord
from form_builder_api.models.authoring import (
    AuthoringDocument,
    AuthoringField,
    AuthoringGroup,
    AuthoringProjectDetail,
    AuthoringProjectRecord,
    AuthoringSection,
    AuthoringStep,
    ProjectSourceContext,
)
from form_builder_api.models.canonical import FormDefinition, ReviewStatus, SemanticType
from form_builder_api.models.runtime import RuntimeActionDefinition, RuntimeActionTarget, RuntimeListenerDefinition, RuntimeNodeBehavior


def build_authoring_project(conversion: ConversionRecord) -> AuthoringProjectDetail:
    if conversion.draft is None:
        raise ValueError("Conversion draft is not available for promotion.")

    draft = conversion.draft
    document = AuthoringDocument(
        title=draft.title,
        document_class=draft.document_class,
        review_status=conversion.review_status,
        source_priority=[priority.value for priority in draft.source_priority],
        source_conflicts=list(draft.source_conflicts),
        steps=[_build_step(page) for page in draft.pages],
        metadata={
            **draft.metadata,
            "sourceFilename": conversion.filename,
            "sourceConversionId": conversion.id,
            "vaBaseline": "true",
        },
    )
    source_context = ProjectSourceContext(
        conversion_id=conversion.id,
        filename=conversion.filename,
        document_class=conversion.document_class,
        review_status=conversion.review_status,
        confidence=conversion.confidence,
        extractor_path=list(conversion.extractor_path),
        notes=list(conversion.notes),
        issues=list(conversion.issues),
        imported_draft=draft,
    )
    project = AuthoringProjectRecord(
        name=draft.title,
        source_conversion_id=conversion.id,
        document_class=conversion.document_class,
        created_at=conversion.updated_at,
        updated_at=conversion.updated_at,
    )
    return AuthoringProjectDetail(
        project=project,
        document=document,
        source_context=source_context,
    )


def build_authoring_project_from_document(document: AuthoringDocument) -> AuthoringProjectDetail:
    timestamp = datetime.now(timezone.utc)
    source_conversion_id = f"json-import-{uuid4()}"
    imported_draft = FormDefinition(
        id=document.id,
        title=document.title,
        document_class=document.document_class,
        review_status=ReviewStatus.REVIEWED,
        source_priority=[],
        source_conflicts=[],
        pages=[],
        issues=[],
        metadata={**document.metadata, "importSource": "json"},
    )
    source_context = ProjectSourceContext(
        conversion_id=source_conversion_id,
        filename=f"{document.title or 'project'}.json",
        document_class=document.document_class,
        review_status=document.review_status,
        confidence=1,
        extractor_path=["json_import"],
        notes=["Loaded from authoring JSON."],
        issues=[],
        imported_draft=imported_draft,
    )
    project = AuthoringProjectRecord(
        name=document.title,
        source_conversion_id=source_conversion_id,
        document_class=document.document_class,
        created_at=timestamp,
        updated_at=timestamp,
    )
    return AuthoringProjectDetail(
        project=project,
        document=document,
        source_context=source_context,
    )


def _build_step(page) -> AuthoringStep:
    primary_section_title = page.sections[0].title if page.sections else page.label
    page_title = f"Page {page.order_index + 1}"
    if primary_section_title:
        page_title = f"{page_title} · {primary_section_title}"
    page_description = _first_non_empty_snippet(page.evidence)
    if page.label and page.label != primary_section_title:
        page_description = page.label if not page_description else f"{page.label}. {page_description}"
    return AuthoringStep(
        title=page_title,
        description=page_description,
        layout_hints={
            "surface": "va-step",
            "density": "comfortable",
            "sourcePageNumber": str(page.order_index + 1),
        },
        source_page_ids=[page.id],
        provenance_anchor_ids=[anchor.anchor_id for anchor in page.evidence],
        sections=[_build_section(section) for section in page.sections],
    )


def _build_section(section) -> AuthoringSection:
    return AuthoringSection(
        title=section.title,
        description=section.description,
        layout_hints={"presentation": "stacked"},
        lineage=list(section.lineage),
        source_section_ids=[section.id],
        groups=[_build_group(group) for group in section.groups],
        fields=[_build_field(field) for field in section.fields],
        provenance_anchor_ids=_collect_anchor_ids(section.fields, section.groups),
    )


def _build_group(group) -> AuthoringGroup:
    return AuthoringGroup(
        label=group.label,
        description=group.description,
        layout_hints={
            "presentation": group.renderer_hints.get("rowPresentation", "stacked"),
            "kind": group.renderer_hints.get("groupType", "group"),
        },
        renderer_hints=dict(group.renderer_hints),
        lineage=list(group.lineage),
        source_group_ids=[group.id],
        provenance_anchor_ids=[anchor.anchor_id for anchor in group.evidence],
        fields=[_build_field(field) for field in group.fields],
    )


def _build_field(field) -> AuthoringField:
    listeners = _synthesise_extraction_listeners(field)
    runtime = RuntimeNodeBehavior(listeners=listeners) if listeners else None
    return AuthoringField(
        stable_key=field.stable_key,
        label=field.label,
        help_text=field.help_text,
        semantic_type=field.semantic_type,
        required=field.required,
        confidence=field.confidence,
        options=list(field.options),
        validations=list(field.validations),
        layout_hints=_field_layout_hints(field),
        renderer_hints=dict(field.renderer_hints),
        source_priority=[priority.value for priority in field.source_priority],
        source_conflicts=list(field.source_conflicts),
        lineage=list(field.lineage),
        source_field_ids=[field.id],
        provenance_anchor_ids=[anchor.anchor_id for anchor in field.evidence],
        runtime=runtime,
    )


def _synthesise_extraction_listeners(field) -> list[RuntimeListenerDefinition]:
    """Return zero or more RuntimeListenerDefinition objects inferred from extraction data.

    Every listener produced here MUST carry provenance="extraction" so the future
    Behavior Manager can identify and filter extraction-derived behaviors.
    """
    listeners: list[RuntimeListenerDefinition] = []

    if field.semantic_type == SemanticType.SIGNATURE_ATTESTATION:
        # Synthesise a listener that gates the submit action on attestation.
        # When the field emits signature.attested the form is considered ready to submit.
        listeners.append(
            RuntimeListenerDefinition(
                id=f"ext-sig-attested-{field.id}",
                label="Submit on attestation",
                event_name="signature.attested",
                event_source_node_id=field.id,
                event_source_node_type="field",
                actions=[
                    RuntimeActionDefinition(
                        id=f"ext-sig-attested-{field.id}-action-0",
                        kind="submit_form",
                        target=RuntimeActionTarget(node_type="form"),
                    )
                ],
                provenance="extraction",
            )
        )

    return listeners


def _field_layout_hints(field) -> dict[str, str]:
    layout = {"width": "full"}
    if field.semantic_type.value in {"checkbox", "radio", "select"}:
        layout["presentation"] = "choices"
    elif field.semantic_type.value == "statement":
        layout["presentation"] = "content"
    else:
        layout["presentation"] = "input"
    return layout


def _collect_anchor_ids(fields, groups) -> list[str]:
    anchor_ids: list[str] = []
    for field in fields:
        anchor_ids.extend(anchor.anchor_id for anchor in field.evidence)
    for group in groups:
        anchor_ids.extend(anchor.anchor_id for anchor in group.evidence)
    return list(dict.fromkeys(anchor_ids))


def _first_non_empty_snippet(evidence) -> str | None:
    for anchor in evidence:
        if anchor.snippet.strip():
            return anchor.snippet.strip()
    return None
