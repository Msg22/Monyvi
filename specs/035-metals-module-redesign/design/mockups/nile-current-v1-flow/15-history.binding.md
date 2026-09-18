# Mockup binding: 15-history

- Approved reference image: 15-history.png
- Approved reference image revision: sha256:664d7a873a88712901aa094853a81756db3e027d847a9452af0143d10496927e
- Binding metadata approval: PENDING
- Binding metadata revision: sha256:6789783fa7e229949b4fcba5d168bf120beb27f6a9973dea60ce04b609b5f4d6
- Approved binding metadata revision: PENDING
- Binding approval revision: sha256:0b90c35aef918a33db2ff1dbc1a0c2f07f667837d2e3d800fe40ee068b3b2a5f
- Approved binding approval revision: PENDING
- Binding metadata approval evidence/reference: PENDING
- Legacy metadata migration: yes

## Binding Facts

- Binding product surface: Complete Metals History stack route at `/metals/history`, excluding presentation-only device hardware and outer export framing.
- Declared comparison context: Approved normal-flow English, light-theme, ordinary-phone portrait state. Exact application viewport dimensions inside the exported 853x1844 PNG are UNKNOWN and fidelity-affecting because the export includes a device frame.
- Presentation-only framing: Phone hardware, device frame, outer canvas, export padding, status-bar hardware treatment, and home indicator are non-binding. Product UI begins at the safe-area-aware Monyvi stack surface with one PageHeader-style back action.
- Spacing facts: Preserve open editorial hierarchy, generous rhythm, existing Monyvi spacing language, and the documented 8 px rhythm. Exact screen-specific paddings, gaps, card insets, and filter-to-list offsets are UNKNOWN and fidelity-affecting.
- Sizing facts: Interactive targets are at least 44x44 logical pixels. History uses one full-width segmented All/Sold/Disposed filter and vertically stacked tappable holding rows. Exact product-surface dimensions, row heights, image bounds, radii, border widths, and icon sizes are UNKNOWN and fidelity-affecting.
- Color/theme facts: Light background uses the existing Monyvi background and slate text hierarchy. Nile green marks the selected filter, calendar icon, and Sold status/proceeds; Disposed remains textually identified in slate. Gold/Silver accents identify metal only. Exact token assignments beyond the existing Monyvi palette are UNKNOWN and fidelity-affecting.
- Typography facts: Use existing Monyvi/Inter-style UI typography, with PageHeader title, explanatory subtitle, visible status, holding name, metal-purity-form identity, absolute date, and terminal result hierarchy. Exact screen-specific font sizes, line heights, tracking, and weights not fixed by existing components are UNKNOWN and fidelity-affecting.
- State facts: Normal populated state; All selected by default with visible counts; newest-first canonical effective reportable terminal events only. Sold rows show visible green Sold text, exact net proceeds, Gold/Silver, purity, physical form, and localized absolute date with calendar icon. Disposed rows show visible Disposed text, approved reason, `No sale proceeds`, identity, and absolute date. Hidden, ineffective, reversed, rejected, incomplete, malformed, duplicate, deleted, and foreign-user evidence is absent from normal History.
- Interaction behavior: Back returns to prior route. All, Sold, and Disposed controls expose selected state, accessible names, and result counts. Each row opens its holding detail. List scrolls vertically. No gesture-only action exists. Exact focus ring treatment and row pressed-state styling are UNKNOWN and fidelity-affecting.
- Transition behavior: Route, filter, row-press, and scroll motion are not specified by the approved static reference; use established Monyvi navigation/list behavior and reduced-motion rules. Any distinct screen-specific transition is UNKNOWN and non-fidelity-affecting to the static baseline.
- Responsive variants: Compact phone, ordinary phone, tablet, portrait, and landscape must preserve hierarchy, complete facts, 44 px targets, and reachable rows, using centralized responsive helpers. Exact compact/tablet/landscape reflow compositions are UNKNOWN and fidelity-affecting.
- Dark-mode variants: Equivalent hierarchy, status meaning, and accessible contrast are required. Exact dark token composition is UNKNOWN and fidelity-affecting because the canonical image proves light mode only.
- RTL/Arabic variants: Natural Arabic copy, logical RTL flow, mirrored directional navigation, stable newest-first chronology, and isolated LTR amounts/dates/currency codes are required. Exact Arabic wrapping and RTL composition are UNKNOWN and fidelity-affecting because the canonical image proves English/LTR only.
- Enlarged-text variants: Up to 200% text must preserve every terminal fact, status, date, proceeds/reason, filter meaning, and reachable row without overlap or horizontal scrolling. Exact wrapping/reflow at enlarged text is UNKNOWN and fidelity-affecting.
- Fidelity-affecting unknowns: Exact app viewport inside framed export; screen-specific spacing, sizes, font metrics, token mapping, pressed/focus styling; compact/tablet/landscape composition; dark composition; Arabic/RTL wrapping; and 200% text reflow require explicit approval before governed UI implementation.

## Approval Package

- Legacy image approval evidence: `spec.md` clarification sessions dated 2026-08-29 and 2026-08-30; `design/visual-directions.md` approved canonical visual handoff; `design/content-contract.md` approved late-flow proof status; and this directory's README approval registry and SHA-256 integrity table.
- Exact image bytes independently re-hashed during migration and match the recorded canonical SHA-256 above.
- Approval must identify the final `Approved binding approval revision` after all fidelity-affecting unknowns are resolved.
