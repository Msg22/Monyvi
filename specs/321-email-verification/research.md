# Research: Complete Email Verification

**Date**: 2026-09-21  
**Issue**: #321  
**Branch**: `codex/issue321-email-verification`

## Decision 1 — Keep Supabase Auth as the verification authority

**Decision**: Use Supabase Auth's native email/password confirmation flow.

**Rationale**:

- Monyvi already uses Supabase Auth for registration, sign-in, sessions, reset,
  and OAuth.
- Supabase already owns confirmation tokens, expiry, `email_confirmed_at`,
  resend, and session issuance.
- A custom token table or Edge Function would duplicate security-sensitive
  infrastructure and create a second source of truth.

**Alternatives considered**:

- Custom verification table/token service — rejected as duplicate security
  infrastructure.
- Replace Supabase Auth — rejected; no product or cost benefit for release.

References:
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/reference/javascript/auth-signup

## Decision 2 — Use Resend as the initial production SMTP provider

**Decision**: Configure Supabase Auth with Resend custom SMTP for the first
release.

**Rationale**:

- Supabase recommends custom SMTP for production; its default email sender is
  intended for limited/testing use.
- Resend supports SMTP, domain verification, delivery logs, and a free initial
  allowance suitable for Monyvi's expected launch volume.
- Research on 2026-09-21 found the free plan at 3,000 emails/month and 100/day.
  Signup, resend, and password-reset emails all consume that allowance.

**Alternatives considered**:

- Supabase default sender — rejected for production readiness/deliverability.
- Brevo Free — higher daily allowance, but the free-plan branding tradeoff is
  less appropriate for Monyvi auth mail.
- AWS SES — inexpensive and scalable but more setup/operational complexity for
  the first release; remains a future migration option.

References:
- https://supabase.com/docs/guides/auth/auth-smtp
- https://resend.com/pricing

## Decision 3 — Keep `monyvi://auth-callback` for v1

**Decision**: Use the existing custom mobile scheme for the first release and
explicitly direct signup/resend verification callbacks to it.

**Rationale**:

- The app already declares the `monyvi` Expo scheme.
- Existing Google OAuth uses the same callback.
- Supabase supports native mobile deep-link callback URIs.
- This minimizes release scope and avoids adding website association files and
  platform entitlement work during this issue.

**Alternatives considered**:

- Universal Links / Android App Links — better long-term UX/security posture but
  larger platform/domain setup; defer to a separate approved issue.

Reference:
- https://supabase.com/docs/guides/auth/native-mobile-deep-linking

## Decision 4 — Consolidate callback session completion

**Decision**: Reuse one focused callback/session-completion primitive for
browser OAuth and email verification.

**Rationale**:

- Current OAuth code already parses fragment access/refresh tokens and PKCE
  authorization codes.
- Duplicating that logic in `auth-callback.tsx` would create inconsistent
  security/error behavior.
- The route should orchestrate UI/navigation; the service layer should own auth
  protocol handling.

**Alternatives considered**:

- Duplicate parsing inside the route — rejected by service-layer separation and
  DRY/SOLID requirements.
- Make AuthContext parse deep links — rejected because AuthContext should remain
  session-state propagation rather than protocol orchestration.

## Decision 5 — Detect unverified sign-in by stable auth error code

**Decision**: Treat Supabase `email_not_confirmed` as the signal to enter the
existing verification-pending flow.

**Rationale**:

- It is machine-readable and avoids fragile localized message matching.
- The app already distinguishes auth errors by stable code in
  `auth-service.ts`.

**Alternatives considered**:

- Match provider error message text — rejected as unstable and localization
  unsafe.

## Decision 6 — Enable confirmation in local Supabase and keep email local

**Decision**: Local Supabase must require email confirmation and use its local
email test inbox/capture service for deterministic development/E2E.

**Rationale**:

- Current local `enable_confirmations = false` hides the release behavior.
- Tests must not consume production Resend quota or depend on external mailbox
  delivery.
- Local capture enables deterministic retrieval of the generated confirmation
  link.

**Alternatives considered**:

- Keep local auto-confirm — rejected because verification regressions remain
  invisible.
- Use Resend during local E2E — rejected because it adds network/flakiness and
  consumes production-like quota.

## Decision 7 — No schema or financial-data changes

**Decision**: No Supabase database migration, WatermelonDB schema change, or
sync-contract change is part of #321.

**Rationale**:

- Verification state belongs to Supabase Auth.
- The pending email/resend state is ephemeral pre-auth UI state.
- No financial domain data is created before verified authentication.

## Decision 8 — Approved verification UI is a full auth-state composition

**Decision**: Use the three variants approved by Mohamed on 2026-09-21:
English light, English dark, and Arabic light.

**Rationale**:

- The direction originated from Issue #780's deterministic auth mockup source.
- Mohamed explicitly approved the rendered verification state.
- The current production `VerificationPendingView` materially drifted by
  introducing a card and moving the back action inside it.

**Binding note**: The three reference images and their binding metadata were
explicitly approved on 2026-09-21. Their current image, metadata, and combined
approval revisions match and are authoritative for implementation.
