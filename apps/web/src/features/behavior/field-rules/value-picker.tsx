import type { AuthoringField } from "@form-builder/schema";
import type { RuntimeConditionOperator } from "@form-builder/schema";

export interface FieldRuleValuePickerProps {
  operator: RuntimeConditionOperator;
  value: string;
  onChange: (next: string) => void;
  field: AuthoringField | null;
  className?: string;
}

export function FieldRuleValuePicker({
  operator,
  value,
  onChange,
  field,
  className,
}: FieldRuleValuePickerProps) {
  if (operator === "exists") {
    return (
      <p className={`text-sm text-slate-500 ${className ?? ""}`}>No value needed for "exists".</p>
    );
  }
  const options = field?.options ?? null;
  if (options && options.length > 0) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ${className ?? ""}`}
      >
        <option value="">— pick a value —</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  if (field?.semanticType === "checkbox") {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ${className ?? ""}`}
      >
        <option value="true">checked</option>
        <option value="false">unchecked</option>
      </select>
    );
  }
  return (
    <input
      type={field?.semanticType === "number" ? "number" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="expected value"
      className={`w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ${className ?? ""}`}
    />
  );
}
