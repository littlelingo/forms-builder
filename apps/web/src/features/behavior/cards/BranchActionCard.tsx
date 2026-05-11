import type {
  RuntimeActionDefinition,
  RuntimeActionKind,
  RuntimeConditionDefinition,
  RuntimeConditionNode,
} from "@form-builder/schema";

import { actionButtonClass, iconButtonClass } from "../../../lib/ui-utils";

const MAX_DEPTH = 3;

function newCondition(): RuntimeConditionDefinition {
  return {
    id: `cond_${Math.random().toString(36).slice(2, 8)}`,
    label: null,
    enabled: true,
    source: { kind: "event_payload", path: "" },
    operator: "equals",
    expectedValue: "",
  };
}

function newAction(kind: RuntimeActionKind = "set_field_value"): RuntimeActionDefinition {
  return {
    id: `act_${Math.random().toString(36).slice(2, 8)}`,
    kind,
    target: null,
    config: kind === "set_field_value" ? { fieldId: "", value: "" } : {},
    continueOnError: false,
    onError: "halt_and_raise",
  };
}

function isAtom(node: RuntimeConditionNode): node is RuntimeConditionDefinition {
  return (node as { kind?: string }).kind !== "group";
}

/**
 * Phase 3 #17: BranchActionCard renders an authoring surface for `kind:"branch"`
 * actions. Edits conditions, the Then-arm action list, and an optional Else-arm.
 * Depth-indented (0..3); recursing into a nested branch increments depth. At
 * `depth >= 3` the inner add-action picker excludes "branch" so authors can't
 * exceed the engine's runtime cap.
 *
 * This is a compact authoring surface — full sub-editing of nested action
 * configs (e.g. set_field_value's value picker) lives in the parent
 * ActionEditor for now. Branch arms support add/remove/reorder + kind switch,
 * plus per-action onError. To edit a nested action's config in detail, change
 * its kind here and use the parent composer's action list.
 */
export function BranchActionCard({
  action,
  depth = 0,
  availableActionKinds,
  onUpdate,
}: {
  action: RuntimeActionDefinition;
  depth?: number;
  availableActionKinds: ReadonlyArray<{ value: RuntimeActionKind; label: string }>;
  onUpdate: (mutate: (config: Record<string, unknown>) => void) => void;
}) {
  const config = (action.config ?? {}) as Record<string, unknown>;
  const conditions = (Array.isArray(config.conditions) ? config.conditions : []) as RuntimeConditionNode[];
  const thenActions = (Array.isArray(config.actions) ? config.actions : []) as RuntimeActionDefinition[];
  const elseActions = (Array.isArray(config.else) ? config.else : []) as RuntimeActionDefinition[];
  const hasElse = elseActions.length > 0 || config.elseEnabled === true;
  const canNestDeeper = depth < MAX_DEPTH;
  const kindOptionsForArm = canNestDeeper
    ? availableActionKinds
    : availableActionKinds.filter((option) => option.value !== "branch");

  const updateConditions = (mutate: (list: RuntimeConditionNode[]) => RuntimeConditionNode[]) => {
    onUpdate((draft) => {
      draft.conditions = mutate(((draft.conditions as RuntimeConditionNode[]) ?? []).slice());
    });
  };

  const updateArm = (arm: "actions" | "else", mutate: (list: RuntimeActionDefinition[]) => RuntimeActionDefinition[]) => {
    onUpdate((draft) => {
      draft[arm] = mutate(((draft[arm] as RuntimeActionDefinition[]) ?? []).slice());
    });
  };

  const indentClass = depth === 0 ? "" : depth === 1 ? "ml-3" : depth === 2 ? "ml-6" : "ml-8";
  const borderTone =
    depth === 0
      ? "border-sky-200 bg-sky-50/60"
      : depth === 1
        ? "border-sky-200/80 bg-sky-50/40"
        : "border-sky-100 bg-sky-50/20";

  return (
    <div className={`${indentClass} grid gap-3 rounded-md border ${borderTone} px-3 py-3`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-sky-900">
          Branch · depth {depth}
        </p>
        {depth >= MAX_DEPTH ? (
          <p className="text-[0.66rem] font-medium text-rose-600">Max nesting reached (3)</p>
        ) : null}
      </div>

      {/* Conditions */}
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">If</p>
          <button
            type="button"
            className={iconButtonClass()}
            aria-label="Add condition"
            onClick={() => updateConditions((list) => [...list, newCondition()])}
          >
            +
          </button>
        </div>
        {conditions.length === 0 ? (
          <p className="text-[0.7rem] italic text-slate-500">No conditions — branch always takes the Then arm.</p>
        ) : (
          conditions.map((node, idx) => {
            if (!isAtom(node)) {
              return (
                <div key={node.id} className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[0.7rem] text-amber-800">
                  Group conditions live in the main composer.
                </div>
              );
            }
            const atom = node;
            return (
              <div key={atom.id} className="grid grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-2">
                <select
                  value={atom.source.kind}
                  onChange={(event) =>
                    updateConditions((list) => {
                      const next = list.slice();
                      const old = next[idx] as RuntimeConditionDefinition;
                      const kind = event.target.value as "event_payload" | "field_value";
                      next[idx] = { ...old, source: kind === "event_payload" ? { kind, path: "" } : { kind, fieldId: "" } };
                      return next;
                    })
                  }
                  className="rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                >
                  <option value="event_payload">payload</option>
                  <option value="field_value">field</option>
                </select>
                <input
                  type="text"
                  value={String(atom.source.kind === "event_payload" ? atom.source.path : atom.source.fieldId) ?? ""}
                  placeholder={atom.source.kind === "event_payload" ? "path.in.payload" : "fieldId"}
                  onChange={(event) =>
                    updateConditions((list) => {
                      const next = list.slice();
                      const old = next[idx] as RuntimeConditionDefinition;
                      const key = old.source.kind === "event_payload" ? "path" : "fieldId";
                      next[idx] = { ...old, source: { ...old.source, [key]: event.target.value } as RuntimeConditionDefinition["source"] };
                      return next;
                    })
                  }
                  className="rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                />
                <select
                  value={atom.operator}
                  onChange={(event) =>
                    updateConditions((list) => {
                      const next = list.slice();
                      next[idx] = { ...next[idx] as RuntimeConditionDefinition, operator: event.target.value as RuntimeConditionDefinition["operator"] };
                      return next;
                    })
                  }
                  className="rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                >
                  <option value="equals">equals</option>
                  <option value="not_equals">not_equals</option>
                  <option value="contains">contains</option>
                  <option value="exists">exists</option>
                </select>
                <input
                  type="text"
                  value={typeof atom.expectedValue === "string" ? atom.expectedValue : JSON.stringify(atom.expectedValue ?? "")}
                  placeholder="expected"
                  onChange={(event) =>
                    updateConditions((list) => {
                      const next = list.slice();
                      next[idx] = { ...next[idx] as RuntimeConditionDefinition, expectedValue: event.target.value };
                      return next;
                    })
                  }
                  className="rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                  disabled={atom.operator === "exists"}
                />
                <button
                  type="button"
                  className={iconButtonClass("danger")}
                  aria-label="Remove condition"
                  onClick={() => updateConditions((list) => list.filter((_, i) => i !== idx))}
                >
                  ×
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Then arm */}
      <BranchArm
        label="Then"
        actions={thenActions}
        depth={depth}
        kindOptions={kindOptionsForArm}
        availableActionKinds={availableActionKinds}
        onUpdate={(mutate) => updateArm("actions", mutate)}
      />

      {/* Else toggle + arm */}
      <div className="flex items-center gap-2 border-t border-sky-200/60 pt-3">
        <input
          id={`branch-${action.id}-else`}
          type="checkbox"
          checked={hasElse}
          onChange={(event) =>
            onUpdate((draft) => {
              if (event.target.checked) {
                draft.elseEnabled = true;
                if (!Array.isArray(draft.else)) draft.else = [];
              } else {
                draft.elseEnabled = false;
                draft.else = [];
              }
            })
          }
        />
        <label htmlFor={`branch-${action.id}-else`} className="text-xs text-slate-700">
          Include Else arm
        </label>
      </div>
      {hasElse ? (
        <BranchArm
          label="Else"
          actions={elseActions}
          depth={depth}
          kindOptions={kindOptionsForArm}
          availableActionKinds={availableActionKinds}
          onUpdate={(mutate) => updateArm("else", mutate)}
        />
      ) : null}
    </div>
  );
}

function BranchArm({
  label,
  actions,
  depth,
  kindOptions,
  availableActionKinds,
  onUpdate,
}: {
  label: string;
  actions: RuntimeActionDefinition[];
  depth: number;
  kindOptions: ReadonlyArray<{ value: RuntimeActionKind; label: string }>;
  availableActionKinds: ReadonlyArray<{ value: RuntimeActionKind; label: string }>;
  onUpdate: (mutate: (list: RuntimeActionDefinition[]) => RuntimeActionDefinition[]) => void;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
        <button
          type="button"
          className={actionButtonClass()}
          onClick={() => onUpdate((list) => [...list, newAction()])}
        >
          + Add action
        </button>
      </div>
      {actions.length === 0 ? (
        <p className="text-[0.7rem] italic text-slate-500">No actions in this arm.</p>
      ) : (
        actions.map((nested, idx) => (
          <div key={nested.id} className="grid gap-2 rounded-md border border-slate-200 bg-white px-2 py-2">
            <div className="flex items-center gap-2">
              <select
                value={nested.kind}
                onChange={(event) =>
                  onUpdate((list) => {
                    const next = list.slice();
                    next[idx] = { ...next[idx], kind: event.target.value as RuntimeActionKind, config: {} };
                    return next;
                  })
                }
                className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs"
              >
                {kindOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={String(nested.onError ?? (nested.continueOnError ? "continue" : "halt_and_raise"))}
                onChange={(event) =>
                  onUpdate((list) => {
                    const next = list.slice();
                    const policy = event.target.value as "continue" | "halt" | "halt_and_raise";
                    next[idx] = { ...next[idx], onError: policy, continueOnError: policy === "continue" };
                    return next;
                  })
                }
                className="rounded border border-slate-200 bg-white px-2 py-1 text-xs"
              >
                <option value="halt_and_raise">halt+raise</option>
                <option value="halt">halt</option>
                <option value="continue">continue</option>
              </select>
              <button
                type="button"
                className={iconButtonClass("danger")}
                aria-label={`Remove ${label.toLowerCase()} action`}
                onClick={() => onUpdate((list) => list.filter((_, i) => i !== idx))}
              >
                ×
              </button>
            </div>
            {nested.kind === "branch" ? (
              <BranchActionCard
                action={nested}
                depth={depth + 1}
                availableActionKinds={availableActionKinds}
                onUpdate={(mutate) =>
                  onUpdate((list) => {
                    const next = list.slice();
                    const current = (next[idx].config ?? {}) as Record<string, unknown>;
                    const draft = { ...current };
                    mutate(draft);
                    next[idx] = { ...next[idx], config: draft };
                    return next;
                  })
                }
              />
            ) : (
              <p className="text-[0.66rem] italic text-slate-500">
                Edit detailed config for this {nested.kind} action in the main action list (this card edits kind +
                onError + nesting).
              </p>
            )}
          </div>
        ))
      )}
    </div>
  );
}
