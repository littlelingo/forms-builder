import type { RuntimePayloadField } from "@form-builder/schema";

export type ValidationResult = { ok: true } | { ok: false; message: string };

export function validatePayloadField(field: RuntimePayloadField, raw: string): ValidationResult {
  if (raw === "") return { ok: true }; // empty = default; engine accepts undefined
  switch (field.valueType) {
    case "boolean":
      return raw === "true" || raw === "false" ? { ok: true } : { ok: false, message: "Must be true or false" };
    case "number":
      return Number.isFinite(Number(raw)) ? { ok: true } : { ok: false, message: "Must be a number" };
    case "object":
    case "array":
      try {
        const parsed = JSON.parse(raw);
        if (field.valueType === "array" && !Array.isArray(parsed)) {
          return { ok: false, message: "Must be a JSON array" };
        }
        if (field.valueType === "object" && (typeof parsed !== "object" || Array.isArray(parsed))) {
          return { ok: false, message: "Must be a JSON object" };
        }
        return { ok: true };
      } catch (err) {
        return { ok: false, message: `Invalid JSON: ${(err as Error).message}` };
      }
    case "string":
    default:
      return { ok: true };
  }
}

export function parsePayloadValue(field: RuntimePayloadField, raw: string): unknown {
  if (raw === "") return undefined;
  switch (field.valueType) {
    case "boolean":
      return raw === "true";
    case "number":
      return Number(raw);
    case "object":
    case "array":
      return JSON.parse(raw);
    default:
      return raw;
  }
}

export function allPayloadFieldsValid(fields: RuntimePayloadField[], payload: Record<string, string>): boolean {
  return fields.every((field) => validatePayloadField(field, payload[field.name] ?? "").ok);
}
