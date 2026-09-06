---
description: Instructions for implementing mockups
---

# Mobile UI Mockup Generation Prompt (Stitch MCP)

## Product Context

- App name: **Monyvi**
- Platform: **Mobile only** (iOS & Android)
- Domain: **Fintech** (expense tracking + wealth tracking)
- Goal: Clear, trustworthy, calm, and efficient UI that supports frequent daily
  use.

---

## Purpose

Generate **high-fidelity mobile UI mockups** to be used as visual references for
product, UX, and frontend implementation.

---

## Task

Design **4 high-fidelity mobile UI mockups**, each with a **distinct visual
style and layout approach**, for the requested screen (e.g. form, list,
dashboard, modal, or mixed layout).

The screen type will be specified when invoking this workflow.

---

## 1. Data & Schema Constraints (Mandatory)

- Any data-driven UI must **strictly match the existing database schema**.
- Refer to:
  - `@schema.ts` **or**
  - `@supabase-types.ts`
- **Do NOT invent, rename, remove, or infer fields, properties, or data
  relationships**.
- Labels, data types, and required/optional states must reflect the schema
  exactly.

---

## 2. Design System & Colors (Mandatory)

- Use **only** the colors defined in `@colors.ts`.
- Do **not** introduce new colors or shades.
- Use gradients when the design system or an approved design direction uses
  them. Do not invent an unapproved gradient, and do not remove an approved
  gradient merely because it is a gradient.
- Apply colors consistently for:
  - Primary actions
  - Secondary actions
  - Backgrounds
  - Dividers and borders
  - Focus, active, and disabled states
  - Error, warning, and helper text

---

## 3. Mobile-First Layout Rules (Mandatory)

- All mockups must be designed for **mobile screens only**.
- Assume:
  - Single-column layouts
  - Thumb-friendly interactions
  - Safe-area awareness (top & bottom)
- Avoid desktop patterns such as:
  - Sidebars
  - Multi-column grids
  - Hover-based interactions

---

## 4. Screen-Type Conditional Guidelines

### 4.1 If the Screen Includes a Form

- Keep the form:
  - Simple
  - Fast to complete
  - Non-overwhelming
- Use:
  - Logical grouping of fields
  - Clear labels and helper text
  - Minimal required inputs
- Avoid unnecessary steps, decorative elements, or visual noise.

---

### 4.2 If the Screen Includes a List

- Clearly define:
  - List item structure
  - Primary vs secondary information
- Ensure:
  - Strong visual hierarchy
  - Easy scannability
  - Clear tap targets
- If applicable, describe:
  - Empty states
  - Loading states
  - Filters or sorting controls
  - Inline actions (if any)

---

### 4.3 If the Screen Includes a Dashboard

- Focus on:
  - At-a-glance clarity
  - Financial confidence and trust
- Clearly describe:
  - Metrics and KPIs
  - Charts or visual indicators
  - Information grouping and priority
- Avoid clutter and excessive data density.

---

### 4.4 If the Screen Includes a Modal, Sheet, or Overlay

- Specify:
  - Entry and exit behavior
  - Size and position (bottom sheet, full screen, centered modal)
- Ensure:
  - Clear primary action
  - Obvious dismissal behavior
  - No hidden or ambiguous interactions

---

## 5. Mockup Variations

- Create **4 distinct mockups**, each with a different design direction.
- Examples (not limitations):
  - Minimal and calm
  - Card-based
  - Data-dense but structured
  - Soft and friendly fintech style
- All mockups must follow the same:
  - Schema
  - Color system
  - Mobile constraints

---

## 6. Stitch MCP Description Requirements (Critical)

Produce a **pixel-precise visual description** intended for the Stitch MCP tool.

- Describe **every visible UI element**, including:
  - Screen structure and layout
  - Spacing, padding, and margins
  - Font sizes, weights, and hierarchy
  - Button sizes, shapes, and positions
  - Input, list item, and card styling
  - Icons (if any), including size and placement
  - Dividers, separators, and background layers

---

## 7. Zero Guessing Rule (Very Important)

- Do **not** leave any visual or behavioral detail unspecified.
- Do **not** allow Stitch MCP to:
  - Invent UI elements
  - Add decorative visuals
  - Infer missing content or interactions
- If an element exists, it must be explicitly described.
- If an element should not exist, ensure it is excluded by omission.

---

## 8. Output Structure

- Separate the output clearly into:
  - Mockup 1
  - Mockup 2
  - Mockup 3
  - Mockup 4
- Each mockup description must be:
  - Self-contained
  - Complete
  - Ready to be sent directly to Stitch MCP without modification

---

## 9. Mockup Storage & Traceability (MANDATORY)

After mockups are **reviewed and approved by the user**, the agent MUST:

### 9.1 Locate the Spec Folder

- Identify the current branch name
- Locate the corresponding folder under `specs/`
- The folder name MUST **exactly match the branch name**

**Example:**

- Branch: `017-dashboard-ui-polish`
- Folder: `specs/017-dashboard-ui-polish`

---

### 9.2 Create Mockups Folder

- Inside the spec folder, create a directory:
  - `mockups/`

**Final structure:**

specs/017-dashboard-ui-polish/mockups/

---

### 9.3 Store Approved Mockups as Images

- Save each approved mockup as an **image file** inside the `mockups/` folder
- Each mockup MUST be stored as a separate file

**Naming convention (MANDATORY):** feature-name.png/mockup-number.png

- If variants or iterations are needed, use:

mockup-1-v2.png mockup-2-v2.png

---

### 9.4 Image Requirements

- Images must:
  - Accurately reflect the **approved design**
  - Match the **exact layout and styling**
  - Be suitable as a **pixel-perfect reference for implementation**
- Do NOT store:
  - Drafts
  - Rejected mockups
  - Partial designs

---

### 9.5 Persist Approved Binding Context

The approved image and its binding metadata together form the implementation
handoff required by the constitution. For every approved image, create a matching
sidecar named `<mockup-basename>.binding.md` in the same `mockups/` directory.

Each sidecar MUST record:

- the approved reference image filename;
- the binding product surface: route/screen, component, sheet, modal, or other
  scoped UI region;
- the declared comparison context: exact viewport dimensions when the reference
  binds a viewport, or exact component bounds/context when it binds a component;
- any presentation-only framing that is explicitly **non-binding**, including
  phone hardware, device frame, outer canvas, browser chrome, export padding, or
  background outside the UI surface;
- all known screen-specific **spacing** facts;
- all known **sizing** facts;
- all known **color/theme** facts;
- all known **typography** facts;
- all known **state** facts represented by the reference, including selected,
  loading, empty, error, disabled, or other visible state where applicable; and
- any scoped responsive, dark, RTL/Arabic, or enlarged-text variants already
  approved or explicitly required for validation.

For every required fact that is not known, write `UNKNOWN` rather than inferring
its value. Identify whether each unknown affects visual fidelity. A
fidelity-affecting unknown MUST be surfaced for clarification before
implementation starts; do not silently convert image pixels, export framing, or
assumptions into product rules.

Use the constitution's **Approved mockup binding** principle as the authority for
what is binding. Direct implementation workflows MUST consume this sidecar
rather than treating the entire exported image as product UI.

#### 9.5.1 Legacy Approved Mockup Metadata Migration

Approved references created before the binding-sidecar rule remain valid when
their approval can be evidenced. A missing sidecar on such a reference is a
metadata-migration requirement, not a reason to discard or replace the approved
mockup.

Before implementation of a legacy approved reference:

1. Verify that the image was actually approved using existing evidence such as
   the canonical spec/design handoff, recorded user approval, or the PR/review
   artifact that established the approved reference. Do not infer approval from
   filename or location alone.
2. Create the matching `<mockup-basename>.binding.md` sidecar in the same
   directory **before implementation**. Mark it as `Legacy metadata migration:
   yes` and list the exact evidence sources used.
3. Populate only binding facts supported by the approved reference, recorded
   approval/handoff, authoritative design/spec documentation, or design-system
   facts that applied to that approval. The constitution's default rule that
   presentation-only hardware/frame/canvas/chrome/export padding is non-binding
   applies unless the approved handoff explicitly says otherwise.
4. Record every unresolved required binding fact as `UNKNOWN`, including the
   viewport/component context, spacing, sizing, color/theme, typography, or
   visible state when it is not evidenced. Classify each unknown as
   fidelity-affecting or non-fidelity-affecting.
5. If any fidelity-affecting unknown remains, pause and obtain clarification
   before UI implementation, then update the sidecar with the approved answer.
   If none remains, the evidence-based migrated sidecar is the valid handoff for
   implementation and review.
6. Do not alter the approved legacy image to make metadata fit, manufacture
   measurements from uncalibrated export framing, or create speculative sidecars
   outside the currently authorized task.

---

### 9.6 Purpose

- The approved image plus its binding sidecar become the **single source of truth
  for UI implementation**
- They MUST be used by:
  - Developers → for pixel-perfect implementation at the declared binding context
  - Review agents → for visual validation against code and rendered evidence

---

### 🚨 Rules

- Do NOT overwrite existing mockups unless explicitly instructed
- Do NOT store unapproved designs
- Ensure stored images match **exactly what was approved**
- Maintain consistent naming and structure across all features

---

If there are any concerns or questions, ask before starting the implementation.
