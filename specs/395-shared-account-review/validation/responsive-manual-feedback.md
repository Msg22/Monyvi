# #395 responsive manual-feedback amendment

**Scope:** presentation only, based on owner-reported PR #396 visual defects.
Source baseline: `cd8a4c8751d35182abbecadb463b179130949957`. Approved
R3-05/07/09/10/15 and R1-07 binding/image bytes remain unchanged.

The owner superseded the earlier blanket `width < 390` stacking rule and the
absolute prohibition on modest local token adjustments. The **actual Review
container** should keep identity, Confirm/Change and the menu in one row when
their measured content can reasonably fit. Preserve the 390 dp binding baseline;
reserve 44/48 dp hit areas, let full names/amounts wrap, then make modest local
font/icon/gap/padding adjustments _before_ stacking on constrained widths or
larger accessibility text. Never disable system font scaling, truncate financial
identity, disable list virtualization or introduce device-specific width lists.

## Bounded repairs for owner visual review

- Review a nine-row list with long account/category labels: metadata and both
  icons stay legible without overlap or collapsed row height.
- Compare pending QNB and confirmed groups with their independent
  Confirm/Change/menu actions. Check ordinary phone inline placement, and
  narrow/large-text reflow without clipped actions or changed callbacks.
- Default-account note and Why stay quiet and inline where there is room; longer
  labels may wrap naturally.
- Voice Edit Transaction category label/value and trailing chevron stay aligned.
  SMS category interaction remains unchanged.
- In the Edit suggested account sheet, open Android keyboard on the name field.
  The focused input and Cancel/Confirm footer remain reachable by the existing
  keyboard-avoidance and scroll pattern, with the 80% usable-viewport cap and
  one bottom inset.

## Owner acceptance boundary

Compare an ordinary 390 dp phone to the approved references and use
representative smaller and wider/landscape screens, Arabic RTL, light/dark, and
enlarged system text. Include keyboard-open focus/scroll and bottom-inset
checks. **Owner manual rendering and accessibility acceptance are pending.** No
simulator/emulator, screenshot, keyboard-occlusion measurement, provider,
financial Save, or multi-device result is claimed by this source amendment.

Existing focused tests, TypeScript, lint, approved mockup bindings and Git hooks
remain Root's consolidated integration checks; no cosmetic breakpoint or
`className` assertion matrix is required. No product policy, permission,
eligibility, account/financial writer, SQL or sync behavior changes are
authorized here.
