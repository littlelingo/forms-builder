import assert from "node:assert/strict";
import test from "node:test";

import type {
  AuthoringDocument,
  RuntimeActionDefinition,
  RuntimeEventEnvelope,
  RuntimeHostContext,
  RuntimeListenerDefinition,
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
                      conditions: [],
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
                      conditions: [],
                      actions: [
                        {
                          id: "action-explicit-button",
                          kind: "dispatch_event",
                          target: { nodeId: "button-explicit-event", nodeType: "component" },
                          config: {
                            eventType: "custom.button_clicked",
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
                      conditions: [],
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

function fieldChangeEvent(fieldId: string, nextValue: unknown): RuntimeEventEnvelope {
  return {
    type: "field.change",
    version: "1.0",
    source: {
      runtimeId: "runtime-test",
      formId: "form-test",
      projectId: "project-test",
      nodeId: fieldId,
      nodeType: "field",
    },
    payload: {
      fieldId,
      nextValue,
    },
    correlationId: `corr-${fieldId}-change`,
    timestamp: "2026-05-01T12:00:01.000Z",
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

test("RuntimeListenerDefinition accepts NodeRef/EventRef/libraryRef/timing/provenance fields", () => {
  // Type-check only: this test exists to prove the schema additions compile.
  const listener: RuntimeListenerDefinition = {
    id: "lst-001",
    enabled: true,
    eventName: "field.change",
    source: { id: "node-1" },
    target: { id: "node-2" },
    eventRef: { id: "evt-1" },
    libraryRef: { id: "lib-1", revision: 1, params: {} },
    timing: { debounce_ms: 250 },
    provenance: "library",
    conditions: [],
    actions: [],
  };
  assert.equal(listener.id, "lst-001");
  assert.equal(listener.libraryRef?.revision, 1);
});

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

test("runtime restores exported session after document JSON save/load roundtrip", () => {
  const document = createDocument();
  const engine = createRuntimeEngine();

  engine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
    emitLoadEvent: false,
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

  const exportedState = engine.getState();
  const persistedDocument = JSON.parse(JSON.stringify(document)) as AuthoringDocument;
  const persistedSession = JSON.parse(JSON.stringify(exportedState));

  const restoredEngine = createRuntimeEngine();
  const restored = restoredEngine.mount(persistedDocument, {
    runtimeId: "runtime-restored",
    projectId: "project-test",
    hostContext: createHostContext(),
    initialSessionState: persistedSession,
    emitLoadEvent: false,
  });

  assert.equal(restored.currentStepId, "step-2");
  assert.equal(restored.values["field-name"], "Jane Doe");
  assert.equal(restored.hostContextSnapshot?.environment, "runtime-test");
  assert.equal(restoredEngine.getDocument()?.runtime?.submitEventName, "form.submit");
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

  const validationFailedEvents = engine.getTrace().filter((entry) => entry.event.type === "form.validation_failed");
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

  const customEvents = engine.getTrace().filter((entry) => entry.event.type === "custom.button_clicked");
  assert.equal(customEvents.length, 1);
  assert.deepEqual(customEvents[0]?.event.payload, { mode: "explicit" });
});

test("runtime payload references resolve against live session context", () => {
  const document = createDocument();
  const field = document.steps[0]?.sections[0]?.fields.find((entry) => entry.id === "field-name");
  assert.ok(field);

  field.runtime = {
    eventSources: [
      {
        id: "event-field-change-runtime-payload",
        name: "field.change",
        sourceNodeId: "field-name",
        sourceNodeType: "field",
      },
    ],
    listeners: [
      {
        id: "listener-field-change-runtime-payload",
        label: "Emit runtime context",
        eventName: "field.change",
        sourceNodeId: "field-name",
        enabled: true,
        conditions: [],
        actions: [
          {
            id: "action-field-change-runtime-payload",
            kind: "dispatch_event",
            target: { nodeId: "field-name", nodeType: "field" },
            config: {
              eventType: "field.context_emitted",
              payload: {
                fieldId: { $runtime: "current.field.id" },
                fieldKey: { $runtime: "current.field.key" },
                stepId: { $runtime: "current.step.id" },
                stepTitle: { $runtime: "current.step.title" },
                formId: { $runtime: "current.form.id" },
                formTitle: { $runtime: "current.form.title" },
                projectId: { $runtime: "current.project.id" },
                sourceNodeId: { $runtime: "current.source.node.id" },
                sourceNodeType: { $runtime: "current.source.node.type" },
                value: { $runtime: "current.runtime.value" },
              },
            },
            continueOnError: false,
          },
          {
            id: "action-field-change-host-payload",
            kind: "host_action",
            target: { nodeId: "field-name", nodeType: "field" },
            config: {
              handlerKey: "host.lookup",
              payload: {
                fieldId: { $runtime: "current.field.id" },
                query: { $runtime: "current.runtime.value" },
                meta: {
                  fieldKey: { $runtime: "current.field.key" },
                  stepId: { $runtime: "current.step.id" },
                  stepTitle: { $runtime: "current.step.title" },
                  projectId: { $runtime: "current.project.id" },
                  sourceNodeType: { $runtime: "current.source.node.type" },
                },
              },
            },
            continueOnError: false,
          },
        ],
      },
    ],
  };

  const engine = createRuntimeEngine();
  engine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });

  engine.dispatch(fieldChangeEvent("field-name", "Jane Doe"));

  const emittedEvent = engine.getTrace().findLast((entry) => entry.event.type === "field.context_emitted");
  assert.ok(emittedEvent);
  assert.deepEqual(emittedEvent.event.payload, {
    fieldId: "field-name",
    fieldKey: "field-name",
    stepId: "step-1",
    stepTitle: "Step 1",
    formId: "form-test",
    formTitle: "Runtime Test Form",
    projectId: "project-test",
    sourceNodeId: "field-name",
    sourceNodeType: "field",
    value: "Jane Doe",
  });

  const hostRequest = engine.getTrace().findLast((entry) => entry.event.type === "host.action_requested");
  assert.ok(hostRequest);
  assert.equal(hostRequest.event.payload.handlerKey, "host.lookup");
  assert.deepEqual((hostRequest.event.payload.config as RuntimeActionDefinition["config"]).payload, {
    fieldId: "field-name",
    query: "Jane Doe",
    meta: {
      fieldKey: "field-name",
      stepId: "step-1",
      stepTitle: "Step 1",
      projectId: "project-test",
      sourceNodeType: "field",
    },
  });
});

test("disabled inline listener conditions do not gate runtime listeners", () => {
  const document = createDocument();
  const field = document.steps[0]?.sections[0]?.fields.find((entry) => entry.id === "field-name");
  assert.ok(field);

  field.runtime = {
    eventSources: [
      {
        id: "event-disabled-rule-guard",
        name: "field.change",
        sourceNodeId: "field-name",
        sourceNodeType: "field",
      },
    ],
    listeners: [
      {
        id: "listener-disabled-rule-guard",
        label: "Emit even while guard rule is disabled",
        eventName: "field.change",
        sourceNodeId: "field-name",
        enabled: true,
        conditions: [
          {
            id: "condition-disabled",
            enabled: false,
            source: { kind: "field_value", fieldId: "field-name" },
            operator: "equals",
            expectedValue: "allowed",
          },
        ],
        actions: [
          {
            id: "action-disabled-rule-guard",
            kind: "dispatch_event",
            target: { nodeId: "field-name", nodeType: "field" },
            config: {
              eventType: "field.disabled_guard_ignored",
              payload: { source: "disabled-rule" },
            },
            continueOnError: false,
          },
        ],
      },
    ],
  };

  const engine = createRuntimeEngine();
  engine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });

  engine.dispatch(fieldChangeEvent("field-name", "blocked-value"));

  const emittedEvent = engine.getTrace().findLast((entry) => entry.event.type === "field.disabled_guard_ignored");
  assert.ok(emittedEvent);
  assert.deepEqual(emittedEvent.event.payload, { source: "disabled-rule" });
});

test("field value listener conditions gate action chains", () => {
  const document = createDocument();
  const field = document.steps[0]?.sections[0]?.fields.find((entry) => entry.id === "field-name");
  assert.ok(field);

  field.runtime = {
    eventSources: [
      {
        id: "event-field-condition",
        name: "field.change",
        sourceNodeId: "field-name",
        sourceNodeType: "field",
      },
    ],
    listeners: [
      {
        id: "listener-field-condition",
        label: "Emit only when field value matches",
        eventName: "field.change",
        sourceNodeId: "field-name",
        enabled: true,
        conditions: [
          {
            id: "condition-field-allowed",
            enabled: true,
            source: { kind: "field_value", fieldId: "field-name" },
            operator: "equals",
            expectedValue: "allowed",
          },
        ],
        actions: [
          {
            id: "action-field-condition",
            kind: "dispatch_event",
            target: { nodeId: "field-name", nodeType: "field" },
            config: {
              eventType: "field.allowed",
              payload: { source: "field-condition" },
            },
            continueOnError: false,
          },
        ],
      },
    ],
  };

  const engine = createRuntimeEngine();
  engine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });

  engine.dispatch(fieldChangeEvent("field-name", "blocked"));
  assert.equal(engine.getTrace().filter((entry) => entry.event.type === "field.allowed").length, 0);

  engine.dispatch(fieldChangeEvent("field-name", "allowed"));
  assert.equal(engine.getTrace().filter((entry) => entry.event.type === "field.allowed").length, 1);
});

test("event payload listener conditions can inspect checkbox group payloads", () => {
  const document = createDocument();
  const field = document.steps[0]?.sections[0]?.fields.find((entry) => entry.id === "field-name");
  assert.ok(field);

  field.runtime = {
    eventSources: [
      {
        id: "event-checkbox-condition",
        name: "checkboxGroup.change",
        sourceNodeId: "field-name",
        sourceNodeType: "field",
      },
    ],
    listeners: [
      {
        id: "listener-checkbox-condition",
        label: "Emit only when selected values contain education",
        eventName: "checkboxGroup.change",
        sourceNodeId: "field-name",
        enabled: true,
        conditions: [
          {
            id: "condition-selected-values",
            enabled: true,
            source: { kind: "event_payload", path: "selectedValues" },
            operator: "contains",
            expectedValue: "education",
          },
        ],
        actions: [
          {
            id: "action-checkbox-condition",
            kind: "dispatch_event",
            target: { nodeId: "field-name", nodeType: "field" },
            config: {
              eventType: "checkbox.education_selected",
              payload: { source: "checkbox-condition" },
            },
            continueOnError: false,
          },
        ],
      },
    ],
  };

  const engine = createRuntimeEngine();
  engine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });

  engine.dispatch({
    ...fieldChangeEvent("field-name", ["pension"]),
    type: "checkboxGroup.change",
    payload: {
      fieldId: "field-name",
      selectedValues: ["pension"],
      nextValue: ["pension"],
    },
  });
  assert.equal(engine.getTrace().filter((entry) => entry.event.type === "checkbox.education_selected").length, 0);

  engine.dispatch({
    ...fieldChangeEvent("field-name", ["pension", "education"]),
    type: "checkboxGroup.change",
    payload: {
      fieldId: "field-name",
      selectedValues: ["pension", "education"],
      nextValue: ["pension", "education"],
    },
  });
  assert.equal(engine.getTrace().filter((entry) => entry.event.type === "checkbox.education_selected").length, 1);
});

test("event payload listener conditions can inspect standard metadata", () => {
  const document = createDocument();
  const field = document.steps[0]?.sections[0]?.fields.find((entry) => entry.id === "field-name");
  assert.ok(field);

  field.runtime = {
    eventSources: [
      {
        id: "event-metadata-condition",
        name: "field.change",
        sourceNodeId: "field-name",
        sourceNodeType: "field",
      },
    ],
    listeners: [
      {
        id: "listener-metadata-condition",
        label: "Emit only when metadata marks studio source",
        eventName: "field.change",
        sourceNodeId: "field-name",
        enabled: true,
        conditions: [
          {
            id: "condition-metadata",
            enabled: true,
            source: { kind: "event_payload", path: "metadata" },
            operator: "contains",
            expectedValue: '"source":"studio"',
          },
        ],
        actions: [
          {
            id: "action-metadata-condition",
            kind: "dispatch_event",
            target: { nodeId: "field-name", nodeType: "field" },
            config: {
              eventType: "metadata.matched",
              payload: { source: "metadata-condition" },
            },
            continueOnError: false,
          },
        ],
      },
    ],
  };

  const engine = createRuntimeEngine();
  engine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });

  engine.dispatch({
    ...fieldChangeEvent("field-name", "blocked"),
    payload: {
      fieldId: "field-name",
      nextValue: "blocked",
      metadata: '{"source":"runtime"}',
    },
  });
  assert.equal(engine.getTrace().filter((entry) => entry.event.type === "metadata.matched").length, 0);

  engine.dispatch({
    ...fieldChangeEvent("field-name", "allowed"),
    payload: {
      fieldId: "field-name",
      nextValue: "allowed",
      metadata: '{"source":"studio"}',
    },
  });
  assert.equal(engine.getTrace().filter((entry) => entry.event.type === "metadata.matched").length, 1);
});

test("set field value actions can resolve event payload references", () => {
  const document = createDocument();
  const field = document.steps[0]?.sections[0]?.fields.find((entry) => entry.id === "field-name");
  assert.ok(field);

  field.runtime = {
    eventSources: [
      {
        id: "event-checkbox-payload-value",
        name: "checkboxGroup.change",
        sourceNodeId: "field-name",
        sourceNodeType: "field",
      },
    ],
    listeners: [
      {
        id: "listener-set-from-payload",
        label: "Set field from event payload",
        eventName: "checkboxGroup.change",
        sourceNodeId: "field-name",
        enabled: true,
        conditions: [],
        actions: [
          {
            id: "action-set-from-payload",
            kind: "set_field_value",
            target: { nodeId: "field-name", nodeType: "field" },
            config: {
              fieldId: "field-name",
              value: { $runtime: "current.event.payload.changedOption" },
            },
            continueOnError: false,
          },
        ],
      },
    ],
  };

  const engine = createRuntimeEngine();
  engine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });

  engine.dispatch({
    ...fieldChangeEvent("field-name", ["education"]),
    type: "checkboxGroup.change",
    payload: {
      fieldId: "field-name",
      selectedValues: ["education"],
      changedOption: "education",
    },
  });

  assert.equal(engine.getState().values["field-name"], "education");
});

test("visibility actions can target a parent group from a child listener", () => {
  const document = createDocument();
  const section = document.steps[0]?.sections[0];
  assert.ok(section);

  section.groups.push({
    id: "group-benefits",
    label: "Type of benefits",
    description: null,
    layoutHints: {},
    rendererHints: {},
    lineage: [],
    sourceGroupIds: [],
    provenanceAnchorIds: [],
    fields: [
      {
        id: "field-benefit-radio",
        stableKey: "field-benefit-radio",
        label: "Type of benefit",
        helpText: null,
        semanticType: "radio",
        required: false,
        confidence: 1,
        options: [],
        validations: [],
        layoutHints: {},
        rendererHints: {},
        sourcePriority: [],
        sourceConflicts: [],
        lineage: [],
        sourceFieldIds: [],
        provenanceAnchorIds: [],
        runtime: {
          eventSources: [
            {
              id: "event-benefit-radio-change",
              type: "field.change",
              dispatcherId: "field-benefit-radio",
              dispatcherType: "field",
              sourceNodeId: "field-benefit-radio",
              sourceNodeType: "field",
            },
          ],
          listeners: [
            {
              id: "listener-benefit-radio-hide-parent",
              label: "Hide parent benefit group",
              type: "field.change",
              dispatcherId: "field-benefit-radio",
              dispatcherType: "field",
              eventSourceNodeId: "field-benefit-radio",
              eventSourceNodeType: "field",
              targetNodeId: "group-benefits",
              targetNodeType: "group",
              eventName: "field.change",
              sourceNodeId: "field-benefit-radio",
              enabled: true,
              conditions: [],
              actions: [
                {
                  id: "action-hide-benefit-group",
                  kind: "hide_node",
                  target: { nodeId: "group-benefits", nodeType: "group" },
                  config: { nodeId: "group-benefits" },
                  continueOnError: false,
                },
              ],
            },
          ],
        },
      },
    ],
    runtime: null,
  });

  const engine = createRuntimeEngine();
  engine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });

  assert.equal(engine.getState().nodes["group-benefits"]?.visible, true);
  assert.equal(engine.getState().nodes["field-benefit-radio"]?.visible, true);

  engine.dispatch(fieldChangeEvent("field-benefit-radio", "education"));

  assert.equal(engine.getState().nodes["group-benefits"]?.visible, false);
  assert.equal(engine.getState().nodes["field-benefit-radio"]?.visible, true);
});

test("AS3-style dispatch runs capture, target, and bubble listeners with event context", () => {
  const document = createDocument();
  const section = document.steps[0]?.sections[0];
  const field = section?.fields.find((entry) => entry.id === "field-name");
  assert.ok(section);
  assert.ok(field);

  document.runtime!.formListeners.push({
    id: "listener-form-capture",
    label: "Capture checkbox changes at form",
    type: "checkboxGroup.change",
    dispatcherId: "form-test",
    dispatcherType: "form",
    useCapture: true,
    priority: 0,
    eventName: "checkboxGroup.change",
    enabled: true,
    conditions: [],
    actions: [
      {
        id: "action-form-capture",
        kind: "dispatch_event",
        config: {
          eventType: "capture.heard",
          payload: {
            targetId: { $runtime: "current.event.target.id" },
            currentTargetId: { $runtime: "current.event.currentTarget.id" },
            phase: { $runtime: "current.event.phase" },
          },
        },
        continueOnError: false,
      },
    ],
  });

  section.runtime = {
    eventSources: [],
    listeners: [
      {
        id: "listener-section-bubble-low",
        label: "Bubble low",
        type: "checkboxGroup.change",
        dispatcherId: "section-1",
        dispatcherType: "section",
        useCapture: false,
        priority: 0,
        eventName: "checkboxGroup.change",
        enabled: true,
        conditions: [],
        actions: [
          {
            id: "action-section-bubble-low",
            kind: "dispatch_event",
            config: {
              eventType: "bubble.low",
              payload: {
                currentTargetId: { $runtime: "current.event.currentTarget.id" },
                phase: { $runtime: "current.event.phase" },
              },
            },
            continueOnError: false,
          },
        ],
      },
      {
        id: "listener-section-bubble-high",
        label: "Bubble high",
        type: "checkboxGroup.change",
        dispatcherId: "section-1",
        dispatcherType: "section",
        useCapture: false,
        priority: 10,
        eventName: "checkboxGroup.change",
        enabled: true,
        conditions: [],
        actions: [
          {
            id: "action-section-bubble-high",
            kind: "dispatch_event",
            config: {
              eventType: "bubble.high",
              payload: {
                currentTargetId: { $runtime: "current.event.currentTarget.id" },
                phase: { $runtime: "current.event.phase" },
              },
            },
            continueOnError: false,
          },
        ],
      },
    ],
  };

  field.runtime = {
    eventSources: [],
    listeners: [
      {
        id: "listener-field-target",
        label: "Target checkbox change",
        type: "checkboxGroup.change",
        dispatcherId: "field-name",
        dispatcherType: "field",
        useCapture: false,
        priority: 0,
        eventName: "checkboxGroup.change",
        enabled: true,
        conditions: [],
        actions: [
          {
            id: "action-field-target",
            kind: "dispatch_event",
            config: {
              eventType: "target.heard",
              payload: {
                targetId: { $runtime: "current.event.target.id" },
                currentTargetId: { $runtime: "current.event.currentTarget.id" },
                phase: { $runtime: "current.event.phase" },
              },
            },
            continueOnError: false,
          },
        ],
      },
    ],
  };

  const engine = createRuntimeEngine();
  engine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });

  engine.dispatch({
    type: "checkboxGroup.change",
    version: "1.0",
    target: {
      runtimeId: "runtime-test",
      formId: "form-test",
      projectId: "project-test",
      nodeId: "field-name",
      nodeType: "field",
    },
    source: {
      runtimeId: "runtime-test",
      formId: "form-test",
      projectId: "project-test",
      nodeId: "field-name",
      nodeType: "field",
    },
    bubbles: true,
    payload: { fieldId: "field-name", nextValue: ["education"] },
    correlationId: "corr-checkbox",
    timestamp: "2026-05-01T12:00:30.000Z",
  });

  const heardEvents = engine
    .getTrace()
    .filter((entry) => ["capture.heard", "target.heard", "bubble.high", "bubble.low"].includes(entry.event.type));

  assert.deepEqual(
    heardEvents.map((entry) => entry.event.type),
    ["capture.heard", "target.heard", "bubble.high", "bubble.low"],
  );
  assert.deepEqual(heardEvents[0]?.event.payload, {
    targetId: "field-name",
    currentTargetId: "form-test",
    phase: "capture",
  });
  assert.deepEqual(heardEvents[1]?.event.payload, {
    targetId: "field-name",
    currentTargetId: "field-name",
    phase: "target",
  });
  assert.deepEqual(heardEvents[2]?.event.payload, {
    currentTargetId: "section-1",
    phase: "bubble",
  });
});

test("non-bubbling events do not invoke ancestor bubble listeners", () => {
  const document = createDocument();
  const section = document.steps[0]?.sections[0];
  assert.ok(section);
  section.runtime = {
    eventSources: [],
    listeners: [
      {
        id: "listener-section-bubble",
        label: "Bubble listener",
        type: "checkboxGroup.change",
        dispatcherId: "section-1",
        dispatcherType: "section",
        useCapture: false,
        priority: 0,
        eventName: "checkboxGroup.change",
        enabled: true,
        conditions: [],
        actions: [
          {
            id: "action-section-bubble",
            kind: "dispatch_event",
            config: { eventType: "bubble.should_not_fire", payload: {} },
            continueOnError: false,
          },
        ],
      },
    ],
  };

  const engine = createRuntimeEngine();
  engine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });

  engine.dispatch({
    type: "checkboxGroup.change",
    version: "1.0",
    target: {
      runtimeId: "runtime-test",
      formId: "form-test",
      projectId: "project-test",
      nodeId: "field-name",
      nodeType: "field",
    },
    source: {
      runtimeId: "runtime-test",
      formId: "form-test",
      projectId: "project-test",
      nodeId: "field-name",
      nodeType: "field",
    },
    bubbles: false,
    payload: { fieldId: "field-name", nextValue: ["education"] },
    correlationId: "corr-checkbox-no-bubble",
    timestamp: "2026-05-01T12:00:31.000Z",
  });

  assert.equal(
    engine.getTrace().some((entry) => entry.event.type === "bubble.should_not_fire"),
    false,
  );
});

test("cross-item listeners stored on a target node can listen at a shared dispatcher", () => {
  const document = createDocument();
  const section = document.steps[0]?.sections[0];
  assert.ok(section);
  section.fields.push({
    id: "field-radio",
    stableKey: "field-radio",
    label: "Benefit priority",
    helpText: null,
    semanticType: "radio",
    required: false,
    confidence: 1,
    options: [
      { value: "health", label: "Health care", orderIndex: 0, selectedByDefault: false, evidence: [] },
      { value: "education", label: "Education", orderIndex: 1, selectedByDefault: false, evidence: [] },
    ],
    validations: [],
    layoutHints: {},
    rendererHints: {},
    sourcePriority: [],
    sourceConflicts: [],
    lineage: [],
    sourceFieldIds: [],
    provenanceAnchorIds: [],
    runtime: {
      eventSources: [],
      listeners: [
        {
          id: "listener-radio-reacts-to-checkbox",
          label: "Radio reacts to checkbox",
          type: "checkboxGroup.change",
          dispatcherId: "section-1",
          dispatcherType: "section",
          eventSourceNodeId: "field-name",
          eventSourceNodeType: "field",
          eventSourceLabel: "Applicant name",
          targetNodeId: "field-radio",
          targetNodeType: "field",
          wiringMode: "cross_item",
          useCapture: false,
          priority: 0,
          eventName: "checkboxGroup.change",
          sourceNodeId: "field-radio",
          enabled: true,
          conditions: [],
          actions: [
            {
              id: "action-set-radio",
              kind: "set_field_value",
              target: { nodeId: "field-radio", nodeType: "field" },
              config: { fieldId: "field-radio", value: "education" },
              continueOnError: false,
            },
          ],
        },
      ],
    },
  });

  const engine = createRuntimeEngine();
  engine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });

  const result = engine.dispatch({
    type: "checkboxGroup.change",
    version: "1.0",
    target: {
      runtimeId: "runtime-test",
      formId: "form-test",
      projectId: "project-test",
      nodeId: "field-name",
      nodeType: "field",
    },
    source: {
      runtimeId: "runtime-test",
      formId: "form-test",
      projectId: "project-test",
      nodeId: "field-name",
      nodeType: "field",
    },
    bubbles: true,
    payload: { fieldId: "field-name", nextValue: ["education"] },
    correlationId: "corr-cross-item",
    timestamp: "2026-05-01T12:00:32.000Z",
  });

  assert.equal(result.values["field-radio"], "education");
});

test("dispatchWithReport explains matched listeners, conditions, actions, and state changes", () => {
  const document = createDocument();
  document.dispatchKey = "form.runtime-test";
  document.steps[0]!.dispatchKey = "p1.step.step-1";
  document.steps[0]!.sections[0]!.dispatchKey = "p1.section.section-1";
  const field = document.steps[0]?.sections[0]?.fields.find((entry) => entry.id === "field-name");
  assert.ok(field);
  field.dispatchKey = "p1.text.applicant-name";
  field.runtime = {
    eventSources: [],
    listeners: [
      {
        id: "listener-report-match",
        label: "Report matched listener",
        type: "field.change",
        dispatcherId: "field-name",
        dispatcherType: "field",
        useCapture: false,
        priority: 0,
        eventName: "field.change",
        enabled: true,
        conditions: [
          {
            id: "condition-report-allowed",
            label: "Allowed value",
            enabled: true,
            source: { kind: "field_value", fieldId: "field-name" },
            operator: "equals",
            expectedValue: "allowed",
          },
        ],
        actions: [
          {
            id: "action-report-allowed",
            kind: "dispatch_event",
            config: { eventType: "report.allowed", payload: { sourceKey: { $runtime: "current.source.node.key" } } },
            continueOnError: false,
          },
        ],
      },
    ],
  };

  const engine = createRuntimeEngine();
  engine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });

  const report = engine.dispatchWithReport(fieldChangeEvent("field-name", "allowed"));
  const listener = report.listeners.find((entry) => entry.listenerId === "listener-report-match");

  assert.equal(report.event.target?.nodeKey, "p1.text.applicant-name");
  assert.ok(listener);
  assert.equal(listener.matched, true);
  assert.equal(listener.conditions[0]?.passed, true);
  assert.equal(listener.conditions[0]?.actualValue, "allowed");
  assert.equal(listener.actions[0]?.status, "executed");
  assert.deepEqual(report.stateDiff.valuesChanged, ["field-name"]);
  assert.equal(
    report.emittedEvents.some((event) => event.type === "report.allowed"),
    true,
  );

  const emittedEvent = report.traceEntries.find((entry) => entry.event.type === "report.allowed");
  assert.deepEqual(emittedEvent?.event.payload, { sourceKey: "p1.text.applicant-name" });
});

test("dispatchWithReport explains skipped listeners when conditions fail", () => {
  const document = createDocument();
  const field = document.steps[0]?.sections[0]?.fields.find((entry) => entry.id === "field-name");
  assert.ok(field);
  field.runtime = {
    eventSources: [],
    listeners: [
      {
        id: "listener-report-skip",
        label: "Report skipped listener",
        type: "field.change",
        dispatcherId: "field-name",
        dispatcherType: "field",
        useCapture: false,
        priority: 0,
        eventName: "field.change",
        enabled: true,
        conditions: [
          {
            id: "condition-report-blocked",
            enabled: true,
            source: { kind: "field_value", fieldId: "field-name" },
            operator: "equals",
            expectedValue: "allowed",
          },
        ],
        actions: [
          {
            id: "action-report-blocked",
            kind: "dispatch_event",
            config: { eventType: "report.should_not_emit", payload: {} },
            continueOnError: false,
          },
        ],
      },
    ],
  };

  const engine = createRuntimeEngine();
  engine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });

  const report = engine.dispatchWithReport(fieldChangeEvent("field-name", "blocked"));
  const listener = report.listeners.find((entry) => entry.listenerId === "listener-report-skip");

  assert.ok(listener);
  assert.equal(listener.matched, false);
  assert.equal(listener.skippedReason, "conditions_failed");
  assert.equal(listener.conditions[0]?.passed, false);
  assert.equal(listener.conditions[0]?.actualValue, "blocked");
  assert.equal(listener.actions.length, 0);
  assert.equal(
    report.emittedEvents.some((event) => event.type === "report.should_not_emit"),
    false,
  );
});
