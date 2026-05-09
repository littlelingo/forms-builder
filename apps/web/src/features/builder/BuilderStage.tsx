import type { ReactNode } from "react";

export interface BuilderStageProps {
  /** The step strip panel (left column). */
  stepStrip: ReactNode;
  /** The preview canvas panel (center column). */
  previewCanvas: ReactNode;
  /** The inspector panel (right column). */
  inspector: ReactNode;
}

/**
 * BuilderStage lays out the three-column build-stage grid:
 * step strip (left) | preview canvas (center) | inspector (right).
 */
export function BuilderStage({ stepStrip, previewCanvas, inspector }: BuilderStageProps) {
  return (
    <section className="grid gap-5 xl:grid-cols-[12.5rem_minmax(0,1fr)_24rem]">
      {stepStrip}
      {previewCanvas}
      {inspector}
    </section>
  );
}
