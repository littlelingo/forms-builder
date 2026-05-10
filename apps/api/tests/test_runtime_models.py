"""Phase 3 schema mirror: round-trip new action kinds and onError policy.

Asserts that listeners using `branch`, `wait`, and `host_call_await` action
kinds plus the new `on_error` policy survive Pydantic validation and JSON
serialisation.
"""
from __future__ import annotations

import pytest

from form_builder_api.models.runtime import RuntimeActionDefinition


def test_branch_action_kind_round_trips() -> None:
    payload = {
        "id": "act_1",
        "kind": "branch",
        "config": {
            "conditions": [],
            "actions": [],
            "else": [],
        },
        "continueOnError": False,
        "onError": "halt_and_raise",
    }
    action = RuntimeActionDefinition.model_validate(payload)
    assert action.kind == "branch"
    assert action.on_error == "halt_and_raise"
    serialised = action.model_dump(by_alias=True, exclude_none=True)
    assert serialised["kind"] == "branch"
    assert serialised["onError"] == "halt_and_raise"


def test_wait_action_kind_round_trips_with_until_event() -> None:
    payload = {
        "id": "act_2",
        "kind": "wait",
        "config": {"mode": "until_event", "eventType": "host.action_response", "timeoutMs": 5000},
        "continueOnError": False,
    }
    action = RuntimeActionDefinition.model_validate(payload)
    assert action.kind == "wait"
    assert action.config["mode"] == "until_event"
    assert action.on_error is None


def test_host_call_await_action_kind_round_trips() -> None:
    payload = {
        "id": "act_3",
        "kind": "host_call_await",
        "config": {"handlerKey": "lookup_zip", "correlationId": "corr-1", "timeoutMs": 3000},
        "continueOnError": False,
        "onError": "continue",
    }
    action = RuntimeActionDefinition.model_validate(payload)
    assert action.kind == "host_call_await"
    assert action.on_error == "continue"
    assert action.config["handlerKey"] == "lookup_zip"


def test_unknown_action_kind_is_rejected() -> None:
    payload = {
        "id": "act_bad",
        "kind": "warp_speed",
        "config": {},
        "continueOnError": False,
    }
    with pytest.raises(Exception):
        RuntimeActionDefinition.model_validate(payload)


def test_pre_phase_3_listener_omitting_on_error_round_trips() -> None:
    """Documents persisted before Phase 3 do not carry `onError`; engine falls
    back to `continue_on_error`. Pydantic must accept the absent field."""

    payload = {
        "id": "act_legacy",
        "kind": "set_field_value",
        "config": {"fieldId": "first_name", "value": "Ada"},
        "continueOnError": True,
    }
    action = RuntimeActionDefinition.model_validate(payload)
    assert action.on_error is None
    assert action.continue_on_error is True
