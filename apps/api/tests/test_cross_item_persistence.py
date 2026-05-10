"""Best-Next-2: save/reload coverage for cross-item listeners.

Verifies that listeners which describe cross-item relationships — source NodeRef
on one node, target NodeRef on another, plus shared-dispatcher wiring at a
common ancestor — survive a full repository round-trip (write to disk, reload
through InMemoryRepository).  Uses `tmp_path` so the test never mutates
`data/projects/`.
"""
from __future__ import annotations

import json
from pathlib import Path

from form_builder_api.repository import InMemoryRepository


_PROJECT_ID = "test-cross-item"

_PROJECT = {
    "id": _PROJECT_ID,
    "name": "Cross-item Round-trip",
    "status": "draft",
    "targetRuntime": "va_web_form",
    "visualBaseline": "va.gov",
    "sourceConversionId": "conv-cross-item",
    "documentClass": "mixed",
    "revisionCount": 0,
    "createdAt": "2026-01-01T00:00:00Z",
    "updatedAt": "2026-01-01T00:00:00Z",
}

_SOURCE_CONTEXT = {
    "conversionId": "conv-cross-item",
    "filename": "cross-item.pdf",
    "documentClass": "mixed",
    "reviewStatus": "reviewed",
    "confidence": 0.9,
    "extractorPath": [],
    "notes": [],
    "issues": [],
    "importedDraft": {
        "id": "draft-cross-item",
        "title": "Cross-item draft",
        "documentClass": "mixed",
        "reviewStatus": "reviewed",
        "pages": [],
        "issues": [],
        "metadata": {},
    },
}


def _document() -> dict:
    """Build a document with cross-item listeners.

    Two field nodes inside the same section — `field-source` and `field-target`.
    A form-level listener references them via the new NodeRef shape (source/target)
    plus the legacy `eventSourceNodeId`/`targetNodeId` pair, captures the
    shared-dispatcher wiring via `dispatcherId`/`dispatcherType`, and emits a
    `dispatch_event` action that names the cross-form `eventRef` id.
    """
    return {
        "id": _PROJECT_ID,
        "title": "Cross-item form",
        "documentClass": "mixed",
        "reviewStatus": "reviewed",
        "metadata": {},
        "steps": [
            {
                "id": "step-1",
                "title": "Cross-item step",
                "kind": "collect",
                "layoutHints": {},
                "sections": [
                    {
                        "id": "section-1",
                        "title": "Cross-item section",
                        "layoutHints": {},
                        "fields": [
                            {
                                "id": "field-source",
                                "stableKey": "field-source",
                                "label": "Source field",
                                "semanticType": "text",
                                "required": False,
                                "confidence": 1,
                                "options": [],
                                "validations": [],
                                "layoutHints": {},
                                "rendererHints": {},
                                "sourcePriority": [],
                                "sourceConflicts": [],
                                "lineage": [],
                                "sourceFieldIds": [],
                                "provenanceAnchorIds": [],
                                "runtime": None,
                            },
                            {
                                "id": "field-target",
                                "stableKey": "field-target",
                                "label": "Target field",
                                "semanticType": "text",
                                "required": False,
                                "confidence": 1,
                                "options": [],
                                "validations": [],
                                "layoutHints": {},
                                "rendererHints": {},
                                "sourcePriority": [],
                                "sourceConflicts": [],
                                "lineage": [],
                                "sourceFieldIds": [],
                                "provenanceAnchorIds": [],
                                "runtime": None,
                            },
                        ],
                        "groups": [],
                        "lineage": [],
                        "sourceSectionIds": [],
                        "provenanceAnchorIds": [],
                        "runtime": None,
                    }
                ],
                "sourcePageIds": [],
                "provenanceAnchorIds": [],
                "runtime": None,
            }
        ],
        "runtime": {
            "version": "1.0",
            "migrationVersion": "phase-1",
            "formEvents": [],
            "formListeners": [
                {
                    "id": "lst-cross-item",
                    "label": "Source changes -> Target updates",
                    "eventName": "field.change",
                    "type": "field.change",
                    "source": {"id": "field-source"},
                    "target": {"id": "field-target"},
                    "eventSourceNodeId": "field-source",
                    "targetNodeId": "field-target",
                    "dispatcherId": "section-1",
                    "dispatcherType": "section",
                    "wiringMode": "cross_item",
                    "useCapture": False,
                    "priority": 5,
                    "eventRef": {"id": "evt-cross-form-shared"},
                    "provenance": "manual",
                    "enabled": True,
                    "conditions": [],
                    "actions": [
                        {
                            "id": "act-dispatch-cross",
                            "kind": "dispatch_event",
                            "target": {"nodeId": "field-target", "nodeType": "field"},
                            "config": {
                                "eventType": "cross.form.shared",
                                "payload": {
                                    "value": {"$runtime": "current.event.payload.value"}
                                },
                            },
                            "continueOnError": False,
                        }
                    ],
                }
            ],
            "hostBindings": [],
            "submitEventName": "form.submit",
        },
    }


def _write_project(project_root: Path, document: dict) -> None:
    project_root.mkdir(parents=True, exist_ok=True)
    (project_root / "project.json").write_text(json.dumps(_PROJECT))
    (project_root / "source-context.json").write_text(json.dumps(_SOURCE_CONTEXT))
    (project_root / "document.json").write_text(json.dumps(document))


def test_cross_item_listener_round_trips_through_repository(tmp_path: Path) -> None:
    """Save then reload — every cross-item field is preserved."""
    project_root = tmp_path / _PROJECT_ID
    _write_project(project_root, _document())

    repo = InMemoryRepository(project_storage_dir=tmp_path)
    assert _PROJECT_ID in repo.projects
    detail = repo.projects[_PROJECT_ID]
    assert detail.document.runtime is not None
    listeners = detail.document.runtime.form_listeners
    assert len(listeners) == 1
    listener = listeners[0]

    # NodeRef source/target metadata.
    assert listener.source is not None and listener.source.id == "field-source"
    assert listener.target is not None and listener.target.id == "field-target"

    # Legacy fields still present alongside the new refs.
    assert listener.event_source_node_id == "field-source"
    assert listener.target_node_id == "field-target"

    # Shared-dispatcher wiring.
    assert listener.dispatcher_id == "section-1"
    assert listener.dispatcher_type == "section"
    assert listener.wiring_mode == "cross_item"
    assert listener.priority == 5

    # Cross-form eventRef and action survived.
    assert listener.event_ref is not None and listener.event_ref.id == "evt-cross-form-shared"
    assert listener.actions[0].kind == "dispatch_event"
    assert listener.actions[0].config["eventType"] == "cross.form.shared"


def test_cross_item_listener_survives_revision_rewrite(tmp_path: Path) -> None:
    """Updating the document via `update_project_document` preserves cross-item fields."""
    project_root = tmp_path / _PROJECT_ID
    _write_project(project_root, _document())

    repo = InMemoryRepository(project_storage_dir=tmp_path)
    detail = repo.projects[_PROJECT_ID]

    # Touch an unrelated field on the document and persist.  The cross-item
    # listener must be re-serialised with every field intact.
    detail.document.title = "Cross-item form (renamed)"
    repo.update_project_document(_PROJECT_ID, detail.document, note="Touch title")

    on_disk = json.loads((project_root / "document.json").read_text())
    listener = on_disk["runtime"]["formListeners"][0]
    assert listener["source"] == {"id": "field-source"}
    assert listener["target"] == {"id": "field-target"}
    assert listener["dispatcherId"] == "section-1"
    assert listener["dispatcherType"] == "section"
    assert listener["wiringMode"] == "cross_item"
    assert listener["eventRef"] == {"id": "evt-cross-form-shared"}
    assert listener["actions"][0]["kind"] == "dispatch_event"
