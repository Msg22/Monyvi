# Offline and Sync Requirements Quality Checklist: Metals Module Redesign

**Purpose**: Assess whether local-first completion, rate degradation, atomic groups, retry, conflict resolution, identity scope, and recovery requirements are precise enough for pre-design and pre-plan approval. **Created**: 2026-08-25 **Feature**: [spec.md](../spec.md)

**Note**: This checklist evaluates requirement quality, not implementation behavior.

## Local-First Completion and Restart Safety

- [ ] CHK001 Are local completion boundaries defined for Add, material correction, Sell, Dispose, Delete, Undo, automatic reconciliation, and linked account effects? [Completeness, Spec §FR-039, Spec §FR-062]
- [ ] CHK002 Is “confirmed” distinguished from pending, locally complete, remotely pending, synchronized, conflicted, and rejected states? [Gap, Spec §FR-062, Spec §FR-078]
- [ ] CHK003 Are restart requirements explicit for actions interrupted before confirmation, during local commitment, and after local completion but before synchronization? [Coverage, Spec §Edge Cases, Spec §SC-003]
- [ ] CHK004 Does the all-or-nothing requirement cover every local record and derived effect needed to prevent partial ownership, history, P/L, proceeds, or balance state? [Completeness, Spec §FR-039]
- [ ] CHK005 Are offline creation requirements consistent with preserving valid holding facts when all valuation references are unavailable? [Consistency, Spec §FR-015, Spec §FR-057, Spec §FR-062]
- [ ] CHK006 Is the user-visible distinction between locally complete and synchronized state specified without making cloud completion a prerequisite for use? [Gap, Spec §FR-062]

## Stale, Missing, and Corrupt Rate Inputs

- [ ] CHK007 Are validity requirements complete for zero, negative, non-finite, missing, corrupt, and unsupported metal or FX inputs? [Completeness, Spec §Edge Cases, Spec §FR-057]
- [ ] CHK008 Is freshness based exclusively on each provider observation timestamp and never local fetch, persistence, refresh, or synchronization time? [Clarity, Spec §FR-054]
- [ ] CHK009 Are missing, malformed, and unparseable provider timestamps consistently classified as Unknown rather than Fresh or Stale? [Consistency, Spec §FR-074]
- [ ] CHK010 Are separate metal-input and FX-input ages, sources, qualities, warnings, and acknowledgments required wherever either input affects a financial value? [Completeness, Spec §FR-055, Spec §FR-075]
- [ ] CHK011 Does the spec define which financial actions require stale or unknown-freshness acknowledgment when some displayed values remain unavailable? [Ambiguity, Spec §FR-055]
- [ ] CHK012 Are refresh-failure requirements complete for valid cache, invalid cache, no cache, repeated retry, offline retry, and a screen becoming stale while already open? [Coverage, Spec §FR-056, Spec §Edge Cases]
- [ ] CHK013 Are holdings, recorded facts, counts, filters, and history required to remain visible independently from current-value and P/L availability? [Completeness, Spec §FR-057, Spec §SC-005]
- [ ] CHK014 Is historical-reference absence clearly separated from current-rate absence so neither condition silently substitutes for the other? [Consistency, Spec §FR-058, Spec §FR-059]

## Atomic Groups and Idempotent Delivery

- [ ] CHK015 Are the membership boundaries of lifecycle, correction, reversal, and linked account-credit groups defined without committing the spec to a particular table design? [Gap, Spec §FR-079]
- [ ] CHK016 Is an incomplete remote group defined objectively enough to distinguish delayed members, failed members, malformed members, and permanently missing members? [Clarity, Spec §FR-079]
- [ ] CHK017 Does the spec define whether an incomplete group is hidden, shown as pending, or shown only in recovery history while remaining financially ineffective? [Gap, Spec §FR-079]
- [ ] CHK018 Are portfolio, history, P/L, account balance, net worth, dashboard allocation, and current/future snapshot effects all covered by remote-group ineffectiveness? [Completeness, Spec §FR-079]
- [ ] CHK019 Is safe recovery specified when a remote group remains incomplete across repeated synchronization attempts or device restart? [Gap, Spec §FR-078, Spec §FR-079]
- [ ] CHK020 Are idempotency requirements scoped across rapid repeated confirmation, app restart, local retry, sync retry, duplicated remote delivery, and replay from another device? [Coverage, Spec §FR-077]
- [ ] CHK021 Is “same user action” defined sufficiently to distinguish a retry from a deliberate later correction or new lifecycle action? [Ambiguity, Spec §FR-077]
- [ ] CHK022 Does idempotency cover at most one effective holding transition, lifecycle event, account effect, success message, and analytics outcome? [Completeness, Spec §FR-077, Spec §SC-015]

## Automatic Server CAS Conflict Resolution

- [ ] CHK023 Is the last complete server-accepted state defined as effective while a competing optimistic group is pending, incomplete, rejected, or being compensated? [Clarity, Spec §Clarifications, Spec §FR-080]
- [ ] CHK024 Are incompatible terminal chains distinguished from duplicate delivery, compatible history, and concurrent metadata edits? [Gap, Spec §FR-080]
- [ ] CHK025 Do stable `action_id` and expected financial revision enter one atomic server CAS so only the first complete valid server-accepted group becomes canonical? [Completeness, Spec §FR-080, Spec §FR-094]
- [ ] CHK026 Must every rejected optimistic holding and linked account effect be compensated exactly once without affecting financial reporting or normal History? [Completeness, Spec §FR-088]
- [ ] CHK027 Do incomplete or malformed groups remain durable, financially ineffective, restart-safe, and retryable until automatic reconciliation completes? [Completeness, Spec §FR-079, Spec §FR-095]
- [ ] CHK028 Is rejected loser evidence retained only as internal non-effective audit/synchronization evidence rather than a user-selectable or normal-History version? [Clarity, Spec §FR-088, Spec §FR-096]
- [ ] CHK029 Does a missing, unsafe, unavailable, foreign-owned, or revision-mismatched linked account effect prevent grouped activation and keep the last complete state effective? [Gap, Spec §FR-045, Spec §FR-080, Spec §FR-094]
- [ ] CHK030 Are financial actions locked while reconciliation is incomplete so no third ambiguous ownership chain can start? [Gap, Spec §FR-089]
- [ ] CHK031 Do concurrent material corrections use the same automatic whole-fact-set CAS without field merge or user selection? [Gap, Spec §FR-088, Spec §FR-089]

## Identity Scope and Sync Failure Safety

- [ ] CHK032 Are local reads, local writes, calculations, account choices, reconciliation groups, push, and pull all explicitly limited to the current authenticated user's data? [Completeness, Spec §FR-063]
- [ ] CHK033 Is the handling of logout, account switch, session expiry, and identity change during pending confirmation or synchronization specified consistently? [Coverage, Spec §FR-064, Spec §Edge Cases]
- [ ] CHK034 Does the spec require an in-flight stale action to write for neither old nor new identity while preserving safe recovery for already completed local work? [Clarity, Spec §FR-064]
- [ ] CHK035 Are parent holding ownership, lifecycle-event ownership, selected-account ownership, and linked-effect ownership required to agree before any financial group becomes effective? [Gap, Spec §FR-063, Spec §FR-080]
- [ ] CHK036 Are sync pull and push failure outcomes defined so errors cannot appear as successful empty changes, successful completion, or silently resolved conflicts? [Gap, Spec §FR-062, Spec §FR-078]
- [ ] CHK037 Are observable pending, failed, conflicted, retrying, and recovered states specified with plain-language recovery and without exposing implementation details? [Completeness, Spec §FR-061, Spec §FR-078]

## Acceptance Criteria Quality

- [ ] CHK038 Can SC-003 objectively distinguish local atomic completion from later remote synchronization and conflict resolution? [Measurability, Spec §SC-003]
- [ ] CHK039 Does SC-016 define measurable fixtures for incomplete groups, duplicate delivery, Sell-versus-Sell, Sell-versus-Dispose, linked credits, restart, one CAS winner, and exact-once loser compensation? [Gap, Spec §SC-016]
- [ ] CHK040 Are measurable outcomes present for foreign-user isolation, failed sync observability, retry recovery, and no accidental advancement from pending or conflicted state? [Gap, Spec §FR-063, Spec §SC-015, Spec §SC-016]
- [ ] CHK041 Does #242 define one generic owner-scoped financial-action root/effect protocol, an exhaustive account-writer guard, protected balance/revision sync columns, dedicated action sync, idempotent CAS, and exact-once compensation without creating a Metals-only account outbox? [Completeness, Spec §FR-030, Spec §FR-094]
- [ ] CHK042 Is mixed-version cutover fail-closed, with revision-0 backfill, legacy unsynced-row drain/migration/quarantine, rejection of legacy protected-field writes, and deterministic non-production test/developer fixtures? [Coverage, Spec §Clarifications 2026-08-30]

## Notes

- Check items off as completed: `[x]`
- Add comments or findings inline
- Link findings to the cited requirement, gap, ambiguity, conflict, or assumption
- Items are numbered sequentially for traceability

## Reconciliation — 2026-08-25

**Authority**: This ledger is the current resolution status; the unchecked questions above remain unchanged as historical requirements tests.

### Satisfied

- **CHK002, CHK006** — Satisfied by `FR-062`, `FR-090`, `FR-097`, `SC-003`, `SC-022`, and `SC-030`: pending local, local-complete, synchronization-pending, synchronized, failed, incomplete, and conflicted meanings are distinct without making remote completion a use gate.
- **CHK011** — Satisfied by `FR-055`, `FR-057`, `FR-074`, `FR-075`, and `SC-006`: only affected financial confirmations acknowledge each stale or unknown-freshness input; missing values remain unavailable.
- **CHK015, CHK017, CHK019** — Satisfied by `FR-079`, `FR-094`, `FR-095`, `FR-097`, `SC-027`, and the screen/state matrix in `FR-099`: group membership, financial ineffectiveness, durable recovery visibility, retry, and restart behavior are explicit.
- **CHK024–CHK030** — Satisfied by `FR-079`, `FR-080`, `FR-088`, `FR-089`, `FR-094`–`FR-097`, `SC-016`, and `SC-027`: incompatible chains use one automatic server CAS winner; rejected optimistic holding/account effects compensate exactly once; incomplete evidence remains ineffective, locked, durable, and retryable; no user choice appears.
- **CHK031** — Satisfied at requirements level by `FR-088`, `FR-089`, and `SC-016`: concurrent material fact sets use automatic whole-set CAS without field merge or user selection; name and notes stay under ordinary metadata conflict handling.
- **CHK035** — Satisfied by `FR-063`, `FR-094`, `FR-096`, and `SC-027`: every required member must share authenticated ownership and valid linkage before the group can become effective.
- **CHK036** — Satisfied by `FR-090` and `SC-022`: pull or push failure stays visible, advances no marker, and cannot masquerade as empty success or synchronization.
- **CHK039, CHK040** — Satisfied by `SC-016`, `SC-022`, `SC-027`, and `SC-030`: CAS winner, exact-once compensation, incomplete-group lock/retry, identity, failure, and restart outcomes are measurable.
- **CHK041, CHK042** — Satisfied at contract level by `FR-030`, `FR-094`, `data-model.md`, and the RPC/metadata/test-harness contracts; implementation still must prove the writer inventory, protected-column enforcement, and cutover fixtures.

### Deferred

- **CHK021 (technical action identity only)** — Requirements are complete; implementation must define the stable action identity and retry/new-action representation under `FR-077`.
- **CHK031 (ordinary metadata conflict representation only)** — Requirements are complete; implementation must define the metadata conflict representation under `FR-088`.
- **CHK017, CHK019, CHK037 (interaction composition only)** — Canonical visuals and the approved handoff close the design gate; implementation and responsive/accessibility proof remain future work under `FR-095`–`FR-099`, `SC-027`, and `SC-030`.
