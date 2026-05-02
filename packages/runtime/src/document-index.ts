import type {
  AuthoringDocument,
  AuthoringField,
  AuthoringGroup,
  AuthoringSection,
  AuthoringStep,
  ConditionalRule,
  RuntimeListenerDefinition,
  RuntimeNodeBehavior,
  RuntimeNodeType,
} from "@form-builder/schema";

export interface IndexedRuntimeNode {
  id: string;
  nodeType: RuntimeNodeType;
  stepId?: string;
  sectionId?: string;
  groupId?: string;
  fieldId?: string;
  step?: AuthoringStep;
  section?: AuthoringSection;
  group?: AuthoringGroup;
  field?: AuthoringField;
  runtime?: RuntimeNodeBehavior | null;
}

export interface IndexedConditionalRule {
  nodeId: string;
  rule: ConditionalRule;
}

export interface RuntimeDocumentIndex {
  documentId: string;
  stepOrder: string[];
  nodes: Map<string, IndexedRuntimeNode>;
  listeners: RuntimeListenerDefinition[];
  conditionalRules: Map<string, IndexedConditionalRule>;
}

export function createRuntimeDocumentIndex(document: AuthoringDocument): RuntimeDocumentIndex {
  const nodes = new Map<string, IndexedRuntimeNode>();
  const listeners: RuntimeListenerDefinition[] = [];
  const conditionalRules = new Map<string, IndexedConditionalRule>();
  const stepOrder: string[] = [];

  const pushListeners = (runtime?: RuntimeNodeBehavior | null): void => {
    if (!runtime?.listeners?.length) {
      return;
    }
    listeners.push(...runtime.listeners);
  };

  for (const step of document.steps) {
    stepOrder.push(step.id);
    nodes.set(step.id, {
      id: step.id,
      nodeType: "step",
      stepId: step.id,
      step,
      runtime: step.runtime,
    });
    pushListeners(step.runtime);

    for (const section of step.sections) {
      nodes.set(section.id, {
        id: section.id,
        nodeType: "section",
        stepId: step.id,
        sectionId: section.id,
        step,
        section,
        runtime: section.runtime,
      });
      pushListeners(section.runtime);

      for (const field of section.fields) {
        indexField(nodes, listeners, conditionalRules, step, section, undefined, field);
      }

      for (const group of section.groups) {
        nodes.set(group.id, {
          id: group.id,
          nodeType: "group",
          stepId: step.id,
          sectionId: section.id,
          groupId: group.id,
          step,
          section,
          group,
          runtime: group.runtime,
        });
        pushListeners(group.runtime);

        for (const field of group.fields) {
          indexField(nodes, listeners, conditionalRules, step, section, group, field);
        }
      }
    }
  }

  if (document.runtime?.formListeners?.length) {
    listeners.push(...document.runtime.formListeners);
  }

  nodes.set(document.id, {
    id: document.id,
    nodeType: "form",
    runtime: document.runtime ? { eventSources: document.runtime.formEvents, listeners: document.runtime.formListeners } : null,
  });

  return {
    documentId: document.id,
    stepOrder,
    nodes,
    listeners,
    conditionalRules,
  };
}

function indexField(
  nodes: Map<string, IndexedRuntimeNode>,
  listeners: RuntimeListenerDefinition[],
  conditionalRules: Map<string, IndexedConditionalRule>,
  step: AuthoringStep,
  section: AuthoringSection,
  group: AuthoringGroup | undefined,
  field: AuthoringField,
): void {
  const isComponent = field.rendererHints.component === "button";
  const implicitButtonListener =
    isComponent && !field.runtime?.listeners?.length
      ? createImplicitButtonListener(field.id, field.rendererHints.action, field.rendererHints.eventName)
      : null;
  nodes.set(field.id, {
    id: field.id,
    nodeType: isComponent ? "component" : "field",
    stepId: step.id,
    sectionId: section.id,
    groupId: group?.id,
    fieldId: field.id,
    step,
    section,
    group,
    field,
    runtime: field.runtime,
  });

  if (field.runtime?.listeners?.length) {
    listeners.push(...field.runtime.listeners);
  }
  if (implicitButtonListener) {
    listeners.push(implicitButtonListener);
  }

  for (const rule of field.conditionals) {
    conditionalRules.set(rule.ruleId, { nodeId: field.id, rule });
  }
}

function createImplicitButtonListener(
  fieldId: string,
  actionName?: string,
  customEventName?: string,
): RuntimeListenerDefinition | null {
  const actionKind =
    actionName === "previous_step"
      ? "go_to_previous_step"
      : actionName === "submit"
        ? "submit_form"
        : actionName === "custom_event"
          ? "emit_event"
          : "go_to_next_step";

  return {
    id: `implicit_button_listener_${fieldId}`,
    label: "Implicit button listener",
    eventName: "component.click",
    sourceNodeId: fieldId,
    enabled: true,
    ruleGuards: [],
    actions: [
      {
        id: `implicit_button_action_${fieldId}`,
        label: "Implicit button action",
        kind: actionKind,
        target: {
          nodeId: fieldId,
          nodeType: "component",
        },
        config:
          actionKind === "emit_event"
            ? {
                eventName: customEventName || "custom.event",
                payload: {},
              }
            : {},
        continueOnError: false,
      },
    ],
  };
}
