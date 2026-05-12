import type { MouseEvent } from "react";

import type { AuthoringDocument } from "@form-builder/schema";

import type {
  BehaviorStudioAnchor,
  BehaviorStudioMode,
  BehaviorStudioView,
  RuntimeEditorScope,
} from "../utils/runtime-helpers";

function EventsIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 4.5h6M3 8h10M3 11.5h7" />
      <circle cx="11.75" cy="4.5" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="13" cy="11.5" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M5.25 3.25v9.5L12 8z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export interface BehaviorQuickToolbarProps {
  activeDocument: AuthoringDocument | null;
  activeRuntimeScope: RuntimeEditorScope | null;
  compact?: boolean;
  stopPropagation?: boolean;
  label?: string;
  onOpenBehaviorStudioAddBehavior: (anchor: BehaviorStudioAnchor | null) => void;
  onSetBehaviorStudioMode: (mode: BehaviorStudioMode) => void;
  onSetBehaviorFocusTarget: (target: "simulator" | null) => void;
  onOpenBehaviorStudio: (
    view: BehaviorStudioView,
    mode?: BehaviorStudioMode,
    anchor?: BehaviorStudioAnchor | null,
  ) => void;
  onCreateBehaviorStudioAnchor: (element: HTMLElement | null) => BehaviorStudioAnchor | null;
  /**
   * Phase 10 — Test button opens the unified TestPanel pre-filled from the
   * current authoring selection. Replaces the old `behaviorStudioMode === "test"`
   * studio surface.
   */
  onOpenTestPanel?: () => void;
}

export function BehaviorQuickToolbar({
  activeDocument,
  activeRuntimeScope,
  compact,
  stopPropagation,
  label,
  onOpenBehaviorStudioAddBehavior,
  onCreateBehaviorStudioAnchor,
  onOpenTestPanel,
}: BehaviorQuickToolbarProps) {
  if (!activeDocument) {
    return null;
  }
  const canCreateFlow = Boolean(activeRuntimeScope);
  const isCompact = compact ?? false;
  const toolButtonClass = `group relative inline-flex ${isCompact ? "h-8 w-8" : "h-9 w-9"} items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:pointer-events-none disabled:opacity-45`;
  const tooltipClass =
    "pointer-events-none absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-950 px-2 py-1 text-[0.68rem] font-semibold text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100";
  const runToolbarAction = (
    event: MouseEvent<HTMLButtonElement>,
    action: (anchor: BehaviorStudioAnchor | null) => void,
  ) => {
    if (stopPropagation) {
      event.stopPropagation();
    }
    action(onCreateBehaviorStudioAnchor(event.currentTarget));
  };
  const handleTestClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (stopPropagation) {
      event.stopPropagation();
    }
    onOpenTestPanel?.();
  };

  return (
    <div
      data-behavior-toolbar-anchor
      className={`${isCompact ? "inline-flex" : "flex"} rounded-full border border-blue-100 bg-white/92 px-2 py-1.5 shadow-[0_10px_24px_rgba(37,99,235,0.12)] backdrop-blur`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="px-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-blue-700">
          {label ?? "Behavior"}
        </span>
        <div className="flex items-center gap-1.5" role="toolbar" aria-label="Behavior quick actions">
          <button
            type="button"
            title={canCreateFlow ? "Add behavior" : "Select a behavior-capable scope"}
            aria-label={canCreateFlow ? "Add behavior" : "Select a behavior-capable scope"}
            disabled={!canCreateFlow}
            onClick={(event) => runToolbarAction(event, onOpenBehaviorStudioAddBehavior)}
            className={toolButtonClass}
          >
            <EventsIcon />
            <span className={tooltipClass}>Add behavior</span>
          </button>
          {onOpenTestPanel ? (
            <button
              type="button"
              title="Test selected behavior"
              aria-label="Test selected behavior"
              onClick={handleTestClick}
              className={toolButtonClass}
            >
              <PlayIcon />
              <span className={tooltipClass}>Test</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
