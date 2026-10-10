# Mockup binding: mockup-2

<!-- prettier-ignore -->
- Approved reference image: mockup-2.png
- Approved reference image revision: sha256:d5998e820d8153a43080cc823c188f4d5b659a563147726520a0e34861f61e6e
- Binding metadata approval: APPROVED
- Binding metadata revision: sha256:4f2fe379bb4462641f7284685b582cebcede230b60d1ca9d97bceaf2eb5efe0a
- Approved binding metadata revision: sha256:4f2fe379bb4462641f7284685b582cebcede230b60d1ca9d97bceaf2eb5efe0a
- Binding approval revision: sha256:0b06db4128417a2981ef0e943953e2186967decab2495ca83aed8c6c229943a8
- Approved binding approval revision: sha256:0b06db4128417a2981ef0e943953e2186967decab2495ca83aed8c6c229943a8
- Binding metadata approval evidence/reference: Owner reply on 2026-10-07 in chat 01a11606-3a5e-7420-a9d7-0ea491bde802 to call_3SOfr0FPm3RmUNgWIRuA5lS8 item 0: "Approve both proposed bindings and copy"; explicitly presented combined revision sha256:0b06db4128417a2981ef0e943953e2186967decab2495ca83aed8c6c229943a8
- Legacy metadata migration: yes

`Approved reference image revision` MUST be `sha256:<64 lowercase hex>` computed
from the exact approved image bytes. `Binding metadata revision` MUST be the
SHA-256 of the exact UTF-8/LF bytes beneath `## Binding Facts` through the next
level-two heading or EOF. `Binding approval revision` MUST be SHA-256 over the
exact UTF-8/LF bytes below, including the final LF after the second line:

```text
approved-reference-image-revision=<Approved reference image revision>
binding-metadata-revision=<Binding metadata revision>
```

The sidecar is authoritative only when
`node scripts/verify-mockup-binding.js <this-sidecar>` passes,
`Binding metadata approval: APPROVED`, both approved revision fields equal their
current revisions, and the approval evidence/reference identifies
`Approved binding approval revision`. If either the image bytes or any
`## Binding Facts` byte changes, approval is invalid even when the filename is
unchanged; reset approval status, both approved revision fields, and approval
evidence to `PENDING`, recompute the affected image/metadata revision plus
`Binding approval revision`, and obtain renewed explicit approval for the
combined image-and-metadata authority tuple.

## Binding Facts

- Binding product surface: PROPOSED normalized reconstruction of the unified
  /add-transaction shell with MANUAL selected; approved image remains unchanged.
- State facts: Arabic/light Manual selected with compact allowance strip above
  the existing Manual form and Save action. Image form is illustrative: no new
  merchant schema; transfer, calculator, currency, recurring, budget and inline
  validation behavior stay intact. Required markers use shared required props.
  Voice quota loading/error/consent failure is passive here and never blocks
  form edits or local saves. Save includes actual bottom safe-area clearance.

- Declared comparison context: PROPOSED FOR APPROVAL, not recovered historical
  metadata: 390 x 844 logical dp, font scale 1, Arabic RTL, light theme.
  Reference phone hardware/notch/status-bar artwork/export canvas is excluded.
  Test capture uses top inset 24 dp and bottom inset 34 dp; runtime always uses
  actual safe-area metrics once, never these fixture numbers as fixed padding.
  Raster dimensions are provenance only and do not establish device density.
- Presentation-only framing: Hardware, notch, illustrated OS status bar, home
  indicator, white export canvas and pictured five-item bottom navigation are
  proposed as non-binding. The standalone /add-transaction route keeps its
  existing stack/back navigation; global app tabs remain on their current
  routes. Adding the pictured Add tab is outside this proposed binding.
- Spacing facts: PROPOSED: outer horizontal gutter 16 dp; vertical section gaps
  12 dp; card inner padding 16 dp; label-to-control gap 8 dp; example-row gap 8
  dp. Safe-area insets are applied once. Content scrolls rather than clipping or
  shrinking text to force the entire raster onto one phone.
- Sizing facts: PROPOSED: shell header uses shared PageHeader with minimum 56 dp
  row; mode track minimum 44 dp, two equal targets; cards radius 16 dp and
  border 1 dp; general touch targets minimum 48 dp. Allowance icon 24 dp inside
  48 dp circle; progress track 8 dp. Voice mic target diameter 104 dp, with
  decorative halos 140/172 dp; main Voice card minimum 260 dp, growing with
  text. Manual quota strip minimum 68 dp, growing with content; Voice summary
  minimum 128 dp. Form widgets retain current shared component sizing.
- Color/theme facts: PROPOSED: existing background/surface/border/text semantic
  classes; slate-50 page, slate-25 cards, slate-200 borders in light mode;
  matching registered dark variants. NileGreen-500 microphone/progress/action,
  nileGreen-50 selected/halo surface and nileGreen-700 selected labels. Main
  microphone/Save gradient uses existing nileGreen-500 and -600, with slate-25
  glyph/text. No new palette. Error uses existing red-500; temporary blocker
  uses existing gold-600. NativeWind interactive-shadow exceptions follow
  AGENTS.md.
- Typography facts: PROPOSED: existing locale font families from
  apps/mobile/constants/typography.ts (Noto Sans Arabic for Arabic, Inter for
  English); title 22/32 dp bold; tabs/status 16/26 semibold; card/mic heading
  18/28 bold; body/example 14/22 regular; reset/helper 12/20 regular. Numeric
  quota uses locale formatting and remains readable as one group.
- Interaction behavior: FAB opens Manual; mic/onboarding/voice-review Retry open
  Voice on the same route. Manual remains mounted and hidden mode content is
  inaccessible. Recording begins only after current consent/permission and fresh
  authoritative availability gates. No native permission request without the
  existing custom explanatory/recovery action. Back/Discard/Retry retain current
  voice cleanup and review-origin semantics. Manual save remains local and works
  offline; passive quota failure never prompts consent or blocks it.
- Transition behavior: PROPOSED: immediate mode change without sliding the
  entire form, retaining Manual focus/draft where safe. Disable both mode
  controls while recording/paused/finalizing/analyzing; existing explicit
  discard/stop/pause/resume actions control those states. Move focus to active
  mode heading after safe switch; announce quota/blocker updates politely.
  Decorative microphone pulse runs only during recording, uses existing
  Reanimated primitives, stops on pause/unmount and respects reduced motion.
- Responsive variants: PROPOSED: normal baseline 390 x 844; compact 320 x 640;
  tablet 768 x 1024 with centered 560 dp maximum content width; landscape 844 x
  390 with vertical scrolling. Use shared ui.ts compact threshold width < 340 or
  font scale > 1.35 for compact/reflow treatment. Tabs stay on one equal-width
  row; cards grow, status/count stack only when needed. No fixed screen-height
  composition and no controls under bottom safe area.
- Dark-mode variants: PROPOSED: same composition, registered dark background/
  surface/border/text classes; green primary hierarchy retained. Rendered
  comparisons required, with no new image replacing the approved reference.
- RTL/Arabic variants: PROPOSED: Arabic Manual on right and Voice on left as
  depicted; English Manual on left and Voice on right. Use shared PageHeader
  locale-aware back action rather than copying the raster's left-side arrow.
  Align body/labels to locale; preserve number/date input grammar and existing
  Arabic numeric presentation. Full copy table is in ../reconciliation.md.
- Enlarged-text variants: PROPOSED: verify font scales 1.35 and 2, using shared
  compact rules and expanding card/control heights; no truncation of actions or
  forced font shrink. Preserve semantic order, localize tab roles/names/
  selected/disabled states, exclude decorative halos and hidden form tree.
- Fidelity-affecting unknowns: Historical logical viewport/density/crop and
  exact original font/token values remain unrecoverable. This is an explicit
  normalized reconstruction proposal, not an assertion of recovered facts.
  Approval must adopt this comparison context, chrome scope, token mapping and
  state/variant adaptations before UI production. Functional, visual and
  accessibility proof remain separate; current draft conveys no approval.

## Provenance and approval boundary

- Original filename: `image-gen-2(1).png`
- Original creation timestamp: `2026-09-27T11:49:58Z`
- Original uploaded file ID: `file_0000000029788210a0a90097ab3c1504`
- Original persistent file ID: `libfile_46adb90a210881919a77718e9e37fe1f`
- Original/copy byte count: `1179439`
- Original/copy SHA-256:
  `d5998e820d8153a43080cc823c188f4d5b659a563147726520a0e34861f61e6e`
- Image approval context: supplied 2026-09-27 conversation approval of the
  Manual/Voice mockup, restated in spec clarification and current request to
  save that exact approved reference. This is image approval, not approval of
  this new metadata revision.
- Copy correction authority: spec clarification records choice A, local-midnight
  calendar-day reset. The earlier same-time-tomorrow raster wording is preserved
  unchanged for provenance and must not become implemented copy.
- Sidecar created from `.specify/templates/mockup-binding-template.md`. The
  owner approved this exact combined revision on 2026-10-07 in the current local
  chat: "Approve both proposed bindings and copy". The frozen Binding Facts
  retain proposal wording to preserve their approved bytes; the approval header
  now adopts those facts. Historical proposal disclaimers describe the
  pre-approval draft. Functional, rendered and accessibility evidence remain
  separate gates; authority requires verifier exit zero.
