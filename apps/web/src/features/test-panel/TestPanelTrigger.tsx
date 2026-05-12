import type { ReactElement } from "react";

import { actionButtonClass } from "../../lib/ui-utils";

import type { TestPanelSelection } from "./types";

export interface TestPanelTriggerProps {
  derive: () => TestPanelSelection;
  onOpen: (selection: TestPanelSelection) => void;
  variant?: "primary" | "secondary";
  label?: string;
}

export function TestPanelTrigger({
  derive,
  onOpen,
  variant = "secondary",
  label = "Test",
}: TestPanelTriggerProps): ReactElement {
  return (
    <button type="button" onClick={() => onOpen(derive())} className={actionButtonClass(variant)}>
      {label}
    </button>
  );
}
