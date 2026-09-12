---
description: apply mockups guidelines
---

# 🎯 Implementation Requirement — Pixel-Perfect UI

## Approved Binding Context

Before implementation, load the approved reference image and its matching
`<mockup-basename>.binding.md` sidecar produced by
`.agent/workflows/mockup-implementation.md`. The constitution's **Approved
mockup binding** principle is authoritative.

The sidecar MUST record `Binding metadata approval: APPROVED` together with the
explicit approval evidence/reference required by
`.agent/workflows/mockup-implementation.md`. Its current
`Binding metadata revision` and `Binding approval revision` MUST be valid; each
matching approved revision field MUST equal its current revision; and approval
evidence/reference MUST identify the approved combined
`Binding approval revision`. Before consuming any binding fact, run:

`node scripts/verify-mockup-binding.js <path/to/mockup.binding.md>`

The verifier MUST exit zero. A sidecar that fails any approval, image, metadata,
or combined-revision check is not authoritative and MUST NOT drive
implementation until explicitly renewed and approved.

If an approved reference predates the binding-sidecar rule and has no sidecar,
first follow the **Legacy Approved Mockup Metadata Migration** procedure in
`.agent/workflows/mockup-implementation.md`. Missing metadata alone does not
invalidate a previously approved legacy reference, but implementation MUST NOT
begin until the evidence-based sidecar exists **and its reconstructed binding
metadata has received explicit approval**. If migration leaves a
fidelity-affecting `UNKNOWN`, pause for clarification before implementation.

- Implement the **binding product UI surface** at the declared viewport or
  component context.
- Presentation-only phone hardware, device frame, outer canvas, browser chrome,
  export padding, and background outside the UI surface are **not product UI**
  unless the binding sidecar explicitly marks them as binding.
- Use the sidecar's known spacing, sizing, color/theme, typography, state,
  interaction, and transition facts as implementation facts.
- Do not infer product rules from export framing or unrecorded pixel
  measurements.
- If a non-legacy binding sidecar is missing, its binding context is ambiguous,
  its approval record is missing/invalid, or a fidelity-affecting required fact
  remains `UNKNOWN`, pause before implementation and obtain clarification.

## Requirements

- Implement the binding UI **exactly as defined by the approved mockup
  handoff**.
- The final result must be **pixel-perfect** at the declared binding context,
  matching the mockup in:
  - Layout and spacing
  - Typography (sizes, weights, alignment)
  - Colors and theming
  - Component structure and hierarchy
  - Interactions and visual states

---

## 🚫 Constraints

- **Do not deviate** from the binding UI surface at the declared reference
  context.
- Do not reproduce explicitly non-binding framing as application UI.
- At other supported contexts, preserve the approved composition, hierarchy,
  semantics, and material styling. Controlled reflow, including stacking or
  spacing changes, is allowed only when measured space or text scale requires it
  to keep content usable and readable. Follow the centralized responsive
  breakpoints and validation contract in `AGENTS.md`.
- Do not introduce at the declared reference context, or as an unrequired design
  change elsewhere:
  - Alternative layouts or reflow
  - Different spacing or alignment
  - New styles, colors, or components
  - Assumptions or “improvements”

- If something is unclear, **do not guess**.

---

## ❓ Clarifications & Blockers

- If you encounter:
  - Missing or unapproved binding metadata that cannot be resolved through the
    legacy migration/approval path
  - Missing details
  - Conflicting designs
  - Technical limitations

→ **Pause implementation and ask for clarification before proceeding**.

---

## 📸 Completion Evidence (Mandatory)

Before declaring visual completion for the governed UI:

- Capture a rendered baseline side-by-side or overlay comparison against the
  approved reference at its declared viewport/component context.
- Capture rendered evidence for every responsive context, theme state,
  RTL/Arabic state, and enlarged-text variant that is in scope under the binding
  sidecar or feature requirements. This includes compact/ordinary phone, tablet,
  or orientation variants when those contexts are in scope.
- Record the evidence references and report **functional status** separately
  from **visual fidelity status**. A functionally complete change may still be
  visually incomplete.
- If the governed UI requires accessibility labels or semantics, collect the
  separate accessibility-tree, screen-reader, or automated accessibility proof
  required by the project review contract. A screenshot does not satisfy that
  non-visual evidence requirement.
- If any required rendered or accessibility evidence is missing, keep the
  corresponding status blocked/incomplete. Source inspection or an assertion of
  visual match is not completion evidence.

The constitution's **Visual completion evidence** principle and the project's
review workflows are authoritative for evidence and final acceptance.

---

## ✅ Success Criteria

- The implemented binding UI should visually match the approved mockup **exactly
  at its declared context**, with no noticeable differences.
- Presentation-only framing excluded by the binding handoff must remain absent
  from product UI.
- The mandatory baseline and all scoped visual-variant evidence are complete,
  with functional and visual fidelity statuses reported separately.
- Any required accessibility evidence is complete and recorded separately from
  screenshot evidence.
- Any deviation from the binding UI must be **explicitly approved** before being
  implemented.
