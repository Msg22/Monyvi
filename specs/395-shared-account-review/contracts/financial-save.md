# Complete selected-review save contract

Frozen T004 technical target. This contract requires a **new local SQL migration
and coordinated sync changes**, not an existing supported operation. The owner
approved this local action/sync/reconciliation scope for implementation;
implementation is pending. No hosted migration, data reset, backfill or
deployment is authorized. [Wire shapes](wire-shapes.md) defines exact closed
fields, money, mutation/guard sets, API exports and local recovery boundaries.
Device-local recovery is separately specified by
[local recovery](local-recovery.md). Reserve nullable Watermelon-only
`financial_action_groups.local_recovery_snapshot_json` (non-generated
`localRecoverySnapshotJson`) and migration31, **not** a Supabase column/type,
public payload, new `payloadHash` or `frozenIntentDigest`. Constitution VII
1.8.0 requires a generator-consumed local override, reproducible local
schema/migration parity and real owned pull preservation before this feature can
use it. Current root/model/linked-plan code does not yet expose this private
carrier or builder.

Every review-created Cash/Bank/Wallet account uses the same current logical
active/default snapshot CAS: optional closed `creationDefaultSnapshot` is
**required exactly when any account is created** and absent otherwise. With no
previously active owned account, exactly the first newly created account by
canonical frozen actual account-create UUID order is default; with active
accounts, all review-created flags are false and existing/no default is
preserved. SQL acceptance requires owner-wide serialization before row locks; no
timestamp guard, default-clear mutation or new global revision counter.

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
per-account posted minor-unit effects, minimal local SMS bookkeeping
descriptors, and the sole optional `creationDefaultSnapshot` field for a Save
that creates any account, plus the one required review-only
`frozenIntentDigest`. It reuses the existing closed `DefaultSnapshot` shape, not
Add's `expectedDefaultSnapshot`; no deployed/legacy tuple or payload version
changes. Canonical schema/export/Edge+SQL validators must agree exactly.
Existing account, transaction and transfer field vocabulary is reused; new child
descriptors name owned AccountSmsSender/BankDetails only. No raw audio,
transcript, SMS body, full review payload or undo snapshot in the cloud action.

Account guards cover every affected existing account, including zero-net
accounts, and explicit create guards for new accounts; no arbitrary client
timestamp winner. New account+child IDs are generated once for the save intent
and reused on replay. Server cannot overwrite an unrelated existing
account/child with a create ID.

### Original frozen-intent equality amendment (owner-approved, unshipped 2026-10-16)

For this **unshipped** `review.batch-save/v1` tuple only, add exactly one
required root `frozenIntentDigest` field, lowercase 64-hex SHA-256. It commits
to the complete originally selected review/confirmed group/plan, not merely the
actual posted financial subset. Its authoritative pure API, versioned canonical
projection, exclusions, currency rules and historical snapshot treatment are in
[Wire shapes](wire-shapes.md#unshipped-review-only-frozen-intent-digest-amendment-2026-10-16).
The normal root `payloadHash` remains the hash of the entire canonical financial
action envelope; it is **not** substituted for this digest. No new DB
columns/tables, raw Voice payload, legacy operation, Add-091 contract or
product/UX behavior is approved.

Construct the digest from the already frozen original owner/source/session/
action/occurredAt/revisions, **all** originally selected rows (including SMS
duplicates omitted at posting), referenced groups with original `evidenceKey`
and account/child identity, original complete planned entity localRefs/UUIDs,
and the first-write `creationDefaultSnapshot` iff present. Require the original
plan to be complete, but **not** a naive 1:1 match between every planned ID and
actually created post-dedup members. Use real currency minor units and canonical
calendar date/normalization; no property, row/group/member/sender order
sensitivity and no raw source text stored. The single digest is immutable once
the local action root commits.

At first write, independently validate a deduped SMS fingerprint against an
active owned transaction or transfer outside this action. During **replay**, if
the historical original digest matches the stored one, do not re-query a mutable
saved duplicate solely to establish the original dedup proof; that record can
have been edited or deleted. Continue comparing posted financial/account/child
content and action owner, never re-post/recompute balances or resample current
defaults. Replaying the same frozen input after cold restart/session clear is
valid; changed selected amount, omitted-SMS financial content, selection,
original group provenance or planned child membership rejects atomically.
All-SMS-dedup cleanup remains local and action-free.

This amendment needs coordinated **T046 strict review-only schema/registry +
generated Edge parity**, **T048** construction and replay, reserved **090**
PostgreSQL validation/canonical hashing, protected sync and updated valid
fixtures/negative tests. Do not change **091**, generic foundation
snapshot/recovery DTOs or previously deployed tuples. Owner delegates
implementation planning to Root, but source authorization, Speckit analysis,
SQL/security review, and deployment gates remain open. No production code is
changed by this document.

## Local commit

1. Freeze valid selected rows and confirmed referenced groups with
   owner/session/row/group revisions, stable actionID, and deterministic planned
   entity IDs/localRefs **before awaits**. Use `row.rowId` for selected
   financial localRef and confirmed `group.groupId` for each needed created
   account; the actual created account UUID is distinct, frozen and ASCII-sorted
   for the first-active default decision. Freeze `creationDefaultSnapshot` when
   any new account is planned.
2. After async reads and inside one owned local writer, revalidate current
   owner/source, row/group/selection/currency revisions, frozen IDs/localRefs,
   active/default snapshot under the shared owner lock, account/category
   references, card/provider/name and sender uniqueness, SMS fingerprints and
   financial revisions. A stale guard or changed intent rejects the whole batch.
3. Deduplicate already-saved SMS fingerprints across transactions/transfers.
   Already-saved selections clean only their resolved local drafts; do not
   create unused suggested accounts or consume another provider usage.
4. Prepare only necessary referenced accounts/children, selected financial
   records, exact effects, action root and SMS local cleanup/remaining-group
   updates. For an empty captured active set, mark only the minimum frozen
   account-create UUID default; mark other new accounts false. For nonempty
   active sets, all new account flags are false, retaining existing/no default.
   Never derive `isDefault` separately from `activeCount===0` for each account;
   no review default-clear and no confirmation-time write. If one selected row
   creates a shared account, rebind remaining unchanged linked SMS rows to that
   real account in the same write without selecting them. Preserve unrelated
   groups/overrides. Local rejection snapshots restore these mappings with the
   group if the complete action is rejected.
5. For review-batch roots only, attach a typed **optional device-only snapshot
   builder** to the linked plan. After prepared ownership validation, bind
   immutable cached preimages to actual prepared postimages, queue lifecycle,
   SMS drafts, created children/defaults and sorted actual default dependency
   IDs. Prepare the private root JSON in the **same adapter batch** as
   account/child/financial/effect and SMS cleanup/rebinding; never place it in a
   public envelope or serialize it after commit. Old tuples keep `null` and
   unchanged recovery behavior.
6. Commit complete linked group atomically through foundation. No financial or
   default side effects occur before all selected validation succeeds. Restore
   prepared model/cache state on failure. Success navigation only after local
   commit.
7. Keep stable intent on ambiguous result/double tap; resolve existing action
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
for both sources and reused existing accounts. Independently grounded Voice Cash
EGP and USD groups may coexist in the same Save; do not impose one-Cash-
per-batch or one-currency-per-batch. Each account remains one currency. Current
ATM Save may use an eligible existing Cash destination or a genuine already-
canonical confirmed referenced group, never an invented ungrouped Cash create;
invalid/uncertain destination proof remains unresolved. No default-setting
convenience on group confirmation.

Zero-net same-account batch still creates its distinct income/expense records
atomically and is revision-guarded: retain one immutable zero effect and advance
its financial revision once under the new tuple only. Do not omit its account
guard or reject valid rows merely because aggregate effect is zero. Empty
financial batch after all SMS items deduped is local cleanup only, not a
fabricated zero-transaction action.

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
using the authenticated root's historical private local snapshot. Automatic
empty-queue pruning records `pruned_empty` for affected unresolved roots
atomically with deletion; only this proven disposition permits restoring the
original queue header when no owner queue exists. Discard/reset, expiry, or a
newer owner queue cannot be resurrected. Every SMS entry expires at its own
`parsedAt <= 30-day cutoff` (inclusive); redact only that entry's raw recovery
data, keeping unexpired siblings. Verify owned prepared postimages,
child/default/predecessor evidence before once-only compensation and refuse
newer choices. Voice has no durable transcript, audio, session or review
recovery UI; rejection uses existing financial-action recovery semantics.
Repeated callbacks/restarts cannot duplicate compensation or clear foreign owner
data. Do not automatically replay against a new revision or overwrite newer user
edits.

## Migration and rollout boundary

Server-owned 090 review and 091 Add SQL remain sequential local Supabase
migrations. Private recovery is a separate versioned **Watermelon-only
migration31** with a non-generated model property and durable generator-local
schema override. No dummy Supabase field/type/SQL or automatic hosted migration
is permitted. `db:sync-local` is the local generation path (verify private
override parity); `db:migrate` first runs remote `db:push` and is not local-only
authorization.

With main `de09f76bdadb570c99a1015bbf1c680279b0d5ad` ending at
`089_historical_metal_rate_request_limits.sql` (088 gap unavailable), reserve
`supabase/migrations/090_shared_account_review_save.sql` for strict closed
`creationDefaultSnapshot`/payload validation, full-group apply/CAS and existing
function dispatch/reconciliation. Add's separate reservation is
`091_account_create_default.sql`, preserving its deployed-independent
`expectedDefaultSnapshot` field. It must retain old operations and RLS/ownership
protections, including at-most-one active default. No schema reset or user-data
backfill planned. Generate authoritative DB types from complete local migration
state; never replace them with partial remote types. If no generated domain
change occurs, document that outcome rather than fabricating schema edits. All
function/migration and generated artifacts commit together.

Recorded implementation scope covers local SQL function/registry changes,
protected sync entity/version recognition, reconciliation, and exact typed batch
writer. Deployment is separately approved with concrete endpoint/project/runtime
compatibility evidence. Do not enable new writes on a server lacking
registration. Offline local review remains usable; unsupported server action
stays pending and surfaces existing sync recovery, never falls back to generic
unsafe pushes.

## Required checks / acceptance

M13/M14 plus M19: same-user ownership; multiple existing/new accounts and
selected records; multiple independent EGP/USD Voice Cash groups; first-active
Cash/Bank/Wallet default in frozen account-create UUID order; nonempty active
set preserving any existing/no-default state; optional snapshot present iff any
account created; stale snapshot/duplicate default rejection; different
cards/uniqueness; sender/bank child ownership; SMS partial selected cleanup;
transfer endpoints; no unused accounts; zero-net/overflow/rounding; repeat
action/hash conflict; stale guard; mid-batch failure; old-operation
compatibility; generic push isolation; all-or-nothing server apply;
rejected/replayed compensation after restart. Unit/integration plus pgTAP; fault
harness cases explicit where E2E cannot honestly drive them. Add Red fixtures
for old tuple zero rejection; new tuple zero records and revision-once; wrong
root/operation/effect kind; zero compensation exactly once; no-effect default
creation; absent-ID collisions including foreign/deleted rows; new child parity;
raw snapshot exclusion; T043 row/group localRef + normalized sender alias parity
without new fields; no invented SMS ATM Cash destination; SMS remaining-row
rebind restoration without overwriting newer edits. Independent
database/security review is required. No runtime correctness claim from this
planning text.

## Unshipped SMS cleanup proof reconciliation (2026-10-17)

This is a technical reconciliation of US6, not a new product flow or payload
version. For a mixed SMS Save, let S be all frozen selected owned physical
drafts, U the unsaved subset, and A the independently already-saved subset.
Require S = U union A with disjoint subsets. Financial selectedSourceRefs
correspond exactly to U; delete_saved bookkeeping corresponds exactly to S by
physical draft ID, owned queue, frozen row revision and original snapshotHash.
Already-saved selections are cleaned in the same owned Save and do not create
financial records, unused accounts or another provider charge. Rebind
bookkeeping belongs only to independently validated unselected siblings.

The pure payload validator enforces the necessary deletion-count lower bound,
not an equality with newly created source refs. Complete set equality and
positive first-write same-owner fingerprint proof for A are device-writer
obligations. SQL090 already permits the approved unequal counts and validates
shape, ordering, IDs, hashes, operations and the financial source-ref bijection;
do not claim that it can authenticate device-only draft membership. All-dedup
remains action-free. Replay retains the original frozen-intent digest and never
requires the earlier dedup financial record to stay active. No original action,
hash or omitted draft authority is retroactively rewritten.
