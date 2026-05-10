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
RuntimeListenerWiringMode = Literal["local", "cross_item", "advanced_dispatcher"]
RuntimeHostBindingDirection = Literal["inbound", "outbound", "bidirectional"]
RuntimePayloadMode = Literal["key_value", "json"]
RuntimeValueType = Literal["string", "number", "boolean", "object", "array", "unknown"]
RuntimeConditionOperator = Literal["equals", "not_equals", "contains", "exists"]
RuntimeEventScope = Literal["form", "node", "project"]
BehaviorProvenance = Literal["extraction", "library", "manual"]
BehaviorSafetyClass = Literal["safe", "destructive", "host"]


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


class RuntimeConditionSource(CamelModel):
    kind: Literal["field_value", "event_payload"]
    field_id: str | None = None
    path: str | None = None


class RuntimeConditionDefinition(CamelModel):
    id: str
    label: str | None = None
    enabled: bool = True
    source: RuntimeConditionSource
    operator: RuntimeConditionOperator
    expected_value: object | None = None


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
    scope: RuntimeEventScope | None = None
    dispatcher_id: str | None = None
    dispatcher_type: RuntimeNodeType | None = None
    bubbles: bool | None = None
    payload_shape: RuntimePayloadShape | None = None
    description: str | None = None
    name: str | None = None
    source_node_id: str | None = None
    source_node_type: RuntimeNodeType | None = None


RuntimeEventDefinition = RuntimeEventTypeDefinition


class RuntimeProjectBehavior(CamelModel):
    """Phase 2A: project-scope behavior catalog persisted at
    `data/projects/<id>/project-events.json`."""

    version: Literal["1.0"] = "1.0"
    project_events: list[RuntimeEventDefinition] = Field(default_factory=list)


class NodeRef(CamelModel):
    id: str


class EventRef(CamelModel):
    id: str


class BehaviorLibraryRef(CamelModel):
    id: str
    revision: int
    params: dict[str, object] = Field(default_factory=dict)
    detached: bool = False


class BehaviorListenerTiming(CamelModel):
    debounce_ms: int | None = None
    throttle_ms: int | None = None


class RuntimeListenerDefinition(CamelModel):
    id: str
    label: str | None = None
    type: str | None = None
    dispatcher_id: str | None = None
    dispatcher_type: RuntimeNodeType | None = None
    event_source_node_id: str | None = None
    event_source_node_type: RuntimeNodeType | None = None
    event_source_label: str | None = None
    target_node_id: str | None = None
    target_node_type: RuntimeNodeType | None = None
    wiring_mode: RuntimeListenerWiringMode = "local"
    use_capture: bool = False
    priority: int = 0
    source: NodeRef | None = None
    target: NodeRef | None = None
    event_ref: EventRef | None = None
    library_ref: BehaviorLibraryRef | None = None
    timing: BehaviorListenerTiming | None = None
    provenance: BehaviorProvenance | None = None
    event_name: str
    source_node_id: str | None = None
    enabled: bool = True
    conditions: list[RuntimeConditionDefinition] = Field(default_factory=list)
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
    node_key: str | None = None
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
    migration_version: Literal["phase-1"] | None = None
    form_events: list[RuntimeEventDefinition] = Field(default_factory=list)
    form_listeners: list[RuntimeListenerDefinition] = Field(default_factory=list)
    host_bindings: list[RuntimeHostBinding] = Field(default_factory=list)
    submit_event_name: str = "form.submit"
    session_state_shape: RuntimePayloadShape = Field(default_factory=RuntimePayloadShape)
