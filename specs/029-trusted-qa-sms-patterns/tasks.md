# Tasks: Trusted QA SMS Pattern Intake

**Input**: Design documents from `/specs/029-trusted-qa-sms-patterns/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/`, approved `mockups/`, and `docs/business/business-decisions.md`

**Tests**: Strict TDD is required. Test tasks must be completed and confirmed to
fail for the intended reason before their corresponding implementation tasks.

**Organization**: Tasks are grouped by user story so each story can be tested as
an independent increment. The approved mockups define structure and interaction;
existing Monyvi components and theme tokens define implementation styling.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it writes different files and does not
  depend on another incomplete task.
- **[Story]**: Maps the task to a user story in `spec.md`.
- Every task includes an exact repository path.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare dependencies, commands, and synthetic-only test input
without implementing feature behavior.

- [x] T001 Add `zod` as an explicit runtime dependency of `@monyvi/logic` in
      `packages/logic/package.json` and update `package-lock.json`
- [x] T002 [P] Add ignored `.local/qa-sms-intake/` staging to `.gitignore` and
      descriptive start/open-deep-link commands for the guarded intake tool in
      `package.json` and `apps/mobile/package.json`
- [x] T003 [P] Create privacy-safe synthetic QNB-shaped intake fixtures with no
      real wording or identifiers in
      `apps/mobile/services/dev/qa-sms-intake-fixtures.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the versioned artifact boundary, privacy validator,
runtime isolation, and module boundaries required by every user story.

**CRITICAL**: No user-story implementation begins until this phase is green.

- [x] T004 [P] Write failing strict-schema tests for candidate bundles,
      segments, confidence ceilings, closed review reasons, outcomes,
      forbidden/unknown keys, and derived-shape equality in
      `packages/logic/src/parsers/qa-sms-pattern-intake/__tests__/qa-sms-artifact-schema.test.ts`
- [x] T005 [P] Write failing privacy-validator tests for seeded amounts,
      balances, cards, accounts, references, merchants, people, phones, dates,
      times, sender aliases, and diagnostic leakage in
      `packages/logic/src/parsers/qa-sms-pattern-intake/__tests__/qa-sms-privacy-validator.test.ts`
- [x] T006 [P] Write failing runtime-guard tests for Android development,
      feature flag, ordinary development, iOS, and release behavior in
      `apps/mobile/__tests__/config/qa-sms-pattern-intake-config.test.ts`
- [x] T007 [P] Write a failing architecture test proving candidate modules and
      IDs cannot enter `LOCAL_SMS_PATTERNS` or `parseSmsWithLocalParser` in
      `packages/logic/src/parsers/__tests__/qa-sms-candidate-runtime-isolation.test.ts`
- [x] T008 Run T004-T007 and record the expected pre-implementation failures in
      `specs/029-trusted-qa-sms-patterns/quickstart.md`
- [x] T009 Implement immutable candidate, segment, authorization, closed
      review-reason, confidence-ceiling, coverage, lifecycle, validation, and
      family interfaces in
      `packages/logic/src/parsers/qa-sms-pattern-intake/qa-sms-pattern-types.ts`
- [x] T010 Implement strict versioned Zod schemas and derived-shape validation
      in
      `packages/logic/src/parsers/qa-sms-pattern-intake/qa-sms-artifact-schema.ts`
- [x] T011 Implement layered fail-closed privacy validation with stable
      non-sensitive error codes in
      `packages/logic/src/parsers/qa-sms-pattern-intake/qa-sms-privacy-validator.ts`
- [x] T012 Implement the double runtime guard and typed availability result in
      `apps/mobile/config/qa-sms-pattern-intake-config.ts`
- [x] T013 Export only approved QA intake types and pure APIs from
      `packages/logic/src/parsers/qa-sms-pattern-intake/index.ts` and
      `packages/logic/src/parsers/index.ts`
- [x] T014 Run the foundational Jest suites and `@monyvi/logic` typecheck, then
      update results in `specs/029-trusted-qa-sms-patterns/quickstart.md`

**Checkpoint**: Artifact and privacy boundaries exist, candidate code is
non-executable, and runtime access fails closed.

---

## Phase 3: User Story 1 - Sanitize Selected QA Messages Locally (Priority: P1) MVP

**Goal**: Deliver the approved authorization, selection, sanitization review,
correction, and local-export flow without persisting or transmitting raw SMS.

**Independent Test**: In fixture-backed development mode, authorize a session,
select only intended synthetic messages, sanitize all sensitive values, correct
a placeholder, observe approval invalidation, revalidate, approve, and complete
or cancel local export while raw values remain absent from artifacts and logs.

### Tests for User Story 1

- [x] T015 [P] [US1] Write failing sanitizer tests for every canonical token,
      multiple values, Arabic-Indic digits, mixed language, ambiguity, unknown
      dynamic spans, correction invalidation, immutable outputs, and the
      50-message one-second benchmark in
      `packages/logic/src/parsers/qa-sms-pattern-intake/__tests__/qa-sms-candidate-sanitizer.test.ts`
- [x] T016 [P] [US1] Write failing evidence-service tests for secure-secret
      creation/reuse, initialization marker, domain separation, duplicate
      stability, secret non-export, read corruption, blocked export, and
      explicit new-domain recovery in
      `apps/mobile/__tests__/services/qa-sms-evidence-service.test.ts`
- [x] T017 [P] [US1] Write failing intake-service tests for
      authorization-before-read, 3,000-row inbox/50-selection caps, QNB/address
      queries, permission denial/blocking/revocation/recovery, explicit
      selection, verified aliases, fingerprint isolation, cancellation,
      background/reset cleanup, and safe errors in
      `apps/mobile/__tests__/services/qa-sms-pattern-intake-service.test.ts`
- [x] T018 [P] [US1] Write failing local-export tests for final revalidation,
      Android directory selection, deterministic JSON, cancellation,
      partial-write cleanup, URI suppression, and no clipboard/share/network
      calls in
      `apps/mobile/__tests__/services/qa-sms-pattern-export-service.test.ts`
- [x] T019 [P] [US1] Write failing hook tests for the five-state machine,
      selected IDs, skeleton states, correction invalidation, approval, cleanup,
      and stale async cancellation in
      `apps/mobile/__tests__/hooks/useQaSmsPatternIntake.test.ts`
- [x] T020 [P] [US1] Write failing component tests matching all approved
      primary/secondary mockup states including the operator classification
      sheet, its ten families, currency applicability rules, initial disabled
      authorization, disabled pending export, permission recovery reuse, and
      Skeleton states for inbox/sanitization/validation/export in light/dark
      mode with safe-area and sticky-action assertions in
      `apps/mobile/__tests__/components/qa-sms-pattern-intake/qa-sms-intake-flow.test.tsx`
- [x] T021 [P] [US1] Write failing route tests proving the private dev route is
      hidden without both guards and renders no raw data outside authorized
      selection/correction states in
      `apps/mobile/__tests__/app/qa-sms-pattern-intake.test.tsx`
- [x] T022 [P] [US1] Cover authorization, selection, sanitization, correction,
      revalidation, approval, coverage resolution, and export readiness through
      deterministic route/component integration tests. A dedicated Maestro
      journey is intentionally omitted for this internal development flow.
- [x] T023 [US1] Run T015-T022 and record the intended failures before
      implementation in `specs/029-trusted-qa-sms-patterns/quickstart.md`

### Implementation for User Story 1

- [x] T024 [US1] Implement ordered fixed/placeholder segment sanitization and
      constrained immutable corrections in
      `packages/logic/src/parsers/qa-sms-pattern-intake/qa-sms-candidate-sanitizer.ts`
- [x] T025 [US1] Implement secure device-local evidence secret management,
      non-sensitive initialization marker, blocked-loss recovery, explicit
      new-domain acknowledgment, and domain-separated digests in
      `apps/mobile/services/dev/qa-sms-evidence-service.ts`
- [x] T026 [US1] Implement permission-gated authorization-scoped QNB inbox
      reading, 3,000-row/50-selection caps, explicit selection, safe draft
      creation, verification, approval, revocation handling, and cleanup in
      `apps/mobile/services/dev/qa-sms-pattern-intake-service.ts`
- [x] T027 [US1] Implement revalidated Android Storage Access Framework JSON
      export with cancellation and partial-write handling in
      `apps/mobile/services/dev/qa-sms-pattern-export-service.ts`
- [x] T028 [US1] Implement the cancellable UI lifecycle facade, existing SMS
      permission/recovery delegation, secret-loss recovery, loading states, and
      five-state transitions in `apps/mobile/hooks/useQaSmsPatternIntake.ts`
- [x] T029 [P] [US1] Implement the approved authorization state with initially
      unchecked acknowledgment and disabled-until-checked action in
      `apps/mobile/components/qa-sms-pattern-intake/QaSmsAuthorization.tsx`
- [x] T030 [P] [US1] Implement the approved virtualized QNB selection state with
      the filter sheet, 50-selection cap, Skeleton rows, selected count, and
      sticky action in
      `apps/mobile/components/qa-sms-pattern-intake/QaSmsMessageList.tsx`
- [x] T031 [P] [US1] Implement the approved structured
      sanitized-review/correction state with local raw preview, constrained
      token editing, explicit non-AI operator classification sheet,
      sanitization/validation Skeletons, privacy status, and candidate
      pagination in
      `apps/mobile/components/qa-sms-pattern-intake/QaSmsSanitizedReview.tsx`
- [x] T032 [P] [US1] Implement the approved aggregate-only local-export state
      with export-preparation Skeleton and secret-loss recovery message in
      `apps/mobile/components/qa-sms-pattern-intake/QaSmsExportSummary.tsx`
- [x] T033 [US1] Compose the guarded private route with `PageHeader`, existing
      SMS permission prompt, safe areas, theme support, unmount/background
      cleanup, and documented deep-link access in
      `apps/mobile/app/(private)/qa-sms-pattern-intake.tsx` and register it in
      `apps/mobile/app/(private)/_layout.tsx`
- [x] T034 [P] [US1] Add English and Arabic dev-tool copy and register its
      namespace/schema in `apps/mobile/locales/en/qa-sms-pattern-intake.json`,
      `apps/mobile/locales/ar/qa-sms-pattern-intake.json`, and
      `apps/mobile/i18n/translation-schemas.ts`
- [x] T035 [US1] Run the complete US1 unit/component/route suites, then record
      pass results and integrated physical-device gaps in
      `specs/029-trusted-qa-sms-patterns/quickstart.md`

**Checkpoint**: The MVP safely creates and locally exports sanitized candidate
bundles; it still cannot build or execute parser families.

---

## Phase 4: User Story 2 - Build Real QNB Template Families (Priority: P1)

**Goal**: Import validated candidate bundles and group exact real structures
into review-only QNB families with explicit EGP/USD evidence.

**Independent Test**: Import synthetic sanitized artifacts, group exact
structures deterministically, share a family only for semantically identical
EGP/USD variants, split material differences, and reject duplicate evidence or
unsafe artifacts without changing active parser results.

### Tests for User Story 2

- [x] T036 [P] [US2] Write failing family-builder tests for exact signatures,
      sender aliases, placeholder order/roles, direction, outcome, currency
      sharing, material splits, deterministic output, and duplicate evidence in
      `packages/logic/src/parsers/qa-sms-pattern-intake/__tests__/qa-sms-family-builder.test.ts`
- [x] T037 [P] [US2] Write failing importer tests for ignored-staging
      enforcement, bundle schema/privacy validation, confidence/reason
      validation, new-evidence-domain acknowledgment, cross-file duplicate
      detection, safe errors, and atomic candidate updates in
      `packages/logic/src/parsers/qa-sms-pattern-intake/__tests__/qa-sms-candidate-importer.test.ts`
- [x] T038 [P] [US2] Write failing command tests for `.local/qa-sms-intake/`
      path enforcement, dry-run review, safe summaries, new-domain duplicate
      acknowledgment, and refusal to print artifact content in
      `scripts/__tests__/import-qa-sms-candidate-bundle.test.ts`
- [x] T039 [US2] Run T036-T038 and record the intended failures before
      implementation in `specs/029-trusted-qa-sms-patterns/quickstart.md`

### Implementation for User Story 2

- [x] T040 [US2] Implement exact structural signatures and immutable
      per-currency family grouping in
      `packages/logic/src/parsers/qa-sms-pattern-intake/qa-sms-family-builder.ts`
- [x] T041 [US2] Implement staging-root enforcement, revalidated atomic bundle
      import, confidence/reason validation, new-domain acknowledgment, and
      duplicate checks in
      `packages/logic/src/parsers/qa-sms-pattern-intake/qa-sms-candidate-importer.ts`
- [x] T042 [US2] Implement the staging-only safe dry-run/import command in
      `scripts/import-qa-sms-candidate-bundle.ts` and expose it as
      `qa-sms:import-candidates` in `package.json`
- [x] T043 [US2] Create the isolated candidate catalog barrel and initial
      pending coverage manifest in
      `packages/logic/src/parsers/qa-sms-pattern-candidates/index.ts` and
      `packages/logic/src/parsers/qa-sms-pattern-candidates/coverage-manifest.json`
- [x] T044 [US2] Run family/import tests plus the active-catalog isolation suite
      and record pass results in
      `specs/029-trusted-qa-sms-patterns/quickstart.md`

**Checkpoint**: Sanitized evidence can form deterministic candidate families,
but every family remains non-executable and candidate-only.

---

## Phase 5: User Story 3 - Review Positive and Negative Financial Behavior (Priority: P2)

**Goal**: Define and verify transaction/rejection expectations for every
available QNB family without broad keyword inference.

**Independent Test**: Run positive, near-match, and negative cases for each
available family and prove purchases, withdrawals, transfers, and reversals have
explicit review-only outcomes while failed, OTP, informational, promotional,
partial, conflicting, and unknown structures yield rejection/no suggestion.

### Tests for User Story 3

- [x] T045 [P] [US3] Write failing isolated-evaluator and validation-runner
      tests for positive, near-match, negative, unsupported, missing-role,
      confidence-ceiling, closed-review-reason, conflicting-direction, and
      per-currency outcomes in
      `packages/logic/src/parsers/qa-sms-pattern-intake/__tests__/qa-sms-validation-case-runner.test.ts`
- [x] T046 [P] [US3] Write failing sanitized family-matrix tests covering all
      nine QNB families and EGP/USD applicability without real SMS text in
      `packages/logic/src/parsers/qa-sms-pattern-intake/__tests__/qnb-qa-family-matrix.test.ts`
- [x] T047 [P] [US3] Extend the runtime-isolation test to prove the QA evaluator
      is absent from runtime barrels, cannot return `ParsedSmsTransaction`, and
      rejection candidates do not alter active filters or parser results in
      `packages/logic/src/parsers/__tests__/qa-sms-candidate-runtime-isolation.test.ts`
- [x] T048 [US3] Run T045-T047 and record the intended failures before
      implementation in `specs/029-trusted-qa-sms-patterns/quickstart.md`

### Implementation for User Story 3

- [x] T049 [US3] Implement the non-exported structural QA evaluator in
      `packages/logic/src/parsers/qa-sms-pattern-intake/testing/qa-sms-template-evaluator.ts`
      and safe deterministic case execution in
      `packages/logic/src/parsers/qa-sms-pattern-intake/qa-sms-validation-case-runner.ts`
- [ ] T050 [US3] Perform the authorized physical-device intake, inspect and
      stage the local bundle under `.local/qa-sms-intake/`, import only
      sanitized candidates, and record unavailable scopes under
      `packages/logic/src/parsers/qa-sms-pattern-candidates/qnb/` and
      `packages/logic/src/parsers/qa-sms-pattern-candidates/coverage-manifest.json`
- [ ] T051 [US3] Add sanitized positive, near-match, and negative validation
      records for each imported QNB candidate family under
      `packages/logic/src/parsers/qa-sms-pattern-candidates/qnb/`
- [x] T052 [US3] Run the family matrix, validation runner, privacy validator,
      and active-parser regression suites and document results in
      `specs/029-trusted-qa-sms-patterns/quickstart.md`

**Checkpoint**: Every observed or unavailable family has an explicit audited
behavior, and no candidate affects runtime parsing.

---

## Phase 6: User Story 4 - Govern Pattern Evidence and Promotion (Priority: P2)

**Goal**: Enforce candidate/review-ready lifecycle, evidence thresholds,
coverage completeness, version history, and auditable non-production review.

**Independent Test**: Attempt every valid and invalid lifecycle transition and
verify that review-ready requires three non-duplicate samples, per-currency
evidence/tests, human approval, no pending coverage, and permanent
candidate-only runtime metadata.

### Tests for User Story 4

- [x] T053 [P] [US4] Write failing governance tests for candidate/review-ready
      transitions, three-sample threshold, per-currency evidence, human review,
      test coverage, version invalidation, and forbidden production trust in
      `packages/logic/src/parsers/qa-sms-pattern-intake/__tests__/qa-sms-governance.test.ts`
- [x] T054 [P] [US4] Write failing coverage-manifest tests for all
      family/currency combinations, candidate-backed/unavailable/pending states,
      invalid references, and final pending rejection in
      `packages/logic/src/parsers/qa-sms-pattern-intake/__tests__/qa-sms-coverage-manifest.test.ts`
- [x] T055 [P] [US4] Write failing coverage-screen tests matching the approved
      rows, status editor, pending warning, visibly disabled export action,
      light/dark themes, and safe-area layout in
      `apps/mobile/__tests__/components/qa-sms-pattern-intake/QaSmsCoverageReview.test.tsx`
- [x] T056 [P] [US4] Extend hook tests for coverage derivation, unavailable
      declarations, pending export blocking, and return-to-review behavior in
      `apps/mobile/__tests__/hooks/useQaSmsPatternIntake.test.ts`
- [x] T057 [US4] Run T053-T056 and record the intended failures before
      implementation in `specs/029-trusted-qa-sms-patterns/quickstart.md`

### Implementation for User Story 4

- [x] T058 [US4] Implement immutable governance transitions, review records,
      version invalidation, and production-trust rejection in
      `packages/logic/src/parsers/qa-sms-pattern-intake/qa-sms-governance.ts`
- [x] T059 [US4] Implement coverage-manifest validation and merge behavior in
      `packages/logic/src/parsers/qa-sms-pattern-intake/qa-sms-candidate-importer.ts`
- [x] T060 [US4] Implement the approved compact coverage rows, coverage-status
      editor, pending warning, and visibly disabled derived forward-action state
      in `apps/mobile/components/qa-sms-pattern-intake/QaSmsCoverageReview.tsx`
- [x] T061 [US4] Integrate coverage review and aggregate-only export progression
      through `apps/mobile/hooks/useQaSmsPatternIntake.ts` and
      `apps/mobile/app/(private)/qa-sms-pattern-intake.tsx`
- [ ] T062 [US4] Record human review decisions and final validation coverage for
      eligible families under
      `packages/logic/src/parsers/qa-sms-pattern-candidates/qnb/`
- [x] T063 [US4] Run governance, coverage, hook, component, importer, and
      isolation suites and document results in
      `specs/029-trusted-qa-sms-patterns/quickstart.md`

**Checkpoint**: Review-ready governance is auditable, coverage is complete, and
there is still no production-trust or executable transition.

---

## Phase 7: Polish & Cross-Cutting Verification

**Purpose**: Prove privacy, visual fidelity, runtime isolation, regression
safety, and honest native/manual coverage across the complete feature.

- [x] T064 [P] Write failing tests for forbidden raw keys, canaries, staged-path
      escapes, arbitrary review reasons, confidence bounds, and
      candidate-to-runtime imports in
      `scripts/__tests__/check-qa-sms-pattern-privacy.test.ts`
- [x] T065 Implement the source/artifact privacy scan in
      `scripts/check-qa-sms-pattern-privacy.ts`, expose it through the root
      verification command in `package.json`, and wire it into `.husky/pre-push`
      and `.github/workflows/ci.yml`
- [x] T066 Run `@monyvi/logic` tests/typecheck, root privacy verification,
      mobile QA suites, ESLint, mobile TypeScript, and i18n coverage, then
      record exact commands/results in
      `specs/029-trusted-qa-sms-patterns/quickstart.md`
- [x] T067 Run existing SMS parser, batch sync, live SMS, fingerprint
      deduplication, and parser-orchestrator regression suites and record
      results in `specs/029-trusted-qa-sms-patterns/quickstart.md`
- [x] T068 Confirm the internal QA intake journey is manual-only, retain
      deterministic route/component coverage, and document why no dedicated
      Maestro flow is maintained in
      `specs/029-trusted-qa-sms-patterns/quickstart.md`
- [ ] T069 Compare all approved primary/secondary states against all five
      approved mockups under `specs/029-trusted-qa-sms-patterns/mockups/` in
      light/dark compact Android viewports and record visual QA results in
      `specs/029-trusted-qa-sms-patterns/quickstart.md`
- [ ] T070 Perform physical-device manual QA for permission
      denial/blocking/revocation/recovery, real QNB inbox
      authorization/selection, raw-state cleanup, placeholder corrections,
      secret-loss recovery, Android local staging/export, cancellation, and
      sanitized-file inspection, recording only pass/fail evidence in
      `specs/029-trusted-qa-sms-patterns/quickstart.md`
- [x] T071 Run a final spec/plan/tasks/business-decision consistency audit and
      update any implementation-aligned wording in
      `specs/029-trusted-qa-sms-patterns/` and
      `docs/business/business-decisions.md`
- [x] T072 Run final code-logic, TypeScript, security/privacy, QA-coverage, and
      visual-review audits against `specs/029-trusted-qa-sms-patterns/spec.md`
      and resolve every valid in-scope finding before PR handoff
- [x] T073 Add the complete manual-to-automated coverage matrix and remaining
      native manual-only rationale to
      `specs/029-trusted-qa-sms-patterns/quickstart.md` for use in the PR
      description
- [x] T074 Write failing service tests proving all verified QNB sender aliases
      are queried, merged, deduplicated, sorted newest first, and globally
      capped without a broad inbox query
- [x] T075 Write failing shared-header and selection-state component tests for
      the Android top inset, provider-neutral copy, verified-provider label,
      retryable empty state, and disabled zero-selection action
- [x] T076 Implement the verified QNB provider configuration, alias-bounded
      inbox loading, retry hook callback, approved empty state, and shared
      review-header safe-area fix
- [x] T077 Run focused unit/component/hook tests plus lint, TypeScript, i18n,
      privacy, and affected SMS regression checks, then record physical-device
      verification status in `quickstart.md`
- [x] T078 Write failing component and hook tests for the approved selection
      amendment, stable loading footer, full verified-provider label, filtered
      newest-50 selection, backdrop dismissal, actionable validation findings,
      candidate discard, internal wizard back, and disabled pagination styling
- [x] T079 Implement the approved selection/loading amendment and shared Phase
      2A safe-area footer/bottom-sheet primitives without changing runtime SMS
      parsing or fingerprint behavior
- [x] T080 Implement privacy-safe validation details, candidate discard, and
      previous-step header navigation while preserving raw-state boundaries
- [x] T081 Run focused component/hook/service suites, lint, TypeScript, i18n,
      privacy checks, and the affected SMS regression suites; then perform a
      final spec and mockup drift review
- [x] T082 Write failing logic, service, component, and route tests proving
      sequential non-overlapping placeholder corrections accumulate, the
      correction header respects the Android top inset, and candidate actions
      respect the fallback-aware Android bottom inset
- [x] T083 Implement immutable cumulative correction history with same-range
      replacement and overlap rejection, without retaining raw correction
      values, and apply the scoped Phase 2A top/bottom safe-area fixes
- [x] T084 Run the retained logic, service, hook, route, and component coverage
      plus lint, TypeScript, i18n, privacy, and formatting checks after removing
      the dedicated internal-flow Maestro journey
- [x] T085 Write failing Settings component tests proving the approved QA SMS
      pattern intake row renders and navigates only when runtime availability
      permits it
- [x] T086 Implement the approved development-tools Settings entry using the
      intake route's existing fail-closed availability guard, Monyvi theme
      tokens, and localized copy
- [x] T087 Run focused Settings/config regression tests plus TypeScript, lint,
      i18n, formatting, and mockup-drift verification for the new access path
- [x] T088 Write failing sanitizer and lifecycle tests for reviewed IPN partial
      date, meridiem time, punctuated reference, account-suffix sanitization,
      amount-only transfer requirements, and role-specific validation findings
- [x] T089 Write failing service, hook, and component tests for atomic batch
      placeholder staging, live pending removal, one-action application, and
      specific missing-role guidance
- [x] T090 Implement the approved batch-placeholder editor amendment and the
      provider-scoped IPN sanitizer/validation corrections without adding
      runtime account-suffix persistence or matching
- [x] T091 Address the valid new PR review findings for raw-state cleanup,
      permission recheck, evidence-domain authorization reset, family direction
      validation, and catalog-file filtering
- [x] T092 Run the focused logic/mobile/import suites, TypeScript, lint, i18n,
      privacy checks, formatting, and final spec/mockup drift review
- [x] T093 Add failing synthetic sanitizer/privacy tests for the
      QA-operator-confirmed QNB at-sign merchant and compact available-balance
      structure, then implement the bounded replacement rules without committing
      raw reviewed message values
- [x] T094 Record the approved multi-role placeholder meaning-selector mockup
      and add failing component coverage for explicit `ACCOUNT`, `REFERENCE`,
      and `PHONE` semantic-role correction
- [x] T095 Address the valid follow-up review findings for complete dates,
      mixed-case counterparties, reversible pending coverage, dynamic imports,
      punctuated references, UUID candidate IDs, timestamp-independent evidence
      identity, compact currency filtering, and multi-role correction semantics
- [x] T096 Record the approved message-search mockup and write failing component
      tests for sender/body matching, filter composition, clearing, hidden
      selection preservation, and the no-match state
- [x] T097 Implement the compact local message search with localized light/dark
      UI, an accessible clear action, stable sticky-footer behavior, and no raw
      message persistence or logging
- [x] T098 Run focused intake regressions plus TypeScript, lint, i18n, privacy,
      formatting, and final spec/mockup drift verification for message search
- [x] T099 [P] Write failing sanitizer, schema, lifecycle, and
      placeholder-editor tests proving ATM descriptors use
      `ATM_TERMINAL/atm_terminal`, purchase merchants remain unchanged, and
      family classification stays explicit
- [x] T100 Record and obtain approval for the scoped ATM-terminal placeholder
      editor mockup under `specs/029-trusted-qa-sms-patterns/mockups/`
- [x] T101 Implement the approved ATM-terminal placeholder semantics across the
      pure artifact model, sanitizer, correction UI, translations, and contracts
      without changing active parser behavior
- [x] T102 [P] Write failing host-ingestion command tests for external-path
      validation, safe staging, dry-run-before-write, atomic catalog/manifest
      updates, duplicate-review refusal, verification failure, and safe output
- [x] T103 Implement `scripts/ingest-qa-sms-candidate-bundle.ts`, expose
      `qa-sms:ingest`, and reuse the existing importer/privacy APIs rather than
      duplicating validation logic
- [x] T104 Run focused logic/mobile/CLI tests, TypeScript, lint, i18n, privacy,
      formatting, and active-parser isolation checks; then update quickstart and
      the PR coverage matrix
- [x] T105 Record and obtain approval for the scoped tap-range placeholder
      selection mockup under `specs/029-trusted-qa-sms-patterns/mockups/`
- [x] T106 Write failing component tests for joined alpha-numeric parts,
      contiguous two-tap ranges, clear behavior, fresh-range restart, and the
      existing atomic pending-correction flow
- [x] T107 Replace Android native text selection with the approved local
      tap-range selector while preserving exact correction offsets, dark/light
      theme compatibility, and the no-clipboard privacy boundary
- [x] T108 Write failing tests for the 3,000-message inbox cap, pending-only
      bulk coverage update, export success feedback, Arabic/mixed-language
      sanitization, public promotion variables, and bank-to-wallet transfer
      classification
- [x] T109 Record the approved bulk pending-coverage mockup and update the spec,
      plan, data model, business decisions, and operator quickstart
- [x] T110 Implement EGP `bank_to_wallet_transfer` as a distinct review-only
      transfer outcome and add narrowly scoped public-variable semantic roles
- [x] T111 Implement the pending-only coverage action, localized export success
      toast, and the 3,000-message service cap without changing production SMS
      parsing
- [x] T112 Address the valid PR findings for strict candidate UUID exemptions,
      validation-case setup failures, and unexpected candidate-catalog files
- [x] T113 Address the valid follow-up findings for opaque correction markers,
      family-specific currency validation, immutable candidate-backed coverage,
      and removal of malformed or misclassified imported evidence

**PR handoff note**: T068 records the approved decision to keep this internal
operator journey out of Maestro. T069 and T070 remain unchecked pending the
approved-mockup visual comparison and physical-device manual QA. T050, T051, and
T062 require the authorized real QNB dataset and human review; no synthetic
fixture may be represented as completing those tasks.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Starts immediately.
- **Foundational (Phase 2)**: Depends on setup and blocks all stories.
- **US1 (Phase 3)**: Depends on foundational; this is the MVP and creates safe
  candidate bundles.
- **US2 (Phase 4)**: Depends on foundational and consumes the US1 artifact
  contract; synthetic artifacts can test it before physical-device intake.
- **US3 (Phase 5)**: Depends on US2 family/import support and US1
  physical-device tooling for real sanitized evidence.
- **US4 (Phase 6)**: Depends on US2 families and US3 validation records.
- **Polish (Phase 7)**: Depends on all selected stories.

### User Story Dependencies

```text
Foundational -> US1 -> US2 -> US3 -> US4 -> Polish
                    \-> synthetic US2 tests may begin after Foundational
```

- **US1** is independently demonstrable with synthetic fixtures and local
  export.
- **US2** is independently testable with validated synthetic artifacts and does
  not require executable parser changes.
- **US3** is independently testable as a validation matrix over sanitized
  candidate families.
- **US4** is independently testable as lifecycle/coverage governance over
  prepared candidate families.

### Within Each Story

1. Write tests.
2. Run them and confirm they fail for the intended missing behavior.
3. Implement the minimum behavior.
4. Run focused tests until green.
5. Run adjacent regression tests before the story checkpoint.

## Parallel Opportunities

- T002 and T003 can run in parallel after T001 begins.
- T004-T007 are independent failing-test slices.
- T015-T022 can be authored in parallel before US1 implementation.
- T029-T032 are separate approved-state components after T028 defines shaped
  state/callbacks.
- T036-T038 can be authored in parallel.
- T045-T047 can be authored in parallel.
- T053-T056 can be authored in parallel.
- T064 must fail before T065 implements and wires the privacy scan.

## Parallel Examples

### User Story 1

```text
T015 sanitizer tests
T016 evidence digest tests
T017 intake service tests
T018 export service tests
T019 hook tests
T020 component tests
T021 route guard tests
T022 route/component integration journey coverage
```

### User Story 2

```text
T036 exact family grouping tests
T037 candidate importer tests
T038 safe command tests
```

### User Story 4

```text
T053 governance lifecycle tests
T054 coverage manifest tests
T055 approved coverage UI tests
T056 coverage hook tests
```

## Implementation Strategy

### MVP First

1. Complete Setup and Foundational phases.
2. Complete US1 through its deterministic route/component checkpoint.
3. Stop and verify the authorized local sanitization/export path independently.
4. Do not collect real QA messages until privacy tests and raw-state cleanup are
   green.

### Incremental Delivery

1. **US1**: Safe local intake and export.
2. **US2**: Exact candidate family building and isolated import.
3. **US3**: Real sanitized evidence plus positive/negative behavior matrix.
4. **US4**: Review-ready governance and complete coverage manifest.
5. **Polish**: Full regression, visual, privacy, and physical-device QA.

## Notes

- Never paste or commit raw QNB messages while executing any task.
- Mockup structure is approved; Monyvi theme tokens and existing components are
  authoritative for styling.
- Counts/dates shown in mockups are illustrative.
- Candidate files must remain physically excluded from active parser imports.
- Real inbox and Android document-picker verification are manual-only; all
  deterministic branches must still be automated.
- Commit after each coherent green slice, not after a failing-test-only state.
