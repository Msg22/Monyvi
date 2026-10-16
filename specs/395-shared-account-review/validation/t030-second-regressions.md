# #395 T030 — Second independent review, tests-first corrections

**Readiness:** Tests-only changed GitData artifact; **NOT RUN** by this owner.  
**Exact immutable parent:** `8b4a0cf490bb187dfa62c4a0d0f0dd8acf067a5a`  
**Trusted governance:** `c02a773613f9b6ebc5ca01aae02dd41863fd0e90`

## Observed Root baseline versus authored expectations

Root's reported actual execution at the exact source boundary was
**30 PASS / 2 FAIL of 32 cases**; the two failing original tests attach
their rejection observers only *after* synchronous reload cancellation.
This test-only correction does not claim a fresh run or production Green.

The independent storage non-author found two further source-level T030
authority gaps:

1. `account-review-facade-state.ts` `hasNewerVoiceRevision` accepts
   any higher `sourceRevision` before checking regressed review or
   operation revisions. Incoming `2/4/4` displaces locally accepted
   `1/5/5` choices, even with no genuinely new member. The approved
   `mergeAccountReviewLateRows` returns the current accepted state when
   source evidence adds no new rows, rather than replacing those choices.
2. `stableVoiceInput` compares incoming counters before
   `verifySessionScope`; a canonical nested snapshot with an invalid
   owner/source/session and equal or lower counters can be silently
   suppressed as ordinary object churn. The outer facade remains
   apparently valid rather than failing closed on the invalid input.

No production source is edited or new public API invented here.

## New behavioral cases — one existing identity-lifecycle suite

Changed: `apps/mobile/__tests__/hooks/useAccountReview.identity-lifecycle.test.tsx`.

| Case | Exact exercised state | Expected pinned-source result |
| --- | --- | --- |
| V1 — prevent source-only rollback | Construct a canonical Voice `sourceRevision=1,revision=4,operationGeneration=4`, accept a real canonical currency command to `1/5/5`, then rerender with otherwise canonical older choices at `2/4/4`. Assert pure `mergeAccountReviewLateRows` preserves the accepted decision, and the hook keeps the exact accepted rows/Undo absence. | **Red**: source-revision short circuit overrides accepted local state |
| V2 — preserve genuinely newer Voice authority | From the same accepted `1/5/5` state, construct canonical `2/6/6` through the actual reducer. Rerender and require adoption with no SMS reads/writes. | **Green control**: do not reject all new source evidence |
| V3 (3 variants) — nested scope refusal | For each `owner`, `source`, `session`, supply a **separately canonical** nested SMS/Voice session inconsistent with the unchanged outer `mode=VOICE,ownerId,sessionId` but carrying unchanged/stale counters. Require a scope-related rejection; capture render output to assert it never returns previous accepted session under the malformed input. | **Red ×3**: the input is hidden by stale/equal comparator before scope validation |

Total **five newly instantiated scenarios** (two direct plus a
three-way typed `it.each`). Original identity tests, mock boundaries,
Expo genuine UUID shim and source-discriminated input typings remain.
No `any`, unsafe cast, arbitrary override DTO or fabricated successful
SMS command is introduced.

## Two existing stale-response test observer fixes

Changed: `apps/mobile/__tests__/hooks/useAccountReview.test.tsx`.

The original tests named:

- `a delayed old command success cannot roll back newer accepted reload state`
- `a delayed old command failure cannot overwrite a newer accepted reload`

now attach `const observed = request.catch(() => undefined)` **after the
existing dispatch and before `reload()`**, then await `observed` at
the exact previous late-success/late-failure wait location. No assertion
or deferred backend timing is removed or weakened; the same original
view/error/busy checks remain. The test observer exists when cancellation
rejects synchronously, avoiding `PromiseRejectionHandledWarning`.

## Exact case/assertion inventory

| Suite | Parent cases | New cases | Parent `expect()` calls | New `expect()` calls |
| --- | ---: | ---: | ---: | ---: |
| `useAccountReview.test.tsx` | 23 | 23 | 135 | 135 |
| `useAccountReview.identity-lifecycle.test.tsx` | 9 | 14 | 45 | 69 |
| **Combined** | **32** | **37** | **180** | **204** |

Counts are source-level inventories, not Jest results. The original 32
executable scenarios and their 180 assertion calls are preserved. The
second suite remains below the 900-line file limit after additions.

## Root admission and limitations

Root should first run the dependency-boundary focused Red batch:
V1 and V3 should expose the two actual source defects, while V2 should
remain a positive canonical monotonic-authority control. The two
existing reload tests should no longer race the late rejection observer.
Root then owns an explicitly separate production source grant.

Tests do not establish native rendering, a physical device Voice
session, Supabase auth events, or successful SQL/SQLite recovery.
No changes to any hook/controller/Voice service, private Undo storage,
namespace, finance, database, UI or panel source; no tests outside
the two owned files, refs, push, PR/comments or delegation.

**Jest, TypeScript, ESLint, formatter, emulator/native/provider: NOT RUN.**

**STOP — tests-only ownership released.**
