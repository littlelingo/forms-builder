import type {
  RuntimeActionDefinition,
  AuthoringDocument,
  BehaviorLibraryEntry,
  RuntimeConditionDefinition,
  RuntimeEventEnvelope,
  RuntimeEventTypeDefinition,
  RuntimeHostContext,
  RuntimeNodeType,
  RuntimeSessionState,
  RuntimeSubmitPayload,
  RuntimeValidationState,
} from "@form-builder/schema";

export type TokenResolution<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; reason: string; pathRemainder?: string };

export interface BehaviorLibraryRegistry {
  /** Returns the entry for the given id and revision, or undefined if missing. */
  resolve(id: string, revision: number): BehaviorLibraryEntry | undefined;
}

export interface BehaviorExecutedEvent {
  listenerId: string;
  durationMs: number;
  /** Phase 3 branches; no-op in Phase 1A */
  branchTaken?: string;
  error?: { message: string; actionId?: string };
}

export type TelemetrySink = (event: BehaviorExecutedEvent) => void;

export interface CreateRuntimeEngineOptions {
  libraryRegistry?: BehaviorLibraryRegistry;
  telemetrySink?: TelemetrySink;
}

export interface RuntimeEngineMountOptions {
  runtimeId?: string;
  projectId?: string | null;
  initialSessionState?: Partial<RuntimeSessionState> | null;
  hostContext?: RuntimeHostContext | null;
  emitLoadEvent?: boolean;
  clock?: () => Date;
  randomId?: () => string;
  /**
   * Phase 2A: project-scope event catalog. Listener `eventRef` ids that miss
   * the form-scope and node-scope catalogs fall back to this list, so a form
   * within a project can react to events declared on the surrounding project.
   */
  projectEvents?: RuntimeEventTypeDefinition[] | null;
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
  status: "executed" | "error" | "skipped";
  errorMessage?: string;
  /**
   * Value/property snapshot before action ran (when meaningful — e.g., field value,
   * visibility flag, property value, or for `submit_form` the submit-lifecycle
   * status `"idle"` / `"submitting"` / `"success"` / `"error"`).
   */
  before?: unknown;
  /**
   * Value/property snapshot after action ran. Mirrors `before` — for `submit_form`
   * carries the post-action submit-lifecycle status, not a field-value snapshot.
   */
  after?: unknown;
  /** Reason when status is `"skipped"`. */
  skippedReason?: "missing-target" | "no-op" | string;
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
    | "broken_library_ref"
    | "deferred_by_debounce"
    | "dropped_by_throttle";
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

/**
 * Phase 3: per-listener-chain mutable accumulator threaded through async
 * action execution. Holds the most recent host_call_await response so
 * `$response` token resolves; tracks branch nesting depth so the engine
 * can enforce the depth-3 cap.
 */
export interface AsyncChainContext {
  responseScope: Record<string, unknown>;
  branchDepth: number;
}

/**
 * Phase 3: a host_call_await action that is currently waiting for a
 * matching host.action_response event. Keyed by `correlationId` in the
 * engine's pending-continuations map.
 */
export interface PendingContinuation {
  correlationId: string;
  listenerId: string;
  actionId: string;
  /** Authoring-time identifier for the host action (e.g. "submit", "prefill"). Null when unset. */
  handlerKey: string | null;
  /** Wall-clock timestamp (ms epoch) when the continuation was registered. */
  createdAt: number;
  resolve: (responsePayload: Record<string, unknown>) => void;
  reject: (reason: string) => void;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
}

/**
 * Read-only snapshot of a pending continuation. Excludes function refs and timer
 * handles so it can be safely passed to UI consumers and serialized.
 */
export interface PendingContinuationSnapshot {
  correlationId: string;
  listenerId: string;
  actionId: string;
  handlerKey: string | null;
  createdAt: number;
}

export interface RuntimeEngine {
  mount(document: AuthoringDocument, options?: RuntimeEngineMountOptions): RuntimeSessionState;
  unmount(): void;
  dispatch(event: RuntimeEventEnvelope): RuntimeSessionState;
  dispatchWithReport(event: RuntimeEventEnvelope): RuntimeDispatchReport;
  /**
   * Phase 3: async-aware dispatch. Resolves once every matched listener
   * chain (including any wait/host_call_await suspensions) completes.
   * Concurrent calls queue FIFO; sync `dispatch` continues to bypass the
   * queue and runs immediately against committed state.
   */
  dispatchAsync(event: RuntimeEventEnvelope): Promise<RuntimeSessionState>;
  dispatchWithReportAsync(event: RuntimeEventEnvelope): Promise<RuntimeDispatchReport>;
  invoke(action: RuntimeActionDefinition): RuntimeSessionState;
  subscribe(handler: RuntimeEventHandler): () => void;
  /**
   * Subscribe to dispatch reports. Every `dispatchWithReport` and
   * `dispatchWithReportAsync` call broadcasts the resulting report to all
   * subscribers. Returns an unsubscribe function. Used by the unified
   * TestPanel's live-record mode and any other observer that needs the
   * full diagnostic envelope (not just the event).
   */
  subscribeReports(handler: (report: RuntimeDispatchReport) => void): () => void;
  getState(): RuntimeSessionState;
  setState(partial: Partial<RuntimeSessionState>): RuntimeSessionState;
  validate(): RuntimeValidationState;
  getSubmitPayload(): RuntimeSubmitPayload;
  getDocument(): AuthoringDocument | null;
  getTrace(): RuntimeTraceEntry[];
  /** Read-only view of pending host_call_await continuations. */
  getPendingContinuations(): PendingContinuationSnapshot[];
}
