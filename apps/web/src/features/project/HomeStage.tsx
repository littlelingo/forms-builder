import type { ReactNode } from "react";

import type { AuthoringProjectRecord } from "@form-builder/schema";
import { PanelCard } from "@form-builder/ui";

import type { ConversionRecord } from "../../lib/types";
import { OpenJsonIntake } from "./OpenJsonIntake";
import { ProjectList } from "./ProjectList";
import { actionButtonClass } from "../../lib/ui-utils";

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

export interface HomeStageProps {
  projects: AuthoringProjectRecord[];
  conversions: ConversionRecord[];
  isImportingJson: boolean;
  isUploading: boolean;
  onCreateBlankProject: () => void;
  onImportPdf: () => void;
  onOpenJson: () => void;
  onOpenProject: (projectId: string) => void;
  onResumeImport: (conversion: ConversionRecord) => void;
}

export function HomeStage({
  projects,
  conversions,
  isImportingJson,
  isUploading,
  onCreateBlankProject,
  onImportPdf,
  onOpenJson,
  onOpenProject,
  onResumeImport,
}: HomeStageProps) {
  return (
    <StageShell
      eyebrow="Start"
      title="New or open a project"
      summary="Treat this as a durable creation tool. Start blank, import a PDF, reopen a saved JSON file, or jump back into a recent project."
    >
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="grid gap-5">
          <PanelCard title="New" eyebrow="Create a project">
            <div className="grid gap-4 md:grid-cols-2">
              <button
                type="button"
                onClick={onCreateBlankProject}
                disabled={isImportingJson}
                className="rounded-[1.35rem] border border-blue-200 bg-[linear-gradient(135deg,#eff6ff_0%,#ffffff_62%)] p-5 text-left shadow-sm transition hover:border-blue-300"
              >
                <p className="text-xs uppercase tracking-[0.18em] text-blue-700">Blank form</p>
                <h3 className="mt-2 text-lg font-semibold text-slate-950">Start from scratch</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Create a clean project with one starter step and begin authoring directly in the workspace.
                </p>
              </button>
              <button
                type="button"
                onClick={onImportPdf}
                disabled={isUploading}
                className="rounded-[1.35rem] border border-slate-200 bg-[linear-gradient(135deg,#fff7ed_0%,#ffffff_62%)] p-5 text-left shadow-sm transition hover:border-slate-300"
              >
                <p className="text-xs uppercase tracking-[0.18em] text-amber-700">Import PDF</p>
                <h3 className="mt-2 text-lg font-semibold text-slate-950">Create from source</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Start a PDF-backed intake flow, review the extraction against the source, then promote it into a
                  project.
                </p>
              </button>
            </div>
          </PanelCard>

          <ProjectList projects={projects} onOpenProject={onOpenProject} />
        </div>

        <OpenJsonIntake
          conversions={conversions}
          isImportingJson={isImportingJson}
          onOpenJson={onOpenJson}
          onResumeImport={onResumeImport}
        />
      </section>
    </StageShell>
  );
}
