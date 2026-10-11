# Voice controls R2 — scoped binding context (delegated exact revision accepted)

**Feature:** #347 / `389-voice-usage-limits`  
**Source audited:** `0e7ee55abf6fb18af37e29e4f2e48ba45604a31e`  
**Planning branch:** `codex/issue347-voice-controls-r2`  
**Approved PNG:** `voice-controls-r2-green-gray-proposal.png`, published in image-only commit `b00b7ae07a7f75008f21ff2c9f8680f735153901`, Git blob `caceb8d1cade9e4e9c574e95fc0e603a39e766de`  
**Verified image:** `sha256:3c1d098090cfac539c834634f2dfb1db29dc75b8afc9f479d61d17af09680281`; **1832 × 858 pixels**, **1470108 bytes** (local executor verified exact bytes and matching Git blob)  
**Owner concept approval:** “latest mockups approved” (green/gray/red); root faithful review accepts AR `إرسال` and `التسجيل مكتمل`. On 2026-10-11 root verified the exact metadata revision sha256:78105dbc1254cb508429f417cf5e26c71324364c7e4e74447f7249735f282a0e and combined revision sha256:d06cfdf4f6bbc8c3bd7f12b5129115206a31c7f3c1dfb4a266977456252caa14, then accepted these and image sha256:3c1d098090cfac539c834634f2dfb1db29dc75b8afc9f479d61d17af09680281 under owner-delegated autonomy. This is not personal owner review of newly computed SHA fingerprints; final verifier PASS and fresh read-only Speckit analysis remain pending.

## Authority and precedence

Use [the R2 sidecar](./voice-controls-r2-green-gray-proposal.binding.md) with its **15 official required Binding Facts keys** and [R2 manifest](./voice-controls-r2-manifest.json). The image has verified bytes; a 1832×858 composite raster is **not** an app logical-dp viewport. Existing owner-approved comparison baseline remains 390×844 logical dp (font scale 1; fixture insets 24 top/34 bottom; actual safe area once), with 16 dp gutters, 12 dp section gaps, 104 dp clipped mic, unboxed Voice section, ≥48 dp interactive targets and centered max 560 dp tablet width. Exact per-panel raster coordinates/easing and material reflow choices not specified by the owner are not inferred.

R2 supersedes R1 **only** for the recording/paused/completed action labels/colors and fixed physical positions, elapsed/max local 30-second active cap including completed-state retention and no helper sentence, and removal of **ordinary static filled** mic halos from idle/Starting/recording/paused. R1 retains recording ripple/wave motion, reduced-motion static substitutes, permission/consent explanation, examples, retry, parsing, localization and cleanup. The five original repair references retain Manual B, daily-limit, unavailable, quota/allowance and all unaffected visuals. No old image/sidecar/manifest/history bytes change here.

## Explicit three-panel state and action binding

| R2 approved panel | Physical LEFT | Physical CENTER | Physical RIGHT | Timer and microphone treatment |
| --- | --- | --- | --- | --- |
| **Recording** | **Submit**, green/NileGreen; AR **إرسال** | **Pause**, gray/slate; AR **إيقاف مؤقت** | **Discard**, red; AR **تجاهل** | Elapsed / `00:30` (example `00:12 / 00:30`); active R1 outward waves, no static filled halos |
| **Paused** | **Submit**, same green; AR **إرسال** | **Resume**, gray/slate; AR **متابعة** | **Discard**, same red; AR **تجاهل** | Active elapsed time frozen; no active recording waves, no static filled halos |
| **Recording complete / التسجيل مكتمل** (third panel) | **Submit**, green and enabled for retained audio | **Pause**, **gray and disabled**; **no Resume** | **Discard**, red and enabled | **`00:30 / 00:30`** exactly; native auto-stop/finalized retained audio, no active waves |

Physical LEFT/CENTER/RIGHT positions are intentionally stable in English and Arabic; do **not** mirror action identities with `row-reverse`. Preserve normal RTL text, localized font and all R1 Arabic-specific allowance/examples. Every enabled action has ≥48 dp touch area. The central disabled Pause remains visibly neutral gray with disabled accessibility state. The owner removed the ordinary helper sentence: **none appears in any three R2 panels**.

## Recorder and submit lifecycle

- The local cap is **30,000 ms active recorded audio**, excluding paused time; native capture begins only after successful `record()` invocation and the real recording timer starts then. Keep the existing **300 ms native stabilization** after record for early pause/stop safety; it is **not** a separate 300 ms requirement before showing Listening.
- At cap, automatically stop/finalize **locally**, clamp the displayed clock to `00:30 / 00:30`, retain the completed audio/URI, show `Recording complete` / `التسجيل مكتمل` and **wait for explicit Submit or Discard**. Do not automatically call Gemini, `parse-voice`, consume a provider allowance or navigate to review.
- Submit while still recording/paused must safely stop and submit one logical request; Submit after cap uses the existing retained file without a second native stop. Discard always cleans up and submits nothing. Race-safe atomic effective outcomes are mandatory for cap vs Submit/Discard, unmount/back/cancel, user switch and delayed native callbacks. No Resume at/after cap.
- R2 is **not** a server-side 30-second duration policy. Issue #391 separately owns authoritative server duration and empty/speechless-audio research; this planning branch does not inspect or alter those APIs.

## Minimum safe latency correction mapped to T069–T071

The accepted read-only source audit found **two concrete avoidable operations**, but measured time contribution is unknown.

1. **Duplicate native permission reads:** `app/(private)/add-transaction.tsx:288` refreshes before `useVoiceTransactionFlow.startFlow` refreshes the same permission again at `hooks/useVoiceTransactionFlow.ts:376`. T069 must author deterministic Red proving a **single fresh just-in-time native verification** per normal attempt and typed actor/generation-scoped permission outcome. T070 owns the minimal route/flow repair: route preserves inline permission explanation, with native OS request **only after explicit Allow microphone**. The flow owns fresh revocation-safe permission validation close to capture. Consent and server-authoritative preattempt quota remain; no guessed cache TTL, no early OS request and no Listening before real native record.
2. **Unnecessary initial Manual mount on a direct Voice route:** `add-transaction.tsx:625` mounts the hidden `ManualTransactionEntry` immediately, creating account/category/market/currency/budget subscriptions even when Voice selected. T069 proves lazy **first** Manual mount for Voice-first entry and **kept-mounted once selected** to preserve draft, Save/transfer/recurring and current mode/Back behavior. T071 owns this narrow conditional-first-mount composition change, not a financial/Manual internal rewrite. Default Manual route still mounts immediately. This need not defer eager JS module imports without separate evidence.

Other auth/startup/provider/transport hypotheses remain **unmeasured**. Do **not** alter Voice availability focus/start HTTP cancellation or in-flight coordination without stronger native/network evidence. Author timing markers for owner measurements only: bottom mic tap → navigation dispatch → route mount/first frame; Starting → fresh **local** consent → authoritative availability → one permission result → native audio mode/prepare → `record()` → first Recording frame. Log only monotonic duration, stage and transient non-identifying trace correlation; never audio, financial/transcript data, user ID or credentials. **No 1–2 s promise.**

## Required ordering and evidence boundary

1. The root verified the exact PNG, 15-key Binding Facts and revision tuple sha256:78105dbc1254cb508429f417cf5e26c71324364c7e4e74447f7249735f282a0e / sha256:d06cfdf4f6bbc8c3bd7f12b5129115206a31c7f3c1dfb4a266977456252caa14, accepted under delegated authority on 2026-10-11, and must now run the final canonical verifier on approved metadata. Owner approval is of the image/concept, not a claimed owner review of a new hash.
2. **BEFORE T069–T071 implementation or tests:** root runs `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks` with the correct feature selection, then **read-only `.claude/commands/speckit.analyze.md`** over final spec/plan/tasks. Resolve critical/high findings and log outcome. This is preimplementation, **not** T073 after code.
3. Only on a new explicit lead pin and accepted meaningful Red may source implementation start. T073 is independent **postimplementation** TypeScript → behavior/actor/cancellation → style/binding → QA/security-if-touched review; T072 owns Green/type/lint checks.
4. Device/native/render/accessibility evidence remains owner-owned and **NOT RUN**. Compare actual owner image against 390×844 and 320×640, tablet 768×1024, landscape 844×390, light/dark, EN/AR, font scales 1.35/2 and reduced motion. The image fingerprint or unit Green does not prove visual or native timing.

No additional product approval gate is created by this index. No SQL, provider, hosted, other workers' branches or R1/original images are changed.
