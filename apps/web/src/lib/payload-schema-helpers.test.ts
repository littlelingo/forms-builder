import { test } from "node:test";
import assert from "node:assert/strict";
import { listPayloadFieldsForEventType } from "./payload-schema-helpers";
import type { AuthoringDocument } from "@form-builder/schema";

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
