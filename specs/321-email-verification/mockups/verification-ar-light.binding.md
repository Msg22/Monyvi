# Mockup binding: verification-ar-light

- Approved reference image: verification-ar-light.png
- Approved reference image revision: sha256:ae45a2ea9155140fb0b1b453f83960feaf9e6053d96ef15d880e49d1066227a0
- Binding metadata approval: PENDING
- Binding metadata revision: sha256:e98c1eaa617a03baf488333284d1204b3eb5c80a2ce9aba33b5c572bbdc3d10d
- Approved binding metadata revision: PENDING
- Binding approval revision: sha256:96db92c35236cc6e17ae2ac4ba4bedb6520239ce916029bf27be67f101b05046
- Approved binding approval revision: PENDING
- Binding metadata approval evidence/reference: PENDING
- Legacy metadata migration: no

`Approved reference image revision` is computed from the exact approved PNG bytes currently stored on `codex/issue321-email-verification`. `Binding metadata revision` fingerprints the exact UTF-8/LF bytes under `## Binding Facts`. `Binding approval revision` combines the image and metadata revisions per the repository template.

## Binding Facts

- Binding product surface: Monyvi mobile `/auth` verification-pending state, including the existing auth top bar, full-page verification content, back-to-sign-in action, and privacy/legal footer; the target is the screen composition, not a standalone card.
- Declared comparison context: Ordinary portrait-phone auth verification state. The approved PNG export is 484 × 989 pixels and is the normalization target for side-by-side/overlay evidence; export pixels are reference-image pixels, not React Native layout units.
- Presentation-only framing: Phone bezel/hardware shell, dynamic island/notch, OS status bar/time/signal/battery, outer canvas/background, export crop/padding, and any surrounding presentation frame are non-binding and MUST NOT be reproduced as app UI.
- Spacing facts: Ordinary composition uses 30 px app horizontal padding; verification content uses 20 px horizontal padding and 70 px bottom bias; mail-icon circle has 24 px bottom separation; support copy has 13 px top and 22 px bottom separation; email chip uses 4 px vertical and 8 px horizontal padding; resend action uses 20 px horizontal padding; footer uses 14 px top padding; back-link gap is 7 px; trust row gap is 7 px; legal row gap is 14 px.
- Sizing facts: Auth top bar minimum height 50 px; language control height 36 px, minimum width 80 px, radius 18 px; Monyvi wordmark width 114 px; verification icon circle 92 × 92 px; mail glyph 43 × 43 px; heading 27 px with 1.15 line height; support copy 14 px; email chip radius 7 px; resend action height 44 px and radius 13 px; back row height 42 px with 12 px label; shield 19 × 22 px; footer copy 11.5 px.
- Color/theme facts: Use Monyvi design-system equivalents of the approved mockup values. Light baseline uses phone/background #f8fafc, primary text #1e293b, secondary text #475569, email-chip surface #f1f5f9, Nile green accent/border #059669 with dark-green text/icon #065f46. Dark baseline uses background #0f172a, primary text #f8fafc, secondary text #cbd5e1, email-chip surface #172033, line #334155, and green accent #34d399. Implementation MUST use repository palette/tokens rather than new hardcoded JSX colors.
- Typography facts: English uses Inter with 400/600/700 weights as shown; Arabic uses Noto Sans Arabic with corresponding 400/600/700 weights. Verification heading is bold; supporting copy regular; email chip and resend action semibold; alignment is centered. Email address always remains LTR.
- State facts: Idle verification-pending state after signup or unverified sign-in. Visible elements are language switcher, Monyvi wordmark, circular mail icon, localized check-inbox heading, localized support sentence, separate email chip, outlined resend action, separate bottom back-to-sign-in action, trust statement, Privacy, and Terms. No rounded verification card is present. The approved image shows resend/back enabled, not the in-flight resend state.
- Interaction behavior: Resend requests a new signup-verification email for the pending email; while resend is in flight, resend and back actions remain disabled/busy using existing accessibility semantics and the localized resending label. Back returns to the sign-in form without authenticating. Language switch remains available. Privacy and Terms retain their existing auth-route navigation. The email chip is display-only.
- Transition behavior: No verification-specific motion is visually binding beyond the existing auth-screen transition behavior. Any retained entry/state transition must be restrained, must not change the approved resting composition, and must respect reduced-motion settings.
- Responsive variants: The ordinary portrait composition is the baseline. Compact phone, tablet, and landscape variants MUST preserve the same hierarchy and full-page/no-card treatment; controlled reflow or spacing reduction is allowed only when needed for fit/readability under the repository responsive rules.
- Dark-mode variants: `verification-en-dark.png` is the authoritative dark-theme reference for the verification composition. Arabic dark mode combines the approved dark material treatment with the approved RTL/Arabic structure; no alternate card/layout is introduced.
- RTL/Arabic variants: `verification-ar-light.png` is the authoritative RTL/Arabic reference. The top bar and directional arrow mirror for RTL; Arabic copy uses Noto Sans Arabic; the composition stays centered; the email address remains LTR; footer/legal content follows RTL reading order.
- Enlarged-text variants: No separate enlarged-text mockup was approved. Per the constitution, enlarged text may reflow/expand vertically as necessary to avoid clipping or overlap while preserving hierarchy, semantics, actions, full-page/no-card treatment, and readable email presentation.
- Fidelity-affecting unknowns: None. The unapproved hardware/export framing is explicitly non-binding; dark Arabic and enlarged-text behavior are governed by the approved theme/RTL references plus repository responsive/accessibility rules.
