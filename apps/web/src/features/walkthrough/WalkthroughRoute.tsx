import { useCallback, useEffect, useMemo, useState } from "react";

import { createRuntimeEngine } from "@form-builder/runtime";
import type {
  AuthoringDocument,
  AuthoringField,
  AuthoringSection,
  AuthoringStep,
  RuntimeEventEnvelope,
  RuntimeNodeState,
  RuntimeSessionState,
} from "@form-builder/schema";

import { createMockHostBridge } from "./host-bridge-mock";
import { WalkthroughHeader } from "./WalkthroughHeader";

export interface WalkthroughRouteProps {
  document: AuthoringDocument | null;
  onExit: () => void;
}

type RuntimeEngineHandle = ReturnType<typeof createRuntimeEngine>;

const RUNTIME_ID = "walkthrough";

/**
 * Full-canvas hosted-user-style preview. Mounts a fresh runtime engine
 * against the supplied authoring document and lets the author step through
 * the form like an end-user would, with a mock host bridge handling
 * `form.submit` envelopes (no real network calls — see
 * `host-bridge-mock.ts`).
 *
 * The implementation is deliberately self-contained: it does not reuse
 * the authoring `PreviewCanvas`, which is wired to drag/drop,
 * inspector selection, and a render-prop pipeline for behavior toolbars.
 * Walkthrough only needs a clean step renderer plus runtime dispatch.
 */
export function WalkthroughRoute({ document, onExit }: WalkthroughRouteProps) {
  const [engine, setEngine] = useState<RuntimeEngineHandle | null>(null);
  const [sessionState, setSessionState] = useState<RuntimeSessionState | null>(null);
  const [restartTick, setRestartTick] = useState(0);
  const [submitToast, setSubmitToast] = useState<string | null>(null);

  // Mount/unmount engine when document changes or on restart.
  useEffect(() => {
    if (!document) {
      onExit();
      return;
    }
    const next = createRuntimeEngine();
    const initial = next.mount(document, { runtimeId: RUNTIME_ID });
    setEngine(next);
    setSessionState(initial);
    setSubmitToast(null);
    return () => {
      next.unmount();
    };
  }, [document, restartTick, onExit]);

  // Subscribe to engine events: catch form.submit and surface a toast via
  // the mock host bridge. Keep state in sync after every emission so that
  // the rendered UI reflects engine-driven updates (visibility, validation,
  // step transitions performed by listener-driven actions, etc.).
  useEffect(() => {
    if (!engine) return;
    const bridge = createMockHostBridge();
    const unsubscribe = engine.subscribe((envelope) => {
      if (envelope.type === "form.submit") {
        const result = bridge.onSubmit(envelope);
        setSubmitToast(`Form submit received at ${result.receivedAt}`);
      }
      setSessionState(engine.getState());
    });
    return unsubscribe;
  }, [engine]);

  const totalSteps = document?.steps.length ?? 0;
  const currentStepId = sessionState?.currentStepId ?? null;
  const currentStepIndex = useMemo(() => {
    if (!document || !currentStepId) return 0;
    const idx = document.steps.findIndex((step) => step.id === currentStepId);
    return idx === -1 ? 0 : idx;
  }, [document, currentStepId]);
  const currentStep: AuthoringStep | null = document?.steps[currentStepIndex] ?? null;

  const dispatchFieldChange = useCallback(
    (field: AuthoringField, nextValue: unknown) => {
      if (!engine || !document) return;
      const target: NonNullable<RuntimeEventEnvelope["target"]> = {
        runtimeId: RUNTIME_ID,
        formId: document.id,
        projectId: null,
        nodeId: field.id,
        nodeKey: field.dispatchKey ?? null,
        nodeType: "field",
      };
      const envelope: RuntimeEventEnvelope = {
        type: "field.change",
        version: "1.0",
        target,
        source: target,
        bubbles: true,
        payload: {
          fieldId: field.id,
          nextValue,
          componentType: field.semanticType,
        },
        correlationId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      };
      engine.dispatch(envelope);
      setSessionState(engine.getState());
    },
    [engine, document],
  );

  const goPrevious = useCallback(() => {
    if (!engine) return;
    engine.invoke({
      id: "walkthrough_previous_step",
      kind: "go_to_previous_step",
      config: {},
      continueOnError: false,
    });
    setSessionState(engine.getState());
  }, [engine]);

  const goNext = useCallback(() => {
    if (!engine) return;
    const isLast = currentStepIndex >= totalSteps - 1;
    engine.invoke({
      id: isLast ? "walkthrough_submit" : "walkthrough_next_step",
      kind: isLast ? "submit_form" : "go_to_next_step",
      config: {},
      continueOnError: false,
    });
    setSessionState(engine.getState());
  }, [engine, currentStepIndex, totalSteps]);

  const handleRestart = useCallback(() => {
    setRestartTick((t) => t + 1);
  }, []);

  if (!document) return null;

  const headerLabel = currentStep?.title ?? "";
  const isLastStep = currentStepIndex >= totalSteps - 1;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <WalkthroughHeader
        currentStepLabel={headerLabel}
        currentStepIndex={currentStepIndex}
        totalSteps={totalSteps}
        onExit={onExit}
        onRestart={handleRestart}
      />
      <main className="flex-1 overflow-auto px-6 py-8">
        <div className="mx-auto max-w-3xl space-y-6">
          {currentStep ? (
            <WalkthroughStep step={currentStep} sessionState={sessionState} onFieldChange={dispatchFieldChange} />
          ) : (
            <div className="rounded-2xl border border-soft bg-white p-8 text-center text-sm text-slate-500">
              This form has no steps yet.
            </div>
          )}
          <nav
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-soft bg-white px-5 py-4 shadow-sm"
            aria-label="Walkthrough navigation"
          >
            <button
              type="button"
              onClick={goPrevious}
              disabled={currentStepIndex <= 0}
              className="rounded-full border border-slate-200 bg-slate-100 px-4 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-xs uppercase tracking-[0.16em] text-slate-500">
              Step {currentStepIndex + 1} of {totalSteps || 1}
            </span>
            <button
              type="button"
              onClick={goNext}
              disabled={totalSteps === 0}
              className="rounded-full bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLastStep ? "Submit" : "Continue"}
            </button>
          </nav>
        </div>
      </main>
      {submitToast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 flex items-center gap-3 rounded-xl bg-emerald-600 px-4 py-3 text-sm text-white shadow-lg"
        >
          <span>{submitToast}</span>
          <button
            type="button"
            onClick={() => setSubmitToast(null)}
            className="rounded-full border border-white/40 px-2 py-0.5 text-xs font-medium text-white/90 transition hover:bg-white/10"
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  );
}

interface WalkthroughStepProps {
  step: AuthoringStep;
  sessionState: RuntimeSessionState | null;
  onFieldChange: (field: AuthoringField, nextValue: unknown) => void;
}

function WalkthroughStep({ step, sessionState, onFieldChange }: WalkthroughStepProps) {
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Step</p>
        <h1 className="text-2xl font-semibold text-slate-950">{step.title}</h1>
        {step.description ? <p className="text-sm leading-6 text-slate-600">{step.description}</p> : null}
      </header>
      {step.sections.length ? (
        step.sections.map((section) => (
          <WalkthroughSection
            key={section.id}
            section={section}
            sessionState={sessionState}
            onFieldChange={onFieldChange}
          />
        ))
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-6 text-sm text-slate-500">
          This step has no sections.
        </div>
      )}
    </section>
  );
}

interface WalkthroughSectionProps {
  section: AuthoringSection;
  sessionState: RuntimeSessionState | null;
  onFieldChange: (field: AuthoringField, nextValue: unknown) => void;
}

function WalkthroughSection({ section, sessionState, onFieldChange }: WalkthroughSectionProps) {
  return (
    <article className="rounded-2xl border border-soft bg-white p-5 shadow-sm">
      <header className="mb-4 space-y-1">
        <h2 className="text-lg font-semibold text-slate-950">{section.title}</h2>
        {section.description ? <p className="text-sm leading-6 text-slate-600">{section.description}</p> : null}
      </header>
      <div className="space-y-4">
        {section.groups.map((group) => {
          // Skip group label/description when the group has a single child field whose label
          // matches the group label (case-insensitive trim) — common authoring shape where the
          // group exists only to wrap one labelled checkbox/radio. Avoids visible duplicate titles.
          const onlyChild = group.fields.length === 1 ? group.fields[0] : null;
          const groupLabelNorm = (group.label ?? "").trim().toLowerCase();
          const onlyChildLabelNorm = (onlyChild?.label ?? "").trim().toLowerCase();
          const hideGroupHeader =
            onlyChild !== null && groupLabelNorm.length > 0 && groupLabelNorm === onlyChildLabelNorm;
          return (
            <div key={group.id} className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              {hideGroupHeader ? null : (
                <div>
                  <p className="text-sm font-semibold text-slate-900">{group.label}</p>
                  {group.description ? <p className="text-xs leading-5 text-slate-600">{group.description}</p> : null}
                </div>
              )}
              <div className="space-y-3">
                {group.fields.map((field) => (
                  <WalkthroughField
                    key={field.id}
                    field={field}
                    sessionState={sessionState}
                    onFieldChange={onFieldChange}
                  />
                ))}
              </div>
            </div>
          );
        })}
        {section.fields.map((field) => (
          <WalkthroughField key={field.id} field={field} sessionState={sessionState} onFieldChange={onFieldChange} />
        ))}
      </div>
    </article>
  );
}

interface WalkthroughFieldProps {
  field: AuthoringField;
  sessionState: RuntimeSessionState | null;
  onFieldChange: (field: AuthoringField, nextValue: unknown) => void;
}

function nodeState(sessionState: RuntimeSessionState | null, fieldId: string): RuntimeNodeState | null {
  return sessionState?.nodes?.[fieldId] ?? null;
}

function fieldValue(sessionState: RuntimeSessionState | null, fieldId: string): unknown {
  return sessionState?.values?.[fieldId];
}

function WalkthroughField({ field, sessionState, onFieldChange }: WalkthroughFieldProps) {
  const state = nodeState(sessionState, field.id);
  const value = fieldValue(sessionState, field.id);
  const isVisible = state?.visible ?? true;
  const isEnabled = state?.enabled ?? true;
  const isRequired = state?.required ?? field.required;

  if (!isVisible) return null;

  if (field.semanticType === "statement") {
    return (
      <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm leading-6 text-slate-700">
        {field.label}
      </div>
    );
  }

  if (field.rendererHints.component === "button") {
    return (
      <button
        type="button"
        disabled={!isEnabled}
        className="rounded-full bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {field.label}
      </button>
    );
  }

  const labelNode = (
    <div className="flex items-center gap-2">
      <label className="text-sm font-semibold text-slate-900" htmlFor={`walkthrough-${field.id}`}>
        {field.label}
      </label>
      {isRequired ? <span className="text-xs font-semibold uppercase text-rose-600">Required</span> : null}
    </div>
  );

  if (field.semanticType === "radio" || field.semanticType === "checkbox") {
    const isCheckbox = field.semanticType === "checkbox";
    const selected = Array.isArray(value) ? value.map(String) : [];
    return (
      <fieldset className="space-y-2">
        <legend className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
          {field.label}
          {isRequired ? <span className="text-xs font-semibold uppercase text-rose-600">Required</span> : null}
        </legend>
        {field.options.length ? (
          field.options.map((option) => {
            const checked = isCheckbox ? selected.includes(option.value) : String(value ?? "") === option.value;
            return (
              <label
                key={option.value}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm ${
                  checked ? "border-blue-300 bg-blue-50" : "border-soft bg-white"
                } ${!isEnabled ? "opacity-60" : ""}`}
              >
                <input
                  type={isCheckbox ? "checkbox" : "radio"}
                  name={`walkthrough-${field.id}`}
                  checked={checked}
                  value={option.value}
                  disabled={!isEnabled}
                  onChange={(event) => {
                    if (isCheckbox) {
                      const next = event.target.checked
                        ? [...selected, option.value]
                        : selected.filter((entry) => entry !== option.value);
                      onFieldChange(field, next);
                    } else {
                      onFieldChange(field, event.target.value);
                    }
                  }}
                  className="h-4 w-4"
                />
                <span className="text-slate-700">{option.label}</span>
              </label>
            );
          })
        ) : (
          <label className="flex items-center gap-3 rounded-xl border border-soft bg-white px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(value)}
              disabled={!isEnabled}
              onChange={(event) => onFieldChange(field, event.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-slate-700">{field.label}</span>
          </label>
        )}
      </fieldset>
    );
  }

  if (field.semanticType === "select") {
    return (
      <div className="space-y-2">
        {labelNode}
        <select
          id={`walkthrough-${field.id}`}
          value={typeof value === "string" ? value : ""}
          disabled={!isEnabled}
          onChange={(event) => onFieldChange(field, event.target.value)}
          className="w-full rounded-xl border border-soft bg-white px-3 py-2 text-sm text-slate-700"
        >
          <option value="">{field.options.length ? "Choose an option" : "No options"}</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Default: text-style input.
  return (
    <div className="space-y-2">
      {labelNode}
      <input
        id={`walkthrough-${field.id}`}
        type="text"
        value={typeof value === "string" ? value : value == null ? "" : String(value)}
        disabled={!isEnabled}
        onChange={(event) => onFieldChange(field, event.target.value)}
        className="w-full rounded-xl border border-soft bg-white px-3 py-2 text-sm text-slate-700"
      />
      {field.helpText ? <p className="text-xs text-slate-500">{field.helpText}</p> : null}
    </div>
  );
}
