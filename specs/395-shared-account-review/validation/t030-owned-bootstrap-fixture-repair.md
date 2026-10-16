# #395 T030 / T054 — Owned Bootstrap Fixture Repair

**Date:** 2026-10-16  
**Exact immutable parent:** `5559ae21ddab0bbc0872dc7e41ff0af741eafe4b`  
**Parent tree:** `1b8adf3f768fd5a4c4773baa29c8a279b784e8cd`  
**Scope:** existing T030 hook lifecycle and T054 read-model tests only, plus this new report. No production/hooks/controllers, shared helper, SQL, providers or unrelated tests modified.  
**Status:** TEST FIXTURE AUTHORED, **NOT RUN**. Root retains execution/admission authority.

## Root baseline (reported; not repeated by this author)

Root's grouped results at the stated parent: filter logic 17/17 PASS, SQLite 9/9 PASS, facade read-model 10/11 PASS, older hook lifecycle 22/23 PASS, legacy v2 codec PASS. The remaining H05 and owner-switch failures were independently traced to the test's synchronization / mocked owner-read phase, **not independently proven production failures**. This change preserves **all 11 H01–H11 read-model assertions/cases** and **all 23 T030 lifecycle/command/Undo cases**, including genuine cancellation and explicit negative ownership behavior.

## T054 — H05 read completion, foreign result and busy release

File: `apps/mobile/__tests__/hooks/useAccountReview.read-model.test.tsx`, H05.

Original test waited only for `mockAccounts` to **have been invoked**, then immediately expected `isBusy === false`. The facade legitimately enters its owned-read phase before the account Promise settles, so invocation is not a safe completion boundary.

The repaired test uses the existing typed `createDeferred<Awaited<ReturnType<AccountsFn>>>()` at the actual mocked **account-read service seam**. It verifies no projection while the read is still pending and `isBusy === true`, then explicitly resolves the read to the intentionally mismatched `T030_FOREIGN_OWNER` account context inside React `act()`. After genuine asynchronous settlement, `waitFor` requires all three at once:

- the exact `account_review_facade_account_scope_changed` error from the actual controller's owner check,
- `readModel` remains `null` (not just an absent render),
- `isBusy === false` (no stuck owner-read state).

No fake timer, arbitrary sleep, skip, mocked facade, new API, relaxed expectation or copied presentation logic was introduced. If the controller actually stays busy after foreign result publication, this test **will remain Red**, indicating a production source defect for Root to investigate, not something this fixture silently accepts.

## T030 — authenticated owner-switch snapshot fixture

File: `apps/mobile/__tests__/hooks/useAccountReview.test.tsx`, the default snapshot mock and the existing owner-switch case.

The real `loadAccountReviewAccountSnapshots()` takes **no owner parameter**. It reads the current authenticated local owner scope internally and returns that owner's `AccountReviewAccountSnapshots` including `ownerId`. The original default Jest fixture always returned `makeOwnedContext()` for the first owner, even after a test intentionally switched the authenticated facade to `T030_FOREIGN_OWNER`. Therefore the new foreign-owned SMS bootstrap and correct foreign session could not pass the controller's `snapshots.ownerId === input.ownerId` check.

The repaired test now models the same auth boundary: `mockAuthenticatedOwnerId` is reset to `T030_OWNER` in `beforeEach`, and the default account-snapshot mock resolves a fresh, shape-preserving `makeOwnedContext()` with **only its top-level ownerId bound to the authenticated test actor at invocation time**. The canonical provider context has no owner field and its account entries have no userId field; all original account identities, currency, flags and provider metadata remain unchanged. The owner-switch case explicitly updates the authenticated actor **before** rerender to the second owner and verifies that the second account-read service call occurred. It still asserts:

- the first bootstrap's signal is aborted,
- the second service call targets `T030_FOREIGN_OWNER`,
- the first owner's late session stays invisible,
- only the second owner's true session can publish.

Explicit foreign-account snapshots, old-generation failures, logout, stale owner/session and abort negatives are **not rewritten or bypassed**. No service implementation, owned-scope check, hook controller or shared pure account-fixture implementation was changed.

## Root evidence / next gate

After importing this child, Root should execute the original **11 read-model + 23 lifecycle cases** along with the grouped filter/SQLite/codec tests. The author did **not** run Jest, TypeScript, ESLint, formatting, SQLite, provider, Supabase, emulator/native, hosted checks or CI. Retained case counts and exact text edits are static source observations only, **not PASS claims**. If either still fails after genuine read/authentication settling, investigate the controller rather than masking a source problem.

**TESTS FIXTURE SOURCE RELEASED. STOP.**