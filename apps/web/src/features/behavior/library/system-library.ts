import type { BehaviorLibraryEntry } from "@form-builder/schema";

import showIf from "./system-entries/show-if.json";
import requiredIf from "./system-entries/required-if.json";
import setFromPayload from "./system-entries/set-from-payload.json";
import hostCallFire from "./system-entries/host-call-fire.json";

export const SYSTEM_LIBRARY: BehaviorLibraryEntry[] = [
  showIf as BehaviorLibraryEntry,
  requiredIf as BehaviorLibraryEntry,
  setFromPayload as BehaviorLibraryEntry,
  hostCallFire as BehaviorLibraryEntry,
];

export function getSystemEntry(id: string): BehaviorLibraryEntry | undefined {
  return SYSTEM_LIBRARY.find((entry) => entry.id === id);
}
