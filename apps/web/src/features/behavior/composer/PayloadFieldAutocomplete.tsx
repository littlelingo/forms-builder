import { useId, useMemo } from "react";
import type { AuthoringDocument } from "@form-builder/schema";
import { listPayloadFieldsForEventType } from "../../../lib/payload-schema-helpers";
import { detectPayloadAutocompleteOptions } from "./payload-field-autocomplete-logic";

export interface PayloadFieldAutocompleteProps {
  value: string;
  onChange: (next: string) => void;
  eventType: string;
  doc: AuthoringDocument | null;
  className?: string;
  placeholder?: string;
  id?: string;
  "aria-label"?: string;
}

export function PayloadFieldAutocomplete({
  value,
  onChange,
  eventType,
  doc,
  className,
  placeholder,
  id,
  "aria-label": ariaLabel,
}: PayloadFieldAutocompleteProps) {
  const fields = useMemo(() => listPayloadFieldsForEventType(eventType, doc), [eventType, doc]);
  const options = useMemo(() => detectPayloadAutocompleteOptions(value, fields), [value, fields]);
  const datalistId = useId();
  return (
    <>
      <input
        type="text"
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        list={options.length > 0 ? datalistId : undefined}
        className={className}
      />
      {options.length > 0 ? (
        <datalist id={datalistId}>
          {options.map((field) => (
            <option key={field.name} value={`{{event.payload.${field.name}}}`}>
              {field.name} · {field.valueType}
            </option>
          ))}
        </datalist>
      ) : null}
    </>
  );
}
