# Data Model: Fix Issue #255 Sync Pagination and Checkpoint

No WatermelonDB row or schema change. No new table for active rows. Entities
below are pull-protocol shapes (server view + client cursor state).

## Pull page

- Fields: `rows` (bounded list, canonical typed projections), `count` (exact
  remaining total for the bounded query), `upperWatermark` (H).
- Validation: `count` present and non-negative integer; `rows.length <= count`;
  cursor present unless `count == rows` on the final page.
- Transitions: `count > rows` → continue with next cursor; `count == rows` → EOF
  (includes valid zero).

## Resume cursor

- Fields: raw server timestamp + row UUID tie.
- Validation: exact values, never converted through client `Date`; non-advancing
  cursor (equal to previous) is a failure, not EOF.

## Watermark H

- Fields: single upper bound shared with the marketV2 watermark for the
  traversal; frozen once per traversal for snapshot filters.
- Validation: finite, millisecond precision, not future, not beyond the
  validated market barrier, no clock regression across pages.

## Writer fence / seal

- Fields: fence acquisition marker; ordinary barrier S; requested completed
  traversal bound H; fresh committed server market barrier M.
- Validation: require H <= M, advance S = max(S, H), and return H unchanged.
  Publication stamps are assigned after fence acquisition, before commit;
  post-seal stamps are strictly after S.
- Snapshot INSERT stamps `created_at`; payload UPDATE preserves it and its
  existing 90-day retention eligibility. DELETE/INSERT replacement publishes a
  new identity and journals the old one.

## Journal entry (tombstone)

- Fields: publication timestamp, unique journal entry ID, OLD table, OLD user,
  OLD row identity.
- Validation: emitted only for actual snapshot hard deletes (covers the known
  producer DELETE→reINSERT pattern); never pruned; retry-safe (entry ID
  idempotency key).
- Cursor: (publication timestamp, unique entry ID); bounded authenticated owner
  page RPC.

## Buffered apply unit

- Fields: all buffered pages + tombstones, one checkpoint value.
- Validation: applied atomically or not at all; checkpoint advances only on
  success; dirty groups untouched by pull outcomes.

## Explicitly out of model

- New client row types are generated from the owned local backend later.
- No financial-action, revision, or evidence shape changes (FR-011).
- No 90-day `created_at` filter change (frozen once per traversal).

## Approved continuation — existing rows and local metadata only

No new table, schema version, generated model, financial payload or journal
record type is introduced. PR381's H, raw page cursor and buffered-apply
contracts remain unchanged.

### Historical-recovery receipt

- Storage: existing database-local metadata.
- Key: `__monyvi_sync_historical_recovery:issue255-v1:${userId}`.
- Complete value: the literal string `complete`; no H/timestamp payload.
- Scope: the captured authenticated owner, independent of schema version.
- Transition: absent -> complete only after actual successful SDK sync/apply and
  owner checks, with all required canonical evidence safely delivered.
- An attempt starting with any canonical unresolved owned financial root remains
  absent for its entire duration, including after successful push
  reconciliation. A subsequent full attempt hydrates withheld records first.
- Failure/skip does not complete; a crash before completion may repeat reads.
  Good pull followed by failed push keeps applied state/checkpoint but leaves
  the receipt absent. Another owner's receipt never satisfies this owner.

### Existing roots and effects

Unresolved means the six canonical states listed in contracts/sync-pull.md
section 11, not a test of SDK dirty status. Preserve the complete existing
unresolved local root and colliding effects under their validated immutable
identity; do not replace local outcome/compensation evidence with terminal
remote fields before actual local reconciliation.

Account/action/effect IDs and canonical payload/hash remain stable. SQL 076
continues to define immutable effect evidence. The existing effect model's
compensated_at remains nullable numeric local time; strict transport conversion
does not change its schema. Hydration never reapplies balances.

### Snapshot repair candidate

An ephemeral candidate is a local snapshot identity that is current-owner,
clean, absent from the completed remote set and inside created_at (cutoff,H].
The cutoff and H are shared with that attempt's full snapshot pulls. Candidates
are not persisted as a new registry. The installed SDK replacement query checks
owner/window/synced status inside its apply writer, preserving dirty/foreign/
out-of-window absence candidates and pending deletion intent. Explicit journal
IDs retain their existing authoritative behavior. Repeat application is
idempotent; normal journal delivery remains.

### Completion evidence

A receipt represents the bounded repair, not resolution of deferred #339
liveness/already-corrupted terminal actions, cloud deployment or device upgrade
validation. Refer to quickstart.md C01–C13 and tasks.md T020–T027 for evidence.
The single final check batch supersedes additional per-file Red wording;
historical PR381 results and the reported 17-test b2 Red remain distinct.
