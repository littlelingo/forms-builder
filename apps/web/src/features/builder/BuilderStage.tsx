import { useEffect, useState, type ReactNode } from "react";

import { TestPanelTrigger } from "../test-panel";
import type { TestPanelSelection } from "../test-panel";

export interface BuilderStageProps {
  /** The step strip panel (left column). */
  stepStrip: ReactNode;
  /** The preview canvas panel (center column). */
  previewCanvas: ReactNode;
  /** The inspector panel (right column). */
  inspector: ReactNode;
  /** When set, overrides the third column width (px) in the grid template. */
  expandedRailWidth?: number;
  /** Opens the unified TestPanel with the supplied selection (Phase 8 trigger). */
  onOpenTestPanel?: (selection: TestPanelSelection) => void;
  /** Derives the current TestPanel selection from the active authoring/listener selection. */
  deriveTestPanelSelection?: () => TestPanelSelection;
}

function useIsXlOrLarger(): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1280px)").matches : true,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia("(min-width: 1280px)");
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
    query.addEventListener("change", handler);
    return () => query.removeEventListener("change", handler);
  }, []);
  return matches;
}

/**
 * BuilderStage lays out the three-column build-stage grid:
 * step strip (left) | preview canvas (center) | inspector (right).
 *
 * When `onOpenTestPanel` + `deriveTestPanelSelection` are provided, renders a
 * small toolbar above the grid carrying the unified TestPanel trigger.
 * Walkthrough and other toolbar actions will share this bar in later phases.
 */
export function BuilderStage({
  stepStrip,
  previewCanvas,
  inspector,
  expandedRailWidth,
  onOpenTestPanel,
  deriveTestPanelSelection,
}: BuilderStageProps) {
  const isXl = useIsXlOrLarger();
  const expandedStyle =
    expandedRailWidth != null && isXl
      ? { gridTemplateColumns: `12.5rem minmax(0, 1fr) min(${expandedRailWidth}px, calc(100vw - 42rem))` }
      : undefined;
  const toolbar =
    onOpenTestPanel && deriveTestPanelSelection ? (
      <div
        className="mb-3 flex flex-wrap items-center justify-end gap-2"
        role="toolbar"
        aria-label="Builder stage toolbar"
      >
        <TestPanelTrigger derive={deriveTestPanelSelection} onOpen={onOpenTestPanel} label="Test (⌘K)" />
      </div>
    ) : null;
  return (
    <>
      {toolbar}
      <section
        className={
          expandedStyle != null
            ? "grid items-start gap-5"
            : "grid items-start gap-5 xl:grid-cols-[12.5rem_minmax(0,1fr)_24rem]"
        }
        style={expandedStyle}
      >
        {stepStrip}
        {previewCanvas}
        {inspector}
      </section>
    </>
  );
}
