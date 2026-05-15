import type { AuthoringDocument } from "@form-builder/schema";
import { detectFieldRuleConflicts, findRulesAffectingField, type FieldRule } from "../../../lib/field-rule-helpers";
import { actionButtonClass } from "../../../lib/ui-utils";

export interface FieldRulesListProps {
  doc: AuthoringDocument | null;
  fieldId: string | null;
  fieldOptionLabel: (fieldId: string) => string;
  onAdd: () => void;
  onEdit: (rule: FieldRule) => void;
  onDelete: (rule: FieldRule) => void;
}

export function FieldRulesList({ doc, fieldId, fieldOptionLabel, onAdd, onEdit, onDelete }: FieldRulesListProps) {
  const rules = doc && fieldId ? findRulesAffectingField(doc, fieldId) : [];
  const conflicts = detectFieldRuleConflicts(rules);
  const conflictByListenerId = new Set(conflicts.flatMap((c) => c.rules.map((r) => r.listenerId)));
  return (
    <section className="rounded-[1rem] border border-soft bg-white p-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Rules affecting this field
          </p>
          <p className="mt-1 text-xs text-slate-500">Visibility and required-state rules triggered by other fields.</p>
        </div>
        <button type="button" onClick={onAdd} className={actionButtonClass("secondary")}>
          + Add rule
        </button>
      </header>
      <ul className="mt-3 space-y-2">
        {rules.length === 0 ? (
          <li className="rounded-md border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">
            No rules yet. Use &ldquo;Add rule&rdquo; to make this field react to another field&apos;s value.
          </li>
        ) : (
          rules.map((rule) => (
            <li
              key={rule.listenerId}
              className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${
                conflictByListenerId.has(rule.listenerId) ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-white"
              }`}
            >
              <span className="text-sm text-slate-800">
                <strong className="font-semibold">
                  {rule.effect === "show"
                    ? "Show"
                    : rule.effect === "hide"
                      ? "Hide"
                      : rule.effect === "require"
                        ? "Mark required"
                        : "Mark optional"}
                </strong>{" "}
                this field when <strong>{fieldOptionLabel(rule.triggerFieldId)}</strong>{" "}
                {rule.operator === "exists" ? "exists" : `${rule.operator.replace("_", " ")} "${rule.expectedValue}"`}
              </span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => onEdit(rule)} className={actionButtonClass("secondary")}>
                  Edit
                </button>
                <button type="button" onClick={() => onDelete(rule)} className={actionButtonClass("danger")}>
                  Delete
                </button>
              </div>
            </li>
          ))
        )}
      </ul>
      {conflicts.length > 0 ? (
        <p className="mt-2 text-xs text-rose-700">
          ⚠ Conflicting rules detected. Two rules try to apply opposing effects under the same condition.
        </p>
      ) : null}
    </section>
  );
}
