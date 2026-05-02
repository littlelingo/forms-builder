from __future__ import annotations

from io import BytesIO
import re

import fitz
import pdfplumber
from lxml import etree
from pdfminer.high_level import extract_text as pdfminer_extract_text
from pydantic import Field
from pypdf import PdfReader

from form_builder_api.models.base import CamelModel
from form_builder_api.models.canonical import Coordinates, SemanticType, SourcePriority
from form_builder_api.services.classification import ClassificationResult


class ExtractedTextLine(CamelModel):
    page_number: int
    text: str
    confidence: float
    bounds: Coordinates | None = None


class ExtractedFieldCandidate(CamelModel):
    name: str
    label: str
    semantic_type: SemanticType
    page_number: int = 1
    confidence: float
    source_priority: SourcePriority
    options: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    help_text: str | None = None
    source_coordinates: list[Coordinates] = Field(default_factory=list)
    label_bounds: Coordinates | None = None
    raw_field_type: str | None = None


class TableHint(CamelModel):
    page_number: int
    table_count: int


class ExtractedPageRegion(CamelModel):
    id: str
    page_number: int
    bounds: Coordinates
    kind: str = "layout_region"
    notes: list[str] = Field(default_factory=list)


class ExtractionContext(CamelModel):
    page_count: int
    text_lines: list[ExtractedTextLine] = Field(default_factory=list)
    field_candidates: list[ExtractedFieldCandidate] = Field(default_factory=list)
    xfa_field_hints: list[ExtractedFieldCandidate] = Field(default_factory=list)
    table_hints: list[TableHint] = Field(default_factory=list)
    page_regions: list[ExtractedPageRegion] = Field(default_factory=list)
    adapter_notes: list[str] = Field(default_factory=list)


def extract_document_context(payload: bytes, classification: ClassificationResult) -> ExtractionContext:
    page_count, text_lines = _extract_page_text(payload)
    field_candidates = _extract_acroform_fields(payload, text_lines)
    xfa_field_hints = _extract_xfa_field_hints(payload) if classification.signals.contains_xfa else []
    table_hints = _extract_table_hints(payload)
    page_regions = _extract_page_regions(payload, text_lines, field_candidates)

    notes = [
        f"fitz_text_lines={len(text_lines)}",
        f"acroform_fields={len(field_candidates)}",
        f"xfa_hints={len(xfa_field_hints)}",
        f"table_hints={sum(hint.table_count for hint in table_hints)}",
        f"page_regions={len(page_regions)}",
    ]

    return ExtractionContext(
        page_count=page_count,
        text_lines=text_lines,
        field_candidates=field_candidates,
        xfa_field_hints=xfa_field_hints,
        table_hints=table_hints,
        page_regions=page_regions,
        adapter_notes=notes,
    )


def _extract_page_text(payload: bytes) -> tuple[int, list[ExtractedTextLine]]:
    document = fitz.open(stream=payload, filetype="pdf")
    lines: list[ExtractedTextLine] = []
    fallback_text: str | None = None

    try:
        page_count = document.page_count
        for page_number, page in enumerate(document, start=1):
            page_words = page.get_text("words", sort=True) or []
            line_groups: dict[tuple[int, int], dict[str, object]] = {}
            for word in page_words:
                x0, y0, x1, y1, text, block_number, line_number, _word_number = word
                cleaned_word = _clean_line(text)
                if not cleaned_word:
                    continue
                key = (int(block_number), int(line_number))
                group = line_groups.setdefault(
                    key,
                    {
                        "words": [],
                        "x0": float(x0),
                        "y0": float(y0),
                        "x1": float(x1),
                        "y1": float(y1),
                    },
                )
                group["words"].append(cleaned_word)
                group["x0"] = min(float(group["x0"]), float(x0))
                group["y0"] = min(float(group["y0"]), float(y0))
                group["x1"] = max(float(group["x1"]), float(x1))
                group["y1"] = max(float(group["y1"]), float(y1))

            cleaned: list[ExtractedTextLine] = []
            for group in sorted(line_groups.values(), key=lambda item: (float(item["y0"]), float(item["x0"]))):
                text = _clean_line(" ".join(group["words"]))
                if not text:
                    continue
                cleaned.append(
                    ExtractedTextLine(
                        page_number=page_number,
                        text=text,
                        confidence=0.78,
                        bounds=Coordinates(
                            page=page_number,
                            x=float(group["x0"]),
                            y=float(group["y0"]),
                            width=max(float(group["x1"]) - float(group["x0"]), 1.0),
                            height=max(float(group["y1"]) - float(group["y0"]), 1.0),
                        ),
                    )
                )
            if not cleaned and fallback_text is None:
                try:
                    fallback_text = pdfminer_extract_text(BytesIO(payload))
                except Exception:
                    fallback_text = None
            if not cleaned and fallback_text:
                cleaned = [
                    ExtractedTextLine(
                        page_number=page_number,
                        text=_clean_line(line),
                        confidence=0.58,
                    )
                    for line in fallback_text.splitlines()
                    if _clean_line(line)
                ]
            lines.extend(cleaned[:120])
    finally:
        document.close()

    return page_count, lines


def _extract_acroform_fields(payload: bytes, text_lines: list[ExtractedTextLine]) -> list[ExtractedFieldCandidate]:
    reader = PdfReader(BytesIO(payload), strict=False)
    text_by_page = _group_text_lines(text_lines)
    grouped_widgets: dict[tuple[int, str, str], dict[str, object]] = {}

    for fallback_page, page in enumerate(reader.pages, start=1):
        page_height = float(page.mediabox.height)
        annotations = _resolve_annotation_list(page.get("/Annots"))
        for annotation_ref in annotations:
            annotation = annotation_ref.get_object() if hasattr(annotation_ref, "get_object") else annotation_ref
            if annotation.get("/Subtype") != "/Widget":
                continue

            name = _widget_attribute(annotation, "/T")
            alt_text = _widget_attribute(annotation, "/TU")
            field_type = _widget_attribute(annotation, "/FT")
            if not isinstance(name, str) and not isinstance(alt_text, str):
                continue

            effective_name = name if isinstance(name, str) else alt_text
            assert isinstance(effective_name, str)
            page_number = _prefer_page_reference(effective_name, fallback_page)
            options = _normalize_options(_widget_attribute(annotation, "/Opt"))
            grouped_name = _groupable_field_name(effective_name, field_type)
            bounds = _normalize_widget_bounds(
                annotation.get("/Rect") or _widget_attribute(annotation, "/Rect"),
                page_number=page_number,
                page_height=page_height,
            )
            group_key = (page_number, grouped_name, str(field_type or "unknown"))
            group = grouped_widgets.setdefault(
                group_key,
                {
                    "name": grouped_name,
                    "alt_texts": [],
                    "options": [],
                    "coordinates": [],
                    "page_number": page_number,
                    "field_type": field_type,
                    "widget_names": [],
                    "widget_alt_texts": [],
                    "widgets": [],
                },
            )
            if isinstance(alt_text, str) and alt_text.strip():
                group["alt_texts"].append(alt_text.strip())
                group["widget_alt_texts"].append(alt_text.strip())
            group["widget_names"].append(effective_name)
            group["options"].extend(options)
            if bounds is not None:
                group["coordinates"].append(bounds)
            group["widgets"].append(
                {
                    "name": effective_name,
                    "alt_text": alt_text.strip() if isinstance(alt_text, str) else None,
                    "bounds": bounds,
                }
            )

    extracted: list[ExtractedFieldCandidate] = []
    for (_page_number, _name, _field_type), group in grouped_widgets.items():
        page_number = int(group["page_number"])
        name = str(group["name"])
        field_type = group["field_type"]
        alt_texts = _dedupe_strings(list(group["alt_texts"]))
        page_lines = text_by_page.get(page_number, [])
        widgets = list(group["widgets"])
        button_clusters = (
            _cluster_button_widgets(name, widgets)
            if field_type == "/Btn"
            else [widgets]
        )

        for cluster_index, widget_cluster in enumerate(button_clusters):
            coordinates = [
                bounds
                for widget in widget_cluster
                for bounds in [widget.get("bounds")]
                if isinstance(bounds, Coordinates)
            ]
            raw_options = _dedupe_strings(list(group["options"]))
            cluster_alt_texts = _dedupe_strings(
                [
                    alt_text
                    for widget in widget_cluster
                    for alt_text in [widget.get("alt_text")]
                    if isinstance(alt_text, str) and alt_text.strip()
                ]
            ) or alt_texts
            candidate_name = name if cluster_index == 0 else f"{name}.cluster{cluster_index + 1}"

            if field_type == "/Btn":
                label, help_text, semantic_type, options, label_source, label_bounds = _resolve_button_group(
                    name=candidate_name,
                    widgets=widget_cluster,
                    page_lines=page_lines,
                    fallback_options=raw_options,
                )
            else:
                semantic_type = _map_field_type(field_type, raw_options, duplicate_count=len(coordinates))
                label, help_text, label_source, label_bounds = _resolve_candidate_label(
                    name=candidate_name,
                    alt_texts=cluster_alt_texts,
                    semantic_type=semantic_type,
                    page_lines=page_lines,
                    coordinates=coordinates,
                )
                options = raw_options
            label = _clean_candidate_label(label)
            confidence = 0.96 if label_source == "tooltip" else 0.84 if label_source == "layout" else 0.74
            notes = [
                f"AcroForm field type {field_type}" if field_type else "AcroForm field type unavailable",
                f"label source {label_source}",
            ]
            if len(coordinates) > 1:
                notes.append(f"grouped widgets {len(coordinates)}")
            if len(button_clusters) > 1:
                notes.append(f"spatial cluster {cluster_index + 1} of {len(button_clusters)}")
            if cluster_alt_texts and help_text:
                notes.append("Tooltip text preserved as help text.")
            extracted.append(
                ExtractedFieldCandidate(
                    name=candidate_name,
                    label=label,
                    semantic_type=semantic_type,
                    page_number=page_number,
                    confidence=confidence,
                    source_priority=SourcePriority.ACROFORM,
                    options=options,
                    notes=notes,
                    help_text=help_text,
                    source_coordinates=coordinates,
                    label_bounds=label_bounds,
                    raw_field_type=str(field_type) if field_type else None,
                )
            )

    extracted.sort(
        key=lambda candidate: (
            candidate.page_number,
            candidate.source_coordinates[0].y if candidate.source_coordinates else 10_000,
            candidate.source_coordinates[0].x if candidate.source_coordinates else 10_000,
            candidate.label.lower(),
        )
    )
    return extracted


def _extract_xfa_field_hints(payload: bytes) -> list[ExtractedFieldCandidate]:
    reader = PdfReader(BytesIO(payload), strict=False)
    root = reader.trailer.get("/Root", {})
    acroform = root.get("/AcroForm")
    acroform_dict = acroform.get_object() if hasattr(acroform, "get_object") else acroform
    xfa = acroform_dict.get("/XFA") if acroform_dict else None
    if not xfa:
        return []

    packets: list[bytes] = []
    if isinstance(xfa, list):
        for item in xfa:
            if hasattr(item, "get_object"):
                item = item.get_object()
            data = getattr(item, "get_data", None)
            if callable(data):
                packets.append(data())
    else:
        xfa_obj = xfa.get_object() if hasattr(xfa, "get_object") else xfa
        data = getattr(xfa_obj, "get_data", None)
        if callable(data):
            packets.append(data())

    seen: set[str] = set()
    candidates: list[ExtractedFieldCandidate] = []

    for packet in packets:
        try:
            root_node = etree.fromstring(packet)
        except Exception:
            continue
        for node in root_node.xpath(".//*[@name]"):
            name = node.attrib.get("name")
            if not name or name in seen:
                continue
            seen.add(name)
            text = " ".join(part.strip() for part in node.itertext() if part.strip())
            candidates.append(
                ExtractedFieldCandidate(
                    name=name,
                    label=_humanize_name(name),
                    semantic_type=SemanticType.TEXT,
                    page_number=1,
                    confidence=0.68,
                    source_priority=SourcePriority.XFA_XML,
                    notes=[text[:180]] if text else ["Recovered from XFA packet metadata."],
                )
            )

    return candidates


def _extract_table_hints(payload: bytes) -> list[TableHint]:
    hints: list[TableHint] = []
    with pdfplumber.open(BytesIO(payload)) as pdf:
        for page_number, page in enumerate(pdf.pages, start=1):
            try:
                tables = page.extract_tables() or []
            except Exception:
                tables = []
            hints.append(TableHint(page_number=page_number, table_count=len(tables)))
    return hints


def _extract_page_regions(
    payload: bytes,
    text_lines: list[ExtractedTextLine],
    field_candidates: list[ExtractedFieldCandidate],
) -> list[ExtractedPageRegion]:
    text_by_page = _group_text_lines(text_lines)
    fields_by_page: dict[int, list[ExtractedFieldCandidate]] = {}
    for candidate in field_candidates:
        fields_by_page.setdefault(candidate.page_number, []).append(candidate)

    document = fitz.open(stream=payload, filetype="pdf")
    extracted: list[ExtractedPageRegion] = []

    try:
        for page_number, page in enumerate(document, start=1):
            page_width = float(page.rect.width)
            page_height = float(page.rect.height)
            page_lines = text_by_page.get(page_number, [])
            page_fields = fields_by_page.get(page_number, [])

            try:
                tables = page.find_tables().tables
            except Exception:
                tables = []

            cell_regions: list[Coordinates] = []
            for table in tables:
                cells = getattr(table, "cells", None) or []
                cell_regions.extend(
                    _table_cells_to_regions(
                        cells=cells,
                        page_number=page_number,
                        page_width=page_width,
                        page_height=page_height,
                        page_lines=page_lines,
                        page_fields=page_fields,
                    )
                )

            for index, bounds in enumerate(_dedupe_coordinates(cell_regions)):
                extracted.append(
                    ExtractedPageRegion(
                        id=f"region-{page_number}-{index}",
                        page_number=page_number,
                        bounds=bounds,
                        notes=["Recovered from table/grid line geometry."],
                    )
                )
    finally:
        document.close()

    return extracted


def _table_cells_to_regions(
    *,
    cells: list[tuple[float, float, float, float]],
    page_number: int,
    page_width: float,
    page_height: float,
    page_lines: list[ExtractedTextLine],
    page_fields: list[ExtractedFieldCandidate],
) -> list[Coordinates]:
    large_cells: list[Coordinates] = []
    narrow_cells: list[Coordinates] = []

    for cell in cells:
        bounds = _table_cell_to_coordinates(cell, page_number=page_number)
        if bounds is None:
            continue
        if bounds.width >= page_width * 0.92 and bounds.height >= page_height * 0.9:
            continue
        if bounds.height <= 24 and bounds.width >= page_width * 0.7:
            continue
        if bounds.width < 16 or bounds.height < 12:
            continue
        if bounds.width >= 120 and bounds.height >= 28:
            large_cells.append(bounds)
        elif bounds.width <= 42 and bounds.height >= 28:
            narrow_cells.append(bounds)

    regions: list[Coordinates] = []
    for cell in large_cells:
        merged = cell
        siblings = [
            sibling
            for sibling in narrow_cells
            if _vertical_overlap_ratio(cell, sibling) >= 0.72 and abs((cell.x + cell.width) - sibling.x) <= 2.5
        ]
        for sibling in sorted(siblings, key=lambda coordinate: coordinate.x):
            merged = _merge_coordinate_pair(merged, sibling)

        if not _region_has_content(merged, page_lines, page_fields):
            continue
        if len(_text_lines_in_bounds(page_lines, merged, margin=4.0)) < 2 and not _candidate_in_bounds(page_fields, merged, margin=4.0):
            continue
        regions.append(merged)

    return regions


def _table_cell_to_coordinates(
    cell: tuple[float, float, float, float] | None,
    *,
    page_number: int,
) -> Coordinates | None:
    if cell is None or len(cell) != 4:
        return None
    x0, y0, x1, y1 = cell
    left = min(float(x0), float(x1))
    top = min(float(y0), float(y1))
    right = max(float(x0), float(x1))
    bottom = max(float(y0), float(y1))
    return Coordinates(
        page=page_number,
        x=left,
        y=top,
        width=max(right - left, 1.0),
        height=max(bottom - top, 1.0),
    )


def _merge_coordinate_pair(left: Coordinates, right: Coordinates) -> Coordinates:
    return Coordinates(
        page=left.page,
        x=min(left.x, right.x),
        y=min(left.y, right.y),
        width=max((left.x + left.width), (right.x + right.width)) - min(left.x, right.x),
        height=max((left.y + left.height), (right.y + right.height)) - min(left.y, right.y),
    )


def _vertical_overlap_ratio(left: Coordinates, right: Coordinates) -> float:
    overlap = min(left.y + left.height, right.y + right.height) - max(left.y, right.y)
    if overlap <= 0:
        return 0.0
    return overlap / max(min(left.height, right.height), 1.0)


def _region_has_content(
    bounds: Coordinates,
    page_lines: list[ExtractedTextLine],
    page_fields: list[ExtractedFieldCandidate],
) -> bool:
    return bool(_text_lines_in_bounds(page_lines, bounds, margin=4.0)) or _candidate_in_bounds(page_fields, bounds, margin=4.0)


def _candidate_in_bounds(
    page_fields: list[ExtractedFieldCandidate],
    bounds: Coordinates,
    *,
    margin: float,
) -> bool:
    return any(_coordinate_intersects(bounds, coordinate, margin=margin) for field in page_fields for coordinate in field.source_coordinates)


def _text_lines_in_bounds(
    page_lines: list[ExtractedTextLine],
    bounds: Coordinates,
    *,
    margin: float,
) -> list[ExtractedTextLine]:
    return [
        line
        for line in page_lines
        if line.bounds is not None and _coordinate_intersects(bounds, line.bounds, margin=margin) and len(line.text) >= 2
    ]


def _coordinate_intersects(left: Coordinates, right: Coordinates, *, margin: float) -> bool:
    return not (
        left.x > right.x + right.width + margin
        or right.x > left.x + left.width + margin
        or left.y > right.y + right.height + margin
        or right.y > left.y + left.height + margin
    )


def _dedupe_coordinates(coordinates: list[Coordinates]) -> list[Coordinates]:
    deduped: list[Coordinates] = []
    for coordinate in sorted(coordinates, key=lambda item: (item.page, item.y, item.x, item.width, item.height)):
        if any(_coordinates_close(existing, coordinate) for existing in deduped):
            continue
        deduped.append(coordinate)
    return deduped


def _coordinates_close(left: Coordinates, right: Coordinates) -> bool:
    return (
        left.page == right.page
        and abs(left.x - right.x) <= 2.5
        and abs(left.y - right.y) <= 2.5
        and abs(left.width - right.width) <= 3.0
        and abs(left.height - right.height) <= 3.0
    )


def _normalize_options(raw_options: object) -> list[str]:
    if not isinstance(raw_options, list):
        return []

    normalized: list[str] = []
    for option in raw_options:
        if isinstance(option, str):
            normalized.append(option)
        elif isinstance(option, list) and option:
            first = option[0]
            if isinstance(first, str):
                normalized.append(first)
    return normalized


def _map_field_type(field_type: object, options: list[str], duplicate_count: int = 1) -> SemanticType:
    if field_type == "/Btn":
        return SemanticType.RADIO if len(options) > 1 or duplicate_count > 1 else SemanticType.CHECKBOX
    if field_type == "/Ch":
        return SemanticType.SELECT
    if field_type == "/Sig":
        return SemanticType.SIGNATURE_ATTESTATION
    return SemanticType.TEXT


def _humanize_name(value: str) -> str:
    text = re.sub(r"[_\-.]+", " ", value).strip()
    text = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", text)
    return " ".join(part.capitalize() for part in text.split()) or "Untitled Field"


def _clean_line(value: str) -> str:
    compact = " ".join(value.split())
    return compact[:240].strip()


def _prefer_page_reference(name: str, fallback_page: int) -> int:
    match = re.search(r"\bP(\d+)\b", name, flags=re.IGNORECASE)
    if match is None:
        return fallback_page

    referenced_page = int(match.group(1))
    # Prefer explicit page identifiers embedded in VA-style field names such as P4[0].
    if referenced_page >= 1:
        return referenced_page
    return fallback_page


def _group_text_lines(lines: list[ExtractedTextLine]) -> dict[int, list[ExtractedTextLine]]:
    grouped: dict[int, list[ExtractedTextLine]] = {}
    for line in lines:
        grouped.setdefault(line.page_number, []).append(line)
    return grouped


def _resolve_annotation_list(raw_annotations: object) -> list[object]:
    if hasattr(raw_annotations, "get_object"):
        raw_annotations = raw_annotations.get_object()
    return raw_annotations or []


def _widget_attribute(annotation: object, key: str) -> object:
    value = annotation.get(key) if hasattr(annotation, "get") else None
    if value is not None:
        return value

    parent = annotation.get("/Parent") if hasattr(annotation, "get") else None
    if parent is not None and hasattr(parent, "get_object"):
        parent = parent.get_object()
    if parent is not None and hasattr(parent, "get"):
        return parent.get(key)
    return None


def _normalize_widget_bounds(rect: object, *, page_number: int, page_height: float) -> Coordinates | None:
    if not isinstance(rect, list) or len(rect) != 4:
        return None

    x0, y0, x1, y1 = (float(value) for value in rect)
    left = min(x0, x1)
    right = max(x0, x1)
    bottom = min(y0, y1)
    top = max(y0, y1)
    return Coordinates(
        page=page_number,
        x=left,
        y=max(page_height - top, 0.0),
        width=max(right - left, 1.0),
        height=max(top - bottom, 1.0),
    )


def _resolve_candidate_label(
    *,
    name: str,
    alt_texts: list[str],
    semantic_type: SemanticType,
    page_lines: list[ExtractedTextLine],
    coordinates: list[Coordinates],
) -> tuple[str, str | None, str, Coordinates | None]:
    informative_alt = next((text for text in alt_texts if _is_informative_alt_text(text, name)), None)
    if informative_alt:
        label, help_text = _label_and_help_from_alt_text(informative_alt)
        return label, help_text, "tooltip", None

    nearby_line = _find_nearby_label_line(page_lines, coordinates, semantic_type)
    if nearby_line is not None:
        return nearby_line.text, None, "layout", nearby_line.bounds

    return _humanize_name(name), None, "name", None


def _resolve_button_group(
    *,
    name: str,
    widgets: list[dict[str, object]],
    page_lines: list[ExtractedTextLine],
    fallback_options: list[str],
) -> tuple[str, str | None, SemanticType, list[str], str, Coordinates | None]:
    widgets = [widget for widget in widgets if widget.get("bounds") is not None]
    widgets.sort(key=lambda widget: _coordinate_sort_key(widget["bounds"]))

    prefix_hints: list[str] = []
    help_hints: list[str] = []
    resolved_options: list[str] = []
    exact_names = [str(widget["name"]) for widget in widgets if widget.get("name")]

    for widget in widgets:
        alt_text = widget.get("alt_text")
        bounds = widget.get("bounds")
        if isinstance(alt_text, str):
            prefix, alt_option, alt_help = _split_button_alt_text(alt_text)
            if prefix:
                prefix_hints.append(prefix)
            if alt_help:
                help_hints.append(alt_help)
        else:
            alt_option = None

        layout_option = _find_button_option_line(page_lines, bounds) if bounds is not None else None
        if layout_option is not None:
            resolved_options.append(layout_option.text)
        elif alt_option:
            resolved_options.append(alt_option)

    options = _dedupe_strings(resolved_options or fallback_options)
    if _should_assume_binary_yes_no(name, widgets, options):
        options = ["YES", "NO"]
    binary_prompt_line = _find_binary_group_prompt_line(page_lines, widgets, options)
    label_from_alt = _dedupe_strings(prefix_hints)[0] if prefix_hints else None
    label_line = binary_prompt_line or _find_group_heading_line(page_lines, widgets, options)
    if label_from_alt:
        label = label_from_alt
        label_source = "tooltip"
    elif label_line is not None:
        label = label_line.text
        label_source = "layout"
    else:
        label = _humanize_name(name)
        label_source = "name"

    help_text = _dedupe_strings(help_hints)[0] if help_hints else None
    semantic_type = _button_group_semantic_type(
        label=label,
        help_text=help_text,
        exact_names=exact_names,
        option_count=len(options),
    )
    return label, help_text, semantic_type, options, label_source, label_line.bounds if label_line is not None else None


def _is_informative_alt_text(value: str, name: str) -> bool:
    cleaned = _clean_line(value)
    if not cleaned:
        return False

    normalized_value = _normalized_compare_text(cleaned)
    normalized_name = _normalized_compare_text(_humanize_name(name))
    if normalized_value == normalized_name:
        return False
    if normalized_value in {"radiobuttonlist", "birthsex", "section6"}:
        return False
    return True


def _label_and_help_from_alt_text(value: str) -> tuple[str, str | None]:
    cleaned = _clean_line(value)
    if not cleaned:
        return "Untitled Field", None

    markers = [
        " Enter ",
        " This field ",
        " This is ",
        " Complete if ",
        " Please ",
        " Use a separate ",
        " Also enter ",
        " Check all that apply",
        " Check one",
        " Sign in ink",
        " NOTE:",
        " DO NOT ",
        " V. A. will ",
    ]
    cut_points = [cleaned.find(marker) for marker in markers if cleaned.find(marker) > 0]
    if not cut_points:
        return cleaned.rstrip(" ."), None

    split_at = min(cut_points)
    label = cleaned[:split_at].rstrip(" .;-:")
    help_text = cleaned[split_at:].strip(" .;-:")
    return label or cleaned.rstrip(" ."), help_text or None


def _split_button_alt_text(value: str) -> tuple[str | None, str | None, str | None]:
    cleaned = _clean_line(value)
    if not cleaned:
        return None, None, None

    if ":" in cleaned:
        prefix, suffix = cleaned.rsplit(":", 1)
        prefix = _clean_button_group_prefix(prefix)
        suffix = suffix.strip(" .;-:")
        if prefix and suffix:
            option_label, help_text = _label_and_help_from_alt_text(suffix)
            return prefix, option_label, help_text

    label, help_text = _label_and_help_from_alt_text(cleaned)
    return None, label, help_text


def _find_nearby_label_line(
    page_lines: list[ExtractedTextLine],
    coordinates: list[Coordinates],
    semantic_type: SemanticType,
) -> ExtractedTextLine | None:
    if not page_lines or not coordinates:
        return None

    anchor = min(coordinates, key=lambda coordinate: (coordinate.y, coordinate.x))
    best_line: ExtractedTextLine | None = None
    best_score = float("inf")

    for line in page_lines:
        if line.bounds is None:
            continue
        line_center_y = line.bounds.y + (line.bounds.height / 2)
        anchor_center_y = anchor.y + (anchor.height / 2)
        vertical_distance = abs(line_center_y - anchor_center_y)
        horizontal_offset = line.bounds.x - (anchor.x + anchor.width)
        label_overlap = min(line.bounds.x + line.bounds.width, anchor.x + anchor.width) - max(line.bounds.x, anchor.x)
        score = vertical_distance * 4

        if semantic_type in {SemanticType.CHECKBOX, SemanticType.RADIO}:
            if horizontal_offset < -180 or vertical_distance > 20:
                continue
            score += abs(horizontal_offset) if horizontal_offset >= -24 else 40
        else:
            if line.bounds.y > anchor.y + 36 or line.bounds.y + line.bounds.height < anchor.y - 28:
                continue
            if label_overlap < -160 and line.bounds.x > anchor.x + anchor.width + 48:
                continue
            score += abs(line.bounds.x - anchor.x) * 0.2
            if line.bounds.y > anchor.y:
                score += 24

        if len(line.text) < 3:
            continue
        if score < best_score:
            best_score = score
            best_line = line

    return best_line


def _find_button_option_line(
    page_lines: list[ExtractedTextLine],
    bounds: Coordinates,
) -> ExtractedTextLine | None:
    best_line: ExtractedTextLine | None = None
    best_score = float("inf")

    for line in page_lines:
        if line.bounds is None:
            continue
        if len(line.text) < 2:
            continue
        normalized = _normalized_compare_text(line.text)
        if normalized in {"yes", "no"}:
            vertical_distance = abs((line.bounds.y + (line.bounds.height / 2)) - (bounds.y + (bounds.height / 2)))
            if vertical_distance <= 24 and _line_center_x(line) >= bounds.x - 14 and _line_center_x(line) <= bounds.x + bounds.width + 22:
                return line
        vertical_distance = abs((line.bounds.y + (line.bounds.height / 2)) - (bounds.y + (bounds.height / 2)))
        if vertical_distance > 16:
            continue
        horizontal_offset = line.bounds.x - (bounds.x + bounds.width)
        if horizontal_offset < -24 and not _line_overlaps_widget_x(line, bounds):
            continue
        score = vertical_distance * 6 + abs(horizontal_offset)
        if score < best_score:
            best_score = score
            best_line = line

    binary_header = _find_binary_column_header_line(page_lines, bounds)
    if best_line is None:
        best_line = binary_header
    elif binary_header is not None and _normalized_compare_text(best_line.text) not in {"yes", "no"}:
        best_line = binary_header

    return best_line


def _find_binary_column_header_line(
    page_lines: list[ExtractedTextLine],
    bounds: Coordinates,
) -> ExtractedTextLine | None:
    best_line: ExtractedTextLine | None = None
    best_score = float("inf")

    for line in page_lines:
        if line.bounds is None:
            continue
        normalized = _normalized_compare_text(line.text)
        if normalized not in {"yes", "no"}:
            continue
        if line.bounds.y > bounds.y:
            continue
        vertical_distance = bounds.y - (line.bounds.y + line.bounds.height)
        if vertical_distance < 0 or vertical_distance > 92:
            continue
        center_x = _line_center_x(line)
        if center_x < bounds.x - 18 or center_x > bounds.x + bounds.width + 24:
            continue
        score = vertical_distance * 2 + abs(center_x - (bounds.x + (bounds.width / 2)))
        if score < best_score:
            best_score = score
            best_line = line

    return best_line


def _find_binary_group_prompt_line(
    page_lines: list[ExtractedTextLine],
    widgets: list[dict[str, object]],
    option_labels: list[str],
) -> ExtractedTextLine | None:
    normalized_options = {_normalized_compare_text(option) for option in option_labels}
    if not normalized_options or not normalized_options.issubset({"yes", "no"}):
        return None

    bounds_list = [widget["bounds"] for widget in widgets if isinstance(widget.get("bounds"), Coordinates)]
    if not bounds_list:
        return None

    left = min(bounds.x for bounds in bounds_list)
    top = min(bounds.y for bounds in bounds_list)
    bottom = max(bounds.y + bounds.height for bounds in bounds_list)
    anchor_candidates = [
        line
        for line in page_lines
        if line.bounds is not None
        and line.bounds.x <= left + 8
        and _looks_like_binary_prompt_anchor(line.text)
        and not _looks_machine_label(line.text)
        and line.bounds.y <= bottom + 12
        and line.bounds.y + line.bounds.height >= top - 84
    ]

    candidates = [
        line
        for line in page_lines
        if line.bounds is not None
        and line.bounds.x <= left + 8
        and _normalize_binary_prompt_candidate(line.text)
        and not _looks_machine_label(line.text)
        and _line_overlaps_vertical_band(line, top - 8, bottom + 24)
    ]
    candidates = [*anchor_candidates, *candidates]
    if not candidates:
        return None

    primary = min(
        _dedupe_prompt_lines(candidates),
        key=lambda line: (
            _binary_prompt_line_penalty(line, top),
            not _is_row_prompt_anchor_text(line.text),
            _prompt_column_gap(line, left),
            _vertical_distance_to_band(line, top, bottom),
            max(left - (line.bounds.x + line.bounds.width), 0) if line.bounds is not None else 10_000,
            line.bounds.x if line.bounds is not None else 10_000,
        ),
    )
    merged = [primary]
    if primary.bounds is not None:
        for line in page_lines:
            if line is primary or line.bounds is None:
                continue
            if not _normalize_binary_prompt_candidate(line.text):
                continue
            if abs(line.bounds.x - primary.bounds.x) > 24:
                continue
            if line.bounds.y <= primary.bounds.y:
                continue
            if line.bounds.y - (primary.bounds.y + primary.bounds.height) > 14:
                continue
            if re.match(r"^(?:\d+[A-Z]?|[A-Z])\.\s+", line.text.strip()):
                continue
            merged.append(line)

    if len(merged) == 1:
        return primary
    merged.sort(key=lambda line: (line.bounds.y if line.bounds else 10_000, line.bounds.x if line.bounds else 10_000))
    bounds = _union_coordinates([line.bounds for line in merged if line.bounds is not None])
    return ExtractedTextLine(
        page_number=primary.page_number,
        text=" ".join(line.text for line in merged),
        confidence=min(line.confidence for line in merged),
        bounds=bounds,
    )


def _binary_prompt_line_penalty(line: ExtractedTextLine, top: float) -> int:
    assert line.bounds is not None
    # For yes/no rows, the owning prompt almost always begins above the widgets.
    # Penalize prompt candidates that start below the widget row so later sibling
    # questions do not steal the current button cluster.
    return 1 if line.bounds.y > top + 2 else 0


def _dedupe_prompt_lines(lines: list[ExtractedTextLine]) -> list[ExtractedTextLine]:
    deduped: list[ExtractedTextLine] = []
    seen: set[tuple[int, int, str]] = set()
    for line in lines:
        if line.bounds is None:
            continue
        key = (round(line.bounds.x), round(line.bounds.y), line.text)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(line)
    return deduped


def _prompt_column_gap(line: ExtractedTextLine, left: float) -> float:
    assert line.bounds is not None
    return max(left - line.bounds.x, 0.0)


def _should_assume_binary_yes_no(
    name: str,
    widgets: list[dict[str, object]],
    options: list[str],
) -> bool:
    if len(widgets) != 2 or not _is_generic_button_group_name(name):
        return False
    normalized_options = {_normalized_compare_text(option) for option in options if option}
    if not normalized_options:
        return True
    return not normalized_options.issubset({"yes", "no"})


def _find_group_heading_line(
    page_lines: list[ExtractedTextLine],
    widgets: list[dict[str, object]],
    option_labels: list[str],
) -> ExtractedTextLine | None:
    if not widgets:
        return None

    bounds_list = [widget["bounds"] for widget in widgets if isinstance(widget.get("bounds"), Coordinates)]
    if not bounds_list:
        return None

    top = min(bounds.y for bounds in bounds_list)
    left = min(bounds.x for bounds in bounds_list)
    right = max(bounds.x + bounds.width for bounds in bounds_list)
    option_normalized = {_normalized_compare_text(option) for option in option_labels}

    best_line: ExtractedTextLine | None = None
    best_score = float("inf")
    for line in page_lines:
        if line.bounds is None:
            continue
        normalized_line = _normalized_compare_text(line.text)
        if not normalized_line or normalized_line in option_normalized:
            continue
        line_bottom = line.bounds.y + line.bounds.height
        if line_bottom > top + 6 or top - line_bottom > 40:
            continue
        if line.bounds.x > right + 40 or line.bounds.x + line.bounds.width < left - 20:
            continue
        score = (top - line_bottom) * 4 + abs(line.bounds.x - left)
        if score < best_score:
            best_score = score
            best_line = line

    return best_line


def _button_group_semantic_type(
    *,
    label: str,
    help_text: str | None,
    exact_names: list[str],
    option_count: int,
) -> SemanticType:
    joined = f"{label} {help_text or ''}".lower()
    if "check all" in joined or "may check more than one" in joined:
        return SemanticType.CHECKBOX
    if "check one" in joined or "yes or no" in joined:
        return SemanticType.RADIO
    if len(set(exact_names)) < len(exact_names):
        return SemanticType.RADIO
    if option_count > 1:
        return SemanticType.CHECKBOX
    return SemanticType.CHECKBOX


def _cluster_button_widgets(name: str, widgets: list[dict[str, object]]) -> list[list[dict[str, object]]]:
    widgets = [widget for widget in widgets if isinstance(widget.get("bounds"), Coordinates)]
    if not _should_split_button_widgets(name, widgets):
        return [widgets]

    sorted_widgets = sorted(
        widgets,
        key=lambda widget: _coordinate_sort_key(widget["bounds"]),
    )
    clusters: list[list[dict[str, object]]] = []
    row_anchor_y: list[float] = []

    for widget in sorted_widgets:
        bounds = widget["bounds"]
        assert isinstance(bounds, Coordinates)
        center_y = bounds.y + (bounds.height / 2)
        if not clusters or abs(center_y - row_anchor_y[-1]) > 24:
            clusters.append([widget])
            row_anchor_y.append(center_y)
            continue
        clusters[-1].append(widget)
        row_anchor_y[-1] = min(row_anchor_y[-1], center_y)

    return [cluster for cluster in clusters if cluster] or [widgets]


def _should_split_button_widgets(name: str, widgets: list[dict[str, object]]) -> bool:
    if len(widgets) < 4 or not _is_generic_button_group_name(name):
        return False
    coordinates = [
        bounds
        for widget in widgets
        for bounds in [widget.get("bounds")]
        if isinstance(bounds, Coordinates)
    ]
    if not coordinates:
        return False
    top = min(coordinate.y for coordinate in coordinates)
    bottom = max(coordinate.y + coordinate.height for coordinate in coordinates)
    return (bottom - top) >= 48


def _is_generic_button_group_name(name: str) -> bool:
    normalized = _normalized_compare_text(name)
    generic_markers = [
        "radiobuttonlist",
        "checkboxlist",
        "buttonlist",
        "section6",
        "section7",
        "section8",
    ]
    return any(marker in normalized for marker in generic_markers)


def _groupable_field_name(name: str, field_type: object) -> str:
    if field_type != "/Btn":
        return name
    return re.sub(r"\[\d+\]$", "", name)


def _coordinate_sort_key(coordinate: Coordinates) -> tuple[float, float]:
    return (coordinate.y, coordinate.x)


def _union_coordinates(coordinates: list[Coordinates]) -> Coordinates | None:
    if not coordinates:
        return None
    page = coordinates[0].page
    left = min(coordinate.x for coordinate in coordinates)
    top = min(coordinate.y for coordinate in coordinates)
    right = max(coordinate.x + coordinate.width for coordinate in coordinates)
    bottom = max(coordinate.y + coordinate.height for coordinate in coordinates)
    return Coordinates(page=page, x=left, y=top, width=max(right - left, 1.0), height=max(bottom - top, 1.0))


def _line_center_x(line: ExtractedTextLine) -> float:
    assert line.bounds is not None
    return line.bounds.x + (line.bounds.width / 2)


def _line_overlaps_widget_x(line: ExtractedTextLine, bounds: Coordinates) -> bool:
    assert line.bounds is not None
    return not (line.bounds.x > bounds.x + bounds.width + 6 or line.bounds.x + line.bounds.width < bounds.x - 6)


def _normalize_binary_prompt_candidate(text: str) -> bool:
    normalized = _normalized_compare_text(text)
    return bool(normalized) and normalized not in {"yes", "no", "from", "to"}


def _is_row_prompt_anchor_text(text: str) -> bool:
    return bool(re.match(r"^(?:\d+[A-Z]?|[A-Z])\.\s+", text.strip()))


def _looks_like_binary_prompt_anchor(text: str) -> bool:
    stripped = text.strip()
    if re.match(r"^[A-Z]\.\s+", stripped):
        return True
    lowered = stripped.lower()
    if "?" in stripped:
        return True
    return any(
        phrase in lowered
        for phrase in (
            "are you",
            "did you",
            "do you",
            "would you",
            "were you",
            "have you",
        )
    )


def _looks_machine_label(value: str) -> bool:
    return bool(re.match(r"^F\[\d+\]", value)) or bool(re.search(r"\bP\d+\[\d+\]", value))


def _line_overlaps_vertical_band(line: ExtractedTextLine, top: float, bottom: float) -> bool:
    assert line.bounds is not None
    line_top = line.bounds.y
    line_bottom = line.bounds.y + line.bounds.height
    return not (line_top > bottom or line_bottom < top)


def _vertical_distance_to_band(line: ExtractedTextLine, top: float, bottom: float) -> float:
    assert line.bounds is not None
    center_y = line.bounds.y + (line.bounds.height / 2)
    if top <= center_y <= bottom:
        return 0.0
    return min(abs(center_y - top), abs(center_y - bottom))


def _clean_button_group_prefix(value: str) -> str:
    cleaned = value.rstrip(" .;-:")
    cleaned = re.sub(r"^SECTION\s+\d+\.?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^GENERAL INFORMATION\.?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^Read information above\.?\s*", "", cleaned, flags=re.IGNORECASE)
    if "Read information above." in cleaned:
        cleaned = cleaned.split("Read information above.", 1)[-1].strip(" .;-:")
    return cleaned or value.rstrip(" .;-:")


def _clean_candidate_label(value: str) -> str:
    cleaned = value.strip()
    cleaned = re.sub(
        r"^SECTION\s+\d+\.\s+[A-Z][A-Z\s\-]+?\.\s+(?=\d+\.\s*[A-Z])",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    return cleaned.strip() or value.strip()


def _normalized_compare_text(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def _dedupe_strings(values: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        ordered.append(value)
    return ordered
