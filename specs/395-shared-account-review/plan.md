# Implementation Plan: Shared account review for Voice and SMS

**Branch**: `codex/395-shared-account-review` | **Date**: 2026-10-14 | **Spec**:
[spec.md](spec.md) **Input**: `specs/395-shared-account-review/spec.md`;
approved revision
`sha256:e012f5a7d2edadc8bc1e2fa2ce03aeea56bc0c947dc02bfc2a3f166150e2c7d0`.
**Base**: `origin/main@7838df64eb9b3828c6e8f1a02f590b008d5435fd`. **Status**:
Design complete; tasks/analyze and implementation authorization remain.

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
Router, existing Supabase client/financial-action foundation. No new dependency.
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
safeguards/privacy unchanged. **Scale/Scope**: Six journeys,24 requirements,23
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
supabase/migrations/NNN_review_batch_save.sql       # next free prefix at implementation
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
- [Financial save](contracts/financial-save.md): complete action, zero-net
  handling, SQL/sync/rejection scope and implementation approval boundary.
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
   financial-action SQL/save tests; UI fixtures/tests.
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
contract and an unchanged legacy financial-action regression baseline. Pure
T027 identity/reducer work requires T019 Green and its own T024 Red. Each
production task still requires lead review, explicit file ownership and
test-first authorization; this paragraph grants none.

**T016 remains INCOMPLETE** until the complete all-source foundation is
independently accepted. It remains a mandatory prerequisite for every
user-facing route, hook, UI, SMS queue, Save, network-wiring or other runtime
integration; early pure code does not satisfy or bypass that gate. SQL
implementation/race proofs and local writer integration retain their separate
approved Red, scope, ownership and review gates. No implementation, test run,
SQL mutation or hosted deployment is authorized by this dependency update.

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
