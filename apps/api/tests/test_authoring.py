from __future__ import annotations

from form_builder_api.models.api import ConversionRecord
from form_builder_api.models.canonical import (
    DocumentClass,
    FieldNode,
    FormDefinition,
    PageNode,
    ReviewStatus,
    SemanticType,
    SectionNode,
)
from form_builder_api.services.authoring import (
    _synthesise_extraction_listeners,
    build_authoring_project,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_field(semantic_type: SemanticType, field_id: str = "field-1") -> FieldNode:
    return FieldNode(
        id=field_id,
        stable_key=f"key-{field_id}",
        order_index=0,
        page_id="page-1",
        section_id="section-1",
        semantic_type=semantic_type,
        label="Test Field",
        required=False,
        confidence=0.9,
        evidence=[],
    )


def _make_minimal_conversion(fields: list[FieldNode]) -> ConversionRecord:
    section = SectionNode(
        id="section-1",
        order_index=0,
        title="Section",
        page_id="page-1",
        fields=fields,
    )
    page = PageNode(
        id="page-1",
        order_index=0,
        label="Page 1",
        sections=[section],
    )
    draft = FormDefinition(
        id="form-test",
        title="Test Form",
        document_class=DocumentClass.MIXED,
        review_status=ReviewStatus.REVIEWED,
        pages=[page],
    )
    return ConversionRecord(
        id="conv-test",
        filename="test.pdf",
        document_class=DocumentClass.MIXED,
        review_status=ReviewStatus.REVIEWED,
        confidence=0.9,
        draft=draft,
        extractor_path=["test"],
    )


# ---------------------------------------------------------------------------
# _synthesise_extraction_listeners unit tests
# ---------------------------------------------------------------------------


def test_synthesise_returns_empty_for_plain_text_field():
    field = _make_field(SemanticType.TEXT)
    listeners = _synthesise_extraction_listeners(field)
    assert listeners == []


def test_synthesise_returns_empty_for_radio_field():
    field = _make_field(SemanticType.RADIO)
    listeners = _synthesise_extraction_listeners(field)
    assert listeners == []


def test_synthesise_returns_empty_for_statement_field():
    field = _make_field(SemanticType.STATEMENT)
    listeners = _synthesise_extraction_listeners(field)
    assert listeners == []


def test_synthesise_signature_attestation_produces_one_listener():
    field = _make_field(SemanticType.SIGNATURE_ATTESTATION, field_id="field-sig-1")
    listeners = _synthesise_extraction_listeners(field)
    assert len(listeners) == 1


def test_synthesise_signature_attestation_provenance_is_extraction():
    field = _make_field(SemanticType.SIGNATURE_ATTESTATION, field_id="field-sig-2")
    listeners = _synthesise_extraction_listeners(field)
    assert all(listener.provenance == "extraction" for listener in listeners)


def test_synthesise_signature_attestation_event_name():
    field = _make_field(SemanticType.SIGNATURE_ATTESTATION, field_id="field-sig-3")
    listeners = _synthesise_extraction_listeners(field)
    assert listeners[0].event_name == "signature.attested"


def test_synthesise_signature_attestation_source_node_id_matches_field():
    field = _make_field(SemanticType.SIGNATURE_ATTESTATION, field_id="field-sig-4")
    listeners = _synthesise_extraction_listeners(field)
    assert listeners[0].event_source_node_id == "field-sig-4"


# ---------------------------------------------------------------------------
# build_authoring_project promotion path
# ---------------------------------------------------------------------------


def test_build_authoring_project_all_listeners_have_extraction_provenance():
    """Every listener synthesised during promotion carries provenance='extraction'."""
    sig_field = _make_field(SemanticType.SIGNATURE_ATTESTATION, field_id="field-sig-promo")
    conversion = _make_minimal_conversion([sig_field])

    result = build_authoring_project(conversion)

    all_listeners = []
    for step in result.document.steps:
        for section in step.sections:
            for field in section.fields:
                if field.runtime:
                    all_listeners.extend(field.runtime.listeners)
            for group in section.groups:
                for field in group.fields:
                    if field.runtime:
                        all_listeners.extend(field.runtime.listeners)

    assert len(all_listeners) >= 1, "Expected at least one synthesised listener from signature_attestation field"
    assert all(
        listener.provenance == "extraction" for listener in all_listeners
    ), "All synthesised listeners must carry provenance='extraction'"


def test_build_authoring_project_no_listeners_for_plain_fields():
    """Non-signature fields should not generate any listeners."""
    plain_field = _make_field(SemanticType.TEXT, field_id="field-text-promo")
    conversion = _make_minimal_conversion([plain_field])

    result = build_authoring_project(conversion)

    all_listeners = []
    for step in result.document.steps:
        for section in step.sections:
            for field in section.fields:
                if field.runtime:
                    all_listeners.extend(field.runtime.listeners)

    assert all_listeners == [], "Plain text fields should produce no synthesised listeners"
