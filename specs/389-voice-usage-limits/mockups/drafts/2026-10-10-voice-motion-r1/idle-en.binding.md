# Derived mockup binding: idle-en — approved Voice motion proposal r1

<!-- prettier-ignore -->
- Approved reference image: idle-en.png
- Approved reference image revision: sha256:3589cd5e76aa060fc88dbc91982d04de2678b0475ff5603a8af3b49285a3fa10
- Binding metadata approval: DERIVED_FROM_APPROVED_CONCEPT
- Binding metadata revision: sha256:347264b72f94ce6dac83dce900fe374f5dd418d6a8e24e7dca3b0d688eefa6a6
- Approved binding metadata revision: PENDING
- Binding approval revision: sha256:1b8506115196d7471169c8b694d89d41f1ceabfcb15602d4e1efd7ec6f19ad16
- Approved binding approval revision: PENDING
- Binding metadata approval evidence/reference: Owner concept approval on 2026-10-10 recorded in approval.json: thread 01a11606-3a5e-7420-a9d7-0ea491bde802, question call_WNqHZ69cvzQQG09hJY0sXedd:0, receipt "mockups approved" + "Approve the proposal"; immutable source manifest sha256:7d91150571a3150e235a1b8ec63327cff4c19de6c292927cde76c40024c1c799 with proposal sha256:06e5e987543d85a2c90c57aaad695569ca904cc122571da47bae7195d2b9f4b0. This receipt does not separately approve the newly computed derivative binding-metadata or combined revision.
- Legacy metadata migration: no
- Derivation status: Concept and immutable original image approved; derivative fact digest computed for audit, NOT separately owner-approved.

## Binding Facts

<!-- prettier-ignore -->
- Binding product surface: English Voice idle on unified Add Transaction; approved scoped badge/examples/dismiss embellishments only, not a new screen or redesign.
- Declared comparison context: Approved motion concept has 853 × 1844 image pixels, not evidenced logical dp/density. Inherit existing normalized 390 × 844 logical-dp baseline at font scale 1, historical comparison fixture top/bottom insets 24/34 dp, and runtime safe-area insets applied once.
- Presentation-only framing: Generated phone hardware/status and bottom navigation, export canvas, background textures, incidental spacing, and accidental font scaling are illustrative; retain standalone /add-transaction, existing PageHeader and 48 dp underline mode tabs. Do not create a second tab bar.
- Spacing facts: Inherit horizontal content gutter 16 dp, inter-section gaps 12 dp, card padding 16 dp and example-row spacing 8 dp; keep the existing scrollable, unboxed Voice area and shared layout. Do not infer new absolute offsets from the image export.
- Sizing facts: Inherit 104 dp microphone hit target, static halos 140/172 dp, Voice area minimum 260 dp, shared PageHeader minimum 56 dp, underline tabs minimum 48 dp and selected underline 2 dp, ordinary interactive targets minimum 48 dp, card radius 16 dp/border 1 dp, tablet content maximum width 560 dp. Suggested 44 dp dismiss minimum is satisfied by existing 48 dp accessibility touch target.
- Color/theme facts: Use existing registered slate/semantic surfaces (light slate-50; dark slate-900/800/700), NileGreen-500/-600 microphone gradient, light-green halos and approved accent colors. No invented palette or copied raster texture. Light/dark differences are restricted to approved state-specific overlays.
- Typography facts: Use registered Inter for English and Noto Sans Arabic for Arabic. Preserve existing approved 22/32 bold shared header, 16/26 semibold tabs, 18/28 bold state headings, 14/22 regular body, and 12/20 helper/reset pattern; content grows at text scale without shrinking.
- State facts: Three existing Voice regions remain: dynamic authoritative allowance (EN continuous progress), unboxed 104 dp microphone with 140/172 dp halos, and example card. Dark allowance badge changes to slate-700 with NileGreen microphone glyph; examples heading badge matches. English examples retain ordered `restaurant-outline` orange-500, `car-outline` blue-500, `cafe-outline` palette gold-500 (the approved token). Dismiss label is “Dismiss examples” / “إخفاء الأمثلة”. Reset copy is “Your limits reset tomorrow.” / “يتجدد حد استخدامك غدًا.”, meaning next local midnight.
- Interaction behavior: Tap mic enters visible Starting immediately, subject to current auth/AI consent/availability/native permission gates. A ≥48 dp close button dismisses the *entire* examples card immediately and stores an account-namespaced preference on this device; no backend, global pre-auth flag, or financial/sync change. Missing/failed reads default to visible; failed writes cannot claim durability.
- Transition behavior: Examples stay dismissed for the same authenticated account after route change, restart, language/theme change and sign-out/sign-in; other accounts have independent preferences. Reset account-visible state on user switch and discard stale async reads. Repeated close is idempotent; recording UI does not begin before native capture.
- Responsive variants: Inherit 320 × 640 compact, 390 × 844 ordinary, 768 × 1024 tablet centered max 560 dp, 844 × 390 landscape with vertical scroll; use centralized UI responsive helpers, never an invented device-specific breakpoint.
- Dark-mode variants: Dark badge uses existing slate-700 with green `mic-outline`; light badge unchanged. Preserve NileGreen gradient/visible halos. Example restaurant/car/coffee accent identities stay orange/blue/gold in either theme.
- RTL/Arabic variants: Existing approved AR idle reference remains separate authority: segmented dynamic progress, quote-mark Arabic examples and no substituted EN food/car/cafe icons; mirrored tab order/field alignment. New dismiss name localized, though the only new raster is EN.
- Enlarged-text variants: Check font scales 1.35 and 2 with natural text wrapping, growing cards/controls, visible actions and vertical scroll; preserve separate accessibility and reduced-motion evidence.
- Fidelity-affecting unknowns: No independent Arabic or dark export, no evidenced 853-pixel-to-dp ratio, and no recovered shadow/texture coordinates. `palette.gold[500]` is defined in colors.ts but Tailwind config currently omits `gold-500`; an Ionicons color prop may use the approved palette value without a token invention. Rendered and accessibility comparisons NOT RUN.

## Scope, precedence and verification boundary

This sidecar transcribes only the approved `2026-10-10-voice-motion-r1` proposal's scoped delta, together with inherited 390 × 844 dp geometry and established original Voice bindings. It does **not** introduce a new app page, redesign Manual B, override server quotas/consent/replay retention, or change the five frozen original `repair-binding-manifest.json` sidecars.

The exact image is `idle-en.png` in this folder and its SHA-256 is from the immutable approved source manifest. The export's 853 × 1844 pixel frame is **not** a second physical or logical UI layout. Original approved images and their independent binding fingerprints are still governed by `../../repair-binding-manifest.json`; the active motion crosswalk is `../../voice-motion-binding-context.md`.

The `Binding metadata revision` and `Binding approval revision` above are **computed identifiers only**; no owner-approved revision was invented. The original owner approval covers the five-image manifest and approved proposal, not a new standalone sidecar-revision gate. Thus `scripts/verify-mockup-binding.js` is **not expected to report APPROVED for this derivative record** (its exact-revision approval fields are deliberately PENDING). This does not reopen the approved concept or create a second product gate. Implementation still depends on root-owned canonical prerequisite/read-only analysis, existing binding checks, TDD and owner rendered/accessibility evidence.

Unmeasured shape/motion micro-details must be implemented with existing registered tokens and the approved purpose, then compared against the owner-held new images; any genuinely material undocumented design choice returns for clarification instead of a fabricated fact. Device/E2E/render/accessibility checks are **NOT RUN** by this documentation worker.
