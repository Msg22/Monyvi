# Implementation Plan: Complete Email Verification

**Branch**: `codex/issue321-email-verification`  
**Revised**: 2026-10-04  
**Spec**: [spec.md](./spec.md)  
**Status**: Approved technical/product plan; paused at remaining mockup approval gate

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

The user has already configured custom SMTP and installed the Monyvi Confirm
Signup subject/template in hosted Supabase. Do not recreate that template in
code. Release QA only verifies its final 10-minute wording and delivery health.

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

OAuth/password-recovery callback destinations stay unchanged.

## Visual Plan

### Approved

- latest English-light code-entry mockup with three helper/count texts removed.

### Awaiting approval before UI production mutations

- English dark code-entry;
- Arabic light code-entry;
- Arabic dark code-entry;
- English light Email verified;
- English dark Email verified;
- Arabic light Email verified;
- Arabic dark Email verified.

After approval:

- persist exact image bytes;
- create/update binding sidecars;
- compute image/metadata/combined revisions;
- obtain binding metadata approval if required by repository workflow;
- run canonical mockup-binding verifier.

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

### Callback tests

- signup callback success -> success screen;
- stale AuthContext cannot hang success;
- bounded timeout;
- OAuth regression;
- password recovery regression;
- invalid/reused/noncanonical failure.

### E2E

Local Mailpit flow becomes:

```text
signup
 -> receive 6-digit code
 -> paste/type code
 -> auto-submit
 -> Email verified
 -> Continue
 -> authenticated app
```

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

- template says 10 minutes;
- hosted OTP expiry = 600;
- Gmail + Outlook/Hotmail + one additional mailbox;
- bounce/suppression/provider logs;
- Android/iOS device journeys;
- callback old-link fallback no longer hangs.

## Constitution / Scope Check

Approved exception to previous #321 "no Edge Function/table" assumption:

- server-side limiter is now explicitly product-approved;
- it stores anti-abuse state only;
- it does not replace Supabase verification.

No financial schema, WatermelonDB, sync, or financial-action change.

**Result**: Technical/product plan approved. UI implementation remains blocked
only on the remaining mockup approval/binding gate.
