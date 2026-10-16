# #395 — T067/T068 Account Create Default source candidate

Date: 2026-10-16
Exact immutable parent: 40c0775f5bb3b61af786677f13fc62d08323e66f
Trusted governance: 503f5a1336ba23f6d270615ce1ba47b02116e4f0
Source candidate only; no acceptance, published reference, hosted change or registration into the global default registry.
Status: SOURCE AUTHORED; ALL CHECKS **NOT RUN**.

## Exclusive changed paths / interfaces

- apps/mobile/services/account-service.ts (scoped Add explicit-intent dispatch; legacy/no-intent path retained; reuse existing name/provider/currency duplicate predicate).
- apps/mobile/validation/account-validation.ts (add optional validated boolean defaultIntent and optional Bank accountNumber, no Edit form change).
- NEW apps/mobile/services/account-default-intent-command.ts (prepareAccountDefaultCommand(): frozen AccountDefaultPreparedCommand, one fixed action/account/bank/sender/effect ID family, exact money, canonical payload, immutable snapshot/dependencies, no IO).
- NEW apps/mobile/services/account-default-intent-snapshot.ts (readOwnedDefaultSnapshot; assertOwnedDefaultSnapshot; readDefaultCreatorDependencies reading validated durable owned action roots).
- NEW apps/mobile/services/account-default-intent-plan.ts (prepareAccountDefaultLinkedPlan(): FinancialActionLinkedOperationPlan with owner-scope CAS/absence/duplicate guards and prepared account, children, optional prior flag update, optional effect).
- NEW apps/mobile/services/account-default-intent-service.ts (createAccountDefaultIntentService(dependencies) exposes production internal prepare, commitPrepared, create; no debug API).
- NEW packages/logic/src/financial-actions/account-create-default-registration.ts (createAccountCreateDefaultDefinitions(), createAccountDefaultAndReviewRegistry(): explicit opt-in feature definitions).
- apps/mobile/services/account-review-financial-command-service.ts (feature-scoped Review+Add+all-legacy registry, Review executor remains Review-only, new Add executor uses the same foundation).
- NEW packages/logic/src/financial-actions/__tests__/account-create-default-registration.test.ts (4 pure cases: explicit Add tuple, untouched global legacy registry, Review continuation, correct zero envelope, forged-clear rejection).
- NEW apps/mobile/__tests__/services/account-default-intent-atomic.sqlite.integration.test.ts (13 real Watermelon/SQLite cases, no fake business SUT).
- NEW specs/395-shared-account-review/validation/t067-t068-account-default-production.md (this report).
No generic foundation contracts/repository/private capture, sync/reconciliation, UI hooks/screens/components/locales, SQL, migration, schema or other owners' paths were modified.

## What the candidate implements

createAccountForUser(userId, validatedInputWithDefaultIntent) remains the external Add entrypoint. An **explicit boolean intent** branches to the new feature command. Unadopted callers without defaultIntent retain their deployed legacy create path until T070 UI integration; ensureCash, core legacy create and Edit are unchanged.

The internal service validates the existing accountFormSchema, authenticates owner and reads only active owned accounts. It rejects multiple active owned defaults, captures sorted complete active IDs and zero/one true default ID, and deduplicates original name/currency/provider identity. It freezes a canonical eight-key account.create-default/v1 payload, original owner, form, source-time, action ID, new account and child UUIDs, opening-effect UUID if needed, and predecessor action IDs **before** entering the foundation. It uses the already-deployed Decimal half-even money helpers with canonical minor-unit text and rejects overflowing or non-exact JavaScript monetary projections.

A prepared command's domain mutation is exactly one new account, optional Bank details, normalized distinct SMS senders for Bank/Wallet, and at most one captured prior-default clear. The clear is {entity:'account_default',mode:'update',expectedIsDefault:true,after:{id:capturedId,isDefault:false}} — no full metadata rewrite, revision/balance overwrite, post-create Edit toggle or independent ACK. OFF with active accounts preserves a prior default or deliberate no-default. First active account forces ON; later ON clears only the captured preceding default. Cash has no Bank/SMS child. Optional Bank account number and card suffix retain existing fields, and Edit never changes. Zero opening prepares revision '0', a complete metadata/create root, and **zero** financial effects/guards/adjustment transactions. Nonzero opening prepares revision '1' and exactly one effect amount/currency/account matching the canonical request; no adjustment transaction.

The T048 feature-specific foundation remains the sole writer. Inside its database.write(), the linked plan rereads owner scope, active-owned full default snapshot and duplicate identity, and rejects changed membership/default, deleted or foreign reference, invalid missing old default, or physical create-ID collision (including foreign/deleted ID). The actual foundation prepares/cache-guards the previous default and immutable postimages, invokes no review-only private callback, and atomically commits root+account+children+flag update+effect through commitPreparedBatch. The prepared ownership callback does NOT incorrectly resample isDefault after Watermelon has already prepared the prior flag update: that would cause false stale rejections; it instead validates postimage membership and authenticated owner with the foundation's immutable preimages.

A second commitPrepared(original) reuses the same frozen action ID/payload hash; the foundation returns replay without recreating rows. Changed content for that same action ID is rejected via canonical root hash. The durable creator dependency reader considers all validated known legacy/Review/Add root payloads with account-create mutations referencing captured active/default IDs, selects noncanonicalized predecessors by action ID, and freezes IDs only internally. It does NOT add a ninth cloud payload field, new sync private format, transient UI-only DAG or dependency network behavior. Recovery separately rederives authoritative dependencies after restart and must block missing/rejected/unsupported/cyclic predecessors.

## Critical integration gate: extra ownership required (out of scope)

The current shared packages/logic/src/financial-actions/action-contracts.ts canonicalizeFinancialActionEnvelope() allows nonempty accountGuards only for account.balance-effects/v1 or review.batch-save/v1. The exact **new account.create-default/v1 with nonzero opening must have [{accountId:newId,expectedRevision:'0'}]**. That mandatory guard is presently rejected by the shared ELSE branch at approximately lines 356–367, even though this feature's Zod definition is registered in its explicit factory. The new source deliberately retains the guard and the real SQLite nonzero acceptance test deliberately remains Red until Root grants separate narrow ownership to extend action-contracts with an Add-specific guard/effect/account-reference cross-check. DO NOT bypass by removing account guards, disguising the new payload as the old tuple or globally allowing arbitrary nonempty guards. No modification of action-contracts.ts was made without authority. Consequently T068 NONZERO IS NOT EXECUTABLE / GREEN and this candidate MUST NOT be admitted for production.

Additionally final SQL 091 transaction-level owner serialization, current default-clear-ID integrity, legacy/generic account writers, action registration and protected sync/recovery remain independent review gates. The local schema has no SQL029/033 server partial active-default unique index; local prepared creates and old-default flag are committed atomically with final sole-default state. Server SQL must clear the verified original default under same owner lock before inserting a conflicting new true default and retain the partial unique index. Do not deploy until SQL owner proves locking/precedence and races.

## Test inventory (AUTHORED, NOT EXECUTED)

4 pure tests prove opt-in feature registration and unchanged DEFAULT legacy semantics; valid zero Add canonical envelope; wrong prior clear ID rejection even if domain refs are forged; Review tuple continuation. This layer does not auto-register new Add into global default registry.

13 real SQLite internal-service tests cover frozen first-account OFF→ON zero, later ON previous clear and exact Bank/sender/card children, stale active-ID addition, changed current default, equivalent A→B→A history, authenticated actor changes between preparation/commit, exact same-command idempotent replay, changed-payload same actionID hash conflict, physically failed atomic batch/rollback, foreign soft-deleted physical account UUID collision, nonzero 10.01 effect/revision/transaction invariant (known blocked by shared envelope gate), boolean intent form contract, and optional Bank accountNumber preservation. The earlier 16 T064 physical tests and 17 T065 form tests are UNMODIFIED in this slice; Root's prior baseline eight PASS/eight FAIL on earlier source is not updated or claimed Green.

This internal service is a legitimate private production factory accepting exact production dependencies and a frozen canonical command; the test harness supplies a real Watermelon SQLite adapter/owned scopes and Node hash provider only. No source SUT or financial DTO is fabricated. Commit failure injection occurs at the actual database.batch boundary. No device, Maestro, pixel, accessibility, SDK or hosted checks.

## Additional limits and Root handoff

- **T064 concurrency test expectation conflict for Root:** existing case "serializes two different first-account creates to at most one active default" expects both simultaneous first-account requests to succeed. With a frozen original empty active/default snapshot and strict same-writer CAS, only the winner can commit; the loser must reject its now-stale snapshot rather than silently resample/rewrite immutable intent. Root should adjudicate the test expectation under the frozen wire contract, not change the business writer into a retry-with-new-snapshot workaround. The original 16 cases were not edited.
- **Ambiguous entrypoint retries:** commitPrepared(original) provides action-ID/hash replay for an existing frozen internal command; ordinary new createAccountForUser invocations still generate new user intent because the caller API has no persisted action-token argument. The separately owned Recovery pipeline must reconcile ambiguous persisted roots before admitting changed input/new IDs. Do not treat duplicate-form protection as evidence of cold-restart action replay.
- No Jest, tsc, ESLint, Prettier, SQL, pgTAP, formatter, native/emulator, hosted, CI or local check executed.
- The action-contracts missing Add guard branch must be reviewed separately before anyone claims a runnable zero-and-nonzero accepted feature.
- Source assumes T048 foundation ownership callbacks and prepared batch invariants remain frozen, with version-compatible immutable root snapshots. Storage or Recovery may alter those contracts in their disjoint lanes; re-read and review at import time.
- The explicit Add entrypoint remains gated on UI T070 sending a validated defaultIntent. Without it, legacy Add creation is unchanged.
- The client-only frozen dependency IDs are not a network admission, durable new private field, outbox ack or restart recovery guarantee. Root must compare Recovery's durable dependency collector and SQL registration before enabling push.
- Ownership/canonical postimage, actual SQL same-owner serialization and locally safe replay/error behaviors require Root's consolidated executable checks and independent security/DB reviews.
- This is a candidate commit in GitData ONLY, no Git ref, push, PR, hosted mutation or autonomous follow-up.

SOURCE RELEASED. STOP.
