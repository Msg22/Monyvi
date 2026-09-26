# Quickstart: Email Verification Implementation & QA

## Planning authority

- GitHub issue: #321
- Branch: `codex/issue321-email-verification`
- Product authority: `docs/business/business-decisions.md` §3
- Prior approved behavior: `specs/016-remove-anonymous-auth`
- Visual authority: approved #321 verification images + their approved,
  fingerprinted binding sidecars

## Implementation order

1. Verify approved mockup binding sidecars.
2. Write Red unit tests for callback completion.
3. Implement the shared callback/session-completion service.
4. Add Red tests for signup/resend redirect options.
5. Add the canonical callback to signup and resend.
6. Add Red controller tests for `email_not_confirmed`.
7. Route unverified sign-in into verification-pending state.
8. Add route tests, then make `auth-callback.tsx` complete the session before
   routing.
9. Enable confirmation in local Supabase and adjust local fixtures.
10. Align `VerificationPendingView` to the approved references using TDD plus
    rendered visual evidence.
11. Add/extend local auth E2E verification journey.
12. Run focused tests, mobile typecheck/lint, then full CI-required validation.

## Local verification

Local Supabase must require confirmation.

Expected journey:

```text
fresh email signup
  -> verification pending
  -> local auth email captured
  -> open confirmation callback
  -> Supabase session established
  -> existing authenticated root/startup flow
```

Do not send local/E2E mail through production Resend.

### Implemented local E2E harness

The branch includes:

- `apps/mobile/scripts/run-email-verification-e2e.js`
- `apps/mobile/e2e/maestro/auth/email-verification-pending.yaml`
- `apps/mobile/e2e/maestro/auth/email-verification-confirm.yaml`
- `apps/mobile/e2e/maestro/auth/email-verification-invalid.yaml`
- helper/unit coverage in `apps/mobile/__tests__/scripts/e2e-email-verification.test.ts`

Run locally with:

```bash
npm run e2e:email-verification:local
```

The harness uses Supabase CLI's local Mailpit capture service on port 54324,
polls the recipient-specific latest message, resolves the Supabase verification
request without following the native redirect, verifies that the redirect base
is exactly `monyvi://auth-callback`, and then opens that callback through
Maestro.

The auth suite is registered with the repository E2E scope resolver and CI
runner. Existing PR CI intentionally skips emulator E2E by repository policy;
the executable journey is therefore also part of release/device QA below.

### Invalid-link manual cases

The deterministic Maestro invalid flow covers a provider-declared callback
error and a callback with missing auth material. Also verify these auth-server
state-dependent cases manually against local Supabase and a release build:

1. Open a valid confirmation link once and complete verification.
2. Open the same single-use link again. Expected: no private runtime access;
   return to auth recovery.
3. Generate a confirmation link, allow it to expire (or use a controlled local
   expiry configuration), then open it. Expected: no authenticated session and
   safe auth recovery.
4. Disable connectivity before opening a still-valid callback. Expected: no
   private runtime access; recovery/retry remains possible after connectivity
   returns.

Never record raw token-bearing callback URLs in QA evidence.

## Production configuration runbook

Manual release configuration:

1. Choose a Monyvi-controlled auth sending domain/subdomain.
2. Add the DNS records required by Resend and verify domain ownership.
3. Add DMARC as appropriate for the sending domain.
4. Create a scoped Resend SMTP credential.
5. Configure Supabase Auth custom SMTP using that credential.
6. Enable hosted **Confirm email**.
7. Confirm the hosted redirect allow-list includes exactly
   `monyvi://auth-callback` for this v1 flow.
8. Verify signup email template redirect behavior.
9. Review hosted auth email rate limits.
10. Test real delivery to Gmail, Outlook/Hotmail, and one additional provider.
11. Inspect delivery/bounce/suppression logs for failures.

No SMTP credential is committed to the repository or bundled in Expo.

### Resend configuration skeleton

When a Monyvi-controlled sending domain is ready, verify it in Resend and set
these values only in the release operator's shell or secret manager:

```text
SUPABASE_ACCESS_TOKEN=<Supabase management token with Auth config write access>
SUPABASE_PROJECT_REF=<hosted project reference>
MONYVI_AUTH_SMTP_FROM=verify@<verified Monyvi domain>
MONYVI_AUTH_SMTP_PASSWORD=<scoped Resend SMTP credential>
```

Optional overrides are `MONYVI_AUTH_SMTP_HOST` (default `smtp.resend.com`),
`MONYVI_AUTH_SMTP_PORT` (default `465`), `MONYVI_AUTH_SMTP_USER` (default
`resend`), and `MONYVI_AUTH_SMTP_SENDER_NAME` (default `Monyvi`). Then run:

```bash
npm run auth:smtp:check
npm run auth:smtp:configure
```

The first command validates and prints a redacted preview. The second performs
the explicit Supabase Management API update. The script rejects example sender
domains, never prints the SMTP credential, enables external email, and keeps
email confirmation required. Re-run the hosted checks and real-provider delivery
matrix after applying it.

### Hosted configuration status (verified 2026-09-22)

- **Confirm email:** enabled in the hosted Monyvi Supabase project.
- **Native redirect allow-list:** includes the exact
  `monyvi://auth-callback` URL.
- **Custom SMTP:** not configured. The project still uses Supabase's built-in
  email service, so Resend domain verification, scoped SMTP credentials, and
  real-provider delivery evidence remain release blockers.

## Manual device QA matrix

| Scenario | Android | iOS | Expected |
| --- | --- | --- | --- |
| New signup -> pending | Required | Required when build available | No private access |
| Valid link, cold start | Required | Required | Session established |
| Valid link, warm start | Required | Required | Session established |
| Resend | Required | Required | New confirmation email |
| Expired link | Required | Required | Safe auth recovery |
| Reused link | Required | Required | Safe auth recovery |
| Offline callback | Required | Required | No private access |
| English light/dark | Required | Required | Approved composition |
| Arabic RTL light/dark | Required | Required | Mirrored composition |
| Enlarged text | Required | Required | Readable/reflow only as needed |

## Visual completion

At the declared ordinary-phone context:

- capture implementation screenshot;
- compare side-by-side or overlay against the approved reference;
- record functional status separately from visual-fidelity status.

Also capture/verify compact phone, dark mode, RTL/Arabic, tablet/orientation as
required by the binding sidecars and constitution.

Accessibility evidence is separate from screenshots and must verify roles,
labels, disabled/busy states, and navigation semantics.

## Release blockers

Do not call #321 release-ready while any of these remain:

- custom SMTP not configured;
- callback E2E not proven;
- binding verifier failing;
- required visual/accessibility evidence missing;
- Google OAuth regression;
- known secret/token logging.
