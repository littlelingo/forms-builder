import assert from "node:assert/strict";
import test from "node:test";

import type {
  AuthoringDocument,
  RuntimeActionDefinition,
  RuntimeEventEnvelope,
  RuntimeHostContext,
  RuntimeListenerDefinition,
} from "@form-builder/schema";

import { runtimeActionSafetyClass } from "@form-builder/schema";

import { createRuntimeEngine } from "./engine";
import { resolveRuntimeToken } from "./tokens";
import { applyTemplateTokens, stableStringify } from "./template-tokens";
import { createRuntimeDocumentIndex } from "./document-index";
import type { BehaviorExecutedEvent, BehaviorLibraryRegistry, NodeTombstoneMap } from "./types";

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

test("runtimeActionSafetyClass labels destructive and host actions correctly", () => {
  assert.equal(runtimeActionSafetyClass("submit_form"), "destructive");
  assert.equal(runtimeActionSafetyClass("host_action"), "host");
  assert.equal(runtimeActionSafetyClass("set_field_value"), "safe");
  assert.equal(runtimeActionSafetyClass("show_node"), "safe");
});

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

test("resolveNodeDescriptor returns id + dispatchKey + labelHint for live nodes", () => {
  const document = createDocument();
  const field = document.steps[0]?.sections[0]?.fields.find((entry) => entry.id === "field-name");
  assert.ok(field);
  field.dispatchKey = "p1.zip";
  field.label = "ZIP";
  const index = createRuntimeDocumentIndex(document);
  const descriptor = index.resolveNodeDescriptor("field-name");
  assert.equal(descriptor.id, "field-name");
  assert.equal(descriptor.dispatchKey, "p1.zip");
  assert.equal(descriptor.labelHint, "ZIP");
  assert.equal(descriptor.broken, undefined);
});

test("resolveNodeDescriptor marks broken when id missing from index", () => {
  const document = createDocument();
  const index = createRuntimeDocumentIndex(document);
  const descriptor = index.resolveNodeDescriptor("ghost-id");
  assert.equal(descriptor.id, "ghost-id");
  assert.equal(descriptor.broken, true);
});

test("resolveNodeDescriptor returns lastSeenLabel from tombstone map when id missing", () => {
  const document = createDocument();
  const index = createRuntimeDocumentIndex(document);
  const tombstones: NodeTombstoneMap = {
    get: (id) => (id === "deleted-1" ? { lastSeenLabel: "Old Field" } : undefined),
  };
  const descriptor = index.resolveNodeDescriptor("deleted-1", tombstones);
  assert.equal(descriptor.broken, true);
  assert.equal(descriptor.lastSeenLabel, "Old Field");
});

// ── T7 tests: NodeRef + EventRef resolution in dispatch path ──────────────────

test("listener with source: NodeRef matches events from that node id", () => {
  // Form-level listener with source: { id: "field-name" } — no legacy eventSourceNodeId.
  // A field.change event targeting field-name should cause the listener to fire.
  const document = createDocument();
  document.runtime!.formListeners.push({
    id: "listener-source-noderef",
    label: "Source NodeRef match",
    type: "field.change",
    dispatcherId: "form-test",
    dispatcherType: "form",
    useCapture: true,
    priority: 0,
    eventName: "field.change",
    source: { id: "field-name" },
    enabled: true,
    conditions: [],
    actions: [
      {
        id: "action-source-noderef",
        kind: "dispatch_event",
        config: { eventType: "noderef.matched", payload: {} },
        continueOnError: false,
      },
    ],
  });

  const engine = createRuntimeEngine();
  engine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });

  const report = engine.dispatchWithReport(fieldChangeEvent("field-name", "hello"));
  const listener = report.listeners.find((entry) => entry.listenerId === "listener-source-noderef");
  assert.ok(listener, "listener should appear in report");
  assert.equal(listener.matched, true, "listener should match when source node matches event target");
  assert.equal(
    report.emittedEvents.some((e) => e.type === "noderef.matched"),
    true,
    "action should have executed",
  );
});

test("listener with source: NodeRef does not match events from other nodes", () => {
  // Form-level listener with source: { id: "field-name" }.
  // A field.change event targeting button-next should NOT fire the listener.
  const document = createDocument();
  document.runtime!.formListeners.push({
    id: "listener-source-noderef-no-match",
    label: "Source NodeRef no match",
    type: "field.change",
    dispatcherId: "form-test",
    dispatcherType: "form",
    useCapture: true,
    priority: 0,
    eventName: "field.change",
    source: { id: "field-name" },
    enabled: true,
    conditions: [],
    actions: [
      {
        id: "action-source-noderef-no-match",
        kind: "dispatch_event",
        config: { eventType: "noderef.should_not_emit", payload: {} },
        continueOnError: false,
      },
    ],
  });

  const engine = createRuntimeEngine();
  engine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });

  const report = engine.dispatchWithReport(fieldChangeEvent("button-next", "clicked"));
  const listener = report.listeners.find((entry) => entry.listenerId === "listener-source-noderef-no-match");
  assert.ok(listener, "listener should appear in report");
  assert.equal(listener.matched, false, "listener should not match when source node does not match event target");
  assert.equal(
    report.emittedEvents.some((e) => e.type === "noderef.should_not_emit"),
    false,
    "action should not have executed",
  );
});

test("listener with target: NodeRef sets resolved descriptor on dispatch report", () => {
  // Form-level listener with target: { id: "field-name" } (which has a dispatchKey).
  // After dispatching a matching event, report.listeners[n].resolvedTarget includes dispatchKey + labelHint.
  const document = createDocument();
  const field = document.steps[0]?.sections[0]?.fields.find((entry) => entry.id === "field-name");
  assert.ok(field);
  field.dispatchKey = "p1.text.applicant-name";
  field.label = "Applicant Name";

  document.runtime!.formListeners.push({
    id: "listener-target-noderef",
    label: "Target NodeRef descriptor",
    type: "field.change",
    dispatcherId: "form-test",
    dispatcherType: "form",
    useCapture: true,
    priority: 0,
    eventName: "field.change",
    target: { id: "field-name" },
    enabled: true,
    conditions: [],
    actions: [],
  });

  const engine = createRuntimeEngine();
  engine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });

  const report = engine.dispatchWithReport(fieldChangeEvent("field-name", "Jane"));
  const listener = report.listeners.find((entry) => entry.listenerId === "listener-target-noderef");
  assert.ok(listener, "listener should appear in report");
  assert.equal(listener.matched, true);
  assert.ok(listener.resolvedTarget, "resolvedTarget should be present on the diagnostic");
  assert.equal(listener.resolvedTarget?.id, "field-name");
  assert.equal(listener.resolvedTarget?.dispatchKey, "p1.text.applicant-name");
  assert.equal(listener.resolvedTarget?.labelHint, "Applicant Name");
});

test("listener with eventRef matches the corresponding event definition by id", () => {
  // Document has runtime.formEvents containing { id: "evt-zip", type: "zipResolved" }.
  // Listener has eventRef: { id: "evt-zip" }, no legacy type/eventName type filter.
  // Dispatching an event with type "zipResolved" should match the listener.
  const document = createDocument();
  document.runtime!.formEvents.push({
    id: "evt-zip",
    type: "zipResolved",
    description: "ZIP code resolved",
  });
  document.runtime!.formListeners.push({
    id: "listener-eventref",
    label: "EventRef match",
    dispatcherId: "form-test",
    dispatcherType: "form",
    useCapture: true,
    priority: 0,
    eventName: "zipResolved",
    eventRef: { id: "evt-zip" },
    enabled: true,
    conditions: [],
    actions: [
      {
        id: "action-eventref",
        kind: "dispatch_event",
        config: { eventType: "eventref.matched", payload: {} },
        continueOnError: false,
      },
    ],
  });

  const engine = createRuntimeEngine();
  engine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });

  const zipEvent: RuntimeEventEnvelope = {
    type: "zipResolved",
    version: "1.0",
    source: {
      runtimeId: "runtime-test",
      formId: "form-test",
      projectId: "project-test",
      nodeId: "form-test",
      nodeType: "form",
    },
    payload: {},
    correlationId: "corr-zip",
    timestamp: "2026-05-01T12:00:05.000Z",
  };

  const report = engine.dispatchWithReport(zipEvent);
  const listener = report.listeners.find((entry) => entry.listenerId === "listener-eventref");
  assert.ok(listener, "listener should appear in report");
  assert.equal(listener.matched, true, "listener should match via eventRef resolution");
  assert.equal(
    report.emittedEvents.some((e) => e.type === "eventref.matched"),
    true,
    "action should have executed",
  );
});

test("listener with eventRef.id pointing to missing def is reported skipped with reason 'broken_event_ref'", () => {
  // Listener has eventRef: { id: "evt-missing" } which doesn't exist in formEvents or node eventSources.
  // dispatchWithReport should show the listener as skipped with reason "broken_event_ref".
  const document = createDocument();
  document.runtime!.formListeners.push({
    id: "listener-broken-eventref",
    label: "Broken EventRef",
    dispatcherId: "form-test",
    dispatcherType: "form",
    useCapture: true,
    priority: 0,
    eventName: "anything",
    eventRef: { id: "evt-missing" },
    enabled: true,
    conditions: [],
    actions: [
      {
        id: "action-broken-eventref",
        kind: "dispatch_event",
        config: { eventType: "broken.should_not_emit", payload: {} },
        continueOnError: false,
      },
    ],
  });

  const engine = createRuntimeEngine();
  engine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });

  const anyEvent: RuntimeEventEnvelope = {
    type: "anything",
    version: "1.0",
    source: {
      runtimeId: "runtime-test",
      formId: "form-test",
      projectId: "project-test",
      nodeId: "form-test",
      nodeType: "form",
    },
    payload: {},
    correlationId: "corr-broken",
    timestamp: "2026-05-01T12:00:06.000Z",
  };

  const report = engine.dispatchWithReport(anyEvent);
  const listener = report.listeners.find((entry) => entry.listenerId === "listener-broken-eventref");
  assert.ok(listener, "listener should appear in report");
  assert.equal(listener.matched, false);
  assert.equal(listener.skippedReason, "broken_event_ref", "should report broken_event_ref reason");
  assert.equal(
    report.emittedEvents.some((e) => e.type === "broken.should_not_emit"),
    false,
    "action should not have executed",
  );
});

test("legacy eventSourceNodeId continues to work alongside new source field", () => {
  // Listener has only eventSourceNodeId (no source: NodeRef).
  // It should still fire when the event targets that node id.
  const document = createDocument();
  document.runtime!.formListeners.push({
    id: "listener-legacy-source",
    label: "Legacy eventSourceNodeId",
    type: "field.change",
    dispatcherId: "form-test",
    dispatcherType: "form",
    useCapture: true,
    priority: 0,
    eventName: "field.change",
    eventSourceNodeId: "field-name",
    enabled: true,
    conditions: [],
    actions: [
      {
        id: "action-legacy-source",
        kind: "dispatch_event",
        config: { eventType: "legacy.matched", payload: {} },
        continueOnError: false,
      },
    ],
  });

  const engine = createRuntimeEngine();
  engine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });

  const report = engine.dispatchWithReport(fieldChangeEvent("field-name", "value"));
  const listener = report.listeners.find((entry) => entry.listenerId === "listener-legacy-source");
  assert.ok(listener, "listener should appear in report");
  assert.equal(listener.matched, true, "legacy eventSourceNodeId should still match");
  assert.equal(
    report.emittedEvents.some((e) => e.type === "legacy.matched"),
    true,
    "action should have executed",
  );
});

// ── T8: Library materialisation ──────────────────────────────────────────────

test("listener with libraryRef uses materialised template from registry", () => {
  const document = createDocument();

  // Registry entry: template with a token-bearing condition.
  const registry: BehaviorLibraryRegistry = {
    resolve(id, _revision) {
      if (id !== "lib-pattern-match") return undefined;
      return {
        id: "lib-pattern-match",
        name: "Pattern match",
        description: "Match payload value against a pattern",
        category: "validation",
        scope: "system",
        revision: 1,
        parameters: [{ key: "pattern", type: "string", label: "Pattern", required: true }],
        bindsTo: [],
        template: {
          type: "field.change",
          eventName: "field.change",
          enabled: true,
          conditions: [
            {
              id: "cond-pattern",
              enabled: true,
              source: { kind: "event_payload", path: "nextValue" },
              operator: "equals",
              expectedValue: "{{pattern}}",
            },
          ],
          actions: [
            {
              id: "action-pattern-matched",
              kind: "dispatch_event",
              config: { eventType: "library.pattern_matched", payload: {} },
              continueOnError: false,
            },
          ],
        },
      };
    },
  };

  // A listener referencing the library entry with params.
  const libraryListener: RuntimeListenerDefinition = {
    id: "listener-lib",
    label: "Library pattern match",
    type: "field.change",
    eventName: "field.change",
    enabled: true,
    conditions: [],
    actions: [],
    libraryRef: { id: "lib-pattern-match", revision: 1, params: { pattern: "12345" } },
  };
  document.runtime!.formListeners.push(libraryListener);

  const engine = createRuntimeEngine({ libraryRegistry: registry });
  engine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });

  // Dispatch matching value → should fire.
  const reportMatch = engine.dispatchWithReport(fieldChangeEvent("field-name", "12345"));
  const matchedEntry = reportMatch.listeners.find((l) => l.listenerId === "listener-lib");
  assert.ok(matchedEntry, "listener should appear in report");
  assert.equal(matchedEntry.matched, true, "listener should match when payload.value equals pattern");
  assert.equal(
    reportMatch.emittedEvents.some((e) => e.type === "library.pattern_matched"),
    true,
    "library action should have executed on match",
  );

  // Dispatch non-matching value → should not fire.
  const reportNoMatch = engine.dispatchWithReport(fieldChangeEvent("field-name", "99999"));
  const noMatchEntry = reportNoMatch.listeners.find((l) => l.listenerId === "listener-lib");
  assert.ok(noMatchEntry, "listener should appear in report for non-match");
  assert.equal(noMatchEntry.matched, false, "listener should not match when payload.value differs from pattern");
  assert.equal(
    reportNoMatch.emittedEvents.some((e) => e.type === "library.pattern_matched"),
    false,
    "library action should not execute on non-match",
  );
});

test("listener with libraryRef.detached uses listener's own shape, not the template", () => {
  const document = createDocument();

  // Registry entry whose conditions would reject "accepted".
  const registry: BehaviorLibraryRegistry = {
    resolve(_id, _revision) {
      return {
        id: "lib-strict",
        name: "Strict match",
        description: "Only fires on 'rejected'",
        category: "validation",
        scope: "system",
        revision: 1,
        parameters: [],
        bindsTo: [],
        template: {
          type: "field.change",
          eventName: "field.change",
          enabled: true,
          conditions: [
            {
              id: "cond-strict",
              enabled: true,
              source: { kind: "event_payload", path: "nextValue" },
              operator: "equals",
              expectedValue: "rejected",
            },
          ],
          actions: [
            {
              id: "action-strict",
              kind: "dispatch_event",
              config: { eventType: "library.strict_fired", payload: {} },
              continueOnError: false,
            },
          ],
        },
      };
    },
  };

  // Listener is detached — uses its own conditions (no conditions = always match on type).
  const detachedListener: RuntimeListenerDefinition = {
    id: "listener-detached",
    label: "Detached",
    type: "field.change",
    eventName: "field.change",
    enabled: true,
    conditions: [],
    actions: [
      {
        id: "action-detached-own",
        kind: "dispatch_event",
        config: { eventType: "detached.own_fired", payload: {} },
        continueOnError: false,
      },
    ],
    libraryRef: { id: "lib-strict", revision: 1, params: {}, detached: true },
  };
  document.runtime!.formListeners.push(detachedListener);

  const engine = createRuntimeEngine({ libraryRegistry: registry });
  engine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });

  // "accepted" would fail the library's template condition, but since detached = true the
  // listener's own shape (no conditions) should match.
  const report = engine.dispatchWithReport(fieldChangeEvent("field-name", "accepted"));
  const entry = report.listeners.find((l) => l.listenerId === "listener-detached");
  assert.ok(entry, "listener should appear in report");
  assert.equal(entry.matched, true, "detached listener should use its own conditions");
  assert.equal(
    report.emittedEvents.some((e) => e.type === "detached.own_fired"),
    true,
    "detached listener's own action should fire",
  );
  assert.equal(
    report.emittedEvents.some((e) => e.type === "library.strict_fired"),
    false,
    "library template action should NOT fire for detached listener",
  );
});

test("listener with libraryRef but no registry entry is reported skipped with broken_library_ref", () => {
  const document = createDocument();

  // Registry that never finds anything.
  const emptyRegistry: BehaviorLibraryRegistry = {
    resolve(_id, _revision) {
      return undefined;
    },
  };

  const missingRefListener: RuntimeListenerDefinition = {
    id: "listener-missing-lib",
    label: "Missing library ref",
    type: "field.change",
    eventName: "field.change",
    enabled: true,
    conditions: [],
    actions: [],
    libraryRef: { id: "missing-entry", revision: 1, params: {} },
  };
  document.runtime!.formListeners.push(missingRefListener);

  const engine = createRuntimeEngine({ libraryRegistry: emptyRegistry });
  engine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });

  const report = engine.dispatchWithReport(fieldChangeEvent("field-name", "any"));
  const entry = report.listeners.find((l) => l.listenerId === "listener-missing-lib");
  assert.ok(entry, "listener should appear in report");
  assert.equal(entry.matched, false, "broken libraryRef listener should not match");
  assert.equal(entry.skippedReason, "broken_library_ref", "skippedReason should be broken_library_ref");
});

test("applyTemplateTokens substitutes tokens into nested template structures", () => {
  const result = applyTemplateTokens(
    { a: "{{x}}", b: ["{{y}}", "raw"], c: { d: "{{z}}" } },
    { x: 1, y: "two", z: true },
  );
  assert.deepEqual(result, { a: 1, b: ["two", "raw"], c: { d: true } });
});

// ── Telemetry sink tests ───────────────────────────────────────────────────

test("telemetry sink receives behavior.executed for every fired listener", () => {
  const document = createDocument();
  const events: BehaviorExecutedEvent[] = [];

  // Add two form-level listeners that both fire on field.change
  document.runtime!.formListeners.push(
    {
      id: "telemetry-listener-a",
      label: "Telemetry A",
      eventName: "field.change",
      enabled: true,
      conditions: [],
      actions: [
        {
          id: "action-telem-a",
          kind: "set_field_value",
          config: { fieldId: "field-name", value: "a" },
          continueOnError: false,
        },
      ],
    },
    {
      id: "telemetry-listener-b",
      label: "Telemetry B",
      eventName: "field.change",
      enabled: true,
      conditions: [],
      actions: [
        {
          id: "action-telem-b",
          kind: "set_field_value",
          config: { fieldId: "field-name", value: "b" },
          continueOnError: false,
        },
      ],
    },
  );

  const engine = createRuntimeEngine({ telemetrySink: (e) => events.push(e) });
  engine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });

  engine.dispatch(fieldChangeEvent("field-name", "hello"));

  // Both form-level listeners should have fired → 2 telemetry events
  assert.equal(events.length, 2, "expected 2 telemetry events, one per listener");
  const listenerIds = events.map((e) => e.listenerId).sort();
  assert.deepEqual(listenerIds, ["telemetry-listener-a", "telemetry-listener-b"]);
});

test("telemetry event includes durationMs >= 0", () => {
  const document = createDocument();
  const events: BehaviorExecutedEvent[] = [];

  document.runtime!.formListeners.push({
    id: "telemetry-duration-listener",
    label: "Duration test",
    eventName: "field.change",
    enabled: true,
    conditions: [],
    actions: [
      {
        id: "action-duration",
        kind: "set_field_value",
        config: { fieldId: "field-name", value: "measured" },
        continueOnError: false,
      },
    ],
  });

  const engine = createRuntimeEngine({ telemetrySink: (e) => events.push(e) });
  engine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });

  engine.dispatch(fieldChangeEvent("field-name", "trigger"));

  assert.ok(events.length >= 1, "expected at least one telemetry event");
  const evt = events.find((e) => e.listenerId === "telemetry-duration-listener");
  assert.ok(evt, "expected telemetry event for telemetry-duration-listener");
  assert.equal(typeof evt.durationMs, "number", "durationMs should be a number");
  assert.ok(isFinite(evt.durationMs), "durationMs should be finite");
  assert.ok(evt.durationMs >= 0, "durationMs should be >= 0");
});

test("telemetry event includes error when an action throws and chain halts", () => {
  const document = createDocument();
  const events: BehaviorExecutedEvent[] = [];

  // Use a circular-reference value in config to force structuredClone to throw
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const circular: any = {};
  circular.self = circular;

  document.runtime!.formListeners.push({
    id: "telemetry-error-listener",
    label: "Error test",
    eventName: "field.change",
    enabled: true,
    conditions: [],
    actions: [
      {
        id: "action-throws",
        kind: "set_field_value",
        // circular will cause structuredClone to throw inside executeAction
        config: { fieldId: "field-name", value: circular } as Record<string, unknown>,
        continueOnError: false,
      },
    ],
  });

  const engine = createRuntimeEngine({ telemetrySink: (e) => events.push(e) });
  engine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });

  // The engine should throw because continueOnError is false
  assert.throws(() => engine.dispatch(fieldChangeEvent("field-name", "trigger")));

  // Exactly one telemetry event should have been emitted despite the throw
  const telemetryEvt = events.find((e) => e.listenerId === "telemetry-error-listener");
  assert.ok(telemetryEvt, "expected telemetry event to be emitted even on error");
  assert.ok(telemetryEvt.error, "expected error field to be set");
  assert.equal(typeof telemetryEvt.error.message, "string", "error.message should be a string");
  assert.ok(telemetryEvt.error.message.length > 0, "error.message should be non-empty");
});

test("default engine without telemetrySink does not crash", () => {
  const document = createDocument();
  const engine = createRuntimeEngine(); // no telemetrySink

  engine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });

  // Dispatching an event that fires a listener should not throw even without a sink
  assert.doesNotThrow(() => engine.dispatch(clickEvent("button-next")));
});

// ---------------------------------------------------------------------------
// resolveRuntimeToken tests
// ---------------------------------------------------------------------------

test("resolveRuntimeToken returns ok=true for valid $payload path", () => {
  const result = resolveRuntimeToken("$payload.value", { payload: { value: "hello" } });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.value, "hello");
});

test("resolveRuntimeToken returns ok=false reason=unknown_root for $bogus", () => {
  const result = resolveRuntimeToken("$bogus.x", {});
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, "unknown_root");
});

test("resolveRuntimeToken returns ok=false reason=missing_path with pathRemainder for missing nested key", () => {
  const result = resolveRuntimeToken("$payload.deep.thing", { payload: { deep: {} } });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, "missing_path");
  assert.equal(!result.ok && result.pathRemainder, "thing");
});

test("resolveRuntimeToken returns ok=false reason=phase_3_only for $response", () => {
  const result = resolveRuntimeToken("$response.foo", {});
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, "phase_3_only");
});

test("resolveRuntimeToken handles $now and $uuid roots without paths", () => {
  const now = resolveRuntimeToken("$now", {});
  assert.equal(now.ok, true);
  assert.match(String(now.ok && now.value), /\d{4}-\d{2}-\d{2}/);

  const uuid = resolveRuntimeToken("$uuid", {});
  assert.equal(uuid.ok, true);
  assert.match(String(uuid.ok && uuid.value), /[a-f0-9-]+/i);
});

// ── Regression: library cache cross-talk (#1) ─────────────────────────────────

test("two listeners with identical libraryRef+params each surface their own id and label in the dispatch report", () => {
  // Both listeners reference the same library entry with the same params.
  // Before the fix, the cache stored the full materialised listener (including envelope fields)
  // so the second listener would incorrectly report the first listener's id/label.
  const document = createDocument();

  const registry: BehaviorLibraryRegistry = {
    resolve(id, _revision) {
      if (id !== "lib-shared") return undefined;
      return {
        id: "lib-shared",
        name: "Shared pattern",
        description: "Fires on any field.change",
        category: "validation",
        scope: "system",
        revision: 1,
        parameters: [],
        bindsTo: [],
        template: {
          type: "field.change",
          eventName: "field.change",
          enabled: true,
          conditions: [],
          actions: [
            {
              id: "action-shared",
              kind: "dispatch_event",
              config: { eventType: "shared.fired", payload: {} },
              continueOnError: false,
            },
          ],
        },
      };
    },
  };

  // Two listeners: same libraryRef+params, different envelope fields.
  const listenerA: RuntimeListenerDefinition = {
    id: "listener-cache-a",
    label: "Cache Listener A",
    type: "field.change",
    eventName: "field.change",
    enabled: true,
    conditions: [],
    actions: [],
    libraryRef: { id: "lib-shared", revision: 1, params: {} },
  };
  const listenerB: RuntimeListenerDefinition = {
    id: "listener-cache-b",
    label: "Cache Listener B",
    type: "field.change",
    eventName: "field.change",
    enabled: false, // disabled — diagnostic should report its own enabled=false
    conditions: [],
    actions: [],
    libraryRef: { id: "lib-shared", revision: 1, params: {} },
  };
  document.runtime!.formListeners.push(listenerA, listenerB);

  const engine = createRuntimeEngine({ libraryRegistry: registry });
  engine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });

  const report = engine.dispatchWithReport(fieldChangeEvent("field-name", "value"));

  const diagA = report.listeners.find((l) => l.listenerId === "listener-cache-a");
  const diagB = report.listeners.find((l) => l.listenerId === "listener-cache-b");

  assert.ok(diagA, "listener-cache-a should appear in report");
  assert.ok(diagB, "listener-cache-b should appear in report");

  // Each diagnostic must carry its own envelope fields, not the other listener's.
  assert.equal(diagA.listenerId, "listener-cache-a", "diagA must have its own id");
  assert.equal(diagA.label, "Cache Listener A", "diagA must have its own label");
  assert.equal(diagA.enabled, true, "diagA must report its own enabled=true");
  assert.equal(diagA.matched, true, "diagA should match");

  assert.equal(diagB.listenerId, "listener-cache-b", "diagB must have its own id");
  assert.equal(diagB.label, "Cache Listener B", "diagB must have its own label");
  assert.equal(diagB.enabled, false, "diagB must report its own enabled=false");
  assert.equal(diagB.matched, false, "diagB should not match because it is disabled");
  assert.equal(diagB.skippedReason, "disabled", "diagB skippedReason should be 'disabled'");
});

// ── Regression: stableStringify recursive (#3) ───────────────────────────────

test("stableStringify produces identical output for nested objects regardless of key insertion order", () => {
  const a = stableStringify({ z: { b: 2, a: 1 }, a: [{ y: "y", x: "x" }] });
  const b = stableStringify({ a: [{ x: "x", y: "y" }], z: { a: 1, b: 2 } });

  assert.equal(a, b, "nested objects with different key insertion order should produce the same stable string");

  // Sanity-check: different values must NOT be equal.
  const c = stableStringify({ z: { b: 9, a: 1 }, a: [] });
  assert.notEqual(a, c, "structurally different objects should produce different strings");
});

// ── Extraction synthesis: signature.attested → submit_form ───────────────────

test("synthesised signature.attested listener triggers form.submit end-to-end", () => {
  // Mirror the shape produced by _synthesise_extraction_listeners in authoring.py.
  // The listener carries provenance="extraction" and has eventSourceNodeId pointing
  // at the signature field. Dispatching signature.attested from that field must
  // cause the engine to emit form.submit (submit status transitions to "submitting").
  const fieldId = "field-sig-attestation";

  const document: AuthoringDocument = {
    id: "form-sig-test",
    title: "Signature Attestation Form",
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
        notes: [],
      },
    },
    steps: [
      {
        id: "step-sig",
        title: "Attestation",
        description: null,
        kind: "review",
        layoutHints: {},
        sourcePageIds: [],
        provenanceAnchorIds: [],
        sections: [
          {
            id: "section-sig",
            title: "Sign here",
            description: null,
            layoutHints: {},
            lineage: [],
            sourceSectionIds: [],
            provenanceAnchorIds: [],
            fields: [
              {
                id: fieldId,
                stableKey: fieldId,
                label: "I attest that the above information is correct",
                helpText: null,
                semanticType: "signature_attestation",
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
                      id: `event-sig-attested-${fieldId}`,
                      name: "signature.attested",
                      sourceNodeId: fieldId,
                      sourceNodeType: "field",
                    },
                  ],
                  listeners: [
                    {
                      id: `ext-sig-attested-${fieldId}`,
                      label: "Submit on attestation",
                      eventName: "signature.attested",
                      eventSourceNodeId: fieldId,
                      enabled: true,
                      conditions: [],
                      actions: [
                        {
                          id: `ext-sig-attested-${fieldId}-action-0`,
                          kind: "submit_form",
                          target: { nodeId: "form-sig-test", nodeType: "form" },
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

  const engine = createRuntimeEngine();
  engine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
  });

  // Dispatch signature.attested from the signature field — mirrors what the
  // renderer would emit when the user checks the attestation checkbox.
  const result = engine.dispatch({
    type: "signature.attested",
    version: "1.0",
    source: {
      runtimeId: "runtime-test",
      formId: "form-sig-test",
      projectId: "project-test",
      nodeId: fieldId,
      nodeType: "field",
    },
    payload: { fieldId },
    correlationId: "corr-sig-attested",
    timestamp: "2026-05-01T12:00:00.000Z",
  });

  // The submit action should have fired — engine transitions to "submitting".
  assert.equal(result.submit.status, "submitting", "submit status must be 'submitting' after signature.attested");

  // Confirm form.submit was actually emitted into the trace.
  const submitEvent = engine.getTrace().findLast((entry) => entry.event.type === "form.submit");
  assert.ok(submitEvent, "form.submit must appear in the event trace");
});

test("Phase 2B: OR group matches when any child atom passes", () => {
  const document = createDocument();
  const field = document.steps[0]?.sections[0]?.fields.find((entry) => entry.id === "field-name");
  assert.ok(field);
  field.runtime = {
    eventSources: [],
    listeners: [
      {
        id: "listener-or",
        label: "Match when value is alpha or beta",
        type: "field.change",
        dispatcherId: "field-name",
        dispatcherType: "field",
        useCapture: false,
        priority: 0,
        eventName: "field.change",
        enabled: true,
        conditions: [
          {
            id: "group-or",
            kind: "group",
            enabled: true,
            operator: "OR",
            conditions: [
              {
                id: "atom-alpha",
                enabled: true,
                source: { kind: "field_value", fieldId: "field-name" },
                operator: "equals",
                expectedValue: "alpha",
              },
              {
                id: "atom-beta",
                enabled: true,
                source: { kind: "field_value", fieldId: "field-name" },
                operator: "equals",
                expectedValue: "beta",
              },
            ],
          },
        ],
        actions: [
          {
            id: "action-or",
            kind: "dispatch_event",
            config: { eventType: "or.matched", payload: {} },
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

  // Both children pass scenario? Only the second branch matters — set "beta".
  const matched = engine.dispatchWithReport(fieldChangeEvent("field-name", "beta"));
  const matchedListener = matched.listeners.find((entry) => entry.listenerId === "listener-or");
  assert.ok(matchedListener);
  assert.equal(matchedListener.matched, true);
  assert.ok(matched.emittedEvents.some((event) => event.type === "or.matched"));

  // Neither child passes — listener is skipped with conditions_failed.
  const skipped = engine.dispatchWithReport(fieldChangeEvent("field-name", "gamma"));
  const skippedListener = skipped.listeners.find((entry) => entry.listenerId === "listener-or");
  assert.ok(skippedListener);
  assert.equal(skippedListener.matched, false);
  assert.equal(skippedListener.skippedReason, "conditions_failed");
});

test("Phase 2B: NONE group matches only when every child atom fails", () => {
  const document = createDocument();
  const field = document.steps[0]?.sections[0]?.fields.find((entry) => entry.id === "field-name");
  assert.ok(field);
  field.runtime = {
    eventSources: [],
    listeners: [
      {
        id: "listener-none",
        label: "Match when value is neither alpha nor beta",
        type: "field.change",
        dispatcherId: "field-name",
        dispatcherType: "field",
        useCapture: false,
        priority: 0,
        eventName: "field.change",
        enabled: true,
        conditions: [
          {
            id: "group-none",
            kind: "group",
            enabled: true,
            operator: "NONE",
            conditions: [
              {
                id: "atom-alpha",
                enabled: true,
                source: { kind: "field_value", fieldId: "field-name" },
                operator: "equals",
                expectedValue: "alpha",
              },
              {
                id: "atom-beta",
                enabled: true,
                source: { kind: "field_value", fieldId: "field-name" },
                operator: "equals",
                expectedValue: "beta",
              },
            ],
          },
        ],
        actions: [
          {
            id: "action-none",
            kind: "dispatch_event",
            config: { eventType: "none.matched", payload: {} },
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

  // Value matches alpha — group should fail (NONE: a child passed).
  const failsAlpha = engine.dispatchWithReport(fieldChangeEvent("field-name", "alpha"));
  assert.equal(failsAlpha.listeners.find((entry) => entry.listenerId === "listener-none")?.matched, false);

  // Value matches none of the atoms — group passes.
  const matched = engine.dispatchWithReport(fieldChangeEvent("field-name", "delta"));
  assert.equal(matched.listeners.find((entry) => entry.listenerId === "listener-none")?.matched, true);
  assert.ok(matched.emittedEvents.some((event) => event.type === "none.matched"));
});

test("Phase 2B: nested AND inside OR composes correctly", () => {
  const document = createDocument();
  const field = document.steps[0]?.sections[0]?.fields.find((entry) => entry.id === "field-name");
  assert.ok(field);
  field.runtime = {
    eventSources: [],
    listeners: [
      {
        id: "listener-nested",
        label: "Match exact tag or any value with prefix",
        type: "field.change",
        dispatcherId: "field-name",
        dispatcherType: "field",
        useCapture: false,
        priority: 0,
        eventName: "field.change",
        enabled: true,
        conditions: [
          {
            id: "group-outer",
            kind: "group",
            enabled: true,
            operator: "OR",
            conditions: [
              {
                id: "atom-exact",
                enabled: true,
                source: { kind: "field_value", fieldId: "field-name" },
                operator: "equals",
                expectedValue: "exact",
              },
              {
                id: "group-prefix",
                kind: "group",
                enabled: true,
                operator: "AND",
                conditions: [
                  {
                    id: "atom-prefix-presence",
                    enabled: true,
                    source: { kind: "field_value", fieldId: "field-name" },
                    operator: "exists",
                  },
                  {
                    id: "atom-prefix-contains",
                    enabled: true,
                    source: { kind: "field_value", fieldId: "field-name" },
                    operator: "contains",
                    expectedValue: "pre-",
                  },
                ],
              },
            ],
          },
        ],
        actions: [
          {
            id: "action-nested",
            kind: "dispatch_event",
            config: { eventType: "nested.matched", payload: {} },
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

  // exact path
  assert.equal(
    engine
      .dispatchWithReport(fieldChangeEvent("field-name", "exact"))
      .listeners.find((entry) => entry.listenerId === "listener-nested")?.matched,
    true,
  );
  // prefix path (both inner atoms pass under AND)
  assert.equal(
    engine
      .dispatchWithReport(fieldChangeEvent("field-name", "pre-flight"))
      .listeners.find((entry) => entry.listenerId === "listener-nested")?.matched,
    true,
  );
  // value present but missing prefix → inner AND fails, outer OR has no other true child → skipped
  assert.equal(
    engine
      .dispatchWithReport(fieldChangeEvent("field-name", "post-flight"))
      .listeners.find((entry) => entry.listenerId === "listener-nested")?.matched,
    false,
  );
});

test("Phase 2A: project-scope event catalog resolves cross-form eventRef ids at dispatch time", () => {
  const document = createDocument();
  const field = document.steps[0]?.sections[0]?.fields.find((entry) => entry.id === "field-name");
  assert.ok(field);
  // Listener whose eventRef id is declared at project scope, not on the document.
  field.runtime = {
    eventSources: [],
    listeners: [
      {
        id: "listener-project-event",
        label: "React to a project-scope event",
        type: "project.heartbeat",
        dispatcherId: "field-name",
        dispatcherType: "field",
        useCapture: false,
        priority: 0,
        eventName: "project.heartbeat",
        eventRef: { id: "proj-evt-heartbeat" },
        enabled: true,
        conditions: [],
        actions: [
          {
            id: "action-project-event",
            kind: "dispatch_event",
            config: { eventType: "project.heartbeat.handled", payload: {} },
            continueOnError: false,
          },
        ],
      },
    ],
  };

  const buildHeartbeatEvent = (): RuntimeEventEnvelope => ({
    type: "project.heartbeat",
    version: "1.0",
    source: {
      runtimeId: "runtime-test",
      formId: "form-test",
      projectId: "project-test",
      nodeId: "field-name",
      nodeType: "field",
    },
    payload: { tick: 1 },
    correlationId: "corr-project-heartbeat",
    timestamp: "2026-05-01T12:00:02.000Z",
  });

  // Without the project catalog, eventRef is broken.
  const offEngine = createRuntimeEngine();
  offEngine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
    emitLoadEvent: false,
  });
  const offReport = offEngine.dispatchWithReport(buildHeartbeatEvent());
  const offListener = offReport.listeners.find((entry) => entry.listenerId === "listener-project-event");
  assert.ok(offListener);
  assert.equal(offListener.matched, false);
  assert.equal(offListener.skippedReason, "broken_event_ref");

  // With the project catalog, the same eventRef resolves and the listener fires.
  const onEngine = createRuntimeEngine();
  onEngine.mount(document, {
    runtimeId: "runtime-test",
    projectId: "project-test",
    hostContext: createHostContext(),
    emitLoadEvent: false,
    projectEvents: [
      {
        id: "proj-evt-heartbeat",
        type: "project.heartbeat",
        scope: "project",
        description: "Project-scope heartbeat tick",
      },
    ],
  });
  const onReport = onEngine.dispatchWithReport(buildHeartbeatEvent());
  const onListener = onReport.listeners.find((entry) => entry.listenerId === "listener-project-event");
  assert.ok(onListener);
  assert.equal(onListener.matched, true);
  assert.equal(onListener.skippedReason, undefined);
  assert.ok(
    onReport.emittedEvents.some((event) => event.type === "project.heartbeat.handled"),
    "the project-scope eventRef must drive the action chain at dispatch time",
  );
});
