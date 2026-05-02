from form_builder_api.models.canonical import (
    Coordinates,
    DocumentClass,
    EvidenceAnchor,
    FieldNode,
    GroupNode,
    ReviewStatus,
    SemanticType,
    SourcePriority,
)
from form_builder_api.services.classification import ClassificationResult
from form_builder_api.services.extraction import (
    _normalize_candidate_label_and_help_text,
    _split_long_group_label_and_help,
    _truncate_repeated_enumerated_prompt,
    _order_section_items,
    build_form_definition,
)
from form_builder_api.services.extraction_adapters import (
    ExtractedFieldCandidate,
    ExtractedPageRegion,
    ExtractedTextLine,
    ExtractionContext,
)


def _classification(document_class: DocumentClass) -> ClassificationResult:
    return ClassificationResult(
        document_class=document_class,
        extractor_path=["test-adapter"],
        confidence=0.91,
        notes=["test classification"],
        signals={
            "pageCount": 2,
            "containsXfa": document_class == DocumentClass.XFA_BACKED,
            "containsAcroform": document_class == DocumentClass.ACROFORM,
            "acroformFieldCount": 0,
            "textPageCount": 2,
            "imageOnlyPageCount": 0,
            "mixedPageModes": document_class == DocumentClass.MIXED,
            "detectedModes": ["text"],
            "sampleTextExcerpt": "Applicant information",
        },
    )


def test_build_form_definition_uses_acroform_candidates(monkeypatch):
    context = ExtractionContext(
        page_count=2,
        text_lines=[
            ExtractedTextLine(
                page_number=1,
                text="SECTION I - APPLICANT INFORMATION",
                confidence=0.8,
                bounds=Coordinates(page=1, x=30, y=80, width=160, height=18),
            ),
            ExtractedTextLine(
                page_number=2,
                text="Household Details",
                confidence=0.8,
                bounds=Coordinates(page=2, x=30, y=80, width=160, height=18),
            ),
        ],
        field_candidates=[
            ExtractedFieldCandidate(
                name="applicantName",
                label="Applicant Name",
                semantic_type=SemanticType.TEXT,
                page_number=1,
                confidence=0.96,
                source_priority=SourcePriority.ACROFORM,
                help_text="Enter your legal name.",
                source_coordinates=[Coordinates(page=1, x=30, y=118, width=240, height=18)],
            ),
            ExtractedFieldCandidate(
                name="filingRole",
                label="Filing Role",
                semantic_type=SemanticType.SELECT,
                page_number=2,
                confidence=0.94,
                source_priority=SourcePriority.ACROFORM,
                options=["Self", "Proxy"],
                source_coordinates=[Coordinates(page=2, x=30, y=118, width=120, height=18)],
            ),
        ],
        adapter_notes=["acroform_fields=2"],
    )
    monkeypatch.setattr(
        "form_builder_api.services.extraction.extract_document_context",
        lambda payload, classification: context,
    )

    draft = build_form_definition("sample.pdf", b"%PDF", _classification(DocumentClass.ACROFORM))

    assert len(draft.pages) == 2
    assert draft.pages[0].sections[0].title == "SECTION I - APPLICANT INFORMATION"
    applicant_field = next(field for field in draft.pages[0].sections[0].fields if field.label == "Applicant Name")
    assert applicant_field.help_text == "Enter your legal name."
    assert applicant_field.source_coordinates[0].x == 30
    assert draft.pages[1].sections[0].groups[0].label == "Filing Role"
    filing_role = draft.pages[1].sections[0].groups[0].fields[0]
    assert filing_role.semantic_type == SemanticType.SELECT
    assert filing_role.options[0].label == "Self"
    assert draft.metadata["acroformFieldCount"] == "2"


def test_build_form_definition_falls_back_to_text_statements(monkeypatch):
    context = ExtractionContext(
        page_count=1,
        text_lines=[
            ExtractedTextLine(
                page_number=1,
                text="Where can I get help filling out this form?",
                confidence=0.82,
                bounds=Coordinates(page=1, x=30, y=72, width=240, height=16),
            ),
            ExtractedTextLine(
                page_number=1,
                text="Call the help desk Monday through Friday.",
                confidence=0.76,
                bounds=Coordinates(page=1, x=30, y=92, width=260, height=16),
            ),
            ExtractedTextLine(
                page_number=1,
                text="Bring your insurance cards to your appointment.",
                confidence=0.7,
                bounds=Coordinates(page=1, x=30, y=112, width=280, height=16),
            ),
        ],
        adapter_notes=["fitz_text_lines=3"],
    )
    monkeypatch.setattr(
        "form_builder_api.services.extraction.extract_document_context",
        lambda payload, classification: context,
    )

    draft = build_form_definition("housing-support.pdf", b"%PDF", _classification(DocumentClass.BORN_DIGITAL))

    section = draft.pages[0].sections[0]

    assert len(section.groups) == 1
    assert section.groups[0].label == "Where can I get help filling out this form?"
    assert all(field.semantic_type == SemanticType.STATEMENT for field in section.groups[0].fields)
    assert any(issue.code == "ambiguous_field_type" for issue in draft.issues)


def test_build_form_definition_drops_leading_instruction_pages_for_fillable_docs(monkeypatch):
    context = ExtractionContext(
        page_count=2,
        text_lines=[
            ExtractedTextLine(
                page_number=1,
                text="INSTRUCTIONS FOR COMPLETING THIS FORM",
                confidence=0.8,
                bounds=Coordinates(page=1, x=30, y=72, width=260, height=18),
            ),
            ExtractedTextLine(
                page_number=1,
                text="Please read before you start.",
                confidence=0.76,
                bounds=Coordinates(page=1, x=30, y=96, width=220, height=16),
            ),
            ExtractedTextLine(
                page_number=1,
                text="Bring your supporting documents.",
                confidence=0.74,
                bounds=Coordinates(page=1, x=30, y=118, width=260, height=16),
            ),
            ExtractedTextLine(
                page_number=1,
                text="Mail the completed application to the address shown below.",
                confidence=0.74,
                bounds=Coordinates(page=1, x=30, y=140, width=320, height=16),
            ),
            ExtractedTextLine(
                page_number=1,
                text="Privacy Act information applies to this collection.",
                confidence=0.72,
                bounds=Coordinates(page=1, x=30, y=162, width=310, height=16),
            ),
            ExtractedTextLine(
                page_number=1,
                text="Paperwork Reduction Act notice.",
                confidence=0.72,
                bounds=Coordinates(page=1, x=30, y=184, width=220, height=16),
            ),
            ExtractedTextLine(
                page_number=1,
                text="If you need help, call the support line.",
                confidence=0.72,
                bounds=Coordinates(page=1, x=30, y=206, width=240, height=16),
            ),
            ExtractedTextLine(
                page_number=1,
                text="Keep a copy for your records.",
                confidence=0.72,
                bounds=Coordinates(page=1, x=30, y=228, width=180, height=16),
            ),
            ExtractedTextLine(
                page_number=2,
                text="SECTION I - APPLICANT INFORMATION",
                confidence=0.82,
                bounds=Coordinates(page=2, x=30, y=72, width=260, height=18),
            ),
        ],
        field_candidates=[
            ExtractedFieldCandidate(
                name="applicantName",
                label="Applicant Name",
                semantic_type=SemanticType.TEXT,
                page_number=2,
                confidence=0.95,
                source_priority=SourcePriority.ACROFORM,
                source_coordinates=[Coordinates(page=2, x=30, y=112, width=220, height=18)],
            ),
        ],
        adapter_notes=["acroform_fields=1", "fitz_text_lines=9"],
    )
    monkeypatch.setattr(
        "form_builder_api.services.extraction.extract_document_context",
        lambda payload, classification: context,
    )

    draft = build_form_definition("fillable.pdf", b"%PDF", _classification(DocumentClass.ACROFORM))

    assert len(draft.pages) == 1
    assert draft.pages[0].order_index == 1
    assert draft.pages[0].sections[0].fields[0].label == "Applicant Name"


def test_build_form_definition_keeps_instruction_only_pages_for_born_digital_docs(monkeypatch):
    context = ExtractionContext(
        page_count=1,
        text_lines=[
            ExtractedTextLine(
                page_number=1,
                text="INSTRUCTIONS FOR COMPLETING THIS FORM",
                confidence=0.8,
                bounds=Coordinates(page=1, x=30, y=72, width=260, height=18),
            ),
            ExtractedTextLine(
                page_number=1,
                text="Please read before you start.",
                confidence=0.76,
                bounds=Coordinates(page=1, x=30, y=96, width=220, height=16),
            ),
            ExtractedTextLine(
                page_number=1,
                text="Bring your supporting documents.",
                confidence=0.74,
                bounds=Coordinates(page=1, x=30, y=118, width=260, height=16),
            ),
        ],
        adapter_notes=["fitz_text_lines=3"],
    )
    monkeypatch.setattr(
        "form_builder_api.services.extraction.extract_document_context",
        lambda payload, classification: context,
    )

    draft = build_form_definition("instructions.pdf", b"%PDF", _classification(DocumentClass.BORN_DIGITAL))

    assert len(draft.pages) == 1
    assert draft.pages[0].order_index == 0
    assert draft.pages[0].sections[0].groups[0].label == "INSTRUCTIONS FOR COMPLETING THIS FORM"


def test_build_form_definition_strips_required_field_boilerplate_from_candidate_labels(monkeypatch):
    context = ExtractionContext(
        page_count=1,
        text_lines=[
            ExtractedTextLine(
                page_number=1,
                text="SECTION I - APPLICANT INFORMATION",
                confidence=0.82,
                bounds=Coordinates(page=1, x=30, y=72, width=260, height=18),
            ),
        ],
        field_candidates=[
            ExtractedFieldCandidate(
                name="firstName",
                label="SECTION 1 - VETERAN. 2. First Name*. *This is a required field",
                semantic_type=SemanticType.TEXT,
                page_number=1,
                confidence=0.95,
                source_priority=SourcePriority.ACROFORM,
                source_coordinates=[Coordinates(page=1, x=30, y=112, width=220, height=18)],
            ),
        ],
        adapter_notes=["acroform_fields=1"],
    )
    monkeypatch.setattr(
        "form_builder_api.services.extraction.extract_document_context",
        lambda payload, classification: context,
    )

    draft = build_form_definition("required-field.pdf", b"%PDF", _classification(DocumentClass.ACROFORM))

    field = draft.pages[0].sections[0].fields[0]
    assert field.label == "2. First Name*"
    assert "required field" not in field.label.lower()


def test_build_form_definition_strips_required_field_boilerplate_from_group_labels(monkeypatch):
    context = ExtractionContext(
        page_count=1,
        text_lines=[
            ExtractedTextLine(
                page_number=1,
                text="SECTION I - VETERAN",
                confidence=0.82,
                bounds=Coordinates(page=1, x=30, y=72, width=220, height=18),
            ),
            ExtractedTextLine(
                page_number=1,
                text="18. Date (MM/DD/YYYY)*",
                confidence=0.78,
                bounds=Coordinates(page=1, x=30, y=112, width=180, height=16),
            ),
        ],
        field_candidates=[
            ExtractedFieldCandidate(
                name="signatureDate",
                label="18. Date of Signature*. *This is a required field",
                semantic_type=SemanticType.TEXT,
                page_number=1,
                confidence=0.94,
                source_priority=SourcePriority.ACROFORM,
                source_coordinates=[Coordinates(page=1, x=220, y=112, width=140, height=18)],
            ),
        ],
        page_regions=[
            ExtractedPageRegion(
                id="region-1",
                page_number=1,
                bounds=Coordinates(page=1, x=20, y=100, width=360, height=32),
                kind="layout_region",
            )
        ],
        adapter_notes=["acroform_fields=1", "page_regions=1"],
    )
    monkeypatch.setattr(
        "form_builder_api.services.extraction.extract_document_context",
        lambda payload, classification: context,
    )

    draft = build_form_definition("required-group.pdf", b"%PDF", _classification(DocumentClass.ACROFORM))

    group = draft.pages[0].sections[0].groups[0]
    assert "required field" not in group.label.lower()
    assert "required field" not in group.fields[0].label.lower()


def test_build_form_definition_normalizes_line_counter_group_into_prompt_plus_line_labels(monkeypatch):
    context = ExtractionContext(
        page_count=1,
        text_lines=[
            ExtractedTextLine(
                page_number=1,
                text="SECTION V: CLAIM INFORMATION (Continued)",
                confidence=0.82,
                bounds=Coordinates(page=1, x=30, y=72, width=300, height=18),
            ),
        ],
        field_candidates=[
            ExtractedFieldCandidate(
                name="explainLine2",
                label="16. EXPLAIN HOW THE DISABILITY(IES) RELATES TO THE IN-SERVICE EVENT/EXPOSURE/INJURY. Line 2 of 15",
                semantic_type=SemanticType.TEXT,
                page_number=1,
                confidence=0.95,
                source_priority=SourcePriority.ACROFORM,
                source_coordinates=[Coordinates(page=1, x=30, y=112, width=220, height=18)],
            ),
            ExtractedFieldCandidate(
                name="explainLine3",
                label="16. EXPLAIN HOW THE DISABILITY(IES) RELATES TO THE IN-SERVICE EVENT/EXPOSURE/INJURY. Line 3 of 15",
                semantic_type=SemanticType.TEXT,
                page_number=1,
                confidence=0.95,
                source_priority=SourcePriority.ACROFORM,
                source_coordinates=[Coordinates(page=1, x=30, y=138, width=220, height=18)],
            ),
        ],
        page_regions=[
            ExtractedPageRegion(
                id="region-1",
                page_number=1,
                bounds=Coordinates(page=1, x=20, y=100, width=260, height=64),
                kind="layout_region",
            )
        ],
        adapter_notes=["acroform_fields=2", "page_regions=1"],
    )
    monkeypatch.setattr(
        "form_builder_api.services.extraction.extract_document_context",
        lambda payload, classification: context,
    )

    draft = build_form_definition("line-counter-group.pdf", b"%PDF", _classification(DocumentClass.ACROFORM))

    group = draft.pages[0].sections[0].groups[0]
    assert group.label == "16. EXPLAIN HOW THE DISABILITY(IES) RELATES TO THE IN-SERVICE EVENT/EXPOSURE/INJURY"
    assert [field.label for field in group.fields] == ["Line 2", "Line 3"]
    assert group.fields[0].renderer_hints["lineCounter"] == "2"
    assert group.fields[1].renderer_hints["lineCount"] == "15"


def test_normalize_candidate_label_and_help_text_moves_long_attestation_remainder_into_help_text():
    label, help_text = _normalize_candidate_label_and_help_text(
        (
            "I certify that the information provided in this form is correct and true to the best of my knowledge "
            "and belief. I understand that VA may request additional evidence to support my claim."
        ),
        "AcroForm field type /Btn",
        SemanticType.CHECKBOX,
    )
    assert label == "I certify that the information provided in this form is correct and true to the best of my knowledge and belief."
    assert help_text == "I understand that VA may request additional evidence to support my claim."


def test_normalize_candidate_label_and_help_text_moves_long_parenthetical_prompt_details_into_help_text():
    label, help_text = _normalize_candidate_label_and_help_text(
        (
            "13C. EFFECTIVE DATE(S) OF NEW ADDRESS "
            "(If your change of address is temporary, complete both the beginning and ending date of your temporary address) "
            "(If your change of address is permanent, please enter your effective date in the beginning date only)"
        ),
        "AcroForm field type /Tx",
        SemanticType.TEXT,
    )
    assert label == "13C. EFFECTIVE DATE(S) OF NEW ADDRESS"
    assert help_text == (
        "If your change of address is temporary, complete both the beginning and ending date of your temporary address; "
        "If your change of address is permanent, please enter your effective date in the beginning date only"
    )


def test_split_long_group_label_and_help_trims_question_tail_into_help():
    label, help_text = _split_long_group_label_and_help(
        "15B. DID YOU SERVE IN ANY OF THE FOLLOWING GULF WAR HAZARD LOCATIONS? Iraq; Kuwait; Saudi Arabia; Bahrain"
    )
    assert label == "15B. DID YOU SERVE IN ANY OF THE FOLLOWING GULF WAR HAZARD LOCATIONS?"
    assert help_text == "Iraq; Kuwait; Saudi Arabia; Bahrain"


def test_split_long_group_label_and_help_trims_note_tail_into_help():
    label, help_text = _split_long_group_label_and_help(
        "LIST THE CURRENT DISABILITY(IES) OR SYMPTOMS THAT YOU CLAIM ARE RELATED TO YOUR MILITARY SERVICE. "
        "NOTE: List your claimed conditions below."
    )
    assert label == "LIST THE CURRENT DISABILITY(IES) OR SYMPTOMS THAT YOU CLAIM ARE RELATED TO YOUR MILITARY SERVICE."
    assert help_text == "NOTE: List your claimed conditions below."


def test_truncate_repeated_enumerated_prompt_ignores_abbreviation_markers():
    trimmed = _truncate_repeated_enumerated_prompt(
        "17. LIST V. A. MEDICAL CENTER(S) (VAMC) AND DEPARTMENT OF DEFENSE (D O D) MILITARY TREATMENT FACILITIES "
        "(M T F) WHERE YOU RECEIVED TREATMENT AFTER DISCHARGE 17. LIST VA MEDICAL CENTER(S) (VAMC)"
    )
    assert trimmed == (
        "17. LIST V. A. MEDICAL CENTER(S) (VAMC) AND DEPARTMENT OF DEFENSE (D O D) MILITARY TREATMENT FACILITIES "
        "(M T F) WHERE YOU RECEIVED TREATMENT AFTER DISCHARGE"
    )


def test_build_form_definition_summarizes_statement_only_attestation_groups(monkeypatch):
    context = ExtractionContext(
        page_count=1,
        text_lines=[
            ExtractedTextLine(
                page_number=1,
                text="SECTION IX: CLAIM CERTIFICATION AND SIGNATURE",
                confidence=0.84,
                bounds=Coordinates(page=1, x=30, y=72, width=320, height=18),
            ),
            ExtractedTextLine(
                page_number=1,
                text="I certify that the information provided in this form is correct and true to the best of my knowledge and belief.",
                confidence=0.82,
                bounds=Coordinates(page=1, x=30, y=118, width=420, height=18),
            ),
            ExtractedTextLine(
                page_number=1,
                text="I understand that VA may request additional evidence to support my claim.",
                confidence=0.82,
                bounds=Coordinates(page=1, x=30, y=142, width=420, height=18),
            ),
        ],
        field_candidates=[],
        page_regions=[
            ExtractedPageRegion(
                id="region-1",
                page_number=1,
                bounds=Coordinates(page=1, x=24, y=110, width=440, height=58),
                kind="layout_region",
            )
        ],
        adapter_notes=["page_regions=1"],
    )
    monkeypatch.setattr(
        "form_builder_api.services.extraction.extract_document_context",
        lambda payload, classification: context,
    )

    draft = build_form_definition("statement-only-group.pdf", b"%PDF", _classification(DocumentClass.BORN_DIGITAL))

    group = draft.pages[0].sections[0].groups[0]
    assert group.label == "I certify that the information provided in this form is correct and true to the best of my knowledge and belief."
    assert len(group.fields) == 1
    assert group.fields[0].label == group.label
    assert group.fields[0].help_text == (
        "I certify that the information provided in this form is correct and true to the best of my knowledge and belief. "
        "I understand that VA may request additional evidence to support my claim."
    )
    assert group.fields[0].renderer_hints["statementSummary"] == "true"


def test_build_form_definition_shortens_long_mixed_radio_group_prompt(monkeypatch):
    context = ExtractionContext(
        page_count=1,
        text_lines=[
            ExtractedTextLine(
                page_number=1,
                text="SECTION IV: EXPOSURE INFORMATION",
                confidence=0.84,
                bounds=Coordinates(page=1, x=30, y=72, width=280, height=18),
            ),
            ExtractedTextLine(
                page_number=1,
                text="WHEN DID YOU SERVE IN THESE LOCATIONS? (MM-YYYY)",
                confidence=0.82,
                bounds=Coordinates(page=1, x=30, y=156, width=260, height=18),
            ),
        ],
        field_candidates=[
            ExtractedFieldCandidate(
                name="hazardLocations",
                label="15B. DID YOU SERVE IN ANY OF THE FOLLOWING GULF WAR HAZARD LOCATIONS? Iraq; Kuwait; Saudi Arabia; Bahrain",
                semantic_type=SemanticType.RADIO,
                page_number=1,
                confidence=0.94,
                source_priority=SourcePriority.ACROFORM,
                options=["Yes", "No"],
                notes=["AcroForm field type /Btn"],
                source_coordinates=[Coordinates(page=1, x=30, y=112, width=260, height=18)],
            ),
            ExtractedFieldCandidate(
                name="fromDate",
                label="15. B. From Date",
                semantic_type=SemanticType.TEXT,
                page_number=1,
                confidence=0.94,
                source_priority=SourcePriority.ACROFORM,
                notes=["Enter 2 digit month"],
                source_coordinates=[Coordinates(page=1, x=30, y=188, width=120, height=18)],
            ),
        ],
        page_regions=[
            ExtractedPageRegion(
                id="region-1",
                page_number=1,
                bounds=Coordinates(page=1, x=24, y=104, width=320, height=108),
                kind="layout_region",
            )
        ],
        adapter_notes=["acroform_fields=2", "page_regions=1"],
    )
    monkeypatch.setattr(
        "form_builder_api.services.extraction.extract_document_context",
        lambda payload, classification: context,
    )

    draft = build_form_definition("mixed-radio-group.pdf", b"%PDF", _classification(DocumentClass.ACROFORM))

    group = draft.pages[0].sections[0].groups[0]
    assert group.label == "15B. DID YOU SERVE IN ANY OF THE FOLLOWING GULF WAR HAZARD LOCATIONS?"
    assert group.fields[0].label == group.label
    assert group.fields[0].help_text == "Iraq; Kuwait; Saudi Arabia; Bahrain; AcroForm field type /Btn"


def test_build_form_definition_only_applies_group_help_to_duplicate_date_prompt_fields(monkeypatch):
    context = ExtractionContext(
        page_count=1,
        text_lines=[
            ExtractedTextLine(
                page_number=1,
                text="SECTION II: CHANGE OF ADDRESS",
                confidence=0.84,
                bounds=Coordinates(page=1, x=30, y=72, width=260, height=18),
            ),
        ],
        field_candidates=[
            ExtractedFieldCandidate(
                name="datePrompt",
                label=(
                    "13C. EFFECTIVE DATE(S) OF NEW ADDRESS "
                    "(If your change of address is temporary, complete both the beginning and ending date of your temporary address) "
                    "(If your change of address is permanent, please enter your effective date in the beginning date only)"
                ),
                semantic_type=SemanticType.TEXT,
                page_number=1,
                confidence=0.95,
                source_priority=SourcePriority.ACROFORM,
                notes=["AcroForm field type /Tx"],
                source_coordinates=[Coordinates(page=1, x=30, y=112, width=280, height=18)],
            ),
            ExtractedFieldCandidate(
                name="beginMonth",
                label="13. C. Beginning Date",
                semantic_type=SemanticType.TEXT,
                page_number=1,
                confidence=0.95,
                source_priority=SourcePriority.ACROFORM,
                notes=["Enter 2 digit month"],
                source_coordinates=[Coordinates(page=1, x=30, y=144, width=120, height=18)],
            ),
        ],
        page_regions=[
            ExtractedPageRegion(
                id="region-1",
                page_number=1,
                bounds=Coordinates(page=1, x=24, y=104, width=320, height=66),
                kind="layout_region",
            )
        ],
        adapter_notes=["acroform_fields=2", "page_regions=1"],
    )
    monkeypatch.setattr(
        "form_builder_api.services.extraction.extract_document_context",
        lambda payload, classification: context,
    )

    draft = build_form_definition("date-guidance-group.pdf", b"%PDF", _classification(DocumentClass.ACROFORM))

    group = draft.pages[0].sections[0].groups[0]
    assert group.label == "13C. EFFECTIVE DATE(S) OF NEW ADDRESS"
    assert group.fields[0].label == "13C. EFFECTIVE DATE(S) OF NEW ADDRESS"
    assert "temporary" in (group.fields[0].help_text or "").lower()
    assert group.fields[1].label == "13. C. Beginning Date"
    assert group.fields[1].help_text == "Enter 2 digit month"


def test_build_form_definition_layers_statements_around_widget_fields(monkeypatch):
    context = ExtractionContext(
        page_count=1,
        text_lines=[
            ExtractedTextLine(
                page_number=1,
                text="SECTION I - GENERAL INFORMATION",
                confidence=0.86,
                bounds=Coordinates(page=1, x=30, y=90, width=240, height=18),
            ),
            ExtractedTextLine(
                page_number=1,
                text="Federal law provides criminal penalties for concealing a material fact.",
                confidence=0.8,
                bounds=Coordinates(page=1, x=30, y=126, width=420, height=18),
            ),
            ExtractedTextLine(
                page_number=1,
                text="1. A. VETERAN'S NAME (Last, First, Middle Name).",
                confidence=0.82,
                bounds=Coordinates(page=1, x=30, y=204, width=276, height=18),
            ),
        ],
        field_candidates=[
            ExtractedFieldCandidate(
                name="F[0].P4[0].LastFirstMiddle[0]",
                label="1. A. VETERAN'S NAME (Last, First, Middle Name)",
                semantic_type=SemanticType.TEXT,
                page_number=1,
                confidence=0.96,
                source_priority=SourcePriority.ACROFORM,
                help_text="Enter your full legal name.",
                source_coordinates=[Coordinates(page=1, x=30, y=220, width=276, height=12)],
            ),
        ],
        adapter_notes=["acroform_fields=1", "fitz_text_lines=3"],
    )
    monkeypatch.setattr(
        "form_builder_api.services.extraction.extract_document_context",
        lambda payload, classification: context,
    )

    draft = build_form_definition("va-form.pdf", b"%PDF", _classification(DocumentClass.ACROFORM))

    fields = draft.pages[0].sections[0].fields
    labels = [field.label for field in fields]

    assert draft.pages[0].sections[0].title == "SECTION I - GENERAL INFORMATION"
    assert "Federal law provides criminal penalties for concealing a material fact." in labels
    assert labels.count("1. A. VETERAN'S NAME (Last, First, Middle Name)") == 1
    assert next(field for field in fields if field.label == "1. A. VETERAN'S NAME (Last, First, Middle Name)").semantic_type == SemanticType.TEXT


def test_build_form_definition_orders_checkbox_groups_by_label_anchor(monkeypatch):
    context = ExtractionContext(
        page_count=1,
        text_lines=[
            ExtractedTextLine(
                page_number=1,
                text="SECTION I - GENERAL INFORMATION",
                confidence=0.9,
                bounds=Coordinates(page=1, x=30, y=80, width=240, height=18),
            ),
        ],
        field_candidates=[
            ExtractedFieldCandidate(
                name="sex",
                label="3. SEX",
                semantic_type=SemanticType.RADIO,
                page_number=1,
                confidence=0.94,
                source_priority=SourcePriority.ACROFORM,
                options=["Male", "Female"],
                source_coordinates=[Coordinates(page=1, x=32, y=228, width=10, height=10)],
                label_bounds=Coordinates(page=1, x=30, y=216, width=48, height=12),
            ),
            ExtractedFieldCandidate(
                name="race",
                label="4. WHAT IS YOUR RACE / ETHNICITY?",
                semantic_type=SemanticType.CHECKBOX,
                page_number=1,
                confidence=0.94,
                source_priority=SourcePriority.ACROFORM,
                options=["Asian", "Black"],
                source_coordinates=[Coordinates(page=1, x=88, y=228, width=10, height=10)],
                label_bounds=Coordinates(page=1, x=86, y=216, width=180, height=12),
            ),
        ],
        adapter_notes=["acroform_fields=2"],
    )
    monkeypatch.setattr(
        "form_builder_api.services.extraction.extract_document_context",
        lambda payload, classification: context,
    )

    draft = build_form_definition("ordering.pdf", b"%PDF", _classification(DocumentClass.ACROFORM))

    labels = [group.label for group in draft.pages[0].sections[0].groups]
    assert labels == ["3. SEX", "4. WHAT IS YOUR RACE / ETHNICITY?"]

    sex_field = draft.pages[0].sections[0].groups[0].fields[0]
    assert len(sex_field.options) == 2
    assert sex_field.options[0].evidence[0].bounds is not None
    assert sex_field.options[0].evidence[0].bounds.x == 32


def test_build_form_definition_merges_adjacent_partial_groups_with_same_prefix(monkeypatch):
    context = ExtractionContext(
        page_count=1,
        text_lines=[
            ExtractedTextLine(
                page_number=1,
                text="SECTION II - MILITARY SERVICE INFORMATION",
                confidence=0.86,
                bounds=Coordinates(page=1, x=30, y=70, width=300, height=16),
            ),
            ExtractedTextLine(
                page_number=1,
                text="B. DID YOU SERVE IN ANY OF THE FOLLOWING GULF WAR",
                confidence=0.84,
                bounds=Coordinates(page=1, x=36, y=160, width=220, height=16),
            ),
            ExtractedTextLine(
                page_number=1,
                text="HAZARD LOCATIONS?",
                confidence=0.84,
                bounds=Coordinates(page=1, x=36, y=172, width=160, height=16),
            ),
        ],
        field_candidates=[
            ExtractedFieldCandidate(
                name="gulfWar",
                label="B. DID YOU SERVE IN ANY OF THE FOLLOWING GULF WAR HAZARD LOCATIONS?",
                semantic_type=SemanticType.RADIO,
                page_number=1,
                confidence=0.9,
                source_priority=SourcePriority.ACROFORM,
                options=["YES", "NO"],
                source_coordinates=[
                    Coordinates(page=1, x=246, y=184, width=10, height=10),
                    Coordinates(page=1, x=270, y=184, width=10, height=10),
                ],
                label_bounds=Coordinates(page=1, x=36, y=160, width=260, height=28),
            ),
        ],
        page_regions=[
            ExtractedPageRegion(
                id="region-1-0",
                page_number=1,
                bounds=Coordinates(page=1, x=30, y=154, width=258, height=24),
                notes=["Recovered from table/grid line geometry."],
            ),
            ExtractedPageRegion(
                id="region-1-1",
                page_number=1,
                bounds=Coordinates(page=1, x=30, y=178, width=258, height=24),
                notes=["Recovered from table/grid line geometry."],
            ),
        ],
        adapter_notes=["page_regions=2"],
    )
    monkeypatch.setattr(
        "form_builder_api.services.extraction.extract_document_context",
        lambda payload, classification: context,
    )

    draft = build_form_definition("partial-groups.pdf", b"%PDF", _classification(DocumentClass.ACROFORM))

    groups = draft.pages[0].sections[0].groups
    assert len(groups) == 1
    assert groups[0].fields[0].semantic_type == SemanticType.RADIO or any(
        field.semantic_type == SemanticType.RADIO for field in groups[0].fields
    )


def test_build_form_definition_uses_layout_regions_to_group_boxed_content(monkeypatch):
    context = ExtractionContext(
        page_count=1,
        text_lines=[
            ExtractedTextLine(
                page_number=1,
                text="SECTION II - MILITARY SERVICE INFORMATION",
                confidence=0.86,
                bounds=Coordinates(page=1, x=30, y=70, width=300, height=16),
            ),
            ExtractedTextLine(
                page_number=1,
                text="3A. DID YOU SERVE IN A TEST LOCATION?",
                confidence=0.84,
                bounds=Coordinates(page=1, x=36, y=92, width=188, height=16),
            ),
            ExtractedTextLine(
                page_number=1,
                text="WHEN DID YOU SERVE IN THIS LOCATION?",
                confidence=0.8,
                bounds=Coordinates(page=1, x=36, y=116, width=196, height=16),
            ),
            ExtractedTextLine(
                page_number=1,
                text="FROM",
                confidence=0.78,
                bounds=Coordinates(page=1, x=36, y=140, width=40, height=14),
            ),
            ExtractedTextLine(
                page_number=1,
                text="TO",
                confidence=0.78,
                bounds=Coordinates(page=1, x=126, y=140, width=24, height=14),
            ),
        ],
        field_candidates=[
            ExtractedFieldCandidate(
                name="F[0].P5[0].RadioButtonList",
                label="Location list",
                semantic_type=SemanticType.RADIO,
                page_number=1,
                confidence=0.91,
                source_priority=SourcePriority.ACROFORM,
                options=["Yes", "No"],
                source_coordinates=[
                    Coordinates(page=1, x=246, y=92, width=10, height=10),
                    Coordinates(page=1, x=270, y=92, width=10, height=10),
                ],
            ),
            ExtractedFieldCandidate(
                name="fromDate",
                label="FROM",
                semantic_type=SemanticType.TEXT,
                page_number=1,
                confidence=0.84,
                source_priority=SourcePriority.ACROFORM,
                source_coordinates=[Coordinates(page=1, x=36, y=156, width=72, height=12)],
            ),
            ExtractedFieldCandidate(
                name="toDate",
                label="TO",
                semantic_type=SemanticType.TEXT,
                page_number=1,
                confidence=0.84,
                source_priority=SourcePriority.ACROFORM,
                source_coordinates=[Coordinates(page=1, x=126, y=156, width=72, height=12)],
            ),
        ],
        page_regions=[
            ExtractedPageRegion(
                id="region-1-0",
                page_number=1,
                bounds=Coordinates(page=1, x=30, y=86, width=258, height=88),
                notes=["Recovered from table/grid line geometry."],
            )
        ],
        adapter_notes=["page_regions=1"],
    )
    monkeypatch.setattr(
        "form_builder_api.services.extraction.extract_document_context",
        lambda payload, classification: context,
    )

    draft = build_form_definition("boxed-form.pdf", b"%PDF", _classification(DocumentClass.ACROFORM))

    section = draft.pages[0].sections[0]
    assert len(section.groups) == 1
    region_group = section.groups[0]
    assert region_group.label == "3A. DID YOU SERVE IN A TEST LOCATION?"
    assert region_group.renderer_hints["groupType"] == "layout_region"
    assert region_group.fields[0].label == "3A. DID YOU SERVE IN A TEST LOCATION?"
    assert any(field.label == "WHEN DID YOU SERVE IN THIS LOCATION?" for field in region_group.fields)
    assert any(field.label == "FROM" for field in region_group.fields)
    assert any(field.label == "TO" for field in region_group.fields)


def test_build_form_definition_splits_multiple_question_rows_within_one_region(monkeypatch):
    context = ExtractionContext(
        page_count=1,
        text_lines=[
            ExtractedTextLine(
                page_number=1,
                text="SECTION II - MILITARY SERVICE INFORMATION",
                confidence=0.86,
                bounds=Coordinates(page=1, x=30, y=70, width=300, height=16),
            ),
            ExtractedTextLine(
                page_number=1,
                text="A. DID YOU SERVE IN A TEST LOCATION?",
                confidence=0.84,
                bounds=Coordinates(page=1, x=36, y=92, width=220, height=16),
            ),
            ExtractedTextLine(
                page_number=1,
                text="B. DID YOU SERVE IN A SECOND LOCATION?",
                confidence=0.84,
                bounds=Coordinates(page=1, x=36, y=156, width=236, height=16),
            ),
        ],
        field_candidates=[
            ExtractedFieldCandidate(
                name="rowOne",
                label="Question row one",
                semantic_type=SemanticType.RADIO,
                page_number=1,
                confidence=0.9,
                source_priority=SourcePriority.ACROFORM,
                options=["Yes", "No"],
                source_coordinates=[
                    Coordinates(page=1, x=246, y=92, width=10, height=10),
                    Coordinates(page=1, x=270, y=92, width=10, height=10),
                ],
            ),
            ExtractedFieldCandidate(
                name="rowTwo",
                label="Question row two",
                semantic_type=SemanticType.RADIO,
                page_number=1,
                confidence=0.9,
                source_priority=SourcePriority.ACROFORM,
                options=["Yes", "No"],
                source_coordinates=[
                    Coordinates(page=1, x=246, y=156, width=10, height=10),
                    Coordinates(page=1, x=270, y=156, width=10, height=10),
                ],
            ),
        ],
        page_regions=[
            ExtractedPageRegion(
                id="region-1-0",
                page_number=1,
                bounds=Coordinates(page=1, x=30, y=86, width=258, height=96),
                notes=["Recovered from table/grid line geometry."],
            )
        ],
        adapter_notes=["page_regions=1"],
    )
    monkeypatch.setattr(
        "form_builder_api.services.extraction.extract_document_context",
        lambda payload, classification: context,
    )

    draft = build_form_definition("multi-row.pdf", b"%PDF", _classification(DocumentClass.ACROFORM))

    section = draft.pages[0].sections[0]
    labels = [group.label for group in section.groups]
    assert "A. DID YOU SERVE IN A TEST LOCATION?" in labels
    assert "B. DID YOU SERVE IN A SECOND LOCATION?" in labels
    assert len(section.groups) == 2


def test_build_form_definition_normalizes_income_matrix_rows(monkeypatch):
    context = ExtractionContext(
        page_count=1,
        text_lines=[
            ExtractedTextLine(
                page_number=1,
                text="SECTION VII - PREVIOUS CALENDAR YEAR GROSS ANNUAL INCOME",
                confidence=0.86,
                bounds=Coordinates(page=1, x=30, y=70, width=320, height=16),
            ),
            ExtractedTextLine(
                page_number=1,
                text="1. GROSS ANNUAL INCOME FROM EMPLOYMENT (wages, bonuses, tips,",
                confidence=0.84,
                bounds=Coordinates(page=1, x=36, y=92, width=320, height=16),
            ),
            ExtractedTextLine(
                page_number=1,
                text="etc.) EXCLUDING INCOME FROM YOUR FARM, RANCH, PROPERTY OR",
                confidence=0.84,
                bounds=Coordinates(page=1, x=36, y=108, width=320, height=16),
            ),
            ExtractedTextLine(
                page_number=1,
                text="BUSINESS",
                confidence=0.84,
                bounds=Coordinates(page=1, x=36, y=124, width=96, height=16),
            ),
        ],
        field_candidates=[
            ExtractedFieldCandidate(
                name="veteranGrossIncome",
                label="1. GROSS ANNUAL INCOME FROM EMPLOYMENT (wages, bonuses, tips, etc.) EXCLUDING INCOME FROM YOUR FARM, RANCH, PROPERTY OR BUSINESS",
                semantic_type=SemanticType.TEXT,
                page_number=1,
                confidence=0.92,
                source_priority=SourcePriority.ACROFORM,
                source_coordinates=[Coordinates(page=1, x=36, y=144, width=220, height=16)],
            ),
            ExtractedFieldCandidate(
                name="childGrossIncome",
                label="1. CHILD 1 GROSS ANNUAL INCOME",
                semantic_type=SemanticType.TEXT,
                page_number=1,
                confidence=0.92,
                source_priority=SourcePriority.ACROFORM,
                source_coordinates=[Coordinates(page=1, x=320, y=144, width=140, height=16)],
            ),
            ExtractedFieldCandidate(
                name="spouseGrossIncome",
                label="1. SPOUSE GROSS ANNUAL INCOME",
                semantic_type=SemanticType.TEXT,
                page_number=1,
                confidence=0.92,
                source_priority=SourcePriority.ACROFORM,
                source_coordinates=[Coordinates(page=1, x=500, y=144, width=140, height=16)],
            ),
        ],
        page_regions=[
            ExtractedPageRegion(
                id="region-1-0",
                page_number=1,
                bounds=Coordinates(page=1, x=30, y=86, width=620, height=84),
                notes=["Recovered from table/grid line geometry."],
            )
        ],
        adapter_notes=["page_regions=1"],
    )
    monkeypatch.setattr(
        "form_builder_api.services.extraction.extract_document_context",
        lambda payload, classification: context,
    )

    draft = build_form_definition("income-matrix.pdf", b"%PDF", _classification(DocumentClass.ACROFORM))

    region_group = draft.pages[0].sections[0].groups[0]
    assert region_group.label == (
        "1. GROSS ANNUAL INCOME FROM EMPLOYMENT (wages, bonuses, tips, etc.) "
        "EXCLUDING INCOME FROM YOUR FARM, RANCH, PROPERTY OR BUSINESS"
    )
    assert [field.label for field in region_group.fields] == ["Veteran", "Child 1", "Spouse"]
    assert all(field.semantic_type == SemanticType.TEXT for field in region_group.fields)
    assert region_group.renderer_hints["rowPresentation"] == "matrix"


def test_build_form_definition_normalizes_prompt_plus_amount_group(monkeypatch):
    context = ExtractionContext(
        page_count=1,
        text_lines=[
            ExtractedTextLine(
                page_number=1,
                text="SECTION VIII - PREVIOUS CALENDAR YEAR DEDUCTIBLE EXPENSES",
                confidence=0.86,
                bounds=Coordinates(page=1, x=30, y=70, width=320, height=16),
            ),
            ExtractedTextLine(
                page_number=1,
                text="1. TOTAL NON-REIMBURSED MEDICAL EXPENSES PAID BY YOU OR YOUR SPOUSE",
                confidence=0.84,
                bounds=Coordinates(page=1, x=36, y=92, width=360, height=16),
            ),
            ExtractedTextLine(
                page_number=1,
                text="(e.g., payments for doctors, dentists, medications)",
                confidence=0.84,
                bounds=Coordinates(page=1, x=36, y=108, width=280, height=16),
            ),
        ],
        field_candidates=[
            ExtractedFieldCandidate(
                name="medicalExpenses",
                label="1. TOTAL NON-REIMBURSED MEDICAL EXPENSES PAID BY YOU OR YOUR SPOUSE",
                semantic_type=SemanticType.TEXT,
                page_number=1,
                confidence=0.92,
                source_priority=SourcePriority.ACROFORM,
                source_coordinates=[Coordinates(page=1, x=420, y=100, width=140, height=16)],
            ),
        ],
        page_regions=[
            ExtractedPageRegion(
                id="region-1-0",
                page_number=1,
                bounds=Coordinates(page=1, x=30, y=86, width=540, height=44),
                notes=["Recovered from table/grid line geometry."],
            )
        ],
        adapter_notes=["page_regions=1"],
    )
    monkeypatch.setattr(
        "form_builder_api.services.extraction.extract_document_context",
        lambda payload, classification: context,
    )

    draft = build_form_definition("expense-row.pdf", b"%PDF", _classification(DocumentClass.ACROFORM))

    region_group = draft.pages[0].sections[0].groups[0]
    assert region_group.label == (
        "1. TOTAL NON-REIMBURSED MEDICAL EXPENSES PAID BY YOU OR YOUR SPOUSE "
        "(e.g., payments for doctors, dentists, medications)"
    )
    assert [field.label for field in region_group.fields] == ["Amount"]
    assert region_group.fields[0].help_text == "e.g., payments for doctors, dentists, medications"
    assert region_group.fields[0].renderer_hints["promptValuePair"] == "true"


def test_build_form_definition_normalizes_company_phone_prompt_value_group(monkeypatch):
    context = ExtractionContext(
        page_count=1,
        text_lines=[
            ExtractedTextLine(
                page_number=1,
                text="SECTION V - EMPLOYMENT INFORMATION",
                confidence=0.86,
                bounds=Coordinates(page=1, x=30, y=70, width=280, height=16),
            ),
            ExtractedTextLine(
                page_number=1,
                text="1E. COMPANY PHONE NUMBER",
                confidence=0.84,
                bounds=Coordinates(page=1, x=36, y=92, width=180, height=16),
            ),
            ExtractedTextLine(
                page_number=1,
                text="(Complete if employed or retired) (Include area code)",
                confidence=0.84,
                bounds=Coordinates(page=1, x=36, y=108, width=260, height=16),
            ),
        ],
        field_candidates=[
            ExtractedFieldCandidate(
                name="companyPhone",
                label="Home Phone Number",
                semantic_type=SemanticType.TEXT,
                page_number=1,
                confidence=0.92,
                source_priority=SourcePriority.ACROFORM,
                source_coordinates=[Coordinates(page=1, x=320, y=100, width=140, height=16)],
            ),
        ],
        page_regions=[
            ExtractedPageRegion(
                id="region-1-0",
                page_number=1,
                bounds=Coordinates(page=1, x=30, y=86, width=440, height=44),
                notes=["Recovered from table/grid line geometry."],
            )
        ],
        adapter_notes=["page_regions=1"],
    )
    monkeypatch.setattr(
        "form_builder_api.services.extraction.extract_document_context",
        lambda payload, classification: context,
    )

    draft = build_form_definition("company-phone.pdf", b"%PDF", _classification(DocumentClass.ACROFORM))

    region_group = draft.pages[0].sections[0].groups[0]
    assert region_group.label == "1E. COMPANY PHONE NUMBER (Complete if employed or retired) (Include area code)"
    assert [field.label for field in region_group.fields] == ["Company Phone Number"]
    assert region_group.fields[0].help_text == "Complete if employed or retired; Include area code"
    assert region_group.fields[0].renderer_hints["promptValuePair"] == "true"


def test_build_form_definition_merges_prompt_fragments_into_region_group_label(monkeypatch):
    context = ExtractionContext(
        page_count=1,
        text_lines=[
            ExtractedTextLine(
                page_number=1,
                text="SECTION I - GENERAL INFORMATION",
                confidence=0.86,
                bounds=Coordinates(page=1, x=30, y=70, width=300, height=16),
            ),
            ExtractedTextLine(
                page_number=1,
                text="16. WOULD YOU LIKE FOR VA TO CONTACT YOU TO SCHEDULE YOUR FIRST",
                confidence=0.84,
                bounds=Coordinates(page=1, x=36, y=92, width=300, height=16),
            ),
            ExtractedTextLine(
                page_number=1,
                text="APPOINTMENT?",
                confidence=0.84,
                bounds=Coordinates(page=1, x=36, y=108, width=112, height=16),
            ),
        ],
        field_candidates=[
            ExtractedFieldCandidate(
                name="scheduleAppointment",
                label="16. WOULD YOU LIKE FOR VA TO CONTACT YOU TO SCHEDULE YOUR FIRST",
                semantic_type=SemanticType.RADIO,
                page_number=1,
                confidence=0.9,
                source_priority=SourcePriority.ACROFORM,
                options=["YES", "NO"],
                source_coordinates=[
                    Coordinates(page=1, x=246, y=120, width=10, height=10),
                    Coordinates(page=1, x=270, y=120, width=10, height=10),
                ],
                label_bounds=Coordinates(page=1, x=36, y=92, width=300, height=32),
            )
        ],
        page_regions=[
            ExtractedPageRegion(
                id="region-1-0",
                page_number=1,
                bounds=Coordinates(page=1, x=30, y=86, width=258, height=48),
                notes=["Recovered from table/grid line geometry."],
            )
        ],
        adapter_notes=["page_regions=1"],
    )
    monkeypatch.setattr(
        "form_builder_api.services.extraction.extract_document_context",
        lambda payload, classification: context,
    )

    draft = build_form_definition("prompt-fragments.pdf", b"%PDF", _classification(DocumentClass.ACROFORM))

    region_group = draft.pages[0].sections[0].groups[0]
    assert region_group.label == "16. WOULD YOU LIKE FOR VA TO CONTACT YOU TO SCHEDULE YOUR FIRST APPOINTMENT?"
    assert region_group.fields[0].label == region_group.label
    assert all(field.label != "APPOINTMENT?" for field in region_group.fields)


def test_build_form_definition_merges_continuation_statements_into_region_group_label(monkeypatch):
    context = ExtractionContext(
        page_count=1,
        text_lines=[
            ExtractedTextLine(
                page_number=1,
                text="SECTION II - MILITARY SERVICE INFORMATION",
                confidence=0.86,
                bounds=Coordinates(page=1, x=30, y=70, width=300, height=16),
            ),
            ExtractedTextLine(
                page_number=1,
                text="B. DID YOU SERVE IN ANY OF THE FOLLOWING GULF WAR",
                confidence=0.84,
                bounds=Coordinates(page=1, x=36, y=156, width=210, height=16),
            ),
            ExtractedTextLine(
                page_number=1,
                text="HAZARD LOCATIONS? (Iraq, Kuwait, Saudi Arabia, Bahrain,",
                confidence=0.84,
                bounds=Coordinates(page=1, x=36, y=172, width=260, height=16),
            ),
            ExtractedTextLine(
                page_number=1,
                text="Djibouti, Uzbekistan, the Gulf of Aden, the Gulf of Oman, the Persian Gulf.)",
                confidence=0.84,
                bounds=Coordinates(page=1, x=36, y=196, width=300, height=16),
            ),
        ],
        field_candidates=[
            ExtractedFieldCandidate(
                name="gulfWarLocations",
                label="B. DID YOU SERVE IN ANY OF THE FOLLOWING GULF WAR HAZARD LOCATIONS? (Iraq, Kuwait, Saudi Arabia, Bahrain, Djibouti, Uzbekistan, the Gulf of Aden, the Gulf of Oman,",
                semantic_type=SemanticType.RADIO,
                page_number=1,
                confidence=0.9,
                source_priority=SourcePriority.ACROFORM,
                options=["YES", "NO"],
                source_coordinates=[
                    Coordinates(page=1, x=246, y=208, width=10, height=10),
                    Coordinates(page=1, x=270, y=208, width=10, height=10),
                ],
                label_bounds=Coordinates(page=1, x=36, y=156, width=300, height=56),
            )
        ],
        page_regions=[
            ExtractedPageRegion(
                id="region-1-0",
                page_number=1,
                bounds=Coordinates(page=1, x=30, y=150, width=258, height=72),
                notes=["Recovered from table/grid line geometry."],
            )
        ],
        adapter_notes=["page_regions=1"],
    )
    monkeypatch.setattr(
        "form_builder_api.services.extraction.extract_document_context",
        lambda payload, classification: context,
    )

    draft = build_form_definition("continuation-fragments.pdf", b"%PDF", _classification(DocumentClass.ACROFORM))

    region_group = draft.pages[0].sections[0].groups[0]
    assert "the Persian Gulf." in region_group.label
    assert any(
        field.semantic_type == SemanticType.RADIO and field.label == region_group.label
        for field in region_group.fields
    )
    assert all(field.semantic_type != SemanticType.STATEMENT for field in region_group.fields)


def test_build_form_definition_trims_help_and_url_spillover_from_group_label(monkeypatch):
    context = ExtractionContext(
        page_count=1,
        text_lines=[
            ExtractedTextLine(
                page_number=1,
                text="3E. HAVE YOU BEEN EXPOSED TO ANY OF THE FOLLOWING? (Check all that apply).",
                confidence=0.84,
                bounds=Coordinates(page=1, x=36, y=208, width=260, height=16),
            ),
            ExtractedTextLine(
                page_number=1,
                text="Veterans can locate additional military exposure categories on V.A.'s Public Health website at: https://www.publichealth.va.gov/exposures/",
                confidence=0.84,
                bounds=Coordinates(page=1, x=36, y=224, width=340, height=16),
            ),
        ],
        field_candidates=[
            ExtractedFieldCandidate(
                name="exposureList",
                label="3E. HAVE YOU BEEN EXPOSED TO ANY OF THE FOLLOWING? (Check all that apply).",
                semantic_type=SemanticType.CHECKBOX,
                page_number=1,
                confidence=0.9,
                source_priority=SourcePriority.ACROFORM,
                options=["Asbestos", "Burn pits"],
                source_coordinates=[Coordinates(page=1, x=294, y=241, width=10, height=10)],
                label_bounds=Coordinates(page=1, x=36, y=208, width=340, height=32),
            )
        ],
        page_regions=[
            ExtractedPageRegion(
                id="region-1-0",
                page_number=1,
                bounds=Coordinates(page=1, x=30, y=202, width=360, height=48),
                notes=["Recovered from table/grid line geometry."],
            )
        ],
        adapter_notes=["page_regions=1"],
    )
    monkeypatch.setattr(
        "form_builder_api.services.extraction.extract_document_context",
        lambda payload, classification: context,
    )

    draft = build_form_definition("exposure-help-text.pdf", b"%PDF", _classification(DocumentClass.ACROFORM))

    region_group = draft.pages[0].sections[0].groups[0]
    assert region_group.label == "3E. HAVE YOU BEEN EXPOSED TO ANY OF THE FOLLOWING? (Check all that apply)."
    assert all("http" not in field.label.lower() for field in region_group.fields)


def test_build_form_definition_filters_repeated_page_chrome_lines(monkeypatch):
    context = ExtractionContext(
        page_count=1,
        text_lines=[
            ExtractedTextLine(
                page_number=1,
                text="APPLICATION FOR HEALTH BENEFITS",
                confidence=0.84,
                bounds=Coordinates(page=1, x=36, y=60, width=220, height=14),
            ),
            ExtractedTextLine(
                page_number=1,
                text="Continued",
                confidence=0.84,
                bounds=Coordinates(page=1, x=36, y=78, width=60, height=14),
            ),
            ExtractedTextLine(
                page_number=1,
                text="VETERAN'S NAME (Last, First, Middle)",
                confidence=0.84,
                bounds=Coordinates(page=1, x=320, y=60, width=180, height=14),
            ),
            ExtractedTextLine(
                page_number=1,
                text="SOCIAL SECURITY NO.",
                confidence=0.84,
                bounds=Coordinates(page=1, x=320, y=78, width=120, height=14),
            ),
            ExtractedTextLine(
                page_number=1,
                text="1. REAL QUESTION LABEL",
                confidence=0.84,
                bounds=Coordinates(page=1, x=36, y=120, width=180, height=14),
            ),
        ],
        field_candidates=[],
        adapter_notes=["fitz_text_lines=5"],
    )
    monkeypatch.setattr(
        "form_builder_api.services.extraction.extract_document_context",
        lambda payload, classification: context,
    )

    draft = build_form_definition("chrome-filter.pdf", b"%PDF", _classification(DocumentClass.BORN_DIGITAL))

    labels = [field.label for section in draft.pages[0].sections for field in section.fields]
    assert "APPLICATION FOR HEALTH BENEFITS" not in labels
    assert "Continued" not in labels
    assert "VETERAN'S NAME (Last, First, Middle)" not in labels
    assert "SOCIAL SECURITY NO." not in labels


def test_build_form_definition_drops_leading_continuation_clause_from_group_label(monkeypatch):
    context = ExtractionContext(
        page_count=1,
        text_lines=[
            ExtractedTextLine(
                page_number=1,
                text="unrelated to military experience.",
                confidence=0.84,
                bounds=Coordinates(page=1, x=30, y=224, width=200, height=14),
            ),
            ExtractedTextLine(
                page_number=1,
                text="No, I do not wish to provide financial information in Sections VII through VIII.",
                confidence=0.84,
                bounds=Coordinates(page=1, x=44, y=239, width=360, height=14),
            ),
        ],
        field_candidates=[
            ExtractedFieldCandidate(
                name="financialDisclosure",
                label="unrelated to military experience. No, I do not wish to provide financial information in Sections VII through VIII.",
                semantic_type=SemanticType.RADIO,
                page_number=1,
                confidence=0.9,
                source_priority=SourcePriority.ACROFORM,
                options=["No", "Yes"],
                source_coordinates=[
                    Coordinates(page=1, x=30, y=240, width=10, height=10),
                    Coordinates(page=1, x=30, y=264, width=10, height=10),
                ],
                label_bounds=Coordinates(page=1, x=30, y=224, width=380, height=32),
            )
        ],
        page_regions=[
            ExtractedPageRegion(
                id="region-1-0",
                page_number=1,
                bounds=Coordinates(page=1, x=24, y=220, width=420, height=60),
                notes=["Recovered from table/grid line geometry."],
            )
        ],
        adapter_notes=["page_regions=1"],
    )
    monkeypatch.setattr(
        "form_builder_api.services.extraction.extract_document_context",
        lambda payload, classification: context,
    )

    draft = build_form_definition("financial-disclosure.pdf", b"%PDF", _classification(DocumentClass.ACROFORM))

    region_group = draft.pages[0].sections[0].groups[0]
    assert region_group.label.startswith("No, I do not wish to provide financial information")


def test_build_form_definition_truncates_repeated_enumerated_prompt_in_group_label(monkeypatch):
    context = ExtractionContext(
        page_count=1,
        text_lines=[
            ExtractedTextLine(
                page_number=1,
                text="2E. WAS CHILD PERMANENTLY AND TOTALLY DISABLED BEFORE THE AGE OF 18?",
                confidence=0.84,
                bounds=Coordinates(page=1, x=312, y=620, width=250, height=16),
            ),
            ExtractedTextLine(
                page_number=1,
                text="2F. IF CHILD IS BETWEEN 18 AND 23 YEARS OF AGE, DID CHILD ATTEND SCHOOL LAST CALENDAR YEAR?",
                confidence=0.84,
                bounds=Coordinates(page=1, x=312, y=656, width=310, height=16),
            ),
        ],
        field_candidates=[
            ExtractedFieldCandidate(
                name="dependentQuestion",
                label="2E. WAS CHILD PERMANENTLY AND TOTALLY DISABLED BEFORE THE AGE OF 18? 2F. IF CHILD IS BETWEEN 18 AND 23 YEARS OF AGE, DID CHILD ATTEND SCHOOL LAST CALENDAR YEAR?",
                semantic_type=SemanticType.RADIO,
                page_number=1,
                confidence=0.9,
                source_priority=SourcePriority.ACROFORM,
                options=["YES", "NO"],
                source_coordinates=[
                    Coordinates(page=1, x=330, y=637, width=10, height=10),
                    Coordinates(page=1, x=376, y=637, width=10, height=10),
                ],
                label_bounds=Coordinates(page=1, x=312, y=620, width=310, height=52),
            )
        ],
        page_regions=[
            ExtractedPageRegion(
                id="region-1-0",
                page_number=1,
                bounds=Coordinates(page=1, x=305, y=618, width=320, height=60),
                notes=["Recovered from table/grid line geometry."],
            )
        ],
        adapter_notes=["page_regions=1"],
    )
    monkeypatch.setattr(
        "form_builder_api.services.extraction.extract_document_context",
        lambda payload, classification: context,
    )

    draft = build_form_definition("dependent-question.pdf", b"%PDF", _classification(DocumentClass.ACROFORM))

    region_group = draft.pages[0].sections[0].groups[0]
    assert region_group.label == "2E. WAS CHILD PERMANENTLY AND TOTALLY DISABLED BEFORE THE AGE OF 18?"


def test_build_form_definition_trims_leading_section_title_prefix_from_field_label(monkeypatch):
    context = ExtractionContext(
        page_count=1,
        text_lines=[],
        field_candidates=[
            ExtractedFieldCandidate(
                name="spouseName",
                label="SECTION 4. DEPENDENT INFORMATION (Use a separate sheet for additional dependents). 1. SPOUSE'S NAME (Last, First, Middle Name)",
                semantic_type=SemanticType.TEXT,
                page_number=1,
                confidence=0.88,
                source_priority=SourcePriority.ACROFORM,
                source_coordinates=[Coordinates(page=1, x=40, y=120, width=220, height=14)],
            )
        ],
        adapter_notes=["acroform_fields=1"],
    )
    monkeypatch.setattr(
        "form_builder_api.services.extraction.extract_document_context",
        lambda payload, classification: context,
    )

    draft = build_form_definition("section-prefix-field.pdf", b"%PDF", _classification(DocumentClass.ACROFORM))

    field = draft.pages[0].sections[0].fields[0]
    assert field.label == "1. SPOUSE'S NAME (Last, First, Middle Name)"


def test_build_form_definition_trims_hyphenated_section_title_prefix_from_field_label(monkeypatch):
    context = ExtractionContext(
        page_count=1,
        text_lines=[],
        field_candidates=[
            ExtractedFieldCandidate(
                name="incomeQuestion",
                label="SECTION 5 - PREVIOUS CALENDAR YEAR GROSS ANNUAL INCOME OF VETERAN, SPOUSE AND DEPENDENT CHILDREN. 1. GROSS ANNUAL INCOME FROM EMPLOYMENT",
                semantic_type=SemanticType.TEXT,
                page_number=1,
                confidence=0.88,
                source_priority=SourcePriority.ACROFORM,
                source_coordinates=[Coordinates(page=1, x=40, y=120, width=260, height=14)],
            )
        ],
        adapter_notes=["acroform_fields=1"],
    )
    monkeypatch.setattr(
        "form_builder_api.services.extraction.extract_document_context",
        lambda payload, classification: context,
    )

    draft = build_form_definition("hyphenated-section-prefix-field.pdf", b"%PDF", _classification(DocumentClass.ACROFORM))

    field = draft.pages[0].sections[0].fields[0]
    assert field.label == "1. GROSS ANNUAL INCOME FROM EMPLOYMENT"


def test_build_form_definition_drops_placeholder_only_group_statement(monkeypatch):
    context = ExtractionContext(
        page_count=1,
        text_lines=[
            ExtractedTextLine(
                page_number=1,
                text="2B. CHILD'S SOCIAL SECURITY",
                confidence=0.84,
                bounds=Coordinates(page=1, x=40, y=120, width=180, height=14),
            ),
            ExtractedTextLine(
                page_number=1,
                text="NO. (999-99-9999)",
                confidence=0.84,
                bounds=Coordinates(page=1, x=222, y=120, width=120, height=14),
            ),
        ],
        field_candidates=[
            ExtractedFieldCandidate(
                name="childSsn",
                label="2B. CHILD'S SOCIAL SECURITY NUMBER",
                semantic_type=SemanticType.TEXT,
                page_number=1,
                confidence=0.9,
                source_priority=SourcePriority.ACROFORM,
                source_coordinates=[Coordinates(page=1, x=40, y=136, width=220, height=14)],
            )
        ],
        page_regions=[
            ExtractedPageRegion(
                id="region-1-0",
                page_number=1,
                bounds=Coordinates(page=1, x=34, y=116, width=320, height=40),
                notes=["Recovered from table/grid line geometry."],
            )
        ],
        adapter_notes=["page_regions=1"],
    )
    monkeypatch.setattr(
        "form_builder_api.services.extraction.extract_document_context",
        lambda payload, classification: context,
    )

    draft = build_form_definition("placeholder-group.pdf", b"%PDF", _classification(DocumentClass.ACROFORM))

    region_group = draft.pages[0].sections[0].groups[0]
    assert all(field.label != "NO. (999-99-9999)" for field in region_group.fields)


def test_build_form_definition_truncates_following_binary_option_clause(monkeypatch):
    context = ExtractionContext(
        page_count=1,
        text_lines=[
            ExtractedTextLine(
                page_number=1,
                text="SECTION VI - FINANCIAL DISCLOSURE",
                confidence=0.84,
                bounds=Coordinates(page=1, x=40, y=180, width=220, height=14),
            ),
            ExtractedTextLine(
                page_number=1,
                text="No, I do not wish to provide financial information in Sections VII through VIII.",
                confidence=0.84,
                bounds=Coordinates(page=1, x=40, y=220, width=340, height=14),
            ),
            ExtractedTextLine(
                page_number=1,
                text="Yes, I will provide my household financial information for last calendar year.",
                confidence=0.84,
                bounds=Coordinates(page=1, x=40, y=244, width=340, height=14),
            ),
        ],
        field_candidates=[
            ExtractedFieldCandidate(
                name="financialDisclosure",
                label="No, I do not wish to provide financial information in Sections VII through VIII. If I am enrolled, I agree to pay applicable VA copayments. Yes, I will provide my household financial information for last calendar year.",
                semantic_type=SemanticType.RADIO,
                page_number=1,
                confidence=0.9,
                source_priority=SourcePriority.ACROFORM,
                options=["No", "Yes"],
                source_coordinates=[
                    Coordinates(page=1, x=24, y=224, width=10, height=10),
                    Coordinates(page=1, x=24, y=248, width=10, height=10),
                ],
                label_bounds=Coordinates(page=1, x=40, y=220, width=360, height=40),
            )
        ],
        page_regions=[
            ExtractedPageRegion(
                id="region-1-0",
                page_number=1,
                bounds=Coordinates(page=1, x=20, y=216, width=390, height=48),
                notes=["Recovered from table/grid line geometry."],
            )
        ],
        adapter_notes=["page_regions=1"],
    )
    monkeypatch.setattr(
        "form_builder_api.services.extraction.extract_document_context",
        lambda payload, classification: context,
    )

    draft = build_form_definition("binary-options.pdf", b"%PDF", _classification(DocumentClass.ACROFORM))

    region_group = draft.pages[0].sections[0].groups[0]
    assert "Yes, I will provide" not in region_group.label
    assert region_group.label.startswith("No, I do not wish to provide financial information")


def test_build_form_definition_promotes_binary_choice_sentences_into_radio_options(monkeypatch):
    context = ExtractionContext(
        page_count=1,
        text_lines=[
            ExtractedTextLine(
                page_number=1,
                text="SECTION VI - FINANCIAL DISCLOSURE",
                confidence=0.84,
                bounds=Coordinates(page=1, x=40, y=180, width=220, height=14),
            ),
            ExtractedTextLine(
                page_number=1,
                text="No, I do not wish to provide financial information in Sections VII through VIII.",
                confidence=0.84,
                bounds=Coordinates(page=1, x=40, y=220, width=340, height=14),
            ),
            ExtractedTextLine(
                page_number=1,
                text="Yes, I will provide my household financial information for last calendar year.",
                confidence=0.84,
                bounds=Coordinates(page=1, x=40, y=244, width=340, height=14),
            ),
        ],
        field_candidates=[
            ExtractedFieldCandidate(
                name="financialDisclosure",
                label="No, I do not wish to provide financial information in Sections VII through VIII. If I am enrolled, I agree to pay applicable VA copayments.",
                semantic_type=SemanticType.RADIO,
                page_number=1,
                confidence=0.9,
                source_priority=SourcePriority.ACROFORM,
                options=["YES", "NO"],
                source_coordinates=[
                    Coordinates(page=1, x=24, y=224, width=10, height=10),
                    Coordinates(page=1, x=24, y=248, width=10, height=10),
                ],
                label_bounds=Coordinates(page=1, x=40, y=220, width=360, height=40),
            )
        ],
        page_regions=[
            ExtractedPageRegion(
                id="region-1-0",
                page_number=1,
                bounds=Coordinates(page=1, x=20, y=216, width=390, height=48),
                notes=["Recovered from table/grid line geometry."],
            )
        ],
        adapter_notes=["page_regions=1"],
    )
    monkeypatch.setattr(
        "form_builder_api.services.extraction.extract_document_context",
        lambda payload, classification: context,
    )

    draft = build_form_definition("binary-option-group.pdf", b"%PDF", _classification(DocumentClass.ACROFORM))

    region_group = draft.pages[0].sections[0].groups[0]
    assert region_group.label == "FINANCIAL DISCLOSURE"
    radio = region_group.fields[0]
    assert radio.label == "FINANCIAL DISCLOSURE"
    assert [option.label for option in radio.options] == [
        "Yes, I will provide my household financial information for last calendar year.",
        "No, I do not wish to provide financial information in Sections VII through VIII. If I am enrolled, I agree to pay applicable VA copayments.",
    ]
    assert all(field.semantic_type != SemanticType.STATEMENT for field in region_group.fields[1:])


def test_order_section_items_preserves_global_order_when_groups_consolidate():
    section_groups = [
        GroupNode(
            id="group-b-partial",
            order_index=3,
            label="B. QUESTION PARTIAL",
            page_id="page-1",
            section_id="section-1",
            lineage=["page-1", "section-1"],
            source_coordinates=[Coordinates(page=1, x=30, y=220, width=220, height=16)],
            evidence=[],
            fields=[
                FieldNode(
                    id="field-b-statement",
                    stable_key="field-b-statement",
                    order_index=0,
                    lineage=["page-1", "section-1", "group-b-partial"],
                    page_id="page-1",
                    section_id="section-1",
                    semantic_type=SemanticType.STATEMENT,
                    label="B. QUESTION PARTIAL",
                    required=False,
                    source_coordinates=[Coordinates(page=1, x=30, y=220, width=220, height=16)],
                    evidence=[],
                    confidence=0.7,
                    source_priority=[SourcePriority.LAYOUT],
                    source_conflicts=[],
                    review_status=ReviewStatus.NEEDS_REVIEW,
                    options=[],
                    validations=[],
                    conditionals=[],
                    renderer_hints={},
                )
            ],
            renderer_hints={},
        ),
        GroupNode(
            id="group-b-control",
            order_index=4,
            label="B. QUESTION FULL",
            page_id="page-1",
            section_id="section-1",
            lineage=["page-1", "section-1"],
            source_coordinates=[Coordinates(page=1, x=30, y=236, width=220, height=16)],
            evidence=[],
            fields=[
                FieldNode(
                    id="field-b-radio",
                    stable_key="field-b-radio",
                    order_index=0,
                    lineage=["page-1", "section-1", "group-b-control"],
                    page_id="page-1",
                    section_id="section-1",
                    semantic_type=SemanticType.RADIO,
                    label="B. QUESTION FULL",
                    required=False,
                    source_coordinates=[Coordinates(page=1, x=246, y=236, width=10, height=10)],
                    evidence=[
                        EvidenceAnchor(
                            anchor_id="field-b-radio-evidence",
                            source_priority=SourcePriority.ACROFORM,
                            page=1,
                            snippet="B. QUESTION FULL",
                            bounds=Coordinates(page=1, x=30, y=236, width=220, height=16),
                            confidence=0.9,
                        )
                    ],
                    confidence=0.9,
                    source_priority=[SourcePriority.ACROFORM],
                    source_conflicts=[],
                    review_status=ReviewStatus.NEEDS_REVIEW,
                    options=[],
                    validations=[],
                    conditionals=[],
                    renderer_hints={},
                )
            ],
            renderer_hints={},
        ),
    ]
    section_fields = [
        FieldNode(
            id="field-1a",
            stable_key="field-1a",
            order_index=0,
            lineage=["page-1", "section-1"],
            page_id="page-1",
            section_id="section-1",
            semantic_type=SemanticType.TEXT,
            label="1A. APPLICANT NAME",
            required=False,
            source_coordinates=[Coordinates(page=1, x=30, y=120, width=220, height=16)],
            evidence=[],
            confidence=0.9,
            source_priority=[SourcePriority.ACROFORM],
            source_conflicts=[],
            review_status=ReviewStatus.NEEDS_REVIEW,
            options=[],
            validations=[],
            conditionals=[],
            renderer_hints={},
        ),
        FieldNode(
            id="field-1b",
            stable_key="field-1b",
            order_index=1,
            lineage=["page-1", "section-1"],
            page_id="page-1",
            section_id="section-1",
            semantic_type=SemanticType.TEXT,
            label="1B. SOCIAL SECURITY NUMBER",
            required=False,
            source_coordinates=[Coordinates(page=1, x=30, y=148, width=220, height=16)],
            evidence=[],
            confidence=0.9,
            source_priority=[SourcePriority.ACROFORM],
            source_conflicts=[],
            review_status=ReviewStatus.NEEDS_REVIEW,
            options=[],
            validations=[],
            conditionals=[],
            renderer_hints={},
        ),
        FieldNode(
            id="field-2",
            stable_key="field-2",
            order_index=2,
            lineage=["page-1", "section-1"],
            page_id="page-1",
            section_id="section-1",
            semantic_type=SemanticType.TEXT,
            label="2. DATE OF BIRTH",
            required=False,
            source_coordinates=[Coordinates(page=1, x=30, y=176, width=220, height=16)],
            evidence=[],
            confidence=0.9,
            source_priority=[SourcePriority.ACROFORM],
            source_conflicts=[],
            review_status=ReviewStatus.NEEDS_REVIEW,
            options=[],
            validations=[],
            conditionals=[],
            renderer_hints={},
        ),
    ]

    ordered_groups, ordered_fields = _order_section_items(section_groups, section_fields)

    assert len(ordered_groups) == 1
    assert ordered_groups[0].order_index == 3
    assert [field.order_index for field in ordered_fields] == [0, 1, 2]


def test_order_section_items_alphabetizes_lettered_group_runs():
    groups = []
    for order_index, (label, y) in enumerate(
        [
            ("A. FIRST QUESTION?", 220),
            ("D. FOURTH QUESTION?", 236),
            ("B. SECOND QUESTION?", 252),
            ("E. FIFTH QUESTION?", 268),
            ("C. THIRD QUESTION?", 284),
            ("F. SIXTH QUESTION?", 300),
        ]
    ):
        groups.append(
            GroupNode(
                id=f"group-{order_index}",
                order_index=order_index,
                label=label,
                page_id="page-1",
                section_id="section-1",
                lineage=["page-1", "section-1"],
                source_coordinates=[Coordinates(page=1, x=30, y=y, width=220, height=16)],
                evidence=[],
                fields=[],
                renderer_hints={},
            )
        )

    ordered_groups, ordered_fields = _order_section_items(groups, [])

    assert [group.label for group in ordered_groups] == [
        "A. FIRST QUESTION?",
        "B. SECOND QUESTION?",
        "C. THIRD QUESTION?",
        "D. FOURTH QUESTION?",
        "E. FIFTH QUESTION?",
        "F. SIXTH QUESTION?",
    ]
    assert ordered_fields == []


def test_order_section_items_uses_parent_heading_to_sort_mixed_subitems():
    groups = []
    for order_index, (label, y) in enumerate(
        [
            ("A. FIRST EXPOSURE QUESTION?", 92),
            ("D. FOURTH EXPOSURE QUESTION?", 108),
            ("B. SECOND EXPOSURE QUESTION?", 156),
            ("3E. FIFTH EXPOSURE QUESTION?", 208),
            ("C. THIRD EXPOSURE QUESTION?", 270),
        ]
    ):
        groups.append(
            GroupNode(
                id=f"group-mixed-{order_index}",
                order_index=order_index + 1,
                label=label,
                page_id="page-1",
                section_id="section-1",
                lineage=["page-1", "section-1"],
                source_coordinates=[Coordinates(page=1, x=30, y=y, width=240, height=16)],
                evidence=[],
                fields=[],
                renderer_hints={},
            )
        )

    heading = FieldNode(
        id="field-3-heading",
        stable_key="field-3-heading",
        order_index=0,
        lineage=["page-1", "section-1"],
        page_id="page-1",
        section_id="section-1",
        semantic_type=SemanticType.STATEMENT,
        label="3. MILITARY EXPOSURE INFORMATION (Check yes or no)",
        required=False,
        source_coordinates=[Coordinates(page=1, x=30, y=72, width=280, height=16)],
        evidence=[],
        confidence=0.9,
        source_priority=[SourcePriority.LAYOUT],
        source_conflicts=[],
        review_status=ReviewStatus.NEEDS_REVIEW,
        options=[],
        validations=[],
        conditionals=[],
        renderer_hints={},
    )

    ordered_groups, ordered_fields = _order_section_items(groups, [heading])

    assert [field.label for field in ordered_fields] == ["3. MILITARY EXPOSURE INFORMATION (Check yes or no)"]
    assert [group.label for group in ordered_groups] == [
        "A. FIRST EXPOSURE QUESTION?",
        "B. SECOND EXPOSURE QUESTION?",
        "C. THIRD EXPOSURE QUESTION?",
        "D. FOURTH EXPOSURE QUESTION?",
        "3E. FIFTH EXPOSURE QUESTION?",
    ]


def test_order_section_items_assigns_global_unique_order_indexes():
    groups = [
        GroupNode(
            id="group-3",
            order_index=6,
            label="3. SEX",
            page_id="page-1",
            section_id="section-1",
            lineage=["page-1", "section-1"],
            source_coordinates=[Coordinates(page=1, x=30, y=220, width=120, height=16)],
            evidence=[],
            fields=[],
            renderer_hints={},
        ),
        GroupNode(
            id="group-4",
            order_index=7,
            label="4. WHAT IS YOUR RACE / ETHNICITY?",
            page_id="page-1",
            section_id="section-1",
            lineage=["page-1", "section-1"],
            source_coordinates=[Coordinates(page=1, x=30, y=260, width=220, height=16)],
            evidence=[],
            fields=[],
            renderer_hints={},
        ),
    ]
    fields = [
        FieldNode(
            id="field-1a",
            stable_key="field-1a",
            order_index=6,
            lineage=["page-1", "section-1"],
            page_id="page-1",
            section_id="section-1",
            semantic_type=SemanticType.TEXT,
            label="1. A. VETERAN'S NAME",
            required=False,
            source_coordinates=[Coordinates(page=1, x=30, y=120, width=180, height=16)],
            evidence=[],
            confidence=0.9,
            source_priority=[SourcePriority.ACROFORM],
            source_conflicts=[],
            review_status=ReviewStatus.NEEDS_REVIEW,
            options=[],
            validations=[],
            conditionals=[],
            renderer_hints={},
        ),
        FieldNode(
            id="field-2",
            stable_key="field-2",
            order_index=8,
            lineage=["page-1", "section-1"],
            page_id="page-1",
            section_id="section-1",
            semantic_type=SemanticType.TEXT,
            label="2. MOTHER'S MAIDEN NAME",
            required=False,
            source_coordinates=[Coordinates(page=1, x=30, y=180, width=180, height=16)],
            evidence=[],
            confidence=0.9,
            source_priority=[SourcePriority.ACROFORM],
            source_conflicts=[],
            review_status=ReviewStatus.NEEDS_REVIEW,
            options=[],
            validations=[],
            conditionals=[],
            renderer_hints={},
        ),
        FieldNode(
            id="field-5",
            stable_key="field-5",
            order_index=9,
            lineage=["page-1", "section-1"],
            page_id="page-1",
            section_id="section-1",
            semantic_type=SemanticType.TEXT,
            label="5. SOCIAL SECURITY NUMBER",
            required=False,
            source_coordinates=[Coordinates(page=1, x=30, y=300, width=180, height=16)],
            evidence=[],
            confidence=0.9,
            source_priority=[SourcePriority.ACROFORM],
            source_conflicts=[],
            review_status=ReviewStatus.NEEDS_REVIEW,
            options=[],
            validations=[],
            conditionals=[],
            renderer_hints={},
        ),
    ]

    ordered_groups, ordered_fields = _order_section_items(groups, fields)
    combined = sorted(
        [
            *[(group.order_index, group.label) for group in ordered_groups],
            *[(field.order_index, field.label) for field in ordered_fields],
        ],
        key=lambda item: item[0],
    )

    assert [order for order, _label in combined] == list(range(len(combined)))
    assert combined[0][1] == "1. A. VETERAN'S NAME"
    assert [group.label for group in ordered_groups] == [
        "3. SEX",
        "4. WHAT IS YOUR RACE / ETHNICITY?",
    ]


def test_order_section_items_attaches_same_numbered_fields_into_statement_groups():
    groups = [
        GroupNode(
            id="group-1",
            order_index=0,
            label="1. GROSS ANNUAL INCOME FROM EMPLOYMENT",
            page_id="page-1",
            section_id="section-1",
            lineage=["page-1", "section-1"],
            source_coordinates=[Coordinates(page=1, x=30, y=120, width=260, height=16)],
            evidence=[],
            fields=[
                FieldNode(
                    id="field-1-statement",
                    stable_key="field-1-statement",
                    order_index=0,
                    lineage=["page-1", "section-1", "group-1"],
                    page_id="page-1",
                    section_id="section-1",
                    semantic_type=SemanticType.STATEMENT,
                    label="1. GROSS ANNUAL INCOME FROM EMPLOYMENT",
                    required=False,
                    source_coordinates=[Coordinates(page=1, x=30, y=120, width=260, height=16)],
                    evidence=[],
                    confidence=0.8,
                    source_priority=[SourcePriority.LAYOUT],
                    source_conflicts=[],
                    review_status=ReviewStatus.NEEDS_REVIEW,
                    options=[],
                    validations=[],
                    conditionals=[],
                    renderer_hints={},
                )
            ],
            renderer_hints={},
        ),
        GroupNode(
            id="group-2",
            order_index=1,
            label="2. NET INCOME FROM YOUR FARM, RANCH, PROPERTY OR BUSINESS",
            page_id="page-1",
            section_id="section-1",
            lineage=["page-1", "section-1"],
            source_coordinates=[Coordinates(page=1, x=30, y=180, width=300, height=16)],
            evidence=[],
            fields=[
                FieldNode(
                    id="field-2-statement",
                    stable_key="field-2-statement",
                    order_index=0,
                    lineage=["page-1", "section-1", "group-2"],
                    page_id="page-1",
                    section_id="section-1",
                    semantic_type=SemanticType.STATEMENT,
                    label="2. NET INCOME FROM YOUR FARM, RANCH, PROPERTY OR BUSINESS",
                    required=False,
                    source_coordinates=[Coordinates(page=1, x=30, y=180, width=300, height=16)],
                    evidence=[],
                    confidence=0.8,
                    source_priority=[SourcePriority.LAYOUT],
                    source_conflicts=[],
                    review_status=ReviewStatus.NEEDS_REVIEW,
                    options=[],
                    validations=[],
                    conditionals=[],
                    renderer_hints={},
                )
            ],
            renderer_hints={},
        ),
    ]
    fields = [
        FieldNode(
            id="field-1-child",
            stable_key="field-1-child",
            order_index=2,
            lineage=["page-1", "section-1"],
            page_id="page-1",
            section_id="section-1",
            semantic_type=SemanticType.TEXT,
            label="1. CHILD 1 GROSS ANNUAL INCOME",
            required=False,
            source_coordinates=[Coordinates(page=1, x=340, y=120, width=180, height=16)],
            evidence=[],
            confidence=0.9,
            source_priority=[SourcePriority.ACROFORM],
            source_conflicts=[],
            review_status=ReviewStatus.NEEDS_REVIEW,
            options=[],
            validations=[],
            conditionals=[],
            renderer_hints={},
        ),
        FieldNode(
            id="field-1-spouse",
            stable_key="field-1-spouse",
            order_index=3,
            lineage=["page-1", "section-1"],
            page_id="page-1",
            section_id="section-1",
            semantic_type=SemanticType.TEXT,
            label="1. SPOUSE GROSS ANNUAL INCOME",
            required=False,
            source_coordinates=[Coordinates(page=1, x=540, y=120, width=180, height=16)],
            evidence=[],
            confidence=0.9,
            source_priority=[SourcePriority.ACROFORM],
            source_conflicts=[],
            review_status=ReviewStatus.NEEDS_REVIEW,
            options=[],
            validations=[],
            conditionals=[],
            renderer_hints={},
        ),
        FieldNode(
            id="field-2-child",
            stable_key="field-2-child",
            order_index=4,
            lineage=["page-1", "section-1"],
            page_id="page-1",
            section_id="section-1",
            semantic_type=SemanticType.TEXT,
            label="2. CHILD 1 NET INCOME",
            required=False,
            source_coordinates=[Coordinates(page=1, x=340, y=180, width=180, height=16)],
            evidence=[],
            confidence=0.9,
            source_priority=[SourcePriority.ACROFORM],
            source_conflicts=[],
            review_status=ReviewStatus.NEEDS_REVIEW,
            options=[],
            validations=[],
            conditionals=[],
            renderer_hints={},
        ),
        FieldNode(
            id="field-standalone",
            stable_key="field-standalone",
            order_index=5,
            lineage=["page-1", "section-1"],
            page_id="page-1",
            section_id="section-1",
            semantic_type=SemanticType.STATEMENT,
            label="INCOME CATEGORIES",
            required=False,
            source_coordinates=[Coordinates(page=1, x=30, y=90, width=140, height=16)],
            evidence=[],
            confidence=0.7,
            source_priority=[SourcePriority.LAYOUT],
            source_conflicts=[],
            review_status=ReviewStatus.NEEDS_REVIEW,
            options=[],
            validations=[],
            conditionals=[],
            renderer_hints={},
        ),
    ]

    ordered_groups, ordered_fields = _order_section_items(groups, fields)

    assert [field.label for field in ordered_fields] == ["INCOME CATEGORIES"]
    assert [field.label for field in ordered_groups[0].fields] == [
        "Child 1",
        "Spouse",
    ]
    assert [field.label for field in ordered_groups[1].fields] == [
        "2. NET INCOME FROM YOUR FARM, RANCH, PROPERTY OR BUSINESS",
        "2. CHILD 1 NET INCOME",
    ]


def test_order_section_items_synthesizes_groups_for_repeated_numbered_fields():
    fields = [
        FieldNode(
            id="field-2-veteran",
            stable_key="field-2-veteran",
            order_index=0,
            lineage=["page-1", "section-1"],
            page_id="page-1",
            section_id="section-1",
            semantic_type=SemanticType.TEXT,
            label="2. NET INCOME FROM YOUR FARM, RANCH, PROPERTY OR BUSINESS. VETERAN NET INCOME",
            required=False,
            source_coordinates=[Coordinates(page=1, x=30, y=180, width=260, height=16)],
            evidence=[],
            confidence=0.9,
            source_priority=[SourcePriority.ACROFORM],
            source_conflicts=[],
            review_status=ReviewStatus.NEEDS_REVIEW,
            options=[],
            validations=[],
            conditionals=[],
            renderer_hints={},
        ),
        FieldNode(
            id="field-2-child",
            stable_key="field-2-child",
            order_index=1,
            lineage=["page-1", "section-1"],
            page_id="page-1",
            section_id="section-1",
            semantic_type=SemanticType.TEXT,
            label="2. CHILD 1 NET INCOME",
            required=False,
            source_coordinates=[Coordinates(page=1, x=340, y=180, width=180, height=16)],
            evidence=[],
            confidence=0.9,
            source_priority=[SourcePriority.ACROFORM],
            source_conflicts=[],
            review_status=ReviewStatus.NEEDS_REVIEW,
            options=[],
            validations=[],
            conditionals=[],
            renderer_hints={},
        ),
        FieldNode(
            id="field-2-spouse",
            stable_key="field-2-spouse",
            order_index=2,
            lineage=["page-1", "section-1"],
            page_id="page-1",
            section_id="section-1",
            semantic_type=SemanticType.TEXT,
            label="2. SPOUSE NET INCOME",
            required=False,
            source_coordinates=[Coordinates(page=1, x=540, y=180, width=180, height=16)],
            evidence=[],
            confidence=0.9,
            source_priority=[SourcePriority.ACROFORM],
            source_conflicts=[],
            review_status=ReviewStatus.NEEDS_REVIEW,
            options=[],
            validations=[],
            conditionals=[],
            renderer_hints={},
        ),
        FieldNode(
            id="field-standalone",
            stable_key="field-standalone",
            order_index=3,
            lineage=["page-1", "section-1"],
            page_id="page-1",
            section_id="section-1",
            semantic_type=SemanticType.STATEMENT,
            label="INCOME CATEGORIES",
            required=False,
            source_coordinates=[Coordinates(page=1, x=30, y=90, width=140, height=16)],
            evidence=[],
            confidence=0.7,
            source_priority=[SourcePriority.LAYOUT],
            source_conflicts=[],
            review_status=ReviewStatus.NEEDS_REVIEW,
            options=[],
            validations=[],
            conditionals=[],
            renderer_hints={},
        ),
    ]

    ordered_groups, ordered_fields = _order_section_items([], fields)

    assert [field.label for field in ordered_fields] == ["INCOME CATEGORIES"]
    assert [group.label for group in ordered_groups] == [
        "2. NET INCOME FROM YOUR FARM, RANCH, PROPERTY OR BUSINESS"
    ]
    assert [field.label for field in ordered_groups[0].fields] == [
        "Veteran",
        "Child 1",
        "Spouse",
    ]


def test_order_section_items_suppresses_standalone_currency_markers():
    fields = [
        FieldNode(
            id="field-1-expense",
            stable_key="field-1-expense",
            order_index=0,
            lineage=["page-1", "section-1"],
            page_id="page-1",
            section_id="section-1",
            semantic_type=SemanticType.TEXT,
            label="1. TOTAL NON-REIMBURSED MEDICAL EXPENSES",
            required=False,
            source_coordinates=[Coordinates(page=1, x=30, y=120, width=260, height=16)],
            evidence=[],
            confidence=0.9,
            source_priority=[SourcePriority.ACROFORM],
            source_conflicts=[],
            review_status=ReviewStatus.NEEDS_REVIEW,
            options=[],
            validations=[],
            conditionals=[],
            renderer_hints={},
        ),
        FieldNode(
            id="field-currency-1",
            stable_key="field-currency-1",
            order_index=1,
            lineage=["page-1", "section-1"],
            page_id="page-1",
            section_id="section-1",
            semantic_type=SemanticType.STATEMENT,
            label="$",
            required=False,
            source_coordinates=[Coordinates(page=1, x=320, y=120, width=12, height=16)],
            evidence=[],
            confidence=0.7,
            source_priority=[SourcePriority.LAYOUT],
            source_conflicts=[],
            review_status=ReviewStatus.NEEDS_REVIEW,
            options=[],
            validations=[],
            conditionals=[],
            renderer_hints={},
        ),
        FieldNode(
            id="field-currency-2",
            stable_key="field-currency-2",
            order_index=2,
            lineage=["page-1", "section-1"],
            page_id="page-1",
            section_id="section-1",
            semantic_type=SemanticType.STATEMENT,
            label="$",
            required=False,
            source_coordinates=[Coordinates(page=1, x=520, y=120, width=12, height=16)],
            evidence=[],
            confidence=0.7,
            source_priority=[SourcePriority.LAYOUT],
            source_conflicts=[],
            review_status=ReviewStatus.NEEDS_REVIEW,
            options=[],
            validations=[],
            conditionals=[],
            renderer_hints={},
        ),
    ]

    ordered_groups, ordered_fields = _order_section_items([], fields)

    assert ordered_groups == []
    assert [field.label for field in ordered_fields] == ["1. TOTAL NON-REIMBURSED MEDICAL EXPENSES"]
