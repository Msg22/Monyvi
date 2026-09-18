---
description:
  Compare mockups against implementation styles to identify visual gaps
---

# 🎨 Style Audit Workflow

## Approved Mockup Binding Gate

When this workflow consumes an approved mockup or sidecar, run
`node scripts/verify-mockup-binding.js <path/to/mockup.binding.md>` before using
binding facts, rendered evidence, or approval status. Require exit status zero:
current image bytes, exact UTF-8/LF Binding Facts bytes, both approved
revisions, and approval evidence for the approved combined
`Binding approval revision` must all verify. A failed verifier blocks governed
UI work; follow `.agent/workflows/mockup-implementation.md` to renew approval.

This workflow produces a property-by-property comparison of approved mockup
designs against the actual implementation styles (Tailwind classes, inline
styles, colors, typography, spacing, borders, layout, icons). The output is a
structured **Style Audit Report** identifying all gaps and mismatches.

> [!CAUTION] **EVERY SECTION IS MANDATORY. The agent MUST execute EVERY step. If
> a mockup has no deviations, the agent MUST explicitly state "✅ No deviations
> found." Skipping or summarizing without property-level evidence is a CRITICAL
> FAILURE.**

---

## 1. Context Loading (MANDATORY)

Before analyzing ANY component, load the following:

### 1.1 Design System

- **READ** `apps/mobile/constants/colors.ts` — the raw palette and semantic
  theme
- **READ** `apps/mobile/tailwind.config.js` — all extended Tailwind tokens
- **READ** `CLAUDE.md` — Tailwind-first, dark mode, palette usage rules

### 1.2 Identify Mockups

- Locate the spec folder matching the branch name under `specs/`
- **LIST** all files in `specs/<branch-name>/mockups/`
- **LOAD** every mockup image (use `view_file` on each `.png`/`.jpg`)
- Create a numbered mapping: `Mockup N → <filename> → <short description>`

### 1.3 Identify Changed Components

- Get the list of changed files from the branch/PR
- Filter to only **UI files**: `.tsx` components, screen files, and any shared
  UI utilities
- **READ** every changed UI file in full

---

## 2. Property-Level Comparison (MANDATORY — PER MOCKUP)

For **each mockup**, the agent MUST compare the following visual properties
against the corresponding component(s). Present findings in a markdown table.

### 2.1 Properties to Compare

For each UI element visible in the mockup, check:

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

For each mockup, the agent MUST also list:

- **Elements in mockup but NOT in code** (completely missing UI)
- **Elements in code but NOT in mockup** (extra/unapproved UI)

---

## 4. Report Generation (MANDATORY)

### 4.1 Output Format

Write the report to the artifact directory as `style-audit.md` with:

1. **Color Reference** — dark mode palette used in the project
2. **Per-Mockup Sections** — each with comparison tables and a verdict
3. **Summary Table** — all findings grouped by severity

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
