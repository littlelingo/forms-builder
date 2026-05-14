# Field-Rules Authoring — Design Spec

**Date:** 2026-05-14
**Owner:** Clint Little
**Status:** Draft

## Goal

Ship the first author-side UX slice for visibility and required-state rules: an opinionated wizard that lets the author declare "when field X equals value Y, show / hide / mark required / mark optional field Z" without hand-building a runtime listener. Both the affected field's inspector and the trigger field's behavior section surface entries to the same wizard, and both render rules in a readable list.

Path-branching (`branch` action) authoring is the planned next slice and is **out of scope here**.

## Motivation

The runtime engine already supports field-level visibility, enabled-state, and required-state via the `show_node` / `hide_node` / `enable_node` / `disable_node` / `mark_required` / `mark_optional` actions and the `RuntimeConditionDefinition` atom. To compose one of these rules today, the author has to:

1. Open Behavior Studio,
2. Create a listener on the trigger field for `field.change`,
3. Manually build the condition atom + expected value,
4. Pick an effect action and target the affected field.

The wizard collapses that into a single guided flow expressed in user language ("when X equals Y, show Z"). Authoring stays declarative-feeling even though the runtime substrate stays imperative.

## Decisions captured in this spec

| Topic                | Decision                                                                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage substrate    | Runtime listeners (no legacy `field.conditionals[]`).                                                                                                                  |
| Effects in scope     | `show_node`, `hide_node`, `mark_required`, `mark_optional`. `enable_node` / `disable_node` deferred — disabled fields are usually re-shaped instead in modern form UX. |
| Rule composition     | One rule = one effect. Multiple effects = multiple rules.                                                                                                              |
| Condition complexity | Single atom (one trigger field, one operator, one expected value). AND/OR/NONE groups deferred to a follow-up slice.                                                   |
| Operators            | All four (`equals`, `not_equals`, `contains`, `exists`).                                                                                                               |
| Engine model         | Imperative substrate with declarative-feel UX. No schema change, no engine change.                                                                                     |
| Initial state        | Field's authored default (visible/hidden, optional/required) is the baseline. Rules only toggle from that default when the trigger condition becomes true / false.     |
| Entry points         | Two: affected-field inspector + trigger-field behavior section. Same wizard, same underlying listener.                                                                 |

## Architecture

### Storage shape

A "field rule" is **always** a `RuntimeListenerDefinition` with this structural shape:

- `eventName === "field.change"`
- `eventSourceNodeId === triggerFieldId` (the source of the trigger event)
- `conditions.length === 1` AND `conditions[0]` is an atom (`RuntimeConditionDefinition`, not a group) with `source.kind === "field_value"` and `source.fieldId === triggerFieldId`
- `actions.length === 1` AND `actions[0].kind` is one of `show_node` / `hide_node` / `mark_required` / `mark_optional`, with `config.nodeId === affectedFieldId`

Any listener that matches this exact shape is a field rule. Anything that deviates (multiple actions, multiple conditions, different action kind, etc.) is a regular listener and is left untouched by the rule helpers.

### Helper module

`apps/web/src/lib/field-rule-helpers.ts` — pure logic, framework-free, tested with `tsx --test`.

```ts
export interface FieldRule {
  listenerId: string;
  triggerFieldId: string;
  operator: RuntimeConditionOperator; // "equals" | "not_equals" | "contains" | "exists"
  expectedValue: string;
  effect: "show" | "hide" | "require" | "optional";
  affectedFieldId: string;
}

export interface FieldRuleConflict {
  fieldId: string;
  effectPair: ["show", "hide"] | ["require", "optional"];
  rules: [FieldRule, FieldRule];
}

export function isFieldRuleListener(listener: RuntimeListenerDefinition): boolean;
export function decodeFieldRule(listener: RuntimeListenerDefinition): FieldRule | null;
export function encodeFieldRule(rule: Omit<FieldRule, "listenerId">): RuntimeListenerDefinition;

export function findRulesAffectingField(doc: AuthoringDocument, fieldId: string): FieldRule[];
export function findRulesTriggeredByField(doc: AuthoringDocument, fieldId: string): FieldRule[];
export function detectFieldRuleConflicts(rules: FieldRule[]): FieldRuleConflict[];
```

Effect names in `FieldRule` (`show` / `hide` / `require` / `optional`) are the author-facing words; encoders translate them to the four runtime action kinds. `decodeFieldRule` returns `null` for any listener that fails the structural shape — callers never see an ambiguous rule.

### UI components

| File                                                                | Responsibility                                                                                                                                                                                                                           |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/features/behavior/field-rules/FieldRuleWizard.tsx`    | Modal wizard. Five logical fields: effect, target, trigger, operator, expected value. Save / Cancel. Reuses the existing `ConfirmDialog` primitive for save/cancel UX language. Mounts via `createPortal` like `LibraryPicker`.          |
| `apps/web/src/features/behavior/field-rules/FieldRulesList.tsx`     | Renders the rules that affect a given field. Each row: one-line summary + Edit + Delete. Conflict warnings inline. Mounts inside the field inspector behavior section.                                                                   |
| `apps/web/src/features/behavior/field-rules/FieldRulesTriggers.tsx` | Renders the rules that this field triggers. Each row: one-line summary + Edit + Delete. Mounts inside the trigger-field's behavior section.                                                                                              |
| `apps/web/src/features/behavior/field-rules/value-picker.tsx`       | Small input dispatcher that picks the right control for the expected-value input based on the trigger field's semantic type (select → option dropdown, checkbox → boolean, plain text → text input, `exists` operator → no value input). |

The wizard's "Pick a field" controls reuse the existing field-picker pattern from `BehaviorComposer` where possible (so the doc-wide field tree + recently-used chips stay consistent). If the field-picker isn't easily reusable, the wizard falls back to a flat `<select>` with field labels.

### Wizard data flow

**Create (affected-field entry):**

1. User opens field inspector → "Rules affecting this field" panel → "+ Add rule".
2. Wizard opens with `affectedFieldId` pre-filled (locked, can be edited via the "Change" affordance).
3. Effect step: radio group with the four effects. Default "show".
4. Trigger step: field picker (excludes the affected field by default to discourage self-rules — but allowed if author overrides).
5. Operator + value step: operator dropdown + value picker. `exists` hides the value picker.
6. Save → `encodeFieldRule` builds a `RuntimeListenerDefinition` → `addRuntimeListenerToDoc(doc, triggerFieldId, listener)` mutates the doc → existing autosave/persist path saves.

**Create (trigger-field entry):**

Same wizard. `triggerFieldId` pre-filled (locked, can be edited). All other steps identical.

**Read (rendering rules):**

- `FieldRulesList` walks `doc.runtime.formListeners` + every node's `runtime.listeners`, decodes each via `decodeFieldRule`, filters by `affectedFieldId === fieldId`.
- `FieldRulesTriggers` does the same with `triggerFieldId === fieldId`.
- Both render a stable summary: `"<Effect> <Affected> when <Trigger> <operator> <value>"`.

**Update:**

Edit button opens the same wizard with the existing rule pre-filled. Save replaces the listener in place (same listener id).

**Delete:**

Delete button removes the listener from its owner. Hard-delete with a `ConfirmDialog` since the rule is a single-purpose listener — no other meaning to preserve.

### Conflict surfacing

`detectFieldRuleConflicts(rules)` flags pairs of rules where:

- Same `affectedFieldId`
- Opposing `effect` (`show` vs `hide`, or `require` vs `optional`)
- Same `triggerFieldId`
- Same `operator` and same `expectedValue` (or both have `operator === "exists"`)

The pair is listed with both rule ids so the inspector can render the warning next to both rows. Cross-trigger conflicts (e.g., trigger A says "show", trigger B says "hide" — both potentially true at once) are **not** flagged in this slice; that's a runtime-time race and is left to the existing trace surface to expose.

### Persistence + autosave

No schema change. The new listeners flow through the existing project persistence path (`PUT /projects/{id}/document`). Autosave + revision snapshots cover field rules for free.

### Removing fields with active rules

When a field is deleted, any rule listeners that reference it (as trigger OR target) become stale. The existing `nodeTombstones` + broken-ref surface already covers this case — broken refs render in the broken-refs panel and the trace shows `runtime.broken_ref` events. No additional cleanup required in this slice. (A follow-up slice could prompt-on-delete for fields with active rules.)

## Components by Responsibility

| Component               | Owns                                                                                                                                                 | Doesn't own                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `field-rule-helpers.ts` | Encode / decode / find / conflict-detect. Pure logic.                                                                                                | UI, mutation.                                |
| `FieldRuleWizard`       | The wizard surface + form state.                                                                                                                     | Doc mutation (delegates via `onSave(rule)`). |
| `FieldRulesList`        | Reading rules where target = fieldId, rendering rows, wiring conflict warnings.                                                                      | Authoring mutation.                          |
| `FieldRulesTriggers`    | Reading rules where trigger = fieldId, rendering rows.                                                                                               | Authoring mutation.                          |
| `value-picker.tsx`      | Per-type expected-value input.                                                                                                                       | Operator selection.                          |
| `App.tsx`               | Owning the wizard's open state, building `triggerFieldId` / `affectedFieldId` initial fills, applying `encodeFieldRule` output to the doc, autosave. | Wizard internals.                            |

## Validation

- Wizard's Save disabled until effect + target + trigger + operator are all set. If operator is `exists`, value input hidden and not required. Otherwise value can be empty (some rules want "trigger is empty string").
- Wizard's Save disabled if the same rule already exists (exact structural duplicate).
- Inspector list shows inline conflict warnings (red border + small "Conflicts with rule above"). Save in the wizard does NOT block on conflict — author may legitimately want a conflicting rule to test priority. Conflict surfacing is informational, not blocking.

## Testing

### Unit tests (`tsx --test`)

`apps/web/src/lib/field-rule-helpers.test.ts` — minimum 8 tests:

1. `encodeFieldRule` then `decodeFieldRule` round-trips with stable shape.
2. `decodeFieldRule` returns `null` for a listener with multiple actions.
3. `decodeFieldRule` returns `null` for a listener with a group condition (not atom).
4. `decodeFieldRule` returns `null` for a listener with a non-rule action kind.
5. `findRulesAffectingField` picks up form-level + node-level listeners.
6. `findRulesTriggeredByField` matches on `triggerFieldId`.
7. `detectFieldRuleConflicts` flags show/hide pair with identical condition.
8. `detectFieldRuleConflicts` flags require/optional pair with identical condition.
9. `detectFieldRuleConflicts` does NOT flag pairs with different `expectedValue`.

### E2E

New `apps/web/e2e/field-rules.run.mjs` + `e2e:field-rules` npm script:

1. Open fixture project.
2. Select source field (checkbox).
3. Select target field (a radio).
4. Open `FieldRulesList` on target → click "+ Add rule".
5. Wizard: pick effect "Hide", trigger field = checkbox, operator = "equals", value = "Disability".
6. Save → rule appears in list.
7. Open TestPanel via Cmd+K → fire `field.change` on checkbox with payload `nextValue=Disability`.
8. Assert trace shows `hide_node` action executed on radio.
9. Verify rule round-trips through save + reload (existing reducer / persistence test or new pytest cross-item-persistence variant).

Reuses the checkbox-to-radio fixture wherever possible.

## Out of scope (deferred)

- AND/OR/NONE condition groups (follow-up slice).
- `enable_node` / `disable_node` effects (no clear modern UX need yet).
- Path-branching wizard (`branch` action) — separate Task 3 follow-up.
- Cross-trigger conflict detection (runtime-time race; trace surface already exposes it).
- Prompt-on-delete for fields with active rules (low priority; broken-ref surface already exists).
- Group-targets ("when X, show all fields in group G") — every effect targets a single field for now.

## Open Questions

None. All decisions captured above.
