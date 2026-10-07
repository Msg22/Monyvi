# Research: Fix Issue #255 Sync Pagination and Checkpoint

All unknowns below were already decided by approved handoffs and the proven Red
baseline. No NEEDS CLARIFICATION remains. HOW details consolidated here so the
spec stays WHAT/WHY.

## 1. EOF by exact remaining count

- Decision: Continue while `count > rows`; EOF only when `count == rows`,
  including valid zero. Fail only on missing/invalid count,
  empty-with-positive-count, malformed/non-advancing cursor, query error.
- Rationale: Page-size heuristics caused the 1501-row silent omission; the count
  comparison is cap-independent and testable at every boundary.
- Alternatives considered: page-size `< cap` heuristic (rejected — the exact Red
  failure); offset pagination (rejected — unstable under concurrent writes);
  offset+reconcile (rejected — more machinery, same guarantee).

## 2. Raw timestamp + UUID cursor

- Decision: Cursor is the raw PostgreSQL timestamp plus UUID tie; never
  round-trip through `Date` microseconds.
- Rationale: Equal-timestamp rows need an exact, stable order; the approved rule
  keeps raw server values end-to-end instead of converting through client
  `Date`, whose microsecond fidelity across that conversion is not guaranteed.
  No execution proof is claimed here; precision is verified by the planned
  tie-break test.
- Alternatives considered: `Date`-based cursor (rejected — fidelity across
  conversion not guaranteed); UUID-only cursor (rejected — loses time ordering
  for incremental pulls).

## 3. Shared watermark H as delivery boundary

- Decision: One upper watermark shared with the existing marketV2 watermark; H
  bounds delivery for eventual convergence, not an immutable snapshot.
- Rationale: H does NOT make cross-table rows transactionally consistent across
  REST; it prevents permanent omissions through the eventual next cut, so a
  truncated pull is completed rather than checkpointed away.
- Alternatives considered: per-table watermarks (rejected — inconsistent
  cross-table reads); immutable snapshot export (rejected — not available over
  the REST path; don't repaginate marketV2).

## 4. Ordinary fence + seal instead of advisory-only

- Decision: One ordinary server writer fence held through commit for writers
  (`FOR SHARE` semantics), seal rows for the ordinary barrier (`FOR UPDATE`
  semantics); early fence hooks run before existing RPC/advisory locks.
- Rationale: The chosen row barrier carries explicit state and follows the
  existing locking pattern; other proper protocols are not disproven. The fence
  gives publication-after-acquire/before-commit with post-seal stamps strictly
  after H and no guessed future clock.
- Alternatives considered: advisory-only fencing (rejected — no explicit barrier
  state in the existing pattern); entry-wrapper functions (rejected — duplicates
  pre-lock rejections or renames audited bindings).
- Pinned source (lead-verified): the active metals private entry lives in
  `075_metals_persistence_hardening.sql:542–642` with the Cairo future-sale-date
  guard retained; no extra private-entry hooks warranted.

## 5. Narrow deleted-ID journal

- Decision: Snapshot hard deletes publish once via (publication timestamp +
  unique entry ID) cursor carrying OLD table/user/row; bounded authenticated
  owner page RPC; no prune.
- Rationale: Tombstones must survive exactly once across retries without
  widening feed scope to unsupported hard deletes or ownership mutations.
- Alternatives considered: full-row tombstones (rejected — wider scope, more
  data); rescanning for gaps (rejected — cannot distinguish delete from
  never-existed).

## 6. Owner joins for children

- Decision: Server-side ownership join including owned soft-deleted parents
  (especially deleted children); strip embedded owner projection before the
  local record transform; keep canonical typed column projections.
- Rationale: Fetched-ID `.in(...)` lists hit URL/URI caps (the 1001-parent Red
  shape); joins scale and respect ownership server-side.
- Alternatives considered: chunked `.in(...)` lists (rejected — transport caps
  persist); client-side orphan filtering (rejected — silent drops).

## 7. Single buffered apply + fail-closed checkpoint

- Decision: Buffer all pages/tombstones, then one apply with one checkpoint;
  failed pull advances nothing; post-pull push failure keeps the pull; dirty
  groups stay retryable.
- Rationale: The Red mechanism was ONE checkpoint persisted after a truncated
  returned pull (not per-page checkpoints); atomic apply plus fail-closed
  metadata keeps retry safe and idempotent.
- Alternatives considered: per-page checkpointing (rejected — checkpoints must
  track completed applies only); auto-retry wrapper (rejected — blanket retry is
  out of scope; failures must surface).
