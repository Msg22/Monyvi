# Shared-account proposal: interaction and copy notes

Status: PROPOSED visual package. This document describes the concept for owner review, not an implementation-ready or approved mockup binding. Production contracts and the existing tasks still need reconciliation and analysis after visual approval.

## Settled product direction

- Existing confident matches win. When an account is not mentioned, use an eligible default regardless of account count.
- Omitted currency uses preferred currency. Ambiguous/conflicting currency requires confirmation; no account is automatically assigned until it is resolved. Known currency mismatches require account choice; no automatic amount conversion.
- Ordinary SMS source matching continues to exclude Cash. A Cash default can apply to Voice and to an eligible ATM destination; SMS source defaults must be eligible BANK/DIGITAL_WALLET accounts.
- One draft entity can be referenced by multiple transactions only with shared currency and compatible explicit account evidence (including clearly scoped shared speech context). Conflicting type/card/account identities remain separate.
- Missing default remains unassigned. User overrides win. Deleted/stale references are revalidated before Save. No invented accounts/balances or cross-user matching.
- ATM destination: same-currency default Cash, otherwise sole same-currency Cash, otherwise choice. Source and destination resolve separately. Ordinary transfer endpoints remain unassigned without reliable endpoint evidence/user choice.
- Live SMS auto-confirm/notification behavior is outside this review-page proposal.

## Shared confirmation and selection

- 01: QNB/EGP is one draft referenced by three transactions, all unchecked. Confirm account approves its use for all three. No financial account exists yet.
- 02: draft confirmation removes only the account blocker and does NOT select transactions. Checks stay empty and Save stays disabled until the user selects valid rows.
- Directly selecting one draft-linked card may confirm that shared draft, with the visible helper explaining its effect on all linked transactions. Only the selected transaction is checked.
- 06: Select all summarizes each unconfirmed shared draft once. Confirm & select approves those drafts and selects the eligible displayed rows; Back leaves both confirmation and selection unchanged. Missing currency/other hard blockers remain unresolved and are not hidden by this flow.
- Confirmation state belongs to the draft identity, not each transaction. Deselecting all rows prevents unused draft creation; it need not undo an explicit account confirmation.
- Account creation happens only on final Save for referenced selected transactions. Save/retry must reconcile existing accounts and avoid duplicate drafts/accounts. It is not an extra provider request.
- Confirming a draft never clears uncertain amounts, categories, currency or unrelated review reasons.

## Matching and editing

- 03/12: one compact inline Choose account control opens a sheet of matching existing accounts only. Name, currency and masked card suffix distinguish candidates. Choosing an account changes this row only and does not select the transaction. Cancel/close makes no changes.
- 07: Change edits the shared draft, explicitly applying to all linked transactions. Currency is shown locked to the linked transactions' already-confirmed currency; corrections to transaction currency are handled separately before regrouping. Choosing a real account for only one transaction detaches that row from the draft.
- Draft type must be supported and validated; a merchant is not an account. QNB is a BANK example, not a promise that arbitrary drafts may infer provider/type or become CASH SMS sources.
- A confirmed draft whose identity changes materially must be reconfirmed for the revised linked group.
- 05/11: Confirm currency resolves uncertainty before account assignment. Use currency changes the currency interpretation, never converts the number. Missing-default account choice remains a separate action.

## Notices and form helper

- 04/10: one neutral info notice explains default assignment, affected count and ability to change it. Only affected rows carry Default account; count responds to user overrides and the notice disappears when none remain.
- Voice example uses existing Cash. SMS equivalent uses an eligible bank/wallet default, never Cash.
- 08's reviewed delta is the helper beneath the existing default switch. The surrounding account form, read-only fields and balance/delete actions are context, not authorization to redesign existing account forms or financial behavior.
- Proposed BANK/DIGITAL_WALLET helper: “Selected for new transactions and voice or SMS entries when no account is mentioned and the currency matches.”
- Proposed CASH helper: “Selected for new transactions and voice entries when no account is mentioned and the currency matches. SMS entries use bank or wallet accounts.”
- Secondary help belongs to review assignment: “You can change the account before saving.” Apply it in context; it does not describe changing this account's type/currency.
- SMS stores review edits/drafts durably. Voice currently has session-only review state; this proposal does not add Voice draft recovery.
- In 11 the currency sheet is the review focus, with neither currency selected.

## Deliberate visual proposals requiring owner review

- The third mode label is Selected rather than Auto-selected, so confirmed accounts and checked transactions cannot be confused. This proposes filtering actual selection and reconciling the current automatic-eligibility metric; it is not an already-shipped behavior.
- Existing review summary and filter-count behavior must be reconciled without removing useful current functionality. The images focus on the new account sections and compact flat rows.
- Prefer short neutral account notices; amber means pending confirmation, emerald means confirmed/selected, red remains expense/destructive color.
- Sheets/actions include runtime bottom safe-area insets; hardware frame and system regions are illustrative.
- Palette, shared fields, PageHeader and row components remain the implementation authority. Generated lighting/gradients and raster text do not introduce new tokens, font sizes or provider assets.
- Baseline proposal is 390×844 logical dp; final binding needs responsive, RTL, enlarged-font and theme adaptations. This is not a pixel measurement extracted from the PNG.
- 09 and 12 illustrate Arabic RTL. Remaining EN/AR strings and image-specific exact bindings need final reconciliation before coding.
- No emulator tests, app code changes, SQL changes, deployments, pushes or PR updates were performed for this design-only package.

