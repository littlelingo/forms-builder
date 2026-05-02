import type {
  ChoiceOption,
  ConditionalRule,
  ExtractionIssue,
  FieldNode,
  FormDefinition,
  ValidationRule,
} from "./generated";
import type {
  RuntimeDocumentBehavior,
  RuntimeNodeBehavior,
} from "./runtime";

export type ProjectStatus = "draft" | "published";
export type DocumentClass = FormDefinition["documentClass"];
export type ReviewStatus = FormDefinition["reviewStatus"];
export type SemanticType = FieldNode["semanticType"];

export interface AuthoringField {
  id: string;
  stableKey: string;
  label: string;
  helpText?: string | null;
  semanticType: SemanticType;
  required: boolean;
  confidence?: number | null;
  options: ChoiceOption[];
  validations: ValidationRule[];
  conditionals: ConditionalRule[];
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
