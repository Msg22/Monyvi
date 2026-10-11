# Derived mockup binding: starting-en — approved Voice motion proposal r1

<!-- prettier-ignore -->
- Approved reference image: starting-en.png
- Approved reference image revision: sha256:513857c54c32e69cdedbc8767663f7f97d87aa59b82115d07ce236d6522592ec
- Binding metadata approval: APPROVED
- Binding metadata revision: sha256:b1fbd279aec86034bd337f733c2b6f57bc339d31155067c8b971b14d309c20e7
- Approved binding metadata revision: sha256:b1fbd279aec86034bd337f733c2b6f57bc339d31155067c8b971b14d309c20e7
- Binding approval revision: sha256:f8d7f95decc0eb1a409f1ab6eb69ad2e24e48280edd366a103c17a905de93054
- Approved binding approval revision: sha256:f8d7f95decc0eb1a409f1ab6eb69ad2e24e48280edd366a103c17a905de93054
- Binding metadata approval evidence/reference: Original owner-approved five-image manifest sha256:7d91150571a3150e235a1b8ec63327cff4c19de6c292927cde76c40024c1c799 and proposal sha256:06e5e987543d85a2c90c57aaad695569ca904cc122571da47bae7195d2b9f4b0, as recorded in approval.json (owner receipt "mockups approved" and "Approve the proposal", thread 01a11606-3a5e-7420-a9d7-0ea491bde802, question call_WNqHZ69cvzQQG09hJY0sXedd:0). Owner delegated continuation ("don't wait for my approval on any thing, you are free to continue until you finish"; "you are free to recommend and apply your recommendations"). On 2026-10-10 the root explicitly ACCEPTED all five exact derivative Binding Facts and computed revisions, including this combined revision sha256:f8d7f95decc0eb1a409f1ab6eb69ad2e24e48280edd366a103c17a905de93054, under that delegated authority. This is root delegated acceptance, NOT a claim that the owner separately saw or approved this new SHA.
- Legacy metadata migration: no
- Derivation status: APPROVED scoped transcription by root on 2026-10-10 under owner-delegated authority; original concept/image owner-approved, new derivative SHA not individually presented to owner.

## Binding Facts

<!-- prettier-ignore -->
- Binding product surface: Voice Starting after mic tap, before availability refresh/consent/native recorder preparation resolves, within the same unboxed Voice surface.
- Declared comparison context: Approved motion concept has 853 × 1844 image pixels, not evidenced logical dp/density. Inherit existing normalized 390 × 844 logical-dp baseline at font scale 1, historical comparison fixture top/bottom insets 24/34 dp, and runtime safe-area insets applied once.
- Presentation-only framing: Generated phone hardware/status and bottom navigation, export canvas, background textures, incidental spacing, and accidental font scaling are illustrative; retain standalone /add-transaction, existing PageHeader and 48 dp underline mode tabs. Do not create a second tab bar.
- Spacing facts: Inherit horizontal content gutter 16 dp, inter-section gaps 12 dp, card padding 16 dp and example-row spacing 8 dp; keep the existing scrollable, unboxed Voice area and shared layout. Do not infer new absolute offsets from the image export.
- Sizing facts: Inherit 104 dp microphone hit target, static halos 140/172 dp, Voice area minimum 260 dp, shared PageHeader minimum 56 dp, underline tabs minimum 48 dp and selected underline 2 dp, ordinary interactive targets minimum 48 dp, card radius 16 dp/border 1 dp, tablet content maximum width 560 dp. Suggested 44 dp dismiss minimum is satisfied by existing 48 dp accessibility touch target.
- Color/theme facts: Use existing registered slate/semantic surfaces (light slate-50; dark slate-900/800/700), NileGreen-500/-600 microphone gradient, light-green halos and approved accent colors. No invented palette or copied raster texture. Light/dark differences are restricted to approved state-specific overlays.
- Typography facts: Use registered Inter for English and Noto Sans Arabic for Arabic. Preserve existing approved 22/32 bold shared header, 16/26 semibold tabs, 18/28 bold state headings, 14/22 regular body, and 12/20 helper/reset pattern; content grows at text scale without shrinking.
- State facts: Immediate visible title “Starting…” / “نجهّز التسجيل…”, description “Getting ready to listen…” / “لحظة ونكون جاهزين لسماعك…”, and Cancel / إلغاء. This is genuinely pending readiness, not Listening: microphone capture has not started and elapsed timer does not advance.
- Interaction behavior: Tap triggers a single guarded logical start. Duplicate taps cannot create a second capture. Cancel invalidates the generation/pending operation and any native preparation; late callbacks cannot reopen a stale state, start a provider or consume quota. Auth, existing AI Processing Consent Sheet, authoritative daily/burst/unknown refusal and permission policy are preserved.
- Transition behavior: Show Starting in the same tick as user start intent, before awaiting work. Enter Listening and begin real time only *after native recording has actually started*. Cancellation/failure goes to safe idle/recovery without an invisible new provider request. Recording-error retry transitions directly to Starting, not an intervening visible idle flash.
- Responsive variants: Inherit 320 × 640 compact, 390 × 844 ordinary, 768 × 1024 tablet centered max 560 dp, 844 × 390 landscape with vertical scroll; use centralized UI responsive helpers, never an invented device-specific breakpoint.
- Dark-mode variants: Use inherited light slate-50/dark slate-900 content surfaces and NileGreen microphone treatment. Preserve the shared mode underline, accessible Cancel and disabled mode switching while a start is pending.
- RTL/Arabic variants: The supplied image is EN only. Translate approved Starting title/body/Cancel exactly, preserve right-to-left Arabic copy and existing RTL mode order without inventing separate layout.
- Enlarged-text variants: Check font scales 1.35 and 2 with natural text wrapping, growing cards/controls, visible actions and vertical scroll; preserve separate accessibility and reduced-motion evidence.
- Fidelity-affecting unknowns: Exact starting-indicator spinner/path, staged duration, gradients beyond existing microphone, native preparation latency and pixel export density were not approved numeric measurements. No fabricated progress, additional wait timer or extra approval gate. Rendered/native evidence NOT RUN.

## Scope, precedence and verification boundary

This sidecar transcribes only the approved `2026-10-10-voice-motion-r1` proposal's scoped delta, together with inherited 390 × 844 dp geometry and established original Voice bindings. It does **not** introduce a new app page, redesign Manual B, override server quotas/consent/replay retention, or change the five frozen original `repair-binding-manifest.json` sidecars.

The exact image is `starting-en.png` in this folder and its SHA-256 is from the immutable approved source manifest. The export's 853 × 1844 pixel frame is **not** a second physical or logical UI layout. Original approved images and their independent binding fingerprints are still governed by `../../repair-binding-manifest.json`; the active motion crosswalk is `../../voice-motion-binding-context.md`.

The `Binding metadata revision` and `Binding approval revision` remain the exact computed fingerprints of the **unchanged** Binding Facts and approved source image. The original owner approval covers the five-image manifest and proposal; the root additionally accepted this specific derivative transcription and combined revision `sha256:f8d7f95decc0eb1a409f1ab6eb69ad2e24e48280edd366a103c17a905de93054` on 2026-10-10 using the owner's explicit delegated continuation authority. The owner was **not** separately presented with or asked to approve this SHA value. The `APPROVED` fields record delegated root acceptance, so `scripts/verify-mockup-binding.js` should verify these exact revisions against unchanged image/facts bytes. This metadata update does not reopen the concept or create a second product gate. Root-owned read-only analysis remains required before implementation; TDD and owner rendered/accessibility evidence remain separate gates.

Unmeasured shape/motion micro-details must be implemented with existing registered tokens and the approved purpose, then compared against the owner-held new images; any genuinely material undocumented design choice returns for clarification instead of a fabricated fact. Device/E2E/render/accessibility checks are **NOT RUN** by this documentation worker.
