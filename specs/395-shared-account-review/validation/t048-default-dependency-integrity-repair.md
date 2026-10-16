# #395 T048 — Default Dependency Immutable-Root Repair

**Date:** 2026-10-16  
**Exact immutable parent:** `9b087d89e29f9fe8fa278f9b62d8ea996e5fdbfb`  
**Parent tree:** `e1aa20eb73c5c19b0ff05e6bf243f75dae92b3de`  
**Scope:** exclusive four source/test paths below and this new report; no other source or ownership lanes changed.  
**Status:** SOURCE CANDIDATE AUTHORED / **NOT RUN** / pending Root's grouped checks and independent review. No activation or Green claim.

## Grounded Red intake

Root executed the exact existing T048 real-Watermelon/SQLite predecessor suite at the tests-first child `9b087d89`: **15 cases, 10 controls passing and 5 meaningful malformed-owned-root negatives failing**. Those five prove the previous collector overlooked a changed stored `payloadHash`, changed `accountGuardsJson`, noncanonical raw `payloadJson`, and a creator disguised through stored `kind` or `domain`. This is Root-reported historical baseline; this author did **not** repeat it.

## Exact changed paths and bounded fixes

1. `apps/mobile/services/account-review-local-snapshot-defaults.ts`
   - **Required** `hashProvider: Sha256Provider` on the existing collector input, no default implementation or optional parameter. The existing approved `createAccountReviewFinancialRegistry()` resolves every unresolved owned candidate's canonical envelope **before** any domain/kind classification. The real `parseFinancialActionEnvelopeJson` and `hashFinancialActionEnvelope` check the exact serialized canonical text, SHA-256 and `JSON.stringify(envelope.accountGuards)` against `root.payloadJson`, `payloadHash`, `accountGuardsJson`. Parser/hash/provider failures or noncanonical bytes fail closed.
   - Compare exact stored `actionId`, `userId`, `domain`, `kind`, `domainReferenceId` with the validated envelope. The registry validates the `payloadVersion`/operationCode/schemaVersion closure; the Add and Review classifications additionally require their exact registered tuple, and Add is revalidated through `validateAccountCreateDefaultPayload`.
   - **Only a real `account/create`** with ID matching the Add action's `domainReferenceId` can establish an Add dependency. Never treat the prior-default `account_default/update` ID—even though it legitimately appears in domainRecordRefs—as a created account. Review retains only actual `account/create` records; registered unrelated legacy `accounts/edit_balance` and other known unrelated kinds remain independent, while unsupported/malformed owned account tuples fail closed. The established `unprovable_account_predecessor` diagnostic is retained for the original unsupported-kind test.
   - Immutable root fields are synchronously captured **immediately after the owned fetch, before subsequent awaits**: row ID, action/owner/domain/kind/reference, raw JSON/hash/guards, state/serverOutcome and logical deletion. Recheck these fields on the cached model after digest and actor recheck. After processing, re-query the actual owned unresolved root set, verify identical row membership and all captured fields, then reassert the **current authenticated actor**. An async hash, actor switch, added/removed candidate, root replacement or changed state cannot silently erase a dependency. This adds no side-effecting read and preserves the established same-writer final owner/postimage/cache guards in the foundation.
   - Resolved `accepted` / `reconciled` roots and the action being captured remain excluded as in the prior documented collector; unreferenced roots with an unsupported/malformed envelope cannot masquerade as unrelated *unresolved* actions.

2. `apps/mobile/services/account-review-local-snapshot.ts`
   - Thread the **existing** `SnapshotInput.hashProvider` through the actual `capturePrivateParts → captureReviewDefaultDependencies` call, alongside the unchanged preimage, created-ref and SMS hash captures. No new financial DTO, serializer, source/service path, snapshot field or resampling.

3. `apps/mobile/__tests__/services/account-review-default-dependencies.sqlite.integration.test.ts`
   - Pass the suite's **existing real Node SHA-256 provider** to the actual collector. All original **15** test cases, assertions, canonical registration/fixtures, real SQLite owned query and five intended Red inputs remain otherwise unchanged. There is no optional missing-provider shortcut that would make every negative pass with a generic TypeError.

4. `apps/mobile/services/financial-action-foundation-repository.ts`
   - Remove only three unused *imported* type names `FinancialActionLinkedOperationPostimage`, `FinancialActionLinkedOperationPreimage` and `FinancialActionLinkedOperationPreparedOwnershipInput`. All three existing public `export type` declarations remain present. The parent `9093c3d` local-root prepared setter, proof/capture/hash ordering, awaits, authenticating rereads, atomic commit and precommit cache restoration remain untouched.

5. **NEW** `specs/395-shared-account-review/validation/t048-default-dependency-integrity-repair.md` — this report.

## Intended Root check matrix / proof limits

- Original real SQLite D01–D15: canonical related Add; the five malformed signed/root column Reds; exact wrong action/reference/foreign owner rejection; unrelated valid Add; previous-default UPDATE never a creator; related Review; legacy edit_balance; unsupported owned action; foreign-root exclusion. **No tests run after this source change.**
- The new code's additional asynchronous root-membership/authentication protection is statically present but still needs a controlled concurrent read/hash test if Root wants independent timing proof; same-writer serialization is still the production safety boundary. No simulated hosted dispatch, actual SQL CAS, native restart, cloud pull, protected push, or once-only rollback was executed here.
- New pre-commit cryptographic and extra owned requery work may affect performance with many unresolved roots; runtime measurements not available. Genuine malformed unrelated owned unresolved roots will now refuse snapshot capture rather than be skipped. This is the requested fail-closed tradeoff, not a tested Green result.

**NOT RUN:** Jest, TypeScript, ESLint, formatter, SQLite, SQL/DB, provider, hosted, emulator/native or CI. **No** refs, branch updates, push, PR, deployment, other owners' files or delegation. Independent reviewer and Root own source acceptance.

**SOURCE RELEASED — STOP.**