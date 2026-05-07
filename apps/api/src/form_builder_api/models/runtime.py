from __future__ import annotations

from typing import Literal

from pydantic import Field

from .base import CamelModel


RuntimeNodeType = Literal["form", "step", "section", "group", "field", "component"]
RuntimeActionKind = Literal[
    "go_to_next_step",
    "go_to_previous_step",
    "go_to_step",
    "submit_form",
    "set_field_value",
    "clear_field_value",
    "show_node",
    "hide_node",
    "enable_node",
    "disable_node",
    "mark_required",
    "mark_optional",
    "dispatch_event",
    "emit_event",
    "host_action",
]
RuntimeEventPhase = Literal["capture", "target", "bubble"]
RuntimeHostBindingDirection = Literal["inbound", "outbound", "bidirectional"]
RuntimePayloadMode = Literal["key_value", "json"]
RuntimeValueType = Literal["string", "number", "boolean", "object", "array", "unknown"]


class RuntimePayloadField(CamelModel):
    name: str
    label: str | None = None
    value_type: RuntimeValueType = "unknown"
    required: bool = False
    description: str | None = None


class RuntimePayloadShape(CamelModel):
    mode: RuntimePayloadMode = "key_value"
    fields: list[RuntimePayloadField] = Field(default_factory=list)
    example: dict[str, object] | None = None
    notes: list[str] | None = None


class RuntimeRuleGuardReference(CamelModel):
    rule_id: str
    label: str | None = None
    description: str | None = None


class RuntimeActionTarget(CamelModel):
    node_id: str | None = None
    node_type: RuntimeNodeType | None = None


class RuntimeActionDefinition(CamelModel):
    id: str
    label: str | None = None
    kind: RuntimeActionKind
    target: RuntimeActionTarget | None = None
    config: dict[str, object] = Field(default_factory=dict)
    continue_on_error: bool = False


class RuntimeEventTypeDefinition(CamelModel):
    id: str
    type: str | None = None
    dispatcher_id: str | None = None
    dispatcher_type: RuntimeNodeType | None = None
    bubbles: bool | None = None
    payload_shape: RuntimePayloadShape | None = None
    description: str | None = None
    name: str | None = None
    source_node_id: str | None = None
    source_node_type: RuntimeNodeType | None = None


RuntimeEventDefinition = RuntimeEventTypeDefinition


class RuntimeListenerDefinition(CamelModel):
    id: str
    label: str | None = None
    type: str | None = None
    dispatcher_id: str | None = None
    dispatcher_type: RuntimeNodeType | None = None
    use_capture: bool = False
    priority: int = 0
    event_name: str
    source_node_id: str | None = None
    enabled: bool = True
    rule_guards: list[RuntimeRuleGuardReference] = Field(default_factory=list)
    actions: list[RuntimeActionDefinition] = Field(default_factory=list)


class RuntimeHostBinding(CamelModel):
    id: str
    event_name: str | None = None
    type: str | None = None
    direction: RuntimeHostBindingDirection
    handler_key: str | None = None
    payload_shape: RuntimePayloadShape | None = None
    description: str | None = None


class RuntimeNodeBehavior(CamelModel):
    event_sources: list[RuntimeEventDefinition] = Field(default_factory=list)
    listeners: list[RuntimeListenerDefinition] = Field(default_factory=list)


class RuntimeHostContext(CamelModel):
    environment: str = "unknown"
    session: dict[str, object] = Field(default_factory=dict)
    auth: dict[str, object] = Field(default_factory=dict)
    app: dict[str, object] = Field(default_factory=dict)
    data: dict[str, object] = Field(default_factory=dict)


class RuntimeValidationError(CamelModel):
    node_id: str
    field_id: str | None = None
    message: str
    severity: Literal["error", "warning"] = "error"


class RuntimeValidationState(CamelModel):
    valid: bool = True
    errors: list[RuntimeValidationError] = Field(default_factory=list)
    warnings: list[RuntimeValidationError] = Field(default_factory=list)


class RuntimeNodeState(CamelModel):
    visible: bool = True
    enabled: bool = True
    required: bool = False


class RuntimeSubmitState(CamelModel):
    status: Literal["idle", "submitting", "success", "error"] = "idle"
    last_correlation_id: str | None = None
    message: str | None = None
    field_errors: dict[str, str] | None = None


class RuntimeSessionState(CamelModel):
    current_step_id: str | None = None
    values: dict[str, object] = Field(default_factory=dict)
    nodes: dict[str, RuntimeNodeState] = Field(default_factory=dict)
    validation: RuntimeValidationState = Field(default_factory=RuntimeValidationState)
    submit: RuntimeSubmitState = Field(default_factory=RuntimeSubmitState)
    host_context_snapshot: dict[str, object] | None = None


class RuntimeSubmitPayload(CamelModel):
    form_id: str
    project_id: str | None = None
    step_id: str | None = None
    values: dict[str, object] = Field(default_factory=dict)
    validation: RuntimeValidationState = Field(default_factory=RuntimeValidationState)
    host_context: dict[str, object] | None = None


class RuntimeEventEnvelopeSource(CamelModel):
    runtime_id: str
    form_id: str
    project_id: str | None = None
    node_id: str | None = None
    node_type: RuntimeNodeType | None = None


RuntimeEventTarget = RuntimeEventEnvelopeSource


class RuntimeEventEnvelope(CamelModel):
    type: str
    version: Literal["1.0"] = "1.0"
    target: RuntimeEventTarget | None = None
    current_target: RuntimeEventTarget | None = None
    event_phase: RuntimeEventPhase | None = None
    bubbles: bool | None = None
    source: RuntimeEventEnvelopeSource
    payload: dict[str, object] = Field(default_factory=dict)
    correlation_id: str
    timestamp: str


class RuntimeDocumentBehavior(CamelModel):
    version: Literal["1.0"] = "1.0"
    form_events: list[RuntimeEventDefinition] = Field(default_factory=list)
    form_listeners: list[RuntimeListenerDefinition] = Field(default_factory=list)
    host_bindings: list[RuntimeHostBinding] = Field(default_factory=list)
    submit_event_name: str = "form.submit"
    session_state_shape: RuntimePayloadShape = Field(default_factory=RuntimePayloadShape)
