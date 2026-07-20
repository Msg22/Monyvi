# Contract: SMS Scan Session And Checkpoint

## Scan Kinds

- `initial`: no valid checkpoint; rolling 30-day inbox range.
- `incremental`: ordinary Sync new SMS; checkpoint overlap when valid, otherwise
  rolling 30-day fallback.
- `history`: deliberate Rescan recent messages; rolling 30-day range and
  cooldown rules.
- `live`: one delivered message; shares server capability allowances but has no
  batch per-scan limit or history cooldown.

## Session Identity

Each scan has an opaque unique `scanSessionId`, fixed `startedAtMs`, pinned
`userId`, current `installationId`, and stable scan kind. Every async stage must
verify the pinned user before persistence or visible result publication. Final
oversized-outcome/checkpoint writes use the same fixed `startedAtMs` and
revalidate both cancellation and the pinned user before and after asynchronous
persistence. Rows returned outside the inclusive lower and upper scan bounds are
ignored even when a platform reader returns them.

Batch parser requests carry the fixed scan-start clock to the authenticated Edge
boundary. The Edge rejects implausibly future scan clocks, but permits later
chunks from a long-running or resumed scan. The client clock establishes the
session cutoff while the current server clock caps it to the rolling lookback
plus a bounded five-minute Edge/transit grace, so an old or forged client clock
cannot expand the historical window. Server time remains authoritative for
future-message rejection and usage/cooldown accounting.

## Candidate Ordering

```text
receivedAtMs descending
smsFingerprint ascending for equal timestamps
```

This order is applied before scan-capacity admission and is independent of inbox
order, chunk concurrency, and completion order.

## Durable Known States

A considered fingerprint is durable for checkpoint calculation when it is:

- already saved in a non-deleted transaction/transfer;
- excluded by deterministic local non-transaction rules;
- matched/rejected by an active trusted local template with a durable result;
- represented by supported active-draft/dismissed state after issue #770;
- represented by a valid synchronized AI-negative outcome;
- represented by a non-expired installation-local oversized outcome.

A suggestion held only in memory, quota deferral, unresolved result, provider
failure, malformed/incomplete response, cancellation, or stale-user result is
not durable.

## Checkpoint Rules

- The record is keyed by current user and installation.
- Invalid, future, foreign-user, foreign-installation, or unsupported-version
  data is ignored.
- A checkpoint whose processing-policy version no longer matches current cutoff,
  local exclusion, trusted-catalog, fingerprint, or durable-state semantics is
  invalidated and falls back to the rolling window.
- Advancement is monotonic by `(receivedAtMs, smsFingerprint)`.
- The new boundary cannot cross the earliest considered non-durable candidate.
- A checkpoint never suppresses fingerprint lookup.
- History scans and initial scans may establish the checkpoint; incremental
  scans may advance it; live delivery does not directly move the inbox cursor.

## Partial Completion

Accepted local/AI successes remain in the active review session. Deferred work
stays only in the device inbox in issue #769. No raw-message draft persistence
or resume promise is made until issue #770.
