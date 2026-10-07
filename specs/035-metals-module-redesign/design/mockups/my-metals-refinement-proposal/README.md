# My Metals refinement — image and binding approved

This proposal responds to Mohamed's 2026-09-27 My Metals screenshot and feedback. It supersedes only the affected areas of the approved `nile-current-v1-flow/02-my-metals.png` composition after explicit approval. It does not change Add/Edit Holding, holding valuation formulas, history, filters, or the global quick-action FAB.

Open [the interactive mockup](my-metals-refinement.html) to switch between English/Arabic and dark/light. The rendered proofs are [English dark](my-metals-dark-en.png), [English dark scrolled](my-metals-dark-en-items.png), [English light](my-metals-light-en.png), [Arabic dark](my-metals-dark-ar.png), and [Arabic dark scrolled](my-metals-dark-ar-items.png). These are approved design references, not app screenshots. The dark reference has an [approved binding sidecar](my-metals-dark-en.binding.md) verified against the current image bytes.

## Approved visual decisions

| Area | Proposal |
| --- | --- |
| Header | Replace the labelled `+ Add holding` action with the same icon-only `PageHeader` plus action used by Accounts and Transactions. Give it an accessible label equivalent to "Add metal item". Show it in the populated and empty states. The existing global quick-action FAB remains. |
| Summary wording | "Your gold and silver" becomes **"Your Metals"**. "Your gold and silver value" becomes **"Your Metals Value"**. Arabic proposal: **"معادنك"** and **"قيمة معادنك"**. |
| "Holdings" wording | Section becomes **"Your items"** / **"قطعك"**. Count becomes "3 items" / "٣ قطع". This is a proposed visible term for this screen; related Add/Edit language should be reviewed separately before a wider rename. |
| Allocation | Gold and Silver occupy one continuous rail inside the value summary, with only the outside ends rounded. A subtle boundary identifies the share transition. The standalone allocation card is removed. Legend keeps metal names and percentages. Single-metal allocation fills the rail; zero-value state has no misleading percentage. |
| Rates | **Prices per gram** shows exactly four compact purity-specific tiles: Gold 24K, 21K, 18K, and Silver 999. Gold tiles show the karat alone; Silver keeps its fineness number. Each tile uses two lines, with the metal/grade above and the price/unit together below. The hidden catalog purity factor still determines each estimate. There is no disclosure button or explanatory copy below the tiles. The prices are illustrative market-metal estimates per gram, calculated from the saved pure-metal rate and exact catalog purity factor. They are not dealer buy/sell offers. |
| Rate trust | Use the saved, validated market-rate snapshot and preferred display currency. Keep the real update time. When stale, unknown, unavailable, or refreshing, show the truthful state for each displayed rate and never call old data "live". Values and timestamp in the mockup are illustrative only. |
| Item cards | Remove the visible “Tap an item for details” hint. Give each card a directional chevron and a whole-card press/focus response so its action is apparent without extra copy. The card itself is the accessible button, with a descriptive screen-reader label. |

This third revision follows Mohamed's direction to keep only those four prices. A common gold purity appears even when the user does not own it, so the rates remain useful before adding an item. The allocation strip and four prices fit above the item list without tall standalone cards. Item cards now show a directional chevron and pressed/focused response instead of a visible instruction.

## Implementation handoff

1. Use the [approved binding sidecar](my-metals-dark-en.binding.md) at combined revision `sha256:80cb82065b424a0fe951dff0904966806536125e2b49cc6b3f8d0bac509868c7` as the My Metals UI authority.
2. Verify the sidecar with `scripts/verify-mockup-binding.js` before product UI implementation or visual review.
3. Assign Gemini at medium effort to a separate My Metals branch. Review its changes against this mockup, Accounts/Transactions `PageHeader`, current rate trust contracts, and the existing Gold/Silver asset imagery.
4. Require tests for populated/empty header actions, copy, allocation proportions and boundary, the four purity-specific prices from the canonical catalog, whole-card detail navigation, missing/stale/refresh states, RTL/compact/font scaling, and bottom navigation clearance. Run actual device screenshot comparison before calling visual fidelity complete.

No production screen code has been changed for this proposal.
