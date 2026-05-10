import type { ReactNode } from "react";

import type {
  AuthoringDocument,
  AuthoringField,
  AuthoringGroup,
  AuthoringSection,
  AuthoringStep,
} from "@form-builder/schema";
import { PanelCard } from "@form-builder/ui";

import type { AuthoringSelection } from "../../lib/authoring-utils";
import { actionButtonClass, iconButtonClass } from "../builder/utils/builder-utils";
import { PropertiesTab } from "./PropertiesTab";
import { ValidationTab } from "./ValidationTab";

export type InspectorTab = "properties" | "validation" | "behavior" | "map";

function PropertiesIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 4.5h10M3 8h10M3 11.5h6.5" />
    </svg>
  );
}

function ValidationIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 8l3 3 7-7" />
    </svg>
  );
}

function LogicIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="4.25" cy="4.25" r="1.75" />
      <circle cx="11.75" cy="8" r="1.75" />
      <circle cx="4.25" cy="11.75" r="1.75" />
      <path d="M6 4.25h3.5M4.25 6v3.75M6 11.75h3.5" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="3.5" cy="4" r="1.5" />
      <circle cx="12.5" cy="4" r="1.5" />
      <circle cx="8" cy="12" r="1.5" />
      <path d="M5 4h6M4.5 5.2l2.4 5.1M11.5 5.2l-2.4 5.1" />
    </svg>
  );
}

export interface InspectorRailProps {
  // Tab state (controlled)
  activeTab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;

  /** Optional override of the rail width when an inline editor is open. */
  expandedWidth?: number;

  // Slot for behaviors tab content (Task 6 replaces with a real component)
  behaviorsSlot: ReactNode;
  // Slot for map tab content
  mapSlot: ReactNode;

  // Document / selection state
  activeDocument: AuthoringDocument | null;
  isPdfBackedProject: boolean;
  selectedAuthoring: AuthoringSelection | null;
  activeStep: AuthoringStep | null;
  activeSection: AuthoringSection | null;
  activeGroup: AuthoringGroup | null;
  activeBuilderField: AuthoringField | null;

  // Source reference
  sourceReferenceCanOpen: boolean;
  sourceReferenceOpenMode: "all" | "matches";
  sourceReferenceFocusHasMatches: boolean;
  sourceReferenceActionLabel: string;
  onOpenSourceReference: (mode: "all" | "matches") => void;

  // Selection navigation
  onSelectAuthoring: (selection: AuthoringSelection | null) => void;
  onOpenFormBehavior: () => void;

  // PropertiesTab callbacks
  onRemoveStep: (stepId: string) => void;
  onRemoveSection: (stepId: string, sectionId: string) => void;
  onRemoveGroup: (stepId: string, sectionId: string, groupId: string) => void;
  onRemoveField: (stepId: string, sectionId: string, fieldId: string, groupId?: string) => void;
  onUpdateDocument: (mutate: (document: AuthoringDocument) => void) => void;
  onUpdateField: (mutate: (field: AuthoringField) => void) => void;
  onAddGroupToSection: (stepId: string, sectionId: string) => void;
  onAddField: (container: "section" | "group") => void;
  onOpenBehaviorTab: () => void;
  getButtonBehaviorSummary: (field: AuthoringField) => { action: string; eventName: string | null };
}

export function InspectorRail({
  activeTab,
  onTabChange,
  expandedWidth,
  behaviorsSlot,
  mapSlot,
  activeDocument,
  isPdfBackedProject,
  selectedAuthoring,
  activeStep,
  activeSection,
  activeGroup,
  activeBuilderField,
  sourceReferenceCanOpen,
  sourceReferenceOpenMode,
  sourceReferenceFocusHasMatches,
  sourceReferenceActionLabel,
  onOpenSourceReference,
  onSelectAuthoring,
  onOpenFormBehavior,
  onRemoveStep,
  onRemoveSection,
  onRemoveGroup,
  onRemoveField,
  onUpdateDocument,
  onUpdateField,
  onAddGroupToSection,
  onAddField,
  onOpenBehaviorTab,
  getButtonBehaviorSummary,
}: InspectorRailProps) {
  return (
    <div
      className="transition-[width] duration-200 ease-out"
      style={expandedWidth != null ? { width: `${expandedWidth}px` } : undefined}
    >
    <PanelCard
      title="Inspector"
      eyebrow="Properties and behavior"
      aside={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            title="Properties"
            aria-label="Properties"
            onClick={() => onTabChange("properties")}
            className={iconButtonClass(activeTab === "properties" ? "primary" : "secondary")}
          >
            <PropertiesIcon />
          </button>
          <button
            type="button"
            title="Validation"
            aria-label="Validation"
            onClick={() => onTabChange("validation")}
            className={iconButtonClass(activeTab === "validation" ? "primary" : "secondary")}
          >
            <ValidationIcon />
          </button>
          <button
            type="button"
            title="Behavior"
            aria-label="Behavior"
            onClick={() => {
              onOpenFormBehavior();
              onTabChange("behavior");
            }}
            className={iconButtonClass(activeTab === "behavior" ? "primary" : "secondary")}
          >
            <LogicIcon />
          </button>
          <button
            type="button"
            title="Map"
            aria-label="Map"
            onClick={() => onTabChange("map")}
            className={iconButtonClass(activeTab === "map" ? "primary" : "secondary")}
          >
            <MapIcon />
          </button>
        </div>
      }
      className="min-h-[52rem] min-w-0 overflow-hidden"
    >
      {activeDocument ? (
        <div className="space-y-4">
          <div className="app-muted-card p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Current selection</p>
              <div className="flex gap-2">
                {isPdfBackedProject && selectedAuthoring !== null ? (
                  <button
                    type="button"
                    onClick={() => onOpenSourceReference(sourceReferenceOpenMode)}
                    disabled={!sourceReferenceCanOpen}
                    className={actionButtonClass(sourceReferenceFocusHasMatches ? "primary" : "secondary")}
                  >
                    {sourceReferenceActionLabel}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    onSelectAuthoring(null);
                    onOpenFormBehavior();
                    onTabChange("behavior");
                  }}
                  className={actionButtonClass(selectedAuthoring === null ? "primary" : "secondary")}
                >
                  Form behavior
                </button>
                {selectedAuthoring === null && activeStep ? (
                  <button
                    type="button"
                    onClick={() => onSelectAuthoring({ kind: "step", stepId: activeStep.id })}
                    className={actionButtonClass()}
                  >
                    Return to step
                  </button>
                ) : null}
              </div>
            </div>
            <h3 className="mt-2 text-lg font-semibold text-slate-950">
              {selectedAuthoring === null
                ? activeDocument.title
                : selectedAuthoring?.kind === "field"
                  ? activeBuilderField?.label
                  : selectedAuthoring?.kind === "group"
                    ? activeGroup?.label
                    : selectedAuthoring?.kind === "section"
                      ? activeSection?.title
                      : (activeStep?.title ?? activeDocument.title)}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {selectedAuthoring === null
                ? "You are editing form-level runtime behavior. Switch back to a selected node any time from the preview."
                : "The preview is the main editing surface. Use this panel to refine the selected node."}
            </p>
          </div>

          {activeTab === "properties" ? (
            <PropertiesTab
              selectedAuthoring={selectedAuthoring}
              activeStep={activeStep}
              activeSection={activeSection}
              activeGroup={activeGroup}
              activeBuilderField={activeBuilderField}
              onRemoveStep={onRemoveStep}
              onRemoveSection={onRemoveSection}
              onRemoveGroup={onRemoveGroup}
              onRemoveField={onRemoveField}
              onUpdateDocument={onUpdateDocument}
              onUpdateField={onUpdateField}
              onAddGroupToSection={onAddGroupToSection}
              onAddField={onAddField}
              onOpenBehaviorTab={onOpenBehaviorTab}
              getButtonBehaviorSummary={getButtonBehaviorSummary}
            />
          ) : activeTab === "validation" ? (
            <ValidationTab
              selectedAuthoring={selectedAuthoring}
              activeStep={activeStep}
              activeSection={activeSection}
              activeGroup={activeGroup}
              activeBuilderField={activeBuilderField}
            />
          ) : activeTab === "map" ? (
            mapSlot
          ) : (
            behaviorsSlot
          )}
        </div>
      ) : (
        <div className="app-muted-card p-6 text-sm text-slate-500">No project selected.</div>
      )}
    </PanelCard>
    </div>
  );
}
