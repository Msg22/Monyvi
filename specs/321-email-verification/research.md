# Research: Complete Email Verification

**Revised**: 2026-10-04  
**Issue**: #321  
**Branch**: `codex/issue321-email-verification`

## Decision 1 — Supabase Auth remains verification authority

Use Supabase's native signup confirmation and `verifyOtp` APIs. Monyvi does not
create or persist its own verification codes.

For JavaScript signup OTP verification, Supabase documents:

```ts
supabase.auth.verifyOtp({
  email,
  token,
  type: "email",
});
```

## Decision 2 — Code-first signup confirmation

The Confirm Signup template uses `{{ .Token }}` and presents a six-digit code.
The user has already installed the Monyvi subject/template in the hosted
Supabase project.

The mobile app's primary signup verification UX is code entry. Confirmation
links remain only for compatibility / already-sent emails and adjacent auth
flows.

## Decision 3 — OTP lifetime is 10 minutes

Set email OTP expiry to **600 seconds** locally and hosted.

The UI countdown is informative. Supabase remains authoritative for validity.

When Monyvi does not know the actual last-send timestamp on the current device,
it must not fabricate a countdown; it can show generic ten-minute expiry copy.

## Decision 4 — Auto-submit at exactly six digits

Use one logical text input rendered as six visual cells.

Why:

- standard platform paste works naturally;
- one accessibility focus target is simpler than six independent inputs;
- autocomplete / one-time-code semantics can be attached to one input;
- duplicate auto-submit can be controlled centrally.

Only ASCII digits are accepted into the canonical token. Once token length
becomes exactly six, submit once. Changing the token or a failed verification
re-enables a later attempt.

## Decision 5 — Resend policy is product-enforced server-side

Approved rule:

- original send + three resends;
- two-minute cooldown;
- reset 24 hours after original send.

Supabase's built-in rate limits are useful defense-in-depth, but they do not
encode this exact per-email 24-hour rule. Therefore #321 adds a small limiter.

## Decision 6 — Limiter uses keyed email digest, not raw email

The Edge Function normalizes the email and computes HMAC-SHA256 using a
server-only pepper. The database stores only that digest.

A plain SHA-256 email hash is rejected because common email addresses are
enumerable offline.

## Decision 7 — Limiter uses atomic reservation

A migration provides private service-role-only SQL routines for:

- registering the original successful send;
- reserving a resend slot atomically;
- finalizing a successful send;
- releasing/compensating a reservation after downstream failure.

The reservation routine resets an expired 24-hour window, enforces cooldown, and
rejects the fourth resend.

This prevents two concurrent requests from both seeing the same available slot.

## Decision 8 — No public limiter-status lookup is required

The approved mockup no longer displays remaining resend count.

The client owns the countdown after sends it initiated. The server remains
authoritative on resend attempts and may return only coarse safe outcomes such
as cooldown / limit / success.

Avoid exposing detailed per-email limiter state through an unauthenticated
status endpoint because it can become an account/state-enumeration side channel.

## Decision 9 — Original-send registration is best-effort but conservative

After successful `signUp`, Monyvi immediately calls the limiter Edge Function to
register the original send.

If that registration fails:

- signup verification still remains valid in Supabase;
- the first later resend initializes a conservative window at that later time;
- maximum three resends is still enforced;
- the window can become stricter/longer, never looser.

Do not route passwords through the Edge Function merely to make registration
atomic with signup.

## Decision 10 — Success state owns post-verification navigation

`verifyOtp` creates an authenticated session. Existing AuthContext navigation
would otherwise be able to skip the success screen.

Introduce explicit verification-flow navigation suppression from code-entry
through success. Continue to dashboard is the explicit handoff.

The suppression must also cover the short async interval in which the Supabase
session event arrives before React commits the success-screen state.

## Decision 11 — Real-device skeleton finding is a routing bug

Observed 2026-10-04:

- confirmation link opened Monyvi;
- callback skeleton remained indefinitely;
- backing out and signing in succeeded.

Conclusion: confirmation succeeded; the route waited on stale/lagging app auth
state after callback completion.

Revised design:

- callback completion validates the session explicitly;
- signup confirmation success shows Email verified;
- no successful signup callback waits indefinitely for AuthContext before
  rendering useful UI;
- callback processing has a bounded timeout/error state.

## Decision 12 — Template installation is complete

The user manually installed the previously supplied Monyvi Confirm Signup
subject/template in hosted Supabase and received a real email through configured
SMTP.

One release QA correction remains: the earlier draft said one hour. The final
installed template must say **10 minutes** to match the 600-second
configuration.

## Decision 13 — Existing deep-link security hardening remains

Retain the already implemented:

- exact `monyvi://auth-callback` base validation;
- token/code session completion;
- sanitized callback errors;
- non-canonical callback rejection;
- OAuth/password recovery compatibility.

## Decision 14 — Visual implementation remains approval-gated

The revised English-light code-entry image is approved.

Before UI implementation resumes, receive explicit approval for the remaining
dark/Arabic code-entry variants and Email verified success variants, then
persist/update mockup binding sidecars and rerun the repository binding
verifier.
