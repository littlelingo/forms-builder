import type { DragEvent } from "react";

import type { Coordinates, FieldNode, PageNode, SectionNode } from "@form-builder/schema";
import { PanelCard } from "@form-builder/ui";

import type { PageSummary, ReviewPreviewMode } from "./ReviewStage";

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function subtleButtonClass(active: boolean): string {
  return active
    ? "inline-flex h-8 items-center rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-medium text-blue-700"
    : "inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-950";
}

function actionButtonClass(kind: "primary" | "secondary" | "danger" = "secondary"): string {
  if (kind === "primary") {
    return "inline-flex h-9 items-center justify-center rounded-md border border-blue-600 bg-blue-600 px-3.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:pointer-events-none disabled:opacity-50";
  }
  if (kind === "danger") {
    return "inline-flex h-9 items-center justify-center rounded-md border border-rose-200 bg-white px-3.5 text-sm font-medium text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:pointer-events-none disabled:opacity-50";
  }
  return "inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 disabled:pointer-events-none disabled:opacity-50";
}

function overlayTone(field: FieldNode, selected: boolean): string {
  if (selected) {
    return "fill-blue-400/30 stroke-[#2563eb]";
  }
  if (field.semanticType === "statement") {
    return "fill-slate-400/18 stroke-slate-500";
  }
  if (field.semanticType === "radio" || field.semanticType === "checkbox" || field.semanticType === "select") {
    return "fill-amber-300/18 stroke-amber-500";
  }
  return "fill-sky-400/18 stroke-sky-600";
}

function orderedReviewSectionFields(section: SectionNode): FieldNode[] {
  const orderedItems = [
    ...section.fields.map((field) => ({
      orderIndex: field.orderIndex,
      kind: "field" as const,
      fields: [field],
    })),
    ...section.groups.map((group) => ({
      orderIndex: group.orderIndex,
      kind: "group" as const,
      fields: [...group.fields].sort(
        (left, right) => left.orderIndex - right.orderIndex || left.label.localeCompare(right.label),
      ),
    })),
  ].sort((left, right) => left.orderIndex - right.orderIndex || (left.kind === "field" ? -1 : 1));

  return orderedItems.flatMap((item) => item.fields);
}

function overlayRects(field: FieldNode): Coordinates[] {
  const optionRects =
    field.semanticType === "radio" || field.semanticType === "checkbox" || field.semanticType === "select"
      ? field.options.flatMap((option) =>
          option.evidence
            .map((anchor) => anchor.bounds)
            .filter((bounds): bounds is Coordinates => bounds !== undefined),
        )
      : [];

  const sourceRects = field.sourceCoordinates;
  const fallbackEvidenceRects = field.evidence
    .map((anchor) => anchor.bounds)
    .filter((bounds): bounds is Coordinates => bounds !== undefined);

  const preferredRects =
    optionRects.length > 0
      ? [...optionRects, ...sourceRects.slice(optionRects.length)]
      : sourceRects.length > 0
        ? sourceRects
        : fallbackEvidenceRects;

  return preferredRects;
}

function primaryPageHeading(page: PageNode): string {
  return page.sections[0]?.title ?? page.label;
}

function secondaryPageHeading(page: PageNode): string | null {
  const primary = primaryPageHeading(page);
  return page.label && page.label !== primary ? page.label : null;
}

export interface SourcePreviewProps {
  reviewPreviewMode: ReviewPreviewMode;
  onSetReviewPreviewMode: (mode: ReviewPreviewMode) => void;
  dragActive: boolean;
  onDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  selectedFile: File | null;
  isUploading: boolean;
  onReplacePdf: () => void;
  previewUrl: string | null;
  pagePreviewImageUrl: string | null;
  activeReviewPage: PageNode | null;
  activeReviewField: FieldNode | null;
  activeReviewFields: FieldNode[];
  reviewPageDimensions: { width: number; height: number };
  reviewPageSummaries: PageSummary[];
  onSelectPage: (pageId: string) => void;
  onSelectField: (fieldId: string) => void;
}

export function SourcePreview({
  reviewPreviewMode,
  onSetReviewPreviewMode,
  dragActive,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  selectedFile,
  isUploading,
  onReplacePdf,
  previewUrl,
  pagePreviewImageUrl,
  activeReviewPage,
  activeReviewField,
  activeReviewFields,
  reviewPageDimensions,
  reviewPageSummaries,
  onSelectPage,
  onSelectField,
}: SourcePreviewProps) {
  return (
    <div className="grid gap-5">
      <div
        onDragEnter={(event) => {
          event.preventDefault();
          onDragEnter(event);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          onDragLeave(event);
        }}
        onDragOver={(event) => onDragOver(event)}
        onDrop={onDrop}
      >
        <PanelCard
          title="Source Review"
          eyebrow="Creation step 2 of 3"
          aside={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => onSetReviewPreviewMode("overlay")}
                className={subtleButtonClass(reviewPreviewMode === "overlay")}
              >
                Overlay
              </button>
              <button
                type="button"
                onClick={() => onSetReviewPreviewMode("pdf")}
                className={subtleButtonClass(reviewPreviewMode === "pdf")}
              >
                PDF
              </button>
            </div>
          }
          className="min-h-[40rem]"
        >
          <div
            className={`mb-4 flex flex-wrap items-center gap-2 rounded-[1rem] border px-3 py-2.5 ${dragActive ? "border-blue-300 bg-blue-50" : "border-soft bg-slate-50"}`}
          >
            <div className="min-w-[11rem]">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[#103975]/65">Source file</p>
              <p className="mt-1 text-sm text-slate-600">
                Inspect the imported PDF against the extracted mapping before creating the project workspace.
              </p>
            </div>
            <button type="button" onClick={onReplacePdf} className={actionButtonClass("primary")}>
              {isUploading ? "Importing..." : "Replace PDF"}
            </button>
            <div className="ml-auto rounded-full border border-soft bg-white px-3 py-1.5 text-sm text-slate-600">
              {selectedFile
                ? `${selectedFile.name} · ${formatBytes(selectedFile.size)}`
                : "Drop a replacement PDF here"}
            </div>
          </div>
          {reviewPreviewMode === "pdf" ? (
            previewUrl ? (
              <object
                data={previewUrl}
                type="application/pdf"
                className="h-[38rem] w-full rounded-[1.2rem] border border-soft bg-white"
              >
                <div className="app-muted-card p-6 text-sm text-slate-500">
                  Inline PDF preview is unavailable in this browser.
                </div>
              </object>
            ) : (
              <div className="app-muted-card p-6 text-sm text-slate-500">
                Import a PDF to inspect the source preview here.
              </div>
            )
          ) : pagePreviewImageUrl && activeReviewPage ? (
            <div className="overflow-hidden rounded-[1.5rem] border border-soft bg-slate-950">
              <svg
                viewBox={`0 0 ${reviewPageDimensions.width} ${reviewPageDimensions.height}`}
                className="h-[38rem] w-full"
              >
                <image
                  href={pagePreviewImageUrl}
                  x="0"
                  y="0"
                  width={reviewPageDimensions.width}
                  height={reviewPageDimensions.height}
                  preserveAspectRatio="xMidYMid meet"
                />
                {activeReviewFields.flatMap((field, fieldIndex) =>
                  overlayRects(field).map((bounds, index) => (
                    <rect
                      key={`${field.id}-${fieldIndex}-${index}`}
                      x={bounds.x}
                      y={bounds.y}
                      width={bounds.width}
                      height={bounds.height}
                      rx="8"
                      onClick={() => onSelectField(field.id)}
                      className={`${overlayTone(field, field.id === activeReviewField?.id)} cursor-pointer stroke-[2]`}
                    />
                  )),
                )}
              </svg>
            </div>
          ) : (
            <div className="app-muted-card p-6 text-sm text-slate-500">Import a PDF to start review.</div>
          )}

          <div className="mt-4 overflow-x-auto">
            <div className="flex min-w-max gap-2">
              {reviewPageSummaries.map((summary) => (
                <button
                  key={summary.page.id}
                  type="button"
                  onClick={() => {
                    onSelectPage(summary.page.id);
                  }}
                  className={`min-w-[11.5rem] rounded-[1rem] border px-3 py-2.5 text-left transition ${
                    summary.page.id === activeReviewPage?.id
                      ? "border-blue-300 bg-[#e8f0ff]"
                      : "border-soft bg-white hover:border-slate-300"
                  }`}
                >
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Page {summary.page.orderIndex + 1}
                  </p>
                  <p className="mt-1 font-semibold text-slate-950">{primaryPageHeading(summary.page)}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
                    {secondaryPageHeading(summary.page) ?? summary.evidenceSnippet ?? "No evidence snippet recovered."}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-slate-500">
                    <span className="app-pill">{summary.fields.length} mapped fields</span>
                    {summary.flaggedFields ? <span className="app-pill">{summary.flaggedFields} flagged</span> : null}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </PanelCard>
      </div>
    </div>
  );
}
