from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import fitz

from form_builder_api.services.classification import classify_document
from form_builder_api.services.extraction import build_form_definition

DEFAULT_FORM_SAMPLES_DIR = Path("/Users/clint/Workspace/va/form-samples")
SMOKE_SAMPLE_NAMES = (
    "10-10CG.pdf",
    "VA Form 10-10EZ.pdf",
    "VBA-21-526EZ-ARE.pdf",
    "VBA-20-0995-ARE.pdf",
    "va-form-21-4142_2020.pdf",
    "standard-form-180_2020.pdf",
    "dd-form-293_2020.pdf",
)


@dataclass(frozen=True)
class SampleValidationMetrics:
    filename: str
    document_class: str
    page_count: int
    field_count: int
    interactive_field_count: int
    group_count: int
    issue_count: int
    machine_label_count: int
    prompt_value_group_count: int
    matrix_group_count: int
    average_confidence: float


def resolve_form_samples_dir(explicit_dir: str | Path | None = None) -> Path | None:
    if explicit_dir is not None:
        candidate = Path(explicit_dir).expanduser()
        return candidate if candidate.exists() else None
    return DEFAULT_FORM_SAMPLES_DIR if DEFAULT_FORM_SAMPLES_DIR.exists() else None


def collect_form_sample_pdfs(
    base_dir: Path,
    *,
    names: Iterable[str] | None = None,
    limit: int | None = None,
) -> list[Path]:
    if names is not None:
        selected = [base_dir / name for name in names]
        return [path for path in selected if path.exists()]

    pdfs = sorted(path for path in base_dir.glob("*.pdf") if path.is_file())
    if limit is not None:
        return pdfs[:limit]
    return pdfs


def extract_sample_validation_metrics(pdf_path: Path) -> SampleValidationMetrics:
    fitz.TOOLS.mupdf_display_warnings(False)
    fitz.TOOLS.mupdf_display_errors(False)

    payload = pdf_path.read_bytes()
    classification = classify_document(payload)
    draft = build_form_definition(pdf_path.name, payload, classification)

    groups = [group for page in draft.pages for section in page.sections for group in section.groups]
    fields = [
        field
        for page in draft.pages
        for section in page.sections
        for field in [*section.fields, *[child for group in section.groups for child in group.fields]]
    ]
    interactive_fields = [field for field in fields if field.semantic_type != "statement"]
    machine_label_count = sum(1 for field in fields if _looks_machine_label(field.label))
    average_confidence = sum(field.confidence for field in fields) / max(len(fields), 1)

    return SampleValidationMetrics(
        filename=pdf_path.name,
        document_class=classification.document_class.value,
        page_count=len(draft.pages),
        field_count=len(fields),
        interactive_field_count=len(interactive_fields),
        group_count=len(groups),
        issue_count=len(draft.issues),
        machine_label_count=machine_label_count,
        prompt_value_group_count=sum(
            1
            for group in groups
            if len(group.fields) == 1 and group.fields[0].renderer_hints.get("promptValuePair") == "true"
        ),
        matrix_group_count=sum(1 for group in groups if group.renderer_hints.get("rowPresentation") == "matrix"),
        average_confidence=average_confidence,
    )


def _looks_machine_label(value: str) -> bool:
    return bool(re.match(r"^F\[\d+\]", value)) or bool(re.search(r"\bP\d+\[\d+\]", value))
