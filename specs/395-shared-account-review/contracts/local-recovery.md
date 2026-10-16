# Device-local review recovery — technical storage reconciliation

Date: 2026-10-16. Technical implementation contract for the already approved
**US6 / FR-018 atomic selected Save** and **FR-019 durable SMS review and
Review later**, with **FR-021 verified ownership/provenance/privacy** and
Constitution VIII's authenticated scope/sync integrity. FR-020 continues to
govern no extra AI parsing/usage; it is not the restoration requirement.
The scoped device-only migration route follows the separately reviewed
Constitution VII 1.8.0 exception at `dd16d5440556b651cb5b6395a00c1c4d37538dcf`.
No new product behavior, approved spec/B1, public financial tuple, Supabase
schema or hosted deployment is introduced. The owner delegated technical
implementation decisions; the feature's tests-first/source/independent review
gates remain open.

## Verified gap and carrier

Verified at source parent `6453b4c1c8cb71b648ce282be500d14f45f166d9`:
`packages/db/src/schema.ts` remains at Watermelon version 30; the generated
`BaseFinancialActionGroup` and the non-generated `FinancialActionGroup`
have **no** local recovery field. The current
`FinancialActionLinkedOperationPlan`/foundation `prepareLocalRoot` has
**no** optional private snapshot builder. The legacy reconciliation path
contains single-draft evidence, not a durable complete-review batch carrier.
Prior references to an existing private recovery store were assumptions.
`outcomeJson`, `payloadJson`, sync/outbox/RPC and logging paths are
cloud-facing and MUST NOT carry raw recovery content.

Reserve exactly one nullable **device-only** WatermelonDB column
`financial_action_groups.local_recovery_snapshot_json`, exposed through the
non-generated model property `localRecoverySnapshotJson`. It is an extension
of an otherwise syncable local root, **not** a Supabase column/table, public
generated Supabase type, common financial action payload or server outcome.
Pre-existing/legacy roots remain `null`; newly committed review-batch roots
must have the validated local snapshot while unresolved. Accepted or fully
reconciled terminal roots may clear the private value **atomically**.

Reserve Watermelon migration **31** after the independently verified highest
local version **30**. The feature migration must include a durable
generator-consumed local-column override, non-generated model field, versioned
Watermelon migration, generated local schema and reproducibility/parity tests
as one change. Current `db:sync-local` does not yet demonstrate preservation of
this proposed column; extend the generator before claiming it. Never hand-edit
generated schema/base files, delete public generated fields/types, add a dummy
Supabase column or use `db:migrate` (`db:push` first) as local-only generation.
No feature storage or SQL has been installed by this contract. T053 owns the
local generator/migration/pull proof; 090/091 remain distinct server-owned SQL
reservations under their own approval and deployment gates.

## Closed private snapshot

`accountReviewLocalSaveSnapshotSchema` is a **proposed, unimplemented**
strict private schema, version `account-review-local-save/v1`. Its **nine and
only nine** top-level keys are `version`, `actionId`, `ownerId`,
`sessionId`, `smsDrafts`, `createdEntityRefs`, `defaultPreimages`,
`defaultDependencyActionIds` and `queuePreimage`. The eighth field is a
sorted/distinct list of actual predecessor action IDs; empty only when
independent. `queuePreimage` is the ninth key added during reconciliation.
Each private value is parsed and bound to the owned action root before use,
never inferred from a serialized public action. No private field is added to
the closed public `review.batch-save/v1` payload or common action envelope.

`queuePreimage` is `null` for Voice. For SMS it captures the **actual
original** owned queue header `{id,userId,createdAt,updatedAt,
expectedPostimageHash,disposition}`; `disposition` is exactly
`present | pruned_empty | expired | superseded`. Header timestamps/IDs
come from the preimage and are never invented from a transport lease, later
namespace generation or current wall clock.

`smsDrafts` is a strict **per-entry retention-state union**:

- `retentionState: available`: retains the existing complete approved local
  draft preimage `{id,queueId,smsFingerprint,createdAt,updatedAt,parsedAt,
  payloadVersion,position,selectionOverride,payloadJson,
  expectedPostimageHash,operation}`, plus the retention discriminator.
  Canonical local JSON encodes `payloadVersion` and `position` as canonical
  unsigned integer **strings**, safely decoded to original numeric columns.
- `retentionState: expired | superseded`: **metadata only**,
  `{retentionState,id,queueId,smsFingerprint,parsedAt,operation,
  expectedPostimageHash}`. Purge original payload, selected state, timestamps
  not listed here and all remaining review content. Never treat malformed
  payload/corrupt proof as expiration or silently sanitize it.

Retention is **30 days from each draft's actual `parsedAt`**; at
`parsedAt <= cutoff` the entry is expired, including exact equality.
Redact *only* expired entries, even where a sibling is still recoverable.
Neither queue disappearance nor another entry's expiry proves that a
surviving entry is expired or should be discarded.

`createdEntityRefs` derives from the **canonical** `ReviewMutation` entity
kinds and covers every action-created account, bank detail, SMS sender,
transaction/transfer and other permitted domain row/child. Verify physical
account-effect membership **separately** against the immutable root; do not
invent an effect entity or trust only an enumerated ID. Both
`createdEntityRefs` and `defaultPreimages` bind expected postimage hashes to
the actual prepared operation. Hash explicitly enumerated **owned domain**
fields, excluding mutable Watermelon transport `_changed`/`_status` for
synced domain rows. For SMS use the actual prepared deletion/tombstone/rebind
projection and original queue membership; a missing, replaced or rebound row
MUST hash differently from the expected prepared postimage. Never guess
postimages, timestamps, default state or created children.

`frozenIntentDigest` and the root `payloadHash` are **public immutable
commitments** to different objects: the former hashes the original frozen
selected request, including legitimate deduplicated omissions; the latter
hashes the canonical full financial action envelope. Neither is a
restoration/preimage hash, and neither contains or replaces the private local
snapshot. Local `snapshotHash` binds a historical draft preimage, while
`expectedPostimageHash` binds the actual linked prepared postimage, not
arbitrary future state. Only opaque approved public hashes enter the wire.

## Atomic capture and recovery

Introduce a **typed, optional private snapshot builder** only on the existing
`FinancialActionLinkedOperationPlan` boundary. Its inputs are the foundation's
actual frozen `cachedPreimages` and `preparedPostimages`, plus the
already validated owner/action/intent context; do not synthesize a parallel
financial action DTO or expose a public wire field. Call it **after**
`assertPreparedOwnership` and actual prepared-operation/postimage checks.
`prepareLocalRoot` writes the canonical local-only JSON onto the owned root
in the **same adapter batch** as the financial/account/child/effect operations
and SMS cleanup/rebinding. The root's private field is absent/null for
legacy tuples and exact old behavior remains. The existing pending-root,
ownership, root-target, identity, prepared-cache-rollback and durable-commit-wins
guards remain authoritative; no snapshot write after committing the root.

Cold restart reads the **authenticated owned** action root, validates the
private version and exact `actionId`/`ownerId`/`sessionId` binding,
immutable public payload/group membership and owned referenced records. It
reconstructs recovery from historical private preimages, **not** a live review
session, newly parsed provider output or guessed default. Within one
serialized writer recheck canonical rejection/absence/account-effect evidence,
current postimage hashes, children/default refs, queue disposition and actual
dependency state. Missing/changed/foreign postimages, newer choices or unknown
server evidence fail closed into explicit incomplete recovery with zero partial
compensation. Retry/restart/callback replay is idempotent and does not issue
another financial posting. Voice carries `queuePreimage: null`, no
`smsDrafts`, transcript, raw audio or durable Voice review/session.

## Queue deletion, supersession and retention

Do not pin an empty queue indefinitely or weaken one-queue-per-owner
semantics. Automatic empty-queue pruning (including safe all-dedup cleanup)
records **`pruned_empty` on every affected unresolved private root in the
SAME local writer/batch** as the physical queue deletion. Only this positively
proven disposition may recreate the **original** captured header if no owned
queue exists, every required draft remains unexpired/available, and the exact
preimage, owned-scope and conflict guards all pass. `present` means an actual
current owned queue must still match; it is not authority to fabricate a
missing queue.

Explicit discard/reset marks affected private entries `superseded` and
purges their raw SMS/selection/review preimages in the **same** deletion
writer. Expiry marks only individually elapsed entries `expired` at the
30-day `parsedAt <= cutoff` boundary and purges raw data atomically; it does
not purge unexpired siblings. An expiry that removes a queue also proves the
queue `expired`, not `pruned_empty`. Creation of a different owned queue
atomically invalidates older `pruned_empty` restoration rights as
`superseded`, including when that newer queue is subsequently deleted.
Logout MUST NOT change another owner's records or reinterpret queue lifecycle
evidence.

A different current owned queue, changed existing header/postimage, duplicate
fingerprint, newer target choice or missing queue without proven disposition
refuses automatic restoration. Never create two owned queues or overwrite a
newer namespace. Proven expired/superseded entries are not restored; financial
compensation can complete without reactivating deliberately discarded/expired
SMS. Missing/corrupt evidence is NOT treated as a proven lifecycle disposition.

Owner-scoped retention cleanup scans private unresolved root evidence even if
its queue was already pruned. Accepted or fully reconciled outcomes clear the
private carrier atomically; retryable transport/unsupported outcomes retain it
subject to the same30-day SMS redaction. Non-SMS financial evidence survives
SMS redaction until reconciliation is terminal.

## Pull and privacy

The **dedicated owned-root pull/remapping path** must explicitly preserve the
locally validated private column by exact authenticated `ownerId/actionId`
(and immutable root identity/payload match) when applying a canonical cloud
root. A foreign, unmatched, action-ID-reused or inconsistent root receives
`null`; never trust or copy a server-supplied value for the private field.
Tests must exercise the actual SQLite pull/upsert path, including a surviving
unresolved snapshot across cold restart and a safely cleared terminal root.
Generic pull mapping, RPC, outbox, protected/generic push, `payloadJson`,
`outcomeJson`, Supabase schema/types, analytics and logs MUST exclude raw
recovery bytes; cloud-visible `frozenIntentDigest` remains just an opaque
hash of original intent. No silent fallback when a sync mapping would erase
required unresolved local evidence.

## Dependency ordering and tests-first acceptance

Capture **actual** preceding unresolved action IDs whenever the frozen
active/default account set depends on their optimistic create/default
effects. The `defaultDependencyActionIds` array must be distinct,
canonical ASCII-sorted; it is empty only if independently proven. Push each
predecessor to a canonical **accepted** result before dispatching a successor;
pending/unsupported transport leaves the successor pending, while
rejected/unknown predecessor outcomes require recovery and prohibit implicit
successor replay under a different default snapshot. Reconstruct and validate
these dependencies after restart; do not rewrite an immutable envelope, reorder
dependents past unresolved roots or resample defaults as a workaround.

The **existing eight task IDs** are the sole assignment map, without new
tasks: **T043** local snapshot/rollback/restart/clone fixtures, **T044**
push/private-field/rejection/dependency/lifecycle race Red, **T048**
first-write optional linked-plan snapshot capture, **T049** queue
prune/discard/expiry/supersession/rebind in same writer, **T050** private-column
push/RPC/outbox exclusion and predecessor dispatch ordering, **T051**
cold-restart once-only recovery with postimage/default/child checks,
**T053** migration31, durable generator/source override, generated local
schema/model and real SQLite pull-preservation proof, **T074** complete
legacy/source/restart/privacy regressions. Required tests cover tombstones
versus absent/replaced rows, exact queue recreate/refusal, partial expiry,
cloned fresh-DB restart, malformed private evidence, current/newer-choice
refusal, dependency accept/reject/unsupported, Voice privacy, owner change,
prepared/cache rollback and cloud exclusion. No emulator or hosted execution
is claimed by planning.

Implementation stays held until **Root performs fresh read-only Speckit
analysis on this reconciled contract package**, resolves any blocking
inconsistency, observes the applicable tests-first Red, and explicitly grants
each separate storage, writer, sync/SQL and verification lane. This contract
does not mutate the feature schema, public wire types, existing tests or
business behavior. No local generator, DB or hosted check has been run here.
