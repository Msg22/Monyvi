# Implementation Plan: #391 Voice Empty-Audio Validation and Cleanup

**Branch**: `codex/voice-empty-audio-guard` | **Date**: 2026-10-12 | **Spec**: [spec.md](./spec.md)<br>
**Input**: [issue #391](https://github.com/Msg22/Monyvi/issues/391), [existing authoritative source/constraints](../389-voice-usage-limits/spec.md), [current source research](../../docs/research/voice-empty-audio-guard.md).<br>
**Planning authority**: Root's actual correct-feature target requires **both** `SPECIFY_FEATURE=391-voice-empty-audio-guard` **and** `SPECIFY_FEATURE_DIRECTORY=specs/391-voice-empty-audio-guard`; `.specify/feature.json` otherwise selects feature 389. Existing #391 branch only; no generated branch, hooks, broad codemap, issue or production mutation.<br>
**Status**: PLANNED / NOT EXECUTED. US1 cleanup is TDD-ready after root grant; US2 speech is BLOCKED. Startup latency/route/flow/availability belong exclusively to `codex/voice-startup-latency`.

## Summary

Deliver **two separable slices**. **Slice A (READY)** corrects Expo SDK 55 temporary-audio cleanup using the supported async `expo-file-system/legacy` import, after meaningful throwing-root versus working-legacy RED tests. It preserves native release-before-FS cleanup, known URI capture, missing-file idempotence, once-only disposal and generation/restart barriers.

**Slice B (BLOCKED)** would validate actual uploaded media on the authoritative server before `voice_ai_mark_provider_started`/Gemini. Only a measured, licensed high-recall AAC decode/VAD pipeline and reconciled product/accounting/error contracts can authorize source work. The [nine published research/prototype artifacts](../../docs/research/voice-empty-audio-guard.md) are unchanged and **not executed**.

## Technical Context

| Concern | Current verified boundary | Source |
| --- | --- | --- |
| Runtime | React Native 0.83.6, Expo `~55.0.27`, `expo-file-system ~55.0.23`, `expo-audio ~55.0.15` | `apps/mobile/package.json` @ Voice `f625183…` |
| Cleanup | `useVoiceRecorder.ts:34,725–734` imports runtime-throwing filesystem root methods; `cleanupRecorderResources()` already coordinates release before async deletion, stale generations and retry | Current published Voice `f625183373e29d372b658c10b3848a217477400a` |
| Upload | `ai-voice-parser-service.ts` posts multipart local URI, stable request key, timezone, optional date, account/category context to `parse-voice`; 30-second network timeout is not recording length | Current mobile service |
| Server | `parse-voice/index.ts` checks zero bytes/5 MB and signature fallback; no decoded speech check; reserve → provider-start → Gemini; server success/quota structures already defined | `supabase/functions/parse-voice/index.ts`, `contracts/parse-voice-quota.openapi.yaml` |
| Accounting | Existing SQL 087 scopes work by actor+key, provider start consumes allowance, release allowed only for reserved/non-started rows; 35-day replay identity remains | `supabase/migrations/087_voice_ai_usage_limits.sql` |
| Local capture | 30,000ms **active** cap; paused time excluded; `submitRecording` rejects under 1,500ms (not speech detection) | #389 FR-045/FR-046 and current flow |
| Runtime spike | Symphonia 0.6.1 AAC/MP4 → wasm-bindgen web target → pinned Silero ONNX + ONNX Runtime Web 1.22.0; missing all 19 fixtures, model/binary/Edge execution evidence | `scripts/voice-audio-validation-spike/README.md` and templates |
| Resource limits | Supabase published CPU, memory and bundle ceilings are comparison targets; **no actual Edge benchmark** | [Supabase limits](https://supabase.com/docs/guides/functions/limits) |
| Tool limitation | Existing executor blocks Deno and FFmpeg; no workarounds, installs, replacement hosted services or device execution | Published `docs/research/voice-empty-audio-guard.md` |

**Language/testing**: TypeScript strict RN/Jest and Deno Edge/shared contracts; Rust/WASM prototype (not compiled). No new packages, lockfile edits, migrations, hosted changes, customer audio, secrets, provider calls or model artifacts in Git.

## Constitution Check

| Principle | Plan disposition |
| --- | --- |
| Offline-first and authenticated/user scope | PASS for planning: financial writes/Manual untouched; Voice validation already uses authenticated server; no client state becomes authoritative. |
| Documented business logic | PASS for planning: #389 consent, 30-second local cap, 35-day replay, #384 deferral and provider start policy preserved; new rejection is explicitly undecided. |
| Type safety and runtime validation | PASS for planning: propose typed internal decisions and tested boundary parsing; no `any`, unsafe casts or unvalidated external data. |
| Service-layer separation | PASS for planning: recorder owns local cleanup; Edge/shared validator owns actual submitted audio, provider and quota remain separately accountable; startup worker owns route/flow. |
| No premature visual deviation | PASS for planning: no product UI/source/copy modifications; new refusal UI needs owner approval and rendered evidence if later assigned. |
| Security/privacy and sync | PASS for planning: raw media never persisted/logged; actor/consent/cancellation retained; no SQL, migration or sync changes without explicit decision. |
| Mandatory RED → GREEN and independent review | PASS for planning only: rooted tasks enforce actual RED, accepted source grants and one final root quality batch; no checks were executed in this document lane. |

**Root's actual pre-code receipt (2026-10-12):** With **both** feature environment variables above, root ran the correct-feature canonical prerequisite: **PASS**, `FEATURE_DIR=/mnt/e/Work/My Projects/Monyvi-voice-empty-audio-guard/specs/391-voice-empty-audio-guard`, `AVAILABLE_DOCS=contracts/,tasks.md`. Root independently ran canonical **READ-ONLY** Speckit analysis over the complete artifacts/constitution: **0 critical and 0 cleanup-blocking HIGH**, while speech gates **B1/B2/C1 remain 3 HIGH/BLOCKED**. It used an existing ignored `.git` administrative script for the permitted command because inline Bash `-c` is tool-blocked; this is evidence of root's completed run, **not authorization to retry or bypass**. WSL reported Git not detected and skipped branch validation; root independently verified native Git branch/tree/ancestry. No optional Git hooks ran. Root's measured lockfile-only and junction runtime checks both resolved `expo-file-system@55.0.23` without a package change. No cleanup RED or production GREEN has run at this documentation stage.

## Architecture and scope

### A. Cleanup adapter: independent, no speech/UX dependencies

Current control flow:
1. Native audio finalizes; recorder stores URI including partial URI pre-release.
2. `cleanupRecorderResources` awaits any in-flight start/stop, captures known URI, **releases native recorder before filesystem work**, serializes retries with `cleanupPromiseRef`.
3. Current `FileSystem.getInfoAsync` / `deleteAsync` throw from root import under Expo 55; error is logged and file may remain.

Proposed minimal change **only after actual RED**: keep call order and async cleanup intact, switch `import * as FileSystem from "expo-file-system"` to `"expo-file-system/legacy"` and align the fixture mocks. Do **not** substitute synchronous new `File` API in this bounded fix or merely suppress the warning.

**Future exact source ownership when separately assigned:** only `apps/mobile/hooks/useVoiceRecorder.ts`, `apps/mobile/__tests__/hooks/voice-recorder-fixtures.ts`, and new `apps/mobile/__tests__/hooks/useVoiceRecorder.filesystem.test.ts`. No route/flow/availability/shared startup-owned tests/fixtures or other recorder files are granted by this plan.

### B. Server actual-byte/speech validator: blocked on feasibility

Proposed sequence (requires accepted decisions, source test RED, and a dedicated future writable allowlist):

`Auth + active consent → read bounded actual bytes / strict supported-media checks → validate key/timezone → resolve policy → reserveVoiceAiWork → measured decode/downmix/resample+speech VAD → [known unusable: verified pre-provider release] / [validator failure: reconciled fail-closed response] / [eligible speech: markVoiceAiProviderStarted → Gemini → existing complete]`.

This is **not** a deployed or measured pipeline. Inconclusive speech, validator errors, concurrent same-key reservations, released terminal same-key replay, expiry and release RPC ambiguity require explicit contract decisions. No arbitrary threshold, minimum voiced time, AAC-padding tolerance or default `no_speech` response is selected.

### C. Existing request and accounting contracts

[Proposed audio-validation contract](./contracts/audio-validation-contract.md) **only describes decision gates**; it does not add an OpenAPI status/JSON body. Successful parser and 429 quota outputs remain governed by [#389](../389-voice-usage-limits/contracts/parse-voice-quota.openapi.yaml).

**Important SQL mismatch:** `private.voice_ai_reserve_work_at` returns `already_processed_result_unavailable` for a released terminal row's same key; reservation success on an already-active key may be `accepted` / `is_replay=true` and permit concurrent decoder execution; `voice_ai_release_work` acts only on `reserved` plus `provider_started_at IS NULL`. Before any server code, root must reconcile retry/terminal/lease behavior, duplicate expensive validation and unknown release/mark outcomes. #384 deferred reservation UX remains separate.

## Phase 0 — Preserve completed research, establish readiness

Link, do not regenerate:
- `docs/research/voice-empty-audio-guard.md` with historical 60s source and later unexecuted candidate/harness correction.
- `scripts/voice-audio-validation-spike/{README.md,benchmark.ts,prepare-fixtures.ts,decoder/}` and `docs/research/voice-audio-validation-spike/{fixtures.template.json,results.template.json}`. Pinned research remains **BLOCKED/UNMEASURED**.
- Official Expo SDK 55 [filesystem root](https://docs.expo.dev/versions/v55.0.0/sdk/filesystem/) and [legacy](https://docs.expo.dev/versions/v55.0.0/sdk/filesystem-legacy/) docs, proving root methods throw and asynchronous legacy compatibility exists.

Root compares pinned `a7e1e00e…` branch head against `f625183…` and confirms only nine research/prototype files differ; root owns all future refs, merges, issue/PR updates and branch mutation outside this planning assignment.

## Phase 1 — Cleanup TDD (independently executable after root source grant)

1. **Test-only** adapter test in dedicated `useVoiceRecorder.filesystem.test.ts` and existing fixture: root `getInfoAsync`/`deleteAsync` throw under SDK55, legacy `getInfoAsync` reports existence/missing and legacy `deleteAsync` is idempotent. Exercise success/failed stop/null URI, release-before-getInfo, pending filesystem barrier, repeat discard, and real I/O warning. Ensure this is not a mock-only 'function called' oracle.
2. **Actual RED checkpoint** run by root; expected failure must be supported by the observed deprecated import, not syntax/module setup.
3. **Minimal production** import-only correction, no other code unless a deterministically reproduced additional defect and root acceptance.
4. Root executes focused GREEN (filesystem/recorder family), TypeScript/lint and test seam review. Owner native/device validation remains **NOT RUN** until later evidence.

## Phase 2 — Speech feasibility (BLOCKED; no execution here)

1. A separately permitted executor with installed pinned toolchain and provenance; never retry blocked `deno.exe`/FFmpeg in the present lean-ctx environment or route around protection.
2. Verify Rust/Symphonia AAC-LC + ISO MP4 WASM compile; correct wasm-bindgen web ES initializer; pinned Silero model + ORT 1.22.0 load, tensor shapes, sample-rate context and per-clip state reset. Stop and record first real stderr on failure.
3. Build locally ignored synthetic digital silence/fan/traffic proxy and malformed controls at 5/15/30s; obtain nine **licensed** quiet Egyptian Arabic, English and code-switch positives plus representative varied speakers, short words, real room/traffic/handling/breathing and speech-over-noise. No private/customer files.
4. Validate actual decode/sample rate/mono/encoder padding, run a **candidate threshold grid** (no production policy), report FNR/FPR with confidence, cold/warm CPU and wall per stage, **true peak memory**, model/decoder/ORT hashes/sizes and total Edge-bundled bytes. Hosted Edge CPU/memory/headroom measurements must be separate from local Deno proxies.
5. Root evaluates feasibility against actual Supabase resource limits and quiet-speech preservation. If infeasible/missing corpus, server production remains **BLOCKED**; alternative validator service demands separate privacy/deployment approval, not an automatic substitution.

## Phase 3 — Authoritative server RED → implementation (GATED)

- Reconcile public unusable-audio and validator-error HTTP/body/copy, uncertainty policy, supported formats, local <1.5s vs valid short speech, decoded duration/padding, released-terminal same-key, in-flight same-key validation concurrency and lease/failed release behavior. Record owner/root decisions in canonical contract **before writing tests/source**.
- Use `supabase/functions/parse-voice/index.test.ts` and scoped new validator unit tests only after source ownership assigned; test mocked provider invocations and exact SQL RPC order/decisions. No live Gemini, calls to hosted Supabase, migrations or trials in blocked executor.
- Root accepts meaningful RED, delegates only agreed source, runs focused GREEN; maintain existing success parsing and provider accounting.
- Any new localization/route/flow/UX and any SQL change requires separate scope and owner decision. Root's startup branch owns route/flow/availability.

## Phase 4 — Review, evidence and integration

Root arranges independent TypeScript/async, security/privacy, SQL/lease/race and measured audio quality review. The [manual plan](./checklists/manual-plan.md) provides **owner-only** native/OS/audio/device and honestly controllable E2E cases; authoring is not execution.

Root preserves **one final combined check batch before publication**, apart from the mandatory actual RED checkpoints and focused GREEN needed to justify work. No installation, deployment, emulator, provider call, feature push or root-owned PR/issue mutation is authorized here.

## Project Structure

### Canonical documentation, this feature

`specs/391-voice-empty-audio-guard/`
- `spec.md` — prioritized scenarios, FR/NFR and gating outcomes
- `plan.md` — this source-backed, separable design
- `tasks.md` — sequential RED/GREEN/feasibility/review tasks
- `contracts/audio-validation-contract.md` — **proposed** response/accounting boundary, not a new API
- `checklists/analysis.md` — read-only structured cross-artifact analysis after docs
- `checklists/manual-plan.md` — unexecuted owner evidence matrix

### Existing code and research (linked, not changed by planning)

`apps/mobile/hooks/useVoiceRecorder.ts` and its recorder tests/fixture; `apps/mobile/services/ai-voice-parser-service.ts`; `apps/mobile/hooks/useVoiceTransactionFlow.ts` (startup branch ownership, no #391 writes); `supabase/functions/parse-voice/index.ts` and its tests; `supabase/functions/_shared/voice-ai-*.ts`; `packages/logic/src/voice-ai-safeguard-contract.ts`; `supabase/migrations/087_voice_ai_usage_limits.sql` (read-only); research/harness listed above.

## Dependency gates and estimate

| Gate | Cleanup slice | Server speech slice |
| --- | --- | --- |
| Root approves canonical plan/ownership | Required | Required |
| Actual meaningful unit RED | Required before production | Required after feasibility + contract |
| Licensed 5/15/30 fixtures, decoder/VAD compatibility, Edge measurements | **Not required** | **BLOCKING** |
| New public copy/response/lease policy | **Not required** | **BLOCKING** |
| Device/OS/manual acceptance | Owner afterward | Owner afterward |
| New migration/hosted/provider/package | **Not permitted** | **Not permitted by current grant** |

Provisional full remaining effort **8–14 hours only after feasibility inputs exist**: **2–4h** readiness/benchmark, **4–7h** approved implementation/tests (includes **30–60min** cleanup), **2–3h** independent review/root integration. Missing permitted runtime or licensed positives prevents reliable scheduling of speech completion. No unmeasured 1–2-second startup timing promise; that work is in the separate startup branch.

## Complexity Tracking

No constitution exception or unexplained complexity authorized. WASM/ONNX components are **research-only** candidates; no source dependency, deployment, schema, third-party processor or new price/quota policy may be introduced until root explicitly accepts measured feasibility and product/privacy gates.
