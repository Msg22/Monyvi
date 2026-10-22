# Mockup binding: 01-unified-review-en

<!-- prettier-ignore -->
- Approved reference image: 01-unified-review-en.png
- Approved reference image revision: sha256:ca26ac07c04550267d15c95f4e9ee55e50a6d644b249ed7163b3facc5b2d0a1b
- Binding metadata approval: APPROVED
- Binding metadata revision: sha256:63ac2a6b37355edd2cf0978216f5f19131cf56df1add266c7d2ef41684f3f725
- Approved binding metadata revision: sha256:63ac2a6b37355edd2cf0978216f5f19131cf56df1add266c7d2ef41684f3f725
- Binding approval revision: sha256:2170f443d73806360a4bb79ad1f838aa43fc959256dfa44f910b72cee01abd62
- Approved binding approval revision: sha256:2170f443d73806360a4bb79ad1f838aa43fc959256dfa44f910b72cee01abd62
- Binding metadata approval evidence/reference: Owner reply "Approve B1 bindings and R3 additions", 2026-10-14; ../../../approvals/b1-2026-10-14.json; approved combined revision sha256:2170f443d73806360a4bb79ad1f838aa43fc959256dfa44f910b72cee01abd62
- Legacy metadata migration: yes

Owner approved this exact B1 image-and-metadata tuple and R3 visual/copy additions on 2026-10-14. Earlier R1/R2 scoped visual approval remains in provenance. Frozen proposal headers/statuses are superseded by the approval receipt; normative bytes remain unchanged.

## Binding Facts

- Binding product surface: Compact shared-group/issue/default grouping concept only; final detailed composition R3-05.
- Declared comparison context: Proposed normal 390×844 logical dp portrait at font scale1, runtime safe-area insets applied once. Component bounds flow within this context as specified below; no raster-to-dp inference.
- Presentation-only framing: Phone hardware, status/navigation artwork, outer canvas/export padding, lighting and unscoped background/form/header content are non-binding.
- Spacing facts: 20 dp outer gutter; new panel 16 dp inner padding, sections 12 dp apart, title/subtitle 4 dp, row identity/actions 12 dp, rows 12 dp vertical padding and 1 dp separators.
- Sizing facts: 350 dp detail panel/318 dp inner content at baseline, radius12/border1 dp; new detail rows min68 dp, badge40/icon22 dp; checkbox24 within44 dp target; actions min48 dp; rows grow with text.
- Color/theme facts: Existing semantic background/surface/border/primary/secondary/muted and dark variants. Primary nileGreen600; links nileGreen700 light/400 dark; review gold800 light/400 dark; remove red600 light/500 dark; disabled slate200 light/700 dark. Existing gold active filter; no generated lighting/gradient.
- Typography facts: Existing font stack; titles20/28 bold, identities16/24 semibold, actions16/24 semibold, secondary14/20 normal, helper12/18 normal; default label16 semibold/helper12. Critical identities/helpers wrap, no forced tiny text.
- State facts: Seven rows: QNB3, CIB1, currency1, defaults2; review5/selected2.
- Interaction behavior: Groups independent; currency issue action separate; Why discloses defaults; R3-05 supplies final direct-selection disclosure/toolbar. Named accessible targets and selected/disabled states; safe-area/keyboard reachability; approved spec governs eligibility. Companion behavioral/copy contract pinned below.
- Transition behavior: Existing sheet slide, one active surface, cancel/Back commits nothing. Confirmation/removal/counters reflect committed local state immediately with no artificial delay; retain focus and choices on failure. Reduced motion disables optional translation/fade.
- Responsive variants: Centralized 340/390/600 dp and font scale1.35. Keep normal row when it fits; below390 or enlarged text reflow dense rows identity/actions/disclosure; below340 stack paired actions. Tablet/landscape fluid width in existing shell; scroll instead of shrinking fonts.
- Dark-mode variants: Same grouping/geometry, semantic dark background/surface/text/border and approved status/action tokens; no new palette or grey decorative backdrop.
- RTL/Arabic variants: Mirror start/end and action order, R1 Arabic chooser and R3-15 combined layout; bidi-isolate codes/suffixes/amount signs; use pinned EN/AR copy and localized plurals; user names not translated.
- Enlarged-text variants: Scale system typography, wrap labels/helpers and grow rows, reflow at scale above1.35, scroll sheet/list, keep44 dp targets and reachable runtime-inset footer; never reduce font to fit.
- Fidelity-affecting unknowns: None in this explicit proposal; metadata values are awaiting approval rather than inferred. Runtime insets and platform glyph rasterization are variable inputs, not unknown fixed constants.
- Pinned companion contract: ../../binding-contract.md for reference/proposal directories; sha256:5717e4ab6dd4f2458c686565fb81c725bcf1a7d1197ebde3e167542716f48a68. Exact contract bytes MUST match this revision before consumption.
- Pinned interaction/copy notes: sha256:2b4c8a42cb01a0148ef4e4ee6a09f158b60357ac3bb045b28ecd50b47e1ca5d4; pinned owner adjustments: sha256:f25dd143c5859437d4602fccc70a23036f3416895d852d362d4a72158827a2b4; approved spec: sha256:e012f5a7d2edadc8bc1e2fa2ce03aeea56bc0c947dc02bfc2a3f166150e2c7d0. These dependencies MUST retain their exact bytes or require renewed binding approval.
