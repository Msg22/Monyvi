# Data Model: Metals Module Redesign

## Authority and Conventions

- WatermelonDB is the user-facing source of truth; every command commits locally first.
- Canonical decimal values are plain, non-exponent strings locally and PostgreSQL `numeric` remotely.
- Posted money uses integer minor units represented as strings locally and `bigint` remotely.
- Every financial revision is `"0"` or a positive no-leading-zero ASCII integer no
  greater than PostgreSQL signed-bigint max `9223372036854775807`, in local models and
  all command/RPC/reconciliation JSON. It is never a JavaScript number; PostgreSQL
  validates grammar and range before storing it as `bigint`.
- Every new syncable root table includes `id`, `user_id`, `created_at`, `updated_at`, and `deleted`.
- `asset_metals` keeps inherited ownership through immutable `assets.id`; every read, write, pull, push, RLS policy, and RPC validates the parent owner.
- Append-only evidence is never edited or hard-deleted by ordinary product actions.

## Existing Tables

### `assets`

Keeps holding identity, owner, metadata, and acquisition facts.

New columns:

| Column | Local / remote | Rule |
| --- | --- | --- |
| `purchase_price_decimal` | text nullable / numeric nullable | Authoritative positive total paid, including premium/workmanship; null only for preserved legacy-unavailable input |
| `purchase_currency` | text / text | ISO currency code |
| `acquisition_action_id` | text nullable / uuid nullable | Add/material-correction action whose role-specific acquisition reference set supports the current acquisition projection; retained canonically only when accepted |

The existing numeric `purchase_price` remains compatibility-only after backfill.
Name and notes are independent metadata eligible for partial LWW. Purchase facts are
financial facts and may change only through an accepted material-correction action.
New Add and every accepted material correction require a positive exact purchase price
and every other required acquisition fact. A missing, invalid, zero, or ambiguous
legacy purchase price backfills to null rather than a fabricated value; calculations
that require cost remain unavailable until a material correction supplies the complete
valid exact fact set.
`acquisition_action_id` links the current acquisition projection to one action-owned
reference set; it does not duplicate reference values or collapse Metal and currency
evidence into one row. That action's `metal_rate_references` children independently
use roles `acquisition_metal` and `acquisition_purchase_currency` when each input was
consumed. A locally complete optimistic action may install its link, but stale/rejected
reconciliation restores the verified prior link and only an accepted action remains
canonical. The link is null for migrated facts with no historical action and may also
remain null when no acquisition reference was consumed; migration never invents one.

### `asset_metals`

New columns:

| Column | Local / remote | Rule |
| --- | --- | --- |
| `weight_grams_decimal` | text nullable / numeric nullable | Positive canonical decimal; null only for preserved legacy-unavailable input |
| `purity_code` | text nullable / text nullable | Stable catalog member; null only as part of a wholly unavailable legacy purity tuple |
| `purity_factor_decimal` | text nullable / numeric nullable | Authoritative exact factor in the current projection; replaceable only by an accepted material correction; null only with the unavailable legacy tuple |
| `purity_catalog_version` | text nullable / text nullable | Catalog version in the current projection |

`purity_code`, `purity_catalog_version`, and `purity_factor_decimal` are one
authoritative current projection tuple on `asset_metals`; no purity catalog source
exists on `assets`. The three columns are either all present and valid or all null for
a preserved legacy row without one unique catalog match. Add sets a complete tuple and
only an accepted material-correction action may atomically replace it. Any material
correction of a legacy-incomplete holding must also replace every unavailable required
exact weight, purity, and acquisition fact, so the accepted current projection is
complete. Immutable before/after fact sets, including null legacy facts and the complete
replacement purity tuple/catalog snapshot, remain in append-only lifecycle/action evidence.
Later catalog edits never rewrite either current or historical snapshots.
`purity_factor_decimal` is the authoritative exact persisted factor; legacy numeric
`purity_fraction` is compatibility-only after backfill. `metal_type` is limited to
Gold and Silver for V1. Existing numeric weight fields remain compatibility-only.
Metal type cannot be corrected in place.

### `accounts` dependency

Issue #242 must add `financial_revision`, backfill existing accounts to revision `0`
without fabricating historical actions, and revision-guard every balance writer. The
account column is PostgreSQL `bigint`; its local and wire contract is the canonical
unsigned-integer string defined above, never a JavaScript number.
Metals computes the posted same-currency amount as exact minor units, mutates the
existing `accounts.balance` projection through the generic financial-action protocol,
and preserves the amount in immutable generic account-effect evidence. App-wide
account storage modernization remains in the separate decimal audit; it is not added
to #242. Only sale credit, credited Undo, and account compensation/replacement credit
are gated; sale without credit and other Metals work are not.

## New Tables

### `metal_holding_states`

One current projection per holding.

| Column | Type | Constraint |
| --- | --- | --- |
| `id` | text/uuid | Stable ID |
| `user_id` | text/uuid | Owner |
| `holding_id` | text/uuid | Unique FK to `assets` |
| `status` | text | `active`, `sold`, `disposed` |
| `financial_revision` | text / bigint | Canonical unsigned-integer string locally and in JSON; starts at `"0"`; increments once per accepted material action; never a JavaScript number |
| `effective_event_id` | text/uuid nullable | Current terminal/correction event |
| `effective_action_id` | text/uuid nullable | Null only for migrated revision-zero legacy projection; action that produced later projections |
| `is_visible` | boolean | False only for deleted mistaken active record |
| `reconciliation_state` | text | Derived action-sync state |
| standard sync columns | | Required |

Indexes: unique `holding_id`; `(user_id,status,deleted)`;
`(user_id,updated_at)`.
A migration may preserve an existing revision-zero legacy projection with null
`effective_action_id`; it MUST NOT fabricate an action. The first accepted real
material action transitions that row to its non-null immutable action ID, and every
later projection requires its effective action ID.

### `financial_action_groups` (generic T024 foundation root)

Generic owner-scoped durable command/outbox and replay record shared by transactions,
transfers, recurring payments, SMS, and Metals. Migration
`067_financial_action_foundation` freezes this non-account identity/storage interface at
T024. Full account integrity is a later T033 gate, not a prerequisite for Metals domain
persistence against this root.

| Column | Type | Constraint |
| --- | --- | --- |
| `id` | text/uuid | Opaque globally unique persistence row ID; never forced equal to `action_id` |
| `action_id` | text/uuid | Stable envelope ID; durable identity is owner-scoped `(user_id, action_id)` |
| `user_id` | text/uuid | Owner |
| `domain` | text | Owning domain, including `metals` |
| `kind` | text | Stable domain action type |
| `domain_reference_id` | text/uuid | Link to owning domain evidence |
| `payload_json` | text/jsonb | Canonical immutable payload |
| `payload_hash` | text | SHA-256 of canonical payload envelope |
| `account_guards_json` | text / jsonb | Canonical array of unique `{accountId, expectedRevision}` entries sorted by ascending canonical account ID; empty in Slice 3A or when no account effect exists; one entry per affected account when effects exist |
| `state` | text | State machine below |
| `server_outcome` | text nullable | accepted, idempotent, stale, rejected |
| `outcome_json` | text/jsonb nullable | Canonical durable replay outcome, including independent nullable holding winner evidence plus canonical account result/evidence arrays in account-ID order |
| `rejection_code` | text nullable | Stable internal code |
| standard sync columns | | Required |

Indexes: unique `(user_id,action_id)`; `(user_id,state,updated_at)`;
`(user_id,domain,created_at)`.

Holding-specific expected/canonical revision, target, event kind, and lifecycle links
belong to Metals domain evidence, never the generic root. `account_guards_json` is the
root's account-revision guard set. Every account effect has exactly one matching guard,
every guard names an affected account, and duplicate account IDs are forbidden. A
transfer therefore guards both source and destination; a credited Metals action has one
guard; an uncredited Metals action has an empty array.


A server `rejected` outcome after `local_complete` is never final success: preserve
its immutable outcome/rejection code, make its action recovery-visible, and enter
`reconciliation_incomplete` before any reportable projection/effect can remain
active. `PAYLOAD_HASH_MISMATCH` permanently binds that action ID/hash pair and cannot
be replayed as the same action.

### `metal_action_evidence`

Exactly one Metals domain record per generic action, introduced by `068_metals_domain`
and linked through the same stable `action_id`. The migration MUST enforce unique
`(user_id, action_id)` on `metal_action_evidence`; no retry, replay, or reconciliation
path may create a second row for that owner/action pair.

Fields: `id`, `user_id`, `action_id`, `holding_id`, `kind`,
`expected_holding_revision`, `canonical_holding_revision`, `domain_payload_json`, and
standard sync columns. Add uses a null expected holding revision; every later material
action requires it. Both revision fields are canonical unsigned-integer strings in
local/RPC/reconciliation contracts and PostgreSQL `bigint` columns; neither is ever a
JavaScript number. This row—not `financial_action_groups`—is authoritative for holding
revision CAS and links the root to holding state, lifecycle, and rate evidence.

### `metal_lifecycle_events`

Immutable business evidence.

Fields: `id`, `user_id`, `holding_id`, `action_id`, `kind`,
`occurred_at`, `payload_json`, `predecessor_event_id`,
`reverses_event_id`, `is_effective`, `is_history_visible`, and standard sync
columns. Unique `(user_id,action_id)`: one owner/action may create at most one
lifecycle row, regardless of kind. Events may become ineffective only
through deterministic reconciliation; their original payload never changes.
The future schema does not add per-event rejected-diagnostic columns: existing
effectiveness/visibility and the action-root rejection state retain enough durable
audit/sync/recovery evidence for Slice 2.

### `metal_rate_references`

Immutable references consumed by acquisition, valuation, sale, or correction.

Fields: `id`, `user_id`, `holding_id`, `action_id`, `role`, `kind`,
`instrument_code`, `value_decimal`, `unit`, `orientation`,
`provider_observed_at`, `source`, `quality`, `captured_freshness`,
`captured_at`, and standard sync columns. Future `068_metals_domain` creates the
unique index `(user_id,action_id,role)`, so one action role cannot retain multiple
instruments. `kind` is `metal` or `currency`;
instrument grammar is `metal:GOLD|metal:SILVER` or
`currency:<MetalsIsoCurrencyCode>`. Future `068_metals_domain` SQL CHECK
constraints enforce the approved role/kind/instrument/unit/orientation matrix:
metal roles `acquisition_metal`, `current_metal`, `terminal_metal` accept only
`usd_per_pure_gram`/`quote_per_base`; currency roles
`acquisition_purchase_currency`, `current_purchase_currency`,
`terminal_purchase_currency`, `terminal_proceeds_currency`,
`display_purchase_currency`, `display_preferred_currency` accept only
`usd_per_currency_unit`/`quote_per_base` or
`currency_units_per_usd`/`base_per_quote`. USD uses exact value `1`; inverse
metal references are invalid. These are raw observed values/provenance;
adapter/pure logic performs one canonical USD-per-base normalization. No persisted
unavailable-reason column is approved.

Acquisition facts never point at one generic purchase-rate row. The current
`assets.acquisition_action_id` links to the Add/correction action that produced the
projection; stale/rejected recovery restores the prior link, so only an accepted
action remains canonical. Its role-unique children preserve the independently
consumed `acquisition_metal` and `acquisition_purchase_currency` observations without
copying their values onto the holding projection. Before/after material-correction
action payloads retain the prior and replacement action/reference-set linkage as
append-only evidence.

### `account_financial_effects` (generic prerequisite evidence)

Immutable evidence linked to direct account mutation.

Fields: `id`, `user_id`, `action_id`, `account_id`, `domain`,
`kind` (including `sale_credit`, `sale_credit_reversal`, and
`conflict_compensation` for Metals),
`amount_minor_units`, `currency`, `accepted_account_revision`,
`reverses_effect_id`, `is_effective`, `compensated_at`, and standard sync columns.
`accepted_account_revision` uses the same canonical unsigned-integer string locally
and in JSON, with PostgreSQL `bigint` storage; it is never a JavaScript number. Unique
`(user_id,action_id,account_id,kind)` permits one independently guarded effect per
affected account and kind without weakening owner/action idempotency.
Metals holding/event evidence provides the holding link through the same action ID.
Metals sale effects are excluded from ordinary-income and budget-income queries.

### `market_rate_observations`

Server-generated, shared, pull-only exact rate input.

Fields: `id`, `batch_id`, `instrument_code`, `value_decimal`/`numeric`,
`unit`, `orientation`, `provider_observed_at`, `source`, `quality`, and
`created_at`. It may omit user and mutable sync columns under the constitution's
read-only-table exception. Current `market_rates` remains a compatibility source
for the preserved Live Rates UI during migration.

## Versioned Purity Catalog

Catalog entries are code, metal type, display label keys, exact factor, sort order,
effective version, and active flag. Holdings snapshot code, version, and factor so a
later catalog correction never rewrites history. V1 publishes only approved Gold and
Silver entries. Unsupported/retired codes remain readable but cannot be selected for
new holdings.

## State Machine

`pending_local -> local_complete -> sync_pending -> accepted`

Additional transitions:

- `sync_pending -> sync_failed -> sync_pending` on retry.
- `sync_pending -> rejected_compensating -> reconciled` for a stale outcome with
  complete per-resource canonical evidence.
- `sync_pending -> reconciliation_incomplete` for every server `rejected` outcome
  after local completion, and for stale/rejected outcomes lacking verified canonical
  evidence; financial actions remain locked.
- `reconciliation_incomplete -> rejected_compensating -> reconciled` only after
  canonical pull/RPC evidence permits exact-once compensation/restore, or a verified
  prior projection permits atomic safe rollback.
- `reconciliation_incomplete -> accepted` only for a same-ID/hash idempotent replay
  that proves server acceptance; hash mismatch cannot take this transition.
- Terminal action buttons are disabled while reconciliation is incomplete.

## Lifecycle Reduction

The canonical reducer contract is
[`contracts/reconciliation-contract.md`](./contracts/reconciliation-contract.md).
It is DB-neutral and returns the last valid projection or `null` plus immutable
accepted/rejected event records. It validates structural causality for effective,
ineffective, and incomplete evidence, retains one causal chain, and never permits
invalid events or descendants to affect ownership. Event IDs do not decide server
CAS winners; at equal time they stabilize only unrelated display/diagnostic order.

- Add: no prior state -> Active revision 0.
- Correct: Active -> Active; increment revision; preserve prior evidence.
- Sell: Active -> Sold; optional same-currency account credit; increment revision.
- Dispose: Active -> Disposed; required reason; no sale P/L or account credit.
- Delete: Active -> hidden/non-effective; no terminal History row.
- Undo (user lifecycle action): Sold/Disposed -> Active by append-only reversal and
  inverse linked account effect when one exists. A deleted mistaken Active record has
  no user Undo action; if a Delete loses server/CAS reconciliation, the local
  reconciler may internally compensate and restore Active, but that is not a user
  lifecycle transition and must not appear as an Undo option or normal History event.
- Compensation: restore server-canonical projection and invert the losing account
  effect exactly once.
- Account-only stale: restore the verified pre-action holding projection without a
  holding winner/replacement event, make the losing account effect ineffective, and
  install or verify the canonical account balance/revision/effect chain while recording
  one exact inverse if the losing effect had been applied. Do not increment either
  canonical revision.
- Sold/Disposed records are immutable except name/notes metadata.

## Atomicity and Ownership Invariants

1. A local grouped command creates all rows and projection changes in one writer or none.
2. One RPC commits all server-side financial effects or none.
3. Same action ID and same hash returns the stored outcome; different hash is rejected.
4. Expected holding revision comes from `metal_action_evidence`; the ordered account
   guard set comes from the generic root and must match the account IDs of all effects
   exactly. Holding and every guarded account revision must match for an
   account-changing action.
5. Every linked record must resolve to the authenticated owner.
6. Generic table sync must never independently activate action-owned fragments.
7. Missing/stale rates never hide a holding; only affected calculations become unavailable.
8. A reversal references immutable original evidence and never unlocks historical facts.
9. A stale outcome binds holding and every guarded account revision/evidence hash
   independently in canonical account-ID order. Account-only stale carries no holding
   winner ID and cannot fabricate one during recovery.

## Migration and Backfill Order

1. Create `067_financial_action_foundation` with the generic root's identity, domain
   type/reference, canonical serialization/hash, durable state/outcome/replay, RLS, and
   stable local/server storage interfaces. T024 freezes this non-account foundation.
2. After T024, create `068_metals_domain` with nullable legacy-unavailable exact Metals
   shadow fields, holding state,
   current acquisition-action/reference-set linkage, `metal_action_evidence` with a
   required unique `(user_id, action_id)` one-row-per-action constraints for both Metals
   action evidence and lifecycle events, plus role-unique rate
   evidence, observations, owner-scoped holding revision CAS, and deterministic
   backfill. Non-account Metals lifecycle work may develop and stack here while full
   #242 continues in its separate lane.
3. After `068`, create and merge `069_account_financial_effects`: account revision,
   canonical ordered per-account guards/results, generic immutable account effects,
   dedicated account-action sync/CAS, writer guards, deterministic multi-account row
   locking, protected columns, and exact-once account compensation. T033 is the full
   #242 gate.
4. Backfill every existing account revision to `0` without historical action rows.
5. Before fail-closed protection, drain, migrate, or explicitly quarantine every legacy
   unsynced financial row. Reject clients without action ID, hash, and expected revision
   from changing protected balance/revision columns. Verify this with test/developer
   fixtures; do not assume production users because the app is not in production.
6. Add matching WatermelonDB schema migration/models and explicit sync allowlists at each
   milestone without allowing `069` to merge ahead of `068`.
7. Backfill Gold/Silver only. Canonically serialize valid legacy purchase price, weight,
   and purity compatibility values into the exact fields. Missing/invalid exact weight
   or purchase price remains null. Populate the entire purity code/version/factor tuple
   only for a unique exact catalog match; otherwise keep all three fields null while
   preserving the holding. Leave `acquisition_action_id` null for legacy facts; never
   invent a historical rate/reference set, catalog source, exact fact, or action.
8. Make the backfill rerunnable: populate only missing exact fields, never overwrite an
   existing exact value, and produce the same result for the same input. Fixtures MUST
   cover Gold, Silver, unique and unmatched purity, missing/invalid values, pre-populated
   exact fields, retained compatibility columns, and a second identical migration run.
9. Seed the versioned purity catalog, pull canonical rows, then switch authoritative
   calculations/read models to exact fields. A null required exact fact makes only its
   dependent valuation, P/L, or attribution unavailable; it never hides the legacy
   holding or falls back to the compatibility number. The first accepted material
   correction must supply the complete valid required exact fact set atomically.
10. Keep compatibility columns until the app-wide decimal audit authorizes removal;
   WatermelonDB columns are never dropped.

Credited Sale, credited Undo, and account compensation/replacement credit remain
disabled until T033. T024—not T033—is the prerequisite for developing and stacking
`068_metals_domain` and non-account Metals persistence.
