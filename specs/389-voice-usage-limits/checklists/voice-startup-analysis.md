# Voice startup optimization — S1 source and Speckit analysis

**Feature:** 389-voice-usage-limits / #347  
**Pinned source:** `f625183373e29d372b658c10b3848a217477400a`  
**Planning branch baseline:** `codex/voice-startup-latency` = pinned source at
analysis start.

## Source-backed diagnosis

| Area              | Verified source fact                                                                                                                                  | Planning consequence                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Hook ownership    | `add-transaction.tsx` owns one `useVoiceAiAvailability(true)` and passes it to `useVoiceTransactionFlow`.                                             | Duplicate-hook concern is disproven; do not create or remove a second hook.                                            |
| Starting feedback | Route sets `voiceStartPendingRef` / `isVoiceStartPending` before awaited startup work; flow also enters `starting` before its awaits.                 | Preserve immediate Starting; never fake Listening.                                                                     |
| Consent           | Route performs fresh local `getAiProcessingConsentStatus()` and only then calls flow with `skipAiProcessingConsent: true`.                            | Fresh consent remains first and serial.                                                                                |
| Availability      | `useVoiceAiAvailability.refresh()` calls `cancelInFlight()` before every new request. Focus/foreground and explicit start all call the same refresh.  | Coalesce one unresolved same-context request; no TTL or settled cache.                                                 |
| Permission        | Flow awaits `refreshVoiceAvailability()` and then `recorder.refreshPermission()`.                                                                     | After consent, overlap these non-destructive reads; OS prompt still waits for eligible availability + explicit action. |
| Auth transport    | Availability invokes the authenticated wrapper, which awaits `getStableAuthSession()`, invokes the Edge Function, and has one 401 refresh/retry path. | Preserve unchanged; measure total availability stage rather than bypassing auth.                                       |
| Recorder          | `record()` + `onStarted` precede the 300 ms stabilization.                                                                                            | Stabilization is post-capture early-command protection, not startup delay; no recorder edit in this lane.              |

### Exact source references

- `apps/mobile/app/(private)/add-transaction.tsx:119-150,266-337`
- `apps/mobile/hooks/useVoiceAiAvailability.ts:120-248,340-405`
- `apps/mobile/hooks/useVoiceTransactionFlow.ts:278-397`
- `apps/mobile/hooks/useVoiceRecorder.ts:442-543` (read-only boundary)
- `apps/mobile/services/voice-ai-availability-service.ts`
- `apps/mobile/services/authenticated-edge-function-service.ts:78-124`
- `apps/mobile/services/supabase.ts:258-327`

## Deterministic Red/Green matrix

| ID  | Scenario                                                                | Planned test surface                          | Required Red before production                            | Green assertion                                                       |
| --- | ----------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------- |
| S01 | focus refresh unresolved + mic tap refresh, same actor/timezone/context | new availability startup test                 | two service calls / first aborts                          | one service call; both consumers receive same authoritative result    |
| S02 | foreground callback collides with focused refresh                       | new availability startup test                 | restart/abort churn                                       | one in-flight call                                                    |
| S03 | two direct concurrent `refresh()` calls                                 | new availability startup test                 | replacement call                                          | one shared unresolved promise/result                                  |
| S04 | first shared request succeeds then later refresh                        | new availability startup test                 | none if implementation incorrectly caches settled promise | second service call proves no TTL/settled reuse                       |
| S05 | shared request fails/aborts then retry                                  | new availability startup test                 | stale slot blocks/reuses                                  | slot clears and new service call starts                               |
| S06 | user changes during shared request                                      | new availability startup test                 | stale result could surface if guard regresses             | old request aborted/ignored; new actor owns state                     |
| S07 | timezone/context generation changes                                     | new availability startup test                 | same promise reused across context                        | old cancels; new request starts                                       |
| S08 | blur/background/unmount while joined                                    | new availability startup test                 | stale state or dangling load                              | shared request aborts; no stale visible state                         |
| S09 | authoritative reconciliation during request                             | new availability startup test                 | late network response can overwrite reconciliation        | in-flight canceled; reconciled snapshot wins                          |
| S10 | fresh consent pending                                                   | flow + route tests                            | availability/permission starts before consent             | neither starts until consent true; Starting already visible           |
| S11 | consent true, availability + permission both deferred                   | flow test                                     | serial invocation                                         | both have been invoked before either deferred resolves                |
| S12 | availability blocked + permission denied                                | flow test                                     | OS request may fire or recorder start                     | no OS prompt, no recorder, availability refusal                       |
| S13 | availability eligible + permission denied, no explicit request          | flow test                                     | recording/prompt starts                                   | typed permission result only                                          |
| S14 | availability eligible + explicit Allow microphone                       | flow/route test                               | prompt before eligibility or twice                        | one OS request after eligible result                                  |
| S15 | blocked/unknown/revoked permission                                      | flow/route tests                              | false Listening                                           | existing recovery, zero recorder start                                |
| S16 | cancellation/account switch while either read is pending                | flow test                                     | late start                                                | stale operation returns; zero recorder start/request identity         |
| S17 | rapid duplicate mic taps                                                | route/flow tests                              | duplicate availability/recorder                           | one logical start; one recorder start                                 |
| S18 | unavailable Try again with eligible fresh result                        | route test                                    | idle flash/second tap/duplicate refresh                   | refresh once (or joins same context) then auto-Starting/start         |
| S19 | unavailable Try again remains blocked                                   | route test                                    | recorder start                                            | stays blocked, no OS prompt/recorder                                  |
| S20 | native recorder start fails                                             | flow test                                     | false recording                                           | start-failed/error; no Listening                                      |
| S21 | native `onStarted` truth                                                | flow/recorder positive control                | timer/Listening before record                             | Recording only from callback after native record                      |
| S22 | retained-audio submission retry                                         | flow existing tests                           | mic restart/new key                                       | same request identity; no microphone start                            |
| S23 | authenticated edge stable session + 401 retry                           | existing service tests                        | auth path bypass                                          | unchanged stable token / one refresh-retry / fail closed              |
| S24 | privacy-safe stage diagnostics                                          | focused unit/source test if diagnostics added | sensitive field or wall-clock dependency                  | exactly `{ stage, durationMs }`, no correlation token or other fields |
| S25 | Manual/R2 regression                                                    | existing route/Manual suites                  | hidden Manual/Save or R2 drift                            | unchanged Manual draft, R2 controls/cap and blocked Voice→Manual      |

### Authorable E2E versus owner-only

- Existing Maestro flows may be extended only for deterministic visible
  Starting/Cancel and Manual navigation behaviors that do not require a real OS
  permission sheet or network-timing assertion.
- Do **not** encode millisecond startup assertions in Maestro.
- Real permission sheet, audio capture readiness, background native behavior,
  slow/real availability network, cold/warm startup timing and provider behavior
  remain owner manual/native evidence and are not executable claims in S1.

## Structured read-only Speckit analysis

The repository defines `before_analyze` / `after_analyze` optional Git commit
hooks in `.specify/extensions.yml`, but this GitHub connector session cannot
execute
`.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks`
or the local command runner. Therefore **no executable Speckit invocation is
claimed**. Root must run T076 locally before test/source assignment.

A semantic analysis was performed on the reconciled draft using the canonical
`speckit.analyze` categories:

| ID  | Category      | Severity | Result                                                                                                                                                             |
| --- | ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I1  | Inconsistency | RESOLVED | Earlier duplicate availability-hook concern contradicted actual source; draft explicitly records one route-owned hook.                                             |
| I2  | Inconsistency | RESOLVED | Earlier FR-047 said not to alter in-flight policy on hypothesis; owner-approved S1 explicitly narrows that sentence to source-backed same-context coalescing only. |
| A1  | Ambiguity     | RESOLVED | “Faster” has no fabricated SLA; requirements use deterministic one-call/concurrency behavior and owner measurements rather than an unmeasured 1–2 s claim.         |
| S1  | Security      | RESOLVED | Stable auth, AI consent, authoritative availability, explicit OS permission, request identity and server enforcement remain mandatory.                             |
| C1  | Coverage      | RESOLVED | Every new FR-048–FR-052 and SC-023–SC-027 maps to T075–T082 and scenarios S01–S25.                                                                                 |
| O1  | Ownership     | RESOLVED | Recorder/prewarm/cap/empty-audio changes remain #391-owned; shared auth production changes require separate ownership.                                             |

### Draft metrics

- New functional requirements: **5** (FR-048–FR-052)
- New success criteria: **5** (SC-023–SC-027)
- New stable tasks: **8** (T075–T082)
- New startup requirements with at least one task: **10 / 10 (100% planned)**
- New deterministic/manual scenarios: **25**
- Critical semantic findings after reconciliation: **0**
- High semantic findings after reconciliation: **0**
- Executable prerequisite/Speckit run: **PENDING ROOT T076; not claimed here**

## Implementation stop conditions

Stop and return to root if Red requires recorder internals, auth coordinator
changes, TTL/cached allowance, permission prompting before eligibility/explicit
action, removal of fresh consent/availability, UI/copy changes, provider/hosted
work, or a measured performance promise without owner device evidence.

## S2 consent-transition reconciliation and root T076 receipt

Root independently completed the canonical correct-feature prerequisite and
read-only Speckit analysis for the S1 package at
`b562426b5543a64c7df4d117007388c42029ae49`. Reported result: complete S1
requirement mapping, critical findings 0, high findings 0. The WSL native-branch
check was skipped by that runner, then root independently verified the exact
native Git branch/tree/ancestry. Optional analyze Git hooks were not invoked.
This worker does not claim to have executed those commands.

The narrow S2 reconciliation adds **FR-053** and **T083** without renumbering or
changing FR-048–FR-052 / T075–T082:

1. same-actor/same-timezone pending availability may join only while consent
   context is unchanged;
2. first-use consent grant explicitly supersedes any availability request that
   began before that grant;
3. completed snapshots remain non-reusable;
4. consent revocation/fail-closed behavior is unchanged;
5. the route Red requires an explicit post-grant supersede marker while the
   already-consented control omits it.

### Structured semantic analysis of the S2 clarification

| ID    | Category    | Severity | Result                                                                                                                                                    |
| ----- | ----------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-C1 | Consistency | RESOLVED | FR-053 closes the coalescing-vs-first-consent ambiguity without weakening FR-048 fresh-authority semantics.                                               |
| S2-S1 | Security    | PASS     | Consent remains first; no pre-consent result can authorize recording after a grant; revocation remains fail-closed.                                       |
| S2-C2 | Coverage    | PASS     | FR-053 maps to T083 Red plus T079 implementation and T080/T081 Green/review; route tests include both first-use supersede and already-consented controls. |
| S2-O1 | Ownership   | PASS     | No recorder/#391, shared-auth, provider, server, quota, UI/copy or binding ownership is added.                                                            |
| S2-P1 | Privacy     | PASS     | Timing Red permits stage + numeric duration only and measures native-start readiness at `onStarted`; no identity/audio/payload fields.                    |

Updated startup requirement mapping is **11 / 11 planned**. Critical/high
semantic findings after this reconciliation: **0 / 0**. Root must accept the
actual T077/T083 Red results before T078/T079 production; this GitHub authoring
lane claims no test execution.

## S2-FIX — actual root RED and test-seam audit (12 October 2026)

**Source:** startup `aea6e6526058359ac739a4571634669a837c14b8`. Root's actual
separate focused RED:

- Availability **2 failed / 8 passed / 10 total (3.122s)**: repeated
  same-context refresh restarts a matching request.
- Flow **5 failed / 3 passed / 8 total (1.865s)**: native permission still waits
  for availability and approved timing stages are not emitted; duplicate native
  start/onStarted controls passed.
- Route modes **2 failed / 33 passed / 35 total (5.549s)**:
  post-first-use-consent supersede is meaningful RED, but an unavailable retry
  failure is only `mockVoiceAvailabilityRefresh` ReferenceError, **NOT valid
  RED**; export exists in
  `apps/mobile/__tests__/app/add-transaction-route-fixtures.tsx:666`.
- Original combined command timed out at 60s; only these individual focused
  results were observed. No GREEN or device measurement claimed.

**Test-only correction:** import the existing route mock and resolve newly
deferred grant/consent fixtures in RNTL `act` without weakening either route
assertion. Exercise public `refresh({ supersedePending: true })` with one
matching pre-consent request: old request aborts, fresh result wins, late old
result cannot publish. Blur/background/unmount must abort **two** joined callers
and both return `null`; the normal same-context pending case still joins. Timing
tests require individual `availability` and `permission` durations plus
`availability_permission` and `native_start` under `voice.startupTiming`, with
**only** `{ stage, durationMs }` (finite nonnegative monotonic duration). An
optional diagnostic logger error cannot prevent eligible native start or add
artificial waiting.

Historical FR-048–FR-053 / SC-023–SC-027 and T075–T083 remain intact. No startup
source changes, S3 approval, measured performance, native/OS/ provider/hosted
checks, or local Jest execution by this successor. Root must accept repaired
focused RED before T078/T079 production.

## Final Receipt (2026-10-12)

- Root GREEN receipt: 28 suites 424 tests PASS 27.656s; mobile full TypeScript
  PASS; changed ESLint 0 errors 3 baseline intentional hook warnings;
  Prettier/i18n/privacy/diff PASS (84+local formatter).
- Only 5 docs edited; no source/test/other/schema changes.
  T077/T078/T079/T080/T081/T083 reconciled to actual root evidence; T075/T076
  completed; T074 manual not completed; T082 and all
  owner/device/manual/rendered/OS/actual timing remain NOT RUN. M01–M28 marked
  NOT RUN. Current gate reconciled; no publication claim; #391 separate
  validated cleanup draft.

## S3 bounded implementation source handoff (12 October 2026)

**Accepted root repaired RED:** startup branch
`a39d2732ac9fe9127415a280c09f3ae57370d348`; 3 focused suites **13 meaningful
failures/42 passed/55**, 10.917 seconds, exit 1, no import/setup failure. Root
correct-feature prerequisite PASS and independent canonical read-only Speckit
review 11/11 new FR/SC mapped, critical/high 0. This author has **not** run
test/TypeScript/lint/OS/Metro/device/provider checks; these receipts are
supplied by root.

**Source implementation boundaries (awaiting root Green and independent
acceptance):**

- `useVoiceAiAvailability` maintains an unresolved
  actor/timezone/generation-scoped promise, joins matching callers, never caches
  a settled result, replaces differing contexts, clears its own slot and retains
  lifecycle/actor/snapshot-reconciliation abort protection. Explicit
  `supersedePending` aborts a matching pre-grant operation.
- `useVoiceTransactionFlow` preserves fresh consent first and starts an
  authoritative availability read alongside one **non-prompting** permission
  read. The existing explicit OS request remains behind eligible availability;
  the recorder starts only after both gates and stays Starting until native
  `onStarted`.
- The route performs consent before unavailable-refresh retry, passes the
  eligible snapshot directly (no second refresh), and marks only a successful
  first-use consent continuation to force pending availability replacement.
- `voice-startup-timing.ts` uses monotonic `performance.now()` where available
  and best-effort sink calls. Every record contains only `stage` and finite
  nonnegative numeric `durationMs`; consent, availability, permission, combined
  availability_permission and native_start end at the documented boundaries.
  Clock or logger failure must not change admission; no timers, identifiers or
  content are added.

**Verification is NOT RUN by this writer.** Root owns the combined T080
Green/TS/lint/privacy pass, independent T081 async/actor-security review, and
T082 owner cold/warm native evidence. Existing recorder
stabilization/cap/cleanup and #391, Manual draft, R1/R2 UI approval, same-key
replay and authenticated availability remain outside scope. No 1–2 s measured
improvement is claimed.

## S4 source-backed test seam and blocked production gate (12 October 2026)

**Observed source:** startup S3 `6904bc8bcb6f3b49a89c12d26c3968689d068d5d`. Root
verified both new startup suites passed, but the wider route suite uncovered (a)
one obsolete first-consent argument expectation and (b) ESLint
`no-unsafe-assignment` from nested `expect.objectContaining`. A 60-second
wide-command timeout is **not Green**. Root reports no
TypeScript/i18n/privacy/diff errors; the author ran no checks.

**Actual serial-work finding:** `apps/mobile/app/(private)/add-transaction.tsx`
`requestVoiceStart` currently checks fresh consent then, for
`refreshAvailability`, awaits route-level `refreshVoiceAvailability()` before
invoking `flowStartFlow`. Thus the flow's approved safe availability/permission
overlap cannot occur during unavailable Retry. The S4 Red specifically holds
that route prefetch unresolved and requires direct flow handoff immediately
after consent. The blocked-flow response stays authoritative in the real flow
test, not a second route quota validator. This reconciles FR-050 and FR-051;
`availabilitySnapshot` compatibility for other legitimate calls is not deleted.

**S4 tests:** exact first-use consent arguments include
`supersedePendingAvailability: true`; retry needs only
`skipAiProcessingConsent: true`, with zero separate route refresh and realistic
facade refusal. Replace unsafe nested Jest matcher with explicit typed/equality
assertions. Startup flow clock-failure controls must exercise throw and
nonfinite from `performance.now`, still reaching granted/native capture, without
malformed `voice.startupTiming` stage/duration logs; existing
optional-logger-failure oracle remains.

**Decision:** two tests/doc corrections only, **no source grant** in S4.
Existing FR-048–FR-053/SC-023–SC-027, T075–T083, Manual, current recorder/#391,
user copy, binding and security contracts remain unchanged. S4 actual focused
RED, source correction, final Green and owner device timing are still pending
root evidence.

## S4 accepted focused RED, clock test isolation and implementation (12 October 2026)

**Actual root RED:** `c3dc55d0b2ec25b6a71bcec4466d4147562d0474`, 3F/54P/57
(13.044s). Only one failure is meaningful product RED: unavailable Retry invoked
the route's separate availability refresh (observed one; expected zero) before
invoking flow. Two global `performance.now` failures were a corrupted **TEST
SEAM**: the first triggered React scheduler `getCurrentTime` during state
update, and the logger positive subsequently recorded zero calls. Source clock
semantics were not responsible for that React failure.

**Narrow S4 correction:** after fresh local consent, route calls `flowStartFlow`
immediately with `skipAiProcessingConsent: true`. Availability and non-prompting
microphone permission then run concurrently inside the same generation-guarded
flow. A blocked result fails closed; the OS prompt remains explicit and
contingent on eligible availability. First-grant consent supersede, same-key
retry, actor, native-onStarted, Manual and R1/R2 UI remain unchanged. The
flow-level optional snapshot field is retained for legitimate compatibility.

**Tests:** timing utility in isolation exercises real thrown, NaN and infinite
performance clocks, successful operation and invalid-log suppression; the flow
companion separately replaces only exported native clock diagnostics (never the
global scheduler), maintains the logger-failure positive, and verifies
cancellation after unmount with both preflight promises pending (zero
recorder/UUID/OS permission/provider calls). Exactly `{ stage, durationMs }` is
permitted for `voice.startupTiming`; neither timezone nor correlation token nor
payload data can appear. The existing hook blur/background/unmount
joined-request controls remain as previously authored.

**Readiness:** original source/tests were accepted for independent review, but
S4 source and new tests have **no worker-executed checks**. Root must complete
exact-path and wider GREEN plus TypeScript, lint, privacy/security and
independent async review; M01–M28 native cases remain NOT RUN. No measured
improvement or changed quota policy is claimed.

## Root 28-suite CI blocker classification and focused test repair (12 October 2026)

**Actual root result at `4133231163116e04f9221c42095eb98580f38768`: 25 suites
passed / 3 failed; 419 tests passed / 5 failed / 424 total; 26.373 s.** 25
suites passed, three suites failed; this does **not** establish final GREEN.
TypeScript/formatter/i18n/privacy/diff PASS; ESLint 0 errors with 3 baseline
dependency warnings. Production behavior and the new startup availability and
flow tests pass. Independent OpenCode S4 audit found no new critical/high source
defect. No executable work by this test author.

| Failure class                  | Observed old assertion                           | Exact corrected contract                                                             |
| ------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Motion Retry eligible (1)      | Route refresh expected 1                         | Route refresh 0; one direct flow call, no facade-based native proof                  |
| Motion Retry refused (1)       | Route prefetch refused and no flow call          | Typed `not-started/availability` flow result; one handoff; unavailable + Manual      |
| First-consent motion (1)       | Only `skipAiProcessingConsent`                   | Also `supersedePendingAvailability: true`; explicit OS action unchanged              |
| R2 permission availability (1) | 0 permission reads                               | 1 non-prompting read concurrent with availability; 0 OS/UUID/provider/recorder       |
| Logger-positive utility (1)    | 0 logger calls under absent/nonfinite Jest clock | Seed finite `performance.now`, require actual thrown logger and successful operation |

The consent-denied R2 control still requires **zero** permission/availability
reads. Clock-negative thrown, NaN and Infinity controls must assert the spy was
called and remain isolated from React; the backwards-clamp test already passed
and is unchanged. No tests are deleted, no broad matchers or suppressions
introduced. Auth, consent, quota, native-onStarted, same-key retry and #391
contracts remain unchanged. **Root must rerun the affected/full batch before
T080 sign-off; owner M01–M28 remain NOT RUN.**
