import { iconButtonClass } from "../../builder/utils/builder-utils";
import type { LegacyConditionalRule, LegacyConditionalRuleGroup } from "../utils/runtime-helpers";
import { actionButtonClass, formatLabel } from "../../../lib/ui-utils";

export interface LegacyConditionalRuleEditorProps {
  rule: LegacyConditionalRule;
  index: number;
  compact?: boolean;
  conditionalGroup: LegacyConditionalRuleGroup | undefined;
  builderFieldOptions: Array<{ id: string; label: string; optionLabel: string }>;
  onClose: () => void;
  onSelectMember: (index: number, ruleId: string) => void;
  onAddSibling: (ruleId: string, effect: LegacyConditionalRule["effect"]) => void;
  onUpdate: (index: number, mutate: (rule: LegacyConditionalRule) => void) => void;
  onRemove: (index: number) => void;
}

export function LegacyConditionalRuleEditor(props: LegacyConditionalRuleEditorProps) {
  const {
    rule,
    index,
    compact,
    conditionalGroup,
    builderFieldOptions,
    onClose,
    onSelectMember,
    onAddSibling,
    onUpdate,
    onRemove,
  } = props;
  const availableSiblingEffects = (["show", "hide", "require", "disable"] as const).filter(
    (effect) => !conditionalGroup?.members.some((member) => member.rule.effect === effect),
  );
  return (
    <div className={`rounded-[1rem] border border-blue-200 bg-blue-50/60 ${compact ? "p-4" : "p-5"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-blue-700">Condition editor</p>
          <p className="mt-2 text-sm text-slate-700">
            Refine the behavior condition and effect here without leaving the current field selection.
          </p>
        </div>
        <button type="button" onClick={onClose} className={iconButtonClass()}>
          ×
        </button>
      </div>
      {conditionalGroup ? (
        <div className="mt-4 rounded-[0.95rem] border border-blue-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Conditional bundle</p>
              <p className="mt-2 text-sm text-slate-700">
                One condition can drive several effects. Keep related visibility, required, and enabled-conditional
                listener behaviors grouped here.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {conditionalGroup.members.map((member) => (
                <button
                  key={member.rule.ruleId}
                  type="button"
                  onClick={() => onSelectMember(member.index, member.rule.ruleId)}
                  className={actionButtonClass(member.rule.ruleId === rule.ruleId ? "primary" : "secondary")}
                >
                  {formatLabel(member.rule.effect)}
                </button>
              ))}
            </div>
          </div>
          {availableSiblingEffects.length ? (
            <div className="mt-3">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Add related effect
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {availableSiblingEffects.map((effect) => (
                  <button
                    key={`${rule.ruleId}-${effect}`}
                    type="button"
                    onClick={() => onAddSibling(rule.ruleId, effect)}
                    className={actionButtonClass("secondary")}
                  >
                    Add {formatLabel(effect)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="mt-4 grid gap-3">
        <div>
          <label className="text-xs uppercase tracking-[0.18em] text-slate-500">When this field matches</label>
          <select
            value={rule.whenFieldId}
            onChange={(event) =>
              onUpdate(index, (current) => {
                current.whenFieldId = event.target.value;
              })
            }
            className="mt-2 w-full rounded-2xl border border-soft px-4 py-2.5 text-sm text-slate-800"
          >
            {builderFieldOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.optionLabel}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Condition</label>
            <select
              value={rule.operator}
              onChange={(event) =>
                onUpdate(index, (current) => {
                  current.operator = event.target.value as LegacyConditionalRule["operator"];
                })
              }
              className="mt-2 w-full rounded-2xl border border-soft px-4 py-2.5 text-sm text-slate-800"
            >
              <option value="equals">equals</option>
              <option value="not_equals">does not equal</option>
              <option value="contains">contains</option>
              <option value="exists">has any value</option>
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Effect</label>
            <select
              value={rule.effect}
              onChange={(event) =>
                onUpdate(index, (current) => {
                  current.effect = event.target.value as LegacyConditionalRule["effect"];
                })
              }
              className="mt-2 w-full rounded-2xl border border-soft px-4 py-2.5 text-sm text-slate-800"
            >
              <option value="show">show</option>
              <option value="hide">hide</option>
              <option value="require">require</option>
              <option value="disable">disable</option>
            </select>
          </div>
        </div>
        {rule.operator !== "exists" ? (
          <div>
            <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Expected value</label>
            <input
              value={rule.expectedValue ?? ""}
              onChange={(event) =>
                onUpdate(index, (current) => {
                  current.expectedValue = event.target.value;
                })
              }
              placeholder="Expected value"
              className="mt-2 w-full rounded-2xl border border-soft px-4 py-2.5 text-sm text-slate-800"
            />
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => onRemove(index)} className={actionButtonClass("danger")}>
            Remove
          </button>
          <button type="button" onClick={onClose} className={actionButtonClass("primary")}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
