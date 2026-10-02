# Mockup binding: partial-save-batch-warning

<!-- prettier-ignore-start -->
- Approved reference image: partial-save-batch-warning.html
- Approved reference image revision: sha256:e7cd06a25e0214fae9f8857eeda8f96355f1f40b50904d12d7d7c7487f621d4d
- Binding metadata approval: APPROVED
- Binding metadata revision: sha256:f027cb76195d8f2f65faff74ccbefe98daf61d71a88d36b580a4bd25b9175a2c
- Approved binding metadata revision: sha256:f027cb76195d8f2f65faff74ccbefe98daf61d71a88d36b580a4bd25b9175a2c
- Binding approval revision: sha256:a68ebc9d3319d55e8da7a69be607246306ff0c60dbe371e1ada58a58904be41c
- Approved binding approval revision: sha256:a68ebc9d3319d55e8da7a69be607246306ff0c60dbe371e1ada58a58904be41c
- Binding metadata approval evidence/reference: Mohamed's explicit approval on 2026-09-23 of the lead-created partial-save batch warning mockup; approved binding revision sha256:a68ebc9d3319d55e8da7a69be607246306ff0c60dbe371e1ada58a58904be41c.
<!-- prettier-ignore-end -->
- Legacy metadata migration: no

This sidecar records Mohamed's explicit approval of the visual reference and
binding facts. Its revision fields must remain synchronized and
`node scripts/verify-mockup-binding.js` must pass.

## Binding Facts

- Binding product surface: pre-save warning for partial batch save in SMS and
  voice transaction review.
- Declared comparison context: approved English light ordinary-phone, English
  compact-phone, Arabic RTL dark, and Arabic RTL enlarged-text frames contained
  in the reference HTML.
- Presentation-only framing: frame labels, browser canvas, explanatory header,
  and approval badge document the reference and are excluded from the product
  UI.
- Spacing facts: preserve the displayed modal rhythm, summary-row separation,
  copy grouping, and safe action spacing using existing Monyvi spacing tokens.
- Sizing facts: use the established modal width constraint, minimum 44 by 44
  logical-pixel actions, and stacked actions for compact or enlarged-text
  layouts.
- Color/theme facts: use Monyvi slate surfaces, Nile green for ready state and
  primary action, and gold for warning and skipped state in both themes.
- Typography facts: use the existing Monyvi type scale and weights while
  preserving the displayed title, summary, supporting-copy, and action
  hierarchy.
- State facts: the approved reference shows two valid selected transactions and
  one invalid selected transaction before any persistence begins.
- Product rule: valid selected rows may save; invalid selected rows are skipped
  and produce no account-balance effect.
- Primary action: save the valid selected rows only.
- Secondary action: return to review with no rows saved.
- Visual hierarchy: warning icon, title, ready/skipped summary, explanatory
  balance-protection copy, then two actions.
- Normal width: actions share one row; compact and enlarged-text variants stack
  actions vertically.
- Theme: Monyvi slate surfaces, Nile green for ready state and primary action,
  gold for warning/skipped state.
- Safe area: backdrop covers full route and preserves bottom inset below the
  modal.
- Interaction behavior: Review transactions dismisses the warning without
  saving; Save 2 valid persists only valid selected rows and skips invalid rows.
- Transition behavior: reuse the established confirmation-modal transition and
  reduced-motion behavior; no distinct transition is introduced by this design.
- Responsive variants: normal-width actions share a row; compact-phone and
  enlarged-text variants stack actions while preserving reading and focus order.
- Dark-mode variants: preserve semantic hierarchy and accessible contrast using
  the displayed dark Arabic frame as the approved reference.
- RTL/Arabic variants: use the approved natural Arabic copy, logical RTL flow,
  mirrored action order, and isolated numeric content where applicable.
- Enlarged-text variants: at 200% text, content wraps without clipping and
  actions stack vertically while remaining reachable.
- RTL: Arabic content and action order mirror directionally; dual forms omit
  redundant numeral interpolation.
- Accessibility: title receives initial focus; summary reads as one coherent
  statement; primary and secondary actions have explicit names; color is never
  the sole state indicator.
- Motion: reuse the established confirmation-modal fade and respect
  reduced-motion settings.
- Fidelity-affecting unknowns: exact device font metrics, tablet/landscape modal
  width, and native screen-reader focus timing require implementation QA after
  approval.
