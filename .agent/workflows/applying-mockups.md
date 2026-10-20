---
description: apply mockups guidelines
---

# UI implementation against approved designs

## Prospective interactive design (default)

For meaningful new UI, open the **owner-approved runnable design** and its short
README under the feature's `mockups/`; open the documented working browser
entry, **not** an isolated source fragment. Confirm the reviewed version and
applicable scenario controls. The running design **itself** is the visual,
layout, responsive and interaction reference. No new binding sidecar, duplicate
textual measurements, Binding Facts, hash tuple, mandatory verifier, or separate
README/metadata approval is needed. See
`docs/design/interactive-design-workflow.md`.

Implement the UI in **real React Native/Expo**, reusing existing components,
NativeWind tokens and platform accessibility semantics rather than browser
DOM/CSS. Exercise relevant width/container fit, long localized names, font
scaling, light/dark, EN/AR RTL and interactive states in the design; make
necessary native-only adjustments from its brief README and actual platform
constraints. Browser previews do not prove native insets, keyboard, hit targets
or rendered fidelity.

## Historical image binding (original governed surfaces only)

When implementing a historically approved **image** reference, consume its
original approved `<mockup-basename>.binding.md` and follow
`.agent/workflows/mockup-implementation.md`'s legacy migration rules where
required. Run the unchanged `scripts/verify-mockup-binding.js` for those
historical sidecars before using their Binding Facts. Preserve the exact
historical hashes, approval evidence and frozen image/sidecar bytes. A missing
or invalid historical binding remains a blocker for **that historical governed
surface**, not for a new interactive HTML design.

For both reference types, compare only the actual approved product UI; preview
canvas, browser chrome, decorative phone frames and export padding are not app
UI unless expressly part of the reviewed design. Do not invent unapproved
product/financial behavior or deviate materially without asking for approval of
the **new changed design revision once**. If owner defers
device/render/accessibility checks, record **NOT RUN**, owner manual steps and
separate functional, native visual and accessibility status.

## Requirements

- Implement the binding UI **exactly as defined by the approved runnable design
  (or original historical image handoff)**.
- The final result must be **pixel-perfect** at the reviewed comparison context,
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
- At other supported contexts, preserve the approved hierarchy and semantics.
  Use actual component/container space, readable shrinkable labels and stable
  44/48 dp action hit areas. Modest typography, icon, control and spacing token
  adaptations can precede stacking; never disable font scaling or hide financial
  identity. Shared viewport breakpoints are hints, not forced layout switches.
  Follow the responsive rule in `AGENTS.md`, with existing checks and owner
  visual review rather than cosmetic viewport/className test matrices.
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
  - Missing or invalid **historical image** binding metadata on its original
    surface
  - Missing essential native-only behavior or product decisions
  - Conflicting designs
  - Technical limitations

→ **Pause implementation and ask for clarification before proceeding**.

---

## 📸 Completion Evidence (Mandatory)

Before declaring visual completion for the governed UI:

- Capture a rendered **native app** baseline side-by-side or overlay comparison
  against the **rendered** approved interactive reference (or historical image)
  at its reviewed viewport/component context. Browser-only or source-level
  comparisons are not native visual evidence.
- Capture rendered evidence for every responsive context, theme state,
  RTL/Arabic state, and enlarged-text variant that is in scope under the
  approved runnable design/README, historical binding sidecar, or feature
  requirements. This includes compact/ordinary phone, tablet, or orientation
  variants when those contexts are in scope.
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

- The implemented product UI should visually match the approved design **exactly
  at its declared context**, with no noticeable differences.
- Presentation-only framing excluded by the design/README or legacy binding must
  remain absent from product UI.
- The mandatory baseline and all scoped visual-variant evidence are complete,
  with functional and visual fidelity statuses reported separately.
- Any required accessibility evidence is complete and recorded separately from
  screenshot evidence.
- Any material redesign must receive **one** approval of the changed design
  revision before being implemented.
