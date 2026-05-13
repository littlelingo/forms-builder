import { useState } from "react";
import type { ReactElement } from "react";

import type { RuntimeDispatchReport } from "@form-builder/runtime";

import { groupActionsByReceiver } from "./trace-grouping";

export interface TestPanelTraceProps {
  /** Synth mode passes the single last report; Record mode passes the most recent entry. */
  report: RuntimeDispatchReport | null;
  /** Optional label resolver — converts a nodeId to a human path label. */
  nodeLabelById?: Map<string, string>;
  onCreateListenerForSource?: () => void;
  /** History view consumes this; By listener / By receiver use the single `report` prop. */
  recordedReports?: { id: string; timestamp: string; report: RuntimeDispatchReport }[];
}

type TraceView = "by-listener" | "by-receiver" | "history";

export function TestPanelTrace({
  report,
  nodeLabelById,
  onCreateListenerForSource,
  recordedReports,
}: TestPanelTraceProps): ReactElement {
  const [view, setView] = useState<TraceView>("by-listener");

  const noListeners = report ? report.listeners.length === 0 : true;

  return (
    <section className="p-3">
      <header className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold">Trace</h4>
        <div className="flex gap-1 text-xs">
          <button
            type="button"
            onClick={() => setView("by-listener")}
            aria-pressed={view === "by-listener"}
            className={`rounded px-2 py-0.5 ${view === "by-listener" ? "bg-blue-600 text-white" : "bg-slate-100"}`}
          >
            By listener
          </button>
          <button
            type="button"
            onClick={() => setView("by-receiver")}
            aria-pressed={view === "by-receiver"}
            className={`rounded px-2 py-0.5 ${view === "by-receiver" ? "bg-blue-600 text-white" : "bg-slate-100"}`}
          >
            By receiver
          </button>
          <button
            type="button"
            onClick={() => setView("history")}
            aria-pressed={view === "history"}
            className={`rounded px-2 py-0.5 ${view === "history" ? "bg-blue-600 text-white" : "bg-slate-100"}`}
          >
            History
          </button>
        </div>
      </header>

      {view !== "history" && report ? (
        <div className="mb-2 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs">
          <span className="font-semibold">{report.event.type}</span>
          <span className="ml-2 text-slate-600">{report.listeners.length} listener checks</span>
        </div>
      ) : null}

      {view === "history" ? (
        <HistoryView recordedReports={recordedReports} nodeLabelById={nodeLabelById} />
      ) : !report ? (
        <p className="text-sm text-slate-500">Fire an event to see the listener trace.</p>
      ) : noListeners ? (
        <div className="rounded border border-dashed border-slate-300 p-3 text-sm text-slate-500">
          <p>No listeners reached this event.</p>
          {onCreateListenerForSource ? (
            <button type="button" onClick={onCreateListenerForSource} className="mt-1 text-xs text-blue-700 underline">
              Create listener
            </button>
          ) : null}
        </div>
      ) : view === "by-listener" ? (
        <ByListenerView report={report} nodeLabelById={nodeLabelById} />
      ) : (
        <ByReceiverView report={report} nodeLabelById={nodeLabelById} />
      )}
    </section>
  );
}

function describeBeforeAfter(action: { before?: unknown; after?: unknown }): string | null {
  if (action.before === undefined && action.after === undefined) return null;
  return `${JSON.stringify(action.before)} → ${JSON.stringify(action.after)}`;
}

function describeActualValue(value: unknown): string | null {
  if (value === undefined) return null;
  const json = JSON.stringify(value);
  if (json === undefined) return null;
  return json.length > 60 ? `${json.slice(0, 57)}...` : json;
}

function ByListenerView({
  report,
  nodeLabelById,
}: {
  report: RuntimeDispatchReport;
  nodeLabelById?: Map<string, string>;
}): ReactElement {
  return (
    <ul className="space-y-2">
      {report.listeners.map((listener) => (
        <li
          key={`${listener.listenerId}-${listener.eventPhase}`}
          className={`rounded border p-2 ${listener.matched ? "border-emerald-200" : "border-slate-200"}`}
        >
          <div className="text-sm font-semibold">
            {listener.matched ? "Listener ran" : "Listener skipped"} — {listener.label ?? listener.listenerId}
          </div>
          {listener.skippedReason ? (
            <div className="text-xs text-slate-500">Reason: {listener.skippedReason}</div>
          ) : null}
          {listener.conditions.length ? (
            <ul className="mt-1 ml-3 space-y-1 text-xs">
              {listener.conditions.map((condition) => {
                const actual = describeActualValue(condition.actualValue);
                return (
                  <li key={condition.conditionId} className="flex flex-wrap items-center gap-1">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
                      {condition.label ?? "Condition"}
                    </span>
                    <span className={condition.passed ? "text-emerald-700" : "text-rose-700"}>
                      {condition.passed ? "passed" : "failed"}
                    </span>
                    {actual ? <span className="text-slate-500">actual: {actual}</span> : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
          {listener.actions.length ? (
            <ul className="mt-1 ml-3 space-y-1 text-xs">
              {listener.actions.map((action) => {
                const target = action.target as { fieldId?: string; nodeId?: string } | null | undefined;
                const targetId = target?.fieldId ?? target?.nodeId ?? null;
                const targetLabel = targetId ? (nodeLabelById?.get(targetId) ?? targetId) : "—";
                const delta = describeBeforeAfter(action);
                return (
                  <li key={action.actionId}>
                    ▸ {targetLabel} · {action.kind} · {action.status}
                    {delta ? ` · ${delta}` : ""}
                    {action.skippedReason ? ` · ${action.skippedReason}` : ""}
                    {action.errorMessage ? ` · ${action.errorMessage}` : ""}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function ByReceiverView({
  report,
  nodeLabelById,
}: {
  report: RuntimeDispatchReport;
  nodeLabelById?: Map<string, string>;
}): ReactElement {
  const groups = groupActionsByReceiver(report);
  if (groups.length === 0) {
    return <p className="text-sm text-slate-500">No actions executed.</p>;
  }
  return (
    <ul className="space-y-2">
      {groups.map((group) => (
        <li key={group.targetId} className="rounded border border-slate-200 p-2">
          <div className="text-sm font-semibold">
            {nodeLabelById?.get(group.targetId) ?? group.targetId}
            <span className="ml-1 text-xs text-slate-500">({group.actions.length} actions)</span>
          </div>
          <ul className="mt-1 ml-3 space-y-1 text-xs">
            {group.actions.map((action) => {
              const delta = describeBeforeAfter(action);
              return (
                <li key={`${action.listenerId}-${action.actionId}`}>
                  ▸ {action.kind} · {action.status}
                  {delta ? ` · ${delta}` : ""}
                  {action.skippedReason ? ` · ${action.skippedReason}` : ""}
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function HistoryView({
  recordedReports,
  nodeLabelById,
}: {
  recordedReports: TestPanelTraceProps["recordedReports"];
  nodeLabelById?: Map<string, string>;
}): ReactElement {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  if (!recordedReports || recordedReports.length === 0) {
    return <p className="text-sm text-slate-500">No recorded events yet.</p>;
  }
  const reversed = [...recordedReports].reverse();
  return (
    <ul className="space-y-1">
      {reversed.map((entry, idx) => {
        const isOpen = expandedId === entry.id;
        const isCollision = entry.report.event.type === "runtime.continuation_collision";
        const rowClass = `rounded border ${isCollision ? "border-rose-300 bg-rose-50" : "border-slate-200"}`;
        return (
          <li key={entry.id} className={rowClass}>
            <button
              type="button"
              onClick={() => setExpandedId(isOpen ? null : entry.id)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-slate-50"
            >
              <span>
                <span className="font-semibold">{entry.report.event.type}</span>
                <span className="ml-2 text-slate-500">
                  {entry.report.listeners.filter((l) => l.matched).length}/{entry.report.listeners.length} listeners
                </span>
              </span>
              <span className="text-slate-500">{formatRelativeTime(entry.timestamp)}</span>
            </button>
            {isOpen ? (
              <div className="border-t border-slate-200 p-2">
                <ByListenerView report={entry.report} nodeLabelById={nodeLabelById} />
                <ChainContext recordedReports={reversed} index={idx} />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function ChainContext({
  recordedReports,
  index,
}: {
  recordedReports: NonNullable<TestPanelTraceProps["recordedReports"]>;
  index: number;
}): ReactElement | null {
  // recordedReports passed here is reverse-chronological (newest first).
  // Within reverse order:
  //   - "After this" (chronologically later) = entries with smaller index
  //   - "Before this" (chronologically earlier) = entries with larger index
  const afterWindow = recordedReports.slice(Math.max(0, index - 2), index);
  const beforeWindow = recordedReports.slice(index + 1, index + 3);
  if (afterWindow.length === 0 && beforeWindow.length === 0) return null;
  return (
    <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs">
      <p className="mb-1 font-semibold text-slate-700">Chain context</p>
      {afterWindow.length ? (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">After this</p>
          <ul className="ml-2">
            {afterWindow.map((entry) => (
              <li key={entry.id}>
                ▸ {entry.report.event.type}{" "}
                <span className="text-slate-500">@ {formatRelativeTime(entry.timestamp)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {beforeWindow.length ? (
        <div className="mt-1">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Before this</p>
          <ul className="ml-2">
            {beforeWindow.map((entry) => (
              <li key={entry.id}>
                ▸ {entry.report.event.type}{" "}
                <span className="text-slate-500">@ {formatRelativeTime(entry.timestamp)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}
