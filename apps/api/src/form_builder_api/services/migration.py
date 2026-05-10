from __future__ import annotations

import json
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

from pydantic import BaseModel, Field


# Hard-coded set of built-in event types sourced from packages/schema/src/runtime.ts.
# Custom events are anything whose eventName is NOT in this set.
BUILT_IN_EVENT_NAMES: frozenset[str] = frozenset(
    {
        "component.mount",
        "component.unmount",
        "component.show",
        "component.hide",
        "component.enable",
        "component.disable",
        "component.click",
        "component.double_click",
        "component.pointer_down",
        "component.pointer_up",
        "component.key_down",
        "component.key_up",
        "state.change",
        "form.load",
        "form.submit",
        "form.submit_success",
        "form.submit_error",
        "form.validation_failed",
        "form.reset",
        "form.formdata",
        "step.enter",
        "step.leave",
        "step.completed",
        "step.validation_failed",
        "section.enter",
        "section.leave",
        "section.change",
        "group.enter",
        "group.leave",
        "group.change",
        "field.input",
        "field.change",
        "field.focus",
        "field.blur",
        "field.invalid",
        "field.key_down",
        "field.key_up",
        "checkboxGroup.change",
        "checkbox.change",
        "checkbox.checked",
        "checkbox.unchecked",
        "radio.change",
        "radio.selected",
        "radio.cleared",
        "select.change",
        "select.selected",
        "select.cleared",
        "select.opened",
        "select.closed",
        "input.change",
        "input.textChange",
        "input.before_input",
        "input.composition_start",
        "input.composition_update",
        "input.composition_end",
        "signature.change",
        "signature.attested",
        "signature.cleared",
        "repeatableGroup.change",
        "repeatableGroup.item_added",
        "repeatableGroup.item_removed",
        "repeatableGroup.item_moved",
        "host.context_updated",
        "button.click",
    }
)


class MigrationCollision(BaseModel):
    project_id: str
    detail: str


class MigrationLog(BaseModel):
    project_id: str
    started_at: str
    finished_at: str
    documents_migrated: int = 0
    event_defs_created: int = 0
    collisions: list[MigrationCollision] = Field(default_factory=list)
    noop: bool = False


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")


def _snapshot_project_files(project_root: Path, timestamp: str) -> Path:
    """Snapshot document.json + revisions/* under migration-backup/<timestamp>/."""
    backup_dir = project_root / "migration-backup" / timestamp
    backup_dir.mkdir(parents=True, exist_ok=True)
    document_path = project_root / "document.json"
    if document_path.exists():
        shutil.copy2(document_path, backup_dir / "document.json")
    revisions_src = project_root / "revisions"
    if revisions_src.exists() and revisions_src.is_dir():
        revisions_dst = backup_dir / "revisions"
        revisions_dst.mkdir(parents=True, exist_ok=True)
        for revision_file in revisions_src.iterdir():
            if revision_file.is_file():
                shutil.copy2(revision_file, revisions_dst / revision_file.name)
    return backup_dir


def _is_custom_event(event_name: str) -> bool:
    return event_name not in BUILT_IN_EVENT_NAMES


def _find_or_create_event_def(
    scope_event_sources: list[dict],
    event_name: str,
    log: MigrationLog,
) -> str:
    """Return the id of an existing def with the same name, or create a new one and return its id."""
    for existing in scope_event_sources:
        # Match by name field first, then fall back to type field (both are used in the schema).
        if existing.get("name") == event_name or existing.get("type") == event_name:
            return existing["id"]
    new_def = {
        "id": str(uuid.uuid4()),
        "type": event_name,
        "name": event_name,
        "bubbles": True,
    }
    scope_event_sources.append(new_def)
    log.event_defs_created += 1
    return new_def["id"]


def _promote_listener(
    listener: dict,
    scope_event_sources: list[dict],
    fallback_event_sources: list[dict],
    log: MigrationLog,
) -> None:
    """Mutate the listener dict in place, promoting legacy fields to Phase 1A shape."""
    # Promote eventSourceNodeId → source
    if listener.get("eventSourceNodeId") and not listener.get("source"):
        listener["source"] = {"id": listener["eventSourceNodeId"]}

    # Promote targetNodeId → target
    if listener.get("targetNodeId") and not listener.get("target"):
        listener["target"] = {"id": listener["targetNodeId"]}

    # Promote custom eventName → eventRef
    event_name = listener.get("eventName") or listener.get("type") or ""
    if event_name and _is_custom_event(event_name) and not listener.get("eventRef"):
        # Try the closest scope first; fall back to the form-level scope.
        def_id = _find_or_create_event_def(scope_event_sources, event_name, log)
        # If the def was just created in an empty scope_event_sources that IS the
        # fallback, don't double-create. Only use fallback when scope differs.
        if scope_event_sources is not fallback_event_sources:
            # Check whether we actually found it in scope or created it there.
            # If the scope list already had a match we reused it — that's fine.
            # If scope is empty and we just created in it, check if fallback had one.
            found_in_fallback = any(
                e.get("name") == event_name or e.get("type") == event_name
                for e in fallback_event_sources
            )
            if found_in_fallback:
                # Reuse the fallback def instead — remove the one we may have added.
                # Find the def we just added (it would be the last element if we added it).
                if scope_event_sources and scope_event_sources[-1].get("name") == event_name:
                    scope_event_sources.pop()
                    log.event_defs_created -= 1
                def_id = _find_or_create_event_def(fallback_event_sources, event_name, log)
        listener["eventRef"] = {"id": def_id}


def _walk_node(
    node: dict,
    fallback_event_sources: list[dict],
    log: MigrationLog,
) -> None:
    """Recursively walk a node tree (step → section → group → field), promoting listeners."""
    if not isinstance(node, dict):
        return
    runtime = node.get("runtime")
    if isinstance(runtime, dict):
        scope_sources = runtime.setdefault("eventSources", [])
        listeners = runtime.get("listeners", [])
        for listener in listeners:
            _promote_listener(listener, scope_sources, fallback_event_sources, log)

    # Walk all child collection keys present in the actual document structure.
    for key in ("sections", "groups", "fields", "components", "items", "children"):
        children = node.get(key)
        if isinstance(children, list):
            for child in children:
                _walk_node(child, fallback_event_sources, log)


def _migrate_document(document: dict, log: MigrationLog) -> bool:
    """
    Migrate a single document dict in place.

    Returns True if the document was modified (i.e. needs writing back).
    Idempotent: if migrationVersion is already "phase-1", returns False immediately.
    """
    runtime = document.get("runtime")
    if not isinstance(runtime, dict):
        # No runtime block — initialise one and stamp it so this document is
        # considered done (nothing to migrate but we still mark it).
        document["runtime"] = {"migrationVersion": "phase-1"}
        log.documents_migrated += 1
        return True

    if runtime.get("migrationVersion") == "phase-1":
        return False

    form_event_sources = runtime.setdefault("formEvents", [])
    form_listeners = runtime.setdefault("formListeners", [])
    for listener in form_listeners:
        # Form-level listeners: scope == fallback (same list).
        _promote_listener(listener, form_event_sources, form_event_sources, log)

    # Walk the node tree; each node gets its own scope but falls back to form-level.
    for step in document.get("steps", []):
        _walk_node(step, form_event_sources, log)

    runtime["migrationVersion"] = "phase-1"
    log.documents_migrated += 1
    return True


def migrate_project(project_id: str, base_path: Path | None = None) -> MigrationLog:
    """
    Migrate a single project's document.json + revisions/.

    Returns a MigrationLog describing what happened. Safe to call multiple times
    (idempotent per document via the migrationVersion sentinel).
    """
    base = base_path or Path.cwd()
    project_root = base / "data" / "projects" / project_id
    log = MigrationLog(
        project_id=project_id,
        started_at=datetime.now(timezone.utc).isoformat(),
        finished_at="",
    )

    if not project_root.exists():
        log.noop = True
        log.finished_at = datetime.now(timezone.utc).isoformat()
        return log

    document_path = project_root / "document.json"
    if not document_path.exists():
        log.noop = True
        log.finished_at = datetime.now(timezone.utc).isoformat()
        return log

    # Quick early-exit check on the primary document before touching disk.
    document = json.loads(document_path.read_text())
    if document.get("runtime", {}) and document.get("runtime", {}).get("migrationVersion") == "phase-1":
        # Check revisions too before declaring noop.
        revisions_dir = project_root / "revisions"
        all_done = True
        if revisions_dir.exists():
            for revision_file in revisions_dir.iterdir():
                if revision_file.is_file() and revision_file.suffix == ".json":
                    rev_doc = json.loads(revision_file.read_text())
                    if rev_doc.get("runtime", {}).get("migrationVersion") != "phase-1":
                        all_done = False
                        break
        if all_done:
            log.noop = True
            log.finished_at = datetime.now(timezone.utc).isoformat()
            return log

    # Snapshot before touching anything.
    timestamp = _now_iso()
    _snapshot_project_files(project_root, timestamp)

    documents_to_write: list[tuple[Path, dict]] = []

    if _migrate_document(document, log):
        documents_to_write.append((document_path, document))

    revisions_dir = project_root / "revisions"
    if revisions_dir.exists():
        for revision_file in sorted(revisions_dir.iterdir()):
            if revision_file.is_file() and revision_file.suffix == ".json":
                rev_doc = json.loads(revision_file.read_text())
                if _migrate_document(rev_doc, log):
                    documents_to_write.append((revision_file, rev_doc))

    for path, doc in documents_to_write:
        path.write_text(json.dumps(doc, indent=2))

    log.finished_at = datetime.now(timezone.utc).isoformat()

    # Append a structured entry to the per-project migration log.
    audit_path = project_root / "migration-log.json"
    existing_logs: list[dict] = []
    if audit_path.exists():
        try:
            existing_logs = json.loads(audit_path.read_text())
        except (json.JSONDecodeError, ValueError):
            existing_logs = []
    existing_logs.append(json.loads(log.model_dump_json()))
    audit_path.write_text(json.dumps(existing_logs, indent=2))

    return log


def migrate_all(base_path: Path | None = None) -> list[MigrationLog]:
    """
    Migrate every project under data/projects/.

    Returns a list of MigrationLog entries — one per project directory found.
    """
    base = base_path or Path.cwd()
    projects_root = base / "data" / "projects"
    if not projects_root.exists():
        return []
    logs: list[MigrationLog] = []
    for project_dir in sorted(projects_root.iterdir()):
        if project_dir.is_dir():
            logs.append(migrate_project(project_dir.name, base_path=base))
    return logs
