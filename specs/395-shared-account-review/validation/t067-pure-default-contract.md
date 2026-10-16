# #395 T064 correction + inactive T067 pure Add-default contract

**2026-10-16 — source authored; NOT RUN.**
**Exact immutable parent:** `50dcaca99e06fad4ce8a37ce4b1a4f8eb7e2f157`.
**Trusted governance:** `503f5a1336ba23f6d270615ce1ba47b02116e4f0`.
**Frozen wire/default decisions:** `specs/395-shared-account-review/contracts/wire-shapes.md` and `account-default-intent.md` from `1264134305c126a7836cf09e8f7843609a8c8555`.
**Root baseline (reported, not rerun):** pure suite module-absent creation Red, 0 assertions; mobile T064 16 executed, 8 PASS and 8 FAIL (later ON, authenticated actor, physical child rollback and inconsistent defaults among observed defects).
**Authority:** Only listed pure financial-action sources and T064 tests/fixture; runtime registration, account service, UI, SQL, sync, schema generation and remote systems remain separate owners.

## Changed files

1. **NEW** `packages/logic/src/financial-actions/account-create-default.ts`: exports `accountCreateDefaultPayloadSchema`, `validateAccountCreateDefaultPayload`, `ACCOUNT_CREATE_DEFAULT_TUPLE`, and inferred public types (re-export from Add shapes). No production registry/import activation.
2. **NEW** `packages/logic/src/financial-actions/account-create-default-shapes.ts`: exact eight-key strict `account.create-default/v1` wire, canonical account/sender/bank create shape reuse, nullable Add Bank account number, strict narrow `account_default` clear.
3. **NEW** `packages/logic/src/financial-actions/account-create-default-integrity.ts`: deterministic pure account/guard/effect/child/prior-clear checks.
4. **NARROW UPDATED** `packages/logic/src/financial-actions/review-batch-save-shapes.ts`: only `accountDefaultSnapshotSchema` strengthened for ASCII-sorted distinct active IDs and membership of non-null current default, keeping the same keys and inferred shape for both Add and Review.
5. **NARROW UPDATED** `packages/logic/src/financial-actions/__tests__/account-create-default.test.ts`: retained all 28 original semantic cases (20 individual + 8 omission variants), corrected obsolete module-absent header and added three focused pure cases (tuple remains inactive; Add Bank optional original account number; no Cash sender).
6. **NARROW UPDATED** `packages/logic/src/financial-actions/__tests__/account-create-default-test-fixtures.ts`: comment reflecting present inactive pure module; no fixture value, ID, default, effect or payload expected value changed.
7. **NARROW UPDATED** `apps/mobile/__tests__/services/account-default-intent.test.ts`: retained exactly 16 cases, changed only two zero-opening cases plus existing rollback-injection seam and added a strict shared root assertion helper.
8. **NEW** `specs/395-shared-account-review/validation/t067-pure-default-contract.md`: this report.

## Pure wire and integrity contract

The literal closed root keys are `schemaVersion`, `operationCode`, `defaultIntent`, `expectedDefaultSnapshot`, `createGuards`, `accountEffects`, `domainRecordRefs`, `domainMutation`. The new tuple is `accounts/create_with_default/account.create-default/v1` (not the old `accounts/create/account.balance-effects/v1` and not Review's transaction tuple).

All domain create records reuse the existing canonical Review account/sender/bank schemas rather than copying a second account DTO. Only Add Bank's optional `accountNumber` is widened from Review's required null. All schemas remain strict; no transaction/transfer create or unrelated metadata replacement is admitted. Prior default update is precisely `{entity:"account_default",mode:"update",expectedIsDefault:true,after:{id:capturedId,isDefault:false}}`, with no `expectedUpdatedAt`, balance, name or metadata update. Default clearance is included in domain refs, **never** in createGuards or financial effects.

Pure invariants: exactly one new account; sortable/unique refs and mutations; all and only create records guarded by `expectedAbsent:true`; no duplicate IDs; one bank detail maximum only on BANK; no Cash bank/sender child; child parent equals the newly created account; sender normalized names exact and unique; created ID is not in the captured active set. Required new `isDefault = defaultIntent || activeAccountIds.length === 0`. If ON replaces an actual captured previous default, require exactly one prior clear with that **exact** UUID. A changed clear UUID fails even if a forger also changes `domainRecordRefs` to match; this is the SQL 091 wrong-clear-ID negative.

Zero opening: complete metadata/create tuple is required at writer level, `accountEffects:[]`, no fake +1 minor, no adjustment transaction, no opening balance revision. Nonzero opening: exactly one effect on the created ID with identical currency and canonical minor-unit amount, no competing effect or adjustment transaction. The financial new-account guard revision `"0"` and final revision `"1"` are writer/root/SQL evidence, not an invented field inside this eight-key payload. Pure code does not query DB or allocate IDs.

## T064 test expectation correction

The first-Cash zero-opening and BANK zero-opening service assertions now demand `actions:1`, `effects:0`, `transactions:0` and revised account `financialRevision:"0"` plus exact existing children. They validate that the single persisted root is `domain:"accounts"`, `kind:"create_with_default"`, `domainReferenceId` equal to the created account UUID, canonical envelope `payloadVersion:"account.create-default/v1"`, and payload `schemaVersion:"account.create-default/v1"` / `operationCode:"account.create-default"` / empty `accountEffects`. An unrelated root cannot satisfy this.

The rollback case no longer forces legacy `account_sms_senders.collection.create`: it fails the actual Watermelon `database.batch` commit seam and requires no physical change to account/default/children/root/effect tables. Root must verify the future writer places every required prepared operation in **one** batch (the present injection alone does not prove its members or a successful writer); no debug method or fake writer API was added. The remaining original 13 mobile tests and one rollback test retain their substantive business assertions. Legacy zero-create is NOT treated as the new tuple, and existing old tuple tests remain separate.

## Deliberately inactive source boundary

`DEFAULT_FINANCIAL_ACTION_REGISTRY`, `packages/logic/src/index.ts`, `action-registry.ts`, financial action foundation, Add form, `createAccountForUser`, sync and SQL 090/091 are UNCHANGED. The new direct-path schema/parser/tuple is **not registered, exported through package index, or executable through production actions**. T067 remains formally incomplete until Root's separately gated later registration.

Pure parsing proves only immutable shape/intra-payload consistency. Foreign/deleted ID ownership, current owner/read-state, current default, A→B→A logical-equivalence CAS, current active set races, server-wide serialization, stable root/effect/child action IDs, action hash replay, predecessor dependency ordering, persisted revision0/1, rollback and restart cannot be validated from the payload alone.

## Accepted T068 private command proposal — NO writer authored

Keep existing `createAccountForUser(userId, validatedAccountFormWithDefaultIntent)` as the external entrypoint. Privately capture owner, explicit intent, all active UUIDs/zero-or-one current default, fixed action/account/bank/sender/effect IDs and real default predecessor action IDs **before asynchronous awaits**. Prepare one immutable `account.create-default/v1` envelope and cache its digest/action/child IDs. Inside the same authenticated, owner-serialized Watermelon writer, reread and compare the complete active/default logical snapshot (not timestamps, nickname, row count alone), revalidate owner/children/absent-ID/financial revisions, and commit root+new account+children+prior clear+opening effect in one guarded atomic batch. Changed scope/stale predicates fail without any mutation. A replay uses the original frozen IDs/snapshot/hash, never a resampled tuple; dependencies block publication until canonical predecessor outcomes. Root owns the exact private command signature and tests-first authorization; no public debug seam or new runtime API is invented.

## Honest validation / handoff

**Jest, SQLite, TypeScript, ESLint, formatter, source gates, pgTAP, native, emulator, hosted database and CI: NOT RUN by this source owner.** Original parent Red/8PASS8FAIL cannot be promoted to Green. The unchanged `review.batch-save` and old account balance-effects schema/registry remain authoritative; the default snapshot strengthener may need Root consolidated review and shared validation checks. No manual SQL, file writes outside this GitData artifact, Git refs, pushes, PR, issue/comment, remote mutation or delegation.

**STOP — pure source and narrow T064 test ownership released to Root.**
