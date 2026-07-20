# Data Model: Launch SMS Scan Safeguards

## Persisted Entities

### SMS AI Negative Outcome (WatermelonDB + pull-only Supabase sync)

User-owned privacy-safe metadata for one canonical SMS fingerprint.

| Field                  | Type               | Rules                                            |
| ---------------------- | ------------------ | ------------------------------------------------ |
| `id`                   | UUID string        | Standard sync identity                           |
| `user_id`              | UUID string        | Required, indexed, immutable ownership           |
| `sms_fingerprint`      | string             | Required, canonical existing fingerprint         |
| `original_received_at` | timestamp          | Required; used for rolling-window eligibility    |
| `strike_count`         | integer            | Required, 1..3, monotonic                        |
| `is_terminal`          | boolean            | Required; true iff strike count is 3             |
| `terminal_at`          | timestamp nullable | Required when terminal                           |
| `last_classified_at`   | timestamp          | Required, server-authoritative for remote writes |
| `created_at`           | timestamp          | Required sync metadata                           |
| `updated_at`           | timestamp          | Required sync metadata                           |
| `deleted`              | boolean            | Required sync tombstone                          |

Constraints:

- Unique active row on `(user_id, sms_fingerprint)`.
- No raw body, sender, amount, currency, merchant, category, account/card,
  reference, phone, date extracted from content, or provider response.
- Strike count cannot decrease; concurrent valid negatives atomically cap at 3.
- Ordinary client sync may pull the row but must exclude it from push. All
  create/update/delete/terminal transitions are performed by the authoritative
  server path; mobile cannot fabricate, increment, clear, or terminalize it.
- Non-terminal rows are server-tombstoned after their original message leaves
  the rolling window. A valid AI transaction clears a non-terminal row. A
  trusted local recovery may supersede a terminal classification for review but
  does not clear the terminal server record.
- Account data deletion removes or tombstones the record according to the
  existing deletion policy.

### SMS AI Work Request (Supabase server-only)

Idempotency and state machine for one provider-bound request.

| Field                    | Type               | Rules                                                                                               |
| ------------------------ | ------------------ | --------------------------------------------------------------------------------------------------- |
| `id`                     | UUID               | Internal primary key                                                                                |
| `user_id`                | UUID               | Authenticated owner                                                                                 |
| `request_key`            | string             | Client-generated opaque idempotency identity                                                        |
| `capability`             | string             | `sms_full_parse` or `sms_category_enrichment`                                                       |
| `scan_session_id`        | string nullable    | Opaque correlation only                                                                             |
| `scan_kind`              | string nullable    | `incremental`, `history`, or `live` claim                                                           |
| `unit_count`             | integer            | Candidates or unique merchants                                                                      |
| `payload_bytes`          | integer            | Validated aggregate UTF-8 size                                                                      |
| `estimated_input_tokens` | integer            | Validated conservative estimate                                                                     |
| `status`                 | string             | `reserved`, `provider_started`, `completed`, `completed_with_provider_error`, `released`, `refused` |
| `decision_code`          | string             | Privacy-safe admission/refusal code                                                                 |
| `available_at`           | timestamp nullable | Earliest known capacity                                                                             |
| `reservation_expires_at` | timestamp nullable | Five-minute lease while still `reserved`                                                            |
| `provider_started_at`    | timestamp nullable | Consumption boundary                                                                                |
| `created_at`             | timestamp          | Server time                                                                                         |
| `updated_at`             | timestamp          | Server time                                                                                         |

Constraints:

- Unique `(user_id, capability, request_key)`.
- No raw SMS, merchant text, extracted financial values, or candidate
  fingerprints. Candidate fingerprints used by the terminal-outcome recheck are
  transient RPC input and are never persisted in this ledger.
- Replays return the existing decision identity and do not reserve, consume, or
  invoke the provider twice. If provider work started but its response was lost,
  the replay returns `already_processed_result_unavailable`; no financial
  response payload is cached in this table.
- No direct client CRUD policy.
- Expired still-reserved rows may be reclaimed. A row at or beyond
  `provider_started` can never be reclaimed or released.

### SMS AI Usage Event (Supabase server-only)

Append-only provider-start event used for rolling allowance and burst queries.

| Field        | Type      | Rules                                       |
| ------------ | --------- | ------------------------------------------- |
| `id`         | UUID      | Internal primary key                        |
| `request_id` | UUID      | Unique link to work request                 |
| `user_id`    | UUID      | Authenticated owner, indexed                |
| `capability` | string    | Full parse or enrichment                    |
| `unit_count` | integer   | Candidate or merchant attempts              |
| `started_at` | timestamp | Server-authoritative provider-start instant |

Constraints:

- One event per provider-starting work request.
- Internal provider retries do not create additional usage events; aggregate
  operational telemetry may count provider attempts separately without storing
  payload values.
- Rolling 24-hour units sum by user/capability.
- Rolling one-minute burst counts events by user/capability.
- Retention/cleanup must preserve the longest active enforcement and audit
  window; old operational rows may be pruned by a documented server job.

### SMS AI Scan Anchor (Supabase server-only)

Immutable server-accepted time boundary for one non-live scan session.

| Field                      | Type      | Rules                                                     |
| -------------------------- | --------- | --------------------------------------------------------- |
| `user_id`                  | UUID      | Authenticated owner; part of the primary key              |
| `scan_session_id`          | string    | Opaque client identity; part of the primary key           |
| `scan_kind`                | string    | `initial`, `incremental`, or `history`                    |
| `client_scan_started_at`   | timestamp | Fixed client clock supplied by the first accepted request |
| `accepted_scan_started_at` | timestamp | Immutable server-clamped scan boundary                    |
| `created_at`               | timestamp | Server time                                               |
| `updated_at`               | timestamp | Last successful reuse time                                |

Constraints:

- No direct client CRUD policy; the service-role resolver is the only writer.
- Reuse requires the same user, session identity, scan kind, and client clock.
- The accepted anchor is the later of the client clock and server receipt time
  minus the approved edge grace, and is reused for every request in the scan.
- Live SMS resolves a bounded timestamp without persisting a scan-anchor row.
- No candidate fingerprint, SMS content, sender, or financial value is stored.
- Rows older than the documented retention window may be pruned.

## Installation-Local Records

### Safe Scan Checkpoint

Stored in AsyncStorage under a versioned user-keyed namespace.

| Field                     | Type          | Rules                                       |
| ------------------------- | ------------- | ------------------------------------------- |
| `schemaVersion`           | integer       | Reject unknown versions                     |
| `processingPolicyVersion` | integer       | Invalidate when processing semantics change |
| `userId`                  | UUID string   | Must match current user                     |
| `installationId`          | opaque string | Must match current installation             |
| `boundaryReceivedAtMs`    | integer       | Finite, not future, monotonic               |
| `boundaryFingerprint`     | string        | Stable tie-breaker at equal timestamp       |
| `updatedAtMs`             | integer       | Diagnostic only                             |

Invalid, foreign, future, or incompatible-policy records are ignored and
removed. The checkpoint is never synchronized.

### Oversized Candidate Outcome

Bounded AsyncStorage collection keyed by user and installation.

| Field                  | Type    | Rules                                  |
| ---------------------- | ------- | -------------------------------------- |
| `smsFingerprint`       | string  | Canonical identity                     |
| `originalReceivedAtMs` | integer | Cleanup and rolling-window suppression |
| `reason`               | literal | `candidate_too_large`                  |
| `recordedAtMs`         | integer | Diagnostic/cleanup metadata            |

Expired entries are pruned once the original message is outside the rolling
window. The collection must have a defensive maximum size and deterministic
oldest-first pruning.

## Runtime Entities

### SMS Scan Policy

Versioned immutable configuration containing:

- rolling lookback and checkpoint overlap;
- available scan kinds and custom-range flag;
- full-parser request/scan/rolling/burst/payload/token limits;
- enrichment request/rolling/burst limits;
- five-minute pre-provider reservation lease;
- history cooldown;
- negative strike threshold;
- emergency capability enablement;
- deterministic refusal precedence.

### SMS Scan Session

One user-pinned scan with:

- opaque session ID and scan kind;
- user ID and installation ID;
- scan-start fixed clock and effective inbox boundary;
- candidates ordered by received timestamp/fingerprint;
- per-candidate durable-state classification;
- local/AI/negative/deferred/failed/oversized aggregate counts;
- earliest availability and completion state.

### Provider Completion Envelope

The full parser returns:

- request identity;
- completion status (`complete`, `truncated`, `safety_stopped`, `failed`);
- transaction array with unique submitted identities only;
- privacy-safe aggregate diagnostics.

Only `complete` plus full identity validation permits omission strikes.

### Safeguard QA Scenario

Named/versioned development-only record containing fixed policy overrides,
clock, inbox fixture, simulated provider sequence, initial local/synchronized
state, expected decisions, expected UI state, and reset namespace.

## State Transitions

### Work Request

```text
new -> refused
new -> reserved -> released
new -> reserved -> provider_started -> completed
new -> reserved -> provider_started -> completed_with_provider_error
```

No transition may return from `provider_started` to `released`.

### AI Negative Outcome

```text
absent -> strike_1 -> strike_2 -> terminal_strike_3
strike_1|strike_2 -> cleared_by_valid_ai_transaction
terminal_strike_3 + trusted_local_match -> local_review_result
```

Malformed/incomplete provider responses do not transition the state. Trusted
local recovery does not mutate or clear the terminal record.

### Scan Session

```text
created -> reading -> local_processing -> remote_processing -> review_ready
                                    \-> cancelled
                                    \-> failed_with_partial_results
```

Checkpoint persistence occurs only after final durable-state evaluation and is
independent of navigation to the review page.
