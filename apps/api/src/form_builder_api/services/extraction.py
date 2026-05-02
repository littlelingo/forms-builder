from __future__ import annotations

import re

from form_builder_api.models.canonical import (
    ChoiceOption,
    Coordinates,
    DocumentClass,
    EvidenceAnchor,
    ExtractionIssue,
    FieldNode,
    FormDefinition,
    GroupNode,
    IssueCode,
    PageNode,
    ReviewStatus,
    SectionNode,
    SemanticType,
    SourcePriority,
    ValidationRule,
)
from form_builder_api.services.classification import ClassificationResult
from form_builder_api.services.extraction_adapters import (
    ExtractedFieldCandidate,
    ExtractedPageRegion,
    ExtractedTextLine,
    ExtractionContext,
    extract_document_context,
)


def _slugify(value: str) -> str:
    normalized = "".join(char.lower() if char.isalnum() else "-" for char in value)
    return "-".join(part for part in normalized.split("-") if part)


def _stable_key(*parts: str) -> str:
    return "-".join(_slugify(part) for part in parts if part)


def build_form_definition(
    filename: str,
    payload: bytes,
    classification: ClassificationResult,
) -> FormDefinition:
    title = filename.rsplit(".", 1)[0].replace("-", " ").replace("_", " ").title()
    source_priority = _source_priority_for_class(classification.document_class)
    context = extract_document_context(payload, classification)
    pages = _build_pages(title, context, source_priority, classification.document_class)
    issues = _build_issues(classification, context, pages)
    source_conflicts = _build_source_conflicts(classification, context)

    return FormDefinition(
        id=_stable_key(title, classification.document_class.value),
        title=title,
        document_class=classification.document_class,
        review_status=ReviewStatus.NEEDS_REVIEW,
        source_priority=source_priority,
        source_conflicts=source_conflicts,
        pages=pages,
        issues=issues,
        metadata={
            "phase": "phase-1",
            "filename": filename,
            "documentClass": classification.document_class.value,
            "classificationNotes": " | ".join(classification.notes),
            "adapterNotes": " | ".join(context.adapter_notes),
            "acroformFieldCount": str(len(context.field_candidates)),
            "xfaHintCount": str(len(context.xfa_field_hints)),
            "textLineCount": str(len(context.text_lines)),
        },
    )


def _source_priority_for_class(document_class: DocumentClass) -> list[SourcePriority]:
    if document_class == DocumentClass.XFA_BACKED:
        return [SourcePriority.XFA_XML, SourcePriority.WIDGET_GEOMETRY]
    if document_class == DocumentClass.ACROFORM:
        return [SourcePriority.ACROFORM, SourcePriority.WIDGET_GEOMETRY]
    if document_class == DocumentClass.SCANNED:
        return [SourcePriority.OCR, SourcePriority.LAYOUT]
    if document_class == DocumentClass.MIXED:
        return [SourcePriority.LAYOUT, SourcePriority.OCR, SourcePriority.WIDGET_GEOMETRY]
    return [SourcePriority.LAYOUT, SourcePriority.WIDGET_GEOMETRY]


def _build_pages(
    title: str,
    context: ExtractionContext,
    default_source_priority: list[SourcePriority],
    document_class: DocumentClass,
) -> list[PageNode]:
    page_builds: list[tuple[PageNode, list[ExtractedTextLine], list[ExtractedFieldCandidate]]] = []
    text_by_page = _group_text_lines(context.text_lines)
    fields_by_page = _group_field_candidates(context.field_candidates or context.xfa_field_hints)
    regions_by_page = _group_page_regions(context.page_regions)

    for page_number in range(1, max(context.page_count, 1) + 1):
        page_id = f"page-{page_number}"
        lines = text_by_page.get(page_number, [])
        page_fields = fields_by_page.get(page_number, [])
        page_regions = regions_by_page.get(page_number, [])
        page_label = _page_label(page_number, lines)
        sections = _build_sections(
            title=title,
            page_number=page_number,
            page_id=page_id,
            lines=lines,
            candidates=page_fields,
            regions=page_regions,
            default_source_priority=default_source_priority,
        )
        page_evidence = [_evidence_from_text_line(page_number, line) for line in lines[:4]]
        page_builds.append(
            (
                PageNode(
                    id=page_id,
                    order_index=page_number - 1,
                    label=page_label,
                    sections=sections,
                    evidence=page_evidence,
                ),
                lines,
                page_fields,
            )
        )

    return _filter_leading_instruction_pages(page_builds, document_class)


def _filter_leading_instruction_pages(
    page_builds: list[tuple[PageNode, list[ExtractedTextLine], list[ExtractedFieldCandidate]]],
    document_class: DocumentClass,
) -> list[PageNode]:
    if document_class not in {DocumentClass.XFA_BACKED, DocumentClass.ACROFORM, DocumentClass.MIXED}:
        return [page for page, _lines, _candidates in page_builds]

    first_interactive_index = next(
        (
            index
            for index, (page, _lines, _candidates) in enumerate(page_builds)
            if _page_has_interactive_fields(page)
        ),
        None,
    )
    if first_interactive_index in {None, 0}:
        return [page for page, _lines, _candidates in page_builds]

    retained: list[PageNode] = []
    for index, (page, lines, candidates) in enumerate(page_builds):
        if index < first_interactive_index and _is_leading_instruction_page(page, lines, candidates):
            continue
        retained.append(page)
    return retained


def _page_has_interactive_fields(page: PageNode) -> bool:
    return any(
        field.semantic_type != SemanticType.STATEMENT
        for section in page.sections
        for field in [*section.fields, *[child for group in section.groups for child in group.fields]]
    )


def _is_leading_instruction_page(
    page: PageNode,
    lines: list[ExtractedTextLine],
    candidates: list[ExtractedFieldCandidate],
) -> bool:
    if candidates:
        return False

    page_fields = [
        field
        for section in page.sections
        for field in [*section.fields, *[child for group in section.groups for child in group.fields]]
    ]
    if not page_fields or any(field.semantic_type != SemanticType.STATEMENT for field in page_fields):
        return False

    instruction_source = " ".join(
        [
            page.label,
            *[section.title for section in page.sections[:4]],
            *[line.text for line in lines[:6]],
        ]
    ).lower()
    if any(
        keyword in instruction_source
        for keyword in (
            "instruction",
            "notice to",
            "please read",
            "before you start",
            "paperwork reduction",
            "privacy act",
            "estimated burden",
            "evidence tables",
            "getting started",
            "how to",
            "special circumstances",
        )
    ):
        return True

    return len(page_fields) >= 8


def _build_sections(
    *,
    title: str,
    page_number: int,
    page_id: str,
    lines: list[ExtractedTextLine],
    candidates: list[ExtractedFieldCandidate],
    regions: list[ExtractedPageRegion],
    default_source_priority: list[SourcePriority],
) -> list[SectionNode]:
    section_slices = _split_page_sections(lines, candidates, regions, page_number)
    sections: list[SectionNode] = []

    for section_index, section_slice in enumerate(section_slices):
        section_id = f"section-{page_number}-{section_index + 1}"
        section_lines = section_slice["lines"]
        section_candidates = section_slice["candidates"]
        section_regions = section_slice["regions"]
        content_lines = _drop_section_heading_line(section_lines, section_slice["title"])
        groups, fields = _build_section_content(
            title=title,
            section_title=section_slice["title"],
            page_number=page_number,
            page_id=page_id,
            section_id=section_id,
            lines=content_lines,
            candidates=section_candidates,
            regions=section_regions,
            default_source_priority=default_source_priority,
        )
        ordered_groups, ordered_fields = _order_section_items(groups, fields)
        sections.append(
            SectionNode(
                id=section_id,
                order_index=section_index,
                title=section_slice["title"],
                description=_section_description(section_candidates, content_lines),
                page_id=page_id,
                lineage=[page_id],
                groups=ordered_groups,
                fields=ordered_fields,
            )
        )

    return sections


def _build_section_content(
    *,
    title: str,
    section_title: str,
    page_number: int,
    page_id: str,
    section_id: str,
    lines: list[ExtractedTextLine],
    candidates: list[ExtractedFieldCandidate],
    regions: list[ExtractedPageRegion],
    default_source_priority: list[SourcePriority],
) -> tuple[list[GroupNode], list[FieldNode]]:
    layout_groups, consumed_candidate_names, consumed_line_keys = _build_region_groups(
        title=title,
        section_title=section_title,
        page_number=page_number,
        page_id=page_id,
        section_id=section_id,
        lines=lines,
        candidates=candidates,
        regions=regions,
    )
    remaining_candidates = [candidate for candidate in candidates if _candidate_key(candidate) not in consumed_candidate_names]
    remaining_lines = [line for line in lines if _line_key(line) not in consumed_line_keys]

    if remaining_candidates or layout_groups:
        grouped_candidates = [candidate for candidate in remaining_candidates if _should_promote_group(candidate)]
        direct_candidates = [candidate for candidate in remaining_candidates if not _should_promote_group(candidate)]
        groups = [
            _group_from_candidate(
                title=title,
                page_number=page_number,
                page_id=page_id,
                section_id=section_id,
                index=index,
                candidate=candidate,
            )
            for index, candidate in enumerate(grouped_candidates)
        ]
        candidate_fields = [
            _field_from_candidate(title, page_number, page_id, section_id, index, candidate)
            for index, candidate in enumerate(direct_candidates)
        ]
        statement_lines = _merge_statement_blocks(_select_statement_lines(remaining_lines, remaining_candidates))
        statement_fields = [
            _statement_field(
                title=title,
                page_number=page_number,
                page_id=page_id,
                section_id=section_id,
                index=index,
                line=line,
                source_priority=default_source_priority[0],
            )
            for index, line in enumerate(statement_lines)
        ]
        return [*layout_groups, *groups], _merge_page_fields(candidate_fields, statement_fields)

    static_groups, static_fields = _build_static_content_groups(
        title=title,
        section_title=section_title,
        page_number=page_number,
        page_id=page_id,
        section_id=section_id,
        lines=lines,
        source_priority=default_source_priority[0],
    )
    if static_groups or static_fields:
        return layout_groups + static_groups, static_fields

    placeholder = ExtractedTextLine(
        page_number=page_number,
        text=f"No extractable text was recovered from page {page_number}.",
        confidence=0.35,
    )
    return layout_groups, [
        _statement_field(
            title=title,
            page_number=page_number,
            page_id=page_id,
            section_id=section_id,
            index=0,
            line=placeholder,
            source_priority=default_source_priority[0],
        )
    ]


def _field_from_candidate(
    title: str,
    page_number: int,
    page_id: str,
    section_id: str,
    index: int,
    candidate: ExtractedFieldCandidate,
) -> FieldNode:
    candidate_help = candidate.help_text or (candidate.notes[0] if candidate.notes else None)
    display_label, normalized_help_text = _normalize_candidate_label_and_help_text(
        candidate.label,
        candidate_help,
        candidate.semantic_type,
    )
    node_id = f"field-{page_number}-{_slugify(candidate.name)}-{index}"
    primary_bounds = candidate.source_coordinates[0] if candidate.source_coordinates else None
    evidence_bounds = candidate.label_bounds or primary_bounds
    evidence_priority = (
        [candidate.source_priority, SourcePriority.WIDGET_GEOMETRY]
        if primary_bounds is not None
        else [candidate.source_priority]
    )
    evidence = [
        EvidenceAnchor(
            anchor_id=f"ev-{page_number}-{index}",
            source_priority=candidate.source_priority,
            page=page_number,
            snippet=candidate.label,
            bounds=evidence_bounds,
            confidence=candidate.confidence,
            notes="Recovered from extraction adapter metadata.",
        )
    ]
    validations = (
        [
            ValidationRule(
                rule_id=f"{node_id}-required",
                rule_type="required",
                message=f"{display_label} is required pending review confirmation.",
            )
        ]
        if candidate.semantic_type in {SemanticType.TEXT, SemanticType.SELECT}
        else []
    )
    options = [
        ChoiceOption(
            value=_slugify(option),
            label=option,
            order_index=option_index,
            evidence=(
                [
                    EvidenceAnchor(
                        anchor_id=f"opt-ev-{page_number}-{index}-{option_index}",
                        source_priority=candidate.source_priority,
                        page=page_number,
                        snippet=option,
                        bounds=candidate.source_coordinates[option_index],
                        confidence=candidate.confidence,
                        notes="Recovered option widget location.",
                    )
                ]
                if option_index < len(candidate.source_coordinates)
                else []
            ),
        )
        for option_index, option in enumerate(candidate.options)
    ]
    return FieldNode(
        id=node_id,
        stable_key=_stable_key(title, str(page_number), candidate.name),
        order_index=index,
        lineage=[page_id, section_id],
        page_id=page_id,
        section_id=section_id,
        semantic_type=candidate.semantic_type,
        label=display_label,
        help_text=normalized_help_text,
        required=bool(validations),
        source_coordinates=candidate.source_coordinates or [Coordinates(page=page_number, x=72, y=116 + (index * 28), width=320, height=20)],
        evidence=evidence,
        confidence=candidate.confidence,
        source_priority=list(dict.fromkeys(evidence_priority)),
        source_conflicts=[],
        review_status=ReviewStatus.NEEDS_REVIEW,
        options=options,
        validations=validations,
        conditionals=[],
        renderer_hints=_renderer_hints(candidate.semantic_type),
    )


def _group_from_candidate(
    *,
    title: str,
    page_number: int,
    page_id: str,
    section_id: str,
    index: int,
    candidate: ExtractedFieldCandidate,
) -> GroupNode:
    field = _field_from_candidate(title, page_number, page_id, section_id, 0, candidate)
    candidate_help = candidate.help_text or (candidate.notes[0] if candidate.notes else None)
    display_label, normalized_help_text = _normalize_candidate_label_and_help_text(
        candidate.label,
        candidate_help,
        candidate.semantic_type,
    )
    bounds = _union_coordinates(
        [
            *candidate.source_coordinates,
            *([field.evidence[0].bounds] if field.evidence and field.evidence[0].bounds is not None else []),
        ]
    )
    evidence = [
        EvidenceAnchor(
            anchor_id=f"group-ev-{page_number}-{index}",
            source_priority=candidate.source_priority,
            page=page_number,
            snippet=candidate.label,
            bounds=bounds,
            confidence=candidate.confidence,
            notes="Recovered grouped control container.",
        )
    ]
    group_id = f"group-{page_number}-{_slugify(candidate.name)}"
    return GroupNode(
        id=group_id,
        order_index=index,
        label=display_label,
        description=normalized_help_text,
        page_id=page_id,
        section_id=section_id,
        lineage=[page_id, section_id],
        source_coordinates=[bounds] if bounds is not None else candidate.source_coordinates,
        evidence=evidence,
        fields=[field.model_copy(update={"lineage": [page_id, section_id, group_id]})],
        renderer_hints={
            "groupType": candidate.semantic_type.value,
            "optionCount": str(len(candidate.options)),
        },
    )


def _infer_fields_from_text(
    title: str,
    page_number: int,
    page_id: str,
    section_id: str,
    lines: list[ExtractedTextLine],
    default_source_priority: list[SourcePriority],
) -> list[FieldNode]:
    fields: list[FieldNode] = []
    for index, line in enumerate(lines[:8]):
        if _looks_like_prompt(line.text):
            fields.append(
                _text_input_field(
                    title=title,
                    page_number=page_number,
                    page_id=page_id,
                    section_id=section_id,
                    index=index,
                    line=line,
                    source_priority=default_source_priority[0],
                )
            )
        else:
            fields.append(
                _statement_field(
                    title=title,
                    page_number=page_number,
                    page_id=page_id,
                    section_id=section_id,
                    index=index,
                    line=line,
                    source_priority=default_source_priority[0],
                )
            )
    return fields


def _build_static_content_groups(
    *,
    title: str,
    section_title: str,
    page_number: int,
    page_id: str,
    section_id: str,
    lines: list[ExtractedTextLine],
    source_priority: SourcePriority,
) -> tuple[list[GroupNode], list[FieldNode]]:
    merged_lines = [line for line in _merge_statement_blocks(lines) if not _is_footer_or_artifact_line(line.text)]
    if not merged_lines:
        return [], []

    groups: list[GroupNode] = []
    direct_fields: list[FieldNode] = []
    index = 0

    while index < len(merged_lines):
        line = merged_lines[index]
        if _is_static_group_heading(line.text):
            supporting: list[ExtractedTextLine] = []
            next_index = index + 1
            while next_index < len(merged_lines):
                next_line = merged_lines[next_index]
                if _should_attach_heading_as_supporting(line, next_line, supporting):
                    supporting.append(next_line)
                    next_index += 1
                    continue
                if _is_static_group_heading(next_line.text):
                    break
                supporting.append(next_line)
                next_index += 1
            if supporting:
                group_id = f"group-static-{page_number}-{len(groups)}"
                group_bounds = _union_coordinates(
                    [bound for item in [line, *supporting] for bound in ([item.bounds] if item.bounds is not None else [])]
                ) or Coordinates(page=page_number, x=72, y=96, width=420, height=18)
                group_fields = [
                    _statement_field(
                        title=title,
                        page_number=page_number,
                        page_id=page_id,
                        section_id=section_id,
                        index=field_index,
                        line=supporting_line,
                        source_priority=source_priority,
                    ).model_copy(update={"lineage": [page_id, section_id, group_id], "order_index": field_index})
                    for field_index, supporting_line in enumerate(supporting)
                ]
                groups.append(
                    GroupNode(
                        id=group_id,
                        order_index=len(groups),
                        label=line.text,
                        description="Grouped from visible instruction content.",
                        page_id=page_id,
                        section_id=section_id,
                        lineage=[page_id, section_id],
                        source_coordinates=[group_bounds],
                        evidence=[_evidence_from_text_line(page_number, line, source_priority=source_priority)],
                        fields=group_fields,
                        renderer_hints={"groupType": "static_content", "fieldCount": str(len(group_fields))},
                    )
                )
                index = next_index
                continue
        direct_fields.append(
            _statement_field(
                title=title,
                page_number=page_number,
                page_id=page_id,
                section_id=section_id,
                index=len(direct_fields),
                line=line,
                source_priority=source_priority,
            )
        )
        index += 1

    if not groups and len(direct_fields) >= 2:
        group_id = f"group-static-{page_number}-fallback"
        group_bounds = _union_coordinates(
            [bound for field in direct_fields for bound in field.source_coordinates]
        ) or Coordinates(page=page_number, x=72, y=96, width=420, height=18)
        fallback_group = GroupNode(
            id=group_id,
            order_index=0,
            label=section_title,
            description="Grouped from visible section content.",
            page_id=page_id,
            section_id=section_id,
            lineage=[page_id, section_id],
            source_coordinates=[group_bounds],
            evidence=[_evidence_from_text_line(page_number, merged_lines[0], source_priority=source_priority)],
            fields=[
                field.model_copy(
                    update={
                        "lineage": [page_id, section_id, group_id],
                        "order_index": field_index,
                    }
                )
                for field_index, field in enumerate(direct_fields)
            ],
            renderer_hints={"groupType": "static_content", "fieldCount": str(len(direct_fields))},
        )
        return [fallback_group], []

    return groups, direct_fields


def _text_input_field(
    *,
    title: str,
    page_number: int,
    page_id: str,
    section_id: str,
    index: int,
    line: ExtractedTextLine,
    source_priority: SourcePriority,
) -> FieldNode:
    clean_label = re.sub(r"[:.\s_]+$", "", line.text).strip() or f"Field {index + 1}"
    node_id = f"field-{page_number}-{_slugify(clean_label)}"
    return FieldNode(
        id=node_id,
        stable_key=_stable_key(title, str(page_number), clean_label),
        order_index=index,
        lineage=[page_id, section_id],
        page_id=page_id,
        section_id=section_id,
        semantic_type=SemanticType.TEXT,
        label=clean_label,
        help_text="Inferred from visible prompt text; confirm the intended input type.",
        required=False,
        source_coordinates=[line.bounds] if line.bounds is not None else [Coordinates(page=page_number, x=72, y=120 + (index * 28), width=320, height=20)],
        evidence=[_evidence_from_text_line(page_number, line, source_priority=source_priority)],
        confidence=min(line.confidence, 0.68),
        source_priority=[source_priority],
        source_conflicts=["No fillable widget metadata was available for this inferred prompt."],
        review_status=ReviewStatus.NEEDS_REVIEW,
        options=[],
        validations=[],
        conditionals=[],
        renderer_hints={"uswdsComponent": "text-input", "inferenceMode": "layout_prompt"},
    )


def _statement_field(
    *,
    title: str,
    page_number: int,
    page_id: str,
    section_id: str,
    index: int,
    line: ExtractedTextLine,
    source_priority: SourcePriority,
) -> FieldNode:
    node_id = f"field-{page_number}-statement-{index}"
    return FieldNode(
        id=node_id,
        stable_key=_stable_key(title, str(page_number), "statement", str(index)),
        order_index=index,
        lineage=[page_id, section_id],
        page_id=page_id,
        section_id=section_id,
        semantic_type=SemanticType.STATEMENT,
        label=line.text,
        help_text="Recovered from page text for reviewer triage.",
        required=False,
        source_coordinates=[line.bounds] if line.bounds is not None else [Coordinates(page=page_number, x=72, y=120 + (index * 24), width=420, height=18)],
        evidence=[_evidence_from_text_line(page_number, line, source_priority=source_priority)],
        confidence=min(line.confidence, 0.62),
        source_priority=[source_priority],
        source_conflicts=[],
        review_status=ReviewStatus.NEEDS_REVIEW,
        options=[],
        validations=[],
        conditionals=[],
        renderer_hints={"runtimePattern": "statement"},
    )


def _build_region_groups(
    *,
    title: str,
    section_title: str,
    page_number: int,
    page_id: str,
    section_id: str,
    lines: list[ExtractedTextLine],
    candidates: list[ExtractedFieldCandidate],
    regions: list[ExtractedPageRegion],
) -> tuple[list[GroupNode], set[str], set[str]]:
    if not regions:
        return [], set(), set()

    consumed_candidates: set[str] = set()
    consumed_lines: set[str] = set()
    groups: list[GroupNode] = []

    for index, region in enumerate(sorted(regions, key=lambda item: (item.bounds.y, item.bounds.x))):
        region_candidates = [
            candidate
            for candidate in candidates
            if _candidate_key(candidate) not in consumed_candidates and _candidate_within_region(candidate, region)
        ]
        region_lines = [
            line
            for line in lines
            if _line_key(line) not in consumed_lines and _line_within_region(line, region)
        ]
        if not region_candidates and len(region_lines) < 2:
            continue

        row_slices = _subdivide_region_rows(region, region_lines, region_candidates)
        if not row_slices:
            row_slices = [{"lines": region_lines, "candidates": region_candidates, "bounds": region.bounds}]

        for row_index, row_slice in enumerate(row_slices):
            lane_slices = _subdivide_row_lanes(
                row_lines=row_slice["lines"],
                row_candidates=row_slice["candidates"],
                row_bounds=row_slice["bounds"],
            )
            if not lane_slices:
                lane_slices = [row_slice]

            for lane_index, lane_slice in enumerate(lane_slices):
                row_lines = lane_slice["lines"]
                row_candidates = lane_slice["candidates"]
                row_bounds = lane_slice["bounds"]
                if not row_candidates and len(row_lines) < 1:
                    continue

                region_label = _region_label(row_candidates, row_lines)
                if region_label is None:
                    continue

                candidate_fields = [
                    _field_from_candidate(
                        title,
                        page_number,
                        page_id,
                        section_id,
                        field_index,
                        _candidate_for_region(candidate, region_label),
                    )
                    for field_index, candidate in enumerate(row_candidates)
                ]
                statement_lines = _merge_statement_blocks(_select_region_statement_lines(row_lines, row_candidates))
                statement_fields = [
                    _statement_field(
                        title=title,
                        page_number=page_number,
                        page_id=page_id,
                        section_id=section_id,
                        index=statement_index,
                        line=line,
                        source_priority=SourcePriority.LAYOUT,
                    )
                    for statement_index, line in enumerate(statement_lines)
                ]
                fields = _merge_page_fields(candidate_fields, statement_fields)
                if not fields:
                    continue

                group_id = f"group-region-{page_number}-{index}-{row_index}-{lane_index}"
                group_bounds = _union_coordinates(
                    [row_bounds, *[coordinate for field in fields for coordinate in field.source_coordinates]]
                ) or row_bounds
                group_fields = [
                    field.model_copy(
                        update={
                            "lineage": [page_id, section_id, group_id],
                            "order_index": field_index,
                        }
                    )
                    for field_index, field in enumerate(fields)
                ]
                normalized_group_label, normalized_group_fields = _normalize_region_group_content(
                    region_label,
                    group_fields,
                    section_title=section_title,
                )
                if _is_trivial_region_group_label(region_label) and groups:
                    previous_group = groups[-1]
                    if previous_group.page_id == page_id and previous_group.section_id == section_id:
                        merged_fields = [
                            *previous_group.fields,
                            *[
                                field.model_copy(
                                    update={
                                        "lineage": [page_id, section_id, previous_group.id],
                                        "order_index": len(previous_group.fields) + field_index,
                                    }
                                )
                                for field_index, field in enumerate(normalized_group_fields)
                            ],
                        ]
                        merged_bounds = _union_coordinates([*previous_group.source_coordinates, group_bounds]) or group_bounds
                        groups[-1] = previous_group.model_copy(
                            update={
                                "fields": merged_fields,
                                "source_coordinates": [merged_bounds],
                                "renderer_hints": {
                                    **previous_group.renderer_hints,
                                    "fieldCount": str(len(merged_fields)),
                                },
                            }
                        )
                        continue
                groups.append(
                    GroupNode(
                        id=group_id,
                        order_index=len(groups),
                        label=normalized_group_label,
                        description=_region_description(row_lines, row_candidates, normalized_group_label),
                        page_id=page_id,
                        section_id=section_id,
                        lineage=[page_id, section_id],
                        source_coordinates=[group_bounds],
                        evidence=[
                            EvidenceAnchor(
                                anchor_id=f"region-ev-{page_number}-{index}-{row_index}-{lane_index}",
                                source_priority=SourcePriority.LAYOUT,
                                page=page_number,
                                snippet=normalized_group_label,
                                bounds=group_bounds,
                                confidence=min(
                                    0.88,
                                    max((field.confidence for field in normalized_group_fields), default=0.62),
                                ),
                                notes="Recovered from bounded page region and grouped child evidence.",
                            )
                        ],
                        fields=normalized_group_fields,
                        renderer_hints={
                            "groupType": "layout_region",
                            "regionSource": region.kind,
                            "fieldCount": str(len(normalized_group_fields)),
                            "regionRowIndex": str(row_index),
                            "regionLaneIndex": str(lane_index),
                        },
                    )
                )
                consumed_candidates.update(_candidate_key(candidate) for candidate in row_candidates)
                consumed_lines.update(_line_key(line) for line in row_lines)

    return groups, consumed_candidates, consumed_lines


def _normalize_region_group_content(
    region_label: str,
    group_fields: list[FieldNode],
    *,
    section_title: str | None = None,
) -> tuple[str, list[FieldNode]]:
    if not group_fields:
        return region_label, group_fields

    primary_index = next((index for index, field in enumerate(group_fields) if _field_is_structured_control(field)), None)
    if primary_index is None:
        raw_cleaned_label = _clean_group_label_text(region_label)
        cleaned_label, extracted_group_help = _split_long_group_label_and_help(raw_cleaned_label)
        retained_fields = [
            field
            for field in group_fields
            if not (field.semantic_type == SemanticType.STATEMENT and _is_discardable_group_statement(field.label))
        ]
        line_counter_group = _normalize_line_counter_text_group(
            cleaned_label,
            [
                field.model_copy(update={"order_index": index})
                for index, field in enumerate(retained_fields or group_fields)
            ],
        )
        if line_counter_group is not None:
            normalized_label, normalized_fields = line_counter_group
            return normalized_label, [
                field.model_copy(update={"order_index": index})
                for index, field in enumerate(normalized_fields)
            ]
        statement_only_group = _normalize_statement_only_group(
            cleaned_label,
            [
                field.model_copy(update={"order_index": index})
                for index, field in enumerate(retained_fields or group_fields)
            ],
        )
        if statement_only_group is not None:
            normalized_label, normalized_fields = statement_only_group
            return normalized_label, [
                field.model_copy(update={"order_index": index})
                for index, field in enumerate(normalized_fields)
            ]
        normalized_label, normalized_fields = _normalize_text_prompt_group(
            cleaned_label,
            [
                field.model_copy(update={"order_index": index})
                for index, field in enumerate(retained_fields or group_fields)
            ],
            section_title=section_title,
        )
        if extracted_group_help:
            normalized_fields = _apply_group_prompt_help_to_duplicate_fields(
                raw_cleaned_label,
                normalized_label,
                normalized_fields,
                extracted_group_help,
            )
        normalized_label, normalized_fields = _normalize_followup_range_fields(
            normalized_label,
            normalized_fields,
        )
        normalized_label, normalized_fields = _normalize_signature_date_group(
            normalized_label,
            normalized_fields,
        )
        return normalized_label, [
            field.model_copy(update={"order_index": index})
            for index, field in enumerate(normalized_fields)
        ]

    primary_field = group_fields[primary_index]
    primary_anchor = _field_anchor(primary_field)

    prompt_statement_indexes: list[int] = []
    pre_prompt_parts: list[str] = []
    post_prompt_parts: list[str] = []
    for index, field in enumerate(group_fields):
        if field.semantic_type != SemanticType.STATEMENT:
            continue
        anchor = _field_anchor(field)
        if not _is_prompt_fragment_statement(field.label, anchor=anchor, primary_anchor=primary_anchor):
            continue
        prompt_statement_indexes.append(index)
        if anchor.y <= primary_anchor.y + 4 and (_label_prefix(field.label) is not None or _looks_like_question(field.label)):
            pre_prompt_parts.append(field.label)
        else:
            post_prompt_parts.append(field.label)

    merged_group_label = _merge_prompt_parts([*pre_prompt_parts, primary_field.label, region_label, *post_prompt_parts])
    if not merged_group_label:
        merged_group_label = region_label
    merged_group_label = _clean_group_label_text(merged_group_label)
    raw_merged_group_label = merged_group_label
    has_secondary_controls = any(
        index != primary_index and field.semantic_type != SemanticType.STATEMENT
        for index, field in enumerate(group_fields)
    )
    extracted_group_help = None
    if has_secondary_controls:
        merged_group_label, extracted_group_help = _split_long_group_label_and_help(merged_group_label)
        extracted_group_help = _strip_help_overlap(
            extracted_group_help,
            [field.label for field in group_fields if field.semantic_type == SemanticType.STATEMENT],
        )
    merged_group_label, group_fields = _normalize_binary_choice_option_texts(
        merged_group_label,
        group_fields,
        primary_index=primary_index,
        section_title=section_title,
    )

    normalized_group = _normalize_text(merged_group_label)
    retained_fields: list[FieldNode] = []

    for index, field in enumerate(group_fields):
        if index == primary_index:
            retained_fields.append(
                field.model_copy(
                    update={
                        "label": merged_group_label,
                        "help_text": _merge_help_text_details([extracted_group_help, field.help_text]),
                        "evidence": _rewrite_field_evidence_snippets(field.evidence, merged_group_label),
                    }
                )
            )
            continue

        if field.semantic_type == SemanticType.STATEMENT:
            if _is_discardable_group_statement(field.label):
                continue
            normalized_label = _normalize_text(field.label)
            if index in prompt_statement_indexes and normalized_label and normalized_label in normalized_group:
                continue
            if _statement_duplicates_neighbor_field(field, group_fields):
                continue

        retained_fields.append(field)

    if extracted_group_help:
        retained_fields = _apply_group_prompt_help_to_duplicate_fields(
            raw_merged_group_label,
            merged_group_label,
            retained_fields,
            extracted_group_help,
        )

    merged_group_label, retained_fields = _normalize_followup_range_fields(
        merged_group_label,
        retained_fields,
    )
    merged_group_label, retained_fields = _normalize_signature_date_group(
        merged_group_label,
        retained_fields,
    )

    if not retained_fields:
        retained_fields.append(
            primary_field.model_copy(
                update={
                    "label": merged_group_label,
                    "help_text": _merge_help_text_details([extracted_group_help, primary_field.help_text]),
                    "evidence": _rewrite_field_evidence_snippets(primary_field.evidence, merged_group_label),
                }
            )
        )

    return merged_group_label, [
        field.model_copy(update={"order_index": index})
        for index, field in enumerate(retained_fields)
    ]


def _normalize_binary_choice_option_texts(
    group_label: str,
    group_fields: list[FieldNode],
    *,
    primary_index: int,
    section_title: str | None,
) -> tuple[str, list[FieldNode]]:
    primary_field = group_fields[primary_index]
    if primary_field.semantic_type != SemanticType.RADIO:
        return group_label, group_fields

    option_map = {_normalize_text(option.label): option for option in primary_field.options}
    if not option_map or not {"yes", "no"}.issubset(option_map):
        return group_label, group_fields

    no_text = group_label if group_label.startswith("No,") else None
    yes_text: str | None = None
    consumed_statement_indexes: set[int] = set()
    later_option_prefixes: list[str] = []
    for index, field in enumerate(group_fields):
        if field.semantic_type != SemanticType.STATEMENT:
            continue
        raw_label = re.sub(r"\s+", " ", field.label).strip()
        cleaned = _clean_field_label_text(field.label)
        branch_match = re.search(r"(?<![A-Za-z0-9])(No,|Yes,)", raw_label)
        if cleaned.startswith("No,") and no_text is None:
            no_text = cleaned
            consumed_statement_indexes.add(index)
            if branch_match is not None and branch_match.start() > 0:
                later_option_prefixes.append(raw_label[: branch_match.start()].strip(" ,;"))
        elif cleaned.startswith("Yes,") and yes_text is None:
            yes_text = cleaned
            consumed_statement_indexes.add(index)
            if branch_match is not None and branch_match.start() > 0:
                later_option_prefixes.append(raw_label[: branch_match.start()].strip(" ,;"))

    if no_text is None or yes_text is None:
        return group_label, group_fields

    supporting_statement_texts = [
        _clean_field_label_text(field.label)
        for index, field in enumerate(group_fields)
        if field.semantic_type == SemanticType.STATEMENT and index not in consumed_statement_indexes
    ]
    no_text = _strip_binary_option_leakage(no_text, supporting_statement_texts, later_option_prefixes)
    yes_text = _strip_binary_option_leakage(yes_text, supporting_statement_texts, later_option_prefixes)

    rewritten_options: list[ChoiceOption] = []
    for option in primary_field.options:
        normalized = _normalize_text(option.label)
        if normalized == "no":
            rewritten_options.append(option.model_copy(update={"label": no_text}))
        elif normalized == "yes":
            rewritten_options.append(option.model_copy(update={"label": yes_text}))
        else:
            rewritten_options.append(option)

    replacement_label = _section_group_label(section_title) if section_title else group_label
    rewritten_primary = primary_field.model_copy(
        update={
            "label": replacement_label,
            "options": rewritten_options,
            "evidence": _rewrite_field_evidence_snippets(primary_field.evidence, replacement_label),
        }
    )

    rewritten_fields: list[FieldNode] = []
    for index, field in enumerate(group_fields):
        if index == primary_index:
            rewritten_fields.append(rewritten_primary)
            continue
        if index in consumed_statement_indexes:
            continue
        if field.semantic_type == SemanticType.STATEMENT and _is_binary_choice_supporting_statement(field.label):
            continue
        rewritten_fields.append(field)

    return replacement_label, rewritten_fields


def _normalize_text_prompt_group(
    group_label: str,
    group_fields: list[FieldNode],
    *,
    section_title: str | None,
) -> tuple[str, list[FieldNode]]:
    text_fields = [field for field in group_fields if field.semantic_type == SemanticType.TEXT]
    if len(text_fields) != 1 or any(field.semantic_type not in {SemanticType.TEXT, SemanticType.STATEMENT} for field in group_fields):
        return group_label, group_fields

    text_field = text_fields[0]
    if _looks_like_matrix_value_label(text_field.label):
        return group_label, group_fields
    prompt_candidates = [group_label]
    statement_labels = [
        field.label
        for field in group_fields
        if field.semantic_type == SemanticType.STATEMENT and not _is_currency_marker_text(field.label)
    ]
    prompt_candidates.extend(statement_labels)
    if _text_field_label_supports_group_prompt(text_field.label):
        prompt_candidates.append(text_field.label)

    merged_group_label = _clean_group_label_text(_merge_prompt_parts(prompt_candidates) or group_label)
    if not merged_group_label:
        merged_group_label = group_label
    merged_group_label = _trim_prompt_value_group_label(merged_group_label)

    concise_field_label = _compact_prompt_value_field_label(
        merged_group_label,
        fallback_label=text_field.label,
        section_title=section_title,
    )
    help_text = _prompt_value_help_text(statement_labels)

    rewritten_field = text_field.model_copy(
        update={
            "label": concise_field_label,
            "help_text": help_text or text_field.help_text,
            "evidence": _rewrite_field_evidence_snippets(text_field.evidence, concise_field_label),
            "renderer_hints": {
                **text_field.renderer_hints,
                "promptValuePair": "true",
            },
        }
    )
    return merged_group_label, [rewritten_field.model_copy(update={"order_index": 0})]


def _normalize_followup_range_fields(
    group_label: str,
    group_fields: list[FieldNode],
) -> tuple[str, list[FieldNode]]:
    statement_fields = [field for field in group_fields if field.semantic_type == SemanticType.STATEMENT]
    if not any(_normalize_text(field.label) == "from" for field in statement_fields):
        return group_label, group_fields
    if not any(_normalize_text(field.label) == "to" for field in statement_fields):
        return group_label, group_fields

    text_fields = [field for field in group_fields if field.semantic_type == SemanticType.TEXT]
    if len(text_fields) < 2:
        return group_label, group_fields

    range_candidates = [field for field in text_fields if _is_followup_range_candidate_field(field)]
    if len(range_candidates) < 2:
        return group_label, group_fields

    from_statement = next((field for field in statement_fields if _normalize_text(field.label) == "from"), None)
    to_statement = next((field for field in statement_fields if _normalize_text(field.label) == "to"), None)
    if from_statement is None or to_statement is None:
        return group_label, group_fields

    remaining_candidates = list(range_candidates)
    from_field = min(
        remaining_candidates,
        key=lambda field: abs(_field_anchor(field).x - _field_anchor(from_statement).x),
    )
    remaining_candidates.remove(from_field)
    if not remaining_candidates:
        return group_label, group_fields
    to_field = min(
        remaining_candidates,
        key=lambda field: abs(_field_anchor(field).x - _field_anchor(to_statement).x),
    )
    if from_field.id == to_field.id:
        return group_label, group_fields

    help_parts: list[str | None] = []
    for field in statement_fields:
        normalized = _normalize_text(field.label)
        if normalized in {"from", "to"}:
            continue
        if field.label.strip().upper().startswith("NOTE:"):
            help_parts.append(re.sub(r"^\s*NOTE:\s*", "", field.label, flags=re.IGNORECASE))
            continue
        if "whendid" in normalized or "whenwere" in normalized:
            help_parts.append(field.label)
    for field in (from_field, to_field):
        if _normalize_text(field.label) == "enter2digitmonthand4digityear":
            help_parts.append(field.label)
    shared_help = _merge_help_text_details(help_parts)

    rewritten_fields: list[FieldNode] = []
    for field in group_fields:
        if field.id == from_field.id:
            rewritten_fields.append(
                field.model_copy(
                    update={
                        "label": "From",
                        "help_text": _merge_help_text_details([shared_help, field.help_text]),
                        "evidence": _rewrite_field_evidence_snippets(field.evidence, "From"),
                    }
                )
            )
            continue
        if field.id == to_field.id:
            rewritten_fields.append(
                field.model_copy(
                    update={
                        "label": "To",
                        "help_text": _merge_help_text_details([shared_help, field.help_text]),
                        "evidence": _rewrite_field_evidence_snippets(field.evidence, "To"),
                    }
                )
            )
            continue
        if field.semantic_type == SemanticType.STATEMENT and _normalize_text(field.label) in {"from", "to"}:
            continue
        if field.semantic_type == SemanticType.STATEMENT and field.label.strip().upper().startswith("NOTE:"):
            continue
        rewritten_fields.append(field)

    return group_label, [
        field.model_copy(update={"order_index": index})
        for index, field in enumerate(rewritten_fields)
    ]


def _normalize_signature_date_group(
    group_label: str,
    group_fields: list[FieldNode],
) -> tuple[str, list[FieldNode]]:
    text_fields = [field for field in group_fields if field.semantic_type == SemanticType.TEXT]
    if len(text_fields) != 2:
        return group_label, group_fields

    statement_fields = [field for field in group_fields if field.semantic_type == SemanticType.STATEMENT]
    if not any("signatureofapplicant" in _normalize_text(field.label) for field in statement_fields):
        return group_label, group_fields
    if not any(_normalize_text(field.label) == "date" for field in statement_fields):
        return group_label, group_fields

    date_field = next(
        (field for field in text_fields if "dateofsignature" in _normalize_text(field.label)),
        None,
    )
    if date_field is None:
        date_field = max(text_fields, key=lambda field: _field_anchor(field).x)
    signature_field = next(field for field in text_fields if field.id != date_field.id)

    signature_help = _merge_help_text_details(
        [
            next(
                (
                    field.label
                    for field in statement_fields
                    if "signinink" in _normalize_text(field.label)
                ),
                None,
            ),
            signature_field.help_text,
        ]
    )
    date_help = _merge_help_text_details(
        [
            next(
                (
                    field.label
                    for field in statement_fields
                    if "mmddyyyy" in _normalize_text(field.label)
                ),
                None,
            ),
            date_field.help_text,
        ]
    )

    rewritten_fields: list[FieldNode] = []
    for field in group_fields:
        normalized = _normalize_text(field.label)
        if field.id == signature_field.id:
            rewritten_fields.append(
                field.model_copy(
                    update={
                        "label": "Signature Of Applicant",
                        "help_text": signature_help,
                        "evidence": _rewrite_field_evidence_snippets(field.evidence, "Signature Of Applicant"),
                    }
                )
            )
            continue
        if field.id == date_field.id:
            rewritten_fields.append(
                field.model_copy(
                    update={
                        "label": "Date Of Signature",
                        "help_text": date_help,
                        "evidence": _rewrite_field_evidence_snippets(field.evidence, "Date Of Signature"),
                    }
                )
            )
            continue
        if field.semantic_type == SemanticType.STATEMENT and (
            normalized == "date"
            or "signatureofapplicant" in normalized
            or "signinink" in normalized
            or "mmddyyyy" in normalized
        ):
            continue
        rewritten_fields.append(field)

    return "Applicant Signature And Date", [
        field.model_copy(update={"order_index": index})
        for index, field in enumerate(rewritten_fields)
    ]


def _strip_binary_option_leakage(
    text: str,
    supporting_statement_texts: list[str],
    later_option_prefixes: list[str],
) -> str:
    cleaned = text
    for statement in supporting_statement_texts:
        if statement and statement in cleaned:
            cleaned = cleaned.replace(statement, " ")
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,;")
    return re.sub(r"\s+", " ", cleaned).strip(" ,;")


def _is_binary_choice_supporting_statement(text: str) -> bool:
    cleaned = _clean_field_label_text(text)
    if cleaned.startswith(("Yes,", "No,")):
        return False
    return bool(
        re.match(
            r"^(?:Disclosure allows|Veterans are not required|Veterans who choose not to disclose|Recent Combat Veterans)",
            cleaned,
            flags=re.IGNORECASE,
        )
    )


def _text_field_label_supports_group_prompt(label: str) -> bool:
    cleaned = _clean_field_label_text(label)
    normalized = _normalize_text(cleaned)
    if not normalized or normalized in {"homephonenumber", "amount"}:
        return False
    if _looks_machine_label(cleaned) or _matrix_role_label_from_text(cleaned) is not None:
        return False
    return len(normalized) >= 10


def _looks_like_matrix_value_label(text: str) -> bool:
    return bool(
        re.search(
            r"\b(?:VETERAN|SPOUSE|CHILD\s+\d+|DEPENDENT CHILD(?:\s+\d+)?)\b.*\b"
            r"(?:GROSS ANNUAL INCOME|NET INCOME|OTHER INCOME)\b",
            text,
            flags=re.IGNORECASE,
        )
    )


def _is_followup_range_candidate_field(field: FieldNode) -> bool:
    normalized = _normalize_text(field.label)
    if normalized == "enter2digitmonthand4digityear":
        return True
    if normalized.endswith("to"):
        return True
    return "whendid" in normalized or "whenwere" in normalized


def _compact_prompt_value_field_label(
    group_label: str,
    *,
    fallback_label: str,
    section_title: str | None,
) -> str:
    prompt = _clean_group_label_text(group_label)
    stripped = re.sub(r"^\s*\d+[A-Z]?\.\s*", "", prompt).strip()
    stripped = re.sub(r"\s*\((?:MM/DD/YYYY|Check one\.?|Include area code)\)\s*$", "", stripped, flags=re.IGNORECASE)
    stripped = re.sub(r"\s*\(Complete if employed or retired[^)]*\)\s*$", "", stripped, flags=re.IGNORECASE)
    stripped = re.sub(r"\s*\((?:Street,\s*City,\s*State,\s*ZIP)\s*\)\s*$", "", stripped, flags=re.IGNORECASE)
    stripped = re.sub(r"\s*\(\(?\d{3}\)?\s*\d{3}-\d{4}\)\s*$", "", stripped)
    base_prompt = re.sub(r"\s*\([^)]*\)", "", stripped).strip(" ,.;:-")
    if re.search(r"\b(AMOUNT|TOTAL)\b", stripped, flags=re.IGNORECASE):
        return "Amount"
    if base_prompt and re.search(
        r"\b(COMPANY NAME|COMPANY ADDRESS|COMPANY PHONE NUMBER|DATE OF RETIREMENT)\b",
        base_prompt,
        flags=re.IGNORECASE,
    ):
        return _title_case_label(base_prompt)
    if base_prompt and len(_normalize_text(base_prompt)) >= 8 and len(base_prompt) <= 40:
        return _title_case_label(base_prompt)
    if stripped:
        return _title_case_label(stripped)
    fallback = _clean_field_label_text(fallback_label)
    if fallback:
        return _title_case_label(fallback)
    if section_title:
        return _title_case_label(_section_group_label(section_title))
    return "Value"


def _prompt_value_help_text(statement_labels: list[str]) -> str | None:
    details: list[str] = []
    for label in statement_labels:
        cleaned = re.sub(r"\s+", " ", label).strip(" ,;")
        if not cleaned:
            continue
        if cleaned.startswith("(") and cleaned.endswith(")"):
            matches = re.findall(r"\(([^)]+)\)", cleaned)
            if matches:
                details.extend(match.strip() for match in matches if match.strip())
            else:
                detail = cleaned.strip("() ").strip()
                if detail:
                    details.append(detail)
            continue
        matches = re.findall(r"\(([^)]+)\)", cleaned)
        for match in matches:
            detail = match.strip()
            if detail and re.search(r"[A-Za-z]", detail):
                details.append(detail)
        upper_instruction = re.search(r"\b(DO NOT LIST[^.]*\.)", cleaned, flags=re.IGNORECASE)
        if upper_instruction is not None:
            details.append(upper_instruction.group(1).strip())
        va_instruction = re.search(r"\b(VA will calculate[^.]*\.)", cleaned, flags=re.IGNORECASE)
        if va_instruction is not None:
            details.append(va_instruction.group(1).strip())
    if not details:
        return None
    return "; ".join(dict.fromkeys(details))


def _trim_prompt_value_group_label(text: str) -> str:
    cleaned = _clean_group_label_text(text)
    cleaned = re.sub(r"\s+VA will calculate.*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+DO NOT LIST.*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*\(Also enter[^)]*\)\s*$", "", cleaned, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", cleaned).strip(" ,;")


def _title_case_label(text: str) -> str:
    words: list[str] = []
    for word in text.split():
        normalized = re.sub(r"[^A-Za-z0-9]+", "", word)
        if normalized.upper() in {"VA", "ZIP", "MM", "DD", "YYYY"}:
            words.append(normalized.upper())
            continue
        if "/" in word:
            words.append(word.upper())
            continue
        words.append(word.capitalize())
    return " ".join(words)


def _build_issues(
    classification: ClassificationResult,
    context: ExtractionContext,
    pages: list[PageNode],
) -> list[ExtractionIssue]:
    issues: list[ExtractionIssue] = []

    if not context.field_candidates and not context.xfa_field_hints:
        first_field_id = _first_page_field_id(pages)
        issues.append(
            ExtractionIssue(
                code=IssueCode.AMBIGUOUS_FIELD_TYPE,
                severity="warning",
                message="No explicit fillable widgets were detected; this draft was inferred from page text.",
                node_id=first_field_id,
                suggested_action="Confirm which text lines are prompts, instructions, or true input fields.",
            )
        )

    if context.xfa_field_hints and not context.field_candidates:
        issues.append(
            ExtractionIssue(
                code=IssueCode.LABEL_MISMATCH,
                severity="info",
                message="XFA metadata was recovered without matching widget fields; labels may need manual cleanup.",
                suggested_action="Compare the XFA-derived field names against the visible PDF content.",
            )
        )

    if any(hint.table_count for hint in context.table_hints):
        issues.append(
            ExtractionIssue(
                code=IssueCode.HEURISTIC_APPLIED,
                severity="info",
                message="Tabular page structure was detected and may imply grouped or repeatable semantics.",
                suggested_action="Review table-heavy pages for repeatable groups before accepting the draft.",
            )
        )

    if classification.document_class == DocumentClass.SCANNED:
        issues.append(
            ExtractionIssue(
                code=IssueCode.AMBIGUOUS_FIELD_TYPE,
                severity="warning",
                message="Scanned or image-heavy pages require OCR-led review before field semantics are trusted.",
                suggested_action="Verify OCR output and confirm field ordering against the page image.",
            )
        )
    if classification.document_class == DocumentClass.MIXED:
        issues.append(
            ExtractionIssue(
                code=IssueCode.ORDER_CONFLICT,
                severity="warning",
                message="Mixed page modes were detected during ingestion and may affect logical order fidelity.",
                suggested_action="Review page-by-page ordering before accepting the draft.",
            )
        )

    return issues


def _subdivide_region_rows(
    region: ExtractedPageRegion,
    region_lines: list[ExtractedTextLine],
    region_candidates: list[ExtractedFieldCandidate],
) -> list[dict[str, object]]:
    anchors = _region_row_anchors(region_lines, region_candidates)
    if len(anchors) <= 1:
        return []

    slices: list[dict[str, object]] = []
    sorted_lines = sorted(
        [line for line in region_lines if line.bounds is not None],
        key=lambda line: (line.bounds.y, line.bounds.x),
    )

    for anchor_index, anchor in enumerate(anchors):
        start_y = anchor["start_y"]
        end_y = anchors[anchor_index + 1]["start_y"] if anchor_index + 1 < len(anchors) else region.bounds.y + region.bounds.height + 1
        row_lines = [
            line
            for line in sorted_lines
            if line.bounds is not None and line.bounds.y >= start_y and line.bounds.y < end_y
        ]
        row_candidates = [
            candidate
            for candidate in region_candidates
            if _candidate_anchor_y(candidate) >= start_y and _candidate_anchor_y(candidate) < end_y
        ]
        if not row_lines and not row_candidates:
            continue
        row_bounds = _slice_bounds(region.bounds, row_lines, row_candidates, start_y, end_y)
        slices.append({"lines": row_lines, "candidates": row_candidates, "bounds": row_bounds})

    return slices


def _subdivide_row_lanes(
    *,
    row_lines: list[ExtractedTextLine],
    row_candidates: list[ExtractedFieldCandidate],
    row_bounds: Coordinates,
) -> list[dict[str, object]]:
    prompt_lines = [
        line
        for line in sorted(
            row_lines,
            key=lambda value: (value.bounds.x if value.bounds else 10_000, value.bounds.y if value.bounds else 10_000),
        )
        if line.bounds is not None and _is_primary_row_anchor_line(line.text)
    ]
    if len(prompt_lines) <= 1:
        return []

    anchors: list[float] = []
    for line in prompt_lines:
        anchor_x = line.bounds.x if line.bounds is not None else 0.0
        if anchors and abs(anchor_x - anchors[-1]) <= 48.0:
            continue
        anchors.append(anchor_x)
    if len(anchors) <= 1:
        return []

    boundaries = [row_bounds.x]
    for index in range(len(anchors) - 1):
        boundaries.append((anchors[index] + anchors[index + 1]) / 2)
    boundaries.append(row_bounds.x + row_bounds.width)

    lanes: list[dict[str, object]] = []
    for lane_index in range(len(boundaries) - 1):
        start_x = boundaries[lane_index]
        end_x = boundaries[lane_index + 1]
        lane_lines = [
            line
            for line in row_lines
            if line.bounds is not None
            and _coordinate_center_x(line.bounds) >= start_x - 2.0
            and _coordinate_center_x(line.bounds) < end_x + 2.0
        ]
        lane_candidates = [
            candidate
            for candidate in row_candidates
            if candidate.source_coordinates
            and _coordinate_center_x(candidate.source_coordinates[0]) >= start_x - 2.0
            and _coordinate_center_x(candidate.source_coordinates[0]) < end_x + 2.0
        ]
        if not lane_lines and not lane_candidates:
            continue
        lanes.append(
            {
                "lines": lane_lines,
                "candidates": lane_candidates,
                "bounds": _slice_lane_bounds(row_bounds, lane_lines, lane_candidates, start_x, end_x),
            }
        )
    return lanes


def _region_row_anchors(
    region_lines: list[ExtractedTextLine],
    region_candidates: list[ExtractedFieldCandidate],
) -> list[dict[str, float | str]]:
    anchors: list[dict[str, float | str]] = []

    for line in sorted(region_lines, key=lambda value: (value.bounds.y if value.bounds else 10_000, value.bounds.x if value.bounds else 10_000)):
        if line.bounds is None or not _is_primary_row_anchor_line(line.text):
            continue
        anchors.append({"kind": "line", "start_y": max(line.bounds.y - 6.0, 0.0), "label": line.text})

    for candidate in region_candidates:
        if not candidate.source_coordinates or not _is_primary_candidate_anchor(candidate):
            continue
        anchor_y = max(candidate.source_coordinates[0].y - 8.0, 0.0)
        if any(abs(float(anchor["start_y"]) - anchor_y) <= 36.0 for anchor in anchors):
            continue
        anchors.append({"kind": "candidate", "start_y": anchor_y, "label": candidate.label})

    anchors.sort(key=lambda item: float(item["start_y"]))

    deduped: list[dict[str, float | str]] = []
    for anchor in anchors:
        if deduped and abs(float(anchor["start_y"]) - float(deduped[-1]["start_y"])) <= 24.0:
            continue
        deduped.append(anchor)
    return deduped


def _is_primary_row_anchor_line(text: str) -> bool:
    stripped = text.strip()
    normalized = _normalize_text(stripped)
    if not stripped or normalized in {"yes", "no", "from", "to"}:
        return False
    if stripped.startswith("SECTION "):
        return False
    if stripped.endswith("(Check yes or no)") and "?" not in stripped:
        return False
    if stripped.startswith("NOTE:"):
        return False
    return bool(re.match(r"^(?:\d+[A-Z]?|[A-Z])\.\s+", stripped))


def _is_primary_candidate_anchor(candidate: ExtractedFieldCandidate) -> bool:
    if candidate.semantic_type not in {SemanticType.CHECKBOX, SemanticType.RADIO, SemanticType.SELECT}:
        return False
    normalized = _normalize_text(candidate.label)
    if normalized in {"yes", "no", "from", "to"}:
        return False
    if len(candidate.label) < 8:
        return False
    return _looks_like_question(candidate.label) or bool(re.match(r"^(?:\d+[A-Z]?|[A-Z])\.\s+", candidate.label.strip()))


def _is_trivial_region_group_label(label: str) -> bool:
    return _normalize_text(label) in {"from", "to", "yes", "no"}


def _slice_bounds(
    region_bounds: Coordinates,
    row_lines: list[ExtractedTextLine],
    row_candidates: list[ExtractedFieldCandidate],
    start_y: float,
    end_y: float,
) -> Coordinates:
    coordinates: list[Coordinates] = []
    for line in row_lines:
        if line.bounds is not None:
            coordinates.append(line.bounds)
    for candidate in row_candidates:
        coordinates.extend(candidate.source_coordinates)

    if coordinates:
        left = min([region_bounds.x, *[coordinate.x for coordinate in coordinates]])
        top = min([max(start_y, region_bounds.y), *[coordinate.y for coordinate in coordinates]])
        right = max([region_bounds.x + region_bounds.width, *[coordinate.x + coordinate.width for coordinate in coordinates]])
        content_bottom = max([coordinate.y + coordinate.height for coordinate in coordinates])
        bottom = min(max(content_bottom + 6.0, start_y + 12.0), min(end_y, region_bounds.y + region_bounds.height))
        return Coordinates(
            page=region_bounds.page,
            x=left,
            y=top,
            width=max(right - left, 1.0),
            height=max(bottom - top, 1.0),
        )

    return Coordinates(
        page=region_bounds.page,
        x=region_bounds.x,
        y=max(start_y, region_bounds.y),
        width=region_bounds.width,
        height=max(min(end_y, region_bounds.y + region_bounds.height) - max(start_y, region_bounds.y), 1.0),
    )


def _slice_lane_bounds(
    row_bounds: Coordinates,
    lane_lines: list[ExtractedTextLine],
    lane_candidates: list[ExtractedFieldCandidate],
    start_x: float,
    end_x: float,
) -> Coordinates:
    coordinates: list[Coordinates] = []
    for line in lane_lines:
        if line.bounds is not None:
            coordinates.append(line.bounds)
    for candidate in lane_candidates:
        coordinates.extend(candidate.source_coordinates)

    if coordinates:
        left = min([max(start_x, row_bounds.x), *[coordinate.x for coordinate in coordinates]])
        top = min([row_bounds.y, *[coordinate.y for coordinate in coordinates]])
        right = max([min(end_x, row_bounds.x + row_bounds.width), *[coordinate.x + coordinate.width for coordinate in coordinates]])
        bottom = max([row_bounds.y + row_bounds.height, *[coordinate.y + coordinate.height for coordinate in coordinates]])
        return Coordinates(
            page=row_bounds.page,
            x=left,
            y=top,
            width=max(right - left, 1.0),
            height=max(bottom - top, 1.0),
        )

    return Coordinates(
        page=row_bounds.page,
        x=max(start_x, row_bounds.x),
        y=row_bounds.y,
        width=max(min(end_x, row_bounds.x + row_bounds.width) - max(start_x, row_bounds.x), 1.0),
        height=row_bounds.height,
    )


def _build_source_conflicts(
    classification: ClassificationResult,
    context: ExtractionContext,
) -> list[str]:
    conflicts: list[str] = []
    if classification.document_class == DocumentClass.XFA_BACKED and context.text_lines:
        conflicts.append("Layout text was used to supplement XFA-backed extraction evidence.")
    if context.xfa_field_hints and not context.field_candidates:
        conflicts.append("XFA field hints were available without matching AcroForm widget metadata.")
    if not context.text_lines:
        conflicts.append("No visible page text was recovered during extraction.")
    return conflicts


def _split_page_sections(
    lines: list[ExtractedTextLine],
    candidates: list[ExtractedFieldCandidate],
    regions: list[ExtractedPageRegion],
    page_number: int = 1,
) -> list[dict[str, object]]:
    ordered_lines = sorted(lines, key=lambda line: _coordinate_sort_key(line.bounds, fallback_y=10_000, fallback_x=0))
    headings = [line for line in ordered_lines if _is_section_heading(line)]
    if not headings:
        return [
            {
                "title": _section_title(lines, candidates, page_number),
                "lines": lines,
                "candidates": candidates,
                "regions": regions,
            }
        ]

    slices: list[dict[str, object]] = []
    for index, heading in enumerate(headings):
        start_y = heading.bounds.y if heading.bounds is not None else -1
        next_heading = headings[index + 1] if index + 1 < len(headings) else None
        end_y = next_heading.bounds.y if next_heading and next_heading.bounds is not None else float("inf")
        section_lines = [
            line
            for line in ordered_lines
            if _line_within_y_range(line, start_y, end_y) or (index == 0 and _line_within_y_range(line, -1, end_y))
        ]
        section_candidates = [
            candidate
            for candidate in candidates
            if _candidate_anchor_y(candidate) >= start_y and _candidate_anchor_y(candidate) < end_y
        ]
        section_regions = [
            region
            for region in regions
            if region.bounds.y >= start_y and region.bounds.y < end_y
        ]
        slices.append(
            {
                "title": heading.text,
                "lines": section_lines,
                "candidates": section_candidates,
                "regions": section_regions,
            }
        )

    return slices


def _group_text_lines(lines: list[ExtractedTextLine]) -> dict[int, list[ExtractedTextLine]]:
    grouped: dict[int, list[ExtractedTextLine]] = {}
    for line in lines:
        grouped.setdefault(line.page_number, []).append(line)
    return grouped


def _group_field_candidates(candidates: list[ExtractedFieldCandidate]) -> dict[int, list[ExtractedFieldCandidate]]:
    grouped: dict[int, list[ExtractedFieldCandidate]] = {}
    for candidate in candidates:
        grouped.setdefault(candidate.page_number, []).append(candidate)
    return grouped


def _group_page_regions(regions: list[ExtractedPageRegion]) -> dict[int, list[ExtractedPageRegion]]:
    grouped: dict[int, list[ExtractedPageRegion]] = {}
    for region in regions:
        grouped.setdefault(region.page_number, []).append(region)
    return grouped


def _page_label(page_number: int, lines: list[ExtractedTextLine]) -> str:
    for line in lines:
        if len(line.text) <= 72:
            return line.text
    return f"Page {page_number}"


def _section_title(
    lines: list[ExtractedTextLine],
    candidates: list[ExtractedFieldCandidate],
    page_number: int,
) -> str:
    if lines:
        return lines[0].text[:80]
    if candidates:
        return f"Recovered fields on page {page_number}"
    return f"Page {page_number} content"


def _section_description(
    candidates: list[ExtractedFieldCandidate],
    lines: list[ExtractedTextLine],
) -> str | None:
    if candidates:
        return "Recovered from widget metadata with page text layered in for static content, labels, and review context."
    if lines:
        return "Recovered from visible page text because no explicit fillable field metadata was found."
    return None


def _renderer_hints(semantic_type: SemanticType) -> dict[str, str]:
    if semantic_type == SemanticType.SELECT:
        return {"uswdsComponent": "select"}
    if semantic_type == SemanticType.CHECKBOX:
        return {"uswdsComponent": "checkbox"}
    if semantic_type == SemanticType.RADIO:
        return {"uswdsComponent": "radio-group"}
    if semantic_type == SemanticType.SIGNATURE_ATTESTATION:
        return {"runtimePattern": "signature-attestation"}
    return {"uswdsComponent": "text-input"}


def _evidence_from_text_line(
    page_number: int,
    line: ExtractedTextLine,
    *,
    source_priority: SourcePriority = SourcePriority.LAYOUT,
) -> EvidenceAnchor:
    return EvidenceAnchor(
        anchor_id=f"ev-{page_number}-{_slugify(line.text[:32] or 'line')}",
        source_priority=source_priority,
        page=page_number,
        snippet=line.text,
        bounds=line.bounds or Coordinates(page=page_number, x=72, y=96, width=420, height=18),
        confidence=line.confidence,
        notes="Recovered from visible page text.",
    )


def _looks_like_prompt(text: str) -> bool:
    stripped = text.strip()
    return stripped.endswith(":") or "____" in stripped or stripped.endswith("?")


def _is_static_group_heading(text: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return False
    if _is_footer_or_artifact_line(stripped):
        return False
    if stripped.startswith("• "):
        return False
    if stripped.endswith("?"):
        return True
    if stripped.endswith(":"):
        return _looks_like_static_heading_phrase(stripped)
    if len(stripped) <= 72 and stripped == stripped.title():
        return True
    if len(stripped) <= 96 and stripped == stripped.upper() and any(character.isalpha() for character in stripped):
        return True
    if re.match(r"^\d+\.\s+", stripped):
        return len(stripped) <= 72
    return False


def _looks_like_static_heading_phrase(text: str) -> bool:
    stripped = text.strip()
    if len(stripped) > 120:
        return False
    if re.match(r"^\d+\.\s+", stripped):
        return len(stripped) <= 72
    if stripped.lower().startswith("section "):
        return True
    heading_markers = (
        "directions",
        "definitions",
        "getting started",
        "type of benefit",
        "financial disclosure",
        "report",
        "do not report",
        "where do i send",
        "paperwork reduction act",
        "privacy act",
    )
    return any(marker in stripped.lower() for marker in heading_markers) or len(stripped) <= 72


def _should_attach_heading_as_supporting(
    heading: ExtractedTextLine,
    next_line: ExtractedTextLine,
    supporting: list[ExtractedTextLine],
) -> bool:
    if heading.bounds is None or next_line.bounds is None:
        return False
    if supporting:
        return False
    heading_text = heading.text.strip()
    next_text = next_line.text.strip()
    same_row = abs(next_line.bounds.y - heading.bounds.y) <= 4 and next_line.bounds.x > heading.bounds.x + heading.bounds.width + 12
    if same_row:
        return True
    if heading_text.endswith("?") and next_text.endswith(":") and next_line.bounds.y - (heading.bounds.y + heading.bounds.height) <= 24:
        return True
    return False


def _is_footer_or_artifact_line(text: str) -> bool:
    stripped = text.strip()
    normalized = _normalize_text(stripped)
    if normalized in {
        "hec",
        "vaform",
        "1010ez",
        "feb2025",
        "applicationforhealthbenefits",
        "continued",
        "veteransnamelastfirstmiddle",
        "socialsecurityno",
        "999999999",
        "9999999999",
        "socialsecurityno999999999",
    }:
        return True
    if re.match(r"^page\s+\d+\s+of\s+\d+$", stripped, flags=re.IGNORECASE):
        return True
    if re.match(r"^va form\s+\d", stripped, flags=re.IGNORECASE):
        return True
    if re.match(r"^social security no\.?$", stripped, flags=re.IGNORECASE):
        return True
    if re.match(r"^social security no\.\s*\(?9{3}-9{2}-9{4}\)?$", stripped, flags=re.IGNORECASE):
        return True
    if re.match(r"^\(?9{3}-9{2}-9{4}\)?$", stripped):
        return True
    return False


def _select_statement_lines(
    lines: list[ExtractedTextLine],
    candidates: list[ExtractedFieldCandidate],
) -> list[ExtractedTextLine]:
    if not lines:
        return []
    if not candidates:
        return lines[:12]

    selected: list[ExtractedTextLine] = []
    for line in lines[:72]:
        normalized_line = _normalize_text(line.text)
        if normalized_line in {"yes", "no"} and any(normalized_line in {_normalize_text(option) for option in candidate.options} for candidate in candidates):
            continue
        if _line_is_field_label(line, candidates):
            continue
        selected.append(line)
    return selected[:28]


def _select_region_statement_lines(
    lines: list[ExtractedTextLine],
    candidates: list[ExtractedFieldCandidate],
) -> list[ExtractedTextLine]:
    selected: list[ExtractedTextLine] = []
    for line in lines[:40]:
        if _line_is_region_duplicate(line, candidates):
            continue
        selected.append(line)
    return selected[:16]


def _merge_statement_blocks(lines: list[ExtractedTextLine]) -> list[ExtractedTextLine]:
    if not lines:
        return []

    ordered_lines = sorted(
        [line for line in lines if line.text.strip()],
        key=lambda line: _coordinate_sort_key(line.bounds, fallback_y=10_000, fallback_x=0),
    )
    merged: list[ExtractedTextLine] = []

    for line in ordered_lines:
        if not merged:
            merged.append(line)
            continue
        previous = merged[-1]
        if _should_merge_statement_lines(previous, line):
            merged[-1] = _merge_text_line_pair(previous, line)
            continue
        merged.append(line)

    return merged


def _should_merge_statement_lines(previous: ExtractedTextLine, current: ExtractedTextLine) -> bool:
    if previous.bounds is None or current.bounds is None:
        return False
    if previous.page_number != current.page_number:
        return False
    if _is_section_heading(previous) or _is_section_heading(current):
        return False
    if _is_static_group_heading(previous.text):
        return False
    if _is_static_group_heading(current.text):
        return False
    gap_y = current.bounds.y - (previous.bounds.y + previous.bounds.height)
    if gap_y < -2 or gap_y > 14:
        return False
    if abs(previous.bounds.x - current.bounds.x) > 26:
        return False
    if previous.text.endswith(":") or previous.text.endswith("?"):
        return False
    if current.text.startswith("• "):
        return False
    return True


def _merge_text_line_pair(previous: ExtractedTextLine, current: ExtractedTextLine) -> ExtractedTextLine:
    bounds = _union_coordinates([bound for bound in [previous.bounds, current.bounds] if bound is not None])
    return ExtractedTextLine(
        page_number=previous.page_number,
        text=f"{previous.text} {current.text}".strip(),
        confidence=min(previous.confidence, current.confidence),
        bounds=bounds,
    )


def _line_is_region_duplicate(
    line: ExtractedTextLine,
    candidates: list[ExtractedFieldCandidate],
) -> bool:
    normalized_line = _normalize_text(line.text)
    if not normalized_line:
        return True

    for candidate in candidates:
        normalized_label = _normalize_text(candidate.label)
        normalized_help = _normalize_text(candidate.help_text or "")
        normalized_options = {_normalize_text(option) for option in candidate.options}
        if normalized_line == normalized_label or (normalized_help and normalized_line == normalized_help):
            return True
        if normalized_line and normalized_line in normalized_options:
            return True
        if candidate.options and normalized_line in normalized_label and len(normalized_line) >= 12:
            return True
        if (
            len(line.text.strip()) <= 12
            and line.bounds is not None
            and _line_near_candidate(line, candidate)
            and not _looks_like_question_continuation_fragment(line.text)
        ):
            return True

    return False


def _line_is_field_label(
    line: ExtractedTextLine,
    candidates: list[ExtractedFieldCandidate],
) -> bool:
    normalized_line = _normalize_text(line.text)
    if not normalized_line:
        return False

    for candidate in candidates:
        normalized_label = _normalize_text(candidate.label)
        normalized_help = _normalize_text(candidate.help_text or "")
        normalized_options = {_normalize_text(option) for option in candidate.options}
        if candidate.options and normalized_line == normalized_label:
            return True
        if normalized_line in {"yes", "no", "from", "to"} and normalized_line in normalized_options and line.bounds is not None and _line_near_candidate(line, candidate):
            return True
        if len(normalized_line) >= 10 and (
            normalized_line in normalized_label
            or normalized_label in normalized_line
            or (normalized_help and normalized_line in normalized_help)
        ):
            return True
        if line.bounds is not None and _line_near_candidate(line, candidate):
            return True

    if _looks_like_static_context(line.text):
        return False
    return False


def _looks_like_static_context(text: str) -> bool:
    lowered = text.lower()
    return (
        "section" in lowered
        or "continued" in lowered
        or "application for" in lowered
        or len(text) > 96
        or text.endswith(":")
    )


def _looks_like_question_continuation_fragment(text: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return False
    normalized = _normalize_text(stripped)
    if normalized in {"yes", "no", "from", "to"}:
        return False
    return stripped.endswith("?")


def _line_near_candidate(line: ExtractedTextLine, candidate: ExtractedFieldCandidate) -> bool:
    if line.bounds is None or not candidate.source_coordinates:
        return False

    for coordinate in candidate.source_coordinates:
        line_center_y = line.bounds.y + (line.bounds.height / 2)
        field_center_y = coordinate.y + (coordinate.height / 2)
        vertical_distance = abs(line_center_y - field_center_y)
        if candidate.semantic_type in {SemanticType.CHECKBOX, SemanticType.RADIO}:
            if vertical_distance <= 12 and line.bounds.x <= coordinate.x + 260:
                return True
        else:
            line_bottom = line.bounds.y + line.bounds.height
            if line_bottom <= coordinate.y + 10 and coordinate.y - line_bottom <= 28:
                horizontal_overlap = min(line.bounds.x + line.bounds.width, coordinate.x + coordinate.width) - max(
                    line.bounds.x,
                    coordinate.x,
                )
                if horizontal_overlap >= -60:
                    return True
    return False


def _candidate_within_region(candidate: ExtractedFieldCandidate, region: ExtractedPageRegion) -> bool:
    if not candidate.source_coordinates:
        return False
    return any(_coordinate_center_within(region.bounds, coordinate, margin=2.0) for coordinate in candidate.source_coordinates)


def _line_within_region(line: ExtractedTextLine, region: ExtractedPageRegion) -> bool:
    return line.bounds is not None and _coordinate_center_within(region.bounds, line.bounds, margin=2.0)


def _candidate_for_region(candidate: ExtractedFieldCandidate, region_label: str) -> ExtractedFieldCandidate:
    if candidate.semantic_type not in {SemanticType.CHECKBOX, SemanticType.RADIO, SemanticType.SELECT}:
        return candidate
    if _normalize_text(candidate.label) == _normalize_text(region_label):
        return candidate
    if _label_is_weaker_than_region(candidate.label, region_label):
        return candidate.model_copy(update={"label": region_label})
    return candidate


def _label_is_weaker_than_region(candidate_label: str, region_label: str) -> bool:
    candidate_normalized = _normalize_text(candidate_label)
    region_normalized = _normalize_text(region_label)
    if not candidate_normalized or candidate_normalized == region_normalized:
        return False
    if _looks_like_question(region_label) and not _looks_like_question(candidate_label):
        return True
    if len(candidate_label) < 24 and len(region_label) > len(candidate_label):
        return True
    if candidate_normalized in region_normalized and len(region_label) > len(candidate_label):
        return True
    return False


def _looks_like_question(text: str) -> bool:
    stripped = text.strip()
    return bool(re.match(r"^(?:\d+[A-Z]?|[A-Z])\.", stripped)) or stripped.endswith("?")


def _region_label(
    region_candidates: list[ExtractedFieldCandidate],
    region_lines: list[ExtractedTextLine],
) -> str | None:
    region_line = _top_region_prompt_line(region_lines)
    if region_line is not None:
        return region_line.text

    if region_candidates:
        return sorted(
            region_candidates,
            key=lambda candidate: (
                candidate.source_coordinates[0].y if candidate.source_coordinates else 10_000,
                candidate.source_coordinates[0].x if candidate.source_coordinates else 10_000,
                candidate.label.lower(),
            ),
        )[0].label
    return None


def _top_region_prompt_line(region_lines: list[ExtractedTextLine]) -> ExtractedTextLine | None:
    prompt_lines = [
        line
        for line in region_lines
        if line.bounds is not None
        and len(line.text) > 3
        and _normalize_text(line.text) not in {"yes", "no", "from", "to"}
        and not _looks_machine_label(line.text)
    ]
    if not prompt_lines:
        return None
    return sorted(prompt_lines, key=lambda line: (line.bounds.y if line.bounds else 10_000, line.bounds.x if line.bounds else 10_000))[0]


def _looks_machine_label(value: str) -> bool:
    return bool(re.match(r"^F\[\d+\]", value)) or bool(re.search(r"\bP\d+\[\d+\]", value))


def _region_description(
    region_lines: list[ExtractedTextLine],
    region_candidates: list[ExtractedFieldCandidate],
    region_label: str,
) -> str | None:
    supporting_lines = [
        line.text
        for line in region_lines
        if _normalize_text(line.text) != _normalize_text(region_label)
        and _normalize_text(line.text) not in {"yes", "no", "from", "to"}
    ]
    if supporting_lines:
        return supporting_lines[0]
    if region_candidates:
        return "Grouped from bounded page geometry plus widget evidence."
    return None


def _field_is_structured_control(field: FieldNode) -> bool:
    return field.semantic_type in {SemanticType.CHECKBOX, SemanticType.RADIO, SemanticType.SELECT}


def _is_auxiliary_group_statement(text: str) -> bool:
    stripped = text.strip()
    normalized = _normalize_text(stripped)
    if normalized in {"yes", "no", "from", "to"}:
        return True
    if stripped.upper().startswith("NOTE"):
        return True
    return bool(
        re.match(
            r"^(?:WHEN|WHERE|IF|PLEASE|FOR EXAMPLE|LIST|FROM\b|TO\b)",
            stripped,
            flags=re.IGNORECASE,
        )
    )


def _is_discardable_group_statement(text: str) -> bool:
    stripped = text.strip()
    if re.search(r"https?://|publichealth\.va\.gov", stripped, flags=re.IGNORECASE):
        return True
    return bool(re.fullmatch(r"(?:NO\.?\s*)?\(?9{3}[-\s]?9{2}[-\s]?9{4}\)?", stripped, flags=re.IGNORECASE))


def _clean_field_label_text(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", text).strip()
    cleaned = _truncate_leading_section_title_prefix(cleaned)
    cleaned = _drop_leading_continuation_clause(cleaned)
    cleaned = _truncate_following_binary_option_clause(cleaned)
    cleaned = re.sub(
        r"\s*[.:-]?\s*\*+\s*this is a required field\.?\s*$",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    return re.sub(r"\s+", " ", cleaned).strip(" ,;")


def _normalize_candidate_label_and_help_text(
    label: str,
    help_text: str | None,
    semantic_type: SemanticType,
) -> tuple[str, str | None]:
    cleaned_label = _clean_field_label_text(label)
    extra_details: list[str] = []

    parenthetical_split = _split_trailing_parenthetical_help(cleaned_label, semantic_type)
    if parenthetical_split is not None:
        cleaned_label, parenthetical_help = parenthetical_split
        extra_details.append(parenthetical_help)

    attestation_split = _split_long_attestation_or_notice(cleaned_label, semantic_type)
    if attestation_split is not None:
        cleaned_label, attestation_help = attestation_split
        extra_details.append(attestation_help)

    details: list[str] = []
    for detail in [*extra_details, help_text]:
        normalized_detail = _normalize_help_text_detail(detail)
        if not normalized_detail:
            continue
        if _normalize_text(normalized_detail) == _normalize_text(cleaned_label):
            continue
        if _is_generic_transport_help_text(normalized_detail) and extra_details:
            continue
        details.append(normalized_detail)

    return cleaned_label, ("; ".join(dict.fromkeys(details)) or None)


def _split_long_group_label_and_help(text: str) -> tuple[str, str | None]:
    cleaned = re.sub(r"\s+", " ", text).strip(" ,;")
    if not cleaned:
        return text, None

    note_match = re.search(r"\bNOTE:\s*", cleaned, flags=re.IGNORECASE)
    if note_match is not None and note_match.start() >= 32:
        prompt = cleaned[: note_match.start()].rstrip(" ,;")
        detail = cleaned[note_match.start() :].strip(" ,;")
        if prompt and detail:
            return prompt, detail

    space_match = re.search(r"\bIF ADDITIONAL SPACE IS NEEDED\b", cleaned, flags=re.IGNORECASE)
    if space_match is not None and space_match.start() >= 40:
        prompt = cleaned[: space_match.start()].rstrip(" ,;")
        detail = cleaned[space_match.start() :].strip(" ,;")
        if prompt and detail:
            return prompt, detail

    question_match = re.match(r"^(?P<prompt>.+?\?)\s+(?P<detail>.+)$", cleaned)
    if question_match is not None:
        prompt = question_match.group("prompt").strip()
        detail = question_match.group("detail").strip(" ,;")
        if (
            prompt
            and detail
            and len(detail) >= 24
            and not detail.startswith("(")
            and (";" in detail or "NOTE:" in detail.upper() or " IF " in f" {detail.upper()} ")
        ):
            return prompt, detail

    parenthetical_split = _split_trailing_parenthetical_help(cleaned, SemanticType.TEXT)
    if parenthetical_split is not None:
        return parenthetical_split

    return cleaned, None


def _split_trailing_parenthetical_help(
    text: str,
    semantic_type: SemanticType,
) -> tuple[str, str] | None:
    if semantic_type not in {
        SemanticType.TEXT,
        SemanticType.TEXTAREA,
        SemanticType.DATE,
        SemanticType.NUMBER,
        SemanticType.PHONE,
        SemanticType.EMAIL,
    }:
        return None

    matches = list(re.finditer(r"\(([^)]+)\)", text))
    if not matches or len(text) < 72:
        return None

    trailing_details: list[str] = []
    trim_at = len(text)
    if matches[-1].end() < len(text.rstrip(" .;,:")):
        return None
    for match in reversed(matches):
        if trailing_details and match.end() < trim_at - 2:
            break
        detail = match.group(1).strip()
        if not detail or len(detail) < 18:
            break
        trailing_details.append(detail)
        trim_at = match.start()

    if not trailing_details or trim_at >= len(text):
        return None

    trimmed_label = text[:trim_at].rstrip(" ,;")
    if not trimmed_label:
        return None
    return trimmed_label, "; ".join(reversed(trailing_details))


def _split_long_attestation_or_notice(
    text: str,
    semantic_type: SemanticType,
) -> tuple[str, str] | None:
    normalized = _normalize_text(text)
    if not normalized:
        return None

    if text.upper().startswith("PRIVACY ACT NOTICE:"):
        detail = text.split(":", 1)[1].strip()
        if detail:
            return "Privacy Act Notice", detail
        return None

    if semantic_type not in {
        SemanticType.CHECKBOX,
        SemanticType.RADIO,
        SemanticType.SIGNATURE_ATTESTATION,
        SemanticType.TEXT,
        SemanticType.TEXTAREA,
    }:
        return None

    attestation_markers = (
        "icertify",
        "iattest",
        "iunderstand",
        "iagree",
        "importantinformation",
        "thedepartmentofthetreasuryrequires",
    )
    if len(text) < 96 or not any(normalized.startswith(marker) for marker in attestation_markers):
        return None

    sentence_match = re.match(r"^(.+?[.?!])\s+(.+)$", text)
    if sentence_match is None:
        return None

    lead = _truncate_long_certification_clause(sentence_match.group(1).strip())
    remainder = sentence_match.group(2).strip()
    if not lead or not remainder:
        return None
    return lead, remainder


def _truncate_long_certification_clause(text: str) -> str:
    stripped = text.strip()
    if len(stripped) <= 140:
        return stripped

    clause_markers = (
        r"\band i consent to\b",
        r"\band that the claimant is aware\b",
        r"\band i authorize\b",
        r"\band i understand\b",
        r"\band i agree\b",
        r"\band i acknowledge\b",
        r";\s*OR,\s*",
    )
    for marker in clause_markers:
        match = re.search(marker, stripped, flags=re.IGNORECASE)
        if match is None or match.start() < 48:
            continue
        candidate = stripped[: match.start()].rstrip(" ,;")
        if len(candidate) >= 48:
            return candidate + ("" if candidate.endswith(".") else ".")
    return stripped


def _normalize_help_text_detail(detail: str | None) -> str | None:
    if detail is None:
        return None
    cleaned = re.sub(r"\s+", " ", detail).strip(" ,;")
    return cleaned or None


def _is_generic_transport_help_text(text: str) -> bool:
    normalized = _normalize_text(text)
    return normalized == "recoveredfrompagetextforreviewertriage" or normalized.startswith(
        "acroformfieldtype"
    )


def _section_group_label(section_title: str) -> str:
    return re.sub(r"^\s*SECTION\s+[A-Z0-9IVXLC]+\s*[-:]\s*", "", section_title, flags=re.IGNORECASE).strip()


def _is_prompt_fragment_statement(
    text: str,
    *,
    anchor: Coordinates,
    primary_anchor: Coordinates,
) -> bool:
    if _is_auxiliary_group_statement(text):
        return False
    if abs(anchor.y - primary_anchor.y) > 84:
        return False
    return True


def _merge_prompt_parts(parts: list[str]) -> str:
    merged = ""
    seen: set[str] = set()

    for raw_part in parts:
        part = re.sub(r"\s+", " ", raw_part.strip())
        if not part:
            continue
        normalized = _normalize_text(part)
        if not normalized or normalized in seen:
            continue
        if merged:
            merged_normalized = _normalize_text(merged)
            if normalized in merged_normalized:
                continue
            if merged_normalized in normalized:
                merged = part
                seen.add(normalized)
                continue
            merged = _merge_overlapping_prompt_text(merged, part)
        else:
            merged = part
        seen.add(normalized)

    return re.sub(r"\s+([,.;:?])", r"\1", merged).strip()


def _clean_group_label_text(text: str) -> str:
    cleaned = _clean_field_label_text(text)
    cleaned = _strip_line_counter_suffix(cleaned)
    cleaned = re.sub(
        r"\s+Veterans can locate additional military exposure categories.*$",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"\s+at:\s*https.*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+https?://\S+.*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = _truncate_repeated_enumerated_prompt(cleaned)
    cleaned = re.sub(r"\s*\(\s*Complete if\s*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = _drop_leading_continuation_clause(cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,;")
    return cleaned


def _truncate_leading_section_title_prefix(text: str) -> str:
    if not re.match(r"^\s*SECTION\s+", text, flags=re.IGNORECASE):
        return text
    question_matches = [
        match
        for match in re.finditer(r"(?:\d+[A-Z]?|[A-Z])\.\s+", text)
        if match.start() > 12
    ]
    if not question_matches:
        return text
    return text[question_matches[0].start():].lstrip()


def _truncate_following_binary_option_clause(text: str) -> str:
    if not re.match(r"^(?:No,|Yes,)", text):
        return text
    matches = list(re.finditer(r"(?<![A-Za-z0-9])(No,|Yes,)", text))
    if len(matches) < 2:
        return text
    second = matches[1]
    if second.start() <= 32:
        return text
    return text[: second.start()].rstrip(" ,;")


def _normalize_line_counter_text_group(
    group_label: str,
    group_fields: list[FieldNode],
) -> tuple[str, list[FieldNode]] | None:
    if any(field.semantic_type not in {SemanticType.TEXT, SemanticType.STATEMENT} for field in group_fields):
        return None

    text_fields = [field for field in group_fields if field.semantic_type == SemanticType.TEXT]
    if not text_fields:
        return None

    parsed_fields: list[tuple[FieldNode, str, int, int]] = []
    for field in text_fields:
        parts = _extract_line_counter_parts(field.label)
        if parts is None:
            return None
        base_label, line_number, total_lines = parts
        parsed_fields.append((field, base_label, line_number, total_lines))

    base_labels = {_normalize_text(_clean_field_label_text(base_label)) for _field, base_label, _line, _total in parsed_fields}
    normalized_group_label = _normalize_text(_clean_group_label_text(group_label))
    if len(base_labels) > 1 and normalized_group_label not in base_labels:
        return None

    rewritten_group_label = _clean_group_label_text(group_label)
    if not rewritten_group_label:
        rewritten_group_label = _clean_field_label_text(parsed_fields[0][1])

    rewritten_fields: list[FieldNode] = []
    for field in group_fields:
        if field.semantic_type != SemanticType.TEXT:
            rewritten_fields.append(field)
            continue

        parts = _extract_line_counter_parts(field.label)
        assert parts is not None
        _base_label, line_number, total_lines = parts
        concise_label = f"Line {line_number}"
        rewritten_fields.append(
            field.model_copy(
                update={
                    "label": concise_label,
                    "evidence": _rewrite_field_evidence_snippets(field.evidence, concise_label),
                    "renderer_hints": {
                        **field.renderer_hints,
                        "lineCounter": str(line_number),
                        "lineCount": str(total_lines),
                    },
                }
            )
        )

    return rewritten_group_label, rewritten_fields


def _normalize_statement_only_group(
    group_label: str,
    group_fields: list[FieldNode],
) -> tuple[str, list[FieldNode]] | None:
    if not group_fields or any(field.semantic_type != SemanticType.STATEMENT for field in group_fields):
        return None

    merged_statement = _merge_statement_only_group_text(group_fields)
    if not merged_statement:
        return None

    concise_label = _summarize_statement_only_group_label(group_label, merged_statement)
    if concise_label is None:
        return None

    summary_field = group_fields[0].model_copy(
        update={
            "label": concise_label,
            "help_text": merged_statement,
            "evidence": _rewrite_field_evidence_snippets(group_fields[0].evidence, concise_label),
            "renderer_hints": {
                **group_fields[0].renderer_hints,
                "statementSummary": "true",
            },
        }
    )
    return concise_label, [summary_field]


def _extract_line_counter_parts(text: str) -> tuple[str, int, int] | None:
    cleaned = re.sub(r"\s+", " ", text).strip()
    match = re.search(
        r"^(?P<base>.*?)(?:[.:\-]\s*|\s+)?Line\s+(?P<line>\d+)\s+of\s+(?P<total>\d+)\s*$",
        cleaned,
        flags=re.IGNORECASE,
    )
    if match is None:
        return None
    base_label = match.group("base").strip(" ,.;:-")
    if not base_label:
        return None
    return base_label, int(match.group("line")), int(match.group("total"))


def _strip_line_counter_suffix(text: str) -> str:
    parts = _extract_line_counter_parts(text)
    if parts is None:
        return text
    base_label, _line_number, _total_lines = parts
    return base_label


def _merge_statement_only_group_text(group_fields: list[FieldNode]) -> str:
    parts: list[str] = []
    seen: set[str] = set()
    for field in group_fields:
        text = re.sub(r"\s+", " ", field.label).strip(" ,;")
        normalized = _normalize_text(text)
        if not text or not normalized or normalized in seen:
            continue
        parts.append(text)
        seen.add(normalized)
    return " ".join(parts).strip()


def _summarize_statement_only_group_label(
    group_label: str,
    merged_statement: str,
) -> str | None:
    text = re.sub(r"\s+", " ", merged_statement).strip()
    normalized = _normalize_text(text)
    if len(text) < 140 and len(group_label) < 96:
        return None

    if normalized.startswith("privacyactnotice"):
        return "Privacy Act Notice"

    if normalized.startswith("importantinformation"):
        first_clause = re.split(r"(?<=[.?!])\s+", text, maxsplit=1)[0].strip()
        return first_clause or "Important Information"

    if normalized.startswith("list") and "note:" in text.lower():
        prompt, _detail = _split_long_group_label_and_help(text)
        return prompt

    if normalized.startswith(("icertify", "iattest", "iagree", "iunderstand", "thedepartmentofthetreasuryrequires")):
        first_sentence = _truncate_long_certification_clause(
            re.split(r"(?<=[.?!])\s+", text, maxsplit=1)[0].strip()
        )
        if first_sentence:
            return first_sentence

    return None


def _merge_help_text_details(parts: list[str | None]) -> str | None:
    details: list[str] = []
    for part in parts:
        normalized_detail = _normalize_help_text_detail(part)
        if normalized_detail:
            details.append(normalized_detail)
    return "; ".join(dict.fromkeys(details)) or None


def _strip_help_overlap(help_text: str | None, overlapping_texts: list[str]) -> str | None:
    normalized_help = _normalize_help_text_detail(help_text)
    if not normalized_help:
        return None
    cleaned = normalized_help
    for text in overlapping_texts:
        detail = _normalize_help_text_detail(text)
        if detail and detail in cleaned:
            cleaned = cleaned.replace(detail, " ")
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,;")
    return cleaned or None


def _apply_group_prompt_help_to_duplicate_fields(
    original_group_label: str,
    normalized_group_label: str,
    group_fields: list[FieldNode],
    extracted_group_help: str,
) -> list[FieldNode]:
    original_normalized = _normalize_text(original_group_label)
    normalized_group = _normalize_text(normalized_group_label)
    rewritten_fields: list[FieldNode] = []
    for field in group_fields:
        label = field.label
        field_normalized = _normalize_text(label)
        rewritten_label = label
        should_merge_group_help = False
        if field.semantic_type != SemanticType.STATEMENT and (
            field_normalized == original_normalized
            or (normalized_group and normalized_group in field_normalized and len(field_normalized) > len(normalized_group) + 20)
        ):
            rewritten_label = normalized_group_label
            should_merge_group_help = True
        elif field.semantic_type == SemanticType.STATEMENT and (
            field_normalized == original_normalized
            or (normalized_group and normalized_group in field_normalized)
        ):
            should_merge_group_help = True
        existing_help = _normalize_help_text_detail(field.help_text)
        merged_help = (
            existing_help
            if not should_merge_group_help
            else (
                existing_help
                if existing_help and extracted_group_help in existing_help
                else _merge_help_text_details([field.help_text, extracted_group_help])
            )
        )
        rewritten_fields.append(
            field.model_copy(
                update={
                    "label": rewritten_label,
                    "help_text": merged_help,
                    "evidence": _rewrite_field_evidence_snippets(field.evidence, rewritten_label),
                }
            )
        )
    return rewritten_fields


def _truncate_repeated_enumerated_prompt(text: str) -> str:
    leading_match = re.match(r"^\s*((?:\d+[A-Z]?|[A-Z])\.)\s+", text)
    if leading_match is not None:
        leading_marker = leading_match.group(1)
        repeated_leading = re.search(
            rf"\s{re.escape(leading_marker)}\s+",
            text[leading_match.end() :],
        )
        if repeated_leading is not None:
            repeat_start = leading_match.end() + repeated_leading.start() + 1
            if repeat_start > 24:
                return text[:repeat_start].rstrip(" ,;")

    matches = list(re.finditer(r"(?:^|\s)((?:\d+[A-Z]?|[A-Z])\.)\s+", text))
    if len(matches) < 2:
        return text
    second = next(
        (
            match
            for match in matches[1:]
            if match.group(1)[0].isdigit() or len(match.group(1)) > 2
        ),
        matches[1],
    )
    if second.start() <= 24:
        return text
    return text[: second.start()].rstrip(" ,;")


def _drop_leading_continuation_clause(text: str) -> str:
    stripped = text.strip()
    match = re.search(r"(?<![A-Za-z0-9])(No,|Yes,|SECTION\s+|[1-9]\.)", stripped)
    if match and match.start() > 0:
        return stripped[match.start():]
    return stripped


def _merge_overlapping_prompt_text(current: str, part: str) -> str:
    current_words = current.rstrip().split()
    part_words = part.lstrip().split()
    if not current_words:
        return part
    if not part_words:
        return current

    max_overlap = min(len(current_words), len(part_words))
    for overlap in range(max_overlap, 0, -1):
        current_suffix = [_normalize_token(word) for word in current_words[-overlap:]]
        part_prefix = [_normalize_token(word) for word in part_words[:overlap]]
        if current_suffix == part_prefix:
            tail = " ".join(part_words[overlap:]).strip()
            return current if not tail else f"{current.rstrip()} {tail}"
    return f"{current.rstrip()} {part.lstrip()}"


def _normalize_token(word: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", word.lower())


def _rewrite_field_evidence_snippets(
    evidence: list[EvidenceAnchor],
    new_label: str,
) -> list[EvidenceAnchor]:
    if not evidence:
        return evidence
    updated: list[EvidenceAnchor] = []
    rewritten = False
    for anchor in evidence:
        if not rewritten and anchor.snippet:
            updated.append(anchor.model_copy(update={"snippet": new_label}))
            rewritten = True
            continue
        updated.append(anchor)
    return updated


def _statement_duplicates_neighbor_field(
    statement_field: FieldNode,
    group_fields: list[FieldNode],
) -> bool:
    normalized_statement = _normalize_text(statement_field.label)
    if not normalized_statement:
        return False

    statement_anchor = _field_anchor(statement_field)
    for field in group_fields:
        if field.id == statement_field.id or field.semantic_type == SemanticType.STATEMENT:
            continue
        normalized_label = _normalize_text(field.label)
        if not normalized_label:
            continue
        if normalized_statement == normalized_label:
            return True
        if normalized_statement in {"from", "to"} and normalized_statement == normalized_label:
            return True
        if len(normalized_statement) >= 16 and normalized_statement in normalized_label:
            anchor = _field_anchor(field)
            if abs(anchor.y - statement_anchor.y) <= 28:
                return True
    return False


def _statement_restarts_group_prompt(statement_label: str, group_label: str) -> bool:
    statement_prefix = _label_prefix(statement_label)
    group_prefix = _label_prefix(group_label)
    if statement_prefix and group_prefix and statement_prefix == group_prefix:
        return True
    normalized_statement = _normalize_text(statement_label)
    normalized_group = _normalize_text(group_label)
    return bool(normalized_statement and normalized_statement in normalized_group)


def _candidate_key(candidate: ExtractedFieldCandidate) -> str:
    primary = candidate.source_coordinates[0] if candidate.source_coordinates else None
    if primary is None:
        return f"{candidate.page_number}:{candidate.name}:{candidate.label}"
    return f"{candidate.page_number}:{candidate.name}:{primary.x:.1f}:{primary.y:.1f}:{primary.width:.1f}:{primary.height:.1f}"


def _line_key(line: ExtractedTextLine) -> str:
    if line.bounds is None:
        return f"{line.page_number}:{line.text}"
    return f"{line.page_number}:{line.text}:{line.bounds.x:.1f}:{line.bounds.y:.1f}:{line.bounds.width:.1f}:{line.bounds.height:.1f}"


def _coordinates_overlap(left: Coordinates, right: Coordinates, *, margin: float) -> bool:
    return not (
        left.x > right.x + right.width + margin
        or right.x > left.x + left.width + margin
        or left.y > right.y + right.height + margin
        or right.y > left.y + left.height + margin
    )


def _coordinate_center_within(container: Coordinates, item: Coordinates, *, margin: float) -> bool:
    center_x = item.x + (item.width / 2)
    center_y = item.y + (item.height / 2)
    return (
        center_x >= container.x - margin
        and center_x <= container.x + container.width + margin
        and center_y >= container.y - margin
        and center_y <= container.y + container.height + margin
    )


def _coordinate_center_x(item: Coordinates) -> float:
    return item.x + (item.width / 2)


def _merge_page_fields(
    candidate_fields: list[FieldNode],
    statement_fields: list[FieldNode],
) -> list[FieldNode]:
    ordered = _layout_order_fields([*candidate_fields, *statement_fields])
    return [field.model_copy(update={"order_index": index}) for index, field in enumerate(ordered)]


def _order_section_items(
    groups: list[GroupNode],
    fields: list[FieldNode],
) -> tuple[list[GroupNode], list[FieldNode]]:
    items: list[tuple[str, GroupNode | FieldNode]] = [("group", group) for group in groups] + [
        ("field", field) for field in fields
    ]
    ordered_items = _refine_ordered_items(_layout_order_items(items))
    ordered_groups: list[GroupNode] = []
    ordered_fields: list[FieldNode] = []

    for index, (kind, item) in enumerate(ordered_items):
        if kind == "group":
            group = item
            assert isinstance(group, GroupNode)
            ordered_groups.append(group.model_copy(update={"order_index": index}))
        else:
            field = item
            assert isinstance(field, FieldNode)
            ordered_fields.append(field.model_copy(update={"order_index": index}))

    consolidated_groups = _consolidate_adjacent_groups(ordered_groups)
    suppressed_fields = _suppress_section_artifact_fields(ordered_fields, consolidated_groups)
    attached_groups, remaining_fields = _attach_prefixed_fields_to_statement_groups(consolidated_groups, suppressed_fields)
    synthesized_groups, synthesized_remaining_fields = _synthesize_numbered_field_groups(attached_groups, remaining_fields)
    normalized_matrix_groups = _normalize_matrix_row_groups(synthesized_groups)
    normalized_prompt_value_groups = _normalize_prompt_value_groups(normalized_matrix_groups)
    return _normalize_section_item_order(normalized_prompt_value_groups, synthesized_remaining_fields)


def _layout_order_fields(fields: list[FieldNode]) -> list[FieldNode]:
    return [item for _kind, item in _layout_order_items([("field", field) for field in fields])]


def _normalize_section_item_order(
    groups: list[GroupNode],
    fields: list[FieldNode],
) -> tuple[list[GroupNode], list[FieldNode]]:
    items = _sorted_section_items(groups, fields)
    items = _normalize_enumerated_section_order(items)
    normalized_groups: list[GroupNode] = []
    normalized_fields: list[FieldNode] = []

    for order_index, (kind, item) in enumerate(items):
        if kind == "group":
            assert isinstance(item, GroupNode)
            normalized_groups.append(item.model_copy(update={"order_index": order_index}))
        else:
            assert isinstance(item, FieldNode)
            normalized_fields.append(item.model_copy(update={"order_index": order_index}))

    return normalized_groups, normalized_fields


def _sorted_section_items(
    groups: list[GroupNode],
    fields: list[FieldNode],
) -> list[tuple[str, GroupNode | FieldNode]]:
    items: list[tuple[str, GroupNode | FieldNode]] = [("group", group) for group in groups] + [
        ("field", field) for field in fields
    ]
    return sorted(
        items,
        key=lambda entry: (
            entry[1].order_index,
            0 if entry[0] == "field" else 1,
            _item_anchor(entry[1]).y,
            _item_anchor(entry[1]).x,
        ),
    )


def _normalize_enumerated_section_order(
    items: list[tuple[str, GroupNode | FieldNode]],
) -> list[tuple[str, GroupNode | FieldNode]]:
    if not items:
        return items

    annotated: list[tuple[int, tuple[str, GroupNode | FieldNode], tuple[int, int] | None]] = []
    current_parent_number: int | None = None
    keyed_count = 0

    for stable_index, item in enumerate(items):
        logical_key = _logical_section_item_key(item, current_parent_number=current_parent_number)
        if logical_key is not None:
            keyed_count += 1
        annotated.append((stable_index, item, logical_key))

        heading_number = _top_level_heading_number(item)
        if heading_number is not None:
            current_parent_number = heading_number

    if keyed_count < 5 or keyed_count < max(4, len(items) // 3):
        return items

    keyed_items = [entry for entry in annotated if entry[2] is not None]
    if not keyed_items:
        return items

    first_keyed_y = min(_item_anchor(item[1]).y for _stable, item, _key in keyed_items)
    prefix_items = [
        item
        for _stable, item, logical_key in annotated
        if logical_key is None and _item_anchor(item[1]).y < first_keyed_y - 6.0
    ]
    suffix_items = [
        item
        for _stable, item, logical_key in annotated
        if logical_key is None and _item_anchor(item[1]).y >= first_keyed_y - 6.0
    ]
    sorted_keyed_items = [
        item
        for _stable, item, _key in sorted(
            keyed_items,
            key=lambda entry: (
                entry[2] or (10_000, 10_000),
                _item_anchor(entry[1][1]).y,
                _item_anchor(entry[1][1]).x,
                entry[0],
            ),
        )
    ]
    return [*prefix_items, *sorted_keyed_items, *suffix_items]


def _logical_section_item_key(
    item: tuple[str, GroupNode | FieldNode],
    *,
    current_parent_number: int | None,
) -> tuple[int, int] | None:
    label = _item_label(item[1])
    numeric_key = _item_numeric_key(label)
    if numeric_key is not None:
        return numeric_key

    prefix = _label_prefix(label)
    if prefix is not None and len(prefix) == 1 and prefix.isalpha() and current_parent_number is not None:
        return current_parent_number, ord(prefix) - 64

    return None


def _refine_ordered_items(
    ordered_items: list[tuple[str, GroupNode | FieldNode]],
) -> list[tuple[str, GroupNode | FieldNode]]:
    refined = list(ordered_items)
    index = 0
    while index < len(refined):
        if not _is_simple_letter_group_item(refined[index]):
            index += 1
            continue
        run_end = index + 1
        while run_end < len(refined) and _is_simple_letter_group_item(refined[run_end]):
            run_end += 1
        if run_end - index >= 3:
            run = refined[index:run_end]
            sorted_run = sorted(
                run,
                key=lambda item: (
                    _label_prefix(_item_label(item[1])) or "",
                    _item_anchor(item[1]).y,
                    _item_anchor(item[1]).x,
                ),
            )
            refined[index:run_end] = sorted_run
        index = run_end

    heading_index = 0
    while heading_index < len(refined):
        parent_number = _top_level_heading_number(refined[heading_index])
        if parent_number is None:
            heading_index += 1
            continue
        run_start = heading_index + 1
        run_end = run_start
        group_indexes: list[int] = []
        while run_end < len(refined):
            current_item = refined[run_end]
            if _is_skipable_subitem_separator(current_item):
                run_end += 1
                continue
            logical_key = _logical_subitem_key(_item_label(current_item[1]), parent_number=parent_number)
            if logical_key is None or current_item[0] != "group":
                break
            group_indexes.append(run_end)
            run_end += 1
        if len(group_indexes) >= 3:
            run = [refined[group_index] for group_index in group_indexes]
            sorted_run = sorted(
                run,
                key=lambda item: (
                    _logical_subitem_key(_item_label(item[1]), parent_number=parent_number) or 10_000,
                    _item_anchor(item[1]).y,
                    _item_anchor(item[1]).x,
                ),
            )
            for group_index, item in zip(group_indexes, sorted_run, strict=False):
                refined[group_index] = item
        heading_index = max(run_end, heading_index + 1)
    return refined


def _is_simple_letter_group_item(item: tuple[str, GroupNode | FieldNode]) -> bool:
    kind, value = item
    if kind != "group" or not isinstance(value, GroupNode):
        return False
    prefix = _label_prefix(value.label)
    return prefix is not None and len(prefix) == 1 and prefix.isalpha()


def _top_level_heading_number(item: tuple[str, GroupNode | FieldNode]) -> int | None:
    kind, value = item
    if kind != "field" or not isinstance(value, FieldNode):
        return None
    match = re.match(r"^\s*(\d+)\.\s+", value.label.strip())
    if match is None:
        return None
    return int(match.group(1))


def _logical_subitem_key(label: str, *, parent_number: int) -> int | None:
    prefix = _label_prefix(label)
    if prefix is None:
        return None
    if len(prefix) == 1 and prefix.isalpha():
        return ord(prefix) - 64
    match = re.match(r"^(\d+)([A-Z])$", prefix)
    if match is None:
        return None
    if int(match.group(1)) != parent_number:
        return None
    return ord(match.group(2)) - 64


def _is_skipable_subitem_separator(item: tuple[str, GroupNode | FieldNode]) -> bool:
    kind, value = item
    if kind != "field" or not isinstance(value, FieldNode):
        return False
    return _normalize_text(value.label) in {"yes", "no", "from", "to"}


def _consolidate_adjacent_groups(groups: list[GroupNode]) -> list[GroupNode]:
    if not groups:
        return []

    consolidated: list[GroupNode] = []
    for group in groups:
        if consolidated and _should_merge_group_pair(consolidated[-1], group):
            consolidated[-1] = _merge_group_pair(consolidated[-1], group)
            continue
        consolidated.append(group)

    return [
        group.model_copy(
            update={
                "fields": [
                    field.model_copy(update={"order_index": field_index, "lineage": [group.page_id, group.section_id, group.id]})
                    for field_index, field in enumerate(group.fields)
                ],
            }
        )
        for group in consolidated
    ]


def _suppress_section_artifact_fields(
    fields: list[FieldNode],
    groups: list[GroupNode],
) -> list[FieldNode]:
    if not fields:
        return fields

    grouped_option_labels = {
        _normalize_text(option.label)
        for group in groups
        for field in group.fields
        if field.semantic_type in {SemanticType.CHECKBOX, SemanticType.RADIO, SemanticType.SELECT}
        for option in field.options
    }

    filtered: list[FieldNode] = []
    for field in fields:
        normalized = _normalize_text(field.label)
        if field.semantic_type == SemanticType.STATEMENT:
            if _is_currency_marker_text(field.label):
                continue
            if normalized in {"yes", "no", "from", "to"} and normalized in grouped_option_labels:
                continue
            if _is_footer_or_artifact_line(field.label):
                continue
        filtered.append(field)

    return [field.model_copy(update={"order_index": index}) for index, field in enumerate(filtered)]


def _attach_prefixed_fields_to_statement_groups(
    groups: list[GroupNode],
    fields: list[FieldNode],
) -> tuple[list[GroupNode], list[FieldNode]]:
    if not groups or not fields:
        return groups, fields

    updated_groups: list[GroupNode] = []
    consumed_field_ids: set[str] = set()

    for group in groups:
        group_prefix = _group_prefix(group)
        group_number = int(group_prefix) if group_prefix and group_prefix.isdigit() else None
        if group_number is None or not _group_has_only_statements(group):
            updated_groups.append(group)
            continue

        matching_fields = [
            field
            for field in fields
            if field.id not in consumed_field_ids
            and field.semantic_type != SemanticType.STATEMENT
            and _field_top_level_number(field) == group_number
        ]
        if not matching_fields:
            updated_groups.append(group)
            continue

        merged_fields = [
            *group.fields,
            *_layout_order_fields(matching_fields),
        ]
        consumed_field_ids.update(field.id for field in matching_fields)
        updated_groups.append(
            group.model_copy(
                update={
                    "fields": [
                        field.model_copy(
                            update={
                                "order_index": field_index,
                                "lineage": [group.page_id, group.section_id, group.id],
                            }
                        )
                        for field_index, field in enumerate(merged_fields)
                    ],
                    "renderer_hints": {**group.renderer_hints, "fieldCount": str(len(merged_fields))},
                }
            )
        )

    remaining_fields = [field for field in fields if field.id not in consumed_field_ids]
    return updated_groups, [
        field.model_copy(update={"order_index": index})
        for index, field in enumerate(remaining_fields)
    ]


def _synthesize_numbered_field_groups(
    groups: list[GroupNode],
    fields: list[FieldNode],
) -> tuple[list[GroupNode], list[FieldNode]]:
    if not fields:
        return groups, fields

    existing_numbers = {
        int(prefix)
        for group in groups
        if (prefix := _group_prefix(group)) is not None and prefix.isdigit()
    }

    numbered_fields: dict[int, list[FieldNode]] = {}
    passthrough_fields: list[FieldNode] = []
    for field in fields:
        number = _field_top_level_number(field)
        if number is None or field.semantic_type == SemanticType.STATEMENT or number in existing_numbers:
            passthrough_fields.append(field)
            continue
        numbered_fields.setdefault(number, []).append(field)

    synthesized_groups = list(groups)
    for number in sorted(numbered_fields):
        group_fields = numbered_fields[number]
        if len(group_fields) < 2:
            passthrough_fields.extend(group_fields)
            continue

        ordered_group_fields = _layout_order_fields(group_fields)
        label_field = min(
            ordered_group_fields,
            key=lambda field: (
                _item_anchor(field).x,
                -len(field.label),
                _item_anchor(field).y,
            ),
        )
        merged_group_fields = [
            label_field,
            *[
                field
                for field in _layout_order_fields([field for field in ordered_group_fields if field.id != label_field.id])
            ],
        ]
        group_id = f"{label_field.page_id}-{label_field.section_id}-synthetic-{number}"
        group_bounds = _union_coordinates(
            [coordinate for field in ordered_group_fields for coordinate in field.source_coordinates]
        )
        synthesized_groups.append(
            GroupNode(
                id=group_id,
                order_index=max((group.order_index for group in synthesized_groups), default=-1) + 1,
                label=label_field.label,
                description="Grouped from repeated numbered row fields.",
                page_id=label_field.page_id,
                section_id=label_field.section_id,
                lineage=[label_field.page_id, label_field.section_id],
                source_coordinates=[group_bounds] if group_bounds is not None else label_field.source_coordinates,
                evidence=[],
                fields=[
                    field.model_copy(
                        update={
                            "order_index": field_index,
                            "lineage": [label_field.page_id, label_field.section_id, group_id],
                        }
                    )
                    for field_index, field in enumerate(merged_group_fields)
                ],
                renderer_hints={"groupType": "synthetic_numbered_row", "fieldCount": str(len(merged_group_fields))},
            )
        )

    passthrough_fields.sort(key=lambda field: field.order_index)
    return synthesized_groups, [
        field.model_copy(update={"order_index": index})
        for index, field in enumerate(passthrough_fields)
    ]


def _normalize_matrix_row_groups(groups: list[GroupNode]) -> list[GroupNode]:
    return [_normalize_matrix_row_group(group) for group in groups]


def _normalize_prompt_value_groups(groups: list[GroupNode]) -> list[GroupNode]:
    normalized_groups: list[GroupNode] = []
    for group in groups:
        normalized_label, normalized_fields = _normalize_text_prompt_group(
            group.label,
            group.fields,
            section_title=None,
        )
        normalized_groups.append(
            group.model_copy(
                update={
                    "label": normalized_label,
                    "fields": [
                        field.model_copy(
                            update={
                                "order_index": index,
                                "lineage": [group.page_id, group.section_id, group.id],
                            }
                        )
                        for index, field in enumerate(normalized_fields)
                    ],
                    "evidence": _rewrite_field_evidence_snippets(group.evidence, normalized_label),
                    "renderer_hints": {**group.renderer_hints, "fieldCount": str(len(normalized_fields))},
                }
            )
        )
    return normalized_groups


def _normalize_matrix_row_group(group: GroupNode) -> GroupNode:
    value_fields = [field for field in group.fields if field.semantic_type != SemanticType.STATEMENT]
    if len(value_fields) < 2 or any(field.semantic_type != SemanticType.TEXT for field in value_fields):
        return group

    roles_by_field_id = {
        field.id: _matrix_role_label_from_text(field.label)
        for field in value_fields
    }
    if not any(role is not None for role in roles_by_field_id.values()):
        return group

    leftmost_value_field = min(
        value_fields,
        key=lambda field: (_field_anchor(field).x, _field_anchor(field).y, field.order_index),
    )
    if (
        roles_by_field_id[leftmost_value_field.id] is None
        and any(role and role != "Veteran" for role in roles_by_field_id.values())
    ):
        roles_by_field_id[leftmost_value_field.id] = "Veteran"

    prompt_candidates: list[str] = []
    stripped_group_label = _strip_matrix_role_suffix(group.label)
    if _is_meaningful_matrix_prompt(stripped_group_label):
        prompt_candidates.append(stripped_group_label)

    for field in group.fields:
        if field.semantic_type == SemanticType.STATEMENT:
            if _is_currency_marker_text(field.label):
                continue
            if _matrix_role_label_from_text(field.label) is None:
                prompt_candidates.append(field.label)
            continue

        stripped_label = _strip_matrix_role_suffix(field.label)
        if (
            roles_by_field_id.get(field.id) in {None, "Veteran"}
            and _is_meaningful_matrix_prompt(stripped_label)
        ):
            prompt_candidates.append(stripped_label)

    merged_label = _clean_group_label_text(_merge_prompt_parts(prompt_candidates) or group.label)
    if not merged_label:
        merged_label = group.label

    rewritten_fields_raw: list[FieldNode] = []
    for field in group.fields:
        if field.semantic_type == SemanticType.STATEMENT:
            continue
        role_label = roles_by_field_id.get(field.id)
        new_label = role_label or field.label
        rewritten_fields_raw.append(
            field.model_copy(
                update={
                    "label": new_label,
                    "lineage": [group.page_id, group.section_id, group.id],
                    "evidence": _rewrite_field_evidence_snippets(field.evidence, new_label),
                    "renderer_hints": {
                        **field.renderer_hints,
                        **({"matrixRole": role_label} if role_label is not None else {}),
                    },
                }
            )
        )
    rewritten_fields = [
        field.model_copy(update={"order_index": index})
        for index, field in enumerate(_layout_order_fields(rewritten_fields_raw))
    ]

    return group.model_copy(
        update={
            "label": merged_label,
            "fields": rewritten_fields,
            "evidence": _rewrite_field_evidence_snippets(group.evidence, merged_label),
            "renderer_hints": {
                **group.renderer_hints,
                "fieldCount": str(len(rewritten_fields)),
                "rowPresentation": "matrix",
            },
        }
    )


def _matrix_role_label_from_text(text: str) -> str | None:
    match = re.search(
        r"\b(VETERAN|SPOUSE|CHILD\s+\d+|DEPENDENT CHILD(?:\s+\d+)?)\b",
        text,
        flags=re.IGNORECASE,
    )
    if match is None:
        return None
    return " ".join(part.capitalize() for part in match.group(1).lower().split())


def _strip_matrix_role_suffix(text: str) -> str:
    stripped = _clean_field_label_text(text)
    suffix_pattern = re.compile(
        r"^(?P<prompt>.*?)(?:[\s.:;-]+)(?:VETERAN|SPOUSE|CHILD\s+\d+|DEPENDENT CHILD(?:\s+\d+)?)\s+"
        r"(?:GROSS ANNUAL INCOME|NET INCOME|OTHER INCOME)\b.*$",
        flags=re.IGNORECASE,
    )
    match = suffix_pattern.match(stripped)
    if match is not None:
        return match.group("prompt").strip(" ,.;:-")
    return stripped


def _is_meaningful_matrix_prompt(text: str) -> bool:
    normalized = _normalize_text(text)
    if len(normalized) < 12:
        return False
    if re.fullmatch(r"\d+", normalized):
        return False
    return True


def _is_currency_marker_text(text: str) -> bool:
    return bool(re.fullmatch(r"\s*\$+\s*", text))


def _field_top_level_number(field: FieldNode) -> int | None:
    match = re.match(r"^\s*(\d+)\.\s+", field.label.strip())
    if match is None:
        return None
    return int(match.group(1))


def _should_merge_group_pair(current: GroupNode, next_group: GroupNode) -> bool:
    current_prefix = _group_prefix(current)
    next_prefix = _group_prefix(next_group)
    if not current_prefix or current_prefix != next_prefix:
        return False
    return _group_has_only_statements(current) != _group_has_only_statements(next_group)


def _merge_group_pair(current: GroupNode, next_group: GroupNode) -> GroupNode:
    merged_label = _preferred_merged_group_label(current, next_group)
    merged_bounds = _union_coordinates([*current.source_coordinates, *next_group.source_coordinates])
    merged_fields = _relabel_primary_group_field(
        [
        *current.fields,
        *next_group.fields,
        ],
        merged_label,
    )
    merged_label, merged_fields = _normalize_region_group_content(merged_label, merged_fields)
    return next_group.model_copy(
        update={
            "label": merged_label,
            "order_index": min(current.order_index, next_group.order_index),
            "source_coordinates": [merged_bounds] if merged_bounds is not None else next_group.source_coordinates,
            "fields": merged_fields,
            "renderer_hints": {**next_group.renderer_hints, "fieldCount": str(len(merged_fields))},
        }
    )


def _relabel_primary_group_field(fields: list[FieldNode], merged_label: str) -> list[FieldNode]:
    primary_index = next((index for index, field in enumerate(fields) if _field_is_structured_control(field)), None)
    if primary_index is None:
        return fields

    updated: list[FieldNode] = []
    for index, field in enumerate(fields):
        if index == primary_index:
            updated.append(
                field.model_copy(
                    update={
                        "label": merged_label,
                        "evidence": _rewrite_field_evidence_snippets(field.evidence, merged_label),
                    }
                )
            )
            continue
        updated.append(field)
    return updated


def _group_has_only_statements(group: GroupNode) -> bool:
    return bool(group.fields) and all(field.semantic_type == SemanticType.STATEMENT for field in group.fields)


def _group_prefix(group: GroupNode) -> str | None:
    candidates = [group.label, *[field.label for field in group.fields if field.semantic_type != SemanticType.STATEMENT]]
    for label in candidates:
        prefix = _label_prefix(label)
        if prefix:
            return prefix
    return None


def _preferred_merged_group_label(current: GroupNode, next_group: GroupNode) -> str:
    candidates = [
        next_group.label,
        *[field.label for field in next_group.fields if _field_is_structured_control(field)],
        *[
            field.label
            for field in current.fields
            if field.semantic_type == SemanticType.STATEMENT
            and not _is_auxiliary_group_statement(field.label)
            and not _statement_restarts_group_prompt(field.label, next_group.label)
        ],
        *[field.label for field in next_group.fields if field.semantic_type == SemanticType.STATEMENT and not _is_auxiliary_group_statement(field.label)],
    ]
    merged = _merge_prompt_parts(candidates)
    if merged:
        return merged
    return max(candidates, key=lambda value: (len(value), value))


def _layout_order_items(
    items: list[tuple[str, GroupNode | FieldNode]],
) -> list[tuple[str, GroupNode | FieldNode]]:
    sorted_items = sorted(
        items,
        key=lambda item: (
            _item_anchor(item[1]).y,
            _item_anchor(item[1]).x,
            1 if item[0] == "field" and isinstance(item[1], FieldNode) and item[1].semantic_type == SemanticType.STATEMENT else 0,
            _item_label(item[1]).lower(),
        ),
    )
    rows: list[list[tuple[str, GroupNode | FieldNode]]] = []
    row_anchor_y: list[float] = []
    tolerance = 18.0

    for item in sorted_items:
        anchor = _item_anchor(item[1])
        if not rows or abs(anchor.y - row_anchor_y[-1]) > tolerance:
            rows.append([item])
            row_anchor_y.append(anchor.y)
            continue
        rows[-1].append(item)
        row_anchor_y[-1] = min(row_anchor_y[-1], anchor.y)

    ordered: list[tuple[str, GroupNode | FieldNode]] = []
    for row in rows:
        row.sort(
            key=lambda item: (
                _item_numeric_key(_item_label(item[1])) is None,
                _item_numeric_key(_item_label(item[1])) or (10_000, 10_000),
                _item_anchor(item[1]).x,
                _item_anchor(item[1]).y,
                _item_label(item[1]).lower(),
            )
        )
        ordered.extend(row)
    return ordered


def _field_anchor(field: FieldNode) -> Coordinates:
    if field.semantic_type in {SemanticType.CHECKBOX, SemanticType.RADIO, SemanticType.SELECT} and field.evidence:
        label_bounds = field.evidence[0].bounds
        if label_bounds is not None:
            return label_bounds
    if field.source_coordinates:
        return field.source_coordinates[0]
    if field.evidence and field.evidence[0].bounds is not None:
        return field.evidence[0].bounds
    return Coordinates(page=1, x=0, y=10_000, width=1, height=1)


def _item_anchor(item: GroupNode | FieldNode) -> Coordinates:
    if isinstance(item, GroupNode):
        return _group_anchor(item)
    return _field_anchor(item)


def _item_label(item: GroupNode | FieldNode) -> str:
    return item.label


def _item_numeric_key(label: str) -> tuple[int, int] | None:
    match = re.match(r"^\s*(\d+)(?:\s*\.\s*|\s*)([A-Z])?(?:\.)?", label.strip())
    if match is None:
        return None
    primary = int(match.group(1))
    suffix = match.group(2)
    suffix_value = ord(suffix) - 64 if suffix else 0
    return primary, suffix_value


def _label_prefix(label: str) -> str | None:
    stripped = label.strip()
    match = re.match(r"^(\d+[A-Z]?|[A-Z])\.", stripped)
    if match is not None:
        return match.group(1)
    match = re.match(r"^(\d+)\s*[A-Z]\b", stripped)
    if match is not None:
        return match.group(1)
    return None


def _group_anchor(group: GroupNode) -> Coordinates:
    if group.source_coordinates:
        return group.source_coordinates[0]
    if group.evidence and group.evidence[0].bounds is not None:
        return group.evidence[0].bounds
    return Coordinates(page=1, x=0, y=10_000, width=1, height=1)


def _union_coordinates(coordinates: list[Coordinates]) -> Coordinates | None:
    if not coordinates:
        return None
    page = coordinates[0].page
    left = min(coordinate.x for coordinate in coordinates)
    top = min(coordinate.y for coordinate in coordinates)
    right = max(coordinate.x + coordinate.width for coordinate in coordinates)
    bottom = max(coordinate.y + coordinate.height for coordinate in coordinates)
    return Coordinates(page=page, x=left, y=top, width=max(right - left, 1), height=max(bottom - top, 1))


def _should_promote_group(candidate: ExtractedFieldCandidate) -> bool:
    return candidate.semantic_type in {SemanticType.CHECKBOX, SemanticType.RADIO, SemanticType.SELECT} and len(candidate.options) > 0


def _drop_section_heading_line(lines: list[ExtractedTextLine], section_title: str) -> list[ExtractedTextLine]:
    normalized_title = _normalize_text(section_title)
    return [
        line
        for line in lines
        if _normalize_text(line.text) != normalized_title or not _is_section_heading(line)
    ]


def _is_section_heading(line: ExtractedTextLine) -> bool:
    return bool(re.match(r"^SECTION\s+(?:[IVX]+|\d+)\b", line.text.strip(), flags=re.IGNORECASE))


def _line_within_y_range(line: ExtractedTextLine, start_y: float, end_y: float) -> bool:
    anchor_y = line.bounds.y if line.bounds is not None else 10_000
    return anchor_y >= start_y and anchor_y < end_y


def _candidate_anchor_y(candidate: ExtractedFieldCandidate) -> float:
    if candidate.source_coordinates:
        return candidate.source_coordinates[0].y
    return 10_000


def _coordinate_sort_key(
    coordinate: Coordinates | None,
    *,
    fallback_y: float,
    fallback_x: float,
) -> tuple[float, float]:
    if coordinate is None:
        return (fallback_y, fallback_x)
    return (coordinate.y, coordinate.x)


def _normalize_text(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def _first_page_field_id(pages: list[PageNode]) -> str | None:
    if not pages or not pages[0].sections:
        return None
    first_section = pages[0].sections[0]
    if first_section.fields:
        return first_section.fields[0].id
    if first_section.groups and first_section.groups[0].fields:
        return first_section.groups[0].fields[0].id
    return None
