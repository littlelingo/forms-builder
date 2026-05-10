from __future__ import annotations

import json
import re
from pathlib import Path

from ..models.authoring import BehaviorLibraryEntry


def _project_library_dir(project_id: str, base_path: Path | None = None) -> Path:
    base = base_path or Path.cwd()
    return base / "data" / "projects" / project_id / "library"


def _slugify(value: str) -> str:
    """Stable slug for filenames. Lowercase, alphanumeric + hyphens."""
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower())
    slug = slug.strip("-")
    return slug or "entry"


def list_project_library(
    project_id: str,
    base_path: Path | None = None,
) -> list[BehaviorLibraryEntry]:
    """Returns every project-scope library entry for a project. Empty list if none."""
    library_dir = _project_library_dir(project_id, base_path)
    if not library_dir.exists() or not library_dir.is_dir():
        return []
    entries: list[BehaviorLibraryEntry] = []
    for entry_file in sorted(library_dir.iterdir()):
        if entry_file.is_file() and entry_file.suffix == ".json":
            try:
                raw = json.loads(entry_file.read_text())
                entries.append(BehaviorLibraryEntry.model_validate(raw))
            except (json.JSONDecodeError, ValueError):
                # Skip malformed entries; surface via logging in a future telemetry task.
                continue
    return entries


def save_project_library_entry(
    project_id: str,
    entry: BehaviorLibraryEntry,
    base_path: Path | None = None,
) -> BehaviorLibraryEntry:
    """Persists a library entry to disk. Returns the saved entry (potentially with a bumped revision)."""
    if entry.scope != "project":
        raise ValueError(
            f"Cannot save library entry with scope {entry.scope!r} to project library; expected 'project'."
        )
    library_dir = _project_library_dir(project_id, base_path)
    library_dir.mkdir(parents=True, exist_ok=True)
    slug = _slugify(entry.id)
    path = library_dir / f"{slug}.json"
    # Idempotent write: if file exists with same revision, leave alone; if it exists with older revision, bump.
    if path.exists():
        existing_raw = json.loads(path.read_text())
        existing_revision = int(existing_raw.get("revision", 0))
        if entry.revision <= existing_revision:
            entry = entry.model_copy(update={"revision": existing_revision + 1})
    path.write_text(entry.model_dump_json(by_alias=True, indent=2))
    return entry


def delete_project_library_entry(
    project_id: str,
    entry_id: str,
    base_path: Path | None = None,
) -> bool:
    """Deletes the entry. Returns True if deleted, False if not found."""
    library_dir = _project_library_dir(project_id, base_path)
    if not library_dir.exists():
        return False
    slug = _slugify(entry_id)
    path = library_dir / f"{slug}.json"
    if path.exists():
        path.unlink()
        return True
    # Fallback: scan all entries; some entry ids may not slug to the saved filename.
    for entry_file in library_dir.iterdir():
        if entry_file.is_file() and entry_file.suffix == ".json":
            try:
                raw = json.loads(entry_file.read_text())
                if raw.get("id") == entry_id:
                    entry_file.unlink()
                    return True
            except (json.JSONDecodeError, ValueError):
                continue
    return False
