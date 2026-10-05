# Contract: Email Verification Lifecycle

## Signup

Input:

- normalized email;
- password.

Behavior:

1. call Supabase Auth signup;
2. require hosted/local email confirmation;
3. when verification is required:
   - retain normalized email;
   - register the original successful send with the limiter (best effort,
     conservative fallback);
   - enter `verificationCode`;
   - start the known local 10-minute code timer and 2-minute resend cooldown.

Signup does not create private app access.

## Code Verification

Input:

- pending email;
- canonical six-digit ASCII token.

Call:

```ts
supabase.auth.verifyOtp({
  email,
  token,
  type: "email",
});
```

Behavior:

- accept only six digits;
- support normal platform paste into one logical input;
- auto-submit exactly once when length becomes six;
- block duplicate submissions while pending;
- on success, validate/retain the session and enter `verificationSuccess`;
- do not auto-route to dashboard;
- on wrong/expired code, remain recoverable on the code screen.

Do not persist or log the OTP.

## Navigation Suppression

From entry into `verificationCode` until the user explicitly chooses Continue
from `verificationSuccess`, ordinary AuthContext authenticated-state redirects
must be suppressed.

This suppression must be active before invoking `verifyOtp`, because Supabase
can emit an authenticated session event before the success-state render commits.

Continue explicitly hands routing back to the existing root/startup flow.

## Code Expiry

- authoritative Auth expiry: 600 seconds;
- display countdown begins from a locally known successful send timestamp;
- successful resend resets the known timestamp/countdown;
- if the device does not know the real send timestamp, do not invent a
  countdown; use generic ten-minute expiry copy.

## Resend

Product policy:

- 120-second cooldown;
- three successful resends maximum;
- active window begins with original signup send;
- window resets after 24 hours.

### Client

- disable resend during a locally known cooldown;
- show countdown in the resend action;
- submit resend only through the limiter Edge Function;
- product-safe error copy only.

### Edge Function

`register_initial`

- normalize email;
- compute server-only HMAC digest;
- register active window without storing raw email.

`resend`

1. normalize + HMAC email;
2. atomically reserve via private DB function;
3. if denied, return safe cooldown/limit response;
4. call Supabase Auth `resend({ type: "signup", email, ... })`;
5. finalize reservation on success;
6. release reservation on downstream failure.

The Edge Function must not return raw provider messages that reveal account
existence.

## Returning Unverified Sign-in

When Supabase password sign-in returns stable `email_not_confirmed`:

- retain submitted normalized email;
- enter `verificationCode`;
- do not show raw provider text;
- do not automatically consume a resend;
- permit resend under the same limiter policy.

## Signup Confirmation Deep Link

Legacy/already-sent link flow:

1. require exact canonical callback base;
2. process fragment tokens or PKCE code;
3. reject provider errors/noncanonical callbacks;
4. explicitly validate session completion;
5. for signup-confirmation success, show `verificationSuccess`;
6. do not wait indefinitely on AuthContext;
7. Continue hands routing to root.

Google OAuth retains its existing route contract. Password-recovery correctness
is explicitly excluded from PR #322 and tracked by #373; historical recovery
routing coverage is not #322 Green evidence.

## Callback Timeout / Failure

Callback processing must be bounded.

On timeout/network/provider/malformed/reused failure:

- no private route is granted by the callback;
- no token-bearing URL is logged/displayed;
- show recoverable product UI;
- network cases may expose Retry.

## Email Template

Hosted Confirm Signup template installation is already complete.

Release QA MUST verify:

- subject uses the Monyvi verification code wording;
- body uses `{{ .Token }}`;
- visible expiry copy says **10 minutes**;
- no old one-hour statement remains.

## Security

Never commit/log/display:

- OTP;
- access token;
- refresh token;
- verification token hash;
- credential-bearing callback URL;
- SMTP credential;
- service-role key;
- limiter HMAC pepper.

Raw email may exist transiently in normal auth requests and Edge Function memory
but is not persisted in limiter state.
