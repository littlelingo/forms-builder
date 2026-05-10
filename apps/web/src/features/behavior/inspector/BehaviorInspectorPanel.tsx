import type { ReactNode } from "react";

import type { AuthoringDocument, RuntimeListenerDefinition } from "@form-builder/schema";

import { BehaviorStackList } from "../index";

export interface BehaviorInspectorPanelProps {
  document: AuthoringDocument;
  scopeListeners: RuntimeListenerDefinition[];
  selectedListenerId: string | null;
  onSelectListener: (listenerId: string) => void;
  onEditListener: (listenerId: string) => void;
  onToggleListenerEnabled: (listenerId: string, enabled: boolean) => void;
  onReorderListener: (listenerId: string, fromIndex: number, toIndex: number) => void;
  onAddBehavior: () => void;
  externalReferenceCount: number;
  editingListenerId?: string | null;
  composer?: ReactNode;
}

export function BehaviorInspectorPanel({
  document,
  scopeListeners,
  selectedListenerId,
  onSelectListener,
  onEditListener,
  onToggleListenerEnabled,
  onReorderListener,
  onAddBehavior,
  externalReferenceCount,
  editingListenerId,
  composer,
}: BehaviorInspectorPanelProps) {
  return (
    <div className="space-y-4">
      <BehaviorStackList
        listeners={scopeListeners}
        document={document}
        selectedListenerId={selectedListenerId}
        onSelectListener={onSelectListener}
        onEditListener={onEditListener}
        onToggleListenerEnabled={onToggleListenerEnabled}
        onReorderListener={onReorderListener}
        onAddBehavior={onAddBehavior}
        editingListenerId={editingListenerId}
        composer={composer}
      />

      {externalReferenceCount > 0 ? (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Used by {externalReferenceCount} behavior{externalReferenceCount === 1 ? "" : "s"} elsewhere
        </div>
      ) : null}
    </div>
  );
}
