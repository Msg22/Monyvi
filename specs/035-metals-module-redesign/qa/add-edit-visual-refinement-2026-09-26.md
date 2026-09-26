# Add/Edit refinement verification — 2026-09-26

## Scope

Refine Add/Edit against `design/mockups/nile-current-v1-flow/05-add-holding-entry.png`; expose Edit details from Holding details; remove passive Offline mode badges throughout the app. English/RTL direction mismatch is explicitly excluded: it is being fixed separately on main.

Changes preserve the form's existing validation and save contracts. Outlined shared-field styling is opt-in. Default shared fields retain their existing styling. Rate freshness and unavailable-rate feedback remain visible.

## Automated coverage

| Scenario | Coverage | Result |
| --- | --- | --- |
| Detail opens Edit details | `metals-detail-edit-entry.test.tsx`; `e2e/maestro/metals/edit-holding.yaml` now enters through detail | Unit passed; full Maestro not run |
| Compact layout, enlarged text, labels and bottom safe area | `metals-add.test.tsx` | Passed |
| Currency prefix stays separate from enlarged amount | `TextField.test.tsx` measured-adornment regression | Red reproduced, then 6 tests passed |
| Rate age works without Android Hermes RelativeTimeFormat | `holding-preview-hermes.test.ts` with API removed | Red reproduced, then passed in English and Arabic |
| Existing edit validation/correction behavior | `metals-edit.test.tsx` | 18 passed |
| Passive offline badges absent | `holding-experience.test.tsx`, `portfolio-surfaces.test.tsx`, `LiveRatesScreen.metals-v1.test.tsx` | Passed |
| History and shared text entry regressions | `MetalHistoryScreen.test.tsx`, `TextField.test.tsx` | Passed |

Focused baseline: 8 suites / 88 tests passed before the additional Hermes and measured-prefix regressions. Subsequent focused reruns passed. One combined rerun timed out after Add and Hermes passed; Edit then passed independently. Changed-file lint passed. Full TypeScript check is blocked by existing `app/auth.tsx` links to `/privacy-policy` and `/terms`, which are absent from this branch's generated route union; these lines also exist at the starting commit.

## Android smoke and visual evidence

Pixel 7 emulator, 1080x2400, density 420, English LTR:

- Opened seeded Gold Test Bar from My Metals; scrolled to Edit details; tapped it; real Edit holding screen loaded with persisted values.
- This uncovered a Hermes-only rate-age crash missed by mocked route tests. Fixed using existing translated relative-time plural strings.
- Compared the real form component with sample mockup values in light and dark modes. Temporary presentation harness did not save records and was removed afterward.
- Confirmed compact outlined controls, sentence-case labels, Weight/Purity row, image selection cards, neutral preview surface and readable dark accents.
- At 320dp width and 200% text, Weight/Purity stack and currency prefix has measured spacing. Android overrides restored afterward.
- Screenshot evidence was captured locally in `apps/mobile/.expo/`: `edit-open-final.png`, `add-light-top-final.png`, `add-light-bottom-final.png`, `add-dark-top-final.png`, `add-dark-final.png`, and `add-compact-large-text.png`. Earlier light captures precede the final spacing/prefix adjustment. These are supporting smoke evidence, not a complete visual matrix.

The approved image includes an iPhone frame and no exact logical viewport. This pass follows its composition with native controls and minimum touch targets; it does not certify literal pixel identity across devices.

## Manual QA plan / remaining checks

1. In light and dark themes, open My Metals → Add holding. Compare against the approved reference: labels, outlines, spacing, selected gold/silver, Weight/Purity row, currency suffix/prefix, date, form cards, notes, estimate and CTA. Screenshot comparison remains manual; layout branches have unit coverage.
2. Repeat on compact phone, tablet, landscape, Arabic RTL and enlarged text. Compact/200% text smoke completed; remaining device/theme combinations and TalkBack are manual pending. Do not conflate the separate English/RTL bug with this change.
3. Enter a valid holding and save, reopen detail, select Edit details, change notes, save, and verify updated detail. Cancel a second edit and confirm nothing changes. Existing Add/Edit automated tests cover deterministic branches; updated Maestro journey awaits execution. This smoke checked opening Edit, not persistence.
4. With airplane mode and cached data, open My Metals, Holding details, History and Live Rates. No Offline mode badge should appear; cached values and rate warnings still work. Repeat with no cached rates and with a failed refresh. Badge assertions pass; actual connectivity transitions remain manual pending.
5. Open onboarding's device-storage slide: Instant badge remains, Offline mode pill is absent. Manual pending.
6. Open Add with missing, fresh and stale rates. Ensure preview text is readable in dark mode and a stale rate's age does not crash Android. Hermes regression is automated; full end-to-end stale acknowledgement remains in the existing QA plan.
7. Verify gesture and 3-button navigation do not overlap Add/Save/Cancel; bottom-inset unit check passes, gesture emulator inspected, physical 3-button device pending.
