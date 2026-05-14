import { test } from "node:test";
import assert from "node:assert/strict";
import { detectPayloadAutocompleteOptions } from "./payload-field-autocomplete-logic";
import type { RuntimePayloadField } from "@form-builder/schema";

const fields: RuntimePayloadField[] = [
  { name: "fieldId", valueType: "string", required: true },
  { name: "nextValue", valueType: "string", required: false },
];

test("detects {{event.payload. prefix and returns matching options", () => {
  const opts = detectPayloadAutocompleteOptions("if {{event.payload.", fields);
  assert.deepEqual(opts.map((o) => o.name).sort(), ["fieldId", "nextValue"]);
});

test("returns empty options when input has no token prefix", () => {
  const opts = detectPayloadAutocompleteOptions("just plain text", fields);
  assert.deepEqual(opts, []);
});

test("returns empty options when fields list is empty", () => {
  const opts = detectPayloadAutocompleteOptions("{{event.payload.", []);
  assert.deepEqual(opts, []);
});
