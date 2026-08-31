# UX Requirements Checklist: Metals Module Redesign

**Purpose**: Audit the completeness, clarity, consistency, and measurability of Metals V1 UX requirements before mockup and implementation planning
**Created**: 2026-08-25
**Feature**: [Metals Module Redesign](../spec.md)

**Note**: This checklist evaluates the requirements themselves, not an implementation or final visual treatment.

## Connected Information Architecture

- [ ] CHK001 Are Home, Metals, Live Rates, holding detail, and History assigned distinct user goals without duplicating ownership and market meaning? [Completeness, Spec §FR-001–FR-007]
- [ ] CHK002 Is the Home snapshot content explicit about portfolio value, trustworthy P/L, Gold count, Silver count, compact Gold/Silver rates, freshness, and two separate destinations? [Clarity, Spec §FR-001–FR-002, SC-014]
- [ ] CHK003 Are Gold-only, Silver-only, mixed, empty-active, and terminal-history-only Home outcomes defined without implying ownership from market rates? [Coverage, Spec §User Story 1.5–1.6, SC-014]
- [ ] CHK004 Is the Metals landing responsibility complete for active value, unrealized P/L, lifetime realized sale P/L, allocation, Add, recent History, and complete History access? [Completeness, Spec §FR-003–FR-004]
- [ ] CHK005 Is Live Rates clearly limited to supported Gold, Silver, and fiat market information with freshness, connectivity, refresh state, and real recovery action? [Clarity, Spec §FR-006]
- [ ] CHK006 Are holding-detail requirements complete for active, Sold, Disposed, restored, and conflicted Gold/Silver holdings without merging terminal facts into current ownership? [Coverage, Spec §FR-016–FR-017, FR-040–FR-045, FR-080]

## Navigation, Filters, and Findability

- [ ] CHK007 Are separate Home entry points to portfolio and full rates unambiguous while preserving selected currency and trust state? [Consistency, Spec §FR-001–FR-002, FR-007]
- [ ] CHK008 Is All unambiguously the initial Metals filter on every new visit, with Gold and Silver filters defined consistently? [Clarity, Spec §FR-003, User Story 1.4]
- [ ] CHK009 Are empty Gold and Silver filter outcomes defined when active ownership contains only the other supported metal? [Coverage, Spec §User Story 1.6]
- [ ] CHK010 Is All unambiguously the initial History filter, with Sold and Disposed filters and newest-first ordering defined? [Clarity, Spec §FR-005]
- [ ] CHK011 Are recent-History capacity, ordering, and the transition to complete History specified without hiding terminal records at compact sizes? [Completeness, Spec §FR-004–FR-005, Assumptions]
- [ ] CHK012 Are entry and return paths among a holding row, holding detail, History event detail, Undo, restored Active state, and re-recording defined consistently? [Coverage, Spec §User Story 3, User Story 8, FR-041–FR-045, FR-082]
- [ ] CHK013 Are cancellation, back navigation, and unsaved-input outcomes for full-screen Add, Edit, Sell, and Dispose intentionally specified or explicitly deferred? [Gap]

## Hierarchy and Progressive Disclosure

- [ ] CHK014 Is the combined P/L result required to remain visible while detailed attribution stays collapsed by default and expandable on demand? [Consistency, Spec §FR-050–FR-052]
- [ ] CHK015 Are requirements clear about which attribution components appear for unrealized versus realized P/L and how unavailable components are explained? [Clarity, Spec §FR-050–FR-052, FR-059]
- [ ] CHK016 Are ordinary metadata editing and material acquisition correction separated by clear inline comparison, live-consequence, direct-save, and history requirements within one complete Edit form? [Completeness, Spec §FR-018–FR-020]
- [ ] CHK017 Is the unusual-value in-form warning distinguishable from invalid-value rejection and ordinary direct Add submission while keeping the user in the same form? [Clarity, Spec §FR-012–FR-014]
- [ ] CHK018 Are semantic action priorities defined strongly enough to keep Sell and Edit primary/ordinary while Dispose and Delete remain clearly consequential, without dictating final component placement? [Gap, Spec §User Stories 4–7]

## Focused Financial and Destructive Flows

- [ ] CHK019 Are Add and Edit/correction explicitly one complete full-screen form each, with shared field order/layout, visible optional fields, compact live preview, direct submission, unavailable-preview, and validation outcomes? [Completeness, Spec §FR-008–FR-019]
- [ ] CHK020 Does Sell clearly exclude partial weight while specifying proceeds, currency, fees, notes, account-credit choice, live-summary totals, and permanent Sold outcome? [Completeness, Spec §FR-025–FR-032]
- [ ] CHK021 Does Dispose live summary state the category, financial meaning, ownership removal, permanent History retention, and exclusion from realized sale P/L before direct submission? [Completeness, Spec §FR-033–FR-036, FR-072]
- [ ] CHK022 Does Delete remain limited to an incorrect Active record and communicate that it creates no sale, disposal, proceeds, P/L, write-off, or transfer? [Consistency, Spec §FR-037–FR-038]
- [ ] CHK023 Does Undo communicate preservation of the original terminal event, restoration of the same holding, linked account reversal, failure recovery, and visible Active state before re-recording? [Completeness, Spec §FR-042–FR-045, FR-082]
- [ ] CHK024 Are action availability rules consistent for Active, Sold, Disposed, restored, pending, incomplete, and conflicted Gold/Silver holdings? [Consistency, Spec §FR-017–FR-024, FR-037–FR-045, FR-080]
- [ ] CHK025 Is optional same-currency account credit distinguished from recording a sale, disabled until issue #242 is merged and verified, and is the cross-currency exclusion explained without blocking the sale? [Clarity, Spec §FR-030–FR-032]

## State and Recovery Coverage

- [ ] CHK026 Are loading, empty, populated, partial-ownership, stale, missing-data, error, and offline requirements mapped to every relevant screen rather than stated only as a global list? [Coverage, Spec §FR-061]
- [ ] CHK027 Are fresh cached, stale cached, unknown-freshness, missing-current-rate, invalid-input-rate, and failed-refresh outcomes mutually distinguishable? [Clarity, Spec §FR-053–FR-059, FR-074–FR-075]
- [ ] CHK028 Are pending submission, duplicate-prevention, explicit success, input-preserving failure, and safe retry outcomes required for every mutating journey? [Completeness, Spec §FR-076–FR-078, SC-015]
- [ ] CHK029 Are stale or unknown-freshness acknowledgment requirements limited to affected financial confirmations and excluded from factual metadata edits? [Consistency, Spec §FR-055]
- [ ] CHK030 Are incomplete synchronized groups and competing offline terminal chains given understandable non-effective, automatic-reconciliation, exact-once compensation, lock, success, and retry outcomes? [Coverage, Spec §FR-079–FR-080, FR-088–FR-089]
- [ ] CHK031 Are restart and offline requirements consistent across Add, Edit, Sell, Dispose, Delete, and Undo without allowing partial visible financial state? [Consistency, Spec §FR-039, FR-062, SC-003]

## Responsive and Theme Requirements

- [ ] CHK032 Are compact phone, ordinary phone, tablet, portrait, and landscape requirements outcome-based and complete for facts, filters, forms, History, and reachable actions? [Completeness, Spec §FR-069, SC-010]
- [ ] CHK033 Are enlarged-text requirements explicit about reflow, unclipped required values, readable consequence copy, and reachable sticky or terminal actions? [Clarity, Spec §FR-069, SC-010]
- [ ] CHK034 Are light- and dark-theme requirements equivalent for hierarchy, action priority, trust states, and specified contrast thresholds? [Completeness, Spec §FR-071, SC-013]
- [ ] CHK035 Are reduced-motion requirements defined beyond naming the setting, including which meaning must remain when motion is absent? [Ambiguity, Spec §FR-069]

## Requirement Boundaries and Acceptance Quality

- [ ] CHK036 Can connected-navigation, task-duration, state-integrity, Home-composition, theme-parity, and duplicate-prevention outcomes be measured without assuming a particular component library or layout? [Measurability, Spec §SC-001–SC-003, SC-013–SC-015]
- [ ] CHK037 Does the specification preserve the approved calm Nile Ledger intent while leaving exact visual composition, component choice, and metal-accent treatment to mockup approval? [Consistency, Spec §Assumptions]

## Notes

- Check items off as completed: `[x]`
- Add findings and requirement references inline.
- Keep implementation and visual-QA observations outside this requirements checklist.

## Reconciliation — 2026-08-25

**Authority**: This ledger is the current resolution status; the unchecked questions above remain unchanged as historical requirements tests.

### Satisfied

- **CHK013** — Satisfied by `FR-076`, `FR-078`, `FR-086`, `FR-099`, and `SC-024`: untouched exit, dirty-form Keep editing/Discard changes, live-preview input retention, pending-submit isolation, failure retention, and operating-system termination boundaries are explicit.
- **CHK018** — Satisfied by `FR-087`, `FR-099`, and `SC-024`: action priority is state-based and semantic without prescribing component placement.
- **CHK035** — Satisfied by `FR-069`, `FR-099`, `SC-010`, `SC-024`, and `SC-029`: reduced motion removes nonessential motion while retaining progress, disclosure, success, failure, and state-change meaning.

### Superseded wording

- **CHK006, CHK024** — “reversed” as a holding state is superseded by **Active restored by a reversal event**. `FR-040`, `FR-043`, `FR-082`, `FR-099`, and `SC-030` preserve reversal history while the holding state is Active.
- **CHK026** — “partial-ownership” is superseded by **partial or missing data**. `FR-061`, `FR-099`, the missing-data edge case, and `SC-030` require ownership to remain Active, Sold, or Disposed.

### Deferred

- **CHK030, CHK031 (recovery composition only)** — Canonical visuals and the approved handoff close the design gate; implementation and responsive/accessibility proof remain future work under `FR-095`–`FR-099`, `SC-027`, `SC-029`, and `SC-030`.
