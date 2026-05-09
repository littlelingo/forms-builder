import type {
  AuthoringField,
  AuthoringGroup,
  AuthoringSection,
  AuthoringStep,
  SemanticType,
} from "@form-builder/schema";

import type { AuthoringSelection, DragPayload, DropTarget } from "../../../lib/authoring-utils";
import { actionButtonClass, formatLabel } from "../../../lib/ui-utils";

export { actionButtonClass, formatLabel };

export function iconButtonClass(kind: "secondary" | "danger" | "primary" = "secondary"): string {
  if (kind === "primary") {
    return "inline-flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 bg-white text-sm font-medium text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50";
  }
  if (kind === "danger") {
    return "inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 bg-white text-sm font-medium text-rose-700 shadow-sm transition hover:bg-rose-50";
  }
  return "inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950";
}

export type BuilderFieldTypeOption = SemanticType | "action_button";

export const builderFieldTypeOptions: Array<{ value: BuilderFieldTypeOption; label: string }> = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Textarea" },
  { value: "select", label: "Select" },
  { value: "radio", label: "Radio" },
  { value: "checkbox", label: "Checkbox" },
  { value: "date", label: "Date" },
  { value: "number", label: "Number" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "statement", label: "Content" },
  { value: "action_button", label: "Button" },
];

export interface StepSummary {
  fieldCount: number;
  statementCount: number;
  interactiveCount: number;
  longLabelCount: number;
}

export function flattenAuthoringFields(step: AuthoringStep): AuthoringField[] {
  return step.sections.flatMap((section) => [...section.fields, ...section.groups.flatMap((group) => group.fields)]);
}

export function summarizeAuthoringStep(step: AuthoringStep): StepSummary {
  const fields = flattenAuthoringFields(step);
  const statementCount = fields.filter((field) => field.semanticType === "statement").length;
  const longLabelCount = fields.filter((field) => field.label.trim().length > 120).length;
  return {
    fieldCount: fields.length,
    statementCount,
    interactiveCount: fields.length - statementCount,
    longLabelCount,
  };
}

export function guidanceForStep(step: AuthoringStep | null): string {
  if (!step) {
    return "Start by selecting a step, then shape it into a cleaner VA-style flow.";
  }
  const summary = summarizeAuthoringStep(step);
  if (summary.statementCount > summary.interactiveCount) {
    return "This step is still source-heavy. Split long paper content into calmer intro/help content, then isolate the interactive fields you want users to complete.";
  }
  if (summary.longLabelCount > 0) {
    return "Some imported labels are still too long for a clean web form. Tighten the wording and move overflow into help text.";
  }
  return "This step is in a good place for detailed shaping. Reorder fields, refine labels, and add logic where the web flow should branch.";
}

export function summarizeFieldBehavior(field: AuthoringField): { ruleCount: number; flowCount: number } {
  return {
    ruleCount: 0,
    flowCount: field.runtime?.listeners.length ?? 0,
  };
}

export function summarizeGroupBehavior(group: AuthoringGroup): { ruleCount: number; flowCount: number } {
  let ruleCount = 0;
  let flowCount = group.runtime?.listeners.length ?? 0;
  for (const field of group.fields) {
    const fieldSummary = summarizeFieldBehavior(field);
    ruleCount += fieldSummary.ruleCount;
    flowCount += fieldSummary.flowCount;
  }
  return { ruleCount, flowCount };
}

export function summarizeSectionBehavior(section: AuthoringSection): { ruleCount: number; flowCount: number } {
  let ruleCount = 0;
  let flowCount = section.runtime?.listeners.length ?? 0;
  for (const field of section.fields) {
    const fieldSummary = summarizeFieldBehavior(field);
    ruleCount += fieldSummary.ruleCount;
    flowCount += fieldSummary.flowCount;
  }
  for (const group of section.groups) {
    const groupSummary = summarizeGroupBehavior(group);
    ruleCount += groupSummary.ruleCount;
    flowCount += groupSummary.flowCount;
  }
  return { ruleCount, flowCount };
}

export function summarizeStepBehavior(step: AuthoringStep): { ruleCount: number; flowCount: number } {
  let ruleCount = 0;
  let flowCount = step.runtime?.listeners.length ?? 0;
  for (const section of step.sections) {
    const sectionSummary = summarizeSectionBehavior(section);
    ruleCount += sectionSummary.ruleCount;
    flowCount += sectionSummary.flowCount;
  }
  return { ruleCount, flowCount };
}

export function dropTargetKey(target: DropTarget): string {
  switch (target.kind) {
    case "step-list":
      return `step:${target.index}`;
    case "section-list":
      return `section:${target.stepId}:${target.index}`;
    case "group-list":
      return `group:${target.stepId}:${target.sectionId}:${target.index}`;
    case "field-list":
      return `field:${target.stepId}:${target.sectionId}:${target.groupId ?? "section"}:${target.index}`;
  }
}

export function isCompatibleDropTarget(payload: DragPayload | null, target: DropTarget): boolean {
  if (!payload) {
    return false;
  }
  return (
    (payload.kind === "step" && target.kind === "step-list") ||
    (payload.kind === "section" && target.kind === "section-list") ||
    (payload.kind === "group" && target.kind === "group-list") ||
    (payload.kind === "field" && target.kind === "field-list")
  );
}

export function dragPayloadLabel(payload: DragPayload | null): string {
  if (!payload) {
    return "item";
  }
  switch (payload.kind) {
    case "step":
      return "step";
    case "section":
      return "section";
    case "group":
      return "group";
    case "field":
      return "field";
  }
}

export function dragPayloadMatchesSelection(payload: DragPayload | null, selection: AuthoringSelection): boolean {
  if (!payload || payload.kind !== selection.kind || payload.stepId !== selection.stepId) {
    return false;
  }
  if (selection.kind === "step") {
    return true;
  }
  if (payload.kind === "section" && selection.kind === "section") {
    return payload.sectionId === selection.sectionId;
  }
  if (payload.kind === "group" && selection.kind === "group") {
    return payload.sectionId === selection.sectionId && payload.groupId === selection.groupId;
  }
  if (payload.kind === "field" && selection.kind === "field") {
    return (
      payload.sectionId === selection.sectionId &&
      payload.groupId === selection.groupId &&
      payload.fieldId === selection.fieldId
    );
  }
  return false;
}

export function dropTargetAttributes(target: DropTarget, options?: { exact?: boolean }): Record<string, string> {
  const attributes: Record<string, string> = {
    "data-authoring-drop-target": target.kind,
    "data-drop-index": String(target.index),
  };
  if (options?.exact) {
    attributes["data-authoring-drop-exact"] = "true";
  }
  if ("stepId" in target) {
    attributes["data-drop-step-id"] = target.stepId;
  }
  if ("sectionId" in target) {
    attributes["data-drop-section-id"] = target.sectionId;
  }
  if ("groupId" in target && target.groupId) {
    attributes["data-drop-group-id"] = target.groupId;
  }
  return attributes;
}
