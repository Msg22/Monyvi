# Implementation Plan: #391 Voice Empty-Audio Validation and Cleanup

**Branch**: `codex/voice-empty-audio-guard` | **Date**: 2026-10-12 | **Spec**:
[spec.md](./spec.md)<br> **Input**:
[issue #391](https://github.com/Msg22/Monyvi/issues/391),
[existing authoritative source/constraints](../389-voice-usage-limits/spec.md).<br>
**Planning authority**: Root's feature configuration
`SPECIFY_FEATURE=391-voice-empty-audio-guard` and
`SPECIFY_FEATURE_DIRECTORY=specs/391-voice-empty-audio-guard`.<br> **Status**:
US1 cleanup EXECUTED (TDD RED → import-only legacy → focused GREEN, root final
batch PASS); server decoder/VAD design explicitly ABANDONED and SUPERSEDED per
user decision. Approved direction is conservative on-device metering as a
pre-upload cost optimization (reject only clearly silent recordings with
sufficient valid capture measurements; uncertain/missing measurements pass to
server; zero recording upload, parse-voice submission, reservation, or
provider-start attributable to a locally rejected recording). Normal auth,
entitlement refresh, and sync can still make network requests. Runtime
integration is NOT part of this slice; metering implementation, threshold
calibration, and physical device testing remain pending. All prototype spike
files have been deleted. Server API contracts remain completely unchanged;
server duration follow-up is out of scope and not addressed.

## Summary

Deliver **three separable slices**:

1. **Slice A — Cleanup Adapter (EXECUTED)**: Corrected Expo SDK 55
   temporary-audio cleanup using the supported async `expo-file-system/legacy`
   import, after meaningful throwing-root versus working-legacy RED tests.
   Preserves native release-before-FS cleanup, known URI capture, missing-file
   idempotence, once-only disposal, and generation/restart barriers. Root final
   GREEN batch (72 tests / 3 suites / 3.809s) verified.

2. **Slice B — Server Detector Retirement (SUPERSEDED & RETIRED)**: Server-side
   WASM decoding and Silero ONNX speech detection pipeline is explicitly
   ABANDONED. Edge Runtime shared memory isolate incompatibility, complexity,
   and positive Egyptian speech corpus requirements are retired. Prototype files
   in `scripts/voice-audio-validation-spike/` and
   `docs/research/voice-audio-validation-spike/` have been deleted.

3. **Slice C — Conservative On-Device Metering (APPROVED; PENDING)**: Approved
   client-side cost optimization in `apps/mobile`. Rejects only clearly silent
   recordings with sufficient valid capture measurements. Passes on missing or
   uncertain measurements. Acknowledges that a loudness-only meter cannot
   unconditionally distinguish quiet speech from ambient noise due to amplitude
   overlap, requiring conservative thresholds and validation of representative
   quiet, short, and noisy speech before shipping. On local silence rejection,
   the client aborts submission before upload, invoking zero recording upload,
   parse-voice submission, reservation, or provider-start. Runtime integration
   is NOT implemented in this documentation retirement slice. Approved proposed
   copy: `"We couldn’t hear anything. Please try recording again."`

## Technical Context

| Concern         | Verified boundary / disposition                                                                                                                 | Source                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Runtime         | React Native 0.83.6, Expo `~55.0.27`, `expo-file-system ~55.0.23`, `expo-audio ~55.0.15`                                                        | `apps/mobile/package.json` @ Voice `f625183…`                                         |
| Cleanup         | Migrated to `expo-file-system/legacy`; `cleanupRecorderResources()` coordinates release before async deletion, stale generations and retry      | Published `e288d12026bd7076682a6d89b6446bc13c228cab`                                  |
| Server API      | `POST /functions/v1/parse-voice` UNCHANGED; structural zero-byte check preserved; no new server validation or error contracts                   | `supabase/functions/parse-voice/index.ts`, `contracts/parse-voice-quota.openapi.yaml` |
| Accounting      | SQL 087 contracts UNCHANGED; client silence bypass causes zero recording upload or reservation, consuming zero quota/allowance                  | `supabase/migrations/087_voice_ai_usage_limits.sql`                                   |
| Local capture   | 30,000ms active cap; client `durationMs < 1500` guard preserved; server duration follow-up is out of scope and not addressed                    | #389 FR-045/FR-046                                                                    |
| Server detector | SUPERSEDED & RETIRED: Symphonia WASM, Silero ONNX, and Edge Runtime isolate shared-memory blockers retired; prototype files deleted             | Pinned feasibility findings superseded; scripts deleted                               |
| Client metering | Approved direction: conservative metering in mobile app; reject only unambiguous silence with valid measurements; validate quiet/noisy; PENDING | User decision 2026-10-12                                                              |

## Constitution Check

| Principle                                    | Plan disposition                                                                                                                                          |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offline-first and authenticated/user scope   | PASS: Local cleanup is fully on-device; client silence bypass saves local battery and network without altering authenticated server scope.                |
| Documented business logic                    | PASS: Server contracts from #389 preserved unchanged; user decision abandoning server detection recorded; server duration follow-up noted as unaddressed. |
| Type safety and runtime validation           | PASS: Strict TypeScript maintained; no `any` or unsafe assertions.                                                                                        |
| Service-layer separation                     | PASS: Recorder owns local cleanup; future metering will reside in mobile services/hooks without mixing concerns.                                          |
| No premature visual deviation                | PASS: No UI modifications made in this slice; approved proposed English copy recorded; translation/integration deferred.                                  |
| Security/privacy and sync                    | PASS: No raw media or audio metrics persisted or logged; zero external provider calls attributable to locally rejected recordings.                        |
| Mandatory RED → GREEN and independent review | PASS: Cleanup slice RED→GREEN EXECUTED (72 tests / 3 suites PASS); future metering TDD will follow strict tests-first rules.                              |

**Cleanup execution checkpoint (2026-10-12):** Test-only RED
`392a26f7bd6acdb94e2efe54d1587866d713d2b0` (10 fail / 1 pass / 11 total, 7.836s)
→ import-only production `84696d745bb8e0fdb37b079a6c76e75af18e7db6` → async mock
reconciliation `7ad8ed5295f05a6f844f82ec2b2727af206fa906` → ESLint repair
included in published `e288d12026bd7076682a6d89b6446bc13c228cab` → root final
GREEN **72 tests / 3 suites / 3.809s** (filesystem, original, r2 recorder
suites) with mobile `tsc`, changed ESLint autofix, formatting, i18n/privacy and
diff PASS, plus a root independent minimal-source review PASS.

## Architecture and Scope

### A. Cleanup Adapter (EXECUTED)

Control flow:

1. Native audio finalizes; recorder stores URI including partial URI
   pre-release.
2. `cleanupRecorderResources` awaits any in-flight start/stop, captures known
   URI, **releases native recorder before filesystem work**, and serializes
   retries with `cleanupPromiseRef`.
3. Supported async `expo-file-system/legacy` `getInfoAsync` and `deleteAsync`
   perform idempotent deletion without runtime throws.

### B. Server Speech Detector (SUPERSEDED & RETIRED)

Server-side decoding and Silero ONNX VAD are abandoned. The prototype harness in
`scripts/voice-audio-validation-spike/` and research templates in
`docs/research/voice-audio-validation-spike/` are deleted. All previous
benchmark findings and Edge Runtime isolate shared-memory blockers are
superseded. Server endpoints in `supabase/functions/parse-voice/` remain
completely unchanged.

### C. Conservative On-Device Metering (APPROVED; PENDING)

Future sequence upon implementation:
`Audio capture with metering → evaluate measurements → [insufficient/missing metrics OR non-silent audio: proceed to upload/parse-voice] / [sufficient valid metrics proving clear silence: abort locally with friendly copy, zero recording upload, zero reservation, zero provider cost]`.

Key invariants:

- **Cost optimization only**: Not authoritative speech proof or background-noise
  filtering.
- **Inherent amplitude limitations**: Loudness-only metering cannot
  unconditionally distinguish quiet speech from noise. Amplitude overlap must be
  accounted for by conservative threshold calibration and validation of
  representative quiet, short, and noisy speech before shipping.
- **Fail-open**: Missing, sparse, or uncertain metering data pass to the server.
- **Zero server side-effects for silence**: Local rejection prevents recording
  upload, parse-voice submission, work reservation, and Gemini provider
  invocation. Normal auth, entitlement refresh, and sync network calls remain
  unaffected.
- **Approved proposed copy**: User approved
  `"We couldn’t hear anything. Please try recording again."`
- **Unimplemented in this slice**: Implementation, threshold calibration, and
  device verification are deferred to future tasks.

### D. Server Contracts and Duration

Existing request and accounting contracts in
`contracts/parse-voice-quota.openapi.yaml` and migration 087 remain
authoritative and unchanged. Server duration enforcement follow-up is explicitly
out of scope and identified as not addressed.

## Phase 0 — Prototype Retirement (COMPLETED)

- Deleted 10 prototype and research files:
  - `scripts/voice-audio-validation-spike/.gitignore`
  - `scripts/voice-audio-validation-spike/README.md`
  - `scripts/voice-audio-validation-spike/benchmark.ts`
  - `scripts/voice-audio-validation-spike/prepare-fixtures.ts`
  - `scripts/voice-audio-validation-spike/decoder/Cargo.toml`
  - `scripts/voice-audio-validation-spike/decoder/src/lib.rs`
  - `docs/research/voice-audio-validation-spike/fixtures.template.json`
  - `docs/research/voice-audio-validation-spike/results.template.json`
  - `docs/research/voice-audio-validation-spike/feasibility-2026-10-12.md`
  - `docs/research/voice-empty-audio-guard.md`
- Marked historical synthetic/VAD benchmark findings superseded.

## Phase 1 — Cleanup TDD (EXECUTED 2026-10-12)

Results: test-only RED `392a26f7…` (10 fail / 1 pass / 11 total, 7.836s) →
import-only production `84696d74…` → async mock reconciliation `7ad8ed52…` →
root final GREEN 72 tests / 3 suites / 3.809s (filesystem, original, r2 recorder
suites); mobile tsc, ESLint autofix, formatting, i18n/privacy and diff PASS;
independent minimal-source review PASS. Owner native/device validation remains
**NOT RUN**.

## Phase 2 — Server Speech Feasibility & Contracts (SUPERSEDED)

- Server-side WASM decoder, Silero VAD, Edge Runtime isolate shared-memory
  workarounds, and positive Egyptian speech corpus requirements are RETIRED.
- Proposed server-side `no_speech` and validator error contracts are REMOVED.
- Server API contracts remain completely unchanged.

## Phase 3 — Conservative On-Device Metering (PENDING FUTURE SLICE)

- Define mobile metering threshold calibration against physical devices.
- Author unit tests proving:
  - Clear silence with sufficient valid measurements is rejected locally.
  - Missing or uncertain metering samples pass to server.
  - Representative quiet, short, and noisy speech within policy passes to
    server.
  - Zero recording upload, parse-voice submission, reservation, or
    provider-start attributable to a locally rejected recording.
- Execute TDD (RED → GREEN) in mobile services/hooks.
- Verify owner manual testing on physical iOS and Android hardware.

## Project Structure

### Canonical documentation, this feature

`specs/391-voice-empty-audio-guard/`

- `spec.md` — prioritized scenarios, FR/NFR, and gating outcomes
- `plan.md` — this updated architecture and retirement plan
- `tasks.md` — sequential tasks with explicit superseded dispositions
- `contracts/audio-validation-contract.md` — document client-only bypass and
  preservation of unchanged existing server contracts
- `checklists/analysis.md` — updated semantic cross-artifact analysis
- `checklists/manual-plan.md` — owner manual evidence matrix (cleanup and
  metering marked NOT RUN)

## Complexity Tracking

No new external dependencies, WASM crates, ONNX models, or server migrations.
Complexity is reduced by retiring the server-side detector and adopting a
conservative client-side metering cost guard.
