# Approved Add Transaction references

These are unchanged original images from the approved 2026-09-27 product
conversation. No image was generated, edited, resized or cropped for this
feature handoff. The current owner request explicitly asks to save that approved
mockup in the spec.

| Saved image    | Original filename    | Content                                           | Original creation    | Bytes   | SHA-256                                                            |
| -------------- | -------------------- | ------------------------------------------------- | -------------------- | ------- | ------------------------------------------------------------------ |
| `mockup-1.png` | `image-gen-1(1).png` | Arabic/light, Voice selected, idle/3 of 5 example | 2026-09-27T11:49:55Z | 1044830 | `29530477e85472429473b36fc89766d17fd96a0f9715f03393d9391b91ff5d26` |
| `mockup-2.png` | `image-gen-2(1).png` | Arabic/light, Manual selected, illustrative form  | 2026-09-27T11:49:58Z | 1179439 | `d5998e820d8153a43080cc823c188f4d5b659a563147726520a0e34861f61e6e` |

Each corresponding `.binding.md` records original file identifiers/provenance
and computed image, metadata and combined fingerprints. Both **binding approvals
are APPROVED**, explicitly adopted by the owner on 2026-10-07: "Approve both
proposed bindings and copy". The sidecars record the exact combined revisions
and approval receipt; both verifiers exit zero.

Both raster exports are 941 x 1672 pixels including hardware framing. That is
**not** an evidenced logical app viewport/dp size. Phone hardware/frame,
illustrated status bar and outer canvas remain presentation-only; the pixels are
preserved solely to retain the exact approved image.

The old raster copy says the limit resets tomorrow at the same time. The later
explicitly approved spec choice A supersedes that text: reset is local midnight,
and implementation copy must describe next-day reset accurately. Keep the image
unchanged; do not implement its superseded text.

The owner adopted the normalized reconstruction in both sidecars and
`../reconciliation.md`; no replacement image was generated. Historical
viewport/token facts cannot be recovered from the framed raster. The approved
context supplies explicit implementation values without claiming original
measurements.

The approval resolves the two previous binding gaps:

1. Logical baseline 390 x 844 dp with the sidecars' safe-area, token/geometry
   and state/EN-AR/dark/responsive adaptations. Runtime uses actual safe-area
   insets; raster pixels remain provenance only.
2. The pictured bottom navigation is illustrative. The existing standalone
   `/add-transaction` stack/back route remains the binding route context.

The existing Manual form semantics remain authoritative under FR-030: its
illustrative merchant field and expense/income-only image do not authorize a new
merchant schema or removal of transfer/currency/calculator/recurring/budget
behavior. The approved binding records this boundary.

Approval is recorded through the existing legacy migration procedure. Recheck
authority after any edit with:

```sh
node scripts/verify-mockup-binding.js specs/389-voice-usage-limits/mockups/mockup-1.binding.md
node scripts/verify-mockup-binding.js specs/389-voice-usage-limits/mockups/mockup-2.binding.md
```

A nonzero result is an implementation blocker. Binding approval is complete;
implementation and worker assignments still require finalized contract
reconciliation and the final analyze gate. Functional, rendered visual-fidelity
and accessibility evidence statuses remain separate in `../tasks.md`.
