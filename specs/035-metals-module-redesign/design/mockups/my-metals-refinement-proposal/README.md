# My Metals refinement proposal — pending Mohamed approval

This proposal responds to Mohamed's 2026-09-27 My Metals screenshot and feedback. It supersedes only the affected areas of the approved `nile-current-v1-flow/02-my-metals.png` composition after explicit approval. It does not change Add/Edit Holding, holding valuation formulas, history, filters, or the global quick-action FAB.

Open [the interactive mockup](my-metals-refinement.html) to switch between English/Arabic and dark/light. The rendered proofs are [English dark](my-metals-dark-en.png), [English dark scrolled](my-metals-dark-en-items.png), [English light](my-metals-light-en.png), and [Arabic dark](my-metals-dark-ar.png). These are design proposals, not app screenshots.

## Decisions shown for approval

| Area | Proposal |
| --- | --- |
| Header | Replace the labelled `+ Add holding` action with the same icon-only `PageHeader` plus action used by Accounts and Transactions. Give it an accessible label equivalent to "Add metal item". Show it in the populated and empty states. The existing global quick-action FAB remains. |
| Summary wording | "Your gold and silver" becomes **"Your Metals"**. "Your gold and silver value" becomes **"Your Metals Value"**. Arabic proposal: **"معادنك"** and **"قيمة معادنك"**. |
| "Holdings" wording | Section becomes **"Your items"** / **"قطعك"**. Count becomes "3 items" / "٣ قطع". This is a proposed visible term for this screen; related Add/Edit language should be reviewed separately before a wider rename. |
| Allocation | Gold and Silver occupy one continuous rail with only the outside ends rounded. A subtle boundary identifies the share transition. Legend keeps metal names and percentages. Single-metal allocation fills the rail; zero-value state has no misleading percentage. |
| Rates | A compact "Rates for your metals" panel shows one row for each metal type with an active item. Sample displays Gold and Silver. The label **per pure gram** matches existing Gold/Silver market-rate roots; it is not a separate 24K, 21K, or item-specific sale quote. Values and timestamp shown here are illustrative only. |
| Rate trust | Use the saved, validated market-rate snapshot and preferred display currency. Keep the real update time. When stale, unknown, unavailable, or refreshing, show the truthful state for each displayed rate and never call old data "live". When no active item exists, omit this panel. |
| Other layout | Keep current filters, item rows, navigation, and existing global FAB; allow the page to scroll when the new rate panel consumes height. |

The user asked for live rates for metals they own. This proposal interprets that as **current available Gold/Silver market rates, filtered to metal types with active items**. Rate quotes are per pure gram, while each item's value still uses its recorded purity and weight. If Mohamed wants a separate quote for every owned purity, revise the mockup before implementation.

## Implementation handoff after approval

1. Confirm English and Arabic labels, pure-gram interpretation, and any requested mockup edits with Mohamed.
2. Create the binding sidecar required by `.agent/workflows/mockup-implementation.md`, record approval evidence, and verify it with `scripts/verify-mockup-binding.js`.
3. Assign Gemini at medium effort to a separate My Metals branch. Review its changes against this mockup, Accounts/Transactions `PageHeader`, current rate trust contracts, and the existing Gold/Silver asset imagery.
4. Require tests for populated/empty header actions, copy, allocation proportions and boundary, Gold-only/Silver-only/no-owned-metal rates, missing/stale/refresh states, RTL/compact/font scaling, and bottom navigation clearance. Run actual device screenshot comparison before calling visual fidelity complete.

No production screen code has been changed for this proposal.
