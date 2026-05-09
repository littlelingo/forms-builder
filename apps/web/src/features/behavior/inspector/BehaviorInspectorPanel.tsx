import type { AuthoringField, AuthoringStep } from "@form-builder/schema";

import type { AuthoringSelection } from "../../../lib/authoring-utils";
import { actionButtonClass } from "../../builder/utils/builder-utils";
import type {
  BehaviorStudioMode,
  BehaviorStudioView,
  LegacyConditionalRule,
  LegacyConditionalRuleGroup,
  RuntimeEditorScope,
} from "../utils/runtime-helpers";

export interface BehaviorInspectorPanelProps {
  selectedAuthoring: AuthoringSelection | null;
  activeBuilderField: AuthoringField | null;
  activeRuntimeScope: RuntimeEditorScope | null;
  activeStep: AuthoringStep | null;
  buildLegacyConditionalRuleGroups: (conditions: LegacyConditionalRule[]) => LegacyConditionalRuleGroup[];
  legacyFieldConditionals: (field: AuthoringField) => LegacyConditionalRule[];
  currentBehaviorSelectionSummary: () => string;
  onOpenBehaviorStudio: (view?: BehaviorStudioView, mode?: BehaviorStudioMode) => void;
}

export function BehaviorInspectorPanel({
  selectedAuthoring,
  activeBuilderField,
  activeRuntimeScope,
  activeStep,
  buildLegacyConditionalRuleGroups,
  legacyFieldConditionals,
  currentBehaviorSelectionSummary,
  onOpenBehaviorStudio,
}: BehaviorInspectorPanelProps) {
  const conditionalGroups =
    selectedAuthoring?.kind === "field" && activeBuilderField
      ? buildLegacyConditionalRuleGroups(legacyFieldConditionals(activeBuilderField))
      : [];
  const scopeListeners = activeRuntimeScope?.listeners ?? [];
  const scopeEvents = activeRuntimeScope?.eventSources ?? [];
  const currentScopeTitle =
    selectedAuthoring === null
      ? "Form behavior"
      : (activeRuntimeScope?.label ?? activeBuilderField?.label ?? activeStep?.title ?? "Current selection");
  const hasInlineBehaviorToolbar =
    selectedAuthoring?.kind === "step" ||
    selectedAuthoring?.kind === "section" ||
    selectedAuthoring?.kind === "group" ||
    selectedAuthoring?.kind === "field";

  return (
    <div className="space-y-4">
      {!hasInlineBehaviorToolbar ? (
        <div className="rounded-[1.15rem] border border-soft bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Scope behavior</p>
              <h4 className="mt-2 text-lg font-semibold text-slate-950">{currentScopeTitle}</h4>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Form-level behavior opens from here. Selected steps and elements use inline preview controls.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenBehaviorStudio("studio")}
              className={actionButtonClass("primary")}
            >
              Open studio
            </button>
          </div>
        </div>
      ) : null}

      <div className="rounded-[1.15rem] border border-soft bg-white p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">At a glance</p>
        <h4 className="mt-2 text-lg font-semibold text-slate-950">{currentScopeTitle}</h4>
        <div className="mt-3 flex flex-wrap gap-2">
          {conditionalGroups.length ? <span className="app-pill">{conditionalGroups.length} bundles</span> : null}
          {scopeEvents.length ? <span className="app-pill">{scopeEvents.length} events</span> : null}
          {scopeListeners.length ? <span className="app-pill">{scopeListeners.length} listeners</span> : null}
          {activeRuntimeScope ? <span className="app-pill">{activeRuntimeScope.label}</span> : null}
          <span className="app-pill">{currentBehaviorSelectionSummary()}</span>
        </div>
        {hasInlineBehaviorToolbar ? (
          <div className="mt-3 rounded-[0.95rem] border border-dashed border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-600">
            Use the behavior toolbar on the selected card to add or test behavior. This rail is status only.
          </div>
        ) : null}
        <div className="mt-3 grid gap-3">
          <div className="rounded-[0.95rem] border border-soft bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Events</p>
            <p className="mt-2 font-semibold text-slate-950">
              {scopeEvents.length ? `${scopeEvents.length} saved` : "None yet"}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Events define what this component can dispatch for listeners.
            </p>
          </div>
          <div className="rounded-[0.95rem] border border-soft bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Conditions</p>
            <p className="mt-2 font-semibold text-slate-950">
              {conditionalGroups.length ? `${conditionalGroups.length} available` : "None yet"}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              State logic belongs in the studio-managed conditions list, not inside the rail.
            </p>
          </div>
          <div className="rounded-[0.95rem] border border-soft bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Flows</p>
            <p className="mt-2 font-semibold text-slate-950">
              {scopeListeners.length ? `${scopeListeners.length} available` : "None yet"}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Trigger and action-chain work now lives in the studio and advanced workspace.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
