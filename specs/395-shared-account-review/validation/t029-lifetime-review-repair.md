# #395 T029 — Authenticated Undo lifetime review repair

**2026-10-16. Source-only checkpoint; tests NOT RUN by this owner.**

Exact immutable production parent:
`c89f34ca92458f6946074adab22e70233d201508`
(parent `11e1231adda508bf1a036ad24e6c7b25afb791b9`).
Trusted governance:
`c02a773613f9b6ebc5ca01aae02dd41863fd0e90`.

Root's **pre-repair** consolidated execution is 99 real SQLite cases:
97 PASS, exactly U09 and U10 FAIL. All 96 previous cases, including
the direct same-owner `TOKEN_REFRESHED` test U08, passed. Those are Root
reports, not Green claimed by this author.

## Scope

Exactly two preexisting production modules are changed:

- `apps/mobile/services/account-review-undo-lifetime-service.ts`
- `apps/mobile/services/sms-review-namespace-state.ts`

No `account-review-command-service.ts` change was necessary: its current
captured Undo lifetime, serialized `database.write`, post-async admission,
pre-prepare guard and actual reducer rejection are reused unchanged.
No production/test/hook/SMS codec/financial Save/schema/SQL/UI changes.

## U10 — Atomic subscription establishment

Previously `beginAccountReviewUndoLifetime` assigned an owner and
incremented `commandsInFlight` **before** registering the coordinated auth
listener. A synchronous setup exception occurred outside the command
service's `try/finally` and stranded a count, eventually keeping an idle
subscriber registered.

Now `ensureLifetimeListeners(expectedOwnerId)` stages both
subscriptions before `beginAccountReviewUndoLifetime` assigns
`ownerId` or increments `commandsInFlight`. It uses the actual
`subscribeToCoordinatedAuthStateChange` export unconditionally; the
`typeof missing export` fallback is removed. It also subscribes to the
typed namespace invalidation boundary described below.

If either registration throws, previously registered callbacks are
unsubscribed in a cleanup `try/finally` and the original exception is
re-thrown; the volatile owner and in-flight count were not advanced.
A re-entrant subscription attempt fails closed. A synchronous initial
auth callback that changes the lifetime epoch also fails closed and
unsubscribes the staged listeners. Same-owner `TOKEN_REFRESHED` and
equivalent actor observations do **not** rotate the Undo epoch.

No state is persisted and no timers, queue model references or debug
accessors are introduced.

## U09 — Scoped explicit namespace invalidation

New app-local API in
`apps/mobile/services/sms-review-namespace-state.ts`:

```ts
export type SmsReviewNamespaceInvalidationListener = (
  ownerId: string,
  queueId: string
) => void;
export function subscribeToSmsReviewNamespaceInvalidation(
  listener: SmsReviewNamespaceInvalidationListener
): () => void;
```

The existing `invalidateSmsReviewNamespace(ownerId, queueId)` preserves
its original `invalidateCurrent()` and `lifecycleEpoch` behavior, then
broadcasts the **exact explicit owner/queue** to subscribers.
The notification occurs even if `current === null` because parser
lease/published-receipt lifetimes may have already ended before a genuine
owner-scoped final-draft disposal. Listener exceptions are contained:
one observer cannot change the already committed queue-disposal outcome or
prevent subsequent observers receiving the invalidation. The observer list
has no queue-model references and is removed by its returned unsubscribe.

The Undo helper subscribes while its current command or volatile Undo
requires lifetime authority. It invalidates only when both
`ownerId === invalidatedOwner` and
`activeUndoQueueId === invalidatedQueue`. That reset rotates its epoch,
drops the weak physical-model keyed Undo store, and detaches **both**
auth and namespace listeners once no command is in flight.
Other owners/queues cannot revoke unrelated Undo. Ordinary
`TOKEN_REFRESHED` does not call explicit queue invalidation.

The original `NamespaceState` pending/published receipt, transport proof,
generation, epoch, candidate WeakMaps and capacity accounting are
otherwise unmodified. The import graph is one way (Undo helper reads
namespace state), so no new module cycle is created.

## Required Root admission

- Run U01–U10 real SQLite lifecycle suite: U09/U10 expected to turn Green;
  previously passing U01–U08 must remain Green.
- Run the original 89 namespace, command, bootstrap and publication cases;
  the added observer should not change persistence or published receipts.
- Run strict mobile TypeScript, scoped lint and formatter. All named helper
  functions remain below 50 normally formatted lines and both changed
  production modules below 900 lines.
- Probe synchronous auth callback reentrancy and explicit wrong-owner /
  wrong-queue disposal notification if Root extends coverage.
- The callback source is the existing coordinated-auth subscription, not a
  parallel auth SDK listener, random timer or persisted Undo marker.

## Execution and ownership ledger

Jest/SQLite/TypeScript/ESLint/Prettier/native/provider/emulator/SQL:
**NOT RUN** by this owner. No refs, pushes, comments, PR, branch moves,
deployments, delegations, Codex handoff, or changed test assertions.

**STOP. Root owns consolidated Green and independent review.**
