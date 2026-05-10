import type { ReactNode } from "react";

export interface BuilderStageProps {
  /** The step strip panel (left column). */
  stepStrip: ReactNode;
  /** The preview canvas panel (center column). */
  previewCanvas: ReactNode;
  /** The inspector panel (right column). */
  inspector: ReactNode;
  /** When set, overrides the third column width (px) in the grid template. */
  expandedRailWidth?: number;
}

/**
 * BuilderStage lays out the three-column build-stage grid:
 * step strip (left) | preview canvas (center) | inspector (right).
 */
export function BuilderStage({ stepStrip, previewCanvas, inspector, expandedRailWidth }: BuilderStageProps) {
  const gridStyle =
    expandedRailWidth != null ? { gridTemplateColumns: `12.5rem minmax(0,1fr) ${expandedRailWidth}px` } : undefined;
  return (
    <section
      className={expandedRailWidth != null ? "grid gap-5" : "grid gap-5 xl:grid-cols-[12.5rem_minmax(0,1fr)_24rem]"}
      style={gridStyle}
    >
      {stepStrip}
      {previewCanvas}
      {inspector}
    </section>
  );
}
