"""Tests for Phase 1B migration guard: reject un-migrated documents at load time."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from form_builder_api.repository import InMemoryRepository, UnmigratedDocumentError

# ---------------------------------------------------------------------------
# Minimal fixture helpers
# ---------------------------------------------------------------------------

_MINIMAL_PROJECT = {
    "id": "test-project",
    "name": "Test Project",
    "status": "draft",
    "targetRuntime": "va_web_form",
    "visualBaseline": "va.gov",
    "sourceConversionId": "conv-001",
    "documentClass": "born_digital_nonfillable",
    "revisionCount": 0,
    "createdAt": "2026-01-01T00:00:00Z",
    "updatedAt": "2026-01-01T00:00:00Z",
}

_MINIMAL_SOURCE_CONTEXT = {
    "conversionId": "conv-001",
    "filename": "test.pdf",
    "documentClass": "born_digital_nonfillable",
    "reviewStatus": "reviewed",
    "confidence": 0.8,
    "extractorPath": [],
    "notes": [],
    "issues": [],
    "importedDraft": {
        "id": "draft-001",
        "title": "Test form",
        "documentClass": "born_digital_nonfillable",
        "reviewStatus": "reviewed",
        "pages": [],
        "issues": [],
        "metadata": {},
    },
}

_RUNTIME_WITHOUT_MIGRATION = {
    "version": "1.0",
    "formEvents": [],
    "formListeners": [],
    "hostBindings": [],
    "submitEventName": "form.submit",
}

_RUNTIME_WITH_MIGRATION = {
    **_RUNTIME_WITHOUT_MIGRATION,
    "migrationVersion": "phase-1",
}

_MINIMAL_DOCUMENT_BASE = {
    "id": "test-project",
    "title": "Test Form",
    "documentClass": "born_digital_nonfillable",
    "reviewStatus": "reviewed",
    "steps": [],
}


def _write_project_files(project_root: Path, document: dict) -> None:
    project_root.mkdir(parents=True, exist_ok=True)
    (project_root / "project.json").write_text(json.dumps(_MINIMAL_PROJECT))
    (project_root / "source-context.json").write_text(json.dumps(_MINIMAL_SOURCE_CONTEXT))
    (project_root / "document.json").write_text(json.dumps(document))


# ---------------------------------------------------------------------------
# Rejection tests
# ---------------------------------------------------------------------------


def test_unmigrated_document_raises_on_load(tmp_path: Path) -> None:
    """A document.json without migrationVersion == 'phase-1' must raise UnmigratedDocumentError."""
    project_id = "test-unmigrated"
    project_root = tmp_path / project_id
    document = {**_MINIMAL_DOCUMENT_BASE, "runtime": _RUNTIME_WITHOUT_MIGRATION}
    _write_project_files(project_root, document)

    with pytest.raises(UnmigratedDocumentError) as exc_info:
        InMemoryRepository(project_storage_dir=tmp_path)

    assert exc_info.value.project_id == project_id
    assert "Phase 1" in str(exc_info.value)
    assert "migrate:behaviors" in str(exc_info.value)


def test_document_with_no_runtime_key_loads_cleanly(tmp_path: Path) -> None:
    """A document.json with no 'runtime' key is freshly created with no behaviors — loads cleanly."""
    project_dir_name = "test-no-runtime"
    project_root = tmp_path / project_dir_name
    document = {**_MINIMAL_DOCUMENT_BASE}  # no runtime key
    _write_project_files(project_root, document)

    # Should NOT raise — a document with no runtime block needs no migration.
    repo = InMemoryRepository(project_storage_dir=tmp_path)
    project_record_id = _MINIMAL_PROJECT["id"]
    assert project_record_id in repo.projects


def test_document_with_wrong_migration_version_raises_on_load(tmp_path: Path) -> None:
    """A migrationVersion other than 'phase-1' must raise UnmigratedDocumentError."""
    project_id = "test-wrong-version"
    project_root = tmp_path / project_id
    document = {
        **_MINIMAL_DOCUMENT_BASE,
        "runtime": {**_RUNTIME_WITHOUT_MIGRATION, "migrationVersion": "phase-0"},
    }
    _write_project_files(project_root, document)

    with pytest.raises(UnmigratedDocumentError) as exc_info:
        InMemoryRepository(project_storage_dir=tmp_path)

    assert exc_info.value.project_id == project_id


# ---------------------------------------------------------------------------
# Clean-load tests
# ---------------------------------------------------------------------------


def test_migrated_document_loads_cleanly(tmp_path: Path) -> None:
    """A document.json with migrationVersion == 'phase-1' loads without error."""
    project_dir_name = "test-migrated"
    project_root = tmp_path / project_dir_name
    document = {**_MINIMAL_DOCUMENT_BASE, "runtime": _RUNTIME_WITH_MIGRATION}
    _write_project_files(project_root, document)

    repo = InMemoryRepository(project_storage_dir=tmp_path)
    # The repo is keyed by the project record's id field (from project.json), not the directory name.
    project_record_id = _MINIMAL_PROJECT["id"]
    assert project_record_id in repo.projects
    assert repo.projects[project_record_id].document.runtime is not None
    assert repo.projects[project_record_id].document.runtime.migration_version == "phase-1"


def test_empty_storage_dir_loads_cleanly(tmp_path: Path) -> None:
    """An empty project storage directory loads without error (no projects, no guard triggered)."""
    repo = InMemoryRepository(project_storage_dir=tmp_path)
    assert repo.projects == {}


def test_incomplete_project_dir_is_skipped(tmp_path: Path) -> None:
    """A project directory missing required files is silently skipped (existing behavior)."""
    project_id = "test-incomplete"
    project_root = tmp_path / project_id
    project_root.mkdir(parents=True)
    # Only write project.json — no document.json or source-context.json.
    (project_root / "project.json").write_text(json.dumps(_MINIMAL_PROJECT))

    repo = InMemoryRepository(project_storage_dir=tmp_path)
    assert project_id not in repo.projects
