import type { AuthoringDocument, AuthoringField, AuthoringSection, AuthoringStep } from "@form-builder/schema";

/**
 * Best-Next-1 fixture — covers the behavior dispatch patterns the manual
 * regression suite needs to exercise without mutating real project data:
 *
 *  - capture-phase form listener
 *  - target-phase listener on the dispatching node
 *  - bubble-phase form listener (default useCapture=false)
 *  - non-bubbling dispatch (event.bubbles === false; only the exact dispatcher listener fires)
 *  - checkbox-group event with `payload.checked` set by the dispatcher
 *  - host-action payload reference (`$payload.value` resolved into host action config at dispatch)
 *
 * The fixture is intentionally self-contained and small. Tests in
 * `behavior-patterns.test.ts` and any persistence round-trip checks should
 * build a fresh copy via `createBehaviorPatternsFixture()` to avoid shared
 * mutation across cases.
 */

function buildField(partial: Partial<AuthoringField> & { id: string; label: string }): AuthoringField {
  return {
    id: partial.id,
    stableKey: partial.stableKey ?? partial.id,
    label: partial.label,
    helpText: partial.helpText ?? null,
    semanticType: partial.semanticType ?? "text",
    required: partial.required ?? false,
    confidence: partial.confidence ?? 1,
    options: partial.options ?? [],
    validations: partial.validations ?? [],
    layoutHints: partial.layoutHints ?? {},
    rendererHints: partial.rendererHints ?? {},
    sourcePriority: partial.sourcePriority ?? [],
    sourceConflicts: partial.sourceConflicts ?? [],
    lineage: partial.lineage ?? [],
    sourceFieldIds: partial.sourceFieldIds ?? [],
    provenanceAnchorIds: partial.provenanceAnchorIds ?? [],
    runtime: partial.runtime ?? null,
  };
}

function buildSection(partial: Partial<AuthoringSection> & { id: string; title: string }): AuthoringSection {
  return {
    id: partial.id,
    title: partial.title,
    description: partial.description ?? null,
    layoutHints: partial.layoutHints ?? {},
    lineage: partial.lineage ?? [],
    sourceSectionIds: partial.sourceSectionIds ?? [],
    provenanceAnchorIds: partial.provenanceAnchorIds ?? [],
    fields: partial.fields ?? [],
    groups: partial.groups ?? [],
    runtime: partial.runtime ?? null,
  };
}

function buildStep(partial: Partial<AuthoringStep> & { id: string; title: string }): AuthoringStep {
  return {
    id: partial.id,
    title: partial.title,
    description: partial.description ?? null,
    kind: partial.kind ?? "collect",
    layoutHints: partial.layoutHints ?? {},
    sourcePageIds: partial.sourcePageIds ?? [],
    provenanceAnchorIds: partial.provenanceAnchorIds ?? [],
    sections: partial.sections ?? [],
    runtime: partial.runtime ?? null,
  };
}

export function createBehaviorPatternsFixture(): AuthoringDocument {
  const bubbleButton = buildField({
    id: "btn-bubble",
    label: "Bubble button",
    rendererHints: { component: "button" },
    runtime: {
      eventSources: [
        {
          id: "evt-button-tap",
          name: "button.tap",
          type: "button.tap",
          sourceNodeId: "btn-bubble",
          sourceNodeType: "component",
          bubbles: true,
          description: "Tapped (bubbles)",
        },
      ],
      listeners: [
        {
          id: "lst-target-bubble-button",
          label: "Target-phase listener on the bubble button",
          eventName: "button.tap",
          enabled: true,
          conditions: [],
          actions: [
            {
              id: "act-target-bubble",
              kind: "set_field_value",
              target: { nodeId: "echo-target", nodeType: "field" },
              config: { value: "target-phase" },
              continueOnError: false,
            },
          ],
        },
      ],
    },
  });

  const silentButton = buildField({
    id: "btn-silent",
    label: "Non-bubbling button",
    rendererHints: { component: "button" },
    runtime: {
      eventSources: [
        {
          id: "evt-button-silent",
          name: "button.silent",
          type: "button.silent",
          sourceNodeId: "btn-silent",
          sourceNodeType: "component",
          bubbles: false,
          description: "Tapped (non-bubbling)",
        },
      ],
      listeners: [
        {
          id: "lst-target-silent",
          label: "Target-phase listener on the silent button",
          eventName: "button.silent",
          enabled: true,
          conditions: [],
          actions: [
            {
              id: "act-target-silent",
              kind: "set_field_value",
              target: { nodeId: "echo-silent", nodeType: "field" },
              config: { value: "silent-target" },
              continueOnError: false,
            },
          ],
        },
      ],
    },
  });

  const checkboxGroup = buildField({
    id: "chk-prefs",
    label: "Preferences",
    semanticType: "checkbox",
    options: [
      { value: "a", label: "Option A", orderIndex: 0, selectedByDefault: false, evidence: [] },
      { value: "b", label: "Option B", orderIndex: 1, selectedByDefault: false, evidence: [] },
    ],
    rendererHints: { component: "checkbox_group" },
    runtime: {
      eventSources: [
        {
          id: "evt-checkbox-toggle",
          name: "checkbox.toggle",
          type: "checkbox.toggle",
          sourceNodeId: "chk-prefs",
          sourceNodeType: "field",
          bubbles: true,
          description: "Toggled (carries payload.checked)",
        },
      ],
      listeners: [
        {
          id: "lst-checkbox-toggle",
          label: "Mirror checkbox toggle to echo field",
          eventName: "checkbox.toggle",
          enabled: true,
          conditions: [],
          actions: [
            {
              id: "act-host-payload-ref",
              kind: "host_action",
              target: { nodeId: "chk-prefs", nodeType: "field" },
              config: {
                handlerKey: "analytics.track",
                payload: {
                  value: { $runtime: "current.event.payload.checked" },
                  source: { $runtime: "current.event.payload.optionId" },
                },
              },
              continueOnError: false,
            },
          ],
        },
      ],
    },
  });

  const echoTarget = buildField({ id: "echo-target", label: "Echo target" });
  const echoSilent = buildField({ id: "echo-silent", label: "Echo silent" });
  const echoBubble = buildField({ id: "echo-bubble", label: "Echo bubble" });
  const echoCapture = buildField({ id: "echo-capture", label: "Echo capture" });

  return {
    id: "fixture-behavior-patterns",
    title: "Behavior Patterns Fixture",
    documentClass: "mixed",
    reviewStatus: "accepted",
    targetRuntime: "va_web_form",
    visualBaseline: "va.gov",
    sourcePriority: [],
    sourceConflicts: [],
    metadata: {
      fixture: "behavior-patterns",
      coverage: "capture,target,bubble,non-bubble,checkbox-group,host-payload-ref",
    },
    runtime: {
      version: "1.0",
      formEvents: [],
      formListeners: [
        {
          id: "lst-capture-bubble-button",
          label: "Capture-phase listener (fires before target)",
          eventName: "button.tap",
          enabled: true,
          useCapture: true,
          conditions: [],
          actions: [
            {
              id: "act-capture-set",
              kind: "set_field_value",
              target: { nodeId: "echo-capture", nodeType: "field" },
              config: { value: "capture-phase" },
              continueOnError: false,
            },
          ],
        },
        {
          id: "lst-bubble-form",
          label: "Bubble-phase form listener (fires after target)",
          eventName: "button.tap",
          enabled: true,
          conditions: [],
          actions: [
            {
              id: "act-bubble-set",
              kind: "set_field_value",
              target: { nodeId: "echo-bubble", nodeType: "field" },
              config: { value: "bubble-phase" },
              continueOnError: false,
            },
          ],
        },
      ],
      hostBindings: [],
      submitEventName: "form.submit",
      sessionStateShape: {
        mode: "key_value",
        fields: [],
        example: null,
        notes: ["Behavior patterns fixture"],
      },
    },
    steps: [
      buildStep({
        id: "step-patterns",
        title: "Behavior patterns",
        sections: [
          buildSection({
            id: "sec-patterns",
            title: "Patterns",
            fields: [bubbleButton, silentButton, checkboxGroup, echoTarget, echoSilent, echoBubble, echoCapture],
          }),
        ],
      }),
    ],
  };
}
