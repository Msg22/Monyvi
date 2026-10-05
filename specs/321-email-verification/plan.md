# Implementation Plan: Complete Email Verification

**Branch**: `codex/issue321-email-verification`  
**Revised**: 2026-10-04  
**Spec**: [spec.md](./spec.md)  
**Status**: Implementation in progress; combined visual binding approved; rendered visual/device and final release evidence pending

## Summary

Revise PR #322 from the already-implemented link-first pending flow to the
approved code-first confirmation flow.

Supabase Auth remains the verification authority. New work adds:

- six-digit signup code verification;
- 10-minute Auth expiry;
- auto-submit + paste-capable OTP input;
- Email verified success state;
- explicit navigation suppression until Continue;
- two-minute resend cooldown;
- server-enforced three-resends-per-24-hours limiter;
- callback success fix for the real-device skeleton hang;
- revised E2E/visual/accessibility evidence.

The user has already configured custom SMTP and previously installed a Monyvi
Confirm Signup template in hosted Supabase. The tracked local template has since
gained an approved **secondary confirmation-link fallback** beneath the primary
six-digit code, so hosted parity is not proven. Release QA must compare/update
the hosted template deliberately; this PR does not deploy hosted configuration.

## Current Proven Foundation To Preserve

Already implemented/Green work from the earlier #321 wave remains useful:

- shared native auth callback/session completion;
- exact `monyvi://auth-callback` validation;
- signup/resend redirect configuration;
- local confirmation enabled;
- returning `email_not_confirmed` classification;
- invalid callback hardening/sanitization;
- OAuth/password-reset regressions;
- local email-verification E2E harness;
- custom SMTP configuration tooling/runbook.

Do not delete these protections merely because code entry becomes primary.

## Architecture

### Mobile auth service

Add focused APIs:

- `verifyEmailVerificationCode(email, token)`;
- limiter Edge Function client wrapper for original-send registration / resend.

Keep raw Supabase protocol calls out of presentational components.

### Auth controller state machine

Expand auth screen states:

```text
form
  -> verificationCode
      -> verificationSuccess
          -> Continue -> /
  -> resetSent
```

Add explicit `suppressAuthenticatedRedirect` ownership for the verification
flow. It becomes true before code verification starts and stays true through
success. Only Continue releases/hands off routing.

This avoids the race where `verifyOtp` creates a session and AuthContext
redirects before the success state commits.

### OTP UI

One native text input is the source of truth; six cells are visual projections.

Required semantics:

- digits only;
- maxLength 6;
- paste;
- OTP/autofill-compatible platform hints where supported;
- one accessible input;
- exactly-once auto-submit at six digits;
- disabled/edit handling while verification request is pending.

No permanent helper text for paste or auto-submit in the approved composition.

### Expiry timer

Set Auth OTP expiry to 600 seconds.

Controller stores only the known send timestamp needed to render a countdown.
Do not store the OTP.

A returning/cross-device unverified user without a known timestamp sees generic
ten-minute expiry wording until a new successful resend establishes a known
timestamp.

### Resend limiter

Add migration:

- `email_verification_resend_limits`;
- service-role-only atomic SQL routines.

Add Edge Function:

- register original successful send;
- resend with atomic reserve -> Supabase send -> finalize/release.

Digest:

```text
HMAC-SHA256(server_pepper, normalized_email)
```

No raw email persistence.

Use stale reservation recovery with a short bounded age so function crashes do
not permanently block the user.

### Supabase Auth config

Local:

- confirmation required;
- OTP length 6;
- OTP expiry 600;
- minimum resend frequency aligned with 120 seconds for realistic QA where
  practical.

Hosted:

- verify OTP expiry 600;
- verify the template says 10 minutes;
- keep Confirm email enabled;
- keep custom SMTP enabled.

Do not use the project-wide email-sent rate limit as the per-user product rule;
it serves only as defense-in-depth / provider protection.

### Callback fix

Current real-device evidence shows verification succeeded but
`auth-callback.tsx` stayed on its skeleton.

Change signup-confirmation success behavior:

1. complete callback;
2. explicitly verify a resulting session rather than waiting indefinitely for
   AuthContext;
3. render Email verified;
4. Continue -> existing root flow.

Add a bounded processing timeout.

Google OAuth routing remains an in-scope regression contract. Password recovery
is excluded from PR #322 and tracked by #373; no recovery route/form/private
gate work belongs in this PR.

## Visual Plan

### Sole approved revised board

- `mockups/verification-flow-approved.png` is the sole approved six-panel
  revised visual reference.
- The exact image SHA-256 is
  `d1a0778e9d0fe00385eeb3c59e27e7428671a96b2eee91e851b3ef7d109e5976`.
- `verification-flow-approved.binding.md` is **APPROVED** at combined revision
  `sha256:6b8db88a6cec5cf73ef35e6c95ace82405da52e293b04300cfc538774ba9b6d6`.
  The canonical repository binding verifier passes, so the exact image+metadata
  tuple is authoritative for UI implementation.
- The earlier `verification-en-light.png`, `verification-en-dark.png`, and
  `verification-ar-light.png` bindings remain historical link-first evidence.

### Binding status

The binding gate is complete for the exact approved tuple. No further design
approval is required for that image+metadata revision. The approved
verification presentation is implemented in source; exact-head automated
verification remains pending. Rendered visual/device fidelity is separate
evidence, remains unverified on this PR, and is owned by Mohamed. The older three PNG bindings remain historical link-first evidence.

PR/branch emulator E2E is intentionally not run. The temporary issue-specific
workflow has been removed; Android E2E remains main-only under the existing
`.github/workflows/ci.yml` guard, with authored journeys preserved for future
main CI.

## Test Strategy

Strict Red -> Green -> Refactor.

### Service tests

- verifyOtp correct args;
- success session;
- wrong/expired stable error mapping;
- OTP never appears in returned product-safe errors/logs.

### Controller tests

- signup -> verificationCode;
- unverified sign-in -> verificationCode;
- digits/paste normalization;
- exactly-once six-digit auto-submit;
- duplicate submit blocked;
- verification success -> verificationSuccess;
- AuthContext authenticated event cannot redirect while suppressed;
- Continue performs handoff;
- wrong/expired code recovery;
- unknown send timestamp fallback.

### Resend database tests

- register original;
- cooldown <120s;
- three success reservations;
- fourth denied;
- 24h reset;
- concurrent reservations;
- stale reservation recovery;
- finalize exactly once;
- release does not increment;
- no direct anon/authenticated access.

### Edge Function tests

- normalization/HMAC;
- safe generic responses;
- reserve/send/finalize;
- reserve/send failure/release;
- no raw email/token logs;
- provider error mapping.

### Callback/session tests

- signup callback success -> success screen;
- active-flow authenticated event cannot bypass explicit Continue;
- cold restart after verified signup may route normally;
- bounded timeout without silent late callback authentication;
- coordinated callback/session mutation ordering versus email sign-in and OTP;
- safe cancellation/compensation, explicit logout precedence, and observer gating;
- Google OAuth regression;
- invalid/reused/noncanonical failure;
- password recovery is excluded and tracked by #373.

### E2E

Local Mailpit primary flow:

```text
signup
 -> receive code-first confirmation email
 -> extract six-digit code
 -> paste/type code
 -> auto-submit
 -> Email verified
 -> Continue
 -> authenticated app
```

Local Mailpit fallback-link flow:

```text
fresh signup
 -> open the secondary confirmation link from the same local email
 -> native signup callback completes
 -> Email verified
 -> explicit Continue
 -> authenticated app
```

Returning `email_not_confirmed` sign-in must enter the same code screen
without automatically sending another email.

Add resend policy coverage where practical without making device E2E wait
minutes; exact timing/concurrency belongs primarily in deterministic unit/DB
tests.

Manual device QA validates the real 2-minute cooldown.

## Production Configuration / QA

Already reported complete:

- custom SMTP configured;
- real Confirm Signup email received;
- Confirm Signup Monyvi subject/template installed.

Still verify:

- hosted template matches the current code-first + secondary-link local template
  and says 10 minutes;
- hosted OTP expiry = 600 and minimum send frequency = 120 seconds;
- hosted migration/function deployment status before resend device QA;
- Gmail + Outlook/Hotmail + one additional mailbox;
- bounce/suppression/provider logs;
- Android/iOS device journeys;
- local/hosted signup-link fallback no longer hangs;
- #372 remains a disclosed known resend-oracle limitation rather than a PR #322
  security-completion claim.

## Constitution / Scope Check

Approved exception to previous #321 "no Edge Function/table" assumption:

- server-side limiter is now explicitly product-approved;
- it stores anti-abuse state only;
- it does not replace Supabase verification.

No financial schema, WatermelonDB, sync, or financial-action change.

**Result**: Technical/product plan and combined binding tuple are approved.
Implementation is in progress. Rendered visual/device verification remains
manual and user-owned; PR/branch emulator E2E is not executed. Password recovery
(#373) and resend enumeration hardening (#372) remain explicitly outside PR #322.
