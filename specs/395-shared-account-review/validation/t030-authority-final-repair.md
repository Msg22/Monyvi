# #395 T030 — Final Voice source-authority and scope repair

**2026-10-16 — production-source-only artifact; author checks NOT RUN.**

- Immutable source parent: `2e62d422f3297b0795e2b419e3aee4a46f7b4be0`.
- Trusted governance: `c02a773613f9b6ebc5ca01aae02dd41863fd0e90`.
- Scope: **only** `apps/mobile/hooks/account-review-facade-state.ts`
  and this new report; `useAccountReview.ts`, canonical reducer/late
  merger, Voice/SMS services, 37 tests, all other source are unchanged.
- Root's actual pre-repair admission: **33 PASS / 4 FAIL out of 37**.
  All original 23, nine prior independent cases and the genuinely newer
  coherent Voice authority control are PASS. Exactly the source-only
  `2/4/4` regression and three nested owner/source/session mismatches
  are Red. No results are newly claimed.

## Proven root causes

The previous `hasNewerVoiceRevision` returned immediately whenever
`incoming.sourceRevision > current.sourceRevision`, without first proving
that its `revision` and `operationGeneration` were non-regressing.
Thus a late `2/4/4` provider snapshot could replace a locally accepted
`1/5/5` user choice.

The previous `stableVoiceInput` suppressed lower/equal revision Voice
objects before validating their canonical **nested** owner/source/session
against the outer discriminated input. A separately schema-valid nested
SMS session or foreign Voice session could be masked as harmless object
churn. The prior accepted session was then returned instead of failing
closed, exactly as the new three-variant test detects.

## Narrow source correction

1. `stableVoiceInput` checks the nested non-null Voice snapshot with
   existing `verifySessionScope` **before** any revision suppression.
   That helper uses `accountReviewSessionSchema.parse`, then requires
   nested `ownerId`, `source === "VOICE"` and `sessionId` to match
   the outer owner/source/logical session. Malformed active nested scope
   throws `account_review_facade_session_scope_changed` during the
   render attempt, so no previously accepted, foreign or cross-source
   view is returned. Signed-out/null-owner and already-aborted inputs
   still enter the existing cancellation/masking path instead of
   unnecessarily parsing stale session data.
2. Full authoritative replacement now requires a non-regressing
   `sourceRevision`, `revision` and `operationGeneration`, and at
   least one **strictly newer review revision or operation generation**.
   A higher source counter alone is evidence, not authority to discard
   a newer accepted local decision. For example `2/4/4` cannot
   replace `1/5/5`; coherent `2/6/6` still can.
3. A higher source counter with otherwise non-authoritative review
   counters is **not blanket-rejected** when it contains genuinely new
   row IDs. The controller calls the existing pure
   `mergeAccountReviewLateRows({current:accepted,incoming})`.
   The canonical merger retains existing user decisions, removed-group
   tombstones and frozen-save restrictions, imports only newly
   discovered rows using its existing membership/conflict rules, and
   increases review/operation revisions only when it actually adds
   rows. The controller requests a new Voice input only if that merger
   added members; no new domain merge algorithm, business DTO or
   service write is introduced. If there are no new IDs or the pure
   merger preserves a frozen session, the existing stable input
   reference remains and no unnecessary effect cancellation occurs.
4. All prior outward Promise exactly-once settlement, active-command
   cancellation, render-time scope masking, external AbortSignal
   removal, old generation-bound closures, genuine Expo UUID and
   serialized SMS dispatch remain byte-for-byte unchanged.
   `useAccountReview.ts` and Voice service were not modified.

## Root acceptance / limits

Root should rerun the **unchanged 37-case** T030 suite with the four
frozen new Reds. Expected: the source-regression scenario retains
the accepted `1/5/5` Voice choice, the nested owner/source/session
cases fail closed, and the previously Green coherent `2/6/6`
authority continues to replace the prior input. Rerun the 32
preexisting cases, strict mobile types, scoped lint/formatter and
independent nonauthor review.

This source inspection and GitData publication does **not** establish
Jest Green, a successful native render, a physical Voice recording,
a new parser pipeline run or SMS/SQLite durability. The pure merge
boundary does not claim that source evidence without new row IDs can
overwrite accepted existing-row choices. There are no source/test
modifications outside the exclusive two-path artifact, no refs,
pushes, PR/comments, provider, emulator, native or delegation.

**Jest / TypeScript / ESLint / formatter / native: NOT RUN.**

**STOP — source ownership released to Root for consolidated Green.**
