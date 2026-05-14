import type { AuthoringDocument } from "@form-builder/schema";
import { findRulesTriggeredByField, type FieldRule } from "../../../lib/field-rule-helpers";
import { actionButtonClass } from "../../../lib/ui-utils";

export interface FieldRulesTriggersProps {
  doc: AuthoringDocument | null;
  fieldId: string | null;
  fieldOptionLabel: (fieldId: string) => string;
  onAdd: () => void;
  onEdit: (rule: FieldRule) => void;
  onDelete: (rule: FieldRule) => void;
}

export function FieldRulesTriggers({
  doc,
  fieldId,
  fieldOptionLabel,
  onAdd,
  onEdit,
  onDelete,
}: FieldRulesTriggersProps) {
  const rules = doc && fieldId ? findRulesTriggeredByField(doc, fieldId) : [];
  return (
    <section className="rounded-[1rem] border border-soft bg-white p-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Rules this field triggers
          </p>
          <p className="mt-1 text-xs text-slate-500">
            When this field changes, these rules toggle the visibility or required state of other fields.
          </p>
        </div>
        <button type="button" onClick={onAdd} className={actionButtonClass("secondary")}>
          + Add rule about another field
        </button>
      </header>
      <ul className="mt-3 space-y-2">
        {rules.length === 0 ? (
          <li className="rounded-md border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">
            No outgoing rules. Use &ldquo;Add rule&rdquo; to make another field react when this one changes.
          </li>
        ) : (
          rules.map((rule) => (
            <li
              key={rule.listenerId}
              className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2"
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
                <strong>{fieldOptionLabel(rule.affectedFieldId)}</strong> when this field{" "}
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
    </section>
  );
}
