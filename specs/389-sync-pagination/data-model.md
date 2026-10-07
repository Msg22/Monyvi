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
