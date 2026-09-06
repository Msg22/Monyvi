---
description:
  Compare mockups against implementation styles to identify visual gaps
---

# 🎨 Style Audit Workflow

This workflow produces a property-by-property comparison of approved mockup
designs against the actual implementation styles (Tailwind classes, inline
styles, colors, typography, spacing, borders, layout, icons). The output is a
structured **Style Audit Report** identifying all gaps and mismatches.

First determine whether the target diff changes visual UI governed by an
approved scoped mockup. If it does not, report the style audit and visual
fidelity as `N/A — no governed visual UI change`, skip the per-mockup steps
below, and do not block the change merely because the feature folder contains
mockups.

> [!CAUTION] **EVERY APPLICABLE SECTION IS MANDATORY. The agent MUST execute
> EVERY applicable step. If a governing mockup has no deviations, the agent MUST
> explicitly state "✅ No deviations found." Skipping or summarizing without
> property-level evidence is a CRITICAL FAILURE.**

---

## 1. Context Loading (MANDATORY)

Before analyzing ANY component, load the following:

### 1.1 Design System

- **READ** `apps/mobile/constants/colors.ts` — the raw palette and semantic
  theme
- **READ** `apps/mobile/tailwind.config.js` — all extended Tailwind tokens
- **READ** `.agent/rules/styling-rules.md` — Tailwind-first, dark mode, palette
  usage rules

### 1.2 Identify Mockups

- Locate the spec folder matching the branch name under `specs/`
- Follow mockup or handoff paths declared by the selected spec, plan, tasks, and
  README files
- **RECURSIVELY LIST** mockup assets in the selected feature folder, including
  nested paths such as `design/mockups/`
- **LOAD** every approved mockup image found through declared paths and the
  recursive search
- **LOAD** the matching binding sidecar for each approved mockup and verify it
  records `Binding metadata approval: APPROVED` plus the explicit approval
  evidence/reference required by `.agent/workflows/mockup-implementation.md`.
  A missing, pending, or materially changed/unapproved sidecar is not
  authoritative for property comparison; follow the legacy metadata
  migration/approval path when applicable before treating reconstructed metadata
  as binding.
- Record the declared **binding product surface** and UI viewport or component
  context for each approved mockup.
- Record every sidecar region marked **non-binding**, including phone hardware,
  device frame, outer canvas, browser chrome, export padding, and background
  outside the product UI surface.
- Create a numbered mapping: `Mockup N → <filename> → <short description>`

### 1.3 Identify Changed Components

- Get the list of changed files from the branch/PR
- Filter to only **UI files**: `.tsx` components, screen files, and any shared
  UI utilities
- **READ** every changed UI file in full
- Map only changed visual UI governed by each approved mockup. Unchanged or
  non-visual files do not activate the rendered-evidence gate.

---

## 2. Property-Level Comparison (MANDATORY — PER MOCKUP)

For **each mockup**, the agent MUST compare the following visual properties
against the corresponding component(s). Present findings in a markdown table.

**Scope rule:** perform every property comparison only inside the approved
sidecar's **binding product surface**. Presentation-only regions explicitly
marked non-binding are outside the audit target and MUST NOT produce a mismatch
because product code omits or differs from them. Crop/mentally mask those regions
before comparing properties; never turn phone hardware, device frame, outer
canvas, browser chrome, export padding, or outside background into product UI
requirements unless the explicitly approved sidecar marks that region binding.

### 2.1 Properties to Compare

For each UI element visible **inside the binding product surface** of the mockup,
check:

| Property Category   | Specific Checks                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Layout**          | Flex direction, alignment (center/start/end), position (absolute/relative), grid columns                                                                |
| **Spacing**         | Padding (`p-*`, `px-*`, `py-*`), margin (`m-*`, `mx-*`, `my-*`, `mb-*`), gap (`gap-*`)                                                                  |
| **Typography**      | Font size (`text-xs/sm/base/lg/xl/2xl`), font weight (`font-medium/semibold/bold`), text color (light + dark mode), uppercase/lowercase, letter-spacing |
| **Colors**          | Background color (light + dark), text color (light + dark), border color, icon color. Must reference palette tokens, NOT raw hex                        |
| **Borders**         | Border width, border color (light + dark), border radius (`rounded-*`)                                                                                  |
| **Icons**           | Icon name, library, size, color                                                                                                                         |
| **Shadows**         | Shadow color, offset, opacity, radius, elevation                                                                                                        |
| **Progress/Charts** | Component type (circular ring vs bar), dimensions, animation                                                                                            |
| **Interactive**     | Button styles, active opacity, press feedback                                                                                                           |
| **Dark Mode**       | Every color property MUST have both light and `dark:` variant checked                                                                                   |

### 2.2 Comparison Table Format

For each mockup, produce a table per UI section:

```markdown
### Mockup N: <Mockup Name>

**Component(s):** `<ComponentName.tsx>`

| Element   | Property   | Mockup Value      | Code Value            | Match? |
| --------- | ---------- | ----------------- | --------------------- | ------ |
| Hero card | Layout     | Centered vertical | Horizontal (flex-row) | ❌     |
| Hero card | Background | Dark gray         | `dark:bg-slate-800`   | ✅     |
| ...       | ...        | ...               | ...                   | ...    |
```

### 2.3 Match Indicators

- ✅ — Exact match or semantically equivalent
- ⚠️ — Minor difference (acceptable but noted)
- ❌ — Mismatch (requires fix)

---

## 3. Missing Elements Check (MANDATORY)

For each mockup, the agent MUST list missing/extra UI **only within the governed
binding product surface**:

- **Elements inside the binding product surface but NOT in code** (completely
  missing product UI)
- **Elements in the governed code surface but NOT in the binding product
  surface** (extra/unapproved product UI)

Do **not** report presentation-only phone hardware, device frame, outer canvas,
browser chrome, export padding, or any other sidecar-declared non-binding region
as missing product UI. Likewise, do not compare unrelated code outside the
mockup's governed binding surface merely because it is visible on the same route
or exists in the same component tree.

---

## 4. Report Generation (MANDATORY)

### 4.1 Output Format

Write the report to the artifact directory as `style-audit.md` with:

1. **Color Reference** — dark mode palette used in the project
2. **Per-Mockup Sections** — each with comparison tables and a verdict scoped to
   the approved binding product surface; list excluded non-binding framing for
   traceability
3. **Rendered Visual Evidence** — a side-by-side or overlay comparison at the
   declared binding UI context, plus every in-scope compact-phone,
   ordinary-phone, tablet, landscape, dark-mode, RTL/Arabic, and enlarged-text
   visual variant
4. **Accessibility Evidence** — accessibility-tree inspection, screen-reader
   validation, or automated accessibility results for labels and semantics;
   screenshots alone do not prove accessibility labels
5. **Functional Readiness** — `READY` or `NOT READY`, with test evidence
6. **Visual Fidelity** — `COMPLETE`, `INCOMPLETE`, or `N/A`, with the binding
   context and evidence paths or the reason it does not apply
7. **Summary Table** — all findings grouped by severity

Source and component inspection alone cannot prove visual completion. For a
changed visual UI governed by an approved mockup, missing baseline or in-scope
variant rendered evidence makes visual fidelity `INCOMPLETE`.

### 4.2 Severity Classification

| Severity    | Criteria                                                                                       |
| ----------- | ---------------------------------------------------------------------------------------------- |
| ❌ Critical | Structural layout mismatch, missing major UI section, wrong component type (e.g., bar vs ring) |
| ⚠️ Major    | Wrong field order, missing icons/badges, different text labels, wrong selection indicator      |
| 🟡 Minor    | Slightly different placeholder text, minor spacing, acceptable icon swap                       |

### 4.3 Summary Tables

End with two summary tables:

**Mismatches:**

```markdown
| ID   | Screen    | Issue              | Severity    |
| ---- | --------- | ------------------ | ----------- |
| S-01 | Dashboard | Missing bottom bar | ❌ Critical |
```

**Matching Well:**

```markdown
| Screen          | Notes                             |
| --------------- | --------------------------------- |
| Detail overview | Ring, stats, typography all match |
```

### 4.4 Corrections

If any findings from a previous code review are contradicted by the style audit
(e.g., a false positive), the agent MUST add an `> [!IMPORTANT]` alert
documenting the correction.

---

## 5. Review

- Present the `style-audit.md` to the user via `notify_user`
- Include `PathsToReview` with the report path
- Set `BlockedOnUser: true` to await user confirmation before proceeding
