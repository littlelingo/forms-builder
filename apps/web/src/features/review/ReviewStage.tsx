import type { DragEvent, ReactNode } from "react";

import type { FieldNode, PageNode, ReviewStatus, SemanticType } from "@form-builder/schema";

import type { ConversionRecord } from "../../lib/types";
import { ReviewInspector } from "./ReviewInspector";
import { SourcePreview } from "./SourcePreview";
import { actionButtonClass } from "../../lib/ui-utils";

export type ReviewPreviewMode = "overlay" | "pdf";

export interface PageSummary {
  page: PageNode;
  fields: FieldNode[];
  evidenceSnippet: string | null;
  flaggedFields: number;
  dominantTypes: SemanticType[];
}

function StageShell({
  eyebrow,
  title,
  summary,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="stage-enter grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white/95 px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_8px_24px_rgba(15,23,42,0.05)]">
        <div className="min-w-0 flex-1">
          <p className="text-[0.64rem] font-semibold uppercase tracking-[0.22em] text-slate-500">{eyebrow}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h2 className="font-display text-[1.35rem] leading-none text-slate-950 sm:text-[1.5rem]">{title}</h2>
            <p className="max-w-3xl text-sm leading-6 text-slate-600">{summary}</p>
          </div>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export interface ReviewStageProps {
  reviewFlowTitle: string;
  reviewFlowSummary: string;
  isUploading: boolean;
  onReturnHome: () => void;
  onReplacePdf: () => void;
  // SourcePreview props
  reviewPreviewMode: ReviewPreviewMode;
  onSetReviewPreviewMode: (mode: ReviewPreviewMode) => void;
  dragActive: boolean;
  onDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  selectedFile: File | null;
  previewUrl: string | null;
  pagePreviewImageUrl: string | null;
  activeReviewPage: PageNode | null;
  activeReviewField: FieldNode | null;
  activeReviewFields: FieldNode[];
  reviewPageDimensions: { width: number; height: number };
  reviewPageSummaries: PageSummary[];
  onSelectPage: (pageId: string) => void;
  onSelectField: (fieldId: string) => void;
  // ReviewInspector props
  activeConversion: ConversionRecord | null;
  activePageSummary: PageSummary | null;
  activeReviewFieldConfidence: number | null;
  reviewReadyToPromote: boolean;
  reviewIssueCount: number;
  matchedProjectForActiveConversion: { id: string } | null;
  conversions: ConversionRecord[];
  isSavingReview: boolean;
  isPromoting: boolean;
  isClearingHistory: boolean;
  onReviewUpdate: (status: ReviewStatus) => void;
  onPromote: () => void;
  onClearConversions: () => void;
  onResumeImport: (conversion: ConversionRecord) => void;
  onDeleteConversion: (id: string) => void;
}

export function ReviewStage({
  reviewFlowTitle,
  reviewFlowSummary,
  isUploading,
  onReturnHome,
  onReplacePdf,
  reviewPreviewMode,
  onSetReviewPreviewMode,
  dragActive,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  selectedFile,
  previewUrl,
  pagePreviewImageUrl,
  activeReviewPage,
  activeReviewField,
  activeReviewFields,
  reviewPageDimensions,
  reviewPageSummaries,
  onSelectPage,
  onSelectField,
  activeConversion,
  activePageSummary,
  activeReviewFieldConfidence,
  reviewReadyToPromote,
  reviewIssueCount,
  matchedProjectForActiveConversion,
  conversions,
  isSavingReview,
  isPromoting,
  isClearingHistory,
  onReviewUpdate,
  onPromote,
  onClearConversions,
  onResumeImport,
  onDeleteConversion,
}: ReviewStageProps) {
  return (
    <StageShell
      eyebrow="Creation Preflight"
      title={reviewFlowTitle}
      summary={reviewFlowSummary}
      actions={
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onReturnHome} className={actionButtonClass()}>
            Back to Home
          </button>
          <button type="button" onClick={onReplacePdf} disabled={isUploading} className={actionButtonClass("primary")}>
            {isUploading ? "Importing..." : "Replace PDF"}
          </button>
        </div>
      }
    >
      <section className="grid gap-5 xl:grid-cols-[1.52fr_0.78fr]">
        <SourcePreview
          reviewPreviewMode={reviewPreviewMode}
          onSetReviewPreviewMode={onSetReviewPreviewMode}
          dragActive={dragActive}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
          selectedFile={selectedFile}
          isUploading={isUploading}
          onReplacePdf={onReplacePdf}
          previewUrl={previewUrl}
          pagePreviewImageUrl={pagePreviewImageUrl}
          activeReviewPage={activeReviewPage}
          activeReviewField={activeReviewField}
          activeReviewFields={activeReviewFields}
          reviewPageDimensions={reviewPageDimensions}
          reviewPageSummaries={reviewPageSummaries}
          onSelectPage={onSelectPage}
          onSelectField={onSelectField}
        />
        <ReviewInspector
          activeConversion={activeConversion}
          activeReviewPage={activeReviewPage}
          activeReviewField={activeReviewField}
          activeReviewFields={activeReviewFields}
          activePageSummary={activePageSummary}
          activeReviewFieldConfidence={activeReviewFieldConfidence}
          reviewReadyToPromote={reviewReadyToPromote}
          reviewIssueCount={reviewIssueCount}
          reviewPageSummaries={reviewPageSummaries}
          matchedProjectForActiveConversion={matchedProjectForActiveConversion}
          conversions={conversions}
          isSavingReview={isSavingReview}
          isPromoting={isPromoting}
          isClearingHistory={isClearingHistory}
          onReviewUpdate={onReviewUpdate}
          onPromote={onPromote}
          onClearConversions={onClearConversions}
          onResumeImport={onResumeImport}
          onDeleteConversion={onDeleteConversion}
          onSelectField={onSelectField}
        />
      </section>
    </StageShell>
  );
}
