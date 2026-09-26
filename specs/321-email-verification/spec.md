# Feature Specification: Complete Email Verification

**Feature Branch**: `codex/issue321-email-verification`  
**Created**: 2026-09-21  
**Status**: Ready for implementation  
**Issue**: #321 — Complete production email verification for email/password sign-up  
**Input**: Complete the already-approved email-verification requirement from feature 016 and make email/password registration release-ready.

## User Scenarios & Testing

### User Story 1 - New User Verifies Email Before App Access (Priority: P1)

A new user creates an account with an email address and password. Monyvi tells the
user to check that inbox. The user follows the verification link and returns to
Monyvi as an authenticated user. Private financial features never become
available before verification succeeds.

**Why this priority**: Email ownership is a release requirement and the main
security property of this feature.

**Independent Test**: Register a fresh email account, verify that private routes
remain unavailable, follow the delivered verification link, and confirm the app
continues through the existing authenticated startup flow without requiring the
credentials to be entered again.

**Acceptance Scenarios**:

1. **Given** a new email/password registration, **When** account creation
   succeeds but the email is not yet verified, **Then** the approved
   verification-pending state is shown and private app features remain
   inaccessible.
2. **Given** an unverified account, **When** the user follows a valid
   verification link, **Then** Monyvi establishes an authenticated session and
   hands routing to the existing authenticated startup flow.
3. **Given** a user who has not verified the email, **When** the device is
   offline, **Then** Monyvi does not grant private access merely because a local
   registration attempt exists.

---

### User Story 2 - Unverified Returning User Can Recover (Priority: P1)

A user who already registered but did not finish verification tries to sign in.
Instead of seeing a raw authentication-provider error, the user returns to the
same verification-pending experience and can request another email.

**Why this priority**: Users commonly close the app or miss the first email.
Recovery must be obvious and must not strand a valid account.

**Independent Test**: Attempt to sign in with valid credentials for an
unverified account, verify the pending screen is shown with the submitted email,
request a resend, then complete verification from the new message.

**Acceptance Scenarios**:

1. **Given** valid credentials for an unverified account, **When** the user
   attempts to sign in, **Then** the approved verification-pending state is
   shown with the correct email address.
2. **Given** the verification-pending state, **When** the user requests a resend,
   **Then** another verification message is requested and conflicting repeated
   actions remain blocked while that request is pending.
3. **Given** the verification-pending state, **When** the user returns to sign
   in, **Then** the existing sign-in form is restored without granting access.

---

### User Story 3 - Invalid Verification Link Fails Safely (Priority: P2)

A user opens an expired, malformed, already-used, or otherwise invalid
verification link. Monyvi explains that authentication did not complete and
returns the user to an appropriate auth recovery path without exposing secrets
or mounting private content.

**Why this priority**: Email links expire and are forwarded or reopened. Failure
must be safe and understandable.

**Independent Test**: Open each supported invalid-link case and confirm no
authenticated private route is visible, no secret data is displayed, and the
user can return to the auth flow.

**Acceptance Scenarios**:

1. **Given** an invalid or expired verification callback, **When** Monyvi opens
   it, **Then** no authenticated session is accepted from that callback.
2. **Given** a malformed callback without usable authentication material,
   **When** it is processed, **Then** the app returns to auth recovery rather
   than hanging or entering private routing.
3. **Given** a callback that contains provider error information, **When** the
   error is surfaced, **Then** user-visible copy remains friendly and no token,
   raw callback URL, or provider secret is displayed.

---

### Edge Cases

- Confirmation link opens while the app is fully closed.
- Confirmation link opens while the app is already running.
- The link was already used.
- The verification token is expired.
- The callback contains neither usable tokens nor an authorization code.
- The callback contains an explicit authentication-provider error.
- The user taps resend repeatedly or while a resend is already in flight.
- The user changes language while on the verification state.
- The app is offline when signup, resend, or verification is attempted.
- A Google OAuth callback still completes after callback handling is shared.
- Password-reset callback behavior does not regress.

## Requirements

### Functional Requirements

- **FR-001**: Email/password registration MUST require email verification before
  the user can access private Monyvi functionality.
- **FR-002**: An unverified registration MUST show the approved
  verification-pending experience with the registered email address.
- **FR-003**: A valid verification link MUST return the user to Monyvi and
  establish the authenticated state needed by the existing startup flow.
- **FR-004**: Authenticated profile/onboarding routing MUST remain owned by the
  existing startup flow after verification; verification MUST NOT introduce a
  competing routing authority.
- **FR-005**: A valid email/password sign-in attempt for an unverified account
  MUST enter the verification-pending recovery flow instead of exposing raw
  provider error text.
- **FR-006**: Users MUST be able to request another verification email from the
  verification-pending state.
- **FR-007**: Resend MUST prevent conflicting duplicate actions while a request
  is active and MUST provide localized success/failure feedback.
- **FR-008**: Invalid, expired, malformed, and already-used callbacks MUST fail
  closed and MUST NOT expose private app content.
- **FR-009**: The verification state MUST support English and Arabic, LTR/RTL,
  light/dark themes, safe areas, compact phones, ordinary phones, tablets,
  orientation changes, and enlarged text according to the approved composition
  and repository responsive rules.
- **FR-010**: Production verification email delivery MUST use a production-ready
  transactional sender under Monyvi control rather than a demo-only sender.
- **FR-011**: Development and automated verification MUST be possible without
  consuming production email-delivery quota.
- **FR-012**: Monyvi MUST continue to use the existing authentication provider's
  verification state as the source of truth; no custom verification-token table
  or competing account-verification system may be introduced.
- **FR-013**: Verification handling MUST NOT log or display access tokens,
  refresh tokens, verification tokens, SMTP credentials, or complete callback
  URLs containing authentication material.
- **FR-014**: Existing Google OAuth authentication MUST remain functional.
- **FR-015**: Existing password-reset request/callback behavior MUST not regress;
  completing the separate password-reset UX is outside this feature.
- **FR-016**: The first-release mobile redirect remains the existing Monyvi
  custom auth callback scheme. Universal/App Links require separate approval.

### Key Entities

- **Email Verification State**: The authentication provider's authoritative
  indication that the account email is unverified or verified.
- **Verification Callback**: A one-time authentication callback that may contain
  valid session material, an authorization code, or an error/invalid state.
- **Verification Pending UI State**: Ephemeral pre-auth UI state containing the
  email being verified and resend activity; it is not a new persisted business
  entity.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of new email/password accounts in release configuration are
  denied private app access until email verification succeeds.
- **SC-002**: The local end-to-end verification journey succeeds from fresh
  signup through delivered test email, callback opening, session establishment,
  and authenticated routing.
- **SC-003**: 100% of tested unverified sign-in attempts enter the
  verification-pending recovery state and retain the correct email for resend.
- **SC-004**: 100% of the invalid-link test matrix fails closed with zero private
  route exposure and zero authentication secrets in user-visible output or
  logs.
- **SC-005**: Before release, verification email delivery is successfully
  exercised against Gmail, Outlook/Hotmail, and at least one additional common
  mailbox provider, with any spam/suppression behavior documented.
- **SC-006**: The implemented verification state matches the approved ordinary
  portrait references and passes required dark, RTL/Arabic, responsive,
  enlarged-text, and accessibility evidence gates.
- **SC-007**: Existing Google OAuth and email/password sign-in regression tests
  remain green after the callback path is consolidated.

## Assumptions

- The behavior is already approved by `specs/016-remove-anonymous-auth` and
  `docs/business/business-decisions.md`; this feature completes that existing
  requirement rather than introducing a new authentication method.
- The verification-state renders approved on 2026-09-21 and their approved,
  fingerprinted binding sidecars govern the visual implementation.
- A Monyvi-controlled sending domain/subdomain will be available before hosted
  SMTP configuration is finalized.
- Verification inherently requires network access; Monyvi's offline-first
  financial-data rules do not imply offline email confirmation.
- No database schema migration or WatermelonDB model change is required.
- Issue #20 may later add signup profile metadata; if it becomes active, both
  features must compose their signup options rather than overwrite each other.
