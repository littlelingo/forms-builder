import { useEffect, useRef } from "react";
import { actionButtonClass, iconButtonClass } from "./ui-utils";

export type ConfirmDialogState = {
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
};

export function ConfirmDialog({ state, onClose }: { state: ConfirmDialogState; onClose: () => void }) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    cancelRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  const confirmLabel = state.confirmLabel ?? "Confirm";
  const cancelLabel = state.cancelLabel ?? "Cancel";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="relative flex w-full max-w-[26rem] flex-col overflow-hidden rounded-[1.15rem] border border-slate-200 bg-[#f5f7fb] shadow-[0_24px_64px_rgba(15,23,42,0.24)]"
      >
        <div className="shrink-0 border-b border-slate-200 bg-white/96 px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {state.destructive ? "Confirm delete" : "Confirm"}
              </p>
              <h3 id="confirm-dialog-title" className="mt-0.5 text-lg font-semibold text-slate-950">
                {state.title}
              </h3>
            </div>
            <button type="button" aria-label={cancelLabel} onClick={onClose} className={iconButtonClass()}>
              ×
            </button>
          </div>
        </div>
        <div className="space-y-3 px-4 py-4">
          <p className="text-sm text-slate-700">{state.message}</p>
          {state.detail ? (
            <div
              className={
                state.destructive
                  ? "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                  : "rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              }
            >
              {state.detail}
            </div>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button ref={cancelRef} type="button" onClick={onClose} className={actionButtonClass("secondary")}>
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              state.onConfirm();
              onClose();
            }}
            className={actionButtonClass(state.destructive ? "danger" : "primary")}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
