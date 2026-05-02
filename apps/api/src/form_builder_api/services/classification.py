from __future__ import annotations

from io import BytesIO

import fitz
from pydantic import Field
from pypdf import PdfReader

from form_builder_api.models.api import DocumentSignals
from form_builder_api.models.base import CamelModel
from form_builder_api.models.canonical import DocumentClass


class DocumentInspectionError(ValueError):
    """Raised when an uploaded file cannot be inspected as a PDF."""


class ClassificationResult(CamelModel):
    document_class: DocumentClass
    extractor_path: list[str]
    confidence: float
    notes: list[str] = Field(default_factory=list)
    signals: DocumentSignals


def _extract_document_signals(payload: bytes) -> DocumentSignals:
    if not payload:
        raise DocumentInspectionError("Uploaded file is empty.")

    try:
        reader = PdfReader(BytesIO(payload), strict=False)
    except Exception as exc:
        raise DocumentInspectionError("The uploaded file could not be read as a PDF.") from exc

    if reader.is_encrypted:
        try:
            unlocked = reader.decrypt("")
        except Exception as exc:
            raise DocumentInspectionError("Encrypted PDFs are not supported in phase 1.") from exc
        if unlocked == 0:
            raise DocumentInspectionError("Encrypted PDFs are not supported in phase 1.")

    root = reader.trailer.get("/Root", {})
    acroform = root.get("/AcroForm")
    acroform_dict = acroform.get_object() if hasattr(acroform, "get_object") else acroform
    contains_acroform = bool(acroform_dict)
    contains_xfa = bool(acroform_dict and acroform_dict.get("/XFA"))
    acroform_field_count = len(acroform_dict.get("/Fields", [])) if acroform_dict else 0

    try:
        document = fitz.open(stream=payload, filetype="pdf")
    except Exception as exc:
        raise DocumentInspectionError("The PDF opened in pypdf but failed layout inspection.") from exc

    text_page_count = 0
    image_only_page_count = 0
    detected_modes: set[str] = set()
    sample_text_excerpt: str | None = None

    try:
        page_count = document.page_count
        for page in document:
            text = (page.get_text("text") or "").strip()
            image_count = len(page.get_images(full=True))
            text_char_count = len(text)
            has_text = text_char_count >= 20 or len(text.split()) >= 4
            likely_image_only = not has_text and image_count > 0

            if has_text:
                text_page_count += 1
                detected_modes.add("text")
                if sample_text_excerpt is None:
                    sample_text_excerpt = " ".join(text.split())[:220]
            elif likely_image_only:
                image_only_page_count += 1
                detected_modes.add("image")
            else:
                detected_modes.add("sparse")
    finally:
        document.close()

    mixed_page_modes = "text" in detected_modes and "image" in detected_modes

    return DocumentSignals(
        page_count=page_count,
        contains_xfa=contains_xfa,
        contains_acroform=contains_acroform,
        acroform_field_count=acroform_field_count,
        text_page_count=text_page_count,
        image_only_page_count=image_only_page_count,
        mixed_page_modes=mixed_page_modes,
        detected_modes=sorted(detected_modes),
        sample_text_excerpt=sample_text_excerpt,
    )


def classify_document(payload: bytes) -> ClassificationResult:
    signals = _extract_document_signals(payload)
    notes: list[str] = []

    if signals.contains_xfa and (signals.image_only_page_count > 0 or signals.mixed_page_modes):
        notes.append("XFA packets are present, but the page modes are mixed and need a hybrid path.")
        return ClassificationResult(
            document_class=DocumentClass.MIXED,
            extractor_path=[
                "catalog_inspection",
                "xfa_xml",
                "widget_geometry",
                "layout_reconciliation",
                "page_render",
                "ocr_if_needed",
            ],
            confidence=0.82,
            notes=notes,
            signals=signals,
        )
    if signals.contains_xfa:
        notes.append("Detected XFA packets in the AcroForm catalog; XFA-first extraction is appropriate.")
        return ClassificationResult(
            document_class=DocumentClass.XFA_BACKED,
            extractor_path=["catalog_inspection", "xfa_xml", "widget_geometry", "layout_reconciliation"],
            confidence=0.96,
            notes=notes,
            signals=signals,
        )
    if signals.contains_acroform and signals.mixed_page_modes:
        notes.append("Detected AcroForm fields alongside mixed page modes; manual review should confirm the path.")
        return ClassificationResult(
            document_class=DocumentClass.MIXED,
            extractor_path=["catalog_inspection", "acroform", "widget_geometry", "layout_reconciliation", "ocr_if_needed"],
            confidence=0.76,
            notes=notes,
            signals=signals,
        )
    if signals.contains_acroform:
        notes.append("Detected AcroForm fields without XFA packets.")
        return ClassificationResult(
            document_class=DocumentClass.ACROFORM,
            extractor_path=["catalog_inspection", "acroform", "widget_geometry", "layout_reconciliation"],
            confidence=0.9,
            notes=notes,
            signals=signals,
        )
    if signals.page_count > 0 and signals.image_only_page_count == signals.page_count:
        notes.append("Every page appears image-only; OCR is required for semantic recovery.")
        return ClassificationResult(
            document_class=DocumentClass.SCANNED,
            extractor_path=["page_render", "ocr", "layout_reconstruction"],
            confidence=0.88,
            notes=notes,
            signals=signals,
        )
    if signals.mixed_page_modes:
        notes.append("Text and image-only page modes are both present in the same file.")
        return ClassificationResult(
            document_class=DocumentClass.MIXED,
            extractor_path=["layout_primitives", "table_heuristics", "label_reconciliation", "ocr_if_needed"],
            confidence=0.8,
            notes=notes,
            signals=signals,
        )
    if signals.text_page_count > 0:
        notes.append("Detected live text without form packets; use born-digital layout extraction.")
        return ClassificationResult(
            document_class=DocumentClass.BORN_DIGITAL,
            extractor_path=["layout_primitives", "table_heuristics", "label_reconciliation"],
            confidence=0.74,
            notes=notes,
            signals=signals,
        )

    notes.append("The PDF has sparse signals and no form packets; defaulting to born-digital at low confidence.")
    return ClassificationResult(
        document_class=DocumentClass.BORN_DIGITAL,
        extractor_path=["layout_primitives", "table_heuristics", "label_reconciliation"],
        confidence=0.45,
        notes=notes,
        signals=signals,
    )
