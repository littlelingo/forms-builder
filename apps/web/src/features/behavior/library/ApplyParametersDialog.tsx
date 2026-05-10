import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { BehaviorLibraryEntry, BehaviorLibraryParameter } from "@form-builder/schema";

import { actionButtonClass, iconButtonClass } from "../../../lib/ui-utils";
import { defaultParamsForEntry, validateParams } from "./library-helpers";

export interface ApplyParametersDialogProps {
  isOpen: boolean;
  entry: BehaviorLibraryEntry | null;
  initialParams?: Record<string, unknown>;
  onClose: () => void;
  /** Apply with the validated params. */
  onApply: (entry: BehaviorLibraryEntry, params: Record<string, unknown>) => void;
}

export function ApplyParametersDialog({ isOpen, entry, initialParams, onClose, onApply }: ApplyParametersDialogProps) {
  const [params, setParams] = useState<Record<string, unknown>>({});
  const dialogRef = useRef<HTMLDivElement>(null);

  // Reset params whenever entry or initialParams change (or dialog opens)
  useEffect(() => {
    if (entry) {
      const defaults = defaultParamsForEntry(entry);
      setParams({ ...defaults, ...(initialParams ?? {}) });
    }
  }, [entry, initialParams]);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen || entry === null) return null;

  const validation = validateParams(entry, params);

  function handleParamChange(key: string, value: unknown) {
    setParams((prev) => ({ ...prev, [key]: value }));
  }

  function handleApply() {
    if (!entry) return;
    const result = validateParams(entry, params);
    if (!result.ok) return;
    onApply(entry, params);
    onClose();
  }

  const errorMap = Object.fromEntries(validation.errors.map((e) => [e.paramKey, e.message]));

  return createPortal(
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/30 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="apply-params-title"
        tabIndex={-1}
        className="relative flex w-full max-w-[32rem] flex-col overflow-hidden rounded-[1.15rem] border border-slate-200 bg-[#f5f7fb] shadow-[0_24px_64px_rgba(15,23,42,0.24)] outline-none"
      >
        {/* Header */}
        <div className="shrink-0 border-b border-slate-200 bg-white/96 px-4 py-3 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Configure behavior
              </p>
              <h3 id="apply-params-title" className="mt-0.5 truncate text-lg font-semibold text-slate-950">
                {entry.name}
              </h3>
              {entry.description && <p className="mt-0.5 text-sm text-slate-500">{entry.description}</p>}
            </div>
            <button type="button" aria-label="Close dialog" onClick={onClose} className={iconButtonClass()}>
              ×
            </button>
          </div>
        </div>

        {/* Parameters */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {entry.parameters.length === 0 ? (
            <p className="text-sm text-slate-500">This behavior has no configurable parameters.</p>
          ) : (
            <div className="space-y-4">
              {entry.parameters.map((param) => (
                <ParameterField
                  key={param.key}
                  param={param}
                  value={params[param.key]}
                  error={errorMap[param.key]}
                  onChange={(val) => handleParamChange(param.key, val)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex justify-end gap-2 border-t border-slate-200 bg-white/80 px-4 py-3">
          <button type="button" onClick={onClose} className={actionButtonClass("secondary")}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!validation.ok}
            className={actionButtonClass("primary")}
          >
            Apply
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface ParameterFieldProps {
  param: BehaviorLibraryParameter;
  value: unknown;
  error: string | undefined;
  onChange: (value: unknown) => void;
}

const inputClass =
  "h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:opacity-50";

const errorInputClass =
  "h-9 w-full rounded-md border border-rose-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-100";

function ParameterField({ param, value, error, onChange }: ParameterFieldProps) {
  const id = `param-${param.key}`;

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {param.label}
        {param.required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      {param.description && <p className="mb-1.5 text-xs text-slate-400">{param.description}</p>}

      {param.type === "boolean" ? (
        <div className="flex items-center gap-2">
          <input
            id={id}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-600">{param.label}</span>
        </div>
      ) : param.type === "number" ? (
        <input
          id={id}
          type="number"
          value={value == null ? "" : String(value)}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            onChange(isNaN(n) ? undefined : n);
          }}
          className={error ? errorInputClass : inputClass}
        />
      ) : param.type === "enum" ? (
        <select
          id={id}
          value={value == null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value)}
          className={error ? errorInputClass : inputClass}
        >
          {!param.required && <option value="">— select —</option>}
          {(param.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : (
        // string | nodeRef | eventRef | fieldKey | list → text input
        <input
          id={id}
          type="text"
          value={value == null ? "" : String(value)}
          placeholder={
            param.type === "nodeRef"
              ? "Node ID"
              : param.type === "eventRef"
                ? "Event name"
                : param.type === "fieldKey"
                  ? "Field key"
                  : param.type === "list"
                    ? "Comma-separated values"
                    : undefined
          }
          onChange={(e) => onChange(e.target.value)}
          className={error ? errorInputClass : inputClass}
        />
      )}

      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
