import type {
  AuthoringDocument,
  AuthoringField,
  AuthoringGroup,
  AuthoringSection,
  AuthoringStep,
  RuntimeListenerDefinition,
  RuntimeNodeBehavior,
  RuntimeNodeType,
} from "@form-builder/schema";

export interface IndexedRuntimeNode {
  id: string;
  nodeType: RuntimeNodeType;
  parentId?: string | null;
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

export interface IndexedRuntimeListener {
  listener: RuntimeListenerDefinition;
  dispatcherId: string;
  dispatcherType: RuntimeNodeType;
  order: number;
}

export interface RuntimeDocumentIndex {
  documentId: string;
  stepOrder: string[];
  nodes: Map<string, IndexedRuntimeNode>;
  listeners: IndexedRuntimeListener[];
}

export function createRuntimeDocumentIndex(document: AuthoringDocument): RuntimeDocumentIndex {
  const nodes = new Map<string, IndexedRuntimeNode>();
  const listeners: IndexedRuntimeListener[] = [];
  const stepOrder: string[] = [];
  let listenerOrder = 0;

  const pushListeners = (
    runtime: RuntimeNodeBehavior | null | undefined,
    dispatcherId: string,
    dispatcherType: RuntimeNodeType,
  ): void => {
    if (!runtime?.listeners?.length) {
      return;
    }
    for (const listener of runtime.listeners) {
      listeners.push({
        listener,
        dispatcherId: listener.dispatcherId ?? listener.sourceNodeId ?? dispatcherId,
        dispatcherType: listener.dispatcherType ?? dispatcherType,
        order: listenerOrder,
      });
      listenerOrder += 1;
    }
  };

  nodes.set(document.id, {
    id: document.id,
    nodeType: "form",
    parentId: null,
    runtime: document.runtime
      ? { eventSources: document.runtime.formEvents, listeners: document.runtime.formListeners }
      : null,
  });

  for (const step of document.steps) {
    stepOrder.push(step.id);
    nodes.set(step.id, {
      id: step.id,
      nodeType: "step",
      parentId: document.id,
      stepId: step.id,
      step,
      runtime: step.runtime,
    });
    pushListeners(step.runtime, step.id, "step");

    for (const section of step.sections) {
      nodes.set(section.id, {
        id: section.id,
        nodeType: "section",
        parentId: step.id,
        stepId: step.id,
        sectionId: section.id,
        step,
        section,
        runtime: section.runtime,
      });
      pushListeners(section.runtime, section.id, "section");

      for (const field of section.fields) {
        listenerOrder = indexField(nodes, listeners, listenerOrder, step, section, undefined, field);
      }

      for (const group of section.groups) {
        nodes.set(group.id, {
          id: group.id,
          nodeType: "group",
          parentId: section.id,
          stepId: step.id,
          sectionId: section.id,
          groupId: group.id,
          step,
          section,
          group,
          runtime: group.runtime,
        });
        pushListeners(group.runtime, group.id, "group");

        for (const field of group.fields) {
          listenerOrder = indexField(nodes, listeners, listenerOrder, step, section, group, field);
        }
      }
    }
  }

  if (document.runtime?.formListeners?.length) {
    pushListeners(
      { eventSources: document.runtime.formEvents, listeners: document.runtime.formListeners },
      document.id,
      "form",
    );
  }

  return {
    documentId: document.id,
    stepOrder,
    nodes,
    listeners,
  };
}

function indexField(
  nodes: Map<string, IndexedRuntimeNode>,
  listeners: IndexedRuntimeListener[],
  listenerOrder: number,
  step: AuthoringStep,
  section: AuthoringSection,
  group: AuthoringGroup | undefined,
  field: AuthoringField,
): number {
  const isComponent = field.rendererHints.component === "button";
  const implicitButtonListener =
    isComponent && !field.runtime?.listeners?.length
      ? createImplicitButtonListener(field.id, field.rendererHints.action, field.rendererHints.eventName)
      : null;
  nodes.set(field.id, {
    id: field.id,
    nodeType: isComponent ? "component" : "field",
    parentId: group?.id ?? section.id,
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
    for (const listener of field.runtime.listeners) {
      listeners.push({
        listener,
        dispatcherId: listener.dispatcherId ?? listener.sourceNodeId ?? field.id,
        dispatcherType: listener.dispatcherType ?? (isComponent ? "component" : "field"),
        order: listenerOrder,
      });
      listenerOrder += 1;
    }
  }
  if (implicitButtonListener) {
    listeners.push({
      listener: implicitButtonListener,
      dispatcherId: field.id,
      dispatcherType: "component",
      order: listenerOrder,
    });
    listenerOrder += 1;
  }

  return listenerOrder;
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
          ? "dispatch_event"
          : "go_to_next_step";

  return {
    id: `implicit_button_listener_${fieldId}`,
    label: "Implicit button listener",
    type: "component.click",
    dispatcherId: fieldId,
    dispatcherType: "component",
    useCapture: false,
    priority: 0,
    eventName: "component.click",
    sourceNodeId: fieldId,
    enabled: true,
    conditions: [],
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
          actionKind === "dispatch_event"
            ? {
                eventType: customEventName || "custom.event",
                bubbles: true,
                payload: {},
              }
            : {},
        continueOnError: false,
      },
    ],
  };
}
