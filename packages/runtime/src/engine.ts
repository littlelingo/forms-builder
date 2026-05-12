import { runtimeCoreEventType, runtimeActionOnErrorPolicy, isRuntimeAsyncActionKind } from "@form-builder/schema";
import type {
  AuthoringDocument,
  RuntimeActionDefinition,
  RuntimeConditionDefinition,
  RuntimeConditionGroup,
  RuntimeConditionNode,
  RuntimeEventEnvelope,
  RuntimeEventPhase,
  RuntimeEventTarget,
  RuntimeEventTypeDefinition,
  RuntimeHostContext,
  RuntimeListenerDefinition,
  RuntimeNodeType,
  RuntimeSessionState,
  RuntimeSubmitPayload,
  RuntimeValidationState,
} from "@form-builder/schema";

import { createRuntimeDocumentIndex, type IndexedRuntimeListener, type RuntimeDocumentIndex } from "./document-index";
import { RuntimeEventBus } from "./event-bus";
import { createListenerScheduler, type ListenerScheduler } from "./scheduler";
import { createInitialSessionState, mergeSessionState } from "./session-state";
import type {
  AsyncChainContext,
  BehaviorExecutedEvent,
  BehaviorLibraryRegistry,
  CreateRuntimeEngineOptions,
  PendingContinuation,
  RuntimeActionDiagnostic,
  RuntimeConditionDiagnostic,
  RuntimeDispatchReport,
  RuntimeEngine,
  RuntimeEngineMountOptions,
  RuntimeListenerDiagnostic,
  RuntimeStateDiff,
  RuntimeTraceEntry,
  TelemetrySink,
} from "./types";
import { applyTemplateTokens, stableStringify } from "./template-tokens";
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
  "current.source.node.key",
  "current.source.node.type",
  "current.event.type",
  "current.event.target.id",
  "current.event.target.key",
  "current.event.target.type",
  "current.event.currentTarget.id",
  "current.event.currentTarget.key",
  "current.event.currentTarget.type",
  "current.event.phase",
  "current.runtime.value",
] as const;

type RuntimePayloadReferenceKey =
  | (typeof runtimePayloadReferenceKeys)[number]
  | `current.event.payload.${string}`
  | `current.response.${string}`
  | "current.response";

interface RuntimeDispatchReportDraft {
  event: RuntimeEventEnvelope | null;
  stateBefore: RuntimeSessionState;
  traceStartIndex: number;
  listeners: RuntimeListenerDiagnostic[];
}

/**
 * Phase 3: sentinel thrown by `executeAction` when an action's onError
 * policy is `halt`; the chain catches it and stops without re-throwing.
 */
class HaltChainError extends Error {
  constructor() {
    super("halt_chain");
    this.name = "HaltChainError";
  }
}

/**
 * Phase 1 helper: mark an action diagnostic as skipped with a reason.
 * Centralises the missing-target / no-op patterns so each action kind
 * only needs a single call instead of three lines of inline state.
 */
function markSkipped(d: RuntimeActionDiagnostic | undefined, reason: "missing-target" | "no-op" | string): void {
  if (!d) return;
  d.status = "skipped";
  d.skippedReason = reason;
}

export function createRuntimeEngine(options?: CreateRuntimeEngineOptions): RuntimeEngine {
  const libraryRegistry: BehaviorLibraryRegistry | undefined = options?.libraryRegistry;
  const telemetrySink: TelemetrySink | undefined = options?.telemetrySink;
  // Per-engine-instance cache: stores only the substituted template (raw unknown), not the full
  // listener envelope. Two listeners sharing the same libraryRef+params share the template but
  // each gets its own envelope fields (id, label, enabled, …) merged at read time.
  const templateCache = new Map<string, unknown>();

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
  let projectEventCatalog: RuntimeEventTypeDefinition[] = [];
  let mounted = false;
  let clock = () => new Date();
  let randomId: () => string = () => crypto.randomUUID();
  const trace: RuntimeTraceEntry[] = [];
  // Phase 3 async-dispatch state. Sync dispatch is unaffected and never reads these.
  // Continuations registered by host_call_await; Stage D writes/reads.
  const pendingContinuations: Map<string, PendingContinuation> = new Map();
  // Phase 3 Stage F: per-listener debounce/throttle scheduler. Held on the
  // engine instance so unmount can reset it. Wiring into routeEvent's
  // listener loop is deferred — once a listener is wrapped by `schedule()`
  // its execution may run AFTER the dispatch returns, which changes
  // dispatch-report semantics. The composer UI in Stage G (and any
  // dedicated debounce listener test) will land that wiring once the
  // semantic shift is intentional.
  const listenerScheduler: ListenerScheduler = createListenerScheduler();
  // Promise-chain serialization: every dispatchAsync invocation is appended to
  // the tail. The next call's `fn` only starts after the current tail settles,
  // so concurrent callers see FIFO semantics regardless of how many awaits
  // each chain performs internally.
  let asyncTail: Promise<unknown> = Promise.resolve();
  const enqueueAsync = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = asyncTail.then(fn, fn);
    asyncTail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  const buildEvent = (
    type: string,
    payload: Record<string, unknown>,
    _direction: RuntimeTraceEntry["direction"],
    source?: {
      nodeId?: string | null;
      nodeType?: RuntimeNodeType | null;
      correlationId?: string | null;
      bubbles?: boolean | null;
    },
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

  const transitionToStep = (
    stepId: string,
    reason: string,
    originatingEvent: RuntimeEventEnvelope,
    report?: RuntimeDispatchReportDraft,
  ): void => {
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
        buildEvent("step.leave", { stepId: previousStepId, nextStepId: stepId, reason }, "internal", {
          nodeId: previousStepId,
          nodeType: "step",
          correlationId: originatingEvent.correlationId,
        }),
        true,
        false,
        report,
      );
    }

    state = {
      ...state,
      currentStepId: stepId,
    };
    routeEvent(
      buildEvent("step.enter", { stepId, previousStepId, reason }, "internal", {
        nodeId: stepId,
        nodeType: "step",
        correlationId: originatingEvent.correlationId,
      }),
      true,
      false,
      report,
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

  const isConditionGroup = (node: RuntimeConditionNode): node is RuntimeConditionGroup =>
    (node as RuntimeConditionGroup).kind === "group";

  const evaluateAtomDiagnostic = (
    condition: RuntimeConditionDefinition,
    event: RuntimeEventEnvelope,
  ): RuntimeConditionDiagnostic => {
    if (condition.enabled === false) {
      return {
        conditionId: condition.id,
        label: condition.label ?? null,
        enabled: false,
        source: structuredClone(condition.source),
        operator: condition.operator,
        expectedValue: structuredClone(condition.expectedValue),
        actualValue: null,
        passed: true,
      };
    }
    const value =
      condition.source.kind === "field_value"
        ? state.values[condition.source.fieldId]
        : readPath(event.payload, condition.source.path);
    let passed = true;
    switch (condition.operator) {
      case "equals":
        passed = String(value ?? "") === String(condition.expectedValue ?? "");
        break;
      case "not_equals":
        passed = String(value ?? "") !== String(condition.expectedValue ?? "");
        break;
      case "contains":
        if (Array.isArray(value)) {
          passed = value.some((entry) => String(entry) === String(condition.expectedValue ?? ""));
          break;
        }
        passed = String(value ?? "").includes(String(condition.expectedValue ?? ""));
        break;
      case "exists":
        passed = !isBlank(value);
        break;
      default:
        passed = true;
        break;
    }
    return {
      conditionId: condition.id,
      label: condition.label ?? null,
      enabled: true,
      source: structuredClone(condition.source),
      operator: condition.operator,
      expectedValue: structuredClone(condition.expectedValue),
      actualValue: structuredClone(value),
      passed,
    };
  };

  /**
   * Phase 2B: walk the listener condition tree.
   *
   * `nodePassed[i]` is the boolean for the i-th input child only — atoms read
   * their own diagnostic, groups recurse and combine per
   * `RuntimeConditionGroupOperator`. `passed` is the AND-aggregate at this
   * level (top-level listener semantics). `diagnostics` is the flat list of
   * atom diagnostics surfaced in the dispatch report.
   */
  const evaluateConditionTree = (
    nodes: RuntimeConditionNode[],
    event: RuntimeEventEnvelope,
  ): {
    passed: boolean;
    nodePassed: boolean[];
    diagnostics: RuntimeConditionDiagnostic[];
  } => {
    const diagnostics: RuntimeConditionDiagnostic[] = [];
    const nodePassed: boolean[] = [];
    for (const node of nodes) {
      if (isConditionGroup(node)) {
        if (node.enabled === false) {
          nodePassed.push(true);
          continue;
        }
        const child = evaluateConditionTree(node.conditions ?? [], event);
        diagnostics.push(...child.diagnostics);
        switch (node.operator) {
          case "OR":
            nodePassed.push(child.nodePassed.some(Boolean));
            break;
          case "NONE":
            nodePassed.push(child.nodePassed.every((entry) => !entry));
            break;
          case "AND":
          default:
            nodePassed.push(child.nodePassed.every(Boolean));
            break;
        }
      } else {
        const diagnostic = evaluateAtomDiagnostic(node, event);
        diagnostics.push(diagnostic);
        nodePassed.push(diagnostic.passed);
      }
    }
    return { passed: nodePassed.every(Boolean), nodePassed, diagnostics };
  };

  const resolveEventRefType = (eventRefId: string): string | null => {
    if (!document) return null;
    // Scan form-scope events first
    for (const def of document.runtime?.formEvents ?? []) {
      if (def.id === eventRefId) return def.type ?? def.name ?? null;
    }
    // Scan node-scope eventSources
    for (const step of document.steps) {
      for (const section of step.sections) {
        for (const field of section.fields) {
          for (const def of field.runtime?.eventSources ?? []) {
            if (def.id === eventRefId) return def.type ?? def.name ?? null;
          }
        }
        for (const group of section.groups) {
          for (const field of group.fields) {
            for (const def of field.runtime?.eventSources ?? []) {
              if (def.id === eventRefId) return def.type ?? def.name ?? null;
            }
          }
        }
      }
    }
    // Phase 2A: fall through to project-scope catalog for cross-form references
    for (const def of projectEventCatalog) {
      if (def.id === eventRefId) return def.type ?? def.name ?? null;
    }
    return null;
  };

  const materialisedListener = (listener: RuntimeListenerDefinition): RuntimeListenerDefinition | null => {
    if (!listener.libraryRef || listener.libraryRef.detached) {
      return listener;
    }
    const ref = listener.libraryRef;
    const entry = libraryRegistry?.resolve(ref.id, ref.revision);
    if (!entry) {
      return null; // broken ref
    }
    const templateCacheKey = `${entry.id}::${entry.revision}::${stableStringify(ref.params)}`;
    let materialisedRaw = templateCache.get(templateCacheKey);
    if (!materialisedRaw) {
      materialisedRaw = applyTemplateTokens(entry.template, ref.params);
      templateCache.set(templateCacheKey, materialisedRaw);
    }
    return {
      ...listener,
      ...(materialisedRaw as Partial<RuntimeListenerDefinition>),
      id: listener.id,
      libraryRef: listener.libraryRef,
    } as RuntimeListenerDefinition;
  };

  const evaluateListenerDiagnostic = (
    indexedListener: IndexedRuntimeListener,
    event: RuntimeEventEnvelope,
  ): RuntimeListenerDiagnostic => {
    const rawListener = indexedListener.listener;
    const enabled = rawListener.enabled !== false;

    // Resolve library ref before any other evaluation.
    const listener = materialisedListener(rawListener);
    if (listener === null) {
      // Broken libraryRef — report skipped with reason.
      const resolvedTarget =
        rawListener.target?.id && index ? index.resolveNodeDescriptor(rawListener.target.id) : undefined;
      return {
        listenerId: rawListener.id,
        label: rawListener.label ?? null,
        type: listenerEventType(rawListener),
        dispatcherId: indexedListener.dispatcherId,
        dispatcherType: indexedListener.dispatcherType,
        eventPhase: event.eventPhase,
        enabled,
        matched: false,
        skippedReason: "broken_library_ref",
        conditions: [],
        actions: [],
        ...(resolvedTarget ? { resolvedTarget } : {}),
      };
    }

    // Resolve event type: prefer eventRef lookup, fall back to legacy type/eventName.
    let type: string;
    let brokenEventRef = false;
    if (listener.eventRef) {
      const resolved = resolveEventRefType(listener.eventRef.id);
      if (resolved === null) {
        brokenEventRef = true;
        type = listenerEventType(listener); // placeholder; listener will be skipped
      } else {
        type = resolved;
      }
    } else {
      type = listenerEventType(listener);
    }

    if (brokenEventRef) {
      const resolvedTarget = listener.target?.id && index ? index.resolveNodeDescriptor(listener.target.id) : undefined;
      return {
        listenerId: listener.id,
        label: listener.label ?? null,
        type,
        dispatcherId: indexedListener.dispatcherId,
        dispatcherType: indexedListener.dispatcherType,
        eventPhase: event.eventPhase,
        enabled,
        matched: false,
        skippedReason: "broken_event_ref",
        conditions: [],
        actions: [],
        ...(resolvedTarget ? { resolvedTarget } : {}),
      };
    }

    const typeMatches = type === event.type;

    // Source-node filter: only active when listener.source?.id is explicitly set (new-shape).
    // Legacy eventSourceNodeId remains pure metadata until Phase 1B migration promotes it.
    const sourceFilterId = listener.source?.id ?? null;
    const eventTargetNodeId = event.target?.nodeId ?? null;
    const sourceMismatch = sourceFilterId !== null && sourceFilterId !== eventTargetNodeId;

    const evaluation =
      enabled && typeMatches && !sourceMismatch
        ? evaluateConditionTree(listener.conditions ?? [], event)
        : { passed: true, nodePassed: [], diagnostics: [] };
    const conditions = evaluation.diagnostics;
    const matched = enabled && typeMatches && !sourceMismatch && evaluation.passed;

    // Resolve target descriptor when listener.target?.id is set.
    const resolvedTarget = listener.target?.id && index ? index.resolveNodeDescriptor(listener.target.id) : undefined;

    const skippedReason = matched
      ? undefined
      : !enabled
        ? "disabled"
        : !typeMatches
          ? "event_type"
          : sourceMismatch
            ? "source_mismatch"
            : "conditions_failed";

    return {
      listenerId: listener.id,
      label: listener.label ?? null,
      type,
      dispatcherId: indexedListener.dispatcherId,
      dispatcherType: indexedListener.dispatcherType,
      eventPhase: event.eventPhase,
      enabled,
      matched,
      skippedReason,
      conditions,
      actions: [],
      ...(resolvedTarget ? { resolvedTarget } : {}),
    };
  };

  const executeAction = (
    action: RuntimeActionDefinition,
    event: RuntimeEventEnvelope,
    report?: RuntimeDispatchReportDraft,
    asyncContext?: AsyncChainContext,
    diagnostic?: RuntimeActionDiagnostic,
  ): void | Promise<void> => {
    if (!document || !index) {
      return;
    }

    // Phase 3: branch is fully synchronous; wait + host_call_await are async-only.
    // Sync paths reach this with `asyncContext === undefined` and async-only kinds throw.
    if (action.kind === "wait" || action.kind === "host_call_await") {
      if (!asyncContext) {
        throw new Error(`Runtime action kind "${action.kind}" requires dispatchAsync.`);
      }
      if (action.kind === "wait") {
        return runWaitAction(action, event, asyncContext);
      }
      return runHostCallAwaitAction(action, event, report, asyncContext);
    }

    try {
      switch (action.kind) {
        case "go_to_next_step": {
          const currentIndex = state.currentStepId ? index.stepOrder.indexOf(state.currentStepId) : -1;
          const nextStepId = index.stepOrder[currentIndex + 1];
          if (diagnostic) diagnostic.before = state.currentStepId ?? null;
          if (!nextStepId) {
            markSkipped(diagnostic, "no-op");
            break;
          }
          transitionToStep(nextStepId, "go_to_next_step", event, report);
          if (diagnostic) diagnostic.after = state.currentStepId ?? null;
          break;
        }
        case "go_to_previous_step": {
          const currentIndex = state.currentStepId ? index.stepOrder.indexOf(state.currentStepId) : -1;
          const previousStepId = currentIndex > 0 ? index.stepOrder[currentIndex - 1] : null;
          if (diagnostic) diagnostic.before = state.currentStepId ?? null;
          if (!previousStepId) {
            markSkipped(diagnostic, "no-op");
            break;
          }
          transitionToStep(previousStepId, "go_to_previous_step", event, report);
          if (diagnostic) diagnostic.after = state.currentStepId ?? null;
          break;
        }
        case "go_to_step": {
          const targetStepId =
            typeof action.config.stepId === "string"
              ? action.config.stepId
              : typeof action.target?.nodeId === "string"
                ? action.target.nodeId
                : null;
          if (diagnostic) diagnostic.before = state.currentStepId ?? null;
          if (!targetStepId || !index.stepOrder.includes(targetStepId)) {
            markSkipped(diagnostic, "missing-target");
            break;
          }
          transitionToStep(targetStepId, "go_to_step", event, report);
          if (diagnostic) diagnostic.after = state.currentStepId ?? null;
          break;
        }
        case "set_field_value": {
          const targetFieldId =
            typeof action.config.fieldId === "string"
              ? action.config.fieldId
              : typeof action.target?.nodeId === "string"
                ? action.target.nodeId
                : null;
          if (!targetFieldId || !index.nodes.has(targetFieldId)) {
            markSkipped(diagnostic, "missing-target");
            break;
          }
          if (diagnostic) diagnostic.before = structuredClone(state.values[targetFieldId]);
          const value = resolveRuntimePayloadValue(
            action.config.value,
            event,
            document,
            index,
            state,
            asyncContext?.responseScope,
          );
          state = {
            ...state,
            values: {
              ...state.values,
              [targetFieldId]: structuredClone(value),
            },
          };
          if (diagnostic) diagnostic.after = structuredClone(state.values[targetFieldId]);
          break;
        }
        case "clear_field_value": {
          const targetFieldId =
            typeof action.config.fieldId === "string"
              ? action.config.fieldId
              : typeof action.target?.nodeId === "string"
                ? action.target.nodeId
                : null;
          if (!targetFieldId || !index.nodes.has(targetFieldId)) {
            markSkipped(diagnostic, "missing-target");
            break;
          }
          if (diagnostic) diagnostic.before = structuredClone(state.values[targetFieldId]);
          const nextValues = { ...state.values };
          delete nextValues[targetFieldId];
          state = { ...state, values: nextValues };
          if (diagnostic) diagnostic.after = structuredClone(state.values[targetFieldId]);
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
          if (!targetNodeId || !state.nodes[targetNodeId]) {
            markSkipped(diagnostic, "missing-target");
            break;
          }
          const currentNodeState = state.nodes[targetNodeId];
          const flagKey: keyof typeof currentNodeState =
            action.kind === "show_node" || action.kind === "hide_node"
              ? "visible"
              : action.kind === "enable_node" || action.kind === "disable_node"
                ? "enabled"
                : "required";
          if (diagnostic) diagnostic.before = currentNodeState[flagKey];
          state = {
            ...state,
            nodes: {
              ...state.nodes,
              [targetNodeId]: {
                ...currentNodeState,
                visible:
                  action.kind === "show_node" ? true : action.kind === "hide_node" ? false : currentNodeState.visible,
                enabled:
                  action.kind === "enable_node"
                    ? true
                    : action.kind === "disable_node"
                      ? false
                      : currentNodeState.enabled,
                required:
                  action.kind === "mark_required"
                    ? true
                    : action.kind === "mark_optional"
                      ? false
                      : currentNodeState.required,
              },
            },
          };
          if (diagnostic) diagnostic.after = state.nodes[targetNodeId]?.[flagKey];
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
          const bubbles =
            typeof action.config.bubbles === "boolean" ? action.config.bubbles : defaultEventBubbles(eventType);
          const payload = resolveRuntimePayload(
            isRecord(action.config.payload) ? action.config.payload : {},
            event,
            document,
            index,
            state,
            asyncContext?.responseScope,
          );
          routeEvent(
            buildEvent(eventType, payload, "outbound", {
              nodeId: event.target?.nodeId ?? event.source.nodeId,
              nodeType: event.target?.nodeType ?? event.source.nodeType,
              bubbles,
            }),
            true,
            false,
            report,
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
            asyncContext?.responseScope,
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
            report,
          );
          break;
        }
        case "submit_form": {
          if (diagnostic) diagnostic.before = state.submit.status;
          const validation = validate();
          if (!validation.valid) {
            state = {
              ...state,
              submit: {
                ...state.submit,
                status: "idle",
                message: "Validation failed.",
                fieldErrors: Object.fromEntries(
                  validation.errors.map((error) => [error.fieldId ?? error.nodeId, error.message]),
                ),
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
              report,
            );
            if (diagnostic) diagnostic.after = state.submit.status;
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
          routeEvent(submitEvent, true, false, report);
          if (diagnostic) diagnostic.after = state.submit.status;
          break;
        }
        case "branch": {
          // Phase 3: synchronous condition tree evaluation, recurses into the
          // taken arm. Each arm receives a shallow clone of the parent
          // response scope so siblings cannot leak data through it.
          const config = isRecord(action.config) ? action.config : {};
          const conditions = Array.isArray(config.conditions) ? (config.conditions as RuntimeConditionNode[]) : [];
          const thenActions = Array.isArray(config.actions) ? (config.actions as RuntimeActionDefinition[]) : [];
          const elseActions = Array.isArray(config.else) ? (config.else as RuntimeActionDefinition[]) : [];
          const evaluation = evaluateConditionTree(conditions, event);
          const passed = evaluation.passed;
          const armActions = passed ? thenActions : elseActions;
          const arm: "then" | "else" = passed ? "then" : "else";

          const baseDepth = asyncContext?.branchDepth ?? 0;
          if (baseDepth >= 3) {
            // Trace the cap and halt this chain via halt_and_raise.
            routeEvent(
              buildEvent(
                "runtime.action_error",
                {
                  reason: "branch_depth_exceeded",
                  actionId: action.id,
                  depth: baseDepth,
                },
                "internal",
                {
                  nodeId: event.target?.nodeId ?? event.source.nodeId,
                  nodeType: event.target?.nodeType ?? event.source.nodeType,
                },
              ),
              false,
              false,
              report,
            );
            throw new Error(`Branch nesting cap exceeded (depth ${baseDepth}).`);
          }

          // Trace branch take/skip
          routeEvent(
            buildEvent(
              passed || elseActions.length > 0 ? "runtime.branch_take" : "runtime.branch_skip",
              passed || elseActions.length > 0 ? { actionId: action.id, arm } : { actionId: action.id },
              "internal",
              {
                nodeId: event.target?.nodeId ?? event.source.nodeId,
                nodeType: event.target?.nodeType ?? event.source.nodeType,
              },
            ),
            false,
            false,
            report,
          );

          if (armActions.length === 0) {
            break;
          }

          // Recurse with a cloned response scope and bumped depth. When the
          // outer chain is async, runActionChain returns a Promise that the
          // outer loop awaits — propagate it via `return`. When sync, a
          // Promise here means a contract bug: async actions should have
          // been blocked at routeEvent's listener pre-check.
          const childContext: AsyncChainContext | undefined = asyncContext
            ? {
                responseScope: { ...asyncContext.responseScope },
                branchDepth: baseDepth + 1,
              }
            : undefined;
          const armResult = runActionChain(armActions, event, report, childContext);
          if (asyncContext && armResult && typeof (armResult as Promise<void>).then === "function") {
            return armResult;
          }
          if (!asyncContext && armResult && typeof (armResult as Promise<void>).then === "function") {
            throw new Error("Branch arm contains async-only actions; use dispatchAsync.");
          }
          break;
        }
        default:
          break;
      }
    } catch (error) {
      const policy = runtimeActionOnErrorPolicy(action);
      if (policy === "continue") {
        return;
      }
      if (policy === "halt") {
        // Signal halt by re-throwing a sentinel; the chain catches and stops silently.
        throw new HaltChainError();
      }
      // halt_and_raise — emit runtime.action_error then propagate so the
      // listener loop captures the diagnostic and stops.
      try {
        routeEvent(
          buildEvent(
            "runtime.action_error",
            {
              listenerId: report?.listeners[report.listeners.length - 1]?.listenerId ?? null,
              actionId: action.id,
              reason: error instanceof Error ? error.message : String(error),
            },
            "outbound",
            {
              nodeId: event.target?.nodeId ?? event.source.nodeId,
              nodeType: event.target?.nodeType ?? event.source.nodeType,
            },
          ),
          true,
          false,
          report,
        );
      } catch {
        // Don't let the diagnostic emit hide the original error.
      }
      throw error;
    }
  };

  /**
   * Phase 3: walk an action chain. Returns void when the chain is purely
   * synchronous (no wait/host_call_await/async-branch), or a Promise that
   * resolves when the async chain settles. The caller decides which path
   * is permissible based on whether dispatchAsync invoked it.
   */
  function runActionChain(
    actions: RuntimeActionDefinition[],
    event: RuntimeEventEnvelope,
    report: RuntimeDispatchReportDraft | undefined,
    asyncContext: AsyncChainContext | undefined,
  ): void | Promise<void> {
    if (!asyncContext) {
      // Sync path — throw on async-only kinds, halt on HaltChainError.
      try {
        for (const action of actions) {
          const ret = executeAction(action, event, report);
          if (ret && typeof (ret as Promise<void>).then === "function") {
            // executeAction guarded async kinds upstream, so a Promise here is a contract bug.
            throw new Error('Internal: sync action chain produced a Promise.');
          }
        }
      } catch (err) {
        if (err instanceof HaltChainError) {
          return;
        }
        throw err;
      }
      return;
    }
    return (async () => {
      try {
        for (const action of actions) {
          const ret = executeAction(action, event, report, asyncContext);
          if (ret && typeof (ret as Promise<void>).then === "function") {
            await ret;
          }
        }
      } catch (err) {
        if (err instanceof HaltChainError) {
          return;
        }
        throw err;
      }
    })();
  }

  /**
   * Phase 3: wait action handler. fixed_ms sleeps; until_event subscribes
   * once and resolves on the next matching event type, or rejects after
   * timeoutMs. Caller's onError policy applies on rejection.
   */
  function runWaitAction(
    action: RuntimeActionDefinition,
    event: RuntimeEventEnvelope,
    _asyncContext: AsyncChainContext,
  ): Promise<void> {
    const config = isRecord(action.config) ? action.config : {};
    const mode = typeof config.mode === "string" ? (config.mode as "fixed_ms" | "until_event") : "fixed_ms";
    const timeoutMs = typeof config.timeoutMs === "number" ? config.timeoutMs : null;
    const eventType = typeof config.eventType === "string" ? config.eventType : null;
    const durationMs = typeof config.durationMs === "number" ? config.durationMs : 0;

    const traceWait = (resolved: boolean, reason?: string) => {
      const traceEvent = buildEvent(
        resolved ? "runtime.wait_resolved" : "runtime.wait_started",
        {
          actionId: action.id,
          mode,
          ...(durationMs ? { durationMs } : {}),
          ...(eventType ? { eventType } : {}),
          ...(reason ? { reason } : {}),
        },
        "internal",
        {
          nodeId: event.target?.nodeId ?? event.source.nodeId,
          nodeType: event.target?.nodeType ?? event.source.nodeType,
        },
      );
      routeEvent(traceEvent, false, false);
    };

    traceWait(false);

    if (mode === "fixed_ms") {
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          traceWait(true, "elapsed");
          resolve();
        }, durationMs);
      });
    }
    // until_event — subscribe to the bus, resolve on first matching type.
    return new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const unsubscribe = eventBus.subscribe((incoming) => {
        if (eventType && incoming.type === eventType) {
          if (timer) clearTimeout(timer);
          unsubscribe();
          traceWait(true, "event");
          resolve();
        }
      });
      if (timeoutMs && timeoutMs > 0) {
        timer = setTimeout(() => {
          unsubscribe();
          routeEvent(
            buildEvent("runtime.wait_timeout", { actionId: action.id }, "outbound", {
              nodeId: event.target?.nodeId ?? event.source.nodeId,
              nodeType: event.target?.nodeType ?? event.source.nodeType,
            }),
            true,
            false,
          );
          reject(new Error(`wait until_event timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }
    });
  }

  /**
   * Phase 3: host_call_await handler. Emits host.action_requested, then
   * suspends the chain on a continuation keyed by correlationId. Resumes
   * when applyInboundState handles a matching host.action_response.
   */
  function runHostCallAwaitAction(
    action: RuntimeActionDefinition,
    event: RuntimeEventEnvelope,
    report: RuntimeDispatchReportDraft | undefined,
    asyncContext: AsyncChainContext,
  ): Promise<void> {
    const config = isRecord(action.config) ? action.config : {};
    const handlerKey = typeof config.handlerKey === "string" ? config.handlerKey : null;
    const correlationId = typeof config.correlationId === "string" ? config.correlationId : randomId();
    const timeoutMs = typeof config.timeoutMs === "number" ? config.timeoutMs : null;
    const resolvedPayload = resolveRuntimePayload(
      isRecord(config.payload) ? (config.payload as Record<string, unknown>) : {},
      event,
      document!,
      index!,
      state,
      asyncContext.responseScope,
    );

    if (pendingContinuations.has(correlationId)) {
      // Collision — emit + reject second registration.
      routeEvent(
        buildEvent(
          "runtime.continuation_collision",
          {
            correlationId,
            listenerId: report?.listeners[report.listeners.length - 1]?.listenerId ?? null,
            actionId: action.id,
          },
          "outbound",
          {
            nodeId: event.target?.nodeId ?? event.source.nodeId,
            nodeType: event.target?.nodeType ?? event.source.nodeType,
          },
        ),
        true,
        false,
        report,
      );
      return Promise.reject(new Error(`correlationId collision: ${correlationId}`));
    }

    return new Promise<void>((resolve, reject) => {
      const continuation: PendingContinuation = {
        correlationId,
        listenerId: report?.listeners[report.listeners.length - 1]?.listenerId ?? "",
        actionId: action.id,
        resolve: (responsePayload) => {
          // Phase 3: write the response into the chain's responseScope so
          // subsequent $response token resolutions in this listener pick it up.
          asyncContext.responseScope = { ...asyncContext.responseScope, ...responsePayload };
          resolve();
        },
        reject,
        timeoutHandle: null,
      };
      if (timeoutMs && timeoutMs > 0) {
        continuation.timeoutHandle = setTimeout(() => {
          if (pendingContinuations.delete(correlationId)) {
            routeEvent(
              buildEvent(
                "runtime.continuation_timeout",
                { correlationId, listenerId: continuation.listenerId, actionId: action.id },
                "outbound",
                {
                  nodeId: event.target?.nodeId ?? event.source.nodeId,
                  nodeType: event.target?.nodeType ?? event.source.nodeType,
                },
              ),
              true,
              false,
            );
            reject(new Error(`host_call_await timed out after ${timeoutMs}ms`));
          }
        }, timeoutMs);
      }
      pendingContinuations.set(correlationId, continuation);

      // Emit host.action_requested with the same payload shape host_action uses.
      const requestConfig = structuredClone(config);
      requestConfig.payload = resolvedPayload;
      requestConfig.correlationId = correlationId;
      routeEvent(
        buildEvent(
          "host.action_requested",
          {
            handlerKey,
            actionId: action.id,
            target: action.target ?? null,
            config: requestConfig,
            correlationId,
          },
          "outbound",
          {
            nodeId: event.target?.nodeId ?? event.source.nodeId,
            nodeType: event.target?.nodeType ?? event.source.nodeType,
          },
        ),
        true,
        false,
        report,
      );
    });
  }

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
      case "field.input":
      case "input.change":
      case "input.textChange":
      case "input.before_input":
      case "input.composition_end":
      case "signature.change":
      case "signature.attested":
      case "signature.cleared":
      case "repeatableGroup.change":
      case "repeatableGroup.item_added":
      case "repeatableGroup.item_removed":
      case "repeatableGroup.item_moved":
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
      case "host.action_response": {
        // Phase 3: resume a host_call_await continuation keyed by correlationId.
        const correlationId =
          typeof event.payload.correlationId === "string"
            ? event.payload.correlationId
            : typeof event.correlationId === "string"
              ? event.correlationId
              : null;
        if (!correlationId) {
          break;
        }
        const continuation = pendingContinuations.get(correlationId);
        if (!continuation) {
          // Phase 3: stale or unknown id — emit a mismatch trace event.
          // We cannot route a new event from inside applyInboundState (would
          // recurse indefinitely), so push a trace entry directly.
          trace.push({
            direction: "internal",
            event: {
              ...event,
              type: "runtime.continuation_mismatch",
              payload: { correlationId },
            },
          });
          break;
        }
        if (continuation.timeoutHandle) {
          clearTimeout(continuation.timeoutHandle);
        }
        pendingContinuations.delete(correlationId);
        const responsePayload = isRecord(event.payload) ? event.payload : {};
        continuation.resolve(responsePayload);
        break;
      }
      default:
        break;
    }
  };

  const routeEvent = (
    event: RuntimeEventEnvelope,
    executeListeners: boolean,
    inbound: boolean,
    report?: RuntimeDispatchReportDraft,
  ): RuntimeSessionState => {
    if (!document || !index) {
      return structuredClone(state);
    }
    const normalizedEvent = enrichRuntimeEventTargets(
      normalizeRuntimeEvent(event, document.id, runtimeId, projectId),
      document,
      index,
    );
    if (report && !report.event) {
      report.event = structuredClone(normalizedEvent);
    }
    trace.push({ direction: inbound ? "inbound" : "internal", event: normalizedEvent });
    eventBus.emit(normalizedEvent);
    applyInboundState(normalizedEvent);

    if (executeListeners) {
      for (const listenerInvocation of collectListenerInvocations(normalizedEvent, index, document)) {
        const listenerDiagnostic = evaluateListenerDiagnostic(listenerInvocation.listener, listenerInvocation.event);
        report?.listeners.push(listenerDiagnostic);
        if (!listenerDiagnostic.matched) {
          continue;
        }
        // Use the materialised listener's actions (may differ from raw when libraryRef is set).
        const resolvedListener =
          materialisedListener(listenerInvocation.listener.listener) ?? listenerInvocation.listener.listener;

        // Phase 3 Stage F: when the listener carries non-empty timing,
        // defer the entire evaluation+execution via the per-engine
        // scheduler. The synchronous diagnostic above stays in the
        // dispatch report (marked "deferred_by_debounce") so authors can
        // tell the listener was matched but not yet run. The scheduler
        // fires the deferred body which re-evaluates and executes
        // without writing into the now-stale report.
        const timing = resolvedListener.timing;
        const hasTiming = timing && (Number(timing.debounce_ms ?? 0) > 0 || Number(timing.throttle_ms ?? 0) > 0);
        if (hasTiming) {
          const debounceWins = Number(timing!.debounce_ms ?? 0) > 0;
          // Mark diagnostic and continue; do not execute inline.
          listenerDiagnostic.matched = false;
          listenerDiagnostic.skippedReason = debounceWins ? "deferred_by_debounce" : "dropped_by_throttle";
          // Capture the invocation context for the scheduled fire.
          const deferredInvocation = listenerInvocation;
          listenerScheduler.schedule(resolvedListener.id, timing!, () => {
            if (!mounted || !document || !index) return;
            // Re-evaluate at fire time so condition state reflects whatever the
            // chain produced while the timer ran.
            const fireDiag = evaluateListenerDiagnostic(deferredInvocation.listener, deferredInvocation.event);
            if (!fireDiag.matched) return;
            // Throw on async-only kinds — deferred listeners use sync execution only.
            if (resolvedListener.actions.some((a) => isRuntimeAsyncActionKind(a.kind))) {
              return;
            }
            try {
              for (const action of resolvedListener.actions) {
                try {
                  executeAction(action, deferredInvocation.event);
                } catch (err) {
                  if (err instanceof HaltChainError) break;
                  throw err;
                }
              }
            } catch {
              // Swallow — deferred fires cannot propagate to the original dispatch caller.
              // executeAction's onError policy already pushed any error-trace events.
            }
          });
          continue;
        }

        // Phase 3: throw early if the chain contains async-only actions; sync dispatch must surface the bug.
        if (resolvedListener.actions.some((a) => isRuntimeAsyncActionKind(a.kind))) {
          throw new Error(
            `Listener "${resolvedListener.id}" uses async-only actions; dispatchAsync must be used instead of dispatch.`,
          );
        }
        const listenerStart = performance.now();
        let listenerError: BehaviorExecutedEvent["error"] | undefined;
        try {
          for (const action of resolvedListener.actions) {
            const actionDiagnostic: RuntimeActionDiagnostic = {
              actionId: action.id,
              label: action.label ?? null,
              kind: action.kind,
              target: structuredClone(action.target ?? null),
              config: structuredClone(action.config),
              status: "executed",
            };
            listenerDiagnostic.actions.push(actionDiagnostic);
            try {
              executeAction(action, listenerInvocation.event, report, undefined, actionDiagnostic);
            } catch (error) {
              if (error instanceof HaltChainError) {
                break;
              }
              actionDiagnostic.status = "error";
              actionDiagnostic.errorMessage = error instanceof Error ? error.message : "Runtime action failed.";
              throw error;
            }
          }
        } catch (err) {
          listenerError = {
            message: err instanceof Error ? err.message : String(err),
            actionId: resolvedListener.actions.find((a) => {
              const diag = listenerDiagnostic.actions.find((d) => d.actionId === a.id);
              return diag?.status === "error";
            })?.id,
          };
          telemetrySink?.({
            listenerId: listenerInvocation.listener.listener.id,
            durationMs: performance.now() - listenerStart,
            error: listenerError,
          });
          throw err;
        }
        telemetrySink?.({
          listenerId: listenerInvocation.listener.listener.id,
          durationMs: performance.now() - listenerStart,
        });
      }
    }

    return structuredClone(state);
  };

  /**
   * Phase 3: async-aware sibling of `routeEvent`. Same setup, but the
   * listener-action loop awaits each action's return value so wait /
   * host_call_await suspensions actually pause execution. Recursive
   * routeEvent calls from emit/dispatch_event/host_action stay sync —
   * those side-effect chains are not expected to suspend.
   */
  const routeEventAsync = async (
    event: RuntimeEventEnvelope,
    executeListeners: boolean,
    inbound: boolean,
    report?: RuntimeDispatchReportDraft,
  ): Promise<RuntimeSessionState> => {
    if (!document || !index) {
      return structuredClone(state);
    }
    const normalizedEvent = enrichRuntimeEventTargets(
      normalizeRuntimeEvent(event, document.id, runtimeId, projectId),
      document,
      index,
    );
    if (report && !report.event) {
      report.event = structuredClone(normalizedEvent);
    }
    trace.push({ direction: inbound ? "inbound" : "internal", event: normalizedEvent });
    eventBus.emit(normalizedEvent);
    applyInboundState(normalizedEvent);

    if (executeListeners) {
      for (const listenerInvocation of collectListenerInvocations(normalizedEvent, index, document)) {
        const listenerDiagnostic = evaluateListenerDiagnostic(listenerInvocation.listener, listenerInvocation.event);
        report?.listeners.push(listenerDiagnostic);
        if (!listenerDiagnostic.matched) {
          continue;
        }
        const resolvedListener =
          materialisedListener(listenerInvocation.listener.listener) ?? listenerInvocation.listener.listener;
        const listenerStart = performance.now();
        let listenerError: BehaviorExecutedEvent["error"] | undefined;
        const asyncContext: AsyncChainContext = { responseScope: {}, branchDepth: 0 };
        try {
          for (const action of resolvedListener.actions) {
            const actionDiagnostic: RuntimeActionDiagnostic = {
              actionId: action.id,
              label: action.label ?? null,
              kind: action.kind,
              target: structuredClone(action.target ?? null),
              config: structuredClone(action.config),
              status: "executed",
            };
            listenerDiagnostic.actions.push(actionDiagnostic);
            try {
              const ret = executeAction(action, listenerInvocation.event, report, asyncContext, actionDiagnostic);
              if (ret && typeof (ret as Promise<void>).then === "function") {
                await ret;
              }
            } catch (error) {
              if (error instanceof HaltChainError) {
                break;
              }
              actionDiagnostic.status = "error";
              actionDiagnostic.errorMessage = error instanceof Error ? error.message : "Runtime action failed.";
              throw error;
            }
          }
        } catch (err) {
          listenerError = {
            message: err instanceof Error ? err.message : String(err),
            actionId: resolvedListener.actions.find((a) => {
              const diag = listenerDiagnostic.actions.find((d) => d.actionId === a.id);
              return diag?.status === "error";
            })?.id,
          };
          telemetrySink?.({
            listenerId: listenerInvocation.listener.listener.id,
            durationMs: performance.now() - listenerStart,
            error: listenerError,
          });
          throw err;
        }
        telemetrySink?.({
          listenerId: listenerInvocation.listener.listener.id,
          durationMs: performance.now() - listenerStart,
        });
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
      projectEventCatalog = options?.projectEvents ? options.projectEvents.map((entry) => structuredClone(entry)) : [];
      clock = options?.clock ?? (() => new Date());
      randomId = options?.randomId ?? (() => crypto.randomUUID());
      hostContext = options?.hostContext ?? null;
      state = createInitialSessionState(document, index, options?.initialSessionState ?? null, hostContext);
      mounted = true;
      trace.length = 0;

      const tryRouteOrFallbackAsync = (envelope: RuntimeEventEnvelope, inbound: boolean) => {
        try {
          routeEvent(envelope, true, inbound);
        } catch (err) {
          // Phase 3: a matched listener uses wait / host_call_await — sync
          // routeEvent refused. Fall back to routeEventAsync as
          // fire-and-forget so mount() can still return the initial state.
          if (err instanceof Error && /dispatchAsync/.test(err.message)) {
            void routeEventAsync(envelope, true, inbound);
            return;
          }
          throw err;
        }
      };

      if (options?.emitLoadEvent !== false) {
        tryRouteOrFallbackAsync(
          buildEvent(
            "form.load",
            { stepId: state.currentStepId },
            "outbound",
            { nodeId: document.id, nodeType: "form" },
          ),
          false,
        );
      }

      if (state.currentStepId) {
        tryRouteOrFallbackAsync(
          buildEvent(
            "step.enter",
            { stepId: state.currentStepId, previousStepId: null, reason: "mount" },
            "internal",
            { nodeId: state.currentStepId, nodeType: "step" },
          ),
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
      projectEventCatalog = [];
      state = {
        currentStepId: null,
        values: {},
        nodes: {},
        validation: { valid: true, errors: [], warnings: [] },
        submit: { status: "idle", lastCorrelationId: null, message: null, fieldErrors: null },
        hostContextSnapshot: null,
      };
      trace.length = 0;
      // Phase 3: clear any registered host_call_await continuations so
      // a remount does not leak timeout handles or stale resolvers.
      for (const continuation of pendingContinuations.values()) {
        if (continuation.timeoutHandle) {
          clearTimeout(continuation.timeoutHandle);
        }
        continuation.reject("engine_unmounted");
      }
      pendingContinuations.clear();
      asyncTail = Promise.resolve();
      // Phase 3 Stage F: drop any pending debounce timers so they cannot
      // fire after unmount.
      listenerScheduler.reset();
    },
    dispatch(event: RuntimeEventEnvelope): RuntimeSessionState {
      if (!mounted || !document || !index) {
        throw new Error("Runtime engine is not mounted.");
      }
      return routeEvent(structuredClone(event), true, true);
    },
    dispatchWithReport(event: RuntimeEventEnvelope): RuntimeDispatchReport {
      if (!mounted || !document || !index) {
        throw new Error("Runtime engine is not mounted.");
      }
      const reportDraft: RuntimeDispatchReportDraft = {
        event: null,
        stateBefore: structuredClone(state),
        traceStartIndex: trace.length,
        listeners: [],
      };
      const stateAfter = routeEvent(structuredClone(event), true, true, reportDraft);
      const traceEntries = structuredClone(trace.slice(reportDraft.traceStartIndex));
      return {
        event: reportDraft.event ?? traceEntries[0]?.event ?? structuredClone(event),
        stateBefore: reportDraft.stateBefore,
        stateAfter,
        listeners: structuredClone(reportDraft.listeners),
        traceEntries,
        emittedEvents: traceEntries.slice(1).map((entry) => entry.event),
        stateDiff: diffRuntimeSessionState(reportDraft.stateBefore, stateAfter),
      };
    },
    dispatchAsync(event: RuntimeEventEnvelope): Promise<RuntimeSessionState> {
      if (!mounted || !document || !index) {
        return Promise.reject(new Error("Runtime engine is not mounted."));
      }
      const cloned = structuredClone(event);
      return enqueueAsync(async () => routeEventAsync(cloned, true, true));
    },
    dispatchWithReportAsync(event: RuntimeEventEnvelope): Promise<RuntimeDispatchReport> {
      if (!mounted || !document || !index) {
        return Promise.reject(new Error("Runtime engine is not mounted."));
      }
      const cloned = structuredClone(event);
      return enqueueAsync(async () => {
        const reportDraft: RuntimeDispatchReportDraft = {
          event: null,
          stateBefore: structuredClone(state),
          traceStartIndex: trace.length,
          listeners: [],
        };
        const stateAfter = await routeEventAsync(cloned, true, true, reportDraft);
        const traceEntries = structuredClone(trace.slice(reportDraft.traceStartIndex));
        return {
          event: reportDraft.event ?? traceEntries[0]?.event ?? structuredClone(event),
          stateBefore: reportDraft.stateBefore,
          stateAfter,
          listeners: structuredClone(reportDraft.listeners),
          traceEntries,
          emittedEvents: traceEntries.slice(1).map((entry) => entry.event),
          stateDiff: diffRuntimeSessionState(reportDraft.stateBefore, stateAfter),
        };
      });
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

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim().length === 0;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return false;
}

function readPath(source: Record<string, unknown>, path: string): unknown {
  if (!path.trim()) {
    return undefined;
  }
  return path.split(".").reduce<unknown>((current, segment) => {
    if (isRecord(current)) {
      return current[segment];
    }
    if (Array.isArray(current)) {
      const index = Number(segment);
      return Number.isInteger(index) ? current[index] : undefined;
    }
    return undefined;
  }, source);
}

function diffRuntimeSessionState(before: RuntimeSessionState, after: RuntimeSessionState): RuntimeStateDiff {
  return {
    currentStepChanged: before.currentStepId !== after.currentStepId,
    valuesChanged: changedRecordKeys(before.values, after.values),
    nodesChanged: changedRecordKeys(before.nodes, after.nodes),
    validationChanged: !runtimeValuesEqual(before.validation, after.validation),
    submitChanged: !runtimeValuesEqual(before.submit, after.submit),
  };
}

function changedRecordKeys(left: Record<string, unknown>, right: Record<string, unknown>): string[] {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter((key) => !runtimeValuesEqual(left[key], right[key]))
    .sort();
}

function runtimeValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
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
    nodeKey: event.target?.nodeKey ?? event.source.nodeKey ?? null,
    nodeType: event.target?.nodeType ?? event.source.nodeType ?? null,
  };
  const currentTarget = event.currentTarget
    ? {
        runtimeId: event.currentTarget.runtimeId ?? target.runtimeId,
        formId: event.currentTarget.formId ?? target.formId,
        projectId: event.currentTarget.projectId ?? target.projectId,
        nodeId: event.currentTarget.nodeId ?? target.nodeId,
        nodeKey: event.currentTarget.nodeKey ?? target.nodeKey,
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

function enrichRuntimeEventTargets(
  event: RuntimeEventEnvelope,
  document: AuthoringDocument,
  index: RuntimeDocumentIndex,
): RuntimeEventEnvelope {
  const target = enrichRuntimeEventTarget(event.target ?? event.source, document, index);
  const currentTarget = event.currentTarget ? enrichRuntimeEventTarget(event.currentTarget, document, index) : target;
  return {
    ...event,
    target,
    currentTarget,
    source: target,
  };
}

function enrichRuntimeEventTarget(
  target: RuntimeEventTarget,
  document: AuthoringDocument,
  index: RuntimeDocumentIndex,
): RuntimeEventTarget {
  return {
    ...target,
    nodeKey: target.nodeKey ?? runtimeNodeDispatchKey(target.nodeId ?? null, document, index),
  };
}

function runtimeNodeDispatchKey(
  nodeId: string | null,
  document: AuthoringDocument,
  index: RuntimeDocumentIndex,
): string | null {
  if (!nodeId) {
    return null;
  }
  if (nodeId === document.id) {
    return document.dispatchKey ?? null;
  }
  const node = index.nodes.get(nodeId);
  return (
    node?.field?.dispatchKey ??
    node?.group?.dispatchKey ??
    node?.section?.dispatchKey ??
    node?.step?.dispatchKey ??
    null
  );
}

interface RuntimeListenerInvocation {
  listener: IndexedRuntimeListener;
  event: RuntimeEventEnvelope;
}

function collectListenerInvocations(
  event: RuntimeEventEnvelope,
  index: RuntimeDocumentIndex,
  document: AuthoringDocument,
): RuntimeListenerInvocation[] {
  const targetNodeId = event.target?.nodeId ?? event.source.nodeId ?? index.documentId;
  const eventPath = targetNodeId ? dispatcherPath(index, targetNodeId) : [index.documentId];
  const targetId = eventPath[eventPath.length - 1] ?? index.documentId;
  const capturePath = eventPath.slice(0, -1);
  const bubblePath = eventPath.slice(0, -1).reverse();
  const invocations: RuntimeListenerInvocation[] = [];

  for (const dispatcherId of capturePath) {
    invocations.push(...listenersForDispatcher(index, dispatcherId, event, "capture", true, document));
  }

  invocations.push(...listenersForDispatcher(index, targetId, event, "target", null, document));

  if (event.bubbles !== false) {
    for (const dispatcherId of bubblePath) {
      invocations.push(...listenersForDispatcher(index, dispatcherId, event, "bubble", false, document));
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
  document: AuthoringDocument,
): RuntimeListenerInvocation[] {
  const dispatcherNode = index.nodes.get(dispatcherId);
  const target = {
    runtimeId: event.target?.runtimeId ?? event.source.runtimeId,
    formId: event.target?.formId ?? event.source.formId,
    projectId: event.target?.projectId ?? event.source.projectId ?? null,
    nodeId: dispatcherId,
    nodeKey: runtimeNodeDispatchKey(dispatcherId, document, index),
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
    (runtimePayloadReferenceKeys.includes(value.$runtime as (typeof runtimePayloadReferenceKeys)[number]) ||
      /^current\.event\.payload\.[A-Za-z0-9_.-]+$/.test(value.$runtime) ||
      // Phase 3: $response references — fully scoped (no path) or dotted path.
      /^current\.response(\.[A-Za-z0-9_.-]+)?$/.test(value.$runtime))
  );
}

function resolveRuntimePayload(
  payload: Record<string, unknown>,
  event: RuntimeEventEnvelope,
  document: AuthoringDocument,
  index: RuntimeDocumentIndex,
  state: RuntimeSessionState,
  responseScope?: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [
      key,
      resolveRuntimePayloadValue(value, event, document, index, state, responseScope),
    ]),
  );
}

function resolveRuntimePayloadValue(
  value: unknown,
  event: RuntimeEventEnvelope,
  document: AuthoringDocument,
  index: RuntimeDocumentIndex,
  state: RuntimeSessionState,
  responseScope?: Record<string, unknown>,
): unknown {
  if (isRuntimePayloadReference(value)) {
    return resolveRuntimePayloadReference(value.$runtime, event, document, index, state, responseScope);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => resolveRuntimePayloadValue(entry, event, document, index, state, responseScope));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        resolveRuntimePayloadValue(entry, event, document, index, state, responseScope),
      ]),
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
  responseScope?: Record<string, unknown>,
): unknown {
  const sourceNodeId =
    typeof event.target?.nodeId === "string"
      ? event.target.nodeId
      : typeof event.source.nodeId === "string"
        ? event.source.nodeId
        : null;
  const sourceNode = sourceNodeId ? (index.nodes.get(sourceNodeId) ?? null) : null;
  const activeStepNode = state.currentStepId ? (index.nodes.get(state.currentStepId) ?? null) : null;
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
    case "current.source.node.key":
      return event.target?.nodeKey ?? event.source.nodeKey ?? runtimeNodeDispatchKey(sourceNodeId, document, index);
    case "current.source.node.type":
      return sourceNode?.nodeType ?? event.target?.nodeType ?? event.source.nodeType ?? null;
    case "current.event.type":
      return event.type;
    case "current.event.target.id":
      return event.target?.nodeId ?? event.source.nodeId ?? null;
    case "current.event.target.key":
      return event.target?.nodeKey ?? event.source.nodeKey ?? null;
    case "current.event.target.type":
      return event.target?.nodeType ?? event.source.nodeType ?? null;
    case "current.event.currentTarget.id":
      return event.currentTarget?.nodeId ?? null;
    case "current.event.currentTarget.key":
      return event.currentTarget?.nodeKey ?? null;
    case "current.event.currentTarget.type":
      return event.currentTarget?.nodeType ?? null;
    case "current.event.phase":
      return event.eventPhase ?? "target";
    case "current.runtime.value": {
      const fieldId = sourceNode?.fieldId ?? null;
      return fieldId ? structuredClone(state.values[fieldId] ?? null) : null;
    }
    default:
      if (referenceKey.startsWith("current.event.payload.")) {
        return structuredClone(readPath(event.payload, referenceKey.replace("current.event.payload.", "")));
      }
      if (referenceKey === "current.response") {
        return responseScope === undefined ? null : structuredClone(responseScope);
      }
      if (referenceKey.startsWith("current.response.")) {
        if (responseScope === undefined) {
          return null;
        }
        return structuredClone(readPath(responseScope, referenceKey.replace("current.response.", "")));
      }
      return null;
  }
}
