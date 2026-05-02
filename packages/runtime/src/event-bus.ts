import type { RuntimeEventEnvelope } from "@form-builder/schema";

import type { RuntimeEventHandler } from "./types";

export class RuntimeEventBus {
  private readonly handlers = new Set<RuntimeEventHandler>();

  subscribe(handler: RuntimeEventHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  emit(event: RuntimeEventEnvelope): void {
    for (const handler of this.handlers) {
      handler(event);
    }
  }
}
