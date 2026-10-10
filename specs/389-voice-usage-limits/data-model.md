# Data Model: Add Transaction Voice Redesign, Usage Limits and Subscription-Ready Entitlements

**Feature**: 389-voice-usage-limits  
**Date**: 2026-09-27

This feature adds server-only operational quota state. It does **not** add
synchronized WatermelonDB user data and does not change financial transaction
persistence.

## 1. VoiceEntitlementPolicy (runtime contract)

Provider-independent policy returned by the entitlement resolver.

| Field                     | Type                              | Rules                                                     |
| ------------------------- | --------------------------------- | --------------------------------------------------------- |
| `mode`                    | `"metered" \| "unmetered"`        | Free launch uses `metered`                                |
| `dailyLimit`              | positive integer or null          | 5 for free launch; null only for unmetered technical mode |
| `burstLimit`              | positive integer                  | 2 initially                                               |
| `burstWindowSeconds`      | positive integer                  | 60 initially                                              |
| `reservationLeaseSeconds` | positive integer                  | 120 initially                                             |
| `policyVersion`           | non-empty string                  | Versioned operational policy identity                     |
| `source`                  | `"free_launch" \| "subscription"` | Subscription source reserved for future module            |

### Invariant

Provider-specific Gemini code never owns plan names, prices, or entitlement
decisions.

## 2. voice_ai_usage_windows (server-only table)

One active accepted local-day window per authenticated user.

| Field               | Type                  | Rules                                       |
| ------------------- | --------------------- | ------------------------------------------- |
| `user_id`           | uuid PK/FK auth.users | One current row per user                    |
| `time_zone`         | text                  | Valid IANA timezone accepted by server      |
| `local_date`        | date                  | Calendar date in accepted timezone          |
| `window_started_at` | timestamptz           | UTC instant of accepted local midnight      |
| `window_ends_at`    | timestamptz           | UTC instant of next accepted local midnight |
| `policy_version`    | text                  | Policy used when window was established     |
| `created_at`        | timestamptz           | server timestamp                            |
| `updated_at`        | timestamptz           | server timestamp                            |

### State rule

- If no row exists, establish one using current server time + valid caller
  timezone.
- If `serverNow < window_ends_at`, preserve the existing row even when the
  client reports another timezone.
- If `serverNow >= window_ends_at`, establish the next window using the current
  valid caller timezone.
- Window boundaries use timezone-aware database conversion and therefore may be
  23/24/25 hours around DST.

## 3. voice_ai_work_requests (server-only table)

Idempotency + reservation + provider-consumption record for one logical voice
submission.

| Field                    | Type                 | Rules                                                                              |
| ------------------------ | -------------------- | ---------------------------------------------------------------------------------- |
| `id`                     | uuid PK              | generated                                                                          |
| `user_id`                | uuid FK auth.users   | required                                                                           |
| `request_key`            | text                 | required, 1–160 chars                                                              |
| `time_zone`              | text                 | accepted usage-window timezone                                                     |
| `window_started_at`      | timestamptz          | copied accepted window                                                             |
| `window_ends_at`         | timestamptz          | copied accepted window                                                             |
| `status`                 | enum-like text       | reserved/provider_started/completed/completed_with_provider_error/released/refused |
| `decision_code`          | text                 | accepted/daily_limit/burst_limit/etc.                                              |
| `available_at`           | timestamptz nullable | earliest server-known availability                                                 |
| `reservation_expires_at` | timestamptz nullable | non-null only while reserved                                                       |
| `provider_started_at`    | timestamptz nullable | set exactly once on provider start                                                 |
| `created_at`             | timestamptz          | server timestamp                                                                   |
| `updated_at`             | timestamptz          | server timestamp                                                                   |

### Constraints

- unique `(user_id, request_key)`;
- no audio/transcript/financial payload columns;
- provider-start is idempotent;
- provider-started rows remain consumed in their accounting window regardless of
  final provider outcome; cleanup never refunds active-window consumption.

### Retention and cleanup

Owner-approved on 2026-10-07: 35 elapsed days (35 × 24 hours) from immutable
server `created_at`. Retries and status updates do not extend that cutoff.
Delete the whole eligible `voice_ai_work_requests` row, including request key;
no lifetime tombstone, third table or payload retention is introduced.

Eligibility requires all of the following under the same per-user lock used by
admission/start:

- `serverNow >= created_at + 35 elapsed days`; use server time, not a device
  clock or a local-calendar/DST interval.
- Terminal status: `completed`, `completed_with_provider_error`, `released`, or
  `refused`. Never delete `reserved` or `provider_started` work.
- No active reservation/lease/provider lifecycle and no participation in any
  current daily accounting window, burst interval or reserved capacity.

Cleanup is bounded and repeatable; eligibility is rechecked under lock. No
current `voice_ai_usage_windows` row or active count is deleted or reset by
request cleanup. An expired row may remain until a cleanup run or safety gates
permit deletion; existing replay rules still apply while it exists. After actual
deletion, the same key is treated as new through all ordinary admission gates.
The configured cleanup schedule and batch size must be tested with the
migration.

Technical execution parameters frozen on 7 October 2026: schedule cleanup hourly
at minute 17 (cron `17 * * * *`), with a hard maximum of 500 eligible
work-request rows per invocation. Use descriptive SQL constants/defaults and
test the job definition, bounded batch and repeated backlog drainage. Candidate
selection is not deletion authority: recheck terminal/current-accounting safety
under each candidate user's admission/start lock. Busy or unsafe rows may remain
retained until a later run; replay protection continues until actual deletion.
Cadence/batch tuning cannot change the 35 × 24 elapsed-hour cutoff, release
active work, refund quota or add client/hosted mutation authority.

## 4. VoiceAvailabilitySnapshot (public Edge/mobile contract)

| Field              | Type               | Meaning                                                                  |
| ------------------ | ------------------ | ------------------------------------------------------------------------ |
| `serverNow`        | ISO timestamp      | authoritative time anchor                                                |
| `timeZone`         | IANA timezone      | accepted/pinned current usage-window timezone                            |
| `dailyLimit`       | integer/null       | numeric entitlement or unmetered                                         |
| `remaining`        | integer/null       | effective remaining capacity after provider starts + active reservations |
| `resetAt`          | ISO timestamp/null | end of current local-day window                                          |
| `reason`           | nullable string    | daily_limit/burst_limit/etc.                                             |
| `availableAt`      | ISO timestamp/null | earliest current unblock time                                            |
| `burstAvailableAt` | ISO timestamp/null | temporary burst unblock                                                  |
| `policyVersion`    | non-empty string   | required operational policy identity                                     |

The canonical schema is `contracts/voice-ai-availability.openapi.yaml`. Current
free launch emits numeric `dailyLimit`/`remaining` and a non-null `resetAt`. The
existing future unmetered representation uses null for all three together,
preserves burst protection and policy identity, and is tested only with
controlled entitlement doubles; no unmetered launch policy or paid UI is
introduced. Snapshot `reason` is only `daily_limit`, `burst_limit`, or null;
`already_processed_result_unavailable` belongs to the enclosing parse refusal.

The client treats this as display/gating state only. The parse Edge Function
independently re-evaluates authoritative admission.

## 5. VoiceUsageDecision (server internal)

Reservation/start result:

- `requestId`
- `accepted/started`
- `decisionCode`
- `isReplay`
- `remaining`
- `resetAt`
- `availableAt`
- `timeZone`

## 6. Logical voice-request state machine

```text
validated request
      |
      v
reserve
  |        \
  |         -> refused (daily/burst/dependency) [0 units consumed]
  v
reserved
  |
  | definitely no provider start
  +----------> released [0 units consumed]
  |
  v
mark provider started
  |
  +--> provider_started [1 unit consumed permanently]
          |
          +--> completed
          |
          +--> completed_with_provider_error
```

Replays during the 35-day horizon, and while the identity remains retained:

```text
same user + requestKey
  reserved -> reuse existing reservation
  provider_started/completed/error -> do not call provider again;
                                      result unavailable from quota ledger
  refused/released -> return prior terminal decision unless a new logical
                      request uses a new key
```

After eligible identity deletion, a repeated key follows the validated-request
state machine as a new admission, never bypassing auth/consent/quota gates.

## 7. Sync/storage boundaries

The following are server-only and MUST be excluded from:

- Watermelon schema generation;
- Watermelon migration generation;
- mobile sync pull/push table lists.

Tables:

- `voice_ai_usage_windows`
- `voice_ai_work_requests`

Quota state is read by the app only through the authenticated availability Edge
Function.

## 8. Future subscription integration

A future subscription module may replace the free-launch entitlement resolver
input, but must return the same `VoiceEntitlementPolicy` shape. This feature
does not define plan names, prices, billing state, or paid-plan quota values.

## 9. Unified Add Transaction Mode (client route state)

```ts
type AddTransactionMode = "manual" | "voice";
```

Rules:

- missing/invalid route mode -> `manual`;
- FAB -> `manual`;
- center mic/onboarding/review retry -> `voice`;
- Manual form stays mounted across safe mode switches;
- mode switching is disabled while Voice is recording, paused, finalizing, or
  analyzing;
- Voice exhausted/burst-limited/unavailable never disables Manual.

## 10. Voice Availability UI State

The client derives only presentation state from the authoritative
`VoiceAvailabilitySnapshot`:

- available with remaining count;
- burst-limited until `availableAt`;
- daily exhausted until `resetAt`;
- authoritative availability unavailable/recovery.

The client never decrements an authoritative durable counter locally. It
refreshes after voice attempts and on authoritative refusal.

## 11. Request Metadata

Each provider-starting submission carries:

| Field             | Type               | Rule                                                                                                          |
| ----------------- | ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `requestKey`      | opaque string/UUID | generated once per logical submission and reused only for replay; 35-day server identity protection           |
| `callerTimeZone`  | IANA timezone      | device context; validated/pinned server-side                                                                  |
| `callerLocalDate` | optional string    | existing relative-date context; omitted/empty uses current UTC date; non-empty must be a real YYYY-MM-DD date |

`callerTimeZone` remains required and accepts 1–128 characters followed by
authoritative IANA validation. The relative-date fallback never determines the
quota timezone or bypasses missing/invalid quota context.

No field contains raw audio/transcript/financial content.
