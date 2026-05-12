# TestPanel Session Tab — Fold Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold the BehaviorWorkspace Simulator (~460 lines) into the unified TestPanel as a third **Session** tab, add an always-visible status strip + "Drives preview" badge, extend `TestPanelTrace` with a History view, and delete the legacy Simulator block. Spec: `docs/superpowers/specs/2026-05-12-test-panel-session-fold-design.md`.

**Architecture:** No engine changes. The TestPanel grows a Session tab housing session-lifecycle controls (Reset / Fill / Step / Submit) and host-loop stubs (Success / Error). A new `TestPanelStatusStrip` renders always-visible step / validation / submit pills, fed by an App-level `useEffect` that derives a snapshot from `runtimeSessionState`. `TestPanelTrace` extends with a History toggle that surfaces the existing `recordedReports` buffer. The BehaviorWorkspace Simulator section is replaced with a one-line breadcrumb pointing to the panel.

**Tech Stack:** React 18 + TypeScript + Vite (apps/web), pure-logic tests via `tsx --test` (no apps/web unit framework). E2E via the existing `apps/web/e2e/orchestrate.mjs` runner. Tailwind for styling.

---

## File Structure

### New files

| File | Responsibility |
|---|---|
| `apps/web/src/features/test-panel/TestPanelStatusStrip.tsx` | Always-visible status pills (step / validation / submit). |
| `apps/web/src/features/test-panel/TestPanelSession.tsx` | Session tab body — lifecycle controls, host loop, helper text. |
| `apps/web/src/features/test-panel/session-actions.ts` | Pure helpers: required-fill list derivation + per-semantic-type default values. |
| `apps/web/src/features/test-panel/session-actions.test.ts` | TDD tests for the helpers. |

### Modified files

| File | Change |
|---|---|
| `apps/web/src/features/test-panel/types.ts` | `TestPanelMode` adds `"session"`. Add `TestPanelStatusSnapshot` interface and `statusSnapshot` field on `TestPanelState`. |
| `apps/web/src/features/test-panel/state.ts` | New action `set-status-snapshot`. Reducer writes `statusSnapshot`. |
| `apps/web/src/features/test-panel/state.test.ts` | New tests for the action and the widened mode union. |
| `apps/web/src/features/test-panel/useTestPanelState.ts` | Add `setStatusSnapshot` callback. Subscribe to `engine.subscribeReports` when `mode === "session"` (in addition to `"record"`). |
| `apps/web/src/features/test-panel/TestPanelHeader.tsx` | Add 3rd mode button "Session" with `aria-pressed`. Add persistent "Drives preview" badge in header. |
| `apps/web/src/features/test-panel/TestPanel.tsx` | Render `<TestPanelStatusStrip>` between header and tabs. Branch on `mode === "session"` to render `<TestPanelSession>`. Pipe new callbacks. |
| `apps/web/src/features/test-panel/TestPanelTrace.tsx` | Extend toggle to `By listener \| By receiver \| History`. Add history view (scrolling list of `recordedReports`; click to expand inline with chain context). |
| `apps/web/src/features/test-panel/index.ts` | Re-export new types if needed. |
| `apps/web/src/App.tsx` | Add `useEffect` deriving status snapshot from `runtimeSessionState` → `setStatusSnapshot`. Pipe session-lifecycle + host-loop callbacks into TestPanel. Drop the Simulator-related props from BehaviorWorkspace mount. Eventually remove orphaned handlers. |
| `apps/web/src/features/behavior/manager/BehaviorWorkspace.tsx` | Delete entire Simulator section (~lines 3781–4220). Replace with single-line breadcrumb. Drop simulator-related props from interface. |
| `apps/web/e2e/test-panel.run.mjs` | Extend with a Session-tab flow (Fill → Submit → Success → History). |

---

## Phase 1 — Status snapshot infrastructure

### Task 1.1: Extend types

**Files:**
- Modify: `apps/web/src/features/test-panel/types.ts`

- [ ] **Step 1: Update the type module**

In `apps/web/src/features/test-panel/types.ts`, update `TestPanelMode` and add `TestPanelStatusSnapshot` + extend `TestPanelState`:

```ts
export type TestPanelMode = "synth" | "record" | "session";

export interface TestPanelStatusSnapshot {
  /** Resolved title of the current step (from `document.steps`). */
  currentStepLabel: string | null;
  /** 0-based index of the current step. -1 if no current step. */
  currentStepIndex: number;
  totalSteps: number;
  validationValid: boolean;
  /** Mirrors `RuntimeSessionState["submit"]["status"]`. */
  submitStatus: "idle" | "submitting" | "success" | "error";
  /** Pending host-loop correlation id (when submitStatus === "submitting"). */
  pendingCorrelationId: string | null;
}

export interface TestPanelState {
  open: boolean;
  mode: TestPanelMode;
  dockSide: TestPanelDockSide;
  selection: TestPanelSelection;
  lastReport: RuntimeDispatchReport | null;
  recordedReports: { id: string; timestamp: string; report: RuntimeDispatchReport }[];
  /** Always-visible status snapshot. Updated by App from runtimeSessionState. */
  statusSnapshot: TestPanelStatusSnapshot | null;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS (consumers may now have warnings about unhandled `"session"` mode — that's OK and gets fixed in later tasks).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/test-panel/types.ts
git commit -m "feat(test-panel): types for Session mode + status snapshot"
```

### Task 1.2: Reducer + tests

**Files:**
- Modify: `apps/web/src/features/test-panel/state.ts`
- Modify: `apps/web/src/features/test-panel/state.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/src/features/test-panel/state.test.ts`:

```ts
test("set-status-snapshot writes the snapshot field", () => {
  const snapshot = {
    currentStepLabel: "Personal Info",
    currentStepIndex: 0,
    totalSteps: 3,
    validationValid: true,
    submitStatus: "idle" as const,
    pendingCorrelationId: null,
  };
  const next = testPanelReducer(initialTestPanelState, {
    type: "set-status-snapshot",
    snapshot,
  });
  assert.deepEqual(next.statusSnapshot, snapshot);
});

test("set-status-snapshot can clear the snapshot to null", () => {
  const seeded = testPanelReducer(initialTestPanelState, {
    type: "set-status-snapshot",
    snapshot: {
      currentStepLabel: "Step",
      currentStepIndex: 0,
      totalSteps: 1,
      validationValid: true,
      submitStatus: "idle",
      pendingCorrelationId: null,
    },
  });
  const cleared = testPanelReducer(seeded, { type: "set-status-snapshot", snapshot: null });
  assert.equal(cleared.statusSnapshot, null);
});

test("set-mode accepts session mode", () => {
  const next = testPanelReducer(initialTestPanelState, { type: "set-mode", mode: "session" });
  assert.equal(next.mode, "session");
});
```

- [ ] **Step 2: Run tests to verify fail**

Run: `npx tsx --test apps/web/src/features/test-panel/state.test.ts`
Expected: FAIL (action type / payload not in union; `set-mode` test passes since the reducer is permissive on the mode value but TypeScript may complain at the call site when types update).

- [ ] **Step 3: Implement**

In `apps/web/src/features/test-panel/state.ts`:

a. Update `initialTestPanelState` to include `statusSnapshot: null`.

b. Add to `TestPanelAction` union:

```ts
| { type: "set-status-snapshot"; snapshot: TestPanelStatusSnapshot | null }
```

c. Add a case in the reducer:

```ts
case "set-status-snapshot":
  return { ...state, statusSnapshot: action.snapshot };
```

(Place after `set-last-report` for grouping.)

- [ ] **Step 4: Run tests**

Run: `npx tsx --test apps/web/src/features/test-panel/state.test.ts`
Expected: PASS — 8 (existing) + 3 new = 11.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/test-panel/state.ts apps/web/src/features/test-panel/state.test.ts
git commit -m "feat(test-panel): reducer set-status-snapshot + session mode in union"
```

### Task 1.3: Hook — setStatusSnapshot + session subscribe

**Files:**
- Modify: `apps/web/src/features/test-panel/useTestPanelState.ts`

- [ ] **Step 1: Add setStatusSnapshot callback**

In `useTestPanelState.ts`, after the existing `setLastReport` callback, add:

```ts
const setStatusSnapshot = useCallback(
  (snapshot: TestPanelStatusSnapshot | null) =>
    dispatch({ type: "set-status-snapshot", snapshot }),
  [],
);
```

Add `TestPanelStatusSnapshot` to the imports from `./types`.

Add `setStatusSnapshot` to the returned object.

Add it to `UseTestPanelStateResult` interface.

- [ ] **Step 2: Subscribe to engine in session mode too**

Find the existing `useEffect` that subscribes to `engine.subscribeReports` when `state.open && state.mode === "record"`. Update the gate to:

```ts
if (!engine || !state.open) return;
if (state.mode !== "record" && state.mode !== "session") return;
```

(Synth mode does NOT auto-subscribe — Synth fires explicitly via `dispatchWithReport` and writes `lastReport` from the App handler; the panel doesn't double-record those into `recordedReports`.)

Wait — actually Synth's report is also worth appending to `recordedReports` so History view sees it. Reconsider:

Replace the gate with:

```ts
if (!engine || !state.open) return;
// Subscribe in record + session modes; synth events get appended via the explicit Fire handler.
if (state.mode !== "record" && state.mode !== "session") return;
```

Synth mode's `lastReport` is enough for the by-listener default view. Live and Session both need the running buffer.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/test-panel/useTestPanelState.ts
git commit -m "feat(test-panel): hook exposes setStatusSnapshot + subscribes in session mode"
```

### Task 1.4: TestPanelStatusStrip component

**Files:**
- Create: `apps/web/src/features/test-panel/TestPanelStatusStrip.tsx`

- [ ] **Step 1: Implement**

```tsx
import type { TestPanelStatusSnapshot } from "./types";

export interface TestPanelStatusStripProps {
  snapshot: TestPanelStatusSnapshot | null;
}

const validationStyles = "rounded bg-emerald-100 px-2 py-0.5 text-emerald-800";
const validationInvalidStyles = "rounded bg-rose-100 px-2 py-0.5 text-rose-800";
const submitStyles: Record<TestPanelStatusSnapshot["submitStatus"], string> = {
  idle: "rounded bg-slate-100 px-2 py-0.5 text-slate-700",
  submitting: "rounded bg-amber-100 px-2 py-0.5 text-amber-900",
  success: "rounded bg-emerald-100 px-2 py-0.5 text-emerald-800",
  error: "rounded bg-rose-100 px-2 py-0.5 text-rose-800",
};

export function TestPanelStatusStrip({ snapshot }: TestPanelStatusStripProps) {
  if (!snapshot) {
    return (
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-500">
        <span>No document loaded</span>
      </div>
    );
  }
  const stepLabel =
    snapshot.currentStepIndex >= 0
      ? `Step ${snapshot.currentStepIndex + 1} of ${snapshot.totalSteps}${snapshot.currentStepLabel ? ` · ${snapshot.currentStepLabel}` : ""}`
      : "No active step";
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs">
      <span className="rounded bg-slate-200 px-2 py-0.5 text-slate-800">{stepLabel}</span>
      <span className={snapshot.validationValid ? validationStyles : validationInvalidStyles}>
        {snapshot.validationValid ? "Valid" : "Invalid"}
      </span>
      <span className={submitStyles[snapshot.submitStatus]}>Submit: {snapshot.submitStatus}</span>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/test-panel/TestPanelStatusStrip.tsx
git commit -m "feat(test-panel): TestPanelStatusStrip (always-visible step/validation/submit pills)"
```

---

## Phase 2 — Session tab body

### Task 2.1: session-actions pure helpers + tests

**Files:**
- Create: `apps/web/src/features/test-panel/session-actions.ts`
- Create: `apps/web/src/features/test-panel/session-actions.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collectRequiredFillTargets,
  defaultValueForField,
} from "./session-actions";
import type { AuthoringField, AuthoringStep, RuntimeSessionState } from "@form-builder/schema";

const baseField = (over: Partial<AuthoringField>): AuthoringField =>
  ({
    id: "f1",
    semanticType: "text",
    label: "Field 1",
    required: true,
    rendererHints: { component: "input" },
    options: [],
    ...over,
  }) as AuthoringField;

test("defaultValueForField returns sensible defaults per semantic type", () => {
  assert.equal(defaultValueForField(baseField({ semanticType: "text" })), "Test value");
  assert.equal(defaultValueForField(baseField({ semanticType: "number" })), 0);
  assert.equal(defaultValueForField(baseField({ semanticType: "boolean" })), true);
  assert.equal(
    defaultValueForField(baseField({ semanticType: "radio", options: [{ value: "a", label: "A" }] })),
    "a",
  );
  assert.deepEqual(
    defaultValueForField(baseField({ semanticType: "checkbox", options: [{ value: "x", label: "X" }] })),
    ["x"],
  );
  assert.match(
    defaultValueForField(baseField({ semanticType: "date" })) as string,
    /^\d{4}-\d{2}-\d{2}$/,
  );
});

test("collectRequiredFillTargets returns required, visible, enabled fields with no value yet", () => {
  const step = {
    id: "s1",
    title: "Step 1",
    sections: [
      {
        id: "sec1",
        fields: [
          baseField({ id: "a", required: true }),
          baseField({ id: "b", required: false }),
          baseField({ id: "c", required: true }),
        ],
        groups: [],
      },
    ],
  } as unknown as AuthoringStep;
  const sessionState = {
    values: { a: "", c: "already filled" },
    nodes: {
      a: { visible: true, enabled: true, required: true },
      b: { visible: true, enabled: true, required: false },
      c: { visible: true, enabled: true, required: true },
    },
  } as unknown as RuntimeSessionState;
  const targets = collectRequiredFillTargets(step, sessionState);
  // Should pick "a" (required + empty), skip "b" (not required), skip "c" (already filled).
  assert.deepEqual(targets.map((t) => t.field.id), ["a"]);
});

test("collectRequiredFillTargets skips invisible fields", () => {
  const step = {
    id: "s1",
    title: "Step",
    sections: [
      { id: "sec", fields: [baseField({ id: "x" })], groups: [] },
    ],
  } as unknown as AuthoringStep;
  const sessionState = {
    values: {},
    nodes: { x: { visible: false, enabled: true, required: true } },
  } as unknown as RuntimeSessionState;
  assert.equal(collectRequiredFillTargets(step, sessionState).length, 0);
});

test("collectRequiredFillTargets skips disabled fields", () => {
  const step = {
    id: "s1",
    title: "Step",
    sections: [
      { id: "sec", fields: [baseField({ id: "y" })], groups: [] },
    ],
  } as unknown as AuthoringStep;
  const sessionState = {
    values: {},
    nodes: { y: { visible: true, enabled: false, required: true } },
  } as unknown as RuntimeSessionState;
  assert.equal(collectRequiredFillTargets(step, sessionState).length, 0);
});
```

- [ ] **Step 2: Run tests — expect fail**

Run: `npx tsx --test apps/web/src/features/test-panel/session-actions.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
import type { AuthoringField, AuthoringStep, RuntimeSessionState } from "@form-builder/schema";

export interface RequiredFillTarget {
  field: AuthoringField;
  defaultValue: unknown;
}

export function defaultValueForField(field: AuthoringField): unknown {
  switch (field.semanticType) {
    case "number":
      return 0;
    case "boolean":
      return true;
    case "date": {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const day = String(today.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
    case "radio":
    case "select":
      return field.options?.[0]?.value ?? "";
    case "checkbox":
      return field.options?.[0]?.value ? [field.options[0].value] : [];
    case "text":
    case "textarea":
    case "email":
    case "phone":
    default:
      return "Test value";
  }
}

function* iterateStepFields(step: AuthoringStep): Generator<AuthoringField> {
  for (const section of step.sections ?? []) {
    for (const field of section.fields ?? []) {
      yield field;
    }
    for (const group of section.groups ?? []) {
      for (const field of group.fields ?? []) {
        yield field;
      }
    }
  }
}

function fieldHasValue(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function collectRequiredFillTargets(
  step: AuthoringStep,
  sessionState: RuntimeSessionState,
): RequiredFillTarget[] {
  const targets: RequiredFillTarget[] = [];
  for (const field of iterateStepFields(step)) {
    if (!field.required) continue;
    const node = sessionState.nodes[field.id];
    if (node && node.visible === false) continue;
    if (node && node.enabled === false) continue;
    if (fieldHasValue(sessionState.values[field.id])) continue;
    targets.push({ field, defaultValue: defaultValueForField(field) });
  }
  return targets;
}
```

(`AuthoringStep` may have a slightly different shape — check `packages/schema/src/authoring.ts` for the exact field-traversal pattern; mirror what existing helpers like `findAuthoringFieldById` do.)

- [ ] **Step 4: Run tests**

Run: `npx tsx --test apps/web/src/features/test-panel/session-actions.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/test-panel/session-actions.ts apps/web/src/features/test-panel/session-actions.test.ts
git commit -m "feat(test-panel): session-actions helpers (required-fill targets + defaults)"
```

### Task 2.2: TestPanelSession component

**Files:**
- Create: `apps/web/src/features/test-panel/TestPanelSession.tsx`

- [ ] **Step 1: Implement**

```tsx
import type { TestPanelStatusSnapshot } from "./types";

export interface TestPanelSessionProps {
  statusSnapshot: TestPanelStatusSnapshot | null;
  onResetSession: () => void;
  onFillRequired: () => void;
  onRunStep: () => void;
  onSubmit: () => void;
  onSimulateHostSuccess: () => void;
  onSimulateHostError: () => void;
}

export function TestPanelSession({
  statusSnapshot,
  onResetSession,
  onFillRequired,
  onRunStep,
  onSubmit,
  onSimulateHostSuccess,
  onSimulateHostError,
}: TestPanelSessionProps) {
  const documentReady = statusSnapshot !== null;
  const submitting = statusSnapshot?.submitStatus === "submitting";

  return (
    <section className="space-y-4 p-3">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-slate-500">Lifecycle</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <SessionButton
            label="Reset"
            hint="Clear values + state"
            onClick={onResetSession}
            disabled={!documentReady}
          />
          <SessionButton
            label="Fill required"
            hint="Auto-fill required fields"
            onClick={onFillRequired}
            disabled={!documentReady}
          />
          <SessionButton
            label="Run step"
            hint="Advance to next step"
            onClick={onRunStep}
            disabled={!documentReady}
          />
          <SessionButton
            label="Submit"
            hint="Trigger form.submit"
            onClick={onSubmit}
            disabled={!documentReady}
            variant="primary"
          />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-slate-500">Host loop</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <SessionButton
            label="Simulate success"
            hint="Resolve pending host await"
            onClick={onSimulateHostSuccess}
            disabled={!submitting}
          />
          <SessionButton
            label="Simulate error"
            hint="Reject pending host await"
            onClick={onSimulateHostError}
            disabled={!submitting}
            variant="danger"
          />
        </div>
        <p className="mt-2 rounded bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
          {submitting
            ? `Submit correlation ${statusSnapshot?.pendingCorrelationId ?? "unknown"} is waiting.`
            : "Run Submit. Active when waiting on host."}
        </p>
      </div>
    </section>
  );
}

interface SessionButtonProps {
  label: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "primary" | "danger";
}

function SessionButton({ label, hint, onClick, disabled, variant = "default" }: SessionButtonProps) {
  const styles =
    variant === "primary"
      ? "bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50"
      : variant === "danger"
        ? "bg-rose-600 text-white hover:bg-rose-500 disabled:opacity-50"
        : "bg-slate-200 text-slate-800 hover:bg-slate-300 disabled:opacity-50";
  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`w-full rounded px-3 py-1.5 text-sm font-semibold ${styles}`}
      >
        {label}
      </button>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/test-panel/TestPanelSession.tsx
git commit -m "feat(test-panel): TestPanelSession (lifecycle + host loop controls)"
```

### Task 2.3: Update TestPanelHeader (3rd tab + badge)

**Files:**
- Modify: `apps/web/src/features/test-panel/TestPanelHeader.tsx`

- [ ] **Step 1: Add session button + drives-preview badge**

In the existing `TestPanelHeader.tsx`, add a third button to the mode toggle group (between or after existing two; make sure `aria-pressed` is set per the existing pattern). Add a "Drives preview" badge in the title row.

Sketch (adapt to existing markup):

```tsx
<div className="flex items-center gap-2">
  <h3 className="text-sm font-semibold">Test panel</h3>
  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
    Drives preview
  </span>
</div>

<div className="flex gap-0.5 text-xs">
  <button type="button" onClick={() => onSetMode("synth")} aria-pressed={mode === "synth"} className={...}>
    Synth
  </button>
  <button type="button" onClick={() => onSetMode("record")} aria-pressed={mode === "record"} className={...}>
    Live record
  </button>
  <button type="button" onClick={() => onSetMode("session")} aria-pressed={mode === "session"} className={...}>
    Session
  </button>
</div>
```

(The existing buttons already use a 2-way segmented pattern — extend to 3-way. Round only the leftmost and rightmost buttons.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/test-panel/TestPanelHeader.tsx
git commit -m "feat(test-panel): Header gets Session mode tab + Drives-preview badge"
```

### Task 2.4: Update TestPanel container (render strip + session branch)

**Files:**
- Modify: `apps/web/src/features/test-panel/TestPanel.tsx`

- [ ] **Step 1: Add new props**

Add to `TestPanelProps`:

```ts
statusSnapshot: TestPanelStatusSnapshot | null;
onResetSession: () => void;
onFillRequired: () => void;
onRunStep: () => void;
onSubmit: () => void;
onSimulateHostSuccess: () => void;
onSimulateHostError: () => void;
```

Import `TestPanelStatusSnapshot` from `./types`.

- [ ] **Step 2: Render `<TestPanelStatusStrip>` between header and tabs**

Add `<TestPanelStatusStrip snapshot={props.statusSnapshot} />` immediately after `<TestPanelHeader />` and before the body.

- [ ] **Step 3: Branch on mode === "session"**

In the existing branch where `mode === "synth" ? <TestPanelInputs /> : <RecordIndicator />`, extend to:

```tsx
{mode === "synth" ? (
  <TestPanelInputs ... />
) : mode === "record" ? (
  <RecordIndicator ... />
) : (
  <TestPanelSession
    statusSnapshot={statusSnapshot}
    onResetSession={onResetSession}
    onFillRequired={onFillRequired}
    onRunStep={onRunStep}
    onSubmit={onSubmit}
    onSimulateHostSuccess={onSimulateHostSuccess}
    onSimulateHostError={onSimulateHostError}
  />
)}
```

(The RecordIndicator is the small "Recording. Interact..." status block — keep its existing shape.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/test-panel/TestPanel.tsx
git commit -m "feat(test-panel): container renders StatusStrip + Session mode body"
```

---

## Phase 3 — Trace history view

### Task 3.1: Extend TestPanelTrace with History toggle

**Files:**
- Modify: `apps/web/src/features/test-panel/TestPanelTrace.tsx`

- [ ] **Step 1: Add new props**

Extend `TestPanelTraceProps`:

```ts
recordedReports?: { id: string; timestamp: string; report: RuntimeDispatchReport }[];
```

The `report` prop stays as the single "current" report (latest in synth/session, or the head of recordedReports in record).

- [ ] **Step 2: Add History toggle**

Update the local `view` state union to `"by-listener" | "by-receiver" | "history"`. Add a third button to the existing 2-button segmented toggle:

```tsx
<button
  type="button"
  onClick={() => setView("history")}
  aria-pressed={view === "history"}
  className={`rounded px-2 py-0.5 ${view === "history" ? "bg-blue-600 text-white" : "bg-slate-100"}`}
>
  History
</button>
```

- [ ] **Step 3: Render history view**

When `view === "history"`, render the new `<HistoryView>` component (defined in same file):

```tsx
function HistoryView({
  recordedReports,
  nodeLabelById,
}: {
  recordedReports: TestPanelTraceProps["recordedReports"];
  nodeLabelById?: Map<string, string>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  if (!recordedReports || recordedReports.length === 0) {
    return <p className="text-sm text-slate-500">No recorded events yet.</p>;
  }
  return (
    <ul className="space-y-1">
      {[...recordedReports].reverse().map((entry, idx, arr) => {
        const isOpen = expandedId === entry.id;
        return (
          <li key={entry.id} className="rounded border border-slate-200">
            <button
              type="button"
              onClick={() => setExpandedId(isOpen ? null : entry.id)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-slate-50"
            >
              <span>
                <span className="font-semibold">{entry.report.event.type}</span>
                <span className="ml-2 text-slate-500">
                  {entry.report.listeners.filter((l) => l.matched).length}/{entry.report.listeners.length} listeners
                </span>
              </span>
              <span className="text-slate-500">{formatRelativeTime(entry.timestamp)}</span>
            </button>
            {isOpen ? (
              <div className="border-t border-slate-200 p-2">
                <ByListenerView report={entry.report} nodeLabelById={nodeLabelById} />
                <ChainContext recordedReports={arr} index={idx} nodeLabelById={nodeLabelById} />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}
```

`ByListenerView` is the existing render function — extract it into a top-level helper (if not already) so it can be reused.

- [ ] **Step 4: Implement chain context (prior 2 + next 2)**

Add `ChainContext` component:

```tsx
function ChainContext({
  recordedReports,
  index,
  nodeLabelById,
}: {
  recordedReports: NonNullable<TestPanelTraceProps["recordedReports"]>;
  index: number;
  nodeLabelById?: Map<string, string>;
}) {
  // recordedReports here is reversed, so prior = next 2, next = prior 2 in the original direction.
  const beforeWindow = recordedReports.slice(Math.max(0, index - 2), index);
  const afterWindow = recordedReports.slice(index + 1, index + 3);
  if (beforeWindow.length === 0 && afterWindow.length === 0) return null;
  return (
    <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs">
      <p className="mb-1 font-semibold text-slate-700">Chain context</p>
      {beforeWindow.length ? (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">After this</p>
          <ul className="ml-2">
            {beforeWindow.map((entry) => (
              <li key={entry.id}>
                ▸ {entry.report.event.type} <span className="text-slate-500">@ {formatRelativeTime(entry.timestamp)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {afterWindow.length ? (
        <div className="mt-1">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Before this</p>
          <ul className="ml-2">
            {afterWindow.map((entry) => (
              <li key={entry.id}>
                ▸ {entry.report.event.type} <span className="text-slate-500">@ {formatRelativeTime(entry.timestamp)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
```

(Naming reflects that the recorded reports list is rendered in reverse-chronological order in the UI, but window labels are about chronological direction relative to the selected entry.)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/test-panel/TestPanelTrace.tsx
git commit -m "feat(test-panel): TestPanelTrace History view with chain context"
```

---

## Phase 4 — App.tsx wiring

### Task 4.1: Status snapshot derivation effect

**Files:**
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Add the effect**

Locate the area in `App.tsx` where `runtimeSessionState` is consumed (search for it). Add a new `useEffect`:

```ts
useEffect(() => {
  if (!activeDocument) {
    testPanel.setStatusSnapshot(null);
    return;
  }
  const sessionState = runtimeSessionState;
  if (!sessionState) {
    testPanel.setStatusSnapshot(null);
    return;
  }
  const currentStepIndex = sessionState.currentStepId
    ? activeDocument.steps.findIndex((s) => s.id === sessionState.currentStepId)
    : -1;
  const currentStepLabel =
    currentStepIndex >= 0 ? (activeDocument.steps[currentStepIndex]?.title ?? null) : null;
  testPanel.setStatusSnapshot({
    currentStepLabel,
    currentStepIndex,
    totalSteps: activeDocument.steps.length,
    validationValid: sessionState.validation?.valid !== false,
    submitStatus: sessionState.submit?.status ?? "idle",
    pendingCorrelationId: sessionState.submit?.lastCorrelationId ?? null,
  });
}, [activeDocument, runtimeSessionState, testPanel.setStatusSnapshot]);
```

- [ ] **Step 2: Typecheck + smoke**

Run: `npm run typecheck:web`
Expected: PASS. Run `npm run dev:web`. Open the panel — status strip should populate.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat(web): derive TestPanel status snapshot from runtimeSessionState"
```

### Task 4.2: Wire session lifecycle callbacks

**Files:**
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Promote existing handlers to useCallback**

The existing `handleResetRuntimeSession`, `handlePopulateRequiredRuntimeValues`, `handleRunCurrentRuntimeStep`, `handleRunRuntimeSubmit` are plain function declarations in App.tsx (around lines 4800, 4886, 4927, 4948). Wrap each in `useCallback` so the TestPanel can receive stable references.

(The function bodies stay the same; just add `const X = useCallback(() => { ... }, [deps])`.)

- [ ] **Step 2: Pass into TestPanel**

In the `<TestPanel>` JSX, add the props:

```tsx
statusSnapshot={testPanel.state.statusSnapshot}
onResetSession={handleResetRuntimeSession}
onFillRequired={handlePopulateRequiredRuntimeValues}
onRunStep={handleRunCurrentRuntimeStep}
onSubmit={handleRunRuntimeSubmit}
```

- [ ] **Step 3: Smoke**

Run: `npm run dev:web`. Open panel → switch to Session tab → click Reset → verify the engine + preview state reset (existing simulator behavior moved to panel).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat(web): wire session-lifecycle handlers into TestPanel-Session tab"
```

### Task 4.3: Wire host loop callbacks

**Files:**
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Promote handlers**

Wrap `handleMockSubmitSuccess` and `handleMockSubmitError` (lines 4826, 4856) in `useCallback`.

- [ ] **Step 2: Pass into TestPanel**

```tsx
onSimulateHostSuccess={handleMockSubmitSuccess}
onSimulateHostError={handleMockSubmitError}
```

- [ ] **Step 3: Pass recordedReports to TestPanel for History view**

In the existing `<TestPanel>` JSX, also add:

```tsx
recordedReports={testPanel.state.recordedReports}
```

(This is already on `state`; just thread it through if not already.)

- [ ] **Step 4: Smoke**

Run: `npm run dev:web`. Switch to Session tab → click Submit → wait until status pill shows "submitting" → click Simulate success → verify status pill flips to "success" + a trace appears.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat(web): wire host-loop simulate buttons + recordedReports into TestPanel"
```

---

## Phase 5 — Delete BehaviorWorkspace Simulator section

### Task 5.1: Delete the simulator render block

**Files:**
- Modify: `apps/web/src/features/behavior/manager/BehaviorWorkspace.tsx`

- [ ] **Step 1: Find the boundaries**

```bash
grep -n "ref={simulatorSectionRef}\|Simulator\|Authored runtime evidence\|Advanced session debug" apps/web/src/features/behavior/manager/BehaviorWorkspace.tsx | head
```

Identify the start of the `<div ref={simulatorSectionRef}>` block (around line 3781) and its closing `</div>` (around line ~4220).

- [ ] **Step 2: Replace with breadcrumb**

Delete the entire block. Replace with:

```tsx
<div className="rounded-[1.15rem] border border-soft bg-white p-4">
  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Session debug</p>
  <h4 className="mt-2 text-lg font-semibold text-slate-950">Moved to Test panel</h4>
  <p className="mt-2 text-sm leading-6 text-slate-600">
    Session-lifecycle controls (Reset, Fill required, Run step, Submit) and host-loop simulation now live in the unified
    Test panel — open with <kbd className="rounded bg-slate-200 px-1.5 py-0.5 text-xs">⌘K</kbd> /
    <kbd className="rounded bg-slate-200 px-1.5 py-0.5 text-xs">Ctrl+K</kbd>, then switch to the
    <strong> Session</strong> tab.
  </p>
</div>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS — there will be unused variables (`simulatorSectionRef`, `selectedRuntimeEvidenceKey`, `latestTraceEntry`, etc.) but `noUnusedLocals` is off so it stays green. (Cleanup in Task 5.3.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/behavior/manager/BehaviorWorkspace.tsx
git commit -m "refactor(behavior): delete Simulator section + replace with TestPanel breadcrumb"
```

### Task 5.2: Drop simulator-related props from BehaviorWorkspace interface

**Files:**
- Modify: `apps/web/src/features/behavior/manager/BehaviorWorkspace.tsx`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Find the props**

```bash
grep -n "onHandleResetRuntimeSession\|onHandlePopulateRequiredRuntimeValues\|onHandleRunCurrentRuntimeStep\|onHandleRunRuntimeSubmit\|onHandleMockSubmitSuccess\|onHandleMockSubmitError\|simulatorSectionRef" apps/web/src/features/behavior/manager/BehaviorWorkspace.tsx
```

- [ ] **Step 2: Remove from interface + destructure**

Remove each from `BehaviorWorkspaceProps` and from the destructuring at top of the component.

Also remove `simulatorSectionRef` from props if it was external. If it was created locally, remove the `useRef`.

- [ ] **Step 3: Remove from App.tsx call site**

In `App.tsx`, find the `<BehaviorWorkspace>` mount and remove the matching props.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/features/behavior/manager/BehaviorWorkspace.tsx
git commit -m "refactor(behavior): drop simulator-related props from BehaviorWorkspace"
```

### Task 5.3: Remove orphaned trace-evidence state from App.tsx + BehaviorWorkspace

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/features/behavior/manager/BehaviorWorkspace.tsx`

- [ ] **Step 1: Audit**

```bash
grep -n "selectedRuntimeEvidenceKey\|latestTraceEntry\|isShowingLatestAuthoredEvidence\|selectedStructuredTraceEvidence\|selectedTraceChain\|currentBehaviorSelectionSummary" apps/web/src/App.tsx apps/web/src/features/behavior/manager/BehaviorWorkspace.tsx
```

For each match, determine if it was used ONLY by the Simulator section. If yes, delete the state declaration, derived memo, and any handler that produced it.

- [ ] **Step 2: Delete confirmed orphans**

Remove the dead code paths — declarations + setters + dependent effects/memos.

- [ ] **Step 3: Typecheck + smoke**

Run: `npm run typecheck:web && npm run dev:web`. Verify the workspace renders, behavior manager is functional, panel still works.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/features/behavior/manager/BehaviorWorkspace.tsx
git commit -m "refactor(web): remove trace-evidence state orphaned by Simulator deletion"
```

---

## Phase 6 — E2E + final gates

### Task 6.1: Extend test-panel E2E with Session flow

**Files:**
- Modify: `apps/web/e2e/test-panel.run.mjs`

- [ ] **Step 1: Add the Session-tab flow**

After the existing assertions in the run, add:

```js
// Switch to Session tab
await page.getByRole("button", { name: /Session/i }).click();

// Click Fill required → expect form populated
await page.getByRole("button", { name: /Fill required/i }).click();
// (no immediate assertion — Fill does not block the test, but the trace strip should now show field.change events)

// Click Submit
await page.getByRole("button", { name: /^Submit$/i }).click();

// Status strip should show "Submit: submitting" or "success" depending on whether host_call_await is in the fixture
await page.locator('text=/Submit:.*(submitting|success)/i').waitFor({ timeout: 5000 });

// If submitting, simulate success
const submittingNow = await page.locator('text=/Submit: submitting/i').count();
if (submittingNow > 0) {
  await page.getByRole("button", { name: /Simulate success/i }).click();
  await page.locator('text=/Submit: success/i').waitFor({ timeout: 5000 });
}

// Switch trace toggle to History → expect ≥1 entry
await page.getByRole("button", { name: /History/i }).click();
await page.locator('text=/0\\d:\\d\\d:\\d\\d/').first().waitFor({ timeout: 3000 });
```

- [ ] **Step 2: Run E2E**

Run: `npm run e2e:test-panel`
Expected: PASS. (If the fixture document doesn't reach `submitting`, the conditional on `simulate success` short-circuits gracefully.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/test-panel.run.mjs
git commit -m "test(e2e): TestPanel Session tab — Fill / Submit / Success / History flow"
```

### Task 6.2: Full gate sweep

- [ ] **Step 1: All gates**

Run each:

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

All must pass:
- Runtime: 105/105 (no engine change)
- API: 99/99
- E2E: 3/3
- Reducer + session-actions tests: state.test.ts 11/11 (was 8) + session-actions.test.ts 4/4

- [ ] **Step 2: Format if dirty**

If `format:check` fails, run `npm run format` then re-check. Commit:

```bash
git add -A
git diff --cached --quiet || git commit -m "chore: format after Session tab implementation"
```

### Task 6.3: RESUME refresh

**Files:**
- Modify: `RESUME.md`
- Modify: `docs/project-plan.md`

- [ ] **Step 1: Add a "What Was Just Completed" entry**

Append to `RESUME.md` near the top:

```markdown
- **TestPanel Session tab — Simulator fold** (this run):
  - Folded BehaviorWorkspace Simulator (~460 lines deleted) into the unified TestPanel as a third "Session" tab
  - Always-visible status strip (step / validation / submit), persistent "Drives preview" badge in header
  - Session lifecycle: Reset / Fill required / Run step / Submit
  - Host loop: Simulate success / error (resolves pending host_call_await)
  - TestPanelTrace now has a History view with chain context (prior 2 / next 2 reports)
  - BehaviorWorkspace gets a one-line breadcrumb to the panel
  - No engine changes; reducer + session-actions tests added
  - Gates: typecheck/builds clean, runtime 105/105, API 99/99, E2E 3/3 (test-panel suite extended)
```

- [ ] **Step 2: Update project-plan.md**

If there's a relevant section about test-tooling consolidation, mark Simulator-fold as done and reference the spec/plan paths.

- [ ] **Step 3: Commit**

```bash
git add RESUME.md docs/project-plan.md
git commit -m "docs: RESUME + project-plan refresh for Session-tab fold"
```

---

## Self-Review

**Spec coverage:**
- Status snapshot: Phase 1.1 (types) + 1.2 (reducer) + 1.3 (hook) + 1.4 (StatusStrip) + 4.1 (App effect)
- Session tab body: Phase 2.1 (helpers) + 2.2 (component) + 2.3 (header tab) + 2.4 (container branch) + 4.2-4.3 (App callbacks)
- History view: Phase 3.1 (toggle + component + chain context)
- Simulator deletion: Phase 5.1 (block) + 5.2 (props) + 5.3 (orphan state)
- E2E + gates: Phase 6
- "Drives preview" badge: Phase 2.3 (in TestPanelHeader)
- Onboarding hints (per-button hint text): Phase 2.2 (`SessionButton.hint` prop)
- Confirm dialog for Reset (spec error-handling) — NOT covered as separate task. Adding inline:

**ADDED Task 5.1.5: Confirm dialog for Reset during pending host loop**

In `TestPanelSession.onResetSession` handler (App side), wrap with the existing `ConfirmDialog`:

If `statusSnapshot.submitStatus === "submitting"`, show confirm dialog:
> "Reset will discard the in-flight submit (correlation X). Continue?" — type "reset" to confirm.

Otherwise call `onResetSession()` directly.

This belongs in App.tsx's `handleResetRuntimeSession` wrapper, not in the component. Update Task 4.2 Step 1 to include this guard.

**Placeholder scan:** none — every step has concrete code.

**Type consistency:** `TestPanelStatusSnapshot` field names stable across types.ts / state.test.ts / TestPanelStatusStrip / TestPanelSession / App effect. `setStatusSnapshot` callback signature stable. `recordedReports` shape unchanged from prior phases.

**Gap fix applied inline above (Reset confirm).** Ready for execution.
