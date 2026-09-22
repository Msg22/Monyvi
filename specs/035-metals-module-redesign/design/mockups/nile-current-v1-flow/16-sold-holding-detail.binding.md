# Mockup binding: 16-sold-holding-detail

- Approved reference image: 16-sold-holding-detail.png
- Approved reference image revision: sha256:0b3334698a1715c711067340b7bbeb7c231ca2d947bef5703d08b66051f0b82d
- Binding metadata approval: APPROVED
- Binding metadata revision: sha256:94a0e238565802c21225b085ae0570c27e67cdd96f3880112dd04f236aefadd7
- Approved binding metadata revision: sha256:94a0e238565802c21225b085ae0570c27e67cdd96f3880112dd04f236aefadd7
- Binding approval revision: sha256:4a5cbe61a25ad3192209091be678fd8535e8e2f38557b69c29c1d934c6dc976c
- Approved binding approval revision: sha256:4a5cbe61a25ad3192209091be678fd8535e8e2f38557b69c29c1d934c6dc976c
- Binding metadata approval evidence/reference: Issue #283 approved-source declaration; `spec.md` normal-flow visual approval; this directory's README approved visual coverage; and Mohamed's 2026-09-19 legacy-binding reaffirmation for approved combined revision sha256:4a5cbe61a25ad3192209091be678fd8535e8e2f38557b69c29c1d934c6dc976c.
- Legacy metadata migration: yes

## Binding Facts

- Binding product surface: Sold holding detail state of the `/metals/[id]` stack route, excluding presentation-only device hardware and outer export framing.
- Declared comparison context: Approved normal-flow English, light-theme, ordinary-phone portrait state. Exact application viewport dimensions inside the exported 862x1825 PNG are UNKNOWN and fidelity-affecting because the export includes a device frame.
- Presentation-only framing: Phone hardware, device frame, outer canvas, export padding, status-bar hardware treatment, and home indicator are non-binding. Product UI begins at the safe-area-aware Monyvi stack surface with one PageHeader titled `Sold holding` and no duplicate in-content terminal title.
- Spacing facts: Preserve open editorial hierarchy, generous rhythm, existing Monyvi spacing language, and the documented 8 px rhythm. Exact screen-specific paddings, gaps, dividers, timeline offsets, and fact-row insets are UNKNOWN and fidelity-affecting.
- Sizing facts: Interactive targets are at least 44x44 logical pixels. Composition contains holding render/identity, terminal summary, Holding story, Financial facts, History, and descriptor-driven action region. Exact product-surface dimensions, render bounds, badge size, icon sizes, row heights, radii, and divider widths are UNKNOWN and fidelity-affecting.
- Color/theme facts: Light background uses existing Monyvi background and slate hierarchy. Nile green identifies Sold status, trustworthy net proceeds, profit, terminal timeline emphasis, and an eligible descriptor-driven Undo outline. Gold/Silver accents identify metal only. Exact token assignments beyond existing Monyvi palette are UNKNOWN and fidelity-affecting.
- Typography facts: Use existing Monyvi/Inter-style UI typography. Visible hierarchy is PageHeader title; holding name and Gold/Silver-purity-form identity; text Sold status; `Net proceeds`; exact amount; friendly `Profit from this sale` or `Loss from this sale`; section headings; labels and values. Exact screen-specific font sizes, line heights, tracking, and weights not fixed by existing components are UNKNOWN and fidelity-affecting.
- State facts: Normal trustworthy Sold state derived only from one current-user canonical effective reportable `metals.sell/v2` action/event identity with valid payload version. Show exact gross sale proceeds, optional fee only when present, exact net proceeds, friendly sale profit/loss when trustworthy, optional linked account credit only when supported, optional notes only when present, acquisition and Sold story, and terminal History. Missing or invalid optional evidence is omitted or uses approved friendly unavailable copy, never a dash as a financial result. Active-only Physical facts and current-rate substitutions are absent. Raw JSON, fixture IDs, source codes, action IDs, and reconciliation internals are absent.
- Interaction behavior: Back returns to prior route. Detail scrolls vertically. History continuation remains reachable when more events exist. Undo renders only when a later action descriptor exists; this binding does not authorize the Undo command or confirmation flow. No gesture-only action exists. Exact focus ring, pressed state, and expansion behavior are UNKNOWN and fidelity-affecting.
- Transition behavior: Route, scroll, history continuation, and descriptor action motion are not specified by the approved static reference; use established Monyvi navigation/list behavior and reduced-motion rules. Any distinct screen-specific transition is UNKNOWN and non-fidelity-affecting to the static baseline.
- Responsive variants: Compact phone, ordinary phone, tablet, portrait, and landscape must preserve hierarchy, complete facts, 44 px targets, and reachable content, using centralized responsive helpers. Exact compact/tablet/landscape reflow compositions are UNKNOWN and fidelity-affecting.
- Dark-mode variants: Equivalent hierarchy, status meaning, financial meaning, and accessible contrast are required. Exact dark token composition is UNKNOWN and fidelity-affecting because the canonical image proves light mode only.
- RTL/Arabic variants: Natural Arabic copy, logical RTL flow, mirrored directional navigation, stable chronology, and isolated LTR amounts/dates/currency codes are required. Exact Arabic wrapping and RTL composition are UNKNOWN and fidelity-affecting because the canonical image proves English/LTR only.
- Enlarged-text variants: Up to 200% text must preserve identity, status, exact amounts, friendly result, story, facts, History, and reachable descriptor actions without overlap or horizontal scrolling. Exact wrapping/reflow at enlarged text is UNKNOWN and fidelity-affecting.
- Fidelity-affecting unknowns: Exact app viewport inside framed export; screen-specific spacing, sizes, font metrics, token mapping, pressed/focus/expansion styling; compact/tablet/landscape composition; dark composition; Arabic/RTL wrapping; and 200% text reflow require explicit approval before governed UI implementation.

## Approval Package

- Legacy image approval evidence: `spec.md` clarification session dated 2026-08-29; `design/content-contract.md` approved late-flow proof status; this directory's README screen mapping, approval registry, and SHA-256 integrity table; plus issue #283's explicit approved normal-flow source list.
- Exact image bytes independently re-hashed during migration and match the recorded canonical SHA-256 above.
- The approval evidence above identifies the final `Approved binding approval revision`; adaptive states remain required verification targets, not a new design gate.
