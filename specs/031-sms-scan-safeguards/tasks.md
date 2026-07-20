# Tasks: Launch SMS Scan Safeguards

**Input**: Design documents from `specs/031-sms-scan-safeguards/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/`, `quickstart.md`

**Tests**: TDD is mandatory. For each behavior, write the listed tests and
confirm they fail for the intended missing behavior before editing production
code.

**Organization**: Tasks are grouped by user story. Shared policy, persistence,
and server-admission primitives are foundational because every SMS path depends
on the same invariants.

## Phase 1: Setup And Approval Gates

**Purpose**: Align product documentation, preserve the UI approval gate, and
prepare feature-owned entry points without changing runtime behavior.

- [x] T001 Update issue #769 with the final clarification decisions, issue #770
      boundary, approved contracts, and implementation phases from
      `specs/031-sms-scan-safeguards/`
- [x] T002 Document the 30-day policy, incremental/history distinction,
      checkpoint invariant, AI limits, cooldown, three-strike lifecycle,
      oversized behavior, and voice isolation in
      `docs/business/business-decisions.md` (FR-001-FR-038, FR-051-FR-060)
- [x] T003 [P] Add feature-owned export placeholders for pure safeguards under
      `packages/logic/src/sms-safeguards/index.ts` and
      `packages/logic/src/index.ts` without changing current parser behavior
- [x] T004 [P] Add test-suite and deterministic safeguard QA script placeholders
      to `package.json` and `apps/mobile/package.json` without routing to a real
      inbox or provider (FR-039-FR-048)
- [x] T005 Generate focused light/dark mockups for 30-day scope,
      incremental/history actions, cooldown availability, and partial-limit
      guidance in
      `specs/031-sms-scan-safeguards/mockups/sms-scan-settings-safeguards-light-dark.png`
      and
      `specs/031-sms-scan-safeguards/mockups/sms-scan-scope-partial-results-light-dark.png`
      (FR-025, FR-025A, FR-036)
- [x] T006 Obtain Mohamed's explicit approval for the focused mockup and record
      the approved image/copy in
      `specs/031-sms-scan-safeguards/contracts/safeguard-ux-contract.md` before
      any visible UI implementation

---

## Phase 2: Foundational Safeguard Domain And Persistence

**Purpose**: Establish policy, identity, persistence, privacy, and server
atomicity before changing any user journey.

**CRITICAL**: No user-story runtime integration may begin until this phase is
green.

### Foundational Tests

- [x] T007 [P] Write failing policy-schema, production-default,
      malformed-policy, emergency-disable, and mobile/Edge parity tests in
      `packages/logic/src/sms-safeguards/__tests__/sms-scan-policy.test.ts` and
      `supabase/functions/_shared/sms-safeguard-policy.test.ts` (FR-005, FR-006,
      FR-015-FR-018)
- [x] T008 [P] Write failing UTF-8 payload and conservative input-estimate
      tests, including one-candidate oversize boundaries, in
      `packages/logic/src/sms-safeguards/__tests__/sms-input-estimator.test.ts`
      and `supabase/functions/_shared/sms-input-estimator.test.ts` (FR-015,
      FR-049, FR-057)
- [x] T009 [P] Write failing newest-first stable-order and capacity-selection
      tests in
      `packages/logic/src/sms-safeguards/__tests__/sms-ai-work-selector.test.ts`
      (FR-015, FR-024, SC-019)
- [x] T010 [P] Write failing complete/omitted/explicit-negative/malformed/
      incomplete/duplicate/unknown identity reconciliation tests in
      `packages/logic/src/sms-safeguards/__tests__/sms-provider-response-reconciler.test.ts`
      (FR-051-FR-054, SC-020-SC-021)
- [x] T011 [P] Write failing privacy/static tests that reject raw SMS, sender,
      amount, merchant, category, account/card, and provider response fields in
      outcome/usage schemas and logs in
      `apps/mobile/__tests__/services/sms-safeguard-privacy.test.ts` and
      `supabase/functions/_shared/sms-safeguard-privacy.test.ts` (FR-031,
      FR-032, FR-052, SC-007)
- [x] T012 [P] Write failing SQL migration tests for table constraints,
      pull-only negative-outcome RLS, service-role-only RPC grants, server-only
      ledgers, reservation lease expiry, atomic request identity, and
      three-strike cap in
      `apps/mobile/__tests__/migrations/sms-ai-safeguards-migration.test.ts`
      (FR-019-FR-022, FR-052, FR-055)
- [x] T013 [P] Write failing Watermelon schema/model/pull-only sync
      registration, push exclusion, migration-generator exclusion, and
      user-scope tests in
      `apps/mobile/__tests__/migrations/sms-ai-negative-outcome-model.test.ts`
      and
      `apps/mobile/__tests__/services/sms-processing-outcome-service.test.ts`
      (FR-008-FR-010, FR-052, FR-059)
- [x] T014 [P] Write failing installation-local validation, user separation,
      processing-policy version invalidation, monotonic checkpoint,
      future-record rejection, bounded oversized cleanup, and
      logout/account-switch tests in
      `apps/mobile/__tests__/services/sms-scan-checkpoint-service.test.ts` and
      `apps/mobile/__tests__/services/sms-oversized-outcome-service.test.ts`
      (FR-007-FR-010, FR-057, FR-059, SC-022)

### Foundational Implementation

- [x] T015 Implement readonly Zod-backed policy, deterministic refusal order,
      scan-kind definitions, and production defaults in
      `packages/logic/src/sms-safeguards/sms-scan-policy.ts` and mirror the
      validated server contract in
      `supabase/functions/_shared/sms-safeguard-policy.ts` (FR-005, FR-006,
      FR-015-FR-018)
- [x] T016 Implement shared UTF-8 byte counting, conservative input estimation,
      and individual-candidate fit decisions in
      `packages/logic/src/sms-safeguards/sms-input-estimator.ts` and the Edge
      adapter in `supabase/functions/_shared/sms-input-estimator.ts` (FR-015,
      FR-018, FR-049, FR-057)
- [x] T017 Implement immutable newest-first/fingerprint-tie-breaker admission in
      `packages/logic/src/sms-safeguards/sms-ai-work-selector.ts` (FR-015,
      FR-024)
- [x] T018 Implement provider completion envelope parsing and identity-safe
      positive/negative reconciliation in
      `packages/logic/src/sms-safeguards/sms-provider-response-reconciler.ts`
      and `supabase/functions/_shared/sms-provider-completion.ts`
      (FR-051-FR-054)
- [x] T019 Create `supabase/migrations/061_sms_ai_safeguards.sql` with the
      server-authored pull-only `sms_ai_negative_outcomes` table, server-only
      work/usage ledgers, indexes, check constraints, RLS, service-role-only
      atomic admission/start/release/negative RPCs, five-minute reservation
      leases, non-terminal expiry, and cleanup support (FR-018-FR-022, FR-052,
      FR-055, FR-058-FR-060)
- [x] T020 Add `sms_ai_work_requests` and `sms_ai_usage_events` to the
      deliberate server-only exclusions in
      `scripts/sql-to-watermelon-migration.js` and its tests, run
      `npm run db:migrate` plus `npm run db:watermelon-migrate -- --latest`,
      regenerate `packages/db/src/schema.ts`, `packages/db/src/migrations.ts`,
      and `packages/db/src/supabase-types.ts`, and verify migration 61 is still
      the next sequential local migration
- [x] T021 Add `SmsAiNegativeOutcome` Watermelon model/base model, database
      registration, package exports, and generated field mapping in
      `packages/db/src/models/SmsAiNegativeOutcome.ts`,
      `packages/db/src/models/base/base-sms-ai-negative-outcome.ts`,
      `packages/db/src/database.ts`, and `packages/db/src/index.ts`
- [x] T022 Add `sms_ai_negative_outcomes` to a scoped server-owned user-table
      pull strategy and explicit push exclusion in
      `apps/mobile/services/sync/config.ts`,
      `apps/mobile/services/sync/types.ts`,
      `apps/mobile/services/sync/table-predicates.ts`, and affected sync tests;
      keep both server-only ledgers outside the Watermelon schema entirely
- [x] T023 Implement scoped local reads, pull refresh, non-terminal expiry,
      valid AI-success clearing, and terminal lookup in
      `apps/mobile/services/sms-processing-outcome-service.ts`; forbid every
      local create/update/delete/strike mutation and retain terminal records
      during trusted-local recovery (FR-052, FR-053, FR-055, FR-056)
- [x] T024 Implement user/installation/processing-policy-version checkpoint
      validation and bounded oversized-outcome stores in
      `apps/mobile/services/sms-scan-checkpoint-service.ts` and
      `apps/mobile/services/sms-oversized-outcome-service.ts` (FR-007-FR-010,
      FR-057, FR-059)
- [x] T025 Implement the Edge safeguard contract, five-minute reservation lease,
      lost-response replay decision, and service-role atomic admission adapter
      in `supabase/functions/_shared/sms-ai-safeguard-contract.ts` and
      `supabase/functions/_shared/sms-ai-safeguard-service.ts` (FR-018-FR-022,
      FR-055, FR-058-FR-060)
- [x] T026 Run all Phase 2 tests and prove they failed before implementation and
      now pass; run `git diff --check` and the migration/schema consistency
      checks before user-story work

**Checkpoint**: Policy interpretation, durable identities, persistence, and
server atomicity are ready and privacy-safe.

---

## Phase 3: User Story 1 - Scan Only Recent Messages At Launch (Priority: P1)

**Goal**: Apply the inclusive rolling 30-day boundary before all candidate
processing and expose separate incremental/history scan intents.

**Independent Test**: Scan fixtures immediately before, exactly at, and after
the cutoff and verify only in-window messages reach candidate detection.

### Tests For User Story 1

- [x] T027 [P] [US1] Write failing cutoff, fixed scan-clock, timezone, exact
      boundary, and progress-count tests in
      `apps/mobile/__tests__/services/sms-sync-service.test.ts` (FR-001, FR-002,
      SC-001)
- [x] T028 [P] [US1] Write failing reader-filter contract tests proving the
      minimum date reaches the fixture and Android inbox adapters in
      `apps/mobile/__tests__/services/sms-reader-service.test.ts` (FR-001,
      FR-002)
- [x] T029 [P] [US1] Write failing settings/route tests for separate Sync new
      SMS and Rescan recent messages intents without custom range/paywall UI in
      `apps/mobile/__tests__/components/settings/SettingsSections.test.ts` and
      `apps/mobile/__tests__/app/settings-live-sms-permission.test.tsx` (FR-003,
      FR-025A, FR-026)

### Implementation For User Story 1

- [x] T030 [US1] Add scan kind, fixed start time, and effective boundary
      calculation to `apps/mobile/services/sms-scan-policy-service.ts` using the
      shared policy (FR-001, FR-005-FR-007)
- [x] T031 [US1] Replace `THREE_MONTHS_MS` and apply the inclusive 30-day reader
      boundary before progress/candidate work in
      `apps/mobile/services/sms-sync-service.ts` (FR-001, FR-002)
- [x] T032 [US1] Thread explicit initial/incremental/history intent through
      `apps/mobile/hooks/useSmsScan.ts`,
      `apps/mobile/context/SmsScanContext.tsx`,
      `apps/mobile/app/(private)/settings.tsx`, and
      `apps/mobile/app/(private)/sms-scan.tsx` without altering consent or
      permission gates (FR-003, FR-026)
- [x] T033 [US1] Run US1 tests plus existing SMS permission/consent and scan
      regression tests; verify no message older than cutoff appears in
      considered progress counts

**Checkpoint**: Initial/history scans are bounded to 30 days; no visible UI
styling is implemented until T006 is approved.

---

## Phase 4: User Story 2 - Reduce Repeat Inbox Work After Durable Processing (Priority: P1)

**Goal**: Use a conservative local checkpoint to reduce inbox reads while
fingerprints and durable outcomes remain authoritative.

**Independent Test**: Complete a scan, add new/overlap fixtures, and verify only
the bounded overlap/new range is read with zero duplicate or skipped unknown
fingerprints.

### Tests For User Story 2

- [x] T034 [P] [US2] Write failing effective-boundary and five-minute overlap
      tests in
      `packages/logic/src/sms-safeguards/__tests__/sms-scan-boundary.test.ts`
      (FR-007-FR-010)
- [x] T035 [P] [US2] Write failing durable-known-state and contiguous checkpoint
      tests for saved, local excluded/matched, AI-negative, oversized,
      unresolved, cancelled, failed, and memory-only results in
      `apps/mobile/__tests__/services/sms-scan-checkpoint-coordinator.test.ts`
      (FR-008-FR-010, SC-002)
- [x] T036 [P] [US2] Write failing first/second/third strike, ordinary/history
      retry, concurrent-device, terminal sync, and trusted-local recovery tests
      in `apps/mobile/__tests__/services/sms-processing-outcome-service.test.ts`
      and `supabase/functions/_shared/sms-negative-outcome-handler.test.ts`
      (FR-051-FR-056)
- [x] T037 [P] [US2] Write failing user switch, reinstall/new-install fallback,
      stale local pull, and terminal server precheck integration tests in
      `apps/mobile/__tests__/services/sms-sync-safeguards.integration.test.ts`
      (FR-055, FR-059)

### Implementation For User Story 2

- [x] T038 [US2] Implement pure effective-boundary and contiguous durable-prefix
      calculation in `packages/logic/src/sms-safeguards/sms-scan-boundary.ts`
      (FR-007-FR-010)
- [x] T039 [US2] Add a scan checkpoint coordinator that combines scoped saved
      fingerprints, trusted local outcomes, synchronized negatives, local
      oversized outcomes, and future issue #770 adapter points in
      `apps/mobile/services/sms-scan-checkpoint-coordinator.ts` (FR-008-FR-010,
      FR-037)
- [x] T040 [US2] Apply checkpoint overlap, authoritative fingerprint/outcome
      checks, and monotonic finalization to
      `apps/mobile/services/sms-sync-service.ts`; never advance over memory-only
      suggestions or incomplete work (FR-007-FR-010, FR-023, FR-024)
- [x] T041 [US2] Reconcile only complete valid provider negatives and persist
      them through `apps/mobile/services/ai-sms-parser-service.ts`,
      `apps/mobile/services/sms-parser-orchestrator.ts`, and the outcome service
      (FR-051-FR-055)
- [x] T042 [US2] Enforce terminal fingerprints in the Edge full-parser admission
      path before Gemini while preserving exact trusted local recovery in
      `supabase/functions/parse-sms/index.ts` and
      `apps/mobile/services/sms-parser-orchestrator.ts` (FR-055, FR-056)
- [x] T043 [US2] Run US2 tests plus transaction/transfer fingerprint dedup,
      sync, batch save, foreground/background/killed-app live SMS regression
      suites

**Checkpoint**: Incremental scans reduce inbox work without replacing
fingerprint correctness; terminal negative suppression is cross-device safe.

---

## Phase 5: User Story 4 - Enforce Cost Boundaries Independently Of The App (Priority: P1)

**Goal**: Prevent unauthenticated, oversized, excessive, concurrent, bursty, or
replayed work from creating uncontrolled Gemini cost.

**Independent Test**: Call Edge handlers directly around every boundary and
prove refused requests never start the provider and accepted replays never count
twice.

### Tests For User Story 4

- [x] T044 [P] [US4] Write failing full-parser handler tests for auth, consent,
      service-role-only ledger access, 50-count, 128-KiB, 32k-estimate,
      per-session 200, rolling 200, burst 30, malformed policy, modified session
      IDs, and provider-not-called assertions in
      `supabase/functions/_shared/parse-sms-handler.test.ts` (FR-015,
      FR-018-FR-022, SC-004, SC-009)
- [x] T045 [P] [US4] Write failing enrichment handler tests for 20 unique
      merchants, within-scan dedupe, rolling 100, burst 30, replay, and
      provider-not-called assertions in
      `supabase/functions/_shared/sms-category-enrichment-handler.test.ts`
      (FR-016, FR-018-FR-022)
- [x] T046 [P] [US4] Write failing SQL/RPC concurrency tests proving combined
      reservations cannot exceed per-session or rolling capacity, provider-start
      events are unique, stale five-minute reservations can be reclaimed, and a
      replay after provider start returns `already_processed_result_unavailable`
      without another provider start in
      `scripts/__tests__/sms-ai-safeguard-rpc.test.ts` (FR-019-FR-021, FR-058,
      FR-060, SC-005)
- [x] T047 [P] [US4] Write failing cooldown tests for local-only history,
      pre-admission cancellation, first provider start, post-start failure,
      incremental availability, and idempotent replay in
      `supabase/functions/_shared/sms-history-cooldown.test.ts` (FR-017, FR-020,
      FR-060)
- [x] T048 [P] [US4] Write failing availability-time tests for rolling expiry
      and later combined blocker in
      `packages/logic/src/sms-safeguards/__tests__/sms-ai-availability.test.ts`
      (FR-025, FR-027A, FR-058)

### Implementation For User Story 4

- [x] T049 [US4] Extract a testable full-parser handler and validate request
      identity, JWT-derived user ownership, auth, consent, policy, candidate
      shape/count, bytes, estimate, and terminal outcomes before service-role
      admission in `supabase/functions/_shared/parse-sms-handler.ts` and
      `supabase/functions/parse-sms/index.ts` (FR-015, FR-018, FR-022, FR-055)
- [x] T050 [US4] Integrate atomic reserve/provider-start/complete/release calls,
      the five-minute reservation lease, lost-response replay as
      `already_processed_result_unavailable`, and explicit provider completion
      state into the full-parser handler; remove the ambiguous “retry exhaustion
      equals empty success” behavior. Internal provider retries count as one
      admitted user unit and one burst event, while aggregate provider-attempt
      telemetry remains separate (FR-019-FR-022, FR-051-FR-054, FR-058-FR-060)
- [x] T051 [US4] Integrate the same safeguard service into
      `supabase/functions/_shared/sms-category-enrichment-handler.ts` and
      `supabase/functions/enrich-sms-categories/index.ts` with its independent
      capability allowance (FR-016, FR-018-FR-022)
- [x] T052 [US4] Add stable request/session identities and typed refusal/
      availability handling to `apps/mobile/services/ai-sms-parser-service.ts`
      and `apps/mobile/services/ai-sms-category-enrichment-service.ts` (FR-020,
      FR-025, FR-027A, FR-059)
- [x] T053 [US4] Implement server-time availability calculation and history
      cooldown start at first full-parser provider execution in the migration
      RPCs and Edge safeguard adapter (FR-017, FR-025, FR-058, FR-060)
- [x] T054 [US4] Add privacy-safe aggregate operational counters separated by
      full SMS parsing and enrichment in Edge handlers and existing logger
      adapters; verify no fingerprints or payload values reach logs
      (FR-029-FR-032, SC-008)
- [x] T055 [US4] Run US4 handler/RPC/concurrency tests and local Edge smoke
      tests, proving every refusal path reports zero provider starts

**Checkpoint**: Modified clients and concurrent requests cannot bypass hard cost
boundaries.

---

## Phase 6: User Story 3 - Preserve Results When AI Capacity Is Reached (Priority: P1)

**Goal**: Keep successful local/AI suggestions reviewable while deferred work is
clearly communicated and checkpoint-safe.

**Independent Test**: Exhaust a reduced simulated allowance mid-scan and verify
accepted suggestions remain, Save stays enabled, and deferred candidates create
no fabricated transaction or unsafe checkpoint.

### Tests For User Story 3

- [x] T056 [P] [US3] Write failing mixed-result orchestration tests for local
      success, AI success, quota/cooldown refusal, enrichment refusal, and
      newest-first deferred work in
      `apps/mobile/__tests__/services/sms-parser-orchestrator.test.ts` and
      `apps/mobile/__tests__/services/sms-sync-service.test.ts` (FR-023, FR-024,
      FR-027, FR-027A, SC-003)
- [x] T057 [P] [US3] Write failing scan-context/review route tests proving
      successes survive active navigation, Save stays enabled, and issue #769
      creates no persistent raw retry queue in
      `apps/mobile/__tests__/context/SmsScanContext.test.tsx` and
      `apps/mobile/__tests__/app/sms-review.test.tsx` (FR-023, FR-024, FR-037)
- [x] T058 [P] [US3] After T006 approval, write failing component and i18n
      lookup tests for aggregate limit/oversized copy and localized absolute
      availability in
      `apps/mobile/__tests__/components/transaction-review/PartialSmsResultsNotice.test.tsx`
      and the affected locale test suites (FR-025, FR-036)

### Implementation For User Story 3

- [x] T059 [US3] Extend orchestrator/scan results with typed admitted, deferred,
      oversized, availability, and completion summaries while preserving
      accepted local/AI transactions in
      `apps/mobile/services/sms-parser-orchestrator.ts` and
      `apps/mobile/services/sms-sync-service.ts` (FR-023-FR-025)
- [x] T060 [US3] Carry the bounded active-session summary through
      `apps/mobile/context/SmsScanContext.tsx` and
      `apps/mobile/app/(private)/sms-review.tsx` without adding raw persistence
      or replacing issue #770 (FR-023, FR-024, FR-037)
- [x] T061 [US3] After T006 approval, implement the approved inline partial
      notice and friendly availability/oversized guidance in
      `apps/mobile/components/transaction-review/PartialSmsResultsNotice.tsx`,
      `apps/mobile/locales/en/transactions.json`, and
      `apps/mobile/locales/ar/transactions.json` (FR-025, FR-036)
- [x] T062 [US3] Run US3 service/context/component tests and existing review
      selection/save/retry regression tests

**Checkpoint**: Limits fail closed for new AI work but do not erase useful work
or block saving it.

---

## Phase 7: User Story 5 - Keep Voice And Local SMS Value Available (Priority: P2)

**Goal**: Keep local SMS parsing usable during SMS quota failures and prove that
voice behavior/accounting is unchanged.

**Independent Test**: Exhaust both SMS capabilities and verify exact trusted
local SMS still reaches review while voice parsing follows its existing path.

### Tests For User Story 5

- [x] T063 [P] [US5] Write failing local-first tests proving hard exclusions and
      exact trusted templates execute before terminal/quota checks and never use
      full-parser allowance in
      `apps/mobile/__tests__/services/sms-parser-orchestrator.test.ts`
      (FR-011-FR-014, FR-027A, FR-056, SC-006)
- [x] T064 [P] [US5] Write failing category-enrichment exhaustion/failure tests
      preserving local suggestions and direction-correct fallback without full
      AI fallback in
      `apps/mobile/__tests__/services/ai-sms-category-enrichment-service.test.ts`
      (FR-016, FR-027)
- [x] T065 [P] [US5] Write failing voice-isolation tests proving SMS policy,
      ledgers, emergency switches, and QA profiles do not alter
      `apps/mobile/__tests__/services/ai-voice-parser-service.test.ts` and
      `supabase/functions/_shared/ai-capability-isolation.test.ts` (FR-028,
      FR-030)

### Implementation For User Story 5

- [x] T066 [US5] Preserve local exclusion and exact trusted parsing ahead of
      paid-work refusal and terminal AI suppression in
      `apps/mobile/services/sms-parser-orchestrator.ts` and
      `apps/mobile/services/sms-live-processor.ts` (FR-011-FR-014, FR-027A,
      FR-056)
- [x] T067 [US5] Keep enrichment refusal non-blocking and forbid rerouting a
      trusted local result to full parsing in
      `apps/mobile/services/sms-parser-orchestrator.ts` (FR-027)
- [x] T068 [US5] Verify no voice files, routes, request contracts, or usage
      counters changed except isolated regression tests; run the voice parser
      and AI-consent suites (FR-028, SC-011)

**Checkpoint**: SMS safeguards protect cost without reducing local or voice
value.

---

## Phase 8: User Story 6 - Deterministic Safeguard QA (Priority: P1)

**Goal**: Reproduce every safeguard path on emulator/physical device with fixed
fixtures and zero production Gemini or production allowance usage.

**Independent Test**: Run all named scenarios twice with reset and compare
identical outcomes/diagnostics while production call and charge counters remain
zero.

### Tests For User Story 6

- [x] T069 [P] [US6] Write failing scenario schema, versioning,
      required-profile, fixed-clock, namespace isolation, and reset tests in
      `packages/logic/src/sms-safeguards/__tests__/safeguard-qa-scenarios.test.ts`
      (FR-039-FR-047)
- [x] T070 [P] [US6] Write failing simulated provider tests for trusted,
      low-confidence, explicit-negative, omission, retryable/permanent failure,
      malformed/incomplete, invalid identity, and delay outcomes in
      `apps/mobile/__tests__/services/sms-safeguard-provider-simulator.test.ts`
      (FR-040, US6-3)
- [x] T071 [P] [US6] Write failing scenario integration tests for cutoff,
      checkpoint, newest-first partial quota, rolling expiry, shared batch/live,
      burst, cooldown, oversized, three strikes, fresh installation, trusted
      recovery, and account switch in
      `apps/mobile/__tests__/services/sms-safeguard-qa.integration.test.ts`
      (FR-041-FR-048)
- [x] T072 [P] [US6] Write failing production-isolation/static tests proving QA
      modules and flags cannot activate in release mode and cannot fall back to
      real provider/inbox in
      `apps/mobile/__tests__/config/sms-safeguard-qa-config.test.ts` (FR-044,
      FR-045)
- [x] T073 [P] [US6] Write failing local token-report decomposition,
      selected-model count-token calibration, opt-in protection, and
      corpus-parity tests in
      `scripts/__tests__/evaluate-sms-parser-prompt.test.ts` (FR-049, FR-050,
      SC-017, SC-018)

### Implementation For User Story 6

- [x] T074 [US6] Implement named/versioned scenario definitions and policy
      overrides in `packages/logic/src/sms-safeguards/safeguard-qa-scenarios.ts`
      (FR-041-FR-043)
- [x] T075 [US6] Implement development-only isolated fixture inbox, provider,
      local/remote outcome, allowance, cooldown, request-identity, checkpoint,
      and reset adapters in
      `apps/mobile/services/testing/sms-safeguard-provider-simulator.ts` and
      `apps/mobile/services/testing/sms-safeguard-qa-runner.ts` (FR-039-FR-048)
- [x] T076 [US6] Wire an explicit safeguard QA runtime mode and descriptive root
      commands through `apps/mobile/config/sms-safeguard-qa-config.ts`,
      `apps/mobile/scripts/sms-safeguard-qa.js`, `apps/mobile/package.json`, and
      `package.json`; fail rather than fall back to real provider/inbox (FR-044,
      FR-045)
- [x] T077 [US6] Add privacy-safe scenario diagnostics with profile/version,
      effective limits, aggregate outcomes, and explicit zero production call/
      charge counters in `apps/mobile/utils/logger.ts` adapters and the QA
      service (FR-047)
- [x] T078 [US6] Implement `scripts/evaluate-sms-parser-prompt.ts` to report
      fixed prompt, categories, schema, and candidate estimates separately,
      compare the approved corpus before any optimization is accepted, and
      expose a separately named explicit opt-in command that calibrates the
      estimator through the selected Gemini model's count-tokens endpoint
      without generating content (FR-049, FR-050)
- [x] T079 [US6] Add focused deterministic Maestro journeys for the user-visible
      cutoff, cooldown, and partial-limit paths under
      `apps/mobile/e2e/maestro/sms-safeguards/`, documenting concurrency and
      cross-install cases as service-level automation where Maestro cannot
      honestly control them
- [ ] T080 [US6] Run every profile twice with reset on emulator and the
      supported physical-device command; record identical aggregate results and
      zero production calls/charges (SC-013-SC-016, SC-023-SC-029)

**Checkpoint**: Every story is reproducible without a personal inbox or paid AI
call.

---

## Phase 9: Approved Focused UX Integration

**Purpose**: Implement the approved presentation after all behavior exists and
is testable through shaped state.

- [x] T081 [P] After T006, implement approved 30-day scope presentation in
      `apps/mobile/components/sms-sync/SmsScanScopeNotice.tsx` and
      `apps/mobile/app/(private)/sms-scan.tsx` using existing theme tokens and
      no custom range/paywall copy (FR-003, FR-025, FR-036)
- [x] T082 [P] After T006, implement approved Sync new SMS / Rescan recent
      messages settings layout and disabled cooldown state in
      `apps/mobile/components/settings/SettingsSections.tsx` and
      `apps/mobile/app/(private)/settings.tsx` (FR-025A, FR-026, FR-036)
- [x] T083 [P] Add English/Arabic translations and localized absolute-time
      formatting tests in `apps/mobile/locales/en/settings.json`,
      `apps/mobile/locales/ar/settings.json`,
      `apps/mobile/locales/en/transactions.json`, and
      `apps/mobile/locales/ar/transactions.json` (FR-025, FR-036)
- [ ] T084 Verify approved structure and plain-language comprehension in
      light/dark themes, English/Arabic, font scale, Android status/navigation
      safe areas, disabled accessibility state, and sticky review header/footer
      with no overlap; capture comparison images beside the PR QA evidence
      (SC-010)

---

## Phase 10: Polish And Release Readiness

**Purpose**: Close cross-cutting regression, privacy, cost, and documentation
gates.

- [x] T085 [P] Update developer/local Supabase and safeguard QA documentation in
      `README.md` and `specs/031-sms-scan-safeguards/quickstart.md`
- [ ] T086 [P] Document and verify Gemini project spending caps, billing alerts,
      emergency full-parser disablement, and incident owner/runbook without
      committing secrets (FR-033, FR-034, SC-012)
- [x] T087 Run targeted Jest suites, TypeScript checks, ESLint with repository
      rules, Prettier, privacy checks, SQL/schema tests, and package boundary
      checks; fix implementation rather than weakening valid tests
- [x] T088 Run affected existing SMS scan, live
      foreground/background/killed-app, consent, account matching, category
      enrichment, review selection/save, sync, logout, and voice regression
      suites
- [ ] T089 Execute the manual QA plan in
      `specs/031-sms-scan-safeguards/quickstart.md` on emulator and physical
      Android device and record pass/fail evidence for every point
- [x] T090 Add the PR coverage matrix mapping every manual scenario to unit,
      integration, Maestro, or explicit manual-only validation; call out any
      honest harness limitation
- [x] T091 Re-run `speckit-analyze`, resolve every high/medium/low finding, and
      confirm the spec, plan, contracts, tasks, issue, business decisions, and
      implemented behavior are aligned before review handoff

---

## Dependencies And Execution Order

### Phase Dependencies

- **Phase 1** starts immediately; T006 blocks all visible UI tasks.
- **Phase 2** depends on policy/data decisions and blocks runtime integration.
- **US1** and **US2** depend on Phase 2 and establish client scan correctness.
- **US4** depends on Phase 2 and establishes server cost correctness; it may run
  in parallel with US1/US2 in separate files after foundational contracts are
  stable.
- **US3** depends on US1/US2/US4 typed outcomes.
- **US5** depends on server/mobile integration and verifies preserved value.
- **US6** depends on production evaluators and adapters being stable.
- **Phase 9 UI** depends on T006 and the shaped runtime state from US1/US3/US4.
- **Phase 10** depends on every selected story and approved UX being complete.

### Parallel Opportunities

- Pure policy/reconciliation tests, SQL migration tests, local persistence
  tests, and privacy tests are separate Phase 2 workstreams.
- After Phase 2, mobile cutoff/checkpoint work and Edge admission work may
  proceed in parallel because their contract boundary is fixed.
- Light/dark/i18n component tests may proceed in parallel after mockup approval.
- QA scenario definitions, token reporting, and production-isolation tests use
  distinct files after the production policy evaluator exists.

### TDD Rule Within Every Phase

1. Add the smallest failing test for one requirement.
2. Run it and confirm the failure represents missing behavior.
3. Implement the minimum production change.
4. Run focused and dependent regression tests.
5. Refactor only while green.

## Implementation Strategy

The minimum safe release increment is not only the 30-day client filter. It is
Phases 1-7 plus approved focused UX: a client-only window without server
allowances would not protect cost, and a server limit without checkpoint/
partial-result behavior would create repeated work and confusing data loss.
Issue #770 remains independently deliverable afterward because this feature
defines adapter points but does not persist raw review drafts.
