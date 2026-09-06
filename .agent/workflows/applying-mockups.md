---
description: apply mockups guidelines
---

# 🎯 Implementation Requirement — Pixel-Perfect UI

## Approved Binding Context

Before implementation, load the approved reference image and its matching
`<mockup-basename>.binding.md` sidecar produced by
`.agent/workflows/mockup-implementation.md`. The constitution's **Approved mockup
binding** principle is authoritative.

- Implement the **binding product UI surface** at the declared viewport or
  component context.
- Presentation-only phone hardware, device frame, outer canvas, browser chrome,
  export padding, and background outside the UI surface are **not product UI**
  unless the binding sidecar explicitly marks them as binding.
- Use the sidecar's known spacing, sizing, color/theme, typography, and state
  facts as implementation facts.
- Do not infer product rules from export framing or unrecorded pixel measurements.
- If the binding sidecar is missing, its binding context is ambiguous, or a
  fidelity-affecting required fact is marked `UNKNOWN`, pause before
  implementation and obtain clarification.

## Requirements

- Implement the binding UI **exactly as defined by the approved mockup handoff**.
- The final result must be **pixel-perfect** at the declared binding context,
  matching the mockup in:
  - Layout and spacing
  - Typography (sizes, weights, alignment)
  - Colors and theming
  - Component structure and hierarchy
  - Interactions and visual states

---

## 🚫 Constraints

- **Do not deviate** from the binding UI surface in any way.
- Do not reproduce explicitly non-binding framing as application UI.
- Do not introduce:
  - Alternative layouts
  - Different spacing or alignment
  - New styles, colors, or components
  - Assumptions or “improvements”

- If something is unclear, **do not guess**.

---

## ❓ Clarifications & Blockers

- If you encounter:
  - Missing binding metadata
  - Missing details
  - Conflicting designs
  - Technical limitations

→ **Pause implementation and ask for clarification before proceeding**.

---

## ✅ Success Criteria

- The implemented binding UI should visually match the approved mockup **exactly
  at its declared context**, with no noticeable differences.
- Presentation-only framing excluded by the binding handoff must remain absent
  from product UI.
- Any deviation from the binding UI must be **explicitly approved** before being
  implemented.
