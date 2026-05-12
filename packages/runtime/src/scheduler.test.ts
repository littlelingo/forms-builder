/**
 * Phase 3 Stage F — listener scheduler unit tests.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createListenerScheduler } from "./scheduler";

test("Phase 3 Stage F: debounce collapses N rapid calls into one execution", async () => {
  const scheduler = createListenerScheduler();
  let calls = 0;
  const fn = () => {
    calls += 1;
  };
  // Five back-to-back calls — only the last should run.
  for (let i = 0; i < 5; i++) {
    scheduler.schedule("listener-1", { debounce_ms: 20 }, fn);
  }
  assert.equal(calls, 0, "debounce must not fire synchronously");
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(calls, 1, "exactly one call should land after the debounce window");
  scheduler.reset();
});

test("Phase 3 Stage F: throttle passes the first call and drops within-window calls", () => {
  const scheduler = createListenerScheduler();
  let calls = 0;
  const fn = () => {
    calls += 1;
  };
  let now = 0;
  const clock = () => now;
  scheduler.schedule("listener-2", { throttle_ms: 50 }, fn, clock);
  assert.equal(calls, 1, "first call passes immediately");
  now = 25;
  scheduler.schedule("listener-2", { throttle_ms: 50 }, fn, clock);
  assert.equal(calls, 1, "second call within window is dropped");
  now = 60;
  scheduler.schedule("listener-2", { throttle_ms: 50 }, fn, clock);
  assert.equal(calls, 2, "third call past the window passes");
  scheduler.reset();
});

test("Phase 3 Stage F: debounce wins when both debounce and throttle are set", async () => {
  const scheduler = createListenerScheduler();
  let calls = 0;
  scheduler.schedule("listener-3", { debounce_ms: 20, throttle_ms: 100 }, () => {
    calls += 1;
  });
  assert.equal(calls, 0);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(calls, 1, "debounce determined the timing — fired once after 20ms");
  scheduler.reset();
});

test("Phase 3 Stage F: reset cancels pending debounce timers", async () => {
  const scheduler = createListenerScheduler();
  let calls = 0;
  scheduler.schedule("listener-4", { debounce_ms: 30 }, () => {
    calls += 1;
  });
  scheduler.reset();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(calls, 0, "reset must clear pending timers so fn never runs");
});

test("Phase 3 Stage F: flush clears throttle lastRun for the given listener only", () => {
  const scheduler = createListenerScheduler();
  let aCalls = 0;
  let bCalls = 0;
  let now = 100;
  const clock = () => now;
  scheduler.schedule("a", { throttle_ms: 50 }, () => (aCalls += 1), clock);
  scheduler.schedule("b", { throttle_ms: 50 }, () => (bCalls += 1), clock);
  assert.equal(aCalls, 1);
  assert.equal(bCalls, 1);

  scheduler.flush("a");
  // a was flushed → next call passes regardless of window
  scheduler.schedule("a", { throttle_ms: 50 }, () => (aCalls += 1), clock);
  scheduler.schedule("b", { throttle_ms: 50 }, () => (bCalls += 1), clock);
  assert.equal(aCalls, 2, "a should pass because flush reset its lastRun");
  assert.equal(bCalls, 1, "b is still throttled");
  scheduler.reset();
});

test("Phase 3 Stage F: zero or missing timing runs synchronously without scheduling", () => {
  const scheduler = createListenerScheduler();
  let calls = 0;
  scheduler.schedule("listener-5", {}, () => (calls += 1));
  scheduler.schedule("listener-5", { debounce_ms: 0 }, () => (calls += 1));
  scheduler.schedule("listener-5", { throttle_ms: 0 }, () => (calls += 1));
  assert.equal(calls, 3, "empty/zero timing must call fn synchronously");
});
