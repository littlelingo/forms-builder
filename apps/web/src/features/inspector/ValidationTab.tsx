import type { AuthoringField, AuthoringGroup, AuthoringSection, AuthoringStep } from "@form-builder/schema";

import type { AuthoringSelection } from "../../lib/authoring-utils";

export interface ValidationTabProps {
  selectedAuthoring: AuthoringSelection | null;
  activeStep: AuthoringStep | null;
  activeSection: AuthoringSection | null;
  activeGroup: AuthoringGroup | null;
  activeBuilderField: AuthoringField | null;
}

export function ValidationTab({
  selectedAuthoring,
  activeStep,
  activeSection,
  activeGroup,
  activeBuilderField,
}: ValidationTabProps) {
  const hasSelection = selectedAuthoring !== null;
  const selectionLabel = !hasSelection
    ? null
    : selectedAuthoring.kind === "field"
      ? activeBuilderField?.label
      : selectedAuthoring.kind === "group"
        ? activeGroup?.label
        : selectedAuthoring.kind === "section"
          ? activeSection?.title
          : activeStep?.title;

  return (
    <div className="space-y-4">
      <div className="rounded-[1.15rem] border border-soft bg-white p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Validation rules</p>
        {hasSelection && selectionLabel ? (
          <h4 className="mt-2 text-lg font-semibold text-slate-950">{selectionLabel}</h4>
        ) : null}
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Field-level validation rules (required, pattern, min/max length) will be configured here. This panel is
          reserved for the validation authoring surface — coming in a future task.
        </p>
      </div>
    </div>
  );
}
