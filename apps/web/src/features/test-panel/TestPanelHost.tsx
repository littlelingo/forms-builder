import type { ReactElement } from "react";

import type { RuntimeEventEnvelope } from "@form-builder/schema";

import { HostConfigEditor } from "./HostConfigEditor";
import type { MockHostResponseKind } from "./host-presets";
import { PendingContinuationRow } from "./PendingContinuationRow";
import { SubmitEnvelopePreview } from "./SubmitEnvelopePreview";
import type { BridgePendingEntry, CollisionEntry, MockHostConfig } from "./types";

export interface TestPanelHostProps {
  config: MockHostConfig;
  pending: BridgePendingEntry[];
  collisions: CollisionEntry[];
  submitEnvelope: RuntimeEventEnvelope | null;
  onConfigChange: (next: MockHostConfig) => void;
  onResolve: (correlationId: string, kind: MockHostResponseKind, payload: Record<string, unknown>) => void;
}

export function TestPanelHost({
  config,
  pending,
  collisions,
  submitEnvelope,
  onConfigChange,
  onResolve,
}: TestPanelHostProps): ReactElement {
  return (
    <section className="space-y-4 p-3">
      <div>
        <h4 className="mb-2 text-xs uppercase tracking-wide text-slate-500">Default response</h4>
        <HostConfigEditor
          config={config.defaults}
          onChange={(defaults) => onConfigChange({ ...config, defaults })}
        />
      </div>

      {collisions.length > 0 ? (
        <div className="rounded border border-rose-300 bg-rose-50 p-2 text-xs text-rose-800">
          {collisions.length} correlation collision{collisions.length === 1 ? "" : "s"} detected. Pending entries with
          duplicate handlerKeys may not resolve as expected.
        </div>
      ) : null}

      <div>
        <h4 className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
          <span>Pending continuations ({pending.length})</span>
        </h4>
        {pending.length === 0 ? (
          <p className="rounded bg-slate-50 px-2 py-2 text-xs text-slate-500">
            No pending host calls. Auto-respond config affects future calls.
          </p>
        ) : (
          <ul className="space-y-1">
            {pending.map((entry) => (
              <PendingContinuationRow key={entry.correlationId} entry={entry} onResolve={onResolve} />
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 className="mb-2 text-xs uppercase tracking-wide text-slate-500">Submit envelope</h4>
        <SubmitEnvelopePreview envelope={submitEnvelope} />
      </div>
    </section>
  );
}
