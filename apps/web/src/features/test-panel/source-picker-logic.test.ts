import { test } from "node:test";
import assert from "node:assert/strict";

import type { RuntimeEventSourceCandidate } from "../behavior/utils/runtime-helpers";

import { ancestorIds, buildSourcePickerTree, flatRank } from "./source-picker-logic";

function makeCandidate(overrides: Partial<RuntimeEventSourceCandidate>): RuntimeEventSourceCandidate {
  return {
    id: overrides.id ?? "x",
    dispatchKey: overrides.dispatchKey ?? null,
    nodeType: overrides.nodeType ?? "field",
    label: overrides.label ?? "",
    componentLabel: overrides.componentLabel ?? "",
    locationLabel: overrides.locationLabel ?? "",
    semanticType: overrides.semanticType ?? null,
    pathIds: overrides.pathIds ?? [],
    events: overrides.events ?? [],
    eventDefinitions: overrides.eventDefinitions ?? [],
  };
}

function buildHierarchyFixture(): RuntimeEventSourceCandidate[] {
  return [
    makeCandidate({
      id: "form-1",
      nodeType: "form",
      componentLabel: "Form",
      label: "Demo form",
      pathIds: ["form-1"],
    }),
    makeCandidate({
      id: "step-1",
      nodeType: "step",
      componentLabel: "Step",
      label: "Personal info",
      pathIds: ["form-1", "step-1"],
    }),
    makeCandidate({
      id: "section-1",
      nodeType: "section",
      componentLabel: "Demographics",
      label: "Demographics section",
      pathIds: ["form-1", "step-1", "section-1"],
    }),
    makeCandidate({
      id: "group-1",
      nodeType: "group",
      componentLabel: "Sex selector",
      label: "Sex group",
      pathIds: ["form-1", "step-1", "section-1", "group-1"],
    }),
    makeCandidate({
      id: "radio-male",
      nodeType: "field",
      componentLabel: "Male",
      label: "Male radio",
      pathIds: ["form-1", "step-1", "section-1", "group-1", "radio-male"],
    }),
    makeCandidate({
      id: "radio-female",
      nodeType: "field",
      componentLabel: "Female",
      label: "Female radio",
      pathIds: ["form-1", "step-1", "section-1", "group-1", "radio-female"],
    }),
  ];
}

test("buildSourcePickerTree creates parent-child relationships from pathIds", () => {
  const tree = buildSourcePickerTree(buildHierarchyFixture());
  assert.deepEqual(tree.rootIds, ["form-1"], "single form root");

  const form = tree.byId.get("form-1");
  assert.ok(form, "form node present");
  assert.deepEqual(form!.childIds, ["step-1"], "form has step child");
  assert.equal(form!.parentId, null, "form has no parent");

  const step = tree.byId.get("step-1");
  assert.ok(step, "step node present");
  assert.equal(step!.parentId, "form-1", "step parent is form");
  assert.deepEqual(step!.childIds, ["section-1"], "step has section child");

  const section = tree.byId.get("section-1");
  assert.ok(section, "section node present");
  assert.equal(section!.parentId, "step-1", "section parent is step");
  assert.deepEqual(section!.childIds, ["group-1"], "section has group child");

  const group = tree.byId.get("group-1");
  assert.ok(group, "group node present");
  assert.equal(group!.parentId, "section-1", "group parent is section");
  assert.deepEqual(group!.childIds, ["radio-male", "radio-female"], "group has two radio children");

  const male = tree.byId.get("radio-male");
  assert.ok(male, "male node present");
  assert.equal(male!.parentId, "group-1", "male parent is group");
  assert.deepEqual(male!.childIds, [], "male leaf has no children");
  assert.deepEqual(
    male!.pathLabels,
    ["Form", "Step", "Demographics", "Sex selector", "Male"],
    "male pathLabels span root to leaf",
  );
});

test("ancestorIds returns ordered chain from root to target", () => {
  const tree = buildSourcePickerTree(buildHierarchyFixture());
  const radioMale = [...tree.byId.values()].find((node) => node.label === "Male");
  assert.ok(radioMale, "fixture should include male radio");

  const chain = ancestorIds(tree, radioMale!.id);
  assert.deepEqual(chain, ["form-1", "step-1", "section-1", "group-1"], "chain is root to (excluding) leaf");
});

test("ancestorIds returns empty when leaf is a root", () => {
  const tree = buildSourcePickerTree(buildHierarchyFixture());
  assert.deepEqual(ancestorIds(tree, "form-1"), []);
});

test("flatRank ranks 'sex' search across hierarchical candidates", () => {
  const tree = buildSourcePickerTree(buildHierarchyFixture());
  const ranked = flatRank(tree, "sex");
  const ids = ranked.map((entry) => entry.node.id);

  assert.ok(ids.includes("group-1"), "group 'Sex selector' is included");
  assert.ok(ids.includes("radio-male"), "male radio is included (path contains 'Sex selector')");
  assert.ok(ids.includes("radio-female"), "female radio is included (path contains 'Sex selector')");

  // Group should outrank its descendants because the match is in its own label
  const groupIndex = ids.indexOf("group-1");
  const maleIndex = ids.indexOf("radio-male");
  assert.ok(groupIndex < maleIndex, "group ranks ahead of its descendants when label matches");
});

test("flatRank returns empty when query is empty/whitespace", () => {
  const tree = buildSourcePickerTree(buildHierarchyFixture());
  assert.equal(flatRank(tree, "").length, 0);
  assert.equal(flatRank(tree, "   ").length, 0);
});

test("flatRank returns empty when nothing matches", () => {
  const tree = buildSourcePickerTree(buildHierarchyFixture());
  assert.equal(flatRank(tree, "xyzzy").length, 0);
});

test("flatRank matches multiple tokens (AND semantics)", () => {
  const tree = buildSourcePickerTree(buildHierarchyFixture());
  const ranked = flatRank(tree, "male sex");
  // The "Male" node has both "male" and "sex" in its joined path
  assert.ok(ranked.length > 0);
  const labels = ranked.map((r) => r.node.label);
  assert.ok(labels.includes("Male"));
});

test("buildSourcePickerTree handles orphans by promoting them to roots", () => {
  const orphan = makeCandidate({
    id: "orphan-field",
    nodeType: "field",
    componentLabel: "Orphan",
    label: "Orphan field",
    pathIds: ["missing-parent", "orphan-field"],
  });
  const tree = buildSourcePickerTree([orphan]);
  assert.deepEqual(tree.rootIds, ["orphan-field"], "orphan with missing parent is treated as root");
  assert.equal(tree.byId.get("orphan-field")!.parentId, null);
});
