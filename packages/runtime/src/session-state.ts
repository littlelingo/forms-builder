import type {
  AuthoringDocument,
  RuntimeHostContext,
  RuntimeNodeState,
  RuntimeSessionState,
} from "@form-builder/schema";

import type { RuntimeDocumentIndex } from "./document-index";

export function createInitialSessionState(
  document: AuthoringDocument,
  index: RuntimeDocumentIndex,
  initialState?: Partial<RuntimeSessionState> | null,
  hostContext?: RuntimeHostContext | null,
): RuntimeSessionState {
  const nodes: Record<string, RuntimeNodeState> = {};

  for (const [nodeId, indexedNode] of index.nodes) {
    const current = initialState?.nodes?.[nodeId];
    const required = indexedNode.field ? indexedNode.field.required : false;
    nodes[nodeId] = {
      visible: current?.visible ?? true,
      enabled: current?.enabled ?? true,
      required: current?.required ?? required,
    };
  }

  const currentStepId =
    initialState?.currentStepId && index.stepOrder.includes(initialState.currentStepId)
      ? initialState.currentStepId
      : document.steps[0]?.id ?? null;

  return {
    currentStepId,
    values: initialState?.values ? structuredClone(initialState.values) : {},
    nodes,
    validation: initialState?.validation
      ? structuredClone(initialState.validation)
      : { valid: true, errors: [], warnings: [] },
    submit: initialState?.submit
      ? structuredClone(initialState.submit)
      : { status: "idle", lastCorrelationId: null, message: null, fieldErrors: null },
    hostContextSnapshot:
      initialState?.hostContextSnapshot ??
      (hostContext ? structuredClone(hostContext as unknown as Record<string, unknown>) : null),
  };
}

export function mergeSessionState(
  current: RuntimeSessionState,
  partial: Partial<RuntimeSessionState>,
): RuntimeSessionState {
  return {
    currentStepId: partial.currentStepId ?? current.currentStepId,
    values: partial.values ? { ...current.values, ...structuredClone(partial.values) } : { ...current.values },
    nodes: partial.nodes ? { ...current.nodes, ...structuredClone(partial.nodes) } : { ...current.nodes },
    validation: partial.validation ? structuredClone(partial.validation) : structuredClone(current.validation),
    submit: partial.submit ? { ...current.submit, ...structuredClone(partial.submit) } : structuredClone(current.submit),
    hostContextSnapshot:
      partial.hostContextSnapshot !== undefined
        ? structuredClone(partial.hostContextSnapshot)
        : structuredClone(current.hostContextSnapshot),
  };
}
