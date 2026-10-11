# Voice controls R2 — planned coverage matrix

**Status:** PLANNED / NOT RUN by this planning worker. Unit/integration entries
are required deterministic coverage; Maestro entries are authorable journeys
only. All device/native/visual/provider/E2E execution is owner-manual unless an
approved deterministic harness is later proven.

| # | Scenario / oracle | Deterministic unit/integration plan | Maestro authorship / limitation | Owner evidence |
| --- | --- | --- | --- | --- |
| R201 | Recording controls are Submit-left / Pause-center / Discard-right | Voice presentation/layout test resolves order, role, label, ≥48 dp | Author visible controls only | EN light/dark render |
| R202 | Paused controls keep Submit-left / Resume-center / Discard-right; no swap | Paused state layout + callback identity | Author pause/resume journey only if controllable | Native paused capture |
| R203 | Arabic preserves physical action positions with localized labels/RTL text | AR RNTL order/direction assertions | Locale flow if deterministic | AR/RTL render + screen reader |
| R204 | Submit green, Pause/Resume gray, Discard red via registered tokens | compiled/native style/token assertions | screenshot capture only, not pixel pass | light/dark contrast |
| R205 | Controls remain ≥48 dp at compact/ordinary/enlarged text | resolved layout at 320/390/font1.35/2 | screenshots authorable | owner size/touch proof |
| R206 | Idle has no ordinary static filled halos | state/layout test: backgrounds absent | idle screenshot authored | baseline render |
| R207 | Starting has no ordinary static filled halos | starting state test | Starting journey authored; actual timing manual | owner warmup render |
| R208 | Recording has no static filled halos but retains R1 waves | VoiceMotion/presentation test | native motion not deterministic | owner animation video |
| R209 | Paused stops waves/static filled halos remain absent | motion cleanup + paused render | native pause manual | owner pause video |
| R210 | Daily-limit/unavailable artwork remains unchanged | existing state tests as positive controls | existing flows only | owner regression render |
| R211 | Timer initially shows `00:00 / 00:30` after true capture start | recorder fake clock + presentation | native audio timing manual | owner native timer |
| R212 | At 12 s active capture shows `00:12 / 00:30` | fake timer integration | not a provider E2E claim | owner visual |
| R213 | Pause freezes elapsed active time | recorder pause fake clock | live pause manual | owner timer freeze |
| R214 | Resume continues from frozen elapsed value | recorder resume fake clock | live resume manual | owner timer continuation |
| R215 | Paused wall-clock time does not consume cap | fake clock spanning pause | manual native | owner long pause |
| R216 | Exact cap finalizes at active 30 s and shows `00:30 / 00:30` | boundary tests 29.9/30.0/after | native cap manual | owner cap video |
| R217 | Cap auto-stop retains URI/audio and does not call parse/provider | recorder+flow spy, zero parser calls | live provider deliberately not run | owner local capture |
| R218 | Explicit Submit after cap starts existing guarded submission once | flow integration: retained completed audio + one submit | provider double only if approved | owner controlled submit |
| R219 | Discard after cap deletes/clears retained audio, zero provider | recorder/flow discard idempotence | manual native cleanup | owner discard |
| R220 | Submit racing cap causes one finalize/one submission | deferred stop/fake clock concurrency | manual native rapid tap | owner race |
| R221 | Discard/cancel racing cap cannot resurrect completed audio | deferred stop/cancel generation test | manual native | owner race |
| R222 | Unmount/account change at cap cancels timer/work and clears actor-owned audio | hook unmount/user-switch test | account switch E2E manual | owner two-account |
| R223 | Resume at/after cap is refused/no active timer | recorder state test | manual | owner control state |
| R224 | Recorder start failure never starts timer or shows Listening | existing R1 readiness positive control extended for max timer | native injection manual | owner failure |
| R225 | Manual form/save/transfer/recurring behavior unchanged | existing Manual suites positive control | existing Manual journeys authored | owner Manual smoke |
| R226 | Consent/availability/requestKey/same-key retry unchanged | existing flow/service positive controls | no live provider/quota E2E | owner/server separately |
| R227 | Reduced motion has no infinite recording wave after pause/cap | VoiceMotion cleanup tests | OS reduced-motion manual | owner a11y setting |
| R228 | Latency work does not remove gates or claim measured speed | route/flow sequencing positive controls after separate addendum | actual startup timing manual | owner measurement |
| R229 | Server 30 s enforcement is not claimed | docs/contract assertion; #391 dependency | no server test in R2 | #391 evidence later |

## Required regression batch

At minimum include existing R1 lifecycle/presentation/dismissal tests, recorder
pause/resume/start-failure, route mode/Manual tests, AI consent, availability,
request identity/same-key retry and quota-refusal positive controls. Preserve
their assertions; do not replace them with R2-only snapshots.

## Honest execution boundary

This planning author executed **no** Jest, TypeScript, lint, Maestro, native
audio, OS permission, provider, rendered screenshot or accessibility-tree
checks. Maestro work is AUTHORABLE ONLY. Owner executes E2E/device/native/
visual/a11y/provider-sensitive evidence.
