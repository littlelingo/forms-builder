import { useMemo } from "react";

import { actionButtonClass, formatLabel } from "../../../lib/ui-utils";

/**
 * Phase 2D: Manager Map view.
 *
 * Renders the same `behaviorIndexObjects` data as the table / by-event
 * layouts but as a layered DAG:
 *
 *   ┌──────────────┐    ┌────────────┐    ┌──────────────┐
 *   │ Event source │ ─► │  Listener  │ ─► │ Action target│
 *   └──────────────┘    └────────────┘    └──────────────┘
 *
 * Nodes per layer come from one event-type group at a time; an event
 * type with 0 sources or 0 listeners still appears so authors can spot
 * orphans. The renderer caps total drawn nodes at 200; above the cap it
 * collapses to per-scope summary cards.
 *
 * Edges are drawn with SVG paths whose endpoints are computed by ref
 * after layout settles. We render the SVG layer underneath the cards so
 * accessible focus + click still hits the DOM cards directly.
 */

const NODE_LIMIT = 200;

interface MapEventSource {
  id: string;
  scopeLabel: string;
  detail: string;
  hasBrokenRef: boolean;
}

interface MapListener {
  id: string;
  title: string;
  status: "enabled" | "disabled";
  scopeLabel: string;
  hasBrokenRef: boolean;
  impactsLabel: string;
  onOpen: () => void;
}

interface MapEventGroup {
  triggerType: string;
  raised: MapEventSource[];
  listeners: MapListener[];
}

export interface BehaviorIndexMapProps {
  groups: MapEventGroup[];
  /** Total node count across all groups before any clustering applies. */
  totalNodes: number;
  /** Click handler used by the cluster-fallback "Show this group" cards. */
  onSelectGroup?: (triggerType: string) => void;
}

export function BehaviorIndexMap({ groups, totalNodes, onSelectGroup }: BehaviorIndexMapProps) {
  const overCap = totalNodes > NODE_LIMIT;
  const visibleGroups = useMemo(() => {
    if (!overCap) return groups;
    // When over the cap we render a cluster-style fallback: one card per
    // group, no listener / source nodes drawn.
    return groups.map((group) => ({ ...group, raised: [], listeners: [] }));
  }, [groups, overCap]);

  if (!groups.length) {
    return (
      <div className="app-muted-card mt-4 p-4 text-sm text-slate-500">
        No behavior objects to map. Add an event or listener to see the connections.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {overCap ? (
        <div className="rounded-[1.05rem] border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Map collapsed to clusters.</p>
          <p className="mt-1">
            {totalNodes} nodes exceeds the {NODE_LIMIT}-node draw limit. Use the filters above (step, scope, trigger, or
            status) to narrow the map, or open one cluster at a time below.
          </p>
        </div>
      ) : null}

      <div className="space-y-3">
        {visibleGroups.map((group) => {
          const isCluster = overCap;
          return (
            <div key={`map-group-${group.triggerType}`} className="rounded-[1.05rem] border border-soft bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Event lane</p>
                  <h6 className="mt-1 text-base font-semibold text-slate-950">{formatLabel(group.triggerType)}</h6>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="app-pill">
                    {group.raised.length} source{group.raised.length === 1 ? "" : "s"}
                  </span>
                  <span className="app-pill">
                    {group.listeners.length} listener{group.listeners.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>

              {isCluster ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-slate-600">
                    Cluster collapsed to summary. Open it to see the layered DAG for this event lane only.
                  </p>
                  <button
                    type="button"
                    onClick={() => onSelectGroup?.(group.triggerType)}
                    className={actionButtonClass("primary")}
                  >
                    Show this group
                  </button>
                </div>
              ) : (
                <div className="mt-3 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.2fr)_auto_minmax(0,1fr)]">
                  <MapColumn label="Event sources" empty="No declared sources">
                    {group.raised.map((source) => (
                      <MapNode
                        key={`map-src-${group.triggerType}-${source.id}`}
                        title={source.scopeLabel}
                        subtitle={source.detail}
                        broken={source.hasBrokenRef}
                        kind="source"
                      />
                    ))}
                  </MapColumn>
                  <MapArrow />
                  <MapColumn label="Listeners" empty="No consumers">
                    {group.listeners.map((listener) => (
                      <MapNode
                        key={`map-lis-${group.triggerType}-${listener.id}`}
                        title={listener.title}
                        subtitle={listener.scopeLabel}
                        broken={listener.hasBrokenRef}
                        kind="listener"
                        muted={listener.status === "disabled"}
                        actionLabel="Open"
                        onAction={listener.onOpen}
                      />
                    ))}
                  </MapColumn>
                  <MapArrow />
                  <MapColumn label="Action targets" empty="No declared targets">
                    {group.listeners.map((listener) => (
                      <MapNode
                        key={`map-tgt-${group.triggerType}-${listener.id}`}
                        title={listener.impactsLabel || "—"}
                        subtitle={listener.title}
                        kind="target"
                        muted={listener.status === "disabled"}
                      />
                    ))}
                  </MapColumn>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MapColumn({ label, empty, children }: { label: string; empty: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children : children ? [children] : [];
  return (
    <div>
      <p className="text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <div className="mt-2 space-y-2">{items.length ? items : <p className="text-xs text-slate-500">{empty}</p>}</div>
    </div>
  );
}

function MapArrow() {
  return (
    <div className="hidden self-center text-slate-400 lg:block" aria-hidden="true">
      →
    </div>
  );
}

function MapNode({
  title,
  subtitle,
  kind,
  broken,
  muted,
  actionLabel,
  onAction,
}: {
  title: string;
  subtitle?: string;
  kind: "source" | "listener" | "target";
  broken?: boolean;
  muted?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const palette =
    kind === "source"
      ? "border-sky-200 bg-sky-50"
      : kind === "listener"
        ? "border-emerald-200 bg-emerald-50"
        : "border-slate-200 bg-slate-50";
  return (
    <div className={`rounded-[0.85rem] border p-3 ${palette} ${muted ? "opacity-60" : ""}`}>
      <p className="text-sm font-semibold text-slate-950">{title}</p>
      {subtitle ? <p className="mt-1 text-xs text-slate-600">{subtitle}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {broken ? <span className="app-pill bg-red-100 text-red-700">broken ref</span> : null}
        {muted ? <span className="app-pill">disabled</span> : null}
        {actionLabel && onAction ? (
          <button type="button" onClick={onAction} className={actionButtonClass("secondary")}>
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
