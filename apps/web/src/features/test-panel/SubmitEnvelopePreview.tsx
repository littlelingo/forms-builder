import type { ReactElement } from "react";

import type { RuntimeEventEnvelope } from "@form-builder/schema";

export interface SubmitEnvelopePreviewProps {
  envelope: RuntimeEventEnvelope | null;
}

export function SubmitEnvelopePreview({ envelope }: SubmitEnvelopePreviewProps): ReactElement {
  if (!envelope) {
    return (
      <div className="rounded border border-dashed border-slate-300 p-3 text-xs text-slate-500">
        Run Submit from the Session tab to preview the envelope.
      </div>
    );
  }
  const json = JSON.stringify(envelope, null, 2);
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">form.submit envelope</span>
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(json).catch(() => {})}
          className="rounded bg-slate-200 px-2 py-0.5 text-xs hover:bg-slate-300"
        >
          Copy
        </button>
      </div>
      <pre className="overflow-x-auto rounded bg-white p-2 font-mono text-xs">{json}</pre>
    </div>
  );
}
