# Device-local review recovery — technical storage reconciliation

Date: 2026-10-16. Implements existing US6/FR-020/FR-021 recovery and privacy
requirements; no product, approved spec, B1, public financial tuple or hosted
schema change. Owner delegated technical implementation decisions.

## Verified gap and carrier

The existing generated FinancialActionGroup has no private recovery field.
The earlier reference to existing local recovery storage was an assumption,
not an implemented seam. outcomeJson and payloadJson are cloud-facing and
MUST NOT carry raw recovery content.

Reserve one nullable device-only column local_recovery_snapshot_json on the
existing WatermelonDB financial_action_groups table, property
localRecoverySnapshotJson. No Supabase column/table or generated Supabase type
is added. Legacy roots remain null. New committed review roots require a valid
local snapshot while unresolved; accepted/reconciled terminal roots may clear it.

Reserve local Watermelon migration31 (verified current max30); generator-owned
local-column override plus non-generated model field must survive db:sync-local.
Do not hand-edit generated schema/base files or remove public generated types.
T053 remains serialized behind this carrier and SQL inventory admission.

## Closed private snapshot

accountReviewLocalSaveSnapshotSchema retains version account-review-local-save/v1
and the existing actionId, ownerId, sessionId, smsDrafts, createdEntityRefs,
defaultPreimages and sorted defaultDependencyActionIds. Add queuePreimage as the
only ninth top-level key. This unshipped local-only schema is reconciled before
implementation; the public review payload remains unchanged.

queuePreimage is null for Voice. For SMS it contains actual original queue
{id,userId,createdAt,updatedAt,expectedPostimageHash,disposition}; disposition is
present, pruned_empty, expired or superseded. Original timestamps are preserved;
no synthetic queue timestamps, restored namespace generation or invented IDs.

Each available smsDraft retains the existing approved full fields plus
retentionState: available. Expired/superseded entries use a strict metadata-only
variant {retentionState,id,queueId,smsFingerprint,parsedAt,operation,
expectedPostimageHash}; raw payload, original selections and other review content
are removed. Do not keep raw preimages indefinitely or classify corruption as
expiry. Existing30-day parsedAt retention, including equality at cutoff, governs
each entry independently. Do not discard unexpired recoverable siblings merely
because a different entry expires.

createdEntityRefs derives the canonical ReviewMutation entity kinds and covers
every action-created domain row/child. Physical effect membership is verified
separately against the immutable root. Hash explicit owned domain projections;
exclude mutable transport _changed/_status metadata for synced domain rows. SMS
postimage projection MUST distinguish its actual prepared tombstone from a
missing/replaced/rebound row. No guessed timestamps/postimages.

## Atomic capture and recovery

Extend only the linked-plan boundary with an optional typed private snapshot
builder over captured immutable preimages and actual prepared postimages.
After prepared ownership validation, prepareLocalRoot stores canonical private
JSON in the SAME adapter batch as account/child/financial/effect operations and
SMS cleanup/rebinding. Existing rollback/root-target/identity guards remain.
Legacy tuples return no snapshot and retain exact behavior.

Cold restart reads the authenticated owned root, validates exact version/action/
owner/session binding and immutable payload membership, and uses historical
preimages rather than a live review session. Within one writer recheck canonical
rejection/absence/effect evidence, current postimage hashes, children/default
references and dependencies. Newer edits or unknown evidence fail closed with
no partial compensation. Repeated reconciled callbacks/restarts perform no
second writes. Voice stores no transcript or durable Voice review/session.

## Queue deletion, supersession and retention

Do not pin an empty queue indefinitely or change one-queue-per-owner behavior.
Automatic empty-queue pruning, including safe dedup cleanup, records pruned_empty
on affected unresolved roots atomically with deletion. Only this proven case
may recreate the captured original header when NO owned queue exists, all
necessary entries remain unexpired and every restoration guard succeeds.

Explicit discard/reset marks affected private SMS entries superseded and purges
raw review preimages atomically with deletion. Expiry marks only expired entries
expired and purges their raw data in the same cleanup writer. Creating a
different new owned queue invalidates any older pruned_empty restoration right
atomically, so a later deletion cannot resurrect a superseded namespace. Logout
never mutates another owner's stored records.

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

Owned dedicated root remapping preserves validated local private evidence by
owner/action identity across cloud pull; unmatched/foreign roots receive null.
Never copy server-supplied private-column values. Verify real SQLite pull
application before claiming preservation. Root RPC/outbox/generic push/
outcomeJson/log serialization MUST exclude this column and raw recovery values.
The public frozenIntentDigest remains an opaque hash of original intent only.

## Dependency ordering and tests-first acceptance

Capture actual unresolved default/active-set predecessor action IDs; empty only
when independent. Push predecessors to canonical acceptance before successors;
reject/unknown predecessors keep successors pending/recoverable. Never rewrite
immutable envelopes or resample defaults to bypass a predecessor.

Existing task coverage (original80 IDs preserved): T043 snapshot/rollback/clone;
T044 push/privacy/restart/lifecycle conflicts; T048 atomic capture; T049 SMS
cleanup/lifecycle integration; T050 private-field exclusion/dependency ordering;
T051 complete once-only recovery; T053 local migration/generator/pull parity;
T074 legacy/default and source regressions. New tests must prove valid SMS
restoration, prepared tombstones, queue pruning/recreation vs explicit discard/
expiry/new namespace, partial expiry, full rollback, cloned SQLite restart,
newer-choice refusal, dependency blocking, no raw Voice persistence, pull
preservation and private-data exclusion. No emulator/hosted execution.

Implementation stays held until read-only speckit.analyze finds no blocking
contract/coverage inconsistency and Root observes the applicable tests-first Red.
