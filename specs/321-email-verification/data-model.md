# Data Model: Complete Email Verification

## Summary

Supabase Auth remains the source of truth for whether the email is verified.

The approved 2026-10-04 resend policy adds one persisted anti-abuse model. It
does **not** store verification codes and does **not** duplicate Supabase Auth.

## 1. Supabase Auth User

Owned by Supabase Auth.

Relevant state:

- email/password user exists;
- email confirmation pending;
- confirmation succeeds through a six-digit code or compatible legacy callback;
- Supabase session is issued after successful verification.

Monyvi MUST NOT add an application-level `is_email_verified` column.

## 2. Verification Flow UI State

Ephemeral/client state:

- pending normalized email;
- screen state:
  - form
  - verificationCode
  - verificationSuccess
  - resetSent
- six-digit input value;
- verification request pending;
- last locally known successful send timestamp;
- resend cooldown deadline;
- verification-flow navigation suppression.

The OTP itself is never persisted to app storage.

If the current device does not know the last send timestamp, it may show generic
ten-minute expiry copy rather than a fabricated countdown.

## 3. Resend Limiter Table

Proposed table: `email_verification_resend_limits`

Suggested columns:

| Column              | Type                 | Contract                                                 |
| ------------------- | -------------------- | -------------------------------------------------------- |
| `email_key`         | text PK              | HMAC-SHA256 of normalized email using server-only pepper |
| `window_started_at` | timestamptz          | original successful send time for active window          |
| `last_sent_at`      | timestamptz          | latest successful original/resend timestamp              |
| `resend_count`      | smallint             | successful resends in active window, 0..3                |
| `reservation_id`    | uuid nullable        | in-flight atomic resend reservation                      |
| `reserved_at`       | timestamptz nullable | reservation recovery/timeout support                     |
| `created_at`        | timestamptz          | audit/maintenance                                        |
| `updated_at`        | timestamptz          | audit/maintenance                                        |

No raw email, password, OTP, token, callback URL, access token, or refresh token
is stored.

Direct anon/authenticated access is denied.

## 4. Private Atomic Database Operations

Migration-owned, service-role-only operations:

### register initial send

Input: keyed email digest and server timestamp.

Behavior:

- create active window if absent;
- do not reset an existing active window;
- set resend_count = 0 for a new window;
- last_sent_at = original send timestamp.

### reserve resend

Transactionally lock/update the limiter row.

Behavior:

1. if window expired, start a new 24-hour window and reset resend_count;
2. if last successful send is less than 120 seconds ago, return cooldown;
3. if resend_count >= 3, return limit reached;
4. if a live reservation exists, return busy/cooldown-safe denial;
5. otherwise create reservation_id and return permission to send.

### finalize resend

For the matching reservation only:

- increment resend_count exactly once;
- set last_sent_at to successful send time;
- clear reservation.

### release resend

For the matching reservation only:

- clear reservation without incrementing count.

Stale reservations need a bounded recovery rule so a crashed Edge Function does
not lock resend forever.

## 5. Edge Function Request/Response

The Edge Function receives the raw email only transiently in the request body,
normalizes it in memory, computes the keyed digest, and does not log it.

Operations:

- `register_initial`
- `resend`

The client does not require a public detailed status lookup.

Safe response concepts:

- success;
- cooldown / try later;
- daily-window limit / try later;
- temporary failure.

Responses must not disclose whether an arbitrary address corresponds to an
account beyond what the existing Supabase auth flow already safely exposes.

## 6. Verification Success State

No persisted model.

The success screen exists after:

- successful `verifyOtp`; or
- successful compatible signup-confirmation callback.

The authenticated session exists, but dashboard routing is intentionally
suppressed until Continue is pressed.

## Database / Sync Impact

- New Postgres anti-abuse table: yes.
- New private atomic SQL functions: yes.
- WatermelonDB schema: none.
- Financial actions: none.
- Sync protocol: unchanged.
- Verification token persistence: none.
