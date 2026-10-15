# #395 / T009 — Independent TypeScript, logic and security schema review

**Review disposition:** **CHANGES REQUIRED before treating the T009 schema as
fully contract-accepted.** Four HIGH schema-boundary gaps have specific source
evidence. This is a read-only review of implementation, not a redefinition of
product behavior, a patch, a test run, or permission to implement T010.

| Item                                   | Pinned source                                                                                                                                                                           |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository                             | `Msg22/Monyvi`                                                                                                                                                                          |
| Reviewed Core schema HEAD              | `0700eb3e6023ea33a91f8662515d98e644087112` (includes `cad11698b4580732e75c0bc884a119fcc7bba55c` and narrowly scoped TS2339 repair)                                                      |
| Normative T004 frozen contracts        | `7e27eb55c642dccef44f4b977a8712ab320ecd18`; `contracts/wire-shapes.md` blob `b6c513eec986b93158be51002487e6a39c84361b`                                                                  |
| Trusted governance                     | `main@7838df64eb9b3828c6e8f1a02f590b008d5435fd` (`AGENTS.md`, constitution)                                                                                                             |
| Independently reviewed workflow update | `codex/395-implementation-context@8a96f74c09a5c3d62ac37f1d965c80d10605fce0`; free OpenCode, Antigravity Gemini/Claude, **no native without Mohamed's prior explicit per-task approval** |
| Report parent / isolated author branch | `codex/395-ui-worker@6f40577fbb817931a1b65955cad6d492ced1c63f`, report-only lease; this report is the sole new file                                                                     |

## Evidence and scope boundary

Read the complete current `schemas.ts` (754 lines, blob
`c8a6a879d950694f348f1f9634032b5ff61eceb2`), `generated-vocabulary.ts` (blob
`3f0f4a7b13bc5e781f8c956931ee0d0597707926`),
`scripts/generate-account-review-vocabulary.cjs` (blob
`d94047413987f5aa28fb7014cd9a6a46dbad18a0`), `packages/logic/src/index.ts`, all
`schemas.test.ts` tests, synthetic fixture factories, T007 Edge/client test
structure, Core's existing report and frozen T004/review-commands contracts.
Inspected existing `packages/logic/src/types.ts` parsed transaction interfaces
and the existing canonical integer helper solely to check type/drift
compatibility. No production files, tests, schema, generator, docs other than
this report, SQL or feature contracts were edited.

**Runner evidence supplied by root, not independently rerun:** **54/54 T005
schema cases PASS**, logic TypeScript typecheck **PASS**, and generated
vocabulary generator ran locally with an empty diff. Scoped lint/format are
**pending**. This reviewer ran **no** Jest, Babel, `tsc`, formatter, ESLint,
provider, API, emulator, SQL, or device check. Static inspection alone cannot
close later Edge-generation/provider/runtime adapter/financial-save gates.

## HIGH — actionable T009 contract gaps

### H1 — Conflicting institution identity can pass a supposedly compatible shared suggestion

- **Location:**
  [packages/logic/src/account-review/schemas.ts:L325](https://github.com/Msg22/Monyvi/blob/0700eb3e6023ea33a91f8662515d98e644087112/packages/logic/src/account-review/schemas.ts#L325)–L345;
  [packages/logic/src/account-review/schemas.ts:L278](https://github.com/Msg22/Monyvi/blob/0700eb3e6023ea33a91f8662515d98e644087112/packages/logic/src/account-review/schemas.ts#L278)–L355.
- **Normative:**
  [T004:L91](https://github.com/Msg22/Monyvi/blob/7e27eb55c642dccef44f4b977a8712ab320ecd18/specs/395-shared-account-review/contracts/wire-shapes.md#L91)–L100
  requires compatible account/type/provider/**institution**/card evidence;
  incompatible identities must split or remain unresolved. `FR-005`/`FR-021`
  require safe evidence-grounded grouping.
- **Observed:** `validateAdvisoryEnvelope` checks name, type,
  `providerDisplayName`, `cardLast4`, and explicit currency but **never
  compares** `suggestion.institutionId` with
  `row.accountEvidence.institutionId`. Both are separate required nullable
  fields in the strict schemas. An otherwise valid row with explicit institution
  `"cib"` and a linked suggested account with institution `"qnb"` can therefore
  pass that compatibility branch when name/type/provider/card match. This is a
  real missing predicate, not proof that any bank-specific provider has emitted
  it.
- **Coverage hole:**
  [packages/logic/src/account-review/**tests**/schemas.test.ts:L692](https://github.com/Msg22/Monyvi/blob/0700eb3e6023ea33a91f8662515d98e644087112/packages/logic/src/account-review/__tests__/schemas.test.ts#L692)–L701
  exercises only currency/card mismatches; it does not include conflicting
  `institutionId`.
- **Smallest fix:** Add an institution-ID compatibility check in the shared
  suggestion/row relation (reject clearly conflicting non-null IDs; do not infer
  a provider from null metadata), and one negative Voice/SMS test using a
  grounded existing fixture modified only in institution identity. Preserve a
  valid financial row as **unresolved** on malformed advisory content at the
  T012–T014 adapter boundary; no new provider call or account creation.
- **Severity rationale:** Institution mismatch can turn two financial account
  identities into one shared draft even if the UI later confirms that draft.

### H2 — A linked suggestion can be treated as structurally valid while its currency is uncertain

- **Location:**
  [packages/logic/src/account-review/schemas.ts:L290](https://github.com/Msg22/Monyvi/blob/0700eb3e6023ea33a91f8662515d98e644087112/packages/logic/src/account-review/schemas.ts#L290)–L329,
  specifically the `suggestion.currency` consistency check at L325–329.
- **Normative:**
  [T004:L79](https://github.com/Msg22/Monyvi/blob/7e27eb55c642dccef44f4b977a8712ab320ecd18/specs/395-shared-account-review/contracts/wire-shapes.md#L79)–L100
  explicitly distinguishes omitted/ambiguous/conflicting/unsupported currency; a
  shared suggested identity requires **known, compatible currency** and cannot
  silently acquire a default.
- **Observed:** The currency comparison fires **only** for
  `row.currencyEvidence.state === "explicit"`. For `"ambiguous"`,
  `"conflicting"`, `"unsupported"`, `"unknown"` or unproven omission, a row may
  retain `suggestionRef` and the suggestion may carry a concrete
  `currency: "EGP"` without a confirmed match. The available
  `validateAdvisoryEnvelope` logic does not rule it out; the row-level
  `accountReviewCurrencyEvidenceSchema` alone validates the _uncertainty state_,
  not the group assignment.
- **Coverage hole:**
  [packages/logic/src/account-review/**tests**/schemas.test.ts:L281](https://github.com/Msg22/Monyvi/blob/0700eb3e6023ea33a91f8662515d98e644087112/packages/logic/src/account-review/__tests__/schemas.test.ts#L281)–L292
  separately tests uncertainty grammar, while
  [packages/logic/src/account-review/**tests**/schemas.test.ts:L692](https://github.com/Msg22/Monyvi/blob/0700eb3e6023ea33a91f8662515d98e644087112/packages/logic/src/account-review/__tests__/schemas.test.ts#L692)–L701
  tests only **explicit** suggested-currency conflict. Neither tests uncertain
  evidence linked to a concrete suggested group.
- **Smallest fix:** Require evidence-backed known compatible currency **before
  allowing active shared-group linkage** (or explicitly conservatively degrade
  such advisory linkage to unresolved at the normalization boundary), with
  negative test vectors for ambiguous/conflicting/unsupported/legacy unknown
  currency. Do not reinterpret uncertainty as proven omission or discard a valid
  financial row.
- **Severity rationale:** Independent group confirmation must not substitute for
  required currency confirmation.

### H3 — Session groups lack reciprocal membership, one-group-per-row and currency consistency guards

- **Location:**
  [packages/logic/src/account-review/schemas.ts:L630](https://github.com/Msg22/Monyvi/blob/0700eb3e6023ea33a91f8662515d98e644087112/packages/logic/src/account-review/schemas.ts#L630)–L658.
- **Normative:**
  [T004:L115](https://github.com/Msg22/Monyvi/blob/7e27eb55c642dccef44f4b977a8712ab320ecd18/specs/395-shared-account-review/contracts/wire-shapes.md#L115)–L127
  specifies stable row/group identities and immutable scoped state;
  `data-model.md` says detach/regroup exactly affected rows;
  `review-commands.md` requires selection/confirmation limited to linked rows.
- **Observed:** For a row whose `assignment.state === "suggested"`, validation
  checks that _its_ group exists, links the row, matches revision, and has
  matching confirmation status. But the **reverse group loop** validates only
  that `linkedRowIds` are unique and refer to **some existing row**. It does not
  require an active pending/confirmed group's listed row to point back to that
  group; does not forbid two live groups from listing the same row; and does not
  compare the group's currency to each linked row's known review currency. Thus
  adding a second `confirmed` group that lists an unrelated existing/unresolved
  row can pass these group-level predicates, and a group may span incompatible
  row currencies.
- **Coverage hole:**
  [packages/logic/src/account-review/**tests**/schemas.test.ts:L524](https://github.com/Msg22/Monyvi/blob/0700eb3e6023ea33a91f8662515d98e644087112/packages/logic/src/account-review/__tests__/schemas.test.ts#L524)–L545
  rejects an orphan _suggested assignment_, not a live group with an
  extra/mismatched linked row.
  [packages/logic/src/account-review/**tests**/schemas.test.ts:L369](https://github.com/Msg22/Monyvi/blob/0700eb3e6023ea33a91f8662515d98e644087112/packages/logic/src/account-review/__tests__/schemas.test.ts#L369)–L396
  checks duplicate IDs **inside** one group but not the same row linked by
  distinct groups.
- **Smallest fix:** In the session validator enforce **bidirectional, unique
  active-group membership** and current group/row currency consistency, with
  specific negative cases for extra linked IDs, cross-group row duplication,
  mismatched known currency and stale membership. Preserve the explicitly
  allowed **removed-group tombstone** (linked rows may now be
  unresolved/detached); do not force its former assignments back onto rows.
- **Severity rationale:** A structurally validated review snapshot can otherwise
  misstate which rows were confirmed and potentially referenced for selected
  Save.

### H4 — Local review rows allow unsupported destination assignments

- **Location:**
  [packages/logic/src/account-review/schemas.ts:L505](https://github.com/Msg22/Monyvi/blob/0700eb3e6023ea33a91f8662515d98e644087112/packages/logic/src/account-review/schemas.ts#L505)–L549,
  particularly required nullable `toAssignment` at L516 and
  `accountReviewRowSchema.superRefine` at L537–549.
- **Normative:**
  [T004:L91](https://github.com/Msg22/Monyvi/blob/7e27eb55c642dccef44f4b977a8712ab320ecd18/specs/395-shared-account-review/contracts/wire-shapes.md#L91)–L96
  permits separate ATM/transfer endpoint evidence but requires null destination
  for ordinary income/expense; `review-commands.md` L50–53 requires separate ATM
  source and Cash destination eligibility and forbids same source/destination.
- **Observed:** `accountReviewRowSchema` validates currency/primary assignment
  agreement and SMS fingerprint equality, but **never inspects `toAssignment`**.
  An ordinary Voice row or non-ATM SMS row can therefore contain an `existing`
  or `suggested` destination assignment, and a destination can disagree with the
  known review currency. The provider-response validator does reject ordinary
  `toAccountEvidence`, but that does not validate the separately
  persisted/normalized review-row field.
- **Coverage hole:**
  [packages/logic/src/account-review/**tests**/schemas.test.ts:L474](https://github.com/Msg22/Monyvi/blob/0700eb3e6023ea33a91f8662515d98e644087112/packages/logic/src/account-review/__tests__/schemas.test.ts#L474)–L522
  exercises a row's **primary** assignment/currency, not a non-null destination
  on ordinary rows.
- **Smallest fix:** Source/type-aware row validation: require destination null
  on ordinary Voice and non-ATM SMS; permit a separately validated destination
  only on the supported ATM/endpoint path, rechecking currency and distinct
  source/destination when known. Keep ownership/revalidation with the scoped
  reducer/Save writer, not provider advice. Add ordinary/ATM positive-negative
  tests without changing the frozen wire fields.
- **Severity rationale:** A malformed local review snapshot can claim an
  unauthorized transfer endpoint even when provider evidence did not contain
  one.

## MEDIUM — explicit follow-up boundaries (do not redesign T009)

### M1 — Save intent is shape-valid without matching the enclosing selected session state

- **Location:**
  [packages/logic/src/account-review/schemas.ts:L586](https://github.com/Msg22/Monyvi/blob/0700eb3e6023ea33a91f8662515d98e644087112/packages/logic/src/account-review/schemas.ts#L586)–L615
  and
  [packages/logic/src/account-review/schemas.ts:L658](https://github.com/Msg22/Monyvi/blob/0700eb3e6023ea33a91f8662515d98e644087112/packages/logic/src/account-review/schemas.ts#L658)–L664.
- **Observed:** `accountReviewSaveIntentSchema` verifies selected-row/group ID
  uniqueness and action metadata; the session validator checks only intent
  `ownerId/sessionId/source`. A `saveIntent.selectedRows` entry can refer to an
  absent/unselected or revision-mismatched row, and `confirmedGroups` can refer
  to a nonexistent or unrelated group, while the session schema remains
  structurally valid.
- **Normative:**
  [T004:L199](https://github.com/Msg22/Monyvi/blob/7e27eb55c642dccef44f4b977a8712ab320ecd18/specs/395-shared-account-review/contracts/wire-shapes.md#L199)–L208
  freezes the selected intent before async Save; T004 complete writer still
  requires revalidation.
- **Smallest fix / owner:** Establish the
  selected-row/group/revision/evidenceKey consistency invariant **at
  `createAccountReviewSaveIntent` and again at the T048 writer boundary**; add
  negative tests. If the session schema is expected to be an authoritative
  save-ready state, add a compatible refinement after deciding how pending
  immutable intents behave during recovery—do not silently invalidate allowed
  frozen in-flight snapshots. **T027/T048 integration gate**, not permission for
  this reviewer to edit source.

### M2 — Calendar-date grammar validates existence but not the existing latest-allowed-date policy

- **Location:**
  [packages/logic/src/account-review/schemas.ts:L57](https://github.com/Msg22/Monyvi/blob/0700eb3e6023ea33a91f8662515d98e644087112/packages/logic/src/account-review/schemas.ts#L57)–L63;
  currently only a real ISO calendar check.
- **Normative:**
  [T004:L25](https://github.com/Msg22/Monyvi/blob/7e27eb55c642dccef44f4b977a8712ab320ecd18/specs/395-shared-account-review/contracts/wire-shapes.md#L25)–L27
  requires the **existing source date policy and latest-allowed-date
  validation**.
  [packages/logic/src/account-review/**tests**/schemas.test.ts:L721](https://github.com/Msg22/Monyvi/blob/0700eb3e6023ea33a91f8662515d98e644087112/packages/logic/src/account-review/__tests__/schemas.test.ts#L721)–L732
  tests an impossible day, but no policy-limit case.
- **Smallest fix / owner:** Reuse the existing source-specific latest-date
  validator with an injectable clock or assert it in the T012/T013 adapter
  before normalization; include a future-date boundary example such as
  `2099-12-31` according to the actual approved policy. Do not invent a
  universal future cutoff. **T009/T012/T013 responsibility to reconcile**.

### M3 — Metadata/cardinality bounds are delegated but must be evidenced at original request/response boundaries

- **Location:**
  [packages/logic/src/account-review/schemas.ts:L26](https://github.com/Msg22/Monyvi/blob/0700eb3e6023ea33a91f8662515d98e644087112/packages/logic/src/account-review/schemas.ts#L26)–L35,
  [packages/logic/src/account-review/schemas.ts:L94](https://github.com/Msg22/Monyvi/blob/0700eb3e6023ea33a91f8662515d98e644087112/packages/logic/src/account-review/schemas.ts#L94)–L113,
  [packages/logic/src/account-review/schemas.ts:L115](https://github.com/Msg22/Monyvi/blob/0700eb3e6023ea33a91f8662515d98e644087112/packages/logic/src/account-review/schemas.ts#L115)–L169
  and
  [packages/logic/src/account-review/schemas.ts:L190](https://github.com/Msg22/Monyvi/blob/0700eb3e6023ea33a91f8662515d98e644087112/packages/logic/src/account-review/schemas.ts#L190)–L204.
  `sourceRef`, institution/provider strings, names, `senderNames`, spans,
  context accounts and suggestions have no local `.max`/aggregate bound in this
  Zod module.
- **Normative:** T004 `parser-evidence.md` requires existing SMS payload/token
  safeguards, refusing oversized context rather than silently trimming identity;
  the response must remain validated.
- **Smallest fix / owner:** T012/T013/T014 must prove the real configured
  size/token budgets apply to account context and untrusted response
  arrays/strings before materializing a large review graph; fail safely without
  extra provider attempts or truncating account identity. Add bounded/oversized
  tests against the **existing** limits, not arbitrary new constants. Do not
  claim schema `.strict()` alone makes size safe. **Deferred integration risk**,
  not an invented T009 numeric cap.

### M4 — Source snapshot schema is manually transcribed without an explicit drift guard

- **Location:**
  [packages/logic/src/account-review/schemas.ts:L456](https://github.com/Msg22/Monyvi/blob/0700eb3e6023ea33a91f8662515d98e644087112/packages/logic/src/account-review/schemas.ts#L456)–L503.
  Normative
  [T004:L120](https://github.com/Msg22/Monyvi/blob/7e27eb55c642dccef44f4b977a8712ab320ecd18/specs/395-shared-account-review/contracts/wire-shapes.md#L120)–L123
  says `transaction` reuses the established parsed source schema/types. Current
  `packages/logic/src/types.ts` L105–183 is the existing `ReviewableTransaction`
  / `ParsedSmsTransaction` / `ParsedVoiceTransaction` contract.
- **Observed:** The strict Zod `reviewTransactionBase` and source-specific local
  transaction shapes are rewritten independently of those interfaces. No
  type-level conformance assertion ties these validators to the existing parsed
  transaction snapshots. This can drift when an existing optional/required field
  changes, even if `@monyvi/logic` compiles, because the copied validator shape
  currently compiles in isolation.
- **Smallest fix / owner:** Add type-only compile-time conformance checks (or
  derive from a preexisting canonical runtime schema if there is one) and test
  full real-shaped synthetic SMS/Voice snapshots including current optional
  fields. Keep the legacy SMS pending-account BANK/WALLET narrowing separate
  from Voice CASH as intended; **no new domain union or runtime DB import**.

## Coverage assessment and positive observations

- **Correct:** `generated-vocabulary.ts` contains type-only domain imports and
  generated runtime arrays with `satisfies`/compile-time `Exclude<...>` coverage
  checks; `z.enum` consumes the generated account/currency/transaction type
  arrays. No hardcoded new copied currency or account-type unions are needed for
  the parser. Root reports generator output empty diff and logic typecheck PASS.
- **Correct:** Top-level and nested provider structures are `.strict()`,
  preventing fields such as balances, card/account numbers, raw SMS or private
  transcript extras from silently entering the **request/provider object**.
  Nullable `accountId`/identity fields, four-digit card suffix, shared canonical
  revision parser, exact UTC timestamp, duplicate refs and original Voice CASH
  are represented.
- **Correct scope split:** Voice span UTF-16 substring validation is performed
  against returned `original_transcript` in
  [packages/logic/src/account-review/schemas.ts:L250](https://github.com/Msg22/Monyvi/blob/0700eb3e6023ea33a91f8662515d98e644087112/packages/logic/src/account-review/schemas.ts#L250)–L276;
  real SMS body/sender substring and actual logical Voice request-key
  correlation require original input and belong to T013/T014. Do **not** add raw
  SMS/text to a provider response to make these tests easier.
- **Not proof of normalization:**
  [packages/logic/src/account-review/**tests**/schemas.test.ts:L738](https://github.com/Msg22/Monyvi/blob/0700eb3e6023ea33a91f8662515d98e644087112/packages/logic/src/account-review/__tests__/schemas.test.ts#L738)–L775
  tests schema acceptance of an omitted/unknown currency envelope, **not**
  actual mobile adapter preservation of valid financial rows after malformed
  advice. The Core report already recognizes F02/F03's need for one typed
  normalized result seam in T012–T014. Do not interpret T005 acceptance or
  recursive search through raw response JSON as a passing retention/usage test.
- **Tests not present:** No negative cases yet for H1 institution conflicts, H2
  uncertain suggestion currency, H3 reverse/cross-group linkage, or H4
  ordinary-row `toAssignment`. Passing schema fixtures largely test the known
  happy path and selected negative fields; **54/54 root-run success does not
  cover these omitted predicates**.
- **T009 scope limits:** No `review.batch-save/v1` financial-action
  registration, SQL, sync, hosted action, Edge generated provider file, parser
  adapters, or UI is implemented by the reviewed source. Those require later
  independent checks and existing owner approvals; this report grants none.

## Handoff and reviewer decision

**Priority:** address **H1–H4 with the smallest pure-schema and
focused-negative-test corrections** (and conservative malformed-advisory
handling at the adapter boundary), then rerun the impacted schema batch and
logic typecheck locally. M1–M4 must be assigned explicit downstream tests/gates
or reconciled during source correction; they are not authorization to expand
schema/product design. The independent reviewer has **not** modified or repaired
any Core source. T010's owned, scoped read-model work can be considered by root
only after review dispositions and remaining pre-production gates are accepted;
this report itself does not start T010.

**Execution/ownership:** Normal ChatGPT only. No native delegate, no
OpenCode/Antigravity runtime invocation, no
tests/SQL/provider/deployment/PR/comments/issues/Pages. Only this report is
writable. Writer releases this report leaf immediately after GitHub commit and
exact one-file comparison verification; all other source ownership remains with
existing lanes.
