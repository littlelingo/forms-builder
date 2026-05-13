import { test } from "node:test";
import assert from "node:assert/strict";

import type {
  AuthoringDocument,
  AuthoringField,
  AuthoringGroup,
  AuthoringSection,
  AuthoringStep,
  RuntimeActionDefinition,
  RuntimeListenerDefinition,
} from "@form-builder/schema";

import { collectKeys } from "./handler-key-autocomplete";

// ---------------------------------------------------------------------------
// Fixture helpers — keep tests readable while building up minimal documents.
// ---------------------------------------------------------------------------

function makeAction(
  id: string,
  kind: RuntimeActionDefinition["kind"],
  config: Record<string, unknown> = {},
): RuntimeActionDefinition {
  return {
    id,
    kind,
    target: null,
    config,
    continueOnError: false,
  };
}

function makeListener(
  id: string,
  actions: RuntimeActionDefinition[],
  label?: string,
): RuntimeListenerDefinition {
  return {
    id,
    label: label ?? null,
    eventName: "field.change",
    enabled: true,
    conditions: [],
    actions,
  };
}

function makeField(
  id: string,
  listeners: RuntimeListenerDefinition[] = [],
): AuthoringField {
  return {
    id,
    stableKey: id,
    label: id,
    semanticType: "text",
    required: false,
    options: [],
    validations: [],
    layoutHints: {},
    rendererHints: {},
    sourcePriority: [],
    sourceConflicts: [],
    lineage: [],
    sourceFieldIds: [],
    provenanceAnchorIds: [],
    runtime: listeners.length ? { eventSources: [], listeners } : null,
  };
}

function makeGroup(
  id: string,
  fields: AuthoringField[],
  listeners: RuntimeListenerDefinition[] = [],
): AuthoringGroup {
  return {
    id,
    label: id,
    layoutHints: {},
    rendererHints: {},
    lineage: [],
    sourceGroupIds: [],
    provenanceAnchorIds: [],
    fields,
    runtime: listeners.length ? { eventSources: [], listeners } : null,
  };
}

function makeSection(
  id: string,
  fields: AuthoringField[],
  groups: AuthoringGroup[] = [],
  listeners: RuntimeListenerDefinition[] = [],
): AuthoringSection {
  return {
    id,
    title: id,
    layoutHints: {},
    lineage: [],
    sourceSectionIds: [],
    provenanceAnchorIds: [],
    groups,
    fields,
    runtime: listeners.length ? { eventSources: [], listeners } : null,
  };
}

function makeStep(
  id: string,
  sections: AuthoringSection[],
  listeners: RuntimeListenerDefinition[] = [],
): AuthoringStep {
  return {
    id,
    title: id,
    kind: "standard",
    layoutHints: {},
    sourcePageIds: [],
    provenanceAnchorIds: [],
    sections,
    runtime: listeners.length ? { eventSources: [], listeners } : null,
  };
}

function makeDoc(
  steps: AuthoringStep[],
  formListeners: RuntimeListenerDefinition[] = [],
): AuthoringDocument {
  return {
    id: "doc-1",
    title: "Doc",
    documentClass: "form" as AuthoringDocument["documentClass"],
    reviewStatus: "draft" as AuthoringDocument["reviewStatus"],
    targetRuntime: "web",
    visualBaseline: "uswds",
    sourcePriority: [],
    sourceConflicts: [],
    steps,
    metadata: {},
    runtime: formListeners.length
      ? {
          version: "1.0",
          formEvents: [],
          formListeners,
          hostBindings: [],
          submitEventName: "form.submit",
          sessionStateShape: { mode: "key_value", fields: [] },
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("collectKeys returns unique handlerKeys from doc", () => {
  const listener = makeListener("L1", [
    makeAction("a1", "host_call_await", { handlerKey: "submit" }),
    makeAction("a2", "host_action", { handlerKey: "prefill" }),
  ]);
  const doc = makeDoc([makeStep("s1", [makeSection("sec1", [makeField("f1", [listener])])])]);

  const keys = collectKeys(doc)
    .map((k) => k.key)
    .sort();
  assert.deepEqual(keys, ["prefill", "submit"]);
});

test("collectKeys finds host_call_await + host_action", () => {
  const listener = makeListener("L1", [
    makeAction("a1", "host_call_await", { handlerKey: "submit" }),
    makeAction("a2", "host_action", { handlerKey: "prefill" }),
  ]);
  const doc = makeDoc([makeStep("s1", [makeSection("sec1", [makeField("f1", [listener])])])]);

  const result = collectKeys(doc);
  assert.equal(result.length, 2);
});

test("collectKeys returns empty array when doc has no host actions", () => {
  const empty = makeDoc([]);
  assert.deepEqual(collectKeys(empty), []);
});

test("collectKeys orders by frequency desc then alphabetical", () => {
  const listener = makeListener("L1", [
    makeAction("a1", "host_call_await", { handlerKey: "submit" }),
    makeAction("a2", "host_action", { handlerKey: "submit" }),
    makeAction("a3", "host_call_await", { handlerKey: "submit" }),
    makeAction("a4", "host_action", { handlerKey: "prefill" }),
  ]);
  const doc = makeDoc([makeStep("s1", [makeSection("sec1", [makeField("f1", [listener])])])]);

  const keys = collectKeys(doc);
  assert.equal(keys[0]!.key, "submit");
  assert.equal(keys[0]!.frequency, 3);
  assert.equal(keys[1]!.key, "prefill");
  assert.equal(keys[1]!.frequency, 1);
});

test("collectKeys walks branch arms recursively", () => {
  const listener = makeListener("L1", [
    makeAction("a1", "branch", {
      conditions: [],
      actions: [makeAction("then-1", "host_call_await", { handlerKey: "A" })],
      else: [makeAction("else-1", "host_call_await", { handlerKey: "B" })],
    }),
  ]);
  const doc = makeDoc([makeStep("s1", [makeSection("sec1", [makeField("f1", [listener])])])]);

  const keys = collectKeys(doc)
    .map((k) => k.key)
    .sort();
  assert.deepEqual(keys, ["A", "B"]);
});

test("collectKeys walks listeners attached at every authoring level", () => {
  // One host action at each level: form, step, section, group, group-field, section-field.
  const doc = makeDoc(
    [
      makeStep(
        "step-1",
        [
          makeSection(
            "section-1",
            [makeField("section-field", [makeListener("L-sf", [makeAction("a-sf", "host_action", { handlerKey: "sf" })])])],
            [
              makeGroup(
                "group-1",
                [makeField("group-field", [makeListener("L-gf", [makeAction("a-gf", "host_action", { handlerKey: "gf" })])])],
                [makeListener("L-grp", [makeAction("a-grp", "host_action", { handlerKey: "grp" })])],
              ),
            ],
            [makeListener("L-sec", [makeAction("a-sec", "host_action", { handlerKey: "sec" })])],
          ),
        ],
        [makeListener("L-step", [makeAction("a-step", "host_action", { handlerKey: "step" })])],
      ),
    ],
    [makeListener("L-form", [makeAction("a-form", "host_action", { handlerKey: "form" })])],
  );

  const keys = collectKeys(doc)
    .map((k) => k.key)
    .sort();
  assert.deepEqual(keys, ["form", "gf", "grp", "sec", "sf", "step"]);
});

test("collectKeys captures listenerLabels for each hit", () => {
  const listenerA = makeListener("L1", [makeAction("a1", "host_action", { handlerKey: "submit" })], "Listener A");
  const listenerB = makeListener("L2", [makeAction("a2", "host_action", { handlerKey: "submit" })], "Listener B");
  const doc = makeDoc([
    makeStep("s1", [makeSection("sec1", [makeField("f1", [listenerA]), makeField("f2", [listenerB])])]),
  ]);

  const result = collectKeys(doc);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.frequency, 2);
  assert.deepEqual([...result[0]!.listenerLabels].sort(), ["Listener A", "Listener B"]);
});

test("collectKeys ignores host actions without a string handlerKey", () => {
  const listener = makeListener("L1", [
    makeAction("a1", "host_call_await", {}),
    makeAction("a2", "host_action", { handlerKey: "" }),
    makeAction("a3", "host_action", { handlerKey: 42 }),
    makeAction("a4", "host_action", { handlerKey: "real" }),
  ]);
  const doc = makeDoc([makeStep("s1", [makeSection("sec1", [makeField("f1", [listener])])])]);

  const keys = collectKeys(doc);
  assert.deepEqual(
    keys.map((k) => k.key),
    ["real"],
  );
});
