import { useState } from "react";

import type { RuntimeDispatchReport } from "@form-builder/runtime";

import { actionButtonClass } from "../../../lib/ui-utils";

/**
 * Best-Next-3 — preview-based test mode. When recording is on, every
 * runtime event dispatched from the preview surface produces a stored
 * dispatch report so authors can inspect actual end-user interactions
 * the same way the simulator inspects synthesised ones.
 */
export interface PreviewTestRecorderProps {
  recordingOn: boolean;
  reports: { id: string; timestamp: string; report: RuntimeDispatchReport }[];
  onToggleRecording: (next: boolean) => void;
  onClear: () => void;
}

function describeListenerOutcomes(report: RuntimeDispatchReport): string {
  if (report.listeners.length === 0) {
    return "no listeners";
  }
  const matched = report.listeners.filter((entry) => entry.matched).length;
  return `${matched}/${report.listeners.length} matched`;
}

export function PreviewTestRecorder({ recordingOn, reports, onToggleRecording, onClear }: PreviewTestRecorderProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <section className="rounded-md border border-slate-200 bg-white p-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Preview test mode</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Record dispatch reports from real preview interactions so behavior wiring can be verified end-to-end.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onToggleRecording(!recordingOn)}
            className={actionButtonClass(recordingOn ? "primary" : "secondary")}
            aria-pressed={recordingOn}
          >
            {recordingOn ? "Stop recording" : "Start recording"}
          </button>
          {reports.length > 0 ? (
            <button type="button" onClick={onClear} className={actionButtonClass("secondary")}>
              Clear ({reports.length})
            </button>
          ) : null}
        </div>
      </header>

      {recordingOn && reports.length === 0 ? (
        <p className="mt-3 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
          Recording. Interact with the preview to capture dispatch reports.
        </p>
      ) : null}

      {reports.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {reports
            .slice()
            .reverse()
            .map(({ id, timestamp, report }) => {
              const isOpen = openId === id;
              return (
                <li key={id} className="rounded-md border border-slate-200 bg-slate-50">
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : id)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-100"
                  >
                    <span>
                      <span className="font-semibold text-slate-900">{report.event.type}</span>
                      <span className="ml-2 text-xs text-slate-500">
                        {describeListenerOutcomes(report)} · {report.traceEntries.length} trace entries ·{" "}
                        {new Date(timestamp).toLocaleTimeString()}
                      </span>
                    </span>
                    <span aria-hidden="true" className="text-xs text-slate-400">
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>
                  {isOpen ? (
                    <div className="border-t border-slate-200 px-3 py-3 text-xs text-slate-700">
                      <p className="font-semibold text-slate-900">Listeners</p>
                      {report.listeners.length === 0 ? (
                        <p className="mt-1 text-slate-500">No listeners observed this event.</p>
                      ) : (
                        <ul className="mt-1 space-y-1">
                          {report.listeners.map((entry, index) => (
                            <li
                              key={`${id}-listener-${entry.listenerId ?? index}`}
                              className="rounded-sm bg-white px-2 py-1"
                            >
                              <span
                                className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase ${entry.matched ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}
                              >
                                {entry.matched ? "match" : (entry.skippedReason ?? "skip")}
                              </span>
                              <span className="ml-2 font-medium text-slate-900">{entry.label ?? entry.listenerId}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {report.stateDiff.valuesChanged.length > 0 ? (
                        <>
                          <p className="mt-3 font-semibold text-slate-900">Values changed</p>
                          <ul className="mt-1 space-y-1">
                            {report.stateDiff.valuesChanged.map((key) => (
                              <li key={`${id}-diff-${key}`} className="text-xs">
                                <code>{key}</code>: {JSON.stringify(report.stateBefore.values[key])} →{" "}
                                {JSON.stringify(report.stateAfter.values[key])}
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
        </ul>
      ) : null}
    </section>
  );
}
