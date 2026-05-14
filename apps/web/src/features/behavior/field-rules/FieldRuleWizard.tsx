import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { AuthoringDocument, AuthoringField, RuntimeConditionOperator } from "@form-builder/schema";
import type { FieldRule, FieldRuleEffect } from "../../../lib/field-rule-helpers";
import { FieldRuleValuePicker } from "./value-picker";
import { actionButtonClass, iconButtonClass } from "../../../lib/ui-utils";

export interface FieldRuleFieldOption {
  id: string;
  optionLabel: string;
  field: AuthoringField | null;
}

export interface FieldRuleWizardProps {
  isOpen: boolean;
  onClose: () => void;
  doc: AuthoringDocument | null;
  fieldOptions: FieldRuleFieldOption[];
  /** Pre-fill the affected field id (entry from affected-field side). */
  initialAffectedFieldId?: string | null;
  /** Pre-fill the trigger field id (entry from trigger-field side). */
  initialTriggerFieldId?: string | null;
  /** Existing rule when editing. */
  existingRule?: FieldRule | null;
  onSave: (rule: Omit<FieldRule, "listenerId">, listenerId?: string) => void;
}

const EFFECT_OPTIONS: Array<{ value: FieldRuleEffect; label: string }> = [
  { value: "show", label: "Show" },
  { value: "hide", label: "Hide" },
  { value: "require", label: "Mark required" },
  { value: "optional", label: "Mark optional" },
];

const OPERATOR_OPTIONS: Array<{ value: RuntimeConditionOperator; label: string }> = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "does not equal" },
  { value: "contains", label: "contains" },
  { value: "exists", label: "exists" },
];

export function FieldRuleWizard({
  isOpen,
  onClose,
  doc: _doc,
  fieldOptions,
  initialAffectedFieldId,
  initialTriggerFieldId,
  existingRule,
  onSave,
}: FieldRuleWizardProps) {
  const [effect, setEffect] = useState<FieldRuleEffect>("show");
  const [affectedFieldId, setAffectedFieldId] = useState("");
  const [triggerFieldId, setTriggerFieldId] = useState("");
  const [operator, setOperator] = useState<RuntimeConditionOperator>("equals");
  const [expectedValue, setExpectedValue] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    if (existingRule) {
      setEffect(existingRule.effect);
      setAffectedFieldId(existingRule.affectedFieldId);
      setTriggerFieldId(existingRule.triggerFieldId);
      setOperator(existingRule.operator);
      setExpectedValue(existingRule.expectedValue);
      return;
    }
    setEffect("show");
    setAffectedFieldId(initialAffectedFieldId ?? "");
    setTriggerFieldId(initialTriggerFieldId ?? "");
    setOperator("equals");
    setExpectedValue("");
  }, [isOpen, existingRule, initialAffectedFieldId, initialTriggerFieldId]);

  const triggerField = useMemo(
    () => fieldOptions.find((opt) => opt.id === triggerFieldId)?.field ?? null,
    [fieldOptions, triggerFieldId],
  );

  const canSave = Boolean(
    effect && affectedFieldId && triggerFieldId && operator && (operator === "exists" || expectedValue !== ""),
  );

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/30 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="field-rule-wizard-title"
        className="relative w-full max-w-[36rem] rounded-[1.15rem] border border-slate-200 bg-[#f5f7fb] p-5 shadow-[0_24px_64px_rgba(15,23,42,0.24)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Field rule</p>
            <h3 id="field-rule-wizard-title" className="mt-0.5 text-lg font-semibold text-slate-950">
              {existingRule ? "Edit field rule" : "Add field rule"}
            </h3>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className={iconButtonClass()}>
            ×
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <label className="block text-sm">
            <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">Effect</span>
            <select
              value={effect}
              onChange={(e) => setEffect(e.target.value as FieldRuleEffect)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              {EFFECT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">Affected field</span>
            <select
              value={affectedFieldId}
              onChange={(e) => setAffectedFieldId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">— pick a field —</option>
              {fieldOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.optionLabel}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">Trigger field</span>
            <select
              value={triggerFieldId}
              onChange={(e) => setTriggerFieldId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">— pick a field —</option>
              {fieldOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.optionLabel}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-[minmax(0,0.6fr)_minmax(0,1fr)] gap-3">
            <label className="block text-sm">
              <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">Operator</span>
              <select
                value={operator}
                onChange={(e) => setOperator(e.target.value as RuntimeConditionOperator)}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {OPERATOR_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">Value</span>
              <FieldRuleValuePicker
                operator={operator}
                value={expectedValue}
                onChange={setExpectedValue}
                field={triggerField}
                className="mt-1"
              />
            </label>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className={actionButtonClass("secondary")}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => {
              if (!canSave) return;
              onSave(
                {
                  effect,
                  affectedFieldId,
                  triggerFieldId,
                  operator,
                  expectedValue: operator === "exists" ? "" : expectedValue,
                },
                existingRule?.listenerId,
              );
              onClose();
            }}
            className={actionButtonClass("primary")}
          >
            {existingRule ? "Save changes" : "Add rule"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
