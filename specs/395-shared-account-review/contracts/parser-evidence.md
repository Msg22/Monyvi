# Parser evidence contract — review v2

Frozen T004 technical target; implementation remains pending. Exact closed
schemas/exports and invalid-advisory policy are in
[wire shapes](wire-shapes.md). Extend original parse-voice multipart / parse-sms
JSON context with `reviewContractVersion: "account-review/v2"`. Existing request
identity, consent, caller timezone/date, usage policy, chunk scheduler,
completion and safeguard metadata are unchanged. Clients without the field keep
v1 output. Deploy compatible Edge support before enabling v2 mobile requests; no
automatic second provider call for unsupported/malformed v2.

## Canonical source and projections

New logic-owned account-review Zod schemas derive exported types and generated
Edge artifacts/provider JSON projections. Enum/amount bounds reference existing
canonical domain vocabulary and MAX_TRANSACTION_AMOUNT. Do not copy account or
currency enums into mobile/Edge response adapters. Edge copies must pass a
byte/hash parity test; generator updates and generated files commit together.
Provider projection uses supported shallow objects/arrays/enums/nulls; business
refinements remain application validators. Keep configured Voice Gemini and SMS
DeepInfra adapter/model policies; no model/provider replacement.

## Request context

Owned active account snapshots: opaque id, nickname, currency, canonical type,
provider registry ID/display name, masked card suffix and approved sender
aliases. Never include account balances, full account/card numbers,
foreign/deleted rows or unrelated account metadata. Preferred currency comes
from current-user profile. Caller snapshots are advisory context, not
authorization for server DB writes. SMS currently lacks account context; thread
it through the existing original request/chunk executor and provider context,
with existing input-token accounting. Review changes do not change SMS candidate
filtering or live-confirm policy.

Stable system instructions precede dynamic account/category/input context;
retain existing provider cache behavior, do not add explicit cache storage in
this issue. Bound context using existing payload/token safeguards. If new
context exceeds existing bounds, report the existing refusal/recovery, not
silently trim evidence or add extra attempts. Do not truncate account identity
to force a match.

## Response additions

Top-level `reviewContractVersion`, `suggestedAccounts` and per-transaction
evidence. Existing source response fields/transcript and SMS completion metadata
remain.

Normative field names are `transactionRef`, nullable `suggestionRef`,
`accountEvidence`, nullable `toAccountEvidence`, `currencyEvidence`,
`evidenceSpans`, `institutionId`, `providerDisplayName`, `cardLast4`, and
`transactionRefs`; do not implement alternate spellings from descriptive text.
`EvidenceSpan.field` distinguishes transcript/body/sender. Closed success
schemas compose original financial keys with additions; error/refusal/completion
schemas keep their existing separate source contract.

| Object           | Required content                                                                                          | Semantics                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| TransactionRef   | Nonempty unique response-local identifier                                                                 | Scoped alias; normalized to client source/session identity, never DB ID                    |
| AccountEvidence  | state, name/type/provider/card or null, evidence spans, candidateAccountIds                               | Advisory, ground in supplied input/context; no merchant-as-account                         |
| CurrencyEvidence | state, stated code or null, candidate codes, evidence spans                                               | omitted/explicit/ambiguous/conflicting/unsupported/unknown remain distinct                 |
| SuggestedAccount | suggestionRef, explicit nickname, type or null, currency or null, provider/card metadata, transactionRefs | Shared only for same confirmed currency/compatible explicit evidence                       |
| EvidenceSpan     | sourceRef, start, end, text                                                                               | Valid source, UTF-16 indices for JS text; exact substring match; contextual scope explicit |

`AccountEvidence.state`: absent, explicit, contextual, uncertain.
`CurrencyEvidence.state`: omitted, explicit, ambiguous, conflicting,
unsupported, unknown. Provider canonical type may be null when unknown; do not
fabricate BANK. An ambiguous/conflicting currency may have supported candidates
but no accepted code. Omitted uses preferred currency locally;
unknown/unsupported is not omitted. Existing `accountId` cannot override this
evidence or a user's choice.

Grounded Voice CASH remains a valid canonical type; ordinary SMS source evidence
retains BANK/WALLET eligibility. The shared adapter must not drop Voice Cash
because the legacy SMS pending type excludes it.

Voice sourceRef points into returned original transcript; shared context must be
bounded and linked explicitly to each member. This checks internal textual
consistency, not independent proof of what the audio said. Suggested accounts
remain human-confirmed. No extra speech-to-text call is introduced. SMS
sourceRef is a submitted messageId/body or sender metadata; no borrowing
evidence from another unrelated message. Each grouped SMS member must contain
compatible explicit source identity/provider/card evidence of its own.

## Cross-reference and semantic validation

1. Validate envelope/version/arrays and existing source financial fields at Edge
   and mobile. Reject non-finite/out-of-range amounts, unsupported transaction
   kinds, malformed dates and inaccessible categories through existing recovery.
2. Correlate SMS messageId/fingerprint to submitted inputs. TransactionRefs and
   suggestionRefs unique in a response; no cross-request alias collision.
3. Suggestion references must exist; no duplicate membership or group count
   larger than valid returned rows. Unreferenced suggestions cannot create
   accounts.
4. Validate evidence spans, provider registry identities/aliases and account
   snapshot references. Recheck local owned active currency/type/card/provider
   compatibility regardless of AI candidate ID/name/confidence.
5. Shared members require known same currency and compatible identity evidence.
   Null card plus explicit incompatible card is not proof of equivalence;
   conflicting non-null cards/types/providers must remain separate. Conservative
   split/unresolved state instead of arbitrarily adopting model membership.
6. An account ID does not establish currency; account-currency priority fallback
   is removed from the v2 adapter. Explicit uncertain currency blocks auto
   account.
7. Malformed advisory group/evidence: retain valid financial content as
   unresolved account/currency review, preserving hard reasons. Do not treat it
   as no-results or a durable negative fingerprint. Existing malformed financial
   response handling/safeguards still govern retry; no extra grouping call.
8. Emit only reason codes/counts/timing/token usage in logs, not names, text,
   snippets, transaction amounts, full responses or source fingerprints.

## Chunk/retry and local parser integration

Namespace model refs by request key/chunk; normalize validated evidence into
stable local identities. Merge equivalent groups across incremental chunks/retry
using local canonical evidence and current user/session; user
overrides/tombstones win over unchanged source input. Newly incompatible
identity never inherits confirmation. A newly equivalent member inherits
identical account confirmation only; it is not automatically selected.

Trusted/local SMS parsers adapt deterministic evidence into the same engine,
without any AI call for grouping. If the parser lacks proof of
omission/identity, use unknown/unresolved; do not reinterpret null as omission.
Preserve existing trusted parser review reasons and sender/card rules.
Live/headless confirmation behavior remains unchanged; apply the new interaction
only in review flows.

## Compatibility and tests

Old client → v1 server behavior unchanged. V2 client → old server response is
decoded conservatively with unknown provenance, no invented shared/default
confirmation and no automatic transport replay. Required partial-result, quota,
expiry and empty-result handling stays source-specific.

Coverage: projection/parity, explicit/omitted/uncertain evidence, foreign IDs,
duplicate/dangling refs, merchant false-positive, card/type/currency conflicts,
provider unsupported schema fixtures, source span mismatch, chunk/retry arrival,
legacy output, zero extra provider calls and unchanged safeguard completion.
Real configured-provider interpretation remains owner-authorized manual
evidence.
