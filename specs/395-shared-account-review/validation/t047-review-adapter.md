# T047 — explicit review batch-save core adapter, tests-only contract

**Status:** Authored, **NOT RUN**, not accepted as production or runtime proof.
**Ownership:** Only the new mobile regression test and this new note; existing
production, tests, registry, config, SQL, schema, and feature documents
untouched. **Trusted governance:** `de09f76bdadb570c99a1015bbf1c680279b0d5ad`.
**Mobile source snapshot:** `d8ef6bdb7e7c7fc7441527e0081d381c26d3b781`, verified
by Root to be the five currently installed source/test blobs below. **Financial
contract:** Accepted corrected T046 source plus reconciled current
`specs/395-shared-account-review/contracts/wire-shapes.md`. **Dependencies:**
T016 is pending; there is **no approved runtime registration**.

## Proposed smallest typed entry (not an implementation authorization)

Introduce a separate explicit factory next to
`createCoreAccountFinancialActionService` in
`apps/mobile/services/core-account-financial-action-service.ts`:

```ts
function createCoreReviewBatchSaveAdapter(dependencies: {
  readonly executeReviewCommand: AccountBalanceCommandService["execute"];
}): Pick<AccountBalanceCommandService, "execute">;
```

This is the **proposed** test import and signature, not a shipped API. Its
`execute` consumes the **existing** `ExecuteAccountBalanceCommandInput`:
`envelope: FinancialActionEnvelopeV1`, `hashProvider: Sha256Provider` and
`prepareDomainOperationPlan: () => Promise<FinancialActionLinkedOperationPlan>`.
Do not introduce a copied financial payload DTO, account-effect union, persisted
field, global registry default, synthetic plan, or new envelope version. The
factory must check the explicit
`transactions/review_batch_save/review.batch-save/v1` root and close/validate
the complete review payload and account/effect/guard correspondence via the
canonical **opt-in** T046 validator/definitions before calling its _separately
injected_ review-only command. On success it forwards canonical envelope, frozen
IDs, effects, guards, source refs, create guards, children, snapshot and local
cleanup descriptors without loss, aggregation, regeneration or provider-evidence
expansion. No default global registration.

**Important prerequisite, not hidden by the harness:** The existing
`createAccountBalanceCommandService` is **legacy-only** and explicitly rejects
`payloadVersion !== "account.balance-effects/v1"` in
`apps/mobile/services/account-balance-command-service.ts:322–350`. Its
foundation repository is constructed with one registry in
`financial-action-foundation-repository.ts:115–121` and hashes with that
injected registry at `:155–175`; it has no proven per-command review registry
path. T047 implementation/Root must provide an authorized, opt-in review command
route (or obtain an expanded source lease) that preserves **zero** financial
effects and verifies complete prepared account/child/transaction operations and
postimages. Do **not** feed review into the old command, globally allow
zero/empty legacy effects, use fake nonzero effects, or register runtime before
T016. If this prerequisite cannot be fulfilled under the lease, stop source
acceptance and return it to Root; tests must not be weakened.

### Minimum opt-in command routing prerequisite (T047/T048 design only)

This is engineering routing for the **already-approved** `review.batch-save/v1`
operation, not a new business decision, registration grant, or production patch:

1. **Registry injection/identity.** Compose a bounded registry from the existing
   legacy definitions plus `createReviewFinancialActionDefinitions` only for the
   review command route. The factory
   `createFinancialActionFoundationRepository({ ..., registry })` already
   accepts that dependency at
   `financial-action-foundation-repository.ts:115–121`. Its
   `prepareActionContext` validates the envelope **and** hashes the same
   canonical bytes using `dependencies.registry` at `:155–171`. Reuse one
   explicit registry instance for both; do not change the default global
   registry, activate the review tuple elsewhere, invent a second wire DTO, or
   broaden legacy v1 validators. The existing production singleton at
   `financial-action-foundation-repository.ts:916–926` binds
   `APPROVED_FINANCIAL_ACTION_REGISTRY` and must remain on its old route. The
   review-only composition must inject the opt-in registry into a distinct
   instance of the **same** factory, with the same database and owned-scope
   accessors; this is not a new store, writer or global activation.
2. **Narrow mobile command.** The current
   `createAccountBalanceCommandService.execute` uses default canonicalization
   and hard-rejects non-`account.balance-effects/v1` at
   `account-balance-command-service.ts:322–350`; feeding review directly into it
   cannot work. Provide a separately constructed, explicitly injected
   `executeReviewCommand: AccountBalanceCommandService["execute"]` implemented
   by a review-only command path. That path validates the exact
   `transactions/review_batch_save/review.batch-save/v1` envelope using the
   opt-in registry, then submits to the existing foundation
   `commitFinancialActionGroupLocally`; never run the legacy
   `canonicalizeEffects` or `buildEnvelope` transforms, and do not clone the
   entire legacy command service. Keep the existing
   `ExecuteAccountBalanceCommandInput` envelope/hash-provider/plan callback.
3. **Guard/effect CAS and prepared plan.** Treat the immutable envelope's
   `accountGuards` as the complete, ASCII-sorted affected account set, paired
   one-to-one with **all** exact currency-matched `accountEffects`, including
   zero-net `"0"`. Preserve each current owned account's expected financial
   revision; zero net leaves its balance unchanged but advances revision once.
   Check `creationDefaultSnapshot` iff new accounts exist, revalidating the
   captured active owned IDs/default and minimum frozen created-account UUID.
   Keep Add's `expectedDefaultSnapshot` separate. New account guards are `"0"`
   **plus distinct `expectedAbsent` create guards**: revision zero never
   establishes absence. The T048 writer must re-read owner, active/eligible refs
   and current revisions inside the atomic writer, verify full
   `domainMutation`/`domainRecordRefs`/`createGuards` identity parity and
   category/fingerprint/currency conditions, and ensure each prepared account,
   BANK details, sender, transaction and transfer belongs to its frozen action.
   It must validate prepared account/child/financial postimages and guarantee no
   foreign/deleted-ID collision or reparenting; do not infer a stored revision
   for an absent account or omit zero-effect account postimages.
4. **Reuse foundation lifetime and rollback.** Keep the caller's real
   `prepareDomainOperationPlan` callback, returning the existing
   `FinancialActionLinkedOperationPlan` with complete `preparedCreates`,
   `existingOperations`, `assertCachedOwnership` and `assertPreparedOwnership`.
   The foundation at `financial-action-foundation-repository.ts:523–760` already
   snapshots/cache-guards the owned plan, reasserts the authenticated user,
   checks prepared postimages, commits root + linked operations in one local
   batch and restores prepared/cache snapshots on precommit failure. T048 must
   supply those complete operations **inside** that callback—not synthetic
   creates outside the writer or generic metadata push. Same action-ID and
   canonical hash resolve replay or mismatch before re-preparing effects; local
   failure leaves no partial account/child/balance/review-side effects. Future
   server owner-wide CAS, protected sync, absence checks and reconciliation are
   separate acceptance gates; these tests do not prove them.

**Smallest future source write allowlist (separate Root authorization):**
`apps/mobile/services/core-account-financial-action-service.ts` for the opt-in
adapter, and **either** a cohesive new review-command helper next to
`account-balance-command-service.ts` **or** a bounded review-only path within
that service. A separately owned new review-production composition module must
inject the opt-in registry, same database/owner accessors and typed executor;
`account-balance-command-production.ts:19–40` currently owns the legacy
command's prepared-effect factory, so Root may need to authorize one small
shared effect-preparation extraction rather than duplicate its logic. T048
separately owns the new `apps/mobile/services/account-review-save-service.ts`
for frozen owned account/child/financial preparation and plan assertions. The
existing `financial-action-foundation-repository.ts` factory already supports
explicit registry injection; changing its production singleton is **not** a
prerequisite. If any further composition dependency is unavoidable, Root must
reserve that exact path before granting source. Default registry, existing
legacy route, global index, runtime activation, contracts, SQL, sync and
provider paths remain excluded from this tests/report lease. No automatic source
ownership expansion.

The older `canonicalizeEffects` in
`core-account-financial-action-service.ts:168–237` drops every net-zero effect
and throws on an all-zero batch. `buildEnvelope` at `:384–430` always emits
`account.balance-effects/v1`. The proposed review-only entry must not call
either legacy transform. Preserve existing `.execute` behavior and all existing
test files exactly.

## Authored case inventory (32 cases)

| Area                                                  |  Cases | Exact intended proof                                                                                                |
| ----------------------------------------------------- | -----: | ------------------------------------------------------------------------------------------------------------------- |
| T046/opt-in positive control                          |      1 | Real closed payload and opt-in canonical envelope; no global-registry assumption about future T016                  |
| Existing zero-net & new zero-net                      |      2 | Retain exact zero account effect, guarded revision, selected financial rows and created-account `"0"` guard         |
| Currency-distinct Voice Cash & mixed account types    |      2 | Two Cash currencies together; Cash/Bank/Wallet creates, one required BANK child, exactly one first default          |
| Existing owned active/no-default & SMS Bank           |      2 | Snapshot retained, no default rewrite; existing sender/bank child/fingerprint and SMS cleanup descriptors unchanged |
| Current ATM and plan lifetime                         |      2 | Eligible existing Cash destination (no invented create); writer plan callback forwarded, not executed eagerly       |
| Deterministic immutable retry intent                  |      1 | Same action ID and byte-identical canonical serialization across separate capture calls; not a durable replay claim |
| Wrong envelope domain/kind/version                    |      3 | Reject all three before command dispatch                                                                            |
| Wrong canonical root/zero guard/omitted zero effect   |      3 | No root spoof, no missing affected-account guard, no global zero-effect filtering                                   |
| Wrong aggregate/revision exhaustion                   |      2 | Exact selected delta and next-revision bound fail closed                                                            |
| Absent guard/new revision/unconfirmed account         |      3 | New account absence is separate from `"0"`; no invented confirmed group                                             |
| Wrong currency/BANK child/unselected financial record |      3 | Account/effect currency parity, required owned BANK child and selected-only records                                 |
| Duplicate effect identity/negative zero/raw evidence  |      3 | Unique effects, canonical signed integer strings, closed private wire                                               |
| Invented ATM Cash/legacy v1/future Add                |      3 | No ungrouped ATM Cash create, no legacy tuple mutation, Add remains separate                                        |
| Bad operation code and command failure                |      2 | Closed operation root; no duplicate executor invocation on boundary failure                                         |
| **Total**                                             | **32** | **Authored only — NOT RUN**                                                                                         |

### Fixture/harness rationale

- Uses published, synthetic **T046** canonical Voice, SMS, Cash, Bank, Wallet,
  ATM and legacy fixture objects directly. Account/transaction/create/effect IDs
  remain valid and sorted. No human data, new source-text fixture, fabricated
  currency conversion or bank child omission in positives.
- Calls **real** `validateReviewBatchSavePayload`,
  `canonicalizeFinancialActionEnvelope`, registry definition, and canonical
  serializer. The adapter under test is **not** mocked.
- Replaces **only** its typed downstream command executor, which captures the
  `ExecuteAccountBalanceCommandInput` and deliberately throws a sentinel before
  filesystem, database, sync, effect writes or network interaction. Positive
  cases compare the entire forwarded envelope with opt-in canonicalization.
- Tests keep `prepareDomainOperationPlan` as the existing callback type and
  prove it is forwarded without eager invocation. The empty typed plan is a
  command-boundary placeholder **only**: it does **not** claim complete
  WatermelonDB prepared creates or owned account postimages. T048/service
  integration and future SQL/pgTAP must independently prove those.
- Unknown malformed envelopes are intentional negative inputs. No `any`, no
  casts, no adapter/payload-validator/reducer SUT stubs, no new DTOs, no changes
  to the existing 240-case legacy baseline.

### Downstream prerequisites / honest limitations

1. **Meaningful initial Red:** `createCoreReviewBatchSaveAdapter` is
   deliberately absent from immutable `d8ef6...`; TypeScript/Jest may first
   report an import/suite-load failure. Do not misrepresent this as behavioral
   Red for all assertions. Root should observe the creation Red and later the
   individual fail-closed assertions under a separately granted source
   correction.
2. **Real account ownership / stale CAS:** Actual user-scoped active accounts,
   default snapshot, financial revisions and absent-create collisions must be
   rechecked inside the owned atomic writer/server transaction. The pure adapter
   cannot infer DB ownership or claim stale-state rejection from a supplied
   immutable envelope alone.
3. **Prepared effects/guards:** An account with zero net still receives one zero
   effect and one financial guard and its revision advances once even when
   balance is unchanged. New create IDs need independent `expectedAbsent`
   guards, revision `"0"`, complete account/child postimages, no invented Cash
   ATM group, no double-posted opening balance. This suite tests forwarding and
   pure fail-closed conditions, not actual prepared changes or durable recovery.
4. **Replay/hash:** Preserve action ID and deterministic canonical envelope
   bytes. Real SHA-256, same-ID changed-hash rejection, exactly-once replay,
   retries after ambiguous outcomes and sync compensation remain foundation/
   writer/server test responsibilities. No claim of an executed hash or durable
   replay test is made by the capture stub.
5. **Old tuple and future Add:** Existing `account.balance-effects/v1` behavior
   and old zero rejection remain on their existing pathways; the separate future
   `account.create-default/v1` tuple keeps its own contract. Metadata-only
   zero-opening Add may legitimately have empty financial effects/guards; that
   is **not** permission to remove the nonempty review financial effects/guard
   requirement.

## Source baseline inventory (read-only)

| Immutable path at `d8ef6bdb...`                                                | Git blob                                   |
| ------------------------------------------------------------------------------ | ------------------------------------------ |
| `apps/mobile/services/core-account-financial-action-service.ts`                | `8d7230a6e4071c650fe6dd7aa099de9d1a22cd18` |
| `apps/mobile/__tests__/services/core-account-financial-action-service.test.ts` | `f8faf6f9a602ffbc68050db8e360fdf69fbc0dc3` |
| `apps/mobile/services/account-balance-command-service.ts`                      | `dee44ad723ebae77068f51403e9da5880da920e6` |
| `apps/mobile/services/financial-action-foundation-contracts.ts`                | `8ce75657b380617c7d22e595e35f0853927afe1d` |
| `apps/mobile/services/financial-action-foundation-repository.ts`               | `596803cec19b6192ce654f9d987f063cc8360129` |

Both newly authored paths were **absent** on the immutable `d8ef6...` ref before
authoring. They must be installed as new files only; there are no old baseline
bytes to overwrite. Use the accompanying SHA256 manifest and patch to
mechanically import them.

**Validation:** tests NOT RUN; TypeScript NOT RUN; lint NOT RUN; formatting NOT
RUN; SQL/pgTAP NOT RUN; provider/device/runtime NOT RUN. Root remains the sole
owner of actual coherent checks, production grants, runtime activation,
independent review, final source acceptance and integration. **STOP after packet
handoff.**
