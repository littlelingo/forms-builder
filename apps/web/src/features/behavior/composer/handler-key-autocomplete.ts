import type {
  AuthoringDocument,
  RuntimeActionDefinition,
  RuntimeListenerDefinition,
} from "@form-builder/schema";

/**
 * Phase 4 (mock-host-bridge plan, Task 4.1): autocomplete data source for the
 * ActionEditor handlerKey field. Walks every listener in the doc, finds every
 * `host_call_await` / `host_action` (including those nested in branch arms),
 * and returns the unique handlerKeys sorted by frequency (desc) then key
 * (asc). The returned shape is intentionally pure / serializable so the
 * ActionEditor can render it inside a `<datalist>` without further work.
 */
export interface HandlerKeyHit {
  key: string;
  frequency: number;
  listenerLabels: string[];
}

interface HandlerKeyAccumulator {
  frequency: number;
  listenerLabels: Set<string>;
}

/**
 * Recursively walk an action list, visiting every action — including those
 * nested inside `branch` action `then`/`else` arms. Mirrors the walker in
 * `packages/runtime/src/authoring-lints.ts` so both stay in sync if the
 * schema later grows additional nested action kinds.
 */
function walkActions(
  actions: readonly RuntimeActionDefinition[] | undefined,
  visit: (action: RuntimeActionDefinition) => void,
): void {
  for (const action of actions ?? []) {
    visit(action);
    if (action.kind !== "branch") continue;
    const config = action.config;
    if (!config || typeof config !== "object") continue;
    const thenArm = (config as { actions?: unknown }).actions;
    const elseArm = (config as { else?: unknown }).else;
    if (Array.isArray(thenArm)) {
      walkActions(thenArm as RuntimeActionDefinition[], visit);
    }
    if (Array.isArray(elseArm)) {
      walkActions(elseArm as RuntimeActionDefinition[], visit);
    }
  }
}

/**
 * Yield every listener attached anywhere in the document. Listeners can hang
 * off the form (`document.runtime.formListeners`) or off any node via
 * `node.runtime.listeners` (`RuntimeNodeBehavior.listeners`).
 *
 * The traversal order mirrors `lintRuntimeDocument` in
 * `packages/runtime/src/authoring-lints.ts` so authors see consistent
 * orderings across the editor surfaces.
 */
function* iterateListeners(doc: AuthoringDocument): Generator<RuntimeListenerDefinition> {
  for (const listener of doc.runtime?.formListeners ?? []) {
    yield listener;
  }
  for (const step of doc.steps ?? []) {
    for (const listener of step.runtime?.listeners ?? []) {
      yield listener;
    }
    for (const section of step.sections ?? []) {
      for (const listener of section.runtime?.listeners ?? []) {
        yield listener;
      }
      for (const group of section.groups ?? []) {
        for (const listener of group.runtime?.listeners ?? []) {
          yield listener;
        }
        for (const field of group.fields ?? []) {
          for (const listener of field.runtime?.listeners ?? []) {
            yield listener;
          }
        }
      }
      for (const field of section.fields ?? []) {
        for (const listener of field.runtime?.listeners ?? []) {
          yield listener;
        }
      }
    }
  }
}

/**
 * Read `config.handlerKey` from a runtime action, returning the trimmed string
 * value or `null` when missing or non-string. Both `host_action` and
 * `host_call_await` store their handler under the same key, so a single
 * accessor is sufficient.
 */
function readHandlerKey(action: RuntimeActionDefinition): string | null {
  if (action.kind !== "host_call_await" && action.kind !== "host_action") {
    return null;
  }
  const config = action.config;
  if (!config || typeof config !== "object") return null;
  const raw = (config as { handlerKey?: unknown }).handlerKey;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Walk the doc and return every distinct handlerKey used by a
 * `host_action` or `host_call_await` action, with a usage count and the set
 * of listener labels that reference it. Sorted by frequency (descending) and
 * then alphabetically for stable autocomplete ordering.
 */
export function collectKeys(doc: AuthoringDocument): HandlerKeyHit[] {
  const counts = new Map<string, HandlerKeyAccumulator>();

  for (const listener of iterateListeners(doc)) {
    const listenerLabel = listener.label ?? listener.id;
    walkActions(listener.actions, (action) => {
      const key = readHandlerKey(action);
      if (!key) return;
      const entry = counts.get(key) ?? { frequency: 0, listenerLabels: new Set<string>() };
      entry.frequency += 1;
      entry.listenerLabels.add(listenerLabel);
      counts.set(key, entry);
    });
  }

  return [...counts.entries()]
    .map(([key, value]) => ({
      key,
      frequency: value.frequency,
      listenerLabels: [...value.listenerLabels],
    }))
    .sort((a, b) => {
      if (b.frequency !== a.frequency) return b.frequency - a.frequency;
      return a.key.localeCompare(b.key);
    });
}
