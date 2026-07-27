# Tasks: Resumable SMS Review Drafts

**Input**: Design documents from `specs/032-sms-review-drafts/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/`, `quickstart.md`

**Tests**: TDD is mandatory. Write each listed test first, run it, and confirm
it fails for the missing behavior before editing production code.

**Organization**: Shared codec/schema/repository primitives are foundational.
User-story phases remain independently verifiable after that foundation.

## Phase 1: Approved Documentation And Setup

- [x] T001 Confirm every approved mockup/business decision is represented in
      `specs/032-sms-review-drafts/spec.md`, contracts, and
      `docs/business/business-decisions.md`
- [x] T002 Update the active Speckit marker in `AGENTS.md` and set the feature
      specification status to approved
- [x] T003 [P] Add feature export placeholders under
      `packages/logic/src/sms-review-drafts/index.ts` and
      `packages/logic/src/index.ts` without changing runtime behavior
- [x] T004 [P] Create focused test file placeholders under
      `packages/logic/src/sms-review-drafts/__tests__/`,
      `packages/db/src/__tests__/`, and `apps/mobile/__tests__/services/`

---

## Phase 2: Foundational Codec, Local Schema, And Scope

**CRITICAL**: No scan/review integration begins until this phase is green.

### Foundational Tests

- [x] T005 [P] Write failing complete V1 round-trip, deterministic
      serialization, Date restoration, malformed JSON, unsupported version,
      invalid date, non-finite numeric, empty identifier, and fingerprint
      mismatch tests in
      `packages/logic/src/sms-review-drafts/__tests__/sms-review-draft-codec.test.ts`
- [x] T006 [P] Write failing Watermelon schema version/migration/model
      registration, indexed metadata, nullable selection override, and
      generated-schema preservation tests in
      `packages/db/src/__tests__/sms-review-draft-schema.test.ts`
- [x] T007 [P] Write failing explicit local-table pull/push exclusion tests in
      `apps/mobile/__tests__/services/sms-review-draft-sync-exclusion.test.ts`
- [x] T008 [P] Write failing user-scoped queue/item/dismissed repository tests,
      including empty/foreign user rejection and metadata-only count/fingerprint
      reads that do not decode payload JSON, in
      `apps/mobile/__tests__/services/sms-review-draft-repository.test.ts`
- [x] T009 [P] Write failing privacy tests proving raw SMS/payload JSON never
      enters logs, diagnostics, notifications, final records, category
      enrichment, or sync configuration across `sms-safeguard-privacy.test.ts`,
      `notification-service.test.ts`, `batch-create-transactions.test.ts`, and
      `sms-review-draft-sync-exclusion.test.ts`

### Foundational Implementation

- [x] T010 Implement cohesive readonly V1 Zod schemas/types, privacy-safe codec
      errors, deterministic serialization, and Date restoration in
      `packages/logic/src/sms-review-drafts/sms-review-draft-codec.ts`
- [x] T011 Add local-only table definitions and bump Watermelon schema version
      in `packages/db/src/local-schema/sms-review-draft-schema.ts` and
      `packages/db/src/schema.ts`
- [x] T012 Add the next sequential Watermelon migration for `sms_review_queues`,
      `sms_review_draft_items`, and `dismissed_sms_fingerprints` in
      `packages/db/src/migrations.ts`
- [x] T013 Add local-only models and exports in
      `packages/db/src/models/SmsReviewQueue.ts`, `SmsReviewDraftItem.ts`,
      `DismissedSmsFingerprint.ts`, `packages/db/src/database.ts`, and
      `packages/db/src/index.ts`
- [x] T014 Explicitly exclude all three local-only tables from sync in
      `apps/mobile/services/sync/config.ts` and preserve them across schema
      generation in `scripts/transform-schema.js`
- [x] T015 Implement scoped queue observation/read, handled-fingerprint lookup,
      codec decode filtering, and privacy-safe errors in
      `apps/mobile/services/sms-review-draft-repository.ts`
- [x] T016 Run all Phase 2 tests and prove the new local tables never enter
      remote sync or expose sensitive payload content

**Checkpoint**: Strict payload and local persistence boundaries are ready.

---

## Phase 3: User Story 1 - Resume Parsed Work After Leaving (P1)

### Tests

- [x] T017 [P] [US1] Write failing atomic merge, one-queue, unique fingerprint,
      stable position, existing-edit-wins, partial-write failure, and stale-user
      tests in
      `apps/mobile/__tests__/services/sms-review-draft-repository.test.ts`
- [x] T018 [P] [US1] Write failing scan persistence-before-checkpoint,
      persistence/storage-full failure-keeps-retryable, and friendly scan
      failure tests in `apps/mobile/__tests__/services/sms-sync-service.test.ts`
- [x] T019 [P] [US1] Write failing reactive current-user queue, account-switch,
      malformed payload, loading, cancellation, and cleanup tests in
      `apps/mobile/__tests__/hooks/useSmsReviewDraftQueue.test.ts`
- [x] T020 [P] [US1] Write failing edit and explicit nullable selection
      persistence tests in
      `apps/mobile/__tests__/services/sms-review-draft-command-service.test.ts`

### Implementation

- [x] T021 [US1] Implement atomic unique merge and complete item updates in
      `apps/mobile/services/sms-review-draft-repository.ts`
- [x] T022 [US1] Persist accepted local/AI successes before checkpoint
      finalization, replace memory-only checkpoint outcomes with durable draft
      outcomes, and fail closed on persistence errors in
      `apps/mobile/services/sms-sync-service.ts` and
      `apps/mobile/services/sms-scan-checkpoint-coordinator.ts`
- [x] T023 [US1] Include active/dismissed fingerprints in pre-AI handled state
      in `apps/mobile/services/sms-sync-service.ts` and repository adapters
- [x] T024 [US1] Implement scoped edit and explicit selection commands in
      `apps/mobile/services/sms-review-draft-command-service.ts`
- [x] T025 [US1] Implement reactive queue subscription/revalidation facade in
      `apps/mobile/hooks/useSmsReviewDraftQueue.ts`
- [x] T026 [US1] Remove transient transaction ownership from
      `apps/mobile/context/SmsScanContext.tsx` while preserving scan diagnostics
      and retry summary behavior
- [x] T027 [US1] Run US1 tests plus issue #769 checkpoint, scan, parser, and
      account switch regression suites

**Checkpoint**: Accepted results, edits, and selection survive restart without
AI.

---

## Phase 4: User Story 2 - Merge New Results Without Repeat Parsing (P1)

### Tests

- [x] T028 [P] [US2] Write failing repeated/concurrent scan, edit race,
      saved/draft/ dismissed dedup, partial parser success, and
      enrichment-unavailable coverage across
      `sms-review-draft-repository.test.ts`, `sms-sync-service.test.ts`,
      `sms-sync-checkpoint.integration.test.ts`, and parser orchestrator tests
- [x] T029 [P] [US2] Write failing entry-state tests for primary resume and
      secondary incremental scan actions in `SmsReviewResumeState.test.tsx` and
      `apps/mobile/__tests__/app/sms-scan-permission.test.tsx`

### Implementation

- [x] T030 [US2] Wire durable queue count and primary/secondary entry actions
      through `apps/mobile/app/(private)/sms-scan.tsx`
- [x] T031 [US2] Route Check for new messages through the established
      incremental checkpoint and merge path without overwriting existing
      payloads
- [x] T032 [US2] Run US2 tests and existing batch/live SMS fingerprint
      regression suites

**Checkpoint**: New scans merge unique work and never rebill handled
fingerprints.

---

## Phase 5: User Story 3 - Save Selected Drafts Safely (P1)

### Tests

- [x] T033 [P] [US3] Write failing reference revalidation and forced-unselected
      hard-failure tests in
      `apps/mobile/__tests__/services/sms-review-draft-reference-service.test.ts`
- [x] T034 [P] [US3] Write failing selected hard-validation, soft-warning,
      unselected-invalid, atomic multi-record write/deletion, failure rollback,
      fingerprint idempotency, unselected retention, and empty-queue tests in
      `sms-review-save-service.test.ts` and
      `sms-review-draft-atomic-save.test.ts`
- [x] T035 [P] [US3] Write failing route tests for direct Transactions
      navigation, count-only toast, retained queue, and no empty-review flash in
      `apps/mobile/__tests__/app/sms-review.test.tsx`

### Implementation

- [x] T036 [US3] Implement user-accessible account/category reference
      revalidation in
      `apps/mobile/services/sms-review-draft-reference-service.ts`
- [x] T037 [US3] Refactor existing batch preparation so financial writes can be
      composed without committing early in
      `apps/mobile/services/batch-create-transactions.ts`
- [x] T038 [US3] Implement one authoritative WatermelonDB batch containing
      selected financial writes, selected draft deletion, and empty-queue
      cleanup in `apps/mobile/services/sms-review-save-service.ts`
- [x] T039 [US3] Update review state to distinguish hard validation from soft
      warnings and preserve explicit selection overrides in
      `apps/mobile/hooks/useTransactionReviewState.ts`
- [x] T040 [US3] Wire durable selected save behavior and post-save
      navigation/toast in `apps/mobile/app/(private)/sms-review.tsx`
- [x] T041 [US3] Run US3 tests plus transaction/transfer balance, fingerprint,
      category/account, and voice-review save regressions

**Checkpoint**: Financial writes and draft resolution are atomic and valid.

---

## Phase 6: User Story 4 - Discard, Undo, And Suppression (P1)

### Tests

- [x] T042 [P] [US4] Write failing individual discard, dismissed dedup,
      latest-only Undo, close/expiry/replacement finalization, restore
      position/edit/selection, failed transition, and final queue cleanup tests
      in
      `apps/mobile/__tests__/services/sms-review-draft-command-service.test.ts`
- [x] T043 [P] [US4] Write failing Discard all confirmation/cancel/final
      suppression, no bulk Undo, no financial write, and race tests in
      `apps/mobile/__tests__/app/sms-review.test.tsx`
- [x] T044 [P] [US4] Write failing one-tap X accessibility, Undo banner,
      successful motion, failure restoration, replacement, and reduced-motion
      component tests in
      `apps/mobile/__tests__/components/transaction-review/SmsReviewDiscard.test.tsx`

### Implementation

- [x] T045 [US4] Implement atomic discard/Undo/Discard all commands and
      in-memory latest Undo controller in
      `apps/mobile/services/sms-review-draft-command-service.ts` and
      `apps/mobile/hooks/useSmsReviewUndo.ts`
- [x] T046 [US4] Add SMS-only circular top-right X action to
      `apps/mobile/components/transaction-review/TransactionItem.tsx`
- [x] T047 [US4] Implement named Undo banner with trailing close and
      safe-area-safe placement in
      `apps/mobile/components/transaction-review/SmsReviewUndoBanner.tsx`
- [x] T048 [US4] Implement restrained discard/restore Reanimated transitions
      with reduced-motion support in
      `apps/mobile/components/transaction-review/SmsReviewAnimatedItem.tsx`
- [x] T049 [US4] Add Review later and approved Discard all confirmation/copy to
      `apps/mobile/components/transaction-review/ReviewActionBar.tsx` and
      `apps/mobile/app/(private)/sms-review.tsx`
- [x] T050 [US4] Run US4 tests, repeat rapid actions, and verify no voice item
      gains SMS-only discard behavior

**Checkpoint**: Individual mistakes are undoable; final rejection blocks
reparse.

---

## Phase 7: User Story 5 - Clear Recovery And Approved Edit UX (P2)

### Tests

- [x] T051 [P] [US5] Write failing bounded-sheet, provider identity, Currency,
      colorful icons, inline Amount/Merchant focus, selector,
      keyboard/safe-area, read-only type, and absent discard tests in
      `apps/mobile/__tests__/components/transaction-review/TransactionEditModal.test.tsx`
- [x] T052 [P] [US5] Write failing Review later, offline resume/edit/discard,
      AI-consent-revoked resume, subscription-independence, and no custom-range
      route tests in `apps/mobile/__tests__/app/sms-review.test.tsx`

### Implementation

- [x] T053 [US5] Apply the approved bounded SMS edit sheet, provider identity,
      Currency, colorful icons, inline fields, keyboard-aware scrolling,
      selector rows, and SMS read-only type in
      `apps/mobile/components/transaction-review/edit-modal/TransactionEditModal.tsx`
- [x] T054 [US5] Preserve existing voice edit type/discard behavior through
      explicit source-aware props in shared review components
- [x] T055 [US5] Complete recovery entry/Review later/offline wiring in
      `apps/mobile/app/(private)/sms-scan.tsx` and `sms-review.tsx`
- [x] T056 [US5] Run US5 tests plus light/dark, RTL, font-scale, keyboard,
      safe-area, and voice-review regression checks

**Checkpoint**: Recovery and approved edit UX work without network or voice
drift.

---

## Phase 8: User Story 6 - Sensitive Data Retention And Privacy (P1)

### Tests

- [x] T057 [P] [US6] Write failing 30-day boundary, idempotent cleanup,
      cancellation, account-switch, malformed/unsupported/fingerprint-mismatched
      physical disposal, dismissed-retention, and empty-queue tests in
      `apps/mobile/__tests__/services/sms-review-draft-cleanup-service.test.ts`
- [x] T058 [P] [US6] Write failing Privacy details title/sections/copy and
      no-encryption- claim tests in
      `apps/mobile/__tests__/app/privacy-details.test.tsx`
- [x] T059 [P] [US6] Write failing English/Arabic key and privacy-safe error/log
      tests in affected locale and service tests

### Implementation

- [x] T060 [US6] Implement cancellable user-scoped physical expiry cleanup in
      `apps/mobile/services/sms-review-draft-cleanup-service.ts`
- [x] T061 [US6] Invoke bounded cleanup at current-user SMS entry/review
      lifecycle points without blocking unrelated private runtime
- [x] T062 [US6] Rename/generalize the privacy route to
      `apps/mobile/app/(private)/privacy-details.tsx` while preserving
      compatible navigation and adding separate AI/local SMS sections
- [x] T063 [US6] Add approved English/Arabic review, discard, Undo, recovery,
      edit, validation, and privacy copy under `apps/mobile/locales/`
- [x] T064 [US6] Run US6 tests and static privacy inspection across
      sync/logging/ notifications/enrichment/final-record code paths

**Checkpoint**: Raw SMS retention is bounded and confined to local active
review.

---

## Phase 9: Cross-Cutting Validation And PR Readiness

- [x] T065 [P] Update issue #770 or add a source-of-truth comment linking the
      approved spec/contracts when its original body differs from final
      decisions
- [x] T066 Run focused logic, DB, mobile service/hook/component/route Jest
      suites and fix implementation defects without weakening valid tests
- [x] T067 Run existing SMS scan, parser, checkpoint, review, save, live SMS,
      sync, consent, account switch, and voice regression suites
- [x] T068 Run TypeScript, ESLint, Prettier/check formatting, package-boundary,
      migration/schema, sync-exclusion, and `git diff --check` validation
- [x] T069 Audit implementation against every FR, acceptance scenario, contract,
      data-model invariant, and approved mockup; remediate every high/medium/low
      gap
- [x] T070 Update `specs/032-sms-review-drafts/quickstart.md` and PR Manual QA
      Plan with the final coverage matrix and honest manual-only native checks
- [ ] T071 Commit with conventional message, push `384-sms-review-drafts`,
      create a PR to `main`, include `Closes #770`, architecture/privacy notes,
      testing, Manual QA Plan, and coverage matrix

## Dependencies And Order

- Phase 1 precedes all implementation.
- Phase 2 blocks every user story.
- US1 establishes durable results and is required by US2-US6.
- US2 and US3 may proceed after US1 in separate service areas.
- US4 depends on the repository and queue read model from US1.
- US5 depends on durable edits/selection from US1 and save semantics from US3.
- US6 depends on the local schema/repository and may proceed after US1.
- Phase 9 requires all stories complete.

## TDD Execution Rule

1. Add one smallest failing test.
2. Run it and confirm the failure represents missing behavior.
3. Implement the minimum production change.
4. Run focused and dependent regression tests.
5. Refactor only while green.
