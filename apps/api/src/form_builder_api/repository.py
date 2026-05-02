from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from .models.api import (
    ConversionRecord,
    ConversionStatus,
    DraftPatch,
    FormRecord,
    HeuristicPatch,
    HeuristicRecord,
    ProcessingStepStatus,
    TreatmentPatch,
    TreatmentRecord,
)
from .models.authoring import (
    AuthoringDocument,
    AuthoringProjectDetail,
    AuthoringProjectRecord,
    ProjectPatch,
    ProjectRevision,
)
from .models.canonical import ReviewStatus


def repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


class InMemoryRepository:
    def __init__(self, project_storage_dir: Path | None = None) -> None:
        self.conversions: dict[str, ConversionRecord] = {}
        self.conversion_sources: dict[str, tuple[bytes, str | None]] = {}
        self.forms: dict[str, FormRecord] = {}
        self.projects: dict[str, AuthoringProjectDetail] = {}
        self.project_storage_dir = project_storage_dir or repo_root() / "data" / "projects"
        self.project_storage_dir.mkdir(parents=True, exist_ok=True)
        self.heuristics: dict[str, HeuristicRecord] = {
            "heuristic-order-001": HeuristicRecord(
                id="heuristic-order-001",
                name="XFA label to visual flow reconciliation",
                category="field_ordering",
                version="1.0.0",
                rationale="Preserves XFA logical order while flagging layout conflicts for review.",
                scoped_to="document-family:va-xfa",
            ),
            "heuristic-sections-001": HeuristicRecord(
                id="heuristic-sections-001",
                name="All-caps heading section split",
                category="section_detection",
                version="1.0.0",
                rationale="Uses visual heading signals only as supporting evidence when XFA is absent.",
                scoped_to="document-class:born-digital",
            ),
        }
        self.treatments: dict[str, TreatmentRecord] = {
            "treatment-001": TreatmentRecord(
                id="treatment-001",
                source_scope="document-family:va-benefits",
                source_pattern="Dense paper-only intro and legal block",
                canonical_intent="Prepare the applicant before data entry begins.",
                recommended_digital_treatment="Split into introduction and expandable help surfaces.",
                target_runtime_pattern="intro_page_with_details",
                uswds_target="usa-accordion + project intro template",
                rationale="Improves comprehension and lowers cognitive load without changing semantics.",
                confidence=0.86,
                approval_status="proposed",
                version="0.1.0",
            ),
            "treatment-002": TreatmentRecord(
                id="treatment-002",
                source_scope="document-family:generic-paper-forms",
                source_pattern="Repeated household member rows",
                canonical_intent="Capture one or more repeated entities.",
                recommended_digital_treatment="Use a repeatable group with add/remove controls.",
                target_runtime_pattern="repeatable_group",
                uswds_target="project-owned wrapper on USWDS input set",
                rationale="Paper row layouts translate poorly to mobile and accessibility flows.",
                confidence=0.91,
                approval_status="approved",
                version="1.0.0",
            ),
        }
        self._load_projects_from_disk()

    def save_conversion(self, record: ConversionRecord) -> ConversionRecord:
        record.updated_at = datetime.now(timezone.utc)
        self.conversions[record.id] = record
        return record

    def save_conversion_source(
        self,
        conversion_id: str,
        payload: bytes,
        content_type: str | None,
    ) -> None:
        self.conversion_sources[conversion_id] = (payload, content_type)

    def get_conversion(self, conversion_id: str) -> ConversionRecord | None:
        return self.conversions.get(conversion_id)

    def get_conversion_source(self, conversion_id: str) -> tuple[bytes, str | None] | None:
        return self.conversion_sources.get(conversion_id)

    def list_conversions(self) -> list[ConversionRecord]:
        return sorted(
            self.conversions.values(),
            key=lambda record: record.created_at,
            reverse=True,
        )

    def delete_conversion(self, conversion_id: str) -> ConversionRecord | None:
        self.conversion_sources.pop(conversion_id, None)
        return self.conversions.pop(conversion_id, None)

    def clear_conversions(self) -> int:
        count = len(self.conversions)
        self.conversions.clear()
        self.conversion_sources.clear()
        return count

    def patch_conversion(self, conversion_id: str, patch: DraftPatch) -> ConversionRecord:
        record = self.conversions[conversion_id]
        if patch.review_status is not None:
            record.review_status = patch.review_status
            if record.draft is not None:
                record.draft.review_status = patch.review_status
            record.status = (
                ConversionStatus.ACCEPTED
                if patch.review_status == ReviewStatus.ACCEPTED
                else ConversionStatus.IN_REVIEW
            )
            for step in record.processing_steps:
                if step.key == "review":
                    if patch.review_status == ReviewStatus.ACCEPTED:
                        step.status = ProcessingStepStatus.COMPLETED
                        step.detail = "Draft was accepted and is ready to persist as a form definition."
                    elif patch.review_status == ReviewStatus.REVIEWED:
                        step.status = ProcessingStepStatus.COMPLETED
                        step.detail = "Draft review is complete but not yet accepted."
                    else:
                        step.status = ProcessingStepStatus.WARNING if record.issues else ProcessingStepStatus.PENDING
                        step.detail = "Draft is waiting for review decisions."
        record.updated_at = datetime.now(timezone.utc)
        return record

    def save_form(self, record: FormRecord) -> FormRecord:
        self.forms[record.id] = record
        return record

    def get_form(self, form_id: str) -> FormRecord | None:
        return self.forms.get(form_id)

    def list_projects(self) -> list[AuthoringProjectRecord]:
        return sorted(
            (detail.project for detail in self.projects.values()),
            key=lambda project: project.updated_at,
            reverse=True,
        )

    def get_project(self, project_id: str) -> AuthoringProjectDetail | None:
        return self.projects.get(project_id)

    def create_project(self, detail: AuthoringProjectDetail, note: str) -> AuthoringProjectDetail:
        timestamp = datetime.now(timezone.utc)
        detail.project.created_at = timestamp
        detail.project.updated_at = timestamp
        detail.document.id = detail.document.id or detail.project.id
        revision = self._build_revision(detail.project.id, detail.document, note, timestamp)
        detail.project.current_revision_id = revision.id
        detail.project.revision_count = 1
        self.projects[detail.project.id] = detail
        self._persist_project(detail, revision)
        return detail

    def update_project(self, project_id: str, patch: ProjectPatch) -> AuthoringProjectDetail:
        detail = self.projects[project_id]
        if patch.name is not None:
            detail.project.name = patch.name
        if patch.status is not None:
            detail.project.status = patch.status
        detail.project.updated_at = datetime.now(timezone.utc)
        self._persist_project(detail)
        return detail

    def update_project_document(
        self,
        project_id: str,
        document: AuthoringDocument,
        note: str = "Saved authoring document",
    ) -> AuthoringProjectDetail:
        detail = self.projects[project_id]
        timestamp = datetime.now(timezone.utc)
        detail.document = document
        detail.project.updated_at = timestamp
        detail.project.name = document.title
        revision = self._build_revision(project_id, document, note, timestamp)
        detail.project.current_revision_id = revision.id
        detail.project.revision_count += 1
        self._persist_project(detail, revision)
        return detail

    def list_project_revisions(self, project_id: str) -> list[ProjectRevision]:
        project_dir = self._project_dir(project_id)
        revisions_dir = project_dir / "revisions"
        if not revisions_dir.exists():
            return []
        revisions: list[ProjectRevision] = []
        for path in sorted(revisions_dir.glob("*.json")):
            payload = json.loads(path.read_text())
            revisions.append(ProjectRevision.model_validate(payload))
        return sorted(revisions, key=lambda revision: revision.created_at, reverse=True)

    def list_heuristics(self) -> list[HeuristicRecord]:
        return list(self.heuristics.values())

    def patch_heuristic(self, heuristic_id: str, patch: HeuristicPatch) -> HeuristicRecord:
        record = self.heuristics[heuristic_id]
        if patch.enabled is not None:
            record.enabled = patch.enabled
        if patch.rationale is not None:
            record.rationale = patch.rationale
        record.last_reviewed = datetime.now(timezone.utc)
        return record

    def list_treatments(self) -> list[TreatmentRecord]:
        return list(self.treatments.values())

    def patch_treatment(self, treatment_id: str, patch: TreatmentPatch) -> TreatmentRecord:
        record = self.treatments[treatment_id]
        if patch.approval_status is not None:
            record.approval_status = patch.approval_status
        if patch.rationale is not None:
            record.rationale = patch.rationale
        return record

    def _load_projects_from_disk(self) -> None:
        for project_dir in self.project_storage_dir.iterdir():
            if not project_dir.is_dir():
                continue
            project_path = project_dir / "project.json"
            document_path = project_dir / "document.json"
            source_context_path = project_dir / "source-context.json"
            if not project_path.exists() or not document_path.exists() or not source_context_path.exists():
                continue
            detail = AuthoringProjectDetail.model_validate(
                {
                    "project": json.loads(project_path.read_text()),
                    "document": json.loads(document_path.read_text()),
                    "sourceContext": json.loads(source_context_path.read_text()),
                }
            )
            self.projects[detail.project.id] = detail

    def _persist_project(
        self,
        detail: AuthoringProjectDetail,
        revision: ProjectRevision | None = None,
    ) -> None:
        project_dir = self._project_dir(detail.project.id)
        revisions_dir = project_dir / "revisions"
        revisions_dir.mkdir(parents=True, exist_ok=True)
        self._write_json(project_dir / "project.json", detail.project)
        self._write_json(project_dir / "document.json", detail.document)
        self._write_json(project_dir / "source-context.json", detail.source_context)
        if revision is not None:
            self._write_json(revisions_dir / f"{revision.id}.json", revision)

    def _build_revision(
        self,
        project_id: str,
        document: AuthoringDocument,
        note: str,
        created_at: datetime,
    ) -> ProjectRevision:
        return ProjectRevision(
            project_id=project_id,
            created_at=created_at,
            note=note,
            document=document,
        )

    def _project_dir(self, project_id: str) -> Path:
        return self.project_storage_dir / project_id

    def _write_json(self, path: Path, model) -> None:
        path.write_text(json.dumps(model.model_dump(mode="json", by_alias=True), indent=2))
