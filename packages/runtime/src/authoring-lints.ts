/**
 * Phase 3 Stage #19 — authoring lints for Phase 3 features.
 *
 * These are *authoring-time* checks distinct from runtime form-data
 * validation (validation.ts). They flag listener shapes that the engine
 * will run but the author probably didn't intend:
 *
 * 1. `correlationId` collision — two `host_call_await` actions in the
 *    same listener share an identical author-supplied literal
 *    correlationId. At runtime the second registration throws via
 *    `runtime.continuation_collision` + `halt_and_raise`.
 * 2. `$response` outside an async chain — a `$payload` / `$response`
 *    style reference (in payload tokens or action configs) targets
 *    `$response.*` but the chain has no preceding `host_call_await`,
 *    so the resolver will return `response_not_in_scope` at runtime.
 *
 * Authoring callers (composer, save-time validation) should surface
 * findings as warnings without blocking save — they're correctness
 * hints, not hard errors.
 */
import type { AuthoringDocument, RuntimeActionDefinition, RuntimeListenerDefinition } from "@form-builder/schema";

export type AuthoringLintCode = "correlation_id_collision" | "response_token_out_of_scope";

export interface AuthoringLintFinding {
  code: AuthoringLintCode;
  listenerId: string;
  actionId?: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Lint a single listener. Returns all findings; empty list means clean.
 */
export function lintRuntimeListener(listener: RuntimeListenerDefinition): AuthoringLintFinding[] {
  const findings: AuthoringLintFinding[] = [];

  // Rule 1: correlationId collision among host_call_await actions.
  const seenCorrelationIds = new Map<string, string>(); // id → first actionId
  walkActions(listener.actions, (action) => {
    if (action.kind !== "host_call_await") return;
    const config = isRecord(action.config) ? action.config : {};
    const cid = typeof config.correlationId === "string" ? config.correlationId.trim() : "";
    if (!cid) return; // engine-generated id; no collision risk
    const first = seenCorrelationIds.get(cid);
    if (first) {
      findings.push({
        code: "correlation_id_collision",
        listenerId: listener.id,
        actionId: action.id,
        message: `host_call_await action "${action.id}" reuses correlationId "${cid}" (first set by action "${first}"). The second registration will collide at runtime and halt_and_raise.`,
        details: { correlationId: cid, firstActionId: first },
      });
    } else {
      seenCorrelationIds.set(cid, action.id);
    }
  });

  // Rule 2: $response references in actions that run before any host_call_await.
  let sawHostCallAwait = false;
  walkActions(listener.actions, (action) => {
    if (action.kind === "host_call_await") {
      sawHostCallAwait = true;
      return;
    }
    if (sawHostCallAwait) return;
    if (containsResponseToken(action.config)) {
      findings.push({
        code: "response_token_out_of_scope",
        listenerId: listener.id,
        actionId: action.id,
        message: `action "${action.id}" references $response before any host_call_await runs; the resolver will return response_not_in_scope at runtime.`,
      });
    }
  });

  return findings;
}

/**
 * Lint every form-scope and node-scope listener in the document. Useful for
 * a "show me all the listener warnings" surface in the manager.
 */
export function lintRuntimeDocument(document: AuthoringDocument): AuthoringLintFinding[] {
  const findings: AuthoringLintFinding[] = [];
  for (const listener of document.runtime?.formListeners ?? []) {
    findings.push(...lintRuntimeListener(listener));
  }
  for (const step of document.steps) {
    for (const section of step.sections) {
      for (const listener of section.runtime?.listeners ?? []) {
        findings.push(...lintRuntimeListener(listener));
      }
      for (const group of section.groups) {
        for (const listener of group.runtime?.listeners ?? []) {
          findings.push(...lintRuntimeListener(listener));
        }
        for (const field of group.fields) {
          for (const listener of field.runtime?.listeners ?? []) {
            findings.push(...lintRuntimeListener(listener));
          }
        }
      }
      for (const field of section.fields) {
        for (const listener of field.runtime?.listeners ?? []) {
          findings.push(...lintRuntimeListener(listener));
        }
      }
    }
    for (const listener of step.runtime?.listeners ?? []) {
      findings.push(...lintRuntimeListener(listener));
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function walkActions(actions: readonly RuntimeActionDefinition[], visit: (a: RuntimeActionDefinition) => void): void {
  for (const action of actions) {
    visit(action);
    if (action.kind === "branch" && isRecord(action.config)) {
      const config = action.config;
      const thenActions = Array.isArray(config.actions) ? (config.actions as RuntimeActionDefinition[]) : [];
      const elseActions = Array.isArray(config.else) ? (config.else as RuntimeActionDefinition[]) : [];
      walkActions(thenActions, visit);
      walkActions(elseActions, visit);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Deep-scan a config value for a $response token. Tokens can appear inside
 * the new `$runtime` reference form (`{ $runtime: "current.response.x" }`)
 * or as a literal "$response.*" string in any string-typed config field.
 */
function containsResponseToken(value: unknown): boolean {
  if (typeof value === "string") {
    return value.startsWith("$response");
  }
  if (Array.isArray(value)) {
    return value.some(containsResponseToken);
  }
  if (isRecord(value)) {
    if (typeof value.$runtime === "string" && value.$runtime.startsWith("current.response")) {
      return true;
    }
    return Object.values(value).some(containsResponseToken);
  }
  return false;
}
