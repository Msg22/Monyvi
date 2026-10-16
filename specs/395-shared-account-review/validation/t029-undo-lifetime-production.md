# #395 T029 — Volatile Undo authenticated-lifetime correction

**Production authored, tests NOT RUN — 2026-10-16.**
Immutable source parent: `4a03a67a96db9d965cf2f84409315a4258bf06dd`
(trusted governance `c02a773613f9b6ebc5ca01aae02dd41863fd0e90`).
This parent includes the seven previously admitted tests-first lifecycle cases.
Root's pre-repair execution: existing 89 SMS cases PASS and the seven new
Undo cases **U01/U05/U07 PASS, U02/U03/U04/U06 FAIL**; the author has not
re-run those cases. No other production writer/test was modified.

## Scope and runtime API

Edited:
- `apps/mobile/services/account-review-command-service.ts`: retains the
  existing public `executeSmsAccountReviewCommand(input)` signature and
  current owned queue/draft/account-snapshot/reducer/SQLite write path.
  Replaces the bare module-private `undoByQueue` access with a scoped
  lifetime boundary and a synchronized pre-commit guard.
- NEW `apps/mobile/services/account-review-undo-lifetime-service.ts`:
  one module-private, device-local, nonpersistent Undo lease store.

The helper uses the **existing**
`subscribeToCoordinatedAuthStateChange((event, session) => void)` from
`./supabase`. No new auth SDK hook/route/SQL/codec/DTO/outbox field or
test-only weak-map access exists. Its scope is
`AccountReviewUndoLifetime {ownerId,epoch:bigint}`; the module exports
`beginAccountReviewUndoLifetime`, `endAccountReviewUndoLifetime`,
`isAccountReviewUndoLifetimeCurrent`,
`currentAccountReviewUndo`, `retainAccountReviewUndo` and the strictly
internal `AccountReviewUndoLifetimeInvalidatedError`.
These are private application-service APIs, not new canonical wire contracts.

## Exact lifecycle invariants

1. Capture owner and volatile epoch **before** entering
   `database.write`. Commands acquire a single coordinated-auth subscription
   while a writer is in flight or a volatile Undo lease remains pending.
   `SIGNED_OUT`, an observed authenticated different owner, or a conflicting
   command owner rotates the epoch and replaces the weak lease store. A
   same-owner ordinary `SIGNED_IN`/`TOKEN_REFRESHED` observation does not
   rotate or discard an otherwise current Undo.
2. Commands recheck their authenticated actor and the captured lifetime
   **after** the asynchronous owned queue/draft and account-authority
   reads, still inside the serialized Watermelon writer. Any mismatched Undo
   lifetime returns `review_undo_invalid`, `effect:"none"`,
   `undoToken:null` and the current persisted canonical session, without
   preparing any mutation.
3. `persistReviewTransition` now accepts a synchronous lifetime guard
   invoked inside the existing `commitScopedPreparedBatch` prepare callback,
   **after** that helper's asynchronous auth check but **before** any prepared
   cache mutation or adapter transaction. The dedicated invalidated-lifetime
   exception converts an as-yet-uncommitted stale transition back into the
   no-effect canonical reducer rejection. Adapter precommit cache rollback and
   durable postcommit success semantics are retained.
4. After an accepted durable commit, a new removal can retain only the scope
   current at commit completion; a sign-out during the writer cannot
   resurrect stale Undo after reauthentication. Other accepted commands clear
   the queue's Undo as before. The `ReviewUndoLease` fields stay identical.
5. Only one current owned queue is legal under T029. The cache-object
   `WeakMap<SmsReviewQueue,ReviewUndoLease>` preserves identity matching;
   a separately created queue cannot inherit the former queue's token.
   The small subscription tracker retains only the scalar queue ID, not a
   strong cached-model reference. Listener is attached once and detached when
   no in-flight command or current Undo remains, and on idle auth invalidation.
   No timer, polling or persistent Undo is introduced.
6. Legacy pre-digest isolated SQLite tests mock `./supabase` with only
   `getCurrentUserId` rather than an auth-event subscription. The helper
   checks for a callable `subscribeToCoordinatedAuthStateChange` to avoid
   breaking those existing partial mocks. The actual production
   `supabase.ts` exports the coordinated callback, and the seven new
   lifecycle tests use the existing harness's real mock listener set and
   `emitSignOut()`. **A runtime with the auth module genuinely missing this
   function would not provide sign-out epoch evidence**; that unsupported
   integration state is not represented as a Green lifecycle proof.
7. The new guards do not alter the reducer's owner/session/revision/operation
   generation checks, source fingerprint proof, SQLite writer queue,
   V1/V2 conversion, Undo restoration evidence, or financial Save contract.

## Root verification requested

- Run the same seven lifecycle cases on the exact integrated source.
  Expected: U01/U05/U07 continue Green, U02/U03/U04/U06 become Green with
  identical fresh SQLite and cached model preimages for rejected Undo.
- Run all previous 89 real SQLite command/bootstrap/namespace tests and
  strict mobile TypeScript and scoped ESLint/format tests. The existing
  T029 publication decomp and T044 sync hygiene are disjoint; do not
  replace their accepted tips with this older parent tree.
- Test same-owner actual `TOKEN_REFRESHED` through the coordinated-auth
  SDK when device/integration access is authorized separately; current
  U07 checks only the same-owner observer branch.
- The source cannot revoke an old token if an integration replaces the real
  auth module with an eventless partial stub outside isolated tests.
  This remains an explicit runtime integration precondition.

## Execution ledger

Author: **NOT RUN** Jest, SQLite, TypeScript, lint, formatter, native/device,
SQL, provider, or emulator. No schema, migration, source publication, hooks,
UI, localizable text, reducer, snapshots or protected tests were edited.
No references/branches/pushes/PR/comments/delegation/Codex handoff.
Root owns final admission, source integration and further verification.

**STOP — ownership released after the unreferenced GitData checkpoint.**
