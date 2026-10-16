# #395 T029 independent review follow-up — lifecycle Red/hygiene

**Status: TESTS FIRST ONLY — NOT RUN (2026-10-16).**

- Exact immutable parent: `11e1231adda508bf1a036ad24e6c7b25afb791b9`.
- Root's baseline: 89 original SMS SQLite tests + U01–U07 = **96/96 PASS**;
  this is Root's prior result, **not re-run or independently reproduced here**.
- All service, namespace, reducer, codec, SMS bootstrap, schema, SQL and
  production source files are unchanged in this lease.
- Existing T029 Undo tests, all original 18 command-service SQLite tests, and
  the T044 24-case assertion contract are retained without weakening.

## Actual public boundaries

`executeSmsAccountReviewCommand` imports
`beginAccountReviewUndoLifetime` before entering `database.write`; the
implementation at this parent increments `commandsInFlight` and sets the
owner *before* invoking `subscribeToCoordinatedAuthStateChange`.
A synchronous subscription exception therefore bypasses the caller's
`try/finally` and can strand the internal in-flight count. Later valid
remove/Undo operations can still write correctly, but the last idle
subscription fails to unsubscribe. No private state accessor is exposed.

The real production coordinated-auth signature comes from
`apps/mobile/services/supabase.ts` and accepts an auth event and nullable
Supabase Session. The existing real SQLite harness already implements this
API with a listener set, `emitSignOut`, `setCurrentUser`, and a genuine
Watermelon Database + SQLiteAdapter. The new regression code wraps that
**existing** API to observe subscriber/unsubscriber operations and inject a
single synchronous registration throw. It neither replaces the command writer
nor manufactures successful Redux/SQLite/network outcomes.

`discardAllSmsReviewDrafts` already emits an owner/queue-scoped
`invalidateSmsReviewNamespace` after the last draft and queue are physically
destroyed. The namespace exposes a scoped epoch but **no subscribe-to-epoch
callback**; the new Undo lifetime helper listens only to coordinated auth and
has no current disposal-observation seam.

## Auth lifecycle regressions — appended to the existing real-SQLite suite

| Case | Real stimulus and assertion | Expected parent disposition |
| --- | --- | --- |
| U08 | Capture the actual registered `subscribeToCoordinatedAuthStateChange` callback; deliver `TOKEN_REFRESHED` with a typed same-owner Supabase `Session`. Retain the exact previous token and successfully Undo the persisted removed group; idle subscription then unsubscribes. This is NOT just namespace owner observation. | **Expected Green** |
| U09 | Remove a real SMS group, observe one active Undo auth subscriber, then perform the existing owner-scoped `discardAllSmsReviewDrafts` last-row disposal. Verify physical drafts and queue are absent and the now-idle Undo listener unsubscribes. | **Expected Red**: no Undo listener for the scoped namespace disposal signal |
| U10 | Make only the first public auth-subscription registration throw synchronously. Assert no SQLite/cache preimage changed, no listener registered; then perform a real successful remove and Undo with the restored public subscription. Require zero remaining listener after the last command, proving no stranded in-flight/owner/Undo authority. | **Expected Red**: failed `begin` increment bypasses `end` |

The existing U01–U07 cases remain byte-for-byte at the assertion level;
U07 still covers same-user namespace observation, while U08 newly tests the
actual coordinated-auth callback.

## Command-service isolated mock and typing hygiene

The 18-case `account-review-command-service.sqlite.integration.test.ts`
now supplies `subscribeToCoordinatedAuthStateChange` with the **actual typed
callback shape** in its isolated `@/services/supabase` mock, rather than only
`getCurrentUserId`. It calls all active callbacks with `SIGNED_OUT` during
test teardown and asserts they are released. This prevents older isolated
mocks from motivating a runtime `typeof subscribe === "function"` fallback
in production. The real writer and all command assertions remain in use.

In the Undo fixture, `removeWithUndo` explicitly types its optional token
as `string` rather than a too-narrow default literal. The
`physicalPreimages` return type uses the prescribed `ReadonlyArray`
form; the same real SQLite adapter clone and preimage comparisons remain
unchanged. No coercion, `any`, type suppression, or timer workaround added.

## T044 sync-fixture blocker on exact parent

**Confirmed immutable-tree mismatch**: the requested
`apps/mobile/__tests__/services/account-review-sync-test-fixtures.ts`
is **ABSENT** at `11e1231a`, as is the T044 sync suite.
There is therefore no exact-parent before blob to repair at source line 331
and no available local 24-case suite to preserve/test in this tree.
The T044 `DirtyRaw`→`ChangeRow` correction must be carried against Root's
current integrated T044 context in a separately pinned grant. This lease does
**not** graft the older `732e2f6a` fixture/tree onto a nonmatching parent
or create an orphan replacement. No T044 assertions changed.

## Root admission and precise limits

- Expected new **U08 Green, U09/U10 Red** at this pinned parent. The added
  cases are authored expectations, not executed observations.
- U09 is a valid end-state regression through real queue disposal. A future
  source correction needs an explicit way for volatile Undo lifetime to observe
  the existing scoped invalidation; the existing epoch is readable but does
  not asynchronously notify Undo subscribers. This tests the desired idle
  unsubscribe boundary **without inventing a current callback API**.
- The public callback wrapper observes subscriptions it actually registers,
  rather than global/private SDK listener internals. It does not establish
  native logout, Expo background execution, process restart, or GC behavior.
- **Jest / SQLite / TypeScript / ESLint / formatter / provider / native:
  NOT RUN.** Root owns combined Red acceptance and any source grant.
- No production source, original 96-case assertions, reducers, SQL, schema,
  SMS namespace/hook, synced financial Save, external service, Git refs,
  push, PR/issues/comments, provider, emulator or delegation modified.

**STOP — tests/hygiene ownership frozen at the published artifact.**
