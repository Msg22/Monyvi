# Phase 0 Research: Metals Module Redesign

**Date**: 2026-08-30
**Status**: Architecture, data, sync, security, frontend, and QA decisions integrated.
Visual approval is complete for eight candidates: Add, Edit, and factual purity/value
corrections for Home Concept C and Screens 02, 03, 14, 15, and 17. The six factual
corrections preserve approved layouts and are promoted to canonical references; all
other visuals remain approved.

## Sources Reviewed

- Approved feature spec and design/content/flow documents
- Constitution and `docs/business/business-decisions.md`
- WatermelonDB schema, migrations, models, ownership helpers
- Metals hooks/services, market-rate/startup flow, net-worth read model
- Generic sync pull/push/config/transforms/ownership guards
- Account/transaction commands, account selection, analytics tests
- Supabase migrations, RLS, indexes, updated-at triggers
- Current UI/routes/i18n and Jest/RNTL/Maestro infrastructure

## 1. Existing Domain Baseline

### Decision

Reuse `assets` for holding identity/acquisition facts and `asset_metals` for
Gold/Silver physical facts. Do not stretch these mutable rows into lifecycle
audit and reconciliation protocol.

### Rationale

- `assets`: owner, name, notes, purchase date/price/currency, liquidity,
  soft-delete, sync fields.
- `asset_metals`: parent asset, metal, weight, normalized purity, optional form,
  soft-delete, timestamps.
- Current create service supports parent+child creation only. Current
  `useMetalHoldings` owns raw multi-table queries and joins active rows.
- Spec requires immutable corrections/events, hidden deletion evidence,
  terminal reversal, exact linked account effects, and conflict compensation.

### Alternatives Rejected

- Status/last action only on `assets`: loses history and reversal evidence.
- Separate purchase entity: contradicts FR-018.
- Replace existing asset tables: unnecessary migration risk.

## 2. V1 Scope and Documentation Drift

### Decision

V1 UI, validation, fixtures, calculations, and creation support Gold/Silver only.
No Platinum/Palladium migration, view-only mode, filters, rates UI, or renders.

### Rationale

FR-017 and approved product decisions are explicit. App is pre-production; no legacy
Platinum/Palladium user data exists. Wider generated schema values may remain until
separately approved cleanup, but V1 logic rejects and does not surface them.

### Governance Result

Constitution 1.6 and `business-decisions.md` now define Gold/Silver-only V1 scope.
The earlier four-metal wording is retired and creates no implementation gate.

## 3. Rates, Startup Gate, and Missing Values

### Decision

Keep startup behavior: block only when WatermelonDB has no cached rate; allow
retry. Any valid cached rate permits app entry. Financial screens independently
classify every consumed Gold/Silver and FX input from provider observation time,
source, and quality as Fresh, Stale, Unknown, or Unavailable. Network state does
not determine freshness.

### Rationale

- Startup checks newest local row existence, not freshness.
- `useMarketRates` and `MarketRate.isStale()` use row `createdAt`.
- Schema has `timestamp_metal` and `timestamp_currency`, but no complete
  per-reference source/quality contract.
- FR-054 and FR-073–075 require provider provenance distinct from receipt,
  storage, refresh, and sync times.
- Current `useMetalHoldings` returns empty arrays and zero totals when latest
  rates are missing. This false empty-portfolio state must become preserved
  holding facts with unavailable valuation.

### Protocol Consequence

Add/Edit/Sell/No Longer evidence snapshots every consumed reference available at
action time: exact decimal, unit/orientation, provider observation time, source,
quality/validity, freshness. Unavailable facts stay Unknown. Current rate row
alone cannot serve immutable acquisition/terminal evidence.

### Approved Rate-Reference Refinement

Observed evidence is discriminated by `role` and `kind`. V1 accepts only
`metal:GOLD`/`metal:SILVER` and `currency:<MetalsIsoCurrencyCode>`; BTC is not a
Metals instrument. Metal roles are `acquisition_metal`, `current_metal`, and
`terminal_metal`; currency roles are `acquisition_purchase_currency`,
`current_purchase_currency`, `terminal_purchase_currency`,
`terminal_proceeds_currency`, `display_purchase_currency`, and
`display_preferred_currency`. Metals must be `usd_per_pure_gram`/
`quote_per_base`; currencies may be `usd_per_currency_unit`/
`quote_per_base` or `currency_units_per_usd`/`base_per_quote`; USD is exact `1`.
Same canonical/preferred currency display conversion is also exact `1`; redundant
snapshots remain provenance only and cannot control arithmetic/availability. Inverse
metals are rejected. Raw observation/provenance remains immutable; adapter/pure logic
normalizes once to canonical USD-per-base. Unknown or unparseable observation time
changes freshness only, never calculation availability by itself. See the canonical
matrix and unavailable-reason codes in [`rate-reference-contract.md`](./contracts/rate-reference-contract.md).

### Alternatives Rejected

- Row creation time as observation: delayed sync can make old data fresh.
- Fresh network rate startup requirement: violates offline-first approval.
- Missing rate as zero/empty: misstates ownership/net worth.
- Current rate as historical backfill: fabricates history.

## 4. Exact Financial Arithmetic

### Decision

Persist posted account money as integer minor units and PostgreSQL `numeric`; persist
weights, purity factors, and rates as canonical decimal strings locally and `numeric`
remotely. Use one immutable Decimal.js clone in `@monyvi/logic` with precision 50
and `ROUND_HALF_EVEN`. Parse only canonical strings, never serialize exponent form,
never use JS binary `number` for authoritative calculations, and round only at the
final currency/display boundary.

### Rationale

Current Watermelon fields/calculations use `number`. FR-083–085 require exact
precision and no intermediate rounding. WatermelonDB has no decimal type, so new
text shadow columns preserve compatibility while authoritative code moves to exact
strings. Decimal.js is approved for this bounded primitive and requires parity
fixtures against PostgreSQL `numeric`.

### Alternative Rejected

Continue with `number` or round components early: violates requirements and can
produce unreconciled P/L/net-worth/account values.

## 5. Lifecycle and Effective State

### Decision

Use append-only lifecycle events and deterministic reduction. Holding projection
is Active, Sold, or Disposed. Reversal is event, not state. Delete of mistaken
Active record preserves hidden non-effective audit evidence while removing
record/timeline from normal UI and all reporting.

### Minimum Evidence

Stable ID, owner, holding, action group, event kind/time, canonical immutable
payload, predecessor/reversal reference, rate-reference links, visibility and
effectiveness, sync timestamps, and soft-delete. `metal_holding_states` stores the
current Active/Sold/Disposed projection and financial revision; events remain the
auditable source used by the deterministic reducer.

### Approved Reducer Boundary

The DB-neutral reducer accepts `effective`, `ineffective`, and `incomplete`
evidence and always performs structural validation. It returns a projection or
`null` plus immutable accepted/rejected events with stable internal reasons. It
keeps one causal chain and the last safe projection; a valid reversal requires
both references to identify the current Sold/Disposed head. Equal-time causality
precedes ID ordering, and IDs only stabilize unrelated display/diagnostic order.
Malformed, rejected, and incomplete evidence remains auditable/recoverable but
never contributes to ownership, net worth, reporting, analytics, or normal
History. Slice 2 uses existing effectiveness/visibility and action-root rejection;
persisted per-event diagnostics remain deferred. See
[`reconciliation-contract.md`](./contracts/reconciliation-contract.md).

### Alternatives Rejected

- Mutate prior event/status: destroys audit.
- Hard-delete remotely: unsafe for sync/evidence.
- Rejected candidate in History: violates FR-079/088/098.

## 6. Local Action Group

### Decision

Every Add, material Edit, Sell, No Longer, Delete, Undo, and compensation uses the
generic owner-scoped financial-action root/outbox. One WatermelonDB writer transaction
creates that root, Metals-specific holding/lifecycle/rate evidence, projection,
optional generic account effect, and recovery status. Failure leaves none. Retries
reuse stable `action_id`; Metals does not introduce a second account outbox.

### Required State Meaning

- `pending_local`: not committed; prevent duplicate/exit.
- `local_complete`: all local effects durable/effective after restart.
- `sync_pending`/`sync_failed`: local-complete remains usable.
- `reconciliation_incomplete`: any server rejection after local completion, or
  missing safe canonical proof; actions locked and no unresolved optimistic effect
  stays reportable.
- `accepted`: server accepted complete valid group.
- `rejected_compensating`: verified stale winner or rejected recovery reverses local
  effects/restores a verified projection exactly once.
- `reconciled`: losing/rejected effects reversed exactly once; canonical or safely
  rolled-back holding shown.

Stored code names may change in Phase 1; observable meaning cannot.

### Effective-State Rule

Local-complete optimistic action may affect local UI/net worth while awaiting
sync. A known stale winner or server rejection immediately locks financial actions.
After canonical evidence is fetched, one local writer makes the local candidate
effective only if server-accepted; otherwise it atomically compensates/restores the
verified canonical projection or safely rolls back to the last verified projection.
Missing evidence leaves no partial correction and remains recovery-visible/locked;
`PAYLOAD_HASH_MISMATCH` is not retried with the same action ID.

## 7. Server CAS and Reconciliation

### Decision

Add an idempotent PostgreSQL CAS RPC invoked by the dedicated generic financial-action
synchronizer, with Metals domain validation supplied by the linked evidence. In one
server transaction with row locks, validate auth ownership, immutable payload and
linkage, group completeness, expected holding revision, and—when account credit is
enabled—selected account eligibility and expected account revision. Atomically:

1. return the stored outcome for repeated identical `action_id` and payload hash;
2. reject the same `action_id` with a different payload hash;
3. accept one complete valid matching-revision action;
4. increment the holding revision and optional account revision;
5. change `accounts.balance` and activate linked immutable evidence once; or
6. reject stale input with canonical revisions and winner evidence.

First complete valid server-accepted action wins. Client clock, arrival timestamp,
and generic LWW never choose winner.

### Rationale

Current push loops tables and performs unconditional Supabase upserts. Lifecycle
and account rows would be separate requests without cross-table transaction or
CAS. Pull fetches tables independently by `updated_at`. Current protocol can
accept fragments and cannot ensure one terminal/account result.

### Required Integrity

- Unique owner-scoped `action_id`; immutable payload hash.
- Unique lifecycle/effect identity per accepted action.
- Expected/accepted server financial revision.
- Server acceptance timestamps; no client-time winner rule.
- One validation boundary for holding/event/account/effect owner and links.
- Same ID/same payload returns same result; same ID/different payload fails.
- Partial/invalid group never activates.
- RPC/pull/push failure remains failure; no watermark advancement.

### Constitution Result

Constitution 1.6 explicitly approves partial LWW for independent metadata and
expected-revision CAS for grouped financial/lifecycle actions. No exception remains.

### Alternatives Rejected

Current upserts, client timestamps, field merge, or manual Screen 19 cannot meet
approved V1 safety/UX.

## 8. Losing Action Compensation

### Decision

When conflicting second action syncs, server rejects it and returns canonical
winner/revision. Winner stays effective. Client records rejection, then executes
one atomic compensation keyed by losing `action_id`: remove losing ownership,
lifecycle, reporting, and account effects; restore canonical projection; mark
reconciled. Retry/restart cannot compensate twice.

Unsafe/missing evidence means no partial correction. Lock actions and show:

- `Checking changes`
- `This holding changed on another device. We’re checking the holding and account before showing the final result.`
- `Try sync again`

After success:

- `Holding changed on another device`
- `Another change was saved first. We kept it and safely removed this device’s pending change.`
- `View holding`

### Rationale

Offline local completion may already change ownership/balance before another
device wins remotely. Exactly-once compensation prevents duplicate debit/credit.

## 9. Sale Account Credit and Analytics

### Decision

Optional `Receive money in` posts exact net proceeds once to one active owned
same-currency account. An eligible default account may preselect; the user can
disable or change it. Sale remains valid without credit. Credit directly changes
`accounts.balance` while generic `account_financial_effects` records immutable linked evidence
classified as asset-sale proceeds, excluded from ordinary income, budget income,
and earned cashflow.

### Required Prerequisite

Issue #242 must add/backfill account financial revision `0`, inventory and guard every
account-balance writer, atomically persist local action/effect/outbox/balance/revision,
provide idempotent CAS plus dedicated action sync, protect balance/revision from generic
sync, and prove exactly-once compensation. During cutover, legacy unsynced rows are
drained, migrated, or quarantined before enforcement; legacy clients without action
ID/hash/expected revision cannot overwrite protected fields. Only sale credit, credited
Undo, and account compensation/replacement credit are gated. Sale without credit and
uncredited Undo continue.

### Protocol Consequence

The local Sale/Undo/compensation writer updates holding projection, account balance,
action state, lifecycle evidence, and account-effect evidence atomically. The server
RPC validates expected holding and account revisions and commits the same group in
one transaction. Stable effect identity prevents double credit/debit. Generic sync
must not independently activate action-owned fragments or overwrite a CAS-owned
balance transition. Conflict compensation applies the exact inverse minor-unit
amount once and advances both projections from canonical server evidence.

### Alternatives Rejected

Ordinary INCOME, gross-proceeds credit, cross-currency conversion, or best-effort
post-sale credit violate classification/atomicity.

## 10. Net Worth, History, Snapshots

### Decision

Scoped read models use effective groups/events and active projection. Net worth
remains accounts plus active metal value only:

- Add contributes trustworthy active value.
- Correction replaces prior contribution.
- Sale without credit removes metal, invents no cash.
- Sale with credit atomically replaces metal with account cash.
- No Longer/Delete remove metal without adding reporting metrics.
- Undo restores metal and reverses linked account effect atomically.
- Rejected groups never contribute; while recovery is incomplete, only the last verified effective state is reportable.
- P/L, proceeds, write-offs, transfers, attribution never add wealth separately.

Daily snapshots remain immutable; actions affect current/future views only.

### Rationale

Current net-worth service already derives local scoped account/asset totals.
Extend effective inputs instead of API reads. History gets separate newest-first
projection; rejected evidence stays internal.

## 11. Ownership, RLS, Indexing

### Decision

New top-level states, actions, events, reference snapshots, and effects carry direct
`user_id`, standard sync columns, and owner/filter indexes. RLS uses
`(SELECT auth.uid())`; the RPC validates every linked owner even with RLS. No
application `GRANT ALL`.

`asset_metals` remains a strict child without direct `user_id`. Ownership is inherited
through its immutable `assets` parent and enforced in local helpers, push, pull, RLS,
and RPC validation. Constitution 1.6 explicitly permits this inherited model.

## 12. Frontend Architecture

### Decision

- Replace `useMetalHoldings` data façade with scoped portfolio/detail/history and
  Home read-model services. Hooks manage subscriptions/loading/error/cancellation
  and invoke commands only.
- Separate holding and lifecycle/reconciliation command services; preserve
  existing atomic parent+child creation primitive only as predecessor.
- Preserve Home shell. Insert Concept C after `TotalNetWorthCard`, before Live
  Rates. Extend net-worth model with Gold/Silver breakdown.
- Preserve `/live-rates` route/layout. Remove Platinum and simulated timeout
  refresh; use real sync refresh and provider observation/source/quality.
- Route set: `/metals`, `/metals/add`, `/metals/[holdingId]`, `/edit`, `/sell`,
  `/no-longer`, `/delete`, `/restore`, and `/history`. Add and Edit each keep inputs
  and a live change/valuation preview in the same form, then save directly from it.
- Replace Add modal with full screens. Use `PageHeader`, `Skeleton`, centralized
  responsive helpers, `FlatList`, NativeWind, safe-area handling, logical RTL,
  44px controls, reduced motion, Arabic input normalization, EN/AR schema.
- Package deterministic Monyvi metal render manifest. Unknown form uses neutral
  fallback; missing Silver Jewelry render stays fallback unless approved.

### Live Rates Two-Metal Composition

Keep current route, hierarchy, cards, and visual language. Remove Platinum
entirely. Gold keeps its current place; Silver uses available full row width
rather than leaving an empty slot or inventing replacement content. This is
least-drift responsive interpretation of approved Gold/Silver-only scope.
Validate in visual QA across widths, themes, and RTL; no new feature mockup gate
is required.

Silver Jewelry remains a valid recorded form. Until Monyvi supplies a matching
illustrative render, FR-103 neutral fallback is used. Do not remove or block the
form, synthesize a misleading image, or request user-uploaded photos.

Alternatives rejected: retaining empty Platinum space wastes layout and implies
missing content; adding another card invents scope; blocking Silver Jewelry
confuses presentation-asset availability with domain support.

## 13. Migration Direction

No migration runs during planning. Implementation creates matching sequential
Supabase SQL plus WatermelonDB migration/schema/model changes together. Existing
numeric columns remain compatibility-only; new exact text columns are populated by
a deterministic, rerunnable Gold/Silver-only backfill before authoritative calculations
switch. Valid legacy purchase price, weight, and purity values are canonically serialized;
catalog code/version is populated only for a unique exact match. Missing, invalid, or
unmatched input stays explicitly unavailable and no historical rate, catalog source, or
action is invented. Existing exact fields are never overwritten. Fixtures cover Gold,
Silver, unmatched/missing values, retained compatibility columns, pre-populated exact
values, and an identical second run.
New root tables include standard sync columns, RLS, updated-at triggers, FK indexes,
and unique idempotency constraints. `asset_metals` retains inherited ownership.

No Platinum/Palladium migration is needed. Existing Gold/Silver without trustworthy
purchase/rate provenance remain visible; combined P/L appears only when trustworthy,
and detailed attribution remains unavailable rather than fabricated.

## 14. Verification Architecture

### Decision

- `packages/logic`: exact-decimal purity/valuation/attribution/rounding,
  state reduction, classification, rate trust with fixed clocks/IDs.
- Real SQLite: atomic Add/Edit/Sell/No Longer/Delete/Undo, groups/effects,
  rollback/replay/compensation/restart/identity.
- Server harness: CAS winner, stale revision, duplicate ID, payload mismatch,
  competing Sell, Sell versus No Longer, correction versus terminal, partial
  failure, ownership/RLS, retry, canonical pull.
- Read models: missing rates preserve holdings; effective ownership/balances;
  P/L/history/reporting exclusions; no snapshot rewrite.
- Hooks/RNTL: lifecycle/auth scope, all states, a11y/focus, breakpoints, themes,
  RTL, 200% text.
- Maestro after fixtures: Home discovery, portfolio/rates, Add/Edit/Sell/No
  Longer/Delete/Undo, offline restart, reconciliation recovery.
- Manual-only: tablet/landscape, 200% system text, Arabic mixed direction,
  TalkBack/VoiceOver, physical offline, real two-device concurrency.

### Required Harness

No Metals Maestro fixture/seed/network/conflict harness exists. Define
Gold/Silver fixtures, fixed clock/IDs, reset controls, rate-provenance states,
default/mismatched accounts, stable test IDs, locale/theme/font controls, and
deterministic server conflict scheduling. Map SC-001–SC-030 to an automated layer
or explicit manual-only evidence. SC-030 is verified through deterministic
read-model/reducer fixtures for tied-time ordering, restored-Active reversal,
missing data, synchronization states, accessible filters, plain copy, absent
purchase dates, and Monyvi-supplied holding renders, with RNTL/Maestro coverage
where user-visible and manual device checks for the remaining accessibility matrix.

## 15. Deferred Work

- Screen 19/manual candidate choice, winner-changing, and field merge
- Partial sales; gifts/inheritance/dowry acquisition modes
- Platinum/Palladium product support
- Cross-currency automatic sale credit
- User-uploaded holding photos
- Retroactive historical-rate reconstruction
- App-wide Decimal.js adoption beyond this Metals implementation (tracked separately)

## 16. Resolved Decisions and Remaining Dependency

Phase 1 resolves the CAS constitution contract, Gold/Silver scope, inherited child
ownership, direct account-balance projection, exact arithmetic, versioned purity,
rate provenance, lifecycle evidence, RPC outcomes, reconciliation state machine,
read models, and deterministic harness contract.

Issue #242 is the sole cross-feature implementation dependency, but its block is narrow:
it must satisfy the financial-revision/CAS, writer guard, dedicated sync, cutover, and
regression contract before any Metals task enables sale account credit, credited Undo,
or account compensation/replacement credit. Sale without credit and all unrelated Metals
tasks continue. Live Rates Gold/full-width Silver still requires visual QA during
implementation, not another product decision.
