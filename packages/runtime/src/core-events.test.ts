import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  runtimeCoreEventsForDispatcher,
  runtimeCoreEventTypes,
} from "@form-builder/schema";

const expectedCoreEvents = [
  "component.mount",
  "component.unmount",
  "component.show",
  "component.hide",
  "component.enable",
  "component.disable",
  "state.change",
  "form.load",
  "form.submit",
  "form.submit_success",
  "form.submit_error",
  "form.validation_failed",
  "form.reset",
  "form.formdata",
  "step.enter",
  "step.leave",
  "step.completed",
  "step.validation_failed",
  "section.enter",
  "section.leave",
  "section.change",
  "group.enter",
  "group.leave",
  "group.change",
  "field.input",
  "field.change",
  "field.focus",
  "field.blur",
  "field.invalid",
  "field.key_down",
  "field.key_up",
  "checkboxGroup.change",
  "checkbox.change",
  "checkbox.checked",
  "checkbox.unchecked",
  "radio.change",
  "radio.selected",
  "radio.cleared",
  "select.change",
  "select.selected",
  "select.cleared",
  "select.opened",
  "select.closed",
  "input.change",
  "input.textChange",
  "input.before_input",
  "input.composition_start",
  "input.composition_update",
  "input.composition_end",
  "signature.change",
  "signature.attested",
  "signature.cleared",
  "repeatableGroup.change",
  "repeatableGroup.item_added",
  "repeatableGroup.item_removed",
  "repeatableGroup.item_moved",
  "component.click",
  "button.click",
  "component.double_click",
  "component.pointer_down",
  "component.pointer_up",
  "component.key_down",
  "component.key_up",
  "host.context_updated",
];

function eventTypesFor(dispatcherType: Parameters<typeof runtimeCoreEventsForDispatcher>[0], semanticType?: string) {
  return new Set(runtimeCoreEventsForDispatcher(dispatcherType, semanticType).map((eventType) => eventType.type));
}

test("core runtime event catalog covers the documented item event matrix", () => {
  const catalogEventNames = new Set(runtimeCoreEventTypes.map((eventType) => eventType.type));

  for (const eventName of expectedCoreEvents) {
    assert.ok(catalogEventNames.has(eventName), `Missing core event: ${eventName}`);
  }
});

test("core runtime event reference stays aligned with the exported catalog", () => {
  const reference = readFileSync(new URL("../../../docs/runtime-event-reference.md", import.meta.url), "utf8");

  for (const eventType of runtimeCoreEventTypes) {
    assert.ok(reference.includes(`\`${eventType.type}\``), `Missing event reference entry: ${eventType.type}`);
  }
});

test("dispatcher filtering returns type-specific field and component event sets", () => {
  assert.ok(eventTypesFor("form").has("form.formdata"));
  assert.ok(eventTypesFor("step").has("step.validation_failed"));
  assert.ok(eventTypesFor("section").has("section.change"));
  assert.ok(eventTypesFor("group").has("group.change"));

  const checkboxEvents = eventTypesFor("field", "checkbox");
  assert.ok(checkboxEvents.has("checkboxGroup.change"));
  assert.ok(checkboxEvents.has("checkbox.checked"));
  assert.ok(checkboxEvents.has("field.invalid"));

  const textEvents = eventTypesFor("field", "text");
  assert.ok(textEvents.has("input.textChange"));
  assert.ok(textEvents.has("input.before_input"));
  assert.ok(textEvents.has("input.composition_end"));

  const signatureEvents = eventTypesFor("field", "signature_attestation");
  assert.ok(signatureEvents.has("signature.attested"));
  assert.ok(signatureEvents.has("signature.cleared"));

  const repeatableEvents = eventTypesFor("field", "repeatable_group");
  assert.ok(repeatableEvents.has("repeatableGroup.item_added"));
  assert.ok(repeatableEvents.has("repeatableGroup.item_removed"));

  const statementEvents = eventTypesFor("field", "statement");
  assert.ok(statementEvents.has("component.show"));
  assert.ok(statementEvents.has("state.change"));
  assert.equal(statementEvents.has("field.change"), false);

  const componentEvents = eventTypesFor("component");
  assert.ok(componentEvents.has("component.click"));
  assert.ok(componentEvents.has("button.click"));
  assert.ok(componentEvents.has("component.key_down"));
});
