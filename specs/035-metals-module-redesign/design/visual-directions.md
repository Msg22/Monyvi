# Metals V1 Visual Handoff

**Status:** Approved canonical visual handoff
**Source of truth:** [spec.md](../spec.md), [content-contract.md](./content-contract.md)
**Scope:** Gold/Silver Metals V1; existing Home shell and `/live-rates` appearance preserved.

## Approved visual system

Use the calm Nile Ledger direction: restrained slate surfaces, Nile green for
actions and trust, and Gold/Silver accents only for metal identity. Preserve the
existing Monyvi header, navigation, spacing language, and theme behavior. Use
equivalent light/dark hierarchy, readable EN/AR copy, logical RTL flow, and
Monyvi-supplied illustrative holding renders keyed by metal and physical form.

## Canonical approved screens

The following files are the only normal-flow visual references for implementation:

| Surface | Canonical reference |
| --- | --- |
| Home wealth section | `design/mockups/home-wealth-section-concepts/concept-c-proportional-summary.png` |
| Metals landing | `design/mockups/nile-current-v1-flow/02-my-metals.png` |
| Active holding detail | `design/mockups/nile-current-v1-flow/03-active-holding-detail.png` |
| Add holding | `design/mockups/nile-current-v1-flow/05-add-holding-entry.png` |
| Edit holding | `design/mockups/nile-current-v1-flow/08-edit-holding-correction-state.png` |
| Delete confirmation | `design/mockups/nile-current-v1-flow/14-delete-holding-confirmation.png` |
| History | `design/mockups/nile-current-v1-flow/15-history.png` |
| Disposed holding detail | `design/mockups/nile-current-v1-flow/17-disposed-holding-detail.png` |

Screens 04 Live Rates, 11, 13, and 19 are not replacement implementation
references: Live Rates keeps its current page and only receives Gold/Silver scope
and truthful rate-state corrections; retired review/version-choice screens remain
noncanonical; Screen 19 is backlog only.

## Composition and interaction contract

- Home adds only the compact Concept C `Where your money is` section beneath the
  existing net-worth total; Accounts and Metals are the complete source tiles,
  with Gold/Silver nested under Metals; Rates remains separate.
- Metals uses the approved portfolio hierarchy, Gold/Silver filters, realistic
  Monyvi-supplied holding visuals, plain trust copy, and current/stale/unknown/
  missing/offline states without inventing ownership from rates.
- Holding Detail uses plain `since purchase` wording, `How this value was
  calculated`, state-based actions, and a permanent per-holding lifecycle timeline.
- Add and Edit use one shared complete full-screen form. Weight and Purity share a
  row when space permits; the live preview is in the same form and saving is direct.
  Edit keeps Metal visibly locked and reveals correction reason and affected-only
  consequences only for material changes.
- Sell and No Longer commit directly from their live consequence summaries. Delete
  and Undo use focused confirmation sheets. Reconciliation is automatic; no user
  version-selection or review-stage screen exists.
- Visible copy avoids `unrealized`, `realized P/L`, and `observed`; use simple
  `since purchase`, `profit from sold metals`, `loss from sold metals`, `Rates updated`,
  and explicit unavailable/stale/unknown wording.

## Required state and responsive proof

Canonical screens are normal-flow references, not proof that every state is already
implemented. Implementation must add loading Skeleton, empty, populated, error,
offline, stale/unknown/missing-rate, pending, local-complete, sync-failure,
reconciliation, destructive, light/dark, EN/AR/RTL, compact-phone, ordinary-phone,
tablet/landscape, large-text, keyboard, focus, and reduced-motion evidence as
specified in the feature spec and checklist files.

Before implementation handoff, verify exact sample facts: Gold `24K · 999`, Gold
EGP 162,317.87, Silver EGP 19,108.30, Metals EGP 181,426.17, and net worth EGP
1,243,663.92. Use final currency display precision and no intermediate rounding.

## Deferred scope

Zakat is a separate future module. Platinum, Palladium, Other Metals, partial
sales, historical charts, user-uploaded photos, cross-currency sale credit, and
Screen 19 conflict-choice UI remain outside Metals V1.

Implementation starts only after `/speckit.tasks` reconciles this handoff with the
approved spec, contracts, issue #242 prerequisite, and TDD/manual coverage plan.
