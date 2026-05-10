import type { ChoiceOption, ExtractionIssue, FieldNode, FormDefinition, ValidationRule } from "./generated";
import type { RuntimeDocumentBehavior, RuntimeNodeBehavior } from "./runtime";

export type ProjectStatus = "draft" | "published";
export type DocumentClass = FormDefinition["documentClass"];
export type ReviewStatus = FormDefinition["reviewStatus"];
export type SemanticType = FieldNode["semanticType"];

export interface AuthoringField {
  id: string;
  dispatchKey?: string | null;
  stableKey: string;
  label: string;
  helpText?: string | null;
  semanticType: SemanticType;
  required: boolean;
  confidence?: number | null;
  options: ChoiceOption[];
  validations: ValidationRule[];
  layoutHints: Record<string, string>;
  rendererHints: Record<string, string>;
  sourcePriority: string[];
  sourceConflicts: string[];
  lineage: string[];
  sourceFieldIds: string[];
  provenanceAnchorIds: string[];
  runtime?: RuntimeNodeBehavior | null;
}

export interface AuthoringGroup {
  id: string;
  dispatchKey?: string | null;
  label: string;
  description?: string | null;
  layoutHints: Record<string, string>;
  rendererHints: Record<string, string>;
  lineage: string[];
  sourceGroupIds: string[];
  provenanceAnchorIds: string[];
  fields: AuthoringField[];
  runtime?: RuntimeNodeBehavior | null;
}

export interface AuthoringSection {
  id: string;
  dispatchKey?: string | null;
  title: string;
  description?: string | null;
  layoutHints: Record<string, string>;
  lineage: string[];
  sourceSectionIds: string[];
  provenanceAnchorIds: string[];
  groups: AuthoringGroup[];
  fields: AuthoringField[];
  runtime?: RuntimeNodeBehavior | null;
}

export interface AuthoringStep {
  id: string;
  dispatchKey?: string | null;
  title: string;
  description?: string | null;
  kind: string;
  layoutHints: Record<string, string>;
  sourcePageIds: string[];
  provenanceAnchorIds: string[];
  sections: AuthoringSection[];
  runtime?: RuntimeNodeBehavior | null;
}

export interface AuthoringDocument {
  id: string;
  dispatchKey?: string | null;
  title: string;
  documentClass: DocumentClass;
  reviewStatus: ReviewStatus;
  targetRuntime: string;
  visualBaseline: string;
  sourcePriority: string[];
  sourceConflicts: string[];
  steps: AuthoringStep[];
  metadata: Record<string, string>;
  runtime?: RuntimeDocumentBehavior | null;
}

export interface ProjectSourceContext {
  conversionId: string;
  filename: string;
  documentClass?: DocumentClass | null;
  reviewStatus: ReviewStatus;
  confidence: number;
  extractorPath: string[];
  notes: string[];
  issues: ExtractionIssue[];
  importedDraft: FormDefinition;
}

export interface AuthoringProjectRecord {
  id: string;
  name: string;
  status: ProjectStatus;
  targetRuntime: string;
  visualBaseline: string;
  sourceConversionId: string;
  documentClass?: DocumentClass | null;
  currentRevisionId?: string | null;
  revisionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuthoringProjectDetail {
  project: AuthoringProjectRecord;
  document: AuthoringDocument;
  sourceContext: ProjectSourceContext;
}

export interface ProjectRevision {
  id: string;
  projectId: string;
  createdAt: string;
  note: string;
  document: AuthoringDocument;
}

// ---- Behavior Library (Phase 1A schema-only; Phase 1C wires the editor) ----

export type BehaviorLibraryParameterType =
  | "string"
  | "number"
  | "boolean"
  | "enum"
  | "nodeRef"
  | "eventRef"
  | "fieldKey"
  | "list";

export interface BehaviorLibraryParameterConstraints {
  regex?: string;
  min?: number;
  max?: number;
}

export interface BehaviorLibraryParameter {
  key: string;
  type: BehaviorLibraryParameterType;
  label: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  options?: string[]; // for enum
  itemType?: BehaviorLibraryParameterType; // for list<T>
  constraints?: BehaviorLibraryParameterConstraints;
}

export type BehaviorLibraryScope = "system" | "project";

export type BehaviorLibraryCategory =
  | "validation"
  | "visibility"
  | "host"
  | "events"
  | "data"
  | "repeatables"
  | "custom";

export interface BehaviorLibraryEntryI18nText {
  name: string;
  description: string;
}

export interface BehaviorLibraryEntry {
  id: string;
  name: string;
  description: string;
  category: BehaviorLibraryCategory;
  scope: BehaviorLibraryScope;
  revision: number;
  icon?: string;
  parameters: BehaviorLibraryParameter[];
  // Restricts applicability. Empty array = any node type.
  bindsTo: string[];
  // Listener template with {{paramKey}} placeholders. Refs in template MUST
  // reference parameter tokens, not literal ids. Phase 1A leaves this opaque
  // (Phase 1C wires the editor).
  template: unknown;
  i18n?: { en: BehaviorLibraryEntryI18nText; [lang: string]: BehaviorLibraryEntryI18nText };
}
