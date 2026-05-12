# MVP scope assessment — post Phase 3

Date: 2026-05-10
Branch: main (Phase 0-3 + Phase 2/3 polish all shipped)

## Where we stand

Behavior authoring redesign per `/Users/clint/.claude/plans/investigate-event-listener-and-distributed-shore.md` is **substantively complete**:

- Phase 0 (App.tsx split) shipped.
- Phase 1 (Stack + Library + Refs + Manager Table) shipped.
- Phase 2 (Discovery + project scope + manager views) shipped (sub-phases 2A-2D-3 + polish).
- Phase 3 (Engine async + control flow + time) shipped (Stages A-H + 4 closeout items).
- Runtime suite 89/89, pytest 99/99, a11y smoke clean, browser smoke clean.

The runtime, schema, persistence, and authoring surfaces match the locked direction A+. Nothing in the original spec is partial or red.

## Scope still in spec but explicitly deferred (named gaps)

From the spec's "Out of scope (named known gaps)" list (lines 275-285):

1. **Realtime collaboration** on behavior editing
2. **CI behavior scenario tests** authored on the form
3. **Production telemetry aggregation, dashboards, alerting** (host responsibility)
4. **Cross-form visual flow editor**
5. **Behavior export/import** as standalone artifacts
6. **Org-shared library** (configurable folder; phase post-MVP)
7. **Authoring-tool roles** (admin/editor/viewer)
8. **Authoring-tool i18n** beyond English-only MVP
9. **Scheduled/cron-style behaviors**

These are intentional deferrals. Picking any one without product input would be premature.

## Where signal points next (recommendation rank)

Ranked by leverage-to-effort, biased toward unblocking real authoring use rather than scope expansion:

### 1. Browser-side end-to-end of the Phase 3 composer

Half-shipped: the composer surfaces are in place (Stage G + Stage #2 BranchActionCard), but **no live E2E test confirms author → engine → preview round-trip** for a branch/wait/host_call_await chain. A small Playwright spec under `apps/web/e2e/` would lock the contract that:

- author can compose a host_call_await chain in the inspector;
- save + reload preserves the chain;
- preview dispatch suspends and resumes when a mocked host responds.

Effort: ~1 day. Pays for itself the first time someone touches the composer.

### 2. Authoring-tool roles (#7) — at least a "viewer" mode

The product has no current role model. As soon as multiple humans share a project (which is implied by the existing project list + revisions), there is risk of accidental destructive edits. A minimal `viewer` mode that disables all mutations (save, publish, behavior add/delete) closes that gap with one boolean and a wrap-render in the Builder shell.

Effort: ~1 day. Unblocks any "two-person review" workflow.

### 3. Behavior export/import (#5) — one-way export first

Behavior export as a JSON artifact (single listener or full listener tree) unlocks:

- a real story for copy-paste between projects (today only the Behavior Library supports this, and only at the entry granularity);
- bug-report attachments (author exports a listener, files an issue);
- offline test fixtures (writer can hand-craft listeners outside the UI).

Import is harder (NodeRef remapping, EventRef resolution). Start with export only. Add import once the export format is locked.

Effort: ~0.5 day for export, ~2 days for import. Export alone gives most of the value.

### 4. Cross-form visual flow editor (#4)

The hardest of the spec deferrals because it implies a multi-form workspace, not just multi-form runtime. Today projects are single-form. **Do not start this without product confirming the multi-form story.** A premature start would lock UX decisions that the product hasn't yet thought through.

### 5. Realtime collaboration (#1)

Even further. Requires conflict resolution semantics for the runtime contract (e.g. what happens when two authors edit the same listener simultaneously?). Defer indefinitely unless the host platform commits to a CRDT-style sync layer.

### 6-9. The rest

- **CI scenario tests on the form (#2)**: depends on an authoring-tool QA story we don't have. Defer.
- **Telemetry aggregation (#3)**: explicit host responsibility per the RFC. Don't pull into the authoring tool.
- **Org-shared library (#6)**: needs filesystem/storage policy from product. Defer.
- **i18n (#8)**: schema already supports `i18n: { en: …, … }` — the slot exists; populating it is content work, not engineering.
- **Scheduled/cron behaviors (#9)**: a different runtime model (the engine assumes event-driven). Don't bolt on without an RFC.

## Recommendation

**Pick #1 (Playwright E2E for Phase 3 composer) next.** It validates ~3 weeks of recent work, doesn't expand scope, and produces a tangible safety net. Then revisit the rank with the user — likely #2 (viewer role) and #3 (behavior export) become the natural follow-ons.

If the user wants a feature push instead of a hardening push, **#3 (one-way behavior export) is the cheapest visible deliverable**: small surface, immediate utility (copy listeners between projects), clean separation from the runtime contract.
