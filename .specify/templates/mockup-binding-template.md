# Mockup binding: <mockup-basename>

- Approved reference image: <mockup-basename>.png
- Approved reference image revision: PENDING
- Binding metadata approval: PENDING
- Binding metadata revision: PENDING
- Approved binding metadata revision: PENDING
- Binding metadata approval evidence/reference: PENDING
- Legacy metadata migration: no

`Approved reference image revision` MUST be `sha256:<64 lowercase hex>` computed from the exact approved image bytes. The sidecar is authoritative only when `node scripts/verify-mockup-binding.js <this-sidecar>` passes. If the image bytes change for any reason, approval is invalid even when the filename is unchanged; reset all approval fields to `PENDING`, recompute the image revision and binding-facts revision, and obtain renewed explicit approval for the image plus binding metadata together.

## Binding Facts

- Binding product surface: UNKNOWN
- Declared comparison context: UNKNOWN
- Presentation-only framing: UNKNOWN
- Spacing facts: UNKNOWN
- Sizing facts: UNKNOWN
- Color/theme facts: UNKNOWN
- Typography facts: UNKNOWN
- State facts: UNKNOWN
- Interaction behavior: UNKNOWN
- Transition behavior: UNKNOWN
- Responsive variants: UNKNOWN
- Dark-mode variants: UNKNOWN
- RTL/Arabic variants: UNKNOWN
- Enlarged-text variants: UNKNOWN
- Fidelity-affecting unknowns: UNKNOWN
