# Complete selected-review save contract

Technical design only. This contract requires a **new local SQL migration and
coordinated sync changes**, not an existing supported operation. Obtain approval
of this concrete migration/sync scope before implementation; no hosted
migration, data reset or deployment is authorized by planning/mockup approval.

## Why legacy v1 cannot be reused

`transaction.batch-import` permits transaction creates only. Account create and
pending-prepare allow one account. `sms.review-durable` permits one local
cleanup descriptor plus transaction. Current core writer drops zero-net effects
and rejects an all-zero batch. Generic push recognizes
`account.balance-effects/v1` and its entity set. New complete save includes
accounts/children, several financial rows/ATM transfers and local SMS cleanup.
Independent actions or direct balances cannot satisfy atomic
selected-batch/CAS/idempotency requirements.

## New strict registration

Proposed tuple: domain `transactions`, kind `review_batch_save`, payloadVersion
`review.batch-save/v1`, operationCode `review.batch-save`; existing financial
action envelope version retained. Do not broaden legacy v1 or re-label this as
supported.

Payload contains source/session/save identity, selected stable source refs,
confirmed referenced draft identities, complete sorted domain mutation records,
per-account posted minor-unit effects, and minimal local SMS cleanup
descriptors. Canonical schema/export/Edge+SQL validators must agree exactly.
Existing account, transaction and transfer field vocabulary is reused; new child
descriptors name owned AccountSmsSender/BankDetails only. No raw audio,
transcript, SMS body, full review payload or undo snapshot in the cloud action.

Account guards cover every affected existing account, including zero-net
accounts, and explicit create guards for new accounts; no arbitrary client
timestamp winner. New account+child IDs are generated once for the save intent
and reused on replay. Server cannot overwrite an unrelated existing
account/child with a create ID.

## Local commit

1. Freeze valid selected rows and confirmed referenced groups with
   owner/session/ row/group revisions, stable actionID and deterministic planned
   entity IDs.
2. Inside one owned local writer, revalidate user, active references,
   currencies, uniqueness/card/provider, categories, SMS fingerprints and
   financial revisions.
3. Deduplicate already-saved SMS fingerprints across transactions/transfers.
   Already-saved selections clean only their resolved local drafts; do not
   create unused suggested accounts or consume another provider usage.
4. Prepare only necessary referenced accounts/children, selected financial
   records, exact effects, action root and SMS local cleanup/remaining-group
   updates. If one selected row creates a shared account, rebind remaining
   unchanged linked SMS rows to that real account in the same write without
   selecting them. Preserve unrelated groups/overrides. Local rejection
   snapshots restore these mappings with the group if the complete action is
   rejected.
5. Commit complete linked group atomically through foundation. No financial or
   default side effects occur before all selected validation succeeds. Restore
   prepared model/cache state on failure. Success navigation only after local
   commit.
6. Keep stable intent on ambiguous result/double tap; resolve existing action
   first, never issue a new action just because transport/sync status is
   uncertain.

Existing legacy batch calls outside this feature are not silently migrated. New
review route/service must no longer fall back to unguarded batch persistence.

## Amounts and new account balances

Use existing shared Decimal precision/rounding and canonical decimal input;
posted effects integer minor units, overflow checked. No new float accumulation,
account-currency rewrite or AI opening-balance inference.

Preserve current source-specific final outcomes: existing accounts receive
selected signed deltas once; newly created suggested source account has only the
existing selected-delta baseline/outcome, not an inferred historical bank
balance. ATM cash destination receives the selected cash amounts once. When
adapting legacy `initialBalanceByTempId`, do not post both that selected
aggregate and the same transactions again. Declare account
opening/target/effects explicitly and verify exact final balance parity fixtures
for both sources and reused existing accounts. No new default-setting
convenience on group confirmation.

Zero-net same-account batch still creates its distinct income/expense records
atomically and is revision-guarded. Do not omit its account guard or reject
valid rows merely because aggregate effect is zero. Empty financial batch after
all SMS items deduped is local cleanup only, not a fabricated zero-transaction
action.

## Background push and server CAS

Protected-push collector recognizes this explicit version and all owned
financial root/child refs. Suppress generic LWW pushes for action-owned new
accounts, transactions/transfers/children until action canonicalization;
ordinary unrelated metadata sync remains unchanged. Partial/missing action
groups are not sent.

Server validates closed tuple/schema/ownership, active refs/currency/category,
uniqueness, fingerprint consistency, existing expected revisions and
absent-create guards; applies complete mutation/effects in one PostgreSQL
transaction. Repeat same actionID/hash returns canonical result; changed hash
rejects. Stale guard or invalid member rejects whole batch. New sender/bank
children validate immutable owned parent links. Local-only SMS cleanup
descriptors are validated/hashed metadata and perform no Supabase draft
mutation, following existing076 semantics.

All affected refs reconcile together. Reject/stale restores/reconciles account
balances, removes rejected financial rows/created accounts+children from normal
History/reporting, and restores recoverable SMS review choices exactly once
using local snapshots. Voice has no new durable review recovery UI; rejection
still uses existing financial-action recovery semantics. Repeated
callbacks/restarts cannot duplicate compensation or clear foreign owner data. Do
not automatically replay against a new revision or overwrite newer user edits.

## Migration and rollout boundary

New next sequential SQL file registers strict payload validation/apply/CAS logic
and extends the existing function dispatch/reconciliation contract. It must
retain old operations and RLS/ownership protections, including at-most-one
active default. No schema reset or user-data backfill planned. Generate
authoritative DB types from complete local migration state; never replace them
with partial remote types. If no generated domain change occurs, document that
outcome rather than fabricating schema edits. All function/migration and
generated artifacts commit together.

Implementation scope approval must cover local SQL function/registry changes,
protected sync entity/version recognition, reconciliation, and exact typed batch
writer. Deployment is separately approved with concrete endpoint/project/runtime
compatibility evidence. Do not enable new writes on a server lacking
registration. Offline local review remains usable; unsupported server action
stays pending and surfaces existing sync recovery, never falls back to generic
unsafe pushes.

## Required checks / acceptance

M13/M14 plus M19: same-user ownership; multiple existing/new accounts and
selected records; different cards/uniqueness; sender/bank child ownership; SMS
partial selected cleanup; transfer endpoints; no unused accounts;
zero-net/overflow/rounding; repeat action/hash conflict; stale guard; mid-batch
failure; old-operation compatibility; generic push isolation; all-or-nothing
server apply; rejected/replayed compensation after restart. Unit/integration
plus pgTAP; fault harness cases explicit where E2E cannot honestly drive them.
No runtime correctness claim from this planning text.
