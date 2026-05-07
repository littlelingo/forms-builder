export type RuntimeNodeType = "form" | "step" | "section" | "group" | "field" | "component";
export type RuntimeEventPhase = "capture" | "target" | "bubble";

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
  | "dispatch_event"
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
  | "button.click"
  | "checkbox.change"
  | "checkbox.checked"
  | "checkbox.unchecked"
  | "checkboxGroup.change"
  | "radio.change"
  | "radio.selected"
  | "radio.cleared"
  | "select.change"
  | "select.selected"
  | "select.cleared"
  | "input.change"
  | "input.textChange"
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

export interface RuntimeEventTypeDefinition {
  id: string;
  type?: string;
  dispatcherId?: string | null;
  dispatcherType?: RuntimeNodeType | null;
  bubbles?: boolean;
  payloadShape?: RuntimePayloadShape | null;
  description?: string | null;
  /** @deprecated use type */
  name?: string;
  /** @deprecated use dispatcherId */
  sourceNodeId?: string | null;
  /** @deprecated use dispatcherType */
  sourceNodeType?: RuntimeNodeType | null;
}

export type RuntimeEventDefinition = RuntimeEventTypeDefinition;

export interface RuntimeListenerDefinition {
  id: string;
  label?: string | null;
  type?: string;
  dispatcherId?: string | null;
  dispatcherType?: RuntimeNodeType | null;
  useCapture?: boolean;
  priority?: number;
  /** @deprecated use type */
  eventName: string;
  /** @deprecated use dispatcherId */
  sourceNodeId?: string | null;
  enabled: boolean;
  ruleGuards: RuntimeRuleGuardReference[];
  actions: RuntimeActionDefinition[];
}

export interface RuntimeHostBinding {
  id: string;
  eventName?: string;
  type?: string;
  direction: RuntimeHostBindingDirection;
  handlerKey?: string | null;
  payloadShape?: RuntimePayloadShape | null;
  description?: string | null;
}

export interface RuntimeNodeBehavior {
  eventSources: RuntimeEventTypeDefinition[];
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

export interface RuntimeEventTarget {
  runtimeId: string;
  formId: string;
  projectId?: string | null;
  nodeId?: string | null;
  nodeType?: RuntimeNodeType | null;
}

export interface RuntimeEventEnvelope {
  type: string;
  version: "1.0";
  target?: RuntimeEventTarget;
  currentTarget?: RuntimeEventTarget | null;
  eventPhase?: RuntimeEventPhase;
  bubbles?: boolean;
  /** @deprecated use target */
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
  formEvents: RuntimeEventTypeDefinition[];
  formListeners: RuntimeListenerDefinition[];
  hostBindings: RuntimeHostBinding[];
  submitEventName: string;
  sessionStateShape: RuntimePayloadShape;
}

export interface RuntimeCoreEventTypeDefinition {
  type: RuntimeEventName | string;
  label: string;
  dispatcherTypes: RuntimeNodeType[];
  semanticTypes?: string[];
  bubbles: boolean;
  description?: string;
}

export const runtimeCoreEventTypes: RuntimeCoreEventTypeDefinition[] = [
  { type: "component.mount", label: "Component mounted", dispatcherTypes: ["form", "step", "section", "group", "field", "component"], bubbles: false },
  { type: "component.unmount", label: "Component unmounted", dispatcherTypes: ["form", "step", "section", "group", "field", "component"], bubbles: false },
  { type: "component.show", label: "Component shown", dispatcherTypes: ["section", "group", "field", "component"], bubbles: true },
  { type: "component.hide", label: "Component hidden", dispatcherTypes: ["section", "group", "field", "component"], bubbles: true },
  { type: "component.enable", label: "Component enabled", dispatcherTypes: ["field", "component"], bubbles: true },
  { type: "component.disable", label: "Component disabled", dispatcherTypes: ["field", "component"], bubbles: true },
  { type: "state.change", label: "State changed", dispatcherTypes: ["form", "step", "section", "group", "field", "component"], bubbles: true },
  { type: "form.load", label: "Form loaded", dispatcherTypes: ["form"], bubbles: false },
  { type: "form.submit", label: "Form submitted", dispatcherTypes: ["form"], bubbles: false },
  { type: "form.submit_success", label: "Submit succeeded", dispatcherTypes: ["form"], bubbles: false },
  { type: "form.submit_error", label: "Submit failed", dispatcherTypes: ["form"], bubbles: false },
  { type: "form.validation_failed", label: "Validation failed", dispatcherTypes: ["form"], bubbles: false },
  { type: "step.enter", label: "Step entered", dispatcherTypes: ["step"], bubbles: true },
  { type: "step.leave", label: "Step left", dispatcherTypes: ["step"], bubbles: true },
  { type: "section.enter", label: "Section entered", dispatcherTypes: ["section"], bubbles: true },
  { type: "section.leave", label: "Section left", dispatcherTypes: ["section"], bubbles: true },
  { type: "group.enter", label: "Group entered", dispatcherTypes: ["group"], bubbles: true },
  { type: "group.leave", label: "Group left", dispatcherTypes: ["group"], bubbles: true },
  { type: "component.click", label: "Component clicked", dispatcherTypes: ["component"], bubbles: true },
  { type: "button.click", label: "Button clicked", dispatcherTypes: ["component"], bubbles: true },
  { type: "field.change", label: "Field changed", dispatcherTypes: ["field"], bubbles: true },
  { type: "field.focus", label: "Field focused", dispatcherTypes: ["field"], bubbles: true },
  { type: "field.blur", label: "Field blurred", dispatcherTypes: ["field"], bubbles: true },
  { type: "checkboxGroup.change", label: "Checkbox group changed", dispatcherTypes: ["field"], semanticTypes: ["checkbox"], bubbles: true },
  { type: "checkbox.change", label: "Checkbox changed", dispatcherTypes: ["field"], semanticTypes: ["checkbox"], bubbles: true },
  { type: "checkbox.checked", label: "Checkbox checked", dispatcherTypes: ["field"], semanticTypes: ["checkbox"], bubbles: true },
  { type: "checkbox.unchecked", label: "Checkbox unchecked", dispatcherTypes: ["field"], semanticTypes: ["checkbox"], bubbles: true },
  { type: "radio.change", label: "Radio selection changed", dispatcherTypes: ["field"], semanticTypes: ["radio"], bubbles: true },
  { type: "radio.selected", label: "Radio option selected", dispatcherTypes: ["field"], semanticTypes: ["radio"], bubbles: true },
  { type: "radio.cleared", label: "Radio selection cleared", dispatcherTypes: ["field"], semanticTypes: ["radio"], bubbles: true },
  { type: "select.change", label: "Select changed", dispatcherTypes: ["field"], semanticTypes: ["select"], bubbles: true },
  { type: "select.selected", label: "Select option selected", dispatcherTypes: ["field"], semanticTypes: ["select"], bubbles: true },
  { type: "select.cleared", label: "Select cleared", dispatcherTypes: ["field"], semanticTypes: ["select"], bubbles: true },
  { type: "input.change", label: "Input changed", dispatcherTypes: ["field"], semanticTypes: ["text", "textarea", "date", "number", "phone", "email"], bubbles: true },
  { type: "input.textChange", label: "Input text changed", dispatcherTypes: ["field"], semanticTypes: ["text", "textarea"], bubbles: true },
  { type: "host.context_updated", label: "Host context updated", dispatcherTypes: ["form"], bubbles: false },
];

export function runtimeCoreEventType(type: string): RuntimeCoreEventTypeDefinition | null {
  return runtimeCoreEventTypes.find((eventType) => eventType.type === type) ?? null;
}

export function runtimeCoreEventsForDispatcher(
  dispatcherType: RuntimeNodeType,
  semanticType?: string | null,
): RuntimeCoreEventTypeDefinition[] {
  return runtimeCoreEventTypes.filter((eventType) => {
    if (!eventType.dispatcherTypes.includes(dispatcherType)) {
      return false;
    }
    if (!eventType.semanticTypes?.length) {
      return true;
    }
    return semanticType ? eventType.semanticTypes.includes(semanticType) : false;
  });
}
