import { runtimeCoreEventType } from "@form-builder/schema";
import type {
  AuthoringDocument,
  ConditionalRule,
  RuntimeActionDefinition,
  RuntimeEventEnvelope,
  RuntimeEventPhase,
  RuntimeEventTarget,
  RuntimeHostContext,
  RuntimeListenerDefinition,
  RuntimeNodeType,
  RuntimeSessionState,
  RuntimeSubmitPayload,
  RuntimeValidationState,
} from "@form-builder/schema";

import {
  createRuntimeDocumentIndex,
  type IndexedRuntimeListener,
  type RuntimeDocumentIndex,
} from "./document-index";
import { RuntimeEventBus } from "./event-bus";
import { createInitialSessionState, mergeSessionState } from "./session-state";
import type {
  RuntimeEngine,
  RuntimeEngineMountOptions,
  RuntimeTraceEntry,
} from "./types";
import { validateRuntimeDocument } from "./validation";

const RUNTIME_VERSION = "1.0";
const runtimePayloadReferenceKeys = [
  "current.field.id",
  "current.field.key",
  "current.step.id",
  "current.step.title",
  "current.form.id",
  "current.form.title",
  "current.project.id",
  "current.source.node.id",
  "current.source.node.type",
  "current.event.type",
  "current.event.target.id",
  "current.event.target.type",
  "current.event.currentTarget.id",
  "current.event.currentTarget.type",
  "current.event.phase",
  "current.runtime.value",
] as const;

type RuntimePayloadReferenceKey = (typeof runtimePayloadReferenceKeys)[number];

export function createRuntimeEngine(): RuntimeEngine {
  const eventBus = new RuntimeEventBus();
  let document: AuthoringDocument | null = null;
  let index: RuntimeDocumentIndex | null = null;
  let state: RuntimeSessionState = {
    currentStepId: null,
    values: {},
    nodes: {},
    validation: { valid: true, errors: [], warnings: [] },
    submit: { status: "idle", lastCorrelationId: null, message: null, fieldErrors: null },
    hostContextSnapshot: null,
  };
  let hostContext: RuntimeHostContext | null = null;
  let runtimeId = "runtime_unmounted";
  let projectId: string | null = null;
  let mounted = false;
  let clock = () => new Date();
  let randomId: () => string = () => crypto.randomUUID();
  const trace: RuntimeTraceEntry[] = [];

  const buildEvent = (
    type: string,
    payload: Record<string, unknown>,
    _direction: RuntimeTraceEntry["direction"],
    source?: { nodeId?: string | null; nodeType?: RuntimeNodeType | null; correlationId?: string | null; bubbles?: boolean | null },
  ): RuntimeEventEnvelope => {
    if (!document) {
      throw new Error("Runtime engine is not mounted.");
    }
    const target = {
      runtimeId,
      formId: document.id,
      projectId,
      nodeId: source?.nodeId ?? null,
      nodeType: source?.nodeType ?? null,
    };
    const bubbles = typeof source?.bubbles === "boolean" ? source.bubbles : defaultEventBubbles(type);
    return {
      type,
      version: RUNTIME_VERSION,
      target,
      currentTarget: target,
      eventPhase: "target",
      bubbles,
      source: target,
      payload,
      correlationId: source?.correlationId ?? randomId(),
      timestamp: clock().toISOString(),
    };
  };

  const transitionToStep = (stepId: string, reason: string, originatingEvent: RuntimeEventEnvelope): void => {
    if (!document || !index) {
      return;
    }
    if (!index.stepOrder.includes(stepId)) {
      return;
    }

    const previousStepId = state.currentStepId;
    if (previousStepId === stepId) {
      return;
    }

    if (previousStepId) {
      state = {
        ...state,
        currentStepId: previousStepId,
      };
      routeEvent(
        buildEvent(
          "step.leave",
          { stepId: previousStepId, nextStepId: stepId, reason },
          "internal",
          { nodeId: previousStepId, nodeType: "step", correlationId: originatingEvent.correlationId },
        ),
        true,
        false,
      );
    }

    state = {
      ...state,
      currentStepId: stepId,
    };
    routeEvent(
      buildEvent(
        "step.enter",
        { stepId, previousStepId, reason },
        "internal",
        { nodeId: stepId, nodeType: "step", correlationId: originatingEvent.correlationId },
      ),
      true,
      false,
    );
  };

  const getSubmitPayload = (): RuntimeSubmitPayload => {
    if (!document) {
      throw new Error("Runtime engine is not mounted.");
    }
    return {
      formId: document.id,
      projectId,
      stepId: state.currentStepId,
      values: structuredClone(state.values),
      validation: structuredClone(state.validation),
      hostContext: structuredClone(state.hostContextSnapshot),
    };
  };

  const validate = (): RuntimeValidationState => {
    if (!document || !index) {
      throw new Error("Runtime engine is not mounted.");
    }
    const validation = validateRuntimeDocument(document, index, state.values, state.nodes);
    state = {
      ...state,
      validation,
    };
    return structuredClone(validation);
  };

  const evaluateRule = (rule: ConditionalRule): boolean => {
    const value = state.values[rule.whenFieldId];
    switch (rule.operator) {
      case "equals":
        return String(value ?? "") === String(rule.expectedValue ?? "");
      case "not_equals":
        return String(value ?? "") !== String(rule.expectedValue ?? "");
      case "contains":
        if (Array.isArray(value)) {
          return value.some((entry) => String(entry) === String(rule.expectedValue ?? ""));
        }
        return String(value ?? "").includes(String(rule.expectedValue ?? ""));
      case "exists":
        return value !== null && value !== undefined && String(value).trim().length > 0;
      default:
        return true;
    }
  };

  const ruleIsEnabled = (rule: ConditionalRule): boolean => rule.enabled !== false;

  const listenerMatches = (indexedListener: IndexedRuntimeListener, event: RuntimeEventEnvelope): boolean => {
    const listener = indexedListener.listener;
    if (!listener.enabled || listenerEventType(listener) !== event.type) {
      return false;
    }
    if (!index) {
      return false;
    }
    const currentIndex = index;
    return listener.ruleGuards.every((guard) => {
      const conditional = currentIndex.conditionalRules.get(guard.ruleId);
      return conditional ? !ruleIsEnabled(conditional.rule) || evaluateRule(conditional.rule) : true;
    });
  };

  const executeAction = (action: RuntimeActionDefinition, event: RuntimeEventEnvelope): void => {
    if (!document || !index) {
      return;
    }

    try {
      switch (action.kind) {
        case "go_to_next_step": {
          const currentIndex = state.currentStepId ? index.stepOrder.indexOf(state.currentStepId) : -1;
          const nextStepId = index.stepOrder[currentIndex + 1];
          if (nextStepId) {
            transitionToStep(nextStepId, "go_to_next_step", event);
          }
          break;
        }
        case "go_to_previous_step": {
          const currentIndex = state.currentStepId ? index.stepOrder.indexOf(state.currentStepId) : -1;
          const previousStepId = currentIndex > 0 ? index.stepOrder[currentIndex - 1] : null;
          if (previousStepId) {
            transitionToStep(previousStepId, "go_to_previous_step", event);
          }
          break;
        }
        case "go_to_step": {
          const targetStepId =
            typeof action.config.stepId === "string"
              ? action.config.stepId
              : typeof action.target?.nodeId === "string"
                ? action.target.nodeId
                : null;
          if (targetStepId) {
            transitionToStep(targetStepId, "go_to_step", event);
          }
          break;
        }
        case "set_field_value": {
          const targetFieldId =
            typeof action.config.fieldId === "string"
              ? action.config.fieldId
              : typeof action.target?.nodeId === "string"
                ? action.target.nodeId
                : null;
          if (targetFieldId) {
            state = {
              ...state,
              values: {
                ...state.values,
                [targetFieldId]: structuredClone(action.config.value),
              },
            };
          }
          break;
        }
        case "clear_field_value": {
          const targetFieldId =
            typeof action.config.fieldId === "string"
              ? action.config.fieldId
              : typeof action.target?.nodeId === "string"
                ? action.target.nodeId
                : null;
          if (targetFieldId) {
            const nextValues = { ...state.values };
            delete nextValues[targetFieldId];
            state = { ...state, values: nextValues };
          }
          break;
        }
        case "show_node":
        case "hide_node":
        case "enable_node":
        case "disable_node":
        case "mark_required":
        case "mark_optional": {
          const targetNodeId =
            typeof action.target?.nodeId === "string"
              ? action.target.nodeId
              : typeof action.config.nodeId === "string"
                ? action.config.nodeId
                : null;
          if (targetNodeId && state.nodes[targetNodeId]) {
            const currentNodeState = state.nodes[targetNodeId];
            state = {
              ...state,
              nodes: {
                ...state.nodes,
                [targetNodeId]: {
                  ...currentNodeState,
                  visible: action.kind === "show_node" ? true : action.kind === "hide_node" ? false : currentNodeState.visible,
                  enabled: action.kind === "enable_node" ? true : action.kind === "disable_node" ? false : currentNodeState.enabled,
                  required:
                    action.kind === "mark_required"
                      ? true
                      : action.kind === "mark_optional"
                        ? false
                        : currentNodeState.required,
                },
              },
            };
          }
          break;
        }
        case "dispatch_event":
        case "emit_event": {
          const eventType =
            typeof action.config.eventType === "string" && action.config.eventType.trim().length > 0
              ? action.config.eventType
              : typeof action.config.eventName === "string" && action.config.eventName.trim().length > 0
                ? action.config.eventName
              : "custom.event";
          const bubbles = typeof action.config.bubbles === "boolean" ? action.config.bubbles : defaultEventBubbles(eventType);
          const payload = resolveRuntimePayload(isRecord(action.config.payload) ? action.config.payload : {}, event, document, index, state);
          routeEvent(
            buildEvent(eventType, payload, "outbound", {
              nodeId: event.target?.nodeId ?? event.source.nodeId,
              nodeType: event.target?.nodeType ?? event.source.nodeType,
              bubbles,
            }),
            true,
            false,
          );
          break;
        }
        case "host_action": {
          const handlerKey = typeof action.config.handlerKey === "string" ? action.config.handlerKey : null;
          const resolvedPayload = resolveRuntimePayload(
            isRecord(action.config.payload) ? action.config.payload : {},
            event,
            document,
            index,
            state,
          );
          const config = structuredClone(action.config);
          config.payload = resolvedPayload;
          routeEvent(
            buildEvent(
              "host.action_requested",
              {
                handlerKey,
                actionId: action.id,
                target: action.target ?? null,
                config,
              },
              "outbound",
              {
                nodeId: event.target?.nodeId ?? event.source.nodeId,
                nodeType: event.target?.nodeType ?? event.source.nodeType,
              },
            ),
            true,
            false,
          );
          break;
        }
        case "submit_form": {
          const validation = validate();
          if (!validation.valid) {
            state = {
              ...state,
              submit: {
                ...state.submit,
                status: "idle",
                message: "Validation failed.",
                fieldErrors: Object.fromEntries(validation.errors.map((error) => [error.fieldId ?? error.nodeId, error.message])),
              },
            };
            routeEvent(
              buildEvent(
                "form.validation_failed",
                {
                  validation,
                  stepId: state.currentStepId,
                },
                "outbound",
                {
                  nodeId: document.id,
                  nodeType: "form",
                },
              ),
              true,
              false,
            );
            break;
          }

          const submitEvent = buildEvent(
            "form.submit",
            {
              submit: getSubmitPayload(),
            },
            "outbound",
            {
              nodeId: document.id,
              nodeType: "form",
            },
          );
          state = {
            ...state,
            submit: {
              status: "submitting",
              lastCorrelationId: submitEvent.correlationId,
              message: null,
              fieldErrors: null,
            },
          };
          routeEvent(submitEvent, true, false);
          break;
        }
        default:
          break;
      }
    } catch (error) {
      if (!action.continueOnError) {
        throw error;
      }
    }
  };

  const applyInboundState = (event: RuntimeEventEnvelope): void => {
    switch (event.type) {
      case "checkboxGroup.change":
      case "checkbox.change":
      case "checkbox.checked":
      case "checkbox.unchecked":
      case "radio.change":
      case "radio.selected":
      case "radio.cleared":
      case "select.change":
      case "select.selected":
      case "select.cleared":
      case "input.change":
      case "input.textChange":
      case "field.change": {
        const fieldId =
          typeof event.payload.fieldId === "string"
            ? event.payload.fieldId
            : typeof event.target?.nodeId === "string"
              ? event.target.nodeId
              : typeof event.source.nodeId === "string"
                ? event.source.nodeId
              : null;
        if (!fieldId) {
          return;
        }
        const nextValue =
          event.payload.nextValue !== undefined
            ? structuredClone(event.payload.nextValue)
            : structuredClone(event.payload.value);
        state = {
          ...state,
          values: {
            ...state.values,
            [fieldId]: nextValue,
          },
        };
        break;
      }
      case "form.submit_success": {
        state = {
          ...state,
          submit: {
            status: "success",
            lastCorrelationId: event.correlationId,
            message: typeof event.payload.message === "string" ? event.payload.message : "Submit succeeded.",
            fieldErrors: null,
          },
        };
        break;
      }
      case "form.submit_error": {
        state = {
          ...state,
          submit: {
            status: "error",
            lastCorrelationId: event.correlationId,
            message: typeof event.payload.message === "string" ? event.payload.message : "Submit failed.",
            fieldErrors: isStringRecord(event.payload.fieldErrors) ? event.payload.fieldErrors : null,
          },
        };
        break;
      }
      case "host.context_updated": {
        const nextContext = isRecord(event.payload.context) ? event.payload.context : event.payload;
        state = {
          ...state,
          hostContextSnapshot: {
            ...(state.hostContextSnapshot ?? {}),
            ...structuredClone(nextContext),
          },
        };
        if (hostContext) {
          hostContext = {
            ...hostContext,
            data: {
              ...hostContext.data,
              ...structuredClone(nextContext),
            },
          };
        }
        break;
      }
      default:
        break;
    }
  };

  const routeEvent = (event: RuntimeEventEnvelope, executeListeners: boolean, inbound: boolean): RuntimeSessionState => {
    if (!document || !index) {
      return structuredClone(state);
    }
    const normalizedEvent = normalizeRuntimeEvent(event, document.id, runtimeId, projectId);
    trace.push({ direction: inbound ? "inbound" : "internal", event: normalizedEvent });
    eventBus.emit(normalizedEvent);
    applyInboundState(normalizedEvent);

    if (executeListeners) {
      for (const listenerInvocation of collectListenerInvocations(normalizedEvent, index)) {
        if (!listenerMatches(listenerInvocation.listener, listenerInvocation.event)) {
          continue;
        }
        for (const action of listenerInvocation.listener.listener.actions) {
          executeAction(action, listenerInvocation.event);
        }
      }
    }

    return structuredClone(state);
  };

  return {
    mount(nextDocument: AuthoringDocument, options?: RuntimeEngineMountOptions): RuntimeSessionState {
      document = structuredClone(nextDocument);
      index = createRuntimeDocumentIndex(document);
      runtimeId = options?.runtimeId ?? `runtime_${randomId()}`;
      projectId = options?.projectId ?? null;
      clock = options?.clock ?? (() => new Date());
      randomId = options?.randomId ?? (() => crypto.randomUUID());
      hostContext = options?.hostContext ?? null;
      state = createInitialSessionState(document, index, options?.initialSessionState ?? null, hostContext);
      mounted = true;
      trace.length = 0;

      if (options?.emitLoadEvent !== false) {
        routeEvent(
          buildEvent(
            "form.load",
            {
              stepId: state.currentStepId,
            },
            "outbound",
            {
              nodeId: document.id,
              nodeType: "form",
            },
          ),
          true,
          false,
        );
      }

      if (state.currentStepId) {
        routeEvent(
          buildEvent(
            "step.enter",
            {
              stepId: state.currentStepId,
              previousStepId: null,
              reason: "mount",
            },
            "internal",
            {
              nodeId: state.currentStepId,
              nodeType: "step",
            },
          ),
          true,
          false,
        );
      }

      return structuredClone(state);
    },
    unmount(): void {
      document = null;
      index = null;
      mounted = false;
      hostContext = null;
      state = {
        currentStepId: null,
        values: {},
        nodes: {},
        validation: { valid: true, errors: [], warnings: [] },
        submit: { status: "idle", lastCorrelationId: null, message: null, fieldErrors: null },
        hostContextSnapshot: null,
      };
      trace.length = 0;
    },
    dispatch(event: RuntimeEventEnvelope): RuntimeSessionState {
      if (!mounted || !document || !index) {
        throw new Error("Runtime engine is not mounted.");
      }
      return routeEvent(structuredClone(event), true, true);
    },
    invoke(action: RuntimeActionDefinition): RuntimeSessionState {
      if (!mounted || !document || !index) {
        throw new Error("Runtime engine is not mounted.");
      }
      const internalEvent = buildEvent(
        "runtime.action_invoked",
        {
          actionId: action.id,
          actionKind: action.kind,
        },
        "internal",
        {
          nodeId: action.target?.nodeId ?? document.id,
          nodeType: action.target?.nodeType ?? "form",
        },
      );
      routeEvent(internalEvent, false, false);
      executeAction(structuredClone(action), internalEvent);
      return structuredClone(state);
    },
    subscribe(handler) {
      return eventBus.subscribe(handler);
    },
    getState(): RuntimeSessionState {
      return structuredClone(state);
    },
    setState(partial: Partial<RuntimeSessionState>): RuntimeSessionState {
      state = mergeSessionState(state, partial);
      return structuredClone(state);
    },
    validate(): RuntimeValidationState {
      return validate();
    },
    getSubmitPayload(): RuntimeSubmitPayload {
      return getSubmitPayload();
    },
    getDocument(): AuthoringDocument | null {
      return document ? structuredClone(document) : null;
    },
    getTrace(): RuntimeTraceEntry[] {
      return structuredClone(trace);
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) {
    return false;
  }
  return Object.values(value).every((entry) => typeof entry === "string");
}

function defaultEventBubbles(type: string): boolean {
  return runtimeCoreEventType(type)?.bubbles ?? true;
}

function listenerEventType(listener: RuntimeListenerDefinition): string {
  return listener.type ?? listener.eventName;
}

function normalizeRuntimeEvent(
  event: RuntimeEventEnvelope,
  formId: string,
  runtimeId: string,
  projectId: string | null,
): RuntimeEventEnvelope {
  const target: RuntimeEventTarget = {
    runtimeId: event.target?.runtimeId ?? event.source.runtimeId ?? runtimeId,
    formId: event.target?.formId ?? event.source.formId ?? formId,
    projectId: event.target?.projectId ?? event.source.projectId ?? projectId,
    nodeId: event.target?.nodeId ?? event.source.nodeId ?? null,
    nodeType: event.target?.nodeType ?? event.source.nodeType ?? null,
  };
  const currentTarget = event.currentTarget
    ? {
        runtimeId: event.currentTarget.runtimeId ?? target.runtimeId,
        formId: event.currentTarget.formId ?? target.formId,
        projectId: event.currentTarget.projectId ?? target.projectId,
        nodeId: event.currentTarget.nodeId ?? target.nodeId,
        nodeType: event.currentTarget.nodeType ?? target.nodeType,
      }
    : target;
  return {
    ...event,
    target,
    currentTarget,
    eventPhase: event.eventPhase ?? "target",
    bubbles: typeof event.bubbles === "boolean" ? event.bubbles : defaultEventBubbles(event.type),
    source: target,
  };
}

interface RuntimeListenerInvocation {
  listener: IndexedRuntimeListener;
  event: RuntimeEventEnvelope;
}

function collectListenerInvocations(
  event: RuntimeEventEnvelope,
  index: RuntimeDocumentIndex,
): RuntimeListenerInvocation[] {
  const targetNodeId = event.target?.nodeId ?? event.source.nodeId ?? index.documentId;
  const eventPath = targetNodeId ? dispatcherPath(index, targetNodeId) : [index.documentId];
  const targetId = eventPath[eventPath.length - 1] ?? index.documentId;
  const capturePath = eventPath.slice(0, -1);
  const bubblePath = eventPath.slice(0, -1).reverse();
  const invocations: RuntimeListenerInvocation[] = [];

  for (const dispatcherId of capturePath) {
    invocations.push(...listenersForDispatcher(index, dispatcherId, event, "capture", true));
  }

  invocations.push(...listenersForDispatcher(index, targetId, event, "target", null));

  if (event.bubbles !== false) {
    for (const dispatcherId of bubblePath) {
      invocations.push(...listenersForDispatcher(index, dispatcherId, event, "bubble", false));
    }
  }

  return invocations;
}

function listenersForDispatcher(
  index: RuntimeDocumentIndex,
  dispatcherId: string,
  event: RuntimeEventEnvelope,
  eventPhase: RuntimeEventPhase,
  useCapture: boolean | null,
): RuntimeListenerInvocation[] {
  const dispatcherNode = index.nodes.get(dispatcherId);
  const target = {
    runtimeId: event.target?.runtimeId ?? event.source.runtimeId,
    formId: event.target?.formId ?? event.source.formId,
    projectId: event.target?.projectId ?? event.source.projectId ?? null,
    nodeId: dispatcherId,
    nodeType: dispatcherNode?.nodeType ?? null,
  };
  const phaseEvent: RuntimeEventEnvelope = {
    ...event,
    currentTarget: target,
    eventPhase,
  };
  return index.listeners
    .filter((indexedListener) => {
      if (indexedListener.dispatcherId !== dispatcherId) {
        return false;
      }
      if (useCapture === null) {
        return true;
      }
      return Boolean(indexedListener.listener.useCapture) === useCapture;
    })
    .sort(compareIndexedListeners)
    .map((listener) => ({ listener, event: phaseEvent }));
}

function compareIndexedListeners(left: IndexedRuntimeListener, right: IndexedRuntimeListener): number {
  const priorityDelta = (right.listener.priority ?? 0) - (left.listener.priority ?? 0);
  return priorityDelta || left.order - right.order;
}

function dispatcherPath(index: RuntimeDocumentIndex, targetNodeId: string): string[] {
  const path: string[] = [];
  const visited = new Set<string>();
  let currentId: string | null | undefined = targetNodeId;
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    path.unshift(currentId);
    currentId = index.nodes.get(currentId)?.parentId ?? null;
  }
  if (!path.length || path[0] !== index.documentId) {
    path.unshift(index.documentId);
  }
  return path;
}

function isRuntimePayloadReference(value: unknown): value is { $runtime: RuntimePayloadReferenceKey } {
  return (
    isRecord(value) &&
    typeof value.$runtime === "string" &&
    runtimePayloadReferenceKeys.includes(value.$runtime as RuntimePayloadReferenceKey)
  );
}

function resolveRuntimePayload(
  payload: Record<string, unknown>,
  event: RuntimeEventEnvelope,
  document: AuthoringDocument,
  index: RuntimeDocumentIndex,
  state: RuntimeSessionState,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, resolveRuntimePayloadValue(value, event, document, index, state)]),
  );
}

function resolveRuntimePayloadValue(
  value: unknown,
  event: RuntimeEventEnvelope,
  document: AuthoringDocument,
  index: RuntimeDocumentIndex,
  state: RuntimeSessionState,
): unknown {
  if (isRuntimePayloadReference(value)) {
    return resolveRuntimePayloadReference(value.$runtime, event, document, index, state);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => resolveRuntimePayloadValue(entry, event, document, index, state));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, resolveRuntimePayloadValue(entry, event, document, index, state)]),
    );
  }
  return structuredClone(value);
}

function resolveRuntimePayloadReference(
  referenceKey: RuntimePayloadReferenceKey,
  event: RuntimeEventEnvelope,
  document: AuthoringDocument,
  index: RuntimeDocumentIndex,
  state: RuntimeSessionState,
): unknown {
  const sourceNodeId =
    typeof event.target?.nodeId === "string"
      ? event.target.nodeId
      : typeof event.source.nodeId === "string"
        ? event.source.nodeId
        : null;
  const sourceNode = sourceNodeId ? index.nodes.get(sourceNodeId) ?? null : null;
  const activeStepNode = state.currentStepId ? index.nodes.get(state.currentStepId) ?? null : null;
  switch (referenceKey) {
    case "current.field.id":
      return sourceNode?.fieldId ?? null;
    case "current.field.key":
      return sourceNode?.field?.stableKey ?? null;
    case "current.step.id":
      return sourceNode?.stepId ?? state.currentStepId ?? null;
    case "current.step.title":
      return sourceNode?.step?.title ?? activeStepNode?.step?.title ?? null;
    case "current.form.id":
      return document.id;
    case "current.form.title":
      return document.title;
    case "current.project.id":
      return event.target?.projectId ?? event.source.projectId ?? null;
    case "current.source.node.id":
      return sourceNodeId;
    case "current.source.node.type":
      return sourceNode?.nodeType ?? event.target?.nodeType ?? event.source.nodeType ?? null;
    case "current.event.type":
      return event.type;
    case "current.event.target.id":
      return event.target?.nodeId ?? event.source.nodeId ?? null;
    case "current.event.target.type":
      return event.target?.nodeType ?? event.source.nodeType ?? null;
    case "current.event.currentTarget.id":
      return event.currentTarget?.nodeId ?? null;
    case "current.event.currentTarget.type":
      return event.currentTarget?.nodeType ?? null;
    case "current.event.phase":
      return event.eventPhase ?? "target";
    case "current.runtime.value": {
      const fieldId = sourceNode?.fieldId ?? null;
      return fieldId ? structuredClone(state.values[fieldId] ?? null) : null;
    }
    default:
      return null;
  }
}
