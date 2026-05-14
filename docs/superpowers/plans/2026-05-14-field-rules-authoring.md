# Field-Rules Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first authoring slice that lets the author declare "when field X equals value Y, show / hide / mark required / mark optional field Z" without hand-building a runtime listener. Two entry points (affected-field inspector + trigger-field behavior section) feed the same wizard. Spec: `docs/superpowers/specs/2026-05-14-field-rules-authoring-design.md`.

**Architecture:** Pure helpers in `apps/web/src/lib/field-rule-helpers.ts` own derivation (encode/decode/find/conflict-detect). React components mount the wizard + the two rule lists. The wizard delegates persistence to `App.tsx`'s existing `addRuntimeListener` / `updateRuntimeListener` / `removeRuntimeListenerForSelection`. No schema or engine change — the rule shape is a structural convention over `RuntimeListenerDefinition`.

**Tech Stack:** React 18 + TypeScript + Vite (apps/web), pure-logic tests via `tsx --test`, Playwright E2E via existing `orchestrate.mjs` runner. Tailwind for styling. Reuses `ConfirmDialog`, `BehaviorStackList`, existing builder field options.

---

## File Structure

### New files

| File                                                                | Responsibility                                                                        |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `apps/web/src/lib/field-rule-helpers.ts`                            | Pure helpers. Types, encode/decode/find/conflict-detect.                              |
| `apps/web/src/lib/field-rule-helpers.test.ts`                       | TDD tests (≥9 tests).                                                                 |
| `apps/web/src/features/behavior/field-rules/FieldRuleWizard.tsx`    | Modal wizard. Five logical inputs: effect, target, trigger, operator, expected value. |
| `apps/web/src/features/behavior/field-rules/FieldRulesList.tsx`     | Rules where this field is the target. Mounts in field-inspector behavior section.     |
| `apps/web/src/features/behavior/field-rules/FieldRulesTriggers.tsx` | Rules where this field is the trigger. Mounts in trigger-field behavior section.      |
| `apps/web/src/features/behavior/field-rules/value-picker.tsx`       | Per-semantic-type expected-value input.                                               |
| `apps/web/e2e/field-rules.run.mjs`                                  | E2E smoke for the wizard + listener round-trip.                                       |

### Modified files

| File                                                                                               | Change                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/App.tsx`                                                                             | Add wizard open-state + `handleFieldRuleSave` + `handleFieldRuleDelete`. Mount `<FieldRuleWizard>`. Pass `builderFieldOptions` + handlers into the two list components. |
| `apps/web/src/features/inspector/InspectorRail.tsx` (or wherever the field properties panel lives) | Mount `<FieldRulesList>` in the field's behavior section.                                                                                                               |
| `apps/web/src/features/behavior/manager/BehaviorWorkspace.tsx`                                     | Mount `<FieldRulesTriggers>` next to the existing behavior stack (trigger-field entry).                                                                                 |
| `package.json`                                                                                     | New `e2e:field-rules` script.                                                                                                                                           |

---

## Phase 1 — Pure helpers

### Task 1.1: Types + isFieldRuleListener + decodeFieldRule

**Files:**

- Create: `apps/web/src/lib/field-rule-helpers.ts`
- Create: `apps/web/src/lib/field-rule-helpers.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeFieldRule, isFieldRuleListener } from "./field-rule-helpers";
import type { RuntimeListenerDefinition } from "@form-builder/schema";

function buildRuleListener(opts: {
  id?: string;
  triggerFieldId: string;
  operator: string;
  expectedValue: string;
  actionKind: string;
  affectedFieldId: string;
}): RuntimeListenerDefinition {
  return {
    id: opts.id ?? "L1",
    type: "field.change",
    eventName: "field.change",
    eventSourceNodeId: opts.triggerFieldId,
    eventSourceNodeType: "field",
    dispatcherId: opts.triggerFieldId,
    dispatcherType: "field",
    targetNodeId: opts.triggerFieldId,
    targetNodeType: "field",
    wiringMode: "local",
    enabled: true,
    conditions: [
      {
        id: "C1",
        source: { kind: "field_value", fieldId: opts.triggerFieldId },
        operator: opts.operator as "equals" | "not_equals" | "contains" | "exists",
        expectedValue: opts.expectedValue,
      },
    ],
    actions: [
      {
        id: "A1",
        kind: opts.actionKind as "show_node" | "hide_node" | "mark_required" | "mark_optional",
        config: { nodeId: opts.affectedFieldId },
      },
    ],
  } as unknown as RuntimeListenerDefinition;
}

test("isFieldRuleListener accepts a canonical show_node rule", () => {
  const listener = buildRuleListener({
    triggerFieldId: "f-a",
    operator: "equals",
    expectedValue: "yes",
    actionKind: "show_node",
    affectedFieldId: "f-b",
  });
  assert.equal(isFieldRuleListener(listener), true);
});

test("isFieldRuleListener rejects a listener with multiple actions", () => {
  const listener = buildRuleListener({
    triggerFieldId: "f-a",
    operator: "equals",
    expectedValue: "yes",
    actionKind: "show_node",
    affectedFieldId: "f-b",
  });
  listener.actions.push({
    id: "A2",
    kind: "hide_node",
    config: { nodeId: "f-c" },
  } as never);
  assert.equal(isFieldRuleListener(listener), false);
});

test("decodeFieldRule returns the typed FieldRule on a canonical listener", () => {
  const listener = buildRuleListener({
    id: "L7",
    triggerFieldId: "f-a",
    operator: "equals",
    expectedValue: "yes",
    actionKind: "mark_required",
    affectedFieldId: "f-b",
  });
  const rule = decodeFieldRule(listener);
  assert.ok(rule);
  assert.equal(rule!.listenerId, "L7");
  assert.equal(rule!.triggerFieldId, "f-a");
  assert.equal(rule!.operator, "equals");
  assert.equal(rule!.expectedValue, "yes");
  assert.equal(rule!.effect, "require");
  assert.equal(rule!.affectedFieldId, "f-b");
});

test("decodeFieldRule returns null when listener has a group condition", () => {
  const listener = buildRuleListener({
    triggerFieldId: "f-a",
    operator: "equals",
    expectedValue: "yes",
    actionKind: "show_node",
    affectedFieldId: "f-b",
  });
  (listener.conditions as unknown[]) = [{ kind: "group", operator: "and", members: [] }];
  assert.equal(decodeFieldRule(listener), null);
});

test("decodeFieldRule returns null when listener uses a non-rule action kind", () => {
  const listener = buildRuleListener({
    triggerFieldId: "f-a",
    operator: "equals",
    expectedValue: "yes",
    actionKind: "set_field_value",
    affectedFieldId: "f-b",
  });
  assert.equal(decodeFieldRule(listener), null);
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx tsx --test apps/web/src/lib/field-rule-helpers.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
import type {
  RuntimeActionDefinition,
  RuntimeConditionDefinition,
  RuntimeConditionOperator,
  RuntimeListenerDefinition,
} from "@form-builder/schema";

export type FieldRuleEffect = "show" | "hide" | "require" | "optional";

export interface FieldRule {
  listenerId: string;
  triggerFieldId: string;
  operator: RuntimeConditionOperator;
  expectedValue: string;
  effect: FieldRuleEffect;
  affectedFieldId: string;
}

const ACTION_KIND_TO_EFFECT: Record<string, FieldRuleEffect> = {
  show_node: "show",
  hide_node: "hide",
  mark_required: "require",
  mark_optional: "optional",
};

const EFFECT_TO_ACTION_KIND: Record<FieldRuleEffect, string> = {
  show: "show_node",
  hide: "hide_node",
  require: "mark_required",
  optional: "mark_optional",
};

function isAtomCondition(c: unknown): c is RuntimeConditionDefinition {
  if (!c || typeof c !== "object") return false;
  const obj = c as { kind?: string; source?: unknown };
  if (obj.kind === "group") return false;
  if (!obj.source || typeof obj.source !== "object") return false;
  return true;
}

export function isFieldRuleListener(listener: RuntimeListenerDefinition): boolean {
  if (listener.eventName !== "field.change") return false;
  if (!listener.eventSourceNodeId) return false;
  const conditions = listener.conditions ?? [];
  if (conditions.length !== 1) return false;
  const cond = conditions[0];
  if (!isAtomCondition(cond)) return false;
  const source = cond.source as { kind?: string; fieldId?: string };
  if (source.kind !== "field_value") return false;
  if (source.fieldId !== listener.eventSourceNodeId) return false;
  const actions = listener.actions ?? [];
  if (actions.length !== 1) return false;
  const action = actions[0];
  if (!action || !(action.kind in ACTION_KIND_TO_EFFECT)) return false;
  const config = action.config as { nodeId?: string } | undefined;
  if (!config?.nodeId) return false;
  return true;
}

export function decodeFieldRule(listener: RuntimeListenerDefinition): FieldRule | null {
  if (!isFieldRuleListener(listener)) return null;
  const cond = listener.conditions[0] as RuntimeConditionDefinition;
  const action = listener.actions[0] as RuntimeActionDefinition;
  const config = action.config as { nodeId: string };
  return {
    listenerId: listener.id,
    triggerFieldId: listener.eventSourceNodeId as string,
    operator: cond.operator,
    expectedValue: cond.expectedValue ?? "",
    effect: ACTION_KIND_TO_EFFECT[action.kind],
    affectedFieldId: config.nodeId,
  };
}

export const __FIELD_RULE_INTERNAL = { EFFECT_TO_ACTION_KIND };
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx tsx --test apps/web/src/lib/field-rule-helpers.test.ts
```

Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/field-rule-helpers.ts apps/web/src/lib/field-rule-helpers.test.ts
git commit -m "feat(lib): field-rule decode + isFieldRuleListener helpers"
```

### Task 1.2: encodeFieldRule + round-trip test

**Files:**

- Modify: `apps/web/src/lib/field-rule-helpers.ts`
- Modify: `apps/web/src/lib/field-rule-helpers.test.ts`

- [ ] **Step 1: Append failing tests**

```ts
import { encodeFieldRule } from "./field-rule-helpers";

test("encodeFieldRule produces a listener whose decode round-trips to the source rule", () => {
  const source = {
    triggerFieldId: "f-trigger",
    operator: "not_equals" as const,
    expectedValue: "veteran",
    effect: "hide" as const,
    affectedFieldId: "f-target",
  };
  const listener = encodeFieldRule(source);
  const decoded = decodeFieldRule(listener);
  assert.ok(decoded);
  assert.equal(decoded!.triggerFieldId, source.triggerFieldId);
  assert.equal(decoded!.operator, source.operator);
  assert.equal(decoded!.expectedValue, source.expectedValue);
  assert.equal(decoded!.effect, source.effect);
  assert.equal(decoded!.affectedFieldId, source.affectedFieldId);
  assert.equal(decoded!.listenerId.length > 0, true);
});

test("encodeFieldRule reuses provided listener id when supplied", () => {
  const listener = encodeFieldRule(
    {
      triggerFieldId: "f-a",
      operator: "equals",
      expectedValue: "yes",
      effect: "show",
      affectedFieldId: "f-b",
    },
    "L-existing",
  );
  assert.equal(listener.id, "L-existing");
});
```

- [ ] **Step 2: Run — FAIL**

```bash
npx tsx --test apps/web/src/lib/field-rule-helpers.test.ts
```

- [ ] **Step 3: Implement — append to `field-rule-helpers.ts`**

```ts
function randomId(prefix: string): string {
  const buf = new Uint8Array(8);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
  }
  return `${prefix}-${Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function encodeFieldRule(rule: Omit<FieldRule, "listenerId">, listenerId?: string): RuntimeListenerDefinition {
  const id = listenerId ?? randomId("L");
  const cond: RuntimeConditionDefinition = {
    id: randomId("C"),
    source: { kind: "field_value", fieldId: rule.triggerFieldId },
    operator: rule.operator,
    expectedValue: rule.expectedValue,
  } as unknown as RuntimeConditionDefinition;
  const action: RuntimeActionDefinition = {
    id: randomId("A"),
    kind: EFFECT_TO_ACTION_KIND[rule.effect],
    config: { nodeId: rule.affectedFieldId },
  } as unknown as RuntimeActionDefinition;
  return {
    id,
    type: "field.change",
    eventName: "field.change",
    eventSourceNodeId: rule.triggerFieldId,
    eventSourceNodeType: "field",
    dispatcherId: rule.triggerFieldId,
    dispatcherType: "field",
    targetNodeId: rule.triggerFieldId,
    targetNodeType: "field",
    wiringMode: "local",
    enabled: true,
    conditions: [cond],
    actions: [action],
  } as unknown as RuntimeListenerDefinition;
}
```

Make the inline `EFFECT_TO_ACTION_KIND` reference (used in `randomId`-using `encodeFieldRule`) come from the top-of-file constant by promoting it from the `__FIELD_RULE_INTERNAL` export. Replace the internal-only export with `EFFECT_TO_ACTION_KIND` being a normal const declared once at file scope (which it already is — just remove the `__FIELD_RULE_INTERNAL` line; no consumers depend on it).

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx tsx --test apps/web/src/lib/field-rule-helpers.test.ts
```

Expected: 7 pass (5 from Task 1.1 + 2 new).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/field-rule-helpers.ts apps/web/src/lib/field-rule-helpers.test.ts
git commit -m "feat(lib): encodeFieldRule with round-trip stability"
```

### Task 1.3: findRulesAffectingField + findRulesTriggeredByField

**Files:**

- Modify: `apps/web/src/lib/field-rule-helpers.ts`
- Modify: `apps/web/src/lib/field-rule-helpers.test.ts`

- [ ] **Step 1: Append failing tests**

```ts
import { findRulesAffectingField, findRulesTriggeredByField } from "./field-rule-helpers";
import type { AuthoringDocument } from "@form-builder/schema";

function buildDocWithListeners(opts: {
  formListeners?: RuntimeListenerDefinition[];
  fieldListenersById?: Record<string, RuntimeListenerDefinition[]>;
}): AuthoringDocument {
  const fields = Object.entries(opts.fieldListenersById ?? {}).map(([id, listeners]) => ({
    id,
    label: id,
    runtime: { listeners },
  }));
  return {
    id: "d",
    title: "T",
    version: "1.0",
    steps: [
      {
        id: "s1",
        title: "Step 1",
        sections: [{ id: "sec1", fields, groups: [] }],
      },
    ],
    runtime: {
      version: "1.0",
      formEvents: [],
      formListeners: opts.formListeners ?? [],
    },
  } as unknown as AuthoringDocument;
}

test("findRulesAffectingField returns rules from both form-level and node-level listeners", () => {
  const formRule = encodeFieldRule({
    triggerFieldId: "f-trigger",
    operator: "equals",
    expectedValue: "yes",
    effect: "show",
    affectedFieldId: "f-target",
  });
  const nodeRule = encodeFieldRule({
    triggerFieldId: "f-trigger-2",
    operator: "equals",
    expectedValue: "no",
    effect: "hide",
    affectedFieldId: "f-target",
  });
  const doc = buildDocWithListeners({
    formListeners: [formRule],
    fieldListenersById: { "f-trigger-2": [nodeRule] },
  });
  const rules = findRulesAffectingField(doc, "f-target");
  assert.equal(rules.length, 2);
  assert.deepEqual(rules.map((r) => r.effect).sort(), ["hide", "show"]);
});

test("findRulesAffectingField excludes listeners whose target differs", () => {
  const rule = encodeFieldRule({
    triggerFieldId: "f-trigger",
    operator: "equals",
    expectedValue: "yes",
    effect: "show",
    affectedFieldId: "f-other",
  });
  const doc = buildDocWithListeners({ formListeners: [rule] });
  assert.deepEqual(findRulesAffectingField(doc, "f-target"), []);
});

test("findRulesTriggeredByField returns rules where this field is the trigger", () => {
  const rule = encodeFieldRule({
    triggerFieldId: "f-source",
    operator: "equals",
    expectedValue: "yes",
    effect: "show",
    affectedFieldId: "f-target",
  });
  const doc = buildDocWithListeners({ formListeners: [rule] });
  const rules = findRulesTriggeredByField(doc, "f-source");
  assert.equal(rules.length, 1);
  assert.equal(rules[0]!.affectedFieldId, "f-target");
});
```

- [ ] **Step 2: Run — FAIL**

```bash
npx tsx --test apps/web/src/lib/field-rule-helpers.test.ts
```

- [ ] **Step 3: Implement — append**

```ts
import type { AuthoringDocument } from "@form-builder/schema";

function collectAllListeners(doc: AuthoringDocument): RuntimeListenerDefinition[] {
  const out: RuntimeListenerDefinition[] = [];
  for (const l of doc.runtime?.formListeners ?? []) out.push(l);
  function walk(node: unknown) {
    if (!node || typeof node !== "object") return;
    const candidate = node as {
      runtime?: { listeners?: RuntimeListenerDefinition[] };
      sections?: unknown[];
      groups?: unknown[];
      fields?: unknown[];
    };
    for (const l of candidate.runtime?.listeners ?? []) out.push(l);
    for (const child of [...(candidate.sections ?? []), ...(candidate.groups ?? []), ...(candidate.fields ?? [])]) {
      walk(child);
    }
  }
  for (const step of doc.steps ?? []) walk(step);
  return out;
}

export function findRulesAffectingField(doc: AuthoringDocument, fieldId: string): FieldRule[] {
  const rules: FieldRule[] = [];
  for (const listener of collectAllListeners(doc)) {
    const rule = decodeFieldRule(listener);
    if (rule && rule.affectedFieldId === fieldId) rules.push(rule);
  }
  return rules;
}

export function findRulesTriggeredByField(doc: AuthoringDocument, fieldId: string): FieldRule[] {
  const rules: FieldRule[] = [];
  for (const listener of collectAllListeners(doc)) {
    const rule = decodeFieldRule(listener);
    if (rule && rule.triggerFieldId === fieldId) rules.push(rule);
  }
  return rules;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx tsx --test apps/web/src/lib/field-rule-helpers.test.ts
```

Expected: 10 pass (7 prior + 3 new).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/field-rule-helpers.ts apps/web/src/lib/field-rule-helpers.test.ts
git commit -m "feat(lib): findRulesAffectingField + findRulesTriggeredByField walkers"
```

### Task 1.4: detectFieldRuleConflicts

**Files:**

- Modify: `apps/web/src/lib/field-rule-helpers.ts`
- Modify: `apps/web/src/lib/field-rule-helpers.test.ts`

- [ ] **Step 1: Append failing tests**

```ts
import { detectFieldRuleConflicts } from "./field-rule-helpers";

const baseRuleA = {
  listenerId: "L-show",
  triggerFieldId: "f-trigger",
  operator: "equals" as const,
  expectedValue: "yes",
  effect: "show" as const,
  affectedFieldId: "f-target",
};
const baseRuleB = {
  listenerId: "L-hide",
  triggerFieldId: "f-trigger",
  operator: "equals" as const,
  expectedValue: "yes",
  effect: "hide" as const,
  affectedFieldId: "f-target",
};

test("detectFieldRuleConflicts flags show/hide pair on same condition", () => {
  const conflicts = detectFieldRuleConflicts([baseRuleA, baseRuleB]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0]!.fieldId, "f-target");
  assert.deepEqual(conflicts[0]!.effectPair.sort(), ["hide", "show"]);
});

test("detectFieldRuleConflicts does NOT flag rules with different expectedValue", () => {
  const ruleB = { ...baseRuleB, expectedValue: "no" };
  assert.deepEqual(detectFieldRuleConflicts([baseRuleA, ruleB]), []);
});

test("detectFieldRuleConflicts does NOT flag rules with different trigger fields", () => {
  const ruleB = { ...baseRuleB, triggerFieldId: "f-other" };
  assert.deepEqual(detectFieldRuleConflicts([baseRuleA, ruleB]), []);
});

test("detectFieldRuleConflicts flags require/optional pair on same condition", () => {
  const ruleA = { ...baseRuleA, effect: "require" as const };
  const ruleB = { ...baseRuleB, effect: "optional" as const };
  const conflicts = detectFieldRuleConflicts([ruleA, ruleB]);
  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0]!.effectPair.sort(), ["optional", "require"]);
});
```

- [ ] **Step 2: Run — FAIL**

```bash
npx tsx --test apps/web/src/lib/field-rule-helpers.test.ts
```

- [ ] **Step 3: Implement — append**

```ts
export interface FieldRuleConflict {
  fieldId: string;
  effectPair: [FieldRuleEffect, FieldRuleEffect];
  rules: [FieldRule, FieldRule];
}

const OPPOSING: Record<FieldRuleEffect, FieldRuleEffect | null> = {
  show: "hide",
  hide: "show",
  require: "optional",
  optional: "require",
};

export function detectFieldRuleConflicts(rules: FieldRule[]): FieldRuleConflict[] {
  const conflicts: FieldRuleConflict[] = [];
  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const a = rules[i]!;
      const b = rules[j]!;
      if (a.affectedFieldId !== b.affectedFieldId) continue;
      if (a.triggerFieldId !== b.triggerFieldId) continue;
      if (a.operator !== b.operator) continue;
      if (a.expectedValue !== b.expectedValue) continue;
      if (OPPOSING[a.effect] !== b.effect) continue;
      conflicts.push({
        fieldId: a.affectedFieldId,
        effectPair: [a.effect, b.effect],
        rules: [a, b],
      });
    }
  }
  return conflicts;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx tsx --test apps/web/src/lib/field-rule-helpers.test.ts
```

Expected: 14 pass (10 prior + 4 new).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/field-rule-helpers.ts apps/web/src/lib/field-rule-helpers.test.ts
git commit -m "feat(lib): detectFieldRuleConflicts for show/hide + require/optional"
```

---

## Phase 2 — UI components

### Task 2.1: value-picker

**Files:** Create `apps/web/src/features/behavior/field-rules/value-picker.tsx`

- [ ] **Step 1: Implement**

```tsx
import type { AuthoringField } from "@form-builder/schema";
import type { RuntimeConditionOperator } from "@form-builder/schema";

export interface FieldRuleValuePickerProps {
  operator: RuntimeConditionOperator;
  value: string;
  onChange: (next: string) => void;
  field: AuthoringField | null;
  className?: string;
}

export function FieldRuleValuePicker({ operator, value, onChange, field, className }: FieldRuleValuePickerProps) {
  if (operator === "exists") {
    return <p className={`text-sm text-slate-500 ${className ?? ""}`}>No value needed for "exists".</p>;
  }
  const options = field?.choices?.options ?? null;
  if (options && options.length > 0) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ${className ?? ""}`}
      >
        <option value="">— pick a value —</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  if (field?.semanticType === "checkbox") {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ${className ?? ""}`}
      >
        <option value="true">checked</option>
        <option value="false">unchecked</option>
      </select>
    );
  }
  return (
    <input
      type={field?.semanticType === "number" ? "number" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="expected value"
      className={`w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ${className ?? ""}`}
    />
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck:web
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/behavior/field-rules/value-picker.tsx
git commit -m "feat(field-rules): per-semantic-type value picker"
```

### Task 2.2: FieldRuleWizard

**File:** Create `apps/web/src/features/behavior/field-rules/FieldRuleWizard.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { AuthoringDocument, AuthoringField, RuntimeConditionOperator } from "@form-builder/schema";
import type { FieldRule, FieldRuleEffect } from "../../../lib/field-rule-helpers";
import { FieldRuleValuePicker } from "./value-picker";
import { actionButtonClass, iconButtonClass } from "../../../lib/ui-utils";

export interface FieldRuleFieldOption {
  id: string;
  optionLabel: string;
  field: AuthoringField | null;
}

export interface FieldRuleWizardProps {
  isOpen: boolean;
  onClose: () => void;
  doc: AuthoringDocument | null;
  fieldOptions: FieldRuleFieldOption[];
  /** Pre-fill the affected field id (entry from affected-field side). */
  initialAffectedFieldId?: string | null;
  /** Pre-fill the trigger field id (entry from trigger-field side). */
  initialTriggerFieldId?: string | null;
  /** Existing rule when editing. */
  existingRule?: FieldRule | null;
  onSave: (rule: Omit<FieldRule, "listenerId">, listenerId?: string) => void;
}

const EFFECT_OPTIONS: Array<{ value: FieldRuleEffect; label: string }> = [
  { value: "show", label: "Show" },
  { value: "hide", label: "Hide" },
  { value: "require", label: "Mark required" },
  { value: "optional", label: "Mark optional" },
];

const OPERATOR_OPTIONS: Array<{ value: RuntimeConditionOperator; label: string }> = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "does not equal" },
  { value: "contains", label: "contains" },
  { value: "exists", label: "exists" },
];

export function FieldRuleWizard({
  isOpen,
  onClose,
  doc: _doc,
  fieldOptions,
  initialAffectedFieldId,
  initialTriggerFieldId,
  existingRule,
  onSave,
}: FieldRuleWizardProps) {
  const [effect, setEffect] = useState<FieldRuleEffect>("show");
  const [affectedFieldId, setAffectedFieldId] = useState("");
  const [triggerFieldId, setTriggerFieldId] = useState("");
  const [operator, setOperator] = useState<RuntimeConditionOperator>("equals");
  const [expectedValue, setExpectedValue] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    if (existingRule) {
      setEffect(existingRule.effect);
      setAffectedFieldId(existingRule.affectedFieldId);
      setTriggerFieldId(existingRule.triggerFieldId);
      setOperator(existingRule.operator);
      setExpectedValue(existingRule.expectedValue);
      return;
    }
    setEffect("show");
    setAffectedFieldId(initialAffectedFieldId ?? "");
    setTriggerFieldId(initialTriggerFieldId ?? "");
    setOperator("equals");
    setExpectedValue("");
  }, [isOpen, existingRule, initialAffectedFieldId, initialTriggerFieldId]);

  const triggerField = useMemo(
    () => fieldOptions.find((opt) => opt.id === triggerFieldId)?.field ?? null,
    [fieldOptions, triggerFieldId],
  );

  const canSave = Boolean(
    effect && affectedFieldId && triggerFieldId && operator && (operator === "exists" || expectedValue !== ""),
  );

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/30 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="field-rule-wizard-title"
        className="relative w-full max-w-[36rem] rounded-[1.15rem] border border-slate-200 bg-[#f5f7fb] p-5 shadow-[0_24px_64px_rgba(15,23,42,0.24)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Field rule</p>
            <h3 id="field-rule-wizard-title" className="mt-0.5 text-lg font-semibold text-slate-950">
              {existingRule ? "Edit field rule" : "Add field rule"}
            </h3>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className={iconButtonClass()}>
            ×
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <label className="block text-sm">
            <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">Effect</span>
            <select
              value={effect}
              onChange={(e) => setEffect(e.target.value as FieldRuleEffect)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              {EFFECT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">Affected field</span>
            <select
              value={affectedFieldId}
              onChange={(e) => setAffectedFieldId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">— pick a field —</option>
              {fieldOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.optionLabel}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">Trigger field</span>
            <select
              value={triggerFieldId}
              onChange={(e) => setTriggerFieldId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">— pick a field —</option>
              {fieldOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.optionLabel}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-[minmax(0,0.6fr)_minmax(0,1fr)] gap-3">
            <label className="block text-sm">
              <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">Operator</span>
              <select
                value={operator}
                onChange={(e) => setOperator(e.target.value as RuntimeConditionOperator)}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {OPERATOR_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">Value</span>
              <FieldRuleValuePicker
                operator={operator}
                value={expectedValue}
                onChange={setExpectedValue}
                field={triggerField}
                className="mt-1"
              />
            </label>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className={actionButtonClass("secondary")}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => {
              if (!canSave) return;
              onSave(
                {
                  effect,
                  affectedFieldId,
                  triggerFieldId,
                  operator,
                  expectedValue: operator === "exists" ? "" : expectedValue,
                },
                existingRule?.listenerId,
              );
              onClose();
            }}
            className={actionButtonClass("primary")}
          >
            {existingRule ? "Save changes" : "Add rule"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck:web
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/behavior/field-rules/FieldRuleWizard.tsx
git commit -m "feat(field-rules): FieldRuleWizard modal"
```

### Task 2.3: FieldRulesList

**File:** Create `apps/web/src/features/behavior/field-rules/FieldRulesList.tsx`

- [ ] **Step 1: Implement**

```tsx
import type { AuthoringDocument } from "@form-builder/schema";
import { detectFieldRuleConflicts, findRulesAffectingField, type FieldRule } from "../../../lib/field-rule-helpers";
import { actionButtonClass } from "../../../lib/ui-utils";

export interface FieldRulesListProps {
  doc: AuthoringDocument | null;
  fieldId: string | null;
  fieldOptionLabel: (fieldId: string) => string;
  onAdd: () => void;
  onEdit: (rule: FieldRule) => void;
  onDelete: (rule: FieldRule) => void;
}

export function FieldRulesList({ doc, fieldId, fieldOptionLabel, onAdd, onEdit, onDelete }: FieldRulesListProps) {
  const rules = doc && fieldId ? findRulesAffectingField(doc, fieldId) : [];
  const conflicts = detectFieldRuleConflicts(rules);
  const conflictByListenerId = new Set(conflicts.flatMap((c) => c.rules.map((r) => r.listenerId)));
  return (
    <section className="rounded-[1rem] border border-soft bg-white p-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Rules affecting this field
          </p>
          <p className="mt-1 text-xs text-slate-500">Visibility and required-state rules triggered by other fields.</p>
        </div>
        <button type="button" onClick={onAdd} className={actionButtonClass("secondary")}>
          + Add rule
        </button>
      </header>
      <ul className="mt-3 space-y-2">
        {rules.length === 0 ? (
          <li className="rounded-md border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">
            No rules yet. Use "Add rule" to make this field react to another field's value.
          </li>
        ) : (
          rules.map((rule) => (
            <li
              key={rule.listenerId}
              className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${
                conflictByListenerId.has(rule.listenerId) ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-white"
              }`}
            >
              <span className="text-sm text-slate-800">
                <strong className="font-semibold">
                  {rule.effect === "show"
                    ? "Show"
                    : rule.effect === "hide"
                      ? "Hide"
                      : rule.effect === "require"
                        ? "Mark required"
                        : "Mark optional"}
                </strong>{" "}
                this field when <strong>{fieldOptionLabel(rule.triggerFieldId)}</strong>{" "}
                {rule.operator === "exists" ? "exists" : `${rule.operator.replace("_", " ")} "${rule.expectedValue}"`}
              </span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => onEdit(rule)} className={actionButtonClass("secondary")}>
                  Edit
                </button>
                <button type="button" onClick={() => onDelete(rule)} className={actionButtonClass("danger")}>
                  Delete
                </button>
              </div>
            </li>
          ))
        )}
      </ul>
      {conflicts.length > 0 ? (
        <p className="mt-2 text-xs text-rose-700">
          ⚠ Conflicting rules detected. Two rules try to apply opposing effects under the same condition.
        </p>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck:web
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/behavior/field-rules/FieldRulesList.tsx
git commit -m "feat(field-rules): FieldRulesList (rules affecting selected field)"
```

### Task 2.4: FieldRulesTriggers

**File:** Create `apps/web/src/features/behavior/field-rules/FieldRulesTriggers.tsx`

- [ ] **Step 1: Implement**

```tsx
import type { AuthoringDocument } from "@form-builder/schema";
import { findRulesTriggeredByField, type FieldRule } from "../../../lib/field-rule-helpers";
import { actionButtonClass } from "../../../lib/ui-utils";

export interface FieldRulesTriggersProps {
  doc: AuthoringDocument | null;
  fieldId: string | null;
  fieldOptionLabel: (fieldId: string) => string;
  onAdd: () => void;
  onEdit: (rule: FieldRule) => void;
  onDelete: (rule: FieldRule) => void;
}

export function FieldRulesTriggers({
  doc,
  fieldId,
  fieldOptionLabel,
  onAdd,
  onEdit,
  onDelete,
}: FieldRulesTriggersProps) {
  const rules = doc && fieldId ? findRulesTriggeredByField(doc, fieldId) : [];
  return (
    <section className="rounded-[1rem] border border-soft bg-white p-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Rules this field triggers
          </p>
          <p className="mt-1 text-xs text-slate-500">
            When this field changes, these rules toggle the visibility or required state of other fields.
          </p>
        </div>
        <button type="button" onClick={onAdd} className={actionButtonClass("secondary")}>
          + Add rule about another field
        </button>
      </header>
      <ul className="mt-3 space-y-2">
        {rules.length === 0 ? (
          <li className="rounded-md border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">
            No outgoing rules. Use "Add rule" to make another field react when this one changes.
          </li>
        ) : (
          rules.map((rule) => (
            <li
              key={rule.listenerId}
              className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2"
            >
              <span className="text-sm text-slate-800">
                <strong className="font-semibold">
                  {rule.effect === "show"
                    ? "Show"
                    : rule.effect === "hide"
                      ? "Hide"
                      : rule.effect === "require"
                        ? "Mark required"
                        : "Mark optional"}
                </strong>{" "}
                <strong>{fieldOptionLabel(rule.affectedFieldId)}</strong> when this field{" "}
                {rule.operator === "exists" ? "exists" : `${rule.operator.replace("_", " ")} "${rule.expectedValue}"`}
              </span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => onEdit(rule)} className={actionButtonClass("secondary")}>
                  Edit
                </button>
                <button type="button" onClick={() => onDelete(rule)} className={actionButtonClass("danger")}>
                  Delete
                </button>
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck:web
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/behavior/field-rules/FieldRulesTriggers.tsx
git commit -m "feat(field-rules): FieldRulesTriggers (rules this field triggers)"
```

---

## Phase 3 — App wiring + mount

### Task 3.1: App.tsx — wizard state + handlers + mount

**File:** `apps/web/src/App.tsx`

- [ ] **Step 1: Add imports**

Near the existing behavior imports, add:

```ts
import { FieldRuleWizard, type FieldRuleFieldOption } from "./features/behavior/field-rules/FieldRuleWizard";
import { FieldRulesList } from "./features/behavior/field-rules/FieldRulesList";
import { FieldRulesTriggers } from "./features/behavior/field-rules/FieldRulesTriggers";
import { decodeFieldRule, encodeFieldRule, type FieldRule } from "./lib/field-rule-helpers";
```

- [ ] **Step 2: Add wizard state (near other modal states)**

```ts
const [fieldRuleWizardOpen, setFieldRuleWizardOpen] = useState(false);
const [fieldRuleWizardInitialAffected, setFieldRuleWizardInitialAffected] = useState<string | null>(null);
const [fieldRuleWizardInitialTrigger, setFieldRuleWizardInitialTrigger] = useState<string | null>(null);
const [fieldRuleWizardExisting, setFieldRuleWizardExisting] = useState<FieldRule | null>(null);
```

- [ ] **Step 3: Build `fieldRuleFieldOptions` from existing builderFieldOptions**

Near the existing `builderFieldOptions` useMemo, add:

```ts
const fieldRuleFieldOptions = useMemo<FieldRuleFieldOption[]>(() => {
  if (!activeDocument) return [];
  const lookup = new Map<string, AuthoringField>();
  for (const step of activeDocument.steps) {
    for (const section of step.sections) {
      for (const field of section.fields) lookup.set(field.id, field);
      for (const group of section.groups) for (const field of group.fields) lookup.set(field.id, field);
    }
  }
  return builderFieldOptions.map((opt) => ({
    id: opt.id,
    optionLabel: opt.optionLabel,
    field: lookup.get(opt.id) ?? null,
  }));
}, [activeDocument, builderFieldOptions]);

const fieldRuleLabelOf = useCallback(
  (id: string) => fieldRuleFieldOptions.find((opt) => opt.id === id)?.optionLabel ?? id,
  [fieldRuleFieldOptions],
);
```

- [ ] **Step 4: Add open/save/delete handlers**

```ts
function openFieldRuleWizardForAffected(fieldId: string) {
  setFieldRuleWizardInitialAffected(fieldId);
  setFieldRuleWizardInitialTrigger(null);
  setFieldRuleWizardExisting(null);
  setFieldRuleWizardOpen(true);
}

function openFieldRuleWizardForTrigger(fieldId: string) {
  setFieldRuleWizardInitialAffected(null);
  setFieldRuleWizardInitialTrigger(fieldId);
  setFieldRuleWizardExisting(null);
  setFieldRuleWizardOpen(true);
}

function openFieldRuleWizardForEdit(rule: FieldRule) {
  setFieldRuleWizardInitialAffected(rule.affectedFieldId);
  setFieldRuleWizardInitialTrigger(rule.triggerFieldId);
  setFieldRuleWizardExisting(rule);
  setFieldRuleWizardOpen(true);
}

function handleFieldRuleSave(rule: Omit<FieldRule, "listenerId">, listenerId?: string) {
  if (listenerId) {
    updateRuntimeListener(listenerId, (listener) => {
      Object.assign(listener, encodeFieldRule(rule, listenerId));
    });
    return;
  }
  // Add a new listener. Reuse existing addRuntimeListener which writes to the
  // active scope. The wizard's trigger choice determines the scope: select the
  // trigger field before invoking. This handler runs in the active scope, so the
  // caller must have set selectedAuthoring to the trigger field first.
  const triggerSelection = findSelectionForNodeId(activeDocument!, rule.triggerFieldId);
  if (!triggerSelection) return;
  setSelectedAuthoring(triggerSelection);
  // schedule the add on the next tick so the scope mutation takes effect
  Promise.resolve().then(() => {
    addRuntimeListener(encodeFieldRule(rule));
  });
}

function handleFieldRuleDelete(rule: FieldRule) {
  const triggerSelection = findSelectionForNodeId(activeDocument!, rule.triggerFieldId);
  if (!triggerSelection) return;
  removeRuntimeListenerForSelection(triggerSelection, rule.listenerId);
}
```

- [ ] **Step 5: Mount the wizard near the existing modal portals**

```tsx
<FieldRuleWizard
  isOpen={fieldRuleWizardOpen}
  onClose={() => setFieldRuleWizardOpen(false)}
  doc={activeDocument}
  fieldOptions={fieldRuleFieldOptions}
  initialAffectedFieldId={fieldRuleWizardInitialAffected}
  initialTriggerFieldId={fieldRuleWizardInitialTrigger}
  existingRule={fieldRuleWizardExisting}
  onSave={handleFieldRuleSave}
/>
```

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck:web
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat(field-rules): wire FieldRuleWizard state + handlers in App"
```

### Task 3.2: Mount FieldRulesList in the field inspector

**File:** `apps/web/src/features/inspector/InspectorRail.tsx` (or whichever component currently renders the field-properties "behavior" section — discover with `grep -n "field properties\|behavior section\|properties tab" apps/web/src/features/inspector/`)

- [ ] **Step 1: Identify mount point**

```bash
grep -rn "Behavior section\|properties tab\|propertiesPanel\|fieldProperties" apps/web/src/features/inspector/ | head
```

Pick the rendering location for the selected field's "behavior" group of controls. The mount point is the section that already shows existing field behaviors / the field's listener stack.

- [ ] **Step 2: Add `<FieldRulesList>` mount**

The InspectorRail (or equivalent) receives a `field`-shaped selection. Add:

```tsx
{
  selection?.kind === "field" ? (
    <FieldRulesList
      doc={activeDocument}
      fieldId={selection.fieldId}
      fieldOptionLabel={fieldRuleLabelOf}
      onAdd={() => openFieldRuleWizardForAffected(selection.fieldId)}
      onEdit={(rule) => openFieldRuleWizardForEdit(rule)}
      onDelete={(rule) => handleFieldRuleDelete(rule)}
    />
  ) : null;
}
```

If the inspector component doesn't already receive these props, thread them from App.tsx. Keep the prop list focused: `activeDocument`, `fieldRuleLabelOf`, `openFieldRuleWizardForAffected`, `openFieldRuleWizardForEdit`, `handleFieldRuleDelete`.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck:web
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/inspector/InspectorRail.tsx apps/web/src/App.tsx
git commit -m "feat(field-rules): mount FieldRulesList in field inspector"
```

### Task 3.3: Mount FieldRulesTriggers in trigger-field behavior section

**File:** `apps/web/src/features/behavior/manager/BehaviorWorkspace.tsx`

- [ ] **Step 1: Add props for the wizard handlers**

Extend the BehaviorWorkspace props interface:

```ts
onOpenFieldRuleWizardForTrigger?: (fieldId: string) => void;
onOpenFieldRuleWizardForEdit?: (rule: FieldRule) => void;
onDeleteFieldRule?: (rule: FieldRule) => void;
fieldRuleLabelOf?: (id: string) => string;
```

- [ ] **Step 2: Mount `<FieldRulesTriggers>` near the field's behavior section**

Find the section that currently shows the "+ Add behavior" + "+ From library" buttons for a field-scope selection. Insert above or below it:

```tsx
{
  selectedAuthoring?.kind === "field" && onOpenFieldRuleWizardForTrigger ? (
    <FieldRulesTriggers
      doc={activeDocument}
      fieldId={selectedAuthoring.fieldId}
      fieldOptionLabel={fieldRuleLabelOf ?? ((id) => id)}
      onAdd={() => onOpenFieldRuleWizardForTrigger(selectedAuthoring.fieldId)}
      onEdit={(rule) => onOpenFieldRuleWizardForEdit?.(rule)}
      onDelete={(rule) => onDeleteFieldRule?.(rule)}
    />
  ) : null;
}
```

- [ ] **Step 3: Pass new props from App.tsx**

Where `<BehaviorWorkspace>` mounts, add:

```tsx
onOpenFieldRuleWizardForTrigger = { openFieldRuleWizardForTrigger };
onOpenFieldRuleWizardForEdit = { openFieldRuleWizardForEdit };
onDeleteFieldRule = { handleFieldRuleDelete };
fieldRuleLabelOf = { fieldRuleLabelOf };
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck:web
```

- [ ] **Step 5: Smoke**

```bash
npm run dev:web
```

Select a field. Verify:

- Field inspector shows "Rules affecting this field" panel with "+ Add rule".
- Trigger-field behavior section shows "Rules this field triggers" panel.
- Clicking "+ Add rule" opens wizard.
- Saving a "Show field X when this equals Y" rule appears in the list and persists across page reload.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/behavior/manager/BehaviorWorkspace.tsx apps/web/src/App.tsx
git commit -m "feat(field-rules): mount FieldRulesTriggers in trigger-field behavior section"
```

---

## Phase 4 — E2E + final gates

### Task 4.1: E2E suite

**Files:**

- Create: `apps/web/e2e/field-rules.run.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add new npm script**

In `package.json`:

```json
"e2e:field-rules": "npm run build:web && node apps/web/e2e/orchestrate.mjs ./field-rules.run.mjs"
```

- [ ] **Step 2: Create the suite**

```js
/**
 * Field-rules E2E — wizard + listener round-trip.
 *
 * 1. Open fixture project.
 * 2. Select the checkbox source field (which has an existing radio target).
 * 3. From the trigger-field behavior section, click "+ Add rule about another field".
 * 4. Fill the wizard: effect "Hide", affected = radio, trigger pre-filled,
 *    operator "equals", value "Disability".
 * 5. Save → assert the new row appears in the FieldRulesTriggers list.
 * 6. Open TestPanel via Cmd+K, fire field.change with nextValue=Disability.
 * 7. Assert trace shows hide_node executed against the radio.
 */

import { chromium } from "playwright";
import {
  buildCheckboxToRadioProjectDetail,
  buildCheckboxToRadioProjectRecord,
  FIXTURE_TEST_PANEL_PROJECT_ID,
} from "./fixtures.mjs";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:4174";
const API_HOST = "http://127.0.0.1:8000";

function jsonResponse(body, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}

async function installApiMocks(page) {
  const detail = buildCheckboxToRadioProjectDetail();
  const projectRecord = buildCheckboxToRadioProjectRecord();
  await page.route(new RegExp(`^${API_HOST}/`), (route) => route.fulfill(jsonResponse({ detail: "unmocked" }, 404)));
  await page.route(`${API_HOST}/conversions`, (route) => route.fulfill(jsonResponse([])));
  await page.route(`${API_HOST}/sample-pdfs`, (route) => route.fulfill(jsonResponse([])));
  await page.route(`${API_HOST}/projects`, (route) => route.fulfill(jsonResponse([projectRecord])));
  await page.route(new RegExp(`^${API_HOST}/projects/${FIXTURE_TEST_PANEL_PROJECT_ID}$`), (route) =>
    route.fulfill(jsonResponse(detail)),
  );
  await page.route(new RegExp(`^${API_HOST}/projects/${FIXTURE_TEST_PANEL_PROJECT_ID}/document$`), (route) =>
    route.fulfill(jsonResponse(detail.document)),
  );
  await page.route(new RegExp(`^${API_HOST}/projects/${FIXTURE_TEST_PANEL_PROJECT_ID}/source-context$`), (route) =>
    route.fulfill(jsonResponse(detail.sourceContext)),
  );
  await page.route(new RegExp(`^${API_HOST}/projects/${FIXTURE_TEST_PANEL_PROJECT_ID}/revisions$`), (route) =>
    route.fulfill(jsonResponse([])),
  );
  await page.route(new RegExp(`^${API_HOST}/projects/${FIXTURE_TEST_PANEL_PROJECT_ID}/library$`), (route) =>
    route.fulfill(jsonResponse([])),
  );
  await page.route(new RegExp(`^${API_HOST}/projects/${FIXTURE_TEST_PANEL_PROJECT_ID}/project-events$`), (route) =>
    route.fulfill(jsonResponse({ version: "1.0", projectEvents: [] })),
  );
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  let exitCode = 0;
  try {
    await installApiMocks(page);
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await page
      .getByRole("button", { name: /Checkbox to Radio E2E/i })
      .first()
      .click();
    await page.getByRole("toolbar", { name: /Builder stage toolbar/i }).waitFor({ timeout: 5_000 });

    console.log("[e2e] selecting checkbox field");
    await page.getByText("Type of benefit(s) applying for").first().click();

    console.log("[e2e] opening wizard from trigger-field behavior section");
    await page.getByRole("button", { name: /\+ Add rule about another field/i }).click();

    const dialog = page.locator('[role="dialog"][aria-labelledby="field-rule-wizard-title"]');
    await dialog.waitFor({ timeout: 5_000 });

    console.log("[e2e] filling wizard");
    await dialog.getByLabel(/Effect/i).selectOption("hide");
    const radioOption = await dialog.locator("select").nth(1).locator("option").nth(1).getAttribute("value");
    await dialog.locator("select").nth(1).selectOption(radioOption);
    await dialog.getByRole("button", { name: /Add rule/i }).click();

    console.log("[e2e] asserting rule row appears");
    await page.getByText(/Hide.+when this field equals/i).waitFor({ timeout: 5_000 });

    console.log("[e2e] firing field.change via TestPanel");
    await page.keyboard.press("Meta+K");
    const panel = page.locator('[role="dialog"][aria-label="Test panel"]');
    await panel.waitFor({ timeout: 5_000 });
    const nextValueInput = panel.locator('input[id$="-payload-nextValue"]');
    await nextValueInput.waitFor({ timeout: 5_000 });
    await nextValueInput.fill("Disability");
    await panel.getByRole("button", { name: /Fire event/i }).click();

    console.log("[e2e] asserting hide_node trace");
    await panel.getByText(/hide_node/i).waitFor({ timeout: 5_000 });
    await panel
      .getByText(/executed/i)
      .first()
      .waitFor({ timeout: 5_000 });

    console.log("\nfield-rules E2E PASSED.");
  } catch (error) {
    console.error("\nfield-rules E2E FAILED:");
    console.error(error.message);
    if (error.stack) console.error(error.stack.split("\n").slice(0, 4).join("\n"));
    try {
      const shotPath = new URL("./failure-field-rules.png", import.meta.url).pathname;
      await page.screenshot({ path: shotPath, fullPage: true });
      console.error(`[e2e] failure screenshot: ${shotPath}`);
    } catch (shotErr) {
      console.error("[e2e] could not capture failure screenshot:", shotErr.message);
    }
    exitCode = 1;
  } finally {
    await browser.close();
    process.exit(exitCode);
  }
}

main();
```

- [ ] **Step 3: Run the suite**

```bash
npm run e2e:field-rules
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/field-rules.run.mjs package.json
git commit -m "test(e2e): field-rules wizard + listener round-trip"
```

### Task 4.2: Full gate sweep

- [ ] **Step 1: All gates**

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
npm run e2e:library-modal
npm run e2e:field-rules
npm run format:check
```

Expected:

- Runtime tests: 110/110 (no engine change)
- API tests: 99/99
- E2E: 5/5
- typecheck/build/format: clean
- field-rule-helpers.test.ts: 14 pass

- [ ] **Step 2: Format if dirty**

```bash
npm run format
git add -A
git diff --cached --quiet || git commit -m "chore: format after field-rules implementation"
```

### Task 4.3: RESUME + project-plan refresh

**Files:**

- Modify: `RESUME.md`
- Modify: `docs/project-plan.md`

- [ ] **Step 1: Append to RESUME.md "What Was Just Completed"**

```markdown
- **Field-rules authoring** (this run):
  - First author-side UX slice for visibility/required rules. New
    `FieldRuleWizard` lets the author declare "when field X equals Y,
    show / hide / mark required / mark optional field Z" without
    hand-building a runtime listener.
  - Two entry points: affected-field inspector (`FieldRulesList`) and
    trigger-field behavior section (`FieldRulesTriggers`). Both feed
    the same wizard.
  - Pure helpers in `apps/web/src/lib/field-rule-helpers.ts` own
    encode/decode/find/conflict-detect (14 unit tests).
  - No schema change. No engine change. Rule shape is a structural
    convention over `RuntimeListenerDefinition`.
  - Path-branching wizard deferred to next slice.
  - Gates: typecheck/builds clean, runtime 110/110, API 99/99,
    E2E 5/5 (added e2e:field-rules), format clean.
```

- [ ] **Step 2: Append to docs/project-plan.md Progress Log**

```markdown
- 2026-05-14: Field-rules authoring slice shipped. Spec [docs/superpowers/specs/2026-05-14-field-rules-authoring-design.md](/Users/clint/Workspace/forms-builder/docs/superpowers/specs/2026-05-14-field-rules-authoring-design.md). Plan [docs/superpowers/plans/2026-05-14-field-rules-authoring.md](/Users/clint/Workspace/forms-builder/docs/superpowers/plans/2026-05-14-field-rules-authoring.md). New `FieldRuleWizard` + `FieldRulesList` + `FieldRulesTriggers` mount the same wizard from two entry points (field-inspector and trigger-field behavior section). Pure helpers `field-rule-helpers.ts` encode/decode/find/conflict-detect (14 tests). Rule shape = `field.change` listener + single atom condition + single show/hide/mark_required/mark_optional action. No schema or engine change. Gates: runtime 110/110, pytest 99/99, E2E 5/5 (new e2e:field-rules).
```

- [ ] **Step 3: Commit**

```bash
git add RESUME.md docs/project-plan.md
git commit -m "docs: RESUME + project-plan refresh for field-rules ship"
```

---

## Self-Review

**Spec coverage:**

- Storage substrate (runtime listeners) — Phase 1.2 `encodeFieldRule` builds the canonical shape. ✓
- Effects in scope (show/hide/require/optional) — Phase 1.1 `ACTION_KIND_TO_EFFECT` mapping. ✓
- Rule composition (one rule = one effect) — `encodeFieldRule` always emits one action. ✓
- Condition complexity (single atom) — `isFieldRuleListener` rejects groups. ✓
- Operators (all four) — wizard's `OPERATOR_OPTIONS`. ✓
- Engine model (imperative substrate, no engine change) — no engine task in plan. ✓
- Initial state (authored default) — wizard does not touch initial-state controls; field default lives on the field. ✓
- Entry points (both) — Phase 3.2 (affected) + Phase 3.3 (trigger). ✓
- Helper module API — Phase 1 implements all five signatures. ✓
- UI components (4 files) — Phase 2 creates each. ✓
- Validation (Save disabled, conflict warnings) — Phase 2.2 + 2.3. ✓
- E2E — Phase 4.1. ✓

**Placeholder scan:** none — every step has concrete code or commands.

**Type consistency:** `FieldRule`, `FieldRuleEffect`, `FieldRuleFieldOption`, `FieldRuleConflict`, `RuntimeConditionOperator` names stable across helpers + wizard + lists + tests. Effect words (`show` / `hide` / `require` / `optional`) consistent in helper + wizard option labels.

**Callouts for execution:**

- Phase 3.1 Step 3 references `findSelectionForNodeId` — that function was added to App.tsx in the prior behavior-graph-discovery ship and already lives in the file. Confirm before assuming.
- Phase 3.2 requires discovering the actual inspector mount file. The plan defers the exact file path to the grep in Step 1; conform to whatever the inspector implementation uses for the field-properties behavior section.
- The wizard's "Add a new listener" path in Phase 3.1 sets `selectedAuthoring` to the trigger field before calling `addRuntimeListener` because `addRuntimeListener` operates on the active scope. If the existing implementation has a scope-explicit `addRuntimeListenerForSelection` helper, prefer that — it removes the schedule/promise dance.
