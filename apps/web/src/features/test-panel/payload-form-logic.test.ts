import { test } from "node:test";
import assert from "node:assert/strict";

import type { RuntimePayloadField } from "@form-builder/schema";

import { validatePayloadField, parsePayloadValue } from "./payload-form-logic";

test("validatePayloadField returns ok for matching boolean", () => {
  const field = { name: "ok", valueType: "boolean" } as RuntimePayloadField;
  assert.deepEqual(validatePayloadField(field, "true"), { ok: true });
});

test("validatePayloadField returns error for non-numeric number", () => {
  const field = { name: "n", valueType: "number" } as RuntimePayloadField;
  const result = validatePayloadField(field, "abc");
  assert.equal(result.ok, false);
});

test("validatePayloadField returns error for invalid JSON object", () => {
  const field = { name: "o", valueType: "object" } as RuntimePayloadField;
  const result = validatePayloadField(field, "{not json}");
  assert.equal(result.ok, false);
});

test("parsePayloadValue converts string to typed value", () => {
  const boolField = { name: "b", valueType: "boolean" } as RuntimePayloadField;
  assert.equal(parsePayloadValue(boolField, "true"), true);
  const numField = { name: "n", valueType: "number" } as RuntimePayloadField;
  assert.equal(parsePayloadValue(numField, "42"), 42);
  const objField = { name: "o", valueType: "object" } as RuntimePayloadField;
  assert.deepEqual(parsePayloadValue(objField, '{"a":1}'), { a: 1 });
});
