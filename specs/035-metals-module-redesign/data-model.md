# Data Model: Metals Module Redesign

## Authority and Conventions

- WatermelonDB is the user-facing source of truth; every command commits locally first.
- Canonical decimal values are plain, non-exponent strings locally and PostgreSQL `numeric` remotely.
- Posted money uses integer minor units represented as strings locally and `bigint` remotely.
- Every new syncable root table includes `id`, `user_id`, `created_at`, `updated_at`, and `deleted`.
- `asset_metals` keeps inherited ownership through immutable `assets.id`; every read, write, pull, push, RLS policy, and RPC validates the parent owner.
- Append-only evidence is never edited or hard-deleted by ordinary product actions.

## Existing Tables

### `assets`

Keeps holding identity, owner, metadata, and acquisition facts.

New columns:

| Column | Local / remote | Rule |
| --- | --- | --- |
| `purchase_price_decimal` | text / numeric | Authoritative total paid, including premium/workmanship |
| `purchase_currency` | text / text | ISO currency code |
| `purchase_rate_reference_id` | text nullable / uuid nullable | Immutable acquisition FX/metals reference when known |

The existing numeric `purchase_price` remains compatibility-only after backfill.
Name and notes are independent metadata eligible for partial LWW. Purchase facts are
financial facts and may change only through a material-correction action.

### `asset_metals`

New columns:

| Column | Local / remote | Rule |
| --- | --- | --- |
| `weight_grams_decimal` | text / numeric | Positive canonical decimal |
| `purity_code` | text / text | Stable catalog member |
| `purity_factor_decimal` | text / numeric | Immutable factor snapshot |
| `purity_catalog_version` | text / text | Catalog version snapshot |

`purity_code`, `purity_catalog_version`, and `purity_factor_decimal` are one
authoritative immutable snapshot on `asset_metals`; no purity catalog source exists
on `assets`. `metal_type` is limited to Gold and Silver for V1. Existing numeric
weight/purity fields remain compatibility-only. Metal type cannot be corrected in place.

### `accounts` dependency

Issue #242 must add `financial_revision`, backfill existing accounts to revision `0`
without fabricating historical actions, and revision-guard every balance writer.
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
| `financial_revision` | integer/bigint | Starts at 0; increments once per accepted material action |
| `effective_event_id` | text/uuid nullable | Current terminal/correction event |
| `effective_action_id` | text/uuid | Action that produced the projection |
| `is_visible` | boolean | False only for deleted mistaken active record |
| `reconciliation_state` | text | Derived action-sync state |
| standard sync columns | | Required |

Indexes: unique `holding_id`; `(user_id,status,deleted)`;
`(user_id,updated_at)`.

### `financial_action_groups` (generic T024 foundation root)

Generic owner-scoped durable command/outbox and replay record shared by transactions,
transfers, recurring payments, SMS, and Metals. Migration
`067_financial_action_foundation` freezes this non-account identity/storage interface at
T024. Full account integrity is a later T033 gate, not a prerequisite for Metals domain
persistence against this root.

| Column | Type | Constraint |
| --- | --- | --- |
| `id` / `action_id` | text/uuid | Same stable value; owner-unique |
| `user_id` | text/uuid | Owner |
| `domain` | text | Owning domain, including `metals` |
| `kind` | text | Stable domain action type |
| `domain_reference_id` | text/uuid | Link to owning domain evidence |
| `payload_json` | text/jsonb | Canonical immutable payload |
| `payload_hash` | text | SHA-256 of canonical payload envelope |
| `expected_account_revision` | integer/bigint nullable | Required iff account effect exists |
| `state` | text | State machine below |
| `server_outcome` | text nullable | accepted, idempotent, stale, rejected |
| `outcome_json` | text/jsonb nullable | Canonical durable replay outcome |
| `rejection_code` | text nullable | Stable internal code |
| standard sync columns | | Required |

Indexes: unique `(user_id,action_id)`; `(user_id,state,updated_at)`;
`(user_id,domain,created_at)`.

Holding-specific expected/canonical revision, target, event kind, and lifecycle links
belong to Metals domain evidence, never the generic root. The optional expected account
revision is the root's only revision guard and remains null unless a generic account
effect exists.

### `metal_action_evidence`

One Metals domain record per generic action, introduced by `068_metals_domain` and linked
through the same stable `action_id`.

Fields: `id`, `user_id`, `action_id`, `holding_id`, `kind`,
`expected_holding_revision`, `canonical_holding_revision`, `domain_payload_json`, and
standard sync columns. Add uses a null expected holding revision; every later material
action requires it. This row—not `financial_action_groups`—is authoritative for holding
revision CAS and links the root to holding state, lifecycle, and rate evidence.

### `metal_lifecycle_events`

Immutable business evidence.

Fields: `id`, `user_id`, `holding_id`, `action_id`, `kind`,
`occurred_at`, `payload_json`, `predecessor_event_id`,
`reverses_event_id`, `is_effective`, `is_history_visible`, and standard sync
columns. Unique `(user_id,action_id,kind)`. Events may become ineffective only
through deterministic reconciliation; their original payload never changes.
The future schema does not add per-event rejected-diagnostic columns: existing
effectiveness/visibility and the action-root rejection state retain enough durable
audit/sync/recovery evidence for Slice 2.

### `metal_rate_references`

Immutable references consumed by acquisition, valuation, sale, or correction.

Fields: `id`, `user_id`, `holding_id`, `action_id`, `role`, `kind`,
`instrument_code`, `value_decimal`, `unit`, `orientation`,
`provider_observed_at`, `source`, `quality`, `captured_freshness`,
`captured_at`, and standard sync columns. Unique
`(user_id,action_id,role,instrument_code)`. `kind` is `metal` or `currency`;
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

### `account_financial_effects` (generic prerequisite evidence)

Immutable evidence linked to direct account mutation.

Fields: `id`, `user_id`, `action_id`, `account_id`, `domain`,
`kind` (including `sale_credit`, `sale_credit_reversal`, and
`conflict_compensation` for Metals),
`amount_minor_units`, `currency`, `accepted_account_revision`,
`reverses_effect_id`, `is_effective`, `compensated_at`, and standard sync columns.
Unique `(user_id,action_id,kind)`.
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
- `sync_pending -> rejected_compensating -> reconciled` for a stale loser.
- Any state requiring missing canonical evidence -> `reconciliation_incomplete`.
- `reconciliation_incomplete -> rejected_compensating|accepted` only after a
  successful canonical pull/RPC replay.
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
- Sold/Disposed records are immutable except name/notes metadata.

## Atomicity and Ownership Invariants

1. A local grouped command creates all rows and projection changes in one writer or none.
2. One RPC commits all server-side financial effects or none.
3. Same action ID and same hash returns the stored outcome; different hash is rejected.
4. Expected holding revision comes from `metal_action_evidence`; optional expected
   account revision comes from the generic root and is required only when an account
   effect exists. Both must match for an account-credit action.
5. Every linked record must resolve to the authenticated owner.
6. Generic table sync must never independently activate action-owned fragments.
7. Missing/stale rates never hide a holding; only affected calculations become unavailable.
8. A reversal references immutable original evidence and never unlocks historical facts.

## Migration and Backfill Order

1. Create `067_financial_action_foundation` with the generic root's identity, domain
   type/reference, canonical serialization/hash, durable state/outcome/replay, RLS, and
   stable local/server storage interfaces. T024 freezes this non-account foundation.
2. After T024, create `068_metals_domain` with exact Metals shadow fields, holding state,
   `metal_action_evidence`, lifecycle/rate evidence, observations, owner-scoped holding
   revision CAS, and deterministic backfill. Non-account Metals lifecycle work may
   develop and stack here while full #242 continues in its separate lane.
3. After `068`, create and merge `069_account_financial_effects`: account revision,
   generic immutable account effects, dedicated account-action sync/CAS, writer guards,
   protected columns, and exact-once account compensation. T033 is the full #242 gate.
4. Backfill every existing account revision to `0` without historical action rows.
5. Before fail-closed protection, drain, migrate, or explicitly quarantine every legacy
   unsynced financial row. Reject clients without action ID, hash, and expected revision
   from changing protected balance/revision columns. Verify this with test/developer
   fixtures; do not assume production users because the app is not in production.
6. Add matching WatermelonDB schema migration/models and explicit sync allowlists at each
   milestone without allowing `069` to merge ahead of `068`.
7. Backfill Gold/Silver only. Canonically serialize valid legacy purchase price, weight,
   and purity compatibility values into the exact fields. Populate catalog code/version
   only for a unique exact catalog match; otherwise keep provenance explicitly unavailable
   while preserving the holding. Never invent a historical rate, catalog source, or action.
8. Make the backfill rerunnable: populate only missing exact fields, never overwrite an
   existing exact value, and produce the same result for the same input. Fixtures MUST
   cover Gold, Silver, unique and unmatched purity, missing/invalid values, pre-populated
   exact fields, retained compatibility columns, and a second identical migration run.
9. Seed the versioned purity catalog, pull canonical rows, then switch authoritative
   calculations/read models to exact fields.
10. Keep compatibility columns until the app-wide decimal audit authorizes removal;
   WatermelonDB columns are never dropped.

Credited Sale, credited Undo, and account compensation/replacement credit remain
disabled until T033. T024—not T033—is the prerequisite for developing and stacking
`068_metals_domain` and non-account Metals persistence.
