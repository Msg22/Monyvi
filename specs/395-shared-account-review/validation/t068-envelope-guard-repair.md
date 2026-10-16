# #395 — T068 Envelope Guard Repair (Source Candidate)

Date: 2026-10-16
Exact immutable parent: `0ca1fe463ac495b26923b69d77ca0617a8686a18`
Root authorization: narrow shared `packages/logic/src/financial-actions/action-contracts.ts` tuple-specific repair; focused registration/atomic tests; narrow correction of T064 uncontrolled-concurrency assertion. No other source paths authorized or changed.
Status: SOURCE AUTHORED, UNREFERENCED GITDATA ONLY, NOT RUN. No acceptance/publish/activation claim.

## Exact scope and original blocker

Existing `canonicalizeFinancialActionEnvelope()` rejected all nonempty account guards except the deployed `account.balance-effects/v1` tuple and Review's `review.batch-save/v1`. An explicitly registered `accounts/create_with_default/account.create-default/v1` nonzero opening requires one guard `{accountId: createdAccountId, expectedRevision: "0"}`, so the approved nonzero Add candidate was blocked before it reached the financial foundation.

The exclusive patch adds `assertAccountCreateDefaultEnvelope()` and a single explicitly gated branch after the unchanged Review branch. The global `DEFAULT_FINANCIAL_ACTION_REGISTRY` is NOT widened: an unregistered Add tuple still fails to resolve. The existing legacy/Review envelope closure and account guard parsing are left unchanged.

## Exact new tuple invariant

Only when all three values match `domain:"accounts"`, `kind:"create_with_default"`, `payloadVersion:"account.create-default/v1"` AND the feature registry resolves its definition does the Add-specific check run. Its payload is reparsed with the frozen strict `validateAccountCreateDefaultPayload` contract. It requires exactly one created account, the envelope `domainReferenceId` equals that created account ID, the ID appears in canonical `domainRecordRefs`, and exactly one create absence guard `{entity:"account",id:createdAccountId,expectedAbsent:true}` covers that new account.

For `openingBalanceMinorUnits:"0"`, financial `accountGuards:[]` and `accountEffects:[]` are mandatory, while the metadata/create action root remains required by the service. It does not create a fake amount/effect.

For nonzero opening, financial guards contain **exactly one** `{accountId:createdAccountId,expectedRevision:"0"}`; payload has exactly one effect for that same created ID with identical currency and canonical minor units equal to the new account's `openingBalanceMinorUnits`. Wrong/missing/extra guards, revisions, root IDs, malformed or missing create absence guard, wrong effect, zero-with-a-guard, or a spoofed old-default reference fail. Existing global guard shape (sorted/distinct canonical UUIDs and revision values) applies unchanged.

No general permission is added for other tuples, accounts, standalone metadata, empty/zero legacy effects or arbitrary nonempty financial guards. No public payload field, registry definition or financial foundation service was changed.

## Test changes

1. Existing `packages/logic/src/financial-actions/__tests__/account-create-default-registration.test.ts` retains its original four cases and adds six meaningful focused cases (10 total): canonical nonzero guard/effect, zero-with-guard negative, absent/wrong/incorrect-revision/extra nonzero financial guards, incorrect prior-default root reference, missing account absence guard/invalid effect, and actual old account+Review envelope continuity under appropriate registry. The existing forged-previous-default-clear-ID regression remains unchanged.

2. Existing `apps/mobile/__tests__/services/account-default-intent.test.ts` retains exactly 16 cases. Root explicitly authorized correcting only the final uncontrolled `Promise.all` first-account race assertion. Scheduling may permit **both successes** if the second snapshot is captured after the first writer, or **one success and one stale failure** if both captured empty snapshots. The test no longer demands always-two successes or always-one failure. Instead, every successful result must have exactly one matching active account and canonical action root; rejected calls return no account ID and leave no account, effect, bank child or sender orphan. There is exactly one owned active default, zero financial effects, and the expected count/parent membership of Bank details and sender children. No other T064 case was weakened or removed.

3. Existing `apps/mobile/__tests__/services/account-default-intent-atomic.sqlite.integration.test.ts` retains the original 13 cases and adds one deterministic real-SQLite race scenario (14 total). Two independently prepared commands explicitly capture the *same original empty* default snapshot before any commit, with separate immutable account/action IDs. Commit A first; compare fresh physical SQLite tables before and after trying B. B must reject with `account_default_stale_default_snapshot`, its original envelope/snapshot must remain unchanged, and there must be no B root, account, bank child, sender, financial effect or old-default mutation. This proves stale command rejection without resampling. It uses the actual production internal prepare/commit factory and real Watermelon database, not a fake writer or debug endpoint.

## Scope constraints and disposition

Modified only these four existing files and this new validation report:
- `packages/logic/src/financial-actions/action-contracts.ts`
- `packages/logic/src/financial-actions/__tests__/account-create-default-registration.test.ts`
- `apps/mobile/__tests__/services/account-default-intent.test.ts`
- `apps/mobile/__tests__/services/account-default-intent-atomic.sqlite.integration.test.ts`
- `specs/395-shared-account-review/validation/t068-envelope-guard-repair.md` (NEW)

This narrowly resolves the known shared-envelope **source** blocker, not a formally tested executable Green. Source-only proof does not replace Root's consolidated TypeScript/Jest/real SQLite execution, final SQL integrity and locking review, Recovery/Storage integration, server RPC registration, two-device/restart proof, or independent audit. Existing concurrent source writer assumptions and other T068 candidate risks must still pass those gates.

Execution: **Jest NOT RUN; TS NOT RUN; ESLint/formatter NOT RUN; SQLite NOT RUN; SQL/pgTAP NOT RUN; native/emulator/device NOT RUN; hosted/CI NOT RUN.** No filewide cleanup, source edits outside the lease, Git ref update, push, PR, provider mutation or delegation.

SOURCE RELEASED. STOP.
