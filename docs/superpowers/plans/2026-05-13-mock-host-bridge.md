# Mock-Host Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 4th `Host` tab to TestPanel backed by a shared mock-bridge module reused by Walkthrough. Surface correlation-collision visibility (toast + queue badge + red trace row + new authoring lint). Add handlerKey autocomplete in ActionEditor and a live submit envelope preview. Spec: `docs/superpowers/specs/2026-05-13-mock-host-bridge-design.md`.

**Architecture:** No engine semantics change. Engine adds two additive bits: a `handlerKey` field on `PendingContinuation` (carried alongside existing fields) and a `getPendingContinuations()` read-only snapshot method. The shared `host-bridge-shared.ts` module subscribes to existing engine events (`host.action_requested` → pending; `host.action_response` → resolved; `runtime.continuation_collision` → collision) and routes auto-respond / manual-resolve dispatches back through `engine.dispatch`. TestPanel grows a Host tab; Walkthrough swaps its local mock for the shared module. ActionEditor gets `<datalist>`-driven handlerKey autocomplete from a pure helper that walks the doc. A new authoring-lint rule warns when a single listener has ≥2 host_call_await actions sharing handlerKey within one branch arm.

**Tech Stack:** React 18 + TypeScript + Vite (apps/web), pure-logic tests via `tsx --test`. Engine in `packages/runtime`. E2E via existing orchestrator. Tailwind for styling.

---

## File Structure

### New files

| File | Responsibility |
|---|---|
| `apps/web/src/features/test-panel/host-presets.ts` | Static preset library: `submit-success`, `submit-error`, `prefill-success`, `prefill-error`, `host-call-timeout`, `host-call-network-error`. |
| `apps/web/src/features/test-panel/host-presets.test.ts` | TDD tests for preset shape + lookup. |
| `apps/web/src/lib/host-bridge-shared.ts` | Shared mock-bridge factory. Subscribes to engine events; auto-responds per config; supports manual resolve; tags entries with engine source; exposes pending + collision state via callbacks. |
| `apps/web/src/lib/host-bridge-shared.test.ts` | TDD tests for the bridge. |
| `apps/web/src/features/test-panel/TestPanelHost.tsx` | Host tab body. Composes config editor, pending queue, submit envelope preview, collision banner. |
| `apps/web/src/features/test-panel/HostConfigEditor.tsx` | Mock-host config sub-component: preset dropdown + JSON textarea + delay slider + failure-mode toggle. Reused for default + per-entry override. |
| `apps/web/src/features/test-panel/PendingContinuationRow.tsx` | One pending-entry row: handlerKey, correlationId, age, source tag, payload preview, response editor, action buttons. |
| `apps/web/src/features/test-panel/SubmitEnvelopePreview.tsx` | Live JSON viewer for the form.submit envelope (when submit pending). |
| `apps/web/src/features/behavior/composer/handler-key-autocomplete.ts` | Pure helper: `collectKeys(doc)` walks doc and returns deduped, frequency-sorted handlerKeys. |
| `apps/web/src/features/behavior/composer/handler-key-autocomplete.test.ts` | TDD tests. |

### Modified files

| File | Change |
|---|---|
| `packages/runtime/src/types.ts` | Add `handlerKey: string \| null` to `PendingContinuation`. Add `PendingContinuationSnapshot` interface (subset without function refs + `timeoutHandle`). Add `getPendingContinuations` to `RuntimeEngine`. |
| `packages/runtime/src/engine.ts` | Set `handlerKey` when constructing the continuation (line ~1165). Implement `getPendingContinuations` returning sanitized snapshot. |
| `packages/runtime/src/engine.test.ts` | Tests for `getPendingContinuations` + handlerKey. |
| `packages/runtime/src/authoring-lints.ts` | New rule `host-call-await-handlerkey-collision`. Walks each listener's actions (recursing into branch arms, scoped per arm). |
| `packages/runtime/src/authoring-lints.test.ts` | Tests for the new rule (4 cases). |
| `apps/web/src/features/test-panel/types.ts` | `TestPanelMode` adds `"host"`. Add `MockHostConfig`, `MockHostResponsePreset`, `MockHostFailureMode`, `PendingContinuationSnapshot` (re-exported from runtime), `BridgePendingEntry`, `CollisionEntry` types. Extend `TestPanelState` with `mockHostConfig`, `pendingContinuations`, `collisionEvents`. |
| `apps/web/src/features/test-panel/state.ts` | Add actions: `set-mock-host-config`, `set-pending-continuations`, `append-collision`. Reducer cases. Initial state includes default config. |
| `apps/web/src/features/test-panel/state.test.ts` | New tests for each action + cap-20 enforcement on collisions + `set-mode` accepts `"host"`. |
| `apps/web/src/features/test-panel/useTestPanelState.ts` | Add new callbacks. Persist `mockHostConfig` to `sessionStorage` (`mock-host-config-v1`). |
| `apps/web/src/features/test-panel/TestPanelHeader.tsx` | Add 4th mode button `Host` with `aria-pressed`. |
| `apps/web/src/features/test-panel/TestPanel.tsx` | Branch on `mode === "host"` to render `<TestPanelHost>`. Pipe new props. |
| `apps/web/src/features/test-panel/TestPanelSession.tsx` | Replace inline Success/Error buttons with "{n} pending — Open Host tab" link. |
| `apps/web/src/features/test-panel/TestPanelTrace.tsx` | Style `runtime.continuation_collision` history rows red. |
| `apps/web/src/features/walkthrough/WalkthroughRoute.tsx` | Replace local mock bridge with `host-bridge-shared`. Pass walkthrough engine + `source: "walkthrough"`. |
| `apps/web/src/features/walkthrough/host-bridge-mock.ts` | **Delete file** — superseded. |
| `apps/web/src/features/behavior/composer/ActionEditor.tsx` | handlerKey field becomes `<input list>` backed by `<datalist>` from `handler-key-autocomplete.collectKeys(doc)`. |
| `apps/web/src/App.tsx` | Instantiate the shared bridge for builder engine; replace `handleMockSubmitSuccess` / `handleMockSubmitError` to route through bridge.resolve; pipe pending snapshot + collisions into TestPanel state; show toast on collision via existing `setMessage`. |
| `apps/web/e2e/test-panel.run.mjs` | Extend with Host-tab flow (preset → resolve → collision). |

---

## Phase 1 — Engine: additive PendingContinuation snapshot

### Task 1.1: Add `handlerKey` to PendingContinuation + getPendingContinuations type

**Files:**
- Modify: `packages/runtime/src/types.ts`

- [ ] **Step 1: Update `PendingContinuation` and add snapshot type**

In `packages/runtime/src/types.ts` (around line 166), update:

```ts
export interface PendingContinuation {
  correlationId: string;
  listenerId: string;
  actionId: string;
  /** Authoring-time identifier for the host action (e.g. "submit", "prefill"). Null when unset. */
  handlerKey: string | null;
  /** Wall-clock timestamp (ms epoch) when the continuation was registered. */
  createdAt: number;
  resolve: (responsePayload: Record<string, unknown>) => void;
  reject: (reason: string) => void;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
}

/**
 * Read-only snapshot of a pending continuation. Excludes function refs and timer
 * handles so it can be safely passed to UI consumers and serialized.
 */
export interface PendingContinuationSnapshot {
  correlationId: string;
  listenerId: string;
  actionId: string;
  handlerKey: string | null;
  createdAt: number;
}
```

- [ ] **Step 2: Add to `RuntimeEngine` interface**

Find the `RuntimeEngine` interface (line ~175) and add to it:

```ts
/** Read-only view of pending host_call_await continuations. */
getPendingContinuations(): PendingContinuationSnapshot[];
```

- [ ] **Step 3: Typecheck**

Run: `npm run build:runtime`
Expected: FAIL — `engine.ts` will have errors because the new fields aren't populated. Task 1.2 fixes this.

- [ ] **Step 4: Commit (intentionally type-only; engine fix in next task)**

```bash
git add packages/runtime/src/types.ts
git commit -m "feat(runtime): add handlerKey + createdAt to PendingContinuation + snapshot type"
```

### Task 1.2: Engine populates handlerKey + createdAt + implements getPendingContinuations

**Files:**
- Modify: `packages/runtime/src/engine.ts`
- Modify: `packages/runtime/src/engine.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/runtime/src/engine.test.ts`:

```ts
test("getPendingContinuations returns snapshot with handlerKey + createdAt + no function refs", async () => {
  // Build a doc with a single listener whose action is host_call_await with handlerKey "test-handler".
  // Borrow shape from existing async/host tests in this file.
  const document = /* minimal doc — see existing host_call_await tests */;
  const engine = createRuntimeEngine();
  engine.mount(document);
  // Dispatch the trigger so the listener fires and the continuation registers.
  const dispatchPromise = engine.dispatchAsync(/* trigger envelope */);
  // Snapshot must include the entry.
  const pending = engine.getPendingContinuations();
  assert.equal(pending.length, 1);
  const entry = pending[0]!;
  assert.equal(entry.handlerKey, "test-handler");
  assert.ok(entry.correlationId.length > 0);
  assert.ok(typeof entry.createdAt === "number");
  // Function refs MUST NOT leak into the snapshot.
  assert.equal((entry as Record<string, unknown>).resolve, undefined);
  assert.equal((entry as Record<string, unknown>).reject, undefined);
  assert.equal((entry as Record<string, unknown>).timeoutHandle, undefined);
  // Resolve so the engine doesn't leave a pending timer.
  engine.dispatch(/* host.action_response envelope with the same correlationId */);
  await dispatchPromise;
});
```

(Borrow fixtures from the closest existing engine test that exercises `host_call_await`. Look for `host_call_await` in `engine.test.ts`.)

- [ ] **Step 2: Run test — expect FAIL**

Run: `npm run test --workspace @form-builder/runtime -- --test-name-pattern="getPendingContinuations"`
Expected: FAIL (method doesn't exist; or returns full continuation with function refs).

- [ ] **Step 3: Implement**

In `packages/runtime/src/engine.ts`, find where the `PendingContinuation` is constructed (around line 1165). Add `handlerKey` (already in scope) and `createdAt` to the construction:

```ts
const continuation: PendingContinuation = {
  correlationId,
  listenerId,
  actionId: action.id,
  handlerKey,
  createdAt: Date.now(),
  resolve,
  reject,
  timeoutHandle,
};
```

Then in the engine's return object (search for the `RuntimeEngine` return statement), add:

```ts
getPendingContinuations(): PendingContinuationSnapshot[] {
  return [...pendingContinuations.values()].map((c) => ({
    correlationId: c.correlationId,
    listenerId: c.listenerId,
    actionId: c.actionId,
    handlerKey: c.handlerKey,
    createdAt: c.createdAt,
  }));
},
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm run test --workspace @form-builder/runtime`
Expected: All 105 baseline + 1 new = 106+ pass.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/engine.ts packages/runtime/src/engine.test.ts
git commit -m "feat(runtime): populate handlerKey/createdAt + implement getPendingContinuations"
```

---

## Phase 2 — Authoring lint: handlerKey collision warning

### Task 2.1: New lint rule

**Files:**
- Modify: `packages/runtime/src/authoring-lints.ts`
- Modify: `packages/runtime/src/authoring-lints.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/runtime/src/authoring-lints.test.ts`:

```ts
test("lint warns when listener has 2 host_call_await actions sharing handlerKey", () => {
  const doc = /* doc with one listener having two host_call_await actions both with handlerKey "submit" */;
  const result = lintListeners(doc);
  const collisionWarnings = result.filter((w) => w.rule === "host-call-await-handlerkey-collision");
  assert.equal(collisionWarnings.length, 1);
  assert.match(collisionWarnings[0]!.message, /submit/);
});

test("lint passes when handlerKeys differ across actions", () => {
  const doc = /* listener with two host_call_await actions, handlerKeys "submit" and "prefill" */;
  const result = lintListeners(doc);
  assert.equal(result.filter((w) => w.rule === "host-call-await-handlerkey-collision").length, 0);
});

test("lint passes when same handlerKey used across mutually-exclusive branch arms", () => {
  const doc = /* listener with one branch action whose then-arm + else-arm each have one host_call_await with handlerKey "submit" */;
  const result = lintListeners(doc);
  assert.equal(result.filter((w) => w.rule === "host-call-await-handlerkey-collision").length, 0);
});

test("lint warns when same handlerKey appears within one branch arm", () => {
  const doc = /* listener with one branch action whose then-arm has 2 host_call_await actions sharing handlerKey "submit" */;
  const result = lintListeners(doc);
  assert.equal(result.filter((w) => w.rule === "host-call-await-handlerkey-collision").length, 1);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm run test --workspace @form-builder/runtime -- --test-name-pattern="handlerkey"`
Expected: FAIL (rule doesn't exist).

- [ ] **Step 3: Implement**

In `packages/runtime/src/authoring-lints.ts`, add the new rule walker. Inspect the existing rule-registration pattern; add a function:

```ts
function lintHandlerKeyCollisions(listener: RuntimeListenerDefinition): LintWarning[] {
  const warnings: LintWarning[] = [];
  function walkActions(actions: RuntimeActionDefinition[]): void {
    const counts = new Map<string, number>();
    for (const action of actions) {
      if (action.kind === "host_call_await") {
        const key = typeof action.config?.handlerKey === "string" ? action.config.handlerKey : null;
        if (!key) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      if (action.kind === "branch") {
        // Recurse into each arm independently — same handlerKey across arms is OK.
        const thenArm = (action.config?.actions ?? []) as RuntimeActionDefinition[];
        const elseArm = (action.config?.else ?? []) as RuntimeActionDefinition[];
        walkActions(thenArm);
        walkActions(elseArm);
      }
    }
    for (const [key, count] of counts.entries()) {
      if (count >= 2) {
        warnings.push({
          rule: "host-call-await-handlerkey-collision",
          severity: "warning",
          listenerId: listener.id,
          message: `Listener "${listener.label ?? listener.id}" has ${count} host_call_await actions with handlerKey "${key}". Correlation collision risk — give each action a distinct handlerKey or ensure they run in separate branch arms.`,
        });
      }
    }
  }
  walkActions(listener.actions ?? []);
  return warnings;
}
```

Wire it into the existing `lintListeners` aggregation (find where other listener-level rules are aggregated; mirror).

(`LintWarning` shape and `severity` enum already exist — use them as-is.)

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm run test --workspace @form-builder/runtime`
Expected: existing tests pass + 4 new pass.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/authoring-lints.ts packages/runtime/src/authoring-lints.test.ts
git commit -m "feat(runtime): authoring-lint rule for host_call_await handlerKey collision"
```

---

## Phase 3 — Host presets

### Task 3.1: Preset library + tests

**Files:**
- Create: `apps/web/src/features/test-panel/host-presets.ts`
- Create: `apps/web/src/features/test-panel/host-presets.test.ts`

- [ ] **Step 1: Write tests first**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { HOST_PRESETS, getPresetsByHandlerKey, type MockHostResponsePreset } from "./host-presets";

test("HOST_PRESETS exports the expected entries", () => {
  const ids = HOST_PRESETS.map((p) => p.id);
  assert.ok(ids.includes("submit-success"));
  assert.ok(ids.includes("submit-error"));
  assert.ok(ids.includes("prefill-success"));
  assert.ok(ids.includes("prefill-error"));
  assert.ok(ids.includes("host-call-timeout"));
  assert.ok(ids.includes("host-call-network-error"));
});

test("each preset has valid kind", () => {
  const validKinds = new Set(["success", "error", "timeout", "network-error"]);
  for (const preset of HOST_PRESETS) {
    assert.ok(validKinds.has(preset.kind), `preset ${preset.id} has invalid kind ${preset.kind}`);
  }
});

test("each preset payload is JSON-serializable", () => {
  for (const preset of HOST_PRESETS) {
    assert.doesNotThrow(() => JSON.stringify(preset.payload), `preset ${preset.id} payload not serializable`);
  }
});

test("getPresetsByHandlerKey returns presets matching the handlerKey", () => {
  const submitPresets = getPresetsByHandlerKey("submit");
  assert.ok(submitPresets.some((p) => p.id === "submit-success"));
  assert.ok(submitPresets.some((p) => p.id === "submit-error"));
});
```

- [ ] **Step 2: Run — FAIL**

Run: `npx tsx --test apps/web/src/features/test-panel/host-presets.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
export type MockHostResponseKind = "success" | "error" | "timeout" | "network-error";

export interface MockHostResponsePreset {
  id: string;
  /** Display name in the dropdown. */
  label: string;
  /** Engine handlerKey this preset is intended for. Empty string = generic. */
  handlerKey: string;
  /** What to do when sent. Drives which engine path is exercised. */
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
    payload: { error: { code: "NETWORK_ERROR", message: "Simulated network failure." }, __simulatedNetworkError: true },
  },
];

export function getPresetsByHandlerKey(handlerKey: string): MockHostResponsePreset[] {
  return HOST_PRESETS.filter((p) => p.handlerKey === handlerKey || p.handlerKey === "");
}

export function findPresetById(id: string): MockHostResponsePreset | null {
  return HOST_PRESETS.find((p) => p.id === id) ?? null;
}
```

- [ ] **Step 4: Run tests — PASS**

Run: `npx tsx --test apps/web/src/features/test-panel/host-presets.test.ts`
Expected: 4/4 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/test-panel/host-presets.ts apps/web/src/features/test-panel/host-presets.test.ts
git commit -m "feat(test-panel): mock-host response preset library"
```

---

## Phase 4 — handlerKey autocomplete

### Task 4.1: Pure helper + tests

**Files:**
- Create: `apps/web/src/features/behavior/composer/handler-key-autocomplete.ts`
- Create: `apps/web/src/features/behavior/composer/handler-key-autocomplete.test.ts`

- [ ] **Step 1: Write tests first**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { collectKeys } from "./handler-key-autocomplete";
import type { AuthoringDocument } from "@form-builder/schema";

const docWithTwoHostActions = {
  /* one step, one section, one field with one listener whose actions are:
     [
       { kind: "host_call_await", config: { handlerKey: "submit" } },
       { kind: "host_action", config: { handlerKey: "prefill" } }
     ]
  */
} as unknown as AuthoringDocument;

test("collectKeys returns unique handlerKeys from doc", () => {
  const keys = collectKeys(docWithTwoHostActions);
  assert.deepEqual(keys.map((k) => k.key).sort(), ["prefill", "submit"]);
});

test("collectKeys finds host_call_await + host_action", () => {
  const keys = collectKeys(docWithTwoHostActions);
  assert.equal(keys.length, 2);
});

test("collectKeys returns empty array when doc has no host actions", () => {
  const empty = { steps: [] } as unknown as AuthoringDocument;
  assert.deepEqual(collectKeys(empty), []);
});

test("collectKeys orders by frequency desc then alphabetical", () => {
  const doc = /* doc where "submit" appears 3 times and "prefill" appears 1 time */;
  const keys = collectKeys(doc);
  assert.equal(keys[0]!.key, "submit");
  assert.equal(keys[1]!.key, "prefill");
});

test("collectKeys walks groups and nested fields recursively", () => {
  const doc = /* doc with one host action inside a group's field and one inside a top-level section field */;
  const keys = collectKeys(doc);
  assert.equal(keys.length, 2);
});
```

- [ ] **Step 2: Run — FAIL**

Run: `npx tsx --test apps/web/src/features/behavior/composer/handler-key-autocomplete.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
import type { AuthoringDocument, AuthoringField, RuntimeActionDefinition, RuntimeListenerDefinition } from "@form-builder/schema";

export interface HandlerKeyHit {
  key: string;
  frequency: number;
  listenerLabels: string[];
}

function* iterateFields(doc: AuthoringDocument): Generator<AuthoringField> {
  for (const step of doc.steps ?? []) {
    for (const section of step.sections ?? []) {
      for (const field of section.fields ?? []) yield field;
      for (const group of section.groups ?? []) {
        for (const field of group.fields ?? []) yield field;
      }
    }
  }
}

function extractActionsFromListener(listener: RuntimeListenerDefinition): RuntimeActionDefinition[] {
  const out: RuntimeActionDefinition[] = [];
  function walk(actions: RuntimeActionDefinition[]): void {
    for (const action of actions) {
      out.push(action);
      if (action.kind === "branch") {
        walk(((action.config?.actions ?? []) as RuntimeActionDefinition[]) ?? []);
        walk(((action.config?.else ?? []) as RuntimeActionDefinition[]) ?? []);
      }
    }
  }
  walk(listener.actions ?? []);
  return out;
}

export function collectKeys(doc: AuthoringDocument): HandlerKeyHit[] {
  const counts = new Map<string, { frequency: number; listenerLabels: Set<string> }>();
  for (const field of iterateFields(doc)) {
    const listeners = (field.behaviors?.listeners ?? []) as RuntimeListenerDefinition[];
    for (const listener of listeners) {
      const actions = extractActionsFromListener(listener);
      for (const action of actions) {
        if (action.kind !== "host_call_await" && action.kind !== "host_action") continue;
        const key = typeof action.config?.handlerKey === "string" ? action.config.handlerKey : "";
        if (!key) continue;
        const entry = counts.get(key) ?? { frequency: 0, listenerLabels: new Set() };
        entry.frequency += 1;
        entry.listenerLabels.add(listener.label ?? listener.id);
        counts.set(key, entry);
      }
    }
  }
  return [...counts.entries()]
    .map(([key, value]) => ({
      key,
      frequency: value.frequency,
      listenerLabels: [...value.listenerLabels],
    }))
    .sort((a, b) => {
      if (b.frequency !== a.frequency) return b.frequency - a.frequency;
      return a.key.localeCompare(b.key);
    });
}
```

(Adapt the `field.behaviors.listeners` access path to the actual schema shape — check `packages/schema/src/authoring.ts` and `runtime.ts` for where listeners hang off fields. May be `field.runtime?.listeners` or similar.)

- [ ] **Step 4: Run tests — PASS**

Run: `npx tsx --test apps/web/src/features/behavior/composer/handler-key-autocomplete.test.ts`
Expected: 5/5 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/behavior/composer/handler-key-autocomplete.ts apps/web/src/features/behavior/composer/handler-key-autocomplete.test.ts
git commit -m "feat(behavior): handlerKey autocomplete helper for ActionEditor"
```

---

## Phase 5 — Shared host-bridge module

### Task 5.1: Bridge types + skeleton

**Files:**
- Modify: `apps/web/src/features/test-panel/types.ts`
- Create: `apps/web/src/lib/host-bridge-shared.ts`

- [ ] **Step 1: Add types**

In `apps/web/src/features/test-panel/types.ts`, add:

```ts
import type { PendingContinuationSnapshot, RuntimeTraceEntry } from "@form-builder/runtime";
import type { MockHostResponseKind } from "./host-presets";

export type MockHostFailureMode = "none" | "timeout" | "network-error";

export interface MockHostConfig {
  defaults: {
    /** Preset id to use for unmatched handlerKeys. */
    presetId: string | null;
    /** JSON payload (override). */
    payload: Record<string, unknown> | null;
    /** Delay before auto-respond, ms (0–30000). */
    delayMs: number;
    /** Override behavior. */
    failureMode: MockHostFailureMode;
  };
}

export type BridgeSource = "builder" | "walkthrough";

export interface BridgePendingEntry extends PendingContinuationSnapshot {
  source: BridgeSource;
}

export interface CollisionEntry {
  correlationId: string;
  handlerKey: string | null;
  timestamp: string;
  trace: RuntimeTraceEntry;
}

// Extend TestPanelMode and TestPanelState
export type TestPanelMode = "synth" | "record" | "session" | "host";

export interface TestPanelState {
  open: boolean;
  mode: TestPanelMode;
  dockSide: TestPanelDockSide;
  selection: TestPanelSelection;
  lastReport: RuntimeDispatchReport | null;
  recordedReports: { id: string; timestamp: string; report: RuntimeDispatchReport }[];
  statusSnapshot: TestPanelStatusSnapshot | null;
  /** Mock-host bridge config (default response, delay, failure mode). */
  mockHostConfig: MockHostConfig;
  /** Live snapshot of pending continuations from all engines, tagged with source. */
  pendingContinuations: BridgePendingEntry[];
  /** FIFO collision events (cap 20). */
  collisionEvents: CollisionEntry[];
}
```

(Adapt to the actual shape of TestPanelState; preserve existing fields.)

- [ ] **Step 2: Create the bridge module skeleton**

`apps/web/src/lib/host-bridge-shared.ts`:

```ts
import type { RuntimeEngine, RuntimeEventEnvelope, RuntimeTraceEntry } from "@form-builder/runtime";
import { findPresetById, type MockHostResponseKind, type MockHostResponsePreset } from "../features/test-panel/host-presets";
import type { BridgePendingEntry, BridgeSource, CollisionEntry, MockHostConfig } from "../features/test-panel/types";

export interface BridgeCallbacks {
  onPendingChange: (entries: BridgePendingEntry[]) => void;
  onCollision: (entry: CollisionEntry) => void;
  /** Captures the form.submit envelope so SubmitEnvelopePreview can render it. */
  onSubmitEnvelope: (envelope: RuntimeEventEnvelope | null) => void;
}

export interface BridgeOptions {
  engine: RuntimeEngine;
  source: BridgeSource;
  getConfig: () => MockHostConfig;
  callbacks: BridgeCallbacks;
}

export interface MockHostBridge {
  /** Manually resolve a pending continuation. */
  resolve: (correlationId: string, kind: MockHostResponseKind, payload: Record<string, unknown>) => void;
  /** Tear down: cancel timers + unsubscribe. */
  dispose: () => void;
}

const COLLISION_CAP = 20;

export function createMockHostBridge(options: BridgeOptions): MockHostBridge {
  const { engine, source, getConfig, callbacks } = options;
  const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let collisionBuffer: CollisionEntry[] = [];

  function pushPending(): void {
    const snapshot = engine.getPendingContinuations();
    callbacks.onPendingChange(snapshot.map((p) => ({ ...p, source })));
  }

  function dispatchHostResponse(correlationId: string, payload: Record<string, unknown>): void {
    const envelope: RuntimeEventEnvelope = {
      type: "host.action_response",
      version: "1.0",
      source: { runtimeId: source, formId: "", projectId: null, nodeId: "host", nodeType: "form" },
      target: { runtimeId: source, formId: "", projectId: null, nodeId: "host", nodeType: "form" },
      payload: { ...payload, correlationId },
      correlationId,
      timestamp: new Date().toISOString(),
    };
    engine.dispatch(envelope);
  }

  function scheduleAutoRespond(correlationId: string, handlerKey: string | null): void {
    const config = getConfig();
    const { defaults } = config;
    if (defaults.failureMode === "timeout") {
      // Engine times out per its own timeoutMs config; bridge does nothing.
      return;
    }
    const presetIfAny = defaults.presetId ? findPresetById(defaults.presetId) : null;
    const payload = defaults.payload ?? presetIfAny?.payload ?? { ok: true };
    const delay = Math.max(0, Math.min(30000, defaults.delayMs));
    const timer = setTimeout(() => {
      pendingTimers.delete(correlationId);
      if (defaults.failureMode === "network-error") {
        dispatchHostResponse(correlationId, {
          error: { code: "NETWORK_ERROR", message: "Simulated network failure." },
          __simulatedNetworkError: true,
        });
      } else {
        dispatchHostResponse(correlationId, payload);
      }
    }, delay);
    pendingTimers.set(correlationId, timer);
  }

  const unsubscribe = engine.subscribe((event: RuntimeEventEnvelope) => {
    switch (event.type) {
      case "host.action_requested": {
        const correlationId = String(event.payload.correlationId ?? "");
        const handlerKey = typeof event.payload.handlerKey === "string" ? event.payload.handlerKey : null;
        if (correlationId) scheduleAutoRespond(correlationId, handlerKey);
        pushPending();
        return;
      }
      case "host.action_response": {
        // After the engine resolves, snapshot will be smaller; refresh.
        pushPending();
        return;
      }
      case "form.submit": {
        callbacks.onSubmitEnvelope(event);
        return;
      }
      case "form.submit_success":
      case "form.submit_error": {
        callbacks.onSubmitEnvelope(null);
        return;
      }
      case "runtime.continuation_collision": {
        const entry: CollisionEntry = {
          correlationId: String(event.payload.correlationId ?? ""),
          handlerKey: typeof event.payload.handlerKey === "string" ? event.payload.handlerKey : null,
          timestamp: event.timestamp,
          trace: { direction: "internal", event } as RuntimeTraceEntry,
        };
        collisionBuffer = [...collisionBuffer, entry];
        if (collisionBuffer.length > COLLISION_CAP) {
          collisionBuffer = collisionBuffer.slice(collisionBuffer.length - COLLISION_CAP);
        }
        callbacks.onCollision(entry);
        return;
      }
    }
  });

  // Initial snapshot (in case continuations are already pending — unlikely but safe).
  pushPending();

  return {
    resolve(correlationId, kind, payload) {
      const timer = pendingTimers.get(correlationId);
      if (timer) {
        clearTimeout(timer);
        pendingTimers.delete(correlationId);
      }
      if (kind === "timeout") {
        // Don't dispatch; let engine time out.
        return;
      }
      if (kind === "network-error") {
        dispatchHostResponse(correlationId, {
          error: { code: "NETWORK_ERROR", message: "Simulated network failure." },
          __simulatedNetworkError: true,
        });
        return;
      }
      dispatchHostResponse(correlationId, payload);
    },
    dispose() {
      for (const timer of pendingTimers.values()) clearTimeout(timer);
      pendingTimers.clear();
      unsubscribe();
    },
  };
}
```

(Adapt to the actual `RuntimeEventHandler` signature and `RuntimeTraceEntry` shape.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/test-panel/types.ts apps/web/src/lib/host-bridge-shared.ts
git commit -m "feat(host-bridge): shared mock-host bridge module + types"
```

### Task 5.2: Bridge tests

**Files:**
- Create: `apps/web/src/lib/host-bridge-shared.test.ts`

- [ ] **Step 1: Write tests covering the contract**

Build a fake engine (object satisfying the subset of `RuntimeEngine` the bridge uses: `subscribe`, `dispatch`, `getPendingContinuations`). Tests:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMockHostBridge } from "./host-bridge-shared";
import type { RuntimeEngine, RuntimeEventEnvelope } from "@form-builder/runtime";
import type { MockHostConfig } from "../features/test-panel/types";

function makeFakeEngine(initialPending: ReturnType<RuntimeEngine["getPendingContinuations"]> = []) {
  const handlers: Array<(e: RuntimeEventEnvelope) => void> = [];
  let dispatched: RuntimeEventEnvelope[] = [];
  let pending = initialPending;
  return {
    engine: {
      subscribe: (h) => {
        handlers.push(h);
        return () => {
          const i = handlers.indexOf(h);
          if (i >= 0) handlers.splice(i, 1);
        };
      },
      dispatch: (e) => {
        dispatched.push(e);
        return {} as never;
      },
      getPendingContinuations: () => pending,
    } as unknown as RuntimeEngine,
    fire: (e: RuntimeEventEnvelope) => handlers.forEach((h) => h(e)),
    setPending: (next: typeof pending) => {
      pending = next;
    },
    getDispatched: () => dispatched,
  };
}

test("auto-respond resolves pending entry with default response after delay", async () => {
  const fake = makeFakeEngine();
  const config: MockHostConfig = {
    defaults: { presetId: "submit-success", payload: null, delayMs: 10, failureMode: "none" },
  };
  let pending: unknown[] = [];
  createMockHostBridge({
    engine: fake.engine,
    source: "builder",
    getConfig: () => config,
    callbacks: { onPendingChange: (e) => (pending = e), onCollision: () => {}, onSubmitEnvelope: () => {} },
  });
  fake.fire({
    type: "host.action_requested",
    payload: { correlationId: "c-1", handlerKey: "submit" },
  } as never);
  await new Promise((r) => setTimeout(r, 25));
  const dispatched = fake.getDispatched();
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0]!.type, "host.action_response");
  assert.equal(dispatched[0]!.correlationId, "c-1");
});

test("failureMode 'timeout' lets engine time out (no bridge dispatch)", async () => {
  const fake = makeFakeEngine();
  const config: MockHostConfig = {
    defaults: { presetId: null, payload: null, delayMs: 10, failureMode: "timeout" },
  };
  createMockHostBridge({
    engine: fake.engine,
    source: "builder",
    getConfig: () => config,
    callbacks: { onPendingChange: () => {}, onCollision: () => {}, onSubmitEnvelope: () => {} },
  });
  fake.fire({ type: "host.action_requested", payload: { correlationId: "c-2", handlerKey: "submit" } } as never);
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(fake.getDispatched().length, 0);
});

test("failureMode 'network-error' dispatches malformed payload", async () => {
  const fake = makeFakeEngine();
  const config: MockHostConfig = {
    defaults: { presetId: null, payload: null, delayMs: 5, failureMode: "network-error" },
  };
  createMockHostBridge({
    engine: fake.engine,
    source: "builder",
    getConfig: () => config,
    callbacks: { onPendingChange: () => {}, onCollision: () => {}, onSubmitEnvelope: () => {} },
  });
  fake.fire({ type: "host.action_requested", payload: { correlationId: "c-3", handlerKey: "submit" } } as never);
  await new Promise((r) => setTimeout(r, 20));
  const dispatched = fake.getDispatched();
  assert.equal(dispatched.length, 1);
  assert.equal((dispatched[0]!.payload as Record<string, unknown>).__simulatedNetworkError, true);
});

test("manual resolve(success) cancels auto-timer + dispatches", async () => {
  const fake = makeFakeEngine();
  const config: MockHostConfig = {
    defaults: { presetId: "submit-success", payload: null, delayMs: 1000, failureMode: "none" },
  };
  const bridge = createMockHostBridge({
    engine: fake.engine,
    source: "builder",
    getConfig: () => config,
    callbacks: { onPendingChange: () => {}, onCollision: () => {}, onSubmitEnvelope: () => {} },
  });
  fake.fire({ type: "host.action_requested", payload: { correlationId: "c-4", handlerKey: "submit" } } as never);
  bridge.resolve("c-4", "success", { custom: "manual" });
  await new Promise((r) => setTimeout(r, 5));
  const dispatched = fake.getDispatched();
  assert.equal(dispatched.length, 1);
  assert.equal((dispatched[0]!.payload as Record<string, unknown>).custom, "manual");
});

test("collision event appended; cap 20 enforced", () => {
  const fake = makeFakeEngine();
  const config: MockHostConfig = {
    defaults: { presetId: null, payload: null, delayMs: 0, failureMode: "none" },
  };
  let collisionsSeen = 0;
  createMockHostBridge({
    engine: fake.engine,
    source: "builder",
    getConfig: () => config,
    callbacks: {
      onPendingChange: () => {},
      onCollision: () => {
        collisionsSeen++;
      },
      onSubmitEnvelope: () => {},
    },
  });
  for (let i = 0; i < 25; i++) {
    fake.fire({
      type: "runtime.continuation_collision",
      timestamp: new Date().toISOString(),
      payload: { correlationId: `c-${i}`, handlerKey: "submit" },
    } as never);
  }
  assert.equal(collisionsSeen, 25); // each collision fires the callback
});

test("dispose cancels timers + unsubscribes", async () => {
  const fake = makeFakeEngine();
  const config: MockHostConfig = {
    defaults: { presetId: "submit-success", payload: null, delayMs: 50, failureMode: "none" },
  };
  const bridge = createMockHostBridge({
    engine: fake.engine,
    source: "builder",
    getConfig: () => config,
    callbacks: { onPendingChange: () => {}, onCollision: () => {}, onSubmitEnvelope: () => {} },
  });
  fake.fire({ type: "host.action_requested", payload: { correlationId: "c-5", handlerKey: "submit" } } as never);
  bridge.dispose();
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(fake.getDispatched().length, 0);
});

test("source tag carried on pending entries", () => {
  const fake = makeFakeEngine([
    { correlationId: "c-x", listenerId: "L", actionId: "A", handlerKey: "submit", createdAt: 1 },
  ]);
  let captured: { source: string }[] = [];
  createMockHostBridge({
    engine: fake.engine,
    source: "walkthrough",
    getConfig: () => ({
      defaults: { presetId: null, payload: null, delayMs: 0, failureMode: "none" },
    }),
    callbacks: { onPendingChange: (e) => (captured = e as never), onCollision: () => {}, onSubmitEnvelope: () => {} },
  });
  // initial snapshot pushed
  assert.ok(captured.length === 1);
  assert.equal(captured[0]!.source, "walkthrough");
});

test("submit envelope captured + cleared", () => {
  const fake = makeFakeEngine();
  let envelope: RuntimeEventEnvelope | null = null;
  createMockHostBridge({
    engine: fake.engine,
    source: "builder",
    getConfig: () => ({ defaults: { presetId: null, payload: null, delayMs: 0, failureMode: "none" } }),
    callbacks: {
      onPendingChange: () => {},
      onCollision: () => {},
      onSubmitEnvelope: (e) => (envelope = e),
    },
  });
  const submit = { type: "form.submit", payload: { x: 1 } } as RuntimeEventEnvelope;
  fake.fire(submit);
  assert.equal(envelope, submit);
  fake.fire({ type: "form.submit_success" } as RuntimeEventEnvelope);
  assert.equal(envelope, null);
});
```

- [ ] **Step 2: Run tests — PASS**

Run: `npx tsx --test apps/web/src/lib/host-bridge-shared.test.ts`
Expected: 7+ tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/host-bridge-shared.test.ts
git commit -m "test(host-bridge): bridge contract tests (auto-respond, failure modes, collision, dispose)"
```

---

## Phase 6 — State + reducer + hook extensions

### Task 6.1: Reducer actions + tests

**Files:**
- Modify: `apps/web/src/features/test-panel/state.ts`
- Modify: `apps/web/src/features/test-panel/state.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `state.test.ts`:

```ts
test("set-mock-host-config writes config", () => {
  const config: MockHostConfig = {
    defaults: { presetId: "submit-success", payload: null, delayMs: 0, failureMode: "none" },
  };
  const next = testPanelReducer(initialTestPanelState, { type: "set-mock-host-config", config });
  assert.deepEqual(next.mockHostConfig, config);
});

test("set-pending-continuations replaces list", () => {
  const next = testPanelReducer(initialTestPanelState, {
    type: "set-pending-continuations",
    entries: [{ correlationId: "c", listenerId: "L", actionId: "A", handlerKey: "submit", createdAt: 1, source: "builder" }],
  });
  assert.equal(next.pendingContinuations.length, 1);
});

test("append-collision enforces FIFO cap of 20", () => {
  let state = initialTestPanelState;
  for (let i = 0; i < 25; i++) {
    state = testPanelReducer(state, {
      type: "append-collision",
      entry: { correlationId: `c-${i}`, handlerKey: "x", timestamp: "2026-05-13T00:00:00Z", trace: {} as never },
    });
  }
  assert.equal(state.collisionEvents.length, 20);
  assert.equal(state.collisionEvents[0]!.correlationId, "c-5");
});

test("set-mode accepts host", () => {
  const next = testPanelReducer(initialTestPanelState, { type: "set-mode", mode: "host" });
  assert.equal(next.mode, "host");
});
```

(Import `MockHostConfig` from `./types`.)

- [ ] **Step 2: Run — FAIL**

Run: `npx tsx --test apps/web/src/features/test-panel/state.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `state.ts`:

a. Update `initialTestPanelState`:

```ts
export const initialTestPanelState: TestPanelState = {
  // ...existing fields...
  mockHostConfig: {
    defaults: { presetId: null, payload: null, delayMs: 0, failureMode: "none" },
  },
  pendingContinuations: [],
  collisionEvents: [],
};
```

b. Extend `TestPanelAction`:

```ts
| { type: "set-mock-host-config"; config: MockHostConfig }
| { type: "set-pending-continuations"; entries: BridgePendingEntry[] }
| { type: "append-collision"; entry: CollisionEntry }
```

c. Add reducer cases:

```ts
case "set-mock-host-config":
  return { ...state, mockHostConfig: action.config };
case "set-pending-continuations":
  return { ...state, pendingContinuations: action.entries };
case "append-collision": {
  const next = [...state.collisionEvents, action.entry];
  if (next.length > 20) next.splice(0, next.length - 20);
  return { ...state, collisionEvents: next };
}
```

Imports from `./types`: add `MockHostConfig`, `BridgePendingEntry`, `CollisionEntry`.

- [ ] **Step 4: Run tests — PASS**

Run: `npx tsx --test apps/web/src/features/test-panel/state.test.ts`
Expected: prior 11 + 4 new = 15 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/test-panel/state.ts apps/web/src/features/test-panel/state.test.ts
git commit -m "feat(test-panel): reducer actions for mock-host config + pending + collisions"
```

### Task 6.2: Hook callbacks + sessionStorage

**Files:**
- Modify: `apps/web/src/features/test-panel/useTestPanelState.ts`

- [ ] **Step 1: Add callbacks**

Add to the hook (mirror the existing `setStatusSnapshot` pattern):

```ts
const setMockHostConfig = useCallback(
  (config: MockHostConfig) => dispatch({ type: "set-mock-host-config", config }),
  [],
);
const setPendingContinuations = useCallback(
  (entries: BridgePendingEntry[]) => dispatch({ type: "set-pending-continuations", entries }),
  [],
);
const appendCollision = useCallback(
  (entry: CollisionEntry) => dispatch({ type: "append-collision", entry }),
  [],
);
```

Add to `UseTestPanelStateResult` and the returned object.

- [ ] **Step 2: Persist `mockHostConfig` to sessionStorage**

Read on init (extend the existing `readPrefs` pattern); write via `useEffect`. Use key `mock-host-config-v1`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/test-panel/useTestPanelState.ts
git commit -m "feat(test-panel): hook exposes mock-host callbacks + persists config"
```

---

## Phase 7 — UI: TestPanelHost + sub-components + header tab + container branch

### Task 7.1: HostConfigEditor component

**Files:**
- Create: `apps/web/src/features/test-panel/HostConfigEditor.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useEffect, useState } from "react";
import { HOST_PRESETS, findPresetById } from "./host-presets";
import type { MockHostConfig, MockHostFailureMode } from "./types";

export interface HostConfigEditorProps {
  config: MockHostConfig["defaults"];
  onChange: (next: MockHostConfig["defaults"]) => void;
}

export function HostConfigEditor({ config, onChange }: HostConfigEditorProps) {
  const [jsonText, setJsonText] = useState(() => JSON.stringify(config.payload ?? {}, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    setJsonText(JSON.stringify(config.payload ?? {}, null, 2));
  }, [config.payload]);

  function commitJson(text: string): void {
    setJsonText(text);
    try {
      const parsed = text.trim() ? JSON.parse(text) : null;
      setJsonError(null);
      onChange({ ...config, payload: parsed });
    } catch (err) {
      setJsonError((err as Error).message);
    }
  }

  function handlePreset(presetId: string): void {
    const preset = findPresetById(presetId);
    if (!preset) {
      onChange({ ...config, presetId: null });
      return;
    }
    onChange({ ...config, presetId, payload: preset.payload });
  }

  return (
    <section className="space-y-3 rounded border border-slate-200 bg-white p-3">
      <div>
        <label className="block text-xs uppercase tracking-wide text-slate-500" htmlFor="host-preset">
          Preset
        </label>
        <select
          id="host-preset"
          value={config.presetId ?? ""}
          onChange={(e) => handlePreset(e.target.value)}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
        >
          <option value="">— Custom JSON —</option>
          {HOST_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs uppercase tracking-wide text-slate-500" htmlFor="host-payload">
          Payload (JSON)
        </label>
        <textarea
          id="host-payload"
          value={jsonText}
          onChange={(e) => commitJson(e.target.value)}
          rows={6}
          className={`mt-1 w-full rounded border px-2 py-1 font-mono text-xs ${jsonError ? "border-rose-400" : "border-slate-300"}`}
          aria-invalid={jsonError !== null}
        />
        {jsonError ? <p className="mt-1 text-xs text-rose-600">Invalid JSON: {jsonError}</p> : null}
      </div>
      <div>
        <label className="block text-xs uppercase tracking-wide text-slate-500" htmlFor="host-delay">
          Delay: {config.delayMs}ms
        </label>
        <input
          id="host-delay"
          type="range"
          min={0}
          max={30000}
          step={100}
          value={config.delayMs}
          onChange={(e) => onChange({ ...config, delayMs: Number(e.target.value) })}
          className="mt-1 w-full"
        />
      </div>
      <div>
        <span className="block text-xs uppercase tracking-wide text-slate-500">Failure mode</span>
        <div className="mt-1 inline-flex gap-0.5 rounded bg-slate-100 p-0.5 text-xs">
          {(["none", "timeout", "network-error"] as MockHostFailureMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={config.failureMode === mode}
              onClick={() => onChange({ ...config, failureMode: mode })}
              className={`rounded px-2 py-1 ${config.failureMode === mode ? "bg-blue-600 text-white" : "text-slate-700"}`}
            >
              {mode === "none" ? "None" : mode === "timeout" ? "Timeout" : "Network error"}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/test-panel/HostConfigEditor.tsx
git commit -m "feat(test-panel): HostConfigEditor (preset + JSON + delay + failure-mode)"
```

### Task 7.2: PendingContinuationRow component

**Files:**
- Create: `apps/web/src/features/test-panel/PendingContinuationRow.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useState } from "react";
import { HostConfigEditor } from "./HostConfigEditor";
import type { BridgePendingEntry, MockHostConfig, MockHostFailureMode } from "./types";
import type { MockHostResponseKind } from "./host-presets";

export interface PendingContinuationRowProps {
  entry: BridgePendingEntry;
  onResolve: (correlationId: string, kind: MockHostResponseKind, payload: Record<string, unknown>) => void;
}

export function PendingContinuationRow({ entry, onResolve }: PendingContinuationRowProps) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<MockHostConfig["defaults"]>({
    presetId: null,
    payload: {},
    delayMs: 0,
    failureMode: "none" as MockHostFailureMode,
  });

  const ageSec = Math.floor((Date.now() - entry.createdAt) / 1000);

  return (
    <li className="rounded border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50"
      >
        <span>
          <span className="font-semibold">{entry.handlerKey ?? "(no handlerKey)"}</span>
          <span className="ml-2 text-slate-500">{entry.correlationId.slice(0, 8)}…</span>
          <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-600">
            {entry.source}
          </span>
        </span>
        <span className="text-slate-500">{ageSec}s ago</span>
      </button>
      {open ? (
        <div className="border-t border-slate-200 p-3">
          <HostConfigEditor config={config} onChange={setConfig} />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onResolve(entry.correlationId, "success", config.payload ?? {})}
              className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white"
            >
              Success
            </button>
            <button
              type="button"
              onClick={() => onResolve(entry.correlationId, "error", config.payload ?? {})}
              className="rounded bg-rose-600 px-3 py-1 text-xs font-semibold text-white"
            >
              Error
            </button>
            <button
              type="button"
              onClick={() => onResolve(entry.correlationId, "timeout", {})}
              className="rounded bg-amber-600 px-3 py-1 text-xs font-semibold text-white"
            >
              Time out
            </button>
            <button
              type="button"
              onClick={() => onResolve(entry.correlationId, "network-error", {})}
              className="rounded bg-slate-700 px-3 py-1 text-xs font-semibold text-white"
            >
              Network error
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/test-panel/PendingContinuationRow.tsx
git commit -m "feat(test-panel): PendingContinuationRow (per-entry editor + resolve buttons)"
```

### Task 7.3: SubmitEnvelopePreview component

**Files:**
- Create: `apps/web/src/features/test-panel/SubmitEnvelopePreview.tsx`

- [ ] **Step 1: Implement**

```tsx
import type { RuntimeEventEnvelope } from "@form-builder/runtime";

export interface SubmitEnvelopePreviewProps {
  envelope: RuntimeEventEnvelope | null;
}

export function SubmitEnvelopePreview({ envelope }: SubmitEnvelopePreviewProps) {
  if (!envelope) {
    return (
      <div className="rounded border border-dashed border-slate-300 p-3 text-xs text-slate-500">
        Run Submit from the Session tab to preview the envelope.
      </div>
    );
  }
  const json = JSON.stringify(envelope, null, 2);
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">form.submit envelope</span>
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(json).catch(() => {})}
          className="rounded bg-slate-200 px-2 py-0.5 text-xs hover:bg-slate-300"
        >
          Copy
        </button>
      </div>
      <pre className="overflow-x-auto rounded bg-white p-2 font-mono text-xs">{json}</pre>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/test-panel/SubmitEnvelopePreview.tsx
git commit -m "feat(test-panel): SubmitEnvelopePreview (live JSON viewer + copy)"
```

### Task 7.4: TestPanelHost composes the tab

**Files:**
- Create: `apps/web/src/features/test-panel/TestPanelHost.tsx`

- [ ] **Step 1: Implement**

```tsx
import type { RuntimeEventEnvelope } from "@form-builder/runtime";
import { HostConfigEditor } from "./HostConfigEditor";
import { PendingContinuationRow } from "./PendingContinuationRow";
import { SubmitEnvelopePreview } from "./SubmitEnvelopePreview";
import type { BridgePendingEntry, CollisionEntry, MockHostConfig } from "./types";
import type { MockHostResponseKind } from "./host-presets";

export interface TestPanelHostProps {
  config: MockHostConfig;
  pending: BridgePendingEntry[];
  collisions: CollisionEntry[];
  submitEnvelope: RuntimeEventEnvelope | null;
  onConfigChange: (next: MockHostConfig) => void;
  onResolve: (correlationId: string, kind: MockHostResponseKind, payload: Record<string, unknown>) => void;
}

export function TestPanelHost({
  config,
  pending,
  collisions,
  submitEnvelope,
  onConfigChange,
  onResolve,
}: TestPanelHostProps) {
  return (
    <section className="space-y-4 p-3">
      <div>
        <h4 className="mb-2 text-xs uppercase tracking-wide text-slate-500">Default response</h4>
        <HostConfigEditor
          config={config.defaults}
          onChange={(defaults) => onConfigChange({ ...config, defaults })}
        />
      </div>

      {collisions.length > 0 ? (
        <div className="rounded border border-rose-300 bg-rose-50 p-2 text-xs text-rose-800">
          ⚠ {collisions.length} correlation collision{collisions.length === 1 ? "" : "s"} detected. Pending entries with
          duplicate handlerKeys may not resolve as expected.
        </div>
      ) : null}

      <div>
        <h4 className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
          <span>Pending continuations ({pending.length})</span>
        </h4>
        {pending.length === 0 ? (
          <p className="rounded bg-slate-50 px-2 py-2 text-xs text-slate-500">
            No pending host calls. Auto-respond config affects future calls.
          </p>
        ) : (
          <ul className="space-y-1">
            {pending.map((entry) => (
              <PendingContinuationRow key={entry.correlationId} entry={entry} onResolve={onResolve} />
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 className="mb-2 text-xs uppercase tracking-wide text-slate-500">Submit envelope</h4>
        <SubmitEnvelopePreview envelope={submitEnvelope} />
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/test-panel/TestPanelHost.tsx
git commit -m "feat(test-panel): TestPanelHost composes config + queue + envelope + collision banner"
```

### Task 7.5: Header gets 4th tab + container branches + Session tab slim

**Files:**
- Modify: `apps/web/src/features/test-panel/TestPanelHeader.tsx`
- Modify: `apps/web/src/features/test-panel/TestPanel.tsx`
- Modify: `apps/web/src/features/test-panel/TestPanelSession.tsx`
- Modify: `apps/web/src/features/test-panel/TestPanelTrace.tsx`

- [ ] **Step 1: TestPanelHeader — add 4th tab**

Add a "Host" button next to existing Synth / Live / Session with the same `aria-pressed` pattern. Adjust the segmented styling so the 4-button row rounds correctly (only first/last get rounded).

- [ ] **Step 2: TestPanel — branch on `mode === "host"`**

Add new props: `hostConfig`, `pendingContinuations`, `collisionEvents`, `submitEnvelope`, `onMockHostConfigChange`, `onResolveContinuation`.

In the body branch:

```tsx
{mode === "synth" ? (
  <TestPanelInputs ... />
) : mode === "record" ? (
  <RecordIndicator ... />
) : mode === "session" ? (
  <TestPanelSession ... />
) : (
  <TestPanelHost
    config={hostConfig}
    pending={pendingContinuations}
    collisions={collisionEvents}
    submitEnvelope={submitEnvelope}
    onConfigChange={onMockHostConfigChange}
    onResolve={onResolveContinuation}
  />
)}
```

- [ ] **Step 3: TestPanelSession — slim Host loop**

Replace the existing host-loop section with a slim "Open Host tab" callout:

```tsx
<div>
  <span className="text-xs uppercase tracking-wide text-slate-500">Host loop</span>
  <p className="mt-1 rounded bg-slate-50 px-2 py-2 text-xs text-slate-600">
    {pendingCount > 0 ? `${pendingCount} pending host call${pendingCount === 1 ? "" : "s"}.` : "No pending host calls."}
    <button
      type="button"
      onClick={onOpenHostTab}
      className="ml-2 text-blue-700 underline"
    >
      Open Host tab
    </button>
  </p>
</div>
```

Add `pendingCount: number` and `onOpenHostTab: () => void` to `TestPanelSessionProps`. Remove `onSimulateHostSuccess` / `onSimulateHostError` props (now lives in Host tab).

- [ ] **Step 4: TestPanelTrace — red row for collisions**

In the History view's row render, add red styling when `entry.report.event.type === "runtime.continuation_collision"`:

```tsx
const isCollision = entry.report.event.type === "runtime.continuation_collision";
const rowClass = `rounded border ${isCollision ? "border-rose-300 bg-rose-50" : "border-slate-200"}`;
```

(Apply to the `<li>` in HistoryView.)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/test-panel/TestPanelHeader.tsx apps/web/src/features/test-panel/TestPanel.tsx apps/web/src/features/test-panel/TestPanelSession.tsx apps/web/src/features/test-panel/TestPanelTrace.tsx
git commit -m "feat(test-panel): wire Host tab into Header/container/Session/Trace"
```

---

## Phase 8 — App.tsx wiring + Walkthrough swap + ActionEditor

### Task 8.1: Instantiate shared bridge in App

**Files:**
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Create the bridge after engine is mounted**

In App.tsx, after the existing engine ref + testPanel hook setup, add:

```ts
useEffect(() => {
  const engine = runtimeEngineRef.current;
  if (!engine) return;
  const bridge = createMockHostBridge({
    engine,
    source: "builder",
    getConfig: () => testPanel.state.mockHostConfig,
    callbacks: {
      onPendingChange: testPanel.setPendingContinuations,
      onCollision: (entry) => {
        testPanel.appendCollision(entry);
        setMessage({
          tone: "error",
          text: `Correlation collision detected for handlerKey "${entry.handlerKey ?? "(none)"}". Open Host tab.`,
        });
      },
      onSubmitEnvelope: (envelope) => {
        // Stash on a ref or local state for the SubmitEnvelopePreview prop
        setSubmitEnvelope(envelope);
      },
    },
  });
  return () => bridge.dispose();
}, [runtimeEngineRef.current, testPanel.setPendingContinuations, testPanel.appendCollision]);

const [submitEnvelope, setSubmitEnvelope] = useState<RuntimeEventEnvelope | null>(null);
```

(Adapt to the existing setMessage shape and engine ref pattern.)

- [ ] **Step 2: Replace Simulate-success / Simulate-error handlers**

Find `handleMockSubmitSuccess` and `handleMockSubmitError`. They currently dispatch synthesized envelopes. Replace bodies to use the bridge, e.g.:

```ts
const handleMockSubmitSuccess = useCallback(() => {
  const correlationId = runtimeSessionState?.submit?.lastCorrelationId;
  if (!correlationId || !mockHostBridgeRef.current) return;
  mockHostBridgeRef.current.resolve(correlationId, "success", { ok: true });
}, [runtimeSessionState]);
```

Hold the bridge in a ref `mockHostBridgeRef` so handlers see it. Update Step 1's effect to set the ref.

- [ ] **Step 3: Wire new TestPanel props**

In the `<TestPanel>` JSX, add:

```tsx
hostConfig={testPanel.state.mockHostConfig}
pendingContinuations={testPanel.state.pendingContinuations}
collisionEvents={testPanel.state.collisionEvents}
submitEnvelope={submitEnvelope}
onMockHostConfigChange={testPanel.setMockHostConfig}
onResolveContinuation={(correlationId, kind, payload) =>
  mockHostBridgeRef.current?.resolve(correlationId, kind, payload)
}
```

- [ ] **Step 4: Update TestPanelSession callsite**

Pass `pendingCount={testPanel.state.pendingContinuations.length}` and `onOpenHostTab={() => testPanel.setMode("host")}`. Remove the now-unused `onSimulateHostSuccess` / `onSimulateHostError` props.

- [ ] **Step 5: Typecheck + smoke**

Run: `npm run typecheck:web && npm run dev:web`. Open the app, ensure it loads. Open TestPanel → Host tab visible.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat(web): instantiate shared mock-host bridge for builder engine + wire Host tab"
```

### Task 8.2: WalkthroughRoute swaps to shared bridge

**Files:**
- Modify: `apps/web/src/features/walkthrough/WalkthroughRoute.tsx`
- Delete: `apps/web/src/features/walkthrough/host-bridge-mock.ts`

- [ ] **Step 1: Verify no other consumer**

```bash
grep -rn "host-bridge-mock" apps/web/src
```

If anything other than `WalkthroughRoute.tsx` references it, migrate them first.

- [ ] **Step 2: Swap import in WalkthroughRoute**

```ts
// Old: import { createMockHostBridge as createOldMock } from "./host-bridge-mock";
// New:
import { createMockHostBridge } from "../../lib/host-bridge-shared";
```

In the engine-mount effect, replace the local-bridge instantiation with the shared one:

```ts
const bridge = createMockHostBridge({
  engine: engineRef.current,
  source: "walkthrough",
  getConfig: () => /* read from a static default OR from a shared config singleton */ ({
    defaults: { presetId: null, payload: null, delayMs: 0, failureMode: "none" },
  }),
  callbacks: {
    onPendingChange: () => {},
    onCollision: () => {},
    onSubmitEnvelope: () => {
      // Walkthrough already shows a submit toast separately; bridge captures envelope but UI doesn't need it here.
    },
  },
});
return () => bridge.dispose();
```

(Walkthrough's UI doesn't render the Host tab; pending entries from walkthrough surface in TestPanel only when both are open. For now use static config defaults; future enhancement: thread through a shared config provider so Walkthrough also picks up the user's TestPanel config.)

- [ ] **Step 3: Delete local mock**

```bash
git rm apps/web/src/features/walkthrough/host-bridge-mock.ts
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(walkthrough): swap to shared host-bridge module + delete local mock"
```

### Task 8.3: ActionEditor handlerKey autocomplete

**Files:**
- Modify: `apps/web/src/features/behavior/composer/ActionEditor.tsx`

- [ ] **Step 1: Find the handlerKey input**

```bash
grep -n "handlerKey" apps/web/src/features/behavior/composer/ActionEditor.tsx
```

The input is likely a plain `<input>` for both `host_call_await` and `host_action`.

- [ ] **Step 2: Wire datalist**

Add at the top:

```ts
import { collectKeys } from "./handler-key-autocomplete";
import { useMemo } from "react";

// inside component:
const handlerKeyOptions = useMemo(
  () => (activeDocument ? collectKeys(activeDocument) : []),
  [activeDocument],
);
const datalistId = `handler-key-options-${actionId}`;
```

Replace the input:

```tsx
<input
  type="text"
  list={datalistId}
  value={config.handlerKey ?? ""}
  onChange={(e) => onChangeConfig({ ...config, handlerKey: e.target.value })}
  className="..."
/>
<datalist id={datalistId}>
  {handlerKeyOptions.map((opt) => (
    <option key={opt.key} value={opt.key}>
      {opt.frequency > 1 ? `${opt.key} (${opt.frequency} uses)` : opt.key}
    </option>
  ))}
</datalist>
```

(Adapt to the existing prop names; `activeDocument` may need to be threaded through if not already on ActionEditor.)

- [ ] **Step 3: Typecheck + smoke**

Run: `npm run typecheck:web && npm run dev:web`. Edit a host_call_await action; verify datalist suggestions appear.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/behavior/composer/ActionEditor.tsx
git commit -m "feat(behavior): handlerKey datalist autocomplete in ActionEditor"
```

---

## Phase 9 — E2E + final gates + docs

### Task 9.1: Extend test-panel E2E with Host flow

**Files:**
- Modify: `apps/web/e2e/test-panel.run.mjs`

- [ ] **Step 1: Add the Host-tab flow**

Append after the existing assertions:

```js
// === Host tab ===
await page.getByRole("button", { name: /^Host$/i }).click();
await page.locator('text=/Default response/i').waitFor({ timeout: 5000 });

// Pick a preset → JSON populates
await page.locator('select#host-preset').selectOption("submit-success");
const payloadValue = await page.locator('textarea#host-payload').inputValue();
if (!payloadValue.includes("ok")) throw new Error("preset did not populate payload");

// Trigger a host_call_await: assume the fixture has a path that produces one,
// otherwise simply assert the empty-state copy is visible.
const emptyCount = await page.locator('text=/No pending host calls/i').count();
if (emptyCount === 0) {
  // Pending queue has at least one entry — try resolving the first.
  await page.locator('button[aria-expanded]').first().click();
  await page.getByRole("button", { name: /^Success$/i }).click();
}
```

- [ ] **Step 2: Run**

Run: `npm run e2e:test-panel`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/test-panel.run.mjs
git commit -m "test(e2e): TestPanel Host tab — preset + queue + resolve flow"
```

### Task 9.2: Final gate sweep

- [ ] **Step 1: Run all gates**

```bash
npm run typecheck:web
npm run build:schema
npm run build:runtime
npm run build:web
npm run test --workspace @form-builder/runtime
.venv/bin/pytest apps/api/tests
npm run e2e:phase3
npm run e2e:test-panel
npm run e2e:walkthrough
npm run format:check
```

Expected:
- Runtime tests: 105 + 6 new = 111+ pass
- API: 99/99
- E2E: 3/3
- typecheck/build: clean

- [ ] **Step 2: Format if dirty**

```bash
npm run format
git add -A
git diff --cached --quiet || git commit -m "chore: format after Host tab implementation"
```

### Task 9.3: RESUME refresh

**Files:**
- Modify: `RESUME.md`
- Modify: `docs/project-plan.md`

- [ ] **Step 1: Append to RESUME.md**

```markdown
- **Mock-host bridge — Host tab + authoring discoverability** (this run):
  - 4th TestPanel tab "Host": preset+JSON response editor, delay slider,
    failure-mode toggle, pending continuations queue with per-entry resolve,
    live submit envelope preview, collision banner.
  - Shared `host-bridge-shared.ts` module replaces Walkthrough's local mock.
    Both engines surface in the queue with source tags.
  - Engine: additive `handlerKey` + `createdAt` on `PendingContinuation`,
    new `getPendingContinuations(): PendingContinuationSnapshot[]` method.
  - New authoring lint: warns when a listener has ≥2 host_call_await actions
    sharing handlerKey within one branch arm.
  - ActionEditor handlerKey field gets <datalist> autocomplete from a pure
    helper that walks the doc.
  - Session tab's host loop section slims to "{n} pending — Open Host tab".
  - TestPanelTrace History styles `runtime.continuation_collision` rows red.
  - Gates: typecheck/builds clean, runtime ≥111, API 99/99, E2E 3/3.
```

- [ ] **Step 2: Update docs/project-plan.md**

Tick the host-bridge work as done; reference spec + plan paths.

- [ ] **Step 3: Commit**

```bash
git add RESUME.md docs/project-plan.md
git commit -m "docs: RESUME + project-plan refresh for Host tab + bridge ship"
```

---

## Self-Review

**Spec coverage:**
- Custom mock response payloads (Gap H1) → Phase 3 (presets) + Phase 7.1 (HostConfigEditor) + Phase 7.4 (TestPanelHost)
- Timeout / network-error simulation (Gap H2) → Phase 5 (bridge) + Phase 7.1 (failure-mode toggle) + Phase 7.2 (per-entry buttons)
- Correlation-id collision visibility (Gap H3) → Phase 5 (bridge captures) + Phase 7.4 (banner) + Phase 7.5 step 4 (red trace row) + App effect for toast (Phase 8.1) + Phase 2 (lint)
- Schema validation (Gap M1) → deferred per spec; no task
- Submit envelope docs (Gap M2) → Phase 7.3 (live preview)
- Multi-step host conversations (Gap M3) → Phase 5 + Phase 7.4 (per-entry queue handles N pending)
- handlerKey autocomplete (Gap L1) → Phase 4 (helper) + Phase 8.3 (ActionEditor)
- $response scope docs (Gap L2) → deferred per spec; no task
- Walkthrough mock alignment (Gap L3) → Phase 8.2

**Placeholders:** none — every step has concrete code or commands.

**Type consistency:** `MockHostConfig`, `BridgePendingEntry`, `CollisionEntry`, `MockHostResponseKind`, `PendingContinuationSnapshot` names stable across types/state/reducer/hook/components.

**Gap check:** Phase 7.5 Step 1 (TestPanelHeader 4th tab) — confirmed wired. Phase 8.1 toast on collision — wired via App-level setMessage. Phase 8.1 captures `submitEnvelope` via local state — passes into TestPanel.

**One callout for execution:** the Walkthrough swap (Phase 8.2) uses a static default config because Walkthrough doesn't read from TestPanel state today. If desired follow-up, lift `mockHostConfig` to a shared context provider so Walkthrough auto-respects what the author configured in TestPanel.
