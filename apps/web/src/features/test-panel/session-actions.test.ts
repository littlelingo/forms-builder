import { test } from "node:test";
import assert from "node:assert/strict";

import type { AuthoringField, AuthoringStep, RuntimeSessionState } from "@form-builder/schema";

import { collectRequiredFillTargets, defaultValueForField } from "./session-actions";

function baseField(over: Partial<AuthoringField>): AuthoringField {
  return {
    id: "f1",
    stableKey: "field-1",
    label: "Field 1",
    semanticType: "text",
    required: true,
    options: [],
    validations: [],
    layoutHints: {},
    rendererHints: {},
    sourcePriority: [],
    sourceConflicts: [],
    lineage: [],
    sourceFieldIds: [],
    provenanceAnchorIds: [],
    ...over,
  } as AuthoringField;
}

function makeSessionState(over: Partial<RuntimeSessionState>): RuntimeSessionState {
  return {
    currentStepId: null,
    values: {},
    nodes: {},
    validation: { valid: true, errors: [], warnings: [] },
    submit: { status: "idle", lastCorrelationId: null, message: null, fieldErrors: null },
    hostContextSnapshot: null,
    ...over,
  };
}

test("defaultValueForField returns sensible defaults per semantic type", () => {
  assert.equal(defaultValueForField(baseField({ semanticType: "text" })), "Test value");
  assert.equal(defaultValueForField(baseField({ semanticType: "number" })), 0);
  assert.equal(
    defaultValueForField(
      baseField({
        semanticType: "radio",
        options: [{ value: "a", label: "A", orderIndex: 0, selectedByDefault: false, evidence: [] }],
      }),
    ),
    "a",
  );
  assert.deepEqual(
    defaultValueForField(
      baseField({
        semanticType: "select",
        options: [{ value: "s1", label: "S1", orderIndex: 0, selectedByDefault: false, evidence: [] }],
      }),
    ),
    "s1",
  );
  assert.deepEqual(
    defaultValueForField(
      baseField({
        semanticType: "checkbox",
        options: [{ value: "x", label: "X", orderIndex: 0, selectedByDefault: false, evidence: [] }],
      }),
    ),
    ["x"],
  );
  assert.match(defaultValueForField(baseField({ semanticType: "date" })) as string, /^\d{4}-\d{2}-\d{2}$/);
  // signature_attestation is treated as a boolean-like attestation; expect true.
  assert.equal(defaultValueForField(baseField({ semanticType: "signature_attestation" })), true);
});

test("collectRequiredFillTargets returns required, visible, enabled fields with no value yet", () => {
  const step: AuthoringStep = {
    id: "s1",
    title: "Step 1",
    kind: "form",
    layoutHints: {},
    sourcePageIds: [],
    provenanceAnchorIds: [],
    sections: [
      {
        id: "sec1",
        title: "Section",
        layoutHints: {},
        lineage: [],
        sourceSectionIds: [],
        provenanceAnchorIds: [],
        groups: [],
        fields: [
          baseField({ id: "a", required: true }),
          baseField({ id: "b", required: false }),
          baseField({ id: "c", required: true }),
        ],
      },
    ],
  };
  const sessionState = makeSessionState({
    values: { a: "", c: "already filled" },
    nodes: {
      a: { visible: true, enabled: true, required: true },
      b: { visible: true, enabled: true, required: false },
      c: { visible: true, enabled: true, required: true },
    },
  });
  const targets = collectRequiredFillTargets(step, sessionState);
  // Should pick "a" (required + empty), skip "b" (not required), skip "c" (already filled).
  assert.deepEqual(
    targets.map((t) => t.field.id),
    ["a"],
  );
});

test("collectRequiredFillTargets skips invisible fields", () => {
  const step: AuthoringStep = {
    id: "s1",
    title: "Step",
    kind: "form",
    layoutHints: {},
    sourcePageIds: [],
    provenanceAnchorIds: [],
    sections: [
      {
        id: "sec",
        title: "Section",
        layoutHints: {},
        lineage: [],
        sourceSectionIds: [],
        provenanceAnchorIds: [],
        groups: [],
        fields: [baseField({ id: "x", required: true })],
      },
    ],
  };
  const sessionState = makeSessionState({
    values: {},
    nodes: { x: { visible: false, enabled: true, required: true } },
  });
  assert.equal(collectRequiredFillTargets(step, sessionState).length, 0);
});

test("collectRequiredFillTargets skips disabled fields", () => {
  const step: AuthoringStep = {
    id: "s1",
    title: "Step",
    kind: "form",
    layoutHints: {},
    sourcePageIds: [],
    provenanceAnchorIds: [],
    sections: [
      {
        id: "sec",
        title: "Section",
        layoutHints: {},
        lineage: [],
        sourceSectionIds: [],
        provenanceAnchorIds: [],
        groups: [],
        fields: [baseField({ id: "y", required: true })],
      },
    ],
  };
  const sessionState = makeSessionState({
    values: {},
    nodes: { y: { visible: true, enabled: false, required: true } },
  });
  assert.equal(collectRequiredFillTargets(step, sessionState).length, 0);
});
