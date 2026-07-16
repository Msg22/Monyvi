# Tasks: Trusted Hybrid SMS Parser

**Input**: Design documents from `specs/030-hybrid-sms-parser/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/`, `quickstart.md`

**Tests**: TDD is mandatory. For each story, write the listed tests first and
confirm they fail for the intended missing behavior before production edits.

**Organization**: Tasks are grouped by user story. Shared catalog safety and
identity contracts are foundational because every story depends on them.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Record approved business decisions and prepare feature-owned test
and catalog entry points without changing production routing.

- [x] T001 Document the approved promotion threshold, hybrid routing matrix,
      consent gate, bundled activation policy, partial-result retry, and privacy
      boundary in `docs/business/business-decisions.md` (FR-001-FR-040)
- [x] T002 [P] Add trusted-catalog promotion and validation script entries to
      `package.json` and `packages/logic/package.json` without changing existing
      fixture/local-development commands
- [x] T003 [P] Add feature test fixture directories and sanitized builder
      helpers under `packages/logic/src/parsers/__tests__/fixtures/trusted-sms/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish production-safe catalog types, promotion isolation,
activation, privacy checks, and per-candidate identities before any user story
changes parser behavior.

**CRITICAL**: No production hybrid routing may be implemented until this phase
is complete.

- [x] T004 [P] Write failing schema and invariant tests for catalog identity,
      version, provenance, review-only policy, disabled state, and forbidden
      runtime scopes in
      `packages/logic/src/parsers/__tests__/trusted-sms-pattern-catalog.test.ts`
      (FR-015-FR-024)
- [x] T005 [P] Write failing promotion-record and allowlist tests proving only
      explicitly approved eligible Phase 2A candidates can produce exact trusted
      entries and bank-to-wallet remains excluded in
      `scripts/__tests__/promote-qa-sms-patterns.test.ts` (FR-017-FR-019,
      FR-038)
- [x] T006 [P] Write failing privacy and runtime-isolation tests for candidate
      imports, evidence samples, and concrete placeholder values in
      `scripts/__tests__/check-qa-sms-pattern-privacy.test.ts` and
      `packages/logic/src/parsers/__tests__/qa-sms-candidate-runtime-isolation.test.ts`
      (FR-015, FR-029, FR-037, SC-009)
- [x] T007 Define readonly trusted catalog, pattern, segment, expected-outcome,
      activation, placeholder-policy, validation, and promotion-record
      interfaces from `specs/030-hybrid-sms-parser/contracts/` in
      `packages/logic/src/parsers/trusted-sms-pattern-types.ts`
- [x] T008 Implement trusted catalog schema validation and bundled activation
      policy in `packages/logic/src/parsers/trusted-sms-pattern-catalog.ts` and
      `packages/logic/src/parsers/trusted-sms-catalog-activation.ts`
      (FR-015-FR-025, FR-031)
- [x] T009 Implement deterministic candidate-to-runtime promotion with explicit
      approval records and no candidate mutation in
      `scripts/promote-qa-sms-patterns.ts` (FR-017-FR-019, FR-037)
- [x] T010 Generate and commit the initial versioned QNB trusted catalog using
      the approved family/currency allowlist and explicit promotion manifest in
      `packages/logic/src/parsers/trusted-sms-patterns/qnb-egypt.ts`,
      `packages/logic/src/parsers/trusted-sms-patterns/promotion-manifest.ts`,
      and `packages/logic/src/parsers/trusted-sms-patterns/index.ts` (FR-038)
- [x] T011 Extend repository privacy/static checks to validate trusted runtime
      catalogs and forbid candidate/evaluator imports in
      `scripts/check-qa-sms-pattern-privacy.ts` (FR-015, FR-029, FR-037)
- [x] T012 Run the new foundational tests in
      `packages/logic/src/parsers/__tests__/trusted-sms-pattern-catalog.test.ts`,
      `scripts/__tests__/promote-qa-sms-patterns.test.ts`, and
      `scripts/__tests__/check-qa-sms-pattern-privacy.test.ts` and make them
      green before story work

**Checkpoint**: A valid, isolated, review-only trusted catalog can be produced
and activated without changing production parser selection.

---

## Phase 3: User Story 1 - Parse Covered Messages Locally First (Priority: P1) - MVP

**Goal**: Resolve exact active trusted transaction and rejection templates
locally, offline, with one deterministic outcome per candidate.

**Independent Test**: Parse exact trusted QNB transaction and rejection examples
with no network and verify correct local outcomes; verify near matches,
malformed values, disabled patterns, and multiple matches remain unresolved.

### Tests for User Story 1

- [x] T013 [P] [US1] Write failing exact-positive and trusted-rejection matcher
      tests in
      `packages/logic/src/parsers/__tests__/trusted-sms-template-matcher.test.ts`
      (FR-001, FR-003, FR-023)
- [x] T014 [P] [US1] Write failing near-match, malformed extraction, unsupported
      currency, sender trim/case normalization, exact body case/punctuation,
      disabled-pattern, and no-match tests in
      `packages/logic/src/parsers/__tests__/trusted-sms-template-matcher.test.ts`
      (FR-004, FR-025, FR-039)
- [x] T015 [P] [US1] Write failing multiple-match and catalog-order determinism
      tests in
      `packages/logic/src/parsers/__tests__/trusted-sms-template-matcher.test.ts`
      (FR-004, FR-036)
- [x] T016 [P] [US1] Write failing 1,000-candidate offline benchmark test with a
      one-second budget in
      `packages/logic/src/parsers/__tests__/trusted-sms-template-performance.test.ts`
      (SC-006)

### Implementation for User Story 1

- [x] T017 [US1] Implement anchored ordered-segment compilation with only
      reviewed whitespace normalization in
      `packages/logic/src/parsers/trusted-sms-template-matcher.ts` (FR-003,
      FR-018, FR-019)
- [x] T018 [US1] Implement all-pattern evaluation and discriminated matched,
      rejected, unresolved, ambiguous, and catalog-error outcomes in
      `packages/logic/src/parsers/trusted-sms-template-matcher.ts` (FR-004,
      FR-007, FR-010)
- [x] T019 [US1] Implement every extraction/ignore/rejection policy from
      `specs/030-hybrid-sms-parser/contracts/placeholder-role-contract.md` and
      review-only local transaction mapping in
      `packages/logic/src/parsers/trusted-sms-parser.ts` (FR-012, FR-013,
      FR-017, FR-039)
- [x] T020 [US1] Export only trusted runtime parser contracts from
      `packages/logic/src/parsers/index.ts` while keeping candidate and QA
      evaluator modules absent from runtime barrels (FR-015)
- [x] T021 [US1] Run all User Story 1 parser and benchmark tests and verify
      exact matches work with network access unavailable in
      `packages/logic/src/parsers/__tests__/`

**Checkpoint**: Trusted covered messages resolve locally and unsupported or
ambiguous messages fail closed without AI integration yet.

---

## Phase 4: User Story 2 - Use AI Only For Unresolved Messages (Priority: P1)

**Goal**: Partition candidates locally, send only unresolved candidates to AI,
and combine outcomes without duplicates while preserving consent and dev modes.

**Independent Test**: Parse a mixed batch and verify AI receives only unresolved
fingerprints, exact local matches never reach AI, consent denial blocks the
feature, and fixture/local-development modes retain their old behavior.

### Tests for User Story 2

- [x] T022 [P] [US2] Write failing orchestrator partition and fingerprint-merge
      tests in `apps/mobile/__tests__/services/sms-parser-orchestrator.test.ts`
      (FR-001-FR-010, SC-001-SC-003)
- [x] T023 [P] [US2] Write failing consent, fixture-mode,
      local-development-mode, hybrid-disablement, and cancellation tests in
      `apps/mobile/__tests__/services/sms-parser-orchestrator.test.ts` (FR-005,
      FR-006, FR-011, FR-031, FR-032)
- [x] T024 [P] [US2] Write failing AI chunk-correlation tests that expose only
      retryable failed candidate identities while preserving successful chunks
      in `apps/mobile/__tests__/services/ai-sms-parser-service.test.ts` (FR-007,
      FR-009, FR-035)
- [x] T025 [P] [US2] Write failing batch and live caller tests for mixed
      local/AI routing in
      `apps/mobile/__tests__/services/sms-sync-service.test.ts` and
      `apps/mobile/__tests__/services/sms-live-processor.test.ts` (FR-014)

### Implementation for User Story 2

- [x] T026 [US2] Extend AI parse results with stable per-candidate success and
      retryable-failure correlation in
      `apps/mobile/services/ai-sms-parser-service.ts` without exposing payload
      data (FR-007, FR-009, FR-028-FR-030)
- [x] T027 [US2] Implement production hybrid partition, consent checks, abort
      checks, and deterministic fingerprint merge in
      `apps/mobile/services/sms-parser-orchestrator.ts` (FR-001-FR-011, FR-035,
      FR-036)
- [x] T028 [US2] Add explicit hybrid mode and staged disablement while
      preserving fixture and local-development mode semantics in
      `apps/mobile/config/e2e-test-config.ts` and
      `apps/mobile/services/sms-parser-orchestrator.ts` (FR-031, FR-032)
- [x] T029 [US2] Extend privacy-safe diagnostics with catalog version,
      parser-source counts, reason counts, and pattern IDs in
      `apps/mobile/services/sms-parser-orchestrator.ts` (FR-028-FR-030)
- [x] T030 [US2] Integrate hybrid summaries and unresolved candidate results
      into batch scanning in `apps/mobile/services/sms-sync-service.ts` (FR-002,
      FR-009, FR-035)
- [x] T031 [US2] Integrate the same hybrid orchestrator contract into
      foreground, background, and killed-app callers in
      `apps/mobile/services/sms-live-processor.ts`,
      `apps/mobile/services/sms-headless-task.ts`, and
      `apps/mobile/services/sms-live-detection-handler.ts` (FR-014, FR-034)
- [x] T032 [US2] Run all User Story 2 service tests and verify AI mock calls
      contain only unresolved candidate fingerprints in
      `apps/mobile/__tests__/services/`

**Checkpoint**: Production hybrid routing minimizes AI calls without changing
consent or development parser modes.

---

## Phase 5: User Story 3 - Preserve Safe Partial Results (Priority: P1)

**Goal**: Keep successful suggestions when AI partially fails and let the user
retry only unresolved candidates through the approved inline review notice.

**Independent Test**: Force a mixed scan with local success and retryable AI
failure; verify review opens with local results, the approved notice displays
the unresolved count in both themes, retry processes only unresolved candidates,
existing edits remain, and the notice disappears at zero.

### Tests for User Story 3

- [x] T033 [P] [US3] Write failing scan-result tests that preserve successful
      transactions and retryable unresolved candidates in
      `apps/mobile/__tests__/services/sms-sync-service.test.ts` (FR-009, FR-026)
- [x] T034 [P] [US3] Write failing unresolved-only retry, merge, repeated-tap,
      failure, and cancellation tests in
      `apps/mobile/__tests__/services/sms-review-retry-service.test.ts` (FR-011,
      FR-027)
- [x] T035 [P] [US3] Write failing in-memory session lifecycle tests for set,
      append, retry update, save/discard/reset, review Back, abandonment route
      replacement, logout, and private-runtime unmount in
      `apps/mobile/__tests__/context/SmsScanContext.test.tsx` (FR-027, FR-029,
      FR-040)
- [x] T036 [P] [US3] Write failing light/dark, retryable-count, accessibility,
      busy, and dismissal tests for the approved second mockup image in
      `apps/mobile/__tests__/components/transaction-review/PartialSmsResultsNotice.test.tsx`
      (FR-026, FR-027)
- [x] T037 [P] [US3] Write failing reconciliation tests proving appended retry
      results do not reset existing selections, overrides, or edits in
      `apps/mobile/__tests__/hooks/useTransactionReviewState.test.ts` (FR-027)
- [x] T038 [P] [US3] Write a failing SMS review route integration test for
      notice placement below controls and above rows in
      `apps/mobile/__tests__/app/sms-review.test.tsx` (FR-026)

### Implementation for User Story 3

- [x] T039 [US3] Extend `SmsScanResult` and the in-memory review-session
      contract with unresolved candidates, parse context, safe summary, and
      retry state in `apps/mobile/services/sms-sync-service.ts` and
      `apps/mobile/context/SmsScanContext.tsx`
- [x] T040 [US3] Implement atomic unresolved-only retry and fingerprint merge in
      `apps/mobile/services/sms-review-retry-service.ts` (FR-027)
- [x] T041 [US3] Implement retry lifecycle, cancellation, stale-result
      protection, and repeated-tap guard in
      `apps/mobile/hooks/useSmsReviewRetry.ts` (FR-011, FR-027)
- [x] T042 [US3] Reconcile appended transactions by fingerprint without
      resetting existing review state in
      `apps/mobile/hooks/useTransactionReviewState.ts` (FR-027)
- [x] T043 [US3] Implement the approved compact bordered notice with warning
      icon, separator, and right-aligned retry action in
      `apps/mobile/components/transaction-review/PartialSmsResultsNotice.tsx`
      using NativeWind and Monyvi light/dark tokens (FR-026)
- [x] T044 [US3] Add presentational partial-result props and inline placement to
      `apps/mobile/components/transaction-review/TransactionReview.tsx` without
      service imports (FR-026)
- [x] T045 [US3] Connect the scan session, retry hook, and
      clear-on-save/discard/reset/Back/abandonment/logout behavior in
      `apps/mobile/app/(private)/sms-scan.tsx`,
      `apps/mobile/app/(private)/sms-review.tsx`, and
      `apps/mobile/context/SmsScanContext.tsx` (FR-027, FR-040)
- [x] T046 [US3] Add localized partial-result and retry copy to
      `apps/mobile/locales/en/transactions.json` and
      `apps/mobile/locales/ar/transactions.json`
- [x] T047 [US3] Add one deterministic Maestro hybrid fixture journey for mixed
      trusted/unknown scan and AI timeout/partial retry under
      `apps/mobile/e2e/maestro/sms-sync/`; cover cancellation, consent,
      disablement, and duplicate invariants in deterministic service tests, and
      mark uncontrollable native paths manual-only in
      `specs/030-hybrid-sms-parser/quickstart.md` (FR-006, FR-011, FR-014,
      FR-026, FR-027, FR-031)
- [ ] T048 [US3] Run User Story 3 unit/integration tests and the deterministic
      partial-retry journey, then compare light/dark screenshots with
      `specs/030-hybrid-sms-parser/mockups/partial-results-notice-light-dark.png`

**Checkpoint**: Partial failures preserve work and have a complete, accessible,
theme-compatible recovery path.

---

## Phase 6: User Story 4 - Keep Every Local Suggestion Reviewable (Priority: P2)

**Goal**: Ensure trusted local suggestions cannot bypass review, financial
validation, account/category/transfer resolution, or fingerprint deduplication.

**Independent Test**: Produce a trusted local suggestion with missing financial
references and repeated delivery; verify it is not auto-selected, cannot save
until corrected, and creates at most one financial record.

### Tests for User Story 4

- [x] T049 [P] [US4] Write failing review-selection tests proving every trusted
      production result is `needs_review` regardless of confidence in
      `apps/mobile/__tests__/services/transaction-review-selection.test.ts`
      (FR-012)
- [x] T050 [P] [US4] Write failing account, category, transfer-endpoint, amount,
      currency, and SMS fingerprint validation tests for trusted results in
      `apps/mobile/__tests__/services/sms-review-save-service.test.ts` and
      `apps/mobile/__tests__/services/batch-create-transactions.test.ts`
      (FR-013, FR-014)
- [x] T051 [P] [US4] Write failing repeated batch/live/background confirmation
      tests in
      `apps/mobile/__tests__/services/sms-live-detection-handler.test.ts` and
      `apps/mobile/__tests__/services/sms-headless-task.test.ts` (FR-014,
      SC-003)

### Implementation for User Story 4

- [x] T052 [US4] Enforce review-only status and stable local review reasons
      while mapping trusted parser results in
      `apps/mobile/services/sms-parser-orchestrator.ts` (FR-012)
- [x] T053 [US4] Preserve existing account/category/transfer/save validation for
      trusted results in `apps/mobile/services/transaction-review-selection.ts`,
      `apps/mobile/services/sms-review-save-service.ts`, and
      `apps/mobile/services/batch-create-transactions.ts` (FR-013)
- [x] T054 [US4] Verify and minimally adjust fingerprint guards across batch,
      live, background, headless, and notification confirmation services in
      `apps/mobile/services/sms-sync-service.ts`,
      `apps/mobile/services/sms-live-processor.ts`,
      `apps/mobile/services/sms-live-detection-handler.ts`, and
      `apps/mobile/services/notification-service.ts` (FR-014)
- [x] T055 [US4] Run all User Story 4 validation and duplicate-delivery tests in
      `apps/mobile/__tests__/services/`

**Checkpoint**: Trusted local results have exactly the same financial safety
barriers as AI suggestions and cannot duplicate saved data.

---

## Phase 7: User Story 5 - Operate A Governed Trusted Catalog (Priority: P2)

**Goal**: Validate, disable, roll back, and observe the bundled trusted catalog
without activating evidence-only patterns or changing unrelated patterns.

**Independent Test**: Load valid, invalid, disabled, and incompatible catalog
states; verify only valid enabled trusted entries execute, disabled entries
route to AI, unrelated entries continue, and invalid state activates no local
pattern.

### Tests for User Story 5

- [x] T056 [P] [US5] Write failing activation tests for per-pattern disablement,
      invalid schema/integrity, incompatible version, and unrelated-pattern
      continuity in
      `packages/logic/src/parsers/__tests__/trusted-sms-catalog-activation.test.ts`
      (FR-020-FR-025)
- [x] T057 [P] [US5] Write failing staged global-disable and development-scope
      isolation tests in
      `apps/mobile/__tests__/services/sms-parser-orchestrator.test.ts` (FR-015,
      FR-031, FR-032)
- [x] T058 [P] [US5] Write failing safe-metrics tests for catalog version,
      pattern IDs, routing counts, and forbidden payload fields in
      `apps/mobile/__tests__/services/sms-parser-orchestrator.test.ts`
      (FR-028-FR-030)

### Implementation for User Story 5

- [x] T059 [US5] Implement per-pattern activation, invalid-catalog fail-closed
      behavior, and replaceable activation-provider interface in
      `packages/logic/src/parsers/trusted-sms-catalog-activation.ts`
      (FR-020-FR-025)
- [x] T060 [US5] Implement staged global hybrid disablement that routes all
      candidates through existing AI behavior in
      `apps/mobile/services/sms-parser-orchestrator.ts` (FR-031)
- [x] T061 [US5] Add promotion, validation, disablement, OTA rollback, and
      future remote-manifest operator guidance to
      `specs/030-hybrid-sms-parser/quickstart.md` and
      `docs/development/sms-parser.md`
- [x] T062 [US5] Run catalog activation, isolation, privacy, and diagnostics
      tests in `packages/logic/src/parsers/__tests__/`,
      `apps/mobile/__tests__/services/`, and `scripts/__tests__/`

**Checkpoint**: The catalog is production-governed, independently disableable,
offline-capable, observable without payload leakage, and future
activation-policy changes do not alter matcher contracts.

---

## Phase 8: Polish & Cross-Cutting Verification

**Purpose**: Prove cross-story correctness, performance, privacy, UI fidelity,
and all affected delivery modes before PR handoff.

- [x] T063 [P] Add a reproducible 1,000-candidate benchmark runner and safe
      aggregate report to `scripts/benchmark-trusted-sms-parser.ts` and
      `specs/030-hybrid-sms-parser/quickstart.md` (SC-006)
- [x] T064 [P] Add staged precision, false-positive, ambiguity, local-match, and
      AI-fallback metric assertions using sanitized fixtures in
      `packages/logic/src/parsers/__tests__/trusted-sms-staged-validation.test.ts`
      (SC-010)
- [x] T065 Run focused parser, mobile service, review UI, context, hook, script,
      privacy, typecheck, lint, formatting, and i18n checks using the commands
      documented in `specs/030-hybrid-sms-parser/quickstart.md`
- [ ] T066 Run affected SMS scan and live SMS Maestro suites under
      `apps/mobile/e2e/maestro/sms-sync/` and
      `apps/mobile/e2e/maestro/live-sms-detection/`, documenting
      physical-device-only background/killed-app scenarios in
      `specs/030-hybrid-sms-parser/quickstart.md`
- [ ] T067 Perform the manual QA outline in
      `specs/030-hybrid-sms-parser/quickstart.md`, including light/dark visual
      comparison, consent revocation, offline trusted matching, partial retry,
      disablement, and duplicate delivery
- [x] T068 Perform a paranoid boundary/regression review against
      `specs/030-hybrid-sms-parser/spec.md`,
      `docs/business/business-decisions.md`, and
      `.specify/memory/constitution.md`, then fix only in-scope findings
- [x] T069 Update `specs/030-hybrid-sms-parser/tasks.md` checkboxes and prepare
      the PR coverage matrix mapping every manual scenario to unit, integration,
      E2E, or manual-only evidence

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependency.
- **Foundational (Phase 2)**: Depends on Setup and blocks all user stories.
- **US1 (Phase 3)**: Depends on Foundational trusted catalog contracts.
- **US2 (Phase 4)**: Depends on US1 local outcomes.
- **US3 (Phase 5)**: Depends on US2 hybrid result/correlation contracts.
- **US4 (Phase 6)**: Depends on US1 result mapping; may begin after US2
  contracts stabilize.
- **US5 (Phase 7)**: Foundational catalog validation exists in Phase 2;
  operational disablement/rollback depends on US2 routing.
- **Polish (Phase 8)**: Depends on all selected stories.

### User Story Dependencies

- **US1**: First independently demonstrable local-only increment after
  foundation.
- **US2**: Adds AI partitioning and requires US1 outcomes.
- **US3**: Adds batch partial-result lifecycle and requires US2 correlation.
- **US4**: Reuses local results and existing review/save services; independent
  of the partial-results UI.
- **US5**: Reuses the catalog validator and hybrid routing; independent of
  review UI.

### Parallel Opportunities

- T002 and T003 can run in parallel.
- T004-T006 can run in parallel before T007-T011.
- Test tasks within each story marked `[P]` can run in parallel.
- After US2 stabilizes, US3 UI/session work, US4 financial-safety work, and US5
  operational-governance work can proceed in parallel in non-overlapping files
  except orchestrator integration, which must be serialized.
- T063 and T064 can run in parallel before final verification.

---

## Parallel Examples

### User Story 1

```text
T013 exact-positive/rejection matcher tests
T014 near-match/malformed/disabled tests
T015 ambiguity/determinism tests
T016 performance test
```

### User Story 3

```text
T033 scan partial-result tests
T034 retry-service tests
T035 context lifecycle tests
T036 notice component tests
T037 review-state reconciliation tests
T038 route integration test
```

### User Stories 3-5 after US2

```text
US3: retry service, context/hook, and inline notice
US4: review/save validation and delivery deduplication
US5: catalog activation, disablement, and safe diagnostics
```

---

## Implementation Strategy

### MVP First

1. Complete Setup and Foundational phases.
2. Complete US1 and prove trusted exact matches resolve locally and offline.
3. Complete US2 and prove AI receives only unresolved candidates.
4. Stop for an architecture and privacy checkpoint before adding retry UI.

### Incremental Delivery

1. Foundation: isolated versioned trusted catalog.
2. US1: deterministic trusted local outcomes.
3. US2: production hybrid partition and merge.
4. US3: resilient partial results and approved retry UX.
5. US4: financial validation and delivery-mode deduplication proof.
6. US5: operational disablement, rollback, metrics, and documentation.
7. Final cross-cutting verification and PR coverage matrix.

## Notes

- Every production implementation task follows its preceding failing test task.
- `[P]` means different files or independent test scaffolding; tasks touching
  `sms-parser-orchestrator.ts` must be serialized.
- Candidate artifacts remain evidence-only even after promotion.
- No task may persist unresolved raw SMS candidates.
- No task may weaken AI consent, user scope, review validation, or fingerprint
  deduplication.
- Optional SpecKit git hooks were not executed; changes remain uncommitted for
  review.
