import type { DocumentClass, FormDefinition, ReviewStatus } from "@form-builder/schema";

export type ConversionStatus =
  | "uploaded"
  | "analyzing"
  | "classified"
  | "extracted"
  | "in_review"
  | "failed"
  | "accepted";

export type ProcessingStepStatus = "pending" | "completed" | "warning" | "failed";

export interface ProcessingStep {
  key: string;
  label: string;
  status: ProcessingStepStatus;
  detail: string;
  timestamp: string;
}

export interface DocumentSignals {
  pageCount: number;
  containsXfa: boolean;
  containsAcroform: boolean;
  acroformFieldCount: number;
  textPageCount: number;
  imageOnlyPageCount: number;
  mixedPageModes: boolean;
  detectedModes: string[];
  sampleTextExcerpt?: string | null;
}

export interface SamplePdfSummary {
  filename: string;
  fileSize: number;
  documentClass?: DocumentClass | null;
  documentSignals?: DocumentSignals | null;
}

export interface ExtractionIssue {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  nodeId?: string;
  evidenceAnchorIds: string[];
  confidenceBand: "high" | "medium" | "low";
  suggestedAction?: string;
}

export interface ConversionRecord {
  id: string;
  filename: string;
  contentType?: string | null;
  fileSize: number;
  status: ConversionStatus;
  documentClass?: DocumentClass | null;
  extractorPath: string[];
  confidence: number;
  notes: string[];
  errors: string[];
  processingSteps: ProcessingStep[];
  documentSignals?: DocumentSignals | null;
  issues: ExtractionIssue[];
  reviewStatus: ReviewStatus;
  createdAt: string;
  updatedAt: string;
  draft?: FormDefinition | null;
}
