# Mockup binding: <mockup-basename>

- Approved reference image: <mockup-basename>.png
- Approved reference image revision: PENDING
- Binding metadata approval: PENDING
- Binding metadata revision: PENDING
- Approved binding metadata revision: PENDING
- Binding approval revision: PENDING
- Approved binding approval revision: PENDING
- Binding metadata approval evidence/reference: PENDING
- Legacy metadata migration: no

`Approved reference image revision` MUST be `sha256:<64 lowercase hex>` computed from the exact approved image bytes. `Binding metadata revision` MUST be the SHA-256 of the exact UTF-8/LF bytes beneath `## Binding Facts` through the next level-two heading or EOF. `Binding approval revision` MUST be SHA-256 over the exact UTF-8/LF bytes below, including the final LF after the second line:

```text
approved-reference-image-revision=<Approved reference image revision>
binding-metadata-revision=<Binding metadata revision>
```

The sidecar is authoritative only when `node scripts/verify-mockup-binding.js <this-sidecar>` passes, `Binding metadata approval: APPROVED`, both approved revision fields equal their current revisions, and the approval evidence/reference identifies `Approved binding approval revision`. If either the image bytes or any `## Binding Facts` byte changes, approval is invalid even when the filename is unchanged; reset approval status, both approved revision fields, and approval evidence to `PENDING`, recompute the affected image/metadata revision plus `Binding approval revision`, and obtain renewed explicit approval for the combined image-and-metadata authority tuple.

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
