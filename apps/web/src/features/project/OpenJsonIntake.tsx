import { PanelCard, StatusBadge } from "@form-builder/ui";

import type { ConversionRecord } from "../../lib/types";
import { badgeToneFromReview } from "../review/utils/review-utils";

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

export interface OpenJsonIntakeProps {
  conversions: ConversionRecord[];
  isImportingJson: boolean;
  onOpenJson: () => void;
  onResumeImport: (conversion: ConversionRecord) => void;
}

export function OpenJsonIntake({ conversions, isImportingJson, onOpenJson, onResumeImport }: OpenJsonIntakeProps) {
  return (
    <div className="grid gap-5">
      <PanelCard
        title="Open"
        eyebrow="Files and history"
        aside={
          <button
            type="button"
            onClick={onOpenJson}
            disabled={isImportingJson}
            className={actionButtonClass("primary")}
          >
            {isImportingJson ? "Opening..." : "Open JSON"}
          </button>
        }
      >
        <div className="space-y-4">
          <div className="app-muted-card p-4">
            <p className="text-sm font-semibold text-slate-950">Authoring JSON</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Load a previously created authoring document and reopen it as a durable project.
            </p>
          </div>
          <div className="app-muted-card p-4">
            <p className="text-sm font-semibold text-slate-950">Traditional tool flow</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              `New` creates a project. `Open` returns you to saved work. Review is now part of PDF intake, not the
              identity of the whole app.
            </p>
          </div>
        </div>
      </PanelCard>

      <PanelCard title="Recent Imports" eyebrow="Resume intake">
        <div className="space-y-3">
          {conversions.length ? (
            conversions.slice(0, 6).map((conversion) => (
              <button
                key={conversion.id}
                type="button"
                onClick={() => onResumeImport(conversion)}
                className="block w-full rounded-[1rem] border border-soft bg-white px-4 py-3 text-left transition hover:border-slate-300"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-950">{conversion.filename}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {conversion.documentSignals?.pageCount ?? 0} pages · {Math.round(conversion.confidence * 100)}%
                      confidence
                    </p>
                  </div>
                  <StatusBadge tone={badgeToneFromReview(conversion.reviewStatus)}>
                    {formatLabel(conversion.reviewStatus)}
                  </StatusBadge>
                </div>
              </button>
            ))
          ) : (
            <div className="app-muted-card p-4 text-sm text-slate-500">
              No imports in the queue. Use `New` to start from a PDF.
            </div>
          )}
        </div>
      </PanelCard>
    </div>
  );
}
