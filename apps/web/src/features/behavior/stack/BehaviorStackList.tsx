import { useState } from "react";

import type { ReactNode } from "react";

import type { AuthoringDocument, RuntimeListenerDefinition } from "@form-builder/schema";

import { actionButtonClass } from "../../../lib/ui-utils";

import { BehaviorStackRow } from "./BehaviorStackRow";
import type { BrokenRefEntry } from "./runtime-stack-helpers";
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
  /** Opens the library picker to add a behavior from library. */
  onAddFromLibrary?: () => void;
  /** Called when the user wants to save a listener to the library. */
  onSaveToLibrary?: (listenerId: string) => void;
  /** Listener id currently being edited inline; matching row renders the `composer` slot in place. */
  editingListenerId?: string | null;
  /** Composer node mounted in place of the editing row, or in place of the empty state when editingListenerId === "__new__". */
  composer?: ReactNode;
  /** Map from listener id to its broken refs array, computed by the parent. */
  brokenRefsByListenerId?: Record<string, BrokenRefEntry[]>;
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
  onAddFromLibrary,
  onSaveToLibrary,
  editingListenerId,
  composer,
  brokenRefsByListenerId,
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
        <div className="flex items-center gap-1.5">
          {onAddFromLibrary ? (
            <button
              type="button"
              className={actionButtonClass("secondary")}
              style={{ height: "1.75rem", padding: "0 0.6rem", fontSize: "0.78rem" }}
              onClick={onAddFromLibrary}
              title="Add behavior from library"
            >
              + From library
            </button>
          ) : null}
          {onAddBehavior ? (
            <button
              type="button"
              className={actionButtonClass("primary")}
              style={{ height: "1.75rem", padding: "0 0.6rem", fontSize: "0.78rem" }}
              onClick={onAddBehavior}
            >
              + Blank
            </button>
          ) : null}
        </div>
      </div>
      {listeners.length === 0 ? (
        editingListenerId === "__new__" && composer != null ? (
          composer
        ) : (
          <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-sm text-slate-600">
            No behaviors yet. Click <strong>+ Blank</strong> or <strong>+ From library</strong> to get started.
          </p>
        )
      ) : (
        <div className="space-y-1.5" role="list">
          {listeners.map((listener, index) => {
            if (listener.id === editingListenerId && composer != null) {
              return <div key={listener.id}>{composer}</div>;
            }
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
                  onSaveToLibrary={onSaveToLibrary}
                  brokenRefs={brokenRefsByListenerId?.[listener.id]}
                />
              </div>
            );
          })}
          {editingListenerId === "__new__" && composer != null ? composer : null}
        </div>
      )}
    </div>
  );
}
