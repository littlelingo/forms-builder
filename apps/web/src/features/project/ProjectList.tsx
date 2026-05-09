import type { AuthoringProjectRecord } from "@form-builder/schema";
import { PanelCard, StatusBadge } from "@form-builder/ui";

import { badgeToneFromProjectStatus } from "./utils/project-utils";

function formatLabel(value: string | undefined | null): string {
  if (!value) {
    return "Unknown";
  }
  return value.replaceAll("_", " ");
}

export interface ProjectListProps {
  projects: AuthoringProjectRecord[];
  onOpenProject: (projectId: string) => void;
}

export function ProjectList({ projects, onOpenProject }: ProjectListProps) {
  return (
    <PanelCard title="Recent Projects" eyebrow="Open existing">
      <div className="space-y-3">
        {projects.length ? (
          projects.slice(0, 6).map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => onOpenProject(project.id)}
              className="block w-full rounded-[1rem] border border-soft bg-white px-4 py-3 text-left transition hover:border-slate-300"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-950">{project.name}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {project.revisionCount} revisions · updated {new Date(project.updatedAt).toLocaleString()}
                  </p>
                </div>
                <StatusBadge tone={badgeToneFromProjectStatus(project.status)}>
                  {formatLabel(project.status)}
                </StatusBadge>
              </div>
            </button>
          ))
        ) : (
          <div className="app-muted-card p-4 text-sm text-slate-500">
            No saved projects yet. Start with a blank form or import a PDF.
          </div>
        )}
      </div>
    </PanelCard>
  );
}
