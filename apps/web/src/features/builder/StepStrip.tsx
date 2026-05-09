import type { DragEvent, PointerEvent } from "react";

import type { AuthoringDocument } from "@form-builder/schema";
import { PanelCard } from "@form-builder/ui";

import type { AuthoringSelection, DragPayload, DropTarget } from "../../lib/authoring-utils";
import { DragHandle, DropMarker } from "./dnd/drag-handles";
import {
  dragPayloadMatchesSelection,
  dropTargetAttributes,
  iconButtonClass,
  summarizeStepBehavior,
} from "./utils/builder-utils";

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M8 3.25v9.5M3.25 8h9.5" />
    </svg>
  );
}

function PageIcon() {
  return (
    <span className="inline-flex h-9 w-7 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-500 shadow-sm">
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.3">
        <path d="M4.25 1.75h5l2.5 2.5v10H4.25z" />
        <path d="M9.25 1.75v2.5h2.5" />
        <path d="M5.75 7h4.5M5.75 9.25h4.5M5.75 11.5h3.25" />
      </svg>
    </span>
  );
}

export interface StepStripProps {
  activeDocument: AuthoringDocument | null;
  selectedAuthoring: AuthoringSelection | null;
  dragPayload: DragPayload | null;
  activeDropTargetKey: string | null;
  onAddStep: () => void;
  onSelectStep: (selection: AuthoringSelection) => void;
  onDragOver: (event: DragEvent<HTMLElement>, target: DropTarget, options?: { positionByPointer?: boolean }) => void;
  onDragLeave: (target: DropTarget) => void;
  onDrop: (event: DragEvent<HTMLElement>, target: DropTarget, options?: { positionByPointer?: boolean }) => void;
  onDragHandlePointerDown: (event: PointerEvent<HTMLButtonElement>, payload: DragPayload) => void;
  onDragHandlePointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onDragHandlePointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
  onDragHandlePointerCancel: (event: PointerEvent<HTMLButtonElement>) => void;
  onDragHandleSelect: (payload: DragPayload) => void;
}

export function StepStrip({
  activeDocument,
  selectedAuthoring,
  dragPayload,
  activeDropTargetKey,
  onAddStep,
  onSelectStep,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragHandlePointerDown,
  onDragHandlePointerMove,
  onDragHandlePointerUp,
  onDragHandlePointerCancel,
  onDragHandleSelect,
}: StepStripProps) {
  return (
    <PanelCard
      title="Steps"
      eyebrow="Page strip"
      aside={
        <div className="flex gap-2">
          <button
            type="button"
            title="Add step"
            aria-label="Add step"
            onClick={onAddStep}
            className={iconButtonClass()}
          >
            <PlusIcon />
          </button>
        </div>
      }
      className="min-h-[52rem] min-w-0 overflow-hidden"
    >
      <div className="space-y-2 overflow-y-auto pr-1">
        {activeDocument?.steps.map((step, stepIndex) => (
          <div key={step.id} className="space-y-2">
            <DropMarker
              target={{ kind: "step-list", index: stepIndex }}
              label="Insert step here"
              dragPayload={dragPayload}
              activeDropTargetKey={activeDropTargetKey}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            />
            <div
              {...dropTargetAttributes({ kind: "step-list", index: stepIndex })}
              onDragOver={(event) =>
                onDragOver(event, { kind: "step-list", index: stepIndex }, { positionByPointer: true })
              }
              onDragLeave={() => onDragLeave({ kind: "step-list", index: stepIndex })}
              onDrop={(event) => onDrop(event, { kind: "step-list", index: stepIndex }, { positionByPointer: true })}
              className={`flex min-w-0 items-stretch gap-2 rounded-[1rem] border p-2 transition ${
                selectedAuthoring?.stepId === step.id
                  ? "border-blue-300 bg-[#e8f0ff] shadow-[0_12px_24px_rgba(37,99,235,0.10)]"
                  : "border-soft bg-white hover:border-slate-300"
              } ${
                dragPayloadMatchesSelection(dragPayload, { kind: "step", stepId: step.id })
                  ? "scale-[0.99] opacity-55 shadow-[0_18px_34px_rgba(37,99,235,0.16)]"
                  : ""
              }`}
            >
              <DragHandle
                label={`Drag step ${stepIndex + 1}`}
                payload={{ kind: "step", stepId: step.id }}
                compact
                onPointerDown={onDragHandlePointerDown}
                onPointerMove={onDragHandlePointerMove}
                onPointerUp={onDragHandlePointerUp}
                onPointerCancel={onDragHandlePointerCancel}
                onSelect={onDragHandleSelect}
              />
              <button
                type="button"
                onClick={() => onSelectStep({ kind: "step", stepId: step.id })}
                className="flex min-w-0 flex-1 items-start gap-3 rounded-[0.8rem] px-1 py-0.5 text-left transition hover:bg-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              >
                <PageIcon />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Step {stepIndex + 1}
                  </span>
                  <span className="mt-1 block truncate text-sm font-semibold text-slate-950">{step.title}</span>
                  <span className="mt-1 block truncate text-xs text-slate-500">{step.sections.length} sections</span>
                  {(() => {
                    const behaviorSummary = summarizeStepBehavior(step);
                    return behaviorSummary.ruleCount || behaviorSummary.flowCount ? (
                      <span className="mt-2 flex flex-wrap gap-1.5">
                        {behaviorSummary.ruleCount ? (
                          <span className="app-pill">{behaviorSummary.ruleCount} conditions</span>
                        ) : null}
                        {behaviorSummary.flowCount ? (
                          <span className="app-pill">{behaviorSummary.flowCount} flows</span>
                        ) : null}
                      </span>
                    ) : null;
                  })()}
                </span>
              </button>
            </div>
          </div>
        ))}
        {activeDocument?.steps?.length ? (
          <DropMarker
            target={{ kind: "step-list", index: activeDocument.steps.length }}
            label="Insert step at end"
            dragPayload={dragPayload}
            activeDropTargetKey={activeDropTargetKey}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          />
        ) : null}
      </div>
    </PanelCard>
  );
}
