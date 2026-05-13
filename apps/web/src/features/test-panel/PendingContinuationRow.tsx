import { useState } from "react";
import type { ReactElement } from "react";

import { HostConfigEditor } from "./HostConfigEditor";
import type { MockHostResponseKind } from "./host-presets";
import type { BridgePendingEntry, MockHostConfig, MockHostFailureMode } from "./types";

export interface PendingContinuationRowProps {
  entry: BridgePendingEntry;
  onResolve: (correlationId: string, kind: MockHostResponseKind, payload: Record<string, unknown>) => void;
}

export function PendingContinuationRow({ entry, onResolve }: PendingContinuationRowProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<MockHostConfig["defaults"]>({
    presetId: null,
    payload: {},
    delayMs: 0,
    failureMode: "none" as MockHostFailureMode,
  });

  const ageSec = Math.floor((Date.now() - entry.createdAt) / 1000);
  const correlationShort = `${entry.correlationId.slice(0, 8)}…`;

  return (
    <li className="rounded border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50"
      >
        <span>
          <span className="font-semibold">{entry.handlerKey ?? "(no handlerKey)"}</span>
          <span className="ml-2 text-slate-500">{correlationShort}</span>
          <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-600">
            {entry.source}
          </span>
        </span>
        <span className="text-slate-500">{ageSec}s ago</span>
      </button>
      {open ? (
        <div className="border-t border-slate-200 p-3">
          <HostConfigEditor config={config} onChange={setConfig} />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onResolve(entry.correlationId, "success", config.payload ?? {})}
              className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
            >
              Success
            </button>
            <button
              type="button"
              onClick={() => onResolve(entry.correlationId, "error", config.payload ?? {})}
              className="rounded bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-500"
            >
              Error
            </button>
            <button
              type="button"
              onClick={() => onResolve(entry.correlationId, "timeout", {})}
              className="rounded bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-500"
            >
              Time out
            </button>
            <button
              type="button"
              onClick={() => onResolve(entry.correlationId, "network-error", {})}
              className="rounded bg-slate-700 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-600"
            >
              Network error
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
