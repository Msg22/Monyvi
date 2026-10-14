# Owner-approved adjustments to existing mockups

Recorded: 2026-10-14. No further images will be generated.

## Existing currency modal — mandatory reuse

Owner annotation on R3-04: “we should use the existing currency modal, not create a new one. preserving the sub-label 'for Lunch at talabat' is a good idea tho. you don't need to regenerate the mockup. but this should be noted and documented”.

- **Reuse `apps/mobile/components/currency/CurrencyPicker.tsx` and its existing modal presentation/pattern. Do not create a second currency picker or modal for this feature.**
- Preserve the contextual sub-label `For Lunch at Talabat` (localized, driven by the affected transaction).
- `Choose another currency` is the entry action from currency confirmation. R3-04's search/list/chrome illustrate that route; its custom sheet composition is **not** a new binding design.
- Adapt the existing control additively when context or an unconfirmed state needs support. Do not fabricate a confirmed/preselected currency merely to satisfy an existing non-null prop.
- Opening/cancelling does not commit a currency or assign an account. Explicit acceptance changes this transaction's currency interpretation, never converts its amount, and then uses the agreed eligibility/regrouping rules.
- Return to the initiating transaction/review context; avoid two stacked active currency surfaces.

## Add Account default control

Owner: “we need to add same default flag we have in the edit account form to the add form”.

- Reuse the Edit Account flag's star, label, toggle, accessible state and token pattern in Add Account.
- Place the helper directly beneath the flag. Preserve existing account/provider/SMS fields and form behavior.
- R3-01 shows a later account explicitly enabled as default and names the prior default that successful Save will replace. Off is the initial choice for later accounts; it leaves the prior default/no-default state unchanged.
- R3-02 proposes first-account on/disabled with an explanation, preserving the existing first-active-account creation rule. This visible first-account state remains part of R3 approval, not silently inferred approval.
- Toggling/cancelling/failed creation cannot change persisted accounts; successful default replacement goes through the existing owned account command and preserves one active default.
- Cash helper excludes ordinary SMS source fallback; Bank/Wallet helper covers eligible Voice/SMS entries.

## Stop generating images

Owner: “please don't create more mockups you are regenerating the same mockups”. Image generation stopped. Existing generated files are preserved unchanged. Remaining exact spacing/theme/responsive/accessibility bindings and translations are written as notes for approval; no regenerated mockups are needed.

## Approval boundaries

- Retained R1 and R2 approval applies only to scopes listed in `provenance/r2/approval-2026-10-14.json`. Superseded screenshots have been removed from active references; their approval/history records remain separately preserved.
- R3 contains the currently proposed state images, with their final retained versions in one manifest. Image-specific commentary on the currency picker is not blanket approval of unrelated R3 images.
- This adjustment supersedes the final review's prior recommendation to omit an Add default control and its suggestion of a separate currency picker. Preserve the historical review unchanged for provenance.
- Exact sidecar metadata and approved combined revisions are still required before implementation. No speculative pixel dimensions or measured contrast claims are inferred from these generated raster files.
