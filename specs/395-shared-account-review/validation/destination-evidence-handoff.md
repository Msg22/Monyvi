# #395 I1 — Local ATM destination-evidence handoff (plan only)

**Status:** Proposed minimal technical reconciliation; **no
source/tests/contracts/tasks/SQL/mobile/generated files changed**. Immutable
published implementation context:
[`9a8987a8087db886d9b9244182ef8e8128016621`](https://github.com/Msg22/Monyvi/blob/9a8987a8087db886d9b9244182ef8e8128016621/packages/logic/src/account-review/review-schemas.ts).
Normalizer producer consulted read-only at
`85e40b6dbd4b7a486e087d4007c150597942f9aa` on `codex/395-normalization-worker`;
producer may publish a successor. Ownership of `normalization.ts::prepareRow`
and `normalization-evidence.ts` **remains with that normalizer owner**, not this
report lane. Frozen T004/B1 product decisions remain unchanged; material rule
changes HOLD.

## Decision: one canonical _local review-row_ destination-proof field is required

**Reject the no-new-field alternative.** Provider SMS v2 already carries
canonical nullable `toAccountEvidence`
([parser-schemas.ts:230–236](https://github.com/Msg22/Monyvi/blob/9a8987a8087db886d9b9244182ef8e8128016621/packages/logic/src/account-review/parser-schemas.ts#L230-L236)),
and frozen
[wire-shapes.md:79–100](https://github.com/Msg22/Monyvi/blob/9a8987a8087db886d9b9244182ef8e8128016621/specs/395-shared-account-review/contracts/wire-shapes.md#L79-L100)
requires its grounding independently from source evidence. However current local
[`commonReviewRow`:174–190](https://github.com/Msg22/Monyvi/blob/9a8987a8087db886d9b9244182ef8e8128016621/packages/logic/src/account-review/review-schemas.ts#L174-L190)
retains only `accountEvidence` and `toAssignment`. The normalizer's
[destination validity check](https://github.com/Msg22/Monyvi/blob/85e40b6dbd4b7a486e087d4007c150597942f9aa/packages/logic/src/account-review/normalization-evidence.ts#L126-L156)
contributes only to a boolean, and
[`prepareRow`:113–134](https://github.com/Msg22/Monyvi/blob/85e40b6dbd4b7a486e087d4007c150597942f9aa/packages/logic/src/account-review/normalization.ts#L113-L134)
always sets `toAssignment:null`. Both **explicit named unmatched Cash**,
**uncertain Cash identity**, and **true absence** then look identical to
T019/T014-M. `toAssignment` encodes `existing/suggested/unresolved` decisions
but cannot express grounded name/type/card/provider/candidate scope or UTF-16
evidence; encoding those into reasonCode/candidateAccountIds, legacy
`transaction.toAccountId`, or a second DTO is unsafe. Therefore keep proof and
choice as **two separate fields**.

### Minimal exact canonical schema proposal (NOT implemented)

Change only `packages/logic/src/account-review/review-schemas.ts`'s shared
`commonReviewRow` when a future canonical-source lease exists:

```ts
accountEvidence: accountReviewAccountEvidenceSchema,
toAccountEvidence: accountReviewAccountEvidenceSchema.nullable().default(null),
currency: accountReviewCurrencySchema,
assignment: accountReviewAssignmentSchema,
toAssignment: accountReviewAssignmentSchema.nullable(),
```

Reuse the **existing inferred** `AccountReviewAccountEvidence` union; no new
provider wire field, enum, copy, public DTO, group ID or financial-action
payload. `accountReviewRowSchema` and `accountReviewSessionSchema` remain the
authoritative strict validators. The Zod _input_ admits an **omitted** legacy
field; the parsed _output_ always materializes `toAccountEvidence:null` (never
`undefined`). Do **not** use a permissive `.optional()` output, add silent
`catch` defaults on malformed objects, or change source `accountEvidence`.

Extend the existing `validateReviewDestination(row,ctx)` rules **only** as
follows (future grant): for every **Voice row** and every **non-ATM SMS** row,
`toAccountEvidence !== null` is a schema error on `["toAccountEvidence"]`;
retain the already existing `toAssignment===null` restriction. On ATM SMS, allow
`null` or a canonical `absent | explicit | uncertain` object, **never contextual
SMS destination**. `explicit` retains validated source spans and account
identity; `uncertain` remains uncertain with no automatic choice; canonical
`absent` has exactly null identity and empty candidates/spans. The existing
known-currency, assignment-currency and distinct source/destination checks stay
unchanged
([review-schemas.ts:211–267](https://github.com/Msg22/Monyvi/blob/9a8987a8087db886d9b9244182ef8e8128016621/packages/logic/src/account-review/review-schemas.ts#L211-L267)).
A user-selected, freshly revalidated destination can be an
`existing(origin:"user")` assignment even with unconfirmed provider evidence,
subject to existing currency/source safety; provider uncertainty never itself
supplies authorization. Do **not** allow unresolved `toAssignment` in
unconfirmed-currency states currently disallowed by that validator; proof can
remain non-null while `toAssignment` stays null until currency is confirmed.

### Producer → resolver/adapter handoff and trust

1. **T014-P owner, later separate lease:** extend `NormalizedRowEvidence` with
   `readonly toAccountEvidence: AccountReviewAccountEvidence | null` and
   **separate source-validity from destination-validity** in
   `normalization-evidence.ts`; pass the result into
   `normalization.ts::prepareRow` alongside unchanged `accountEvidence`,
   financial rows, rowId, review reasons and `toAssignment`. Accept v2 ATM proof
   **only** after exact submitted SMS messageId/fingerprint/body or sender
   UTF-16 grounding, type/card/provider compatibility, owned candidate checks
   and no cross-message/model-ref borrowing.
   Invalid/foreign/currency-incompatible destination provenance must become a
   **blocked/sanitized `uncertain`** local proof (no bogus spans/candidates,
   with `account_evidence_invalid`/`cash_transfer_review` reason), **not**
   `null` or `absent` that would authorize a default. Preserve otherwise valid
   financial amount/category and independently valid source evidence. No
   provider retry/extra AI call.
2. **T014-M platform boundary:** use the approved actual **zero-argument**
   `loadAccountReviewAccountSnapshots(): Promise<AccountReviewAccountSnapshots>`
   ([T010:324–347](https://github.com/Msg22/Monyvi/blob/9a8987a8087db886d9b9244182ef8e8128016621/apps/mobile/services/account-review-read-model-service.ts#L324-L347));
   **do not invent `expectedUserId` argument** from the stale T014-M plan. T010
   checks scoped active owned accounts, default metadata, children and current
   actor; adapter retains its owner/session/generation/cancellation guards and
   original SMS correlation before passing typed context into pure logic. That
   context is **not** a DB authorization token.
3. **T019 resolver authority (after T016):** inspect local row
   `toAccountEvidence` **independently** of source `accountEvidence`. Grounded
   explicit Cash destination → match a _compatible owned active Cash_ candidate
   or offer unresolved named choice; **never fallback** to another Cash default
   if explicit unmatched or ambiguous. Uncertain/invalid proof →
   unresolved/manual confirmation without substituting Cash default. Only _true
   no-evidence_ (`null` or canonical `absent`) may choose one eligible matching
   Cash default, else the sole compatible Cash, else unresolved choice; no first
   Bank fallback. Require known compatible currency and different
   source/destination account IDs. Preserve valid explicit user choice after
   current-owner revalidation, without using old `transaction.toAccountId` as
   proof
   ([review-commands.md:38–55](https://github.com/Msg22/Monyvi/blob/9a8987a8087db886d9b9244182ef8e8128016621/specs/395-shared-account-review/contracts/review-commands.md#L38-L55)).
   The resolver does not generate groups/row IDs, auto-select, confirm, convert
   amounts or write records.
4. **Local durability/privacy:** if T028 later serializes the existing SMS v2
   **local draft** review row, store this field under that already approved JSON
   row only with the closed schema and read missing old proof as null; do not
   add DB columns or overwrite v1 encoded bytes. Existing
   [v1 codec](https://github.com/Msg22/Monyvi/blob/9a8987a8087db886d9b9244182ef8e8128016621/packages/logic/src/sms-review-drafts/sms-review-draft-codec.ts#L145-L220)
   must remain unchanged. **Exclude** this local proof, source spans, sender
   text and destination metadata from financial-action cloud tuple, server
   payload, outbox logs, telemetry and provider **request**. The provider
   **response** already includes `toAccountEvidence`; no change to its v2
   response schema or provider projection is needed.

## Exact T004/spec and type-compatibility deltas to request, not perform

- Amend only the **local Row** entry in
  [wire-shapes.md:109–127](https://github.com/Msg22/Monyvi/blob/9a8987a8087db886d9b9244182ef8e8128016621/specs/395-shared-account-review/contracts/wire-shapes.md#L109-L127):
  `toAccountEvidence: AccountEvidence|null`, defaulting omitted prior local rows
  to null on parse; source and destination proof independently validated;
  assignment and provider wire tables unchanged. Clarify
  [parser-evidence.md:76–107](https://github.com/Msg22/Monyvi/blob/9a8987a8087db886d9b9244182ef8e8128016621/specs/395-shared-account-review/contracts/parser-evidence.md#L76-L107)
  that validated ATM destination proof **survives normalization**, invalid proof
  never becomes "no destination mentioned", and ordinary rows require null.
  Clarify the ATM choice/default order in
  [review-commands.md](https://github.com/Msg22/Monyvi/blob/9a8987a8087db886d9b9244182ef8e8128016621/specs/395-shared-account-review/contracts/review-commands.md#L38-L55)
  only as the consequence of the existing grounded-identity-before-default rule.
  Document the field as **local-only** in the T014-M/T028 implementation notes;
  no material product, mockup, migration, SQL, provider, or UI change.
- **Type contract:** `z.infer<typeof accountReviewRowSchema>` /
  `AccountReviewRow` gains a **required output**
  `toAccountEvidence: AccountReviewAccountEvidence|null`;
  `z.input<typeof accountReviewRowSchema>` remains compatible with old omitted
  rows. Existing direct TypeScript `AccountReviewRow` literal builders (e.g.
  [schema-integrity.test.ts:185–315](https://github.com/Msg22/Monyvi/blob/9a8987a8087db886d9b9244182ef8e8128016621/packages/logic/src/account-review/__tests__/schema-integrity.test.ts#L185-L315),
  Core `resolution-fixtures.ts`, pending T014 normalizer prepareRow) need an
  explicit `toAccountEvidence:null` or parse-from-`z.input`; **do not conceal
  those TS errors** with casts/any/suppression. Direct object spreads preserve
  the new field. No field is added to `ParsedSmsTransaction` or
  `AccountReviewSession` root.

## Required tests-first Red before canonical-source grant

| Case                          | Frozen expectation / regression guard                                                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Legacy omitted/null**       | Old Voice/SMS/ATM local rows and earlier codec reads parse; `toAccountEvidence` materializes `null`; original `toAssignment`, user overrides, selection, revisions and source financial fields unchanged. Malformed non-null object still fails closed. |
| **Voice and ordinary SMS**    | Non-null `toAccountEvidence` rejected even with `toAssignment:null`; genuine `null` accepted. Never synthesize an ordinary transfer endpoint.                                                                                                           |
| **ATM explicit matched**      | Original message ID, UTF-16 body/sender span, supported known currency, grounded Cash name/type/card/provider and owned context survive into local row; source BANK/WALLET assignment stays separate; T019 may accept exact current owned Cash.         |
| **ATM explicit unmatched**    | Proof persists as `explicit` with name/spans and unresolved destination; compatible unrelated Cash default **must not** be silently selected.                                                                                                           |
| **ATM ambiguous/uncertain**   | Proof persists as `uncertain`; hard review reasons and no default/reassignment, even if one Cash default exists. Invalid/missing destination proof must not be promoted to `absent`.                                                                    |
| **Bad provenance**            | Rejected forged/wrong-source SMS span, cross-message alias/sender borrow, conflicting card/type/provider/candidate ID; valid financial row/category/source proof retained where safe; blocked destination evidence, no provider replay.                 |
| **Currency and same-account** | Unconfirmed/unsupported/currency-conflicting ATM never gets automatic destination; selected source and Cash destination cannot have the same account ID; no amount conversion.                                                                          |
| **Round-trip/privacy**        | T028 future local-v2 row codec preserves a valid proof, reads omitted old proof as null, and the writer rejects its presence in cloud financial-action tuples, logs and outbound request bodies. No new DB columns; no extra model call.                |

**Tests-only proposed owners (fresh, nonoverlapping grants):** T009
`packages/logic/src/account-review/__tests__/schema-integrity.test.ts` (Zod
input/output, ordinary/ATM); T014-P's existing `normalization.test.ts` or a
focused destination test (producer owns); T017 `resolution.test.ts` once T019
logic is leased; T028's future `sms-review-draft-codec` v2 tests for local
persistence; T014-M original-source adapter tests after its own source grant.
Preserve all existing 65 canonical schema tests, normalization/multiplicity
cases, SMS fingerprint invariant and established 19 Edge Node tests.

**Generator/hash impact:** `review-schemas.ts` is a frozen **reviewed canonical
source** in `scripts/generate-edge-account-review-contract.cjs::REVIEWED_PATHS`
([generator:19–36](https://github.com/Msg22/Monyvi/blob/9a8987a8087db886d9b9244182ef8e8128016621/scripts/generate-edge-account-review-contract.cjs#L19-L36)).
Its byte change changes the whole-source `ACCOUNT_REVIEW_CANONICAL_SHA256` even
though the standalone Edge _parser-only_ runtime and both provider projections
remain structurally unchanged. Root must mechanically regenerate **all three**
generated files, validate the façade marker/hash and tracked-byte parity,
confirm no provider wire schema change, each formatted file <900 lines and
function <50 lines, then rerun T009/Jest, strict logic/mobile TS, 19 Edge Node
cases and actual transitive Deno check. **No hand-authored generated output or
type suppression.**

**Release order / HOLD:** Root reviews this minimal contract reconciliation and
grants (1) focused tests-only Red, (2) canonical schema+contract and
type-compatible direct fixtures, (3) exclusive normalizer producer proof
handoff, then (4) T014-M/T019/T028 consumer grants as their prerequisites become
ready. **No source write ownership has been granted in this lane.** New
technical field serves already approved ATM rules only; any material rule
expansion pauses for explicit owner approval. **STOP / RELEASE.**

## I1 tests-first checkpoint — canonical local destination proof (Red pending Root)

**Lease:** `codex/395-core-worker@5cdfe69737d54c0b6be8e80fb1a8f7ab4a427c08`;
write-only scope NEW
`packages/logic/src/account-review/__tests__/destination-evidence-schema.test.ts`,
NEW `destination-evidence-schema-fixtures.ts`, and **this report**. Approved I1
technical decision unchanged. No schema, normalizer, renderer, index, contracts,
T017, producer, SQL, Edge or generated-file writes.

**Test-only type contract:** fixtures use
`z.input<typeof accountReviewRowSchema>` and
`z.input<typeof accountReviewSessionSchema>` plus existing canonical
`AccountReviewAccountEvidence`/`AccountReviewAssignment`/`AccountReviewCurrency`
and the checked-in synthetic T009 source evidence helpers. This keeps an omitted
legacy input valid after the proposed `.nullable().default(null)` addition,
while assertions use Jest `toHaveProperty("toAccountEvidence", ...)` rather than
accessing a nonexistent output member before canonical source publication. No
copied DTO, casts, mock SUT or permissive assertion.

**Authored coverage:** 22 ordinary `it` cases plus 3 `it.each` matrices = **30
expanded cases**. Verify Voice, non-ATM SMS and ATM **omitted → parsed own null
property**, explicit null, full session output, malformed/empty-spanned object
rejection at the destination proof issue path; Voice/non-ATM proof forbidden,
contextual ATM forbidden, ATM explicit known Cash matched/unmatched and
canonical absent vs null vs uncertain distinguished, hard review reasons
persist, `toAssignment` remains independent and never inferred from legacy
`transaction.toAccountId`. Preserve existing distinct source/destination and
accepted-currency checks, unconfirmed-currency no-choice,
amount/category/financial snapshot, owner/session, overrides, selection,
revisions, group/save intent; confirm no proof is smuggled into `transaction`
fields.

**Red and ownership boundary:** the current canonical `commonReviewRow` does not
define `toAccountEvidence`, so legacy parsed-output property assertions and
valid ATM explicit/null proof must **fail** on the existing source. Root must
execute and record the **actual** Red, scoped strict TypeScript and Prettier
file/function limits (<900/<50); do not claim test Green here. This schema-only
suite **cannot** prove model evidence matches the admitted SMS body/sender,
candidate ownership, producer sanitization, destination default choice or
cloud/action tuple/log exclusion; those must have separately granted
T014-P/T014-M/T019/T028/writer tests after the minimal canonical field grant.
Preserve prior 65 canonical schema cases, root-reported 103
normalization/identity/schema cases and 19 Edge Node parity cases; do not weaken
existing tests. **STOP / RELEASE / FROZEN pending Root Red and separate
canonical source/contract lease.**

## I1 canonical source checkpoint — minimal local proof (Root Green pending)

**Lease:** `codex/395-core-worker@2f4b7c50cfa66b7bd2891cf0a413141f09795047`.
Root's actual **30 I1 schema test scenarios: 25 FAIL / 5 PASS** on the prior
canonical schema are an accepted creation Red (missing required-null parsed
property and forbidden destination-proof paths); no module load failure. This
author has **not executed** tests, TypeScript, Prettier, provider calls or
generation and claims no Green for this source.

**Minimal implementation:** only
`packages/logic/src/account-review/review-schemas.ts::commonReviewRow` gains
`toAccountEvidence: accountReviewAccountEvidenceSchema.nullable().default(null)`.
This makes missing **input** compatible with older local snapshots but gives
every parsed **output** a required null-or-canonical-proof field. Cohesive
`validateDestinationEvidence` helper preserves existing
`validateReviewDestination` currency/distinct-endpoint rules and adds only:
reject non-null proof for Voice/non-ATM SMS, reject Voice-only contextual proof
for ATM SMS. ATM explicit/absent/uncertain preserve canonical account evidence
independently of choice; no legacy accountId authorization or provider wire
change.

**Type compatibility:** the two existing typed direct row literals in
`__tests__/schema-integrity.test.ts` and the shared typed source in
`__tests__/resolution-fixtures.ts` receive explicit `toAccountEvidence:null`
without removing any assertions. T009 `__tests__/fixtures.ts` remains unchanged
because it produces provider/financial fixtures, not an output
`AccountReviewRow`. New I1 schema/fixture tests remain byte-identical. No
additions to `ParsedSmsTransaction`, `AccountReviewSession` root, standalone
provider contracts, clouds, SQL, UI or action payload.

**Minimal normative reconciliation:** `contracts/wire-shapes.md` local Row
metadata; `parser-evidence.md` independent destination provenance, invalid
sanitized uncertain+hard reason (producer-owned); `review-commands.md`
explicit/uncertain destination never default versus real absence and known
matching currency. No B1 product-rule change. The normalizer producer still
exclusively owns `normalization-evidence.ts` and `normalization.ts::prepareRow`;
its future canonical output row must add `toAccountEvidence` and preserve or
sanitize independently, with dedicated tests before integration. This Core
worker has not modified those paths, even if its successor branch temporarily
develops TypeScript errors due to required output.

**Root integration gates:** mechanical reformat and regenerate all 3 Edge files
(canonical `review-schemas.ts` byte hash changes even when provider runtime
graph remains unchanged); actual 30 I1 scenarios, 65 canonical-schema
regressions, the normalization/identity suite (Root's earlier combined 103
included those 65), and 19 Edge Node tests, typecheck logic/mobile, Deno
transitive check, static import/privacy and formatter limits (<900 per formatted
file / <50 function). Record actual results, do not infer PASS from GitHub
blobs. No hand-edit generated output or suppress/relax compiler. **STOP / SOURCE
OWNERSHIP RELEASED / FROZEN.**

## I1 formatter-only existing schema-test return annotation (Root lint follow-up)

Root's actual combined Core `2b92fe08` + producer `0c4e03c1` batch: **142/142
logic PASS**, strict logic+mobile TypeScript **0 errors**, 19/19 Edge Node PASS,
source file/function size PASS. Root separately identified one existing new I1
test helper at **formatted line 26** lacking an explicit return type
(`@typescript-eslint/explicit-function-return-type`). This narrow test-only
correction changes `function parseRow(input:unknown)` to
`function parseRow(input:unknown):AccountReviewRow` and adds the exact canonical
`type AccountReviewRow` import, preserving **all 30 expanded I1 cases**, all 85
`expect()` calls, error-path checks and canonical source. No suppression/cast,
production generator or extra test fixture update; no new behavior Green is
claimed. Root reruns scoped lint/formatter and appropriate I1 batch. Actual
Deno/canonical generated-parity completion remains independently Root-owned.
**STOP / FROZEN.**
