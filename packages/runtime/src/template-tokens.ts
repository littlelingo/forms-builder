/**
 * Pure helper: recursively walks a template value and substitutes `{{paramKey}}`
 * placeholders with entries from `params`.
 *
 * - A string that is *entirely* a single token (`"{{key}}"`) returns the raw
 *   param value, preserving its original type.
 * - A string with embedded tokens (`"prefix {{key}} suffix"`) coerces
 *   substituted values to string.
 * - Arrays and plain objects are walked recursively.
 * - Primitives other than string are returned as-is.
 */
export function applyTemplateTokens(template: unknown, params: Record<string, unknown>): unknown {
  if (typeof template === "string") {
    // Single full-token string → return raw param value to preserve type.
    const fullToken = template.match(/^\{\{([a-zA-Z_$][\w$]*)\}\}$/);
    if (fullToken) {
      const key = fullToken[1];
      return key in params ? params[key] : template;
    }
    // Partial / embedded tokens → coerce to string.
    return template.replace(/\{\{([a-zA-Z_$][\w$]*)\}\}/g, (_, key) =>
      key in params ? String(params[key] ?? "") : `{{${key}}}`,
    );
  }
  if (Array.isArray(template)) {
    return template.map((item) => applyTemplateTokens(item, params));
  }
  if (template && typeof template === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(template as Record<string, unknown>)) {
      result[key] = applyTemplateTokens(value, params);
    }
    return result;
  }
  return template;
}

/**
 * Stable JSON stringify: recursively sorts object keys so that param objects with the
 * same entries but different insertion order (including nested objects) produce the same
 * cache key.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}
