import type {
  AuthoringDocument,
  AuthoringField,
  AuthoringGroup,
  AuthoringSection,
  AuthoringStep,
  SemanticType,
} from "@form-builder/schema";

export type AuthoringSelection =
  | { kind: "step"; stepId: string }
  | { kind: "section"; stepId: string; sectionId: string }
  | { kind: "group"; stepId: string; sectionId: string; groupId: string }
  | { kind: "field"; stepId: string; sectionId: string; fieldId: string; groupId?: string };

export type DragPayload = AuthoringSelection;

export type DropTarget =
  | { kind: "step-list"; index: number }
  | { kind: "section-list"; stepId: string; index: number }
  | { kind: "group-list"; stepId: string; sectionId: string; index: number }
  | { kind: "field-list"; stepId: string; sectionId: string; groupId?: string; index: number };

export interface SelectionContext {
  step: AuthoringStep | null;
  section: AuthoringSection | null;
  group: AuthoringGroup | null;
  field: AuthoringField | null;
}

export function cloneDocument(document: AuthoringDocument): AuthoringDocument {
  return structuredClone(document);
}

export function createField(semanticType: SemanticType = "text"): AuthoringField {
  return {
    id: crypto.randomUUID(),
    stableKey: `field_${Math.random().toString(36).slice(2, 10)}`,
    label: "New field",
    helpText: "",
    semanticType,
    required: false,
    confidence: null,
    options:
      semanticType === "radio" || semanticType === "checkbox" || semanticType === "select"
        ? [
            { value: "option_1", label: "Option 1", orderIndex: 0, selectedByDefault: false, evidence: [] },
            { value: "option_2", label: "Option 2", orderIndex: 1, selectedByDefault: false, evidence: [] },
          ]
        : [],
    validations: [],
    conditionals: [],
    layoutHints: { width: "full", presentation: semanticType === "statement" ? "content" : "input" },
    rendererHints: {},
    sourcePriority: ["reviewer_override"],
    sourceConflicts: [],
    lineage: [],
    sourceFieldIds: [],
    provenanceAnchorIds: [],
  };
}

export function createActionButtonField(
  action: "next_step" | "previous_step" | "submit" | "custom_event" = "next_step",
): AuthoringField {
  const label =
    action === "previous_step"
      ? "Previous"
      : action === "submit"
        ? "Submit"
        : action === "custom_event"
          ? "Trigger event"
          : "Continue";

  return {
    ...createField("statement"),
    label,
    layoutHints: { width: "auto", presentation: "button" },
    rendererHints: {
      component: "button",
      action,
      eventName: action === "custom_event" ? "custom-event" : "",
    },
  };
}

export function convertFieldToActionButton(
  field: AuthoringField,
  action: "next_step" | "previous_step" | "submit" | "custom_event" = "next_step",
): void {
  const nextField = createActionButtonField(action);
  field.semanticType = nextField.semanticType;
  field.required = false;
  field.options = [];
  field.layoutHints = nextField.layoutHints;
  field.rendererHints = nextField.rendererHints;
  if (!field.label || field.label === "New field") {
    field.label = nextField.label;
  }
}

export function createGroup(): AuthoringGroup {
  return {
    id: crypto.randomUUID(),
    label: "New group",
    description: "",
    layoutHints: { presentation: "stacked", kind: "group" },
    rendererHints: {},
    lineage: [],
    sourceGroupIds: [],
    provenanceAnchorIds: [],
    fields: [createField()],
  };
}

export function createSection(): AuthoringSection {
  return {
    id: crypto.randomUUID(),
    title: "New section",
    description: "",
    layoutHints: { presentation: "stacked" },
    lineage: [],
    sourceSectionIds: [],
    provenanceAnchorIds: [],
    groups: [],
    fields: [createField()],
  };
}

export function createStep(stepNumber: number): AuthoringStep {
  return {
    id: crypto.randomUUID(),
    title: `Step ${stepNumber}`,
    description: "Collect the next set of details.",
    kind: "collect",
    layoutHints: { surface: "va-step", density: "comfortable" },
    sourcePageIds: [],
    provenanceAnchorIds: [],
    sections: [createSection()],
  };
}

export function getSelectionContext(
  document: AuthoringDocument,
  selection: AuthoringSelection | null,
): SelectionContext {
  if (!selection) {
    return { step: document.steps[0] ?? null, section: null, group: null, field: null };
  }

  const step = document.steps.find((candidate) => candidate.id === selection.stepId) ?? null;
  if (!step) {
    return { step: null, section: null, group: null, field: null };
  }
  if (selection.kind === "step") {
    return { step, section: null, group: null, field: null };
  }

  const section = step.sections.find((candidate) => candidate.id === selection.sectionId) ?? null;
  if (!section) {
    return { step, section: null, group: null, field: null };
  }
  if (selection.kind === "section") {
    return { step, section, group: null, field: null };
  }

  if (selection.kind === "group") {
    const group = section.groups.find((candidate) => candidate.id === selection.groupId) ?? null;
    return { step, section, group, field: null };
  }

  if (selection.groupId) {
    const group = section.groups.find((candidate) => candidate.id === selection.groupId) ?? null;
    const field = group?.fields.find((candidate) => candidate.id === selection.fieldId) ?? null;
    return { step, section, group: group ?? null, field: field ?? null };
  }

  const field = section.fields.find((candidate) => candidate.id === selection.fieldId) ?? null;
  return { step, section, group: null, field };
}

export function refreshChoiceOptions(field: AuthoringField, semanticType: SemanticType): void {
  if (field.rendererHints.component === "button") {
    field.rendererHints = {};
  }
  field.semanticType = semanticType;
  field.layoutHints.presentation =
    semanticType === "statement"
      ? "content"
      : semanticType === "radio" || semanticType === "checkbox" || semanticType === "select"
        ? "choices"
        : "input";
  if (field.layoutHints.width === "auto") {
    field.layoutHints.width = "full";
  }
  if (semanticType === "radio" || semanticType === "checkbox" || semanticType === "select") {
    if (!field.options.length) {
      field.options = [
        { value: "option_1", label: "Option 1", orderIndex: 0, selectedByDefault: false, evidence: [] },
        { value: "option_2", label: "Option 2", orderIndex: 1, selectedByDefault: false, evidence: [] },
      ];
    }
  } else {
    field.options = [];
  }
}

export function applyDragMove(
  document: AuthoringDocument,
  payload: DragPayload,
  target: DropTarget,
): boolean {
  if (payload.kind === "step" && target.kind === "step-list") {
    return moveStep(document, payload.stepId, target.index);
  }
  if (payload.kind === "section" && target.kind === "section-list") {
    return moveSection(document, payload.stepId, payload.sectionId, target.stepId, target.index);
  }
  if (payload.kind === "group" && target.kind === "group-list") {
    return moveGroup(
      document,
      payload.stepId,
      payload.sectionId,
      payload.groupId,
      target.stepId,
      target.sectionId,
      target.index,
    );
  }
  if (payload.kind === "field" && target.kind === "field-list") {
    return moveField(document, payload, target);
  }
  return false;
}

function moveStep(document: AuthoringDocument, stepId: string, targetIndex: number): boolean {
  const currentIndex = document.steps.findIndex((step) => step.id === stepId);
  if (currentIndex < 0) {
    return false;
  }
  const [step] = document.steps.splice(currentIndex, 1);
  const insertIndex = clampIndex(currentIndex < targetIndex ? targetIndex - 1 : targetIndex, document.steps.length);
  document.steps.splice(insertIndex, 0, step);
  return true;
}

function moveSection(
  document: AuthoringDocument,
  sourceStepId: string,
  sectionId: string,
  targetStepId: string,
  targetIndex: number,
): boolean {
  const sourceStep = document.steps.find((step) => step.id === sourceStepId);
  const targetStep = document.steps.find((step) => step.id === targetStepId);
  if (!sourceStep || !targetStep) {
    return false;
  }
  const sectionIndex = sourceStep.sections.findIndex((section) => section.id === sectionId);
  if (sectionIndex < 0) {
    return false;
  }
  const [section] = sourceStep.sections.splice(sectionIndex, 1);
  const insertIndex = clampIndex(
    sourceStep === targetStep && sectionIndex < targetIndex ? targetIndex - 1 : targetIndex,
    targetStep.sections.length,
  );
  targetStep.sections.splice(insertIndex, 0, section);
  return true;
}

function moveGroup(
  document: AuthoringDocument,
  sourceStepId: string,
  sourceSectionId: string,
  groupId: string,
  targetStepId: string,
  targetSectionId: string,
  targetIndex: number,
): boolean {
  const sourceSection = getSection(document, sourceStepId, sourceSectionId);
  const targetSection = getSection(document, targetStepId, targetSectionId);
  if (!sourceSection || !targetSection) {
    return false;
  }
  const groupIndex = sourceSection.groups.findIndex((group) => group.id === groupId);
  if (groupIndex < 0) {
    return false;
  }
  const [group] = sourceSection.groups.splice(groupIndex, 1);
  const insertIndex = clampIndex(
    sourceSection === targetSection && groupIndex < targetIndex ? targetIndex - 1 : targetIndex,
    targetSection.groups.length,
  );
  targetSection.groups.splice(insertIndex, 0, group);
  return true;
}

function moveField(document: AuthoringDocument, payload: Extract<DragPayload, { kind: "field" }>, target: Extract<DropTarget, { kind: "field-list" }>): boolean {
  const sourceFields = getFieldContainer(document, payload.stepId, payload.sectionId, payload.groupId);
  const targetFields = getFieldContainer(document, target.stepId, target.sectionId, target.groupId);
  if (!sourceFields || !targetFields) {
    return false;
  }
  const sourceIndex = sourceFields.findIndex((field) => field.id === payload.fieldId);
  if (sourceIndex < 0) {
    return false;
  }
  const [field] = sourceFields.splice(sourceIndex, 1);
  const insertIndex = clampIndex(
    sourceFields === targetFields && sourceIndex < target.index ? target.index - 1 : target.index,
    targetFields.length,
  );
  targetFields.splice(insertIndex, 0, field);
  return true;
}

function getSection(document: AuthoringDocument, stepId: string, sectionId: string): AuthoringSection | null {
  const step = document.steps.find((candidate) => candidate.id === stepId);
  return step?.sections.find((candidate) => candidate.id === sectionId) ?? null;
}

function getFieldContainer(
  document: AuthoringDocument,
  stepId: string,
  sectionId: string,
  groupId?: string,
): AuthoringField[] | null {
  const section = getSection(document, stepId, sectionId);
  if (!section) {
    return null;
  }
  if (groupId) {
    const group = section.groups.find((candidate) => candidate.id === groupId);
    return group?.fields ?? null;
  }
  return section.fields;
}

function clampIndex(index: number, maxLength: number): number {
  if (index < 0) {
    return 0;
  }
  if (index > maxLength) {
    return maxLength;
  }
  return index;
}
