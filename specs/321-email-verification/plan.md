# Implementation Plan: Complete Email Verification

**Branch**: `codex/issue321-email-verification` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/321-email-verification/spec.md`

## Summary

Complete Monyvi's already-approved email/password verification lifecycle without
adding a second verification backend. Supabase Auth remains the verification
authority; Resend supplies production SMTP delivery. Mobile work consolidates
auth callback session completion, explicitly directs signup/resend links to the
existing Monyvi callback, recovers unverified sign-in into the existing
verification-pending state, enables local confirmation testing, and brings the
verification UI into fidelity with the approved references.

No database migration, WatermelonDB model change, sync-contract change, or new
Edge Function is required.

## Technical Context

**Language/Version**: TypeScript ~5.9.2  
**Primary Dependencies**: React Native 0.83.6, Expo ~55.0.27, Expo Router ~55.0.16, `@supabase/supabase-js` 2.106.0, Expo SecureStore, Expo WebBrowser/Linking  
**Storage**: No new application storage; Supabase Auth owns verification state; existing SecureStore owns sessions  
**Testing**: Jest/Jest Expo + React Native Testing Library; Maestro E2E; local Supabase auth email capture; manual release mailbox/device QA  
**Target Platform**: Android and iOS mobile app  
**Project Type**: React Native/Expo mobile application in npm/Nx monorepo  
**Performance Goals**: Callback processing adds only the auth-provider exchange/session work required to establish a session; no duplicate network round trip or blocking cloud sync beyond existing safe startup requirements  
**Constraints**: Fail closed before email confirmation; never log auth material; preserve Google OAuth; production SMTP secrets stay outside repo/mobile bundle; verification requires network connectivity; no schema/sync changes  
**Scale/Scope**: Initial v1 email/password cohort; Resend free-tier launch allowance is an operational constraint, not a product hard limit

## Constitution Check

### Pre-design gate

- **Business authority**: PASS — `docs/business/business-decisions.md` §3
  states email verification is required before sign-in succeeds.
- **Prior product approval**: PASS — feature 016 FR-015/SC-008 already requires
  the verification flow.
- **Service-layer separation**: PASS — auth protocol/session completion belongs
  in mobile services; route/controller remain orchestration/UI.
- **Authenticated routing safety**: PASS — no private route is allowed before
  session establishment and existing startup gates remain authoritative.
- **Offline-first**: PASS — no financial/local-first domain behavior changes;
  verification is an intentionally online pre-auth action.
- **Security/secrets**: PASS — no custom token persistence, no service-role or
  SMTP secret in mobile code, no raw callback/token logging.
- **Schema/sync**: PASS — no migration, data backfill, WatermelonDB, RLS, or
  sync-contract change.
- **Premium UI / approved mockup**: PASS — all three approved verification
  references have approved, fingerprinted binding sidecars with matching image,
  metadata, combined revisions, and explicit approval evidence.
- **TDD**: PASS — production code changes are planned test-first.
- **Localization/accessibility**: PASS — English/Arabic, RTL, themes, responsive
  variants, enlarged text, and separate accessibility evidence are in scope.

No constitutional violation requires a Complexity Tracking exception.

## Phase 0: Research Decisions

See [research.md](./research.md).

Resolved decisions:

1. Supabase Auth remains the confirmation authority.
2. Resend is the initial production custom SMTP provider.
3. `monyvi://auth-callback` remains the v1 mobile redirect.
4. Browser OAuth and email confirmation share callback session-completion logic.
5. Unverified sign-in is detected by stable `email_not_confirmed` code.
6. Local Supabase enables confirmations and captures mail locally.
7. No database/schema/sync changes.
8. The approved verification state is full-page, not card-based.

No technical `NEEDS CLARIFICATION` remains.

## Phase 1: Design

### Callback/session completion

Create or extract one focused service-layer primitive that accepts the full auth
callback URL, validates provider error/material shape, establishes a session
from supported fragment tokens or a PKCE authorization code, and returns a
stable result classification without leaking auth material.

The existing OAuth flow delegates to this primitive rather than retaining a
second parser.

### Signup and resend

The existing Supabase wrappers keep their public responsibilities and add the
canonical auth callback option for:

- email/password signup;
- signup verification resend.

Issue #20 may later add signup metadata to the same options object. If that work
becomes active, compose the options rather than overwriting metadata or
redirects.

### Unverified sign-in recovery

Keep `EmailAuthResult` structured enough for the controller/service layer to
distinguish `email_not_confirmed` from ordinary invalid credentials. The
controller retains the submitted normalized email and enters
`verificationPending`.

### Native callback route

`auth-callback.tsx` becomes an orchestrator:

1. receive/read the full native callback URL;
2. invoke callback session completion;
3. wait for/observe the existing auth state;
4. hand routing to the root/startup flow;
5. return failed callbacks to auth recovery.

It does not own onboarding/profile decisions.

### Verification UI fidelity

Use the approved #321 references. The current rounded card is removed in favor
of the approved full-page state composition while reusing:

- existing auth top bar;
- existing Monyvi logo;
- existing language control;
- design-system colors/typefaces;
- existing privacy/terms routes;
- existing resend/back behaviors.

No new visual state is invented for loading; preserve current disabled/busy
semantics.

### Local auth parity

Set local email confirmation on. Update test/e2e fixtures that previously
depended on local auto-confirm. Local email confirmation link retrieval stays
inside local Supabase test tooling.

### Production configuration

Production DNS, Resend credential entry, Supabase SMTP/Confirm-email settings,
and mailbox delivery verification are manual release configuration steps. They
must be documented/evidenced but secrets are not represented in Git.

## Project Structure

### Documentation

```text
specs/321-email-verification/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/
│   └── requirements.md
├── contracts/
│   └── email-verification-contract.md
├── mockups/
│   ├── verification-en-light.png
│   ├── verification-en-light.binding.md
│   ├── verification-en-dark.png
│   ├── verification-en-dark.binding.md
│   ├── verification-ar-light.png
│   └── verification-ar-light.binding.md
└── tasks.md
```

### Expected source/test touch points

```text
apps/mobile/
├── app/
│   └── auth-callback.tsx
├── components/auth/
│   └── VerificationPendingView.tsx
├── hooks/
│   └── useAuthScreenController.ts
├── services/
│   ├── auth-service.ts
│   └── supabase.ts
├── __tests__/
│   ├── app/
│   │   └── auth-redirect.test.tsx
│   ├── components/auth/
│   │   └── AuthStatusViews.test.tsx
│   ├── hooks/
│   │   └── useAuthScreenController.test.ts
│   └── services/
│       ├── auth-service.test.ts
│       └── supabase.test.ts
└── e2e/maestro/auth/
    └── ...

supabase/
└── config.toml
```

A focused sibling callback service/test may be introduced if extracting the
existing private helper from `auth-service.ts` would otherwise leave that file
with mixed responsibilities. The implementation should choose the smallest
SOLID boundary proven by the Red tests.

**Structure Decision**: Keep all auth protocol work in `apps/mobile/services`,
UI lifecycle in the auth controller hook, rendering in auth components, and
navigation orchestration in the Expo Router callback route.

## Post-design Constitution Re-check

- No schema, sync, or financial correctness gate introduced.
- Service/hook/component/route boundaries remain compliant.
- Authenticated runtime remains fail-closed.
- Secrets stay external.
- TDD and E2E coverage are explicit.
- Mockup-governed UI is authorized by the approved binding sidecars; any later
  reference-image or Binding Facts byte change requires renewed approval.
- Required visual and accessibility evidence is included in the implementation
  completion contract.

**Result**: PASS for technical planning; one explicit mockup-binding approval
gate remains before UI implementation/tasks can be finalized as executable.
