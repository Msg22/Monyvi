# Contract: Email Verification Lifecycle

## Purpose

Define the behavioral boundary between Monyvi's auth UI, mobile auth service,
Supabase Auth, and the native callback route. This is an application contract,
not a new network endpoint.

## Signup Contract

Input:

- normalized email address;
- exact user-entered password.

Required behavior:

- request account creation through the existing auth provider;
- specify the canonical Monyvi mobile auth callback;
- on successful unverified creation, report verification required;
- do not create an application-level verified flag.

## Resend Contract

Input:

- email address for the pending signup.

Required behavior:

- request a signup-confirmation resend;
- use the same canonical callback as signup;
- surface a stable success/failure result;
- respect provider/client rate limiting and in-flight UI protection.

## Callback Completion Contract

Input:

- full native callback URL received by the app.

Accepted successful shapes:

1. access token + refresh token material supplied by the auth provider;
2. an authorization code that can be exchanged through the auth provider.

Failure shapes:

- explicit provider callback error;
- missing authentication material;
- malformed callback;
- failed token/code exchange.

Security rules:

- validate required callback material before session mutation;
- never log or render full callback URLs containing credentials;
- never return raw access/refresh/verification tokens in UI-facing errors;
- a failed callback must not produce authenticated private routing.

Output:

- stable success/failure classification suitable for route/controller handling.

## Unverified Sign-in Contract

When password sign-in fails with the stable `email_not_confirmed` auth code:

- preserve the submitted normalized email;
- enter verification-pending state;
- allow resend;
- do not show raw provider error wording.

Other credential failures remain normal sign-in failures.

## Routing Contract

On callback success:

1. session establishment completes;
2. auth state is allowed to settle;
3. control returns to the existing authenticated startup/root route.

The callback route does not decide onboarding/profile business rules itself.

On callback failure:

- private runtime remains inaccessible;
- user returns to an auth recovery path with friendly feedback.

## UI Contract

The approved idle verification state includes:

- existing auth top bar;
- full-page state composition, no verification card;
- circular mail icon;
- localized check-inbox heading/copy;
- LTR email chip;
- outlined resend action;
- separate bottom back-to-sign-in action;
- existing privacy/legal footer.

Loading/resend behavior preserves existing disabled/busy accessibility semantics.
No new visual loading composition is introduced without approval.
