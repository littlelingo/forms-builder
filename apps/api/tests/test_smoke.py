import json
from copy import deepcopy
from io import BytesIO

from fastapi.testclient import TestClient
from pypdf import PdfWriter

from form_builder_api.main import app
from form_builder_api.repository import InMemoryRepository


client = TestClient(app)


def _behavior_lifecycle_document_payload():
    return {
        "id": "document-behavior-lifecycle",
        "title": "Behavior Lifecycle Fixture",
        "documentClass": "mixed",
        "reviewStatus": "accepted",
        "targetRuntime": "va_web_form",
        "visualBaseline": "va.gov",
        "sourcePriority": [],
        "sourceConflicts": [],
        "metadata": {"importSource": "test"},
        "runtime": {
            "version": "1.0",
            "formEvents": [],
            "formListeners": [
                {
                    "id": "listener-form-submit",
                    "label": "Submit through host",
                    "type": "form.submit",
                    "dispatcherId": "document-behavior-lifecycle",
                    "dispatcherType": "form",
                    "useCapture": False,
                    "priority": 0,
                    "eventName": "form.submit",
                    "enabled": True,
                    "ruleGuards": [],
                    "actions": [
                        {
                            "id": "action-form-submit",
                            "kind": "host_action",
                            "target": {"nodeId": "document-behavior-lifecycle", "nodeType": "form"},
                            "config": {"handlerKey": "submit_form", "payload": {"source": "form-listener"}},
                            "continueOnError": False,
                        }
                    ],
                },
                {
                    "id": "listener-delete-me",
                    "label": "Temporary listener",
                    "type": "form.validation_failed",
                    "dispatcherId": "document-behavior-lifecycle",
                    "dispatcherType": "form",
                    "useCapture": False,
                    "priority": 0,
                    "eventName": "form.validation_failed",
                    "enabled": True,
                    "ruleGuards": [],
                    "actions": [
                        {
                            "id": "action-delete-me",
                            "kind": "dispatch_event",
                            "target": {"nodeId": "document-behavior-lifecycle", "nodeType": "form"},
                            "config": {"eventType": "temporary.deleted", "bubbles": True},
                            "continueOnError": False,
                        }
                    ],
                },
            ],
            "hostBindings": [],
            "submitEventName": "form.submit",
            "sessionStateShape": {"mode": "key_value", "fields": [], "example": None, "notes": []},
        },
        "steps": [
            {
                "id": "step-1",
                "title": "Step 1",
                "description": "Exercise behavior lifecycle persistence.",
                "kind": "collect",
                "layoutHints": {},
                "sourcePageIds": [],
                "provenanceAnchorIds": [],
                "sections": [
                    {
                        "id": "section-1",
                        "title": "Section 1",
                        "description": "Runtime section",
                        "layoutHints": {},
                        "lineage": [],
                        "sourceSectionIds": [],
                        "provenanceAnchorIds": [],
                        "groups": [],
                        "fields": [
                            {
                                "id": "field-controller",
                                "stableKey": "field-controller",
                                "label": "Controller",
                                "semanticType": "text",
                                "required": False,
                                "confidence": 1,
                                "options": [],
                                "validations": [],
                                "conditionals": [],
                                "layoutHints": {},
                                "rendererHints": {},
                                "sourcePriority": [],
                                "sourceConflicts": [],
                                "lineage": [],
                                "sourceFieldIds": [],
                                "provenanceAnchorIds": [],
                                "runtime": {
                                    "eventSources": [
                                        {
                                            "id": "event-controller-change",
                                            "type": "field.change",
                                            "dispatcherId": "field-controller",
                                            "dispatcherType": "field",
                                            "bubbles": True,
                                            "name": "field.change",
                                            "sourceNodeId": "field-controller",
                                            "sourceNodeType": "field",
                                        }
                                    ],
                                    "listeners": [
                                        {
                                            "id": "flow-field-change",
                                            "label": "Dispatch field changed",
                                            "type": "field.change",
                                            "dispatcherId": "field-controller",
                                            "dispatcherType": "field",
                                            "useCapture": False,
                                            "priority": 0,
                                            "eventName": "field.change",
                                            "sourceNodeId": "field-controller",
                                            "enabled": True,
                                            "ruleGuards": [],
                                            "actions": [
                                                {
                                                    "id": "action-field-change",
                                                    "kind": "dispatch_event",
                                                    "target": {"nodeId": "field-controller", "nodeType": "field"},
                                                    "config": {
                                                        "eventType": "field.controller.changed",
                                                        "bubbles": True,
                                                        "payload": {"fieldId": "field-controller"},
                                                    },
                                                    "continueOnError": False,
                                                }
                                            ],
                                        },
                                        {
                                            "id": "flow-delete-me",
                                            "label": "Temporary event flow",
                                            "type": "field.blur",
                                            "dispatcherId": "field-controller",
                                            "dispatcherType": "field",
                                            "useCapture": False,
                                            "priority": 0,
                                            "eventName": "field.blur",
                                            "sourceNodeId": "field-controller",
                                            "enabled": True,
                                            "ruleGuards": [],
                                            "actions": [
                                                {
                                                    "id": "action-flow-delete-me",
                                                    "kind": "dispatch_event",
                                                    "target": {"nodeId": "field-controller", "nodeType": "field"},
                                                    "config": {"eventType": "temporary.flow", "bubbles": True},
                                                    "continueOnError": False,
                                                }
                                            ],
                                        },
                                    ],
                                },
                            },
                            {
                                "id": "field-target",
                                "stableKey": "field-target",
                                "label": "Target",
                                "semanticType": "text",
                                "required": False,
                                "confidence": 1,
                                "options": [],
                                "validations": [],
                                "conditionals": [
                                    {
                                        "ruleId": "rule-show-target",
                                        "whenFieldId": "field-controller",
                                        "operator": "equals",
                                        "expectedValue": "yes",
                                        "effect": "show",
                                        "enabled": True,
                                    },
                                    {
                                        "ruleId": "rule-delete-me",
                                        "whenFieldId": "field-controller",
                                        "operator": "exists",
                                        "effect": "disable",
                                        "enabled": True,
                                    },
                                ],
                                "layoutHints": {},
                                "rendererHints": {},
                                "sourcePriority": [],
                                "sourceConflicts": [],
                                "lineage": [],
                                "sourceFieldIds": [],
                                "provenanceAnchorIds": [],
                            },
                        ],
                    }
                ],
            }
        ],
    }


def test_healthcheck():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_create_conversion_from_pdf_upload():
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    payload = BytesIO()
    writer.write(payload)

    response = client.post(
        "/conversions",
        files={"file": ("sample.pdf", payload.getvalue(), "application/pdf")},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "in_review"
    assert data["documentClass"] == "born_digital_nonfillable"
    assert data["documentSignals"]["pageCount"] == 1
    assert isinstance(data["processingSteps"], list)


def test_conversion_source_and_delete():
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    payload = BytesIO()
    writer.write(payload)

    response = client.post(
        "/conversions",
        files={"file": ("sample.pdf", payload.getvalue(), "application/pdf")},
    )
    assert response.status_code == 200
    conversion_id = response.json()["id"]

    source_response = client.get(f"/conversions/{conversion_id}/source")
    assert source_response.status_code == 200
    assert source_response.headers["content-type"].startswith("application/pdf")

    delete_response = client.delete(f"/conversions/{conversion_id}")
    assert delete_response.status_code == 204

    missing_source_response = client.get(f"/conversions/{conversion_id}/source")
    assert missing_source_response.status_code == 404


def test_conversion_page_preview():
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    payload = BytesIO()
    writer.write(payload)

    response = client.post(
        "/conversions",
        files={"file": ("sample.pdf", payload.getvalue(), "application/pdf")},
    )
    assert response.status_code == 200
    conversion_id = response.json()["id"]

    preview_response = client.get(f"/conversions/{conversion_id}/pages/1/preview.png")
    assert preview_response.status_code == 200
    assert preview_response.headers["content-type"] == "image/png"
    assert preview_response.content.startswith(b"\x89PNG")


def test_sample_pdf_library_and_import(monkeypatch, tmp_path):
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    sample_path = tmp_path / "sample-corpus.pdf"
    with sample_path.open("wb") as handle:
        writer.write(handle)

    monkeypatch.setattr(
        "form_builder_api.services.sample_library.resolve_form_samples_dir",
        lambda explicit_dir=None: tmp_path,
    )

    list_response = client.get("/sample-pdfs")
    assert list_response.status_code == 200
    summaries = list_response.json()
    assert len(summaries) == 1
    assert summaries[0]["filename"] == "sample-corpus.pdf"
    assert summaries[0]["documentClass"] == "born_digital_nonfillable"

    import_response = client.post("/conversions/from-sample", json={"filename": "sample-corpus.pdf"})
    assert import_response.status_code == 200
    imported = import_response.json()
    assert imported["filename"] == "sample-corpus.pdf"
    assert imported["status"] == "in_review"

    missing_response = client.post("/conversions/from-sample", json={"filename": "missing.pdf"})
    assert missing_response.status_code == 404


def test_promote_reviewed_conversion_creates_file_backed_project(monkeypatch, tmp_path):
    repository = InMemoryRepository(project_storage_dir=tmp_path / "projects")
    monkeypatch.setattr("form_builder_api.main.repository", repository)

    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    payload = BytesIO()
    writer.write(payload)

    response = client.post(
        "/conversions",
        files={"file": ("sample.pdf", payload.getvalue(), "application/pdf")},
    )
    assert response.status_code == 200
    conversion_id = response.json()["id"]

    review_response = client.patch(
        f"/conversions/{conversion_id}/draft",
        json={"reviewStatus": "reviewed"},
    )
    assert review_response.status_code == 200

    promote_response = client.post(f"/conversions/{conversion_id}/promote")
    assert promote_response.status_code == 200
    payload = promote_response.json()
    project_id = payload["project"]["id"]

    assert payload["document"]["visualBaseline"] == "va.gov"
    assert payload["document"]["steps"][0]["title"].startswith("Page 1")
    assert (tmp_path / "projects" / project_id / "project.json").exists()
    assert (tmp_path / "projects" / project_id / "document.json").exists()
    assert (tmp_path / "projects" / project_id / "source-context.json").exists()

    reloaded = InMemoryRepository(project_storage_dir=tmp_path / "projects")
    projects = reloaded.list_projects()
    assert len(projects) == 1
    assert projects[0].id == project_id


def test_import_authoring_document_creates_project(monkeypatch, tmp_path):
    repository = InMemoryRepository(project_storage_dir=tmp_path / "projects")
    monkeypatch.setattr("form_builder_api.main.repository", repository)

    payload = {
        "id": "document-1",
        "title": "Imported JSON Form",
        "documentClass": "mixed",
        "reviewStatus": "accepted",
        "targetRuntime": "va_web_form",
        "visualBaseline": "va.gov",
        "sourcePriority": [],
        "sourceConflicts": [],
        "metadata": {},
        "steps": [
            {
                "id": "step-1",
                "title": "Step 1",
                "description": "Collect details.",
                "kind": "collect",
                "layoutHints": {"surface": "va-step", "density": "comfortable"},
                "sourcePageIds": [],
                "provenanceAnchorIds": [],
                "sections": [],
            }
        ],
    }

    response = client.post("/projects/from-document", json=payload)
    assert response.status_code == 200
    imported = response.json()

    assert imported["project"]["name"] == "Imported JSON Form"
    assert imported["document"]["title"] == "Imported JSON Form"
    assert imported["sourceContext"]["conversionId"].startswith("json-import-")


def test_runtime_authoring_survives_project_save_and_disk_reload(monkeypatch, tmp_path):
    repository = InMemoryRepository(project_storage_dir=tmp_path / "projects")
    monkeypatch.setattr("form_builder_api.main.repository", repository)

    payload = {
        "id": "document-runtime-1",
        "title": "Runtime Persistence Form",
        "documentClass": "mixed",
        "reviewStatus": "accepted",
        "targetRuntime": "va_web_form",
        "visualBaseline": "va.gov",
        "sourcePriority": [],
        "sourceConflicts": [],
        "metadata": {"importSource": "test"},
        "runtime": {
            "version": "1.0",
            "formEvents": [
                {
                    "id": "event-form-loaded",
                    "type": "form.load",
                    "dispatcherId": "document-runtime-1",
                    "dispatcherType": "form",
                    "bubbles": False,
                    "name": "form.load",
                    "payloadShape": {
                        "mode": "key_value",
                        "fields": [
                            {
                                "name": "projectId",
                                "label": "Project ID",
                                "valueType": "string",
                                "required": False,
                            }
                        ],
                        "example": {"projectId": "project-test"},
                        "notes": ["Form load host payload."],
                    },
                }
            ],
            "formListeners": [
                {
                    "id": "listener-form-load",
                    "label": "Dispatch project loaded event",
                    "type": "form.load",
                    "dispatcherId": "document-runtime-1",
                    "dispatcherType": "form",
                    "useCapture": False,
                    "priority": 0,
                    "eventName": "form.load",
                    "enabled": True,
                    "ruleGuards": [],
                    "actions": [
                        {
                            "id": "action-form-load",
                            "kind": "dispatch_event",
                            "target": {"nodeId": "document-runtime-1", "nodeType": "form"},
                            "config": {
                                "eventType": "project.loaded",
                                "bubbles": True,
                                "payload": {"source": "disk-reload"},
                            },
                            "continueOnError": False,
                        }
                    ],
                }
            ],
            "hostBindings": [
                {
                    "id": "binding-form-submit",
                    "type": "form.submit",
                    "eventName": "form.submit",
                    "direction": "outbound",
                    "handlerKey": "submit_form",
                    "payloadShape": {
                        "mode": "key_value",
                        "fields": [
                            {
                                "name": "submissionId",
                                "label": "Submission ID",
                                "valueType": "string",
                                "required": False,
                            }
                        ],
                        "example": {"submissionId": "sub-123"},
                        "notes": ["Host submit response payload."],
                    },
                }
            ],
            "submitEventName": "form.submit",
            "sessionStateShape": {
                "mode": "key_value",
                "fields": [
                    {
                        "name": "draftSavedAt",
                        "label": "Draft saved at",
                        "valueType": "string",
                        "required": False,
                        "description": "Timestamp carried in exported runtime sessions.",
                    }
                ],
                "example": {"draftSavedAt": "2026-05-02T12:00:00.000Z"},
                "notes": ["Persisted runtime QA session shape."],
            },
        },
        "steps": [
            {
                "id": "step-1",
                "title": "Step 1",
                "description": "Collect runtime details.",
                "kind": "collect",
                "layoutHints": {"surface": "va-step", "density": "comfortable"},
                "sourcePageIds": [],
                "provenanceAnchorIds": [],
                "runtime": {
                    "eventSources": [
                        {
                            "id": "event-step-enter",
                            "type": "step.enter",
                            "dispatcherId": "step-1",
                            "dispatcherType": "step",
                            "bubbles": True,
                            "name": "step.enter",
                            "sourceNodeId": "step-1",
                            "sourceNodeType": "step",
                        }
                    ],
                    "listeners": [],
                },
                "sections": [
                    {
                        "id": "section-1",
                        "title": "Section 1",
                        "description": "Runtime section",
                        "layoutHints": {},
                        "lineage": [],
                        "sourceSectionIds": [],
                        "provenanceAnchorIds": [],
                        "groups": [],
                        "fields": [
                            {
                                "id": "field-1",
                                "stableKey": "field-1",
                                "label": "Applicant name",
                                "semanticType": "text",
                                "required": True,
                                "confidence": 1,
                                "options": [],
                                "validations": [],
                                "conditionals": [],
                                "layoutHints": {"width": "full", "presentation": "input"},
                                "rendererHints": {},
                                "sourcePriority": [],
                                "sourceConflicts": [],
                                "lineage": [],
                                "sourceFieldIds": [],
                                "provenanceAnchorIds": [],
                                "runtime": {
                                    "eventSources": [
                                        {
                                            "id": "event-field-change",
                                            "type": "field.change",
                                            "dispatcherId": "field-1",
                                            "dispatcherType": "field",
                                            "bubbles": True,
                                            "name": "field.change",
                                            "sourceNodeId": "field-1",
                                            "sourceNodeType": "field",
                                        }
                                    ],
                                    "listeners": [
                                        {
                                            "id": "listener-field-change",
                                            "label": "Mirror field value",
                                            "type": "field.change",
                                            "dispatcherId": "field-1",
                                            "dispatcherType": "field",
                                            "useCapture": False,
                                            "priority": 0,
                                            "eventName": "field.change",
                                            "sourceNodeId": "field-1",
                                            "enabled": True,
                                            "ruleGuards": [],
                                            "actions": [
                                                {
                                                    "id": "action-field-change",
                                                    "kind": "set_field_value",
                                                    "target": {"nodeId": "field-1", "nodeType": "field"},
                                                    "config": {"fieldId": "field-1"},
                                                    "continueOnError": False,
                                                }
                                            ],
                                        }
                                    ],
                                },
                            }
                        ],
                    }
                ],
            }
        ],
    }

    create_response = client.post("/projects/from-document", json=payload)
    assert create_response.status_code == 200
    created = create_response.json()
    project_id = created["project"]["id"]

    saved_document = created["document"]
    saved_document["runtime"]["sessionStateShape"]["fields"].append(
        {
            "name": "submitStatus",
            "label": "Submit status",
            "valueType": "string",
            "required": False,
            "description": "Tracks the latest submit result in exported session JSON.",
        }
    )
    saved_document["steps"][0]["sections"][0]["fields"][0]["runtime"]["listeners"][0]["actions"][0]["config"][
        "value"
    ] = "persisted after save"

    save_response = client.put(f"/projects/{project_id}/document", json=saved_document)
    assert save_response.status_code == 200
    saved = save_response.json()

    assert len(saved["document"]["runtime"]["sessionStateShape"]["fields"]) == 2
    assert (
        saved["document"]["steps"][0]["sections"][0]["fields"][0]["runtime"]["listeners"][0]["actions"][0]["config"][
            "value"
        ]
        == "persisted after save"
    )

    reloaded = InMemoryRepository(project_storage_dir=tmp_path / "projects")
    detail = reloaded.get_project(project_id)

    assert detail is not None
    assert detail.document.runtime is not None
    assert detail.document.runtime.session_state_shape.fields[1].name == "submitStatus"
    assert detail.document.runtime.host_bindings[0].handler_key == "submit_form"
    assert detail.document.steps[0].runtime is not None
    assert detail.document.steps[0].runtime.event_sources[0].type == "step.enter"
    assert detail.document.steps[0].sections[0].fields[0].runtime is not None
    assert (
        detail.document.steps[0].sections[0].fields[0].runtime.listeners[0].actions[0].config["value"]
        == "persisted after save"
    )


def test_behavior_lifecycle_edits_survive_project_save_and_disk_reload(monkeypatch, tmp_path):
    repository = InMemoryRepository(project_storage_dir=tmp_path / "projects")
    monkeypatch.setattr("form_builder_api.main.repository", repository)

    create_response = client.post("/projects/from-document", json=_behavior_lifecycle_document_payload())
    assert create_response.status_code == 200
    created = create_response.json()
    project_id = created["project"]["id"]

    saved_document = created["document"]
    form_listeners = saved_document["runtime"]["formListeners"]
    form_listeners[0]["enabled"] = False
    duplicated_form_listener = deepcopy(form_listeners[0])
    duplicated_form_listener["id"] = "listener-form-submit-copy"
    duplicated_form_listener["enabled"] = True
    duplicated_form_listener["actions"][0]["id"] = "action-form-submit-copy"
    duplicated_form_listener["actions"][0]["config"]["payload"]["source"] = "duplicated-form-listener"
    form_listeners.insert(1, duplicated_form_listener)
    saved_document["runtime"]["formListeners"] = [
        listener for listener in form_listeners if listener["id"] != "listener-delete-me"
    ]

    fields = saved_document["steps"][0]["sections"][0]["fields"]
    controller_field = fields[0]
    target_field = fields[1]

    target_field["conditionals"][0]["enabled"] = False
    duplicated_rule = deepcopy(target_field["conditionals"][0])
    duplicated_rule["ruleId"] = "rule-show-target-copy"
    duplicated_rule["effect"] = "require"
    duplicated_rule["enabled"] = True
    target_field["conditionals"].insert(1, duplicated_rule)
    target_field["conditionals"] = [
        rule for rule in target_field["conditionals"] if rule["ruleId"] != "rule-delete-me"
    ]

    field_flows = controller_field["runtime"]["listeners"]
    field_flows[0]["enabled"] = False
    duplicated_event_flow = deepcopy(field_flows[0])
    duplicated_event_flow["id"] = "flow-field-change-copy"
    duplicated_event_flow["enabled"] = True
    duplicated_event_flow["actions"][0]["id"] = "action-field-change-copy"
    duplicated_event_flow["actions"][0]["config"]["eventType"] = "field.controller.changed.copy"
    field_flows.insert(1, duplicated_event_flow)
    controller_field["runtime"]["listeners"] = [
        listener for listener in field_flows if listener["id"] != "flow-delete-me"
    ]

    save_response = client.put(f"/projects/{project_id}/document", json=saved_document)
    assert save_response.status_code == 200
    saved = save_response.json()
    assert saved["project"]["revisionCount"] == 2

    persisted_document = json.loads((tmp_path / "projects" / project_id / "document.json").read_text())
    persisted_target_field = persisted_document["steps"][0]["sections"][0]["fields"][1]
    persisted_rules_by_id = {rule["ruleId"]: rule for rule in persisted_target_field["conditionals"]}
    assert set(persisted_rules_by_id) == {"rule-show-target", "rule-show-target-copy"}
    assert persisted_rules_by_id["rule-show-target"]["enabled"] is False
    assert persisted_rules_by_id["rule-show-target-copy"]["enabled"] is True
    assert persisted_rules_by_id["rule-show-target-copy"]["effect"] == "require"

    persisted_form_listeners_by_id = {
        listener["id"]: listener for listener in persisted_document["runtime"]["formListeners"]
    }
    assert set(persisted_form_listeners_by_id) == {"listener-form-submit", "listener-form-submit-copy"}
    assert persisted_form_listeners_by_id["listener-form-submit"]["enabled"] is False
    assert (
        persisted_form_listeners_by_id["listener-form-submit-copy"]["actions"][0]["config"]["payload"]["source"]
        == "duplicated-form-listener"
    )

    persisted_field_flows_by_id = {
        listener["id"]: listener
        for listener in persisted_document["steps"][0]["sections"][0]["fields"][0]["runtime"]["listeners"]
    }
    assert set(persisted_field_flows_by_id) == {"flow-field-change", "flow-field-change-copy"}
    assert persisted_field_flows_by_id["flow-field-change"]["enabled"] is False
    assert (
        persisted_field_flows_by_id["flow-field-change-copy"]["actions"][0]["config"]["eventType"]
        == "field.controller.changed.copy"
    )

    reloaded = InMemoryRepository(project_storage_dir=tmp_path / "projects")
    detail = reloaded.get_project(project_id)

    assert detail is not None
    reloaded_target_field = detail.document.steps[0].sections[0].fields[1]
    reloaded_rules_by_id = {rule.rule_id: rule for rule in reloaded_target_field.conditionals}
    assert set(reloaded_rules_by_id) == {"rule-show-target", "rule-show-target-copy"}
    assert reloaded_rules_by_id["rule-show-target"].enabled is False
    assert reloaded_rules_by_id["rule-show-target-copy"].enabled is True

    assert detail.document.runtime is not None
    reloaded_form_listeners_by_id = {
        listener.id: listener for listener in detail.document.runtime.form_listeners
    }
    assert set(reloaded_form_listeners_by_id) == {"listener-form-submit", "listener-form-submit-copy"}
    assert reloaded_form_listeners_by_id["listener-form-submit"].enabled is False
    assert reloaded_form_listeners_by_id["listener-form-submit-copy"].enabled is True

    reloaded_controller_runtime = detail.document.steps[0].sections[0].fields[0].runtime
    assert reloaded_controller_runtime is not None
    reloaded_field_flows_by_id = {
        listener.id: listener for listener in reloaded_controller_runtime.listeners
    }
    assert set(reloaded_field_flows_by_id) == {"flow-field-change", "flow-field-change-copy"}
    assert reloaded_field_flows_by_id["flow-field-change"].enabled is False
    assert reloaded_field_flows_by_id["flow-field-change-copy"].enabled is True
