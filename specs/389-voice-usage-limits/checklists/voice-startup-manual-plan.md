# Voice startup optimization — owner manual plan

**Feature:** 389-voice-usage-limits / #347 startup S1  
**Source baseline:** `f625183373e29d372b658c10b3848a217477400a`

This is an owner-run evidence plan. The planning worker did **not** execute
Metro, emulator, device, Maestro, provider or hosted checks.

## Measurement rules

- Capture **cold** and **warm** attempts separately; do not average them into one
  claim.
- Use privacy-safe monotonic stage durations only. Never capture user/account
  IDs, audio URI/content, transcript, financial data, auth token, request key or
  provider payload.
- Report actual observed values/range; there is no approved 1–2 second SLA.
- “Starting” must be visible immediately after tap, but “Listening”/elapsed time
  is valid only after native `record()`/the recorder-start callback.
- The existing 300 ms stabilization occurs **after** native record starts and
  protects early Pause/Stop. It must not be removed to improve a tap-to-start
  number.

## Stage worksheet

For each cold/warm attempt record, when diagnostics are available:

| Stage | Duration |
| --- | ---: |
| tap → pending/Starting visible | ___ ms |
| pending → fresh consent complete | ___ ms |
| authoritative availability begin → result | ___ ms |
| fresh non-prompting permission read begin → result | ___ ms |
| availability+permission begin → both resolved | ___ ms |
| gates resolved → recorder start begin | ___ ms |
| recorder start begin → native record/onStarted | ___ ms |
| total tap → native record/onStarted | ___ ms |

Also record whether the authoritative availability call joined an already
in-flight same-context refresh or started a new request; do not record its
payload or actor identity.

## Owner scenarios

| ID | Scenario | Expected evidence |
| --- | --- | --- |
| M01 | Warm Voice, consent active, permission granted, normal network | Starting immediately; one authoritative gate; native capture then Listening. |
| M02 | Cold app Voice entry | Same gates and state truth; record cold stage timings separately. |
| M03 | Tap mic immediately while focus availability is still loading | No visible restart loop; start joins equivalent in-flight work; one capture. |
| M04 | Rapid double/triple mic tap | One logical start and one recorder; no duplicate OS/provider action. |
| M05 | AI consent missing | Starting may show while fresh local consent resolves; consent sheet appears; no permission/record/provider before consent. |
| M06 | Consent revoked between attempts | New start is blocked by fresh consent; previous mounted state does not bypass. |
| M07 | Permission already granted | No OS sheet; fresh permission read + availability gate; capture only after both. |
| M08 | Permission denied but requestable | Inline explanation first; OS sheet only after tapping Allow microphone and eligible availability. |
| M09 | Permission blocked | Settings/Manual recovery; no OS request loop and no recorder. |
| M10 | Permission becomes revoked in device settings | Next start detects fresh state; no false Listening. |
| M11 | Permission read returns unknown/error | No recorder/Listening; recovery remains truthful. |
| M12 | Availability daily/burst blocked | No OS permission request and no recorder even if local mic permission is denied. |
| M13 | Availability network slow | Starting remains truthful; cancellation remains responsive; no fake timer. |
| M14 | Availability offline/error | Existing unavailable state; Manual remains usable; no recorder. |
| M15 | Unavailable → Try again, now eligible | One refresh/join then automatic Starting/start; no second mic tap. |
| M16 | Unavailable → Try again, still blocked | No auto-record; blocked state remains truthful. |
| M17 | Back while consent/availability/permission is pending | No late recorder start or stale permission recovery after leaving. |
| M18 | Switch to Manual while safe pending state is cancelable | No late Voice start; Manual draft/save behavior unchanged. |
| M19 | Background app during availability/permission | In-flight availability cancels under lifecycle rules; no late capture while backgrounded. |
| M20 | Foreground focused route with automatic refresh then immediate mic tap | Equivalent request is coalesced; no abort/restart churn visible. |
| M21 | Account switch during pending start | Old actor cannot start recorder or surface availability for the new actor. |
| M22 | Native prepare/record failure | Error/retry state, never false Listening; subsequent retry still uses gates. |
| M23 | Tap Pause/Submit immediately after Listening appears | Existing post-record stabilization safely queues/protects Pause and the user-facing Submit action; Submit may invoke the recorder's native stop/finalize path, but startup timing is not delayed by the 300 ms post-start stabilization. |
| M24 | Complete 30-second active cap then Submit | S1 has not altered cap/retained-audio/explicit Submit semantics. |
| M25 | Retained-audio provider retry | No microphone restart; same logical request identity; no startup diagnostics leak request key. |
| M26 | Arabic/English, light/dark | No UI/copy/binding changes from startup optimization. |
| M27 | Voice-first → Manual → Voice | Existing lazy first Manual mount/draft retention remains unchanged. |

| M28 | First-use consent grant while an older availability request is pending | The pre-consent request is superseded; one fresh post-grant authoritative request decides eligibility before capture. Already-consented same-context pending work may still join. |

## Manual completion boundary

Owner evidence can validate native timing and behavior, but it does not replace
server quota/security tests. #391 recorder/empty/speechless research remains
separate. Do not mark startup performance complete until root T080/T081 are
accepted and owner records M01–M28 as applicable.


### S2 timing/privacy note

When S3 diagnostics exist, owner evidence may record only the approved
`stage` and numeric `durationMs` fields from `voice.startupTiming`. The
native-start duration ends at recorder `onStarted`, before the recorder-owned
300 ms stabilization. Do not copy log payloads containing identity, timezone,
request key, token, audio, transcript, financial or provider content. Unit Red/
Green is not device timing proof.

### S2-FIX owner instrumentation and consent freshness (12 October 2026)

Root's separate unit RED at `aea6e6526058359ac739a4571634669a837c14b8`
was **2F/8P** availability, **5F/3P** flow and **2F/33P** route
(one route error was an undefined existing exported mock, **not RED**).
These are not measured owner cold/warm times. Existing M01–M28 remain
unchanged, **NOT RUN** on device.

For future `voice.startupTiming` records, collect only `stage` and
finite numeric monotonic `durationMs`. Stages must distinguish individual
`availability`, `permission`, combined `availability_permission`, and
`native_start` ending at recorder `onStarted`. Logging failure must not
delay or prevent native capture, and the 300ms recorder stabilization
remains *after* onStarted. First-use consent must supersede an old
matching pre-consent availability request; already-consented pending
work may join only while unresolved. Never claim an elapsed-duration
improvement without owner device evidence, and never include account/
user/timezone/request identity, audio URI, transcript, financial data,
tokens or provider payloads. This is manual-plan authorship, no native,
Maestro, provider or hosted execution.
