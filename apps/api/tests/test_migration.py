"""Tests for Phase 1B migration guard: reject un-migrated documents at load time."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from form_builder_api.repository import InMemoryRepository, UnmigratedDocumentError
from form_builder_api.services.migration import migrate_project, MigrationLog

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "pre-migration-document.json"

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


# ---------------------------------------------------------------------------
# Round-trip tests (B6)
# ---------------------------------------------------------------------------


def test_migration_promotes_legacy_listener_fields(tmp_path: Path) -> None:
    """Round-trip: legacy-shape document → Phase 1A new shape."""
    project_id = "rt-test"
    project_root = tmp_path / "data" / "projects" / project_id
    project_root.mkdir(parents=True)
    fixture = json.loads(FIXTURE_PATH.read_text())
    (project_root / "document.json").write_text(json.dumps(fixture))

    log = migrate_project(project_id, base_path=tmp_path)

    # 1. Migration ran (not a no-op).
    assert not log.noop, "expected non-no-op migration on a legacy-shape document"
    assert log.documents_migrated >= 1

    # 2. Document was rewritten.
    written = json.loads((project_root / "document.json").read_text())

    # 3. migrationVersion marker stamped.
    assert written["runtime"]["migrationVersion"] == "phase-1"

    # 4. Field listener with legacy eventSourceNodeId now has source.id matching.
    field = written["steps"][0]["sections"][0]["fields"][0]
    legacy_source_listener = next(
        l for l in field["runtime"]["listeners"] if l["id"] == "listener-legacy-source"
    )
    assert legacy_source_listener["source"]["id"] == "field-zip"
    assert legacy_source_listener["target"]["id"] == "field-city"
    # Legacy fields stay in place (additive promotion).
    assert legacy_source_listener["eventSourceNodeId"] == "field-zip"

    # 5. Field listener with custom event "zipResolved" now has eventRef pointing
    #    at a newly-created event def.
    custom_listener = next(
        l for l in field["runtime"]["listeners"] if l["id"] == "listener-custom-event"
    )
    assert "eventRef" in custom_listener
    new_def_id = custom_listener["eventRef"]["id"]
    # The new def is on the field's eventSources (closest scope).
    field_sources = field["runtime"]["eventSources"]
    assert any(d["id"] == new_def_id and d.get("name") == "zipResolved" for d in field_sources)
    assert log.event_defs_created >= 1

    # 6. Form-level submit listener (built-in event) untouched — no eventRef created.
    form_listener = written["runtime"]["formListeners"][0]
    assert form_listener.get("eventRef") is None  # built-in event names don't get eventRef

    # 7. Backup snapshot created.
    backup_root = project_root / "migration-backup"
    assert backup_root.exists()
    assert any(backup_root.iterdir()), "expected at least one timestamped backup dir"

    # 8. Audit log created.
    audit_path = project_root / "migration-log.json"
    assert audit_path.exists()
    audit = json.loads(audit_path.read_text())
    assert isinstance(audit, list) and len(audit) == 1


def test_migration_is_idempotent(tmp_path: Path) -> None:
    """Running migrate twice on the same project: second run is a no-op."""
    project_id = "rt-idempotent"
    project_root = tmp_path / "data" / "projects" / project_id
    project_root.mkdir(parents=True)
    fixture = json.loads(FIXTURE_PATH.read_text())
    (project_root / "document.json").write_text(json.dumps(fixture))

    first_log = migrate_project(project_id, base_path=tmp_path)
    assert not first_log.noop

    # Capture content after first migration.
    first_content = (project_root / "document.json").read_text()

    second_log = migrate_project(project_id, base_path=tmp_path)
    assert second_log.noop, "second run on a migrated document should be a no-op"

    second_content = (project_root / "document.json").read_text()
    assert first_content == second_content, "document content must be unchanged on no-op rerun"
