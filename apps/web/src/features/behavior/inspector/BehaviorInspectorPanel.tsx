import type { ReactNode } from "react";

import type { AuthoringDocument, RuntimeListenerDefinition } from "@form-builder/schema";

import type { BrokenRefEntry } from "../stack/runtime-stack-helpers";
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
  /** Opens the library picker to add a behavior from the library. */
  onAddFromLibrary?: () => void;
  /** Called when the user wants to save a listener to the library. */
  onSaveToLibrary?: (listenerId: string) => void;
  externalReferenceCount: number;
  editingListenerId?: string | null;
  composer?: ReactNode;
  /** When provided, shows an "Open in advanced studio" link while the inline editor is active. */
  onOpenInAdvancedStudio?: () => void;
  /** Broken refs keyed by listener id, computed by parent. */
  brokenRefsByListenerId?: Record<string, BrokenRefEntry[]>;
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
  onAddFromLibrary,
  onSaveToLibrary,
  externalReferenceCount,
  editingListenerId,
  composer,
  onOpenInAdvancedStudio,
  brokenRefsByListenerId,
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
        onAddFromLibrary={onAddFromLibrary}
        onSaveToLibrary={onSaveToLibrary}
        editingListenerId={editingListenerId}
        composer={composer}
        brokenRefsByListenerId={brokenRefsByListenerId}
      />

      {editingListenerId && onOpenInAdvancedStudio ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onOpenInAdvancedStudio}
            className="text-xs text-blue-600 underline-offset-2 hover:underline"
          >
            Open in advanced studio
          </button>
        </div>
      ) : null}

      {externalReferenceCount > 0 ? (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Used by {externalReferenceCount} behavior{externalReferenceCount === 1 ? "" : "s"} elsewhere
        </div>
      ) : null}
    </div>
  );
}
