# Implementation Plan: Shared account review for Voice and SMS

**Branch**: `codex/395-shared-account-review` | **Date**: 2026-10-14 | **Spec**:
[spec.md](spec.md) **Input**: `specs/395-shared-account-review/spec.md`;
approved revision
`sha256:e012f5a7d2edadc8bc1e2fa2ce03aeea56bc0c947dc02bfc2a3f166150e2c7d0`.
**Historical planning base**: `origin/main@7838df64eb9b3828c6e8f1a02f590b008d5435fd`.
**Execution status (2026-10-16)**: full local implementation is authorized;
accepted slices, governing pins and remaining gates are recorded in
[workflow-status.md](workflow-status.md). Digest amendment reanalysis and its
tests-first gate are recorded separately.

## Summary

Use one pure account-review engine with Voice/SMS source adapters, keeping the
existing transaction shell, account fields and CurrencyPicker. Distinguish
missing account evidence from unmatched explicit evidence, and omitted currency
from ambiguity. Accept eligible defaults, validate shared draft groups, and
separate confirmation from selection. SMS persists versioned review state in
existing local payloads; Voice keeps session state only. Gemini Voice and
configured DeepInfra SMS return advisory evidence/groups in the original
request; no extra review-time provider call.

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
Router, existing Supabase client/financial-action foundation. No new runtime dependency. The accepted development-only type restoration adds
@types/react-test-renderer19.1.0.
**Storage**: WatermelonDB accounts/financial records and existing SMS draft
JSON; Supabase PostgreSQL background financial-action CAS. No cloud review table
or durable Voice session. **Testing**: Jest/RNTL, pure logic/provider contract
tests, pgTAP and authored Maestro fixture journeys. No emulator execution;
device/visual QA owner-run. **Target Platform**: Existing managed Android/iOS
app; SMS capture Android-only. **Project Type**: Offline-first mobile monorepo
plus Edge Functions. **Performance Goals**: Zero additional parsing requests
from review; batched owned account read and indexed O(rows + groups + accounts)
ordinary resolution; one local selected-save transaction; memoized rows and
FlatList. Measure synthetic 500-row/100-group actions and report median/p95
without presenting unit timings as device evidence. No new sleeps or provider
retries. **Constraints**: B1 exact bindings; original spec/image bytes
unchanged; no account default before currency certainty; no name-only identity
merge; exact amounts/minor units; idempotent financial writes; SMS
safeguards/privacy unchanged. Review creation has one closed
`creationDefaultSnapshot` iff any new Cash/Bank/Wallet account, with the first
active account in frozen actual UUID order default and existing/no default
unchanged when active accounts already exist; compatible multi-currency Voice
Cash groups remain independent. Current ATM cannot invent a Cash destination.
**Scale/Scope**: Six journeys,24 requirements,23
scoped references: engine, parser/source adapters, SMS durable group edits, UI,
Add/Edit helper/default intent, and selected-save integration.
Recorder/#391/live-SMS confirmation/#393 excluded.

## Constitution Check

| Gate                              | Before research             | Post-design evidence / implementation condition                                                                                    |
| --------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| I/VIII local-first and ownership  | Required                    | Scoped repositories, atomic local group edits/save, background CAS; no network-dependent local review                              |
| I grouped financial actions       | Current save gap identified | Strict complete batch registration planned; never split new accounts/transactions across actions or reuse unguarded balance writes |
| II documented business rules      | Spec approved               | Approved target decision entry distinguishes pending implementation from existing runtime                                          |
| III runtime/strict types          | Required                    | Logic-owned Zod contract with generated Edge/provider projections; unknown validation, null IDs, canonical domain exports          |
| IV/VI layer boundaries            | Required                    | Pure resolver/reducer in logic; service reads/writes; lifecycle hooks; shaped presentation props                                   |
| V visual authority                | Passed before plan          | B1 owner receipt and all23 canonical binding verifier passes; CurrencyPicker exception retained                                    |
| V visual/accessibility completion | Required later              | Layout/semantics tests plus owner-rendered baseline/variant evidence; no visual-completion claim without evidence                  |
| VII migration                     | Design only                 | New local numbered SQL action registration needed; concrete scope approval before SQL implementation, no hosted DDL now            |
| Financial arithmetic              | Required                    | Shared Decimal primitive, canonical strings/minor units, once-only effects; no inferred bank opening balance                       |
| TDD and coverage                  | Required later              | M01–M20 mapped; tests first, meaningful Red before production; batched integration checks, no emulator                             |

There is no constitutional waiver. Current save debt is addressed by the
proposed contract. Design-stage gates pass; migration implementation approval,
tests and runtime/rendered evidence remain prerequisites for delivery. Planning
does not authorize deployment or claim runtime support for new contracts.

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
└── tasks.md                 # future speckit-tasks, not produced by plan
```

### Source code — proposed modules within existing layers

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
supabase/migrations/090_review_batch_save.sql       # reserved after main 089; local only
supabase/migrations/091_account_create_default_intent.sql  # separate Add; local only
supabase/tests/                        # CAS/validation/privacy/rollback
apps/mobile/__tests__/                 # service/hook/UI/regression coverage
apps/mobile/e2e/maestro/                # authored deterministic journeys
```

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
  revalidation, selection/Undo and approved UI behavior.
- [Financial save](contracts/financial-save.md): complete action, zero-net,
  `creationDefaultSnapshot` for all new account types, multi-Cash, default CAS,
  T043 frozen IDs/ATM bounds and SQL/sync/rejection implementation boundary.
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
3. Engine/persistence/parser integration before route wiring. Add/Edit default
   intent can overlap review UI with distinct files; one owner for shared
   hooks/shell.
4. Complete action validation/sync/reconciliation before selected-save wiring.
5. Independent review/coverage audit, one integration check batch, owner device
   validation, commit/push/PR update.

**Narrow pure-work readiness (dependency reconciliation only):** Accepted
canonical T004/T009–T011 schemas, generated Edge parity, owned account context
and pure T014-P source normalization allow T017 resolver tests to demonstrate
meaningful Red before side-effect-free T019. Pure T046 payload validation and
registry declarations may proceed only after T042 Red, the frozen T004 financial
contract and an unchanged legacy financial-action regression baseline. Before
further T046 source acceptance, reconcile the multi-Cash/first-active default
validator and renamed unshipped snapshot field; then extend T043–T045 Save/SQL
Red for frozen T043 aliases, legitimate Cash destinations and owner-wide CAS. Pure
T027 identity/reducer work requires T019 Green and its own T024 Red. Each
production task still requires lead review, explicit file ownership and
test-first authorization; this paragraph grants none.

**T016 remains INCOMPLETE** until the complete all-source foundation is
independently accepted. It remains mandatory before data/domain/workflow hooks,
route/container/TransactionItem integration, existing shared CurrencyPicker behavior changes,
full SMS queue codec, stateful merge/writer, persistence, Save, SQL/sync,
network wiring or runtime action enablement. Early pure or isolated
presentational code does not bypass that gate. **Conditional identity
prerequisite only:** if Core's queue-namespace plan and Root's read-only analysis
prove a T014-M ↔ T028 identity-capture cycle, the smallest atomic *owned
queue-UUID acquisition/lease helper* may receive a separate tests-first,
owner-reviewed pre-T016 lease. Its exact API/files are NOT frozen or granted;
it must guard owner isolation, cancellation, empty-queue cleanup, queue
replacement and CAS/generation races, with no new table/column or edited-row
renamespace. This exception does not complete T014-M, T028 or T016 and cannot
enable full queue/runtime integration. SQL implementation/race proofs and
local financial writer retain separate approved Red, scope and owner gates.
**Conditional presentational overlap — dependency proposal only:** After
accepted canonical I1/T019 and its own T018 component Red, T020 may be
considered *only* for stateless approved B1 default disclosure and Why-sheet
presentation. T021 TransactionItem/route integration stays blocked. Later
candidates: T031 after accepted T027 group/reducer types and T026 component
Red; T038 view-only chooser/conflict sheets after accepted T036 candidate/
choice types and T035 component Red; T060 view-only compact panel after
accepted T059 read-model types, T058 component Red, and T020/T031. Those
downstream prerequisites are not claimed ready. T037 modifies existing
CurrencyPicker nullable-selection behavior and remains T016-gated; so do
T039 picker delegation and existing-caller compatibility wiring. Isolated
T018/T026/T035/T058 component tests may use canonical shaped fixtures before
T016, not other story Red/integration tests.

The presentation candidates receive shaped props/callbacks only: never DB,
services, reducer, business calculations, provider, data/domain/workflow
hooks, commands, account/review/selection state writes, transactions, routing
or Save. Pure presentation context/i18n/theme/safe-area hooks (for example,
useTranslation, useSafeAreaInsets and useModalBottomInset) and ordinary
React render memo hooks (useMemo/useCallback) remain allowed; none owns
account/review/selection state. A test parent such as T018's
DefaultDisclosureJourney may own modal-visible state and pass controlled
visible/onClose props; the presentational child does not own that state.
All 23 frozen B1 bindings, component test contracts, state-to-surface mapping,
tokens/icons, EN/AR copy and accessibility/layout rules remain authoritative. Missing canonical exported
props/callback types or upstream Green **block** a candidate; never invent
types, commands, flows or new copy. Root owns the dependency decision and
must run the existing speckit.analyze before any separate component lease.
This adds no approval gate or production authorization.

No implementation, test run, SQL mutation or hosted deployment is authorized
by this dependency update. Main `de09f76bdadb570c99a1015bbf1c680279b0d5ad`
ends at `089_historical_metal_rate_request_limits.sql`; the missing 088 prefix
is not available. Review migration reservation is **090**, Add **091**.
Preserve 082–085 publication fence and owner-snapshot race-proof gates.

## Effort and risks

Provisional full delivery **12–18 elapsed hours** with safe overlap after tasks,
analyze and implementation authorization. Main uncertainty is the complete save
action. Lanes: contracts/providers2–3h, engine/SMS3–4h, action/save4–6h,
UI/forms3–4h, review/integration2–3h, with overlap. Re-estimate after tasks and
discuss scope above four hours before starting workers. No availability/quota
claim.

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
dedup omissions, original confirmed-group provenance and complete physical plans.
Only the digest hash enters the cloud payload; the digest itself adds no table/column,
durable Voice review, legacy tuple or Add change. Separate device-local SMS
recovery storage is reconciled below.

T042/T046 reopen for contract tests/schema/helper/generated parity, followed by
T048 first-write digest and historical replay validation and T045/T052 SQL parity.
Existing deployed operations remain exact. Source grants for this amendment wait
for meaningful wire Red and read-only speckit.analyze. T016 and the accepted T036
remain prerequisites already met; unrelated approved component work can overlap
with exclusive ownership.

creationDefaultSnapshot presence is still determined by actual new account
creates after deduplication. The original full member plan can contain omitted
groups without forcing a synthetic snapshot. Digest computation takes the
captured snapshot or absence and replay reuses that stored historical value;
the closed payload validator independently enforces actual-create presence.


## 2026-10-16 — Verified device-local recovery carrier

contracts/local-recovery.md corrects the unimplemented existing-storage assumption.
One private Watermelon-only root column/local migration31, generator override,
atomic linked-plan callback, queue lifecycle/30-day redaction and owned pull
preservation implement existingUS6. No new Supabase field, table, public tuple,
rawVoice durability, product approval or B1 change. T043/T044Red precedes these
T048–T051/T053 sources; existing80tasks cover all seams. Retain independent
SQL/security review and exact canonical source types.
