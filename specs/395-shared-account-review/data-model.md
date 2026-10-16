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
| Save                        | Unused groups not created           | Valid selected batch complete action                       | Financial save+local cleanup         |

## SMS payload v2

Reuse payload_version/payload_json and existing ownership/queue/fingerprint/
selection fields, no review-table DDL. V2 stores evidence/assignment/currency
and referenced group identity/status/removal/revision snapshots. Group commands
update all affected rows in one scoped writer; restoration requires consistent
snapshots, otherwise unresolved recovery rather than last-write-wins
confirmation.

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


Review replay commitment: the unshipped review payload also requires the single frozenIntentDigest described in contracts/wire-shapes.md. It commits to original selected financial facts, confirmed-group provenance and full planned IDs, including legitimate SMS dedup omissions. Only that hash enters the existing payload_json; no model/table/column or raw Voice/SMS review persistence is added. Historical replay reuses the stored creationDefaultSnapshot or absence; actual post-dedup account creates alone determine snapshot presence.
