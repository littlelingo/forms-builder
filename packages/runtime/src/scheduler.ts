import type { BehaviorListenerTiming } from "@form-builder/schema";

/**
 * Phase 3: per-listener debounce/throttle scheduler. The engine wraps
 * listener evaluation in `schedule()` when a listener carries a non-empty
 * `timing` block. When both debounce and throttle are set, debounce wins
 * (documented in the Phase 3 RFC at docs/runtime-architecture.md).
 */
export interface ListenerScheduler {
  /**
   * Schedule a listener evaluation under the given timing block. Calls `fn`
   * when the timing rules permit.
   */
  schedule(listenerId: string, timing: BehaviorListenerTiming, fn: () => void, now?: () => number): void;
  /** Cancel any pending debounce timer and reset throttle state for the listener. */
  flush(listenerId: string): void;
  /** Drop all timers and lastRun records — called from engine.unmount(). */
  reset(): void;
}

interface ListenerSchedulerEntry {
  debounceTimer: ReturnType<typeof setTimeout> | null;
  throttleLastRun: number;
}

export function createListenerScheduler(): ListenerScheduler {
  const entries = new Map<string, ListenerSchedulerEntry>();

  const ensureEntry = (listenerId: string): ListenerSchedulerEntry => {
    let entry = entries.get(listenerId);
    if (!entry) {
      entry = { debounceTimer: null, throttleLastRun: -Infinity };
      entries.set(listenerId, entry);
    }
    return entry;
  };

  return {
    schedule(listenerId, timing, fn, now = () => Date.now()) {
      const debounceMs = typeof timing.debounce_ms === "number" && timing.debounce_ms > 0 ? timing.debounce_ms : 0;
      const throttleMs = typeof timing.throttle_ms === "number" && timing.throttle_ms > 0 ? timing.throttle_ms : 0;
      const entry = ensureEntry(listenerId);

      if (debounceMs) {
        // Debounce wins when both are set: the most-recent invocation supersedes.
        if (entry.debounceTimer) {
          clearTimeout(entry.debounceTimer);
        }
        entry.debounceTimer = setTimeout(() => {
          entry.debounceTimer = null;
          entry.throttleLastRun = now();
          fn();
        }, debounceMs);
        return;
      }

      if (throttleMs) {
        const elapsed = now() - entry.throttleLastRun;
        if (elapsed < throttleMs) {
          // Within the throttle window — drop this dispatch.
          return;
        }
        entry.throttleLastRun = now();
        fn();
        return;
      }

      // No timing — synchronous execution.
      fn();
    },

    flush(listenerId) {
      const entry = entries.get(listenerId);
      if (!entry) return;
      if (entry.debounceTimer) {
        clearTimeout(entry.debounceTimer);
        entry.debounceTimer = null;
      }
      entry.throttleLastRun = -Infinity;
    },

    reset() {
      for (const entry of entries.values()) {
        if (entry.debounceTimer) {
          clearTimeout(entry.debounceTimer);
        }
      }
      entries.clear();
    },
  };
}
