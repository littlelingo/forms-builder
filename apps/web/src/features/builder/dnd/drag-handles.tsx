import type { DragEvent, PointerEvent } from "react";

import type { DragPayload, DropTarget } from "../../../lib/authoring-utils";
import { dragPayloadLabel, dropTargetAttributes, dropTargetKey, isCompatibleDropTarget } from "../utils/builder-utils";

function DragHandleIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4" fill="currentColor">
      <circle cx="5.25" cy="4" r="1" />
      <circle cx="10.75" cy="4" r="1" />
      <circle cx="5.25" cy="8" r="1" />
      <circle cx="10.75" cy="8" r="1" />
      <circle cx="5.25" cy="12" r="1" />
      <circle cx="10.75" cy="12" r="1" />
    </svg>
  );
}

export interface DragHandleProps {
  label: string;
  payload: DragPayload;
  compact?: boolean;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>, payload: DragPayload) => void;
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => void;
  onSelect: (payload: DragPayload) => void;
}

export function DragHandle({
  label,
  payload,
  compact,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onSelect,
}: DragHandleProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => onPointerDown(event, payload)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          onSelect(payload);
        }
      }}
      className={`inline-flex shrink-0 cursor-grab items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
        compact ? "h-7 w-6" : "h-8 w-7"
      }`}
    >
      <DragHandleIcon />
    </button>
  );
}

export interface DropMarkerProps {
  target: DropTarget;
  gridSpan?: boolean;
  label?: string;
  dragPayload: DragPayload | null;
  activeDropTargetKey: string | null;
  onDragOver: (event: DragEvent<HTMLElement>, target: DropTarget) => void;
  onDragLeave: (target: DropTarget) => void;
  onDrop: (event: DragEvent<HTMLElement>, target: DropTarget) => void;
}

export function DropMarker({
  target,
  gridSpan,
  label,
  dragPayload,
  activeDropTargetKey,
  onDragOver,
  onDragLeave,
  onDrop,
}: DropMarkerProps) {
  if (!dragPayload || !isCompatibleDropTarget(dragPayload, target)) {
    return null;
  }
  const isActive = activeDropTargetKey === dropTargetKey(target);

  return (
    <div
      key={dropTargetKey(target)}
      {...dropTargetAttributes(target, { exact: true })}
      onDragOver={(event) => onDragOver(event, target)}
      onDragLeave={() => onDragLeave(target)}
      onDrop={(event) => onDrop(event, target)}
      className={`${gridSpan ? "md:col-span-2" : ""} rounded-[0.95rem] px-2 py-1.5`}
    >
      <div
        className={`flex items-center gap-2 rounded-full border border-dashed px-3 py-1.5 transition ${
          isActive ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-300/80 bg-slate-50 text-slate-400"
        }`}
      >
        <span className={`h-1.5 flex-1 rounded-full ${isActive ? "bg-blue-500" : "bg-slate-300"}`} />
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.18em]">
          {label ?? `Insert ${dragPayloadLabel(dragPayload)} here`}
        </span>
        <span className={`h-1.5 flex-1 rounded-full ${isActive ? "bg-blue-500" : "bg-slate-300"}`} />
      </div>
    </div>
  );
}

export interface EmptyDropZoneProps {
  target: DropTarget;
  copy: { title: string; description: string; activeTitle?: string };
  gridSpan?: boolean;
  dragPayload: DragPayload | null;
  activeDropTargetKey: string | null;
  onDragOver: (event: DragEvent<HTMLElement>, target: DropTarget) => void;
  onDragLeave: (target: DropTarget) => void;
  onDrop: (event: DragEvent<HTMLElement>, target: DropTarget) => void;
}

export function EmptyDropZone({
  target,
  copy,
  gridSpan,
  dragPayload,
  activeDropTargetKey,
  onDragOver,
  onDragLeave,
  onDrop,
}: EmptyDropZoneProps) {
  const compatible = isCompatibleDropTarget(dragPayload, target);
  const isActive = compatible && activeDropTargetKey === dropTargetKey(target);
  return (
    <div
      {...dropTargetAttributes(target, { exact: true })}
      onDragOver={(event) => onDragOver(event, target)}
      onDragLeave={() => onDragLeave(target)}
      onDrop={(event) => onDrop(event, target)}
      className={`${gridSpan ? "md:col-span-2" : ""} rounded-[1.2rem] border border-dashed px-4 py-4 transition ${
        isActive
          ? "border-blue-400 bg-blue-50/80 shadow-[0_14px_28px_rgba(37,99,235,0.10)]"
          : compatible
            ? "border-blue-200 bg-[#f8fbff]"
            : "border-slate-200 bg-slate-50/80"
      }`}
    >
      <p className={`text-sm font-semibold ${isActive ? "text-blue-700" : "text-slate-700"}`}>
        {isActive ? (copy.activeTitle ?? `Drop ${dragPayloadLabel(dragPayload)} here`) : copy.title}
      </p>
      <p className="mt-1 text-sm leading-6 text-slate-500">{copy.description}</p>
    </div>
  );
}
