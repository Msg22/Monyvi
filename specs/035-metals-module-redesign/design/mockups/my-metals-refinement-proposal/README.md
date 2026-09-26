# My Metals refinement proposal — pending Mohamed approval

This proposal responds to Mohamed's 2026-09-27 My Metals screenshot and feedback. It supersedes only the affected areas of the approved `nile-current-v1-flow/02-my-metals.png` composition after explicit approval. It does not change Add/Edit Holding, holding valuation formulas, history, filters, or the global quick-action FAB.

Open [the interactive mockup](my-metals-refinement.html) to switch between English/Arabic and dark/light. The rendered proofs are [English dark](my-metals-dark-en.png), [expanded prices](my-metals-dark-en-expanded.png), [English dark scrolled](my-metals-dark-en-items.png), [English light](my-metals-light-en.png), and [Arabic dark](my-metals-dark-ar.png). These are design proposals, not app screenshots.

## Decisions shown for approval

| Area | Proposal |
| --- | --- |
| Header | Replace the labelled `+ Add holding` action with the same icon-only `PageHeader` plus action used by Accounts and Transactions. Give it an accessible label equivalent to "Add metal item". Show it in the populated and empty states. The existing global quick-action FAB remains. |
| Summary wording | "Your gold and silver" becomes **"Your Metals"**. "Your gold and silver value" becomes **"Your Metals Value"**. Arabic proposal: **"معادنك"** and **"قيمة معادنك"**. |
| "Holdings" wording | Section becomes **"Your items"** / **"قطعك"**. Count becomes "3 items" / "٣ قطع". This is a proposed visible term for this screen; related Add/Edit language should be reviewed separately before a wider rename. |
| Allocation | Gold and Silver occupy one continuous rail inside the value summary, with only the outside ends rounded. A subtle boundary identifies the share transition. The standalone allocation card is removed. Legend keeps metal names and percentages. Single-metal allocation fills the rail; zero-value state has no misleading percentage. |
| Rates | **Prices per gram** shows four compact purity-specific tiles by default: Gold 24K · 999, 21K · 875, 18K · 750, and Silver 999. An inline **Show all prices** disclosure reveals all 16 Gold/Silver options in the approved purity catalog without leaving My Metals. The prices are illustrative market-metal estimates per gram, calculated from the saved pure-metal rate and exact catalog purity factor. They are not dealer buy/sell offers. |
| Rate trust | Use the saved, validated market-rate snapshot and preferred display currency. Keep the real update time. When stale, unknown, unavailable, or refreshing, show the truthful state for each displayed rate and never call old data "live". Values and timestamp in the mockup are illustrative only. |
| Other layout | Keep current filters, item rows, navigation, and existing global FAB; allow the page to scroll when the new rate panel consumes height. |

The second revision responds to Mohamed's request to reduce vertical space and show prices for Gold 24K, 21K, and 18K. The default view shows the four most useful Gold/Silver purities; the expanded view keeps all catalog prices on this page. Even an unowned common purity appears in the default tiles so a user can compare prices before adding an item. The allocation strip and prices fit above the item list without two tall standalone cards. Confirm this default/expanded choice with Mohamed before implementation.

## Implementation handoff after approval

1. Confirm the revised compact layout, four default purities, expanded full catalog, and any requested mockup edits with Mohamed.
2. Create the binding sidecar required by `.agent/workflows/mockup-implementation.md`, record approval evidence, and verify it with `scripts/verify-mockup-binding.js`.
3. Assign Gemini at medium effort to a separate My Metals branch. Review its changes against this mockup, Accounts/Transactions `PageHeader`, current rate trust contracts, and the existing Gold/Silver asset imagery.
4. Require tests for populated/empty header actions, copy, allocation proportions and boundary, purity-specific prices from the canonical catalog, disclosure expansion, missing/stale/refresh states, RTL/compact/font scaling, and bottom navigation clearance. Run actual device screenshot comparison before calling visual fidelity complete.

No production screen code has been changed for this proposal.
