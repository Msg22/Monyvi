# Feature Specification: Complete Email Verification

**Feature Branch**: `codex/issue321-email-verification`  
**Created**: 2026-09-21  
**Revised**: 2026-10-04  
**Status**: Approved plan; implementation paused at mockup approval gate  
**Issue**: #321 — Complete production email verification with code-first signup flow

## Product Direction

Email/password registration MUST prove ownership of the address before private
Monyvi access. Supabase Auth remains the verification authority.

The approved primary verification UX is now **code-first**:

```text
sign up
  -> 6-digit code email
  -> code-entry screen
  -> auto-submit at six digits
  -> Supabase verifies code + creates session
  -> Email verified success screen
  -> explicit Continue to dashboard
```

Legacy/signup confirmation links remain supported defensively and for already
sent emails, but they are not the primary signup UX.

## User Stories

### User Story 1 — Verify a new signup with a 6-digit code (P1)

A new user registers with email/password, receives a six-digit confirmation code,
enters or pastes it in Monyvi, and sees a clear success state before choosing to
continue into the authenticated app.

**Acceptance scenarios**

1. New signup requiring confirmation opens the verification-code screen.
2. The code contains exactly six digits and expires after ten minutes.
3. Typing or pasting the sixth valid digit triggers exactly one verification
   attempt automatically.
4. Correct verification creates/accepts the Supabase session and opens the
   Email verified success state.
5. AuthContext becoming authenticated MUST NOT skip the success state.
6. The user enters the authenticated startup flow only after choosing
   **Continue to dashboard**.

### User Story 2 — Resend safely without inbox abuse (P1)

A user may request another signup confirmation code, but Monyvi prevents rapid
or excessive sends.

**Approved rule**

- original signup email: 1
- resends: maximum 3
- total emails in the active window: maximum 4
- cooldown after original send and each successful resend: 2 minutes
- reset: 24 hours after the original verification send

**Acceptance scenarios**

1. Resend is unavailable during the two-minute cooldown.
2. A successful resend restarts the two-minute cooldown and code-expiry timer.
3. The fourth resend in the active 24-hour window is rejected.
4. The resend allowance resets after the active window expires.
5. Concurrent resend attempts cannot exceed the limit.
6. A provider/send failure does not unfairly consume a resend slot.
7. Server-side enforcement remains authoritative even if the client UI is
   bypassed.

### User Story 3 — Recover an unverified returning account (P1)

A returning user with valid credentials but an unverified email is routed into
the same code/resend flow instead of seeing raw provider wording.

If Monyvi knows the last successful send timestamp on that device, it shows the
remaining ten-minute code timer. If it does not know the timestamp (for example,
another device), it MUST NOT invent a false countdown; it may show localized
copy explaining that codes expire ten minutes after they are sent.

### User Story 4 — Confirmation links complete without hanging (P1)

Already-sent/legacy signup confirmation links still work.

Real-device QA on 2026-10-04 proved the link successfully verified the email,
but the app stayed indefinitely on the auth-callback skeleton. A subsequent
normal sign-in succeeded. Therefore the remaining defect is post-confirmation
callback/session/navigation synchronization, not failed email verification.

A successful signup-confirmation callback MUST show the same Email verified
success state and wait for explicit Continue to dashboard. It MUST NOT depend
indefinitely on AuthContext settling.

### User Story 5 — Verification failures are safe and recoverable (P2)

Wrong, expired, malformed, reused, provider-error, and network-failed
verification attempts fail closed without leaking secrets or granting private
routing.

## Functional Requirements

- **FR-001**: Unverified email/password accounts MUST NOT access private Monyvi
  functionality.
- **FR-002**: Signup confirmation email MUST present a 6-digit verification code
  using Supabase's native confirmation token.
- **FR-003**: Hosted and local Auth configuration MUST use a 10-minute OTP
  lifetime.
- **FR-004**: The mobile code input MUST accept six numeric digits, support
  standard paste, and auto-submit exactly once when six digits are present.
- **FR-005**: Verification MUST use Supabase Auth `verifyOtp`; Monyvi MUST NOT
  create a parallel verification token system.
- **FR-006**: Successful code verification MUST enter an Email verified success
  state before authenticated routing.
- **FR-007**: Continue to dashboard MUST explicitly hand off to the existing
  authenticated startup/root routing.
- **FR-008**: Session/auth-state propagation MUST NOT auto-skip the verification
  success state.
- **FR-009**: Resend MUST have a 2-minute client cooldown after each successful
  verification email send.
- **FR-010**: Server-side policy MUST allow at most three resends within the
  24-hour window beginning with the original signup send.
- **FR-011**: Resend limiter state MUST NOT persist raw email addresses.
- **FR-012**: Resend enforcement MUST be concurrency-safe and MUST compensate a
  reserved resend when the downstream send fails.
- **FR-013**: Returning `email_not_confirmed` sign-ins MUST enter the same
  verification-code flow.
- **FR-014**: Wrong and expired codes MUST produce localized, product-safe
  errors and remain recoverable.
- **FR-015**: Legacy/deep-link signup confirmation MUST remain supported.
- **FR-016**: A successful signup confirmation callback MUST show Email verified
  rather than an unbounded loading skeleton.
- **FR-017**: Callback processing MUST have bounded timeout/failure states.
- **FR-018**: Existing Google OAuth and password-recovery callback behavior MUST
  not regress.
- **FR-019**: English/Arabic, LTR/RTL, light/dark, responsive layouts, enlarged
  text, and accessibility semantics remain required.
- **FR-020**: No SMTP secret, service-role secret, OTP, access token, refresh
  token, or credential-bearing callback URL may be exposed in app UI/logging.
- **FR-021**: Production email continues through Supabase Auth custom SMTP.
- **FR-022**: The currently installed Confirm Signup template is treated as
  configured; release QA MUST verify its expiry copy says **10 minutes**.

## Resend Limiter

The approved expansion permits one focused server-side limiter:

- one small Supabase Edge Function;
- one minimal Postgres limiter table;
- private SQL functions required for atomic reservation/finalization;
- Supabase Auth remains the only email-verification authority.

The limiter uses an HMAC/keyed digest of normalized email generated with a
server-only pepper. Raw email MUST NOT be stored in the limiter table.

The limiter is anti-abuse infrastructure only. It MUST NOT generate, store, or
validate verification codes.

## Visual Requirements

### Verification code

The English-light code-entry mockup revised and approved on 2026-10-04 is the
baseline once its final binding sidecar is persisted.

It intentionally does NOT display:

- a paste instruction;
- an auto-submit instruction;
- remaining resend-count text.

Those behaviors still exist but are not explained as permanent helper copy.

### Email verified

A new success state is required with:

- existing auth top bar / language selector;
- success/check illustration;
- localized Email verified heading and body;
- verified email pill;
- Continue to dashboard;
- existing privacy/legal footer.

Production implementation of the revised/new visible states remains blocked
until the remaining mockup variants receive explicit approval.

## Data / Privacy Requirements

- No new verification-token table.
- No raw email in resend limiter persistence.
- No financial-data or WatermelonDB schema change.
- No sync-contract change.
- The limiter table is inaccessible directly from anon/authenticated clients.
- Edge Function responses MUST avoid useful account-enumeration differences.

## Success Criteria

- **SC-001**: 100% of new email/password signups are blocked from private app
  access until Supabase verifies the email.
- **SC-002**: Correct six-digit code completes verification and reaches Email
  verified before dashboard routing.
- **SC-003**: Paste and digit-by-digit entry both auto-submit once at six digits.
- **SC-004**: OTPs expire after 600 seconds in local and hosted config.
- **SC-005**: No more than three resends succeed in an active 24-hour window,
  including concurrent attempts.
- **SC-006**: Successful resend failure compensation is proven by automated
  tests.
- **SC-007**: Returning unverified sign-in enters the same code flow.
- **SC-008**: A valid legacy signup confirmation link no longer hangs on the
  callback skeleton.
- **SC-009**: Invalid/expired verification fails closed without secret leakage.
- **SC-010**: Required EN/AR, dark/light, responsive, accessibility, E2E, and
  device evidence passes.
- **SC-011**: Gmail, Outlook/Hotmail, and one additional mailbox provider are
  verified before release.

## External Configuration Already Completed

Based on user QA on 2026-10-04:

- custom SMTP has been configured in the hosted Supabase project;
- a real Confirm Signup email was successfully received;
- the Confirm Signup subject/template has been manually installed using the
  Monyvi code-first template.

The template must still be checked for the revised **10-minute** expiry copy.

## Out of Scope

- Custom verification-code generation/storage.
- Replacing Supabase Auth.
- Passwordless OTP login as a separate feature.
- SMS/phone verification.
- Universal/App Links migration.
- MFA/session-management work from #240.
- Password-reset UX expansion.
- Signup profile-name work from #20.
