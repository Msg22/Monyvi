# Voice startup optimization — S1 source and Speckit analysis

**Feature:** 389-voice-usage-limits / #347  
**Pinned source:** `f625183373e29d372b658c10b3848a217477400a`  
**Planning branch baseline:** `codex/voice-startup-latency` = pinned source at
analysis start.

## Source-backed diagnosis

| Area | Verified source fact | Planning consequence |
| --- | --- | --- |
| Hook ownership | `add-transaction.tsx` owns one `useVoiceAiAvailability(true)` and passes it to `useVoiceTransactionFlow`. | Duplicate-hook concern is disproven; do not create or remove a second hook. |
| Starting feedback | Route sets `voiceStartPendingRef` / `isVoiceStartPending` before awaited startup work; flow also enters `starting` before its awaits. | Preserve immediate Starting; never fake Listening. |
| Consent | Route performs fresh local `getAiProcessingConsentStatus()` and only then calls flow with `skipAiProcessingConsent: true`. | Fresh consent remains first and serial. |
| Availability | `useVoiceAiAvailability.refresh()` calls `cancelInFlight()` before every new request. Focus/foreground and explicit start all call the same refresh. | Coalesce one unresolved same-context request; no TTL or settled cache. |
| Permission | Flow awaits `refreshVoiceAvailability()` and then `recorder.refreshPermission()`. | After consent, overlap these non-destructive reads; OS prompt still waits for eligible availability + explicit action. |
| Auth transport | Availability invokes the authenticated wrapper, which awaits `getStableAuthSession()`, invokes the Edge Function, and has one 401 refresh/retry path. | Preserve unchanged; measure total availability stage rather than bypassing auth. |
| Recorder | `record()` + `onStarted` precede the 300 ms stabilization. | Stabilization is post-capture early-command protection, not startup delay; no recorder edit in this lane. |

### Exact source references

- `apps/mobile/app/(private)/add-transaction.tsx:119-150,266-337`
- `apps/mobile/hooks/useVoiceAiAvailability.ts:120-248,340-405`
- `apps/mobile/hooks/useVoiceTransactionFlow.ts:278-397`
- `apps/mobile/hooks/useVoiceRecorder.ts:442-543` (read-only boundary)
- `apps/mobile/services/voice-ai-availability-service.ts`
- `apps/mobile/services/authenticated-edge-function-service.ts:78-124`
- `apps/mobile/services/supabase.ts:258-327`

## Deterministic Red/Green matrix

| ID | Scenario | Planned test surface | Required Red before production | Green assertion |
| --- | --- | --- | --- | --- |
| S01 | focus refresh unresolved + mic tap refresh, same actor/timezone/context | new availability startup test | two service calls / first aborts | one service call; both consumers receive same authoritative result |
| S02 | foreground callback collides with focused refresh | new availability startup test | restart/abort churn | one in-flight call |
| S03 | two direct concurrent `refresh()` calls | new availability startup test | replacement call | one shared unresolved promise/result |
| S04 | first shared request succeeds then later refresh | new availability startup test | none if implementation incorrectly caches settled promise | second service call proves no TTL/settled reuse |
| S05 | shared request fails/aborts then retry | new availability startup test | stale slot blocks/reuses | slot clears and new service call starts |
| S06 | user changes during shared request | new availability startup test | stale result could surface if guard regresses | old request aborted/ignored; new actor owns state |
| S07 | timezone/context generation changes | new availability startup test | same promise reused across context | old cancels; new request starts |
| S08 | blur/background/unmount while joined | new availability startup test | stale state or dangling load | shared request aborts; no stale visible state |
| S09 | authoritative reconciliation during request | new availability startup test | late network response can overwrite reconciliation | in-flight canceled; reconciled snapshot wins |
| S10 | fresh consent pending | flow + route tests | availability/permission starts before consent | neither starts until consent true; Starting already visible |
| S11 | consent true, availability + permission both deferred | flow test | serial invocation | both have been invoked before either deferred resolves |
| S12 | availability blocked + permission denied | flow test | OS request may fire or recorder start | no OS prompt, no recorder, availability refusal |
| S13 | availability eligible + permission denied, no explicit request | flow test | recording/prompt starts | typed permission result only |
| S14 | availability eligible + explicit Allow microphone | flow/route test | prompt before eligibility or twice | one OS request after eligible result |
| S15 | blocked/unknown/revoked permission | flow/route tests | false Listening | existing recovery, zero recorder start |
| S16 | cancellation/account switch while either read is pending | flow test | late start | stale operation returns; zero recorder start/request identity |
| S17 | rapid duplicate mic taps | route/flow tests | duplicate availability/recorder | one logical start; one recorder start |
| S18 | unavailable Try again with eligible fresh result | route test | idle flash/second tap/duplicate refresh | refresh once (or joins same context) then auto-Starting/start |
| S19 | unavailable Try again remains blocked | route test | recorder start | stays blocked, no OS prompt/recorder |
| S20 | native recorder start fails | flow test | false recording | start-failed/error; no Listening |
| S21 | native `onStarted` truth | flow/recorder positive control | timer/Listening before record | Recording only from callback after native record |
| S22 | retained-audio submission retry | flow existing tests | mic restart/new key | same request identity; no microphone start |
| S23 | authenticated edge stable session + 401 retry | existing service tests | auth path bypass | unchanged stable token / one refresh-retry / fail closed |
| S24 | privacy-safe stage diagnostics | focused unit/source test if diagnostics added | sensitive field or wall-clock dependency | only approved stage/duration + optional ephemeral token |
| S25 | Manual/R2 regression | existing route/Manual suites | hidden Manual/Save or R2 drift | unchanged Manual draft, R2 controls/cap and blocked Voice→Manual |

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

| ID | Category | Severity | Result |
| --- | --- | --- | --- |
| I1 | Inconsistency | RESOLVED | Earlier duplicate availability-hook concern contradicted actual source; draft explicitly records one route-owned hook. |
| I2 | Inconsistency | RESOLVED | Earlier FR-047 said not to alter in-flight policy on hypothesis; owner-approved S1 explicitly narrows that sentence to source-backed same-context coalescing only. |
| A1 | Ambiguity | RESOLVED | “Faster” has no fabricated SLA; requirements use deterministic one-call/concurrency behavior and owner measurements rather than an unmeasured 1–2 s claim. |
| S1 | Security | RESOLVED | Stable auth, AI consent, authoritative availability, explicit OS permission, request identity and server enforcement remain mandatory. |
| C1 | Coverage | RESOLVED | Every new FR-048–FR-052 and SC-023–SC-027 maps to T075–T082 and scenarios S01–S25. |
| O1 | Ownership | RESOLVED | Recorder/prewarm/cap/empty-audio changes remain #391-owned; shared auth production changes require separate ownership. |

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

| ID | Category | Severity | Result |
| --- | --- | --- | --- |
| S2-C1 | Consistency | RESOLVED | FR-053 closes the coalescing-vs-first-consent ambiguity without weakening FR-048 fresh-authority semantics. |
| S2-S1 | Security | PASS | Consent remains first; no pre-consent result can authorize recording after a grant; revocation remains fail-closed. |
| S2-C2 | Coverage | PASS | FR-053 maps to T083 Red plus T079 implementation and T080/T081 Green/review; route tests include both first-use supersede and already-consented controls. |
| S2-O1 | Ownership | PASS | No recorder/#391, shared-auth, provider, server, quota, UI/copy or binding ownership is added. |
| S2-P1 | Privacy | PASS | Timing Red permits stage + numeric duration only and measures native-start readiness at `onStarted`; no identity/audio/payload fields. |

Updated startup requirement mapping is **11 / 11 planned**. Critical/high
semantic findings after this reconciliation: **0 / 0**. Root must accept the
actual T077/T083 Red results before T078/T079 production; this GitHub authoring
lane claims no test execution.

