# T029 — Authenticated Undo lifecycle tests-first correction

**Date:** 2026-10-16  
**Status:** Tests-only unreferenced GitData artifact; **NOT RUN**; no production repair.
**Exact source parent:** `9158c362a11b5296cce59ed6db9708402cc9a011`
(parent `347e00c38bdab520b1ce917bc38feb56ab5b2c25`).

## Verified source boundary

`apps/mobile/services/account-review-command-service.ts:30–31` holds
`undoByQueue: WeakMap<SmsReviewQueue, ReviewUndoLease>`; lines 157–172 store
successful removal authority and clear it only following another committed
command. Lines 174–202 use the authenticated, serialized SQLite writer and
`undoByQueue.get(queue)` when executing `undo_removal`.
The pure `reduceUndoRemoval` verifies owner/session, previous-state shape,
generation/token and unchanged removal evidence, but not a distinct login
lifetime generation. The same actor can sign out/in while the cached queue
model survives; neither new login nor namespace invalidation clears the
module-private Undo lease at this parent.

The existing `sms-review-namespace-lifetime.ts` listens through
`subscribeToCoordinatedAuthStateChange` and calls
`invalidateSmsReviewNamespace` on actual `SIGNED_OUT`. Namespace state
exports `captureSmsReviewNamespaceEpoch(): string` and
`observeSmsReviewNamespaceActor(ownerId)`. This epoch increments on
namespace invalidation and does not increment for ordinary same-owner actor
observation; **it is not an always-on authenticated-session generation**:
its sign-out listener is installed only while the corresponding namespace
lifetime is active. The command service currently does not read the epoch.

## Real SQLite and auth test dependencies

New `apps/mobile/__tests__/services/account-review-undo-lifecycle.sqlite.integration.test.ts`
uses only existing:
- `sms-review-namespace-test-harness.ts` with its real Watermelon
  `Database` / `SQLiteAdapter`, owned seeded account/category context,
  controlled `getCurrentUserId`, `emitSignOut()` (actual subscribed auth
  event), `setCurrentUser()`, `acquire()/release()` and direct scoped
  `ownedQueues()/draftItems()` reads.
- Existing T025 canonical SMS original/session/stored V2 review constructors,
  actual `mergeSmsReviewDrafts`, `encodeSmsReviewDraftV2`, and the
  `accountReviewCommandSchema` to seed real persisted group-linked V2 rows.
- The actual `executeSmsAccountReviewCommand` serialized writer and pure
  reducer; no fake accepted command outcome, direct Undo store access, or
  fake financial root.
- `adapter.testClone()` to compare real SQLite physical preimages across
  the queue/draft/dismissal/financial/account/category tables. Original
  Watermelon model `_raw` preimages are checked separately to detect cache
  changes. The fixture prepares actual V2 rows using the established
  `database.write(() => database.batch(...))` callback/promise pattern;
  it does not override `SQLiteAdapter.batch`, alter its callback signature,
  or intercept the adapter with a fake success.

## Seven test cases

| Case | Expected behavior | Baseline classification |
| --- | --- | --- |
| U01 | Normal same-lifetime removal yields exactly one volatile token. Undo restores the original pending group in real SQLite with no persisted token. | Positive regression control; Green expected |
| U02 | With an active published auth listener, A removes group, `SIGNED_OUT` advances namespace epoch, A reauthenticates, **same cached queue identity** persists; old Undo must return `review_undo_invalid` and leave raw/cache preimages unchanged. | Meaningful P2 Red expected |
| U03 | A removes, signs out, B logs in/acquires and releases a real B namespace, B signs out, A returns; old A token must still be invalid despite identical owner/queue/revision at invocation. | P2 Red expected |
| U04 | Undo is queued behind a held real Watermelon writer; A signs out/in before it obtains the writer. Current actor ID alone must not authorize an old token; no row/queue/cache mutation. | P2 asynchronous Red expected |
| U05 | Actual discard destroys A's original queue/drafts and invalidates its namespace. A new queue with a new SMS fingerprint/removal gets its **own distinct Undo token**. Old token cannot restore it; new token can. | Positive isolation control |
| U06 | A has completed its populated namespace lease, so no namespace auth listener remains. A removes and signs out/in with original SQLite queue intact. Old Undo still must be invalid; **do not silently rely only on captureSmsReviewNamespaceEpoch**. | P2 auth-lifecycle seam Red expected |
| U07 | Same-owner `observeSmsReviewNamespaceActor(OWNER)`, the published token-refresh handler's same-user branch, does not increment namespace epoch, invent a different owner or revoke still-current Undo. | Positive control; not a direct TOKEN_REFRESHED event dispatch |

**All U02/U03/U04/U06 assert `review_undo_invalid`, `effect: "none"`,
and/or physical/loaded-cache snapshots unchanged**. They do not accept
an unrelated owner guard failure or missing queue as passing evidence.
U05 explicitly tests replacement queue with both old-token refusal and
its own new-token acceptance.

## Minimal typed source seam proposal (not implemented)

The **existing** namespace epoch can be consulted during an active pinned
namespace, but is insufficient for U06 once its listener has stopped.
The smallest root-owned fix need not create a new public API:
`account-review-command-service.ts` can subscribe to the already existing
typed `subscribeToCoordinatedAuthStateChange` boundary for the lifetime of
its in-memory Undo store, rotate/clear private Undo authority on
`SIGNED_OUT` or actor change, and preserve it for same-user token refresh.
Register the lifetime subscription independently of a parser namespace pin,
without DB calls in an auth callback. Keep `ReviewUndoLease` transient and
no new V1/V2/outbox field. Make any queued command verify the current
authenticated Undo generation **inside the writer**; clearing at logout must
not let same-owner reauth reuse a previously captured lease.

If Root chooses a reusable typed epoch provider instead, the missing contract
is narrowly:

```ts
export interface AuthenticatedReviewUndoScope {
  readonly ownerId: string;
  readonly generation: string;
}
export function captureAuthenticatedReviewUndoScope(
  ownerId: string
): AuthenticatedReviewUndoScope;
export function assertAuthenticatedReviewUndoScope(
  captured: AuthenticatedReviewUndoScope
): void;
```

This is a **proposal**, not an API exported or invoked by the tests. Its
generation must rotate on sign-out/account replacement even without an
active SMS namespace lease, and remain stable on a same-owner token refresh.
An implementer should choose one approach, not duplicate independent
lifecycle authorities. The existing `captureSmsReviewNamespaceEpoch` is
not a substitute for a fully authenticated lifetime when listeners are idle.

## Limits and execution ledger

- This suite tests real SQLite persisted/loaded state and the actual
  coordinated sign-out event via the existing Jest auth harness. Its U07
  directly invokes the same-owner namespace observation branch because
  the shared harness exports `emitSignOut` but no token-refresh event
  emitter; **U07 is not full Supabase auth event integration evidence**.
- No process restart, emulator, native auth lifecycle, renderer or external
  Supabase session was exercised here. Fresh Watermelon adapter snapshots are
  not an app process restart proof.
- Current Root baseline of 89/89 across seven existing SQLite suites and
  mobile TypeScript/lint evidence is reported by Root, **not rerun here**.
- **Jest/SQLite/TypeScript/lint/formatter NOT RUN.** Case counts and Red/Green
  predictions are authored expectations, not actual execution evidence.
- No existing source/tests/helpers modified; new test and this validation
  report only. No SQL/schema/sync/UI/Save/codec, refs/push/PR/comments,
  provider/native/emulator, delegation or Codex handoff.

**STOP:** Root owns Red admission and the separate authorized production fix.
