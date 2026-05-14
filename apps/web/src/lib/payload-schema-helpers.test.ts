import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collectCrossStepRefsForListener,
  isCrossStepReference,
  listPayloadFieldsForEventType,
} from "./payload-schema-helpers";
import type { AuthoringDocument, RuntimeListenerDefinition } from "@form-builder/schema";

const emptyDoc = { id: "d", title: "T", version: "1.0", steps: [] } as unknown as AuthoringDocument;

test("listPayloadFieldsForEventType returns core fields for field.change", () => {
  const fields = listPayloadFieldsForEventType("field.change", emptyDoc);
  const names = fields.map((f) => f.name);
  assert.ok(names.includes("fieldId"), `expected fieldId in ${names.join(",")}`);
  assert.ok(names.includes("nextValue"));
});

test("listPayloadFieldsForEventType returns empty array for unknown type", () => {
  const fields = listPayloadFieldsForEventType("totally.fake.event", emptyDoc);
  assert.deepEqual(fields, []);
});

test("listPayloadFieldsForEventType resolves project event payload from doc", () => {
  const docWithProjectEvent = {
    id: "d",
    title: "T",
    version: "1.0",
    steps: [],
    runtime: {
      projectEvents: [
        {
          id: "pe-1",
          type: "custom.thing",
          payloadShape: {
            fields: [
              { name: "ticketId", valueType: "string", description: "Ticket id", required: true },
            ],
          },
        },
      ],
    },
  } as unknown as AuthoringDocument;
  const fields = listPayloadFieldsForEventType("custom.thing", docWithProjectEvent);
  assert.equal(fields.length, 1);
  assert.equal(fields[0]!.name, "ticketId");
});

const docTwoSteps = {
  id: "d",
  title: "T",
  version: "1.0",
  steps: [
    {
      id: "s1",
      title: "Step 1",
      sections: [{ id: "sec1", fields: [{ id: "f-a" }, { id: "f-b" }], groups: [] }],
    },
    {
      id: "s2",
      title: "Step 2",
      sections: [{ id: "sec2", fields: [{ id: "f-c" }], groups: [] }],
    },
  ],
} as unknown as AuthoringDocument;

test("isCrossStepReference returns info when source + target steps differ", () => {
  const result = isCrossStepReference(docTwoSteps, "f-a", "f-c");
  assert.ok(result, "expected non-null");
  assert.equal(result!.sourceStepId, "s1");
  assert.equal(result!.targetStepId, "s2");
  assert.equal(result!.sourceStepTitle, "Step 1");
  assert.equal(result!.targetStepTitle, "Step 2");
});

test("isCrossStepReference returns null when both nodes share a step", () => {
  assert.equal(isCrossStepReference(docTwoSteps, "f-a", "f-b"), null);
});

test("collectCrossStepRefsForListener returns empty array for self-step listener", () => {
  const listener = {
    id: "L1",
    eventName: "field.change",
    eventSourceNodeId: "f-a",
    dispatcherId: "f-b",
  } as unknown as RuntimeListenerDefinition;
  const refs = collectCrossStepRefsForListener(docTwoSteps, listener, "f-b");
  assert.deepEqual(refs, []);
});

test("collectCrossStepRefsForListener returns refs for cross-step source", () => {
  const listener = {
    id: "L1",
    eventName: "field.change",
    eventSourceNodeId: "f-c",
    dispatcherId: "f-c",
  } as unknown as RuntimeListenerDefinition;
  const refs = collectCrossStepRefsForListener(docTwoSteps, listener, "f-a");
  assert.equal(refs.length, 1);
  assert.equal(refs[0]!.sourceStepId, "s2");
});
