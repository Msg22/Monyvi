# #395 T051 — Generic reconciliation cannot recover new Review/Add tuples

**Date:** 2026-10-16  
**Exact immutable source parent:** `0fefb1f7dedaf1399b0c1a8fdd8c216799e95c75`  
**Parent tree:** `868146a92425b8e85ed46f5fd7acf409f6a504dc`  
**Exclusive change scope:** `apps/mobile/services/financial-action-reconciliation-service.ts` and this new report only. **SOURCE CANDIDATE; NOT RUN, NOT GREEN.**

## Root-reproduced source blocker (not a fixture defect)

The frozen generic factory loads a reconciliation bundle and immediately proceeds through either `verifyCanonicalAccounts`/canonical installer (`financial-action-reconciliation-service.ts:490–509`) or `buildCompensation`/generic inverse account/effect writer (`lines 511–515`). That legacy inverse path does not require new Review private root, created-account/Bank/sender/transaction/transfer postimage, default preimage, SMS queue lifecycle or selected-draft restoration. A zero-effect Add default mutation can also be incorrectly treated as already complete by the generic inverse/replay path. Thus a complete source-specific reversal cannot be authorized by legacy account/effect snapshots.

Root reported genuine behavior from unmodified `account-review-sync.test.ts` **T044-15/16/17**: the direct generic service incorrectly returned `reconciled` instead of refusing the new Review tuple. These are existing meaningful negative tests; no test assertion or fixture was touched by this source lease.

## Minimal fail-closed correction

1. Define the exact two protected tuples from **existing authoritative pure definitions**, never the untrusted nested payload discriminant:
   - `createReviewFinancialActionDefinitions(ACTION_REGISTRY_ERROR_CODES.INVALID_PAYLOAD)[0]`: `transactions / review_batch_save / review.batch-save/v1`
   - `ACCOUNT_CREATE_DEFAULT_TUPLE`: `accounts / create_with_default / account.create-default/v1`
   - Use the existing opt-in `createAccountDefaultAndReviewRegistry()`, not a broadened global/default registry, DB schema, new type, provider callback or SQL registration.
2. On a direct `createFinancialActionReconciliationService().reconcileRejectedAction` call, after the existing action-ID identity check but **before any canonical snapshot installer, generic inverse compensation, replay or mark-complete callback**, `assertLegacyRecoveryOnly(bundle)` inspects the top-level tuple/version claim. Ordinary unrelated legacy envelopes bypass this new guard and preserve the original branch behavior.
3. If the bundle claims either protected kind **or** payloadVersion, parse the full serialized envelope through the **registered feature-scoped parser** and reserialize it through the existing `serializeFinancialActionEnvelope`. Require exact canonical byte equality, `envelope.actionId === bundle.actionId`, `envelope.userId === bundle.userId`, `envelope.domain === bundle.domain`, and exact membership in one of the two authoritative registered triples. A spoofed/malformed/foreign/direct feature envelope fails closed with the existing stable `FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE`; an invalid JSON blob visibly claiming either reserved tuple likewise cannot reach generic compensation.
4. For a valid, canonical, owner-bound **new Review or Add** envelope, throw the existing stable `FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INCOMPLETE` error. Do not execute `installCanonicalSnapshotAtomically`, `commitCompensationAtomically`, generic `buildCompensation`, or return `reconciled`/`replay`. The bundle and all local/private/root evidence remain unchanged and recoverable through the appropriate dedicated path. No new error-code family or DTO is introduced.

## Existing production dispatch audit — guard is safe and cycle-free

`apps/mobile/services/financial-action-reconciliation-production.ts:487–511` first loads an authenticated owned root and reasserts current actor. For `root.kind === "review_batch_save"`, it **already calls** the dedicated `reconcileRejectedAccountReviewInSqlite` service, performing private snapshot, postimage, actual owner, queue and effect proof within a writer; it does **not** call this generic factory. For `root.kind === "create_with_default"`, it already refuses `INCOMPLETE` instead of invoking the generic factory. Only other legacy tuples route into `legacyFinancialActionReconciliationService`. The new feature-scoped pure registry imports have no dependency on the mobile production dispatcher, avoiding a cycle. If a misclassified Review/Add ever reaches the generic base factory, it now refuses instead of performing unsafe compensation.

**Add is NOT reconciled or implemented by this correction.** The new Add tuple's complete zero-effect account/default/child rollback, accepted default state, predecessor interactions and replay must be separately implemented and independently tested under Panel/Root ownership. This guard only closes the unsafe direct generic path.

## Regressions and deferred gates

- **Review T044-15:** complete new Bank + bank child + sender + SMS cleanup cannot be replaced by generic inverse account effects without verified restoration: direct factory must reject `INCOMPLETE`, zero `commitCompensationAtomically` calls.
- **Review T044-16:** a valid public feature envelope paired with a foreign reconciliation bundle user must reject `INVALID_EVIDENCE`, zero callbacks.
- **Review T044-17:** Voice zero-net Review with an immutable zero effect cannot complete through generic inverse; must reject `INCOMPLETE`, zero callbacks.
- **New Add:** direct generic factory with a canonical registered `account.create-default/v1` envelope must also reject `INCOMPLETE`, **even with zero account effects** or previously-reconciled metadata. Do not report Add-specific safe recovery/accepted compensation.
- **Legacy/metals/SMS durable:** unchanged default parser, canonical account proof, SMS-draft restoration, legacy inverse financial-effect fallback, existing stable error codes and runtime production route. Feature guard is exercised only for protected tuple claims, not for arbitrary legacy financial bundles.

**NOT RUN:** Jest (including T044-15/16/17), TypeScript, lint, formatter, SQLite, DB/SQL/pgTAP, native/emulator, provider, hosted, Speckit checks or regression batches. No test changes or new tests were authorized. Root owns grouped physical/legacy checks, independent review, any next correction ownership and final acceptance. No refs, branches, pushes, PR comments/metadata, deployments or delegation/Codex. GitHub GitData only creates the unreferenced changed-only two-file commit.

**SOURCE OWNERSHIP RELEASED — STOP.**
