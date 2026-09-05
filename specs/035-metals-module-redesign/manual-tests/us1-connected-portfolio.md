# US1: Connected portfolio

Owner: Slice 5 portfolio surfaces
Base: PR #254 head `47d6fc3de09ec0c848f68e19fd94de09fb0c79fe`
Requirements: FR-001–FR-007
Success criteria: SC-001 (moderated only), SC-002 (QA timing only),
SC-003–SC-008
Automated counterpart: `net-worth-read-model-service.metals.test.ts`,
`metal-portfolio-read-model-service.test.ts`, `portfolio-surfaces.test.tsx`, and
`home-and-portfolio.yaml`.

## Preconditions

- Authenticated fixture user only; foreign-user data must be present for scope
  checks.
- Deterministic Gold-only, Silver-only, mixed, empty-active-with-history,
  missing-rate, stale-rate, and offline-cached profiles.
- Normal-flow visual reference: approved Home Concept C and `02-my-metals.png`.
- Rates are market information, never ownership or a wealth contributor.

| ID      | Preconditions and fixture                                      | User journey                                                                | Expected observable result                                                                                                                                                                      | Automated?          | Evidence                  |
| ------- | -------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------- |
| US1-M01 | Mixed active Gold/Silver, accounts, fresh rates                | Open Home                                                                   | Existing Home remains intact; compact `Where your money is` immediately follows Net worth and has equal-width Accounts/Metals tiles.                                                            | UI + manual visual  | Pending T053/device proof |
| US1-M02 | Canonical mixed fixture                                        | Read Home breakdown                                                         | Accounts and Metals are the only net-worth sources; Gold/Silver are nested inside Metals; exact shares sum from unrounded totals.                                                               | Unit + UI           | Pending T051/T053         |
| US1-M03 | Canonical mixed fixture                                        | Select Accounts then Metals tiles                                           | Opens Accounts and My Metals respectively; rates remain below wealth section and See all rates opens Live Rates.                                                                                | Maestro + device    | Pending T054              |
| US1-M04 | Mixed active Gold/Silver, fresh rate                           | Open My Metals                                                              | All is selected initially; active current value, since-purchase performance, allocation, rate state, recent History, and Gold/Silver holding cards appear without presenting rates as holdings. | Unit + UI + Maestro | Pending T052–T054         |
| US1-M05 | Mixed fixture                                                  | Switch All, Gold, Silver                                                    | Each filter shows only matching active holdings and a truthful filter-empty state. Reopening restores All.                                                                                      | Unit + UI + Maestro | Pending T052–T054         |
| US1-M06 | No Active, effective Sold/Disposed history                     | Open My Metals                                                              | Add holding path remains available; Sold and Disposed history remains reachable.                                                                                                                | Unit + UI           | Pending T052/T053         |
| US1-M07 | Gold-only then Silver-only fixture                             | Open Home                                                                   | Owned metal has correct count/value; unowned metal shows zero without implying ownership from market rates.                                                                                     | Unit + UI           | Pending T051/T053         |
| US1-M08 | Active sale credit plus Sold holding                           | Open Home and My Metals                                                     | Credited sale proceeds are Accounts only; Sold holding is excluded from active value/allocation and appears only in effective History/sold result when trustworthy.                             | Unit + manual       | Pending T051/T052         |
| US1-M09 | Missing, stale, offline-cached and refresh-error rate profiles | Open Home and My Metals offline                                             | Local facts/holdings remain visible. Missing affected values are unavailable; stale valid values retain warning; no invented current value or false fresh claim.                                | Unit + UI + device  | Pending T051–T053         |
| US1-M10 | Read-model subscription error                                  | Open Home/My Metals and retry                                               | Existing facts remain when available; error state gives one accessible retry.                                                                                                                   | UI + device         | Pending T053              |
| US1-M11 | Mixed fixture                                                  | Test light/dark, EN/AR RTL, compact/ordinary/tablet/landscape and 200% text | Source order/nesting/destinations stay equivalent; values and controls reflow without overlap; controls remain at least 44 px.                                                                  | UI + device         | Pending T053/device proof |
| US1-M12 | Accessibility services enabled                                 | Navigate Home/My Metals with screen reader and keyboard/switch              | Tiles, filters, holdings, rate state, and destinations have meaningful accessible names/states and logical focus order.                                                                         | UI + device         | Pending T053/device proof |

## Manual-only rationale

### Manual-only: US1-M01, US1-M11, US1-M12

Scenario: Pixel-level compact/tablet/orientation/RTL/200%-text and
assistive-technology inspection against approved mockups.

Why automation cannot honestly control it: current emulator/Maestro harness does
not control all font-scale, tablet/orientation, native screen-reader,
switch-control, and visual-comparison conditions.

Deterministic coverage retained: T051–T053 unit/component checks and T054
controlled navigation journey.

Human owner and environment: Mohamed, current Android/iOS builds, EN and AR,
light/dark, compact phone and tablet.

Pass/fail evidence: screenshot/video plus device, OS, build, locale, theme,
scale, viewport, and fixture profile.

Runner follow-up: add controlled device-matrix visual/a11y harness when it can
set all required conditions.

### Manual-only: SC-001

Scenario: Moderated comprehension/research acceptance of connected Home,
portfolio, and rates information hierarchy.

Why automation cannot honestly control it: requires separately approved sampling
method, sample-size rationale, recruitment constraints, confidence/decision
rule, and analysis plan.

Deterministic coverage retained: structural and navigation requirements in
T051–T054.

Human owner and environment: product/research owner after explicit study
approval.

Pass/fail evidence: approved study protocol and analysis report.

Runner follow-up: none; product-research acceptance is not an automated test.
