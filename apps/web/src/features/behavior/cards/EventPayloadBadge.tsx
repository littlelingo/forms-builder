import { useMemo, useState } from "react";
import type { AuthoringDocument } from "@form-builder/schema";
import { listPayloadFieldsForEventType } from "../../../lib/payload-schema-helpers";
import { PayloadFieldsPopover } from "./PayloadFieldsPopover";

export interface EventPayloadBadgeProps {
  eventType: string;
  doc: AuthoringDocument | null;
}

export function EventPayloadBadge({ eventType, doc }: EventPayloadBadgeProps) {
  const [open, setOpen] = useState(false);
  const fields = useMemo(() => listPayloadFieldsForEventType(eventType, doc), [eventType, doc]);
  if (fields.length === 0) return null;
  return (
    <span className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
        title={`${fields.length} payload field${fields.length === 1 ? "" : "s"}`}
        aria-expanded={open}
      >
        <span aria-hidden="true">{"{·}"}</span>
        <span>
          {fields.length} field{fields.length === 1 ? "" : "s"}
        </span>
      </button>
      {open ? (
        <span className="absolute right-0 top-full z-20 block">
          <PayloadFieldsPopover eventType={eventType} fields={fields} />
        </span>
      ) : null}
    </span>
  );
}
