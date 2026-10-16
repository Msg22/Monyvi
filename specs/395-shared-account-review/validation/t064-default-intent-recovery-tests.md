# #395 T064 — Add Account default-intent recovery tests (TESTS ONLY)

**Date:** 2026-10-16  
**Immutable source parent:** c80a54516a391b0687e194dbe6516bffd6089281  
**Trusted governance:** 503f5a1336ba23f6d270615ce1ba47b02116e4f0  
**Approved contract source:** 1264134305c126a7836cf09e8f7843609a8c8555  
**Owner:** replacement independent tests-only Normal ChatGPT lane. The earlier Add Account chat is closed; no unpublished work or result was inferred or imported.  
**Status:** **AUTHORED / NOT RUN**. No TypeScript, Jest, SQLite, ESLint, formatter, schema, SQL, native, provider, deployment or CI command executed. No branches/refs, PRs, comments, issues or local files modified.

## Exact new files

1. packages/logic/src/financial-actions/__tests__/account-create-default-test-fixtures.ts
2. packages/logic/src/financial-actions/__tests__/account-create-default.test.ts
3. apps/mobile/__tests__/services/account-default-intent.test.ts
4. specs/395-shared-account-review/validation/t064-default-intent-recovery-tests.md (this report)

No owned existing file, production module, generated schema, SQL migration, UI component, or E2E file was edited. All four paths were independently confirmed absent in the exact parent.

## Actual sources reviewed

At governance: AGENTS.md, Constitution, the offline-financial-systems-engineer portable persona and offline-financial-systems skill; team-led authority already verified by this Normal chat. At approved feature revision: contracts/account-default-intent.md and contracts/wire-shapes.md (not an invented DTO). At the exact parent: account-service.ts (both zero and nonzero create flows), account-validation.ts, account-sms-sender-service.ts, core-account-financial-action-service.ts, account-core-writer-service.ts, account-core-writer-production.ts, action-registry.ts, account-balance-effects-registry.ts, review-batch-save-shapes.ts, review-batch-save.ts, current account-service guarded-create tests, account-review-save SQLite ledger/model helpers, user-data-access.ts and current legacy registry tests. Source read confirmed the existing SQLite adapter, real model registry and physical fresh-clone helpers.

## API inventory / tests-first boundary

- **Pure existing API:** accountDefaultSnapshotSchema from review-batch-save-shapes.ts. The currently published shape has exactly activeAccountIds and defaultAccount, but does not yet enforce the frozen membership, uniqueness and sorted-ID invariant. Authored negatives are intended to expose that gap.
- **Approved future pure API (not present at parent):** accountCreateDefaultPayloadSchema, validateAccountCreateDefaultPayload and inferred AccountCreateDefaultPayload from the focused planned financial-actions/account-create-default.ts module. The tests import these names statically and derive all mutation/account types from the canonical future payload. No copied public DTO, separate business union, any, assertion cast or fake validator.
- **Mobile existing callable entrypoint:** createAccountForUser(userId, data) and the existing accountFormSchema. Tests supply the additional explicit defaultIntent through the actual validated form shape rather than creating a second account DTO or fake SUT. At the parent accountFormSchema strips this new property and createAccountForUser does not provide later ON; the new tests intentionally require future changes.
- **Root API decision requested before source:** prefer retain createAccountForUser(userId, validatedAccountFormWithDefaultIntent) as the UI entrypoint, with a strictly internal canonical Add command preparing/fixing action ID, account/child/effect IDs, expectedDefaultSnapshot and dependency action IDs before awaits. Root must approve the precise internal command signature and ownership before implementation. Do not bolt an Edit-default toggle onto create.

There is NO existing account-create-default module to import at this immutable parent. Therefore the pure suite is a **creation-stage missing-import Red with zero loaded assertions**, not an observed behavioral Red or Green. The mobile suite uses the genuine existing SUT and real SQLite, but it was also NOT RUN.

## Pure contract cases (20 declarations plus 8 parameterized omitted-key cases)

- All eight frozen tuple root keys; omission, extra nested/root properties, old-version or mismatched-operation rejection.
- Exact default snapshot: sorted/unique active owned UUIDs; default true/null only; membership, absent default, invalid/foreign-looking ID and malformed multiple-default evidence.
- First active account always ON, even if caller sends OFF; later OFF retains existing default or deliberate no-default; later ON clears only the captured prior ID; ON with no prior default creates without a clear.
- **Wrong-clear-ID negative specifically protects the 091 SQL regression:** change account_default.after.id to a different valid UUID, **also update domainRecordRefs to match the forgery**, then require schema/validator rejection. A test must not pass solely because refs are inconsistent.
- The clear has expectedIsDefault:true and after:{id: captured prior ID,isDefault:false}; no expectedUpdatedAt, full-account metadata/balance replacement, duplicate clear or createGuard for an update.
- Add zero-opening has empty accountEffects, zero financial guards/adjustment transactions, exactly one account plus approved sender/bank children, and new revision stays "0" at service boundary.
- Add nonzero opening 10.01 has a single +1001 EGP effect, no balance-adjustment transaction, and new revision becomes "1" at service boundary; negative mismatched/missing/duplicate/noncanonical effects fail.
- Guards, domainRecordRefs and mutation membership are closed and identical; reject missing bank/sender guard, missing ref, duplicate ID, orphan child, forbidden Bank child for Cash, malformed sender evidence and deleted creation.
- Retain deployed account.balance-effects/v1 create/edit registration/canonicalization unchanged; opt-in new Add tuple is not assumed present in the existing default registry.

## Mobile physical SQLite cases (16)

Tests reuse the actual account-service and already-existing Watermelon SQLite schema/models, fresh adapter clones, seeded authenticated/foreign/deleted owners, real account/bank/sender/action/effect tables and physical before/after snapshots. Dependency failure injection affects only the actual child-create collection method; the account-service SUT is never mocked.

- First Cash OFF forced ON, zero balance, revision 0, no effects.
- Later OFF preserves A; later ON replaces **only** A, preserves unrelated account B, balance and financial revision; ON/OFF with intentionally no default.
- Current default scope excludes foreign and deleted entries; foreign actor cannot create locally under the wrong owner.
- Zero Bank creates exact sender/bank children without action/effect; nonzero 10.01 creates exactly one effect/root, no duplicate transaction, revision 1.
- Inject child failure and compare all physical rows from fresh SQLite for atomic rollback; invalid form and duplicate submission leave physical state unchanged.
- Wrong-owner and wrong-default state must fail closed, with conditional multiple-default handling: if SQLite unique constraints already forbid the inconsistent fixture, prove that instead; otherwise require the service to reject it without mutation.
- Concurrent first different account creates must yield at most one owned active default.
- Duplicate nonzero submission preserves original persisted financial action/effect IDs through fresh SQLite clone; **not** proof of server replay/hash semantics.

## Deliberate limits and successor gates

1. True stale snapshot races — A→B→A equivalent state versus a changed default, changed active-ID set, newly inserted/deleted default, and concurrent default writer — require a frozen local command snapshot and a test-visible but production-safe writer/dependency seam. The existing createAccountForUser exposes neither snapshot nor action token. **Do not invent a debug API**; Root should approve the canonical internal boundary first. Server serialization/SQL 091 and the reported wrong-clear-ID 107/108 SQL result remain separate owners.
2. Canonical action replay by identical actionId/hash, conflicting hash rejection, dependent offline action IDs, restart compensation and financial root postimage CAS cannot be proven by a duplicate form submit or by the old create entrypoint. Add those focused tests with the actual future command/writer contract after Root API approval and source grant.
3. The optional local failure injection is not native UI/device proof or a hosted transaction. A future prepared-create writer may use prepareCreate instead of create and requires a corresponding injection at the actual atomic commit seam; do not loosen whole-group rollback assertions.
4. The existing source retains different zero/nonzero paths and does not yet implement default-intent preservation, actor validation for all paths or single atomic default+children+opening command. Failures are *expected*, but no behavioral results have been observed here. No claim that all 16 mobile cases load/execute until Root runs them.
5. No source activation of an unregistered tuple, legacy removal, Supabase mutation, schema update, provider call or cross-lane access is authorized here.

**Requested Root successor:** verify four path blobs and changed-only commit ancestry, inspect API seam, execute creation Red under controlled source readiness, then grant source implementation only after accepting exact contracts. No Green/SQLite/native/SQL claim is made.

**STOP — test ownership released to Root.**
