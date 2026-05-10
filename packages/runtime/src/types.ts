import type {
  RuntimeActionDefinition,
  AuthoringDocument,
  BehaviorLibraryEntry,
  RuntimeConditionDefinition,
  RuntimeEventEnvelope,
  RuntimeHostContext,
  RuntimeNodeType,
  RuntimeSessionState,
  RuntimeSubmitPayload,
  RuntimeValidationState,
} from "@form-builder/schema";

export interface BehaviorLibraryRegistry {
  /** Returns the entry for the given id and revision, or undefined if missing. */
  resolve(id: string, revision: number): BehaviorLibraryEntry | undefined;
}

export interface CreateRuntimeEngineOptions {
  libraryRegistry?: BehaviorLibraryRegistry;
}

export interface RuntimeEngineMountOptions {
  runtimeId?: string;
  projectId?: string | null;
  initialSessionState?: Partial<RuntimeSessionState> | null;
  hostContext?: RuntimeHostContext | null;
  emitLoadEvent?: boolean;
  clock?: () => Date;
  randomId?: () => string;
}

export type RuntimeEventHandler = (event: RuntimeEventEnvelope) => void;

export interface RuntimeTraceEntry {
  direction: "inbound" | "outbound" | "internal";
  event: RuntimeEventEnvelope;
}

export interface RuntimeConditionDiagnostic {
  conditionId: string;
  label?: string | null;
  enabled: boolean;
  source: RuntimeConditionDefinition["source"];
  operator: RuntimeConditionDefinition["operator"];
  expectedValue?: unknown;
  actualValue?: unknown;
  passed: boolean;
}

export interface RuntimeActionDiagnostic {
  actionId: string;
  label?: string | null;
  kind: RuntimeActionDefinition["kind"];
  target?: RuntimeActionDefinition["target"] | null;
  config: Record<string, unknown>;
  status: "executed" | "error";
  errorMessage?: string;
}

export interface RuntimeListenerDiagnostic {
  listenerId: string;
  label?: string | null;
  type: string;
  dispatcherId: string;
  dispatcherType: RuntimeNodeType;
  eventPhase: RuntimeEventEnvelope["eventPhase"];
  enabled: boolean;
  matched: boolean;
  skippedReason?:
    | "disabled"
    | "event_type"
    | "conditions_failed"
    | "source_mismatch"
    | "broken_event_ref"
    | "broken_library_ref";
  resolvedTarget?: NodeDescriptor;
  conditions: RuntimeConditionDiagnostic[];
  actions: RuntimeActionDiagnostic[];
}

export interface RuntimeStateDiff {
  currentStepChanged: boolean;
  valuesChanged: string[];
  nodesChanged: string[];
  validationChanged: boolean;
  submitChanged: boolean;
}

export interface RuntimeDispatchReport {
  event: RuntimeEventEnvelope;
  stateBefore: RuntimeSessionState;
  stateAfter: RuntimeSessionState;
  listeners: RuntimeListenerDiagnostic[];
  traceEntries: RuntimeTraceEntry[];
  emittedEvents: RuntimeEventEnvelope[];
  stateDiff: RuntimeStateDiff;
}

export interface NodeDescriptor {
  id: string;
  dispatchKey?: string;
  labelHint?: string;
  broken?: boolean;
  lastSeenLabel?: string;
}

export interface NodeTombstoneMap {
  /** Returns last-seen metadata for a node id no longer in the live index. */
  get(id: string): { lastSeenLabel?: string } | undefined;
}

export interface RuntimeEngine {
  mount(document: AuthoringDocument, options?: RuntimeEngineMountOptions): RuntimeSessionState;
  unmount(): void;
  dispatch(event: RuntimeEventEnvelope): RuntimeSessionState;
  dispatchWithReport(event: RuntimeEventEnvelope): RuntimeDispatchReport;
  invoke(action: RuntimeActionDefinition): RuntimeSessionState;
  subscribe(handler: RuntimeEventHandler): () => void;
  getState(): RuntimeSessionState;
  setState(partial: Partial<RuntimeSessionState>): RuntimeSessionState;
  validate(): RuntimeValidationState;
  getSubmitPayload(): RuntimeSubmitPayload;
  getDocument(): AuthoringDocument | null;
  getTrace(): RuntimeTraceEntry[];
}
