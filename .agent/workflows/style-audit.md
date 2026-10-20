---
description:
  Compare mockups against implementation styles to identify visual gaps
---

# 🎨 Style Audit Workflow

## Approved design authority

For prospective UI, review the **single owner-approved runnable interactive
design** in the feature's `mockups/` with its short README for version,
entry/run, scenarios and native-only limits. The artifact itself defines visual
structure and responsive behavior; **no prospective sidecar, normative Binding
Facts, hash manifest, combined approval or verifier step**. See
`docs/design/interactive-design-workflow.md`.

For historically approved **image** references on their original UI surfaces
only, preserve the original `*.binding.md` and run the unchanged
`scripts/verify-mockup-binding.js` before using legacy Binding Facts. A
missing/invalid historical sidecar blocks review of that historical governed
surface, not new interactive HTML. Do not alter historical approvals.

This workflow compares rendered design to actual RN styles and **native
screenshots**, producing scoped property-level findings. Browser previews or
source alone are not native visual evidence. For non-governed UI, report N/A.

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
- **RECURSIVELY DISCOVER** candidate mockup assets in the selected feature
  folder, including nested paths such as `design/mockups/`
- Defer loading full interactive/image references and per-mockup processing
  until Section 1.3 maps candidates to changed governed visual UI.

### 1.3 Identify Changed Components

- Get the list of changed files from the branch/PR
- Filter to only **UI files**: `.tsx` components, screen files, and any shared
  UI utilities
- **READ** every changed UI file in full
- Map changed UI to its **approved runnable design/version** (or historical
  image) through the feature handoff and README. Open its working entry, not a
  raw fragment; exercise relevant approved interactions/states.
- For **historical image-backed** surfaces, load only applicable original
  sidecars, check current approval evidence and require legacy verifier PASS.
- Ignore unrelated references and unchanged governed UI. No new interactive
  sidecar, metadata reconstruction or second approval is required.
- Record the reviewed interactive screen/component context or original
  historical binding surface, excluding preview-only framing/controls.
- Create a numbered mapping only for audit targets:
  `Mockup N → <filename> → <changed governed UI>`.
- When no candidate assets exist, report `No mockups found — N/A`. When
  candidates exist but none map to changed governed visual UI, report
  `N/A — no governed visual UI change` and skip every per-mockup loop.

---

## 2. Property-Level Comparison (MANDATORY — PER MOCKUP)

For **each loaded mockup mapped to changed governed visual UI**, the agent MUST
compare the following visual properties against the corresponding component(s).
Present findings in a markdown table.

**Scope rule:** compare only the **actual approved product UI** in the runnable
artifact (or historical sidecar-governed image). Exclude preview controls,
decorative device framing, browser chrome and outer canvas; the original
historical sidecar exclusions still apply to their surfaces.

### 2.1 Properties to Compare

For each UI element in the approved reference's **binding product surface**,
including applicable interactive states documented by its approved handoff,
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

For each mockup, list missing/extra UI **only within the approved product UI
surface** shown in the interactive entry or historical image:

- **Elements inside the approved product surface but NOT in code** (completely
  missing product UI)
- **Elements in the governed code surface but NOT in the approved product
  surface** (extra/unapproved product UI)

Do **not** report presentation-only hardware, browser chrome, export padding,
outer canvas or preview controls as missing product UI. For historical images,
retain original sidecar exclusions. Do not compare unrelated code outside the
governed product surface.

---

## 4. Report Generation (MANDATORY)

### 4.1 Output Format

Write the report to the artifact directory as `style-audit.md` with:

1. **Color Reference** — dark mode palette used in the project
2. **Per-Mockup Sections** — each with comparison tables and a verdict scoped to
   the approved product surface; list excluded preview-only framing for
   traceability
3. **Rendered Visual Evidence** — actual native-app screenshots compared
   side-by-side or overlaid against the rendered approved interactive entry (or
   historical approved image) at the reviewed UI context, plus every in-scope
   compact-phone, ordinary-phone, tablet, landscape, dark-mode, RTL/Arabic, and
   enlarged-text visual variant
4. **Accessibility Evidence** — accessibility-tree inspection, screen-reader
   validation, or automated accessibility results for labels and semantics;
   screenshots alone do not prove accessibility labels
5. **Functional Readiness** — `READY` or `NOT READY`, with test evidence
6. **Visual Fidelity** — `COMPLETE`, `INCOMPLETE`, or `N/A`, with the reviewed
   context and evidence paths or the reason it does not apply
7. **Summary Table** — all findings grouped by severity

Browser prototypes, source/component inspection and static screenshots alone
cannot prove native visual completion. For changed governed UI, missing actual
native baseline or scoped rendered evidence makes visual fidelity `INCOMPLETE`;
record any unperformed device/render checks as `NOT RUN`, not as a visual pass.

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
