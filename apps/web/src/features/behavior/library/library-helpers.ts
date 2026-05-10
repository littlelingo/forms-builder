import type { BehaviorLibraryEntry, RuntimeListenerDefinition } from "@form-builder/schema";
import { applyTemplateTokens } from "@form-builder/runtime";

export interface LibraryParamValidationResult {
  ok: boolean;
  errors: { paramKey: string; message: string }[];
}

export function validateParams(
  entry: BehaviorLibraryEntry,
  params: Record<string, unknown>,
): LibraryParamValidationResult {
  const errors: { paramKey: string; message: string }[] = [];

  for (const param of entry.parameters) {
    const value = params[param.key];

    if (param.required && (value == null || value === "")) {
      errors.push({ paramKey: param.key, message: `${param.label} is required` });
      continue;
    }

    if (value == null) continue;

    // Type checks
    if (param.type === "string" && typeof value !== "string") {
      errors.push({ paramKey: param.key, message: `${param.label} must be a string` });
    } else if (param.type === "number" && typeof value !== "number") {
      errors.push({ paramKey: param.key, message: `${param.label} must be a number` });
    } else if (param.type === "boolean" && typeof value !== "boolean") {
      errors.push({ paramKey: param.key, message: `${param.label} must be a boolean` });
    } else if (param.type === "enum") {
      if (!param.options || !param.options.includes(String(value))) {
        errors.push({
          paramKey: param.key,
          message: `${param.label} must be one of: ${param.options?.join(", ") ?? "(no options)"}`,
        });
      }
    }

    // Constraint checks
    if (param.constraints?.regex && typeof value === "string") {
      try {
        if (!new RegExp(param.constraints.regex).test(value)) {
          errors.push({ paramKey: param.key, message: `${param.label} doesn't match required pattern` });
        }
      } catch {
        // malformed regex in entry — skip silently
      }
    }

    if (param.constraints?.min != null && typeof value === "number" && value < param.constraints.min) {
      errors.push({ paramKey: param.key, message: `${param.label} must be ≥ ${param.constraints.min}` });
    }

    if (param.constraints?.max != null && typeof value === "number" && value > param.constraints.max) {
      errors.push({ paramKey: param.key, message: `${param.label} must be ≤ ${param.constraints.max}` });
    }
  }

  return { ok: errors.length === 0, errors };
}

/** Materializes a library entry's template into a partial RuntimeListenerDefinition. */
export function applyEntryToListener(
  entry: BehaviorLibraryEntry,
  params: Record<string, unknown>,
): Partial<RuntimeListenerDefinition> {
  const materialised = applyTemplateTokens(entry.template, params);
  return materialised as Partial<RuntimeListenerDefinition>;
}

/** Returns default params for an entry — useful for pre-filling the apply dialog. */
export function defaultParamsForEntry(entry: BehaviorLibraryEntry): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const param of entry.parameters) {
    if (param.default !== undefined) {
      defaults[param.key] = param.default;
    }
  }
  return defaults;
}
