/**
 * Fixture builders for the Phase 3 composer E2E.
 *
 * Returns an `AuthoringProjectDetail` whose step owns a runtime listener with
 * a `host_call_await` action. The test asserts that the seeded chain renders
 * in the inspector — i.e. the wire contract round-trips async action kinds.
 *
 * Shapes follow @form-builder/schema (apps/api/.../authoring.ts /
 * packages/schema/src/authoring.ts). Missing required fields cause App.tsx
 * to crash on hydration ("Cannot read properties of undefined").
 */

const PROJECT_ID = "e2e-project-host-call-await";
const STEP_ID = "step-1";
const SECTION_ID = "section-1";
const LISTENER_ID = "lst_host_call_await_e2e";
const ACTION_ID = "act_host_call_await_e2e";
const FIELD_ID = "field-1";
const NOW = "2026-05-11T00:00:00.000Z";

export const FIXTURE_PROJECT_ID = PROJECT_ID;
export const FIXTURE_STEP_ID = STEP_ID;
export const FIXTURE_LISTENER_ID = LISTENER_ID;
export const FIXTURE_ACTION_ID = ACTION_ID;

function makeField() {
  return {
    id: FIELD_ID,
    dispatchKey: null,
    stableKey: "zip_code",
    label: "Postal code",
    helpText: null,
    semanticType: "text",
    required: false,
    confidence: 1,
    options: [],
    validations: [],
    layoutHints: { width: "full", presentation: "input" },
    rendererHints: {},
    sourcePriority: [],
    sourceConflicts: [],
    lineage: [],
    sourceFieldIds: [],
    provenanceAnchorIds: [],
    runtime: null,
  };
}

function makeSection() {
  return {
    id: SECTION_ID,
    dispatchKey: null,
    title: "Form",
    description: null,
    layoutHints: {},
    lineage: [],
    sourceSectionIds: [],
    provenanceAnchorIds: [],
    groups: [],
    fields: [makeField()],
    runtime: null,
  };
}

function makeListener() {
  return {
    id: LISTENER_ID,
    // Disabled so the engine doesn't actually dispatch the host_call_await on
    // mount — the test asserts the *author-side rendering* of the seeded
    // chain, not its execution. Live suspend/resume is covered by
    // packages/runtime fuzz/async tests.
    enabled: false,
    priority: 0,
    eventName: "form.submit",
    captureBeforeTarget: false,
    source: { id: STEP_ID, kind: "step" },
    target: { id: STEP_ID, kind: "step" },
    conditions: [],
    provenance: "user",
    actions: [
      {
        id: ACTION_ID,
        kind: "host_call_await",
        target: null,
        onError: "halt_and_raise",
        continueOnError: false,
        config: {
          handler: "verifyPostalAddress",
          correlationId: "corr-e2e-001",
          timeoutMs: 5000,
          payload: {},
        },
      },
    ],
  };
}

function makeStep() {
  return {
    id: STEP_ID,
    dispatchKey: null,
    title: "Entry step",
    description: null,
    kind: "page",
    layoutHints: {},
    sourcePageIds: [],
    provenanceAnchorIds: [],
    runtime: {
      listeners: [makeListener()],
      dispatches: [],
      events: [],
    },
    sections: [makeSection()],
  };
}

export function buildAuthoringDocument() {
  return {
    id: `doc-${PROJECT_ID}`,
    dispatchKey: null,
    title: "Phase 3 composer E2E",
    documentClass: "acroform_only",
    reviewStatus: "ready",
    targetRuntime: "va_web_form",
    visualBaseline: "va.gov",
    sourcePriority: [],
    sourceConflicts: [],
    metadata: {},
    runtime: null,
    steps: [makeStep()],
  };
}

export function buildProjectDetail() {
  const document = buildAuthoringDocument();
  return {
    project: {
      id: PROJECT_ID,
      name: "Phase 3 composer E2E",
      status: "draft",
      targetRuntime: "va_web_form",
      visualBaseline: "va.gov",
      sourceConversionId: "e2e-conversion",
      documentClass: "acroform_only",
      currentRevisionId: "rev-1",
      revisionCount: 1,
      createdAt: NOW,
      updatedAt: NOW,
    },
    document,
    sourceContext: {
      conversionId: "e2e-conversion",
      filename: "e2e-fixture.pdf",
      documentClass: "acroform_only",
      reviewStatus: "ready",
      confidence: 1,
      extractorPath: ["e2e"],
      notes: [],
      issues: [],
      importedDraft: {
        id: `draft-${PROJECT_ID}`,
        title: "Phase 3 composer E2E",
        documentClass: "acroform_only",
        reviewStatus: "ready",
        pages: [],
        metadata: {},
      },
    },
  };
}

export function buildProjectRecord() {
  return buildProjectDetail().project;
}
