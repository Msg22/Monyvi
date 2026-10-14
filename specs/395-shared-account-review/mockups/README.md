# Shared account mockups

Existing image package for issue
[#395](https://github.com/Msg22/Monyvi/issues/395). No application
implementation. No more mockups will be generated.

## Approval scope

- Retained R1 concepts and R2 composition:
  [approval receipt](references/r2/approval-2026-10-14.json). Original reference
  bytes/manifests/notes unchanged.
- R1 has historical unapproved/superseded images too; do not treat its whole
  folder as approved.
- R3: new state proposals, **awaiting approval**.
  [Latest owner adjustments](adjustments.md) override the illustrated new-picker
  chrome: reuse the existing currency modal.
- [Review all R3 images](proposals/r3/preview.md),
  [interaction/copy notes](proposals/r3/interaction-notes.md),
  [frozen manifest](proposals/r3/manifest.json).
- Historical
  [single-image final review](references/r2/final-review-2026-10-14.md) is
  preserved; latest Add flag / existing currency modal instructions supersede
  its F01/F02 recommendations.

## R3 index

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

Exact binding sidecars and combined-revision approvals remain prerequisites
before coding. Generated phone framing/lighting and unrelated form context do
not authorize a parallel app design system.
