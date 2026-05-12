import type { CSSProperties, MutableRefObject, ReactNode } from "react";
import { createPortal } from "react-dom";

import { actionButtonClass, iconButtonClass } from "../builder/utils/builder-utils";
import type {
  BehaviorStudioManagerMode,
  BehaviorStudioMode,
  BehaviorStudioPositionLayout,
  BehaviorStudioView,
} from "./utils/runtime-helpers";

export interface BehaviorStudioModalProps {
  behaviorStudioDialogRef: MutableRefObject<HTMLDivElement | null>;
  behaviorStudioMode: BehaviorStudioMode;
  behaviorStudioWorkspaceShell: boolean;
  behaviorStudioPosition: BehaviorStudioPositionLayout;
  currentBehaviorSelectionSummary: () => string;
  bodyContent: ReactNode;
  onOpenBehaviorStudioEventSection: () => void;
  onOpenBehaviorStudioListenerSection: () => void;
  onOpenBehaviorStudioActionSection: () => void;
  onSetBehaviorStudioCreating: (creating: boolean) => void;
  onSetBehaviorFocusTarget: (target: "simulator" | null) => void;
  onSetBehaviorStudioManagerMode: (mode: BehaviorStudioManagerMode) => void;
  onSetBehaviorStudioMode: (mode: BehaviorStudioMode) => void;
  onSetBehaviorStudioView: (view: BehaviorStudioView) => void;
  onCloseBehaviorStudio: () => void;
}

export function BehaviorStudioModal({
  behaviorStudioDialogRef,
  behaviorStudioMode,
  behaviorStudioWorkspaceShell,
  behaviorStudioPosition,
  currentBehaviorSelectionSummary,
  bodyContent,
  onOpenBehaviorStudioEventSection,
  onOpenBehaviorStudioListenerSection,
  onOpenBehaviorStudioActionSection,
  onSetBehaviorStudioCreating,
  onSetBehaviorFocusTarget,
  onSetBehaviorStudioManagerMode,
  onSetBehaviorStudioMode,
  onSetBehaviorStudioView,
  onCloseBehaviorStudio,
}: BehaviorStudioModalProps) {
  return createPortal(
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center overflow-hidden overscroll-contain bg-slate-950/28 p-2 pt-3 sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCloseBehaviorStudio();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onCloseBehaviorStudio();
        }
      }}
    >
      <div
        ref={behaviorStudioDialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="behavior-studio-title"
        tabIndex={-1}
        style={behaviorStudioPosition.dialogStyle ?? {}}
        className={`relative flex w-full flex-col overflow-hidden rounded-[1.15rem] border border-soft bg-[#f5f7fb] shadow-[0_24px_64px_rgba(15,23,42,0.24)] outline-none ${
          behaviorStudioMode === "graph"
            ? "h-[min(86dvh,47.5rem)] max-w-[70rem]"
            : behaviorStudioWorkspaceShell
              ? "h-[min(84dvh,46rem)] max-w-[70rem]"
              : "h-[min(78dvh,39rem)] max-w-[56rem]"
        }`}
      >
        {behaviorStudioPosition.anchored && behaviorStudioPosition.arrowStyle != null ? (
          <span
            aria-hidden="true"
            style={behaviorStudioPosition.arrowStyle as CSSProperties}
            className={`pointer-events-none absolute z-10 h-3 w-3 -translate-x-1/2 rotate-45 border-slate-200 ${
              behaviorStudioPosition.placement === "below"
                ? "-top-1.5 border-l border-t bg-white/96"
                : "-bottom-1.5 border-b border-r bg-[#f5f7fb]"
            }`}
          />
        ) : null}
        <div className="shrink-0 border-b border-slate-200 bg-white/96 px-3 py-2.5 backdrop-blur sm:px-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Behavior studio</p>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
                <h3 id="behavior-studio-title" className="text-lg font-semibold text-slate-950">
                  {behaviorStudioMode === "event"
                    ? "Event"
                    : behaviorStudioMode === "listener"
                      ? "Listener"
                      : behaviorStudioMode === "action"
                        ? "Action"
                        : behaviorStudioMode === "create"
                          ? "Behavior editor"
                          : behaviorStudioMode === "manage"
                            ? "Behavior Manager"
                            : "Graph view"}
                </h3>
                <span className="app-pill max-w-[22rem] truncate">{currentBehaviorSelectionSummary()}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={onOpenBehaviorStudioEventSection}
                className={actionButtonClass(behaviorStudioMode === "event" ? "primary" : "secondary")}
              >
                Event
              </button>
              <button
                type="button"
                onClick={onOpenBehaviorStudioListenerSection}
                className={actionButtonClass(behaviorStudioMode === "listener" ? "primary" : "secondary")}
              >
                Listener
              </button>
              <button
                type="button"
                onClick={onOpenBehaviorStudioActionSection}
                className={actionButtonClass(behaviorStudioMode === "action" ? "primary" : "secondary")}
              >
                Action
              </button>
              <button
                type="button"
                onClick={() => {
                  onSetBehaviorStudioCreating(false);
                  onSetBehaviorFocusTarget(null);
                  onSetBehaviorStudioManagerMode("all");
                  onSetBehaviorStudioMode("manage");
                  onSetBehaviorStudioView("studio");
                }}
                className={actionButtonClass(behaviorStudioMode === "manage" ? "primary" : "secondary")}
              >
                Manage
              </button>
              <button
                type="button"
                aria-label="Close behavior studio"
                onClick={onCloseBehaviorStudio}
                className={iconButtonClass()}
              >
                ×
              </button>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4">{bodyContent}</div>
      </div>
    </div>,
    document.body,
  );
}
