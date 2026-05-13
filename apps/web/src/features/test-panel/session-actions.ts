import type { AuthoringField, AuthoringStep, RuntimeSessionState } from "@form-builder/schema";

export interface RequiredFillTarget {
  field: AuthoringField;
  defaultValue: unknown;
}

/**
 * Per-semantic-type default test value. The fallback ("Test value") covers
 * `text` plus any new semantic types added later — every branch below maps to
 * an enum value from `SemanticType` in `packages/schema/src/generated.ts`.
 */
export function defaultValueForField(field: AuthoringField): unknown {
  switch (field.semanticType) {
    case "number":
      return 0;
    case "date": {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const day = String(today.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
    case "radio":
    case "select":
      return field.options?.[0]?.value ?? "";
    case "checkbox":
      return field.options?.[0]?.value ? [field.options[0].value] : [];
    case "signature_attestation":
      return true;
    case "text":
    case "textarea":
    case "email":
    case "phone":
    case "statement":
    case "repeatable_group":
    default:
      return "Test value";
  }
}

function* iterateStepFields(step: AuthoringStep): Generator<AuthoringField> {
  for (const section of step.sections ?? []) {
    for (const field of section.fields ?? []) {
      yield field;
    }
    for (const group of section.groups ?? []) {
      for (const field of group.fields ?? []) {
        yield field;
      }
    }
  }
}

function fieldHasValue(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function collectRequiredFillTargets(
  step: AuthoringStep,
  sessionState: RuntimeSessionState,
): RequiredFillTarget[] {
  const targets: RequiredFillTarget[] = [];
  for (const field of iterateStepFields(step)) {
    if (!field.required) continue;
    const node = sessionState.nodes[field.id];
    if (node && node.visible === false) continue;
    if (node && node.enabled === false) continue;
    if (fieldHasValue(sessionState.values[field.id])) continue;
    targets.push({ field, defaultValue: defaultValueForField(field) });
  }
  return targets;
}
