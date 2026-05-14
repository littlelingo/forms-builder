import type { RuntimePayloadField } from "@form-builder/schema";

export interface PayloadFieldsPopoverProps {
  eventType: string;
  fields: RuntimePayloadField[];
}

export function PayloadFieldsPopover({ eventType, fields }: PayloadFieldsPopoverProps) {
  if (fields.length === 0) {
    return (
      <div className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-md">
        <p className="font-semibold">{eventType}</p>
        <p className="mt-1 text-slate-500">No payload fields known for this event.</p>
      </div>
    );
  }
  return (
    <div className="w-72 rounded border border-slate-200 bg-white p-3 shadow-md">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{eventType}</p>
      <ul className="mt-2 space-y-1 text-xs">
        {fields.map((field) => (
          <li key={field.name} className="flex flex-col">
            <span className="font-mono text-slate-900">
              {field.name}
              <span className="ml-1 text-slate-500">· {field.valueType}</span>
              {field.required ? <span className="ml-1 text-rose-700">*</span> : null}
            </span>
            {field.description ? <span className="text-slate-500">{field.description}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
