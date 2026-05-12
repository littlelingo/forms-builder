import type { RuntimeEventEnvelope } from "@form-builder/schema";

/**
 * Mock host bridge stand-in for the Walkthrough route.
 *
 * In production a hosted runtime would forward `form.submit` envelopes to
 * the embedding host (e.g. VA.gov) over HTTP and translate
 * `host_call_await` requests into platform calls. The Walkthrough surface
 * is purely an authoring aid, so we substitute an inert, in-memory bridge
 * that records receipt and echoes payloads. Nothing here may issue a
 * network request — the mock must remain side-effect-free.
 */
export interface MockHostBridge {
  onSubmit: (envelope: RuntimeEventEnvelope) => { ok: true; receivedAt: string };
  onHostCall: (envelope: RuntimeEventEnvelope) => { ok: true; response: Record<string, unknown> };
}

export function createMockHostBridge(): MockHostBridge {
  return {
    onSubmit() {
      return { ok: true, receivedAt: new Date().toISOString() };
    },
    onHostCall(envelope) {
      return { ok: true, response: { status: "stubbed", echo: envelope.payload } };
    },
  };
}
