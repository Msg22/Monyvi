# Restore binding proposal

- Approved reference image: 18-undo-consequence-confirmation.png
- Approved reference image revision:
  sha256:f6962366e5d8b270282166188e0fb70cec29aeaa6ecd2d832eb851299ae61abb
- Binding metadata approval: APPROVED
- Binding metadata revision:
  sha256:63249a81857fd0d3cb3b6ce3079472d5a9ddd09ed059929fc6db1e7955a637c2
- Approved binding metadata revision:
  sha256:63249a81857fd0d3cb3b6ce3079472d5a9ddd09ed059929fc6db1e7955a637c2
- Binding approval revision:
  sha256:1d04e5f3e6e1a62cbf1487668c6fdef89e603f1ca732660444c8a4efa5d02da7
- Approved binding approval revision:
  sha256:1d04e5f3e6e1a62cbf1487668c6fdef89e603f1ca732660444c8a4efa5d02da7
- Binding metadata approval evidence/reference: Mohamed explicitly approved both
  image-and-binding pairs in this thread at 2026-10-10T22:18:50.413Z; combined
  revision
  sha256:1d04e5f3e6e1a62cbf1487668c6fdef89e603f1ca732660444c8a4efa5d02da7
- Legacy metadata migration: yes

## Binding Facts

- Binding product surface: Restore confirmation opened from Sold or No longer
  owned Details.
- Declared comparison context: Existing approved English light-mode
  ordinary-phone portrait composition. Implementation comparison uses a 390
  logical-pixel viewport; this is an explicit implementation proposal, not a
  measurement of the exported phone bezel.
- Presentation-only framing: Outer canvas, physical phone frame, dynamic island,
  OS status icons and home indicator are excluded. Apply native safe-area insets
  once.
- Spacing facts: Use shared Monyvi PageHeader and form rhythm: 16 logical-pixel
  horizontal content inset, 24 between field groups, 8 between label and
  control, 16 card padding and consequence-row gaps. Preserve image ordering;
  omit only the approved account and device-notice elements described below.
- Sizing facts: Controls and actions use shared TextField/Dropdown/button sizes
  and at least 48 logical-pixel touch targets. Cards use shared 16-pixel radius.
  Icons use existing shared icon components at 20/24 pixels, with 40-pixel
  consequence icon containers. Scroll content; keep actions reachable with
  bottom safe-area inset.
- Color/theme facts: Reuse Add Holding background and shared themed controls.
  Light background slate-25, dark background slate-900; primary text
  text-primary, secondary copy text-secondary. Nile green shared primary action
  and positive state; red negative financial results; neutral slate for
  zero/unknown. No provider/trust metadata.
- Typography facts: Shared PageHeader title, shared field labels and body text.
  Consequence heading 18 logical pixels semibold; body 16 with 24 line height.
  Money uses shared preferred/purchase-currency formatting as required by the
  spec. No unbounded decimal output.
- State facts: Show holding image, name, metal/karat/form and terminal status,
  restoration explanation, and What will change. Active status, removal of
  effective sale profit/loss or disposal treatment, and reversed History are the
  consequences. No account debit for an uncredited sale. Review checkbox
  required. No saved-on-device footer. Loading uses Skeleton; retryable failures
  retain form data and expose Retry. Numeric inputs comma-grouped with canonical
  decimal state. Required fields use shared red asterisk and accessible required
  semantics.
- Interaction behavior: Cancel/Back before submission changes no records. One
  submit per attempt; repeat tap cannot duplicate events. During commit disable
  submission and unsafe dismissal, announce pending state accessibly. Restore
  primary action stays disabled until review checkbox checked. Failure retains
  inputs and permits retry.
- Transition behavior: Follow existing Monyvi route/sheet transitions and
  reduced-motion setting. Successful action opens updated Details; Android Back
  returns My Metals without duplicated Details routes. Feedback uses existing
  toast only.
- Responsive variants: Preserve ordinary-phone row composition. At compact
  widths or enlarged text, wrap identity and consequences; stack only when
  shared responsive helpers show insufficient space. Tablet form uses shared
  maximum-content width. Landscape content scrolls without hiding actions. No
  component-specific width breakpoints.
- Dark-mode variants: Use the existing Add/Edit Holding dark palette and
  readable selected labels; preserve semantic color and hierarchy. No dark-green
  text on dark cards.
- RTL/Arabic variants: Translate all visible copy with existing Metals
  terminology, including No longer owned / لم يعد لدي. Mirror directional arrows
  and logical spacing, preserve number readability; labels and controls use
  shared RTL behavior.
- Enlarged-text variants: Support 200 percent text, wrapping labels/consequences
  and increasing control/card height rather than clipping. Maintain touch
  targets and scrollable actions.
- Fidelity-affecting unknowns: None left unresolved in this proposal;
  shared-component token choices and the 390-pixel comparison context above are
  explicit proposed binding facts requiring approval.
