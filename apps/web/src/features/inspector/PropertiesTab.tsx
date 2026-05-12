import type {
  AuthoringDocument,
  AuthoringField,
  AuthoringGroup,
  AuthoringSection,
  AuthoringStep,
  SemanticType,
} from "@form-builder/schema";

import type { AuthoringSelection } from "../../lib/authoring-utils";
import { convertFieldToActionButton, refreshChoiceOptions } from "../../lib/authoring-utils";
import { actionButtonClass, builderFieldTypeOptions, formatLabel } from "../builder/utils/builder-utils";

export interface PropertiesTabProps {
  selectedAuthoring: AuthoringSelection | null;
  activeStep: AuthoringStep | null;
  activeSection: AuthoringSection | null;
  activeGroup: AuthoringGroup | null;
  activeBuilderField: AuthoringField | null;
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
  /** When true, all form controls are disabled (viewer role, #2). */
  isViewerMode?: boolean;
}

export function PropertiesTab({
  selectedAuthoring,
  activeStep,
  activeSection,
  activeGroup,
  activeBuilderField,
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
  isViewerMode = false,
}: PropertiesTabProps) {
  return (
    <fieldset
      disabled={isViewerMode}
      className="space-y-4 border-0 p-0 m-0 disabled:opacity-70 disabled:cursor-not-allowed"
    >
      {selectedAuthoring?.kind === "step" && activeStep ? (
        <div className="rounded-[1.15rem] border border-soft bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Step title</label>
            <button type="button" onClick={() => onRemoveStep(activeStep.id)} className={actionButtonClass("danger")}>
              Remove step
            </button>
          </div>
          <input
            value={activeStep.title}
            onChange={(event) =>
              onUpdateDocument((document) => {
                const step = document.steps.find((candidate) => candidate.id === activeStep.id);
                if (step) {
                  step.title = event.target.value;
                }
              })
            }
            className="mt-2 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
          />
          <textarea
            value={activeStep.description ?? ""}
            onChange={(event) =>
              onUpdateDocument((document) => {
                const step = document.steps.find((candidate) => candidate.id === activeStep.id);
                if (step) {
                  step.description = event.target.value;
                }
              })
            }
            rows={3}
            className="mt-3 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
          />
        </div>
      ) : null}

      {selectedAuthoring?.kind === "section" && activeSection ? (
        <div className="rounded-[1.15rem] border border-soft bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Section title</label>
            <button
              type="button"
              onClick={() => onRemoveSection(selectedAuthoring.stepId, selectedAuthoring.sectionId)}
              className={actionButtonClass("danger")}
            >
              Remove section
            </button>
          </div>
          <input
            value={activeSection.title}
            onChange={(event) =>
              onUpdateDocument((document) => {
                const step = document.steps.find((candidate) => candidate.id === selectedAuthoring.stepId);
                const section = step?.sections.find((candidate) => candidate.id === selectedAuthoring.sectionId);
                if (section) {
                  section.title = event.target.value;
                }
              })
            }
            className="mt-2 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
          />
          <textarea
            value={activeSection.description ?? ""}
            onChange={(event) =>
              onUpdateDocument((document) => {
                const step = document.steps.find((candidate) => candidate.id === selectedAuthoring.stepId);
                const section = step?.sections.find((candidate) => candidate.id === selectedAuthoring.sectionId);
                if (section) {
                  section.description = event.target.value;
                }
              })
            }
            rows={3}
            className="mt-3 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onAddGroupToSection(selectedAuthoring.stepId, selectedAuthoring.sectionId)}
              className={actionButtonClass()}
            >
              Add group
            </button>
            <button type="button" onClick={() => onAddField("section")} className={actionButtonClass()}>
              Add field
            </button>
          </div>
        </div>
      ) : null}

      {selectedAuthoring?.kind === "group" && activeGroup ? (
        <div className="rounded-[1.15rem] border border-soft bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Group label</label>
            <button
              type="button"
              onClick={() =>
                onRemoveGroup(selectedAuthoring.stepId, selectedAuthoring.sectionId, selectedAuthoring.groupId)
              }
              className={actionButtonClass("danger")}
            >
              Remove group
            </button>
          </div>
          <input
            value={activeGroup.label}
            onChange={(event) =>
              onUpdateDocument((document) => {
                const step = document.steps.find((candidate) => candidate.id === selectedAuthoring.stepId);
                const section = step?.sections.find((candidate) => candidate.id === selectedAuthoring.sectionId);
                const group = section?.groups.find((candidate) => candidate.id === selectedAuthoring.groupId);
                if (group) {
                  group.label = event.target.value;
                }
              })
            }
            className="mt-2 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
          />
          <textarea
            value={activeGroup.description ?? ""}
            onChange={(event) =>
              onUpdateDocument((document) => {
                const step = document.steps.find((candidate) => candidate.id === selectedAuthoring.stepId);
                const section = step?.sections.find((candidate) => candidate.id === selectedAuthoring.sectionId);
                const group = section?.groups.find((candidate) => candidate.id === selectedAuthoring.groupId);
                if (group) {
                  group.description = event.target.value;
                }
              })
            }
            rows={3}
            className="mt-3 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
          />
          <div className="mt-3">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onAddField("group")} className={actionButtonClass()}>
                Add field to group
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedAuthoring?.kind === "field" && activeBuilderField ? (
        <div className="space-y-4 rounded-[1.15rem] border border-soft bg-white p-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() =>
                onRemoveField(
                  selectedAuthoring.stepId,
                  selectedAuthoring.sectionId,
                  selectedAuthoring.fieldId,
                  selectedAuthoring.groupId,
                )
              }
              className={actionButtonClass("danger")}
            >
              Remove field
            </button>
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Field label</label>
            <input
              value={activeBuilderField.label}
              onChange={(event) =>
                onUpdateField((field) => {
                  field.label = event.target.value;
                })
              }
              className="mt-2 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Help text</label>
            <textarea
              value={activeBuilderField.helpText ?? ""}
              onChange={(event) =>
                onUpdateField((field) => {
                  field.helpText = event.target.value;
                })
              }
              rows={3}
              className="mt-2 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Field type</label>
              <select
                value={
                  activeBuilderField.rendererHints.component === "button"
                    ? "action_button"
                    : activeBuilderField.semanticType
                }
                onChange={(event) =>
                  onUpdateField((field) => {
                    if (event.target.value === "action_button") {
                      convertFieldToActionButton(field);
                      return;
                    }
                    refreshChoiceOptions(field, event.target.value as SemanticType);
                  })
                }
                className="mt-2 w-full rounded-2xl border border-soft px-4 py-3 text-sm text-slate-800"
              >
                {builderFieldTypeOptions.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <label className="mt-6 flex items-center gap-3 rounded-2xl border border-soft bg-slate-50 px-4 py-3">
              <input
                type="checkbox"
                checked={activeBuilderField.required}
                onChange={(event) =>
                  onUpdateField((field) => {
                    field.required = event.target.checked;
                  })
                }
              />
              <span className="text-sm text-slate-700">Required</span>
            </label>
          </div>
          {activeBuilderField.rendererHints.component === "button" ? (
            <p className="text-sm leading-6 text-slate-500">
              Buttons are runtime components. Configure their behavior from the Behavior tab so the runtime engine and
              builder preview stay in sync.
            </p>
          ) : null}
          {activeBuilderField.rendererHints.component === "button" ? (
            <div className="rounded-[1rem] border border-soft bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Runtime behavior</p>
                  <p className="mt-2 text-sm text-slate-700">
                    Current button behavior: {formatLabel(getButtonBehaviorSummary(activeBuilderField).action)}
                  </p>
                </div>
                <button type="button" onClick={onOpenBehaviorTab} className={actionButtonClass("primary")}>
                  Open Behavior
                </button>
              </div>
            </div>
          ) : null}
          {activeBuilderField.semanticType === "radio" ||
          activeBuilderField.semanticType === "checkbox" ||
          activeBuilderField.semanticType === "select" ? (
            <div className="rounded-[1rem] border border-soft bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Options</p>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateField((field) => {
                      field.options.push({
                        value: `option_${field.options.length + 1}`,
                        label: `Option ${field.options.length + 1}`,
                        orderIndex: field.options.length,
                        selectedByDefault: false,
                        evidence: [],
                      });
                    })
                  }
                  className={actionButtonClass()}
                >
                  Add option
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {activeBuilderField.options.map((option, index) => (
                  <div key={`${activeBuilderField.id}-${option.value}-${index}`} className="flex items-center gap-2">
                    <input
                      value={option.label}
                      onChange={(event) =>
                        onUpdateField((field) => {
                          if (field.options[index]) {
                            field.options[index].label = event.target.value;
                            field.options[index].value = event.target.value.toLowerCase().replaceAll(/\s+/g, "_");
                          }
                        })
                      }
                      className="flex-1 rounded-2xl border border-soft px-4 py-2 text-sm text-slate-800"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateField((field) => {
                          if (field.options.length > 1) {
                            field.options.splice(index, 1);
                            field.options.forEach((current, currentIndex) => {
                              current.orderIndex = currentIndex;
                            });
                          }
                        })
                      }
                      className={actionButtonClass("danger")}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}
