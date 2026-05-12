import { test } from "node:test";
import assert from "node:assert/strict";

import type { RuntimeDispatchReport } from "@form-builder/runtime";

import { groupActionsByReceiver } from "./trace-grouping";

test("groupActionsByReceiver buckets actions by targetNodeId", () => {
  const report = {
    listeners: [
      {
        listenerId: "L1",
        matched: true,
        actions: [
          { actionId: "A1", kind: "set_value", target: { fieldId: "F1" }, status: "executed", before: "", after: "x" },
          {
            actionId: "A2",
            kind: "set_visible",
            target: { fieldId: "F2" },
            status: "executed",
            before: false,
            after: true,
          },
          {
            actionId: "A3",
            kind: "set_required",
            target: { fieldId: "F1" },
            status: "executed",
            before: false,
            after: true,
          },
        ],
      },
    ],
  } as unknown as RuntimeDispatchReport;

  const groups = groupActionsByReceiver(report);
  assert.equal(groups.length, 2);
  assert.equal(groups.find((g) => g.targetId === "F1")?.actions.length, 2);
  assert.equal(groups.find((g) => g.targetId === "F2")?.actions.length, 1);
});

test("groupActionsByReceiver skips actions whose listener did not match", () => {
  const report = {
    listeners: [
      {
        listenerId: "L1",
        matched: false,
        skippedReason: "conditions_failed",
        actions: [
          { actionId: "A1", kind: "set_value", target: { fieldId: "F1" }, status: "executed", before: "", after: "x" },
        ],
      },
      {
        listenerId: "L2",
        matched: true,
        actions: [
          {
            actionId: "A2",
            kind: "set_value",
            target: { fieldId: "F2" },
            status: "executed",
            before: "",
            after: "y",
          },
        ],
      },
    ],
  } as unknown as RuntimeDispatchReport;

  const groups = groupActionsByReceiver(report);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.targetId, "F2");
  assert.equal(groups[0]?.actions.length, 1);
  assert.equal(groups[0]?.actions[0]?.listenerId, "L2");
});

test("groupActionsByReceiver skips actions without a target id", () => {
  const report = {
    listeners: [
      {
        listenerId: "L1",
        matched: true,
        actions: [
          { actionId: "A1", kind: "submit_form", target: null, status: "executed" },
          { actionId: "A2", kind: "set_value", target: {}, status: "executed" },
          { actionId: "A3", kind: "set_value", target: { nodeId: "N1" }, status: "executed", before: 1, after: 2 },
        ],
      },
    ],
  } as unknown as RuntimeDispatchReport;

  const groups = groupActionsByReceiver(report);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.targetId, "N1");
  assert.equal(groups[0]?.actions.length, 1);
});

test("groupActionsByReceiver preserves insertion order across listeners", () => {
  const report = {
    listeners: [
      {
        listenerId: "L1",
        matched: true,
        actions: [{ actionId: "A1", kind: "set_value", target: { fieldId: "F2" }, status: "executed" }],
      },
      {
        listenerId: "L2",
        matched: true,
        actions: [
          { actionId: "A2", kind: "set_value", target: { fieldId: "F1" }, status: "executed" },
          { actionId: "A3", kind: "set_value", target: { fieldId: "F2" }, status: "executed" },
        ],
      },
    ],
  } as unknown as RuntimeDispatchReport;

  const groups = groupActionsByReceiver(report);
  assert.deepEqual(
    groups.map((g) => g.targetId),
    ["F2", "F1"],
  );
  assert.equal(groups[0]?.actions.length, 2);
  assert.equal(groups[0]?.actions[0]?.listenerId, "L1");
  assert.equal(groups[0]?.actions[1]?.listenerId, "L2");
});
