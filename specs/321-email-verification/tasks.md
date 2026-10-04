# Tasks: Complete Email Verification

**Revision**: Code-first plan approved 2026-10-04  
**Branch**: `codex/issue321-email-verification`  
**Implementation status**: IN PROGRESS — all revised mockups approved; binding refresh/final evidence still pending

## Historical work retained

The earlier #321 implementation produced valid foundations that remain in PR
#322:

- [x] H001 Shared callback/session completion
- [x] H002 Canonical callback validation and secret-safe failures
- [x] H003 Signup/resend redirect contract
- [x] H004 Local confirmation enabled
- [x] H005 Returning `email_not_confirmed` recovery
- [x] H006 OAuth/password-reset regression coverage
- [x] H007 Invalid callback hardening
- [x] H008 Local email verification E2E infrastructure
- [x] H009 Hosted custom SMTP configuration tooling/runbook
- [x] H010 User reported hosted custom SMTP configured and a real signup email received
- [x] H011 User installed the Monyvi Confirm Signup subject/template in hosted Supabase

The old link-first verification screen/E2E assumptions are superseded by the
tasks below. Do not mark old visual/link-first completion as final #321
evidence.

---

## Phase R0 — Mockup approval gate

- [x] R001 Approve revised English-light verification code screen
- [x] R002 Approve English-dark verification code screen
- [x] R003 Approve Arabic-light verification code screen
- [x] R004 Approve Arabic-dark verification code screen
- [x] R005 Approve English-light Email verified screen
- [x] R006 Approve English-dark Email verified screen
- [x] R007 Approve Arabic-light Email verified screen
- [x] R008 Approve Arabic-dark Email verified screen
- [ ] R009 Persist approved image bytes and update/create binding sidecars
- [ ] R010 Obtain required binding-metadata approval and run canonical binding verifier

**Approval gate**: R002-R008 passed by explicit user approval. R009-R010 remain required before final visual-completion sign-off, but implementation is authorized.

---

## Phase R1 — Supabase OTP configuration and service contract

### Red tests

- [ ] R011 Add Red Supabase service tests for six-digit `verifyOtp({ email, token, type: "email" })`
- [ ] R012 Add Red tests for stable wrong/expired-code classification and secret-safe errors
- [ ] R013 Add Red config tests/guards for local OTP length 6 and expiry 600

### Green

- [ ] R014 Add focused `verifyEmailVerificationCode` service wrapper
- [ ] R015 Set local `otp_expiry = 600` and align minimum resend frequency with two minutes
- [ ] R016 Verify hosted Email OTP expiration is 600 seconds without exposing credentials
- [ ] R017 Verify installed hosted Confirm Signup template text says **10 minutes** (template itself already installed)

---

## Phase R2 — Verification code UI and controller state machine

### Red tests

- [ ] R018 Add controller Red tests for signup -> `verificationCode`
- [ ] R019 Add Red OTP input tests for numeric normalization, paste, max six digits, and accessibility
- [ ] R020 Add Red exactly-once auto-submit tests when length becomes six
- [ ] R021 Add Red duplicate-submit protection while verify request is pending
- [ ] R022 Add Red wrong/expired-code recovery tests
- [ ] R023 Add Red tests proving AuthContext authenticated events cannot skip verification success
- [ ] R024 Add Red returning-unverified sign-in -> code screen tests
- [ ] R025 Add Red unknown-last-send timestamp fallback-copy tests

### Green

- [ ] R026 Expand auth screen state with `verificationCode` and `verificationSuccess`
- [ ] R027 Implement one logical OTP input rendered as six visual cells with paste/autofill semantics
- [ ] R028 Implement exactly-once auto-submit at six digits
- [ ] R029 Implement code verification controller path and localized error mapping
- [ ] R030 Implement verification-flow authenticated-navigation suppression before calling `verifyOtp`
- [ ] R031 Add known-send 10-minute countdown and unknown-timestamp fallback copy
- [ ] R032 Update EN/AR localization for code, expiry, wrong/expired code, cooldown, limit, and success states

---

## Phase R3 — Server-enforced resend limiter

### Migration / pgTAP Red

- [ ] R033 Add Red pgTAP for limiter table privacy/direct-access denial
- [ ] R034 Add Red tests for initial-send registration
- [ ] R035 Add Red tests for 120-second cooldown
- [ ] R036 Add Red tests for exactly three successful resends and fourth denial
- [ ] R037 Add Red 24-hour reset test
- [ ] R038 Add Red concurrent-reservation test
- [ ] R039 Add Red finalize-idempotency/release-without-increment tests
- [ ] R040 Add Red stale-reservation recovery test

### Green migration

- [ ] R041 Add `email_verification_resend_limits` table with HMAC email key and no raw email
- [ ] R042 Add service-role-only register/reserve/finalize/release SQL routines
- [ ] R043 Revoke direct anon/authenticated table/function access

### Edge Function tests

- [ ] R044 Add Red tests for normalization + HMAC with server-only pepper
- [ ] R045 Add Red reserve -> resend -> finalize behavior
- [ ] R046 Add Red downstream-send failure -> release behavior
- [ ] R047 Add Red safe cooldown/limit response tests without account-enumeration detail
- [ ] R048 Add Red no-raw-email/no-secret logging tests

### Green Edge Function/client

- [ ] R049 Implement original-send registration operation
- [ ] R050 Implement resend operation using atomic reservation
- [ ] R051 Add client wrapper and product-safe result classification
- [ ] R052 Call original-send registration after successful signup; conservative fallback if registration fails
- [ ] R053 Apply 2-minute button cooldown after original and each successful resend
- [ ] R054 Keep resend disabled while request is in flight; do not display remaining resend count
- [ ] R055 Returning unverified sign-in does not automatically resend

---

## Phase R4 — Email verified success screen and callback fix

### Red tests

- [ ] R056 Add component tests for approved Email verified composition
- [ ] R057 Add controller tests for successful code verification -> success state
- [ ] R058 Add Continue-to-dashboard explicit handoff tests
- [ ] R059 Add callback tests reproducing "verification succeeded but AuthContext stayed stale/loading"
- [ ] R060 Add callback bounded-timeout tests
- [ ] R061 Add callback signup-success -> Email verified tests
- [ ] R062 Preserve OAuth/password-recovery route regression tests

### Green

- [ ] R063 Implement Email verified presentational view
- [ ] R064 Wire Continue to root/startup flow
- [ ] R065 Change signup-confirmation callback success to validate session directly and render success state
- [ ] R066 Add bounded callback processing timeout/recovery so skeleton cannot be infinite
- [ ] R067 Preserve OAuth and password-recovery destinations

---

## Phase R5 — E2E, visual, accessibility, production QA

- [ ] R068 Update local Mailpit E2E to extract six-digit code instead of relying on signup magic link
- [ ] R069 E2E signup -> code paste/type -> auto-submit -> success -> Continue
- [ ] R070 E2E returning unverified sign-in path
- [ ] R071 Automated deterministic limiter tests cover cooldown/count/window/concurrency; do not make device E2E sleep through all policy windows
- [ ] R072 Manual device QA real 2-minute cooldown and fourth-resend denial
- [ ] R073 Manual Android callback legacy-link regression: cold + warm start, no skeleton hang
- [ ] R074 iOS device QA when build available
- [ ] R075 Capture EN/AR light/dark visual evidence against approved bindings
- [ ] R076 Verify compact/enlarged-text/RTL accessibility evidence
- [ ] R077 Verify Gmail delivery
- [ ] R078 Verify Outlook/Hotmail delivery
- [ ] R079 Verify one additional mailbox provider
- [ ] R080 Inspect SMTP/provider bounce/suppression/domain-authentication health

---

## Phase R6 — Final gates

- [ ] R081 Security audit: no OTP, raw limiter email, HMAC pepper, auth token, callback secret, SMTP/service-role logging
- [ ] R082 Final mockup-binding verifier exact-head PASS
- [ ] R083 Focused auth/Edge/pgTAP tests Green
- [ ] R084 Mobile TypeScript/lint/i18n/repository checks Green
- [ ] R085 Exact-head GitHub Actions Green
- [ ] R086 Refresh PR #322 description with code-first architecture, QA matrix, known external evidence
- [ ] R087 Record functional, visual, accessibility, SMTP/delivery, device, and immutable Green SHA statuses separately

## Completion status

- **Product plan**: APPROVED 2026-10-04
- **English-light code-entry visual**: APPROVED
- **Remaining visual approval**: COMPLETE — user approved the revised code-entry and Email verified EN/AR light/dark set
- **Confirm Signup template installation**: COMPLETE by user
- **Template 10-minute copy verification**: PENDING
- **Custom SMTP configured / real signup email received**: COMPLETE by user report
- **Revised implementation**: IN PROGRESS
