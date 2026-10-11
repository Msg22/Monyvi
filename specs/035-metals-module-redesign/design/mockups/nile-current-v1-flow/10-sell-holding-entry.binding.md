# Sell binding proposal

- Approved reference image: 10-sell-holding-entry.png
- Approved reference image revision:
  sha256:9a5f118b482c80351c59e5441cb66c945b0d9280deed53b1015e45288a75dc03
- Binding metadata approval: APPROVED
- Binding metadata revision:
  sha256:2de4ee8845d3a7180ac3b7c25eee15767838b8d7890fdb14cb952d023e19307b
- Approved binding metadata revision:
  sha256:2de4ee8845d3a7180ac3b7c25eee15767838b8d7890fdb14cb952d023e19307b
- Binding approval revision:
  sha256:d643936adcbc0d3f3655bbeaaf8ab11fcdd15040184584ed8b97d64068eb0669
- Approved binding approval revision:
  sha256:d643936adcbc0d3f3655bbeaaf8ab11fcdd15040184584ed8b97d64068eb0669
- Binding metadata approval evidence/reference: Mohamed explicitly approved both
  image-and-binding pairs in this thread at 2026-10-10T22:18:50.413Z; combined
  revision
  sha256:d643936adcbc0d3f3655bbeaaf8ab11fcdd15040184584ed8b97d64068eb0669
- Legacy metadata migration: yes

## Binding Facts

- Binding product surface: Whole-holding sale form opened from Active Holding
  Details.
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
- State facts: Whole holding only. Date, sale currency, gross amount required;
  fee and Notes optional. Fee shares sale currency. Show net proceeds and
  recorded sale profit/loss. No Receive money toggle, account picker, account
  credit consequence or account-income copy; issue #242 remains closed. Loading
  uses Skeleton; retryable failures retain form data and expose Retry. Numeric
  inputs comma-grouped with canonical decimal state. Required fields use shared
  red asterisk and accessible required semantics.
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
