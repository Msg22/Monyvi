# #395 T030 — lifecycle facade production source handoff

**Status:** Source artifact only, NOT RUN; Root owns all acceptance gates.
**Exact parent:** `935193dd68e7cbda3c1e49423f93caddd4ac5ee6`.
**Trusted governance:** `c02a773613f9b6ebc5ca01aae02dd41863fd0e90`.

## Ownership and intentionally unchanged source

Added only:
- `apps/mobile/hooks/useAccountReview.ts`
- `apps/mobile/hooks/account-review-facade-state.ts`
- `apps/mobile/services/account-review-voice-command-service.ts`
- this new validation note.

The existing `account-review-command-service.ts`, current SMS bootstrap,
owned account read model, reducer, Voice source adapter, selection hook,
T030 tests/fixtures, SMS queue/schema, financial Save, UI, routes and locales
remain byte-for-byte unchanged. Another worker owns SMS command Undo authority.

## Actual implementation contracts

`UseAccountReviewInput` is strictly source-discriminated:
- shared: `ownerId: string | null`, canonical `sessionId: string`,
  optional external `signal: AbortSignal`;
- SMS: `mode: "SMS"`, required matching canonical `queueId`;
- Voice: `mode: "VOICE"`, required validated or null `voiceSession`.

The exported `useAccountReview` returns `session`, `isBusy`,
`error`, `undoToken`, asynchronous `dispatch(command)`,
`reload()` and `undoRemoval()`. No DB hook/query or new UI state.

The private controller owns per-mounted-hook owner/source/session generation,
load AbortController, external abort listener, queue, busy/error publication,
and volatile Undo metadata. The hook memoizes a **stable** discriminated
configuration by primitive identity and Voice session reference, preventing
newly constructed caller input objects from accidentally re-triggering a
fresh bootstrap on every React render.

### SMS

Bootstrap delegates to the actual
`loadOrBootstrapOwnedSmsReviewSession({expectedOwnerId,queueId,signal})`.
The owned account context loads via
`loadAccountReviewAccountSnapshots`; SMS dispatch uses this context only
as advisory input to `executeSmsAccountReviewCommand`. The latter's DB
writer still re-reads current owned accounts and authorizes every mutation.

The first command service invocation begins synchronously when there is a
ready session, and subsequent overlapping commands are queued FIFO until
the previous Promise settles. During bootstrap, commands wait for a
validated session rather than bypassing the pending gate. No speculative
row/selection state is published before service acceptance.

Owner/logout/source/session/queue/external signal changes, reload and
unmount invalidate the generation and abort an active SMS bootstrap.
Completion or rejection from a previous generation cannot replace a newer
accepted session or error state.

### Voice

`executeVoiceAccountReviewCommand` is focused and memory-only.
It validates canonical session/command/owned-context source and identity,
then delegates to the existing pure
`reduceAccountReviewCommand`, returning a Promise of the exact result.
It does not access SMS drafts, voice persistence, financial Save or DB
writes. Account context comes from the existing scoped account read
service at command time. No copied domain transition rules are introduced.

### Undo

For Remove the facade supplies a real secure `expo-crypto.randomUUID()`
transient token and stores the accepted generation-bound Undo metadata;
other accepted commands, reload, identity change, abort and unmount clear
this facade token. SMS's existing command service remains responsible
for actual persistent Undo authorization; Voice passes its transient lease
back to the canonical reducer in the new memory-only service.

A command that was already entered into the SMS-owned database service
cannot be rolled back by React cancellation. The facade discards its late
UI publication; the service's own actor, DB transaction and generation
rechecks remain mandatory. This is not a claim of DB write cancellation.

## Existing tests represented

The immutable T030 tests contain **23 direct cases**:
6 SMS bootstrap; 3 genuine Voice; 5 identity/lifecycle;
7 serialized-dispatch and stale-completion; 2 Remove/Undo.
This commit changes no tests. At its source parent the test suite could
not load because this new hook module did not exist, so zero behavioral
assertions had executed.

**Root must execute** the T030 suite, logic/mobile strict types, owned lint,
Prettier, the protected SMS command/Undo suites, and independent cancellation/
ownership review before accepting Green. Stale-command Promise cancellation
and independently owned SMS Undo authorization should receive special review.
Do not claim an unrun behavior as passing.

## Validation ledger

Jest, TypeScript, lint, Prettier, E2E, native, and provider checks:
**NOT RUN by this source owner**. No refs, branch moves, pushes, PR comments,
provider/emulator calls, DB/SQL/sync changes or delegation.
