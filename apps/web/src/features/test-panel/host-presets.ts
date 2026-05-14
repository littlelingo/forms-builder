export type MockHostResponseKind = "success" | "error" | "timeout" | "network-error";

export interface MockHostResponsePreset {
  id: string;
  /** Display label for the dropdown. */
  label: string;
  /** Engine handlerKey this preset is intended for. Empty string = generic (matches all handlerKeys). */
  handlerKey: string;
  /** Engine path to exercise when sent. */
  kind: MockHostResponseKind;
  /** JSON payload to send (for success/error). Ignored for timeout. */
  payload: Record<string, unknown>;
}

export const HOST_PRESETS: MockHostResponsePreset[] = [
  {
    id: "submit-success",
    label: "Submit · Success",
    handlerKey: "submit",
    kind: "success",
    payload: { ok: true, message: "Form submitted successfully." },
  },
  {
    id: "submit-error",
    label: "Submit · Error",
    handlerKey: "submit",
    kind: "error",
    payload: { ok: false, error: { code: "SUBMIT_FAILED", message: "Submit rejected by host." } },
  },
  {
    id: "prefill-success",
    label: "Prefill · Success",
    handlerKey: "prefill",
    kind: "success",
    payload: { ok: true, fields: {} },
  },
  {
    id: "prefill-error",
    label: "Prefill · Error",
    handlerKey: "prefill",
    kind: "error",
    payload: { ok: false, error: { code: "PREFILL_FAILED", message: "Prefill unavailable." } },
  },
  {
    id: "host-call-timeout",
    label: "Generic · Timeout",
    handlerKey: "",
    kind: "timeout",
    payload: {},
  },
  {
    id: "host-call-network-error",
    label: "Generic · Network error",
    handlerKey: "",
    kind: "network-error",
    payload: {
      error: { code: "NETWORK_ERROR", message: "Simulated network failure." },
      __simulatedNetworkError: true,
    },
  },
];

export function getPresetsByHandlerKey(handlerKey: string): MockHostResponsePreset[] {
  return HOST_PRESETS.filter((p) => p.handlerKey === handlerKey || p.handlerKey === "");
}

export function findPresetById(id: string): MockHostResponsePreset | null {
  return HOST_PRESETS.find((p) => p.id === id) ?? null;
}
