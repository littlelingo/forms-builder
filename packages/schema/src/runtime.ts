export type RuntimeNodeType = "form" | "step" | "section" | "group" | "field" | "component";
export type RuntimeEventPhase = "capture" | "target" | "bubble";
export type RuntimeListenerWiringMode = "local" | "cross_item" | "advanced_dispatcher";

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
  | "component.mount"
  | "component.unmount"
  | "component.show"
  | "component.hide"
  | "component.enable"
  | "component.disable"
  | "state.change"
  | "form.load"
  | "form.submit"
  | "form.submit_success"
  | "form.submit_error"
  | "form.validation_failed"
  | "form.reset"
  | "form.formdata"
  | "step.enter"
  | "step.leave"
  | "step.completed"
  | "step.validation_failed"
  | "section.enter"
  | "section.leave"
  | "section.change"
  | "group.enter"
  | "group.leave"
  | "group.change"
  | "field.change"
  | "field.input"
  | "field.focus"
  | "field.blur"
  | "field.invalid"
  | "field.key_down"
  | "field.key_up"
  | "component.click"
  | "button.click"
  | "component.double_click"
  | "component.pointer_down"
  | "component.pointer_up"
  | "component.key_down"
  | "component.key_up"
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
  | "select.opened"
  | "select.closed"
  | "input.change"
  | "input.textChange"
  | "input.before_input"
  | "input.composition_start"
  | "input.composition_update"
  | "input.composition_end"
  | "signature.change"
  | "signature.attested"
  | "signature.cleared"
  | "repeatableGroup.change"
  | "repeatableGroup.item_added"
  | "repeatableGroup.item_removed"
  | "repeatableGroup.item_moved"
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

export type RuntimeConditionOperator = "equals" | "not_equals" | "contains" | "exists";

export type RuntimeConditionSource =
  | {
      kind: "field_value";
      fieldId: string;
    }
  | {
      kind: "event_payload";
      path: string;
    };

export interface RuntimeConditionDefinition {
  id: string;
  label?: string | null;
  enabled: boolean;
  source: RuntimeConditionSource;
  operator: RuntimeConditionOperator;
  expectedValue?: unknown;
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
  eventSourceNodeId?: string | null;
  eventSourceNodeType?: RuntimeNodeType | null;
  eventSourceLabel?: string | null;
  targetNodeId?: string | null;
  targetNodeType?: RuntimeNodeType | null;
  wiringMode?: RuntimeListenerWiringMode;
  useCapture?: boolean;
  priority?: number;
  /** @deprecated use type */
  eventName: string;
  /** @deprecated use dispatcherId */
  sourceNodeId?: string | null;
  enabled: boolean;
  conditions: RuntimeConditionDefinition[];
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
  nodeKey?: string | null;
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
  source: RuntimeEventTarget;
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
  payloadShape?: RuntimePayloadShape | null;
}

const interactiveFieldSemanticTypes = [
  "text",
  "textarea",
  "select",
  "radio",
  "checkbox",
  "date",
  "number",
  "phone",
  "email",
  "signature_attestation",
  "repeatable_group",
];

const textInputSemanticTypes = ["text", "textarea"];
const valueInputSemanticTypes = ["text", "textarea", "date", "number", "phone", "email"];

function runtimePayloadField(
  name: string,
  label: string,
  valueType: RuntimeValueType,
  required = false,
  description?: string,
): RuntimePayloadField {
  return {
    name,
    label,
    valueType,
    required,
    description: description ?? null,
  };
}

function runtimePayloadShape(
  fields: RuntimePayloadField[],
  example: Record<string, unknown> = {},
  notes: string[] = [],
): RuntimePayloadShape {
  return {
    mode: "key_value",
    fields,
    example,
    notes,
  };
}

const nodeIdentityPayloadFields = [
  runtimePayloadField("nodeId", "Node id", "string", true, "Immutable runtime node id."),
  runtimePayloadField("nodeKey", "Node behavior key", "string", false, "Readable dispatch key when available."),
  runtimePayloadField("nodeType", "Node type", "string", true, "Runtime dispatcher type."),
];

const formIdentityPayloadFields = [
  runtimePayloadField("formId", "Form id", "string", true, "Runtime form/document id."),
  runtimePayloadField("formTitle", "Form title", "string", false, "Current form title."),
  runtimePayloadField("projectId", "Project id", "string", false, "Authoring project id when available."),
];

const fieldIdentityPayloadFields = [
  runtimePayloadField("fieldId", "Field id", "string", true, "Runtime field id."),
  runtimePayloadField("fieldKey", "Field behavior key", "string", false, "Readable field dispatch key when available."),
];

const keyEventPayloadFields = [
  runtimePayloadField("key", "Key", "string", false, "Keyboard key value."),
  runtimePayloadField("code", "Code", "string", false, "Physical key code."),
  runtimePayloadField("altKey", "Alt pressed", "boolean", false, "Whether Alt was pressed."),
  runtimePayloadField("ctrlKey", "Control pressed", "boolean", false, "Whether Control was pressed."),
  runtimePayloadField("metaKey", "Meta pressed", "boolean", false, "Whether Meta/Command was pressed."),
  runtimePayloadField("shiftKey", "Shift pressed", "boolean", false, "Whether Shift was pressed."),
];

const pointerEventPayloadFields = [
  runtimePayloadField("pointerId", "Pointer id", "number", false, "Pointer identifier when available."),
  runtimePayloadField("pointerType", "Pointer type", "string", false, "Mouse, pen, touch, or host-supplied pointer type."),
  runtimePayloadField("x", "X position", "number", false, "Viewport x position when available."),
  runtimePayloadField("y", "Y position", "number", false, "Viewport y position when available."),
];

export const runtimeCoreEventTypes: RuntimeCoreEventTypeDefinition[] = [
  {
    type: "component.mount",
    label: "Component mounted",
    dispatcherTypes: ["form", "step", "section", "group", "field", "component"],
    bubbles: false,
  },
  {
    type: "component.unmount",
    label: "Component unmounted",
    dispatcherTypes: ["form", "step", "section", "group", "field", "component"],
    bubbles: false,
  },
  {
    type: "component.show",
    label: "Component shown",
    dispatcherTypes: ["section", "group", "field", "component"],
    bubbles: true,
  },
  {
    type: "component.hide",
    label: "Component hidden",
    dispatcherTypes: ["section", "group", "field", "component"],
    bubbles: true,
  },
  { type: "component.enable", label: "Component enabled", dispatcherTypes: ["field", "component"], bubbles: true },
  { type: "component.disable", label: "Component disabled", dispatcherTypes: ["field", "component"], bubbles: true },
  {
    type: "state.change",
    label: "State changed",
    dispatcherTypes: ["form", "step", "section", "group", "field", "component"],
    bubbles: true,
  },
  {
    type: "form.load",
    label: "Form loaded",
    dispatcherTypes: ["form"],
    bubbles: false,
    payloadShape: runtimePayloadShape(formIdentityPayloadFields),
  },
  {
    type: "form.submit",
    label: "Form submitted",
    dispatcherTypes: ["form"],
    bubbles: false,
    payloadShape: runtimePayloadShape([
      ...formIdentityPayloadFields,
      runtimePayloadField("submit", "Submit payload", "object", false, "Prepared submit payload."),
      runtimePayloadField("validation", "Validation state", "object", false, "Validation summary at submit time."),
      runtimePayloadField("correlationId", "Correlation id", "string", false, "Runtime correlation id."),
    ]),
  },
  {
    type: "form.submit_success",
    label: "Submit succeeded",
    dispatcherTypes: ["form"],
    bubbles: false,
    payloadShape: runtimePayloadShape([
      ...formIdentityPayloadFields,
      runtimePayloadField("message", "Message", "string", false, "Host success message."),
      runtimePayloadField("submissionId", "Submission id", "string", false, "Host submission identifier."),
    ]),
  },
  {
    type: "form.submit_error",
    label: "Submit failed",
    dispatcherTypes: ["form"],
    bubbles: false,
    payloadShape: runtimePayloadShape([
      ...formIdentityPayloadFields,
      runtimePayloadField("message", "Message", "string", false, "Host error message."),
      runtimePayloadField("fieldErrors", "Field errors", "object", false, "Field-level host errors."),
    ]),
  },
  {
    type: "form.validation_failed",
    label: "Validation failed",
    dispatcherTypes: ["form"],
    bubbles: false,
    payloadShape: runtimePayloadShape([
      ...formIdentityPayloadFields,
      runtimePayloadField("errors", "Validation errors", "array", false, "Blocked validation errors."),
      runtimePayloadField("blockedStepId", "Blocked step id", "string", false, "Step that blocked navigation or submit."),
    ]),
  },
  {
    type: "form.reset",
    label: "Form reset",
    dispatcherTypes: ["form"],
    bubbles: false,
    payloadShape: runtimePayloadShape([
      ...formIdentityPayloadFields,
      runtimePayloadField("source", "Reset source", "string", false, "Runtime or host reset origin."),
    ]),
  },
  {
    type: "form.formdata",
    label: "Form data prepared",
    dispatcherTypes: ["form"],
    bubbles: false,
    payloadShape: runtimePayloadShape([
      ...formIdentityPayloadFields,
      runtimePayloadField("formData", "Form data", "object", false, "Prepared form data snapshot."),
    ]),
  },
  {
    type: "step.enter",
    label: "Step entered",
    dispatcherTypes: ["step"],
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...nodeIdentityPayloadFields,
      runtimePayloadField("stepTitle", "Step title", "string", false, "Current step title."),
    ]),
  },
  {
    type: "step.leave",
    label: "Step left",
    dispatcherTypes: ["step"],
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...nodeIdentityPayloadFields,
      runtimePayloadField("stepTitle", "Step title", "string", false, "Current step title."),
    ]),
  },
  {
    type: "step.completed",
    label: "Step completed",
    dispatcherTypes: ["step"],
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...nodeIdentityPayloadFields,
      runtimePayloadField("stepTitle", "Step title", "string", false, "Current step title."),
    ]),
  },
  {
    type: "step.validation_failed",
    label: "Step validation failed",
    dispatcherTypes: ["step"],
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...nodeIdentityPayloadFields,
      runtimePayloadField("errors", "Validation errors", "array", false, "Step validation errors."),
    ]),
  },
  {
    type: "section.enter",
    label: "Section entered",
    dispatcherTypes: ["section"],
    bubbles: true,
    payloadShape: runtimePayloadShape(nodeIdentityPayloadFields),
  },
  {
    type: "section.leave",
    label: "Section left",
    dispatcherTypes: ["section"],
    bubbles: true,
    payloadShape: runtimePayloadShape(nodeIdentityPayloadFields),
  },
  {
    type: "section.change",
    label: "Section changed",
    dispatcherTypes: ["section"],
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...nodeIdentityPayloadFields,
      runtimePayloadField("changedNodeId", "Changed child id", "string", false, "Child node that changed."),
    ]),
  },
  {
    type: "group.enter",
    label: "Group entered",
    dispatcherTypes: ["group"],
    bubbles: true,
    payloadShape: runtimePayloadShape(nodeIdentityPayloadFields),
  },
  {
    type: "group.leave",
    label: "Group left",
    dispatcherTypes: ["group"],
    bubbles: true,
    payloadShape: runtimePayloadShape(nodeIdentityPayloadFields),
  },
  {
    type: "group.change",
    label: "Group changed",
    dispatcherTypes: ["group"],
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...nodeIdentityPayloadFields,
      runtimePayloadField("changedNodeId", "Changed child id", "string", false, "Child node that changed."),
    ]),
  },
  {
    type: "component.click",
    label: "Component clicked",
    dispatcherTypes: ["component"],
    bubbles: true,
    payloadShape: runtimePayloadShape([
      runtimePayloadField("componentId", "Component id", "string", true, "Runtime component id."),
      runtimePayloadField("componentKey", "Component behavior key", "string", false, "Readable component dispatch key."),
      runtimePayloadField("label", "Label", "string", false, "Component label."),
    ]),
  },
  {
    type: "button.click",
    label: "Button clicked",
    dispatcherTypes: ["component"],
    bubbles: true,
    payloadShape: runtimePayloadShape([
      runtimePayloadField("componentId", "Component id", "string", true, "Runtime component id."),
      runtimePayloadField("componentKey", "Component behavior key", "string", false, "Readable component dispatch key."),
      runtimePayloadField("label", "Label", "string", false, "Button label."),
      runtimePayloadField("buttonAction", "Button action", "string", false, "Configured button action."),
    ]),
  },
  {
    type: "component.double_click",
    label: "Component double-clicked",
    dispatcherTypes: ["component"],
    bubbles: true,
    payloadShape: runtimePayloadShape([
      runtimePayloadField("componentId", "Component id", "string", true, "Runtime component id."),
      runtimePayloadField("label", "Label", "string", false, "Component label."),
      ...pointerEventPayloadFields,
    ]),
  },
  {
    type: "component.pointer_down",
    label: "Component pointer pressed",
    dispatcherTypes: ["component"],
    bubbles: true,
    payloadShape: runtimePayloadShape([
      runtimePayloadField("componentId", "Component id", "string", true, "Runtime component id."),
      ...pointerEventPayloadFields,
    ]),
  },
  {
    type: "component.pointer_up",
    label: "Component pointer released",
    dispatcherTypes: ["component"],
    bubbles: true,
    payloadShape: runtimePayloadShape([
      runtimePayloadField("componentId", "Component id", "string", true, "Runtime component id."),
      ...pointerEventPayloadFields,
    ]),
  },
  {
    type: "component.key_down",
    label: "Component key pressed",
    dispatcherTypes: ["component"],
    bubbles: true,
    payloadShape: runtimePayloadShape([
      runtimePayloadField("componentId", "Component id", "string", true, "Runtime component id."),
      ...keyEventPayloadFields,
    ]),
  },
  {
    type: "component.key_up",
    label: "Component key released",
    dispatcherTypes: ["component"],
    bubbles: true,
    payloadShape: runtimePayloadShape([
      runtimePayloadField("componentId", "Component id", "string", true, "Runtime component id."),
      ...keyEventPayloadFields,
    ]),
  },
  {
    type: "field.input",
    label: "Field input received",
    dispatcherTypes: ["field"],
    semanticTypes: interactiveFieldSemanticTypes,
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...fieldIdentityPayloadFields,
      runtimePayloadField("value", "Value", "unknown", false, "Current field value."),
      runtimePayloadField("nextValue", "Next value", "unknown", false, "Incoming value from the control."),
    ]),
  },
  {
    type: "field.change",
    label: "Field changed",
    dispatcherTypes: ["field"],
    semanticTypes: interactiveFieldSemanticTypes,
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...fieldIdentityPayloadFields,
      runtimePayloadField("value", "Value", "unknown", false, "Previous or current field value."),
      runtimePayloadField("nextValue", "Next value", "unknown", false, "New field value."),
    ]),
  },
  {
    type: "field.focus",
    label: "Field focused",
    dispatcherTypes: ["field"],
    semanticTypes: interactiveFieldSemanticTypes,
    bubbles: true,
    payloadShape: runtimePayloadShape(fieldIdentityPayloadFields),
  },
  {
    type: "field.blur",
    label: "Field blurred",
    dispatcherTypes: ["field"],
    semanticTypes: interactiveFieldSemanticTypes,
    bubbles: true,
    payloadShape: runtimePayloadShape(fieldIdentityPayloadFields),
  },
  {
    type: "field.invalid",
    label: "Field invalid",
    dispatcherTypes: ["field"],
    semanticTypes: interactiveFieldSemanticTypes,
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...fieldIdentityPayloadFields,
      runtimePayloadField("message", "Validation message", "string", false, "Validation message."),
    ]),
  },
  {
    type: "field.key_down",
    label: "Field key pressed",
    dispatcherTypes: ["field"],
    semanticTypes: interactiveFieldSemanticTypes,
    bubbles: true,
    payloadShape: runtimePayloadShape([...fieldIdentityPayloadFields, ...keyEventPayloadFields]),
  },
  {
    type: "field.key_up",
    label: "Field key released",
    dispatcherTypes: ["field"],
    semanticTypes: interactiveFieldSemanticTypes,
    bubbles: true,
    payloadShape: runtimePayloadShape([...fieldIdentityPayloadFields, ...keyEventPayloadFields]),
  },
  {
    type: "checkboxGroup.change",
    label: "Checkbox group changed",
    dispatcherTypes: ["field"],
    semanticTypes: ["checkbox"],
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...fieldIdentityPayloadFields,
      runtimePayloadField("selectedValues", "Selected values", "array", true, "All selected checkbox values."),
      runtimePayloadField("selectionMode", "Selection mode", "string", false, "Expected to be multi."),
      runtimePayloadField("changedOption", "Changed option", "string", false, "Option that changed when known."),
    ]),
  },
  {
    type: "checkbox.change",
    label: "Checkbox changed",
    dispatcherTypes: ["field"],
    semanticTypes: ["checkbox"],
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...fieldIdentityPayloadFields,
      runtimePayloadField("optionValue", "Option value", "string", true, "Checkbox option value."),
      runtimePayloadField("checked", "Checked", "boolean", true, "Whether the option is now checked."),
    ]),
  },
  {
    type: "checkbox.checked",
    label: "Checkbox checked",
    dispatcherTypes: ["field"],
    semanticTypes: ["checkbox"],
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...fieldIdentityPayloadFields,
      runtimePayloadField("optionValue", "Option value", "string", true, "Checked option value."),
      runtimePayloadField("checked", "Checked", "boolean", true, "Expected to be true."),
    ]),
  },
  {
    type: "checkbox.unchecked",
    label: "Checkbox unchecked",
    dispatcherTypes: ["field"],
    semanticTypes: ["checkbox"],
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...fieldIdentityPayloadFields,
      runtimePayloadField("optionValue", "Option value", "string", true, "Unchecked option value."),
      runtimePayloadField("checked", "Checked", "boolean", true, "Expected to be false."),
    ]),
  },
  {
    type: "radio.change",
    label: "Radio selection changed",
    dispatcherTypes: ["field"],
    semanticTypes: ["radio"],
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...fieldIdentityPayloadFields,
      runtimePayloadField("selectedValue", "Selected value", "string", true, "Selected radio option value."),
      runtimePayloadField("changedOption", "Changed option", "string", false, "Option that changed when known."),
    ]),
  },
  {
    type: "radio.selected",
    label: "Radio option selected",
    dispatcherTypes: ["field"],
    semanticTypes: ["radio"],
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...fieldIdentityPayloadFields,
      runtimePayloadField("selectedValue", "Selected value", "string", true, "Selected radio option value."),
    ]),
  },
  {
    type: "radio.cleared",
    label: "Radio selection cleared",
    dispatcherTypes: ["field"],
    semanticTypes: ["radio"],
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...fieldIdentityPayloadFields,
      runtimePayloadField("previousValue", "Previous value", "string", false, "Previously selected radio value."),
    ]),
  },
  {
    type: "select.change",
    label: "Select changed",
    dispatcherTypes: ["field"],
    semanticTypes: ["select"],
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...fieldIdentityPayloadFields,
      runtimePayloadField("selectedValue", "Selected value", "string", true, "Selected option value."),
      runtimePayloadField("changedOption", "Changed option", "string", false, "Option that changed when known."),
    ]),
  },
  {
    type: "select.selected",
    label: "Select option selected",
    dispatcherTypes: ["field"],
    semanticTypes: ["select"],
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...fieldIdentityPayloadFields,
      runtimePayloadField("selectedValue", "Selected value", "string", true, "Selected option value."),
    ]),
  },
  {
    type: "select.cleared",
    label: "Select cleared",
    dispatcherTypes: ["field"],
    semanticTypes: ["select"],
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...fieldIdentityPayloadFields,
      runtimePayloadField("previousValue", "Previous value", "string", false, "Previously selected value."),
    ]),
  },
  {
    type: "select.opened",
    label: "Select opened",
    dispatcherTypes: ["field"],
    semanticTypes: ["select"],
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...fieldIdentityPayloadFields,
      runtimePayloadField("optionCount", "Option count", "number", false, "Available option count."),
    ]),
  },
  {
    type: "select.closed",
    label: "Select closed",
    dispatcherTypes: ["field"],
    semanticTypes: ["select"],
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...fieldIdentityPayloadFields,
      runtimePayloadField("selectedValue", "Selected value", "string", false, "Final selected value."),
    ]),
  },
  {
    type: "input.change",
    label: "Input changed",
    dispatcherTypes: ["field"],
    semanticTypes: valueInputSemanticTypes,
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...fieldIdentityPayloadFields,
      runtimePayloadField("value", "Value", "unknown", false, "Previous or current input value."),
      runtimePayloadField("nextValue", "Next value", "unknown", false, "New input value."),
    ]),
  },
  {
    type: "input.textChange",
    label: "Input text changed",
    dispatcherTypes: ["field"],
    semanticTypes: textInputSemanticTypes,
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...fieldIdentityPayloadFields,
      runtimePayloadField("value", "Value", "string", false, "Previous or current text value."),
      runtimePayloadField("nextValue", "Next value", "string", false, "New text value."),
    ]),
  },
  {
    type: "input.before_input",
    label: "Input before value changes",
    dispatcherTypes: ["field"],
    semanticTypes: textInputSemanticTypes,
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...fieldIdentityPayloadFields,
      runtimePayloadField("inputType", "Input type", "string", false, "Browser beforeinput inputType."),
      runtimePayloadField("data", "Input data", "string", false, "Incoming text data when available."),
    ]),
  },
  {
    type: "input.composition_start",
    label: "Input composition started",
    dispatcherTypes: ["field"],
    semanticTypes: textInputSemanticTypes,
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...fieldIdentityPayloadFields,
      runtimePayloadField("data", "Composition data", "string", false, "Composition text when available."),
    ]),
  },
  {
    type: "input.composition_update",
    label: "Input composition updated",
    dispatcherTypes: ["field"],
    semanticTypes: textInputSemanticTypes,
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...fieldIdentityPayloadFields,
      runtimePayloadField("data", "Composition data", "string", false, "Composition text when available."),
    ]),
  },
  {
    type: "input.composition_end",
    label: "Input composition ended",
    dispatcherTypes: ["field"],
    semanticTypes: textInputSemanticTypes,
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...fieldIdentityPayloadFields,
      runtimePayloadField("data", "Composition data", "string", false, "Final composition text when available."),
    ]),
  },
  {
    type: "signature.change",
    label: "Signature changed",
    dispatcherTypes: ["field"],
    semanticTypes: ["signature_attestation"],
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...fieldIdentityPayloadFields,
      runtimePayloadField("attested", "Attested", "boolean", false, "Current signature attestation state."),
    ]),
  },
  {
    type: "signature.attested",
    label: "Signature attested",
    dispatcherTypes: ["field"],
    semanticTypes: ["signature_attestation"],
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...fieldIdentityPayloadFields,
      runtimePayloadField("attested", "Attested", "boolean", true, "Expected to be true."),
    ]),
  },
  {
    type: "signature.cleared",
    label: "Signature cleared",
    dispatcherTypes: ["field"],
    semanticTypes: ["signature_attestation"],
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...fieldIdentityPayloadFields,
      runtimePayloadField("attested", "Attested", "boolean", true, "Expected to be false."),
    ]),
  },
  {
    type: "repeatableGroup.change",
    label: "Repeatable group changed",
    dispatcherTypes: ["field"],
    semanticTypes: ["repeatable_group"],
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...fieldIdentityPayloadFields,
      runtimePayloadField("itemCount", "Item count", "number", false, "Current repeated item count."),
    ]),
  },
  {
    type: "repeatableGroup.item_added",
    label: "Repeatable group item added",
    dispatcherTypes: ["field"],
    semanticTypes: ["repeatable_group"],
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...fieldIdentityPayloadFields,
      runtimePayloadField("itemId", "Item id", "string", false, "Added item id."),
      runtimePayloadField("itemIndex", "Item index", "number", false, "Added item index."),
    ]),
  },
  {
    type: "repeatableGroup.item_removed",
    label: "Repeatable group item removed",
    dispatcherTypes: ["field"],
    semanticTypes: ["repeatable_group"],
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...fieldIdentityPayloadFields,
      runtimePayloadField("itemId", "Item id", "string", false, "Removed item id."),
      runtimePayloadField("itemIndex", "Item index", "number", false, "Removed item index."),
    ]),
  },
  {
    type: "repeatableGroup.item_moved",
    label: "Repeatable group item moved",
    dispatcherTypes: ["field"],
    semanticTypes: ["repeatable_group"],
    bubbles: true,
    payloadShape: runtimePayloadShape([
      ...fieldIdentityPayloadFields,
      runtimePayloadField("itemId", "Item id", "string", false, "Moved item id."),
      runtimePayloadField("fromIndex", "From index", "number", false, "Previous item index."),
      runtimePayloadField("toIndex", "To index", "number", false, "New item index."),
    ]),
  },
  {
    type: "host.context_updated",
    label: "Host context updated",
    dispatcherTypes: ["form"],
    bubbles: false,
    payloadShape: runtimePayloadShape([
      runtimePayloadField("context", "Host context", "object", true, "Host context update payload."),
    ]),
  },
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
