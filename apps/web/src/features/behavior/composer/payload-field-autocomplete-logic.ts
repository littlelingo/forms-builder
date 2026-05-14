import type { RuntimePayloadField } from "@form-builder/schema";

const PAYLOAD_PREFIX = "{{event.payload.";

export function detectPayloadAutocompleteOptions(
  inputValue: string,
  fields: RuntimePayloadField[],
): RuntimePayloadField[] {
  if (!inputValue.includes(PAYLOAD_PREFIX)) return [];
  return fields;
}
