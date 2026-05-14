import { test } from "node:test";
import assert from "node:assert/strict";
import { HOST_PRESETS, findPresetById, getPresetsByHandlerKey } from "./host-presets";

test("HOST_PRESETS exports the expected preset ids", () => {
  const ids = HOST_PRESETS.map((p) => p.id);
  assert.ok(ids.includes("submit-success"));
  assert.ok(ids.includes("submit-error"));
  assert.ok(ids.includes("prefill-success"));
  assert.ok(ids.includes("prefill-error"));
  assert.ok(ids.includes("host-call-timeout"));
  assert.ok(ids.includes("host-call-network-error"));
});

test("each preset kind is one of success/error/timeout/network-error", () => {
  const validKinds = new Set(["success", "error", "timeout", "network-error"]);
  for (const preset of HOST_PRESETS) {
    assert.ok(validKinds.has(preset.kind), `preset ${preset.id} has invalid kind ${preset.kind}`);
  }
});

test("each preset payload is JSON-serializable", () => {
  for (const preset of HOST_PRESETS) {
    assert.doesNotThrow(() => JSON.stringify(preset.payload), `preset ${preset.id} payload not serializable`);
  }
});

test("getPresetsByHandlerKey returns presets matching that handlerKey + generic", () => {
  const submitPresets = getPresetsByHandlerKey("submit");
  assert.ok(submitPresets.some((p) => p.id === "submit-success"));
  assert.ok(submitPresets.some((p) => p.id === "submit-error"));
  // Generic presets (empty handlerKey) should also appear
  assert.ok(submitPresets.some((p) => p.id === "host-call-timeout"));
});

test("findPresetById returns the preset or null", () => {
  assert.equal(findPresetById("submit-success")?.id, "submit-success");
  assert.equal(findPresetById("missing"), null);
});
