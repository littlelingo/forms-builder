import type { AuthoringDocument, AuthoringField, AuthoringStep, RuntimeListenerDefinition } from "@form-builder/schema";

import type { AuthoringSelection } from "../../../lib/authoring-utils";
import { actionButtonClass } from "../../builder/utils/builder-utils";
import { BehaviorStackList } from "../index";
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

  // New for Phase 1C-1:
  document: AuthoringDocument;
  scopeListeners: RuntimeListenerDefinition[];
  selectedListenerId: string | null;
  onSelectListener: (listenerId: string) => void;
  onEditListener: (listenerId: string) => void;
  onToggleListenerEnabled: (listenerId: string, enabled: boolean) => void;
  onReorderListener: (listenerId: string, fromIndex: number, toIndex: number) => void;
  onAddBehavior: () => void;
  externalReferenceCount: number;
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
  document,
  scopeListeners,
  selectedListenerId,
  onSelectListener,
  onEditListener,
  onToggleListenerEnabled,
  onReorderListener,
  onAddBehavior,
  externalReferenceCount,
}: BehaviorInspectorPanelProps) {
  const conditionalGroups =
    selectedAuthoring?.kind === "field" && activeBuilderField
      ? buildLegacyConditionalRuleGroups(legacyFieldConditionals(activeBuilderField))
      : [];
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
      </div>

      <BehaviorStackList
        listeners={scopeListeners}
        document={document}
        selectedListenerId={selectedListenerId}
        onSelectListener={onSelectListener}
        onEditListener={onEditListener}
        onToggleListenerEnabled={onToggleListenerEnabled}
        onReorderListener={onReorderListener}
        onAddBehavior={onAddBehavior}
      />

      {externalReferenceCount > 0 ? (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Used by {externalReferenceCount} behavior{externalReferenceCount === 1 ? "" : "s"} elsewhere
        </div>
      ) : null}
    </div>
  );
}
