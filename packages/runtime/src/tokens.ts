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
  /**
   * Phase 3: per-listener-chain response scope, populated by host_call_await
   * resumes. `undefined` outside an async chain — `$response` then resolves
   * to `{ ok: false, reason: "response_not_in_scope" }`.
   */
  response?: Record<string, unknown>;
}

// Locked set of valid roots. No new roots without a spec change.
const LOCKED_ROOTS = new Set([
  "$payload",
  "$response",
  "$field",
  "$state",
  "$source",
  "$current",
  "$host",
  "$now",
  "$uuid",
]);

// Roots that require no path traversal — they generate values directly.
const GENERATIVE_ROOTS = new Set(["$now", "$uuid"]);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function walkPath(obj: unknown, segments: string[]): { ok: true; value: unknown } | { ok: false; remainder: string } {
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
    case "$response":
      return context.response ?? {};
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

  // 4. Phase 3 scoped roots — `$response` only resolves inside an async
  // chain that received a host.action_response. Outside that scope (e.g.
  // sync dispatch or any chain without a preceding host_call_await), the
  // resolver returns response_not_in_scope so authoring lints catch it.
  if (root === "$response") {
    if (context.response === undefined) {
      return { ok: false, reason: "response_not_in_scope" };
    }
    // fall through to path-based handling below
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
