# Tasks: #391 Voice Empty-Audio Guard, Cleanup and Cache Telemetry

**Date**: 2026-10-12 | **Branch**: `codex/voice-empty-audio-guard` | **Status**:
Root readiness T001–T004 verified; **US1 cleanup T005–T010 EXECUTED**; **US2
server detector T011–T018 SUPERSEDED & RETIRED**; **US2 on-device metering, US3
experience and cache telemetry T033–T036 IMPLEMENTED / deterministic GREEN**;
T021 pre-implementation RED NOT RUN, T031 physical verification NOT RUN, and
T032 publication PENDING.<br> **Prerequisites**: [spec](./spec.md),
[plan](./plan.md), [contract](./contracts/audio-validation-contract.md),
[analysis](./checklists/analysis.md),
[manual plan](./checklists/manual-plan.md).<br> **Authority**: Root alone
mutates external Git branches, issues, and PRs. T001–T010 are verified/executed;
T011–T018 are retired; implementation and deterministic verification are
complete. T021, T031, and T032 remain unchecked with the explicit evidence
boundaries below.

## Format and Ownership

Task IDs are stable and sequential (T001–T036). Scope codes:

- **US1**: Ready independent cleanup (EXECUTED)
- **US2**: Conservative on-device silence guard (T011–T018 RETIRED; T019–T023
  IMPLEMENTED / deterministic GREEN; T021 RED NOT RUN)
- **US3**: Caller experience and integration (IMPLEMENTED / deterministic GREEN)
- **CACHE**: Gemini cache-hit telemetry in `parse-voice` (T033–T036 COMPLETE)
- **ROOT**: Final checks COMPLETE; physical verification and publication PENDING

## Phase 1: Setup and Source/Contract Gates

- [x] **T001** Root verified native Git branch/tree/ancestry:
      `codex/voice-empty-audio-guard` at planning pin
      `e1c8c86068da5a385bc45bbdb217f811b6f86a46`, stacked merge
      `a7e1e00e118b4b8a989387d48181fdde0c821f3d` includes Voice parent
      `f625183373e29d372b658c10b3848a217477400a`.
- [x] **T002** Root used **both** `SPECIFY_FEATURE=391-voice-empty-audio-guard`
      and `SPECIFY_FEATURE_DIRECTORY=specs/391-voice-empty-audio-guard`;
      prerequisite PASS.
- [x] **T003** Root formal cross-artifact analysis verified and accepted on
      2026-10-12: 0 critical, 0 high, 0 medium, 1 LOW finding I1 in plan.md
      architecture-summary row addressed, 100% mapping; evidenced by publicly
      committed `checklists/analysis.md` and dated formal root analysis result
      (internal `.tmp` coordination artifacts are excluded from git tree).
- [x] **T004** Historical baseline: Voice imported deprecated root
      `expo-file-system` async methods. Root verified
      `expo-file-system@55.0.23`. TDD cycle executed: actual RED `392a26f7…`
      accepted, import-only production `84696d74…` landed, full GREEN verified
      in published `e288d12026bd7076682a6d89b6446bc13c228cab`. **Check
      completed.**

## Phase 2: User Story 1 — Recover Supported Local Temporary-Audio Cleanup (P1; EXECUTED)

- [x] **T005 [US1]** **TEST-ONLY** add
      `apps/mobile/__tests__/hooks/useVoiceRecorder.filesystem.test.ts` and mock
      changes in `apps/mobile/__tests__/hooks/voice-recorder-fixtures.ts`: model
      root `expo-file-system` async helpers throwing at runtime; separately
      expose usable `expo-file-system/legacy` `getInfoAsync`/`deleteAsync`.
      Assert actual supported adapter use. **EXECUTED in test-only commit
      `392a26f7bd6acdb94e2efe54d1587866d713d2b0`.**
- [x] **T006 [US1]** Extend T005 cases: existing file deletes once;
      `exists=false` idempotently skips deletion; genuine FS error remains
      privacy-safe warned; successful finalize→discard, Stop rejection/null URI
      with pre-release known URI, release BEFORE slow FS, pending cleanup blocks
      start, concurrent Discard/Reset/unmount, stale old generation never
      releases new native recorder, no second Stop/provider. **EXECUTED in
      `392a26f7…`.**
- [x] **T007 [US1]** Root executes focused recorder filesystem tests on
      **test-only** commit and accepts meaningful **RED caused by deprecated
      root import**, not unsupported Jest setup. **EXECUTED: actual RED
      `392a26f7…` = 10 fail / 1 pass / 11 total, 7.836s.**
- [x] **T008 [US1]** In `apps/mobile/hooks/useVoiceRecorder.ts`, replace root
      `expo-file-system` import with supported `expo-file-system/legacy`,
      preserving async function names, `exists` check, idempotent delete,
      real-error warning, native release-before-FS, cleanup promise and
      generation barriers. **EXECUTED: production commit
      `84696d745bb8e0fdb37b079a6c76e75af18e7db6`; async mock reconciliation in
      `7ad8ed5295f05a6f844f82ec2b2727af206fa906`; published in
      `e288d12026bd7076682a6d89b6446bc13c228cab`.**
- [x] **T009 [US1]** Root executes focused GREEN for
      `useVoiceRecorder.filesystem.test.ts`, `useVoiceRecorder.test.ts`,
      `useVoiceRecorder.r2.test.ts` plus TypeScript and relevant lint.
      **EXECUTED: root final GREEN = 72 tests / 3 suites / 3.809s; mobile `tsc`
      PASS; changed ESLint autofix PASS; formatting PASS; i18n/privacy/diff
      PASS.**
- [x] **T010 [US1]** Independent read-only review of exact US1 diff and
      `checklists/manual-plan.md`. Root independent minimal-source review PASS.
      Owner native/device cleanup verification remains NOT RUN / PENDING.

## Phase 3: User Story 2 — Server Detector Retirement (SUPERSEDED & RETIRED)

_Note: Tasks T011–T018 track historical feasibility work and server-side
detector design. The user explicitly abandoned server detection on 2026-10-12 in
favor of conservative on-device metering. All detector prototype files have been
deleted, benchmark findings are superseded, and existing server contracts remain
unchanged._

- [x] **T011 [US2]** _[SUPERSEDED & RETIRED]_ Historical prototype preservation:
      all spike files in `scripts/voice-audio-validation-spike/` and
      `docs/research/voice-audio-validation-spike/` deleted on 2026-10-12;
      findings superseded.
- [x] **T012 [US2]** _[SUPERSEDED & RETIRED]_ Historical WASM compile
      verification: Symphonia 0.6.1 compile exit 0 and Deno proxy execution
      completed historically; candidate abandoned due to Edge Runtime isolate
      shared-memory policy rejection; retired.
- [x] **T013 [US2]** _[SUPERSEDED & RETIRED]_ Synthetic/licensed corpus
      acquisition: superseded by retirement of server detector; 0/9 licensed
      quiet speech positives requirement retired; local prototype files deleted.
- [x] **T014 [US2]** _[SUPERSEDED & RETIRED]_ Server decoder
      PCM/resampling/padding profiling: superseded by retirement of server
      detector; prototype scripts deleted.
- [x] **T015 [US2]** _[SUPERSEDED & RETIRED]_ Edge Runtime WASM
      resource/headroom benchmarking: superseded by retirement of server
      detector; shared-memory isolate blocker retired.
- [x] **T016 [US2]** _[SUPERSEDED & RETIRED]_ Server VAD threshold grid and
      accuracy reporting: superseded; server detector design abandoned.
- [x] **T017 [US2]** _[SUPERSEDED & RESOLVED]_ Server `no_speech` and validator
      error contracts REMOVED from `contracts/audio-validation-contract.md`;
      existing `POST /functions/v1/parse-voice` contract preserved UNCHANGED.
      Client-only bypass documented (zero recording upload, parse-voice
      submission, reservation, or provider-start attributable to a locally
      rejected recording). Server duration follow-up identified as out of scope
      and not addressed.
- [x] **T018 [US2]** _[SUPERSEDED & RESOLVED]_ Server SQL release RPC changes
      for validation failure RETIRED; SQL 087 contracts preserved UNCHANGED
      without schema or RPC alterations.

## Phase 4: User Story 2 — Conservative On-Device Metering (IMPLEMENTED; DETERMINISTIC CHECKS PASS)

_Note: Tasks T019–T023 define the approved client-side conservative metering
implementation slice. Source and deterministic verification are complete; T021
RED remains NOT RUN by user exception. T020 specification is complete; physical
calibration is NOT RUN._

- [x] **T020 [US2]** _[SPECIFICATION COMPLETE; physical calibration NOT RUN]_
      Define conservative silence threshold calibration, pure-logic layering,
      and measurement validity policy: - Layering: pure
      `AudioMeteringClassifier` in `packages/logic` evaluates candidate
      threshold (`sample < -70.0 dBFS`), gap intervals (`<= 250 ms`),
      leading/trailing spans (`<= 200 ms`), and running summary metrics with
      O(1) counters; `AudioRecorderStatusAdapter` in `apps/mobile/services`
      normalizes status; `useVoiceRecorder` in `apps/mobile/hooks` holds refs
      and intervals only without calculations; file budget kept < 900 lines
      (recorder baseline 899). - Candidate threshold:
      `METERING_SILENCE_THRESHOLD_DBFS = -70.0 dBFS` (strictly evaluated as
      `sample < -70.0 dBFS`; equality at `-70.0 dBFS` passes to server). -
      Deterministic coverage constants: minimum active duration
      `METERING_MIN_ACTIVE_DURATION_MS = 1500 ms` (paused time excluded),
      minimum valid sample count `METERING_MIN_VALID_SAMPLES = 10`, max active
      gap `METERING_MAX_ACTIVE_GAP_MS = 250 ms`, max leading uncovered span
      `METERING_MAX_LEADING_UNCOVERED_MS = 200 ms`, and max trailing uncovered
      span `METERING_MAX_TRAILING_UNCOVERED_MS = 200 ms`. - Valid sample range:
      finite double in `(-160.0, 0.0]`. - Strict sentinel fail-open: Android
      `getStatus()` maps both `maxAmplitude = 0` and caught native errors to
      `-160.0 dBFS`. Any observation of `sample <= -160.0 dBFS` poisons that
      capture generation and MUST fail open to the server, regardless of count
      or duration. Pure floor captures always fail open. - Platform native
      status preconditions: Android `AudioRecorder.kt` omits
      `mediaServicesDidReset` from status bundle; adapter accepts normal
      omission (rejecting only if explicitly `true` or malformed); iOS requires
      `mediaServicesDidReset === false`. Both require `canRecord === true`,
      `isRecording === true`, `durationMillis > 0`. - Sampling cadence: sample
      once per existing 100ms timer tick; redundant immediate `getStatus` reads
      that drain Android `maxAmplitude` are forbidden. Final snapshot FREEZES
      existing samples before native release (does not call extra `getStatus` at
      release). - Require failing open on missing, sparse, invalid, non-finite,
      out-of-range, or uncertain measurements. - Note: T020 specification is
      completed independent of physical threshold calibration; physical release
      evidence remains NOT RUN.
- [x] **T019 [US2]** _[COMPLETE / final deterministic checks PASS]_ Author
      deterministic unit tests for on-device conservative metering in
      `apps/mobile` and `packages/logic`: - Verify clear silence with sufficient
      valid measurements is rejected locally. - Verify missing, sparse, or
      uncertain metering samples pass to server. - Verify any sentinel
      `sample <= -160.0 dBFS` poisons the generation and passes to server. -
      Verify equality at `-70.0 dBFS` passes to server. - Verify Android
      `mediaServicesDidReset` absence passes when other status valid; explicit
      true fails open. - Verify representative quiet, short, and noisy speech
      within policy passes to server. - Verify zero recording upload,
      parse-voice submission, reservation, or provider-start attributable to a
      locally rejected recording (normal auth, entitlement refresh, and sync
      network calls remain unaffected).
- [ ] **T021 [US2]** _[NOT RUN / user-directed final-batch exception]_ User
      directed single final check batch and no emulator. RED execution is NOT
      RUN prior to coding; tests were authored first in source, and final GREEN
      execution completed in the combined batch and bounded failed/affected
      reruns. No RED cycle is claimed.
- [x] **T022 [US2]** _[COMPLETE / final deterministic checks PASS]_ Implement
      conservative on-device metering guard: - Pure classifier in
      `packages/logic` with O(1) summary counters. - Platform status adapter in
      `apps/mobile/services`. - Facade and ref wiring in
      `apps/mobile/hooks/useVoiceRecorder.ts` within the < 900 lines file budget
      (extract focused helper module). - Enforce fail-open on missing,
      uncertain, or sentinel capture metrics; - Preserve and verify regressions
      for FR-013 (30s local cap) and FR-014 (`durationMs < 1500` check); -
      Present approved copy
      `"We couldn’t hear anything. Please try recording again."`.
- [x] **T023 [US2]** _[COMPLETE / final deterministic checks PASS]_ Focused
      verification on client metering suites: prove zero recording upload and
      zero provider-start marking on locally rejected silence; verify client
      regressions for FR-006, FR-008, FR-009, FR-013, and FR-014.

## Phase 5: User Story 3 — Caller Experience and Owner Verification (IMPLEMENTED; DETERMINISTIC CHECKS PASS)

- [x] **T024 [US3]** _[COMPLETE / final deterministic checks PASS]_ User
      approved existing error-region copy:
      `"We couldn’t hear anything. Please try recording again."` (Arabic:
      `"لم نتمكن من سماع أي شيء. يرجى محاولة التسجيل مرة أخرى."`). Provide fresh
      retry and unimpeded Manual access. No new modals/redesigns; no new server
      error envelopes (FR-015).
- [x] **T025 [US3]** _[COMPLETE / final deterministic checks PASS]_ Client
      integration tests for silence rejection UX, ensuring Manual entry access,
      cancel/retry flows, and untouched auth/consent gates remain intact
      (FR-007, FR-015).
- [x] **T026 [US3]** _[COMPLETE / final deterministic checks PASS]_ Privacy
      verification: confirm on-device metering does not log raw audio, PCM data,
      or sensitive metrics (FR-018).
- [x] **T027 [US3]** _[COMPLETE / final deterministic checks PASS]_ Author
      honest manual testing matrix in `checklists/manual-plan.md` for physical
      devices; mark all owner tests NOT RUN.

## Phase 6: Gemini Cache-Hit Telemetry (IMPLEMENTED; DETERMINISTIC CHECKS PASS)

- [x] **T033 [CACHE]** _[COMPLETE / final deterministic checks PASS]_ Author
      unit tests for Gemini 2.5 Flash Lite `usageMetadata` inspection in
      `supabase/functions/parse-voice/`: - Test full valid metadata
      (`promptTokenCount`, `cachedContentTokenCount`, `candidatesTokenCount`,
      `totalTokenCount`). - Test valid pair enforcement
      (`0 <= cachedContentTokenCount <= promptTokenCount`). - Test malformed
      pair (`cachedContentTokenCount > promptTokenCount`): NOT counted as hit,
      ratio is `null`. - Test metadata with missing/undefined cache fields
      (handled as `null`). - Test completely missing `usageMetadata`
      (non-throwing, logs `null`). - Test empty or malformed model responses and
      retried attempts. - Test transport throw before response returns (does NOT
      fabricate cache miss). - Verify telemetry does NOT log raw audio, prompt
      content, or user IDs.
- [x] **T034 [CACHE]** _[COMPLETE / final deterministic checks PASS]_ Implement
      non-throwing `usageMetadata` inspection in
      `supabase/functions/parse-voice/index.ts` (FR-021) immediately after each
      returned provider attempt before reading `response.text` or parsing JSON.
      Extract model, attempt index, validated non-negative token counts, boolean
      `cacheObservedHit`, and `cachedInputRatio`. Enforce valid pair
      requirement; exclude unknowns; ratio denominator strictly includes paired
      valid positive prompt count and valid `<= prompt` cached count.
- [x] **T035 [CACHE]** _[COMPLETE / final deterministic checks PASS]_ Verify
      Edge function regression suite passes with telemetry enabled; prove zero
      changes to retry behavior or HTTP response envelopes; verify unchanged
      server behavior regressions for FR-004 (MIME/zero-byte checks), FR-007
      (auth/consent), FR-011–FR-012 (35-day replay identity & reservation
      concurrency contracts unchanged in source, noting mocked handler/RPC
      regressions do NOT execute PostgreSQL retention/concurrency, and live
      database integration, physical devices, or live Gemini provider calls are
      NOT marked proven), and FR-016 (Gemini execution & quota envelopes).
- [x] **T036 [CACHE]** _[COMPLETE / final deterministic checks PASS]_ Document
      Supabase log-view measurement guidance and telemetry contract: event
      `voice_ai_gemini_usage`, model `gemini-2.5-flash-lite`, 0-indexed attempt,
      nullable token counts/hit/ratio, counts non-negative safe integers, valid
      pair `cached <= prompt` for hit/ratio with ratio strictly when
      `prompt > 0`; hit rate `sum(true) / (true + false)` excluding unknowns;
      weighted input fraction `sum(cached) / sum(prompt)` over valid positive
      pairs only; separate known metadata coverage
      `totalknown / total_observed_returned_attempts` where denominator is
      observed structured `voice_ai_gemini_usage` events (total observed
      returned attempts), not unknowable actual returned responses when sink
      drops logs (explicitly note missing log events or sink failures cannot be
      inferred as misses or perfect coverage); logged per returned attempt
      before text parse; transport throws yield no event; sink failures drop
      without retry; query via Supabase project Logs Edge Functions
      `parse-voice` filter event `voice_ai_gemini_usage`; safe token aggregates
      only with zero raw audio/prompts/transcripts/user identities; no
      SQL/table/cache/deployment change; token fraction does not guarantee USD
      savings. Documentation and deterministic telemetry tests COMPLETE; live
      log observation NOT RUN.

## Phase 7: Final Integration and Release Gates (ROOT ONLY; CHECKS COMPLETE / RELEASE GATES OPEN)

- [x] **T028 [ROOT]** _[COMPLETE / final deterministic checks PASS]_ Root
      reconciles accepted source pins and ensures clean separation from other
      active branches (`codex/voice-startup-latency`).
- [x] **T029 [ROOT]** _[COMPLETE]_ Root ran the combined quality batch and
      bounded failed/affected reruns after technical fixes: 230 tests / 11
      suites, TypeScript, lint, i18n/privacy, formatting, link/ID/budget audit,
      and diff PASS.
- [x] **T030 [ROOT]** _[COMPLETE / final deterministic checks PASS]_ Independent
      architecture and privacy review verifying zero server detector debt and
      clean prototype retirement.
- [ ] **T031 [ROOT]** _[NOT RUN / physical release gate]_ Owner physical
      native/device verification for cleanup, on-device metering, and acoustic
      calibration remains NOT RUN.
- [ ] **T032 [ROOT]** _[PUBLICATION PENDING]_ Root alone controls PR #394, issue
      #391 updates and branch management; final publication SHA is recorded only
      after actual push.

## Summary Status

- **T001–T004 (Readiness/Setup)**: [x] EXECUTED & VERIFIED
- **T005–T010 (US1 Cleanup TDD)**: [x] EXECUTED & GREEN (72 tests / 3 suites
  PASS; owner native proof pending)
- **T011–T018 (US2 Server Detector Retirement)**: [x] SUPERSEDED & RETIRED
  (Spike deleted, benchmarks superseded, server contracts unchanged)
- **T019–T023 (US2 Client Metering)**: IMPLEMENTED / deterministic GREEN; T020
  specification complete; physical calibration NOT RUN; T021 RED remains
  unchecked / user exception.
- **T024–T027 (US3 Client UX & Privacy)**: [x] COMPLETE / deterministic GREEN
  (approved EN/AR copy integrated; all 19 physical manual cases NOT RUN)
- **T033–T036 (Gemini Cache Telemetry)**: [x] COMPLETE / typechecked Deno GREEN
- **T028–T032 (Root Integration)**: T028–T030 COMPLETE; T031 physical NOT RUN;
  T032 publication PENDING.

## Final Deterministic Verification — 2026-10-12

Root final evidence completed at **14:08:09 UTC**: **230 tests / 11 suites
PASS** (mobile 159/8; logic 35/1; typechecked Deno 36/2: actual handler 21 +
telemetry 15). Mobile/logic TypeScript, production Deno check, lint autofix,
formatting, i18n/privacy, source-ID/link/file-budget audit, and diff checks
PASS. The first combined batch identified lint/dependency, test typing, and
file-budget failures; bounded failed/affected reruns passed after minimal
technical fixes. Independent final repair review PASS. These results do not
establish physical audio calibration, live Gemini behavior, real PostgreSQL
retention/concurrency, emulator coverage, or publication. T021 RED, T031
physical verification, and T032 publication remain unchecked.
