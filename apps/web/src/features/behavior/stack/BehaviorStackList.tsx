import { useState } from "react";

import type { AuthoringDocument, RuntimeListenerDefinition } from "@form-builder/schema";

import { actionButtonClass } from "../../../lib/ui-utils";

import { BehaviorStackRow } from "./BehaviorStackRow";
import { listenerTriggerPill, summariseListener } from "./runtime-stack-helpers";

export interface BehaviorStackListProps {
  listeners: RuntimeListenerDefinition[];
  document?: AuthoringDocument;
  selectedListenerId?: string | null;
  onSelectListener?: (listenerId: string) => void;
  onEditListener: (listenerId: string) => void;
  onToggleListenerEnabled?: (listenerId: string, enabled: boolean) => void;
  onReorderListener: (listenerId: string, fromIndex: number, toIndex: number) => void;
  onAddBehavior?: () => void;
}

export function BehaviorStackList({
  listeners,
  document,
  selectedListenerId,
  onSelectListener,
  onEditListener,
  onToggleListenerEnabled,
  onReorderListener,
  onAddBehavior,
}: BehaviorStackListProps) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => (event: React.DragEvent) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", listeners[index].id);
    setDraggingIndex(index);
  };

  const handleDragOver = (index: number) => (event: React.DragEvent) => {
    if (draggingIndex === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };

  const handleDrop = (index: number) => (event: React.DragEvent) => {
    event.preventDefault();
    if (draggingIndex === null) return;
    if (draggingIndex !== index) {
      onReorderListener(listeners[draggingIndex].id, draggingIndex, index);
    }
    setDraggingIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggingIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="rounded-[1.15rem] border border-soft bg-white p-3" role="region" aria-label="Behavior stack">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs uppercase tracking-[0.16em] text-slate-500">
          Behaviors {listeners.length ? `· ${listeners.length}` : ""}
        </span>
        {onAddBehavior ? (
          <button
            type="button"
            className={actionButtonClass("primary")}
            style={{ height: "1.75rem", padding: "0 0.6rem", fontSize: "0.78rem" }}
            onClick={onAddBehavior}
          >
            + Add behavior
          </button>
        ) : null}
      </div>
      {listeners.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-sm text-slate-600">
          No behaviors yet. Click <strong>+ Add behavior</strong> to get started.
        </p>
      ) : (
        <div className="space-y-1.5" role="list">
          {listeners.map((listener, index) => {
            const isDragging = draggingIndex === index;
            const isDropTarget = dragOverIndex === index && draggingIndex !== index;
            const wrapperClass = [
              isDragging ? "opacity-50" : "",
              isDropTarget ? "outline outline-2 outline-blue-300" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <div
                key={listener.id}
                draggable
                onDragStart={handleDragStart(index)}
                onDragOver={handleDragOver(index)}
                onDrop={handleDrop(index)}
                onDragEnd={handleDragEnd}
                className={wrapperClass}
              >
                <BehaviorStackRow
                  listener={listener}
                  triggerLabel={listenerTriggerPill(listener, document)}
                  summary={summariseListener(listener)}
                  isSelected={listener.id === selectedListenerId}
                  onSelect={onSelectListener}
                  onEdit={onEditListener}
                  onToggleEnabled={onToggleListenerEnabled}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
