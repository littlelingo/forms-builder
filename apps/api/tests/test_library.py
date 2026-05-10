from pathlib import Path

import pytest

from form_builder_api.models.authoring import BehaviorLibraryEntry
from form_builder_api.services.library import (
    delete_project_library_entry,
    list_project_library,
    save_project_library_entry,
)


def make_entry(id_: str = "lib_test_entry") -> BehaviorLibraryEntry:
    return BehaviorLibraryEntry.model_validate({
        "id": id_,
        "name": "Test entry",
        "description": "Round-trip test",
        "category": "custom",
        "scope": "project",
        "revision": 1,
        "parameters": [],
        "binds_to": [],
        "template": {"eventName": "field.change", "actions": []},
    })


def test_list_empty_when_no_library(tmp_path: Path) -> None:
    project_root = tmp_path / "data" / "projects" / "p1"
    project_root.mkdir(parents=True)
    assert list_project_library("p1", base_path=tmp_path) == []


def test_save_and_list(tmp_path: Path) -> None:
    entry = make_entry()
    saved = save_project_library_entry("p1", entry, base_path=tmp_path)
    assert saved.id == entry.id
    listed = list_project_library("p1", base_path=tmp_path)
    assert len(listed) == 1
    assert listed[0].id == entry.id


def test_save_bumps_revision_on_overwrite(tmp_path: Path) -> None:
    entry = make_entry()
    save_project_library_entry("p1", entry, base_path=tmp_path)
    re_saved = save_project_library_entry("p1", entry, base_path=tmp_path)  # same revision
    assert re_saved.revision == 2  # bumped because file already had revision 1


def test_delete_existing(tmp_path: Path) -> None:
    save_project_library_entry("p1", make_entry(), base_path=tmp_path)
    assert delete_project_library_entry("p1", "lib_test_entry", base_path=tmp_path) is True
    assert list_project_library("p1", base_path=tmp_path) == []


def test_delete_missing(tmp_path: Path) -> None:
    assert delete_project_library_entry("p1", "missing", base_path=tmp_path) is False


def test_save_rejects_non_project_scope(tmp_path: Path) -> None:
    entry = make_entry().model_copy(update={"scope": "system"})
    with pytest.raises(ValueError):
        save_project_library_entry("p1", entry, base_path=tmp_path)
