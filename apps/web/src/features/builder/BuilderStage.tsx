import { useEffect, useState, type ReactNode } from "react";

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
 */
export function BuilderStage({ stepStrip, previewCanvas, inspector, expandedRailWidth }: BuilderStageProps) {
  const isXl = useIsXlOrLarger();
  const expandedStyle =
    expandedRailWidth != null && isXl
      ? { gridTemplateColumns: `12.5rem minmax(0, 1fr) ${expandedRailWidth}px` }
      : undefined;
  return (
    <section
      className={expandedStyle != null ? "grid gap-5" : "grid gap-5 xl:grid-cols-[12.5rem_minmax(0,1fr)_24rem]"}
      style={expandedStyle}
    >
      {stepStrip}
      {previewCanvas}
      {inspector}
    </section>
  );
}
