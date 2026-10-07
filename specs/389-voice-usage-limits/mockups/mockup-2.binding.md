# Mockup binding: mockup-2

<!-- prettier-ignore -->
- Approved reference image: mockup-2.png
- Approved reference image revision: sha256:d5998e820d8153a43080cc823c188f4d5b659a563147726520a0e34861f61e6e
- Binding metadata approval: PENDING
- Binding metadata revision: sha256:40c5591ca8d56c4a3301fa3dac96840cd7feb85a15739684db3fb69c10278cb4
- Approved binding metadata revision: PENDING
- Binding approval revision: sha256:b6e3360fc5e56773464d18dd3b9cd725c6c5027fe1974737c8b0e4ad20614e40
- Approved binding approval revision: PENDING
- Binding metadata approval evidence/reference: PENDING
- Legacy metadata migration: yes

`Approved reference image revision` MUST be `sha256:<64 lowercase hex>` computed
from the exact approved image bytes. `Binding metadata revision` MUST be the
SHA-256 of the exact UTF-8/LF bytes beneath `## Binding Facts` through the next
level-two heading or EOF. `Binding approval revision` MUST be SHA-256 over the
exact UTF-8/LF bytes below, including the final LF after the second line:

```text
approved-reference-image-revision=<Approved reference image revision>
binding-metadata-revision=<Binding metadata revision>
```

The sidecar is authoritative only when
`node scripts/verify-mockup-binding.js <this-sidecar>` passes,
`Binding metadata approval: APPROVED`, both approved revision fields equal their
current revisions, and the approval evidence/reference identifies
`Approved binding approval revision`. If either the image bytes or any
`## Binding Facts` byte changes, approval is invalid even when the filename is
unchanged; reset approval status, both approved revision fields, and approval
evidence to `PENDING`, recompute the affected image/metadata revision plus
`Binding approval revision`, and obtain renewed explicit approval for the
combined image-and-metadata authority tuple.

## Binding Facts

- Binding product surface: Unified Add Transaction page, MANUAL mode selected;
  current form behavior is governed by spec FR-030 and the UI contract, not
  invented fields from the illustration.
- Declared comparison context: UNKNOWN: approved raster is 941 x 1672 pixels
  including a phone frame; logical UI viewport/dp, density, UI crop and
  safe-area metrics were not supplied and cannot be derived as authoritative
  facts.
- Presentation-only framing: Phone hardware/frame, notch, status-bar
  illustration, outer white canvas and export padding are non-binding
  presentation under the constitution; route-level bottom navigation depicted
  inside the UI is UNKNOWN pending scope confirmation.
- Spacing facts: UNKNOWN: exact UI spacing/token mapping was not supplied; card
  hierarchy and relative composition are visible in the unchanged reference.
- Sizing facts: UNKNOWN: exact control/card/icon dp sizes and baseline viewport
  were not supplied; raster pixel measurements are not a logical viewport.
- Color/theme facts: Reference visibly shows a light surface, green accents and
  pale neutral card/background areas; exact palette/gradient token mapping is
  UNKNOWN pending metadata approval.
- Typography facts: Arabic labels and emphasized headings are visible; exact
  font family, sizes, weights and line heights are UNKNOWN pending metadata
  approval.
- State facts: Arabic/light, Manual selected, numeric remaining example 3 of 5
  and illustrative form with
  amount/type/category/account/merchant/notes/date/save; binding extent of
  Manual field composition versus existing form is UNKNOWN and must not change
  schema or remove existing behavior.
- Interaction behavior: Per approved spec/UI contract: FAB opens Manual;
  mic/onboarding/review Retry open Voice; same route supports both modes;
  existing Manual behavior remains; Voice uses current Gemini/review flow;
  hidden mode content is inaccessible; the image alone supplies no additional
  interaction rules.
- Transition behavior: Per approved plan/UI contract: Manual remains mounted
  across safe switches; switching is disabled during
  recording/paused/finalizing/analyzing; exhausted/burst/unavailable Voice
  allows Manual. Exact animations/focus transitions are UNKNOWN.
- Responsive variants: Spec/constitution require compact and ordinary phone,
  tablet and landscape while preserving composition; exact baseline logical
  viewport and approved reflow/token mapping are UNKNOWN.
- Dark-mode variants: Dark mode is required by plan/constitution but no dark
  reference is supplied; exact token mapping is UNKNOWN pending approval, with
  no new mockup authorized.
- RTL/Arabic variants: This reference is Arabic/RTL. English/LTR is required by
  approved spec, but exact mirrored tab/navigation arrangement and localized
  binding copy are UNKNOWN pending metadata approval.
- Enlarged-text variants: Enlarged text and accessibility are required by
  plan/constitution; exact scaling/breakpoint/reflow and focus treatment are
  UNKNOWN pending metadata approval.
- Fidelity-affecting unknowns: Logical baseline viewport/UI crop/safe-area
  context; exact styling tokens/spacing/sizes/typography; bottom navigation
  route binding; Manual illustration scope; unsupplied
  active/error/limit/dark/LTR/enlarged-text states. Original reset text says
  same time tomorrow, superseded by the approved local-midnight spec; final
  EN/AR copy must accurately reflect next-day reset without changing image
  bytes.

## Provenance and approval boundary

- Original filename: `image-gen-2(1).png`
- Original creation timestamp: `2026-09-27T11:49:58Z`
- Original uploaded file ID: `file_0000000029788210a0a90097ab3c1504`
- Original persistent file ID: `libfile_46adb90a210881919a77718e9e37fe1f`
- Original/copy byte count: `1179439`
- Original/copy SHA-256:
  `d5998e820d8153a43080cc823c188f4d5b659a563147726520a0e34861f61e6e`
- Image approval context: supplied 2026-09-27 conversation approval of the
  Manual/Voice mockup, restated in spec clarification and current request to
  save that exact approved reference. This is image approval, not approval of
  this new metadata revision.
- Copy correction authority: spec clarification records choice A, local-midnight
  calendar-day reset. The earlier same-time-tomorrow raster wording is preserved
  unchanged for provenance and must not become implemented copy.
- Sidecar created from `.specify/templates/mockup-binding-template.md`; all
  approval fields remain PENDING. Do not consume these draft facts as
  authoritative until missing facts are resolved, the exact combined revision is
  explicitly approved and the verifier exits zero.
