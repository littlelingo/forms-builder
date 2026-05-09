import type { RuntimeActionDefinition, RuntimeActionKind, RuntimeListenerDefinition } from "@form-builder/schema";

import type {
  RuntimeEventSourceCandidate,
  RuntimePayloadReferenceKey,
  RuntimePayloadReferenceOption,
  RuntimeReactionBooleanValue,
  RuntimeReactionNavigationValue,
  RuntimeReactionTargetOption,
  RuntimeReactionValueMode,
} from "../utils/runtime-helpers";
import {
  formatRuntimeSourceCandidateLabel,
  isRuntimePayloadReference,
  runtimeNodeTypeLabel,
  sanitizeRuntimeIdentifier,
} from "../utils/runtime-helpers";

// ---------------------------------------------------------------------------
// BooleanReactionPropertyRow
// ---------------------------------------------------------------------------

export interface BooleanReactionPropertyRowProps {
  listener: RuntimeListenerDefinition;
  target: RuntimeEventSourceCandidate;
  propertyKey: string;
  label: string;
  description: string;
  trueLabel: string;
  falseLabel: string;
  trueKind: RuntimeActionKind;
  falseKind: RuntimeActionKind;
  booleanReactionValue: (
    listener: RuntimeListenerDefinition,
    targetId: string,
    trueKind: RuntimeActionKind,
    falseKind: RuntimeActionKind,
  ) => RuntimeReactionBooleanValue | "conflict";
  booleanReactionActions: (
    listener: RuntimeListenerDefinition,
    targetId: string,
    trueKind: RuntimeActionKind,
    falseKind: RuntimeActionKind,
  ) => RuntimeActionDefinition[];
  onSetBooleanReactionProperty: (
    listenerId: string,
    target: RuntimeEventSourceCandidate,
    trueKind: RuntimeActionKind,
    falseKind: RuntimeActionKind,
    value: RuntimeReactionBooleanValue,
    label: string,
  ) => void;
}

export function BooleanReactionPropertyRow(props: BooleanReactionPropertyRowProps) {
  const {
    listener,
    target,
    propertyKey,
    label,
    description,
    trueLabel,
    falseLabel,
    trueKind,
    falseKind,
    booleanReactionValue,
    booleanReactionActions,
    onSetBooleanReactionProperty,
  } = props;
  const value = booleanReactionValue(listener, target.id, trueKind, falseKind);
  const matches = booleanReactionActions(listener, target.id, trueKind, falseKind);
  const selectId = `${sanitizeRuntimeIdentifier(listener.id, "listener")}-${sanitizeRuntimeIdentifier(
    target.id,
    "target",
  )}-${propertyKey}`;
  return (
    <div className="grid gap-2 border-b border-slate-200 px-3 py-2.5 last:border-b-0 sm:grid-cols-[minmax(8rem,13rem)_minmax(0,1fr)] sm:items-center">
      <div className="min-w-0">
        <label htmlFor={selectId} title={description} className="text-sm font-medium text-slate-950">
          {label}
        </label>
        {value === "conflict" ? (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
            {matches.length} actions currently set this property. Choose one value to resolve.
          </p>
        ) : null}
      </div>
      <select
        id={selectId}
        value={value}
        onChange={(event) =>
          onSetBooleanReactionProperty(
            listener.id,
            target,
            trueKind,
            falseKind,
            event.target.value as RuntimeReactionBooleanValue,
            label,
          )
        }
        className="w-full rounded-lg border border-soft bg-white px-3 py-2 text-sm font-medium text-slate-900"
      >
        {value === "conflict" ? (
          <option value="conflict" disabled>
            Conflict
          </option>
        ) : null}
        <option value="unset">No change</option>
        <option value="true">{trueLabel}</option>
        <option value="false">{falseLabel}</option>
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ValueReactionPropertyRow
// ---------------------------------------------------------------------------

export interface ValueReactionPropertyRowProps {
  listener: RuntimeListenerDefinition;
  target: RuntimeEventSourceCandidate;
  valueReactionMode: (listener: RuntimeListenerDefinition, targetId: string) => RuntimeReactionValueMode | "conflict";
  valueReactionActions: (listener: RuntimeListenerDefinition, targetId: string) => RuntimeActionDefinition[];
  listenerPayloadReferenceOptions: (listener: RuntimeListenerDefinition) => RuntimePayloadReferenceOption[];
  onSetValueReactionMode: (
    listenerId: string,
    target: RuntimeEventSourceCandidate,
    mode: RuntimeReactionValueMode,
  ) => void;
  onUpdateValueReactionStatic: (listenerId: string, target: RuntimeEventSourceCandidate, value: string) => void;
  onUpdateValueReactionPayload: (
    listenerId: string,
    target: RuntimeEventSourceCandidate,
    referenceKey: RuntimePayloadReferenceKey,
  ) => void;
}

export function ValueReactionPropertyRow(props: ValueReactionPropertyRowProps) {
  const {
    listener,
    target,
    valueReactionMode,
    valueReactionActions,
    listenerPayloadReferenceOptions,
    onSetValueReactionMode,
    onUpdateValueReactionStatic,
    onUpdateValueReactionPayload,
  } = props;
  if (target.nodeType !== "field") {
    return null;
  }
  const mode = valueReactionMode(listener, target.id);
  const matches = valueReactionActions(listener, target.id);
  const setAction = matches.find((action) => action.kind === "set_field_value");
  const runtimeValueReference = isRuntimePayloadReference(setAction?.config.value)
    ? setAction.config.value.$runtime
    : null;
  const payloadOptions = listenerPayloadReferenceOptions(listener);
  const valueRowId = `${sanitizeRuntimeIdentifier(listener.id, "listener")}-${sanitizeRuntimeIdentifier(
    target.id,
    "target",
  )}-value`;
  const valueDetailId = `${valueRowId}-detail`;
  return (
    <div className="border-b border-slate-200 px-3 py-2.5 last:border-b-0">
      <div className="grid gap-2 sm:grid-cols-[minmax(8rem,13rem)_minmax(0,1fr)] sm:items-center">
        <div className="min-w-0">
          <label htmlFor={valueRowId} className="text-sm font-semibold text-slate-950">
            Value
          </label>
          <span id={valueDetailId} className="sr-only">
            Set, clear, or populate this field from the source event payload.
          </span>
          {mode === "conflict" ? (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
              {matches.length} actions currently set or clear this value. Choose one mode to resolve.
            </p>
          ) : null}
        </div>
        <select
          id={valueRowId}
          aria-describedby={valueDetailId}
          value={mode}
          onChange={(event) =>
            onSetValueReactionMode(listener.id, target, event.target.value as RuntimeReactionValueMode)
          }
          className="w-full rounded-lg border border-soft bg-white px-3 py-2 text-sm font-medium text-slate-900"
        >
          {mode === "conflict" ? (
            <option value="conflict" disabled>
              Conflict
            </option>
          ) : null}
          <option value="unset">No change</option>
          <option value="static">Set static value</option>
          <option value="payload">Use event payload</option>
          <option value="clear">Clear value</option>
        </select>
      </div>
      {mode === "static" ? (
        <label className="mt-2 grid gap-2 text-sm text-slate-950 sm:grid-cols-[minmax(8rem,13rem)_minmax(0,1fr)] sm:items-center">
          <span className="font-medium">Text</span>
          <input
            value={String(setAction?.config.value ?? "")}
            onChange={(event) => onUpdateValueReactionStatic(listener.id, target, event.target.value)}
            className="w-full rounded-lg border border-soft bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-900"
          />
        </label>
      ) : null}
      {mode === "payload" ? (
        <label className="mt-2 grid gap-2 text-sm text-slate-950 sm:grid-cols-[minmax(8rem,13rem)_minmax(0,1fr)] sm:items-center">
          <span className="font-medium">From event</span>
          <select
            value={runtimeValueReference ?? payloadOptions[0]?.key ?? "current.event.payload.value"}
            onChange={(event) =>
              onUpdateValueReactionPayload(listener.id, target, event.target.value as RuntimePayloadReferenceKey)
            }
            className="w-full rounded-lg border border-soft bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-900"
          >
            {payloadOptions.map((option) => (
              <option key={`reaction-payload-${option.key}`} value={option.key}>
                {option.label}
              </option>
            ))}
            {runtimeValueReference && !payloadOptions.some((option) => option.key === runtimeValueReference) ? (
              <option value={runtimeValueReference}>{runtimeValueReference}</option>
            ) : null}
          </select>
        </label>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NavigationReactionPropertyRow
// ---------------------------------------------------------------------------

export interface NavigationReactionPropertyRowProps {
  listener: RuntimeListenerDefinition;
  target: RuntimeEventSourceCandidate;
  builderStepOptions: Array<{ id: string; optionLabel: string }>;
  navigationReactionValue: (
    listener: RuntimeListenerDefinition,
    targetId: string,
  ) => RuntimeReactionNavigationValue | "conflict";
  navigationReactionActions: (listener: RuntimeListenerDefinition, targetId: string) => RuntimeActionDefinition[];
  onSetNavigationReaction: (
    listenerId: string,
    target: RuntimeEventSourceCandidate,
    value: RuntimeReactionNavigationValue,
  ) => void;
  onUpdateNavigationStep: (listenerId: string, target: RuntimeEventSourceCandidate, stepId: string) => void;
}

export function NavigationReactionPropertyRow(props: NavigationReactionPropertyRowProps) {
  const {
    listener,
    target,
    builderStepOptions,
    navigationReactionValue,
    navigationReactionActions,
    onSetNavigationReaction,
    onUpdateNavigationStep,
  } = props;
  if (target.nodeType !== "component") {
    return null;
  }
  const value = navigationReactionValue(listener, target.id);
  const matches = navigationReactionActions(listener, target.id);
  const navigationAction = matches.length === 1 ? matches[0] : null;
  const selectId = `${sanitizeRuntimeIdentifier(listener.id, "listener")}-${sanitizeRuntimeIdentifier(
    target.id,
    "target",
  )}-navigation`;
  return (
    <div className="border-b border-slate-200 px-3 py-2.5 last:border-b-0">
      <div className="grid gap-2 sm:grid-cols-[minmax(8rem,13rem)_minmax(0,1fr)] sm:items-center">
        <div className="min-w-0">
          <label htmlFor={selectId} className="text-sm font-semibold text-slate-950">
            Navigation
          </label>
          {value === "conflict" ? (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
              {matches.length} navigation actions target this component. Choose one value to resolve.
            </p>
          ) : null}
        </div>
        <select
          id={selectId}
          value={value}
          onChange={(event) =>
            onSetNavigationReaction(listener.id, target, event.target.value as RuntimeReactionNavigationValue)
          }
          className="w-full rounded-lg border border-soft bg-white px-3 py-2 text-sm font-medium text-slate-900"
        >
          {value === "conflict" ? (
            <option value="conflict" disabled>
              Conflict
            </option>
          ) : null}
          <option value="unset">No change</option>
          <option value="go_to_next_step">Go to next step</option>
          <option value="go_to_previous_step">Go to previous step</option>
          <option value="go_to_step">Go to specific step</option>
          <option value="submit_form">Submit form</option>
        </select>
      </div>
      {value === "go_to_step" ? (
        <label className="mt-2 grid gap-2 text-sm text-slate-950 sm:grid-cols-[minmax(8rem,13rem)_minmax(0,1fr)] sm:items-center">
          <span className="font-medium">Step</span>
          <select
            value={String(navigationAction?.config.stepId ?? builderStepOptions[0]?.id ?? "")}
            onChange={(event) => onUpdateNavigationStep(listener.id, target, event.target.value)}
            className="w-full rounded-lg border border-soft bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-900"
          >
            {builderStepOptions.map((option) => (
              <option key={`reaction-step-${option.id}`} value={option.id}>
                {option.optionLabel}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RuntimeReactionProperties
// ---------------------------------------------------------------------------

export interface RuntimeReactionPropertiesProps {
  listener: RuntimeListenerDefinition;
  target: RuntimeEventSourceCandidate | null;
  reactionTargetSearch: string;
  builderStepOptions: Array<{ id: string; optionLabel: string }>;
  runtimeReactionTargetOptions: (
    listener: RuntimeListenerDefinition,
    target: RuntimeEventSourceCandidate,
  ) => RuntimeReactionTargetOption[];
  runtimeNodeTypeIsContainer: (nodeType: RuntimeEventSourceCandidate["nodeType"]) => boolean;
  booleanReactionValue: BooleanReactionPropertyRowProps["booleanReactionValue"];
  booleanReactionActions: BooleanReactionPropertyRowProps["booleanReactionActions"];
  valueReactionMode: ValueReactionPropertyRowProps["valueReactionMode"];
  valueReactionActions: ValueReactionPropertyRowProps["valueReactionActions"];
  listenerPayloadReferenceOptions: ValueReactionPropertyRowProps["listenerPayloadReferenceOptions"];
  navigationReactionValue: NavigationReactionPropertyRowProps["navigationReactionValue"];
  navigationReactionActions: NavigationReactionPropertyRowProps["navigationReactionActions"];
  onUpdateReactionTarget: (listenerId: string, targetId: string) => void;
  onSetReactionTargetSearch: (value: string) => void;
  onSetBooleanReactionProperty: BooleanReactionPropertyRowProps["onSetBooleanReactionProperty"];
  onSetValueReactionMode: ValueReactionPropertyRowProps["onSetValueReactionMode"];
  onUpdateValueReactionStatic: ValueReactionPropertyRowProps["onUpdateValueReactionStatic"];
  onUpdateValueReactionPayload: ValueReactionPropertyRowProps["onUpdateValueReactionPayload"];
  onSetNavigationReaction: NavigationReactionPropertyRowProps["onSetNavigationReaction"];
  onUpdateNavigationStep: NavigationReactionPropertyRowProps["onUpdateNavigationStep"];
}

export function RuntimeReactionProperties(props: RuntimeReactionPropertiesProps) {
  const {
    listener,
    target,
    reactionTargetSearch,
    builderStepOptions,
    runtimeReactionTargetOptions,
    runtimeNodeTypeIsContainer,
    booleanReactionValue,
    booleanReactionActions,
    valueReactionMode,
    valueReactionActions,
    listenerPayloadReferenceOptions,
    navigationReactionValue,
    navigationReactionActions,
    onUpdateReactionTarget,
    onSetReactionTargetSearch,
    onSetBooleanReactionProperty,
    onSetValueReactionMode,
    onUpdateValueReactionStatic,
    onUpdateValueReactionPayload,
    onSetNavigationReaction,
    onUpdateNavigationStep,
  } = props;

  if (!target) {
    return (
      <div className="app-muted-card p-4 text-sm text-slate-500">
        Select a reaction target before setting listener properties.
      </div>
    );
  }
  const targetOptions = runtimeReactionTargetOptions(listener, target);
  const pathOptions = targetOptions.filter((option) => option.group === "path");
  const containerPathOptions = pathOptions.filter((option) => runtimeNodeTypeIsContainer(option.candidate.nodeType));
  const currentPathOptions = pathOptions.filter((option) => !runtimeNodeTypeIsContainer(option.candidate.nodeType));
  const allOptions = targetOptions.filter((option) => option.group === "all");
  const targetTypeLabel = runtimeNodeTypeLabel(target.nodeType);

  const booleanRowSharedProps = {
    booleanReactionValue,
    booleanReactionActions,
    onSetBooleanReactionProperty,
  };

  return (
    <div className="rounded-[0.95rem] border border-soft bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Property inspector</p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            Apply listener reactions to the current item, a parent/container, or another matching node.
          </p>
        </div>
        <span className="app-pill">{listener.actions.length} saved actions</span>
      </div>

      <div className="mt-4 grid gap-3 rounded-[0.8rem] border border-slate-200 bg-slate-50 p-3 md:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)]">
        <label className="text-xs uppercase tracking-[0.16em] text-slate-500">
          Apply changes to
          <select
            value={target.id}
            onChange={(event) => onUpdateReactionTarget(listener.id, event.target.value)}
            className="mt-1 w-full rounded-xl border border-soft bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-900"
          >
            {currentPathOptions.length ? (
              <optgroup label="Current item">
                {currentPathOptions.map((option) => (
                  <option key={`reaction-current-target-${option.candidate.id}`} value={option.candidate.id}>
                    {option.relationshipLabel} · {formatRuntimeSourceCandidateLabel(option.candidate)}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {containerPathOptions.length ? (
              <optgroup label="Parent / container targets">
                {containerPathOptions.map((option) => (
                  <option key={`reaction-container-target-${option.candidate.id}`} value={option.candidate.id}>
                    {option.relationshipLabel} · {formatRuntimeSourceCandidateLabel(option.candidate)}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {allOptions.length ? (
              <optgroup label="Other matching nodes">
                {allOptions.map((option) => (
                  <option key={`reaction-all-target-${option.candidate.id}`} value={option.candidate.id}>
                    {option.relationshipLabel} · {formatRuntimeSourceCandidateLabel(option.candidate)}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>
        <label className="text-xs uppercase tracking-[0.16em] text-slate-500">
          Search all nodes
          <input
            type="search"
            value={reactionTargetSearch}
            onChange={(event) => onSetReactionTargetSearch(event.target.value)}
            placeholder="section, group, field..."
            className="mt-1 w-full rounded-xl border border-soft bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-900"
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-700">
        <span className="app-pill">
          Targeting {targetTypeLabel.toLowerCase()} · {target.label}
        </span>
        {runtimeNodeTypeIsContainer(target.nodeType) ? (
          <span className="app-pill">Container target</span>
        ) : (
          <span className="app-pill">Item target</span>
        )}
      </div>

      <div className="mt-3 overflow-hidden rounded-[0.8rem] border border-slate-200 bg-white">
        {target.nodeType !== "form" ? (
          <BooleanReactionPropertyRow
            listener={listener}
            target={target}
            propertyKey="visible"
            label="Visible"
            description="Controls whether this target appears in the runtime view."
            trueLabel="Visible"
            falseLabel="Hidden"
            trueKind="show_node"
            falseKind="hide_node"
            {...booleanRowSharedProps}
          />
        ) : null}
        {target.nodeType !== "form" ? (
          <BooleanReactionPropertyRow
            listener={listener}
            target={target}
            propertyKey="enabled"
            label="Enabled"
            description="Controls whether this target can be used or edited."
            trueLabel="Enabled"
            falseLabel="Disabled"
            trueKind="enable_node"
            falseKind="disable_node"
            {...booleanRowSharedProps}
          />
        ) : null}
        {target.nodeType === "field" ? (
          <BooleanReactionPropertyRow
            listener={listener}
            target={target}
            propertyKey="required"
            label="Required"
            description="Controls whether this field must be answered before submit."
            trueLabel="Required"
            falseLabel="Optional"
            trueKind="mark_required"
            falseKind="mark_optional"
            {...booleanRowSharedProps}
          />
        ) : null}
        <ValueReactionPropertyRow
          listener={listener}
          target={target}
          valueReactionMode={valueReactionMode}
          valueReactionActions={valueReactionActions}
          listenerPayloadReferenceOptions={listenerPayloadReferenceOptions}
          onSetValueReactionMode={onSetValueReactionMode}
          onUpdateValueReactionStatic={onUpdateValueReactionStatic}
          onUpdateValueReactionPayload={onUpdateValueReactionPayload}
        />
        <NavigationReactionPropertyRow
          listener={listener}
          target={target}
          builderStepOptions={builderStepOptions}
          navigationReactionValue={navigationReactionValue}
          navigationReactionActions={navigationReactionActions}
          onSetNavigationReaction={onSetNavigationReaction}
          onUpdateNavigationStep={onUpdateNavigationStep}
        />
      </div>
    </div>
  );
}
