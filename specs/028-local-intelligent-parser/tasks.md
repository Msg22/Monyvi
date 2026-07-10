# Tasks: Local Intelligent Parser

**Input**: Design documents from `specs/028-local-intelligent-parser/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/`, `quickstart.md`

**Tests**: Required. The feature spec requires fixture coverage, deterministic
outcomes, local-parser E2E mode separation, unchanged production AI behavior,
and privacy guarantees; the project requires TDD. Write the listed tests first
and confirm they fail for the expected reason before implementation.

**Organization**: Tasks are grouped by user story so each story can be
implemented and verified independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other [P] tasks in the same phase when file
  paths do not overlap
- **[Story]**: User story label from `spec.md`
- Every task includes exact file paths

## Phase 1: Re-align Existing Draft With Revised Scope

**Purpose**: Remove the old production-fallback assumption and reset the code to
the phase-1 dev/test parser direction.

- [x] T001 Read `specs/028-local-intelligent-parser/spec.md`,
      `specs/028-local-intelligent-parser/plan.md`,
      `specs/028-local-intelligent-parser/research.md`,
      `specs/028-local-intelligent-parser/data-model.md`, and all
      `specs/028-local-intelligent-parser/contracts/*.md` before editing code
- [x] T002 Inspect current draft implementation in
      `packages/logic/src/parsers/`,
      `apps/mobile/services/sms-parser-orchestrator.ts`,
      `apps/mobile/services/sms-sync-service.ts`, and
      `apps/mobile/services/sms-live-processor.ts` and list which old
      production-fallback pieces must be removed or disabled
- [x] T003 Update `docs/business/business-decisions.md` to document phase-1
      dev/test scope, dev/test-only pattern rules, phase-2 trusted promotion,
      diagnostics, and consent-setting boundaries
- [x] T004 [P] Update `packages/logic/src/parsers/local-sms-parser-types.ts`
      with phase-1 pattern metadata: runtime scope, source type, source
      confidence, auto-select policy, and promotion eligibility
- [x] T005 [P] Update `apps/mobile/config/e2e-test-config.ts` tests to
      distinguish `fixture` mode from `local` parser mode
- [x] T006 Add a written implementation note in the working summary or PR body
      that identifies every old production-fallback code path removed, disabled,
      or left untouched with rationale

---

## Phase 2: User Story 1 - Deterministic SMS Parsing For Development And Tests (Priority: P1)

**Goal**: Supported SMS fixtures can be parsed locally in development/test mode
without contacting the AI provider.

**Independent Test**: Run representative parser fixtures repeatedly and confirm
stable transaction suggestions with expected amount, currency, direction,
confidence, review status, and no AI-provider call.

### Tests for User Story 1

- [x] T007 [P] [US1] Add failing catalog governance tests for runtime scope,
      source type, source confidence, auto-select policy, promotion eligibility,
      acceptance examples, and sanitized examples in
      `packages/logic/src/parsers/__tests__/local-sms-pattern-catalog.test.ts`
- [x] T008 [P] [US1] Add failing tests proving
      fixture/synthetic/internet/unknown-source patterns are allowed only as
      `dev_test` patterns in
      `packages/logic/src/parsers/__tests__/local-sms-pattern-catalog.test.ts`
- [x] T009 [P] [US1] Add failing parser tests for supported debit, credit,
      transfer, and ATM fixture parsing in
      `packages/logic/src/parsers/__tests__/local-sms-parser.test.ts`
- [x] T010 [P] [US1] Add failing parser field-coverage tests for amount,
      currency, direction, date/time hint, sender/provider context,
      merchant/counterparty, account/card hint, category hint, transfer
      indicator, ATM indicator, confidence, and review status in
      `packages/logic/src/parsers/__tests__/local-sms-parser.test.ts`
- [x] T011 [P] [US1] Add failing deterministic repeatability tests that parse
      the same supported fixture set 10 times in
      `packages/logic/src/parsers/__tests__/local-sms-parser.test.ts`
- [x] T012 [P] [US1] Add failing acceptance metric tests that calculate
      supported-fixture suggestion rate, unsupported-fixture rejection rate, and
      no-AI-call rate against an agreed fixture corpus in
      `packages/logic/src/parsers/__tests__/local-sms-parser.test.ts`
- [x] T013 [P] [US1] Add failing local-primary mode tests proving the mobile
      orchestrator bypasses the AI service in
      `apps/mobile/__tests__/services/sms-parser-orchestrator.test.ts`
- [x] T014 [P] [US1] Add failing production/default mode tests proving the
      mobile orchestrator remains AI-primary and does not call the local parser
      unless explicit dev/test local mode is enabled in
      `apps/mobile/__tests__/services/sms-parser-orchestrator.test.ts`
- [x] T015 [P] [US1] Add failing tests proving `ai-with-local-fallback` or
      equivalent production fallback behavior is not enabled in phase 1 in
      `apps/mobile/__tests__/services/sms-parser-orchestrator.test.ts`
- [x] T016 [P] [US1] Add failing config tests for explicit local-parser E2E
      commands/mode in `apps/mobile/__tests__/config/e2e-test-config.test.ts`

### Implementation for User Story 1

- [x] T017 [US1] Reclassify the current pattern catalog in
      `packages/logic/src/parsers/local-sms-pattern-catalog.ts` as dev/test
      fixture patterns unless a trusted source is explicitly proven later
- [x] T018 [US1] Sanitize or tokenize personal-looking example values in
      `packages/logic/src/parsers/local-sms-pattern-catalog.ts`
- [x] T019 [US1] Implement catalog validation for dev/test-only scope, source
      confidence, auto-select policy, and promotion eligibility in
      `packages/logic/src/parsers/local-sms-pattern-catalog.ts`
- [x] T020 [US1] Define the agreed phase-1 fixture corpus for supported and
      unsupported SMS examples, including at least 100 concrete dev/test
      SMS-shaped fixtures across selectable bank/wallet providers, in
      `packages/logic/src/parsers/local-sms-fixture-corpus.ts`
- [x] T021 [US1] Keep pattern matching deterministic and pattern-based in
      `packages/logic/src/parsers/local-sms-parser.ts`; do not allow broad
      financial keywords to create suggestions by themselves
- [x] T022 [US1] Implement extraction for amount, currency, direction, date/time
      hint, sender/provider context, merchant/counterparty, account/card hint,
      category hint, transfer indicator, and ATM indicator in
      `packages/logic/src/parsers/local-sms-parser.ts`
- [x] T023 [US1] Implement confidence and review status behavior for dev/test
      local parser results in `packages/logic/src/parsers/local-sms-parser.ts`
- [x] T024 [US1] Map local parser output to the existing `ParsedSmsTransaction`
      shape in `apps/mobile/services/sms-parser-orchestrator.ts` without
      exposing user-facing parser-source labels
- [x] T025 [US1] Remove or disable old production fallback behavior from
      `apps/mobile/services/sms-parser-orchestrator.ts`; phase 1 must support
      only AI-primary, local-primary dev/test mode, and fixture mode
- [x] T026 [US1] Ensure production/default parser mode remains AI-primary in
      `apps/mobile/services/sms-parser-orchestrator.ts`
- [x] T027 [US1] Route development/test batch SMS parsing through
      `apps/mobile/services/sms-parser-orchestrator.ts` from
      `apps/mobile/services/sms-sync-service.ts`
- [x] T028 [US1] Route development/test live SMS parsing through
      `apps/mobile/services/sms-parser-orchestrator.ts` from
      `apps/mobile/services/sms-live-processor.ts`

**Checkpoint**: User Story 1 is independently functional and testable with
local-parser mode, no AI-provider call, unchanged production AI-primary
behavior, and no phase-1 production fallback.

---

## Phase 3: User Story 2 - Safe Parser-Source Diagnostics For QA (Priority: P2)

**Goal**: QA can verify whether AI, fixture, or local-parser mode was used
without exposing sensitive SMS data.

### Tests for User Story 2

- [x] T029 [P] [US2] Add failing orchestrator diagnostics tests proving mode,
      candidate count, result count, pattern IDs, and runtime scope counts are
      safe in `apps/mobile/__tests__/services/sms-parser-orchestrator.test.ts`
- [x] T030 [P] [US2] Add failing tests proving diagnostics omit SMS body,
      sender, amount, AI/local response body, transcript, and user account names
      in `apps/mobile/__tests__/services/sms-parser-orchestrator.test.ts`
- [x] T031 [P] [US2] Add failing tests proving disabled AI transaction
      suggestions block local-parser entry points for phase 1 in
      `apps/mobile/__tests__/services/sms-parser-orchestrator.test.ts`
- [x] T032 [P] [US2] Add failing SMS sync and live SMS service tests proving
      disabled AI transaction suggestions prevent local-parser parsing in
      `apps/mobile/__tests__/services/sms-sync-service.test.ts` and
      `apps/mobile/__tests__/services/sms-live-processor.test.ts`
- [x] T033 [P] [US2] Add failing review UI/component test proving regular user
      UI does not show parser-source implementation labels in
      `apps/mobile/__tests__/components/transaction-review/TransactionReview.test.tsx`

### Implementation for User Story 2

- [x] T034 [US2] Add privacy-safe parser diagnostics in
      `apps/mobile/services/sms-parser-orchestrator.ts`
- [x] T035 [US2] Surface diagnostics to batch/live callers only through safe
      logger/test metadata in `apps/mobile/services/sms-sync-service.ts` and
      `apps/mobile/services/sms-live-processor.ts`
- [x] T036 [US2] Enforce the existing AI transaction suggestions setting before
      local-parser mode can run in
      `apps/mobile/services/sms-parser-orchestrator.ts`,
      `apps/mobile/services/sms-sync-service.ts`, and
      `apps/mobile/services/sms-live-processor.ts`
- [x] T037 [US2] Keep parser-source metadata out of regular transaction review
      UI rendering in
      `apps/mobile/components/transaction-review/TransactionReview.tsx`

**Checkpoint**: QA can prove parser mode without exposing sensitive data or
adding implementation labels to user UI, and disabled AI transaction suggestions
still block SMS/voice suggestion entry points in phase 1.

---

## Phase 4: User Story 3 - Privacy-Preserving Dev/Test Parsing Behavior (Priority: P3)

**Goal**: Local parsing preserves existing SMS privacy boundaries.

### Tests for User Story 3

- [x] T038 [P] [US3] Add failing negative-classification tests for OTP,
      promotion, activation, failed transaction, statement reminder, marketing,
      and informational SMS in
      `packages/logic/src/parsers/__tests__/local-sms-parser.test.ts`
- [x] T039 [P] [US3] Add failing tests proving unsupported messages and broad
      keyword-only messages produce no suggestion in
      `packages/logic/src/parsers/__tests__/local-sms-parser.test.ts`
- [x] T040 [P] [US3] Add failing save-path regression tests proving raw SMS body
      is not persisted after review/save in
      `apps/mobile/__tests__/services/batch-create-transactions.test.ts`
- [x] T041 [P] [US3] Add failing duplicate SMS regression tests proving local
      parser mode preserves existing transaction/transfer fingerprint
      deduplication in `apps/mobile/__tests__/services/sms-sync-service.test.ts`

### Implementation for User Story 3

- [x] T042 [US3] Run negative classification before pattern extraction in
      `packages/logic/src/parsers/local-sms-parser.ts`
- [x] T043 [US3] Verify save-path raw SMS handling remains non-persistent at the
      persistence boundary in
      `apps/mobile/services/batch-create-transactions.ts`
- [x] T044 [US3] Preserve existing SMS fingerprint deduplication when
      local-parser mode is active in `apps/mobile/services/sms-sync-service.ts`
      and `apps/mobile/services/sms-live-processor.ts`

**Checkpoint**: Privacy guarantees are covered by deterministic tests and local
parsing cannot turn promotional/keyword-only messages into suggestions.

---

## Phase 5: User Story 4 - Future-Ready Trusted Pattern Promotion (Priority: P4)

**Goal**: The phase-1 catalog and parser design can support phase-2 trusted real
SMS promotion without parser rewrite.

### Tests for User Story 4

- [x] T045 [P] [US4] Add failing tests proving `trusted_production` patterns
      require trusted provenance and cannot be created from
      fixture/synthetic/internet/unknown sources in
      `packages/logic/src/parsers/__tests__/local-sms-pattern-catalog.test.ts`
- [x] T046 [P] [US4] Add failing tests proving production auto-select policy is
      rejected outside `trusted_production` scope in
      `packages/logic/src/parsers/__tests__/local-sms-pattern-catalog.test.ts`
- [x] T047 [P] [US4] Add failing type/contract tests proving local parser
      requests accept text candidates only and no audio payload fields in
      `packages/logic/src/parsers/__tests__/local-sms-parser.test.ts`

### Implementation for User Story 4

- [x] T048 [US4] Add future-ready trusted promotion fields and validation
      helpers in `packages/logic/src/parsers/local-sms-parser-types.ts` and
      `packages/logic/src/parsers/local-sms-pattern-catalog.ts`
- [x] T049 [US4] Keep local parser types text-only and source-neutral enough for
      future already-transcribed text in
      `packages/logic/src/parsers/local-sms-parser-types.ts`
- [x] T050 [US4] Document that production fallback, real SMS collection, trusted
      promotion, local audio transcription, and direct voice integration are out
      of scope in `docs/business/business-decisions.md` and
      `specs/028-local-intelligent-parser/quickstart.md`

**Checkpoint**: Phase 2 can add trusted real SMS patterns through metadata and
tests instead of parser rewrites.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, documentation cleanup, and regression coverage
across all selected stories.

- [x] T051 [P] Add explicit local-parser E2E scripts in
      `apps/mobile/package.json` so local-parser mode is not confused with
      fixture mode
- [x] T052 [P] Update any affected SMS Maestro flow setup in
      `apps/mobile/e2e/maestro/` only if local-parser mode needs distinct
      user-visible setup
- [x] T053 [P] Add or update manual QA coverage matrix notes in
      `specs/028-local-intelligent-parser/quickstart.md`
- [x] T054 Run focused Jest coverage for
      `packages/logic/src/parsers/__tests__/local-sms-parser.test.ts`,
      `packages/logic/src/parsers/__tests__/local-sms-pattern-catalog.test.ts`,
      `packages/logic/src/parsers/__tests__/local-sms-fixture-corpus.test.ts`,
      `apps/mobile/__tests__/services/sms-parser-orchestrator.test.ts`,
      `apps/mobile/__tests__/services/sms-sync-service.test.ts`,
      `apps/mobile/__tests__/services/sms-live-processor.test.ts`,
      `apps/mobile/__tests__/services/batch-create-transactions.test.ts`,
      `apps/mobile/__tests__/components/transaction-review/TransactionReview.test.tsx`,
      and `apps/mobile/__tests__/config/e2e-test-config.test.ts`
- [x] T055 Run `npm run lint` using `package.json`
- [x] T056 Run available type checks: `npm run typecheck -w @monyvi/logic` and
      `npx tsc -p apps/mobile/tsconfig.json --noEmit`
- [ ] T057 Run `cd apps/mobile; npm run e2e:sms-sync:local-parser` using
      `apps/mobile/package.json` after unit/integration tests pass and
      emulator/device is available
- [ ] T058 Run `cd apps/mobile; npm run e2e:live-sms:local-parser` using
      `apps/mobile/package.json` after unit/integration tests pass and
      emulator/device is available
- [x] T059 Review `specs/028-local-intelligent-parser/tasks.md`,
      `docs/business/business-decisions.md`, and implementation diffs for
      privacy-sensitive strings before opening the PR

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1**: Re-align docs and current draft with revised phase-1 scope.
- **US1 (Phase 2)**: Depends on Phase 1 and is the MVP.
- **US2 (Phase 3)**: Depends on US1 parser/orchestrator mode selection.
- **US3 (Phase 4)**: Depends on US1 parser structure; can be implemented in
  parallel with US2 after parser contracts stabilize.
- **US4 (Phase 5)**: Depends on catalog metadata from US1.
- **Polish (Phase 6)**: Depends on all selected user stories.

### Within Each User Story

- Write tests first and confirm they fail for the expected reason.
- Implement parser types and catalog validation before parser extraction.
- Implement pure parser before mobile orchestration.
- Integrate mobile services before E2E command updates.
- Validate each story independently before moving to the next priority.

### Risk Controls

- Keep production behavior AI-primary in phase 1.
- Make all fixture/synthetic/internet/unknown-source patterns dev/test-only.
- Do not expose parser source labels in regular UI.
- Do not persist raw SMS beyond the existing review/save boundary.
- Do not allow broad keyword-only parsing.
- Do not enable production local fallback in phase 1.
- Keep phase-2 trusted SMS collection and production fallback in GitHub issue
  #744 and a future spec update.
