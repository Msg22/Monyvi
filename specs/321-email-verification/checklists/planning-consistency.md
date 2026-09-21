# Planning Consistency Review: Complete Email Verification

**Issue**: #321  
**Branch**: `codex/issue321-email-verification`  
**Reviewed**: 2026-09-21  
**Result**: PASS — ready for implementation

## Authority and Scope

- [x] `docs/business/business-decisions.md` requires email verification before email/password sign-in succeeds.
- [x] Historical feature 016 already approved the verification behavior; #321 is completion work, not a new auth product decision.
- [x] No custom verification-token database, Edge Function, or competing auth source of truth is planned.
- [x] No PostgreSQL, WatermelonDB, RLS, sync, or financial-action schema change is planned.
- [x] `monyvi://auth-callback` remains the approved v1 callback; Universal/App Links remain out of scope.
- [x] Resend custom SMTP is the approved initial production-delivery direction.
- [x] Issue #20 overlap is documented and guarded; no active #20 implementation PR owned signup at planning start.
- [x] #240 MFA/session-management scope and password-reset UX expansion remain explicitly out of scope.

## Mockup Binding

- [x] Approved reference images exist at:
  - `mockups/verification-en-light.png`
  - `mockups/verification-en-dark.png`
  - `mockups/verification-ar-light.png`
- [x] Each approved image has a matching binding sidecar.
- [x] Mohamed explicitly approved the binding metadata on 2026-09-21.
- [x] All sidecars have `Binding metadata approval: APPROVED`.
- [x] Approved metadata revision equals current metadata revision for all three references.
- [x] Approved combined revision equals current combined revision for all three references.
- [x] Approval evidence identifies each approved combined revision.
- [x] Exact current PNG SHA-256 values match the declared approved image revisions.
- [x] Exact current Binding Facts SHA-256 values match the declared metadata revisions.
- [x] Exact current combined approval revisions match the declared combined revisions.
- [x] All required Binding Facts keys occur exactly once and have non-empty values.
- [x] No fidelity-affecting `UNKNOWN` remains.
- [x] Presentation-only phone hardware/export framing is explicitly non-binding.
- [x] Required dark/RTL/responsive/enlarged-text/accessibility completion evidence is represented in `tasks.md`.

**Environment note**: The connector environment validated the exact branch bytes
against the same digest/approval conditions used by
`scripts/verify-mockup-binding.js`. Task T002 requires the canonical Node CLI
to be rerun in the implementation command-runner environment before the first
production mutation, so implementation cannot silently consume a later-stale
binding.

## Requirements → Task Coverage

| Requirement | Covered by |
| --- | --- |
| FR-001 verified email before private access | T010, T013, T017, T036, T039 |
| FR-002 approved verification-pending state | T011-T016, T018-T020 |
| FR-003 valid link establishes auth state | T003, T006, T010, T013, T017 |
| FR-004 existing startup routing remains authority | T010, T013, T031 |
| FR-005 unverified sign-in recovery | T021, T024, T025, T026 |
| FR-006 resend verification | T004, T008, T022-T026 |
| FR-007 duplicate/in-flight resend protection | T022, T023, T025 |
| FR-008 invalid callbacks fail closed | T027-T032 |
| FR-009 EN/AR, RTL, theme, responsive, enlarged text | T014-T020 |
| FR-010 production-ready transactional sender | T036-T038 |
| FR-011 local testing without production quota | T009, T017 |
| FR-012 Supabase remains verification source of truth | T006-T009 |
| FR-013 no auth/SMTP secret exposure | T027, T029, T030, T035 |
| FR-014 Google OAuth remains functional | T005, T007, T033 |
| FR-015 password-reset behavior does not regress | T034 |
| FR-016 custom callback remains v1 redirect | T004, T008, T013, T036 |

## Success Criteria → Evidence Coverage

| Success criterion | Planned evidence |
| --- | --- |
| SC-001 no private access before verification | T010, T017, T039 |
| SC-002 local signup → email → callback → session E2E | T017 |
| SC-003 unverified sign-in enters recovery | T021-T026 |
| SC-004 invalid-link matrix fails closed without secret leakage | T027-T032, T035 |
| SC-005 Gmail/Outlook/third-provider delivery QA | T038 |
| SC-006 approved visual + responsive + accessibility evidence | T018-T020 |
| SC-007 OAuth/email auth regression remains Green | T033, T040 |

## Architecture Consistency

- [x] Auth protocol/session completion stays in `apps/mobile/services/`.
- [x] `auth-callback.tsx` remains an orchestration route, not a second auth/profile state machine.
- [x] `useAuthScreenController.ts` owns UI lifecycle/state transitions, not auth protocol parsing.
- [x] `VerificationPendingView.tsx` remains presentational.
- [x] Existing `AUTH_REDIRECT_URL` remains the single canonical callback constant.
- [x] Future issue #20 metadata can compose with signup options rather than be overwritten.
- [x] No new dependency is required for the planned implementation.
- [x] No package-boundary violation is introduced.

## TDD and Verification Consistency

- [x] Shared callback changes have Red tests before production implementation.
- [x] Signup/resend redirect changes have Red tests before implementation.
- [x] Valid callback routing has Red tests before implementation.
- [x] Unverified sign-in recovery has Red tests before implementation.
- [x] Invalid callback/security behavior has Red tests before implementation.
- [x] Visual evidence is separate from automated functional tests.
- [x] Accessibility evidence is separate from screenshot evidence.
- [x] Production SMTP/DNS/device/mailbox checks are tracked independently from CI.
- [x] Exact-head Green CI and immutable SHA are required before completion.

## Artifact Consistency

- [x] `spec.md` status is Ready for implementation.
- [x] `research.md` contains all resolved technical decisions and no unresolved clarification.
- [x] `data-model.md` correctly records no new persisted domain model.
- [x] `contracts/email-verification-contract.md` matches spec requirements and plan architecture.
- [x] `plan.md` has no remaining constitution or mockup approval gate.
- [x] `quickstart.md` matches the task execution and release QA strategy.
- [x] `tasks.md` contains 42 dependency-ordered, path-specific tasks.
- [x] All user-story tasks carry `[US#]` labels and all tasks use the required checkbox/task-ID format.
- [x] No production source code was changed during the planning phase.

## Remaining Inputs That Do Not Block Coding

- Production sending-domain/subdomain selection and DNS access are required for
  T036-T038 before release, but they do not block local/TDD implementation.
- iOS release-build availability may affect when T039 is completed; it does not
  change the implementation contract.

## Final Decision

**Planning consistency: PASS.** The feature has no unresolved product,
architecture, security, schema, or visual-fidelity decision blocking
implementation. Begin with T001-T002, then follow the TDD order in
`tasks.md`.
