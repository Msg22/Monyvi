# Tasks: #391 Voice Empty-Audio Guard and SDK55 Cleanup

**Date**: 2026-10-12 | **Branch**: `codex/voice-empty-audio-guard` | **Status**:
Root readiness T001–T004 verified; **US1 cleanup T005–T010 EXECUTED**; **US2
feasibility T011–T012 EXECUTED, T013–T014 PARTIAL, T015–T016 BLOCKED** (Edge
Runtime shared memory policy rejection; speech implementation remains BLOCKED).
See
[feasibility report](../../docs/research/voice-audio-validation-spike/feasibility-2026-10-12.md).<br>
**Prerequisites**: [spec](./spec.md), [plan](./plan.md),
[proposed contract](./contracts/audio-validation-contract.md),
[analysis](./checklists/analysis.md),
[owner manual plan](./checklists/manual-plan.md),
[existing research](../../docs/research/voice-empty-audio-guard.md).<br> **TDD
gate**: root-only actual RED before production. **Owner of startup
route/flow/availability:** another worker on `codex/voice-startup-latency`,
inaccessible for writes here. Root alone mutates issue, root integration refs,
feature push/PR and runs final checks. T001–T004 readiness, US1 T005–T010, and
US2 T011–T012 are verified; **T013–T032 remain unchecked** (T013-T014 partial).

## Format and ownership

Task IDs are stable and sequential. `[P]` denotes an independent file lane
**only if root explicitly assigns it**; this planning leaf grants no production
ownership. Scope codes: **US1 = ready independent cleanup**; **US2 = blocked
server validation**; **US3 = gated identity/UX integration**. Completion
evidence must name exact source SHA, author, real test output and remaining
owner-only checks. Root must not mistake a skipped/blocked Deno command for RED
or GREEN.

## Phase 1: Setup and source/contract gates

- [x] **T001** Root verified native Git branch/tree/ancestry:
      `codex/voice-empty-audio-guard` at planning pin
      `e1c8c86068da5a385bc45bbdb217f811b6f86a46`, stacked merge
      `a7e1e00e118b4b8a989387d48181fdde0c821f3d` includes Voice parent
      `f625183373e29d372b658c10b3848a217477400a` and nine unchanged
      research/prototype paths. WSL branch check was skipped because Git was
      undetected; native Git verification is the branch authority.
- [x] **T002** Root used **both** `SPECIFY_FEATURE=391-voice-empty-audio-guard`
      and `SPECIFY_FEATURE_DIRECTORY=specs/391-voice-empty-audio-guard` because
      `.specify/feature.json` otherwise points to 389; correct-feature
      prerequisite **PASS**,
      `FEATURE_DIR=/mnt/e/Work/My Projects/Monyvi-voice-empty-audio-guard/specs/391-voice-empty-audio-guard`,
      `AVAILABLE_DOCS=contracts/,tasks.md`. Root used an existing ignored `.git`
      admin script due blocked Bash inline `-c`; **do not retry/bypass**. No
      optional Git hooks ran.
- [x] **T003** Root independently ran canonical **read-only** Speckit analysis
      over all six `specs/391-voice-empty-audio-guard/` docs and constitution:
      **critical 0; cleanup-blocking HIGH 0**; speech **B1/B2/C1 remain three
      HIGH/BLOCKED**. Planned cleanup FR001–003 maps to T004–T010; no validator,
      SQL policy, server production or user-visible copy gate cleared. No
      optional hooks.
- [x] **T004** Historical baseline: Voice `f625183…` imported deprecated root
      `expo-file-system` async methods. Root verified `expo-file-system@55.0.23`
      via `npm ls` package-lock-only. TDD cycle executed: actual RED `392a26f7…`
      accepted, import-only production `84696d74…` and test mock update
      `7ad8ed52…` landed, and full GREEN verified in published
      `e288d12026bd7076682a6d89b6446bc13c228cab`. **Check completed.**

**Checkpoint A:** Cleanup TDD authority granted by root; T005–T010 are now
EXECUTED (RED → import-only → focused GREEN). Speech feasibility and
user-visible API remain blocked; US1 did not wait for US2.

## Phase 2: User Story 1 — Recover supported local temporary-audio cleanup (P1; RED → GREEN EXECUTED)

**Independent result:** mock SDK55 deprecated root calls fail while supported
legacy calls actually delete the URI exactly once with missing-file idempotence
and native-release/cleanup ordering intact.

### Tests before production

- [x] **T005 [US1]** **TEST-ONLY** add
      `apps/mobile/__tests__/hooks/useVoiceRecorder.filesystem.test.ts` and only
      necessary mock changes in
      `apps/mobile/__tests__/hooks/voice-recorder-fixtures.ts`: model root
      `expo-file-system` async helpers throwing at runtime; separately expose
      usable `expo-file-system/legacy` `getInfoAsync`/`deleteAsync`. Assert
      actual supported adapter use, not simply `mockDelete` called. **EXECUTED
      in test-only commit `392a26f7bd6acdb94e2efe54d1587866d713d2b0`.**
- [x] **T006 [US1]** Extend T005 cases: existing file deletes once;
      `exists=false` idempotently skips deletion; genuine FS error remains
      privacy-safe warned; successful finalize→discard, Stop rejection/null URI
      with pre-release known URI, release BEFORE slow FS, pending cleanup blocks
      start, concurrent Discard/Reset/unmount, stale old generation never
      releases new native recorder, no second Stop/provider. Preserve existing
      `useVoiceRecorder.r2.test.ts` and `useVoiceRecorder.test.ts` oracles
      without editing shared startup-owned suites. **Scope included in the same
      test-only commit `392a26f7…`.**
- [x] **T007 [US1]** Root executes focused recorder filesystem tests on the
      **test-only** commit and accepts meaningful **RED caused by deprecated
      root import**, not unsupported Jest module setup. Report failed
      assertions/exit; no source permission before this receipt. **EXECUTED:
      actual RED `392a26f7…` = 10 fail / 1 pass / 11 total, 7.836s, powered by
      the deprecated root import.**

### Implementation after accepted RED

- [x] **T008 [US1]** In `apps/mobile/hooks/useVoiceRecorder.ts` only, replace
      root `expo-file-system` import with supported `expo-file-system/legacy`,
      preserving async function names, `exists` check, idempotent delete,
      real-error warning, native release-before-FS, cleanup promise and
      generation barriers. Scope expansion only for a deterministically proven
      additional defect. **EXECUTED: production commit
      `84696d745bb8e0fdb37b079a6c76e75af18e7db6` changes only the legacy import;
      async mock reconciliation in `7ad8ed5295f05a6f844f82ec2b2727af206fa906`;
      ESLint repair to the dedicated test included in published
      `e288d12026bd7076682a6d89b6446bc13c228cab`.**
- [x] **T009 [US1]** Root executes focused GREEN for
      `useVoiceRecorder.filesystem.test.ts`, `useVoiceRecorder.test.ts`,
      `useVoiceRecorder.r2.test.ts` plus TypeScript and relevant lint. Ensure no
      vendor import/runtime warnings, no actual audio file leakage in
      deterministic mocks; do not claim native-device proof. **EXECUTED: root
      final GREEN = 72 tests / 3 suites / 3.809s (filesystem, original, r2
      recorder suites); mobile `tsc` PASS; changed ESLint autofix PASS;
      formatting PASS; i18n/privacy/diff PASS.**
- [x] **T010 [US1]** Independent read-only review of exact US1 diff and
      `checklists/manual-plan.md`; authorize owner to verify real Expo cleanup
      after failure and success. **Owner native/device execution NOT RUN by this
      worker.** **EXECUTED: root independent minimal-source review PASS. Owner
      native/device cleanup verification remains NOT RUN / PENDING.**

**Checkpoint B:** Cleanup is independently ready for integration (T005–T010
EXECUTED; owner native proof pending). US2 decoder/VAD remains blocked even
though US1 is green.

## Phase 3: User Story 2 — Prove actual-byte speech feasibility (P1; BLOCKED)

- [x] **T011 [US2]** Preserve `docs/research/voice-empty-audio-guard.md`,
      `scripts/voice-audio-validation-spike/README.md`, Rust decoder/harness and
      `docs/research/voice-audio-validation-spike/{fixtures.template.json,results.template.json}`
      unchanged; root confirms original 19 cases were historical templates; 10
      synthetic negative/invalid controls evaluated and 9 quiet speech positives
      remain MISSING/UNMEASURED (see
      [feasibility report](../../docs/research/voice-audio-validation-spike/feasibility-2026-10-12.md)).
- [x] **T012 [US2]** In a separately permitted runtime (Rust 1.97.1, cargo
      1.97.1, wasm-pack 0.15.0, MSVC BuildTools 14.44.35207 process-locally
      activated, Deno 2.9.7, FFmpeg 9.0.2), compile Symphonia 0.6.1 AAC+ISO MP4
      WASM (`voice_decoder_bg.wasm`, 432,802 bytes, SHA256: `106ef6b2...`) and
      explicitly initialize with generated web-target glue. Clean build exit 0;
      verified Deno proxy PCM decode and ONNX Runtime Web 1.22.0 single-thread
      initialization.
- [ ] **T013 [US2]** Supply nine synthetic AAC/M4A negatives (digital silence,
      fan proxy, traffic proxy ×5/15/30) and invalid-byte control with SHA256
      and provenance; obtain nine **licensed** quiet Egyptian Arabic, English
      and code-switch positives ×5/15/30, then real speech-over-noise, short
      speech, breathing, handling/room and varied speakers. No user/customer
      audio or unlicensed media. Store only ignored local assets. **Research
      candidates ArzEn, FLEURS and Common Voice are identified, but no licensed
      quiet/code-switch positive fixtures are acquired.** _Actual status
      (2026-10-12):_ PARTIAL. 9 synthetic negatives and 1 invalid control
      generated and measured; licensed quiet speech positives remain 0/9
      MISSING. Private owner audio evaluated in an authorized local trial is
      excluded from the public corpus.
- [ ] **T014 [US2]** Measure actual decoder PCM/sample-rate/mono/16k resampling
      behavior, codec padding/truncated containers and Silero ONNX tensor/state
      import for 5/15/30 cases; verify model and ORT WASM checksums and per-clip
      reset. No raw-audio upload/Gemini. _Actual status (2026-10-12):_ PARTIAL.
      Resampling (44.1kHz → 16kHz mono), state reset, and Silero ONNX tensor
      evaluation measured on local Deno proxy across 10 synthetic
      negatives/controls. Model/WASM checksums verified. Truncated/padding and
      positive speech checks remain incomplete.
- [ ] **T015 [US2]** Run repeated permitted cold/warm full decoder+VAD
      measurements with separate CPU/wall per phase, true peak memory, function
      bundle/model/WASM bytes and hosted Edge resource evidence. Local
      `process.cpuUsage` and RSS checkpoints are **not** Edge CPU/true peak
      proof; root records tested source/binary SHA and headroom. _Actual status
      (2026-10-12):_ BLOCKED. Cold Deno proxy (30s: init 812.78ms, audio
      1,996.13ms, end-to-end 2,808.91ms, process CPU proxy 4,234ms, RSS 180.68
      MB / 172.31 MiB) and in-session warm pipeline measured. Edge Runtime
      v1.76.2 probe passed CLI bundle limit (user-r4.eszip: 14,300,416 bytes =
      14.30 MB / 13.64 MiB < 20 MB CLI limit; exceeds 5 MB server Management API
      limit), but failed at runtime
      (`TypeError: Creating a shared memory is not supported`) due to isolate
      policy forbidding shared WebAssembly memory required by the pinned
      threaded distribution. Actual isolated Edge CPU and true peak memory
      remain UNMEASURED; candidate is BLOCKED on Edge.
- [ ] **T016 [US2]** Report per-language/noise FNR/FPR, false-rejection cases
      and a candidate threshold grid without setting product thresholds.
      Root/product decides viability and high-recall acceptance. If any
      tool/license/accuracy/Edge resource gate missing, **STOP: US2 production
      BLOCKED**; do not downgrade to metering, duration, WebRTC defaults or a
      new hosted service. _Actual status (2026-10-12):_ BLOCKED pending
      Edge-compatible non-shared candidate and licensed quiet speech corpus.

## Phase 4: User Story 2 — Reconcile authoritative server contract and TDD (BLOCKED until T011–T016 + decisions)

- [ ] **T017 [US2]** Reconcile `contracts/audio-validation-contract.md` with
      root/product: actual accepted M4A/other media,
      malformed/no-speech/uncertain/validator-failure HTTP/body/copy, decoded
      versus container duration and AAC padding, quiet/short speech policy,
      existing `durationMs < 1500` client minimum; do not preselect numeric VAD
      policy or silently change local 30s cap.
- [ ] **T018 [US2]** Reconcile SQL 087 `voice_ai_reserve_work_at`
      released-terminal same-key `already_processed_result_unavailable`,
      concurrent replay `accepted`+`is_replay=true`, lease expiry, cancellation,
      `voice_ai_release_work` false/unknown and provider-start ambiguity. `#384`
      separate; **no SQL/migration/response-code edits without explicit owner
      decision**.
- [ ] **T019 [US2]** In an agreed future server test allowlist (NOT owned now),
      author deterministic actual-byte structural+decoder/VAD classification
      tests using pinned synthetic/licensed fixtures and negative/malformed
      controls. Verify auth/consent, reservation sequence, provider-start mock 0
      on unusable, 1 on eligible, legitimate quiet speech accepted, no raw
      payload/log leaks.
- [ ] **T020 [US2]** Add race/retry accounting tests in
      `supabase/functions/parse-voice/index.test.ts` and future scoped validator
      tests: duplicate same-key accepted reservation, released terminal refusal,
      unconfirmed release, deadline/lease expiry, actor/cancel and pending
      provider-start outcomes. Use SQL mocks with actual contract decisions, not
      invented success.
- [ ] **T021 [US2]** Root executes focused meaningful server **RED** after gate
      acceptance and grants exact production paths only if failures reflect
      genuinely missing validator behavior, not absent binary/setup.
- [ ] **T022 [US2]** **Only after** T016–T021 acceptance, implement tested
      bounded actual-byte checks and measured Edge-compatible VAD before
      `voice_ai_mark_provider_started`, with existing Gemini and completion
      untouched. No new libraries, migration, hosted function deployment,
      provider calls or refusal UX without separately approved ownership.
- [ ] **T023 [US2]** Root executes focused server GREEN, validates real
      provider-start/reservation counts through deterministic mocks and
      independent replay/tenant/privacy review. **No actual provider or hosted
      deployment test authorized here.**

## Phase 5: User Story 3 — Preserve caller experience and accounting integrity (P2; BLOCKED)

- [ ] **T024 [US3]** Product/root approves final unusable-audio UX/locale text,
      Retry/Manual semantics, unknown/failure handling, and whether any client
      short-speech rule changes. Proposed contract status is not approval.
      Respect startup worker-exclusive route/flow/availability ownership.
- [ ] **T025 [US3]** If authorized, introduce tests for final chosen public
      response parsing/mobile behavior (existing quota 429, consent 403, generic
      network fail closed, retained same-key retry and Manual route). Future
      source ownership requires a **new** handoff; do not edit
      route/flow/availability in this lane.
- [ ] **T026 [US3]** Root independently reviews actual server speech acceptance
      versus quiet Arabic/English/code-switch, false negatives, privacy, replay
      and provider-start accounting. Owner supplies real device/speech data
      under license; this author executes none.
- [ ] **T027 [US3]** Author honestly controllable E2E/manual scenarios in
      `checklists/manual-plan.md`; do **not** run Maestro, native mic/OS
      permissions, provider, emulator or device without owner testing evidence.

## Phase 6: Final integration and release gates (ROOT ONLY)

- [ ] **T028** Root reconciles all accepted source pins and nonoverlap with
      `codex/voice-startup-latency`, #389 and other writers; preserve code/test
      authorship and shared fixtures.
- [ ] **T029** Root executes **one final combined**
      Jest/TypeScript/lint/i18n/privacy/security/schema check batch before
      publication; required focused RED/GREEN checkpoints remain separately
      allowed, not repeated as full batches.
- [ ] **T030** Independent security/performance/architecture review including
      edge CPU/memory evidence, decoder licensing, authentic owner feedback,
      SQL/replay identity, logging and code paths, with no unreviewed
      high/critical issues.
- [ ] **T031** Owner records actual native, OS, positive/negative speech and
      manual results with privacy-safe references. Mark BLOCKED/NOT RUN where
      evidence unavailable; no false test completion.
- [ ] **T032** Root alone controls PR, issue #391 comments, branch/feature push
      and hosted deployment decisions; **none are authorized or executed by this
      planning worker**.

## Dependencies and implementation waves

**Critical independent US1 path:** T001–T004 → T005–T007 actual RED → T008
import-only source → T009 focused GREEN → T010 review. It **does not depend on**
T011–T027. **(US1 portion is now COMPLETE: T005–T010 EXECUTED, root final batch
PASS.)**

**Blocked US2 path:** T001–T004 → T011–T016 measured feasibility+licensed corpus
→ T017/T018 approved contracts → T019/T020 test authoring → T021 actual RED →
T022 production → T023 focused GREEN.

**US3 path:** T017/T018 and T023 → T024 approved UX → T025 tests/implementation
handoff → T026/T027 independent evidence; no starter-worker overlap.

**Final root path:** Actual available slices → T028–T032, including one full
check batch before any requested publication.

## Implementation strategy and status notes

**First independently deliverable slice** is supported SDK55 cleanup; its
RED→import-only→focused-GREEN path is now **EXECUTED** (T005–T010, root final
batch 72 tests / 3 suites PASS). Entire #391 remains provisionally **8–14 hours
after tools/fixtures/decisions are available** (2–4h feasibility, 4–7h
implementation/tests including cleanup, 2–3h review/integration). Offline
feasibility evaluated 2026-10-12 (Deno proxy decoded and evaluated synthetic
negative controls; no production threshold or classification approved, local
Edge Runtime probe failed on shared memory policy; see
[feasibility report](../../docs/research/voice-audio-validation-spike/feasibility-2026-10-12.md)).
No future action is implied or scheduled by documentation. No numeric model
threshold, false-negative tolerance or decoder gapless/padding slack has been
selected.

**Root-only integration:** Actual gate evidence belongs in root receipts, not
invented [x] markings. The existing #347 source was already published
separately; #391 does not reopen its worker branches. **No SQL, locale, config,
issue, PR, provider, package or device action is performed by this planning
document; the recorded root RED/GREEN/test evidence belongs to separate
execution grants.**
