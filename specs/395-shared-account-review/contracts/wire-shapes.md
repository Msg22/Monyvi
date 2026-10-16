# T004 normative wire shapes

Frozen T004 technical target for #395; these APIs and operations are **not yet
implemented**. Default CAS compares exact current logical state, without a
timestamp or new global revision. Shared serialization remains an explicit SQL
implementation-proof gate, subject to independent DB/logic review before SQL
acceptance. Read with the four source contracts. Existing persisted models,
generated `@monyvi/db` types and v1 operations remain authoritative. New schemas
live in logic; inferred types are exported once through its barrel. Do not copy
these shapes into component, mobile adapter or Edge type declarations.

## Common validation and ownership

Every object below is closed (`z.object(...).strict()`); listed keys are
required unless marked optional. Nullable means present with `null`, never
omitted or `""`. Arrays are duplicate-free; financial arrays use
ASCII/C-collation order, not locale ordering. JSON action envelopes contain no
numeric values. Local review/provider objects may contain validated numbers for
indices/confidence.

| Token                                | Exact boundary                                                                                                                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UUID                                 | Existing lowercase canonical UUID validator; persisted IDs/action IDs/owner IDs only                                                                                                         |
| Ref                                  | Nonempty response-local string, scoped to logical request/chunk by the adapter; never used as DB ID                                                                                          |
| Revision                             | Existing `parseCanonicalUnsignedIntegerString`, `0` or unpadded positive digits, at most `9223372036854775807`                                                                               |
| Timestamp                            | Existing strict real UTC millisecond timestamp, `YYYY-MM-DDTHH:mm:ss.sssZ`                                                                                                                   |
| CalendarDate                         | Real `YYYY-MM-DD`, existing source date policy and latest-allowed-date validation                                                                                                            |
| Hash                                 | Lowercase SHA-256, exactly 64 hexadecimal characters                                                                                                                                         |
| MinorUnits                           | `0` or signed unpadded integer digits; no `+`, exponent, decimal, whitespace, leading zeros or `-0`; symmetric bigint range ±9223372036854775807                                             |
| PositiveMinorUnits                   | MinorUnits strictly greater than zero                                                                                                                                                        |
| Decimal                              | Existing `parseCanonicalDecimal`/`serializeDecimal`, ungrouped dot decimal; zero `0`, no trailing fractional zeros/exponent/negative zero; existing precision 50 and maximum action scale 18 |
| Currency/AccountType/TransactionType | Canonical generated domain vocabulary, validated through one logic schema/projection sourced from generated types; no mobile/Edge copied unions                                              |
| CardSuffix                           | Exactly four ASCII digits or null; preserve `0007` in review/wire, convert to current numeric `bank_details.card_last_4` only at persistence boundary                                        |

Use existing `CURRENCY_PRECISION`/`DEFAULT_PRECISION`, Decimal half-even final
posting, `toMinorUnits`/`fromMinorUnits`, and `MAX_TRANSACTION_AMOUNT`; never
add floating-point aggregates. Raw entry grammar and form-specific precision
validation remain intact. Persisted number conversion must round-trip exactly
through `serializeDecimal`, otherwise reject before preparation. Server derives
effects from mutations and compares every amount; it never trusts a supplied
aggregate independently.

## Parser schemas and exports

Canonical exports in `packages/logic/src/account-review/schemas.ts`:
`accountReviewRequestContextSchema`, `accountReviewEvidenceSpanSchema`,
`accountReviewAccountEvidenceSchema`, `accountReviewCurrencyEvidenceSchema`,
`accountReviewSuggestedAccountSchema`, `accountReviewVoiceResponseV2Schema`,
`accountReviewSmsResponseV2Schema`. Export types by `z.infer`, with
corresponding PascalCase names (for example `AccountReviewAccountEvidence`).
Generated Edge validators/provider projections come from the same definitions
and parity hash.

| Object           | Required keys and values                                                                                                                                                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RequestContext   | `reviewContractVersion: "account-review/v2"`, `preferredCurrency: Currency`, `accounts: AccountContext[]`                                                                                                                                                              |
| AccountContext   | `id: UUID`, `name: nonblank string`, `currency: Currency`, `type: AccountType`, `institutionId: string\|null`, `providerDisplayName: string\|null`, `cardLast4: CardSuffix`, `senderNames: nonblank string[]`                                                          |
| EvidenceSpan     | `sourceRef: Ref`, `field: "transcript"\|"body"\|"sender"`, `start: nonnegative integer`, `end: integer > start`, `text: nonempty string`                                                                                                                               |
| AccountEvidence  | `state: "absent"\|"explicit"\|"contextual"\|"uncertain"`, `name: string\|null`, `type: AccountType\|null`, `institutionId: string\|null`, `providerDisplayName: string\|null`, `cardLast4: CardSuffix`, `evidenceSpans: EvidenceSpan[]`, `candidateAccountIds: UUID[]` |
| CurrencyEvidence | `state: "omitted"\|"explicit"\|"ambiguous"\|"conflicting"\|"unsupported"\|"unknown"`, `statedCode: string\|null`, `candidateCodes: Currency[]`, `evidenceSpans: EvidenceSpan[]`                                                                                        |
| SuggestedAccount | `suggestionRef: Ref`, `name: nonblank string`, `type: AccountType\|null`, `currency: Currency\|null`, `institutionId: string\|null`, `providerDisplayName: string\|null`, `cardLast4: CardSuffix`, `senderNames: nonblank string[]`, `transactionRefs: Ref[]`          |
| V2 row additions | `transactionRef: Ref`, `suggestionRef: Ref\|null`, `accountEvidence: AccountEvidence`, `toAccountEvidence: AccountEvidence\|null`, `currencyEvidence: CurrencyEvidence`                                                                                                |
| Voice success    | Existing `transcript`, `original_transcript`, `detected_language`, `transactions`; add `reviewContractVersion: "account-review/v2"`, `suggestedAccounts: SuggestedAccount[]`                                                                                           |
| SMS success      | Existing `transactions` and completion/fingerprint/retry metadata; add `reviewContractVersion: "account-review/v2"`, `suggestedAccounts: SuggestedAccount[]`                                                                                                           |

Voice financial row keys remain `amount`, `type`, `counterparty`,
`categorySystemName`, `description`, `accountId`, `currency`, `date`,
`confidenceScore`. SMS financial row keys remain `messageId`, `amount`,
`currency`, `type`, `counterparty`, `date`, `categorySystemName`,
`isAtmWithdrawal`, `cardLast4`, `confidenceScore`, `isTrusted`. Keep legacy
optional/default handling on those original keys; new additions are required in
v2. Success schemas exclude error/refusal shapes; existing source-specific
error/quota/completion schemas remain separate. Provider-facing financial
amounts remain finite positive bounded numbers; normalized review amounts become
canonical decimal strings before Save. V2 `currency` is advisory and may be null
when unconfirmed (including SMS); never normalize it to preferred before
validating `currencyEvidence`. V1 parsing stays unchanged.

`absent` requires null identity fields, empty candidates/spans. `explicit` and
`contextual` need grounded nonempty identity spans; `contextual` is Voice only
and each member must reference the same explicitly scoped speech evidence.
`uncertain` cannot auto-match/default. `omitted` requires null stated code,
empty candidates/spans and a successfully validated v2 financial row. `explicit`
requires one supported stated code matching its sole candidate and grounded
spans. Ambiguous/conflicting/unsupported/unknown never become omission;
unsupported preserves the original stated code. A span must match the exact
UTF-16 substring of the submitted SMS body/sender or returned
`original_transcript`; `sourceRef` must be the corresponding submitted messageId
or the adapter's logical Voice request key. Full audio is never extra proof.

Each transaction belongs to at most one suggestion; row `suggestionRef` and
suggestion `transactionRefs` must agree bidirectionally. SMS members each supply
their own compatible evidence. `toAccountEvidence` is null for ordinary
income/expense and separately validated for ATM/endpoints. It introduces no new
parser transaction kind. Account/provider/card/currency conflicts split or
remain unresolved. Existing `accountId` is advisory only. A malformed financial
row uses existing source recovery; malformed advisory additions retain that
valid row with `unknown` currency/unresolved account and a hard review reason.
Never salvage unsafe provenance as absence, a negative fingerprint or a new
provider request. Invalid envelope/version arrays cannot authorize confirmation.

## Review state, commands and SMS v2

Canonical schema exports: `accountReviewCurrencySchema`,
`accountReviewAssignmentSchema`, `accountReviewRowSchema`,
`accountReviewGroupSchema`, `accountReviewSessionSchema`,
`accountReviewCommandSchema`, `accountReviewSaveIntentSchema`.

| Object                | Required keys and values                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Known currency        | `state: "known"`, `code: Currency`, `origin: "explicit"\|"preferred_omission"\|"user"`                                                                                                                                                                                                                                                                                                                                                                               |
| Unconfirmed currency  | `state: "unconfirmed"`, `reason: "ambiguous"\|"conflicting"\|"unsupported"\|"legacy_unknown"`, `candidateCodes: Currency[]`, `statedCode: string\|null`, `evidenceSpans: EvidenceSpan[]`                                                                                                                                                                                                                                                                             |
| Unresolved assignment | `state: "unresolved"`, `accountId: null`, `reasonCode: stable code`, `candidateAccountIds: UUID[]`                                                                                                                                                                                                                                                                                                                                                                   |
| Existing assignment   | `state: "existing"`, `accountId: UUID`, `origin: "exact"\|"default"\|"user"`, `currency: Currency`, `identityRevision: Revision`                                                                                                                                                                                                                                                                                                                                     |
| Suggested assignment  | `state: "suggested"`, `accountId: null`, `groupId: UUID`, `groupRevision: Revision`, `confirmation: "pending"\|"confirmed"`                                                                                                                                                                                                                                                                                                                                          |
| Row                   | `rowId: UUID`, `source: "VOICE"\|"SMS"`, `sourceRef: Ref`, `sourceFingerprint: string\|null`, `transaction: existing source parsed snapshot`, `amountDecimal: Decimal`, `accountEvidence`, `toAccountEvidence: AccountEvidence\|null`, `currency: review currency`, `assignment`, `toAssignment: assignment\|null`, `reviewReasons: stable code[]`, `selected: boolean`, `revision: Revision`, `hasUserAccountOverride: boolean`, `hasUserCurrencyOverride: boolean` |
| Group                 | `groupId: UUID`, `evidenceKey: Hash`, `suggestionRefs: Ref[]`, `name`, `type: AccountType\|null`, `currency: Currency`, `institutionId`, `providerDisplayName`, `cardLast4`, `senderNames`, `linkedRowIds: UUID[]`, `status: "pending"\|"confirmed"\|"removed"`, `revision: Revision`, `confirmedIdentityRevision: Revision\|null`                                                                                                                                   |
| Session               | `ownerId: UUID`, `source`, `sessionId: UUID`, `sourceRevision: Revision`, `preferredCurrency: Currency`, `rows: Row[]`, `groups: Group[]`, `removedEvidenceKeys: Hash[]`, `filter: "all"\|"needs_review"\|"selected"`, `revision: Revision`, `operationGeneration: Revision`, `saveIntent: SaveIntent\|null`                                                                                                                                                         |

`transaction` reuses the existing source schema/types; `categoryId` remains
required. Legacy optional account IDs are adapted into assignments with null
unselected IDs; assignments, not stale transaction account IDs, own v2 choice.
SMS requires its canonical fingerprint; Voice fingerprint is null, so separate
recordings never deduplicate merely by text. Identity/evidence keys use
canonical normalized fields and scoped source provenance, never nickname alone.
Removed tombstones survive detaching the final row. `identityRevision` is the
review snapshot revision, not a fabricated persisted account column.

For **local review rows only**, `toAccountEvidence` reuses the closed canonical
`AccountEvidence` schema. Earlier local inputs may omit it; parsing materializes
required output `null`. Ordinary Voice and non-ATM SMS require null, while ATM
SMS retains independently grounded explicit, absent or uncertain proof;
contextual ATM destination evidence is rejected. Proof is separate from
`toAssignment` (account choice), and never enters provider requests, cloud
financial-action tuples, database columns or logs.

Every command has required `ownerId`, `sessionId`, `expectedReviewRevision`,
`expectedOperationGeneration`, `kind`, and the keys below. Only `select_ready`
and `clear_selection`, and the narrow `set_filter` command, lack a row/group target. Row/group commands use
`expectedRowRevision`/`expectedGroupRevision` respectively. Selection's pending
group path additionally supplies `groupId`, `expectedGroupRevision` and
`hasSharedConfirmationDisclosure: true`; a null group pair means no implicit
group confirmation.

| `kind`                             | Additional keys                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `confirm_group` / `remove_group`   | `groupId`, `expectedGroupRevision`                                                                                                         |
| `select_row`                       | `rowId`, `expectedRowRevision`, `groupId: UUID\|null`, `expectedGroupRevision: Revision\|null`, `hasSharedConfirmationDisclosure: boolean` |
| `set_row_selected`                 | `rowId`, `expectedRowRevision`, `selected: false` (deselect only; selecting uses select_row)                                               |
| `edit_group`                       | `groupId`, `expectedGroupRevision`, `identity: {name,type,institutionId,providerDisplayName,cardLast4,senderNames}`, `reconfirm: true`     |
| `choose_row_account`               | `rowId`, `expectedRowRevision`, `accountId: UUID`                                                                                          |
| `replace_group_account`            | `groupId`, `expectedGroupRevision`, `accountId: UUID`, `disclosedLinkedRowCount: nonnegative integer`                                      |
| `confirm_row_currency`             | `rowId`, `expectedRowRevision`, `currency: Currency`                                                                                       |
| `select_ready` / `clear_selection` | `filter: "all"\|"needs_review"\|"selected"` (must equal current filter)                                                                    |
| `set_filter`                      | `filter: "all"\|"needs_review"\|"selected"` (new canonical filter; same filter is no-op)                                                  |
| `undo_removal`                     | `undoToken: UUID` (lookup transient token; never client-supplied inverse state)                                                            |

Immutable API names: `resolveAccountReviewSession` (input type:
`ResolveAccountReviewSessionInput`),
`getAccountReviewAccountCandidates`, `reduceAccountReviewCommand`,
`projectAccountReviewSession`, `createAccountReviewSaveIntent`. Reducer result:
`{state, affectedRowIds, affectedGroupIds, reasonCodes, effect: "none"|"persist_sms"|"session_only", undoToken: UUID|null}`.
Validation/stale failure returns unchanged state and reason codes, not a
partially changed state. Inject IDs/time and transient Undo store. A cancel is
no command. UI/hook projections derive eligibility/counts; they cannot repeat
the resolver or mutate business state.

`ACCOUNT_REVIEW_REASON_CODES` extends existing `TransactionReviewReason` through
one logic constant/schema with `currency_confirmation_needed`,
`account_match_ambiguous`, `account_identity_uncertain`, `account_unavailable`,
`account_group_removed`, `account_group_unconfirmed`,
`account_evidence_invalid`, `account_group_snapshot_conflict`,
`review_revision_stale`, `review_owner_changed`, `review_source_changed`,
`review_undo_invalid`, `review_shared_disclosure_required`,
`review_group_count_stale`. `reasonCode`/`reasonCodes`/new reviewReasons use
this closed set plus the existing parser reasons; no translated string or
arbitrary provider string enters state. Account acceptance clears only
applicable account reasons, not currency or other hard validation. Domain save
errors retain existing stable error codes.

SMS codec adds exports `smsReviewDraftPayloadV2Schema`,
`encodeSmsReviewDraftV2`, `decodeSmsReviewDraftPayload`,
`migrateSmsReviewDraftV1ToV2`. Existing v1 encoder/decoder signatures remain. V2
JSON exact root
`{version: 2, transaction: existing stored SMS transaction, review: {ownerId, sessionId, sourceRevision, preferredCurrency, reviewRevision, operationGeneration, row, groups, removedEvidenceKeys}}`.
For new writes only, the **review** object has an additional tenth
local-device-only `filter: "all" | "needs_review" | "selected"` field.
A historical exact nine-key V2 review header remains valid and **decodes** to
`filter: "all"` without modifying or rewriting its raw stored JSON; the old
nine fields remain byte-compatible and no version bump/table is introduced.
New V2 encodes require all ten closed keys and materialize `filter`
explicitly, including after a mixed old/new-V2 transition. Before command
reduction, all current physical V2 rows' effective filters must agree
(old-nine means `all`); mixed conflicting filters block recovery/commit.
A genuine `set_filter` updates all owned V2 headers under one authenticated
SMS writer and exactly one global review revision, **without changing any
row/group revision or selection override**. In-memory Voice keeps the same
canonical `session.filter` but never stores Voice review/transcript.
The `groups` array contains only groups referenced by this row or its removal
tombstones, with complete linkedRowIds; all linked rows persist identical group
revision/identity/status. Outer `payload_version` equals inner version. Existing
outer queue/owner/fingerprint/position/selection_override are not copied into
new DB columns; selection_override is authoritative when restoring. Check row
fingerprint, source, owner/session and stored transaction against the outer
record. No persistent Undo token or Voice payload/table.

Preserve v1 transaction bytes/choices on decode failure; report recovery, never
delete unreadable drafts. Migrate only touched rows/groups in one writer.
Missing v1 currency provenance is legacy_unknown; chosen owned account and
category confirmation/selection survive. Pending-account presence alone is not
confirmation. Conflicting restored group snapshots become unresolved recovery
and cannot auto-confirm through last-write-wins. Late equivalent input may
inherit only identical identity confirmation; it selects no new row and never
clears an override/tombstone.

**T054 canonical filter CAS amendment (unshipped):** `set_filter` is a
strictly closed `accountReviewCommandSchema` discriminant with exactly the
four existing common scope/revision keys, `kind` and target `filter`; no
row/group IDs, arbitrary business fields or unvalidated facade filter
callback. A changed filter increments **only** `session.revision` (once),
preserving `operationGeneration`, `sourceRevision`, every row/group
revision, finance, choices, selected state and existing transient Undo.
Equal filter is an accepted identity no-op with `effect: "none"`, empty
`reasonCodes` and affected lists. Stale owner/session/revisions,
busy-conflicting/current writer and frozen Save fail closed. Old All bulk
commands remain stale after All→Needs→All regardless equal final filter.
`select_ready` and `clear_selection` continue checking both common
expected revisions and exact currently stored filter.

**Undo over navigation-only changes:** a removal Undo keeps its original
transient token/previous business snapshot and exact removal
`operationGeneration`, while the current `revision` may be higher solely
through guarded `set_filter` transitions. It must still prove unchanged
all original business rows/groups/tombstones, owner and source and reject
intervening business-generation increments or ABA; on successful Undo retain
the **current** filter rather than restoring the pre-removal filter.
Neither Undo nor filter adds a public financial/Edge/provider field.

**Facade-only shaped view:** `AccountReviewFacadeView.readModel:
AccountReviewReadModel | null` is calculated exclusively using the existing
logic `projectAccountReviewSession` over the accepted canonical session
and current authenticated `loadAccountReviewAccountSnapshots` output.
No raw provider context/account balance is exposed to presentation and no
second count/readiness/filter engine is permitted. SMS/Voice owner and
cancellation generation must remain current after async snapshot reads,
commands and reloads; otherwise `readModel` is null, with no stale-actor
published projection. The existing `AccountReviewReadModel` fields
(`summary`, `groupSummaries`, `visibleRowIds`,
`readyVisibleRowIds`) remain unchanged.

Mobile APIs: `loadAccountReviewAccountSnapshots`,
`executeSmsAccountReviewCommand`, `createVoiceAccountReviewSession`,
`normalizeAccountReviewParserResult`, `saveSelectedAccountReview`,
`createAccountWithDefaultIntent`. Services own scoped writers/read models; hooks
own cancellation/subscriptions; components own UI feedback.

## Frozen save intent and new action payloads

`SaveIntent` exact keys: `actionId: UUID`, `ownerId: UUID`, `source`,
`sessionId: UUID`, `expectedReviewRevision: Revision`,
`expectedOperationGeneration: Revision`, `selectedRows: {rowId, revision}[]`,
`confirmedGroups: {groupId, revision, evidenceKey}[]`,
`plannedEntityIds: {entity, localRef: UUID, id: UUID}[]`,
`occurredAt: Timestamp`. No reused IDs across creates. Intent and IDs freeze
before asynchronous save; replay resolves this action before admitting changed
input/new IDs.

Retain exact existing envelope keys/version and RPC
`apply_account_financial_action_v1`; add explicit dispatch for new tuples.
`domainReferenceId` is a stable planned root: first transaction/transfer UUID in
ASCII ID order for review; the created account UUID for Add. Existing account
guards retain `{accountId, expectedRevision}` and are sorted by accountId.

| New payload                 | Exact root keys                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `review.batch-save/v1`      | `schemaVersion: "review.batch-save/v1"`, `operationCode: "review.batch-save"`, `source: "VOICE"\|"SMS"`, `sessionId: UUID`, `frozenIntentDigest: Hash` (**required**, 64 lowercase hex), `selectedSourceRefs: SelectedSourceRef[]`, `confirmedGroupRefs: ConfirmedGroupRef[]`, `createGuards: CreateGuard[]`, `accountEffects: AccountEffect[]`, `domainRecordRefs: UUID[]`, `domainMutation: {records: Mutation[]}`, `localSmsBookkeeping: SmsBookkeeping[]`, `creationDefaultSnapshot?: DefaultSnapshot` (required exactly when any account is created) |
| `account.create-default/v1` | `schemaVersion: "account.create-default/v1"`, `operationCode: "account.create-default"`, `defaultIntent: boolean`, `expectedDefaultSnapshot: DefaultSnapshot`, `createGuards`, `accountEffects`, `domainRecordRefs`, `domainMutation: {records: Mutation[]}`                                                                                                                                     |
| SelectedSourceRef           | `rowId: UUID`, `recordId: UUID`, `sourceFingerprint: string\|null` (SMS required; Voice null)                                                                                                                                                                                                                                                                                                    |
| ConfirmedGroupRef           | `groupId: UUID`, `revision: Revision`, `accountId: UUID` (created or explicitly reused)                                                                                                                                                                                                                                                                                                          |
| CreateGuard                 | `entity: "account"\|"account_sms_sender"\|"bank_details"\|"transaction"\|"transfer"`, `id: UUID`, `expectedAbsent: true`                                                                                                                                                                                                                                                                         |
| AccountEffect               | Existing `{accountId: UUID, amountMinorUnits: MinorUnits, currency: Currency, effectId: UUID}`                                                                                                                                                                                                                                                                                                   |
| SmsBookkeeping              | `draftId: UUID`, `queueId: UUID`, `snapshotHash: Hash`, `expectedReviewRevision: Revision`, `operation: "delete_saved"\|"rebind_remaining"`                                                                                                                                                                                                                                                      |
| DefaultSnapshot             | `activeAccountIds: UUID[]`, `defaultAccount: {accountId: UUID, isDefault: true}\|null`                                                                                                                                                                                                                                                                                                           |

Cloud contains opaque session/row/group/draft/queue IDs and hashes, required
persisted financial/account fields and existing canonical SMS fingerprint on
financial records/source refs. No model aliases, source text refs/spans, names
extracted only as evidence, confidence, raw SMS/transcript/audio, full review
JSON, selections, Undo, payload preimages or local restoration JSON. Account
nickname/provider/sender/card metadata is allowed only as approved persisted
mutation fields. Never serialize raw `SaveIntent` or reducer state as payload.

The complete set of mutation IDs equals domainRecordRefs; create mutation IDs
equal createGuards exactly. Sort mutations/guards by `entity:id`, refs by UUID,
effects by accountId, selected refs by rowId, group refs by groupId, bookkeeping
by draftId. Bookkeeping IDs are local-only and excluded from domainRecordRefs.
One source ref maps to one created financial row; each financial row has one
source ref. Voice bookkeeping is empty. SMS deletion bookkeeping matches saved
selected rows; remaining linked rows have only rebind bookkeeping. Already-saved
dedup-only cleanup commits locally without a new cloud financial action.

### Unshipped review-only frozen intent digest amendment (2026-10-16)

**Status: owner-approved CONTRACT/TESTS FIRST; not implemented, registered for
server use, deployed or released.** This reconciles the earlier no-extra-cloud-
fields rule for **exactly one** new *required* root field on the unshipped
`review.batch-save/v1` payload: `frozenIntentDigest: Hash`, lowercase
`^[0-9a-f]{64}$` SHA-256. It is an opaque commitment to the COMPLETE ORIGINAL
frozen selected-review request, not to the subset actually posted after SMS
deduplication. `payloadHash` continues to hash the canonical entire financial
envelope, now including this required field; it is **not** the frozen-intent
digest. No new envelope keys, other payload keys, local table/column, legacy
tuple, Add default field, SMS recovery DTO or Voice review persistence is
authorized.

**Exact future pure logic API** (module
`packages/logic/src/financial-actions/review-intent-digest.ts`; no mobile
imports; future source grant only):

```ts
export interface ComputeAccountReviewFrozenIntentDigestInput {
  readonly session: AccountReviewSession;
  readonly intent: AccountReviewSaveIntent;
  readonly creationDefaultSnapshot:
    ReviewBatchSavePayload["creationDefaultSnapshot"];
  readonly hashProvider: Sha256Provider;
}
export function computeAccountReviewFrozenIntentDigest(
  input: ComputeAccountReviewFrozenIntentDigestInput
): Promise<string>;
```

Use the authoritative `AccountReviewSession` and `AccountReviewSaveIntent`
from logic review schemas; `ReviewBatchSavePayload` from the closed financial
wire shapes and `Sha256Provider` from financial action contracts. Parse
and verify the canonical session, intent, their exact frozen relationship,
selection, confirmation and plan before projection. A root's digest is computed
at first local Save **before committing** from the original frozen request and
the captured `creationDefaultSnapshot` (or its absence). For replay, take
the SAME historical snapshot directly from the already-validated stored
payload, **not** newly sampled active accounts or defaults. A missing snapshot
when an account is actually created remains invalid; do not insert a synthetic
empty snapshot or rewrite the existing presence rule.

**Versioned preimage:** SHA-256 of
`serializeCanonicalJsonValue(["monyvi.account-review.frozen-intent", "v1",
projection])`. Build `projection` explicitly as a closed tree of
`CanonicalJsonValue` (strings, booleans, null, arrays, plain dictionaries;
**no JS numbers**), using the existing financial canonical serializer. Never
serialize the whole session, the mutable service object, model getters,
`SaveIntent` JSON verbatim or the posted payload as this projection. Reject
noncanonical input, collisions, duplicate IDs, invalid revisions, invalid
amount round-trips and overflow before invoking `hashProvider.digestUtf8`;
validate the provider result with the canonical lowercase Hash grammar.

The `projection` has **exactly** these logical components (fixed keys and
unambiguous null-vs-absent conventions in the future helper):

1. **Scope:** `ownerId`, `sessionId`, `source`, `sourceRevision`,
   `actionId`, `occurredAt`, `expectedReviewRevision`,
   `expectedOperationGeneration` from the original validated session/intent.
   Distinct owner/session/source/action/occurrence/revision values are distinct
   commitments. No current account financial revision, balance, default or
   publication timestamp.
2. **Original selected rows, sorted ASCII by `rowId`:** every row selected
   in the frozen intent, including SMS rows **omitted from financial posting**
   because their fingerprint was already saved. Include `rowId`, row
   `revision`, `source`, immutable `sourceRef`, nullable
   `sourceFingerprint`, known review currency code, its user/explicit/
   preferred-omission origin, `amountMinorUnits`, transaction `type`,
   canonical **local-calendar** date equal to Save's
   `formatFinancialActionLocalDate` policy, `categoryId`, nullable
   `counterparty`, nullable Voice `note` (hash-only), explicit ATM flag,
   source `assignment` and nullable ATM `toAssignment`, user account/
   currency override flags, and stable review blocker reason codes. For each
   assignment, include its discriminant and complete relevant existing
   account ID/origin/currency/identityRevision or suggested
   groupId/groupRevision/confirmation. No account inference from the legacy
   transaction.accountId. Reject selected unresolved or unconfirmed currency
   under the existing Save contract. Check
   `Number(fromMinorUnits(toMinorUnits(amountDecimal, precision), precision))
   === transaction.amount`, where precision is the canonical
   `CURRENCY_PRECISION`/`DEFAULT_PRECISION`. The digest hashes the
   **positive canonical minor-unit string**, not the raw spelling of
   `amountDecimal` or floating-point transaction amount. Use the approved
   current Decimal half-even and overflow behavior, including KWD/BHD/OMR
   three-decimal and BTC eight-decimal units; never convert currencies.
3. **Referenced originally confirmed groups, sorted ASCII by `groupId`:**
   the exact groups referenced by originally selected source/destination
   assignments and `intent.confirmedGroups` (same set), including the
   original `groupId`, **original `evidenceKey`**, revision, type, currency,
   persisted `name`, `institutionId`, `providerDisplayName`, cardLast4
   and sender alias/label definitions. Normalize SMS sender aliases with the
   existing trim/collapse-whitespace/lowercase semantics (no NFC);
   deduplicate with the **existing first surviving normalized alias's
   collapsed display-label policy**, then ASCII-sort the resulting
   normalized-alias/label pairs for hashing. Reordering semantically
   identical entries does not affect the hash; if reordering changes the
   first surviving display label, that is a **material persisted child-name
   change**, not an equivalent request. This retains the current writer's
   sender label behavior rather than introducing a new winner policy.
   Include which
   **selected** row IDs reference the group and in which endpoint role.
   Do not include unselected raw rows, group suggestionRefs or transient
   UI/link presentation order. An edited nickname or changed original
   evidenceKey is a different frozen request even if group ID is reused.
4. **Complete frozen planned entity set, sorted ASCII by
   `entity:localRef:id`:** every `{entity, localRef, id}` exactly once,
   including accounts, BANK details, normalized sender children, selected
   transaction/transfer IDs and legitimately unused planned members after SMS
   deduplication. Validate the ORIGINAL complete selected/group physical
   plan, including deterministic child UUID-v8 localRefs and one real planned
   account per confirmed group; never fabricate entity IDs from a list index,
   let an extra unused child pass, or require every planned ID to appear among
   **actual** post-deduplication creates.
5. **Captured original `creationDefaultSnapshot` or explicit null
   sentinel:** when present, the canonical sorted active owned account ID set
   and zero/one default ID/true flag as captured for this action. Do not
   resample or hash *current* balances/defaults during replay. Retain the
   existing rule: this snapshot is present iff the action creates any account.

Canonical equality is independent of object property insertion order, selected
row order, group order and planned-member order, and of sender reordering
**only if** the existing normalized first-survivor display labels are
unchanged. Money is compared using canonical minor units, not string spelling; values already
rejected by the existing strict canonical review decimal grammar are **not**
silently admitted as alternate spellings. Do not lose user-visible child-label
changes merely by normalizing alias IDs. No raw SMS body, Voice transcript,
audio, evidence spans, parser JSON, unselected raw source rows, Undo lease,
restoration preimage, current owned account values, or full review state is
persisted in the payload: only the final 64-hex digest is transmitted.

**Replay semantics:** reparse the original frozen request and historical
snapshot, recompute this digest, and compare with the immutable stored
`frozenIntentDigest` before the foundation's existing-action replay. Still
validate actual posted source refs, account/child membership, owner, and
original action identity. First-write deduplication must prove an independently
owned active transaction/transfer with the fingerprint **outside** this action.
After a committed root is found and its immutable full-intent hash matches,
do **not** require this independent saved SMS record to remain active or to
have the same **mutable amount**; it may legitimately have been edited/deleted.
A changed omitted-SMS amount/source/selection or changed original group
provenance/planned-child ID rejects, including after cold restart and
session clearing. Identical historical replay is valid without rerunning
the original review parser, recomputing current balances/defaults or posting
another effect. Action-free all-dedup SMS cleanup has no action root and no
fabricated digest payload.

This amendment is **not implementation acceptance**. Before activation Root
must rerun Speckit analysis and reconcile T046 strict review-only Zod/
opt-in registry, its pure helper/tests and all earlier valid payload fixtures;
T048 creation, frozen-source replay and historical comparison;
generated Edge schema/transport parity and reserved **090** local SQL
validator/server canonical envelope hash; protected sync and all typed
fixtures/recovery tests. Add's reserved 091/default-intent and deployed
legacy tuples remain unchanged. No hosted migration/deployment is authorized.

### Complete closed mutation set

Create record exact keys
`{entity, mode: "create", expectedUpdatedAt: null, after}`; `expectedAbsent` is
independently required in createGuards. Review allows
account/children/transaction/transfer creates only. Add allows exactly one
account create, its child creates, plus at most one prior-default update. No
recurring, arbitrary delete/update or SMS draft cloud mutation.

| `entity`                            | Exact `after` keys                                                                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `account` create                    | Existing `id,name,type,currency,institutionId,providerDisplayName,isDefault,createdAt,deleted,openingBalanceMinorUnits,targetBalanceMinorUnits`                                       |
| `account_sms_sender` create         | `id,accountId,senderName,normalizedSenderName,createdAt,deleted`                                                                                                                      |
| `bank_details` create               | `id,accountId,accountNumber,cardLast4,createdAt,deleted`                                                                                                                              |
| `transaction` create                | Existing `id,accountId,amountMinorUnits,currency,type,categoryId,counterparty,note,date,source,smsFingerprint,isDraft,linkedAssetId,linkedDebtId,linkedRecurringId,createdAt,deleted` |
| `transfer` create                   | Existing `id,fromAccountId,toAccountId,amountMinorUnits,convertedAmountMinorUnits,exchangeRate,currency,date,notes,smsFingerprint,createdAt,deleted`                                  |
| `account_default` update (Add only) | Record `{entity: "account_default",mode: "update",expectedIsDefault:true,after:{id: UUID,isDefault:false}}`                                                                           |

Create `deleted` is false; transaction `isDraft` false, linked IDs null, source
matches payload. Category is required/accessibly owned or shared and active.
Source fingerprint must agree with the SMS financial row. Child parent is
immutable, owned through a new account in the same action; no child userId.
Sender normalization uses the existing canonical sender function and uniqueness
policy. BANK gets at most one details row; other types get none. Review
bank_details `accountNumber` is null; Add preserves the existing optional form
value, never AI inference. Wire cardLast4 is CardSuffix; current numeric storage
and zero-padding projection remain unchanged. `account_default` refs are
included in domainRecordRefs but never createGuards or financial effects by
themselves.

Review account openingBalanceMinorUnits is `"0"`, targetBalanceMinorUnits null,
for every newly created Cash, Bank or Wallet account. Each starts at zero and
receives only its exact selected posted aggregate once, not an AI-inferred
opening balance. **First active account is default for every account type.**
For the new, as-yet-unshipped `review.batch-save/v1` tuple, use exactly one closed
optional field, `creationDefaultSnapshot: DefaultSnapshot`, **required when
any new account is planned and absent otherwise**; replace the unshipped
`cashDefaultSnapshot` name, without changing the common `DefaultSnapshot` type,
Add's `expectedDefaultSnapshot`, any deployed tuple or the payload version.
Capture all active owned IDs and the zero/one current active default. When this
captured active set is nonempty, every review-created account has
`isDefault: false`, leaving its existing default or intentional no-default state unchanged.
When empty, sort the actual frozen planned **account-create IDs** in canonical
ASCII order; exactly the first new account (CASH, BANK or DIGITAL_WALLET) has
`isDefault: true`, and every other created account is false. Multiple compatible,
independently confirmed Voice Cash groups, including different currencies, may
be saved together; no singleton Cash-per-Save restriction. One snapshot protects
the **whole group** with identical owner-wide serialization, current-state CAS,
absence guards, idempotent replay and all-or-nothing reconciliation. Neither
group confirmation nor a separate post-create toggle writes any default; the
review mutation contains no `account_default` clear of a prior account.

Voice's canonical account types include CASH: an explicitly grounded compatible
Cash identity, or the user's explicit type confirmation, must survive review and
Save. Reuse source/type-safe Cash preparation with that same
`creationDefaultSnapshot` and exact selected-delta semantics; never cast it to
legacy PendingSmsAccountDraft's BANK/WALLET-only type or silently drop it.
Ordinary SMS source drafts remain BANK/WALLET. **Current SMS ATM destination**
resolves to a real eligible existing Cash account (compatible default, sole or
explicit user choice), or a genuine already-canonical confirmed referenced
`toAssignment` group; it NEVER invents a new Cash destination group/account.
Absent either, leave it unresolved and block Save, even if a dormant wire shape
could represent a future validated destination. Source and destination use
independent evidence, owner/currency/revision checks; no row-index/name alias,
new ATM field, or fallback account preparation. Bank/sender children follow
actual source/type fields; never fabricate bank details for Cash, an ungrounded
Voice BANK default, sender/card evidence, opening balance or confirmation-time
default changes. Add opening is canonical posted requested balance, target null;
Add's separate intent may clear a prior default only within its own guarded
successful account creation.

## Zero-net, no-effect, default and absence guards

Default-only CAS intentionally protects the current relevant logical state: the
exact active owned UUID set and zero/one current default UUID/true flag. It uses
no expectedUpdatedAt, timestamp truncation or new persisted global
counter/table. 082's microsecond publication time and local millisecond Date are
delivery metadata, not this guard. Historical A→B→A that returns the same
active/default state is equivalent and passes; a different current state fails.
This preserves safe current first-account/default replacement without inventing
a requirement to reject invisible identical history. Existing financial
revisions and absent-create guards remain separate and exact.

Review requires at least one financial create after deduplication. Guard set is
every existing **and new** financially referenced source/destination account,
including zero net. New account guard revision is `"0"` plus an account
expectedAbsent guard; revision zero alone never establishes absence. There is
one effect per guarded account, including `"0"`; local/server financial revision
advances once from expectedRevision to expectedRevision+1 even at zero net. No
default-only metadata account is forced into financial effects. Reject revision
exhaustion. Preserve nonzero-only old operation validation.

090 must narrowly replace the nonzero effect constraint/guard checks for the new
review tuple and its zero compensation only, retain immutable evidence, and
include zero effects in canonical chains/reconciliation. PostgreSQL CHECK cannot
inspect the action root: use a row-local CHECK permitting zero only when
`domain = 'transactions' AND kind = 'review.batch-save'`, together with a
deferred constraint trigger that loads the owned immutable root and verifies
`domain = 'transactions'`, `kind = 'review_batch_save'`,
`payloadVersion = 'review.batch-save/v1'`, schemaVersion/operationCode parity,
and exact account/effect ID/currency/zero-aggregate/revision correspondence.
Reject a spoofed kind under any old root/operation. Zero compensation
deactivates the original zero effect once and installs verified canonical
revision/snapshot; it does not need a fabricated inverse effect row or money
change. New review reconciliation requires canonical outcomes rather than
generic blind inverse fallback. Repeated rejection/restart observes the
already-ineffective effect and restored mappings and returns replay. Nonzero
old-tuple behavior remains unchanged. Metadata-only zero-opening Add has empty
financial guards/effects and revision `"0"`; nonzero Add has exactly its
new-account guard `"0"`, opening effect and final revision `"1"`.
Default/absence/child guards are required in both paths. No fake one-minor-unit
effect, transaction or compensation.

DefaultSnapshot captures all active owned account IDs and zero or one current
active default UUID with isDefault=true; IDs are sorted and distinct. Review's
`creationDefaultSnapshot` uses this **same** closed shape for every account
creation type; Add alone uses `expectedDefaultSnapshot`. Review determines its
single first-created default from frozen actual account-create ID order, not
array order, group name, source currency or independently sampled active counts. More than one default
is invalid, never pick one. Check the entire active-ID set and exact
defaultAccount/null value inside local writer and server transaction under the
shared lock. A non-null defaultAccount must be a member of activeAccountIds;
null means no active owned row has isDefault=true. Different active IDs or a
different/no current default reject the whole action. Deleted/foreign rows
cannot establish membership; recreated IDs cannot bypass absence/ownership and
lifecycle guards. Unrelated nickname/provider/publication metadata changes do
not invalidate default-only CAS.
`defaultIntent || activeAccountIds.length === 0` determines Add's flag. OFF with
active accounts changes no previous flags. ON clears only the captured previous
default. Null defaultAccount requires no clear mutation; first active ON is
mandatory. A clear mutation's after.id equals defaultAccount.accountId, and
current isDefault must equal expectedIsDefault=true. Update only
is_default=false; preserve all other metadata/balances/revisions. Do not send a
full account replacement for prior default.

Server must serialize snapshot checking and all account insert/delete/active/
default changes by the same authenticated-owner transaction lock, including
legacy creates and generic metadata sync, then recheck after locks. A new
trigger/function guard may provide this without adding a persisted column;
locking only the old default row cannot protect the empty/no-default predicate.
Retain existing sync writer fences and unique active-default indexes. Financial
effects, default metadata and child uniqueness all apply in one transaction. Any
absent-create collision (including foreign/soft-deleted IDs), snapshot change,
invalid child/reference or fingerprint conflict rejects the whole action. No ON
CONFLICT overwrite/reparenting or server timestamp choice of winner.

Acquire the existing publication fence first, then the owner snapshot lock, then
account rows in ASCII ID order. All relevant legacy/generic writer paths must
share this order, and the owner lock must precede snapshot reads; an
after-row-lock-only trigger is insufficient and can invert lock order. The SQL
worker must prove the statement-level trigger/function route for generic
metadata writers and deadlock/recheck acceptance before registration is enabled.
Do not release a guard based only on the unique index exception.

**Narrow implementation-proof gate:** current 082–085 source establishes the
publication fence but does not prove a shared owner snapshot lock before all
generic/legacy account row locks. The SQL/test worker must supply that proof
through scoped function/statement serialization, including legacy create,
generic sync and active/default deletion. Until proven by transaction/race tests
and independent DB/logic review, SQL acceptance/registration enabling is
blocked. This is a technical proof gate, not a new product/schema decision.

Offline sequential actions capture the current committed local logical state,
including earlier optimistic actions. Record local-only predecessor action IDs
in `defaultDependencyActionIds` on the local save snapshot whenever its active
or default IDs/flags depend on an unresolved create/default action. Push those
predecessors to a canonical outcome before sending the successor; immutable
envelopes are never rewritten to replace timestamps or bypass guards. Accepted
predecessor replay is harmless and then the same logical successor snapshot
matches server state. Pending/unsupported predecessor keeps the successor
pending; rejected predecessor invokes existing recovery and prevents automatic
successor replay under changed state. Restart rebuilds/validates the durable
dependencies, including default-only clear mutations. No network is required for
local review/commit. Generic metadata cannot escape these pending groups.

## Local restoration and canonical outcomes

Use existing financial_action_groups local-only recovery storage, not cloud
payload. New local schema `accountReviewLocalSaveSnapshotSchema` exact keys:
`version: "account-review-local-save/v1"`, `actionId`, `ownerId`, `sessionId`,
`smsDrafts`, `createdEntityRefs`, `defaultPreimages`,
`defaultDependencyActionIds: UUID[]` (sorted, empty when independent). Each
smsDraft
`{id,queueId,smsFingerprint,createdAt,updatedAt,parsedAt, payloadVersion,position,selectionOverride,payloadJson,expectedPostimageHash, operation}`
reuses current restoration field types; payloadVersion/position are canonical
unsigned strings in canonical local JSON, decoded safely to existing numeric
columns. `operation` matches SmsBookkeeping. snapshotHash binds the preimage
using existing `serializeCanonicalJsonValue` and SHA-256 (new version only;
legacy076 fixed JSON.stringify hash remains unchanged).
`createdEntityRefs: {entity,id,expectedPostimageHash}[]` and
`defaultPreimages: {accountId,isDefault,expectedPostimageHash}[]` bind only this
action's optimistic changes. Raw SMS/payloadJson stays device-local and is never
copied into outcomeJson, action hash, logs or outbox.

Reject/stale removes this action's creates from normal reads and restores its
SMS/delete/rebind/default mappings once, only if owner/session and current
postimage hashes still match. Changed newer rows are retained and surfaced as
reconciliation_incomplete/recovery; do not overwrite, regenerate selection or
automatically replay under a fresh financial revision. Canonical account
snapshots install through existing verified evidence; no-effect Add rejection
must still restore metadata/children with empty effects. Include all created
children/default refs in protected-push and reconciliation; financial-only
compensation is insufficient. Existing outcome states and replay/hash policy
remain; transport failure/unsupported tuple is retryable sync failure, not
business rejection or a generic metadata fallback.

New-tuple outcome retains existing `actionId`, `status`, `code` and
`accountRevisions`/`canonicalAccounts` names, with a tuple-specific closed
extension `canonicalAbsentAccountIds: UUID[]` for optimistic creates whose IDs
are verified absent on rejection. Existing `canonicalAccounts` keep their exact
hashed field vocabulary and represent existing accounts, including zero-net
accounts. A foreign ID collision must not disclose a foreign snapshot; return
rejection and scoped recovery only. Do not fabricate a canonical account at
revision zero just to satisfy existing nonempty-array validators. New tuple
decoders distinguish absent created accounts from incomplete existing-account
evidence; old tuple decoder/outcome shapes remain unchanged. Replay returns the
original immutable canonical outcome, not newly sampled account state.

## Reservations and canonical implementation exports

Authoritative main at `de09f76bdadb570c99a1015bbf1c680279b0d5ad`
ends at `089_historical_metal_rate_request_limits.sql` on 2026-10-15;
the gap at 088 does **not** authorize its reuse. Reserve:

1. `supabase/migrations/090_review_batch_save.sql` — review registration,
   explicit zero-net handling, all account types and their single
   `creationDefaultSnapshot`, complete mutations/children/owner-wide CAS,
   local-only bookkeeping validation; preserve 082–085 fences/pull contracts.
2. `supabase/migrations/091_account_create_default_intent.sql` — separate Add
   registration, zero/nonzero metadata/create guards, owner-wide
   default-snapshot serialization and reconciliation metadata contract; preserve
   existing create/Edit semantics and `expectedDefaultSnapshot`.

Creation snapshot/owner-lock protection belongs in 090 so review does not
depend on later Add story integration. If main consumes either reserved prefix
before integration, stop and notify lead for coordinated renumbering; never
edit an existing migration. Only local SQL/sync work is approved; no hosted
application/reset/backfill is authorized.

Financial logic exports `reviewBatchSavePayloadSchema`,
`accountCreateDefaultPayloadSchema`, `accountDefaultSnapshotSchema`,
`createReviewFinancialActionDefinitions`, `validateReviewBatchSavePayload`,
`validateAccountCreateDefaultPayload`. Inferred types: `ReviewBatchSavePayload`,
`AccountCreateDefaultPayload`, `AccountDefaultSnapshot`. Keep these under
financial-actions; use the existing registry/foundation APIs for
canonicalization/hash/local commit/replay. Boundary acceptance includes the four
source contracts and exact parity between Zod, generated Edge validation, SQL
and local preparation, including malformed and old-operation fixtures.

## Frozen acceptance vectors (author Red before production)

| Vector                                                                               | Required assertion                                                                                                                                           |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| EGP existing balance `100`, income `20.01`, expense `20.01`                          | Two records, one `"0"` aggregate effect, balance `100`, guarded revision r→r+1 once; replay changes nothing                                                  |
| New SMS Bank group: income `20.01`, expense `5.01`                                   | Opening `"0"`, aggregate `"1500"`, final `15`; no legacy initial aggregate plus second posting                                                               |
| Same selected rows reused existing Bank with `100`                                   | Final `115`; same exact aggregate, no opening effect                                                                                                         |
| SMS ATM source `100`, destination `10`, withdrawal `25.05`                           | One transfer, source `74.95`, destination `35.05`, fingerprint retained; both accounts guarded                                                               |
| All SMS selected fingerprints already saved                                          | Resolve corresponding local drafts only; zero new account, child, effect, root or provider call                                                              |
| Add opening `0`, previous default A, intent ON                                       | Empty effect/financial-guard arrays; one new account/children and A-default-clear atomic; new revision `"0"`                                                 |
| Add opening `10.01`                                                                  | Exactly `"1001"` opening effect from zero and revision `"1"`; no balance-adjustment transaction                                                              |
| Default A→B→A, identical active IDs and current A=true                               | Positive equality case: same logical snapshot accepts, regardless historical/publication timestamps; clear only A.isDefault                                  |
| Captured A default, current B/no default or changed active IDs                       | Whole action stale/rejected; zero account/child/default/balance changes                                                                                      |
| No default→new current default; empty active set→concurrent active creation          | Whole action rejects; unique index alone is not the snapshot check                                                                                           |
| Default nickname/provider timestamp changes, same relevant IDs/flags                 | Default-only guard remains valid; preserve new unrelated metadata                                                                                            |
| Offline Add A first, then Add B ON; predecessor accept/replay/restart                | Both local commits work offline; push A before B, same immutable B snapshot then matches; no duplicate create/clear/effect                                   |
| Offline predecessor pending/rejected/unsupported                                     | Successor stays durable pending or enters recovery; never rewrite snapshot/auto replay against changed state                                                 |
| Voice explicit grounded Cash, one selected linked row                                | Retain CASH type; create only at Save with exact selected delta and the common `creationDefaultSnapshot`; no Cash child, AI balance or default-on-confirm |
| Empty owned active set, new confirmed Bank/Wallet/Cash groups                        | Exactly one new default: minimum actual frozen account-create UUID in ASCII order; other new accounts false; no default-clear mutation              |
| Nonempty owned active set, any new confirmed account groups                          | Every review-created account `isDefault: false`; preserve existing active default or intentionally no default; reject stale snapshot               |
| Two compatible confirmed Voice Cash groups, EGP and USD, both selected               | Both Cash accounts/records/effects accepted in one action; each currency exact, default follows active snapshot and actual create ID order |
| KWD/BHD/OMR three decimals; BTC eight; other generated currencies existing precision | Correct minor-unit strings and once-only Decimal half-even posting; form excess precision still rejects                                                      |
| Aggregate/existing-balance/next-revision overflow, unsafe number round-trip          | Reject whole batch before prepared cache/DB mutation                                                                                                         |
| Same action ID/hash, changed hash, mid-member failure, missing linked child          | Replay, mismatch rejection, whole-group rollback, incomplete pending recovery respectively                                                                   |
| Root spoof, old tuple zero, foreign/deleted create ID, reparented child              | Reject before domain changes; no global zero permission or ON CONFLICT overwrite                                                                             |
| Zero/no-effect reject after restart, then repeated callback                          | Canonical revision/effective evidence and local bookkeeping/default restoration once; no newer postimage overwritten                                         |
| Missing/old server registration or malformed response                                | Keep action pending/sync_failed, no generic push or new action ID; do not treat transport failure as stale business rejection                                |

Tests also prove the first-active rule for Cash/Bank/Wallet, multi-Cash and
mixed-type batches, unchanged defaults for nonempty active snapshots, and
rejection of duplicate default flags, missing/unexpected creation snapshots
or stale owner-wide active/default state. ATM source/destination must satisfy
the current T043 proof and never invent a destination account. Every selected
row/referenced group/candidate is owned and current, ordinary SMS excludes
Cash, category remains required, no reused source
refs across logical requests, no raw evidence in cloud/logs, and unchanged v1
tuple/parser/codec compatibility. Existing source-specific notes/date/ATM labels
and refund/income semantics remain; no new conversion or AI balance. M01–M20
owner device/provider/rendered checks remain separate from deterministic
fixtures, parity and local pgTAP evidence. No test execution claimed by T004.

---

## T043 technical freeze — planned create localRef derivation (2026-10-15)

This is approved linkage of **existing T004 fields**, not a new command, DTO,
wire payload field, account fallback or automatic ATM group creation:

- Each selected financial create freezes
  `plannedEntityIds[{entity:"transaction"|"transfer",localRef:row.rowId,id}]`
  using its genuine kind. Each **needed newly created confirmed group account**
  uses `{entity:"account",localRef:group.groupId,id}`. Each actual `id` is a
  separate frozen create UUID, not the row/group/child alias. Existing-account
  reuse and unused groups have no create entries. The review first-default
  order uses **actual account-create IDs**, never localRef or array index.
- For BANK, the one `bank_details` localRef is
  `uuidV8FromSha256(SHA256(JSON.stringify(["account-review-localref/v1",ownerId,sessionId,groupId,"bank_details"])))`.
  For each sender child use
  `uuidV8FromSha256(SHA256(JSON.stringify(["account-review-localref/v1",ownerId,sessionId,groupId,"account_sms_sender",normalizedSender])))`.
  Reuse pure `uuidV8FromSha256` from
  `packages/logic/src/account-review/identity.ts`; never copy nibble logic.
  Normalization matches existing `normalizeAccountSmsSender`: `trim()`,
  `replace(/\s+/g," ")`, `toLowerCase()`, **no NFC**. Deduplicate
  whitespace/case-equivalent aliases using existing `uniqueTrimmedSenderNames`,
  not an invented duplicate-name rule.
- BANK alone gets bank details; WALLET may have normalized sender children but
  no bank details; CASH gets neither. Reject duplicate aliases/IDs, missing or
  extra children, wrong parents/evidence/revisions or index-derived aliases.
  Child `after.accountId` references the frozen **created account ID**, not
  group localRef. Logic never imports `apps/mobile`; use a pure normalizer or
  explicit mobile adapter at T027/T048.
- Freeze all actual IDs/localRefs, timestamp, selected rows, owner/session,
  operation generation and group revisions **before asynchronous Save**. Recheck
  owner/source, row/group/currency/selection revisions and planned mappings
  after awaits and inside the atomic writer. Retry the same frozen action
  identity/hash; never mint replacements or rebind a stale group.
- For SMS ATM, an existing eligible CASH destination (compatible default,
  sole, or explicit manual choice) is the current path. A genuinely canonical,
  confirmed, referenced `toAssignment` group may supply its `groupId`; never
  invent a group or created Cash destination from row index, name or absent
  evidence. Without a real eligible Cash or that canonical group, destination
  remains unresolved and Save blocked. `toAccountEvidence` is separate local
  proof; no added destination field/command.
- Reviewed SMS v2 boundary is
  `encodeSmsReviewDraftV2({transaction,review})` plus
  `smsReviewDraftPayloadV2Schema` from separately owned T025. V1 encoding
  remains for explicit legacy/migration tests, never a happy-path fallback.
