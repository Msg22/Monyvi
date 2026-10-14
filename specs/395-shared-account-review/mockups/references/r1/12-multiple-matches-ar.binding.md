# Mockup binding: 12-multiple-matches-ar

<!-- prettier-ignore -->
- Approved reference image: 12-multiple-matches-ar.png
- Approved reference image revision: sha256:9f848ba5595931a2f4c767b62237f49e4f18a4ed5c4ca9f7585ddc1d2cf5de23
- Binding metadata approval: PENDING
- Binding metadata revision: sha256:6509d1f450722cb19b4918305d8130ccde5bbfb6421f266f31af016bccbcf63b
- Approved binding metadata revision: PENDING
- Binding approval revision: sha256:ae414959cbcd23d1d02fc0c980a4b4f645fea23ed847859bc7c1da4e815ccb4e
- Approved binding approval revision: PENDING
- Binding metadata approval evidence/reference: PENDING
- Legacy metadata migration: yes

This is proposed exact metadata, not implementation authority. Earlier R1/R2 scoped visual approval remains in provenance; R3 visual/copy approval remains pending.

## Binding Facts

- Binding product surface: Arabic RTL per-transaction existing-account chooser.
- Declared comparison context: Proposed normal 390×844 logical dp portrait at font scale1, runtime safe-area insets applied once. Component bounds flow within this context as specified below; no raster-to-dp inference.
- Presentation-only framing: Phone hardware, status/navigation artwork, outer canvas/export padding, lighting and unscoped background/form/header content are non-binding.
- Spacing facts: 20 dp outer gutter; new panel 16 dp inner padding, sections 12 dp apart, title/subtitle 4 dp, row identity/actions 12 dp, rows 12 dp vertical padding and 1 dp separators.
- Sizing facts: Full-width bottom sheet, 32 dp top radius, max 80% usable viewport, 350 dp normal content width, 40×4 dp handle, scrollable body; 48 dp minimum action height and 44 dp menu targets.
- Color/theme facts: Existing semantic background/surface/border/primary/secondary/muted and dark variants. Primary nileGreen600; links nileGreen700 light/400 dark; review gold800 light/400 dark; remove red600 light/500 dark; disabled slate200 light/700 dark. Existing gold active filter; no generated lighting/gradient.
- Typography facts: Existing font stack; titles20/28 bold, identities16/24 semibold, actions16/24 semibold, secondary14/20 normal, helper12/18 normal; default label16 semibold/helper12. Critical identities/helpers wrap, no forced tiny text.
- State facts: Three distinguishable compatible candidates; no selected option; disabled accept.
- Interaction behavior: Arabic labels and mirrored layout, isolated currency/card values; same explicit per-row choice/cancel behavior as EN. Named accessible targets and selected/disabled states; safe-area/keyboard reachability; approved spec governs eligibility. Companion behavioral/copy contract pinned below.
- Transition behavior: Existing sheet slide, one active surface, cancel/Back commits nothing. Confirmation/removal/counters reflect committed local state immediately with no artificial delay; retain focus and choices on failure. Reduced motion disables optional translation/fade.
- Responsive variants: Centralized 340/390/600 dp and font scale1.35. Keep normal row when it fits; below390 or enlarged text reflow dense rows identity/actions/disclosure; below340 stack paired actions. Tablet/landscape fluid width in existing shell; scroll instead of shrinking fonts.
- Dark-mode variants: Same grouping/geometry, semantic dark background/surface/text/border and approved status/action tokens; no new palette or grey decorative backdrop.
- RTL/Arabic variants: Mirror start/end and action order, R1 Arabic chooser and R3-15 combined layout; bidi-isolate codes/suffixes/amount signs; use pinned EN/AR copy and localized plurals; user names not translated.
- Enlarged-text variants: Scale system typography, wrap labels/helpers and grow rows, reflow at scale above1.35, scroll sheet/list, keep44 dp targets and reachable runtime-inset footer; never reduce font to fit.
- Fidelity-affecting unknowns: None in this explicit proposal; metadata values are awaiting approval rather than inferred. Runtime insets and platform glyph rasterization are variable inputs, not unknown fixed constants.
- Pinned companion contract: ../../binding-contract.md for reference/proposal directories; sha256:5717e4ab6dd4f2458c686565fb81c725bcf1a7d1197ebde3e167542716f48a68. Exact contract bytes MUST match this revision before consumption.
- Pinned interaction/copy notes: sha256:2b4c8a42cb01a0148ef4e4ee6a09f158b60357ac3bb045b28ecd50b47e1ca5d4; pinned owner adjustments: sha256:f25dd143c5859437d4602fccc70a23036f3416895d852d362d4a72158827a2b4; approved spec: sha256:e012f5a7d2edadc8bc1e2fa2ce03aeea56bc0c947dc02bfc2a3f166150e2c7d0. These dependencies MUST retain their exact bytes or require renewed binding approval.
