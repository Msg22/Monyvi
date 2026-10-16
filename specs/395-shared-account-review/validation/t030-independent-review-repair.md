# #395 T030 — Independent TS/async review repair

**2026-10-16 — Source and tests split only; NOT RUN by author.**

- Exact immutable source parent: `716a2591175db3df15801c8379b27042bb6715f7`.
- The parent is the coherent T030 creation Red context, overlaying
  `ce3f6025487e04c218a23f83b9b3730100c5ae88` and all 32 current
  rendered hook scenarios.
- Root's pre-repair T030 admission: **24 PASS / 8 FAIL of 32**:
  3 render-time owner/queue/source exposure failures, 4 active outward
  Promise cancellation failures, and 1 stale equivalent Voice-clone
  overwrite. Newer authoritative Voice revision/replacement controls pass.
  Root reports strict mobile TypeScript Green on this baseline; the
  present author has not rerun tests or TypeScript.
- No service/SQL/Undo/namespace/sync/panel/auth/DB/schema, reducer or
  native code is edited in this artifact.

## Production scope and invariants

**`apps/mobile/hooks/useAccountReview.ts`**

- Continues memoizing discriminated input by current owner, source,
  session/queue ID and signal; Voice references remain available to the
  controller's authority check.
- A private controller method preserves the currently configured Voice
  input when the external re-render merely supplies an equivalent or
  stale object with no newer canonical source/review/operation revision.
  A truly newer revision or distinct session/source/owner is configured.
- `scopedView(input, view)` synchronously replaces previous-generation
  `session`, `error`, `undoToken` and `isBusy` with the empty facade
  before any identity-changing render is returned to React. The old
  state is never returned to the next owner/source/queue during the effect
  cleanup gap. Signed-out or aborted input is also masked.
- Dispatch/reload/Undo callbacks capture the configured input identity
  and controller generation for stale-closure refusal after reload or
  identity replacement. The hook does not calculate account eligibility,
  mutate Watermelon, generate parser data, or perform Save business rules.

**`apps/mobile/hooks/account-review-facade-state.ts`**

- Keeps the canonical `AccountReviewCommand` and
  `AccountReviewCommandResult` types, SMS serialized queue,
  `executeSmsAccountReviewCommand`, owned account snapshot read-model,
  genuine Expo UUID removal token and memory-only Voice service.
- Tracks the currently active task separately from still-queued work.
  `cancel()` synchronously rejects the active outward Promise and all
  queued outward Promises; a local settlement guard ensures exactly one
  resolve/reject even if an uncancellable SMS SQLite operation finishes
  afterward. A stale completion cannot update the facade's view/error
  or settle the old outward Promise as success. No claim is made that
  cancellation reverses an already committed DB transaction.
- An active task's `finally` mutates the running state/pumps the next
  task only if it still owns the active slot. A prior backend completion
  cannot clear a newer generation's active work.
- Voice session replacements compare canonical numeric
  `sourceRevision`, `revision` and `operationGeneration` rather than
  object identity alone. Local accepted state wins over an equivalent or
  older incoming object; genuinely newer canonical authority wins.
  Equal-revision different content provides **no sufficient newer-authority
  evidence** and does not silently overwrite local user edits.
- The source-level style requirements are applied: one combined import
  from the account read-model, readonly command queue array, constructor
  before instance field declarations. Named functions and methods remain
  below 50 normal-format lines; both production files remain below 900.
- `apps/mobile/services/account-review-voice-command-service.ts`
  remains byte-for-byte unchanged. It delegates to the approved pure
  reducer and returns `Promise<AccountReviewCommandResult>`; no new
  memory persistence or domain rule is introduced.

## Exact 32-case source-preserving split

The pinned `useAccountReview.test.tsx` contains 28 direct `it()`
declarations and one `it.each(["owner","session","reload","unmount"])`,
total **32 executable scenarios**. It was above the 900-line
normal-format limit. To keep original tests compact:

| New destination | Original source lines at pinned parent | Cases |
| --- | --- | ---: |
| Original `useAccountReview.test.tsx`: SMS bootstrap/retry | 139–238 | 6 |
| Original: basic Voice memory-only/null | 242–270, 333–342 | 3 |
| Original: owner/logout/source/session/unmount lifecycle | 346–454 | 5 |
| Original: serialized dispatch including pending bootstrap | 573–776 | 7 |
| Original: Remove and volatile Undo | 857–939 | 2 |
| **NEW** `useAccountReview.identity-lifecycle.test.tsx`: external Voice clone and newer authority | 273–331 | 2 |
| **NEW**: P1 render-time isolation | 456–570 | 3 |
| **NEW**: P2 active outward cancellation (`it.each`) | 778–854 | 4 |

**Totals:** original 23 cases + new suite 9 cases = **32**.
All original test bodies, asynchronous gates, deferred timing,
`waitFor` checks, mock boundary arguments and assertions are moved
verbatim. The assertion-call inventory remains **180 before and
180 across the two suites** (static source inventory only, not a run).
The separate suite uses the same typed service-only Jest mock surfaces,
the genuine Expo UUID fixture shim already accepted by Root, and the
existing `useAccountReview-test-helpers.tsx` canonical builders.
The test-helper file is untouched; no fake reducer result or SQLite
receipt replaces production behavior.

## Known verification boundaries

1. Root must rerun the coherent 32-case React test batch, expecting
   resolution of its eight reported Red cases without regressing 24
   previous passes. This report makes **no Green claim**.
2. Root must rerun strict mobile TypeScript, scoped ESLint and standard
   Prettier, then independent TS/async review.
3. Old in-flight SMS transport can still commit after a reload, logout or
   unmount if it had entered the authoritative SQLite writer. Only
   outward UI authority and Promise settlement are cancelled; the
   service's owner/queue/revision guards and DB transaction boundary
   remain mandatory.
4. No hook re-render is claimed to prove native visible-frame isolation,
   no full Supabase session/device assertions, and no Voice persistence.
5. Equal-or-lower external Voice revision is deliberately not proof of
   a new authoritative overwrite. Callers must provide an incremented
   canonical revision or a genuinely changed logical session to replace
   a previously accepted local decision.

**Execution ledger:** Jest/React/TypeScript/ESLint/formatter/native/device/
provider/SQL: **NOT RUN** by source author. No refs, pushes,
branches, PR/comments, provider calls, delegated work or Codex handoff.

**STOP — source ownership released; Root owns integrated Green.**
