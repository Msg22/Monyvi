# Implementation Plan: Shared account review for Voice and SMS

**Branch**: `codex/395-shared-account-review` | **Date**: 2026-10-14 | **Spec**:
[spec.md](spec.md) **Input**: `specs/395-shared-account-review/spec.md`;
approved revision
`sha256:e012f5a7d2edadc8bc1e2fa2ce03aeea56bc0c947dc02bfc2a3f166150e2c7d0`.
**Historical planning base**:
`origin/main@7838df64eb9b3828c6e8f1a02f590b008d5435fd`. **Execution status
(2026-10-16)**: full local implementation is authorized; accepted slices,
governing pins and remaining gates are recorded in
[workflow-status.md](workflow-status.md). Digest amendment reanalysis and its
tests-first gate are recorded separately.

**Documentation reconciliation (2026-10-17):** preserve the current Main
planning/business snapshot at `64f0ef48640ecbe51979030151fa78141778bcf9`;
restore only the approved T030/T054 transaction-edit technical additions from
`82956da878f778622428a7ee6739f1729681d9a3` and
`0ce3ea24dee023ec5eb72b7e507b519fc725dfd8`. Historical proposal, missing-source
and pre-T016 paragraphs below record their original gates, not today's source
inventory or a new lease. The immutable task ledger remains 80 IDs / 32 accepted
entries; no checkbox or workflow-status change is made here. Trusted governance
remains `c02a773613f9b6ebc5ca01aae02dd41863fd0e90` plus the separately approved
Constitution 1.8.0 policy, not mutable worker output. See
[final coverage handoff](validation/final-coverage-handoff.md) for current
Root-reported batches, authored deterministic/E2E evidence and unresolved gates.

## Superseding first-release delivery boundary — 2026-10-17

The human-approved **first release** ships only the approved B1/design and
Voice/SMS/Add functionality plus **basic owner-scoped atomic Save,
rollback/idempotent retry, fingerprint deduplication and safe sync**. See the
[controlling first-release scope and gates](validation/first-release-scope.md).
Missing, rejected or ambiguous remote outcomes must preserve original local
records, private evidence and dirty/pending flags; never invent an ACK,
automatic compensation, historical rewrite or deletion to make sync look
successful.

Complex Add compensation carriers, financial-successor chain reconstruction and
elaborate rejected-Add/history recovery are **deferred advanced work**, not
first-release blockers. The later T069, SQL/SDK/recovery and validation analysis
in this plan remains historical future technical design, **not** permission to
weaken currently implemented safety guards or evidence. The approved spec, B1,
all 80 existing task IDs and their checkbox truth are unchanged. No source
Green, device proof, hosted deployment or completion is asserted by this scope
amendment.

## Summary

Use one pure account-review engine with Voice/SMS source adapters, keeping the
existing transaction shell, account fields and CurrencyPicker. Distinguish
missing account evidence from unmatched explicit evidence, and omitted currency
from ambiguity. Accept eligible defaults, validate shared draft groups, and
separate confirmation from selection. SMS persists versioned review state in
existing local payloads; Voice keeps session state only. Approved T054 technical
reconciliation adds the canonical guarded `set_filter` revision-only transition,
a backward-compatible device-only SMS V2 header `filter`, and the existing pure
projection as a shaped facade `readModel`. No UI shadow authority, no
SQL/provider/schema changes. Gemini Voice and configured DeepInfra SMS return
advisory evidence/groups in the original request; no extra review-time provider
call.

The approved `edit_row_transaction` addition preserves the existing SMS/Voice
editing surface through that same canonical reducer, owned SMS writer and Voice
in-memory adapter. It is annotated under existing T030/T054 below; it adds no
parallel account writer, provider call, durable Voice state or task ID.

Save selected rows through one revision-guarded financial action containing
selected account creation, financial records and local SMS cleanup. The current
legacy batch writer is not a compliant foundation for new behavior. A scoped
financial-action payload/SQL registration and sync/reconciliation extension is
required. No SQL, hosted mutation, provider call or production code is executed
by this plan.

## Technical Context

**Language/Version**: TypeScript ~5.9.2 strict; Node engine >=22 <23; existing
Edge Deno runtime. **Primary Dependencies**: Expo ~55.0.27, React19.2.0, React
Native0.83.6, WatermelonDB ^0.28.0, NativeWind4.2.6, Zod4, Reanimated4.2.1, Expo
Router, existing Supabase client/financial-action foundation. No new runtime
dependency. The accepted development-only type restoration adds
@types/react-test-renderer19.1.0. **Storage**: WatermelonDB accounts/financial
records and existing SMS draft JSON; Supabase PostgreSQL background
financial-action CAS. No cloud review table or durable Voice session. Rejected
review Save recovery uses the separately specified nullable device-only
Watermelon root carrier and migration31 (see `contracts/local-recovery.md` and
the T069 additive section below). The original reservation has source
candidates; that does not establish final pull/privacy/recovery acceptance. No
Supabase column/type or public financial action key is added. **Testing**:
Jest/RNTL, pure logic/provider contract tests, pgTAP and authored Maestro
fixture journeys. No emulator execution; device/visual QA owner-run. **Target
Platform**: Existing managed Android/iOS app; SMS capture Android-only.
**Project Type**: Offline-first mobile monorepo plus Edge Functions.
**Performance Goals**: Zero additional parsing requests from review; batched
owned account read and indexed O(rows + groups + accounts) ordinary resolution;
one local selected-save transaction; memoized rows and FlatList. Measure
synthetic 500-row/100-group actions and report median/p95 without presenting
unit timings as device evidence. No new sleeps or provider retries.
**Constraints**: B1 exact bindings; original spec/image bytes unchanged; no
account default before currency certainty; no name-only identity merge; exact
amounts/minor units; idempotent financial writes; SMS safeguards/privacy
unchanged. Review creation has one closed `creationDefaultSnapshot` iff any new
Cash/Bank/Wallet account, with the first active account in frozen actual UUID
order default and existing/no default unchanged when active accounts already
exist; compatible multi-currency Voice Cash groups remain independent. Current
ATM cannot invent a Cash destination. **Scale/Scope**: Six journeys,24
requirements,23 scoped references: engine, parser/source adapters, SMS durable
group edits, UI, Add/Edit helper/default intent, and selected-save integration.
Recorder/#391/live-SMS confirmation/#393 excluded.

## Constitution Check

| Gate                              | Before research             | Post-design evidence / implementation condition                                                                                                                                                                                                                                |
| --------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I/VIII local-first and ownership  | Required                    | Scoped repositories, atomic local group edits/save, background CAS; no network-dependent local review                                                                                                                                                                          |
| I grouped financial actions       | Current save gap identified | Strict complete batch registration planned; never split new accounts/transactions across actions or reuse unguarded balance writes                                                                                                                                             |
| II documented business rules      | Spec approved               | Approved target decision entry distinguishes pending implementation from existing runtime                                                                                                                                                                                      |
| III runtime/strict types          | Required                    | Logic-owned Zod contract with generated Edge/provider projections; unknown validation, null IDs, canonical domain exports                                                                                                                                                      |
| IV/VI layer boundaries            | Required                    | Pure resolver/reducer in logic; service reads/writes; lifecycle hooks; shaped presentation props                                                                                                                                                                               |
| V visual authority                | Passed before plan          | B1 owner receipt and all23 canonical binding verifier passes; CurrencyPicker exception retained                                                                                                                                                                                |
| V visual/accessibility completion | Required later              | Layout/semantics tests plus owner-rendered baseline/variant evidence; no visual-completion claim without evidence                                                                                                                                                              |
| VII migration                     | Reviewed 1.8.0 exception    | Server-owned SQL 090/091 stays sequential local SQL; private root recovery uses versioned Watermelon-only migration31, durable generator override, no dummy Supabase field; local parity/pull/privacy tests before source acceptance; hosted deployment still separately gated |
| Financial arithmetic              | Required                    | Shared Decimal primitive, canonical strings/minor units, once-only effects; no inferred bank opening balance                                                                                                                                                                   |
| TDD and coverage                  | Required later              | M01–M20 mapped; tests first, meaningful Red before production; batched integration checks, no emulator                                                                                                                                                                         |

This is **no silent constitutional waiver**: the separately reviewed
Constitution VII **1.8.0** device-only exception
(`dd16d5440556b651cb5b6395a00c1c4d37538dcf`) authorizes the technical migration
classification, but is not merged into Main by this feature contract.
Server-owned SQL rules, existing owner/CAS/RLS guards and separate deployment
approval still apply. Planning does not implement the private field/generator,
or claim runtime/hosted support.

## Project Structure

### Documentation

```text
specs/395-shared-account-review/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
   ├── contracts/{parser-evidence,review-commands,financial-save,account-default-intent}.md
├── approvals/
├── mockups/                 # approved images and exact scoped sidecars
├── manual-test-plan.md
└── tasks.md                 # existing 80-ID acceptance ledger; Root-owned
```

### Source code — modules within existing layers; acceptance separately gated

```text
packages/logic/src/account-review/      # schemas/evidence/identity/resolver/reducer
packages/logic/src/sms-review-drafts/   # existing codec: v1 reader + v2 projection
packages/logic/src/financial-actions/  # new strict batch registration
apps/mobile/services/                  # account read model; review commands/adapters;
                                       # selected-save action writer
apps/mobile/hooks/                     # review facade and account-form intent
apps/mobile/components/transaction-review/         # existing shell, new panel/sheets
apps/mobile/components/currency/CurrencyPicker.tsx  # existing picker, additive context/null
apps/mobile/app/(private)/voice-review.tsx          # validated session boundary
apps/mobile/app/(private)/add-account.tsx           # existing pattern + default intent
apps/mobile/app/(private)/edit-account.tsx          # approved helper only
supabase/functions/parse-voice/         # original-request evidence output
supabase/functions/_shared/sms-ai/      # configured provider evidence output
supabase/migrations/090_shared_account_review_save.sql    # actual Review basename; local only
supabase/migrations/091_account_create_default.sql        # actual Add basename; local only
supabase/tests/                        # CAS/validation/privacy/rollback
apps/mobile/__tests__/                 # service/hook/UI/regression coverage
apps/mobile/e2e/maestro/                # authored deterministic journeys
```

The historical `090_review_batch_save.sql` and
`091_account_create_default_intent.sql` reservations refer to these same 090/091
roles, not additional migrations. No rename, renumber, duplicate SQL file or
public signature change is authorized by this documentation correction.

**Structure Decision**: Small cohesive modules, no new app/parallel modal.
`packages/db` owns persisted data only. Dedicated batch adapter extends the
financial foundation without weakening its existing strict v1 payload.

## Phase 0 — Research

[research.md](research.md) resolves technical decisions from current source and
primary provider guidance. No unanswered product question remains. New contract
versions are design proposals, not tested hosted capabilities. No live-model
probe was run; fixtures precede implementation, authorized real-model evaluation
remains a separate validation boundary.

## Phase 1 — Design and contracts

- [Data model](data-model.md): stable row/evidence/assignment/group identity,
  durable SMS v2, operation generations and stable save intent.
- [Parser evidence](contracts/parser-evidence.md): original-request v2
  extension, reference/evidence grounding, provider projections and
  compatibility.
- [Review commands](contracts/review-commands.md): immutable scoped transitions,
  revalidation, selection/Undo and approved UI behavior, including guarded
  `set_filter`/durable SMS filter headers and Undo-preserving revision CAS, plus
  approved source-specific `edit_row_transaction` preservation.
- [Financial save](contracts/financial-save.md): complete action, zero-net,
  `creationDefaultSnapshot` for all new account types, multi-Cash, default CAS,
  T043 frozen IDs/ATM bounds and SQL/sync/rejection implementation boundary.
- [Private local recovery](contracts/local-recovery.md): unshipped strict
  nine-key snapshot, migration31/generator ownership, prepared-postimage
  capture, queue lifecycle/30-day redaction, owned pull preservation and
  predecessor action ordering; no public wire change.
- [Quickstart](quickstart.md): reproduction/checks/manual boundaries.
- [Account default intent](contracts/account-default-intent.md): atomic
  first/later account creation/default/children/opening balance, including
  zero-balance support.
- Frozen B1 manifest/common-contract/copy headers retain original proposal
  status; authoritative approval receipts and verified sidecars supersede those
  headers.

## Phase 2 — Dependency waves

These are planning slices, not assignments/canonical task IDs. Speckit tasks and
analyze must reconcile coverage/contracts before the lead maps owners or
dispatches.

1. Canonical schemas/fixtures/projections and review engine tests.
2. Parallel after contract freeze: provider/source adapters; separately gated
   side-effect-free pure resolver/financial validators; SMS v2 persistence,
   financial-action SQL/save tests (090 review, 091 Add); UI fixtures/tests.
3. Engine/persistence/parser integration before route wiring. T027 canonical
   filter/revision reducer + T029 atomic V2 codec/header service must be
   reconciled before T030 facade's authenticated `readModel`; only then may
   T054/T061 bind controlled filter/ready toolbar to the shared shell. Add/Edit
   default intent can overlap review UI with distinct files; one owner for
   shared hooks/shell.
4. Complete action validation/sync/reconciliation before selected-save wiring.
5. Independent review/coverage audit, one integration check batch, owner device
   validation, commit/push/PR update.

**Narrow pure-work readiness (historical dependency reconciliation only):**
Accepted canonical T004/T009–T011 schemas, generated Edge parity, owned account
context and pure T014-P source normalization allow T017 resolver tests to
demonstrate meaningful Red before side-effect-free T019. Pure T046 payload
validation and registry declarations may proceed only after T042 Red, the frozen
T004 financial contract and an unchanged legacy financial-action regression
baseline. Before further T046 source acceptance, reconcile the
multi-Cash/first-active default validator and renamed unshipped snapshot field;
then extend T043–T045 Save/SQL Red for frozen T043 aliases, legitimate Cash
destinations and owner-wide CAS. Pure T027 identity/reducer work requires T019
Green and its own T024 Red. Each production task still requires lead review,
explicit file ownership and test-first authorization; this paragraph grants
none.

**Historical pre-T016 gate:** the original incomplete-foundation restriction
below is not a current status assertion; T016 is accepted in the unchanged task
ledger. Its acceptance does not complete later story integration. The original
foundation gate was mandatory before data/domain/workflow hooks,
route/container/TransactionItem integration, existing shared CurrencyPicker
behavior changes, full SMS queue codec, stateful merge/writer, persistence,
Save, SQL/sync, network wiring or runtime action enablement. Early pure or
isolated presentational code does not bypass that gate. **Conditional identity
prerequisite only:** if Core's queue-namespace plan and Root's read-only
analysis prove a T014-M ↔ T028 identity-capture cycle, the smallest atomic
_owned queue-UUID acquisition/lease helper_ may receive a separate tests-first,
owner-reviewed pre-T016 lease. Its exact API/files are NOT frozen or granted; it
must guard owner isolation, cancellation, empty-queue cleanup, queue replacement
and CAS/generation races, with no new table/column or edited-row renamespace.
This exception does not complete T014-M, T028 or T016 and cannot enable full
queue/runtime integration. SQL implementation/race proofs and local financial
writer retain separate approved Red, scope and owner gates. **Conditional
presentational overlap — dependency proposal only:** After accepted canonical
I1/T019 and its own T018 component Red, T020 may be considered _only_ for
stateless approved B1 default disclosure and Why-sheet presentation. T021
TransactionItem/route integration stays blocked. Later candidates: T031 after
accepted T027 group/reducer types and T026 component Red; T038 view-only
chooser/conflict sheets after accepted T036 candidate/ choice types and T035
component Red; T060 view-only compact panel after accepted T059 read-model
types, T058 component Red, and T020/T031. Those downstream prerequisites are not
claimed ready. T037 modifies existing CurrencyPicker nullable-selection behavior
and remains T016-gated; so do T039 picker delegation and existing-caller
compatibility wiring. Isolated T018/T026/T035/T058 component tests may use
canonical shaped fixtures before T016, not other story Red/integration tests.

The presentation candidates receive shaped props/callbacks only: never DB,
services, reducer, business calculations, provider, data/domain/workflow hooks,
commands, account/review/selection state writes, transactions, routing or Save.
Pure presentation context/i18n/theme/safe-area hooks (for example,
useTranslation, useSafeAreaInsets and useModalBottomInset) and ordinary React
render memo hooks (useMemo/useCallback) remain allowed; none owns
account/review/selection state. A test parent such as T018's
DefaultDisclosureJourney may own modal-visible state and pass controlled
visible/onClose props; the presentational child does not own that state. All 23
frozen B1 bindings, component test contracts, state-to-surface mapping,
tokens/icons, EN/AR copy and accessibility/layout rules remain authoritative.
Missing canonical exported props/callback types or upstream Green **block** a
candidate; never invent types, commands, flows or new copy. Root owns the
dependency decision and must run the existing speckit.analyze before any
separate component lease. This adds no approval gate or production
authorization.

No implementation, test run, SQL mutation or hosted deployment is authorized by
this dependency update. Main `de09f76bdadb570c99a1015bbf1c680279b0d5ad` ends at
`089_historical_metal_rate_request_limits.sql`; the missing 088 prefix is not
available. Review migration reservation is **090**, Add **091**. Preserve
082–085 publication fence and owner-snapshot race-proof gates.

### T054 filter/projection dependency note (2026-10-16)

This is an **approved technical reconciliation / tests-first gate**, not a new
task, new UI behavior, source publication or acceptance. The existing six IDs
T027/T029/T030/T054/T059/T061 retain their historical completion markers.
`set_filter` is the one canonical session transition; it uses review-revision
CAS (including filter ABA) while retaining business `operationGeneration` and
valid Remove Undo across navigation-only revisions. The existing V2 JSON codec
must decode historical nine-header rows as `all` **without mutating their
original bytes** and atomically encode the new tenth `filter` header on all live
SMS rows, with exact owner/header agreement and rollback. Voice stays in-memory.
The facade publishes only the canonical current-owner
`projectAccountReviewSession` result or `null` during missing/stale/failed
reads, never raw provider context or a second UI readiness/count engine.
Tests-first Red and Root-run Speckit analysis remain required before any source
lease. The approved spec/B1/copy/hash and the financial-action DTO/schema are
unchanged. T049 all-dedup unresolved-root lifecycle coordination is separately
held and unaffected.

### T030/T054 transaction-edit preservation reconciliation (2026-10-17)

The approved FR-019 appendix in `contracts/review-commands.md` adds
`edit_row_transaction` to the existing command authority. It preserves SMS
amount/category/counterparty and Voice amount/category/counterparty/note plus
its existing conditional type toggle; date, transcript, source evidence,
provider identity and account/currency choices are not editor-owned. Category
changes use current active accessible owner/system records; amounts use exact
current-currency precision and shared bounds. Material changes increment the
affected row/review/business generation once; no-op and failed commands do not
write or manufacture authority. Existing frozen Save/replay/digest rules remain.

`82956da878f778622428a7ee6739f1729681d9a3` records the tests-first contract;
`eefc68e502c49475195b61ba0eb5f8d8207ddbb6` is the pure command candidate;
`0ce3ea24dee023ec5eb72b7e507b519fc725dfd8` contains later scoped category-hook
and controlled-editor lifecycle work. These are intake pins, not replacement
Main business decisions or evidence that every phase passed final checks.

T030 owns lifecycle/cancellation/current-owner publication, with no hook DB
writer or copied business rules. T054 composes the existing service/reducer and
controlled editor into the source routes; SMS edits use the actual owned V2
writer and Voice edits remain session-only. Current category loading belongs to
the service/hook/container, not the field presentation. Pending dismissal and
late completion stay scoped to the original editor, and unrelated edits must not
require unchanged amounts to become currency-confirmed. All related
pure/SQLite/category/hook/editor suites remain final integration targets. No
T030/T054 or other task checkmark is advanced here.

## Effort and risks

Historical provisional estimate (2026-10-14): full delivery **12–18 elapsed
hours** with safe overlap after tasks, analyze and implementation authorization.
It is not a current promise or remaining-work estimate. The original lanes were
contracts/providers2–3h, engine/SMS3–4h, action/save4–6h, UI/forms3–4h and
review/integration2–3h with overlap. No availability/quota claim.

Risks: old Edge/client combinations; malformed/dangling groups; chunk arrival
changing identity; lost SMS overrides; card/nickname uniqueness; failed-batch
rollback; generic sync leaking action-owned rows; failed default replacement;
runtime font/safe-area differences. Contracts/manual matrix define boundaries.

## Complexity Tracking

No waiver. Legacy v1 rejects the composite account/transaction/transfer/cleanup
shape and all-zero-net batches. Splitting into existing actions violates the
approved atomic selected-batch outcome; the strict new contract is necessary.

## 2026-10-16 — Unshipped replay-integrity reconciliation

The original requirement to reject a changed frozen Save input requires one
required review-only frozenIntentDigest in the existing review.batch-save/v1
payload. Contracts/wire-shapes.md defines the versioned canonical original-input
projection and pure helper API. It binds all original selections, including SMS
dedup omissions, original confirmed-group provenance and complete physical
plans. Only the digest hash enters the cloud payload; the digest itself adds no
table/column, durable Voice review, legacy tuple or Add change. Separate
device-local SMS recovery storage is reconciled below.

T042/T046 reopen for contract tests/schema/helper/generated parity, followed by
T048 first-write digest and historical replay validation and T045/T052 SQL
parity. Existing deployed operations remain exact. Source grants for this
amendment wait for meaningful wire Red and read-only speckit.analyze. T016 and
the accepted T036 remain prerequisites already met; unrelated approved component
work can overlap with exclusive ownership.

creationDefaultSnapshot presence is still determined by actual new account
creates after deduplication. The original full member plan can contain omitted
groups without forcing a synthetic snapshot. Digest computation takes the
captured snapshot or absence and replay reuses that stored historical value; the
closed payload validator independently enforces actual-create presence.

## 2026-10-16 — Reviewed private recovery carrier; historical intake gate

[Local recovery](contracts/local-recovery.md) reconciles the originally verified
**missing** `FinancialActionGroup` private snapshot field and
`FinancialActionLinkedOperationPlan` snapshot-builder seam. The proposed strict
nine-key `account-review-local-save/v1` includes `queuePreimage`, available vs
expired/superseded SMS entry variants, actual prepared-postimage hashes, and
distinct sorted `defaultDependencyActionIds`. Queue `pruned_empty` recreation is
allowed only with exact positive lifecycle proof; discard/reset/expiry and later
owned namespaces invalidate restoration. Each SMS draft redacts raw data at its
own inclusive 30-day `parsedAt` cutoff.

Reserve local Watermelon migration31, a nullable root column, non-generated
model property and generator-owned local override. T053 must prove repeatable
`db:sync-local` output and preservation of private evidence across authenticated
cloud pull, plus zero private data in push/RPC/outbox/logs. The public review
`frozenIntentDigest` (original intent) and root `payloadHash` (canonical action
envelope) remain unchanged opaque wire hashes, not recovery storage. No raw
durable Voice transcript/session.

Under the reviewed Constitution VII 1.8.0 exception, the **device-only**
migration introduces no Supabase column/table/type or dummy SQL; server-owned
090/091 registration and owner-wide CAS/RLS remain independent.
`npm run db:migrate` invokes `db:push`, so it does not authorize local-only
generation or hosted deployment. The original 80 task IDs provide T043/T044 Red,
T048 local atomic capture, T049 SMS lifecycle, T050 private sync
exclusion/dependency, T051 once-only restart reconciliation, T053 generator/pull
parity and T074 regression acceptance. These are planned responsibilities, not
completed checks. Fresh read-only Speckit analysis and applicable Red evidence
must precede the separately authorized storage source grant; other workers own
the hook/Undo/SQL lanes and B1 is unchanged.

## T069 Add recovery reconciliation and dependency annotations — 2026-10-16

Current technical context for this additive packet is docs
`3f0d4279d543ed58dd7bc2d83abbeeea8011953c`, mobile
`58acc73646426dcd5535f4b1885dd826d7747f2e`, T069 report/tests
`c7f05dcb94a440b2437494a7927d2fb21dbfe902`, and SQL
`f4ba7ccc22244cf3672c1a14a09132ed0d23e318`. Earlier absent-storage prose is
historical: reuse the existing local-only carrier/migration31. No new schema
version, column, public Add request or Review snapshot field is needed.

Root's selected authority is an Add-only immutable `canonicalDefaultSnapshot` in
stale/rejected outcomes, captured after business rollback under existing owner
serialization. It is NOT the T069 gap report's proposed fresh generic pull. The
existing Add contract owns this narrow outcome amendment to the common wire
rules; `local-recovery.md` owns the distinct twelve-key Add private snapshot,
exact guarded correction, dirty-state suppression and cleanup. The report
`validation/t069-recovery-contract-reconciliation.md` records the source
boundaries and unproved cases.

The following are annotations to **existing task IDs**, not new tasks, source
leases or checkbox changes. `tasks.md` and `workflow-status.md` are
intentionally byte-identical in this packet so Root can merge against its newer
ledger.

| Existing ID | Add-specific dependency / coverage annotation                                                                                                                                                                                                                                                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T043        | Retain original Review/linked-builder rollback tests; add cross-version private-union rejection, actual cached/prepared image binding, same-batch failure/cache rollback and fresh SQLite restart. It is shared foundation evidence, not ownership of Add business source.                                                                                             |
| T049        | Serialize the existing shared capture seam with Add's builder admission. Review queue prune/discard/expiry/all-dedup behavior must remain exact; Add has no SMS lifecycle data. No competing edits to shared capture helpers.                                                                                                                                          |
| T050        | Admit legitimate zero-guard Add only after complete tuple/create/child/effect validation; retain protected IDs on incomplete groups. Prove durable predecessor ordering and zero generic exports of correction default flags, tombstones or balances, including later sync and stale ACK races.                                                                        |
| T053        | Reuse carrier/migration31 unchanged. Extend actual owned root pull/application proof to Add, preserving unresolved private bytes and local completion state, remote-ID remapping and accepted/dependent cleanup obligations. No new generation or Supabase field merely to carry Add JSON.                                                                             |
| T064        | Own canonical private/outcome parsing and Add prepare/capture negative/positive fixtures: zero/nonzero opening, null prior/effect semantics, full prepared membership, malformed binding and immutable dependency/hash replay. Coordinate T067/T068 capture source only after applicable Red and shared seam release.                                                  |
| T069        | Dedicated Add atomic rejection verifier/writer and SQL091 outcome extension after the new receipt/capture contract is analyzed and meaningful Red exists; A08 success requires real canonical default authority. Preserve newer-choice/child/owner/dependency refusals, all-or-nothing correction, protected dirty-state preservation and accepted/idempotent cleanup. |

T066 supplies the existing Add SQL fixture/race lane, T051 the existing Review
recovery integration compatibility boundary, and T074 final regressions; none is
completed or reassigned by these annotations. Preserve all original task IDs,
prior acceptance markers and independent UI/provider scopes.

After Root merges this documentation, run fresh read-only `speckit.analyze`,
repair fixture-only canonical JSON/state admission without relaxing production,
and obtain meaningful Red for the newly specified authority and suppression
before granting source. Pure Add schemas/capture, dedicated Add recovery,
protected sync/pull and Add-only SQL can be separate file-owned lanes; shared
foundation/dispatch/export/outcome wiring has one integration owner. SQL091 must
wait for the current two-regex/cross-owner-veto repair lease to be released. No
concurrent edits to that worker's SQL are authorized here. The exact proposed
paths are in the report, not an automatic grant.

No runtime checks, commands, SQL, source changes, deployment, refs, pushes, PR
edits, provider calls or native workers were performed by this document author.
The only publication is a changed-only unreferenced GitData documentation
commit; Root owns integration and all subsequent source/test acceptance.

## T069 pinned Watermelon sync writer/ACK admission — 2026-10-16

Protected Add/Review sync requires a narrow **installed WatermelonDB 0.28.0**
extension before protected current-owner/membership admission can occur inside
the actual remote-application writer and the independent local ACK writer. Push
filtering and the existing `onWillApplyRemoteChanges` hook are insufficient: the
latter runs **outside** the application writer, and stock ACK can clear captured
created/updated rows or destroy captured deleted IDs.

Tests-first technical evidence and exact signatures are in
[t069-watermelon-sync-hooks.md](validation/t069-watermelon-sync-hooks.md); the
real SQLite SDK integration test is
`apps/mobile/__tests__/services/sync/account-sync-sdk-hooks.sqlite.integration.test.ts`.
The source snapshots/manifest at `.tmp/395-sdk-sync-inputs/` are immutable
context only: package version 0.28.0, installed/Main-versus-verification
postinstall hashes identical. They include CJS and Flow/Metro index,
applyRemote/markAsSynced implementations, and `sync/index.d.ts` (not
`src/sync/index.d.ts`). At the original tests-only pin the actual CJS/Flow
`impl/synchronize.js` inputs were missing; the later immutable
`e9f4af9adf506d8c04b51e2d24c18e4ce5c6da05` input packet supplied both. That
historical input gap is not a claim that the subsequently authored patch was
installed or verified by this document author. Current Root-reported SDK
execution is recorded separately in the final coverage handoff.

The approved optional hooks, using the SDK's exported `SyncDatabaseChangeSet`
and `SyncRejectedIds` types, are:

- `beforeApplyRemoteChangesInWriter(changes): Promise<SyncDatabaseChangeSet>`:
  after stock reset/checkpoint admission, before remote preparation/application;
  returned replacement data must be validated and a throw prevents apply.
- `beforePullCheckpointInWriter(): Promise<void>`: after real remote
  application, before pull checkpoint; rejection prevents a false checkpoint but
  does **not** promise to roll back an already committed adapter batch.
- `beforeMarkLocalChangesAsSyncedInWriter(changes, priorRejectedIds): Promise<SyncRejectedIds>`:
  inside original ACK writer before _both_ created/updated selection and
  deleted-ID destruction; combine rejections by additive table-wise union and
  preserve stock raw-equality/reset checks.

Both CJS and Flow/Metro paths, plus the real TS declaration, must export the
same typed version/capability literal
`monyvi/watermelon-sync-writer-guards/0.28.0/v1`; separately owned protected
sync must fail closed on missing/mismatched capability. Hooks absent must remain
exactly stock behavior. The extension is a strictly content/version- pinned,
preflight-atomic, idempotent invocation from existing `scripts/postinstall.js`,
not a package upgrade, new dependency, native change, replacement engine or
DB.write monkeypatch. `pullChanges` and `pushChanges` network awaits remain
**outside** DB writers; callback bodies stay local/bounded. Unsupported modes
must not silently bypass protection.

SDK hook availability is a T069 protected-sync implementation dependency, not an
Add-private snapshot, correction or garbage-collection policy. The Root retains
Speckit reanalysis, meaningful Red and subsequent source grant. This
test/document amendment runs no checks and creates no production patch, refs,
pushes or PR changes.

## T069 rejected Add compensation completion — bounded implementation gating (2026-10-17)

This is an existing T069 **technical** substep, not a new task, business choice,
independent change to SQL091 or an implementation/source grant. Original
reviewed B1, immutable account/default command snapshots, 12-key Add/private and
nine-key Review schemas, complete original creator provenance, default CAS,
financial effects and all original 80 task IDs and 32 execution checkboxes
remain unchanged. The current pinned integration parent for this proposed
documentation is `bd2457d7d3d24aed8f595c0c355cd7658bca8ff8`. At that parent,
root pull already recognizes Add, retains local private bytes and performs
review receipt checks; do NOT replace or duplicate those current corrections. It
only needs to admit a rigorously validated new terminal private encoding.

The accepted direction and exact additive technical fields, byte limits,
owner/receipt/root digests, reader obligations and failure matrix are in
[local-recovery.md](contracts/local-recovery.md#t069-terminal-add-compensation-liveness--bounded-technical-amendment-2026-10-17)
and
[t069-compensation-completion-contract.md](validation/t069-compensation-completion-contract.md).
The historical positive restoration and complete B losing-member compensation
must be committed together with the private completion witness; a newer ordinary
Edit selecting D cannot retroactively undo that fact. Existing acknowledged root
state, transport dirty bits, times or incoming cloud labels are not positive
completion authority. An unmarked old terminal remains conservative and is never
automatically upgraded.

Existing ownership/coverage IDs, **not new task IDs**: T064/previous T043 for
pure versioned decoding and strict original producer parity; T069 for the sole
dedicated atomic writer and replay; T050/T053/T069 for sync-catalog, loss
suppression, post-ACK/root-pull and successor/retention readers; T069's
independently owned SQLite real-service positive pre-ACK/post-ACK later-Edit
cases and retained F3 corrupt negative; T074 for replay, rollback, cold restart,
privacy and legacy parity. Ordinary Edit remains the existing nonfinancial
metadata path, not a new financial intent, atomicity claim or API. No source
ownership follows from this mapping.

Gate in sequence: Root reconciles this technical-only amendment and runs fresh
`speckit.analyze` (Root already reported 0 CRITICAL/0 HIGH), then uses the
independently authored **two parameterized real-Edit cases** at
`4f40fe26045be578f9ea02fa8b318688837b9fb7`
(`account-create-default-sync-later-edit.sqlite.integration.test.ts`): genuine
post-compensation ordinary Edit, **before first B ACK** and **after prior B
terminal ACK**. The retained corrupt-terminal F3 refusal is separately pinned at
`e45aec7c567959b61716cde604daa5fa166f103c`
(`account-create-default-sync-metadata-terminal.sqlite.integration.test.ts`).
The broader completion/rollback/restart/privacy matrix is still required, NOT an
asserted count of existing executable cases. Source43 syntax repair alone is not
meaningful behavioral Red: Root's integrated grouped cohort was RUNNING at
documentation handoff, and Root must examine its actual result before issuing
any disjoint production grant. No local commands, formatters, SQL, tests,
emulator, runtime or native execution or PR/ref change accompanies this
documentation-only proposal.

## Final coverage handoff — current evidence is not feature acceptance

[final-coverage-handoff.md](validation/final-coverage-handoff.md) is the updated
M01–M20 evidence map; the earlier `d110` fixture-entry-pending note was a
**historical pin**, not the current Main entry status. The implemented
nonproduction, authenticated/current-owner Voice `reviewFixtureSceneId` entry is
evidenced at `70c0408928dc561a04483cd64b6de532de80782e`; its controlled
local-only five-role account/English fixture seed was further reconciled at
`4c80` (existing source context). The separately authored `default-account.yaml`
and `shared-suggestions.yaml` are evidenced by
`04848cb222a3dfe0d7e0a1ad8cde81e7cdd0ef9c`, alongside the existing
`conditional-states.yaml` and `choose-account-currency.yaml` journeys. All
**four Maestro YAML/device journeys are NOT RUN**; an implemented test entry and
authored seed do not establish actual on-device mounting, scenario success,
financial Save, provider behavior or owner visual accessibility. Use the updated
handoff rather than duplicating old pending-entry wording. SQL/SDK results,
grouped real-SQLite cohort, source and Deno/generation readiness remain
Root-controlled, with the completion cohort still RUNNING at this document's
pin. Final integrated checks, owner visual/RTL/keyboard/ screen-reader and
real-provider evidence remain open. Scoped candidates and sub-batches do not
advance the unchanged 80 IDs / 32 accepted entries or authorize feature Green,
hosted compatibility or release.

## Unshipped SMS cleanup proof reconciliation (2026-10-17)

The closed technical clarification is recorded in financial-save, wire-shapes
and local-recovery contracts. Existing T042-T048/T051 cover all-selected SMS
bookkeeping, exact physical/public/private membership, stable existing queue
headers and accepted historical-proof retention. Implement as bounded exclusive
source lanes; keep Core save-plan changes separate from retention/queue-writer
owners. Preserve approved spec SHA, all 23 B1 bindings, 80 original task IDs,
local-only data boundaries and the no-emulator owner-validation handoff. No
source success or task completion is implied by this clarification.

## Historical Add root ACK versus current row ACK (2026-10-17)

Within existing T069, distinguish historical accepted Add-root acknowledgement
from current account/child field acknowledgement. The existing accepted receipt
and original immutable effect establish the prior action; later financial state
still requires separate positive authority. Cover real accepted successors and
sender replacement before root ACK alongside corrupt-effect, unproved revision,
missing/foreign child and actor/raw-equality refusals. A remaining
created-account field-ACK gap blocks full readiness even if the historical root
becomes clean.
