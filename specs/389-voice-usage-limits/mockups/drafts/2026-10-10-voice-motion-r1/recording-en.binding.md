# Derived mockup binding: recording-en — approved Voice motion proposal r1

<!-- prettier-ignore -->
- Approved reference image: recording-en.png
- Approved reference image revision: sha256:cd668d390af5f6b8f1227dc753217fd9a46c1f1abaa7c8d8e6d0efe828e77d28
- Binding metadata approval: DERIVED_FROM_APPROVED_CONCEPT
- Binding metadata revision: sha256:c33f0fe906258227fb557a746bd057cd756db4fe19c974a221f915aa6ef1362d
- Approved binding metadata revision: PENDING
- Binding approval revision: sha256:01c051efdb68e0a0e4b73721b398075033cbea2fb6dec1c2b17ed445ca31e299
- Approved binding approval revision: PENDING
- Binding metadata approval evidence/reference: Owner concept approval on 2026-10-10 recorded in approval.json: thread 01a11606-3a5e-7420-a9d7-0ea491bde802, question call_WNqHZ69cvzQQG09hJY0sXedd:0, receipt "mockups approved" + "Approve the proposal"; immutable source manifest sha256:7d91150571a3150e235a1b8ec63327cff4c19de6c292927cde76c40024c1c799 with proposal sha256:06e5e987543d85a2c90c57aaad695569ca904cc122571da47bae7195d2b9f4b0. This receipt does not separately approve the newly computed derivative binding-metadata or combined revision.
- Legacy metadata migration: no
- Derivation status: Concept and immutable original image approved; derivative fact digest computed for audit, NOT separately owner-approved.

## Binding Facts

<!-- prettier-ignore -->
- Binding product surface: Voice actively recording *after* successful native capture start, while retaining existing stop/pause/resume/discard, review and quota contracts.
- Declared comparison context: Approved motion concept has 853 × 1844 image pixels, not evidenced logical dp/density. Inherit existing normalized 390 × 844 logical-dp baseline at font scale 1, historical comparison fixture top/bottom insets 24/34 dp, and runtime safe-area insets applied once.
- Presentation-only framing: Generated phone hardware/status and bottom navigation, export canvas, background textures, incidental spacing, and accidental font scaling are illustrative; retain standalone /add-transaction, existing PageHeader and 48 dp underline mode tabs. Do not create a second tab bar.
- Spacing facts: Inherit horizontal content gutter 16 dp, inter-section gaps 12 dp, card padding 16 dp and example-row spacing 8 dp; keep the existing scrollable, unboxed Voice area and shared layout. Do not infer new absolute offsets from the image export.
- Sizing facts: Inherit 104 dp microphone hit target, static halos 140/172 dp, Voice area minimum 260 dp, shared PageHeader minimum 56 dp, underline tabs minimum 48 dp and selected underline 2 dp, ordinary interactive targets minimum 48 dp, card radius 16 dp/border 1 dp, tablet content maximum width 560 dp. Suggested 44 dp dismiss minimum is satisfied by existing 48 dp accessibility touch target.
- Color/theme facts: Use existing registered slate/semantic surfaces (light slate-50; dark slate-900/800/700), NileGreen-500/-600 microphone gradient, light-green halos and approved accent colors. No invented palette or copied raster texture. Light/dark differences are restricted to approved state-specific overlays.
- Typography facts: Use registered Inter for English and Noto Sans Arabic for Arabic. Preserve existing approved 22/32 bold shared header, 16/26 semibold tabs, 18/28 bold state headings, 14/22 regular body, and 12/20 helper/reset pattern; content grows at text scale without shrinking.
- State facts: Keep existing unboxed 104 dp gradient mic and 140/172 dp static decorative halos. Two thin outward listening strokes ripple from the mic boundary to the 172 dp region over ~1.4 s with ~700 ms stagger; gentle activity bars cycle ~1.2 s. The displayed 00:00-style timer tracks real recorder elapsed time. Do not imply audio level measurement.
- Interaction behavior: Existing Stop, Pause and Discard retain identities, callbacks and localized accessible names. Pausing freezes elapsed time and activity; resuming restarts actual recorder activity without a new logical provider request. Mode-switch lock remains during recording/paused/finalizing/analyzing.
- Transition behavior: Cancel, discard, unmount and authenticated user switch cancel every Reanimated repeat and native recorder work. Static alternatives replace ripples/bars for reduced-motion. Never report Listening/ticking timer on failed native recorder start; show actionable recovery.
- Responsive variants: Inherit 320 × 640 compact, 390 × 844 ordinary, 768 × 1024 tablet centered max 560 dp, 844 × 390 landscape with vertical scroll; use centralized UI responsive helpers, never an invented device-specific breakpoint.
- Dark-mode variants: Use existing dark slate-900 page and legible registered light-green halo/ripple treatment; NileGreen gradient mic remains circular and high contrast. Static disabled slate look belongs only to existing daily-limit states.
- RTL/Arabic variants: The new raster is EN; localize recorder button names/timer semantics using existing AR resources and RTL layout. Ripples and amplitude-neutral bars retain visual meaning, not reversed transaction meaning.
- Enlarged-text variants: Check font scales 1.35 and 2 with natural text wrapping, growing cards/controls, visible actions and vertical scroll; preserve separate accessibility and reduced-motion evidence.
- Fidelity-affecting unknowns: Exact stroke thickness, easing curve, bar counts/heights/spacing and frame-perfect native animation timing are not separately measured/approved; do not copy accidental raster pixels or claim microphone volume monitoring. Native/reduced-motion/accessibility proof NOT RUN.

## Scope, precedence and verification boundary

This sidecar transcribes only the approved `2026-10-10-voice-motion-r1` proposal's scoped delta, together with inherited 390 × 844 dp geometry and established original Voice bindings. It does **not** introduce a new app page, redesign Manual B, override server quotas/consent/replay retention, or change the five frozen original `repair-binding-manifest.json` sidecars.

The exact image is `recording-en.png` in this folder and its SHA-256 is from the immutable approved source manifest. The export's 853 × 1844 pixel frame is **not** a second physical or logical UI layout. Original approved images and their independent binding fingerprints are still governed by `../../repair-binding-manifest.json`; the active motion crosswalk is `../../voice-motion-binding-context.md`.

The `Binding metadata revision` and `Binding approval revision` above are **computed identifiers only**; no owner-approved revision was invented. The original owner approval covers the five-image manifest and approved proposal, not a new standalone sidecar-revision gate. Thus `scripts/verify-mockup-binding.js` is **not expected to report APPROVED for this derivative record** (its exact-revision approval fields are deliberately PENDING). This does not reopen the approved concept or create a second product gate. Implementation still depends on root-owned canonical prerequisite/read-only analysis, existing binding checks, TDD and owner rendered/accessibility evidence.

Unmeasured shape/motion micro-details must be implemented with existing registered tokens and the approved purpose, then compared against the owner-held new images; any genuinely material undocumented design choice returns for clarification instead of a fabricated fact. Device/E2E/render/accessibility checks are **NOT RUN** by this documentation worker.
