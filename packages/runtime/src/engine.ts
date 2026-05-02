import type {
  AuthoringDocument,
  ConditionalRule,
  RuntimeActionDefinition,
  RuntimeEventEnvelope,
  RuntimeHostContext,
  RuntimeListenerDefinition,
  RuntimeNodeType,
  RuntimeSessionState,
  RuntimeSubmitPayload,
  RuntimeValidationState,
} from "@form-builder/schema";

import { createRuntimeDocumentIndex, type RuntimeDocumentIndex } from "./document-index";
import { RuntimeEventBus } from "./event-bus";
import { createInitialSessionState, mergeSessionState } from "./session-state";
import type {
  RuntimeEngine,
  RuntimeEngineMountOptions,
  RuntimeTraceEntry,
} from "./types";
import { validateRuntimeDocument } from "./validation";

const RUNTIME_VERSION = "1.0";

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
    source?: { nodeId?: string | null; nodeType?: RuntimeNodeType | null; correlationId?: string | null },
  ): RuntimeEventEnvelope => {
    if (!document) {
      throw new Error("Runtime engine is not mounted.");
    }
    return {
      type,
      version: RUNTIME_VERSION,
      source: {
        runtimeId,
        formId: document.id,
        projectId,
        nodeId: source?.nodeId ?? null,
        nodeType: source?.nodeType ?? null,
      },
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

  const listenerMatches = (listener: RuntimeListenerDefinition, event: RuntimeEventEnvelope): boolean => {
    if (!listener.enabled || listener.eventName !== event.type) {
      return false;
    }
    if (listener.sourceNodeId && listener.sourceNodeId !== event.source.nodeId) {
      return false;
    }
    if (!index) {
      return false;
    }
    const currentIndex = index;
    return listener.ruleGuards.every((guard) => {
      const conditional = currentIndex.conditionalRules.get(guard.ruleId);
      return conditional ? evaluateRule(conditional.rule) : true;
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
        case "emit_event": {
          const eventName =
            typeof action.config.eventName === "string" && action.config.eventName.trim().length > 0
              ? action.config.eventName
              : "custom.event";
          const payload = isRecord(action.config.payload) ? action.config.payload : {};
          routeEvent(
            buildEvent(eventName, payload, "outbound", {
              nodeId: event.source.nodeId,
              nodeType: event.source.nodeType,
            }),
            true,
            false,
          );
          break;
        }
        case "host_action": {
          const handlerKey = typeof action.config.handlerKey === "string" ? action.config.handlerKey : null;
          routeEvent(
            buildEvent(
              "host.action_requested",
              {
                handlerKey,
                actionId: action.id,
                target: action.target ?? null,
                config: structuredClone(action.config),
              },
              "outbound",
              {
                nodeId: event.source.nodeId,
                nodeType: event.source.nodeType,
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
      case "field.change": {
        const fieldId =
          typeof event.payload.fieldId === "string"
            ? event.payload.fieldId
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
    trace.push({ direction: inbound ? "inbound" : "internal", event });
    eventBus.emit(event);
    applyInboundState(event);

    if (executeListeners && index) {
      for (const listener of index.listeners) {
        if (!listenerMatches(listener, event)) {
          continue;
        }
        for (const action of listener.actions) {
          executeAction(action, event);
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
