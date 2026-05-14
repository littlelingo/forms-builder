import { useEffect, useId, useState } from "react";
import type { ReactElement } from "react";

import { HOST_PRESETS, findPresetById } from "./host-presets";
import type { MockHostConfig, MockHostFailureMode } from "./types";

export interface HostConfigEditorProps {
  config: MockHostConfig["defaults"];
  onChange: (next: MockHostConfig["defaults"]) => void;
}

export function HostConfigEditor({ config, onChange }: HostConfigEditorProps): ReactElement {
  const baseId = useId();
  const presetId = `${baseId}-preset`;
  const payloadId = `${baseId}-payload`;
  const payloadErrorId = `${baseId}-payload-error`;
  const delayId = `${baseId}-delay`;

  const [jsonText, setJsonText] = useState(() => JSON.stringify(config.payload ?? {}, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    setJsonText(JSON.stringify(config.payload ?? {}, null, 2));
    setJsonError(null);
  }, [config.payload]);

  function commitJson(text: string): void {
    setJsonText(text);
    try {
      const trimmed = text.trim();
      const parsed = trimmed ? (JSON.parse(trimmed) as Record<string, unknown> | null) : null;
      setJsonError(null);
      onChange({ ...config, payload: parsed });
    } catch (err) {
      setJsonError((err as Error).message);
    }
  }

  function handlePreset(nextPresetId: string): void {
    const preset = findPresetById(nextPresetId);
    if (!preset) {
      onChange({ ...config, presetId: null });
      return;
    }
    onChange({ ...config, presetId: nextPresetId, payload: preset.payload });
  }

  return (
    <section className="space-y-3 rounded border border-slate-200 bg-white p-3">
      <div>
        <label className="block text-xs uppercase tracking-wide text-slate-500" htmlFor={presetId}>
          Preset
        </label>
        <select
          id={presetId}
          value={config.presetId ?? ""}
          onChange={(e) => handlePreset(e.target.value)}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
        >
          <option value="">— Custom JSON —</option>
          {HOST_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs uppercase tracking-wide text-slate-500" htmlFor={payloadId}>
          Payload (JSON)
        </label>
        <textarea
          id={payloadId}
          value={jsonText}
          onChange={(e) => commitJson(e.target.value)}
          rows={6}
          aria-invalid={jsonError !== null}
          aria-describedby={jsonError !== null ? payloadErrorId : undefined}
          className={`mt-1 w-full rounded border px-2 py-1 font-mono text-xs ${
            jsonError ? "border-rose-400" : "border-slate-300"
          }`}
        />
        {jsonError ? (
          <p id={payloadErrorId} className="mt-1 text-xs text-rose-600">
            Invalid JSON: {jsonError}
          </p>
        ) : null}
      </div>
      <div>
        <label className="block text-xs uppercase tracking-wide text-slate-500" htmlFor={delayId}>
          Delay: {config.delayMs}ms
        </label>
        <input
          id={delayId}
          type="range"
          min={0}
          max={30000}
          step={100}
          value={config.delayMs}
          onChange={(e) => onChange({ ...config, delayMs: Number(e.target.value) })}
          className="mt-1 w-full"
        />
      </div>
      <div>
        <span className="block text-xs uppercase tracking-wide text-slate-500">Failure mode</span>
        <div className="mt-1 inline-flex gap-0.5 rounded bg-slate-100 p-0.5 text-xs">
          {(["none", "timeout", "network-error"] as MockHostFailureMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={config.failureMode === mode}
              onClick={() => onChange({ ...config, failureMode: mode })}
              className={`rounded px-2 py-1 ${
                config.failureMode === mode ? "bg-blue-600 text-white" : "text-slate-700"
              }`}
            >
              {mode === "none" ? "None" : mode === "timeout" ? "Timeout" : "Network error"}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
