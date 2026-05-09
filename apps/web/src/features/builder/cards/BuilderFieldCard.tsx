import type { DragEvent, PointerEvent, ReactNode } from "react";

import type { AuthoringField, RuntimeNodeState } from "@form-builder/schema";

import type { AuthoringSelection, DragPayload, DropTarget } from "../../../lib/authoring-utils";
import { DragHandle } from "../dnd/drag-handles";
import { dragPayloadMatchesSelection, dropTargetAttributes, summarizeFieldBehavior } from "../utils/builder-utils";

export interface BuilderFieldCardProps {
  stepId: string;
  sectionId: string;
  field: AuthoringField;
  fieldIndex: number;
  groupId?: string;
  // Selection state
  selectedAuthoring: AuthoringSelection | null;
  // Drag state
  dragPayload: DragPayload | null;
  fieldState: RuntimeNodeState | null;
  componentLabel: string;
  // Drag handle handlers
  onDragHandlePointerDown: (event: PointerEvent<HTMLButtonElement>, payload: DragPayload) => void;
  onDragHandlePointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onDragHandlePointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
  onDragHandlePointerCancel: (event: PointerEvent<HTMLButtonElement>) => void;
  onDragHandleSelect: (payload: DragPayload) => void;
  // Drop zone handlers
  onDragOver: (event: DragEvent<HTMLElement>, target: DropTarget, options?: { positionByPointer?: boolean }) => void;
  onDragLeave: (target: DropTarget) => void;
  onDrop: (event: DragEvent<HTMLElement>, target: DropTarget, options?: { positionByPointer?: boolean }) => void;
  // Selection handler
  onSelect: (selection: AuthoringSelection) => void;
  // Slot content
  behaviorToolbar: ReactNode;
  dispatchKeyBadge: ReactNode;
  fieldPreview: ReactNode;
}

export function BuilderFieldCard({
  stepId,
  sectionId,
  field,
  fieldIndex,
  groupId,
  selectedAuthoring,
  dragPayload,
  fieldState,
  componentLabel,
  onDragHandlePointerDown,
  onDragHandlePointerMove,
  onDragHandlePointerUp,
  onDragHandlePointerCancel,
  onDragHandleSelect,
  onDragOver,
  onDragLeave,
  onDrop,
  onSelect,
  behaviorToolbar,
  dispatchKeyBadge,
  fieldPreview,
}: BuilderFieldCardProps) {
  const selection: AuthoringSelection = {
    kind: "field",
    stepId,
    sectionId,
    ...(groupId ? { groupId } : {}),
    fieldId: field.id,
  };
  const isSelected = selectedAuthoring?.kind === "field" && selectedAuthoring.fieldId === field.id;
  const isDragging = dragPayloadMatchesSelection(dragPayload, selection);
  const isVisible = fieldState?.visible ?? true;
  const isRequired = fieldState?.required ?? field.required;
  const behaviorSummary = summarizeFieldBehavior(field);
  const fieldTone = isSelected
    ? "border-blue-300 bg-[#e8f0ff]"
    : !isVisible
      ? "border-slate-200 bg-slate-100/70"
      : isRequired
        ? "border-rose-300 bg-rose-50/60"
        : "border-soft bg-slate-50";

  const dropTarget: DropTarget = {
    kind: "field-list",
    stepId,
    sectionId,
    ...(groupId ? { groupId } : {}),
    index: fieldIndex,
  };

  return (
    <div
      key={field.id}
      data-behavior-studio-surface
      {...dropTargetAttributes(dropTarget)}
      onDragOver={(event) => onDragOver(event, dropTarget, { positionByPointer: true })}
      onDragLeave={() => onDragLeave(dropTarget)}
      onDrop={(event) => onDrop(event, dropTarget, { positionByPointer: true })}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(selection);
      }}
      className={`rounded-[1.1rem] border p-4 text-left transition ${fieldTone} ${
        isDragging ? "scale-[0.995] opacity-55 shadow-[0_18px_34px_rgba(37,99,235,0.16)]" : ""
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Component</p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-900">{componentLabel}</p>
        </div>
        <DragHandle
          label="Drag component"
          payload={{
            kind: "field",
            stepId,
            sectionId,
            ...(groupId ? { groupId } : {}),
            fieldId: field.id,
          }}
          compact
          onPointerDown={onDragHandlePointerDown}
          onPointerMove={onDragHandlePointerMove}
          onPointerUp={onDragHandlePointerUp}
          onPointerCancel={onDragHandlePointerCancel}
          onSelect={onDragHandleSelect}
        />
      </div>
      {isSelected ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {behaviorToolbar}
          {dispatchKeyBadge}
        </div>
      ) : null}
      {behaviorSummary.ruleCount || behaviorSummary.flowCount ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {behaviorSummary.ruleCount ? (
            <span className="app-pill">
              {behaviorSummary.ruleCount} condition{behaviorSummary.ruleCount === 1 ? "" : "s"}
            </span>
          ) : null}
          {behaviorSummary.flowCount ? (
            <span className="app-pill">
              {behaviorSummary.flowCount} flow{behaviorSummary.flowCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
      ) : null}
      {fieldPreview}
    </div>
  );
}
