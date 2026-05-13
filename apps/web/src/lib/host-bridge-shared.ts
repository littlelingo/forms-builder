import type { RuntimeEngine, RuntimeTraceEntry } from "@form-builder/runtime";
import type { RuntimeEventEnvelope } from "@form-builder/schema";

import { findPresetById } from "../features/test-panel/host-presets";
import type { MockHostResponseKind } from "../features/test-panel/host-presets";
import type { BridgePendingEntry, BridgeSource, CollisionEntry, MockHostConfig } from "../features/test-panel/types";

export interface BridgeCallbacks {
  onPendingChange: (entries: BridgePendingEntry[]) => void;
  onCollision: (entry: CollisionEntry) => void;
  /** Captures the form.submit envelope so SubmitEnvelopePreview can render it. */
  onSubmitEnvelope: (envelope: RuntimeEventEnvelope | null) => void;
}

export interface BridgeOptions {
  engine: RuntimeEngine;
  source: BridgeSource;
  getConfig: () => MockHostConfig;
  callbacks: BridgeCallbacks;
}

export interface MockHostBridge {
  /** Manually resolve a pending continuation. */
  resolve: (correlationId: string, kind: MockHostResponseKind, payload: Record<string, unknown>) => void;
  /** Tear down: cancel timers + unsubscribe. */
  dispose: () => void;
}

function buildHostResponseEnvelope(
  source: BridgeSource,
  correlationId: string,
  payload: Record<string, unknown>,
): RuntimeEventEnvelope {
  return {
    type: "host.action_response",
    version: "1.0",
    source: { runtimeId: source, formId: "", projectId: null, nodeId: "host", nodeType: "form" },
    target: { runtimeId: source, formId: "", projectId: null, nodeId: "host", nodeType: "form" },
    payload: { ...payload, correlationId },
    correlationId,
    timestamp: new Date().toISOString(),
  };
}

export function createMockHostBridge(options: BridgeOptions): MockHostBridge {
  const { engine, source, getConfig, callbacks } = options;
  const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function pushPending(): void {
    const snapshot = engine.getPendingContinuations();
    callbacks.onPendingChange(snapshot.map((p) => ({ ...p, source })));
  }

  function dispatchHostResponse(correlationId: string, payload: Record<string, unknown>): void {
    engine.dispatch(buildHostResponseEnvelope(source, correlationId, payload));
  }

  function scheduleAutoRespond(correlationId: string): void {
    const config = getConfig();
    const { defaults } = config;
    if (defaults.failureMode === "timeout") {
      return; // engine times out naturally
    }
    const preset = defaults.presetId ? findPresetById(defaults.presetId) : null;
    const payload = defaults.payload ?? preset?.payload ?? { ok: true };
    const delay = Math.max(0, Math.min(30000, defaults.delayMs));
    const timer = setTimeout(() => {
      pendingTimers.delete(correlationId);
      if (defaults.failureMode === "network-error") {
        dispatchHostResponse(correlationId, {
          error: { code: "NETWORK_ERROR", message: "Simulated network failure." },
          __simulatedNetworkError: true,
        });
      } else {
        dispatchHostResponse(correlationId, payload);
      }
    }, delay);
    pendingTimers.set(correlationId, timer);
  }

  const unsubscribe = engine.subscribe((event: RuntimeEventEnvelope) => {
    switch (event.type) {
      case "host.action_requested": {
        const payload = (event.payload ?? {}) as Record<string, unknown>;
        const correlationId = String(payload.correlationId ?? "");
        if (correlationId) scheduleAutoRespond(correlationId);
        pushPending();
        return;
      }
      case "host.action_response": {
        pushPending();
        return;
      }
      case "form.submit": {
        callbacks.onSubmitEnvelope(event);
        return;
      }
      case "form.submit_success":
      case "form.submit_error": {
        callbacks.onSubmitEnvelope(null);
        return;
      }
      case "runtime.continuation_collision": {
        const payload = (event.payload ?? {}) as Record<string, unknown>;
        const entry: CollisionEntry = {
          correlationId: String(payload.correlationId ?? ""),
          handlerKey: typeof payload.handlerKey === "string" ? payload.handlerKey : null,
          timestamp: event.timestamp,
          trace: { direction: "internal", event } as RuntimeTraceEntry,
        };
        callbacks.onCollision(entry);
        return;
      }
      default:
        return;
    }
  });

  // Initial snapshot.
  pushPending();

  return {
    resolve(correlationId, kind, payload) {
      const timer = pendingTimers.get(correlationId);
      if (timer) {
        clearTimeout(timer);
        pendingTimers.delete(correlationId);
      }
      if (kind === "timeout") {
        return; // let engine time out
      }
      if (kind === "network-error") {
        dispatchHostResponse(correlationId, {
          error: { code: "NETWORK_ERROR", message: "Simulated network failure." },
          __simulatedNetworkError: true,
        });
        return;
      }
      dispatchHostResponse(correlationId, payload);
    },
    dispose() {
      for (const timer of pendingTimers.values()) clearTimeout(timer);
      pendingTimers.clear();
      unsubscribe();
    },
  };
}
