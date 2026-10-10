# Add Transaction / Voice UI Contract

**Feature**: 389-voice-usage-limits / issue #347 UI repair

## Active visual authority

The five exact entries in
[repair-binding-manifest.json](../mockups/repair-binding-manifest.json) are
current authority. [Reconciliation](../reconciliation.md) records immutable
approval and supersession. Old mockup-1/mockup-2 bindings remain frozen history.

Before implementation or review, inventory and read every active image/sidecar
and run `node scripts/verify-mockup-binding.js <sidecar>` for each. Require exit
zero and manifest agreement. Missing, ambiguous, unapproved or superseded
fidelity inputs block governed implementation.

## Owner-approved scoped Voice motion overlay (10 October 2026)

See [voice-motion-binding-context.md](../mockups/voice-motion-binding-context.md)
for the **derived** state/component/icon/locale map, and
[voice-motion-coverage.md](../checklists/voice-motion-coverage.md) for the
manual → unit/integration/E2E/owner-evidence matrix. Source
`mockups/drafts/2026-10-10-voice-motion-r1/approval.json` records owner
approval (“mockups approved” / “Approve the proposal”) for the five new
conceptual images and their original `manifest.json` at
`sha256:7d91150571a3150e235a1b8ec63327cff4c19de6c292927cde76c40024c1c799`.
It supersedes **only** explicitly proposed interactions/appearance. The
earlier five approved baseline/daily/Manual bindings **remain frozen and
authoritative** for every unaffected fact. The derived map is not a competing
sixth mockup/approval/verifier gate.

| New state / event | Binding and component | Exact invariant |
| --- | --- | --- |
| Idle badge + examples | Existing EN/AR idle bindings; `AllowanceCard`, `ExamplesCard` | Dark mic and bulb badge slate-700/green; EN food orange/car blue/coffee gold, unchanged icons and copy; AR quoted no EN example icons; light badge unchanged; approved daily-only next-local-midnight reset |
| Dismiss examples | `ExamplesCard` + new user-scoped **device-local** preference service/facade | Dismiss full card immediately; accessible EN “Dismiss examples” / AR “إخفاء الأمثلة”, ≥48 dp target (proposal min44, shared target min48); same account remains hidden across route/restart/theme/locale/sign-out; independent other accounts, no hosted/sync |
| Starting | Unified route `isVoiceStartPending` and `useVoiceTransactionFlow` state → `VoiceTransactionEntry` | Immediate “Starting…” / “نجهّز التسجيل…” with approved body and Cancel **before** awaits; one in-flight start, no audio timer/Listening until `record()` succeeds, all cancellation generations checked |
| Recording/paused | `VoiceActionSurface` + `useVoiceRecorder` | 104 dp mic, 140/172 dp existing halos; two thin ~1.4s outward ripple strokes, 700ms offset, non-volume activity bars ~1.2s; real timer starts with native capture, paused freezes time/motion, reduced-motion static; Stop/Pause/Resume/Discard and cleanup unchanged |
| Parsing/analyzing | `VoiceTransactionEntry` + cohesive `voice-ui` illustration | ~1.6s looping waveform/dots → receipt, exact approved EN/AR title/body, no fake progress, financial details or Skeleton; real quota-fetch loading stays Skeleton |
| Permission | Voice **inline** explanation, route/recorder | Only after genuinely missing native grant, with approved localized title/body/action; no generic recording-introduction modal; stale initial `hasPermission=false` is unknown, not denial; existing first-use AI Processing Consent Sheet still gates |
| Errors and retries | `useVoiceTransactionFlow`, route `handleTryAgain`, recovery actions | Native recorder start failure has visible recovery. Recording Try again → Starting directly; retained-submission Try again uses same key/audio/no new capture; unavailable Try again refreshes and auto-starts only if authoritative availability eligible, respecting consent/daily/burst/cancel |
| Exhausted/burst/unavailable/Manual | Frozen daily/Manual bindings and server contracts | No altered quota consumption, same-key 35-day replay retention, #384 deferred; exhausted EN/AR compositions/actions and Manual B preserved; no Voice notice in Manual |

No new baseline geometry, font, palette, unverified icon-glyph identity or
permission policy is inferred from export image framing. Existing 390×844 dp,
48 dp shared interactive minimum, scroll/safe-area and responsive variants
apply. Root still must run approved original binding checks and read-only
Speckit analysis, then actual test Red before production. Device, rendered
visual and separate accessibility verification remain **NOT RUN** and owner
owned.

## Navigation and shared shell

- Standalone `/add-transaction` remains one page; pictured bottom navigation is
  non-binding. Missing/invalid mode and FAB select Manual.
- Center microphone/onboarding select Voice; voice-review Retry retains existing
  one-shot retry/auto-start and origin-return behavior.
- Reuse `components/navigation/PageHeader.tsx` with current localized
  title/back; header Save remains Manual save action.
- Reuse AddTransactionModeTabs with approved flat underline control and
  localized names, selected/disabled semantics and RTL order.

## Manual contract

Preserve validation, shared positive amount grammar, account/category null
semantics, expense/income/transfer, currencies/conversion, recurring, optional
date/note/counterparty, budget/balance feedback and local-first save.

Reuse existing `components/add-transaction/TypeTabs.tsx`, CalculatorKeypad and
OptionalSection, plus `components/ui/GroupedMoneyInput.tsx` and Dropdown.
Ordinary amount input and required account/category selectors use approved
compact layout; selectors share normal-width row when shared breakpoint and text
scale fit. Transfers retain required source/target accounts and both amounts.

No initial amount autofocus. Calculator absent while idle, present only during
amount focus. Amount fields suppress native soft keyboard; ordinary text fields
retain it. Transfer amount focus targets its own calculator input. Done applies
existing equals behavior if needed, then dismisses without saving. Header Save
retains existing validation/local save. Safe mode switches blur/dismiss
calculator and preserve mounted draft; hidden mode subtree is inaccessible.

Manual contains no Voice allowance, daily-limit, burst or availability-check
failure notice. Blocked Voice never prevents Manual entry.

## State-to-surface and shared component map

| State                                                               | Active reference / binding                                                                 | Composition                                                                                                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Voice idle EN                                                       | [transaction-voice-en](../mockups/transaction-voice-en.binding.md)                         | Allowance card with continuous dynamic progress, unboxed mic/halos, examples card with bulb and food/car/coffee glyphs and exact English copy    |
| Voice idle AR                                                       | [transaction-voice-ar](../mockups/transaction-voice-ar.binding.md)                         | Allowance card with segmented dynamic progress, unboxed mic/halos, bulb and typographic quoted Arabic examples; no English row-icon substitution |
| Daily exhausted EN                                                  | [transaction-voice-daily-limit-en](../mockups/transaction-voice-daily-limit-en.binding.md) | Horizontal red alert, disabled unboxed mic/halos, disabled tomorrow action and outlined Manual action, no examples                               |
| Daily exhausted AR                                                  | [transaction-voice-daily-limit-ar](../mockups/transaction-voice-daily-limit-ar.binding.md) | Centered alert/divider/calendar reset, disabled mic, single green Manual action, passive next-local-midnight strip, no examples                  |
| Manual idle/focused                                                 | [transaction-manual-compact-b](../mockups/transaction-manual-compact-b.binding.md)         | PageHeader/Save, TypeTabs, ordinary GroupedMoneyInput, required Dropdown row, OptionalSection; calculator only focused, dismiss-only Done        |
| Loading                                                             | Common approved state facts in all five sidecars                                           | Skeleton; no invented available/zero count                                                                                                       |
| Availability-check failure                                          | Common approved state facts in all five sidecars                                           | Unboxed disabled status, short Voice unavailable heading, existing approved failure body, Try again and Use Manual; Voice only                   |
| Burst/recording/paused/finalizing/analyzing/replay/permission/error | Common approved state facts in all five sidecars                                           | Existing supported copy/actions, locks and cleanup in unboxed Voice area                                                                         |

Do not homogenize deliberate locale differences. Common approved state facts
govern non-raster states; availability failure does not imply daily exhaustion.

## Verified icon identities

Use installed `@expo/vector-icons` Ionicons, verified against
`build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json`.

| Role                                           | Verified name / treatment                                                                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| TypeTabs expense/income/transfer               | `remove-circle` (approved minus-circle visual), `arrow-up-circle`, `swap-horizontal`; reuse selector and existing selected type colors |
| Idle allowance badge                           | `mic-outline`, 24 dp in approved 48 dp badge                                                                                           |
| Examples heading                               | `bulb-outline`, 20 dp                                                                                                                  |
| English examples                               | `restaurant-outline`, `car-outline`, `cafe-outline`, 20 dp, in that order                                                              |
| Arabic examples                                | Typographic quote marks, no substitute badges                                                                                          |
| Daily-limit alert                              | `ban-outline`, 24 dp                                                                                                                   |
| Arabic daily reset / collapsed OptionalSection | `calendar-outline`; replaces current collapsed OptionalSection `create-outline` under approved B                                       |
| OptionalSection expand/collapse                | Existing `chevron-down` / `chevron-up`                                                                                                 |
| Calculator delete                              | Existing `backspace-outline`                                                                                                           |
| Idle/recording and disabled daily mic          | `mic`; daily disabled mic retains approved gray treatment, rather than current `time-outline` central status                           |
| Paused / completed / processing                | `pause` / `checkmark` / `hourglass-outline`                                                                                            |
| Burst / availability-check failure / replay    | `timer-outline` / `cloud-offline-outline` / `refresh-outline`                                                                          |
| Permission explanation / denied / error        | `mic-outline` / `settings-outline` / `alert-circle-outline`                                                                            |
| Recorder actions                               | Existing `stop`, `pause`, `play`; keep supported callbacks and localized names                                                         |

Current TypeTabs has no glyph import; adding these verified library glyphs to
the reused selector implements approved B. Existing shared control sizes remain
unless an approved sidecar specifies a value. Use registered palette/semantic
tokens and declared placement/RTL/selected/disabled treatment. Decorative glyphs
and halos have no independent focus; localized names belong to controls.

## Approved interpretations outside frozen facts

- Minimum48 dp calculator keys satisfy both approved minimum44 key size and
  minimum48 interactive target constraints.
- Common “Unavailable copy” means availability-check failure body and short
  recovery heading defined immediately before that clause. Explicit daily-limit
  unavailable headings, language-specific actions and passive reset strip stay.

Neither interpretation changes approved image/Binding Facts bytes or tuples.

## Allowance, responsive and evidence contract

Counts/limits/reasons come from shaped authoritative state. No local quota
arithmetic or new reservation contract; held-reservation bug #384 is deferred.
Reset remains next local midnight, without same-time-tomorrow or timezone
jargon. Exact baseline copy follows approved sidecars; other state copy retains
existing approved localization. Active recording/paused/finalizing/analyzing
lock mode changes; preserve focus, recovery, cleanup and required-field
semantics.

Approved normalized baseline is 390 x 844 dp; required visual validation
includes 320 x 640 compact, 768 x 1024 tablet, 844 x 390 landscape, light/dark,
EN/AR LTR/RTL and font scales 1.35/2. Use central responsive helpers, actual
safe-area insets once, growing controls and scroll without forced shrinking.

Owner's current repair instruction: “please don't test on emulator, just write
unit tests and e2e and i'll do manual testing after you finish”. Author unit and
E2E coverage; run focused unit/type/lint checks. No emulator/device/E2E
execution, adb/Droidrun operations or screenshot/accessibility capture in this
delivery. Hand complete manual plan to owner. T034/T035/T049/T050 and
visual/accessibility parts of T058 remain unchecked and NOT RUN pending owner
manual validation. Existing rendered comparison and separate accessibility-proof
requirements remain completion/reporting boundaries; passing unit checks or
source inspection does not establish visual completion, device readiness or
merge readiness.
