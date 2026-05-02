from __future__ import annotations

from pathlib import Path

from form_builder_api.models.api import SamplePdfSummary
from form_builder_api.services.classification import DocumentInspectionError, classify_document
from form_builder_api.services.corpus_validation import collect_form_sample_pdfs, resolve_form_samples_dir


def list_sample_pdfs() -> list[SamplePdfSummary]:
    base_dir = resolve_form_samples_dir()
    if base_dir is None:
        return []

    summaries: list[SamplePdfSummary] = []
    for pdf_path in collect_form_sample_pdfs(base_dir):
        summaries.append(_build_summary(pdf_path))
    return summaries


def load_sample_pdf(filename: str) -> tuple[str, bytes]:
    base_dir = resolve_form_samples_dir()
    if base_dir is None:
        raise FileNotFoundError("Local sample corpus is unavailable.")

    pdf_path = _resolve_sample_path(base_dir, filename)
    return pdf_path.name, pdf_path.read_bytes()


def _build_summary(pdf_path: Path) -> SamplePdfSummary:
    payload = pdf_path.read_bytes()
    try:
        classification = classify_document(payload)
    except DocumentInspectionError:
        return SamplePdfSummary(filename=pdf_path.name, file_size=pdf_path.stat().st_size)

    return SamplePdfSummary(
        filename=pdf_path.name,
        file_size=pdf_path.stat().st_size,
        document_class=classification.document_class,
        document_signals=classification.signals,
    )


def _resolve_sample_path(base_dir: Path, filename: str) -> Path:
    candidate = (base_dir / filename).resolve()
    base_resolved = base_dir.resolve()
    if candidate.parent != base_resolved or not candidate.is_file():
        raise FileNotFoundError(f"Sample PDF not found: {filename}")
    return candidate
