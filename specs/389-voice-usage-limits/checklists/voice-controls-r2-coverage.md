# Voice controls R2 — planned coverage matrix

**Status:** PLANNED / NOT RUN. Owner R2 image approved; exact corrected sidecar
binding metadata was accepted 2026-10-11 under delegated root authority (see R2
sidecar/manifest); execution remains NOT RUN. Unit/integration entries are
required deterministic coverage; Maestro entries are authorable journeys only.
All device/native/visual/provider/E2E execution is owner-manual unless an
approved deterministic harness is later proven.

**Dated current execution receipt is in the appendix below; this initial
PLANNED/NOT RUN header is historical (before implementation).**

| #    | Scenario / oracle                                                                                                                                 | Deterministic unit/integration plan                                                                                    | Maestro authorship / limitation                        | Owner evidence                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------- |
| R201 | Recording LEFT Submit green, CENTER Pause gray, RIGHT Discard red; ≥48 dp                                                                         | Native resolved action order/colors/roles, no helper sentence                                                          | Author one deterministic view if harness permits       | Owner recording EN light/dark                |
| R202 | Paused LEFT Submit green, CENTER Resume gray, RIGHT Discard red; no physical swap                                                                 | Paused callbacks, action identity, frozen timer                                                                        | Author only controllable pause/resume flow             | Owner paused capture                         |
| R203 | Arabic has Submit إرسال, Pause إيقاف مؤقت, Resume متابعة, Discard تجاهل; stable physical order                                                    | AR RNTL labels, direction, accessible order without row-reverse                                                        | Conditional seeded locale flow                         | AR/RTL physical placement and screen reader  |
| R204 | Registered green/gray/red controls across themes; completed center Pause is disabled gray                                                         | Native compiled action colors, disabled opacity/role + positive contrast                                               | Snapshot authoring only, not pixel proof               | Owner light/dark and disabled center         |
| R205 | Controls remain ≥48 dp at compact/ordinary/enlarged text                                                                                          | resolved layout at 320/390/font1.35/2                                                                                  | screenshots authorable                                 | owner size/touch proof                       |
| R206 | Idle has no ordinary static filled halos                                                                                                          | state/layout test: backgrounds absent                                                                                  | idle screenshot authored                               | baseline render                              |
| R207 | Starting has no ordinary static filled halos                                                                                                      | starting state test                                                                                                    | Starting journey authored; actual timing manual        | owner warmup render                          |
| R208 | Recording lacks static filled halos but retains approved R1 outward waves                                                                         | State shape + timed decorative animation, no static halo bg                                                            | Live motion not deterministically proven by screenshot | Owner native motion clip                     |
| R209 | Paused stops active waves, has no static filled ordinary halos                                                                                    | Paused animation cancellation and static reduced-motion positive control                                               | Native pause manual                                    | Owner paused and reduced-motion capture      |
| R210 | Daily-limit/unavailable artwork remains unchanged                                                                                                 | existing state tests as positive controls                                                                              | existing flows only                                    | owner regression render                      |
| R211 | Real recording starts timer only after record(); initial clock 00:00 / 00:30                                                                      | Recorder fake clock + callback order; no pre-capture elapsed                                                           | Native audio timing manual                             | Owner 00:00 / 00:30                          |
| R212 | At 12 s active capture shows `00:12 / 00:30`                                                                                                      | fake timer integration                                                                                                 | not a provider E2E claim                               | owner visual                                 |
| R213 | Pause freezes elapsed active time                                                                                                                 | recorder pause fake clock                                                                                              | live pause manual                                      | owner timer freeze                           |
| R214 | Resume continues from frozen elapsed value                                                                                                        | recorder resume fake clock                                                                                             | live resume manual                                     | owner timer continuation                     |
| R215 | Paused wall-clock time does not consume cap                                                                                                       | fake clock spanning pause                                                                                              | manual native                                          | owner long pause                             |
| R216 | Active cap 30 seconds shows explicit Recording complete / التسجيل مكتمل third panel with 00:30 / 00:30                                            | Boundary 29.9/30.0/after, retained URI, localized title and no waves/helper                                            | Native cap manual                                      | Owner exact approved third-panel comparison  |
| R217 | Completed third panel LEFT enabled green Submit, CENTER disabled gray Pause, RIGHT enabled red Discard, NO Resume                                 | Native resolved physical order, role, accessibilityState disabled, click no-op center                                  | Static completed-state journey authorable only         | Owner EN/AR light/dark third panel           |
| R218 | Cap auto-stop retains audio and ZERO automatic parse/provider/quota/review; explicit Submit sends once                                            | Recorder/flow spy, retained-audio URI, Submit only; double-tap & cap race                                              | Provider double required; no live provider             | Owner cap then explicit Submit               |
| R219 | Discard after cap removes retained audio/URI with ZERO provider start                                                                             | Hook discard cleanup and idempotence                                                                                   | Native discard journey manual                          | Owner cap then Discard                       |
| R220 | Submit racing cap causes one finalize/one submission                                                                                              | deferred stop/fake clock concurrency                                                                                   | manual native rapid tap                                | owner race                                   |
| R221 | Discard/cancel racing cap cannot resurrect completed audio                                                                                        | deferred stop/cancel generation test                                                                                   | manual native                                          | owner race                                   |
| R222 | Unmount/account change at cap cancels timer/work and clears actor-owned audio                                                                     | hook unmount/user-switch test                                                                                          | account switch E2E manual                              | owner two-account                            |
| R223 | Completed center Pause is disabled; no Resume or elapsed timer restart after cap                                                                  | RNTL Pressable disable + recorder state test                                                                           | Completed image capture owner                          | Owner no Pause/Resume after 30 seconds       |
| R224 | Recorder start failure never starts timer or shows Listening                                                                                      | existing R1 readiness positive control extended for max timer                                                          | native injection manual                                | owner failure                                |
| R225 | Manual form/save/transfer/recurring behavior unchanged                                                                                            | existing Manual suites positive control                                                                                | existing Manual journeys authored                      | owner Manual smoke                           |
| R226 | Consent/availability/requestKey/same-key retry unchanged                                                                                          | existing flow/service positive controls                                                                                | no live provider/quota E2E                             | owner/server separately                      |
| R227 | Paused/capped/reduced-motion states have no active infinite waves or dynamic volume claim                                                         | Reanimated cleanup/ReducedMotion and completed static views                                                            | OS reduced motion manual                               | Owner accessibility setting                  |
| R228 | One fresh just-in-time microphone check per normal attempt, typed actor-safe missing/granted/blocked/unknown result with consent/quota unaffected | Route/flow deterministic call-count, revocation, stale actor, inline recovery and explicit-only OS request             | Native permission OS manual; no provider               | Owner stage timings; no duration promise     |
| R229 | Server 30 s/empty-audio authority NOT claimed; local cap only                                                                                     | Docs/contract boundary + existing provider/accounting positive controls                                                | No server calls in R2                                  | Separate #391 source validation              |
| R230 | Direct Voice first mount does not initialize hidden ManualTransactionEntry                                                                        | Route RNTL mount-spy, mode=voice, no Manual hooks/subscriptions or Save ref required before selection                  | Voice-first route navigation script only if controlled | Owner cold/warm first route frame            |
| R231 | First Manual selection mounts form once; subsequent Voice → Manual preserves amount, transfer/recurring, calculator dismissal and draft           | Route RNTL mounted-latch and positive Manual finance suite                                                             | Controlled mode-switch journey                         | Owner partial draft + Save smoke             |
| R232 | Default Manual route still mounts form and header Save immediately                                                                                | Existing Manual positive controls, focus, Save, no lazy-only regression                                                | Existing Manual journey                                | Owner default FAB/Manual                     |
| R233 | Permission revoked/denied/blocked or actor changes between consent/quota/native check remains fail closed                                         | One typed fresh permission result, generation invalidation, no permission OS request without explicit Allow microphone | Native OS permission manual only                       | Owner Settings/foreground and account switch |
| R234 | Availability HTTP focus/start cancellation and authoritative preattempt gate unchanged by latency repair                                          | Regression test no provider on daily/burst/failed availability, same request identity; DO NOT add HTTP dedup refactor  | No live provider/clock E2E                             | Owner retry/fail-closed recovery             |
| R235 | No invented 1–2 s timing target, safe monotonic stage names only                                                                                  | Instrumentation shape/log privacy test only if later authorized; no audio/user ID/transcript/financial payload         | Device timing is manual-only                           | Owner stage times and cold/warm comparisons  |

## Required regression batch

At minimum include existing R1 lifecycle/presentation/dismissal tests, recorder
pause/resume/start-failure, route mode/Manual tests, AI consent, availability,
request identity/same-key retry and quota-refusal positive controls. Preserve
their assertions; do not replace them with R2-only snapshots.

## Required ordering

1. **T068 before any T069–T071 work:** root verifies image
   sha256:3c1d098090cfac539c834634f2dfb1db29dc75b8afc9f479d61d17af09680281
   (1832×858 pixels, 1470108 bytes), exact 15-key Binding Facts,
   metadata/combined hashes and truthful delegated approval; then executes
   correct-feature prerequisites and canonical **read-only Speckit analysis**.
2. T069 deterministic Red, then T070/T071 narrowly owned implementation only
   after pin/accepted Red, T072 real Green/type/lint, **T073 independent
   postimplementation review**, T074 owner evidence. Analyzer and device
   evidence are not substituted by this plan.

## Honest execution boundary

This planning author executed **no** Jest, TypeScript, lint, Maestro, native
audio, OS permission, provider, rendered screenshot or accessibility-tree
checks. Maestro work is AUTHORABLE ONLY. Owner executes E2E/device/native/
visual/a11y/provider-sensitive evidence.

## Actual R2 deterministic coverage vs owner-only evidence — 2026-10-11

**Current receipt superseding the HISTORICAL "PLANNED / NOT RUN" header and
planned matrix above, without changing its original design intent.** Root
actually ran **25 Jest suites / 390 tests ALL PASS (30.777s)** against the
tested integration tree and mobile TypeScript/lint/i18n checks PASS. The sources
below were verified on published **UI**
`34a698fdfb3496dcb559a4dab4adeff9151c110b` and **recorder**
`2552577f499abc9019fc6a3c1f16416d8304b2ea`; latter production source
`bb64e19f5a811bafb0ec8920e5d1bd92130679ff`. These are source/test mappings,
**not standalone native-case executions**. A PASS label refers only to
deterministic Jest fixtures and source-level oracles; PARTIAL means only the
named synthetic portion was verified.

**Concrete file-root keys** (all are existing published test files): `C/` =
`apps/mobile/__tests__/components/add-transaction/`; `A/` =
`apps/mobile/__tests__/app/`; `H/` = `apps/mobile/__tests__/hooks/`; `S/` =
`apps/mobile/__tests__/services/`. R229 also references the existing main spec;
that server behavior is **not implemented**, irrespective of positive-control
tests.

**Maestro status for this full matrix:** exactly three safe files,
`apps/mobile/e2e/maestro/voice/add-transaction-modes.yaml`,
`voice-recovery.yaml`, `voice-usage-limits.yaml`, were **AUTHORED** and root's
Prettier `--check` **PASS**; **zero Maestro scenarios executed**. They do not
cover live native recording, OS permission, paid provider, rendered screens or
verified route latency. **Owner/device/native/render/a11y/E2E evidence is NOT
RUN for EVERY row** unless this table explicitly states a more restrictive
unimplemented boundary. It is incorrect to mark all 35 as full product PASS.

| ID   | Concrete published test/source mapping                                                                                            | Deterministic R2 status from root batch                                                    | Maestro / owner / scope boundary                                 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| R201 | `C/VoiceTransactionEntry.states.test.tsx`; `C/VoiceTransactionEntry.layout.test.tsx`                                              | PASS (native-style/role/order unit)                                                        | OWNER NOT RUN: EN recording actual colors/positions, touch       |
| R202 | `C/VoiceTransactionEntry.states.test.tsx`; `H/useVoiceRecorder.r2.test.ts`                                                        | PASS (paused actions and active-time freeze)                                               | OWNER NOT RUN: native Pause/Resume/physical order                |
| R203 | `C/VoiceTransactionEntry.states.test.tsx`; `C/VoiceTransactionEntry.layout.test.tsx`                                              | PASS (Arabic labels and non-reversed row test)                                             | OWNER NOT RUN: RTL rendered screen reader/positions              |
| R204 | `C/VoiceTransactionEntry.layout.test.tsx`; `C/VoiceTransactionEntry.states.test.tsx`                                              | PASS (resolved compiled native styles/disabled)                                            | OWNER NOT RUN: visual contrast/light/dark screenshots            |
| R205 | `C/VoiceTransactionEntry.layout.test.tsx`                                                                                         | PARTIAL PASS (controlled 320/390, font scale 2 and ≥48dp)                                  | OWNER NOT RUN: real 1.35, tablet/landscape, large-text touch     |
| R206 | `C/VoiceTransactionEntry.states.test.tsx`; `C/VoiceTransactionEntry.layout.test.tsx`                                              | PASS (idle ordinary filled halos absent)                                                   | OWNER NOT RUN: real idle render                                  |
| R207 | `C/VoiceTransactionEntry.layout.test.tsx`; `C/VoiceTransactionEntry.states.test.tsx`                                              | PASS (Starting ordinary filled halos absent)                                               | OWNER NOT RUN: native Starting first frame                       |
| R208 | `C/VoiceTransactionEntry.layout.test.tsx`                                                                                         | PASS (controlled R1 waves/no static fill)                                                  | OWNER NOT RUN: native motion clip                                |
| R209 | `C/VoiceTransactionEntry.layout.test.tsx`; `H/useVoiceRecorder.r2.test.ts`                                                        | PASS (paused static state and timers)                                                      | OWNER NOT RUN: native pause/reduced-motion                       |
| R210 | `C/VoiceTransactionEntry.states.test.tsx`; `C/VoiceTransactionEntry.layout.test.tsx`                                              | PASS (daily-limit/unavailable positive controls)                                           | OWNER NOT RUN: real disabled artwork comparison                  |
| R211 | `H/useVoiceRecorder.r2.test.ts`; `H/useVoiceRecorder.test.ts`; `H/useVoiceTransactionFlow.r2-permission.test.ts`                  | PASS (fake native onStarted/timer ordering)                                                | OWNER NOT RUN: real native 00:00 / 00:30                         |
| R212 | `C/VoiceTransactionEntry.states.test.tsx`                                                                                         | PASS (00:12 / 00:30 deterministic presentation)                                            | OWNER NOT RUN: actual displayed 12s capture                      |
| R213 | `H/useVoiceRecorder.r2.test.ts`; `H/useVoiceRecorder.test.ts`                                                                     | PASS (pause freezes fractional active duration)                                            | OWNER NOT RUN: actual native timer freeze                        |
| R214 | `H/useVoiceRecorder.r2.test.ts`; `H/useVoiceRecorder.test.ts`                                                                     | PASS (resume preserves and advances active fraction)                                       | OWNER NOT RUN: actual native resume                              |
| R215 | `H/useVoiceRecorder.r2.test.ts`                                                                                                   | PASS (long paused wall time excluded)                                                      | OWNER NOT RUN: real 30s paused session                           |
| R216 | `H/useVoiceRecorder.r2.test.ts`; `C/VoiceTransactionEntry.states.test.tsx`                                                        | PASS (30,000ms cap/third-panel localized text)                                             | OWNER NOT RUN: native exact cap/EN/AR screenshots                |
| R217 | `C/VoiceTransactionEntry.states.test.tsx`; `C/VoiceTransactionEntry.layout.test.tsx`                                              | PASS (disabled center Pause/no Resume/fixed order)                                         | OWNER NOT RUN: native disabled focus/actions                     |
| R218 | `H/useVoiceRecorder.r2.test.ts`; `H/useVoiceTransactionFlow.r2-permission.test.ts`                                                | PASS (retained URI; zero synthetic provider until explicit Submit; concurrent one request) | OWNER NOT RUN: genuine audio/provider/quota and completed hold   |
| R219 | `H/useVoiceRecorder.r2.test.ts`; `H/useVoiceTransactionFlow.r2-permission.test.ts`                                                | PASS (discard cleanup and synthetic zero provider)                                         | OWNER NOT RUN: native file deletion                              |
| R220 | `H/useVoiceRecorder.r2.test.ts`; `H/useVoiceTransactionFlow.r2-permission.test.ts`                                                | PASS (deferred native stop dedup and concurrent Submit spy)                                | OWNER NOT RUN: rapid real cap/Submit race                        |
| R221 | `H/useVoiceRecorder.r2.test.ts`; `H/useVoiceTransactionFlow.test.ts`                                                              | PASS (generation/discard prevents late completion)                                         | OWNER NOT RUN: native cancel race                                |
| R222 | `H/useVoiceRecorder.r2.test.ts`; `H/useVoiceTransactionFlow.test.ts`; `H/useVoiceTransactionFlow.r2-permission.test.ts`           | PASS (unmount/actor and stale cleanup mocks)                                               | OWNER NOT RUN: actual two-account/unmount                        |
| R223 | `C/VoiceTransactionEntry.states.test.tsx`; `H/useVoiceRecorder.r2.test.ts`                                                        | PASS (completed disabled Pause/no restarted timer)                                         | OWNER NOT RUN: native center control                             |
| R224 | `H/useVoiceRecorder.test.ts`; `H/useVoiceTransactionFlow.r2-permission.test.ts`                                                   | PASS (failed start/onStarted truth and recovery)                                           | OWNER NOT RUN: native recorder failure injection                 |
| R225 | `A/add-transaction-modes.test.tsx`; `C/ManualTransactionEntry.focus.test.tsx`; `C/TransferFields.test.tsx`; `C/TypeTabs.test.tsx` | PASS (existing Manual form/Save positive controls)                                         | OWNER NOT RUN: financial Manual E2E smoke                        |
| R226 | `H/useVoiceTransactionFlow.test.ts`; `H/useVoiceTransactionFlow.r2-permission.test.ts`; `S/ai-voice-parser-service.test.ts`       | PASS (consent/quota/retained request key regression doubles)                               | OWNER NOT RUN: live provider/server quota and replay             |
| R227 | `C/VoiceTransactionEntry.layout.test.tsx`; `C/VoiceTransactionEntry.states.test.tsx`                                              | PASS (RNTL controlled reduced-motion and waveform cleanup)                                 | OWNER NOT RUN: OS reduced-motion and native animations           |
| R228 | `H/useVoiceTransactionFlow.r2-permission.test.ts`; `A/add-transaction-voice-motion.test.tsx`; `H/useVoiceRecorder.test.ts`        | PASS (one fresh read, typed denied/blocked/unknown, actor guards)                          | OWNER NOT RUN: native OS permission sheets/foreground            |
| R229 | `S/ai-voice-parser-service.test.ts (existing positive-control only)`; `specs/389-voice-usage-limits/spec.md`                      | BOUNDARY ONLY: server 30s/empty guard NOT IMPLEMENTED by R2                                | Separate #391 research/harness, native/provider evidence NOT RUN |
| R230 | `A/add-transaction-modes.test.tsx`; `A/add-transaction-voice-motion.test.tsx`                                                     | PASS (Voice-first Manual initially unmounted)                                              | OWNER NOT RUN: cold/warm Voice first frame                       |
| R231 | `A/add-transaction-modes.test.tsx`; `C/ManualTransactionEntry.focus.test.tsx`; `C/CalculatorKeypad.test.tsx`                      | PASS (first-mount latch/amount draft and Manual controls)                                  | OWNER NOT RUN: full native transfer/recurring draft              |
| R232 | `A/add-transaction-modes.test.tsx`; `C/ManualTransactionEntry.layout.test.tsx`                                                    | PASS (default Manual mounts and Save)                                                      | OWNER NOT RUN: FAB and real Save smoke                           |
| R233 | `H/useVoiceTransactionFlow.r2-permission.test.ts`; `A/add-transaction-voice-motion.test.tsx`; `H/useVoiceRecorder.test.ts`        | PASS (revocation/typed result/generation and explicit-only OS request doubles)             | OWNER NOT RUN: real OS blocked/Settings/account swap             |
| R234 | `H/useVoiceTransactionFlow.test.ts`; `A/add-transaction-voice-motion.test.tsx`; `A/add-transaction-modes.test.tsx`                | PARTIAL PASS (authoritative preattempt/cancel/refusal mocks; transport unchanged)          | OWNER NOT RUN: real focus/start HTTP cancellation or network     |
| R235 | `No elapsed-time instrumentation evidence (A/add-transaction-modes.test.tsx proves mount topology only)`                          | UNMEASURED; no approved 1–2s or timing-pass claim                                          | OWNER NOT RUN: cold/warm monotonic stage measurements            |

**Interpretation / guardrails:** R201–R228 and R230–R233 have bounded
deterministic coverage; R205 and R234 remain **PARTIAL** beyond their
unit-verified surfaces. R229 is a **documented unimplemented server boundary**
(#391 separate FE16 research/harness, not executed provider enforcement); R235
is **UNMEASURED**, not a 1–2s claim. #384 held reservation UX is deferred and
existing 35-day replay retention remains unchanged.

Actual root historical Red: UI 5 suites 50F/92P/142; recorder 12F/68P/80;
actor/stop generation 2F/16 skipped/18; typed permission/cap error 18F/133P/151;
failed-cap cleanup 2F/19P/21. Root postimplementation independent source review
resolved native font 12.25→14, typed OS status, cap Stop/null URI fail-closed
recovery, **native release before filesystem cleanup** and
timer-specific/stale-start test oracles. These statements derive from the
coordinator's actual execution receipts, **not this documentation writer's
executions**. Final root local integration commit
`df00c9e3d4c9ca624d55935b9bf3f5d3364be7ce` with tree
`7f0dca9a886d452ca937464764fdcee4e1450dfd` was **NOT YET GITHUB-PUBLISHED** at
handoff. Root ran `npm run qa-sms:privacy-check` **PASS** for source-integration
BASE `0e7ee55abf6fb18af37e29e4f2e48ba45604a31e` → HEAD
`df00c9e3d4c9ca624d55935b9bf3f5d3364be7ce`. Final post-documentation publication
guard, feature push and new feature-head CI remain **PENDING**; no remote CI
result is claimed. See `../tasks.md` for full exact batch command and review
receipt, and `voice-controls-r2-manual-plan.md` for owner cases.
