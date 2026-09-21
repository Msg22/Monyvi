# Tasks: Complete Email Verification

**Input**: Design documents from `/specs/321-email-verification/`  
**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`,
`contracts/email-verification-contract.md`, approved mockup bindings

**Tests**: Required. #321 follows strict TDD for production-code changes.

**Organization**: Tasks are grouped by user story. Shared auth-callback and
configuration work that blocks more than one story is foundational.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Safe to run in parallel because it touches independent files and has
  no dependency on an incomplete task.
- **[Story]**: User story from `spec.md`.
- Every implementation task names the exact repository path.

---

## Phase 1: Planning/Setup Gate

**Purpose**: Reconfirm immutable planning authority immediately before coding.

- [x] T001 Re-fetch issue #321, current branch head, issue #20/active auth PR overlap, and approved mockup-binding state before the first production mutation; record any conflict/blocker in `specs/321-email-verification/tasks.md` — PASS at `77e2982f936f85d5bdb5cda14e3f7753a309442f`: main unchanged at `aa32edf748da89e8b16d584e3e78f61c5313d191`, issue #20 open with no active implementation PR, no overlapping open auth/signup PR, approved bindings unchanged
- [x] T002 Verify `specs/321-email-verification/mockups/verification-en-light.binding.md`, `verification-en-dark.binding.md`, and `verification-ar-light.binding.md` with `scripts/verify-mockup-binding.js` and record the exact verifier result/head in `specs/321-email-verification/tasks.md` — PASS at `77e2982f936f85d5bdb5cda14e3f7753a309442f`: exact branch image/metadata/combined SHA-256 values and approval fields satisfy the canonical verifier logic for all three sidecars; the GitHub-only execution environment has no repository command runner, so the Node CLI is re-required by T041 in the implementation runner before completion

**Checkpoint**: Implementation may start only when T001-T002 remain Green.

---

## Phase 2: Foundational Auth Callback + Redirect Contract

**Purpose**: Establish one secure callback/session primitive and the canonical
verification redirect used by signup/resend.

### Tests first

- [x] T003 [P] Add Red coverage for callback completion from valid access/refresh-token fragments and PKCE authorization codes in `apps/mobile/__tests__/services/auth-service.test.ts`
- [x] T004 [P] Add Red coverage that email signup and signup-verification resend both pass `AUTH_REDIRECT_URL` through `emailRedirectTo` in `apps/mobile/__tests__/services/supabase.test.ts`
- [x] T005 [P] Add Red regression coverage that the existing Google OAuth callback path still supports the same token/code session-establishment shapes in `apps/mobile/__tests__/services/auth-service.test.ts`

### Implementation

- [x] T006 Implement a single reusable callback/session-completion primitive, including stable typed result classification and secret-safe failures, in `apps/mobile/services/auth-service.ts`
- [x] T007 Refactor the existing Google OAuth completion path to delegate to the shared callback/session primitive without duplicating token parsing in `apps/mobile/services/auth-service.ts`
- [x] T008 Add `options.emailRedirectTo = AUTH_REDIRECT_URL` to email signup and verification resend without overwriting any future signup metadata options in `apps/mobile/services/supabase.ts`
- [x] T009 Enable local email confirmation parity by setting `[auth.email].enable_confirmations = true` and preserving local email capture in `supabase/config.toml`

**Checkpoint**: PASS at exact head `83bdea3941b50a5ee5a0ece9dea01bb57e971d49` — shared callback tests, signup/resend redirect tests, OAuth regression coverage, typecheck, lint, i18n, mobile tests, repository checks, and Android build are Green.

---

## Phase 3: User Story 1 - New User Verifies Email Before App Access (Priority: P1) 🎯 MVP

**Goal**: Fresh email/password registration enters the approved verification
state, a valid email callback establishes the session, and private routing
remains unavailable until that succeeds.

**Independent Test**: Fresh signup → verification pending → local captured email
→ callback open → session establishment → existing authenticated startup flow.

### Tests first

- [x] T010 [P] [US1] Add Red route tests proving a valid verification callback must complete the auth session before authenticated routing for cold-start and warm-start semantics in `apps/mobile/__tests__/app/auth-redirect.test.tsx`
- [x] T011 [P] [US1] Add Red component tests for the approved full-page/no-card verification hierarchy, separate LTR email chip, resend/back actions, and privacy/legal content in `apps/mobile/__tests__/components/auth/AuthStatusViews.test.tsx`
- [x] T012 [P] [US1] Add Red controller coverage that successful signup requiring verification retains the normalized pending email and exposes the verification-pending screen without granting authenticated state in `apps/mobile/__tests__/hooks/useAuthScreenController.test.ts`

### Implementation

- [x] T013 [US1] Update `apps/mobile/app/auth-callback.tsx` to consume the incoming native auth URL, invoke shared session completion, wait for resolved auth state, and hand off to existing root/startup routing only after success
- [x] T014 [US1] Update `apps/mobile/components/auth/VerificationPendingView.tsx` to match the approved binding: full-page/no-card content, 92px mail treatment, centered copy, separate LTR email chip, outlined resend action, separate bottom back action, and footer-compatible structure
- [x] T015 [US1] Wire verification-state Privacy/Terms navigation and any layout ownership needed for the approved footer through `apps/mobile/app/auth.tsx` without duplicating auth/business logic
- [x] T016 [US1] Preserve/adjust localized verification copy only as required for the approved structure in `apps/mobile/locales/en/auth.json` and `apps/mobile/locales/ar/auth.json`

### End-to-end and evidence

- [ ] T017 [US1] Add a deterministic local verification E2E journey covering fresh signup, pending state, captured confirmation email/link, callback opening, and authenticated routing in `apps/mobile/e2e/maestro/auth/email-verification.yaml` plus only the focused local test helper/config files required to retrieve the local auth email
- [ ] T018 [US1] Capture rendered baseline side-by-side/overlay evidence against `specs/321-email-verification/mockups/verification-en-light.png` at the declared ordinary-phone context and record evidence reference plus **functional status** and **visual-fidelity status** separately in `specs/321-email-verification/tasks.md`
- [ ] T019 [US1] Capture rendered scoped-variant evidence for English dark, Arabic RTL light/dark, compact phone, tablet/landscape where supported, and enlarged text; compare against approved bindings and record evidence/status in `specs/321-email-verification/tasks.md`
- [ ] T020 [US1] Verify accessibility tree/screen-reader or appropriate automated evidence for verification heading, email presentation, resend button disabled/busy state, back action, language control, Privacy, and Terms; record separate accessibility status/reference in `specs/321-email-verification/tasks.md`

**Checkpoint**: Functional implementation/tests T010-T016 PASS at exact head `3c310feae93c1f0e75b578f722e61891337afd6d`; T017-T020 remain required before US1 visual/E2E completion.

---

## Phase 4: User Story 2 - Unverified Returning User Can Recover (Priority: P1)

**Goal**: A valid but unverified account returns to the same pending state and
can resend verification instead of seeing raw provider wording.

**Independent Test**: Valid unverified credentials → verification pending with
the submitted email → resend → new captured verification email.

### Tests first

- [x] T021 [P] [US2] Add Red service/controller coverage that stable Supabase `email_not_confirmed` is preserved/classified without relying on provider message text in `apps/mobile/__tests__/services/supabase.test.ts` and `apps/mobile/__tests__/hooks/useAuthScreenController.test.ts`
- [x] T022 [P] [US2] Add Red coverage for resend success, resend failure, duplicate in-flight protection, pending-email retention, and back-to-sign-in recovery in `apps/mobile/__tests__/hooks/useAuthScreenController.test.ts`
- [x] T023 [P] [US2] Extend component tests for the resending label plus disabled/busy accessibility state without changing the approved resting composition in `apps/mobile/__tests__/components/auth/AuthStatusViews.test.tsx`

### Implementation

- [x] T024 [US2] Expose the stable unverified-email auth classification needed by the controller without leaking raw provider copy in `apps/mobile/services/supabase.ts`
- [x] T025 [US2] Route `email_not_confirmed` sign-in into `verificationPending`, retain the submitted normalized email, preserve resend/back behavior, and keep ordinary invalid credentials inline in `apps/mobile/hooks/useAuthScreenController.ts`
- [ ] T026 [US2] Add/extend the local E2E recovery path for returning unverified sign-in and resend in `apps/mobile/e2e/maestro/auth/email-verification.yaml`

**Checkpoint**: Functional US2 T021-T025 PASS at exact head `f711d0e27e748f2bc15fcef196fdd62e7766b940` — typecheck, lint, repository checks, full mobile Jest, pgTAP, and Android build are Green; T026 local E2E remains pending.

---

## Phase 5: User Story 3 - Invalid Verification Link Fails Safely (Priority: P2)

**Goal**: Expired, malformed, reused, missing-material, and provider-error
callbacks fail closed and return to auth recovery without exposing secrets.

**Independent Test**: Exercise the invalid-link matrix and confirm no private
runtime mounts, no token appears in UI/log output, and recovery remains possible.

### Tests first

- [x] T027 [P] [US3] Add Red callback-service cases for provider-declared error parameters, malformed URLs, missing auth material, failed token session establishment, and failed PKCE exchange in `apps/mobile/__tests__/services/auth-service.test.ts`
- [x] T028 [P] [US3] Add Red route tests proving failed callbacks never navigate into private/authenticated routing and provide a safe recovery path in `apps/mobile/__tests__/app/auth-redirect.test.tsx`
- [x] T029 [P] [US3] Add a regression assertion that surfaced callback failures/logging never contain raw access token, refresh token, verification token, or complete credential-bearing callback URL in `apps/mobile/__tests__/services/auth-service.test.ts`

### Implementation

- [x] T030 [US3] Complete fail-closed callback error classification/sanitization in `apps/mobile/services/auth-service.ts` while preserving only stable user-safe error information
- [x] T031 [US3] Implement safe invalid/expired callback recovery behavior in `apps/mobile/app/auth-callback.tsx` without introducing a second auth-state or onboarding-routing authority
- [ ] T032 [US3] Add deterministic local/manual invalid-link coverage for malformed, expired, and reused confirmation links to `apps/mobile/e2e/maestro/auth/email-verification.yaml` where automation is reliable, and record manual-only cases in `specs/321-email-verification/quickstart.md`

**Checkpoint**: Functional US3 T027-T031 PASS at exact head `6e828813a64825bbfbed29f11e14b92c2f679d1d` — non-canonical token callbacks are rejected before session mutation; provider-declared failures recover to auth; callback secrets are not surfaced; full mobile Jest, typecheck/lint, Android build, and pgTAP are Green. T032 E2E/manual invalid-link evidence remains pending.

---

## Phase 6: Cross-Cutting Regression, Production Configuration, and Release Evidence

**Purpose**: Prove #321 does not regress other auth flows and complete external
release configuration without putting secrets in Git.

- [ ] T033 [P] Run and, only if needed, extend Google OAuth regression coverage in `apps/mobile/__tests__/services/auth-service.test.ts` and `apps/mobile/__tests__/app/auth-redirect.test.tsx`
- [ ] T034 [P] Run and, only if needed, extend password-reset regression coverage in the existing auth tests under `apps/mobile/__tests__/`; do not expand the separate password-reset UX scope
- [ ] T035 Audit #321-touched auth code for raw token/callback/SMTP logging and repository/mobile-bundle secret exposure; record the security audit result in `specs/321-email-verification/tasks.md`
- [ ] T036 Configure the hosted Monyvi Supabase project with approved Resend custom SMTP, Confirm email enabled, and the exact `monyvi://auth-callback` redirect allow-list; record non-secret configuration evidence/status in `specs/321-email-verification/quickstart.md`
- [ ] T037 Verify Resend sending-domain DNS/authentication and delivery/bounce/suppression behavior without committing credentials; record non-secret evidence in `specs/321-email-verification/quickstart.md`
- [ ] T038 Perform real verification-email delivery QA to Gmail, Outlook/Hotmail, and one additional common mailbox provider and record delivery/spam observations in `specs/321-email-verification/quickstart.md`
- [ ] T039 Perform release-build device QA for valid-link cold start, valid-link warm start, resend, expired/reused link, offline callback, English/Arabic, and light/dark on Android and iOS when available; record device/build evidence in `specs/321-email-verification/quickstart.md`
- [ ] T040 Run focused auth Jest suites, mobile TypeScript/lint gates, all repository-required verification, then obtain exact-head Green GitHub Actions for the implementation branch; record immutable Green SHA in `specs/321-email-verification/tasks.md`
- [ ] T041 Perform final exact-head mockup-binding re-verification for all three sidecars and confirm current approved image/metadata/combined revisions remain unchanged in `specs/321-email-verification/tasks.md`
- [ ] T042 Update implementation completion evidence and mark each task accurately in `specs/321-email-verification/tasks.md`, keeping **functional readiness**, **visual fidelity**, **accessibility evidence**, and **external production configuration** as separate statuses

---

## Dependencies & Execution Order

### Phase dependencies

1. **Phase 1** blocks every production mutation.
2. **Phase 2** is foundational and blocks US1-US3 because signup, resend, OAuth,
   and email verification must share one callback contract.
3. **US1** can begin after Phase 2 and delivers the core MVP.
4. **US2** can begin after Phase 2; it reuses the same pending UI and redirect
   contract.
5. **US3** can begin after the shared callback primitive exists; it may proceed
   in parallel with US2 if file ownership is coordinated.
6. **Phase 6** follows the desired user stories and blocks release readiness.

### User-story dependencies

- **US1 (P1)**: depends only on Phase 2.
- **US2 (P1)**: depends on Phase 2; does not require US1 route implementation,
  but shares `useAuthScreenController.ts` and verification UI.
- **US3 (P2)**: depends on the Phase 2 callback primitive and shares
  `auth-service.ts`/`auth-callback.tsx` with US1.
- Because several stories touch the same auth files, prefer one sequential owner
  even where test-writing tasks are independently parallelizable.

### TDD order

For every production behavior change:

1. Write the focused Red test.
2. Run it and confirm it fails for the intended missing behavior.
3. Implement the smallest Green change.
4. Refactor only while Green.
5. Run affected regressions before proceeding.

Mockup evidence and accessibility evidence are separate completion gates and are
not substitutes for automated tests.

---

## Parallel Opportunities

- T003-T005 can be authored in parallel before shared callback implementation.
- T010-T012 can be authored in parallel after Phase 2.
- T021-T023 can be authored in parallel.
- T027-T029 can be authored in parallel.
- T033-T034 can run in parallel after feature implementation.
- External production preparation (T036-T038) can proceed in parallel with late
  code QA once the sending domain is available, but release readiness still
  requires the final code/device checks.

---

## Implementation Strategy

### MVP first

1. Complete T001-T009.
2. Complete US1 T010-T020.
3. Validate fresh signup → confirmation → authenticated startup end-to-end.
4. Then add US2 recovery and US3 invalid-link hardening.

### Scope controls

- No custom verification-token table or Edge Function.
- No database/WatermelonDB migration.
- No Universal/App Link migration.
- No new auth method.
- No MFA/session-management work from #240.
- No password-reset UX expansion.
- No signup profile-name work from #20; if #20 becomes active, compose
  `signUp` options safely.

## Completion Evidence

Populate during implementation:

- **Functional status**: PENDING
- **Visual fidelity status**: PENDING
- **Accessibility evidence status**: PENDING
- **External production configuration status**: PENDING
- **Exact-head Green SHA**: PENDING
- **Mockup binding verifier result at completion**: PENDING
