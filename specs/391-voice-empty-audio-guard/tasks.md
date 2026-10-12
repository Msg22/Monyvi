# Tasks: #391 Voice Empty-Audio Guard and SDK55 Cleanup

**Date**: 2026-10-12 | **Branch**: `codex/voice-empty-audio-guard` | **Status**:
Root readiness T001–T004 verified; **US1 cleanup T005–T010 EXECUTED**; **US2
server detector T011–T018 SUPERSEDED & RETIRED**; **US2 on-device metering, US3
experience, and root integration T019–T032 PENDING / UNCHECKED**.<br>
**Prerequisites**: [spec](./spec.md), [plan](./plan.md),
[contract](./contracts/audio-validation-contract.md),
[analysis](./checklists/analysis.md),
[manual plan](./checklists/manual-plan.md).<br> **Authority**: Root alone
mutates external Git branches, issues, and PRs. T001–T010 are verified/executed;
T011–T018 are retired; T019–T032 remain pending future implementation and
verification.

## Format and Ownership

Task IDs are stable and sequential (T001–T032). Scope codes:

- **US1**: Ready independent cleanup (EXECUTED)
- **US2**: Conservative on-device silence guard (T011–T018 RETIRED; T019–T023
  PENDING)
- **US3**: Caller experience and integration (PENDING)
- **ROOT**: Root-owned final checks and publication (PENDING)

## Phase 1: Setup and Source/Contract Gates

- [x] **T001** Root verified native Git branch/tree/ancestry:
      `codex/voice-empty-audio-guard` at planning pin
      `e1c8c86068da5a385bc45bbdb217f811b6f86a46`, stacked merge
      `a7e1e00e118b4b8a989387d48181fdde0c821f3d` includes Voice parent
      `f625183373e29d372b658c10b3848a217477400a`.
- [x] **T002** Root used **both** `SPECIFY_FEATURE=391-voice-empty-audio-guard`
      and `SPECIFY_FEATURE_DIRECTORY=specs/391-voice-empty-audio-guard`;
      prerequisite PASS.
- [x] **T003** Historical analysis verified (0 critical, 0 cleanup-blocking
      HIGH); formal cross-artifact analysis of revised retirement artifacts
      remains **pending root acceptance**.
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

## Phase 4: User Story 2 — Conservative On-Device Metering (PENDING FUTURE SLICE)

_Note: Tasks T019–T023 define the future client-side conservative metering
implementation slice. Tasks remain PENDING / UNCHECKED._

- [ ] **T020 [US2]** _[PENDING]_ Define conservative silence threshold
      calibration and measurement validity policy requirements: - Calibrate
      clear silence thresholds and sample-count minimums using physical device
      data. - Require failing open (passing to server) on missing, sparse, or
      uncertain measurements. - Acknowledge that a loudness meter cannot
      unconditionally discriminate quiet speech from noise and that very quiet
      speech and ambient room noise can overlap in amplitude. - Require
      validation against representative quiet, short, and noisy speech before
      shipping to minimize false rejections.
- [ ] **T019 [US2]** _[PENDING; depends on T020]_ Author deterministic unit
      tests for on-device conservative metering in `apps/mobile`: - Verify clear
      silence with sufficient valid measurements is rejected locally. - Verify
      missing or uncertain metering samples pass to server. - Verify
      representative quiet, short, and noisy speech within policy passes to
      server. - Verify zero recording upload, parse-voice submission,
      reservation, or provider-start attributable to a locally rejected
      recording (normal auth, entitlement refresh, and sync network calls remain
      unaffected).
- [ ] **T021 [US2]** _[PENDING]_ Root executes meaningful RED on client metering
      regressions before mobile production changes.
- [ ] **T022 [US2]** _[PENDING]_ Implement conservative on-device metering guard
      in mobile recorder/submission flow; enforce fail-open on missing or
      uncertain capture metrics; preserve existing `durationMs < 1500` check.
- [ ] **T023 [US2]** _[PENDING]_ Root executes focused GREEN on client metering
      suites and verifies zero recording upload and zero provider-start marking
      on locally rejected silence.

## Phase 5: User Story 3 — Caller Experience and Owner Verification (PENDING)

- [ ] **T024 [US3]** _[PENDING]_ User approved proposed English copy:
      `"We couldn’t hear anything. Please try recording again."` Localization
      (Arabic translation) and UI integration remain pending future
      implementation. No new server error envelopes.
- [ ] **T025 [US3]** _[PENDING]_ Client integration tests for silence rejection
      UX, ensuring Manual entry access and cancel/retry flows remain intact.
- [ ] **T026 [US3]** _[PENDING]_ Privacy verification: confirm on-device
      metering does not log raw audio, PCM data, or sensitive metrics.
- [ ] **T027 [US3]** _[PENDING]_ Author honest manual testing matrix in
      `checklists/manual-plan.md` for physical devices; mark all owner tests NOT
      RUN.

## Phase 6: Final Integration and Release Gates (ROOT ONLY; PENDING)

- [ ] **T028 [ROOT]** _[PENDING]_ Root reconciles accepted source pins and
      ensures clean separation from other active branches
      (`codex/voice-startup-latency`).
- [ ] **T029 [ROOT]** _[PENDING]_ Root executes one final combined quality batch
      (Jest, TypeScript, ESLint, i18n, formatting) before PR update.
- [ ] **T030 [ROOT]** _[PENDING]_ Independent architecture and privacy review
      verifying zero server detector debt and clean prototype retirement.
- [ ] **T031 [ROOT]** _[PENDING]_ Owner records physical native/device
      verification for cleanup and future on-device metering.
- [ ] **T032 [ROOT]** _[PENDING]_ Root alone controls PR #394, issue #391
      updates, and branch management.

## Summary Status

- **T001–T004 (Readiness/Setup)**: [x] EXECUTED & VERIFIED
- **T005–T010 (US1 Cleanup TDD)**: [x] EXECUTED & GREEN (72 tests / 3 suites
  PASS; owner native proof pending)
- **T011–T018 (US2 Server Detector Retirement)**: [x] SUPERSEDED & RETIRED
  (Spike deleted, benchmarks superseded, server contracts unchanged)
- **T019–T023 (US2 Client Metering)**: [ ] PENDING future implementation (T019
  depends on T020)
- **T024–T027 (US3 Client UX & Privacy)**: [ ] PENDING future implementation
  (approved copy recorded)
- **T028–T032 (Root Integration)**: [ ] PENDING root orchestration
