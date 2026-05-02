import type {
  AuthoringDocument,
  AuthoringField,
  RuntimeValidationError,
  RuntimeValidationState,
} from "@form-builder/schema";

import type { IndexedRuntimeNode, RuntimeDocumentIndex } from "./document-index";

export function validateRuntimeDocument(
  document: AuthoringDocument,
  index: RuntimeDocumentIndex,
  values: Record<string, unknown>,
  nodeStates: Record<string, { visible: boolean; enabled: boolean; required: boolean }>,
): RuntimeValidationState {
  const errors: RuntimeValidationError[] = [];
  const warnings: RuntimeValidationError[] = [];

  for (const step of document.steps) {
    for (const section of step.sections) {
      for (const field of section.fields) {
        validateField(field, index.nodes.get(field.id), values, nodeStates, errors, warnings);
      }
      for (const group of section.groups) {
        for (const field of group.fields) {
          validateField(field, index.nodes.get(field.id), values, nodeStates, errors, warnings);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateField(
  field: AuthoringField,
  node: IndexedRuntimeNode | undefined,
  values: Record<string, unknown>,
  nodeStates: Record<string, { visible: boolean; enabled: boolean; required: boolean }>,
  errors: RuntimeValidationError[],
  warnings: RuntimeValidationError[],
): void {
  if (!node) {
    return;
  }

  const state = nodeStates[field.id];
  if (!state?.visible || !state.enabled || field.rendererHints.component === "button") {
    return;
  }

  const value = values[field.id];
  if (state.required && isBlank(value)) {
    errors.push({
      nodeId: node.id,
      fieldId: field.id,
      message: `${field.label || "Field"} is required.`,
      severity: "error",
    });
    return;
  }

  if (isBlank(value)) {
    return;
  }

  for (const validation of field.validations) {
    switch (validation.ruleType) {
      case "regex": {
        if (typeof value === "string" && typeof validation.value === "string") {
          const pattern = safeRegExp(validation.value);
          if (pattern && !pattern.test(value)) {
            errors.push({
              nodeId: node.id,
              fieldId: field.id,
              message: validation.message,
              severity: "error",
            });
          }
        }
        break;
      }
      case "min": {
        const numericValue = coerceNumber(value);
        const minValue = coerceNumber(validation.value);
        if (numericValue !== null && minValue !== null && numericValue < minValue) {
          errors.push({
            nodeId: node.id,
            fieldId: field.id,
            message: validation.message,
            severity: "error",
          });
        }
        break;
      }
      case "max": {
        const numericValue = coerceNumber(value);
        const maxValue = coerceNumber(validation.value);
        if (numericValue !== null && maxValue !== null && numericValue > maxValue) {
          errors.push({
            nodeId: node.id,
            fieldId: field.id,
            message: validation.message,
            severity: "error",
          });
        }
        break;
      }
      case "length": {
        if (typeof value === "string" && typeof validation.value === "number" && value.length !== validation.value) {
          warnings.push({
            nodeId: node.id,
            fieldId: field.id,
            message: validation.message,
            severity: "warning",
          });
        }
        break;
      }
      default:
        break;
    }
  }
}

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim().length === 0;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return false;
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function safeRegExp(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}
