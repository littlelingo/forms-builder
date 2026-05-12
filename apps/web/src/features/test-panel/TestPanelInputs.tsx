import { useId, useMemo } from "react";
import type { ReactElement } from "react";

import type { RuntimePayloadField } from "@form-builder/schema";

import type { RuntimeEventSourceCandidate } from "../behavior/utils/runtime-helpers";
import { runtimeEventDefinitionType, runtimePayloadFieldsForEventType } from "../behavior/utils/runtime-helpers";

import { allPayloadFieldsValid, parsePayloadValue, validatePayloadField } from "./payload-form-logic";
import { SourcePicker } from "./SourcePicker";
import type { TestPanelSelection } from "./types";

export interface TestPanelInputsProps {
  candidates: RuntimeEventSourceCandidate[];
  selection: TestPanelSelection;
  onSelectSource: (id: string) => void;
  onSelectEvent: (type: string) => void;
  onEditPayload: (name: string, value: string) => void;
  onResetPayload: (payload: Record<string, string>) => void;
  onFire: (envelope: { sourceId: string; eventType: string; payload: Record<string, unknown> }) => void;
}

export function TestPanelInputs({
  candidates,
  selection,
  onSelectSource,
  onSelectEvent,
  onEditPayload,
  onResetPayload,
  onFire,
}: TestPanelInputsProps): ReactElement {
  const baseId = useId();
  const sourceLabelId = `${baseId}-source-label`;
  const eventSelectId = `${baseId}-event`;

  const source = selection.sourceId ? (candidates.find((c) => c.id === selection.sourceId) ?? null) : null;

  const eventOptions = useMemo<{ type: string; label: string }[]>(() => {
    if (!source) return [];
    const fromDefs = source.eventDefinitions.map((d) => {
      const type = runtimeEventDefinitionType(d);
      return { type, label: type };
    });
    return fromDefs.length ? fromDefs : [{ type: "field.change", label: "field.change (draft)" }];
  }, [source]);

  const effectiveEventType = selection.eventType ?? eventOptions[0]?.type ?? null;
  const payloadFields: RuntimePayloadField[] = effectiveEventType
    ? runtimePayloadFieldsForEventType(effectiveEventType)
    : [];

  const canFire =
    source !== null && effectiveEventType !== null && allPayloadFieldsValid(payloadFields, selection.payload);

  return (
    <section className="p-3">
      <span id={sourceLabelId} className="block text-xs uppercase tracking-wide text-slate-500">
        Source
      </span>
      <div aria-labelledby={sourceLabelId} className="mt-1">
        <SourcePicker candidates={candidates} selectedId={selection.sourceId} onSelect={onSelectSource} />
      </div>

      <label htmlFor={eventSelectId} className="mt-3 block text-xs uppercase tracking-wide text-slate-500">
        Event
      </label>
      <select
        id={eventSelectId}
        value={effectiveEventType ?? ""}
        onChange={(e) => onSelectEvent(e.target.value)}
        disabled={!source}
        className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50 disabled:text-slate-400"
      >
        {eventOptions.length === 0 ? (
          <option value="" disabled>
            Select a source to see events
          </option>
        ) : (
          eventOptions.map((opt) => (
            <option key={opt.type} value={opt.type}>
              {opt.label}
            </option>
          ))
        )}
      </select>

      <div className="mt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-slate-500">Payload</span>
          {payloadFields.length > 0 ? (
            <button
              type="button"
              onClick={() => onResetPayload(Object.fromEntries(payloadFields.map((f) => [f.name, ""])))}
              className="text-xs text-blue-700 underline"
            >
              Reset to defaults
            </button>
          ) : null}
        </div>
        {payloadFields.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500">Event has no payload fields.</p>
        ) : (
          payloadFields.map((field) => {
            const inputId = `${baseId}-payload-${field.name}`;
            const errorId = `${inputId}-error`;
            const raw = selection.payload[field.name] ?? "";
            const validation = validatePayloadField(field, raw);
            return (
              <div key={field.name} className="mt-2">
                <label htmlFor={inputId} className="block text-xs text-slate-600">
                  {field.label ?? field.name} <span className="text-slate-400">· {field.valueType}</span>
                </label>
                <input
                  id={inputId}
                  type="text"
                  value={raw}
                  onChange={(e) => onEditPayload(field.name, e.target.value)}
                  aria-invalid={!validation.ok}
                  aria-describedby={!validation.ok ? errorId : undefined}
                  className={`mt-1 w-full rounded border px-2 py-1 text-sm ${
                    validation.ok ? "border-slate-300" : "border-red-400"
                  }`}
                />
                {!validation.ok ? (
                  <span id={errorId} className="block text-xs text-red-600">
                    {validation.message}
                  </span>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <button
        type="button"
        disabled={!canFire}
        onClick={() => {
          if (!source || !effectiveEventType) return;
          const payload: Record<string, unknown> = {};
          for (const field of payloadFields) {
            const parsed = parsePayloadValue(field, selection.payload[field.name] ?? "");
            if (parsed !== undefined) payload[field.name] = parsed;
          }
          onFire({ sourceId: source.id, eventType: effectiveEventType, payload });
        }}
        className="mt-4 w-full rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        Fire event
      </button>
    </section>
  );
}
