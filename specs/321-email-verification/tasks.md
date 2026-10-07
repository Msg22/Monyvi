# Tasks: Complete Email Verification

**Revision**: Code-first plan approved 2026-10-04  
**Branch**: `codex/issue321-email-verification`  
**Implementation status**: IN PROGRESS — all revised mockups approved; binding
refresh/final evidence still pending

## Historical work retained

The earlier #321 implementation produced valid foundations that remain in PR
#322:

- [x] H001 Shared callback/session completion
- [x] H002 Canonical callback validation and secret-safe failures
- [x] H003 Signup/resend redirect contract
- [x] H004 Local confirmation enabled
- [x] H005 Returning `email_not_confirmed` recovery
- [x] H006 Historical OAuth/password-reset callback coverage (password-recovery
      correctness is not a current #322 completion claim; see #373)
- [x] H007 Invalid callback hardening
- [x] H008 Local email verification E2E infrastructure
- [x] H009 Hosted custom SMTP configuration tooling/runbook
- [x] H010 User reported hosted custom SMTP configured and a real signup email
      received
- [x] H011 User installed the Monyvi Confirm Signup subject/template in hosted
      Supabase

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
- [x] R009 Persist the exact approved six-panel image and adjacent binding
      sidecar
- [x] R010 Obtain combined binding-metadata approval and canonical
      binding-verifier PASS

**Approval gate**: COMPLETE for the exact authoritative image+metadata tuple at
combined revision
`sha256:6b8db88a6cec5cf73ef35e6c95ace82405da52e293b04300cfc538774ba9b6d6`. This
authorizes UI implementation; rendered visual/device fidelity remains separate,
unexecuted evidence owned by Mohamed.

---

## Phase R1 — Supabase OTP configuration and service contract

### Red tests

- [x] R011 Add Red Supabase service tests for six-digit
      `verifyOtp({ email, token, type: "email" })`
- [x] R012 Add Red tests for stable wrong/expired-code classification and
      secret-safe errors
- [x] R013 Add Red config tests/guards for local OTP length 6 and expiry 600

### Green

- [x] R014 Add focused `verifyEmailVerificationCode` service wrapper
- [x] R015 Set local `otp_expiry = 600` and align minimum resend frequency with
      two minutes
- [ ] R016 Verify hosted Email OTP expiration is 600 seconds without exposing
      credentials
- [ ] R017 Verify installed hosted Confirm Signup template text says **10
      minutes** (template itself already installed)

---

## Phase R2 — Verification code UI and controller state machine

### Red tests

- [x] R018 Add controller Red tests for signup -> `verificationCode`
- [x] R019 Add Red OTP input tests for numeric normalization, paste, max six
      digits, and accessibility
- [x] R020 Add Red exactly-once auto-submit tests when length becomes six
- [x] R021 Add Red duplicate-submit protection while verify request is pending
- [x] R022 Add Red wrong/expired-code recovery tests
- [x] R023 Add Red tests proving AuthContext authenticated events cannot skip
      verification success
- [x] R024 Add Red returning-unverified sign-in -> code screen tests
- [x] R025 Add Red unknown-last-send timestamp fallback-copy tests

### Green

- [x] R026 Expand auth screen state with `verificationCode` and
      `verificationSuccess`
- [x] R027 Implement one logical OTP input rendered as six visual cells with
      paste/autofill semantics
- [x] R028 Implement exactly-once auto-submit at six digits
- [x] R029 Implement code verification controller path and localized error
      mapping
- [x] R030 Implement verification-flow authenticated-navigation suppression
      before calling `verifyOtp`
- [x] R031 Add known-send 10-minute countdown and unknown-timestamp fallback
      copy
- [x] R032 Update EN/AR localization for code, expiry, wrong/expired code,
      cooldown, limit, and success states

---

## Phase R3 — Server-enforced resend limiter

### Migration / pgTAP Red

- [x] R033 Add Red pgTAP for limiter table privacy/direct-access denial
- [x] R034 Add Red tests for initial-send registration
- [x] R035 Add Red tests for 120-second cooldown
- [x] R036 Add tests for exactly two successful resends and third denial;
      2026-10-07 corrected policy is exercised through the real Edge adapter and
      existing 081 RPC, including unchanged exhausted legacy count-three rows
- [x] R037 Add Red 24-hour reset test
- [x] R038 Add Red concurrent-reservation test
- [x] R039 Add Red finalize-idempotency/release-without-increment tests
- [x] R040 Add Red stale-reservation recovery test

### Green migration

- [x] R041 Add `email_verification_resend_limits` table with HMAC email key and
      no raw email
- [x] R042 Add service-role-only register/reserve/finalize/release SQL routines
- [x] R043 Revoke direct anon/authenticated table/function access

### Edge Function tests

- [x] R044 Add Red tests for normalization + HMAC with server-only pepper
- [x] R045 Add Red reserve -> resend -> finalize behavior
- [x] R046 Add Red downstream-send failure -> release behavior
- [x] R047 Add Red/product-safe cooldown and limit response tests (known public
      account-state oracle is deferred to #372; do not claim enumeration safety)
- [x] R048 Add Red no-raw-email/no-secret logging tests

### Green Edge Function/client

- [x] R049 Implement original-send registration operation
- [x] R050 Implement resend operation using atomic reservation
- [x] R051 Add client wrapper and product-safe result classification
- [x] R052 Call original-send registration after successful signup; conservative
      fallback if registration fails
- [x] R053 Apply 2-minute button cooldown after original and each successful
      resend
- [x] R054 Keep resend disabled while request is in flight; do not display
      remaining resend count
- [x] R055 Returning unverified sign-in does not automatically resend

---

## Phase R4 — Email verified success screen and callback fix

### Red tests

- [x] R056 Add component tests for approved Email verified composition
- [x] R057 Add controller tests for successful code verification -> success
      state
- [x] R058 Add Continue-to-dashboard explicit handoff tests
- [x] R059 Add callback tests reproducing "verification succeeded but
      AuthContext stayed stale/loading"
- [x] R060 Add callback bounded-timeout tests
- [x] R061 Add callback signup-success -> Email verified tests
- [x] R062 Preserve Google OAuth route regression tests; historical recovery
      tests do not establish recovery correctness (#373)

### Green

- [x] R063 Implement Email verified presentational view
- [x] R064 Wire Continue to root/startup flow
- [x] R065 Change signup-confirmation callback success to validate session
      directly and render success state
- [x] R066 Add bounded callback processing timeout/recovery so skeleton cannot
      be infinite
- [x] R067 Preserve Google OAuth destination. Password-recovery correction is
      excluded from #322 and tracked by #373

---

## Phase R5 — E2E, visual, accessibility, production QA

- [x] R068 Update local Mailpit E2E to extract six-digit code instead of relying
      on signup magic link
- [ ] R069 Main-only Android E2E signup -> code paste/type -> auto-submit ->
      success -> Continue; no PR/emulator run in this wave
- [ ] R070 Main-only Android E2E returning unverified sign-in path; no
      PR/emulator run in this wave
- [x] R071 Automated deterministic limiter tests cover
      cooldown/count/window/concurrency; do not make device E2E sleep through
      all policy windows
- [ ] R072 Manual device QA real 2-minute cooldown and third-resend denial;
      persistent inline notice, exact EN/AR Resend label, and OTP retry while
      limited
- [ ] R073 Manual Android callback legacy-link regression: cold + warm start, no
      skeleton hang
- [ ] R074 iOS device QA when build available
- [ ] R075 Mohamed captures EN/AR light/dark visual evidence against the
      approved binding; not executed by this PR worker
- [ ] R076 Mohamed verifies compact/enlarged-text/RTL accessibility evidence;
      not executed by this PR worker
- [ ] R077 Verify Gmail delivery
- [ ] R078 Verify Outlook/Hotmail delivery
- [ ] R079 Verify one additional mailbox provider
- [ ] R080 Inspect SMTP/provider bounce/suppression/domain-authentication health

---

## Phase R6 — Final gates

- [x] R081 Security audit: no OTP, raw limiter email, HMAC pepper, auth token,
      callback secret, SMTP/service-role logging
- [x] R082 Canonical mockup-binding verifier PASS for the approved
      image+metadata tuple
- [ ] R083 Exact-head focused auth/Edge/pgTAP tests Green after late-review F1
      hardening
- [ ] R084 Exact-head mobile TypeScript/lint/i18n/repository checks Green
- [ ] R085 Exact-head GitHub Actions Green
- [ ] R086 Refresh PR #322 description with current code-first architecture,
      deferrals, QA matrix, and exact-head evidence
- [ ] R087 Record functional, visual, accessibility, hosted, SMTP/delivery,
      provider, device, and immutable Green SHA statuses separately

## Phase R7 — Late-review hardening and explicit deferrals

- [ ] R088 F1: complete service-owned auth-session mutation coordination with
      valid Red evidence, independent architecture/security review, and
      exact-head Green tests before sign-off.
- [x] R089 F2: prove a real authenticated event cannot bypass the active
      verification-success screen before Continue; prove a fresh authenticated
      cold restart may route normally without a durable acknowledgement marker.
- [x] R090 F3: add boundary Red tests and reorder existing 081 limiter logic so
      live/stale reservations and active cooldown are evaluated before expired
      24-hour rollover. Executable pgTAP Green confirmed on the corrected
      branch.
- [x] R091 F6: recognize the stable `verification-code-input` marker in E2E
      preflight while still rejecting a bare mounted native root.
- [x] R092 Keep code-first email primary and add the approved secondary
      `ConfirmationURL` fallback to the tracked local Confirm Signup template.
- [x] R093 Defer resend account-enumeration/public-response redesign to #372;
      preserve the known-risk disclosure and do not claim enumeration safety.
- [x] R094 Exclude password-recovery reset/private-gate correction from #322;
      track it in #373 and do not claim recovery Green.
- [x] R095 Apply the approved canonical verification binding to the code-entry,
      success, verification-only auth shell, and signup-callback success shell;
      remove the obsolete dedicated verification processing view. Exact-head
      RNTL, TypeScript, lint, and CI verification remain pending.
- [x] R096 Replace caller Authorization case-insensitively with the approved
      stable-session bearer token for authenticated Edge calls; preserve
      unrelated headers. Exact-head regression verification remains pending.
- [x] R097 Update the seven ratified SMS service test fixtures to expose a
      coherent stable authenticated session and coordinated refresh/sign-out
      mocks where those suites already own them. No SMS production behavior
      changed.
- [x] R098 Add callback lifecycle regressions using the actual installed Expo
      Linking JavaScript hooks with controlled native latest-URL cache/events:
      warm PKCE/implicit links, late delivery, URL replacement, duplicate
      delivery, fresh params objects, timeout/failure, and unmount cleanup.
- [x] R099 Switch the callback route to supported `useLinkingURL` and keep each
      URL completion observer stable across fresh router-param object renders
      while preserving URL-replacement/unmount cleanup, same-URL dedup, retry,
      timeout/cancel, signup success, OAuth, and recovery behavior. Exact-head
      Green verification remains pending.

## Completion status

- **Product plan**: APPROVED 2026-10-04
- **English-light code-entry visual**: APPROVED
- **Revised six-panel visual direction**: APPROVED
- **Binding metadata approval**: APPROVED — combined revision
  `sha256:6b8db88a6cec5cf73ef35e6c95ace82405da52e293b04300cfc538774ba9b6d6`;
  canonical verifier PASS
- **Confirm Signup template installation**: COMPLETE by user
- **Tracked local template code + secondary link**: COMPLETE
- **Hosted template parity + 10-minute copy verification**: PENDING
- **Custom SMTP configured / real signup email received**: COMPLETE by user
  report
- **Approved verification UI source implementation**: COMPLETE in source;
  exact-head automated verification PENDING
- **Rendered visual/device/accessibility fidelity**: PENDING — owned by Mohamed
- **Revised implementation**: IN PROGRESS pending exact-head automated/external
  evidence

## 2026-10-04 implementation evidence checkpoint

- Exact code checkpoint `d207768e05f55e6cea3ff909f527c4114793dcff`:
  - Code Quality & Tests: SUCCESS
  - Financial Action pgTAP: SUCCESS
  - Android Build Verification: SUCCESS
  - PR Android E2E: SKIPPED by repository policy
- pgTAP includes the resend limiter privacy, permission, cooldown, three-resend,
  reset, concurrency, idempotency/release, and stale-reservation contract.
- Repository CI includes the Edge resend handler contract.
- Full mobile Jest, TypeScript, lint, i18n, repository script checks were Green
  at that checkpoint.
- Security source audit found no production logging of OTP, callback URL,
  access/refresh token, raw limiter email, SMTP password, or HMAC key. Hosted
  helper output redacts SMTP password and summarizes template compliance rather
  than returning template body.
- R069/R070 remain unchecked by policy: PR/branch emulator E2E is not run.
  Android E2E remains guarded to `refs/heads/main` in the existing CI workflow.
- R016/R017 remain unchecked until hosted Auth status proves 600s/6-digit/120s
  and the installed Confirm Signup template is verified to say 10 minutes.
- R072-R080 remain manual/external release evidence owned by Mohamed; SMTP,
  hosted-template parity, live mailbox/provider, device, visual, and
  accessibility evidence are not claimed by CI.
- R082 is complete for the authoritative binding tuple. Rendered visual/device
  fidelity remains separate and unverified. The older three PNG/sidecars remain
  historical link-first references only.
- Historical Green checkpoints above remain useful evidence, but they are not
  final exact-head sign-off after the late-review F1/F3/F6/template changes.
- Password recovery is excluded to #373. Resend enumeration hardening is
  excluded to #372. Neither may be presented as PR #322 completion.

## 2026-10-07 resend policy correction checkpoint

Mohamed corrected the policy to the original email plus at most two resends
(three emails total). The 2026-10-04 checkpoint above records the historical
three-resend policy at its immutable revision.

Root independently verified the corrected working snapshot: focused mobile Jest
55/55, Edge entrypoint/handler 9/9, generator exclusion 2/2, transactional pgTAP
12/12 against existing migration 081, Deno check, and mobile TypeScript check
all passed. Exact-head CI/review and device/rendered validation remain pending;
no emulator/E2E or manual device runs were performed for this correction.
