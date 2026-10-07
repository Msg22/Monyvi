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
remain PENDING**. Image approval in the supplied conversation does not approve
newly reconstructed exact binding metadata.

Both raster exports are 941 x 1672 pixels including hardware framing. That is
**not** an evidenced logical app viewport/dp size. Phone hardware/frame,
illustrated status bar and outer canvas remain presentation-only; the pixels are
preserved solely to retain the exact approved image.

The old raster copy says the limit resets tomorrow at the same time. The later
explicitly approved spec choice A supersedes that text: reset is local midnight,
and implementation copy must describe next-day reset accurately. Keep the image
unchanged; do not implement its superseded text.

Two core binding points need owner confirmation before governed UI
implementation:

1. The logical baseline viewport and UI crop/safe-area context. The raster
   includes a phone frame; its pixel dimensions cannot establish app dp
   dimensions. After this is confirmed, the design owner can propose the exact
   token/geometry mapping and scoped state/EN-AR/dark/responsive adaptations for
   binding approval without generating another mockup.
2. Whether the bottom navigation depicted inside the image binds the standalone
   `/add-transaction` route or is illustrative navigation context. Do not
   silently add or remove route chrome.

The existing Manual form semantics remain authoritative under FR-030: its
illustrative merchant field and expense/income-only image do not authorize a new
merchant schema or removal of transfer/currency/calculator/recurring/budget
behavior. This boundary must be reflected in the final approved binding.

Resolve metadata through the existing legacy migration procedure, then
explicitly approve each immutable combined revision and run:

```sh
node scripts/verify-mockup-binding.js specs/389-voice-usage-limits/mockups/mockup-1.binding.md
node scripts/verify-mockup-binding.js specs/389-voice-usage-limits/mockups/mockup-2.binding.md
```

A nonzero result is a governed UI implementation blocker. Server/test/task work
may proceed within its separate accepted contracts and authorization.
Functional, rendered visual-fidelity and accessibility evidence statuses remain
separate in `../tasks.md`.
