# Voice controls R2 — owner manual validation plan

**Status:** MANUAL PLAN ONLY / NOT RUN by planning worker.

Run after the exact R2 binding metadata is approved, source is independently
reviewed and automated gates are Green.

## Recording controls

- EN recording: verify physical LEFT Submit (green), CENTER Pause (gray), RIGHT
  Discard (red), all comfortably tappable.
- Pause: verify labels become Submit / Resume / Discard without swapping
  physical positions.
- AR: verify localized labels/text direction while the physical actions retain
  the same left/center/right identities. Verify no accidental row reversal.
- Repeat in light/dark, 320×640, 390×844, 768×1024, 844×390 and font scales
  1.35/2. Confirm no text shrinking/truncation and 48 dp+ touch targets.

## Mic decoration and motion

- Idle and Starting: no ordinary static filled halo circles.
- Recording: no static filled halo background; approved R1 outward waves remain
  visible and restrained.
- Pause: active waves stop; no stale infinite loop.
- Daily-limit and unavailable: prior disabled artwork remains unchanged.
- Reduced motion: no infinite active waves; state/actions remain clear.

## Timer and 30-second cap

1. Start actual native recording. Timer must not tick before capture starts.
2. Verify `00:00 / 00:30`, then normal progression such as
   `00:12 / 00:30`.
3. Pause for several wall-clock seconds. Elapsed value must freeze.
4. Resume; elapsed active time continues from the frozen value.
5. Reach exactly 30 active seconds. Verify `00:30 / 00:30`; native capture
   stops/finalizes and audio remains available.
6. At cap, verify there is no automatic parsing/provider request/review
   navigation. Submit must still be an explicit user action.
7. Submit once; verify the existing guarded submission/review flow proceeds once.
8. Repeat cap then Discard; verify audio is cleared and no parse occurs.

## Race/lifecycle checks

- Tap Submit as the cap fires: one effective finalize/submission.
- Tap Discard as the cap fires: no late completed state or provider call.
- Pause just before cap, wait past 30 wall-clock seconds, Resume and verify only
  active time counts.
- Back/cancel/unmount during final seconds: no timer/audio resurrection.
- Sign out/account-switch during recording or cap finalization: old actor work
  cannot appear for the new account.
- Rapid Pause/Resume/Submit/Discard taps remain stable and do not duplicate
  native stop/provider work.

## Preserved gates and regressions

- First-use AI Processing Consent remains required.
- Genuine missing microphone permission still follows approved inline
  explanation/OS request; granted users are not falsely prompted.
- Daily/burst/unavailable states remain authoritative and Manual stays usable.
- Retained-audio network retry reuses the same request identity and does not
  start a microphone recording.
- Manual partial draft, transfer/recurring and Save smoke remain unchanged.

## Owner-only evidence

Capture side-by-side/overlay against the approved R2 image for the affected
surface plus all responsive/theme/locale variants. Capture separate
TalkBack/VoiceOver/a11y-tree proof. Record native audio/timer behavior and any
startup latency measurement separately; source/unit tests are not rendered or
timing proof.

## Explicit exclusions

- No claim that the server enforces 30 seconds; issue #391 supplies that
  evidence later.
- No hosted/provider/quota mutation is required to validate local cap behavior.
- No new helper copy, modal, paywall or state is authorized by R2.
