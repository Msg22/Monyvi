# T030 — typed lifecycle facade test recovery

**Status (2026-10-16): TESTS FIRST; NOT RUN; source implementation not authorized.**

## Immutable authority and ownership

- Exact test parent: `b27f6ee3db96c8d5c58ac6882b25326ea0b3f101`.
- Governing revision: `c02a773613f9b6ebc5ca01aae02dd41863fd0e90`.
- This parent contains two UNACCEPTED stalled T030 draft files. Their assertions
  were not evidence of a runnable or accepted hook.
- Exclusively owned files: `apps/mobile/__tests__/hooks/useAccountReview.test.tsx`,
  `apps/mobile/__tests__/hooks/useAccountReview-test-helpers.tsx`, and
  this NEW validation note. Production, command services, reducer, DB,
  generated files, SMS/Voice transports, locales and hooks are unchanged.
- Root separately owns creation Red, service/hook production grant, independent
  types/lint/formatter gates, integration, and any PR action.

## Genuine fixture and typed API contract

- SMS uses `makeT025ReviewSession` and the real `makeT025SmsOriginal`;
  its physical queue UUID equals both `sessionId` and `queueId`.
  A foreign owner fixture reparses the same genuine session under the new
  canonical owner UUID, rather than lying about its ownership.
- Voice calls the **pure actual**
  `normalizeAccountReviewParserResult(makeVoiceInput())`. It revalidates
  canonical session and rejects a result without VOICE source rows, correct
  source/session IDs and null fingerprint. The stalled draft falsely copied
  an SMS original into its purported Voice state; no such shortcut remains.
- The proposed `UseAccountReviewInput` is one strict discriminated union:
  common canonical `ownerId: UUID | null`, `sessionId: UUID`, optional
  `signal`; SMS additionally requires `queueId: UUID`; Voice additionally
  requires a validated memory-only `voiceSession: AccountReviewSession | null`.
  No cross-mode `Partial` bag, invented casts or invalid SMS/Voice blend.
- Jest mocks use `Parameters`/`ReturnType` of the **existing**
  `loadOrBootstrapOwnedSmsReviewSession`,
  `executeSmsAccountReviewCommand`, and
  `loadAccountReviewAccountSnapshots` symbols. They do not mock a fake
  writer, API receipt, DB transaction or Voice persistence. Deferred
  completions are typed to real `AccountReviewSession` and
  `AccountReviewCommandResult` types.
- For accepted command response fixtures, use the actual
  `reduceAccountReviewCommand` and real canonical owned account context.
  This is fixture construction only: reducer/business decisions stay in logic,
  durable SMS commands stay in the existing service; the facade is solely
  responsible for lifecycle, cancellation, dispatch orchestration and state
  publication.

## Authored test inventory — 23 direct `it` declarations

**SMS bootstrap (6):** owner/queue committed load, fail without partial
session, retry and clear error, external abort and late success, stale success
after newer accepted reload, and stale failure after newer accepted reload.

**Voice (3):** genuine Voice memory session without SMS DB, async local
command with the canonical session-only result, and absent Voice session
without SMS persistence calls.

**Identity and cancellation (5):** owner-switch pending cancellation with
fresh foreign owner, logout/null actor, changed SMS queue/session, SMS-to-Voice
source switch, and unmount/late completion.

**Serialized SMS dispatch (7):** command gated during pending bootstrap,
exact scoped service input, two physically overlapping dispatch calls with
one pending writer and FIFO publication, busy/error cleanup after rejection,
stale command success after accepted reload, stale command error after accepted
reload, and logout during a pending command.

**Remove/Undo (2):** actual service-issued transient removal token followed
by a verified reducer-based Undo restoration; intervening accepted currency
edit invalidates the earlier volatile Undo lease and prevents rollback.

The previous draft had no true overlapping service command calls, no fresh
accepted-state stale-result proof, no logout/Undo journey, and untyped
`unknown` mock boundaries. These are covered with `renderHook` and `act`
from `@testing-library/react-native`, without adding a provider, simulator,
hook implementation or database test shim.

## Accepted Red boundary

`apps/mobile/hooks/useAccountReview.ts` does not exist at the pinned parent.
This is an intentional **module creation Red**, not proof that the 23
assertions currently execute. Root must independently confirm that the
future hook exposes `session`, `isBusy`, `error`, `undoToken`,
`reload` and asynchronous `dispatch`, and that its input union aligns with
the typed fixtures. Some cancellation may reject a superseded dispatch
Promise; tests require only that such a completion cannot publish stale state.

Root should first achieve a meaningful executed T030 Red after module
availability, then implement the minimum lifecycle facade without moving
commands, financial writes or business calculations into React. Follow with
the existing SMS command/codec/undo and Voice session regression suites.

## Validation ledger

**NOT RUN**: Jest/RNTL, strict TypeScript, ESLint, Prettier, SQLite,
code generation, native/device/E2E and full suite. No result is represented
as Green. No schema, storage, sync, financial action, provider, PR or branch
mutation authorized by this test publication.
