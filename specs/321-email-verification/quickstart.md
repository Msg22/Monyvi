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

- hosted confirm-email setting unverified;
- custom SMTP not configured;
- production redirect allow-list unverified;
- callback E2E not proven;
- binding verifier failing;
- required visual/accessibility evidence missing;
- Google OAuth regression;
- known secret/token logging.
