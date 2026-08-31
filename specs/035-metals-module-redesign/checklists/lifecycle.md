# Lifecycle Requirements Quality Checklist: Metals Module Redesign

**Purpose**: Assess whether holding states, legal transitions, correction rules, terminal actions, reversal, permanent history, linked effects, conflict states, and recovery criteria are precise enough for pre-design and pre-plan approval. **Created**: 2026-08-25 **Feature**: [spec.md](../spec.md)

**Note**: This checklist evaluates requirement quality, not implementation behavior.

## State Model and Legal Transitions

- [ ] CHK001 Are Active, Sold, Disposed, reversed-to-Active, pending, incomplete-remote-group, and conflicted states defined without creating contradictory sources of ownership truth? [Completeness, Spec §Key Entities, Spec §FR-079, Spec §FR-080]
- [ ] CHK002 Is one effective ownership state required for each holding outside an explicitly unresolved conflict? [Gap, Spec §FR-047, Spec §FR-080]
- [ ] CHK003 Are all legal transitions documented from creation through active correction, Sell, Dispose, Undo, re-record, Delete, and automatic reconciliation? [Completeness, Spec §FR-018–FR-045, Spec §FR-080, Spec §FR-082]
- [ ] CHK004 Are prohibited transitions explicit for terminal Delete, terminal in-place edit, partial exit, repeated terminal action, and lifecycle action during unresolved conflict? [Coverage, Spec §FR-023, Spec §FR-025, Spec §FR-038, Spec §FR-080]
- [ ] CHK005 Does the state model distinguish event occurrence from event effectiveness so reversed, rejected-conflict, and incomplete-group events can remain historical without changing ownership? [Clarity, Spec §FR-040, Spec §FR-079, Spec §FR-080]
- [ ] CHK006 Are action-availability requirements defined for every effective, pending, incomplete, conflicted, and terminal Gold/Silver state? [Gap, Spec §FR-017, Spec §FR-061, Spec §FR-076, Spec §FR-080]

## Active Metadata and Material Corrections

- [ ] CHK007 Are ordinary metadata fields limited consistently to name and notes for both active and terminal holdings? [Clarity, Spec §FR-018]
- [ ] CHK008 Are weight, purity, physical form, purchase price, purchase currency, and purchase date consistently classified as material active corrections? [Consistency, Spec §FR-019]
- [ ] CHK009 Does the same-form material-correction state show complete previous/current facts, live recalculation consequences, reference-evidence consequences, and rate-trust consequences before direct `Save changes`? [Completeness, Spec §FR-019, Spec §FR-073]
- [ ] CHK010 Is the immutable correction-history entry defined sufficiently to preserve changed fields, prior facts, corrected facts, date, and user-visible meaning without overcommitting storage design? [Gap, Spec §FR-020, Spec §Key Entities]
- [ ] CHK011 Is metal type locked after creation in every edit, correction, synchronization, and recovery path? [Coverage, Spec §FR-021]
- [ ] CHK012 Are wrong-metal requirements explicit that only an incorrect Active record may use Delete followed by a separate Add, with no linked replacement state in V1? [Clarity, Spec §FR-022]
- [ ] CHK013 Are consequences of correcting acquisition date, currency, cost, weight, or purity defined for current calculations while preserving prior daily dashboard snapshots? [Completeness, Spec §FR-020, Spec §FR-060]

## Whole Sell and Linked Proceeds

- [ ] CHK014 Is whole-holding scope stated consistently across action availability, review, history, P/L, and scope exclusions, with no partial weight or residual ownership path? [Consistency, Spec §FR-025, Spec §Scope Boundaries]
- [ ] CHK015 Are sale-date constraints complete for non-future date, date not before acquisition, locale/calendar interpretation, and ordering against earlier lifecycle events? [Completeness, Spec §FR-026, Spec §Edge Cases]
- [ ] CHK016 Are gross proceeds, proceeds currency, fees, and notes requirements clear about required, optional, positive, zero, and invalid states? [Clarity, Spec §FR-026, Spec §FR-027]
- [ ] CHK017 Does the zero-proceeds rule consistently route the outcome to Dispose while prohibiting negative net proceeds and fees above gross proceeds? [Consistency, Spec §Edge Cases, Spec §Assumptions]
- [ ] CHK018 Are live Sale-summary requirements complete for ownership loss, permanent history, gross and net proceeds, fees, cost basis, realized result, rate trust, and optional account credit? [Completeness, Spec §FR-028, Spec §FR-055]
- [ ] CHK019 Is same-currency account credit explicitly optional, disabled until issue #242 is merged and verified, and limited to one linked net-proceeds effect without changing Sale validity when omitted? [Clarity, Spec §FR-030–FR-032]
- [ ] CHK020 Are asset-sale proceeds classification and exclusion requirements consistent across account balance, ordinary income, budget income, earned cashflow, and Undo? [Consistency, Spec §FR-031, Spec §FR-044]

## Dispose and Delete Semantics

- [ ] CHK021 Are Dispose date requirements specified with the same temporal precision as Sale, including non-future and not-before-acquisition constraints? [Gap, Spec §FR-033, Spec §Edge Cases]
- [ ] CHK022 Are Lost, Damaged, Gifted, Donated, and Other categories exhaustive, mutually understandable, and distinct from Sale and Delete? [Clarity, Spec §FR-033–FR-037]
- [ ] CHK023 Is Other defined enough to prevent it from silently representing sale proceeds, ordinary income, or an uncategorized write-off? [Ambiguity, Spec §FR-036, Spec §FR-072]
- [ ] CHK024 Does the live Dispose summary define the category-specific write-off, external-transfer, or other non-sale meaning before ownership leaves Active? [Completeness, Spec §FR-072]
- [ ] CHK025 Are Lost and Damaged cost-basis write-off requirements consistent with exclusion from lifetime realized sale P/L? [Consistency, Spec §FR-034]
- [ ] CHK026 Are Gifted and Donated external-transfer requirements consistent with zero proceeds, no ordinary income, and no realized sale P/L? [Consistency, Spec §FR-035]
- [ ] CHK027 Is Delete restricted to an incorrect Active record and clearly separated from disposal, financial outcome, terminal history, and reversible lifecycle activity? [Clarity, Spec §FR-037, Spec §FR-038]
- [ ] CHK028 Does the permanent creation-history requirement explain what remains auditable after Delete while the holding is absent from normal portfolio and terminal-history views? [Conflict, Spec §FR-037, Spec §FR-040]

## Terminal Immutability, Undo, and Re-Record

- [ ] CHK029 Are terminal physical, acquisition, sale, disposal, and reversal facts consistently immutable while name and notes remain ordinary metadata? [Consistency, Spec §FR-018, Spec §FR-023]
- [ ] CHK030 Is Undo availability defined without a time limit for every effective Sold and Disposed state while excluded from rejected, incomplete, or already reversed events? [Completeness, Spec §FR-042, Spec §FR-080]
- [ ] CHK031 Does Undo preserve the original terminal event, append a reversal, restore the same holding to Active, and recompute only current and future ownership results? [Completeness, Spec §FR-043, Spec §FR-060]
- [ ] CHK032 Is linked account compensation defined as part of the same locally complete Undo outcome, with no ordinary-income effect? [Clarity, Spec §FR-044]
- [ ] CHK033 Are failure requirements explicit that unsafe linked compensation leaves ownership and account balance unchanged and provides actionable recovery? [Clarity, Spec §FR-045]
- [ ] CHK034 Is terminal-fact correction consistently defined as visible Undo to Active followed by a separate new terminal action with its own live consequence summary and direct submission, with no automatic or hidden replacement? [Consistency, Spec §FR-024, Spec §FR-082]
- [ ] CHK035 Are action availability and rate-consequence requirements defined for the interval after Undo restores Active and before a corrected terminal action is recorded? [Gap, Spec §FR-055, Spec §FR-082]

## Permanent History, Conflict, and Recovery Quality

- [ ] CHK036 Are creation, correction, sale, disposal, and reversal History requirements complete and ordered while rejected reconciliation evidence remains internal and non-effective? [Completeness, Spec §FR-040, Spec §FR-080, Spec §FR-088]
- [ ] CHK037 Is deterministic ordering specified for events sharing the same displayed timestamp or arriving out of order through synchronization? [Gap, Spec §FR-005, Spec §FR-040]
- [ ] CHK038 Are incomplete remote groups and competing terminal chains required to remain ineffective without disappearing from recovery-oriented history? [Clarity, Spec §FR-079, Spec §FR-080]
- [ ] CHK039 Can SC-007 and SC-015 objectively assess immutable history, duplicate prevention, explicit success, preserved entered facts, and safe retry across every lifecycle action? [Measurability, Spec §SC-007, Spec §SC-015]
- [ ] CHK040 Does SC-016 cover every legal conflict pair, linked account consequence, exact-once rejected-group compensation, restart point, incomplete-evidence lock, and retry path? [Gap, Spec §SC-016]

## Notes

- Check items off as completed: `[x]`
- Add comments or findings inline
- Link findings to the cited requirement, gap, ambiguity, conflict, or assumption
- Items are numbered sequentially for traceability

## Reconciliation — 2026-08-25

**Authority**: This ledger is the current resolution status; the unchecked questions above remain unchanged as historical requirements tests.

### Satisfied

- **CHK002** — Satisfied by `FR-040`, `FR-079`, `FR-080`, `FR-091`, and `SC-016`: one last unambiguous ownership state remains effective outside an unresolved conflict.
- **CHK006** — Satisfied by `FR-017`, `FR-061`, `FR-087`, `FR-089`, `FR-099`, and `SC-024`: action availability is defined for effective, pending, incomplete, conflicted, and terminal Gold/Silver states.
- **CHK010** — Satisfied by `FR-019`, `FR-020`, `FR-073`, and the Material Correction entity: immutable before/after facts, consequences, reference meaning, and user-visible history are required without fixing storage design.
- **CHK021** — Satisfied by the disposal-date edge case and `SC-024`: disposal dates cannot be future or precede acquisition and invalid review cannot confirm.
- **CHK023** — Satisfied by `FR-033`, `FR-036`, `FR-072`, and `SC-020`: Other requires an explicit Write-off or External transfer meaning and cannot silently create proceeds, ordinary income, or realized sale P/L.
- **CHK028** — Satisfied by `FR-037`, `FR-040`, the Deletion Evidence entity, and `SC-019`: Delete hides the full timeline from normal views while retaining non-effective audit/synchronization evidence.
- **CHK035** — Satisfied by `FR-043`, `FR-055`, `FR-082`, `FR-087`, and `SC-024`: Undo restores Active visibly before any separate corrected terminal action, with normal Active action and live rate-consequence rules.
- **CHK037** — Satisfied at requirements level by `FR-005`, `FR-040`, `FR-098`, and `SC-030`: full event time, causal order, and a stable immutable tie-breaker determine identical newest-first history.
- **CHK040** — Satisfied by `FR-080`, `FR-088`, `FR-089`, `FR-094`–`FR-097`, `SC-016`, and `SC-027`: terminal and material-correction conflict pairs, linked effects, restart, one CAS winner, exact-once compensation, incomplete-evidence lock, and retry are covered.

### Superseded wording

- **CHK001** — “reversed-to-Active” is superseded by **Active restored by a reversal event**. `FR-040`, `FR-043`, `FR-099`, the Reversal Event entity, and `SC-030` make Reversed an event/history fact, never a holding state.

### Deferred

- **CHK037 (tie-breaker representation only)** — Requirements are complete under `FR-098` and `SC-030`; implementation must provide the stable immutable event-identity tie-breaker.
