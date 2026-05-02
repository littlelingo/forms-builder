import assert from "node:assert/strict";
import test from "node:test";

import type {
  AuthoringDocument,
  RuntimeActionDefinition,
  RuntimeEventEnvelope,
  RuntimeHostContext,
} from "@form-builder/schema";

import { createRuntimeEngine } from "./engine";

function createHostContext(): RuntimeHostContext {
  return {
    environment: "runtime-test",
    session: { projectId: "project-test" },
    auth: {},
    app: { stage: "builder" },
    data: {},
  };
}

function createDocument(): AuthoringDocument {
  return {
    id: "form-test",
    title: "Runtime Test Form",
    documentClass: "mixed",
    reviewStatus: "accepted",
    targetRuntime: "va_web_form",
    visualBaseline: "va.gov",
    sourcePriority: [],
    sourceConflicts: [],
    metadata: {},
    runtime: {
      version: "1.0",
      formEvents: [],
      formListeners: [],
      hostBindings: [],
      submitEventName: "form.submit",
      sessionStateShape: {
        mode: "key_value",
        fields: [],
        example: null,
        notes: ["Default runtime session shape"],
      },
    },
    steps: [
      {
        id: "step-1",
        title: "Step 1",
        description: "Collect a required value.",
        kind: "collect",
        layoutHints: {},
        sourcePageIds: [],
        provenanceAnchorIds: [],
        sections: [
          {
            id: "section-1",
            title: "Section 1",
            description: null,
            layoutHints: {},
            lineage: [],
            sourceSectionIds: [],
            provenanceAnchorIds: [],
            fields: [
              {
                id: "field-name",
                stableKey: "field-name",
                label: "Applicant name",
                helpText: null,
                semanticType: "text",
                required: true,
                confidence: 1,
                options: [],
                validations: [],
                conditionals: [],
                layoutHints: {},
                rendererHints: {},
                sourcePriority: [],
                sourceConflicts: [],
                lineage: [],
                sourceFieldIds: [],
                provenanceAnchorIds: [],
                runtime: null,
              },
              {
                id: "button-next",
                stableKey: "button-next",
                label: "Continue",
                helpText: null,
                semanticType: "text",
                required: false,
                confidence: 1,
                options: [],
                validations: [],
                conditionals: [],
                layoutHints: {},
                rendererHints: {
                  component: "button",
                  action: "next_step",
                },
                sourcePriority: [],
                sourceConflicts: [],
                lineage: [],
                sourceFieldIds: [],
                provenanceAnchorIds: [],
                runtime: {
                  eventSources: [
                    {
                      id: "event-button-next",
                      name: "component.click",
                      sourceNodeId: "button-next",
                      sourceNodeType: "component",
                      description: "Continue button click",
                    },
                  ],
                  listeners: [
                    {
                      id: "listener-button-next",
                      label: "Continue to next step",
                      eventName: "component.click",
                      sourceNodeId: "button-next",
                      enabled: true,
                      ruleGuards: [],
                      actions: [
                        {
                          id: "action-button-next",
                          kind: "go_to_next_step",
                          target: { nodeId: "button-next", nodeType: "component" },
                          config: {},
                          continueOnError: false,
                        },
                      ],
                    },
                  ],
                },
              },
              {
                id: "button-explicit-event",
                stableKey: "button-explicit-event",
                label: "Emit explicit event",
                helpText: null,
                semanticType: "text",
                required: false,
                confidence: 1,
                options: [],
                validations: [],
                conditionals: [],
                layoutHints: {},
                rendererHints: {
                  component: "button",
                  action: "next_step",
                },
                sourcePriority: [],
                sourceConflicts: [],
                lineage: [],
                sourceFieldIds: [],
                provenanceAnchorIds: [],
                runtime: {
                  eventSources: [
                    {
                      id: "event-explicit-button",
                      name: "component.click",
                      sourceNodeId: "button-explicit-event",
                      sourceNodeType: "component",
                    },
                  ],
                  listeners: [
                    {
                      id: "listener-explicit-button",
                      label: "Emit a custom event",
                      eventName: "component.click",
                      sourceNodeId: "button-explicit-event",
                      enabled: true,
                      ruleGuards: [],
                      actions: [
                        {
                          id: "action-explicit-button",
                          kind: "emit_event",
                          target: { nodeId: "button-explicit-event", nodeType: "component" },
                          config: {
                            eventName: "custom.button_clicked",
                            payload: { mode: "explicit" },
                          },
                          continueOnError: false,
                        },
                      ],
                    },
                  ],
                },
              },
            ],
            groups: [],
            runtime: null,
          },
        ],
        runtime: null,
      },
      {
        id: "step-2",
        title: "Step 2",
        description: "Submit the form.",
        kind: "review",
        layoutHints: {},
        sourcePageIds: [],
        provenanceAnchorIds: [],
        sections: [
          {
            id: "section-2",
            title: "Section 2",
            description: null,
            layoutHints: {},
            lineage: [],
            sourceSectionIds: [],
            provenanceAnchorIds: [],
            fields: [
              {
                id: "button-submit",
                stableKey: "button-submit",
                label: "Submit",
                helpText: null,
                semanticType: "text",
                required: false,
                confidence: 1,
                options: [],
                validations: [],
                conditionals: [],
                layoutHints: {},
                rendererHints: {
                  component: "button",
                  action: "submit",
                },
                sourcePriority: [],
                sourceConflicts: [],
                lineage: [],
                sourceFieldIds: [],
                provenanceAnchorIds: [],
                runtime: {
                  eventSources: [
                    {
                      id: "event-button-submit",
                      name: "component.click",
                      sourceNodeId: "button-submit",
                      sourceNodeType: "component",
                    },
                  ],
                  listeners: [
                    {
                      id: "listener-button-submit",
                      label: "Submit the form",
                      eventName: "component.click",
                      sourceNodeId: "button-submit",
                      enabled: true,
                      ruleGuards: [],
                      actions: [
                        {
                          id: "action-button-submit",
                          kind: "submit_form",
                          target: { nodeId: "button-submit", nodeType: "component" },
                          config: {},
                          continueOnError: false,
                        },
                      ],
                    },
                  ],
                },
              },
            ],
            groups: [],
            runtime: null,
          },
        ],
        runtime: null,
      },
    ],
  };
}

function clickEvent(nodeId: string): RuntimeEventEnvelope {
  return {
    type: "component.click",
    version: "1.0",
    source: {
      runtimeId: "runtime-test",
      formId: "form-test",
      projectId: "project-test",
      nodeId,
      nodeType: "component",
    },
    payload: { nodeId },
    correlationId: `corr-${nodeId}`,
    timestamp: "2026-05-01T12:00:00.000Z",
  };
}

function successEvent(correlationId: string): RuntimeEventEnvelope {
  return {
    type: "form.submit_success",
    version: "1.0",
    source: {
      runtimeId: "host-shell",
      formId: "form-test",
      projectId: "project-test",
      nodeId: "form-test",
      nodeType: "form",
    },
    payload: {
      message: "Submit succeeded.",
      submissionId: "submission-1",
    },
    correlationId,
    timestamp: "2026-05-01T12:00:10.000Z",
  };
}

function errorEvent(correlationId: string): RuntimeEventEnvelope {
  return {
    type: "form.submit_error",
    version: "1.0",
    source: {
      runtimeId: "host-shell",
      formId: "form-test",
      projectId: "project-test",
      nodeId: "form-test",
      nodeType: "form",
    },
    payload: {
      message: "Submit failed.",
      fieldErrors: {
        "field-name": "Still required.",
      },
    },
    correlationId,
    timestamp: "2026-05-01T12:00:20.000Z",
  };
}

function invokeNextStepAction(): RuntimeActionDefinition {
  return {
    id: "invoke-next",
    kind: "go_to_next_step",
    target: { nodeId: "button-next", nodeType: "component" },
    config: {},
    continueOnError: false,
  };
}

test("runtime restores session state after export/import style roundtrip", () => {
  const document = createDocument();
  const engine = createRuntimeEngine();

  const mounted = engine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
    randomId: () => "mount-id",
    clock: () => new Date("2026-05-01T12:00:00.000Z"),
  });

  assert.equal(mounted.currentStepId, "step-1");

  engine.dispatch({
    type: "field.change",
    version: "1.0",
    source: {
      runtimeId: "runtime-test",
      formId: "form-test",
      projectId: "project-test",
      nodeId: "field-name",
      nodeType: "field",
    },
    payload: {
      fieldId: "field-name",
      nextValue: "Jane Doe",
    },
    correlationId: "corr-field-change",
    timestamp: "2026-05-01T12:00:01.000Z",
  });
  engine.dispatch(clickEvent("button-next"));

  const exportedState = engine.getState();
  assert.equal(exportedState.currentStepId, "step-2");
  assert.equal(exportedState.values["field-name"], "Jane Doe");

  const restoredEngine = createRuntimeEngine();
  const restored = restoredEngine.mount(document, {
    runtimeId: "runtime-restored",
    projectId: "project-test",
    hostContext: createHostContext(),
    initialSessionState: exportedState,
    emitLoadEvent: false,
  });

  assert.equal(restored.currentStepId, "step-2");
  assert.equal(restored.values["field-name"], "Jane Doe");
  assert.equal(restored.hostContextSnapshot?.environment, "runtime-test");
});

test("runtime emits validation_failed when submit is blocked", () => {
  const document = createDocument();
  const engine = createRuntimeEngine();

  engine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
  });
  engine.invoke(invokeNextStepAction());
  const result = engine.dispatch(clickEvent("button-submit"));

  assert.equal(result.submit.status, "idle");
  assert.equal(result.validation.valid, false);
  assert.equal(result.submit.message, "Validation failed.");
  assert.equal(result.submit.fieldErrors?.["field-name"], "Applicant name is required.");

  const validationFailedEvents = engine
    .getTrace()
    .filter((entry) => entry.event.type === "form.validation_failed");
  assert.equal(validationFailedEvents.length, 1);
});

test("runtime supports submit success and error host roundtrip", () => {
  const document = createDocument();
  const engine = createRuntimeEngine();

  engine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
  });
  engine.dispatch({
    type: "field.change",
    version: "1.0",
    source: {
      runtimeId: "runtime-test",
      formId: "form-test",
      projectId: "project-test",
      nodeId: "field-name",
      nodeType: "field",
    },
    payload: {
      fieldId: "field-name",
      nextValue: "Jane Doe",
    },
    correlationId: "corr-field-change",
    timestamp: "2026-05-01T12:00:01.000Z",
  });
  engine.dispatch(clickEvent("button-next"));

  const submitting = engine.dispatch(clickEvent("button-submit"));
  assert.equal(submitting.submit.status, "submitting");

  const submitEvent = engine.getTrace().findLast((entry) => entry.event.type === "form.submit");
  assert.ok(submitEvent);

  const success = engine.dispatch(successEvent(submitEvent.event.correlationId));
  assert.equal(success.submit.status, "success");
  assert.equal(success.submit.message, "Submit succeeded.");

  const error = engine.dispatch(errorEvent(submitEvent.event.correlationId));
  assert.equal(error.submit.status, "error");
  assert.equal(error.submit.message, "Submit failed.");
  assert.equal(error.submit.fieldErrors?.["field-name"], "Still required.");
});

test("explicit button listeners override the implicit compatibility listener path", () => {
  const document = createDocument();
  const engine = createRuntimeEngine();

  engine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
  });
  const result = engine.dispatch(clickEvent("button-explicit-event"));

  assert.equal(result.currentStepId, "step-1");

  const customEvents = engine
    .getTrace()
    .filter((entry) => entry.event.type === "custom.button_clicked");
  assert.equal(customEvents.length, 1);
  assert.deepEqual(customEvents[0]?.event.payload, { mode: "explicit" });
});
