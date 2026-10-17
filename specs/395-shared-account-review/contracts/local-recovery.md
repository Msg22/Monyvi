# Device-local review recovery — technical storage reconciliation

Date: 2026-10-16. Technical implementation contract for the already approved
**US6 / FR-018 atomic selected Save** and **FR-019 durable SMS review and Review
later**, with **FR-021 verified ownership/provenance/privacy** and Constitution
VIII's authenticated scope/sync integrity. FR-020 continues to govern no extra
AI parsing/usage; it is not the restoration requirement. The scoped device-only
migration route follows the separately reviewed Constitution VII 1.8.0 exception
at `dd16d5440556b651cb5b6395a00c1c4d37538dcf`. No new product behavior, approved
spec/B1, public financial tuple, Supabase schema or hosted deployment is
introduced. The owner delegated technical implementation decisions; the
feature's tests-first/source/independent review gates remain open.

## Controlling first-release boundary — 2026-10-17

The human narrowed #395's initial delivery to the approved review/Add/Save
behavior and **basic owned, atomic, retryable, duplicate-safe local persistence
and conservative sync**. The complete
[first-release scope](../validation/first-release-scope.md) supersedes this
historical contract **only as to first-release delivery gates**. A failed,
rejected, unknown or unsupported server outcome must retain the original owned
local financial rows/action root, pending/dirty sync state and any
device-private evidence; never fabricate canonical acceptance, silently
acknowledge a protected row, advance an unsafe checkpoint or delete/overwrite
unresolved data. Existing physical ownership/immutability and privacy
protections remain binding, including not sending Voice/SMS raw or private
recovery content to the cloud.

The separate terminal Add compensation-carrier wrapper, later successor-chain
reconstruction and exhaustive rejected-Add/history postimage restoration below
are **deferred technical designs**, not a new runtime expectation or permission
to abandon retained user data. Keep existing ordinary Add/Save/rollback/owner/
sync proof active. Do not require the unshipped compensation-carrier
experimental suite for first release; historical authored artifact:
`682fa98eb44b8a6b88b9c2675c7debf0fe8fa7bb`. Old source/version snapshots later
in this document remain provenance, not claims about current Main or achieved
Green. A later implementation of advanced recovery needs separate authorization
and tests.

## Verified gap and carrier

Verified at source parent `6453b4c1c8cb71b648ce282be500d14f45f166d9`:
`packages/db/src/schema.ts` remains at Watermelon version 30; the generated
`BaseFinancialActionGroup` and the non-generated `FinancialActionGroup` have
**no** local recovery field. The current
`FinancialActionLinkedOperationPlan`/foundation `prepareLocalRoot` has **no**
optional private snapshot builder. The legacy reconciliation path contains
single-draft evidence, not a durable complete-review batch carrier. Prior
references to an existing private recovery store were assumptions.
`outcomeJson`, `payloadJson`, sync/outbox/RPC and logging paths are cloud-facing
and MUST NOT carry raw recovery content.

Reserve exactly one nullable **device-only** WatermelonDB column
`financial_action_groups.local_recovery_snapshot_json`, exposed through the
non-generated model property `localRecoverySnapshotJson`. It is an extension of
an otherwise syncable local root, **not** a Supabase column/table, public
generated Supabase type, common financial action payload or server outcome.
Pre-existing/legacy roots remain `null`; newly committed review-batch roots must
have the validated local snapshot while unresolved. Accepted or fully reconciled
terminal roots may clear the private value **atomically** only when its
remaining original SMS obligations have been safely consumed or disposed under
the authenticated lifecycle proof below.

Reserve Watermelon migration **31** after the independently verified highest
local version **30**. The feature migration must include a durable
generator-consumed local-column override, non-generated model field, versioned
Watermelon migration, generated local schema and reproducibility/parity tests as
one change. Current `db:sync-local` does not yet demonstrate preservation of
this proposed column; extend the generator before claiming it. Never hand-edit
generated schema/base files, delete public generated fields/types, add a dummy
Supabase column or use `db:migrate` (`db:push` first) as local-only generation.
No feature storage or SQL has been installed by this contract. T053 owns the
local generator/migration/pull proof; 090/091 remain distinct server-owned SQL
reservations under their own approval and deployment gates.

## Closed private snapshot

`accountReviewLocalSaveSnapshotSchema` is a **proposed, unimplemented** strict
private schema, version `account-review-local-save/v1`. Its **nine and only
nine** top-level keys are `version`, `actionId`, `ownerId`, `sessionId`,
`smsDrafts`, `createdEntityRefs`, `defaultPreimages`,
`defaultDependencyActionIds` and `queuePreimage`. The eighth field is a
sorted/distinct list of actual predecessor action IDs; empty only when
independent. `queuePreimage` is the ninth key added during reconciliation. Each
private value is parsed and bound to the owned action root before use, never
inferred from a serialized public action. No private field is added to the
closed public `review.batch-save/v1` payload or common action envelope.

`queuePreimage` is `null` for Voice. For SMS it captures the **actual original**
owned queue header
`{id,userId,createdAt,updatedAt, expectedPostimageHash,disposition}`;
`disposition` is exactly `present | pruned_empty | expired | superseded`. Header
timestamps/IDs come from the preimage and are never invented from a transport
lease, later namespace generation or current wall clock.

`smsDrafts` is a strict **per-entry retention-state union**:

- `retentionState: available`: retains the existing complete approved local
  draft preimage
  `{id,queueId,smsFingerprint,createdAt,updatedAt,parsedAt, payloadVersion,position,selectionOverride,payloadJson, expectedPostimageHash,operation}`,
  plus the retention discriminator. Canonical local JSON encodes
  `payloadVersion` and `position` as canonical unsigned integer **strings**,
  safely decoded to original numeric columns.
- `retentionState: expired | superseded`: **metadata only**,
  `{retentionState,id,queueId,smsFingerprint,parsedAt,operation, expectedPostimageHash}`.
  Purge original payload, selected state, timestamps not listed here and all
  remaining review content. Never treat malformed payload/corrupt proof as
  expiration or silently sanitize it.

Retention is **30 days from each draft's actual `parsedAt`**; at
`parsedAt <= cutoff` the entry is expired, including exact equality. Redact
_only_ expired entries, even where a sibling is still recoverable. Neither queue
disappearance nor another entry's expiry proves that a surviving entry is
expired or should be discarded.

`createdEntityRefs` derives from the **canonical** `ReviewMutation` entity kinds
and covers every action-created account, bank detail, SMS sender,
transaction/transfer and other permitted domain row/child. Verify physical
account-effect membership **separately** against the immutable root; do not
invent an effect entity or trust only an enumerated ID. Both `createdEntityRefs`
and `defaultPreimages` bind expected postimage hashes to the actual prepared
operation. Hash explicitly enumerated **owned domain** fields, excluding mutable
Watermelon transport `_changed`/`_status` for synced domain rows. For SMS use
the actual prepared deletion/tombstone/rebind projection and original queue
membership; a missing, replaced or rebound row MUST hash differently from the
expected prepared postimage. Never guess postimages, timestamps, default state
or created children.

`frozenIntentDigest` and the root `payloadHash` are **public immutable
commitments** to different objects: the former hashes the original frozen
selected request, including legitimate deduplicated omissions; the latter hashes
the canonical full financial action envelope. Neither is a restoration/preimage
hash, and neither contains or replaces the private local snapshot. Local
`snapshotHash` binds a historical draft preimage, while `expectedPostimageHash`
binds the actual linked prepared postimage, not arbitrary future state. Only
opaque approved public hashes enter the wire.

## Atomic capture and recovery

Introduce a **typed, optional private snapshot builder** only on the existing
`FinancialActionLinkedOperationPlan` boundary. Its inputs are the foundation's
actual frozen `cachedPreimages` and `preparedPostimages`, plus the already
validated owner/action/intent context; do not synthesize a parallel financial
action DTO or expose a public wire field. Call it **after**
`assertPreparedOwnership` and actual prepared-operation/postimage checks.
`prepareLocalRoot` writes the canonical local-only JSON onto the owned root in
the **same adapter batch** as the financial/account/child/effect operations and
SMS cleanup/rebinding. The root's private field is absent/null for legacy tuples
and exact old behavior remains. The existing pending-root, ownership,
root-target, identity, prepared-cache-rollback and durable-commit-wins guards
remain authoritative; no snapshot write after committing the root.

Cold restart reads the **authenticated owned** action root, validates the
private version and exact `actionId`/`ownerId`/`sessionId` binding, immutable
public payload/group membership and owned referenced records. It reconstructs
recovery from historical private preimages, **not** a live review session, newly
parsed provider output or guessed default. Within one serialized writer recheck
canonical rejection/absence/account-effect evidence, current postimage hashes,
children/default refs, queue disposition and actual dependency state.
Missing/changed/foreign postimages, newer choices or unknown server evidence
fail closed into explicit incomplete recovery with zero partial compensation.
Retry/restart/callback replay is idempotent and does not issue another financial
posting. Voice carries `queuePreimage: null`, no `smsDrafts`, transcript, raw
audio or durable Voice review/session.

## Queue deletion, supersession and retention

Do not pin an empty queue indefinitely or weaken one-queue-per-owner semantics.
Automatic empty-queue pruning (including safe all-dedup cleanup) records
**`pruned_empty` on every affected unresolved private root in the SAME local
writer/batch** as the physical queue deletion. Only this positively proven
disposition may recreate the **original** captured header if no owned queue
exists, every required draft remains unexpired/available, and the exact
preimage, owned-scope and conflict guards all pass. `present` means an actual
current owned queue must still match; it is not authority to fabricate a missing
queue.

Explicit discard/reset marks affected private entries `superseded` and purges
their raw SMS/selection/review preimages in the **same** deletion writer. Expiry
marks only individually elapsed entries `expired` at the 30-day
`parsedAt <= cutoff` boundary and purges raw data atomically; it does not purge
unexpired siblings. An expiry that removes a queue also proves the queue
`expired`, not `pruned_empty`. Creation of a different owned queue atomically
invalidates older `pruned_empty` restoration rights as `superseded`, including
when that newer queue is subsequently deleted. Logout MUST NOT change another
owner's records or reinterpret queue lifecycle evidence.

A different current owned queue, changed existing header/postimage, duplicate
fingerprint, newer target choice or missing queue without proven disposition
refuses automatic restoration. Never create two owned queues or overwrite a
newer namespace. Proven expired/superseded entries are not restored; financial
compensation can complete without reactivating deliberately discarded/expired
SMS. Missing/corrupt evidence is NOT treated as a proven lifecycle disposition.

Owner-scoped retention cleanup scans private unresolved root evidence even if
its queue was already pruned. Accepted or fully reconciled outcomes clear the
private carrier atomically after its original SMS obligations are safely
consumed; acceptance alone must not orphan retained tombstones. Retryable
transport/unsupported outcomes retain it subject to the same30-day SMS
redaction. Lifecycle cleanup must prove and atomically consume any original
tombstones whose evidence would otherwise be lost by retention. Non-SMS
financial evidence survives SMS redaction until reconciliation is terminal.

## Pull and privacy

The **dedicated owned-root pull/remapping path** must explicitly preserve the
locally validated private column by exact authenticated `ownerId/actionId` (and
immutable root identity/payload match) when applying a canonical cloud root. A
foreign, unmatched, action-ID-reused or inconsistent root receives `null`; never
trust or copy a server-supplied value for the private field. Tests must exercise
the actual SQLite pull/upsert path, including a surviving unresolved snapshot
across cold restart and a safely cleared terminal root. Generic pull mapping,
RPC, outbox, protected/generic push, `payloadJson`, `outcomeJson`, Supabase
schema/types, analytics and logs MUST exclude raw recovery bytes; cloud-visible
`frozenIntentDigest` remains just an opaque hash of original intent. No silent
fallback when a sync mapping would erase required unresolved local evidence.

## Dependency ordering and tests-first acceptance

Capture **actual** preceding unresolved action IDs whenever the frozen
active/default account set depends on their optimistic create/default effects.
The `defaultDependencyActionIds` array must be distinct, canonical ASCII-sorted;
it is empty only if independently proven. Push each predecessor to a canonical
**accepted** result before dispatching a successor; pending/unsupported
transport leaves the successor pending, while rejected/unknown predecessor
outcomes require recovery and prohibit implicit successor replay under a
different default snapshot. Reconstruct and validate these dependencies after
restart; do not rewrite an immutable envelope, reorder dependents past
unresolved roots or resample defaults as a workaround.

The **existing eight task IDs** are the sole assignment map, without new tasks:
**T043** local snapshot/rollback/restart/clone fixtures, **T044**
push/private-field/rejection/dependency/lifecycle race Red, **T048** first-write
optional linked-plan snapshot capture, **T049** queue
prune/discard/expiry/supersession/rebind in same writer, **T050** private-column
push/RPC/outbox exclusion and predecessor dispatch ordering, **T051**
cold-restart once-only recovery with postimage/default/child checks, **T053**
migration31, durable generator/source override, generated local schema/model and
real SQLite pull-preservation proof, **T074** complete
legacy/source/restart/privacy regressions. Required tests cover tombstones
versus absent/replaced rows, exact queue recreate/refusal, partial expiry,
cloned fresh-DB restart, malformed private evidence, current/newer-choice
refusal, dependency accept/reject/unsupported, Voice privacy, owner change,
prepared/cache rollback and cloud exclusion. No emulator or hosted execution is
claimed by planning.

Implementation stays held until **Root performs fresh read-only Speckit analysis
on this reconciled contract package**, resolves any blocking inconsistency,
observes the applicable tests-first Red, and explicitly grants each separate
storage, writer, sync/SQL and verification lane. This contract does not mutate
the feature schema, public wire types, existing tests or business behavior. No
local generator, DB or hosted check has been run here.

## T069 Add-specific carrier and correction — 2026-10-16

This additive section applies only to Add
`accounts/create_with_default/account.create-default/v1`. The earlier gap and
migration paragraphs describe their explicitly pinned historical baseline. At
current mobile source `58acc73646426dcd5535f4b1885dd826d7747f2e`, the
Watermelon-only nullable carrier and Review builder already exist, but the
builder and root pull admit only Review and Add supplies no private snapshot.
Reuse that **existing** carrier and migration31; add no column, table, schema
version, public Supabase type or server private data. The original nine-key
Review schema, queue lifecycle and SMS retention rules above are unchanged. The
following Add-specific cleanup conditions take precedence over generic
statements that acceptance alone may clear a private value.

### Exact closed Add schema

Define the logic-owned `accountCreateDefaultLocalSaveSnapshotSchema`, inferred
`AccountCreateDefaultLocalSaveSnapshot`, and its binding parser separately from
`accountReviewLocalSaveSnapshotSchema`. The existing optional linked-plan
builder becomes the tuple-discriminated private union of these two schemas;
legacy tuples still cannot attach either private value. Every object below is
closed and every listed key is required; `null` is explicit, never omitted,
empty string or an invented empty object. Use the existing UUID, Hash,
MinorUnits, Revision and Currency validators from `wire-shapes.md`. Store
canonical duplicate-key-free JSON text; revisions and money are strings, with no
JSON numbers. Parse text with the shared canonical JSON rules before schema and
binding validation; do not silently normalize malformed stored evidence.

The Add snapshot has **exactly twelve top-level keys**:

| Key                       | Closed value / meaning                                                                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`                 | Literal `"account-create-default-local-save/v1"`.                                                                                                                |
| `actionId`                | Actual immutable action UUID.                                                                                                                                    |
| `ownerId`                 | Actual authenticated owner UUID.                                                                                                                                 |
| `rootBinding`             | Exactly `{domain: "accounts", kind: "create_with_default", domainReferenceId: UUID, payloadVersion: "account.create-default/v1"}`.                               |
| `payloadHash`             | Original canonical full-envelope SHA-256 Hash.                                                                                                                   |
| `expectedDefaultSnapshot` | Existing closed `DefaultSnapshot`, captured and rechecked inside the writer; exactly equal to the immutable public Add payload snapshot.                         |
| `preparedDefaultSnapshot` | Same closed `DefaultSnapshot`, bound to the actual complete prepared local active/default graph, not a subsequently resampled graph.                             |
| `dependencyRoots`         | Array of exact `{actionId: UUID, payloadHash: Hash}` entries for genuine owned immutable predecessors, sorted/distinct by actionId; no self-dependency or cycle. |
| `createdAccount`          | The single `CreatedAccount` object below.                                                                                                                        |
| `createdChildren`         | Array of `CreatedChild` objects below, sorted by `entity:id`, globally distinct IDs; `[]` when genuinely none.                                                   |
| `openingEffect`           | `OpeningEffect` below, or `null` exactly for zero opening.                                                                                                       |
| `priorDefault`            | `PriorDefault` below, or `null` exactly when no prior default was actually cleared.                                                                              |

`CreatedAccount` has exactly
`{accountId, preimage, postimage, expectedPostimageHash}`. `accountId` is the
created UUID and equals `rootBinding.domainReferenceId`; `preimage` is literal
`null`, proving physical absence was checked before preparation. `postimage` is
exactly
`{userId: UUID, currency: Currency, balanceMinorUnits: MinorUnits, financialRevision: Revision, isDefault: boolean, deleted: false}`.
`expectedPostimageHash: Hash` commits to the complete actual prepared physical
account domain row, including fields not duplicated in this small projection.
The owner equals `ownerId`; money and revision equal the validated opening
operation, not a guessed or rounded account read.

`CreatedChild` has exactly
`{entity, id, accountId, preimage, expectedPostimageHash}`. `entity` is
`"bank_details" | "account_sms_sender"`, `id` and `accountId` are UUIDs,
`accountId` equals the sole created account, `preimage` is literal `null`, and
`expectedPostimageHash` is a Hash of its actual prepared physical row. Match the
complete immutable public child-create membership and actual prepared operation
count; no invented child kind, sender alias or duplicate. CASH has no children;
other type/child restrictions remain those of the public Add contract. Private
evidence stores hashes, not full account numbers, card identifiers, sender form
content, Voice transcript or SMS body.

`OpeningEffect` has exactly
`{effectId, accountId, userId, actionId, preimage, postimage, expectedPostimageHash}`.
IDs are UUIDs bound to this owner/action/account and the immutable public
effect; `preimage` is literal `null`. `postimage` is exactly
`{amountMinorUnits: MinorUnits, currency: Currency, acceptedAccountRevision: "1", domain: "accounts", kind: "account.create-default", isEffective: true, deleted: false, compensatedAt: null, reversesEffectId: null}`.
Its amount is nonzero and exactly the posted opening amount; its Hash covers the
complete actual physical effect row. This is a separate private evidence object,
NOT a new Review mutation/entity kind. Zero opening requires
`openingEffect: null`, no guard, no public/physical effect and account balance
`"0"`/revision `"0"`. Nonzero opening requires exactly this one effect, the
new-account guard `"0"`, and prepared account revision `"1"`.

`PriorDefault` has exactly
`{accountId, userId, preimage, postimage, preimageHash, expectedPostimageHash, transportPreimage, transportPostimage}`.
`accountId` equals the actual prior-default clear mutation target and `userId`
equals `ownerId`. `preimage` is exactly
`{currency: Currency, balanceMinorUnits: MinorUnits, financialRevision: Revision, isDefault: true, deleted: false}`;
`postimage` has those same five keys and unchanged financial values, with
`isDefault: false`. The two Hash fields bind the respective complete actual
cached/prepared physical domain rows. Each transport object is exactly
`{status: "created" | "updated" | "synced", changedColumns: ColumnName[]}`,
captured from that row's actual `_status` and `_changed`. `ColumnName` is a
physical column of the existing generated accounts schema, not arbitrary
provider text; the list is distinct and ASCII-sorted. These transport values are
historical attribution evidence, never instructions to replace the later row's
whole transport state. There is no default preimage when the Add did not perform
a clear, even if its expected graph contains an existing default.

### Capture and immutable binding

The root binding is the logical immutable root, not a new client-generated
physical root UUID. Independently locate exactly one authenticated owned local
root by `(ownerId, actionId)` and verify its actual domain/kind/reference,
payload version, full canonical bytes/hash and account guards. Do not trust
`payloadHash` or the private `rootBinding` as its own proof. A same action ID
under a different owner is not this root and is not a cross-owner veto.

Capture after the foundation has frozen and checked actual `cachedPreimages` and
`preparedPostimages`, using the already validated envelope/hash context. The
original public expected graph must match actual writer entry state; the
prepared graph must match the actual prepared account/default operations plus
unchanged owned members. Require exact prepared domain/child/effect membership,
physical absence preimages for creates and exact prior-default preimage. Persist
the validated private JSON in the SAME root/account/child/effect batch. No
post-commit attachment, second DB writer, weakened pending-root guard or
in-memory-only dependency is sufficient. On replay, preserve the original
private bytes and dependency entries; never regenerate from current state.

Reuse the existing `hashAccountReviewLocalPostimage` physical hashing primitive
for these domain tables without changing its Review format: hash UTF-8
`JSON.stringify(["account-review-physical-postimage/v1", table, id, fields])`,
where `fields` is the ASCII-key-sorted actual raw domain field list excluding
only `_status` and `_changed`. Scalar tags are `["null"]`, `["string", value]`,
`["boolean", value]` and `["number", String(value)]` for finite physical
numbers. Physical timestamps, identity, ownership, deleted bits, financial
revision and all account/child metadata remain in that hash. Reject
missing/unsupported fields; do not fill in absent fields from the public
payload. Thus a later child edit, replaced row or domain timestamp change fails
the postimage check. Keep a single hash implementation, not an Add copy or a new
schema-generated field.

`dependencyRoots` is the **complete**, ASCII-sorted, actionId-distinct array of
exact `{actionId, payloadHash}` pairs for every relevant registered, owned
account **CREATE** root in the **ORIGINAL frozen** active/default graph,
including creators already canonically accepted/idempotent and creators still
unresolved when this Add was prepared. It is the twelve-key device-private
recovery membership journal, **not** an unresolved-only predecessor list; empty
requires proof that the original graph had no relevant creator. At preparation
and again inside the serialized writer, rederive and verify the same complete
creator identities, original hashes, owned immutable root and canonical envelope
membership, account guards and closed tuple. Recheck owner, hashes, membership
and dependency evidence after awaits and before dispatch or recovery. Acceptance
between preparation and atomic local commit cannot remove a creator, replace its
captured payload hash or resample the Add's frozen graph. The separate command
`dependencyActionIds` contains only unresolved predecessors for transport
ordering, not private recovery membership, and is not added to the public
payload. Dependent dispatch waits for canonical accepted/idempotent predecessor
outcomes; recovery independently requires complete exact creator-root membership
and canonical accepted/idempotent receipts, never mere state labels, timestamps
or inferred acceptance at preparation time. Persist and protect these roots and
hashes across restart until dependent terminal, protected ACK and cleanup
obligations permit pruning. Pre-existing unresolved-only private journals that
omit relevant accepted creators, or missing/corrupt Add snapshots, remain
fail-closed: no retroactive backfill, inferred public-payload journal, private
key/version change or automatic destructive migration. See
`account-default-intent.md` under "Protected transport and correction isolation"
for the approved distinction.

### Dedicated local recovery and existing statuses

Use a dedicated Add verifier/atomic writer, not Review's nine-key parser or the
legacy generic inverse adapter. The dispatcher must verify the complete tuple,
not route by an untrusted `kind` string alone. A valid stale/rejected receipt is
stored using existing canonical outcome serialization/state evidence.
`rejected_compensating` and `reconciliation_incomplete` remain existing
unresolved states as admitted by the foundation; do not invent a new root state
or make a malformed fixture valid by relaxing those guards. A recovery attempt
failing a proof leaves that already-recorded unresolved state and all domain
rows/private evidence unchanged. Unsupported/transport failure retains existing
pending/sync-failed behavior and is never business compensation.

In one authenticated serialized local writer, reload and recheck the root,
private binding, canonical stale/rejected receipt, actual current graph,
account/child/effect rows and dependencies. Repeat owner checks after awaits and
before commit. Require ALL of the following before preparing any change:

- The Add-only immutable `canonicalDefaultSnapshot` defined in
  `account-default-intent.md` exactly equals the historical
  `expectedDefaultSnapshot`; the created account is positively absent in the
  receipt. Canonical financial snapshots/absence IDs have their existing strict
  owned membership and hash semantics; no invented revision-zero snapshot.
- The current owned active/default graph exactly equals
  `preparedDefaultSnapshot`; the complete current account, prior-default and
  child domain hashes match the captured prepared hashes, with exact physical
  currency/balance/revision/owner/deleted/default values. An unrelated metadata
  edit to a guarded row may conservatively block recovery; it is never lost.
- Exact physical child and opening-effect membership matches the sealed action.
  No extra/rebound/replaced child, later transaction/transfer/effect or pending
  financial/default action may depend on the losing account/clear. All recorded
  predecessors are genuinely canonically accepted, and no unresolved successor
  requires the losing postimage. Do not cascade-cancel A→B or rewrite B.
- No overlapping in-flight generic push/ACK can publish or acknowledge a
  superseded protected image; affected sync admission and correction are
  serialized. Unknown in-flight or newer-intent evidence blocks correction.

Only then, in the same batch, logically tombstone the losing created account and
its exact owned children, deactivate only its original opening effect if
non-null, restore only the proven prior default flag, and mark the local root
`reconciled`. The losing default account must no longer count as an active
default. Keep historical effect identity/amount/revision, mark it ineffective
with the compensation timestamp once; never create a reverse/zero effect or
repost a balance. Do not change the existing prior account's balance or
financial revision. The tombstoned losing account may retain its historical
opening balance/revision; exclusion from active financial reads is mandatory,
not a fabricated canonical zero balance. An empty/no-default canonical target
restores no other flag. Missing or different graph/evidence means zero partial
compensation, no arbitrary default selection and no generic inverse fallback.

A valid locally completed `reconciled` root plus its immutable outcome returns
`replay` on repeat callbacks/restarts without rewriting rows that may since have
changed. A server root labelled `reconciled` merely records remote rejection; it
is NOT proof that this device performed the local batch. The owned pull must
preserve the local unresolved status until dedicated compensation commits.
Database/cache rollback must be complete before commit; after durable commit,
auth/callback failure cannot undo or repeat compensation. No new Voice/SMS
review UI or persistent source content is involved.

### Exact dirty-state suppression, ACK and cleanup

Until terminal Add handling completes, protect the root, created account,
children, effect and action-owned prior-default update from generic LWW. An
incomplete/zero-effect protected group must not leak or be marked synced. It is
safe to hold the affected prior-default row while its unrelated metadata remains
dirty; it is not safe to acknowledge that metadata as part of Add. Protection
must cover physical tombstone IDs as well as created/updated rows, including
subsequent syncs when the root is no longer dirty.

Recovery is canonical correction. It must not create a new metadata/default
intent, new generic deletion, financial action or outgoing balance change. Apply
these rules atomically with the correction, not in a later cleanup pass:

1. For the existing prior-default row, mutate only the proven `is_default`
   field. Preserve current unrelated values, physical `updated_at` and their
   dirty-column membership. Do not stamp a new LWW publication time. Remove the
   corrected `is_default` dirty bit rather than exporting it: the receipt
   already attests to that canonical target, including any original matching
   pre-Add flag intent. Preserve every other preexisting or later dirty column;
   do not subtract a whole historical `_changed` string. Any auto-added
   recovery-only timestamp/dirty bit must be neutralized, without removing an
   independently dirty timestamp. A preexisting `created` transport state stays
   created until its genuine creator's protected ACK; otherwise use `updated`
   when residual dirty columns remain and `synced` only when none remain.
2. A residual generic metadata update must include only its independently dirty
   permitted fields. It MUST omit `is_default`, balance and financial revision
   when they are merely corrected/protected values, even if the serializer
   normally emits a whole row. Genuine later default edits remain independently
   dirty and follow the existing owner-serialized default path; this receipt
   never authorizes overwriting or permanently suppressing them.
3. Losing created account/child tombstones and effect corrections are
   permanently ineligible for generic create/update/delete export while those
   rejected physical members remain. Derive that durable exclusion from the
   owned immutable rejected/reconciled root and sealed member identities, not
   solely from today's dirty root list or a process-local set. Retain the
   required root and private evidence until exclusion can still be proved after
   restart. Do not add losing tombstones to a generic deletion ACK list or
   insert a rejected effect on the server. Local historical evidence may remain.
4. Before transport dispatch and before acknowledging a captured dirty set,
   revalidate current owner, protected membership and exact field/postimage
   attribution. A precomputed stale change set is not permission to send a
   correction or clear a later edit. Serialize overlapping in-flight work;
   inability to prove safe suppression/ACK leaves recovery unresolved and dirty
   rows unacknowledged. An accepted Add ACK clears only the exact submitted
   action-owned image/columns, retaining all newer/unrelated dirtiness.

A valid accepted/idempotent receipt may set existing root state `accepted`, but
MUST NOT immediately null Add private evidence merely because an outcome or
cloud root arrived. Cleanup is a separate guarded local terminal step: first
persist and verify the immutable receipt, finish protected per-image ACK and
residual metadata preservation, prove no in-flight capture still needs the
private mapping, and prove no unresolved dependent requires evidence being
removed. Keep predecessor root/owner/hash/accepted proof while any dependency
references it, even if its own private snapshot becomes dispensable. B can push
after A's canonical acceptance without waiting for unrelated metadata ACK, but
A's evidence cannot be pruned prematurely.

After rejected compensation, clear Add private bytes only when durable local
completion, losing-member suppression, residual dirty attribution and all
dependency/ACK obligations survive that removal. Otherwise retain them on the
reconciled root; there is no Add evidence expiry timer. Null never means
"reconciled" by itself. Recovery replay uses proven local terminal state, not
the presence or absence of the private value alone. Historical accepted roots
with null need no invented snapshot; historical unresolved Add roots with null
remain incomplete, never reconstructed from form/payload guesses.

Dedicated owned-root pull/upsert must recognize the Add version, validate its
logical binding against the actual local root and preserve the local physical
root ID across remote-ID remapping. Never import server-supplied private bytes,
copy evidence to an unmatched/foreign root, regress local terminal state, erase
unresolved evidence, or bypass the above cleanup because the cloud says
accepted/reconciled. Recheck local evidence/state in the actual application
writer rather than trusting a stale outside-writer projection. Failed
preservation fails pull without advancing sync checkpoints. Public
`payloadJson`/`outcomeJson`, RPC, protected/generic push, outbox, analytics and
logs still exclude all private bytes.

### T069 terminal Add compensation liveness — bounded technical amendment (2026-10-17)

This is a **post-compensation, device-private encoding only**. The original
`account-create-default-local-save/v1` **closed 12-key** Add snapshot remains
structurally, semantically and byte-for-byte unchanged, including the complete
ASCII-sorted `dependencyRoots` containing accepted/idempotent **and** pending
creator roots of the ORIGINAL frozen graph. The separate unresolved-only
`dependencyActionIds` still governs dispatch. The terminal encoding MUST NOT
change SQL090/091 receipts, public Add/Review envelopes/guards, original five
root bindings, root states, financial effects, Watermelon/Supabase schema,
migration31, Review nine-key evidence, legacy Metals, or the established
default/business behavior. See
[completion proof](../validation/t069-compensation-completion-contract.md) for
the closed fields, digest formula and Red matrix.

**Closed carrier and bounds.** Only the existing nullable
`financial_action_groups.local_recovery_snapshot_json` (model:
`localRecoverySnapshotJson`) may contain the newly completed Add carrier. Before
dedicated compensation it contains ONLY the original canonical plain 12-key Add
snapshot. After and atomically with genuine compensation it may contain the
**different**, canonical closed three-key carrier
`{version,originalSnapshotJson,completion}`, where `version` is exactly
`"account-create-default-compensated-carrier/v1"`. `originalSnapshotJson` is the
entire pre-compensation canonical 12-key UTF-8 JSON text as a JSON **string**:
extracting it from the wrapper MUST reproduce the stored original bytes exactly,
with NO reserialization, reordered keys, pruning, regenerated creator list or
changed original version. `completion` is exactly the 11-key closed object
specified below; it is NEVER part of the original 12-key snapshot. The plain
original JSON and canonical public envelope/receipt are each at most **65,536
UTF-8 bytes** (existing action/evidence parser ceiling); the terminal wrapper is
at most **196,608 UTF-8 bytes** and is accepted only by a **separate**, bounded
duplicate-key-checking private decoder. A larger outer ceiling MUST NOT widen
the existing canonical public/evidence parsers. Reject noncanonical JSON,
duplicate keys at ANY nesting, missing/extra keys, unbounded strings,
nonfinite/number/object substitutions, nonlowercase hashes, wrong versions and
any oversized input _before_ authority is returned.

**Completion fields.** Exactly:
`{version,ownerId,physicalRootId,actionId,domainReferenceId,payloadHash, originalSnapshotSha256,rejectionReceiptSha256,priorDefaultAccountId, restoredPriorDefaultPostimageHash,completionSha256}`.
`version` is exactly `"account-create-default-compensation/v1"`; IDs are
validated UUIDs, hashes are 64 lowercase hex SHA-256, nullable prior fields are
explicitly `null` when no original prior-default clear exists. If prior-default
was restored, the account ID equals the original `priorDefault.accountId` and
`restoredPriorDefaultPostimageHash` is the EXISTING
`hashAccountReviewLocalPostimage` digest of that account's **actual prepared
isDefault=true restoration postimage** inside the compensation writer, not a
later/current hash or unverified preimage. `originalSnapshotSha256` is SHA-256
of the exact UTF-8 `originalSnapshotJson` string, not a normalized replacement.
`rejectionReceiptSha256` is domain-separated SHA-256 of the complete validated
persisted original Add rejection tuple: physical root ID, owner, action, domain,
kind, domain reference, validated payload version, exact canonical `payloadJson`
and `accountGuardsJson`, `payloadHash`, `serverOutcome`, `rejectionCode`, and
full canonical `outcomeJson`. `completionSha256` is a **separate
domain-separated full-field SHA-256** over all ten other canonical completion
fields, omitting only itself. Both digest domains/formulas and canonical
serialization are frozen in the linked report. Recompute both on every
authenticated reader admission. This detects independently altered historical
restored-postimage hashes even after A's later state changes; a normal SHA-256
digest is NOT a MAC or unforgeable defense against an attacker who can rewrite
coherent local bytes. Root public state/`_status`/dirty columns/timestamps/ACK
are never completion authority.

**Only the actual dedicated atomic compensation writer creates the marker.**
Inside existing owner-bound `reconcileRejectedAccountDefaultInSqlite`, first
perform all current immutable public/private/SQL091 receipt, exact graph,
complete creator, successor, physical child/effect and five-part identity
proofs. Prepare the genuine A restoration and losing B/child tombstones,
optional opening-effect deactivation and terminal root; derive the restored-A
physical hash from the prepared operation, bind all digests to the ORIGINAL
root/receipt/snapshot and write the complete carrier on that SAME root in the
SAME `commitPreparedBatch` adapter transaction. Do not attach it later, backfill
on read/replay, infer it from state/ACK/`_changed`/timestamps, emit a new
financial effect, or perform a second write. Adapter rollback preserves the
previous carrier/root/domain/cache; durable commit wins notification/auth
failures as before. No marker may be synthesized for historic terminal roots.

**Reader boundary and ordinary later Edit.** A single shared helper must
differentiate (a) strict original plain 12-key Add JSON and (b) the new strict
completed carrier, extracting the original snapshot for the UNCHANGED
`parseAccountCreateDefaultLocalRecoverySnapshotJson` five-part check. In
completion mode require exact owned **physical** root, owner/action, canonical
payload/guards/hash, complete rejection-tuple digest, 12-key digest, restoration
hash/member binding and full completion digest, all checked again after
awaits/inside writer or ACK admission. Structural decoding alone cannot
authorize completion. `verifyImmutableAddRecoveryAuthority`,
`assertLocallyCompensatedReplay`,
`loadAccountActionProtection`/`proveLocallyCompensatedAdd`, owned root
pull/remapping, Add private cleanup/retention and successor scanning MUST use
this validated original-plus-optional-completion decode. The original capture
path continues to CREATE only plain 12-key evidence and must reject any terminal
carrier as a newly captured snapshot. Existing current root pull already
recognizes Add and preserves local private bytes at
`bd2457d7d3d24aed8f595c0c355cd7658bca8ff8`; integrate a validated terminal
decoding branch, **do not revert or duplicate** those existing Add/Review
receipt/remapping and private-exclusion fixes.

When independently proved completion exists, verify B remains an owned
tombstoned loser with EXACT originally captured child/effect membership, effect
ineffectiveness/compensation, preserved canonical rejection authority and
root/owner identity; the later genuine Edit of A to `isDefault=false` is NOT
evidence that the earlier writer failed to restore A. Historical completion no
longer requires A's current `isDefault=true`. A later user Edit choosing
existing D remains an independent dirty `A=false, D=true` choice and must be
transported and positively ACKed by existing owner-filtered metadata UPDATE,
clear-before-set ordering, with **no generic default LWW from the rejected
Add**; ordinary Edit's multiple awaited Model updates are NOT claimed to be a
single SQLite atomic batch or durable Edit receipt. Terminal replay returns
`replay` without rewriting A, D or financial effects.

A legacy reconciled Add holding only original plain 12-key evidence remains
subject to existing strict **current A restored=true** plus complete
physical/receipt/owner checks; after an unrecorded later A default change it
MUST fail closed. Never fabricate an old completion, reconstruct a missing
accepted creator or equate clean `_status` with compensation. Unknown, missing,
corrupt or cross-version private evidence always blocks admission.

`verifyNoSuccessors` must check the **validated decoded original**
`dependencyRoots` and registered relevant Review/other private references, not
`localRecoverySnapshotJson.includes('"' + actionId + '"')`: the original JSON is
escaped inside the terminal carrier and raw substring membership would yield a
false negative. Unrecognized or unverified private evidence fails closed;
preserve existing public payload successor checks. Loss tombstones and original
creator/action evidence must continue to be excluded from generic
push/delete/ACK across first ACK, later ACK, cold restart and root pull. No new
cleanup timer, premature private GC or cloud-derived completion is permitted.

**Admission gate:** Root reconciles this additive technical contract with the
frozen B1/business/12-key contracts, runs a fresh `speckit.analyze`, obtains
meaningful real-SQLite Red from the independently owned current test cohort
(including before-first-ACK and after-ACK later Edit, retained corrupt F3,
rollback, restart/pull/privacy and replay), and only THEN grants disjoint source
ownership. Documentation here is NOT implementation, test execution, feature
acceptance, new task ID or source authorization.

### T069 proof boundary

The current T069 suite at `c7f05dcb94a440b2437494a7927d2fb21dbfe902` contains
sixteen instantiated cases through real Add/SQLite paths, but was not executed
by this author. Its A08 success fixture has no canonical default receipt and
must not be made to pass through guessed evidence. Correct fixture setup must
use actual canonical JSON serializers and valid existing state evidence before
counting a failure as behavioral Red. Keep the missing-receipt case as refusal;
add a positively authoritative receipt case without weakening A09/A10 newer
choice/child or owner/dependency checks. Preserve zero-guard A01/A02/A04 Reds.

Existing T043/T049/T050/T053/T064/T069 own the mapped integration/coverage in
`plan.md` and the reconciliation report; no new task IDs or completion claims.
Root must reconcile this package with its newer task ledger, run fresh Speckit
analysis and meaningful Red, then assign disjoint capture, recovery, sync/pull
and SQL source. No command, test, formatter, migration or DB execution was
performed for this contract, and no source readiness or Green is claimed.

## Unshipped SMS cleanup proof reconciliation (2026-10-17)

Before historical SMS tombstones authorize physical cleanup, verify the
registered canonical public envelope against the complete stored root tuple,
guards and payload hash. Bind exact private draft ID/operation membership and
original preimage commitments to immutable localSmsBookkeeping, then
independently verify the sealed actual physical postimage hash, owner, queue and
fingerprint. Current live selections instead require their freshly guarded owned
graph, frozen Save and same-writer preimage. Never infer historical deletion
authority from a private list alone. Unknown, additional, foreign, replaced or
contradicted roots/drafts refuse without mutation. A genuine legacy exemption
requires a verified registered tuple; a stored kind label alone is insufficient.
Developmental mixed roots that omitted immutable deleted-draft IDs remain
fail-closed.

Preserve an existing queue header during ordinary Review commands, queue merge
and undo/restore updates; draft timestamps continue changing. The existing read
snapshot derives freshness from the maximum queue/draft timestamp. Queue
creation and exact protected rejection restoration keep their established
semantics. This avoids invalidating the original full physical queue commitment
and introduces no new private head, column, schema or protocol. An unrecorded
header change remains a refusal, not permission to recompute historical hashes.

An accepted Review whose retained private evidence still authorizes original SMS
tombstones supplies historical cleanup proof without reopening its financial
action. Accepted-state private cleanup must not erase needed authority before
those originals are safely consumed. Clearing, redaction, expiry, discard and
empty-queue pruning must preserve the existing retention/privacy policy and
share the appropriate authenticated atomic proof/rollback boundary; do not leave
orphan tombstones or clear an unproven foreign record. Once originals are
consumed, accepted private evidence may be cleared through its existing scoped
cleanup. Add evidence and unrelated verified legacy roots remain separate and
preserved. No new private keys or cloud data are introduced.

## Historical Add root ACK versus current row ACK (2026-10-17)

For a canonically accepted Add, acknowledging the historical
financial_action_groups row is separate from acknowledging current account,
child or effect rows. Keep the authenticated complete SQL091 accepted receipt,
exact immutable public root tuple/guards/hash and original physical root raw
equality. The original opening-effect membership remains exact, including
revision, domain, kind, effectiveness, deletion and compensation fields. Current
account ID, owner, type, currency and creation identity must still be proved.
Current balance and financial revision can legitimately advance after the
original Add and are not immutable creator identities.

A root-only historical predicate must not reuse the unsynced account CREATE-row
postimage predicate or confer account financial/metadata, sender, bank-detail or
effect field ACK authority. Arbitrary higher financial revisions or changed
financial fields remain dirty without independent existing positive
transport/financial evidence. A genuine accepted successor may progress before
the original SDK root is clean. If existing account-row handling cannot prove
that newer legitimate state, full SDK liveness remains blocked; cleaning the old
root alone is not complete delivery.

Verify original Add child IDs by exact table, original owned parent and creation
identity, including genuine soft-deleted originals retained by the established
metadata lifecycle. Later sender replacements are separate metadata rows; they
neither become original Add members nor inherit its ACK authority. Missing,
foreign or reparented original identities and unexplained bank-detail additions
remain refusals. Retain the original immutable-effect corruption, owner-switch,
captured-raw mutation, incoming-pull and final-writer negative controls. This
introduces no new receipt, public field, private wrapper, schema, migration or
provider request.
