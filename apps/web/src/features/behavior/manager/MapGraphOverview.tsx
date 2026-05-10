import type { AuthoringSelection } from "../../../lib/authoring-utils";
import type {
  BehaviorGraphEntryContext,
  BehaviorGraphFilter,
  BehaviorGraphMode,
  BehaviorGraphSelection,
  BehaviorStudioMode,
  BehaviorStudioView,
  LogicMapConditionalEntry,
  LogicMapListenerEntry,
  LogicMapStepEntry,
} from "../utils/runtime-helpers";
import type { InspectorTab } from "../../inspector";
import { BehaviorEdgeLabel, BehaviorGraphNode } from "../cards/BehaviorGraphNode";
import { actionButtonClass, formatLabel } from "../../../lib/ui-utils";

interface LogicMapData {
  totalConditionals: number;
  totalListeners: number;
  formListeners: LogicMapListenerEntry[];
  steps: LogicMapStepEntry[];
}

interface FocusBehaviorGraphNodeOptions {
  selection: AuthoringSelection | null;
  graphSelection?: BehaviorGraphSelection | null;
  ruleIndex?: number | null;
  filter?: BehaviorGraphFilter;
  mode?: BehaviorGraphMode;
  viewport?: "preserve" | "reset";
  entryContext?: BehaviorGraphEntryContext | null;
}

export interface MapGraphOverviewProps {
  logicMapData: LogicMapData | null;
  mapViewMode: string;
  onFocusBehaviorGraphNode: (options: FocusBehaviorGraphNodeOptions) => void;
  onSetBehaviorGraphEntryContext: (context: BehaviorGraphEntryContext | null) => void;
  onResetBehaviorGraphViewport: () => void;
  onSetInspectorTab: (tab: InspectorTab) => void;
  onSetBehaviorStudioMode: (mode: BehaviorStudioMode) => void;
  onSetBehaviorStudioView: (view: BehaviorStudioView) => void;
  onSetBehaviorStudioOpen: (open: boolean) => void;
  onSetSelectedAuthoring: (selection: AuthoringSelection | null) => void;
}

function MapRuleFlowCard({
  rule,
  mapViewMode,
  onFocusBehaviorGraphNode,
}: {
  rule: LogicMapConditionalEntry;
  mapViewMode: string;
  onFocusBehaviorGraphNode: (options: FocusBehaviorGraphNodeOptions) => void;
}) {
  return (
    <div key={rule.id} className="rounded-[1rem] border border-soft bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">State flow</p>
          <p className="mt-2 font-semibold text-slate-950">{rule.targetFieldLabel}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{rule.detail}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            onFocusBehaviorGraphNode({
              selection: rule.sourceSelection,
              graphSelection: rule.graphSelection,
              ruleIndex: rule.ruleIndex,
              filter: "state",
              mode: "focus",
              viewport: "reset",
              entryContext: {
                source: "map",
                title: "Opened from Map",
                detail: `State flow handoff from ${mapViewMode === "graph" ? "Graph overview" : "Summary list"} into the focused graph workspace.`,
              },
            });
          }}
          className={actionButtonClass()}
        >
          Open in graph
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <BehaviorGraphNode
          eyebrow="Trigger"
          title={`Watch ${rule.sourceFieldLabel}`}
          detail={`Observe ${rule.sourceFieldLabel} as the source input.`}
          tone="blue"
        />
        <BehaviorEdgeLabel label="When" />
        <BehaviorGraphNode eyebrow="Condition" title="Evaluate condition" detail={rule.detail} tone="amber" />
        <BehaviorEdgeLabel label="Then" />
        <BehaviorGraphNode
          eyebrow="Effect"
          title={`${formatLabel(rule.effectLabel)} ${rule.targetFieldLabel}`}
          detail={`Apply the ${rule.effectLabel} effect to ${rule.targetFieldLabel}.`}
          tone="emerald"
        />
      </div>
    </div>
  );
}

function MapListenerFlowCard({
  listener,
  mapViewMode,
  onFocusBehaviorGraphNode,
}: {
  listener: LogicMapListenerEntry;
  mapViewMode: string;
  onFocusBehaviorGraphNode: (options: FocusBehaviorGraphNodeOptions) => void;
}) {
  return (
    <div key={listener.id} className="rounded-[1rem] border border-soft bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{listener.scopeLabel}</p>
          <p className="mt-2 font-semibold text-slate-950">When {formatLabel(listener.eventName)}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{listener.actionsSummary}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            onFocusBehaviorGraphNode({
              selection: listener.selection,
              graphSelection: listener.graphSelection,
              filter: "interaction",
              mode: "focus",
              viewport: "reset",
              entryContext: {
                source: "map",
                title: "Opened from Map",
                detail: `Interaction flow handoff from ${mapViewMode === "graph" ? "Graph overview" : "Summary list"} into the focused graph workspace.`,
              },
            });
          }}
          className={actionButtonClass()}
        >
          Open in graph
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <BehaviorGraphNode
          eyebrow="Trigger"
          title={`When ${formatLabel(listener.eventName)}`}
          detail={`${listener.scopeLabel} listens for this event.`}
          tone="blue"
        />
        <BehaviorEdgeLabel label="Then" />
        <BehaviorGraphNode
          eyebrow="Action"
          title={`${listener.actionCount} action${listener.actionCount === 1 ? "" : "s"}`}
          detail={listener.actionsSummary}
          tone="emerald"
        />
      </div>
    </div>
  );
}

export function MapGraphOverview({
  logicMapData,
  mapViewMode,
  onFocusBehaviorGraphNode,
  onSetBehaviorGraphEntryContext,
  onResetBehaviorGraphViewport,
  onSetInspectorTab,
  onSetBehaviorStudioMode,
  onSetBehaviorStudioView,
  onSetBehaviorStudioOpen,
  onSetSelectedAuthoring,
}: MapGraphOverviewProps) {
  if (!logicMapData) {
    return (
      <div className="app-muted-card p-4 text-sm text-slate-500">
        No logic map is available until a document is loaded.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[1.15rem] border border-soft bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Graph overview</p>
            <h4 className="mt-2 text-lg font-semibold text-slate-950">Document-wide behavior graph</h4>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Scan the same trigger, condition, and effect language across the whole document, then jump into focused
              editing only when needed.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onSetBehaviorGraphEntryContext({
                source: "map",
                title: "Opened from Map",
                detail:
                  "Graph overview handed you into the behavior workspace. Choose a step, listener, or flow to continue editing.",
              });
              onResetBehaviorGraphViewport();
              onSetInspectorTab("behavior");
              onSetBehaviorStudioMode("graph");
              onSetBehaviorStudioView("advanced");
              onSetBehaviorStudioOpen(true);
            }}
            className={actionButtonClass("secondary")}
          >
            Open behavior
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="app-pill">{logicMapData.steps.length} steps</span>
          <span className="app-pill">{logicMapData.totalConditionals} conditional behavior</span>
          <span className="app-pill">{logicMapData.totalListeners} behaviors</span>
        </div>
      </div>
      <div className="rounded-[1.15rem] border border-soft bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Form runtime</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Document-level orchestration stays in the same graph language as node-level behavior.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              onFocusBehaviorGraphNode({
                selection: null,
                graphSelection: logicMapData.formListeners[0]?.graphSelection ?? null,
                filter: "interaction",
                mode: "focus",
                viewport: "reset",
                entryContext: {
                  source: "map",
                  title: "Opened from Map",
                  detail: "Form-level runtime opened from Graph overview into the focused behavior workspace.",
                },
              })
            }
            className={actionButtonClass(logicMapData.formListeners.length ? "primary" : "secondary")}
            disabled={!logicMapData.formListeners.length}
          >
            Open form behavior
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {logicMapData.formListeners.length ? (
            logicMapData.formListeners.map((listener) => (
              <MapListenerFlowCard
                key={listener.id}
                listener={listener}
                mapViewMode={mapViewMode}
                onFocusBehaviorGraphNode={onFocusBehaviorGraphNode}
              />
            ))
          ) : (
            <div className="app-muted-card p-4 text-sm text-slate-500">
              No form-level behavior yet. Use the Behavior editor when the document needs load, submit, or host-level
              orchestration.
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {logicMapData.steps.map((step) => (
          <div key={step.id} className="rounded-[1.15rem] border border-soft bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Step graph</p>
                <h4 className="mt-2 text-lg font-semibold text-slate-950">{step.title}</h4>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="app-pill">{step.sectionCount} sections</span>
                  <span className="app-pill">{step.fieldCount} fields</span>
                  <span className="app-pill">{step.conditionalBehavior.length} conditions</span>
                  <span className="app-pill">{step.runtimeListeners.length} flows</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSetSelectedAuthoring(step.selection)}
                className={actionButtonClass()}
              >
                Focus step
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="rounded-[1rem] border border-soft bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">State conditions</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  Visibility, requirement, and field-state logic read here as conditional behavior instead of summaries.
                </p>
                <div className="mt-4 space-y-3">
                  {step.conditionalBehavior.length ? (
                    step.conditionalBehavior.map((rule) => (
                      <MapRuleFlowCard
                        key={rule.id}
                        rule={rule}
                        mapViewMode={mapViewMode}
                        onFocusBehaviorGraphNode={onFocusBehaviorGraphNode}
                      />
                    ))
                  ) : (
                    <div className="app-muted-card p-4 text-sm text-slate-500">
                      No field conditional behavior in this step yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[1rem] border border-soft bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Interaction flows</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  Step, section, group, and field listeners all compress into the same trigger-to-action graph pattern.
                </p>
                <div className="mt-4 space-y-3">
                  {step.runtimeListeners.length ? (
                    step.runtimeListeners.map((listener) => (
                      <MapListenerFlowCard
                        key={listener.id}
                        listener={listener}
                        mapViewMode={mapViewMode}
                        onFocusBehaviorGraphNode={onFocusBehaviorGraphNode}
                      />
                    ))
                  ) : (
                    <div className="app-muted-card p-4 text-sm text-slate-500">
                      No interaction flows in this step yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
