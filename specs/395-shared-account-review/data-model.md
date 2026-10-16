# Data model — shared account review

Design only. Canonical generated domain types/constants remain authoritative;
logic-owned Zod schemas define temporary review objects, never DB model getters.

## Review row

Stable rowId/source; existing parsed content; evidence/currency state;
assignment; optional endpoint assignments; review reasons; selected; row
revision; user overrides.

- SMS identity: owner queue/draft ID plus canonical source fingerprint. Response
  messageId must correlate with submitted messages.
- Voice: owner session/logical request key plus validated response-local
  transactionRef. Identical content in two separate recordings is not
  automatically one transaction. An unchanged Save intent reuses its action ID.
- Existing categoryId stays required; unresolved account choice is null or a
  discriminated unresolved state, never empty string. Currency certainty is in
  the wrapper, not a fabricated persisted currency.
- Account confirmation preserves amount/category/confidence and other hard
  reasons.

## Evidence and currency

Account evidence: absent/explicit/contextual/uncertain; name/evidence or null;
canonical type/provider/card suffix or null; provenance; advisory candidate IDs.
Use owned active snapshots to revalidate all suggestions. Merchant is not
account. Context only comes from explicitly scoped shared speech, not unrelated
SMS.

Currency: known(code, origin explicit/preferred_omission/user), or unconfirmed
(ambiguous/conflicting/unsupported/legacy_unknown, candidates/evidence/preview).
Grounded omission uses preferred code captured from the owned profile;
subsequent profile changes do not rewrite accepted choices. Invalid is not
omitted. No auto account before known currency. Confirmation affects one row,
preserves its amount.

## Assignment

Unresolved(reason, choices, noID); existing(ownedID, origin exact/default/user,
identity/currency snapshot); suggested(groupID/currentRevision,
pending/confirmed). Default requires absence of explicit evidence and matching
known currency. SMS ordinary source excludes Cash. ATM source and Cash
destination separate: only genuinely absent local `toAccountEvidence` permits
matching Cash default, then sole compatible Cash; explicit/uncertain destination
proof needs an eligible named choice. Current destination uses existing eligible
Cash or a genuine already-canonical confirmed referenced `toAssignment` group;
never fabricate a new ATM destination group/account or index-based localRef.
Ordinary transfer sides stay empty without reliable evidence/user choice; no
same account on both sides.

## Shared suggested account

Stable local groupID, request-scoped model aliases, normalized identity,
editable nickname, type, known currency, provider/card/sender metadata, linked
rowIDs, pending/confirmed/removed state, revision, confirmed identity revision,
provenance.

- Same currency and compatible explicit identity/type/provider/card; different
  non-null card IDs separate. Unknown/incompatible type remains unresolved.
- Late equivalent evidence may reuse identical confirmed identity; incompatible
  rows/identity changes need pending group/confirmation. Arrival selects nothing
  and cannot reinstate removed unchanged evidence.
- Persisted nickname uniqueness is not group equivalence. Card groups
  conflicting on nickname/currency/provider need existing unique-name validation
  and a distinct nickname or explicit replacement; never drop card evidence to
  deduplicate.
- Confirm does not create; only selected referenced groups create at Save.

## Session and transitions

Owner/source/sessionID/source snapshot; rows/groups; filters; operation
generation; review revision; transient Undo; optional stable selected-save
intent.

| Action                      | Group                               | Rows/selection                                             | Durable SMS                          |
| --------------------------- | ----------------------------------- | ---------------------------------------------------------- | ------------------------------------ |
| Confirm                     | Current identity confirmed          | Clear account-only blockers; no selection                  | All linked snapshots atomic          |
| Select eligible pending row | Confirm with prior disclosure       | Clicked row only checked; other hard-invalid rows rejected | Group+clicked selection one write    |
| Edit identity               | New revision and explicit reconfirm | Compatible links retained, invalid selection clears        | All affected snapshots atomic        |
| Row account choice          | Detach row                          | User assignment, others unchanged                          | Row+affected group snapshots         |
| Group replacement           | Disclosed linked scope              | Assign group, preserve valid selection                     | All linked rows atomic               |
| Remove                      | Evidence tombstone                  | Keep rows, unassign/uncheck invalid rows                   | Removal durable, Undo transient      |
| Undo                        | Matching unchanged generation only  | Never overwrite later edit                                 | Atomic; invalidate conflicting token |
| Currency choice             | Detach/regroup one row              | Same numeric amount, eligibility reevaluated               | Row+affected groups atomic           |
| Select ready                | No confirmation                     | Eligible active-filter rows only                           | Selection batch                      |
| Set filter                  | None                                | Only canonical filter changes; review revision +1, business generation/Undo unchanged | All owned V2 headers one batch |
| Save                        | Unused groups not created           | Valid selected batch complete action                       | Financial save+local cleanup         |

## SMS payload v2

Reuse payload_version/payload_json and existing ownership/queue/fingerprint/
selection fields, no review-table DDL. V2 stores evidence/assignment/currency
and referenced group identity/status/removal/revision snapshots. Group commands
update all affected rows in one scoped writer; restoration requires consistent
snapshots, otherwise unresolved recovery rather than last-write-wins
confirmation.

**Filter authority (T054 reconciliation):** session `filter` is its
single canonical All/Needs review/Selected value, changed only by
`set_filter` carrying current owner/session/revision/business-generation
CAS. Changed filter increments `revision` once without increasing
`operationGeneration`, `sourceRevision`, row/group revisions or altering
choices, selections, default eligibility, Save facts or the volatile Remove
Undo token. Same filter is an identity no-op. Undo after filter switches keeps
the current filter and restores only the guarded prior business removal, never
later edits. All→Needs→All invalidates a stale previous All bulk command through
review revision despite identical final filter.

**Local V2 compatibility:** historical nine-key `review` headers decode
`filter: "all"` with their raw bytes left untouched. New writes use the
strict tenth `filter` key on every affected V2 row; filter-only transitions
serialize *all* owned V2 header rows in one scoped atomic batch and enforce
identical current filter, otherwise reject rather than last-write-wins.
Touching compatible V1 records follows the existing guarded atomic migration,
never rewrites unreadable V1 or historical device-private preimage JSON.
`filter` is not a DB column, remote payload, provider request, public
financial-action field, Undo history or Voice durable object.

**Facade projection authority:** outward
`readModel: AccountReviewReadModel | null` is shaped by the existing pure
`projectAccountReviewSession` using the canonical owned session and
fresh/authenticated account-read service snapshots. The entire existing
projection (`summary`, `groupSummaries`, `visibleRowIds`,
`readyVisibleRowIds`) belongs to logic, not UI. SMS bootstrap/commands/reload
and Voice bootstrap/commands/reload revalidate owner and cancellation
generation; unavailable/stale/failed projections return `null` without
publishing previous owner's values. No business snapshot fetch in presentation.

V1 reader preserves fingerprint, explicit chosen owned account, category
confirmation and selection override. Pending-account existence alone does not
prove group confirmation. Missing currency provenance is legacy_unknown, not
omitted. Migrate touched v1 groups locally inside one write; no silent payload
discard. Existing expiry/dismissed-fingerprint policy remains. Undo not durable,
removal durable. No raw SMS/draft JSON in cloud action/sync/logs; Voice has no
new durable table.

## Save intent and persisted data

Intent freezes selected row/group revisions, owner, source identities,
operation generation, occurredAt, stable actionID and all `plannedEntityIds`
**before awaits**: selected financial localRef = row.rowId, needed created
account localRef = confirmed group.groupId, each actual create UUID distinct.
BANK detail/sender children derive stable T043 localRefs with the shared pure
UUID-v8/hash algorithm; sender normalization is trim/collapse whitespace/
lowercase (no NFC). WALLET has no bank details, CASH no bank/sender children.
Revalidate frozen aliases/IDs, owner/source/row/group/currency/selection,
accounts/categories/uniqueness/evidence/fingerprints and financial revisions
inside the writer. A changed selection creates a new intent only before
commit; resolve ambiguous committed outcome before another action.

Existing
Account/BankDetails/AccountSmsSender/Transaction/Transfer/FinancialActionGroup
and effects remain authoritative. Children inherit owned account scope. New
local SQL registrations are `090_review_batch_save.sql` and separate
`091_account_create_default_intent.sql` following main's 089 inventory; retain
082–085 fence behavior, no hosted deployment or fabricated account fields.
Money boundaries use canonical decimal/minor-unit strings, no new float sums.

Review creation/default: its only closed optional snapshot key is
`creationDefaultSnapshot`, present **iff any new Cash/Bank/Wallet account is
actually created after SMS deduplication**, with sorted owned active IDs and zero/one current default. Empty
captured active set: exactly the minimum frozen actual account-create UUID is
`isDefault: true`; other created accounts false. Nonempty captured set: every
new account false and any existing default/no-default state preserved. Multiple
compatible confirmed Voice Cash groups of different currencies remain separate
and may Save together; there is no singleton restriction or prior-default clear
in review. Frozen flags/snapshot revalidate under one owner-wide local/server
CAS, with safe replay, failure and reconciliation; group confirmation writes
no account/default metadata.

Add Account default intent remains separate: first ON/disabled, later initially
OFF; a successful Add command may clear the prior default atomically through
`expectedDefaultSnapshot`. Toggle/cancel/failure is unsaved only. No changes to
existing Edit semantics, app controls or B1 copy.


Review replay commitment: the unshipped review payload also requires the single frozenIntentDigest described in contracts/wire-shapes.md. It commits to original selected financial facts, confirmed-group provenance and full planned IDs, including legitimate SMS dedup omissions. Only that hash enters the existing cloud payload_json; the digest itself adds no model/table/column or raw source persistence. The separately required device-only recovery carrier and bounded SMS preimages are specified in contracts/local-recovery.md; no raw Voice review is durable. Historical replay reuses the stored creationDefaultSnapshot or absence; actual post-dedup account creates alone determine snapshot presence.

## Device-only recovery projection (technical, not yet in the DB)

Review Save's root `financial_action_groups` is a synced table, but
the proposed `local_recovery_snapshot_json: string | null` is a
**Watermelon-only column** with non-generated model property
`localRecoverySnapshotJson`. Pre-existing actions have `null`;
unresolved locally committed review-batch actions retain one validated
private snapshot, atomically clearing it on accepted/reconciled terminal
outcomes. This is **not** a server-owned column, public Supabase type,
wire payload, Cloud action effect, or durable Voice review table.

The private closed `account-review-local-save/v1` snapshot contains
exactly `version,actionId,ownerId,sessionId,smsDrafts,
createdEntityRefs,defaultPreimages,defaultDependencyActionIds,
queuePreimage` (nine keys). `queuePreimage` is null for Voice and for
SMS carries original owned queue `id,userId,createdAt,updatedAt,
expectedPostimageHash,disposition` with `present | pruned_empty |
expired | superseded`. The full available SMS draft preserves the
original physical owner/queue/fingerprint/selection/raw JSON and
prepared postimage hash; after individual expiry or supersession keep
**only** `retentionState,id,queueId,smsFingerprint,parsedAt,
operation,expectedPostimageHash`. At `parsedAt <= 30-day cutoff`,
including equality, purge only that entry's raw state; retain
unexpired siblings. Corrupt/missing evidence is never treated as
expiration. Queue recreation is permitted only after authenticated,
atomically proven `pruned_empty`, no current owned queue, and
unchanged exact preimages; explicit discard/reset/new namespace or
expiry blocks resurrection.

A private snapshot builder consumes actual immutable foundation
cached preimages and prepared postimages after owner checks.
`createdEntityRefs` includes every action-created domain row and
child (effect membership separately verified). `defaultPreimages`
binds actual prepared/default postimages. Hash explicit owned domain
fields (omit mutable sync `_changed`/`_status`), distinguishing
prepared SMS tombstones/rebind from missing, changed or rebound rows.
`defaultDependencyActionIds` is sorted actual optimistic default/
active-set predecessors: push predecessors to canonical acceptance
before successor; on reject/unknown/unsupported hold/recover rather
than resampling immutable defaults.

Reconciliation after cold restart validates the owner/action/session,
canonical effects, children, defaults, current postimages and queue
disposition before exactly-once restoration. Owned dedicated root
pull/upsert must preserve validated private data by owner/action;
generic pull/push, outbox, RPC, `payloadJson`, `outcomeJson` and
logs must not serialize it. `frozenIntentDigest` remains the public
opaque original-input digest; `payloadHash` remains the separately
canonical full action hash. Neither stores or substitutes for this
private recovery JSON. No raw Voice transcript/audio/session is
durable.

**Migration gate:** Watermelon migration31 follows existing
version30 with a durable generator-consumed local-only override,
non-generated model field, regenerated schema and repeatable
`db:sync-local` parity/pull/privacy tests committed together.
The current model/foundation lacks this storage/builder; this is
a feature **target**, not an implemented table field. Server-owned
090/091 migration/RLS/CAS remain separate. See
[local recovery](contracts/local-recovery.md) and reviewed
Constitution VII 1.8.0 (`dd16d5440556b651cb5b6395a00c1c4d37538dcf`).
