---
description: apply mockups guidelines
---

# 🎯 Implementation Requirement — Pixel-Perfect UI

## Shared selection and keyboard standards (2026-10-20)

### Global form/selector contract (existing owner-approved standard)

Reuse shared `Dropdown`, `CurrencyPicker`, `TextField` and keyboard-aware
form/sheet infrastructure. An opened list's CURRENT selection must have a
**filled Nile-green background**, **WHITE legible selected text** in light and
dark modes and a **WHITE contrasting check/icon** (never green on green or a
tint-only signal); expose the true selected/checked accessibility state, with
EN/AR RTL. Verify the real selected source/render contract, not guessed default
or source-string matching.

All focused text fields, including last fields in modal/sheets, must stay
scroll-visible above Android/iOS keyboards on compact screens and enlarged
fonts. Measure the ACTUAL keyboard-adjusted viewport, header/footer space and
safe-area insets, scroll-to-focus, and preserve reachable submit/cancel; avoid
hardcoded offsets, clipping or double padding. Record native/manual
keyboard/font/RTL/dark evidence separately from source tests and mark unexecuted
native checks NOT RUN. Shared enforcement is ongoing; audit older bespoke
selectors/fields gradually, not as proof of full-app migration. This adds no
extra mockup, binding approval or tests-first gate.

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
