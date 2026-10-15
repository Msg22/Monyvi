# #395 US6 T043 — Atomic selected-review local Save, test-first plan

**PLAN ONLY — no tests or production writes.** Sole owned new file: `specs/395-shared-account-review/validation/review-save-tests-plan.md`. Verified parent `codex/395-ui-worker@a0092c71c206ad0a3f8a2be1e04a1608814ad874`. Trusted context `9a8987a8087db886d9b9244182ef8e8128016621`. Core T012, Root's T042 test-only Red (reportedly **0 behavioral assertions**), T044 sync, T045 SQL/pgTAP, and SQL I1/B1–B4 are **other owners' work**; none of their unpublished tests or commits are claimed available here.

## 1. Authority and frozen financial contract

Read the complete `.agents/personas/offline-financial-systems-engineer.md` (blob `97ca26628a64ec2e4a35599e684bd01f4d576e0e`) and `.agents/skills/offline-financial-systems/SKILL.md` (blob `7b856980bf245b51f11a7f58586058532fb52ca8`) at trusted context, along with `AGENTS.md`, constitution, approved business decisions and `specs/395-shared-account-review/{tasks.md,manual-test-plan.md}`. The normative **approved T004 closed protocol** comes from `contracts/financial-save.md` (blob `36673fd5054b1231a3f60d4f95bb18a1a12b9e37`), `contracts/wire-shapes.md` (blob `b6c513eec986b93158be51002487e6a39c84361b`), `contracts/review-commands.md` and `contracts/account-default-intent.md`. No new financial/business rule, tuple or hosted migration is proposed.

- **New tuple only:** `domain=transactions`, `kind=review_batch_save`, `payloadVersion=review.batch-save/v1`, `operationCode=review.batch-save`; retain `envelopeVersion=monyvi.financial-action/v1` and the existing `apply_account_financial_action_v1` RPC. Registry/schema/Edge projection/SQL are **not yet implemented/verified**; SQL prefix `090_review_batch_save.sql` (and independent `091_account_create_default_intent.sql`) is reserved for the separate approved producer. Registration enablement is blocked until owner-wide serialization before row locks is independently proven, including generic/legacy account writers.
- The published logic **does** already export canonical `AccountReviewSession` and `AccountReviewSaveIntent` via `accountReviewSessionSchema`/`accountReviewSaveIntentSchema` (`packages/logic/src/account-review/review-schemas.ts` blob `e2d01244aed58d1a23e6588db9a18173c237c274`). Exact SaveIntent: `actionId, ownerId, source, sessionId, expectedReviewRevision, expectedOperationGeneration, selectedRows[{rowId,revision}], confirmedGroups[{groupId,revision,evidenceKey}], plannedEntityIds[{entity,localRef,id}], occurredAt`. `selectedRows` is nonempty; duplicate IDs/aliases forbidden; `session.saveIntent` can be null before the explicit freeze. **Do not copy these domain types.**
- New payload root is closed: `schemaVersion,operationCode,source,sessionId,selectedSourceRefs,confirmedGroupRefs,createGuards,accountEffects,domainRecordRefs,domainMutation.records,localSmsBookkeeping` plus **optional** `cashDefaultSnapshot` only for an actually created Cash account. Existing `accountGuards` protect every financial source/destination (including a zero-net account); `createGuards` require `expectedAbsent=true` for every created account/child/financial ID, even if its financial revision is `"0"`. Sort refs/effects/mutations/guards deterministically. `domainReferenceId` is the first created transaction/transfer ID by ASCII order. Keep raw SMS/transcript/audio, review JSON, evidence spans, confidence, choices, undo and local preimages out of cloud payload/outbox/logs.
- Money uses existing Decimal canonical strings, `CURRENCY_PRECISION`/rounding/`toMinorUnits`, strict signed integer minor units and overflow/financial-revision checks; not JavaScript float accumulation. A **nonempty zero-net** income/expense batch still creates **both records, one zero account effect, one financial-revision increase**. Legacy v1 still rejects its forbidden zero-net operation. **All-selected SMS fingerprints already durably saved** → scoped local draft cleanup **only**, no fake root, effect, account, child, financial row, or provider request.
- New suggested BANK/WALLET starts at opening `"0"`, target null, `isDefault=false`; only **selected** transaction delta is posted once (never legacy `initialBalanceByTempId` and a second posting or AI-historical bank balance). Explicit grounded Voice CASH survives, no forced BANK/WALLET cast. Ordinary SMS source excludes CASH; a Cash ATM destination is separate. Any newly created Cash captures exact active/default UUID snapshot, owner-serialized first-active default CAS and predecessor action dependencies; group Confirm never sets default.

## 2. Verified real source seams; banned legacy shortcuts

| Source verified at trusted 9a | T043 consequence |
| --- | --- |
| `services/core-account-financial-action-service.ts` (blob `8d7230a6e4071c650fe6dd7aa099de9d1a22cd18`) | The injectable core `execute` currently **filters zero** in `canonicalizeEffects`, rejects all-zero, emits only `account.balance-effects/v1`, and permits account/transaction/transfer (not child) mutations. It is **not** the new review writer. T047 adds an explicit closed-version adapter; no widening legacy v1. |
| `services/account-balance-command-service.ts` / `financial-action-foundation-repository.ts` | Balance command explicitly rejects non-`account.balance-effects/v1` versions. Foundation `commitFinancialActionGroupLocally` owns **one scoped `database.write`**, actionID/hash/replay, operation preimage/ownership guards and one linked prepared batch; T047 must register new action through foundation, **never nest** an SMS writer or per-row transaction writer. |
| `services/watermelon-atomic-batch.ts` | `commitPreparedBatch` differentiates **pre-adapter-commit failure** from post-commit cache/notification failure. A postcommit error **cannot** be treated as rollback/new Save. Read existing action by same actionID on retry. |
| `services/transaction-service.ts` / `transfer-service.ts` / `transaction-financial-action-service.ts` | Reuse persisted row fields, signed effects and ATM semantics; **do not loop** `createTransaction`/`createTransfer`/`batchCreateTransactions`: these legacy paths cannot atomically register new account+children+rows+effects+draft cleanup. |
| `services/pending-account-service.ts` | `preparePendingAccounts` returns prepared Account, AccountSmsSender and BankDetails and temp→real mapping, with identity/sender/card helpers; currently BANK/WALLET-only pending type and `initialBalanceByTempId` legacy aggregation. T048 reuses **preparation only** with frozen planned IDs, no separate commit, no double posting and explicit Voice CASH support. |
| `services/sms-review-draft-save-service.ts` / `sms-review-save-service.ts` | Legacy `saveSelectedSmsReviewDrafts` already uses `runSmsReviewDraftWriter`, selected draft ref revalidation, dedup, Cash ATM, pending account preparation and draft deletion. No new tuple/hash/CAS/zero-net guarantee. T049 adapts only the new review path; unrelated legacy callers unchanged. |
| `services/sms-dedup-service.ts` / `sms-review-handled-fingerprint-service.ts` | `hasExistingSmsFingerprint` and `getSavedSmsReviewFingerprints` check **owned nondeleted transactions AND transfers**. Test recheck **inside** writer after preflight; deleted/foreign fingerprints do not dedup. |
| `services/sms-review-draft-repository.ts` / `sms-review-draft-reference-service.ts` | Owned draft/queue reads, category/account checks, selection overrides, expiry and `deleteResolvedSmsReviewDraftsInWriter`. That delete helper itself commits a batch, so T049 must **adapt to one root+records+effects+draft cleanup/rebind batch**, not call it as nested commit. |
| `services/user-data-access.ts` / `account-review-read-model-service.ts` | Capture actor and use `queryOwned` / `queryAccessibleCategories` / owned child-parent checks inside writer and across awaits. Published T010 `loadAccountReviewAccountSnapshots(): Promise<AccountReviewAccountSnapshots>` is **zero-argument**, returns ownerId/preferredCurrency/accounts+isDefault/privacy-safe providerContext; do not change ABI or leak local/default data to provider. |

## 3. Exact proposed T048 API and writer sequence (not a new wire DTO)

```ts
import type { AccountReviewSession, AccountReviewSaveIntent } from "@monyvi/logic";
import type { CommitFinancialActionGroupLocallyResult } from "./financial-action-foundation-contracts";

export function saveSelectedAccountReview(input: Readonly<{
  session: AccountReviewSession;
  intent: AccountReviewSaveIntent;
}>): Promise<
  | CommitFinancialActionGroupLocallyResult
  | Readonly<{ kind: "cleanup_only"; resolvedSmsDraftCount: number }>
>;
```

This is **proposed technical test-facing signature**, subject to Root/T048/T054 freeze; no new canonical/save JSON schema. The action branch returns an existing foundation result; `cleanup_only` is a **local-only** all-SMS-dedup outcome with **zero financial root**. A Voice batch with no financial records is invalid. Prefer injectable `createAccountReviewSaveService(deps)` (typed scoped readers, in-writer checks, local foundation commit, clock/hash/ID seams), plus the public production wrapper. UI/hooks never write DB.

**Required order:**
1. Zod-validate **full** session and SaveIntent; require `session.saveIntent` matches the frozen passed intent; exact owner/source/session, selected row IDs+revisions, confirmed **referenced** group revisions+evidence keys, review revision/generation and distinct planned IDs. Freeze IDs/hash/time before awaiting, reject unknown/unselected/removed/currency-blocked rows; no new intent on repeated taps.
2. **Resolve actionId first** from current-owned foundation: same ID/hash replay returns original canonical action; same ID/changed hash rejects; ambiguous pending result waits for identity resolution, not a new action or an all-dedup shortcut.
3. Enter **one owned local `database.write`** under the registered financial foundation. **Inside that writer** re-check authenticated principal across awaits, latest SMS v2 queue/draft selection/postimages, each selected row/group revision, active account ownership/type/currency/financialRevision, accessible active category, BANK children/senders/provider/card uniqueness and create-ID absence, transfer endpoints and fingerprint occupancy across **both** financial tables. Revalidate again before dirty prepares/commit; TOCTOU change fails closed without foreign-data leakage.
4. Separate already-saved SMS rows from unsaved. If all selected fingerprints already exist and no previous action, delete **only** verified resolved owned draft rows in one local batch and return `cleanup_only`. Never open a fake zero-transaction action. Mixed dedup saves only unsaved selected rows; duplicate incompatible source fingerprint payloads fail rather than silently drop.
5. Prepare **only selected referenced** draft accounts/necessary BankDetails and AccountSmsSender, financial transactions and real SMS ATM transfers, account effects (one per guard **including zero**), revision updates, and the `financial_action_groups` root. Apply sorted mutation/absence/guard sets and frozen entity IDs. Bank `"0007"` remains string in wire and numeric/padded only at persisted boundary. No unused confirmed group creations, Cash guess, AI bank opening balance or extra provider call.
6. Same **single adapter batch** must delete saved SMS selections and **rebind unchanged unselected linked SMS rows** to the real created account **without selecting them**, preserve other groups/overrides/queue and snapshot hashed local pre/postimages with `defaultDependencyActionIds`. No raw draft payload in new cloud action. Voice review remains session-only.
7. **Precommit** validation/adapter error: all linked DB records unchanged and cache snapshots restored. **Postcommit** notification/ack error: inspect durable same action and replay, **never** blind inverse or new ID. Unsupported server registration stays local pending/sync_failed through T044, no generic push fallback.

## 4. T043 target tests and genuine SQLite evidence

**Official T043 unit target:** `apps/mobile/__tests__/services/account-review-save-service.test.ts`, test actual future service with full canonical `AccountReviewSession`/`AccountReviewSaveIntent` and owned actor/category/account/children/SMS queue fixtures. A missing future service, version adapter or T046 financial payload schema is **honest creation Red**, not a behavior PASS. Inject deterministic async barriers/failure points; mock dependency call counts **only for orchestration/TOCTOU**, not atomic rollback.

**Recommended optional SQLite companion after a separate file lease:** `apps/mobile/__tests__/services/account-review-save-service.sqlite.integration.test.ts`. Evidence:
- `financial-action-foundation.sqlite.integration.test.ts` uses real WatermelonDB SQLite + `adapter.testClone()` for root/replay/restart, but registers **only FinancialActionGroup**. Alone it **cannot** prove transaction/account/child/draft atomicity.
- `recurring-payment-atomicity.integration.test.ts` provides the closest real multi-entity SQLite pattern: actual schema, Account/AccountFinancialEffect/Category/FinancialActionGroup/Transaction/Transfer classes, real UNIQUE constraint violation **within** adapter batch, `testClone()` to inspect persisted rollback and same-instance cache retry. Extend with BankDetails, AccountSmsSender, SmsReviewQueue, SmsReviewDraftItem and any necessary DismissedSmsFingerprint real models. Test all table counts, balances/revisions/default, queue selection/payload and action/effects before and after clone.
- `financial-action-foundation.integration.test.ts` is a useful **mock** operation/preimage/owner-switch/failed-batch harness; `sms-review-draft-atomic-save.test.ts` mocks `runSmsReviewDraftWriter` and cleanup, and `sms-review-draft-repository.test.ts` uses fake collections. Those prove call order or cache restoration expectations **only**, not physical atomic rollback. `sms-dedup-service.test.ts` proves existing two-table lookup. T043 real SQLite should inject a **mid-batch** SQLite constraint conflict (not just mock `database.batch` rejection), verify zero leaked root/account/children/transaction/transfer/effects/SMS modifications after clone, then same-instance retry succeeds exactly once. Separately fault **after actual adapter commit** and verify one durable action, not rollback.

### Proposed T043 named matrix — **not authored or run**

| Test IDs | Assertions | Proof scope |
| --- | --- | --- |
| **S01–03 Frozen identity** | Canonical session/SaveIntent, scoped source and exact selected row/group revisions/evidence, no duplicated planned IDs, valid freeze; stale owner/group/selection/operationGeneration rejects before dirty prep. Prior action lookup happens before dedup. | Unit + SQLite root check. |
| **S04–06 Selected-only** | B1 R3 7/5/2: Save one eligible QNB-linked row → only needed QNB account/BankDetails/AccountSmsSender and selected financial record, no unused CIB/other confirmed group account. Confirm alone creates nothing; reuse an existing account rather than creating an unnecessary draft. | SQLite accounts/children/rows. |
| **S07–09 Ownership/identity** | Recheck case-insensitive name+currency+provider uniqueness, same name but different approved provider, bank card/sender normalization and child parent links, foreign/deleted/missing-create-ID collisions; no cross-owner reparenting or ID reuse. | Unit/SQLite + T045 pgTAP. |
| **S10–12 Scope/category/currency** | Actor switches before/during writer; foreign/deleted/inaccessible system category/account/child and incompatible type/currency reject; SMS CASH source forbidden, grounded Voice CASH allowed with captured first-default snapshot; no account guess on unconfirmed currency. | Deferred barrier + persistent no-write; RLS T045. |
| **S13–15 Exact balance/zero** | New SMS Bank income20.01 minus expense5.01 => opening `"0"`, one `"1500"` effect, final15; existing100 =>115, never initial aggregate+double-post. EGP income20.01+expense20.01 => **two records, zero effect, balance100, revision r→r+1 once**; replay unchanged. KWD/BTC precision, overflow/unsafe rounding abort. | T042 Decimal + T043 SQLite actual effects. |
| **S16–18 Transfer/Cash** | ATM source Bank100→74.95, Cash10→35.05, amount25.05; creates **transfer not duplicate expense transaction**, guards/effects on both, retained SMS fingerprint. New Cash default snapshot/absence guard, Voice CASH not narrowed to BANK/WALLET, no AI balance. | SQLite; owner-lock race T045. |
| **S19–21 Cross-table dedup** | Existing owned nondeleted fingerprint in transactions **or transfers** skips new financial creation; foreign/deleted doesn't. Repeated selected fingerprint within same action cannot double apply, mismatch rejects. Repeat predicate **inside writer** after preflight race. | Unit/SQLite fingerprints. |
| **S22–24 Draft cleanup/rebind** | Mixed dedup/unsaved only creates unsaved rows and cleans resolved selected drafts; **all-dedup → no root/effect/account or provider**; selected QNB creates once and rebinds unchanged *unselected* SMS siblings without ticking or overwriting edits, retains unrelated CIB and selection. | Full SQLite queue/item/financial parity; restoration T044. |
| **S25–27 Double tap/replay** | Concurrent clicks serialize one frozen actionId/hash/entity IDs and one writer; identical action/hash on reopened DB returns replay with no duplicate; same ID/different hash rejects; later selection cannot hijack ambiguous result or mint new action. | Deterministic barriers + `adapter.testClone()`. |
| **S28–30 Precommit error** | Changed revision/category/currency/child/owner detected **inside writer**; actual SQLite mid-member UNIQUE failure rolls back root, account/children, effects, transfers/transactions, draft deletions/rebind and cache; next retry succeeds once. | Real SQLite rollback, not naive mock. |
| **S31–33 Postcommit/transport** | Error after adapter success leaves exactly one action; resolve pending/retry by same ID/hash, no new account/effect. Missing/old server registration/transport failure stays sync_failed/pending and generic LWW cannot leak action-owned records. | SQLite postcommit + T044 sync. |
| **S34–36 Privacy/recovery/legacy** | Closed sorted payload/guards/refs, no raw SMS/transcript/evidence/Undo in cloud; local-only `account-review-local-save/v1` hashes, created/preimage refs, `defaultDependencyActionIds`; legacy `account.balance-effects/v1` zero still rejected; new zero permitted only for closed tuple. | T042 validator, T043 snapshots, T044 outcomes, T045 pgTAP. |

## 5. M13–M15/M19 test ownership and exit gates

| Manual case | T043 proof (not UI counters) | Independent proof |
| --- | --- | --- |
| **M13 selected Save** | S04–06/S13 all-table selected account/row/effect counts and balances in fresh SQLite. | T054 real Voice/SMS route, user navigation **after** local commit and actual ledger; empty/unused groups remain. |
| **M14 failed/replay/duplicate** | S19–21/S25–33 two-table dedup, frozen intent, true SQLite rollback and postcommit uncertainty. | **T045** PostgreSQL transaction/ownership/CAS/hash/replay pgTAP; inject E2E failure **only** with an honest controllable harness, else owner manual. |
| **M15 SMS restore/Review later** | S22–24 queue snapshots/draft rebind and retained unselected choices after SQLite clone. | **T044** restart/rejection compensation exactly once and no overwrite of newer edits, SMS v1/v2 compatibility; T054 source-correct Review later. Voice **no new durable review**. |
| **M19 compound action** | S07–18/S28–36 account/children/ATM/zero-net/revisions/absent-create protections in one local batch. | **T042** payload/Decimal registry, **T044** protected push/reconciliation, **T045** true PG owner-wide serialization *before* row locks, RLS, CAS/zero compensation and old-operation compatibility. SQL producer owns approval. |

Exact other paths: T042 `packages/logic/src/financial-actions/__tests__/review-batch-save.test.ts`; T044 `apps/mobile/__tests__/services/account-review-sync.test.ts`; T045 `supabase/tests/review_batch_save.test.sql` and `apps/mobile/e2e/maestro/account-review/save-recovery.yaml`. The SQLite proof is **local Watermelon adapter** truth; it cannot by itself prove PostgreSQL rollback, sync, owner lock, default uniqueness or RLS. Root's separately authored T042 creation Red with zero assertions is **not** a T043 or production readiness PASS.

## 6. Approval, evidence and STOP

**T043 test authoring can use already frozen T004 canonical session/intent**, but may be genuine missing-new-schema/service **creation Red** until T046/T048. Root must freeze the proposed `saveSelectedAccountReview({session,intent})` and local-only `cleanup_only` return before implementation and grant separate file ownership for T043 test/SQLite companion. **Production T046–T054 waits T016, actual Red/Green, SQL owner-lock proof and independent database/security review.** Do not enable new actions on servers without registration or retry through unguarded legacy writers.

**Only this document is authorized here**. No Jest, SQLite, SQL execution, npm, code generation, migration, emulator, provider, seed, native, hosted database, source/test/YAML/route/locale, branch/ref move, PR/issue writes, or deployment was performed. **PLAN-ONLY CHECKPOINT — OWNERSHIP RELEASED — ALL WRITES FROZEN.**

---

## 7. T043 approved test-only lease, exact injected factory seam and SQLite readiness

**Approval:** Root froze the public `saveSelectedAccountReview({session: AccountReviewSession,intent: AccountReviewSaveIntent})` return as `CommitFinancialActionGroupLocallyResult | {kind:"cleanup_only";resolvedSmsDraftCount:number}`. No copied canonical DTO or extra public argument. Proposed **testable factory addition** from the same future `apps/mobile/services/account-review-save-service.ts`, to be reconciled by T048 with the public wrapper before production:

```ts
export interface AccountReviewSaveServiceDependencies {
  readonly database: Database;
  readonly getCurrentOwnerId: () => Promise<string>;
  readonly loadCurrentSession: (
    ownerId: string,
    sessionId: string
  ) => Promise<AccountReviewSession>;
  readonly hashProvider: Sha256Provider;
}
export function createAccountReviewSaveService(
  dependencies: AccountReviewSaveServiceDependencies
): {
  readonly saveSelectedAccountReview: (input: Readonly<{
    session: AccountReviewSession;
    intent: AccountReviewSaveIntent;
  }>) => Promise<
    | CommitFinancialActionGroupLocallyResult
    | Readonly<{kind: "cleanup_only"; resolvedSmsDraftCount: number}>
  >;
};
```

**All four ports are dependencies, not business decision inputs.** Production `getCurrentOwnerId` and `loadCurrentSession` must revalidate current authenticated owner and the exact session/revisions **inside the registered owned financial writer**, not merely before its callback. A test factory can supply current-user switching and a current live snapshot without mocking the actual writer/SUT. `database` must be used by the **real** financial foundation/writer; not a fake `write(fn)=>fn()` that claims atomicity. `hashProvider` uses actual canonical SHA-256. If T048 requires narrower production-scope adapters, Root must reconcile dependency types explicitly rather than weaken the public API.

**Migration inventory correction (authoritative main `ac11a03b7bf9f75b842a7df2639f1c885e2c386b`):** `089_historical_metal_rate_request_limits.sql` exists on main; #395 is **`090_review_batch_save.sql` / `091_account_create_default_intent.sql`**, superseding the frozen older prefix references in §1/§6 and earlier T004 reservations. This is a numbering update only; **no SQL or contract mutation** was made.

**Root runtime update:** root's **main-only** `better-sqlite3` native binding rebuild on locked 11.10.0 succeeded, and root independently ran existing `recurring-payment-atomicity.integration.test.ts` plus `financial-action-foundation.sqlite.integration.test.ts`: **2 suites / 8 tests PASS on main schema30**. The intentionally injected postcommit observer error logged within a passing test is not a T043 failure. This remote worker has not run SQLite. Native readiness **does not imply T043 tests pass**, nor that new financial tuple/registry/SQL implementation exists.

**Lease:** exactly two NEW T043 test files, plus optional cohesive NEW test helper files and this report only; every named helper explicit return, <900 **formatted** lines/file, no `any` or cast hiding future SUT, no SUT mocks. Actual test creation Red is expected from missing T048 service and T046 registry; run no npm/emulator/provider/SQL here. Root alone runs new SQLite after publication. **T043 AUTHORING LEASE ACTIVE; NO PRODUCTION GRANT.**

---

## 8. T043 tests-only checkpoint publication and freeze

**Authorized owner/source:** `codex/395-ui-worker`; lease began at `eabc3f078f6ddc5e645c1a2993df361348a3f1ed`. Only four NEW files plus this report: `apps/mobile/__tests__/services/account-review-save-service.test.ts`, `account-review-save-service.sqlite.integration.test.ts`, cohesive `account-review-save-test-fixtures.ts`, and `account-review-save-sqlite-test-helpers.ts`. No source, existing tests, contract, migration, index, route, SQL, sync, locale, root branch or PR/issue mutations.
- **Precise future API/DI:** §7's `saveSelectedAccountReview({session,intent})` frozen **public** API/result contract is unchanged; the future testable `createAccountReviewSaveService({database,getCurrentOwnerId,loadCurrentSession,hashProvider})` factory is directly imported **unmocked** in both suites. The DI ports have explicit TypeScript returns; no copied canonical session/intent DTO, no fake implementation, `any`, disabled checks, skip/todo or casts hiding missing methods. T048 must reconcile the factory before implementation; this test lease does not imply production source approval.
- **38 individually named, authored expected-Red cases**: **26** service cases (S01–S24 plus S09a concurrent double-tap and S19b different-fingerprint negative) + **12** genuine-SQLite boundary cases (S25–S36). Canonical test sessions and frozen intents are parsed through existing T004 `accountReviewSessionSchema`, `accountReviewRowSchema`, `accountReviewGroupSchema` and `accountReviewSaveIntentSchema`; Voice, BANK/CASH, QNB/CIB, SMS two-table fingerprint, ATM, income/expense zero net, planned IDs and selected-only semantics. A test-only “SMS shared group” retains three QNB siblings + an unrelated CIB; **no T015 JSON, schema or actual seed was changed**.
- **Real adapter proof by assertion, not a mock success:** SQLite helpers import real `@nozbe/watermelondb`, repository schema and 11 model classes including Account/BankDetails/AccountSmsSender/Transaction/Transfer/AccountFinancialEffect/FinancialActionGroup/SmsReviewQueue/SmsReviewDraftItem. `adapter.testClone()` checks physically persisted rows. `injectMidBatchDuplicate` calls the **original adapter.batch** with an extra duplicate transaction create *in the same batch*, then checks no partial new root/child/financial/effect/draft writes and successful same-instance retry. S34 injects an actual Watermelon account subscriber exception *after* durable commit, verifies real persisted action and replay, never treats observer logging as rollback. Mocked `@monyvi/db` is only the SQLite **test database binding**; the future Save service itself is not mocked.
- **Boundaries honestly separate:** S19–S24 test owned nondeleted fingerprint lookup in BOTH transactions and transfers, mixed/all-dedup cleanup without fake action, and untouched linked choices. S25–S36 test committed account/child/transaction/effect parity, frozen replay/hash mismatch, mid-batch physical rollback, zero-net guarded revision, ATM/Cash, unselected SMS rebind, postcommit notification, cross-owner state and closed cloud payload. Service callback checks do **not** establish server CAS, RLS, owner-wide statement lock, T044 reconciliation after restart, or SQL pgTAP. M13–M15/M19 remain mapped to T043/T044/T045+owner E2E as §5 specifies.
- **Native SQLite readiness update from Root, not this worker:** Root independently rebuilt the locked `better-sqlite3@11.10.0` native binding on **main only**, with no package/lock changes; existing `recurring-payment-atomicity.integration.test.ts` + `financial-action-foundation.sqlite.integration.test.ts` passed **2 suites / 8 tests** under main schema 30. Expected postcommit observer log is from the preexisting passing test. **None of the new T043 suites ran or passed**. New SUT `apps/mobile/services/account-review-save-service.ts` / T046 financial tuple are absent at authoring checkpoint; **Jest/TypeScript missing-module creation Red** is expected, not a meaningful failed behavior assertion.
- **Static-only verification:** all four test/helper files are below 900 **raw** lines, named helper functions have explicit return types, schema/SQLite builders were split for formatter safety. **Post-Prettier <900, function <50, Jest 37 execution, tsc, ESLint, SQLite adapter, SQL/server, device and Save remain Root verification items**. No npm, scripts, emulator, provider, native binary, database writes, migrations or command execution was initiated here.

**T043 TEST AUTHORING CHECKPOINT PUBLISHED — EXPECTED MISSING T048 MODULE/T046 VERSION RED — OWNERSHIP RELEASED — ALL WRITES FROZEN.**

---

## 9. T043 bounded Root-review corrections — technical alias clarification still pending

**Grant:** same owned UI branch, starting remote `36ad9ae8ac5c0a46ad6b666ce5823ee2ac462131`, four test/helper files plus this report only. Production, new financial action schema, T025/T042/T044/T045 files, SQL, routes, core logic, T015 JSON and other branches remain frozen.

- **S19/S20/S24/S35 positive control repaired:** `makeSaveFixture("sms-all-dedup")` now selects fingerprint **B**, the exact fingerprint seeded as already-saved in an active **owned transaction or transfer**. Added **S19b**: existing fingerprint **A** with selected **B** must *not* dedup and should create one action/one additional selected financial row. S21/S22 preserve deleted/foreign fingerprint negatives. No intentionally mismatched seed is treated as a successful dedup baseline.
- **S29 genuine same-instance retry:** one `const writer = service(database)` and **same `frozenInput` object** are reused for adapter UNIQUE-conflict failure and subsequent retry. The real `injectMidBatchDuplicate` adapter fault, fresh SQLite snapshot checks and one final root/transaction/effect assertions remain; no substitute mock rollback or changed action ID.
- **S09 claim corrected:** a **Zod-valid** different selected-row reference is rejected against the unchanged current canonical session, with zero writes. This is **pre-action frozen-selection mismatch**, **not** proof of an existing pending action blocking a changed otherwise-valid selection. The true *pending-root + changed selection* branch remains **uncovered by S09** until a separately approved T043 test sets a genuine pending canonical action; S09a same-intent doubletap and S26 replay are distinct, not interchangeable proof.
- **SMS v2 required for every T043 happy Save seed:** `seedSmsReviewDrafts` now invokes future `encodeSmsReviewDraftV2({transaction,review})` with the frozen exact v2 review context `{ownerId,sessionId,sourceRevision,preferredCurrency,reviewRevision,operationGeneration,row,groups,removedEvidenceKeys}`; `groups` carry complete linkedRowIds for that row. It parses the returned JSON through future `smsReviewDraftPayloadV2Schema` and requires outer/inner version **2**. **Neither export exists yet on the current UI/main/T010 context**: explicit **additional creation Red** until separate T025 codec integration. This call signature is a test-facing technical proposal for Root/T025 to align; **no manual `JSON.stringify` v2 pretender or v1 fallback**. A separately named `seedLegacySmsReviewDraftsV1` uses the unchanged historical encoder for explicit legacy migration coverage only; T043's new-v2 Save assertions do **not** claim v1 migration behavior.
  
### Proposed strict `plannedEntityIds.localRef` technical linkage — Root freeze required, helper NOT changed

T004 already defines `plannedEntityIds: {entity,localRef:UUID,id:UUID}[]` with globally distinct aliases/created IDs. No group-account/child linkage is encoded by array position; `testUuid(600+index)` for accounts and `testUuid(620/640+index)` for children in **current test fixture** have **no canonical group linkage**. The future writer cannot infer which group/child they belong to by sorting/index. Proposed use of **existing fields only**, no new DTO/schema/business rules:
1. A selected financial transaction/ATM transfer maps **`localRef = selected canonical row.rowId`** with exact `entity="transaction"|"transfer"`; it resolves the frozen `id` only by `(entity,localRef)`, never index.
2. A genuinely required confirmed new group account maps **`entity="account", localRef=group.groupId`** (the canonical group UUID already in `confirmedGroups` and selected row assignment). The writer checks `group.status="confirmed"`, unchanged identity/revision/evidence and that a selected reference requires creation. A reused existing account or unselected group produces **no account or child create entry**.
3. For a necessary BANK details child, derive its *local-only canonical UUID alias* from **SHA-256 of `JSON.stringify(["account-review-localref/v1",ownerId,sessionId,groupId,"bank_details"])`**, formatted as UUID with fixed version/variant nibble, then freeze it in `plannedEntityIds` with `entity="bank_details"` and independently minted stable create `id`. **At most one** BankDetails per new BANK; none for Cash/Wallet.
4. For each approved new account sender child, use **SHA-256 of `JSON.stringify(["account-review-localref/v1",ownerId,sessionId,groupId,"account_sms_sender",normalizeAccountSmsSender(senderName)])`** with the same UUID formatting. Normalize and sort unique sender names, require one planned entry per actual child; reject duplicate normalized sender/alias, mismatched parent or stale group. This alias uses existing group `senderNames` and owned normalization, never array order, raw SMS or client-supplied fake parent ID.
5. The **new account ID** is the frozen `plannedEntityIds[].id`, *not* its group localRef; all child `after.accountId` must reference that exact frozen ID. Reject missing/extra planned creates, duplicate IDs/localRefs or cross-entity alias collisions before preparation. Identical freeze/replay recreates **identical alias→ID mapping** and canonical hash. The intent freeze computes it once; the writer rederives/verifies the same mapping using trusted session/group data.
6. For new **ATM Cash destination**, when `toAssignment.state="suggested"` names an approved canonical group, use that **groupId** account localRef. When no stable destination group or other canonical existing identity is recorded, **STOP**: T004 has no extra alias link to prove the target; do not infer by row index, first Cash/default or name guess. Root/T030/T048 must freeze a precise source-grounded mapping using existing destination evidence before authoring that branch; never add a field/schema or fabricate Cash without owner approval.

**Technical decision needed:** Root/T027/T048 approve or correct this exact alias derivation/contract before changing `plannedAccountIds` in the test helper or implementing production. It is **PLAN ONLY for mapping**. This is not new account creation policy and does not override the closed T004 wire contract. Migration slots remain **090/091** after main occupied 089.

**Evidence boundary:** Root verified older SQLite harness **2 suites/8 PASS on main**, not these suites. New T043 still has intentional missing T048 Save service, T046 financial tuple and now T025 v2 codec creation Red; **0 new behavior PASS claimed**. No npm, native binary, SQLite execution, emulator, provider, SQL or remote DB operation by this worker.

**T043 BOUNDED FIXES PUBLISHED — ALIAS MAPPING AWAITING ROOT FREEZE — ALL SOURCE WRITES RELEASED / FROZEN.**

---

## 10. T043 approved closed-field alias freeze — bounded correction receipt

**Technical freeze is now APPROVED**, superseding §9's "alias awaiting freeze"
wording. This is no new schema, product rule, account policy or public API.
Current lease changed only the three previously authored T043 test/fixture
files, **this** validation report, and strictly appended technical notes in
`contracts/wire-shapes.md` and `contracts/review-commands.md`.
`account-review-save-sqlite-test-helpers.ts`, including the actual v2
`encodeSmsReviewDraftV2({transaction,review})` and
`smsReviewDraftPayloadV2Schema` boundary, remains byte-identical.

- **Closed aliases:** `plannedEntityIds[].localRef` is selected `row.rowId`
  for transaction/transfer, needed `group.groupId` for account, and exact
  SHA-256 of `JSON.stringify(["account-review-localref/v1",ownerId,sessionId,
  groupId,"bank_details"])` for BANK details or that array plus
  `"account_sms_sender",normalizedSender` for sender; convert digest with
  **existing pure** `uuidV8FromSha256` from the published normalization
  branch `codex/395-normalization-worker@decf68ebcbe390d2e94be70e67b19b77e1cc4546`
  (`packages/logic/src/account-review/identity.ts` blob
  `9d97854be1bed5e14d5cdcdb2a3a1e5526a6f05a`). Test-only Node
  `createHash("sha256")` provides reference bytes; **no duplicated UUID
  bit code**. This identity module is **not in the current UI branch** until
  integration, so another missing-module creation Red is expected. Actual
  created `id` remains a distinct frozen UUID; grouping never uses array
  order as a linkage. All ID/time/selected/revision snapshots freeze before
  async Save; revalidate current state after awaits.
- **Sender policy:** the test helper imports actual mobile
  `normalizeAccountSmsSender` — trim, collapse `/\s+/g`, lower case, no NFC —
  and deduplicates equivalent sender names per current
  `uniqueTrimmedSenderNames` policy. Production T027/T048 will use pure shared
  normalization or an injected mobile delegate, **never logic→apps imports**.
  New **WALLET** has three case/whitespace variants of the same sender but only
  **one sender child and zero BankDetails**; BANK has at most one details child,
  CASH none. `S10b–S10e` and real-SQLite `S25b` assert count, account type,
  physical parent, exact alias UUIDs and duplicate alias rejection.
- **Prior-root coverage:** `S09b` first persists a genuinely hashed action
  through the real future Save service, stages that durable root as
  `pending_local`, and then submits a **different schema-valid** QNB
  selection/revision with the **same action ID** through the same writer; it
  must reject without changing linked rows. The pending status is deliberately
  staged and **does not claim a real in-flight half-commit/concurrent adapter
  race**. Old `S09` remains an honest pre-action consistency check; `S09a`
  double-tap, `S26` restart replay and `S29` **same writer/same frozen input**
  actual SQLite UNIQUE rollback+retry remain intact.
- **Dedup controls:** `S19/S20/S24/S35` seed the **actual selected SMS
  fingerprint** through `selectedSmsFingerprint`; separate `S19b` still
  deliberately seeds a different fingerprint as negative control. Selected
  old root lookup precedes all-dedup cleanup. Happy SMS save fixtures remain
  strict future **v2** and never fall back to a fake V1 payload; the explicitly
  named legacy V1 seed remains a migration-only option, separately owned T025.
- **ATM freeze:** the current S17 fixture sends SMS ATM from eligible BANK to
  an **existing owned CASH** destination; no new ATM destination group is
  manufactured. A genuine future canonical destination `toAssignment`
  suggested group would map by its groupId, not row position. T034/T036 will
  route `choose_row_account` eligible CASH to destination, BANK/WALLET to
  source and preserve the other endpoint; this is **not UI implementation**
  or a new source-Cash allowance.

**Readback count after this lease:** **44 authored cases = 31 service + 13
real-SQLite**, preserving all 38 earlier named tests plus the focused alias,
Wallet and pending cases. Every test/helper file remains under 900 **raw**
lines (fixture 410, service 454, SQLite 306, SQLite helper 311; formatter may
change these). Production T048 service/T046 action validator, T025 v2 codec
and the unmerged Core identity module are still genuine **creation Red
dependencies**; no behavior Green or native SQLite run was claimed. Root's
existing main-only **2 suites/8 SQLite tests PASS** is readiness of old
tests only. Migration slots: **090 review / 091 default** after main occupied
089. Source/SQL/index/sync/UI/seed/route/locale files remain frozen.
Root must run actual T043 Red and later focused TypeScript, Jest, prettier,
lint and full SQLite once integration permits; SQL owner-lock proof still
gates server registration/shipping.

**T043 APPROVED CORRECTIONS PUBLISHED — SOURCE OWNERSHIP RELEASED — ALL WRITES FROZEN.**
