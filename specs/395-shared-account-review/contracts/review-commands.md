# Review engine, services and UI contract

Frozen T004 technical target; exact schema/API names, command keys, revision
checks and SMS v2 root are in [wire shapes](wire-shapes.md). Implementation is
pending; [spec](../spec.md), [B1 approval](../approvals/b1-2026-10-14.json) and
scoped image bindings govern behavior/presentation.

## Pure layer

Logic exports canonical schemas, identity/currency resolver, candidate
filtering, immutable reducer and review read-model projection. Inputs are plain
snapshots; no runtime DB imports, network, translation, React, timers or local
storage.

Commands carry owner/session ID, expected review/row/group revision and explicit
scope. Reducer returns next immutable state, affected IDs, validation reason
codes and effect description. A stale command fails without partial mutation.
Inject IDs/time; don't generate them during rendering. Identity edits and
invalidating currency changes increase revisions and clear obsolete
confirmation.

Wire discriminants use snake_case (`confirm_group`, `select_row`, `edit_group`,
`choose_row_account`, `replace_group_account`, `remove_group`, `undo_removal`,
`confirm_row_currency`, `select_ready`, `clear_selection`, `set_row_selected`,
`set_filter`).
The camelCase labels below describe interactions rather than a second wire
schema. `saveSelected` invokes the frozen save-intent/service boundary; it is
not a reducer DB mutation. No nullable category ID widening.

Explicit grounded Voice Cash uses canonical CASH through the shared engine and
source/type-safe Save helper; legacy SMS BANK/WALLET draft types must not narrow
Voice. Review creates Cash, Bank or Wallet only for necessary selected confirmed
groups. At Save (never confirmation), capture exactly one
`creationDefaultSnapshot` if any new account is created. When the captured owned
active set is empty, only the minimum frozen **actual account-create UUID**
is default; otherwise all new accounts are nondefault, preserving any existing
or intentional no-default state. Independently confirmed multi-currency Voice
Cash groups are valid together; no one-Cash limit or new default-clear mutation.
Add's separate default-intent clear still uses current UUID/flag CAS, not
timestamps; SQL serialization proof and independent DB/logic gates remain.

## Resolution order

1. Preserve valid explicit user account/currency override. Revalidate owned
   active eligibility; invalid choice becomes unresolved with recovery, not a
   default.
2. Resolve known currency: grounded explicit code, proven omission→captured
   preferred code, or user's confirmation. Uncertainty blocks auto-assignment.
3. Use explicit grounded identity/card/provider evidence to form candidate list.
   One compatible confident existing match accepts; several require choice.
4. Explicit named unmatched evidence gives pending group or unresolved type/
   identity; never substitute default.
5. With absent account evidence, exactly one eligible active default may accept,
   regardless total accounts. Inconsistent defaults/no eligible default
   unassigned.
6. SMS source excludes Cash. With genuinely absent `toAccountEvidence`, ATM
   destination checks eligible same-currency Cash default, then sole eligible
   Cash, else requires explicit choice. Explicit/uncertain proof cannot silently
   fall back; current Save uses an eligible existing Cash or a genuine already-
   canonical, confirmed referenced `toAssignment` group only. No invented Cash
   destination/account, first-bank guess or row-index group. Ordinary transfers
   require reliable evidence/user choice and distinct endpoints.

For ATM SMS, `toAccountEvidence` is **local destination proof**, distinct from
`toAssignment` (current choice). Match grounded explicit destination to owned
eligible Cash or require a named choice; explicit unmatched or uncertain/invalid
proof must never fall back to a Cash default. Only genuine absence (`null` or
canonical `absent`) with known matching currency permits the compatible Cash
default, then sole eligible Cash, otherwise unresolved. Source and destination
require independent validation; user choice is rechecked, and legacy
`transaction.toAccountId` is not proof.

Accepting a default clears only the account blocker and exposes editable row
label plus quiet count/Why copy. Preserve amount/category/confidence/currency
reasons.

## Command outcomes

| Command                                   | Scope and required outcome                                                                                                             |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| confirmGroup(groupID, revision)           | Confirm current identity for all linked rows; select/create zero; preserve other groups/reasons                                        |
| selectRow(rowID, revision)                | If otherwise valid and pending shared account disclosed, confirm group then check clicked row only; hard-invalid row remains unchecked |
| editGroup(groupID, patch)                 | Validate unique nickname/type/provider/card; locked currency; explicit reconfirm new identity; linked count disclosed                  |
| chooseRowAccount(rowID, accountID)        | Revalidate candidate and known currency; detach one row, keep other choices                                                            |
| replaceGroupAccount(groupID, accountID)   | Explicit linked-count disclosure; compatible existing account applied to group; preserve valid selections                              |
| removeGroup(groupID, revision)            | Retain transactions; clear only group assignment/newly-invalid selection; durable tombstone, no immediate regeneration/default         |
| undoRemoval(token)                        | Same owner/session/generation only; no overwrite of later row/group edits; invalid token withdrawn                                     |
| confirmRowCurrency(rowID, code)           | Preserve amount, detach/regroup one row, reevaluate account; no group-wide mutation/conversion                                         |
| selectReady(activeFilter, reviewRevision) | Eligible shown rows only; never confirms pending groups/hard invalids; if all ready selected, Clear selection                          |
| setFilter(nextFilter, currentRevision)     | Switch canonical All/Needs review/Selected filter by owner/session/revision CAS; no business change, no row selection or Undo loss |
| saveSelected(intent)                      | Freeze/validate eligible checked rows; complete action contract only                                                                   |

Direct selection feedback names shared count but explicitly describes only
clicked row selection. Group confirmation status is separate from checkbox
selection. No async progress callback, new chunk or re-render may revert user
state.

## Mobile service / hook boundary

Owned account read-model service batches account, bank-detail and sender reads
using approved scoped helpers; shapes plain snapshots. Review command service
applies validated reducer effects to SMS snapshots in one scoped repository
writer; Voice adapter owns only session state. No DB writes/calculation logic in
hooks.

Facade hook manages loading/cancellation/subscription, operation generations and
service invocation. On owner/logout/session change, clear state and cancel stale
callbacks. One serialized SMS command queue protects group+selection
persistence; optimistic UI rolls back only the failed generation and never
overwrites later accepted edits. Do not duplicate reducer logic in
useTransactionReviewSelection.

SMS batch command rereads current linked records, verifies
queue/user/fingerprints/revisions, computes next state, encodes v2 and commits
all group snapshots plus affected selection overrides atomically. The
`set_filter` command uses this SAME guarded, serialized writer, updating the
filter in every owned V2 header, including otherwise untouched rows; it never
writes a new source of UI-only filter truth. Old nine-key V2 headers decode
filter `all` without rewriting their original JSON. All newly written V2
headers explicitly carry the same tenth local-only `filter` field; mixed
or conflicting current filter headers refuse rather than merging by last-write
order. An unchanged filter is a true no-op with no physical write. Header-wide
filter transition preserves original row/group business revisions and selections.
Any touched V1 migration remains atomic and must retain genuine legacy source
bytes, category/account choices and selection overrides; unreadable V1 input
fails closed without discarding it. No new table/column, provider/cloud fields
or SMS history normalization during private preimage recovery.
Preserve retention and durable Review later; failed mutation retains inputs and
actionable retry. No cloud review sync.

## T054 technical reconciliation — filter and projection (2026-10-16)

The approved All/Needs review/Selected choices are **one canonical session
filter**, not local UI shadow state. `set_filter` carries the usual `ownerId`,
`sessionId`, `expectedReviewRevision`, `expectedOperationGeneration` and
a next `filter` from the closed three-value union. Both SMS and Voice dispatch
the same canonical reducer; no second command family, business projection or
financial-action DTO. The command is rejected without mutation for a foreign
owner, wrong session, stale revision/generation, frozen `saveIntent`, cancelled
generation or conflicting in-flight action. Busy controls disable conflicting
actions, and the writer's authoritative CAS remains mandatory. Identical target
filter is an accepted no-op: same object/revision, `effect: "none"`, empty
affected IDs and reason codes, no Undo change. An actual transition updates
**only** `session.filter`, increments `session.revision` exactly once,
preserves `operationGeneration` and `sourceRevision`, and never changes
row/group revisions, assignment, confirmation, selected bits, save readiness or
persistent financial state. It returns `"persist_sms"` for SMS and
`"session_only"` for Voice. All→Needs review→All increments the review
revision twice: an old All-filter Select ready/Clear command fails stale CAS
even though its filter label matches again. Bulk commands continue to require
exact current filter; they cannot use an inactive filter from presentation
state.

A **valid previous Remove Undo lease survives filter-only transitions**:
preserve its transient token/previous business snapshot and removal generation
for both facade and SMS lifetime authority. Undo checks current owner,
session/source, preserved business operation generation and full current
row/group/tombstone proof with no intervening business edits or ABA; the
separate monotonic review revision may include filter-only increments.
Successful Undo retains the **current filter**, not the pre-removal filter,
and remains a guarded business transition. An intervening edit, row selection,
new source generation or changed group still invalidates that prior Undo.
Nothing serializes Undo into SMS, RPC or local review evidence.

The facade publishes `readModel: AccountReviewReadModel | null` from the
**actual canonical** `projectAccountReviewSession({session,
accountSnapshots})`. The account context comes from the same authenticated
`loadAccountReviewAccountSnapshots` service used for commands (including
Voice's asynchronous ready/bootstrap path), never a screen fetch, provider
context or copied count formula. All projections re-check owner/session and
the mounted cancellation generation before publication. SMS bootstraps
session and snapshots together, refreshing owner-scoped snapshots after
accepted commands/reload when needed; Voice loads owned snapshots before
publishing ready projection and refreshes them after commands/reload. Pending,
missing or stale-owner context, aborted load, failed projection or logout
publishes `null` (and appropriate normal loading/recovery), never prior
actor/group data. The shaped projection alone supplies the UI's global counts,
visible row IDs, ready visible row IDs and group summaries; it calls the
existing guarded bulk reducer for the ready preview. The `AccountReviewPanel`
remains presentational.

This is a narrow technical interpretation of already approved R3/M10–M11
behavior, **not** a UI/copy/B1/spec change or claim of runtime admission.
The associated docs/tests are authored first; Root performs meaningful Red,
Speckit analysis and explicit source grants before implementation.

## UI surfaces and exact authority

Reuse TransactionReview/TransactionItem/PageHeader/ReviewActionBar and existing
edit/currency controls. New presentational panel/sheets render shaped props and
callbacks only. Common B1 dimensions/tokens and source-specific header context
apply; tests at ordinary390 and compact widths plus font scale/RTL/safe-area.

- Combined: compact Review details panel with independently actionable QNB/CIB
  rows, aggregated issue row(s), quiet default note and Why.
- Default-only: note only, no empty panel. Issues-only: issues, no draft/default
  banners. Clean: omit whole information region. Confirmed: read-only status and
  Change/menu, no mandatory Confirm all.
- View all: every group/status/action reachable via FlatList. Counts use
  complete linked groups; issue totals count distinct affected transactions.
- Three filters All/Needs review/Selected; ready-selection action is separate
  toolbar, not fourth filter. Counts use actual checked rows, even offscreen.
- Row candidate sheet affects one; group replacement sheet explicitly all
  linked. Options show nickname/type/currency/provider/masked suffix when
  available, no invented card digits. No option preselected without actual
  confirmed assignment.
- Existing CurrencyPicker accepts nullable unconfirmed selection and optional
  localized context; direct row tap accepts; cancel/Back changes nothing.
  Existing callers remain compatible. Do not implement custom R3-04
  list/search/chrome.
- Keep source-specific Voice retry/transcript and SMS Review later. Filter-empty
  state is not recorder empty response. Maintain original financial disclaimer.
- Loading uses shared Skeleton; pending mutation disables conflicting actions.
  Existing local offline/recovery behavior remains; no offline AI claim.
- Footer/modal includes runtime bottom inset once; keyboard can scroll required
  controls into view. No content/font shrinking to hide clipping.

## Add/Edit account intent

Use same existing star/default track/helper pattern. Add block after Initial
balance before SMS matching; existing unrelated fields/read-only Edit
type/currency remain. First Add ON/disabled, later initially OFF. Helper is
source/type-aware; Cash helper excludes ordinary SMS source. Previous default
replacement copy shown only when applicable. Validate intent in command schema,
apply within successful zero/nonzero creation with prior-default clearance and
rollback. Existing Edit default behavior preserved; this scope changes helper,
not unrelated form flows.

## Required coverage

M01–M18: resolver truth table, shared revisions/selection, removal/Undo, scoped
replacement/currency, counts/filters/all-state layouts, long lists,
duplicate/stale/ foreign refs, source recovery, account intent
cancellation/failure, nullable picker, zero additional parser calls,
accessibility roles and runtime bottom inset. Author fixture Maestro journeys
before production; owner executes device/visual checks. Failure injection or
real recording cannot be claimed as automated E2E without an honest controlled
fixture/harness. For atomic zero/nonzero create and remote unique-default
safety, see [account default intent](account-default-intent.md); a separate
post-create toggle is not an acceptable implementation.

---

## T043 approved interpretation — ATM choice and frozen Save links

This clarifies existing commands, **not** a new command, UI field, type or
automatic destination draft. It preserves the independent local
`toAccountEvidence` proof described above.

- For an SMS ATM row, `choose_row_account` routes an explicitly selected
  eligible CASH account to destination `toAssignment`; BANK/WALLET choices
  route to source `assignment`. Preserve the opposite endpoint. Revalidate
  owner, active scope, currency, distinct endpoints, row/financial revisions
  and any real group linkage through T034/T036; no implicit Cash/bank guess.
- Eligible compatible default/sole Cash and explicit manual Cash selection
  are current destination outcomes. A genuine existing, confirmed and
  referenced `toAssignment` group may retain its approved `groupId`; no new ATM
  destination group/account may be invented. Without a verified existing Cash
  endpoint or canonical referenced group, destination stays **unresolved** and
  Save blocked. Never derive localRef from row index, nickname or nullable
  legacy `toAccountId`.
- Frozen SaveIntent localRefs are selected financial `row.rowId` and needed
  group account `group.groupId`, with separate frozen created UUIDs. BANK detail
  and sender child aliases follow the [T043 wire freeze](wire-shapes.md#t043-technical-freeze--planned-create-localref-derivation-2026-10-15),
  with exact sender normalization and no Cash bank/sender children. No payload
  or command field is added.
- Freeze choices, owner/session/row/group/currency/selection revisions and
  planned IDs **before awaits**; revalidate after async reads and inside the
  guarded writer. A callback/label is not persistence proof. Do not silently
  use SMS v1 encoding for v2; only explicit legacy/migration tests use v1.
