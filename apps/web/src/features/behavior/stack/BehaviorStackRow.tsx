import type { CSSProperties, HTMLAttributes } from "react";

import type { RuntimeListenerDefinition } from "@form-builder/schema";
import { runtimeActionSafetyClass } from "@form-builder/schema";

import { iconButtonClass } from "../../../lib/ui-utils";
import type { BrokenRefEntry } from "./runtime-stack-helpers";

export interface BehaviorStackRowProps {
  listener: RuntimeListenerDefinition;
  triggerLabel: string;
  summary: string;
  isSelected?: boolean;
  onSelect?: (listenerId: string) => void;
  onEdit: (listenerId: string) => void;
  onToggleEnabled?: (listenerId: string, enabled: boolean) => void;
  /** Called when the user wants to save a non-library-linked listener to the library. */
  onSaveToLibrary?: (listenerId: string) => void;
  /** Called when the user wants to export this listener as a portable JSON artefact. */
  onExport?: (listenerId: string) => void;
  /** Drag-handle props provided by the parent list. */
  dragHandleProps?: HTMLAttributes<HTMLSpanElement>;
  rowProps?: HTMLAttributes<HTMLDivElement>;
  rowStyle?: CSSProperties;
  /** Broken references detected on this listener. When non-empty, a warning pill is shown. */
  brokenRefs?: BrokenRefEntry[];
}

const TRIGGER_PILL_TONES: Record<string, string> = {
  // Field events
  change: "bg-blue-100 text-blue-700",
  input: "bg-blue-100 text-blue-700",
  blur: "bg-blue-100 text-blue-700",
  focus: "bg-blue-100 text-blue-700",
  invalid: "bg-rose-100 text-rose-700",
  // Lifecycle
  enter: "bg-slate-100 text-slate-700",
  leave: "bg-slate-100 text-slate-700",
  load: "bg-slate-100 text-slate-700",
  submit: "bg-violet-100 text-violet-700",
  // Host
  host: "bg-amber-100 text-amber-800",
};

function pillToneClass(label: string): string {
  if (label.startsWith("host")) return TRIGGER_PILL_TONES.host;
  return TRIGGER_PILL_TONES[label] ?? "bg-slate-100 text-slate-700";
}

export function BehaviorStackRow({
  listener,
  triggerLabel,
  summary,
  isSelected,
  onSelect,
  onEdit,
  onToggleEnabled,
  onSaveToLibrary,
  onExport,
  dragHandleProps,
  rowProps,
  rowStyle,
  brokenRefs,
}: BehaviorStackRowProps) {
  const enabled = listener.enabled !== false;
  const provenance = listener.provenance;
  const hasLibraryRef = listener.libraryRef && !listener.libraryRef.detached;
  const hasDestructiveAction = (listener.actions ?? []).some((a) => runtimeActionSafetyClass(a.kind) === "destructive");
  const hasHostAction = (listener.actions ?? []).some((a) => runtimeActionSafetyClass(a.kind) === "host");
  const containerClass = [
    "flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm transition",
    isSelected ? "border-blue-300 bg-blue-50" : "border-soft bg-white hover:border-slate-300",
    enabled ? "" : "opacity-60",
  ].join(" ");

  return (
    <div
      {...rowProps}
      style={rowStyle}
      className={containerClass}
      onClick={onSelect ? () => onSelect(listener.id) : undefined}
      role="listitem"
    >
      <span
        {...dragHandleProps}
        className="cursor-grab select-none text-slate-400 hover:text-slate-600"
        aria-label="Drag to reorder"
        title="Drag to reorder"
      >
        ⋮⋮
      </span>
      <span
        className={`inline-flex h-5 items-center rounded px-1.5 text-[0.7rem] font-medium ${pillToneClass(triggerLabel)}`}
        title={`Trigger: ${triggerLabel}`}
      >
        {triggerLabel}
      </span>
      <span className="flex-1 truncate text-slate-800" title={listener.label ?? summary}>
        {listener.label ?? summary}
      </span>
      {provenance === "extraction" ? (
        <span className="rounded bg-slate-100 px-1 text-[0.65rem] text-slate-600" title="Synthesised from extraction">
          ext
        </span>
      ) : null}
      {hasLibraryRef ? (
        <span className="text-amber-500" title="Linked to library entry">
          ★
        </span>
      ) : onSaveToLibrary ? (
        <button
          type="button"
          className="text-[0.7rem] text-slate-400 hover:text-amber-500"
          onClick={(event) => {
            event.stopPropagation();
            onSaveToLibrary(listener.id);
          }}
          title="Save to library"
          aria-label="Save to library"
        >
          ☆
        </button>
      ) : null}
      {brokenRefs && brokenRefs.length > 0 ? (
        <span
          className="inline-flex h-5 items-center rounded bg-red-100 px-1.5 text-[0.68rem] font-semibold text-red-700"
          title={`Broken refs: ${brokenRefs
            .map((ref) => (ref.lastSeenLabel ? `${ref.kind} (was: ${ref.lastSeenLabel})` : ref.kind))
            .join(", ")}`}
          aria-label="Broken reference detected"
        >
          ! broken ref
        </span>
      ) : null}
      {hasDestructiveAction ? (
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" title="Includes destructive action" />
      ) : null}
      {hasHostAction ? <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Includes host action" /> : null}
      {onToggleEnabled ? (
        <button
          type="button"
          className="text-[0.7rem] text-slate-500 hover:text-slate-800"
          onClick={(event) => {
            event.stopPropagation();
            onToggleEnabled(listener.id, !enabled);
          }}
          title={enabled ? "Pause this behavior" : "Resume this behavior"}
        >
          {enabled ? "pause" : "resume"}
        </button>
      ) : null}
      {onExport ? (
        <button
          type="button"
          className={iconButtonClass()}
          style={{ height: "1.5rem", width: "1.5rem" }}
          onClick={(event) => {
            event.stopPropagation();
            onExport(listener.id);
          }}
          title="Export this behavior"
          aria-label="Export behavior"
        >
          ↓
        </button>
      ) : null}
      <button
        type="button"
        className={iconButtonClass()}
        style={{ height: "1.5rem", width: "1.5rem" }}
        onClick={(event) => {
          event.stopPropagation();
          onEdit(listener.id);
        }}
        title="Edit behavior"
        aria-label="Edit behavior"
      >
        ✎
      </button>
    </div>
  );
}
