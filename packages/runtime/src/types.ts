import type {
  RuntimeActionDefinition,
  AuthoringDocument,
  RuntimeEventEnvelope,
  RuntimeHostContext,
  RuntimeSessionState,
  RuntimeSubmitPayload,
  RuntimeValidationState,
} from "@form-builder/schema";

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

export interface RuntimeEngine {
  mount(document: AuthoringDocument, options?: RuntimeEngineMountOptions): RuntimeSessionState;
  unmount(): void;
  dispatch(event: RuntimeEventEnvelope): RuntimeSessionState;
  invoke(action: RuntimeActionDefinition): RuntimeSessionState;
  subscribe(handler: RuntimeEventHandler): () => void;
  getState(): RuntimeSessionState;
  setState(partial: Partial<RuntimeSessionState>): RuntimeSessionState;
  validate(): RuntimeValidationState;
  getSubmitPayload(): RuntimeSubmitPayload;
  getDocument(): AuthoringDocument | null;
  getTrace(): RuntimeTraceEntry[];
}
