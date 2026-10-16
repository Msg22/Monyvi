# T030 facade — regression tests after independent review

**Status:** TESTS-ONLY, NOT RUN, unreferenced GitData artifact.
**Exact parent:** `ce3f6025487e04c218a23f83b9b3730100c5ae88`.
**Trusted governance:** `c02a773613f9b6ebc5ca01aae02dd41863fd0e90`.
**Root pre-grant gate:** 23 existing T030 cases: 20 PASS / 3 FAIL;
96 SMS/Undo cases PASS. The failures are not falsely treated as production
Green. All production, reducer, canonical fixtures outside the two owned test
paths, services, hooks, UI, SQL, sync and business logic remain unchanged.

## Scope and source-grounded causes

Owned files:
- `apps/mobile/__tests__/hooks/useAccountReview.test.tsx` (modified)
- `apps/mobile/__tests__/hooks/useAccountReview-test-helpers.tsx` (modified)
- This new validation note

The completed T030 facade source in the exact parent has three additional
verified behavioral risks:
1. **P1 render-time data leak:** `useAccountReview.ts` publishes the last
   `useState` view on a new identity's render; the change-triggered
   `useEffect` can clear it only *after* React's render phase. The render-time
   snapshot can retain the prior owner/session/error/Undo/busy state.
2. **P2 outward cancellation:** `account-review-facade-state.ts` cancels
   queued dispatches, but does not settle an already-running dispatch. Its
   `runCommand` resolves the original caller Promise when the backend later
   resolves, even if a new owner/session/reload/unmount invalidated the result.
   The already entered service writer owns durability; React cannot undo it.
3. **P2 Voice clone:** the hook's `useStableReviewInput` depends on the
   incoming `voiceSession` object reference. A semantically equivalent
   older clone triggers reconfiguration and can overwrite a newer accepted
   memory-only Voice decision. An actual authoritative higher revision or
   replacement session must still supersede the local state.

## Test inventory and expected Red mapping

**32 executable scenarios:** 28 direct `it(...)` declarations plus one
`it.each(...)` expanded to four boundary cases. This is the original 23,
preserved, plus nine review-driven cases (3 + 4 + 2).

| New cases | Guard | Existing implementation expectation |
| --- | --- | --- |
| R01 owner change after accepted removal | Capture the *first new-owner render* before effects; no old session or Undo token, no old busy/error | P1 meaningful Red |
| R02 queue/session replacement while loading | Capture the first new-queue render; no old busy/session/error/Undo | P1 meaningful Red |
| R03 SMS bootstrap error → Voice | Capture the first Voice render; no old SMS error/busy/Undo; only null or matching Voice session | P1 meaningful Red |
| R04 owner switch during active SMS dispatch | Outward Promise rejects before deferred DB result; one rejection after late success | P2 meaningful Red |
| R05 queue/session switch during active SMS dispatch | Same rejection/late-result contract, retaining new session | P2 meaningful Red |
| R06 reload during active SMS dispatch | Same rejection/late-result contract, retaining newly loaded state | P2 meaningful Red |
| R07 unmount during active SMS dispatch | Same rejection/late-result contract without post-unmount UI publication | P2 meaningful Red |
| R08 equivalent original Voice clone | Same validated owner/session/revision but fresh reference cannot replace the accepted newer local decision | P2 meaningful Red |
| R09 deliberate Voice authority change | A higher validated revision and a different validated session replace local state; no SMS persistence | Positive acceptance control |

The render captures occur inside the `renderHook` callback, not by reading
only `result.current` after `rerender` has flushed effects. Cancellation
tests attach a typed Promise rejection observer before invalidation, inspect
settlement *before* resolving the deferred backend, then resolve it and assert
the outward Promise never changes to success. No timers or artificial DB
rollbacks are used.

## Corrections to the accepted original 23

- Pending SMS bootstrap still must **not** invoke the SMS command writer
  early. Once the valid initial session is loaded, its queued command must
  return and publish the canonical accepted service result, not silently
  remain at the original revision.
- The project uses `jest-expo` (verified `apps/mobile/jest.config.js`).
  Expo's published generated `expo-crypto/mocks/ExpoCrypto.ts` stub has a
  void `randomUUID()` implementation. The original Undo test passed that
  undefined token to the real strict reducer fixture, producing
  `review_undo_invalid` before exercising the intended facade journey.
  This suite now overrides only `expo-crypto.randomUUID` with the real
  Node `crypto.randomUUID()` inside the **test file**. Each value is a
  genuinely canonical v4 UUID; no fixed fake receipt, bypass of the canonical
  reducer, relaxed UUID schema or production change is involved.
- Duplicate imports from `reducer` were consolidated into one value/type
  import for scoped lint hygiene.
- The helper adds only `cloneCanonicalReviewSession`, which uses the
  actual `accountReviewSessionSchema.parse` on the original session and
  independent row/group object copies. It does not fabricate a cross-mode
  fixture or invent revisions.

## Root gates

This artifact deliberately DOES NOT implement or alter the T030 facade.
Run Root's scoped Jest/RNTL Red batch and confirm the nine new cases execute
with the intended behavioral classification, not a fixture or compilation
error. Re-run the original 23, strict mobile TypeScript, scoped ESLint/format,
protected SMS/Undo cases and independent review after a separately granted
source correction. No source/behavioral acceptance is claimed here.

**NOT RUN by writer:** Jest, TypeScript, ESLint, Prettier, SQLite,
native, provider, emulator or any repo gates. No Git ref, push, PR,
SQL/sync/UI mutation or delegation. STOP after unreferenced publication.
