# T046 creation-default regressions — source correction handoff

**Status:** Bounded TypeScript/style correction AUTHORING COMPLETE, NOT EXECUTED
by this worker. Root previously confirmed meaningful Red (88 pass / 11 fail),
then independently reported a coherent 272 PASS / 0 FAIL across 11 financial and
legacy suites (including all 32 new regressions) and lint 0. These are **Root's
prior verification results on the preceding production packet**, not execution
or Green certification of this mechanical follow-up. Strict TypeScript flagged
two readonly tuple fixture returns in this lane and one unrelated future
`../candidates` module in a separate lane. Root owns subsequent type/style
verification, independent financial review and source acceptance. User/source scope
is approved repository code, reconciled #395 contracts and synthetic fixture
identifiers only.

## Immutable inputs

- Governing `main`: `de09f76bdadb570c99a1015bbf1c680279b0d5ad`.
- Source packet: `395-financial-current-source.zip`, SHA256
  `6b6a4762904a03620787629931bb193d0dcfd852dbf6998b04b696c10136ce89`,
  supplied main state `71b1804d230ce1cbed043490d84453c1a6cd3849`.
  Its complete 13-path SHA256 inventory is retained in the delivery manifest;
  no source file was modified.
- Approved post-reconciliation docs: `contracts/wire-shapes.md`,
  `contracts/financial-save.md`, `contracts/review-commands.md`,
  `contracts/account-default-intent.md`, `data-model.md`, `plan.md`, `tasks.md`,
  and `docs/business/business-decisions.md` from the accepted CURRENT docs packet.
  T016 and the canonical Speckit plan remain independently gated.
- Existing synthetic evidence is reused from `review-batch-save-fixtures.ts` and
  `review-batch-save-regression-fixtures.ts`. Existing 68 review-save cases keep
  their assertions except the superseded root key/ungrouped ATM positive;
  the earlier 240-case broad baseline remains independently gated.

## T046 authorized correction boundary

Pure production changes are confined to the strict review wire, effect/default
checks, source/child/group integrity and optional-root canonicalization. No
global registry, old action validator, runtime, schema, SQL, sync or app code
was edited. Existing fixture/suite changes are mechanical to the reconciled
unshipped review tuple; no compatibility alias for `cashDefaultSnapshot`.

1. `packages/logic/src/financial-actions/__tests__/review-batch-save-creation-default-fixtures.ts`
   — bounded fixture builder over frozen synthetic actual UUIDs, with complete
   account/transaction creates and BANK's owned `bank_details` child; selected
   refs, confirmed groups, sorted creates/guards, exact effects, zero openings
   and root envelope.
2. `packages/logic/src/financial-actions/__tests__/review-batch-save-creation-default.test.ts`
   — real strict payload/schema and explicit opt-in registry/envelope acceptance
   and rejection tests; no `any`/cast/SUT mock, provider, DB or native dependency.
3. This validation note.

## Case inventory (32 Jest cases, including parameterized expansions)

| Area | Cases | Expected assertion and discriminating fixture |
| --- | ---: | --- |
| Positive schema/envelope controls | 12 | Existing-only Voice zero-net unchanged; independent confirmed EGP/USD Voice Cash together with exact `+2001`/`-3500` account effects, sorted IDs/guards/groups, opening `"0"` and target null; permutations preserve minimum actual frozen create UUID (not group, input or currency order); mixed Cash/Bank/Wallet first-active with Bank, Wallet and Cash each winning in separate vectors; each singleton type first default; nonempty active set with existing default or intentionally null makes **all** created flags false; existing eligible ATM Cash destination remains valid |
| Closed snapshot cardinality | 10 | Missing `creationDefaultSnapshot` on each Cash/Bank/Wallet create; old `cashDefaultSnapshot` alone and together with new key rejected; unexpected snapshot without any create; unsorted/duplicate active IDs; dangling default UUID; created ID already active; extra metadata key or `isDefault: false` snapshot member rejected |
| First-active default negatives | 6 | Empty set: duplicate defaults, missing default, or wrong group/currency-first default rejected; nonempty existing/default-null: unexpected new default rejected; single first-active Bank/Wallet must not be false |
| Compatibility and source proof | 3 | Invented ungrouped ATM Cash destination rejected; incorrect signed minor-unit effect rejected; old v1 tuple remains accepted unchanged and old zero effects remain prohibited |
| Mandatory BANK child | 1 | Positive reviewed BANK has exactly one bank-details child; the otherwise complete create without that child fails for the explicit missing-child reason |
| **Total** | **32** | Scope is pure validation only; no DB-current-state oracle or writer-side CAS prediction |

A negative test is paired with an independently valid synthetic **positive
control** for the corresponding source/type/selection pattern. The extra
synthetic accounts reuse the canonical financial and account create record
shapes from existing fixture data; the helper never invents a new persisted
wire field. Every planned account is tied to a distinct selected row and
confirmed group (except intentionally forbidden ungrouped ATM creation).
`creationDefaultSnapshot` is a **single closed top-level field** only when
one or more accounts are created; `expectedDefaultSnapshot` is exclusively
Add's separate untouched tuple. No review default-clear mutation appears.

## Root Green checkpoint and pending TypeScript/style verification

The earlier 88 PASS / 11 FAIL focused Red led to the prior pure production
correction. Root's coherent follow-up financial/legacy batch reported
**272 PASS / 0 FAIL across 11 suites**, including all 32 newly authored
regressions; Root also reported **lint 0**. This was a real Root-run subset
and supersedes the initial focused Red, but does **not** prove an additional
240-case rerun or this follow-up's typecheck/peer acceptance.

The present follow-up fixes two strict TypeScript errors caused by the frozen
`as const` SMS fixture's readonly `creationDefaultSnapshot.activeAccountIds`:
`mutableSmsSource` and `singleSelectedNewBankPayload` now copy the creation
snapshot and its active-ID array into a fresh mutable fixture object without
casts or changed values. `validateCreatedAccountBalances` delegates the complete
captured-default logic to one small pure `validateCreationDefaultSnapshot`
helper, preserving the same closed-field presence, sortedness, default-membership,
create/active disjointness, first-create ordering, error reasons and signatures.
Each touched production function is kept within the post-Prettier 50-line
style boundary. No other financial or legacy operation is changed.

All 32 existing new regressions, including the mandatory BANK-child negative,
remain unedited by this follow-up. **No worker-side tests, typecheck or lint
have been run against these three replacements.** Root must rerun one coherent
batch after the peer review/repair gate and verify no new failures.

Suggested focused Root execution **after** this return (NOT RUN here):

```sh
npx jest --config packages/logic/jest.config.js review-batch-save-creation-default --runInBand
```

Actual Jest invocation and environment should be chosen by Root's existing
project commands; the command above is advisory, not execution evidence.
Root already recorded meaningful Red and the subsequent 272-case Green
checkpoint on the prior packet. This narrow follow-up still requires its
coherent type/style gate and independent review before acceptance.

## Explicit limits and downstream tests

- Exact active-owner state freshness, source/category/financial revision checks,
  hard account-ID absent/foreign collisions, owner lock, serialization,
  reconciliation and stale-state compare-and-swap require subsequent
  **writer/SQL/pgTAP** tests. These pure tests validate only consistency **inside
  the captured snapshot**, not current database facts.
- Current ATM acceptance requires a real eligible existing Cash destination;
  an invented ungrouped Cash create remains forbidden. Evidence-driven
  `toAccountEvidence` choice and genuine already-canonical `toAssignment`
  linkage belong to separately owned resolver/writer verification; no fake
  `groupId` or additional field is invented to make the negative pass.
- Hash/idempotent replay is retained in the existing real foundation and
  previous suites; this suite uses canonical envelope serialization but does
  not fabricate server responses, hashes, clocks, replay or sync outcomes.
- Legacy v1 tuple/effect validation remains untouched. The new tuple requires
  one `creationDefaultSnapshot` iff any account is created; minimum actual
  account-create UUID becomes default only if captured owned active set is
  empty. Every created account requires a confirmed group; the pure layer
  cannot prove that a supplied group is genuine/current without writer checks.
- No tests, typechecks, lints, SQL, hosted or device checks were executed by
  this worker during this follow-up. Root's preceding 272 PASS / 0 FAIL and lint 0
  are reported provenance, not verification of these updated bytes.

**Handoff:** The follow-up packet contains only the changed fixture, pure
effects module and this report, with baselines taken from the **prior production
ZIP's `source/` bytes** (not the older 71b or initial tests-only packet), full
SHA256 baseline/replacement digests, and a unified patch. Root independently
executes coherent validation and controls any subsequent lease. Other source
files, existing tests and the registry remain untouched.
