import type { FieldNode, PageNode, ReviewStatus, SectionNode } from "@form-builder/schema";
import { PanelCard, StatusBadge } from "@form-builder/ui";

import type { ConversionRecord } from "../../lib/types";
import { badgeToneFromReview, badgeToneFromStatus } from "./utils/review-utils";
import type { PageSummary } from "./ReviewStage";

function formatLabel(value: string | undefined | null): string {
  if (!value) {
    return "Unknown";
  }
  return value.replaceAll("_", " ");
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

function primaryPageHeading(page: PageNode): string {
  return page.sections[0]?.title ?? page.label;
}

function secondaryPageHeading(page: PageNode): string | null {
  const primary = primaryPageHeading(page);
  return page.label && page.label !== primary ? page.label : null;
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

export interface ReviewInspectorProps {
  activeConversion: ConversionRecord | null;
  activeReviewPage: PageNode | null;
  activeReviewField: FieldNode | null;
  activeReviewFields: FieldNode[];
  activePageSummary: PageSummary | null;
  activeReviewFieldConfidence: number | null;
  reviewReadyToPromote: boolean;
  reviewIssueCount: number;
  reviewPageSummaries: PageSummary[];
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
  onSelectField: (fieldId: string) => void;
}

export function ReviewInspector({
  activeConversion,
  activeReviewPage,
  activeReviewField,
  activeReviewFields,
  activePageSummary,
  activeReviewFieldConfidence,
  reviewReadyToPromote,
  reviewIssueCount,
  reviewPageSummaries,
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
  onSelectField,
}: ReviewInspectorProps) {
  return (
    <div className="grid gap-5">
      <PanelCard
        title="Project Creation"
        eyebrow="Compact preflight"
        aside={
          activeConversion ? (
            <StatusBadge tone={badgeToneFromReview(activeConversion.reviewStatus)}>
              {reviewReadyToPromote ? "Ready to create" : "Needs review decision"}
            </StatusBadge>
          ) : undefined
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1rem] border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-700">1. Import</p>
              <p className="mt-1 text-sm text-emerald-900">
                {activeConversion ? activeConversion.filename : "PDF loaded"}
              </p>
            </div>
            <div className="rounded-[1rem] border border-blue-200 bg-blue-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-blue-700">2. Preflight</p>
              <p className="mt-1 text-sm text-blue-900">
                {activeReviewFields.length} mapped fields · {reviewIssueCount} issues
              </p>
            </div>
            <div className="rounded-[1rem] border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">3. Workspace</p>
              <p className="mt-1 text-sm text-slate-700">
                {matchedProjectForActiveConversion
                  ? "Reopen the existing project workspace."
                  : "Create the durable project workspace."}
              </p>
            </div>
          </div>

          <div className="rounded-[1.1rem] border border-soft bg-[linear-gradient(135deg,#f8fafc_0%,#ffffff_100%)] p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Current source</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">
                  {activeConversion?.filename ?? "No PDF selected"}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {activeConversion?.documentSignals?.pageCount ?? reviewPageSummaries.length} pages ·{" "}
                  {Math.round((activeConversion?.confidence ?? 0) * 100)}% confidence
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Project handoff</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">
                  {matchedProjectForActiveConversion
                    ? "Existing workspace available"
                    : reviewReadyToPromote
                      ? "Ready to create project"
                      : "Hold until reviewed"}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Source reference stays available after promotion, so this step only needs enough review to start
                  authoring.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => onReviewUpdate("reviewed")}
              disabled={!activeConversion || isSavingReview}
              className={actionButtonClass("secondary")}
            >
              {isSavingReview ? "Saving..." : "Mark reviewed"}
            </button>
            <button
              type="button"
              onClick={() => onReviewUpdate("accepted")}
              disabled={!activeConversion || isSavingReview}
              className={actionButtonClass("secondary")}
            >
              Mark accepted
            </button>
            <button
              type="button"
              onClick={() => onPromote()}
              disabled={!activeConversion || activeConversion.reviewStatus === "needs_review" || isPromoting}
              className={actionButtonClass("primary")}
            >
              {matchedProjectForActiveConversion
                ? "Open project workspace"
                : isPromoting
                  ? "Promoting..."
                  : "Create project workspace"}
            </button>
          </div>

          <div className="app-muted-card p-4 text-sm leading-6 text-slate-600">
            Treat this as a preflight, not a permanent audit workspace. Confirm the structure is directionally usable,
            then continue shaping the form inside the main builder.
          </div>
        </div>
      </PanelCard>

      <PanelCard title="Current Review" eyebrow="Page and selection">
        <div className="space-y-3">
          {activeReviewPage ? (
            <div className="app-muted-card p-3.5">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Selected page</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-950">{primaryPageHeading(activeReviewPage)}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {secondaryPageHeading(activeReviewPage) ??
                  activePageSummary?.evidenceSnippet ??
                  "No evidence summary available."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="app-pill">{activeReviewFields.length} mapped</span>
                {activePageSummary?.flaggedFields ? (
                  <span className="app-pill">{activePageSummary.flaggedFields} flagged</span>
                ) : null}
                {(activePageSummary?.dominantTypes.length ?? 0) > 0 ? (
                  <span className="app-pill">
                    {activePageSummary?.dominantTypes
                      .slice(0, 2)
                      .map((type) => formatLabel(type))
                      .join(" · ")}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          {activeReviewField ? (
            <div className="rounded-[1rem] border border-blue-200 bg-blue-50/70 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-blue-700">Active selection</p>
                  <h4 className="mt-1 text-sm font-semibold text-slate-950">{activeReviewField.label}</h4>
                  <p className="mt-1 text-sm text-slate-600">
                    {formatLabel(activeReviewField.semanticType)} · confidence {activeReviewFieldConfidence}%
                  </p>
                </div>
                <StatusBadge tone={activeReviewField.sourceConflicts.length ? "warning" : "info"}>
                  {formatLabel(activeReviewField.reviewStatus)}
                </StatusBadge>
              </div>
            </div>
          ) : null}
        </div>
      </PanelCard>

      <PanelCard
        title="Mapped Structure"
        eyebrow="Active page"
        aside={
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="app-pill">{activeReviewFields.length} mapped</span>
          </div>
        }
      >
        <div className="space-y-3 rounded-[1rem] border border-soft bg-white p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Mapped structure</p>
              <p className="mt-2 text-sm text-slate-600">
                Use this only to confirm the extracted structure is workable.
              </p>
            </div>
            {activeReviewField ? (
              <StatusBadge tone="info">{formatLabel(activeReviewField.semanticType)}</StatusBadge>
            ) : null}
          </div>
          <div className="max-h-[16rem] space-y-2.5 overflow-y-auto pr-1">
            {activeReviewPage?.sections.map((section) => (
              <div key={section.id} className="rounded-[0.95rem] border border-soft bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Section</p>
                <h4 className="mt-1 text-sm font-semibold text-slate-950">{section.title}</h4>
                <div className="mt-2 space-y-2">
                  {orderedReviewSectionFields(section).map((field, fieldIndex) => (
                    <button
                      key={`${field.id}-${fieldIndex}`}
                      type="button"
                      onClick={() => onSelectField(field.id)}
                      className={`block w-full rounded-[0.9rem] border px-3 py-2.5 text-left ${
                        field.id === activeReviewField?.id ? "border-blue-300 bg-[#e8f0ff]" : "border-soft bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-950">{field.label}</p>
                          <p className="mt-1 text-sm text-slate-600">
                            {formatLabel(field.semanticType)} · confidence {Math.round(field.confidence * 100)}%
                          </p>
                        </div>
                        <StatusBadge tone={field.sourceConflicts.length ? "warning" : "neutral"}>
                          {formatLabel(field.reviewStatus)}
                        </StatusBadge>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </PanelCard>

      <PanelCard
        title="Import Issues"
        eyebrow="Carry forward context"
        aside={
          <StatusBadge tone={reviewIssueCount > 0 ? "warning" : "success"}>
            {reviewIssueCount > 0 ? `${reviewIssueCount} open` : "Clear"}
          </StatusBadge>
        }
      >
        <div className="space-y-3 rounded-[1rem] border border-soft bg-white p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Issues</p>
              <p className="mt-2 text-sm text-slate-600">
                Keep only the essential warnings visible before you move into the workspace.
              </p>
            </div>
          </div>
          <div className="max-h-[10rem] space-y-2.5 overflow-y-auto pr-1">
            {(activeConversion?.issues ?? []).map((issue) => (
              <div
                key={`${issue.code}-${issue.nodeId ?? "global"}`}
                className="rounded-[0.95rem] border border-soft bg-slate-50 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{issue.message}</p>
                    {issue.suggestedAction ? (
                      <p className="mt-2 text-sm leading-6 text-slate-600">{issue.suggestedAction}</p>
                    ) : null}
                  </div>
                  <StatusBadge
                    tone={issue.severity === "error" ? "error" : issue.severity === "warning" ? "warning" : "info"}
                  >
                    {issue.severity}
                  </StatusBadge>
                </div>
              </div>
            ))}
            {!activeConversion?.issues.length ? (
              <div className="app-muted-card p-4 text-sm text-slate-500">No surfaced issues on this conversion.</div>
            ) : null}
          </div>
        </div>
      </PanelCard>

      <PanelCard
        title="Other Imports"
        eyebrow="Resume queue"
        aside={
          <button
            type="button"
            onClick={() => onClearConversions()}
            disabled={!conversions.length || isClearingHistory}
            className={actionButtonClass()}
          >
            {isClearingHistory ? "Clearing..." : "Clear"}
          </button>
        }
      >
        <div className="max-h-[14rem] space-y-2.5 overflow-y-auto pr-1">
          {conversions.map((conversion) => (
            <button
              key={conversion.id}
              type="button"
              onClick={() => onResumeImport(conversion)}
              className={`block w-full rounded-[0.95rem] border px-3 py-2.5 text-left ${
                conversion.id === activeConversion?.id ? "border-blue-300 bg-[#e8f0ff]" : "border-soft bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">{conversion.filename}</p>
                  <p className="mt-1 text-sm text-slate-600">{conversion.documentSignals?.pageCount ?? 0} pages</p>
                </div>
                <StatusBadge tone={badgeToneFromStatus(conversion.status)}>
                  {formatLabel(conversion.status)}
                </StatusBadge>
              </div>
              <div className="mt-3 flex justify-between gap-2">
                <span className="text-xs text-slate-500">{Math.round(conversion.confidence * 100)}% confidence</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    void onDeleteConversion(conversion.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      void onDeleteConversion(conversion.id);
                    }
                  }}
                  className="text-xs font-semibold text-slate-500"
                >
                  Remove
                </span>
              </div>
            </button>
          ))}
        </div>
      </PanelCard>
    </div>
  );
}
