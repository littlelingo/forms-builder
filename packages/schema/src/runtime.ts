export type RuntimeNodeType = "form" | "step" | "section" | "group" | "field" | "component";

export type RuntimeActionKind =
  | "go_to_next_step"
  | "go_to_previous_step"
  | "go_to_step"
  | "submit_form"
  | "set_field_value"
  | "clear_field_value"
  | "show_node"
  | "hide_node"
  | "enable_node"
  | "disable_node"
  | "mark_required"
  | "mark_optional"
  | "emit_event"
  | "host_action";

export type RuntimeEventName =
  | "form.load"
  | "form.submit"
  | "form.submit_success"
  | "form.submit_error"
  | "form.validation_failed"
  | "step.enter"
  | "step.leave"
  | "field.change"
  | "field.focus"
  | "field.blur"
  | "component.click"
  | "host.context_updated";

export type RuntimeHostBindingDirection = "inbound" | "outbound" | "bidirectional";
export type RuntimePayloadMode = "key_value" | "json";
export type RuntimeValueType = "string" | "number" | "boolean" | "object" | "array" | "unknown";

export interface RuntimePayloadField {
  name: string;
  label?: string | null;
  valueType: RuntimeValueType;
  required: boolean;
  description?: string | null;
}

export interface RuntimePayloadShape {
  mode: RuntimePayloadMode;
  fields: RuntimePayloadField[];
  example?: Record<string, unknown> | null;
  notes?: string[] | null;
}

export interface RuntimeRuleGuardReference {
  ruleId: string;
  label?: string | null;
  description?: string | null;
}

export interface RuntimeActionTarget {
  nodeId?: string | null;
  nodeType?: RuntimeNodeType | null;
}

export interface RuntimeActionDefinition {
  id: string;
  label?: string | null;
  kind: RuntimeActionKind;
  target?: RuntimeActionTarget | null;
  config: Record<string, unknown>;
  continueOnError: boolean;
}

export interface RuntimeEventDefinition {
  id: string;
  name: string;
  sourceNodeId?: string | null;
  sourceNodeType?: RuntimeNodeType | null;
  payloadShape?: RuntimePayloadShape | null;
  description?: string | null;
}

export interface RuntimeListenerDefinition {
  id: string;
  label?: string | null;
  eventName: string;
  sourceNodeId?: string | null;
  enabled: boolean;
  ruleGuards: RuntimeRuleGuardReference[];
  actions: RuntimeActionDefinition[];
}

export interface RuntimeHostBinding {
  id: string;
  eventName: string;
  direction: RuntimeHostBindingDirection;
  handlerKey?: string | null;
  payloadShape?: RuntimePayloadShape | null;
  description?: string | null;
}

export interface RuntimeNodeBehavior {
  eventSources: RuntimeEventDefinition[];
  listeners: RuntimeListenerDefinition[];
}

export interface RuntimeHostContext {
  environment: string;
  session: Record<string, unknown>;
  auth: Record<string, unknown>;
  app: Record<string, unknown>;
  data: Record<string, unknown>;
}

export interface RuntimeValidationError {
  nodeId: string;
  fieldId?: string | null;
  message: string;
  severity: "error" | "warning";
}

export interface RuntimeValidationState {
  valid: boolean;
  errors: RuntimeValidationError[];
  warnings: RuntimeValidationError[];
}

export interface RuntimeNodeState {
  visible: boolean;
  enabled: boolean;
  required: boolean;
}

export interface RuntimeSubmitState {
  status: "idle" | "submitting" | "success" | "error";
  lastCorrelationId?: string | null;
  message?: string | null;
  fieldErrors?: Record<string, string> | null;
}

export interface RuntimeSessionState {
  currentStepId?: string | null;
  values: Record<string, unknown>;
  nodes: Record<string, RuntimeNodeState>;
  validation: RuntimeValidationState;
  submit: RuntimeSubmitState;
  hostContextSnapshot?: Record<string, unknown> | null;
}

export interface RuntimeSubmitPayload {
  formId: string;
  projectId?: string | null;
  stepId?: string | null;
  values: Record<string, unknown>;
  validation: RuntimeValidationState;
  hostContext?: Record<string, unknown> | null;
}

export interface RuntimeEventEnvelope {
  type: string;
  version: "1.0";
  source: {
    runtimeId: string;
    formId: string;
    projectId?: string | null;
    nodeId?: string | null;
    nodeType?: RuntimeNodeType | null;
  };
  payload: Record<string, unknown>;
  correlationId: string;
  timestamp: string;
}

export interface RuntimeDocumentBehavior {
  version: "1.0";
  formEvents: RuntimeEventDefinition[];
  formListeners: RuntimeListenerDefinition[];
  hostBindings: RuntimeHostBinding[];
  submitEventName: string;
  sessionStateShape: RuntimePayloadShape;
}
