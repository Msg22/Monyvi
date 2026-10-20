---
description: apply mockups guidelines
---

# 🎯 Implementation Requirement — Pixel-Perfect UI

Use the up-to-date `.agent/workflows/applying-mockups.md`, `AGENTS.md`,
`docs/design/design-system.md` and owner-approved business decisions. Absolute
fidelity applies to the **approved binding context**; an approved scoped
responsive/state amendment may use intrinsic content fit, 44/48 dp targets,
readable scaled labels and natural wrapping without changing frozen binding
bytes. New/changed feedback uses sticky dismissible page notices below headers
outside scrolling, or the top of an active modal—not new toasts.

## Approved Binding Gate

Before consuming an approved mockup, load its matching binding sidecar and run
`node scripts/verify-mockup-binding.js <path/to/mockup.binding.md>`. Require
exit status zero. A filename is not authority: current image bytes, exact
UTF-8/LF Binding Facts bytes, both approved revisions, and evidence for the
approved combined `Binding approval revision` must all verify. Follow
`.agent/workflows/applying-mockups.md` for the complete gate.

## Requirements

- Implement the UI **exactly as defined in the approved mockups**.
- The final result must be **pixel-perfect**, matching the mockups in:
  - Layout and spacing
  - Typography (sizes, weights, alignment)
  - Colors and theming
  - Component structure and hierarchy
  - Interactions and visual states

---

## 🚫 Constraints

- **Do not deviate** from the approved binding at its declared context, except
  where the owner explicitly approved a scoped subsequent treatment.
- Do not introduce:
  - Alternative layouts
  - Different spacing or alignment
  - New styles, colors, or components
  - Assumptions or “improvements”

- If something is unclear, **do not guess**.

---

## ❓ Clarifications & Blockers

- If you encounter:
  - Missing details
  - Conflicting designs
  - Technical limitations

→ **Pause implementation and ask for clarification before proceeding**.

---

## ✅ Success Criteria

- The implemented UI should visually match the mockups **exactly**, with no
  noticeable differences.
- Any deviation must be **explicitly approved** before being implemented.
