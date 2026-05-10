import type { RuntimeSessionState } from "@form-builder/schema";

import type { TokenResolution } from "./types";

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface RuntimeTokenContext {
  payload?: Record<string, unknown>;
  fieldValues?: Record<string, unknown>;
  state?: RuntimeSessionState;
  source?: { id?: string; key?: string; type?: string; label?: string };
  current?: Record<string, unknown>;
  hostContext?: Record<string, unknown>;
}

// Locked set of valid roots. No new roots without a spec change.
const LOCKED_ROOTS = new Set(["$payload", "$response", "$field", "$state", "$source", "$current", "$host", "$now", "$uuid"]);

// Roots that require no path traversal — they generate values directly.
const GENERATIVE_ROOTS = new Set(["$now", "$uuid"]);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function walkPath(
  obj: unknown,
  segments: string[],
): { ok: true; value: unknown } | { ok: false; remainder: string } {
  let current: unknown = obj;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (current === null || current === undefined || typeof current !== "object") {
      return { ok: false, remainder: segments.slice(i).join(".") };
    }
    const record = current as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(record, seg)) {
      return { ok: false, remainder: segments.slice(i).join(".") };
    }
    current = record[seg];
  }
  return { ok: true, value: current };
}

function rootToContext(root: string, context: RuntimeTokenContext): unknown {
  switch (root) {
    case "$payload":
      return context.payload ?? {};
    case "$field":
      return context.fieldValues ?? {};
    case "$state":
      return context.state ?? {};
    case "$source":
      return context.source ?? {};
    case "$current":
      return context.current ?? {};
    case "$host":
      return context.hostContext ?? {};
    default:
      return {};
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function resolveRuntimeToken<T = unknown>(token: string, context: RuntimeTokenContext): TokenResolution<T> {
  // 1. Must start with `$`
  if (!token.startsWith("$")) {
    return { ok: false, reason: "missing_dollar" };
  }

  // 2. Split into root and path remainder
  const dotIndex = token.indexOf(".");
  const root = dotIndex === -1 ? token : token.slice(0, dotIndex);
  const pathStr = dotIndex === -1 ? "" : token.slice(dotIndex + 1);

  // 3. Validate root
  if (!LOCKED_ROOTS.has(root)) {
    return { ok: false, reason: "unknown_root" };
  }

  // 4. Phase-3-only roots
  if (root === "$response") {
    return { ok: false, reason: "phase_3_only" };
  }

  // 5. Generative roots — ignore trailing path
  if (GENERATIVE_ROOTS.has(root)) {
    if (root === "$now") {
      return { ok: true, value: new Date().toISOString() as unknown as T };
    }
    // $uuid
    return { ok: true, value: crypto.randomUUID() as unknown as T };
  }

  // 6. Path-based roots — walk segments
  const contextObj = rootToContext(root, context);
  if (!pathStr) {
    // No path — return the root object itself
    return { ok: true, value: contextObj as T };
  }

  const segments = pathStr.split(".");
  const walked = walkPath(contextObj, segments);
  if (!walked.ok) {
    return { ok: false, reason: "missing_path", pathRemainder: walked.remainder };
  }

  return { ok: true, value: walked.value as T };
}
