import { test } from "node:test";
import assert from "node:assert/strict";

import type { PendingContinuationSnapshot, RuntimeEngine } from "@form-builder/runtime";
import type { RuntimeEventEnvelope } from "@form-builder/schema";

import { createMockHostBridge } from "./host-bridge-shared";
import type { BridgePendingEntry, CollisionEntry, MockHostConfig } from "../features/test-panel/types";

interface FakeEngineHandle {
  engine: RuntimeEngine;
  fire: (event: RuntimeEventEnvelope) => void;
  setPending: (next: PendingContinuationSnapshot[]) => void;
  getDispatched: () => RuntimeEventEnvelope[];
  handlerCount: () => number;
}

function makeFakeEngine(initialPending: PendingContinuationSnapshot[] = []): FakeEngineHandle {
  const handlers: Array<(e: RuntimeEventEnvelope) => void> = [];
  const dispatched: RuntimeEventEnvelope[] = [];
  let pending = initialPending;
  const engine = {
    subscribe(h: (e: RuntimeEventEnvelope) => void): () => void {
      handlers.push(h);
      return () => {
        const i = handlers.indexOf(h);
        if (i >= 0) handlers.splice(i, 1);
      };
    },
    dispatch(e: RuntimeEventEnvelope) {
      dispatched.push(e);
      return {} as never;
    },
    getPendingContinuations(): PendingContinuationSnapshot[] {
      return pending;
    },
  } as unknown as RuntimeEngine;
  return {
    engine,
    fire(e) {
      handlers.forEach((h) => h(e));
    },
    setPending(next) {
      pending = next;
    },
    getDispatched() {
      return dispatched;
    },
    handlerCount() {
      return handlers.length;
    },
  };
}

function makeHostRequestEnvelope(correlationId: string, handlerKey = "submit"): RuntimeEventEnvelope {
  return {
    type: "host.action_requested",
    version: "1.0",
    source: { runtimeId: "test", formId: "test", projectId: null, nodeId: "host", nodeType: "form" },
    payload: { correlationId, handlerKey },
    correlationId,
    timestamp: new Date().toISOString(),
  };
}

test("auto-respond resolves pending entry with default response after delay", async () => {
  const fake = makeFakeEngine();
  const config: MockHostConfig = {
    defaults: { presetId: "submit-success", payload: null, delayMs: 10, failureMode: "none" },
  };
  createMockHostBridge({
    engine: fake.engine,
    source: "builder",
    getConfig: () => config,
    callbacks: { onPendingChange: () => {}, onCollision: () => {}, onSubmitEnvelope: () => {} },
  });
  fake.fire(makeHostRequestEnvelope("c-1"));
  await new Promise((r) => setTimeout(r, 30));
  const dispatched = fake.getDispatched();
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0]!.type, "host.action_response");
  assert.equal(dispatched[0]!.correlationId, "c-1");
  // Payload contains correlationId + preset payload (ok: true).
  assert.equal((dispatched[0]!.payload as Record<string, unknown>).correlationId, "c-1");
  assert.equal((dispatched[0]!.payload as Record<string, unknown>).ok, true);
});

test("failureMode 'timeout' lets engine time out (no bridge dispatch)", async () => {
  const fake = makeFakeEngine();
  const config: MockHostConfig = {
    defaults: { presetId: null, payload: null, delayMs: 10, failureMode: "timeout" },
  };
  createMockHostBridge({
    engine: fake.engine,
    source: "builder",
    getConfig: () => config,
    callbacks: { onPendingChange: () => {}, onCollision: () => {}, onSubmitEnvelope: () => {} },
  });
  fake.fire(makeHostRequestEnvelope("c-2"));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(fake.getDispatched().length, 0);
});

test("failureMode 'network-error' dispatches malformed payload", async () => {
  const fake = makeFakeEngine();
  const config: MockHostConfig = {
    defaults: { presetId: null, payload: null, delayMs: 5, failureMode: "network-error" },
  };
  createMockHostBridge({
    engine: fake.engine,
    source: "builder",
    getConfig: () => config,
    callbacks: { onPendingChange: () => {}, onCollision: () => {}, onSubmitEnvelope: () => {} },
  });
  fake.fire(makeHostRequestEnvelope("c-3"));
  await new Promise((r) => setTimeout(r, 20));
  const dispatched = fake.getDispatched();
  assert.equal(dispatched.length, 1);
  const payload = dispatched[0]!.payload as Record<string, unknown>;
  assert.equal(payload.__simulatedNetworkError, true);
  assert.equal(payload.correlationId, "c-3");
});

test("manual resolve('success', payload) cancels auto-timer + dispatches with payload", async () => {
  const fake = makeFakeEngine();
  const config: MockHostConfig = {
    defaults: { presetId: "submit-success", payload: null, delayMs: 1000, failureMode: "none" },
  };
  const bridge = createMockHostBridge({
    engine: fake.engine,
    source: "builder",
    getConfig: () => config,
    callbacks: { onPendingChange: () => {}, onCollision: () => {}, onSubmitEnvelope: () => {} },
  });
  fake.fire(makeHostRequestEnvelope("c-4"));
  bridge.resolve("c-4", "success", { custom: "manual" });
  // Wait longer than initial-snapshot tick to confirm no auto-timer fires later.
  await new Promise((r) => setTimeout(r, 20));
  const dispatched = fake.getDispatched();
  assert.equal(dispatched.length, 1);
  const payload = dispatched[0]!.payload as Record<string, unknown>;
  assert.equal(payload.custom, "manual");
  assert.equal(payload.correlationId, "c-4");
});

test("manual resolve('timeout') cancels timer + does NOT dispatch", async () => {
  const fake = makeFakeEngine();
  const config: MockHostConfig = {
    defaults: { presetId: "submit-success", payload: null, delayMs: 50, failureMode: "none" },
  };
  const bridge = createMockHostBridge({
    engine: fake.engine,
    source: "builder",
    getConfig: () => config,
    callbacks: { onPendingChange: () => {}, onCollision: () => {}, onSubmitEnvelope: () => {} },
  });
  fake.fire(makeHostRequestEnvelope("c-5"));
  bridge.resolve("c-5", "timeout", {});
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(fake.getDispatched().length, 0);
});

test("bridge tags pending entries with source", () => {
  const fake = makeFakeEngine([
    { correlationId: "c-x", listenerId: "L", actionId: "A", handlerKey: "submit", createdAt: 1 },
  ]);
  let captured: BridgePendingEntry[] = [];
  createMockHostBridge({
    engine: fake.engine,
    source: "walkthrough",
    getConfig: () => ({
      defaults: { presetId: null, payload: null, delayMs: 0, failureMode: "none" },
    }),
    callbacks: {
      onPendingChange: (e) => {
        captured = e;
      },
      onCollision: () => {},
      onSubmitEnvelope: () => {},
    },
  });
  // initial snapshot pushed synchronously
  assert.equal(captured.length, 1);
  assert.equal(captured[0]!.source, "walkthrough");
  assert.equal(captured[0]!.correlationId, "c-x");
  assert.equal(captured[0]!.handlerKey, "submit");
});

test("submit envelope captured on form.submit + cleared on form.submit_success", () => {
  const fake = makeFakeEngine();
  let envelope: RuntimeEventEnvelope | null = null;
  createMockHostBridge({
    engine: fake.engine,
    source: "builder",
    getConfig: () => ({
      defaults: { presetId: null, payload: null, delayMs: 0, failureMode: "none" },
    }),
    callbacks: {
      onPendingChange: () => {},
      onCollision: () => {},
      onSubmitEnvelope: (e) => {
        envelope = e;
      },
    },
  });
  const submit: RuntimeEventEnvelope = {
    type: "form.submit",
    version: "1.0",
    source: { runtimeId: "test", formId: "test", projectId: null, nodeId: "host", nodeType: "form" },
    payload: { x: 1 },
    correlationId: "submit-1",
    timestamp: new Date().toISOString(),
  };
  fake.fire(submit);
  assert.equal(envelope, submit);
  const ack: RuntimeEventEnvelope = {
    type: "form.submit_success",
    version: "1.0",
    source: { runtimeId: "test", formId: "test", projectId: null, nodeId: "host", nodeType: "form" },
    payload: { ok: true },
    correlationId: "submit-1",
    timestamp: new Date().toISOString(),
  };
  fake.fire(ack);
  assert.equal(envelope, null);
});

test("collision event delivered to onCollision callback", () => {
  const fake = makeFakeEngine();
  const collisions: CollisionEntry[] = [];
  createMockHostBridge({
    engine: fake.engine,
    source: "builder",
    getConfig: () => ({
      defaults: { presetId: null, payload: null, delayMs: 0, failureMode: "none" },
    }),
    callbacks: {
      onPendingChange: () => {},
      onCollision: (entry) => collisions.push(entry),
      onSubmitEnvelope: () => {},
    },
  });
  const ts = new Date().toISOString();
  fake.fire({
    type: "runtime.continuation_collision",
    version: "1.0",
    source: { runtimeId: "test", formId: "test", projectId: null, nodeId: "host", nodeType: "form" },
    payload: { correlationId: "c-collide", handlerKey: "submit" },
    correlationId: "c-collide",
    timestamp: ts,
  });
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0]!.correlationId, "c-collide");
  assert.equal(collisions[0]!.handlerKey, "submit");
  assert.equal(collisions[0]!.timestamp, ts);
  assert.equal(collisions[0]!.trace.direction, "internal");
});

test("dispose cancels timers + unsubscribes", async () => {
  const fake = makeFakeEngine();
  const config: MockHostConfig = {
    defaults: { presetId: "submit-success", payload: null, delayMs: 50, failureMode: "none" },
  };
  const bridge = createMockHostBridge({
    engine: fake.engine,
    source: "builder",
    getConfig: () => config,
    callbacks: { onPendingChange: () => {}, onCollision: () => {}, onSubmitEnvelope: () => {} },
  });
  fake.fire(makeHostRequestEnvelope("c-6"));
  assert.equal(fake.handlerCount(), 1);
  bridge.dispose();
  assert.equal(fake.handlerCount(), 0);
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(fake.getDispatched().length, 0);
});
