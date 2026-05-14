import type { CrossStepRef } from "../../../lib/payload-schema-helpers";

export interface CrossStepRefBadgeProps {
  crossStepRef: CrossStepRef;
  onNavigate?: (sourceNodeId: string) => void;
}

export function CrossStepRefBadge({ crossStepRef, onNavigate }: CrossStepRefBadgeProps) {
  return (
    <button
      type="button"
      onClick={() => onNavigate?.(crossStepRef.sourceNodeId)}
      className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
      title={`Cross-step reference from ${crossStepRef.sourceStepTitle}`}
    >
      <span aria-hidden="true">←</span>
      <span>{crossStepRef.sourceStepTitle}</span>
    </button>
  );
}
