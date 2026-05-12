import type { DragEvent, PointerEvent, ReactNode } from "react";

import type { AuthoringDocument, AuthoringField, AuthoringProjectDetail, AuthoringStep } from "@form-builder/schema";
import { PanelCard, StatusBadge } from "@form-builder/ui";

import type { AuthoringSelection, DragPayload, DropTarget } from "../../lib/authoring-utils";
import { badgeToneFromProjectStatus } from "../project/utils/project-utils";
import { DragHandle, DropMarker, EmptyDropZone } from "./dnd/drag-handles";
import {
  actionButtonClass,
  dragPayloadMatchesSelection,
  dropTargetAttributes,
  formatLabel,
  guidanceForStep,
  iconButtonClass,
  summarizeGroupBehavior,
  summarizeSectionBehavior,
  summarizeStepBehavior,
} from "./utils/builder-utils";

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M8 3.25v9.5M3.25 8h9.5" />
    </svg>
  );
}

function PageIcon() {
  return (
    <span className="inline-flex h-9 w-7 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-500 shadow-sm">
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.3">
        <path d="M4.25 1.75h5l2.5 2.5v10H4.25z" />
        <path d="M9.25 1.75v2.5h2.5" />
        <path d="M5.75 7h4.5M5.75 9.25h4.5M5.75 11.5h3.25" />
      </svg>
    </span>
  );
}

function FieldIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3.5 4h9M8 4v8" />
    </svg>
  );
}

function GroupIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2.75" y="3" width="4.25" height="4.25" rx="1" />
      <rect x="9" y="3" width="4.25" height="4.25" rx="1" />
      <rect x="2.75" y="8.75" width="4.25" height="4.25" rx="1" />
      <rect x="9" y="8.75" width="4.25" height="4.25" rx="1" />
    </svg>
  );
}

function RemoveIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M4.25 4.25l7.5 7.5M11.75 4.25l-7.5 7.5" />
    </svg>
  );
}

export interface StepSummary {
  fieldCount: number;
  statementCount: number;
  interactiveCount: number;
  longLabelCount: number;
}

export interface PreviewCanvasProps {
  activeProjectDetail: AuthoringProjectDetail | null;
  projectDirty: boolean;
  activeDocument: AuthoringDocument | null;
  activeStep: AuthoringStep | null;
  activeStepIndex: number;
  activeStepSummary: StepSummary | null;
  isPdfBackedProject: boolean;
  workspaceLandingMode: "promoted_import" | "reopened_import" | null;
  importedSourcePageCount: number;
  importedSourceSectionCount: number;
  importedSourceFieldCount: number;
  sourceReferenceCanOpen: boolean;
  sourceReferenceOpenMode: "all" | "matches";
  sourceReferenceActionLabel: string;
  isEditingDocumentTitle: boolean;
  selectedAuthoring: AuthoringSelection | null;
  dragPayload: DragPayload | null;
  activeDropTargetKey: string | null;
  // Handlers
  onOpenSourceReference: (mode?: "all" | "matches") => void;
  onSetProjectDetailsOpen: (open: boolean) => void;
  onSetWorkspaceLandingMode: (mode: "promoted_import" | "reopened_import" | null) => void;
  onSelectAuthoring: (selection: AuthoringSelection) => void;
  onSetIsEditingDocumentTitle: (editing: boolean) => void;
  onUpdateDocumentTitle: (title: string) => void;
  onAddSectionToStep: (stepId: string) => void;
  onAddGroupToSection: (stepId: string, sectionId: string) => void;
  onAddFieldToContainer: (stepId: string, sectionId: string, groupId?: string) => void;
  onRemoveSection: (stepId: string, sectionId: string) => void;
  onRemoveGroup: (stepId: string, sectionId: string, groupId: string) => void;
  onDragOver: (event: DragEvent<HTMLElement>, target: DropTarget, options?: { positionByPointer?: boolean }) => void;
  onDragLeave: (target: DropTarget) => void;
  onDrop: (event: DragEvent<HTMLElement>, target: DropTarget, options?: { positionByPointer?: boolean }) => void;
  onDragHandlePointerDown: (event: PointerEvent<HTMLButtonElement>, payload: DragPayload) => void;
  onDragHandlePointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onDragHandlePointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
  onDragHandlePointerCancel: (event: PointerEvent<HTMLButtonElement>) => void;
  onDragHandleSelect: (payload: DragPayload) => void;
  onNavigatePreviousStep: () => void;
  onNavigateNextStep: () => void;
  // Render props for complex contextual content
  renderBehaviorToolbar: (opts: { compact?: boolean; stopPropagation?: boolean; label?: string }) => ReactNode;
  renderDispatchKeyBadge: (dispatchKey: string | null | undefined) => ReactNode;
  renderBuilderFieldCard: (
    stepId: string,
    sectionId: string,
    field: AuthoringField,
    fieldIndex: number,
    groupId?: string,
  ) => ReactNode;
  /** When true, structural add/remove controls are hidden (viewer role). */
  isViewerMode?: boolean;
}

export function PreviewCanvas({
  activeProjectDetail,
  projectDirty,
  activeDocument,
  activeStep,
  activeStepIndex,
  activeStepSummary,
  isPdfBackedProject,
  workspaceLandingMode,
  importedSourcePageCount,
  importedSourceSectionCount,
  importedSourceFieldCount,
  sourceReferenceCanOpen,
  sourceReferenceOpenMode,
  sourceReferenceActionLabel,
  isEditingDocumentTitle,
  selectedAuthoring,
  dragPayload,
  activeDropTargetKey,
  onOpenSourceReference,
  onSetProjectDetailsOpen,
  onSetWorkspaceLandingMode,
  onSelectAuthoring,
  onSetIsEditingDocumentTitle,
  onUpdateDocumentTitle,
  onAddSectionToStep,
  onAddGroupToSection,
  onAddFieldToContainer,
  onRemoveSection,
  onRemoveGroup,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragHandlePointerDown,
  onDragHandlePointerMove,
  onDragHandlePointerUp,
  onDragHandlePointerCancel,
  onDragHandleSelect,
  onNavigatePreviousStep,
  onNavigateNextStep,
  renderBehaviorToolbar,
  renderDispatchKeyBadge,
  renderBuilderFieldCard,
  isViewerMode = false,
}: PreviewCanvasProps) {
  return (
    <PanelCard
      title="Step Preview"
      eyebrow="Inline editing"
      aside={
        activeProjectDetail ? (
          <div className="flex items-center gap-2">
            <StatusBadge tone={projectDirty ? "warning" : "success"}>
              {projectDirty ? "Unsaved changes" : "Saved"}
            </StatusBadge>
            <StatusBadge tone={badgeToneFromProjectStatus(activeProjectDetail.project.status)}>
              {formatLabel(activeProjectDetail.project.status)}
            </StatusBadge>
          </div>
        ) : undefined
      }
      className="min-w-0"
    >
      {activeDocument && activeStep ? (
        <div className="space-y-4 pr-1">
          {isPdfBackedProject && workspaceLandingMode ? (
            <div className="rounded-[1.35rem] border border-blue-200 bg-[linear-gradient(135deg,#eff6ff_0%,#ffffff_62%)] p-4 shadow-[0_20px_40px_rgba(37,99,235,0.10)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-3xl">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-blue-700">
                    Imported project handoff
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-slate-950">
                    {workspaceLandingMode === "promoted_import"
                      ? "Project workspace created from review"
                      : "Imported project reopened in the workspace"}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    The intake step is finished. Continue reshaping the digital flow here, and bring the imported PDF
                    reference back in only when you need evidence, page structure, or field provenance.
                  </p>
                </div>
                <StatusBadge tone={workspaceLandingMode === "promoted_import" ? "success" : "info"}>
                  {workspaceLandingMode === "promoted_import" ? "Ready to author" : "Workspace reopened"}
                </StatusBadge>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[1rem] border border-blue-100 bg-white/90 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Source file</p>
                    <p className="mt-2 text-sm font-semibold text-slate-950">
                      {activeProjectDetail?.sourceContext.filename}
                    </p>
                  </div>
                  <div className="rounded-[1rem] border border-blue-100 bg-white/90 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Imported scope</p>
                    <p className="mt-2 text-sm font-semibold text-slate-950">
                      {importedSourcePageCount} pages · {importedSourceSectionCount} sections
                    </p>
                    <p className="mt-1 text-xs text-slate-600">{importedSourceFieldCount} extracted fields</p>
                  </div>
                  <div className="rounded-[1rem] border border-blue-100 bg-white/90 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Review state</p>
                    <p className="mt-2 text-sm font-semibold text-slate-950">
                      {formatLabel(activeProjectDetail?.sourceContext.reviewStatus ?? "reviewed")}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {activeProjectDetail?.sourceContext.issues.length ?? 0} imported issues retained for reference
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenSourceReference(sourceReferenceOpenMode)}
                    disabled={!sourceReferenceCanOpen}
                    className={actionButtonClass("primary")}
                  >
                    {sourceReferenceActionLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSetProjectDetailsOpen(true);
                      onSetWorkspaceLandingMode(null);
                    }}
                    className={actionButtonClass()}
                  >
                    Project details
                  </button>
                  <button type="button" onClick={() => onSetWorkspaceLandingMode(null)} className={actionButtonClass()}>
                    Continue editing
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div data-behavior-studio-surface className="rounded-xl border border-soft bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => onSelectAuthoring({ kind: "step", stepId: activeStep.id })}
                className="min-w-0 flex-1 text-left"
              >
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Current step</p>
                <div className="mt-1 flex min-w-0 items-center gap-3">
                  <PageIcon />
                  <h3 className="truncate text-xl font-semibold text-slate-950">{activeStep.title}</h3>
                </div>
                {activeStepSummary ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="app-pill">{activeStepSummary.fieldCount} fields</span>
                    <span className="app-pill">{activeStepSummary.interactiveCount} interactive</span>
                    <span className="app-pill">{activeStepSummary.statementCount} content</span>
                    {(() => {
                      const behaviorSummary = summarizeStepBehavior(activeStep);
                      return (
                        <>
                          {behaviorSummary.ruleCount ? (
                            <span className="app-pill">{behaviorSummary.ruleCount} conditions</span>
                          ) : null}
                          {behaviorSummary.flowCount ? (
                            <span className="app-pill">{behaviorSummary.flowCount} flows</span>
                          ) : null}
                        </>
                      );
                    })()}
                  </div>
                ) : null}
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{guidanceForStep(activeStep)}</p>
              </button>
              <div className="flex flex-wrap items-center gap-2">
                {selectedAuthoring?.kind === "step" && selectedAuthoring.stepId === activeStep.id
                  ? renderBehaviorToolbar({ compact: true, stopPropagation: true, label: "Step behavior" })
                  : null}
                {selectedAuthoring?.kind === "step" && selectedAuthoring.stepId === activeStep.id
                  ? renderDispatchKeyBadge(activeStep.dispatchKey)
                  : null}
                <div className="app-pill">
                  Step {activeStepIndex + 1} of {activeDocument.steps.length}
                </div>
                {isPdfBackedProject ? (
                  <button
                    type="button"
                    onClick={() => onOpenSourceReference(sourceReferenceOpenMode)}
                    disabled={!sourceReferenceCanOpen}
                    className={actionButtonClass()}
                  >
                    {sourceReferenceActionLabel}
                  </button>
                ) : null}
                {isViewerMode ? null : (
                  <button
                    type="button"
                    title="Add section"
                    aria-label="Add section"
                    onClick={() => onAddSectionToStep(activeStep.id)}
                    className={iconButtonClass("primary")}
                  >
                    <PlusIcon />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-[1.45rem] border border-soft bg-white p-4 shadow-[0_20px_44px_rgba(19,32,51,0.08)]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Runtime page preview</p>
                {isEditingDocumentTitle ? (
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      value={activeDocument.title}
                      onChange={(event) => onUpdateDocumentTitle(event.target.value)}
                      className="w-full max-w-[24rem] rounded-2xl border border-soft px-4 py-2.5 text-sm text-slate-800"
                    />
                    <button
                      type="button"
                      title="Done editing title"
                      aria-label="Done editing title"
                      onClick={() => onSetIsEditingDocumentTitle(false)}
                      className={actionButtonClass("primary")}
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <div className="mt-1 flex items-center gap-2">
                    <p className="text-lg font-semibold text-slate-950">{activeDocument.title}</p>
                    <button
                      type="button"
                      title="Edit title"
                      aria-label="Edit title"
                      onClick={() => onSetIsEditingDocumentTitle(true)}
                      className={actionButtonClass()}
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              {activeStep.sections.length
                ? activeStep.sections.map((section, sectionIndex) => (
                    <div key={section.id} className="space-y-3">
                      <DropMarker
                        target={{ kind: "section-list", stepId: activeStep.id, index: sectionIndex }}
                        label="Insert section here"
                        dragPayload={dragPayload}
                        activeDropTargetKey={activeDropTargetKey}
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        onDrop={onDrop}
                      />
                      <section
                        data-behavior-studio-surface
                        {...dropTargetAttributes({ kind: "section-list", stepId: activeStep.id, index: sectionIndex })}
                        onDragOver={(event) =>
                          onDragOver(
                            event,
                            { kind: "section-list", stepId: activeStep.id, index: sectionIndex },
                            { positionByPointer: true },
                          )
                        }
                        onDragLeave={() =>
                          onDragLeave({ kind: "section-list", stepId: activeStep.id, index: sectionIndex })
                        }
                        onDrop={(event) =>
                          onDrop(
                            event,
                            { kind: "section-list", stepId: activeStep.id, index: sectionIndex },
                            { positionByPointer: true },
                          )
                        }
                        onClick={() =>
                          onSelectAuthoring({
                            kind: "section",
                            stepId: activeStep.id,
                            sectionId: section.id,
                          })
                        }
                        className={`cursor-pointer rounded-[1.45rem] border p-5 ${
                          selectedAuthoring?.kind === "section" && selectedAuthoring.sectionId === section.id
                            ? "border-blue-300 bg-[#f6f9ff]"
                            : "border-soft bg-[#fbfcff]"
                        } ${
                          dragPayloadMatchesSelection(dragPayload, {
                            kind: "section",
                            stepId: activeStep.id,
                            sectionId: section.id,
                          })
                            ? "scale-[0.995] opacity-55 shadow-[0_18px_34px_rgba(37,99,235,0.16)]"
                            : ""
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <DragHandle
                              label="Drag section"
                              payload={{ kind: "section", stepId: activeStep.id, sectionId: section.id }}
                              onPointerDown={onDragHandlePointerDown}
                              onPointerMove={onDragHandlePointerMove}
                              onPointerUp={onDragHandlePointerUp}
                              onPointerCancel={onDragHandlePointerCancel}
                              onSelect={onDragHandleSelect}
                            />
                            <div className="min-w-0">
                              <h4 className="text-xl font-semibold text-slate-950">{section.title}</h4>
                              {section.description ? (
                                <p className="mt-2 text-sm leading-6 text-slate-600">{section.description}</p>
                              ) : null}
                              {(() => {
                                const behaviorSummary = summarizeSectionBehavior(section);
                                return behaviorSummary.ruleCount || behaviorSummary.flowCount ? (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {behaviorSummary.ruleCount ? (
                                      <span className="app-pill">{behaviorSummary.ruleCount} conditions</span>
                                    ) : null}
                                    {behaviorSummary.flowCount ? (
                                      <span className="app-pill">{behaviorSummary.flowCount} flows</span>
                                    ) : null}
                                  </div>
                                ) : null;
                              })()}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {selectedAuthoring?.kind === "section" && selectedAuthoring.sectionId === section.id
                              ? renderBehaviorToolbar({ compact: true, stopPropagation: true, label: "Behavior" })
                              : null}
                            {selectedAuthoring?.kind === "section" && selectedAuthoring.sectionId === section.id
                              ? renderDispatchKeyBadge(section.dispatchKey)
                              : null}
                            {isViewerMode ? null : (
                              <>
                                <button
                                  type="button"
                                  title="Add group"
                                  aria-label="Add group"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onAddGroupToSection(activeStep.id, section.id);
                                  }}
                                  className={iconButtonClass("primary")}
                                >
                                  <GroupIcon />
                                </button>
                                <button
                                  type="button"
                                  title="Add field"
                                  aria-label="Add field"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onAddFieldToContainer(activeStep.id, section.id);
                                  }}
                                  className={iconButtonClass()}
                                >
                                  <FieldIcon />
                                </button>
                                <button
                                  type="button"
                                  title="Remove section"
                                  aria-label="Remove section"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onRemoveSection(activeStep.id, section.id);
                                  }}
                                  className={iconButtonClass("danger")}
                                >
                                  <RemoveIcon />
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 space-y-4">
                          {section.groups.length
                            ? section.groups.map((group, groupIndex) => (
                                <div key={group.id} className="space-y-3">
                                  <DropMarker
                                    target={{
                                      kind: "group-list",
                                      stepId: activeStep.id,
                                      sectionId: section.id,
                                      index: groupIndex,
                                    }}
                                    label="Insert group here"
                                    dragPayload={dragPayload}
                                    activeDropTargetKey={activeDropTargetKey}
                                    onDragOver={onDragOver}
                                    onDragLeave={onDragLeave}
                                    onDrop={onDrop}
                                  />
                                  <div
                                    data-behavior-studio-surface
                                    {...dropTargetAttributes({
                                      kind: "group-list",
                                      stepId: activeStep.id,
                                      sectionId: section.id,
                                      index: groupIndex,
                                    })}
                                    onDragOver={(event) =>
                                      onDragOver(
                                        event,
                                        {
                                          kind: "group-list",
                                          stepId: activeStep.id,
                                          sectionId: section.id,
                                          index: groupIndex,
                                        },
                                        { positionByPointer: true },
                                      )
                                    }
                                    onDragLeave={() =>
                                      onDragLeave({
                                        kind: "group-list",
                                        stepId: activeStep.id,
                                        sectionId: section.id,
                                        index: groupIndex,
                                      })
                                    }
                                    onDrop={(event) =>
                                      onDrop(
                                        event,
                                        {
                                          kind: "group-list",
                                          stepId: activeStep.id,
                                          sectionId: section.id,
                                          index: groupIndex,
                                        },
                                        { positionByPointer: true },
                                      )
                                    }
                                    onClick={() =>
                                      onSelectAuthoring({
                                        kind: "group",
                                        stepId: activeStep.id,
                                        sectionId: section.id,
                                        groupId: group.id,
                                      })
                                    }
                                    className={`cursor-pointer rounded-[1.2rem] border p-4 ${
                                      selectedAuthoring?.kind === "group" && selectedAuthoring.groupId === group.id
                                        ? "border-blue-300 bg-white"
                                        : "border-soft bg-white"
                                    } ${
                                      dragPayloadMatchesSelection(dragPayload, {
                                        kind: "group",
                                        stepId: activeStep.id,
                                        sectionId: section.id,
                                        groupId: group.id,
                                      })
                                        ? "scale-[0.995] opacity-55 shadow-[0_18px_34px_rgba(37,99,235,0.16)]"
                                        : ""
                                    }`}
                                  >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div className="flex min-w-0 items-start gap-3">
                                        <DragHandle
                                          label="Drag group"
                                          payload={{
                                            kind: "group",
                                            stepId: activeStep.id,
                                            sectionId: section.id,
                                            groupId: group.id,
                                          }}
                                          onPointerDown={onDragHandlePointerDown}
                                          onPointerMove={onDragHandlePointerMove}
                                          onPointerUp={onDragHandlePointerUp}
                                          onPointerCancel={onDragHandlePointerCancel}
                                          onSelect={onDragHandleSelect}
                                        />
                                        <div className="min-w-0">
                                          <p className="text-sm font-semibold text-slate-950">{group.label}</p>
                                          {group.description ? (
                                            <p className="mt-1 text-sm leading-6 text-slate-600">{group.description}</p>
                                          ) : null}
                                          {(() => {
                                            const behaviorSummary = summarizeGroupBehavior(group);
                                            return behaviorSummary.ruleCount || behaviorSummary.flowCount ? (
                                              <div className="mt-3 flex flex-wrap gap-2">
                                                {behaviorSummary.ruleCount ? (
                                                  <span className="app-pill">
                                                    {behaviorSummary.ruleCount} conditions
                                                  </span>
                                                ) : null}
                                                {behaviorSummary.flowCount ? (
                                                  <span className="app-pill">{behaviorSummary.flowCount} flows</span>
                                                ) : null}
                                              </div>
                                            ) : null;
                                          })()}
                                        </div>
                                      </div>
                                      <div className="flex flex-wrap items-center justify-end gap-2">
                                        {selectedAuthoring?.kind === "group" && selectedAuthoring.groupId === group.id
                                          ? renderBehaviorToolbar({
                                              compact: true,
                                              stopPropagation: true,
                                              label: "Behavior",
                                            })
                                          : null}
                                        {selectedAuthoring?.kind === "group" && selectedAuthoring.groupId === group.id
                                          ? renderDispatchKeyBadge(group.dispatchKey)
                                          : null}
                                        {isViewerMode ? null : (
                                          <>
                                            <button
                                              type="button"
                                              title="Add field"
                                              aria-label="Add field"
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                onAddFieldToContainer(activeStep.id, section.id, group.id);
                                              }}
                                              className={iconButtonClass("primary")}
                                            >
                                              <FieldIcon />
                                            </button>
                                            <button
                                              type="button"
                                              title="Remove group"
                                              aria-label="Remove group"
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                onRemoveGroup(activeStep.id, section.id, group.id);
                                              }}
                                              className={iconButtonClass("danger")}
                                            >
                                              <RemoveIcon />
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                    <div
                                      {...dropTargetAttributes(
                                        {
                                          kind: "field-list",
                                          stepId: activeStep.id,
                                          sectionId: section.id,
                                          groupId: group.id,
                                          index: group.fields.length,
                                        },
                                        { exact: true },
                                      )}
                                      className="mt-4 grid gap-4 md:grid-cols-2"
                                      onDragOver={(event) =>
                                        onDragOver(event, {
                                          kind: "field-list",
                                          stepId: activeStep.id,
                                          sectionId: section.id,
                                          groupId: group.id,
                                          index: group.fields.length,
                                        })
                                      }
                                      onDragLeave={() =>
                                        onDragLeave({
                                          kind: "field-list",
                                          stepId: activeStep.id,
                                          sectionId: section.id,
                                          groupId: group.id,
                                          index: group.fields.length,
                                        })
                                      }
                                      onDrop={(event) =>
                                        onDrop(event, {
                                          kind: "field-list",
                                          stepId: activeStep.id,
                                          sectionId: section.id,
                                          groupId: group.id,
                                          index: group.fields.length,
                                        })
                                      }
                                    >
                                      {group.fields.length
                                        ? group.fields.map((field, fieldIndex) => (
                                            <div key={field.id} className="contents">
                                              <DropMarker
                                                target={{
                                                  kind: "field-list",
                                                  stepId: activeStep.id,
                                                  sectionId: section.id,
                                                  groupId: group.id,
                                                  index: fieldIndex,
                                                }}
                                                gridSpan
                                                label="Insert field here"
                                                dragPayload={dragPayload}
                                                activeDropTargetKey={activeDropTargetKey}
                                                onDragOver={onDragOver}
                                                onDragLeave={onDragLeave}
                                                onDrop={onDrop}
                                              />
                                              {renderBuilderFieldCard(
                                                activeStep.id,
                                                section.id,
                                                field,
                                                fieldIndex,
                                                group.id,
                                              )}
                                            </div>
                                          ))
                                        : null}
                                      {!group.fields.length ? (
                                        <EmptyDropZone
                                          target={{
                                            kind: "field-list",
                                            stepId: activeStep.id,
                                            sectionId: section.id,
                                            groupId: group.id,
                                            index: 0,
                                          }}
                                          copy={{
                                            title: "No fields in this group yet",
                                            description:
                                              "Drop a field here or use Add field to start the grouped layout.",
                                            activeTitle: "Drop field into this group",
                                          }}
                                          gridSpan
                                          dragPayload={dragPayload}
                                          activeDropTargetKey={activeDropTargetKey}
                                          onDragOver={onDragOver}
                                          onDragLeave={onDragLeave}
                                          onDrop={onDrop}
                                        />
                                      ) : null}
                                      {group.fields.length ? (
                                        <DropMarker
                                          target={{
                                            kind: "field-list",
                                            stepId: activeStep.id,
                                            sectionId: section.id,
                                            groupId: group.id,
                                            index: group.fields.length,
                                          }}
                                          gridSpan
                                          label="Insert field at end"
                                          dragPayload={dragPayload}
                                          activeDropTargetKey={activeDropTargetKey}
                                          onDragOver={onDragOver}
                                          onDragLeave={onDragLeave}
                                          onDrop={onDrop}
                                        />
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              ))
                            : null}
                          {!section.groups.length ? (
                            <EmptyDropZone
                              target={{ kind: "group-list", stepId: activeStep.id, sectionId: section.id, index: 0 }}
                              copy={{
                                title: "No groups in this section yet",
                                description:
                                  "Drop a group here to create a grouped block, or use Add group when you want a fresh container.",
                                activeTitle: "Drop group into this section",
                              }}
                              dragPayload={dragPayload}
                              activeDropTargetKey={activeDropTargetKey}
                              onDragOver={onDragOver}
                              onDragLeave={onDragLeave}
                              onDrop={onDrop}
                            />
                          ) : null}
                          {section.groups.length ? (
                            <DropMarker
                              target={{
                                kind: "group-list",
                                stepId: activeStep.id,
                                sectionId: section.id,
                                index: section.groups.length,
                              }}
                              label="Insert group at end"
                              dragPayload={dragPayload}
                              activeDropTargetKey={activeDropTargetKey}
                              onDragOver={onDragOver}
                              onDragLeave={onDragLeave}
                              onDrop={onDrop}
                            />
                          ) : null}

                          <div
                            {...dropTargetAttributes(
                              {
                                kind: "field-list",
                                stepId: activeStep.id,
                                sectionId: section.id,
                                index: section.fields.length,
                              },
                              { exact: true },
                            )}
                            className="grid gap-4 md:grid-cols-2"
                            onDragOver={(event) =>
                              onDragOver(event, {
                                kind: "field-list",
                                stepId: activeStep.id,
                                sectionId: section.id,
                                index: section.fields.length,
                              })
                            }
                            onDragLeave={() =>
                              onDragLeave({
                                kind: "field-list",
                                stepId: activeStep.id,
                                sectionId: section.id,
                                index: section.fields.length,
                              })
                            }
                            onDrop={(event) =>
                              onDrop(event, {
                                kind: "field-list",
                                stepId: activeStep.id,
                                sectionId: section.id,
                                index: section.fields.length,
                              })
                            }
                          >
                            {section.fields.length
                              ? section.fields.map((field, fieldIndex) => (
                                  <div key={field.id} className="contents">
                                    <DropMarker
                                      target={{
                                        kind: "field-list",
                                        stepId: activeStep.id,
                                        sectionId: section.id,
                                        index: fieldIndex,
                                      }}
                                      gridSpan
                                      label="Insert field here"
                                      dragPayload={dragPayload}
                                      activeDropTargetKey={activeDropTargetKey}
                                      onDragOver={onDragOver}
                                      onDragLeave={onDragLeave}
                                      onDrop={onDrop}
                                    />
                                    {renderBuilderFieldCard(activeStep.id, section.id, field, fieldIndex)}
                                  </div>
                                ))
                              : null}
                            {!section.fields.length ? (
                              <EmptyDropZone
                                target={{
                                  kind: "field-list",
                                  stepId: activeStep.id,
                                  sectionId: section.id,
                                  index: 0,
                                }}
                                copy={{
                                  title: "No standalone fields in this section",
                                  description:
                                    "Drop a field here for direct section content, or use Add field to seed the layout.",
                                  activeTitle: "Drop field into this section",
                                }}
                                gridSpan
                                dragPayload={dragPayload}
                                activeDropTargetKey={activeDropTargetKey}
                                onDragOver={onDragOver}
                                onDragLeave={onDragLeave}
                                onDrop={onDrop}
                              />
                            ) : null}
                            {section.fields.length ? (
                              <DropMarker
                                target={{
                                  kind: "field-list",
                                  stepId: activeStep.id,
                                  sectionId: section.id,
                                  index: section.fields.length,
                                }}
                                gridSpan
                                label="Insert field at end"
                                dragPayload={dragPayload}
                                activeDropTargetKey={activeDropTargetKey}
                                onDragOver={onDragOver}
                                onDragLeave={onDragLeave}
                                onDrop={onDrop}
                              />
                            ) : null}
                          </div>
                        </div>
                      </section>
                    </div>
                  ))
                : null}
              {!activeStep.sections.length ? (
                <EmptyDropZone
                  target={{ kind: "section-list", stepId: activeStep.id, index: 0 }}
                  copy={{
                    title: "No sections in this step yet",
                    description:
                      "Drop a section here or use Add section to give this step a clearer structure before you add fields.",
                    activeTitle: "Drop section into this step",
                  }}
                  dragPayload={dragPayload}
                  activeDropTargetKey={activeDropTargetKey}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                />
              ) : null}
              {activeStep.sections.length ? (
                <DropMarker
                  target={{ kind: "section-list", stepId: activeStep.id, index: activeStep.sections.length }}
                  label="Insert section at end"
                  dragPayload={dragPayload}
                  activeDropTargetKey={activeDropTargetKey}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                />
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.15rem] border border-soft bg-[#f8fbff] px-4 py-3">
                <span className="text-sm text-slate-600">Runtime navigation preview</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onNavigatePreviousStep}
                    disabled={activeStepIndex <= 0}
                    className={actionButtonClass()}
                  >
                    Previous
                  </button>
                  <button type="button" onClick={onNavigateNextStep} className={actionButtonClass("primary")}>
                    {activeStepIndex === activeDocument.steps.length - 1 ? "Submit" : "Continue"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="app-muted-card p-6 text-sm text-slate-500">
          Promote a reviewed conversion to start building.
        </div>
      )}
    </PanelCard>
  );
}
