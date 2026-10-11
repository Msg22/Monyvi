# Voice controls R2 — owner manual validation plan

**Status:** MANUAL PLAN ONLY / **NOT RUN**. This document is not native,
E2E, latency, screenshot-fidelity or accessibility evidence.

Root verified all 15 exact R2 Binding Facts and accepted image/metadata/
combined revisions on 2026-10-11 under delegated owner authority (owner
approved the concept, not each new SHA). Before implementation, root must still
run the final official binding verifier on updated approval metadata, plus fresh
correct-feature Speckit prerequisites and
**READ-ONLY `speckit.analyze` before T069 Red and T070/T071 code**.
T073 later independent review is not this prerequisite.

**Reference:** latest owner-approved green/gray/red R2 PNG, image SHA
`3c1d098090cfac539c834634f2dfb1db29dc75b8afc9f479d61d17af09680281`,
1832×858 pixels, 1470108 bytes, Git blob
`caceb8d1cade9e4e9c574e95fc0e603a39e766de`.
Use the R2 sidecar for its scoped facts; unaffected R1 and original five
bindings stay authoritative. Owner image exports are not 390×844 logical
dp measurements.

## Recording, paused and capped third-panel visual checks

- **Recording**: physical **LEFT Submit GREEN**, **CENTER Pause GRAY**,
  **RIGHT Discard RED**. In Arabic labels read **إرسال / إيقاف مؤقت /
  تجاهل**, with the same physical left/center/right action identities.
- **Paused**: physical **LEFT Submit GREEN**, **CENTER Resume GRAY**,
  **RIGHT Discard RED**; center label **متابعة** in AR. No reordering.
  Timer freezes and active waves stop; no static filled mic halos.
- **Recording complete / التسجيل مكتمل** (mandatory third panel):
  after auto-cap, timer reads **`00:30 / 00:30`**; Submit remains
  **enabled GREEN LEFT**, Pause remains **disabled GRAY CENTER**,
  Discard **enabled RED RIGHT**. There is **no Resume** and **no active
  recording wave**, and tapping disabled center has no effect. The
  finalized audio is still available for Submit or Discard. Confirm
  native focus/role/state for the disabled Pause separately from color.
- There is **no ordinary helper sentence** in recording, paused or
  completed panel; never reintroduce explanatory text to fill the space.
- Confirm all interactive actions ≥48 dp, localized accessible labels,
  unchanged 104 dp circular mic clipping, 140/172 dp recording-wave
  region and absence of ordinary static **filled** halos in idle,
  Starting, recording and paused. R1 recording waves remain only during
  active recording; daily-limit/unavailable disabled artwork unchanged.
- Check EN/AR, LTR/RTL, light/dark, 320×640 compact, 390×844 ordinary,
  768×1024 centered tablet, 844×390 landscape, font scales 1.35/2,
  screen-reader reading order and reduced-motion static alternatives.
  Arabic physical action order must NOT row-reverse even though content
  text and surrounding composition remain RTL.

## Elapsed/max clock and 30-second native active-audio cap

1. From an explicitly initiated in-page mic action, verify **Starting**
   occurs immediately but neither Listening nor elapsed time begins
   before successful native `record()` invocation.
2. On real capture, clock begins at `00:00 / 00:30` and later e.g.
   `00:12 / 00:30`; no invented capture length or stage percentage.
3. Pause for longer wall time; active elapsed freezes, then Resume
   continues from the same value, consuming **active** time only.
4. At **30 seconds active capture**, native recorder auto-stops and
   finalizes **once**, clamps `00:30 / 00:30` and shows completed
   third panel, retaining URI/audio. Wait; no new provider event,
   quota unit, review navigation or automatic parsing may occur.
5. Tap **Submit** only now: verify the retained file is used by exactly
   one existing auth/consent/quota/identity-safe parser submission.
   No second microphone capture or cap-repeat.
6. Repeat cap and tap **Discard**: verify local temp audio deleted,
   state cleared, no provider call and no late completion.
7. Submit while recording or paused and confirm one effective stop/
   finalization followed by one user-initiated parse. Rapid Submit
   near cap, Discard near cap and repeated taps cannot duplicate work.

## Native races and preserved recovery contracts

- Pause just before the 30-second active cap, wait past 30 seconds of
  **wall** time, Resume and verify the remaining active budget.
- Try Pause/Resume at/after cap: center Pause remains disabled; no
  Resume/recording timer is restarted. After Discard, stale cap
  callbacks must not recreate the file/UI.
- Cancel, Back, unmount or switch accounts while native
  preparation, stabilization or stop is pending; no stale actor
  capture/URI/provider work may appear after completion.
- Preserve the existing 300 ms **post-record** Android stabilization
  used for early pause/stop, and no Listening if native start fails.
- First-use AI Processing Consent Sheet stays required. Native
  permission unknown/granted/denied/revoked/blocked cases follow one
  **fresh just-in-time** check and existing inline OS rationale;
  OS permission is requested **only** after explicit user choice.
- Daily/burst/availability checks remain authoritative and fail
  closed; retries preserve same-key held-audio identity and 35-day
  replay retention. Do not rely on a stale in-flight availability
  HTTP result. #384 deferred, #391 separate.

## Voice-first navigation and Manual-draft regression

- From the **bottom-bar mic**, verify navigation uses the existing
  `/add-transaction?mode=voice` route with correct origin, without
  requesting microphone permissions or capture on tab press.
- On **first Voice-mode arrival**, confirm the hidden full Manual
  form has **not mounted** or started its account/category/market
  subscriptions; Voice renders its existing loading/idle surface
  correctly. No claim of measured startup improvement.
- Select Manual for the first time: the form mounts with the
  original amount/account/category/transfer/recurring/Save behavior.
  Enter an amount and other fields, switch safely to Voice and back:
  form stays **mounted after first selection** and the unsaved
  draft remains intact. Calculator focus/blur and accessibilty-hidden
  subtree still work.
- Open Add Transaction via the normal FAB in Manual by default:
  Manual mounts immediately; Save, validation, transfer/currency,
  recurring and offline-first financial writes are unchanged.
- Check Back and active Voice mode-switch locks remain correct,
  without a new default page, modal or new user-visible helper.

## Privacy-safe latency observation, no performance guarantee

On the owner's actual device/build, record repeated **cold/warm**
monotonic stage durations, without media or identifiers:

1. `bottomMic.press → router.push → route.mount → firstFrame`;
2. `inPageMic.press → Starting.firstFrame`;
3. `consent.localFresh`, `availability.serverFresh`,
   `permission.singleFresh`, `audioMode`,
   `prepareToRecord`, `record.invoked`,
   `Recording.firstFrame`.

Distinguish screen-shell arrival from authoritative availability
loading. Compare development and release build if possible. Do not
log raw audio, transcript, user/account ID, financial content,
provider response, credentials or tokens. The old owner's ~5 s
navigation and ≥3 s Starting observations were **not source-measured**;
there is **no approved 1–2 s promise**. No HTTP transport/dedup
change is part of this R2 leaf.

## Owner-only evidence and exclusions

After source Red/Green and independent review, capture rendered
side-by-side or overlay against the exact R2 image for all stated
responsive/theme/locale variants. Capture separate TalkBack/VoiceOver
or appropriate accessibility-tree proof. Native audio, OS permissions,
server/provider conditions and real timing remain owner-executed or
explicitly blocked. Maestro E2E authorship is not execution.

**No server 30-second enforcement claim:** issue #391 owns that and
empty/speechless audio separately. No hosted changes, audio uploads,
new helper UI, schema, financial behavior, R1/original image editing
or device action is authorized by this planning document.
