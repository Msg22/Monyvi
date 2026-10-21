# Shared account mockups

**Current currency flow (owner clarification, 2026-10-21):** Choose the account
and accept its currency once in the same chooser. New accounts choose currency
inside their form using the shared picker. Older currency-confirmation images,
bindings and captions below are retained provenance, not active instructions to
restore a standalone currency-only action. See
[FR-011](../spec.md#functional-requirements).

**2026-10-20 interactive reference:**
[Compact review — preview and provenance](interactive/compact-review-2026-10-20/README.md).

Frozen image package for issue
[#395](https://github.com/Msg22/Monyvi/issues/395), alongside the dated
interactive design reference. This directory contains no application
implementation; retained R1–R3 image approvals and history remain unchanged.

## Approval scope

- Approved references contain only five retained R1 concepts and three R2
  images. Superseded R1 images have been deleted; retained PNG bytes are
  unchanged.
- Original [approval receipt](provenance/r2/approval-2026-10-14.json), manifests
  and proposal notes are preserved separately as
  [historical provenance](provenance/README.md), not implementation
  instructions. [Cleanup dispositions](reference-cleanup.json) record removed
  images and their pinned history links.
- R3: state and EN/AR additions **approved with exact B1 bindings** in the
  [current receipt](../approvals/b1-2026-10-14.json).
  [Latest owner adjustments](adjustments.md) override the illustrated new-picker
  chrome: reuse the existing currency modal.
- [Review all R3 images](proposals/r3/preview.md),
  [interaction/copy notes](proposals/r3/interaction-notes.md),
  [frozen manifest](proposals/r3/manifest.json).
- Historical
  [single-image final review](provenance/r2/final-review-2026-10-14.md) is
  preserved; latest Add flag / existing currency modal instructions supersede
  its F01/F02 recommendations.

## Approved references still needed

| Reference                                                                    | Approved scope                                                                        |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [R1 account chooser EN](references/r1/03-multiple-matches-en.png)            | Choose one matching existing account for one transaction                              |
| [R1 edit shared draft](references/r1/07-edit-shared-draft-en.png)            | Foreground edit sheet; background follows the approved R2 composition                 |
| [R1 Edit Account helper](references/r1/08-account-helper-en.png)             | Helper beneath Edit Account's default flag; surrounding form is context               |
| [R1 currency confirmation](references/r1/11-currency-confirm-en.png)         | Foreground confirmation; documented Choose another currency reuses the existing modal |
| [R1 account chooser AR](references/r1/12-multiple-matches-ar.png)            | Arabic chooser and approved wording                                                   |
| [R2 combined review](references/r2/01-unified-review-en.png)                 | Compact grouping concept; approved R3-05/R3-15 bind final detailed composition        |
| [R2 independent actions](references/r2/02-individual-account-actions-en.png) | Per-group Confirm/Edit/Replace/Remove menu                                            |
| [R2 complete account list](references/r2/03-all-suggested-accounts-en.png)   | All suggestions independently reachable/actionable                                    |

## Approved R3 states — original proposal paths retained

| Image                                                                           | Focus                                                               |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [01-add-account-default-en](proposals/r3/01-add-account-default-en.png)         | Add account — choose the new default                                |
| [02-add-first-cash-default-en](proposals/r3/02-add-first-cash-default-en.png)   | First account — default automatically; Cash eligibility             |
| [03-confirm-currency-other-en](proposals/r3/03-confirm-currency-other-en.png)   | Currency confirmation — choose another currency                     |
| [04-other-currency-picker-en](proposals/r3/04-other-currency-picker-en.png)     | Choose another currency — search and confirm                        |
| [05-combined-review-en](proposals/r3/05-combined-review-en.png)                 | Combined states — independent groups and disclosed selection        |
| [06-removed-suggestion-undo-en](proposals/r3/06-removed-suggestion-undo-en.png) | Remove one suggestion — transactions retained and Undo              |
| [07-default-only-en](proposals/r3/07-default-only-en.png)                       | Default-only review — quiet information without a panel             |
| [08-issues-only-en](proposals/r3/08-issues-only-en.png)                         | Issues-only review — account, currency, amount and category         |
| [09-confirmed-feedback-en](proposals/r3/09-confirmed-feedback-en.png)           | Shared confirmation — only the clicked transaction selected         |
| [10-clean-review-en](proposals/r3/10-clean-review-en.png)                       | Clean review — omit empty account-information section               |
| [11-empty-selected-filter-en](proposals/r3/11-empty-selected-filter-en.png)     | Filtered empty state — no selected transactions                     |
| [12-default-why-en](proposals/r3/12-default-why-en.png)                         | Default assignment — friendly Why explanation                       |
| [13-group-replace-en](proposals/r3/13-group-replace-en.png)                     | Replace shared draft — disclose group impact and candidate identity |
| [14-sms-save-failure-en](proposals/r3/14-sms-save-failure-en.png)               | SMS review — preserve selections and drafts on save failure         |
| [15-combined-review-ar](proposals/r3/15-combined-review-ar.png)                 | Arabic RTL — revised combined review and shared disclosure          |

Owner approved all23 B1 exact sidecars and R3 visual/EN/AR additions; see the
[current receipt](../approvals/b1-2026-10-14.json). Canonical verifier passes.
Frozen R3 manifest/notes and common-contract proposal headers are historical
approved inputs; the receipt supersedes their pending status. No image or
Binding Facts changed. [Review package B1](../pre-plan-review.md) pairs each
image with its scoped facts and combined revision.
[Approved common contract](binding-contract.md) supplies
normal/responsive/theme/RTL/accessibility values. Its frozen proposal header is
superseded by the exact approval receipt; values were explicitly adopted, not
inferred measurements of generated raster pixels. Generated phone
framing/lighting and unrelated form context do not authorize a parallel app
design system.
