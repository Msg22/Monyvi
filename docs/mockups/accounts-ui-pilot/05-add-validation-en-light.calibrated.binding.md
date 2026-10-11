# Mockup binding: 05-add-validation-en-light.calibrated

- Approved reference image: 05-add-validation-en-light.calibrated.png
- Approved reference image revision: sha256:49f631be514b64b29ffda3be4a17039aedd33b8af85b62d431ec3e5804541c85
- Binding metadata approval: APPROVED
- Binding metadata revision: sha256:058b14d914cbb4f265f77d6a3b91c3a1875f88914774de9f118fca9ddf649aab
- Approved binding metadata revision: sha256:058b14d914cbb4f265f77d6a3b91c3a1875f88914774de9f118fca9ddf649aab
- Binding approval revision: sha256:1b7701de245d38c604241e7770dab6e8639c02e968a576ddf88ffe0c762f6163
- Approved binding approval revision: sha256:1b7701de245d38c604241e7770dab6e8639c02e968a576ddf88ffe0c762f6163
- Binding metadata approval evidence/reference: Mohamed root-chat approval on 2026-10-11 after eight-image gallery/shared-state presentation; root thread 01a11c5a-ea30-70b0-a2d0-92991256a8b3; user message "approved"; package sha256:265cd15fefd32d9cece643179abbe4ed3843db82c74abe9c21b9dccc73dcf15e; combined revision sha256:1b7701de245d38c604241e7770dab6e8639c02e968a576ddf88ffe0c762f6163
- Legacy metadata migration: no

Approval must identify this exact combined revision; any image or Binding Facts byte change invalidates approval. Facts use UTF-8/LF; metadata hashes exact bytes beneath heading through EOF.

## Binding Facts

- Binding product surface: Accounts Add form including existing PageHeader, preview and field order; lower content continues vertically.
- Declared comparison context: 390×844 CSS pixels; device scale factor 1; reference font scale 1.0; Chromium HTML design reference, not a native app screenshot. Body anchored at x=0 for both directions.
- Presentation-only framing: Status row and gesture bar represent reference top/bottom inset of 24 CSS pixels; phone hardware and browser chrome excluded. No external canvas included.
- Spacing facts: Form horizontal padding16; fields margin-bottom16; label gap8 and horizontal4; inline message top6/horizontal8; header horizontal20/top10/bottom16 and margin-top8; preview horizontal20/vertical16/margin-bottom20. Compact header horizontal16. SMS header16; Default row vertical16/horizontal4. Source tokens retained.
- Sizing facts: Default control radius16/border1/padding16/min-height54 in HTML; native height remains content/font dependent. Label line-height16. Header navigation height40; Back target44 and arrow28. Preview radius30; Type cards56 tall/radius24/gap8 in horizontal scroller. Proposed shared CurrencyField flag width20 with SVG aspect3:2 (13.333333 high); current Add emoji uses text-xl20 inside w-8, Edit emoji uses text-lg18. Reference SVG glyph is a stand-in; platform emoji metrics are not calibrated. Locked controls propose default radius16/shared label; SMS radius16; switch48×28/thumb24. Sheet radius24/top content24 and bottom48 for reference inset24.
- Color/theme facts: Light background slate50 #F8FAFC; surface slate25 #FFFFFF; dark background slate900 #0F172A, surface slate800 #1E293B, border slate700 #334155; light border slate200 #E2E8F0. Label slate500/light and slate400/dark; required/error red500 #EF4444; advisory warning gold600 #D97706. Save nileGreen700/light, nileGreen400/dark. Existing blue800-to-slate800/slate950 preview gradient retained.
- Typography facts: Reference uses Arial sans-serif with browser Arabic fallback, Ionicons font from ionicons-reference.ttf. Values16 semibold; shared labels12 extra-bold uppercase/tracking .1em (RTL tracking0); message12 bold. Header24 bold/action16 bold; preview title16 extra-bold/balance18 extra-bold. Compact textual sizes multiplied1.5 as specified in reference-style.css. App platform font unchanged; native metrics require comparison.
- State facts: Empty required name and malformed 12..34 retain raw text with red inline messages; disabled Save shown.
- Interaction behavior: Static reference has no working native controls. Preserve Back/Save, focus-local raw drafts, signed Edit and unsigned Add validation, no input rounding; malformed abc12345 displayed verbatim. Add Type remains horizontally scrollable: partially visible Digital Wallet is intentional overflow; do not shrink labels or replace row with a grid. Currency chooser selection/cancel and conditional provider/SMS behavior unchanged. Edit locked attributes retain explanation, Default toggle unboxed, Delete continues below SMS. Sheet silent/tracked choices, Confirm, backdrop/Android Back cancellation; no new Cancel or drag dismissal.
- Transition behavior: Existing navigation and optional-section expansion/collapse retained. Balance change sheet opens after changed Edit balance; dismissal cancels commit. No animation timing proposed; native transition timing UNKNOWN and unchanged behavior must be verified.
- Responsive variants: 01–06 ordinary390×844; compact07 320×568 with font scale1.5; board08 1000×880. Central constants/ui.ts owns compact340, dense390, tablet600, dense-font1.35 thresholds. Horizontal Type overflow and vertical form scrolling retained. Tablet/landscape variants are NOT RENDERED in this package and must be checked before shipping.
- Dark-mode variants: This image is light; 04 supplies Arabic dark reference; native dark-mode comparison NOT RUN.
- RTL/Arabic variants: 03/04 supply Arabic RTL counterparts; mixed currency and numeric tokens keep coherent LTR islands. Native bidi/caret/IME NOT RUN.
- Enlarged-text variants: 07 supplies enlarged-text compact reference at1.5. Native text scale/TalkBack NOT RUN.
- Fidelity-affecting unknowns: Native platform/Arabic fallback font metrics, device density/insets, keyboard/caret/bidi, transitions and screen-reader announcements remain UNKNOWN. Balance sheet reproduces source white95% overlay; native BlurView intensity20 is not reproduced or claimed calibrated by HTML. HTML mapping is exact1 CSS pixel to1 PNG pixel, not proven1 CSS pixel to1 native dp. Reference SVG versus native emoji glyph metrics remain uncalibrated; proposed shared width20 aligns Add text-xl20 while Edit currently uses text-lg18. Locked geometry and message precedence are proposals requiring approval. UNKNOWNs block implementation fidelity claims; all35 QA scenarios NOT RUN.
