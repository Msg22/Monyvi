# Final review of approved shared-account mockups

Reviewed: 2026-10-14. Checkout: `E:/Work/My Projects/Monyvi`, branch `389-voice-usage-limits`, head `c1e6a198422385a59f7e1bf4e5de3191b353e865`.

## Outcome and approval scope

The revised composition resolves the original crowding and hidden-CIB problem: every draft is independently actionable, the full list exposes all suggestions, and default-account information sits within the same compact review area. The approved concepts are retained. Several transition states and implementation contracts still need explicit bindings; two visible additions need a product choice before coding.

Owner approval: “revised mockups approved along with the first generated mockups related to: choosing account when there are several matches; Edit suggested account; Edit account & add account helper below the default flag; Confirm currency modal. Arabic translation is approved.”

The companion approval receipt records image hashes and scope. Original PNGs, manifests and proposal notes remain unchanged. Their historical awaiting-approval labels are superseded by that receipt. Approval covers the three R2 images, the retained R1 foreground concepts, and existing Arabic copy. It does not reinstate R1's stacked banners or compulsory bulk-confirm sheet. R1-08 depicts Edit Account; Add Account helper intent is approved, but no Add Account composition was depicted.

This is a visual/concept and source-contract review, not a rendered application comparison. Hardware framing, raster effects and screenshot dimensions are not layout measurements. Exact bindings, reconciled spec/plan/tasks/contracts and Speckit analysis remain prerequisites to implementation. No app code, financial behavior, database schema or hosted deployment changed in this review. No emulator was used.

## Every approved image reviewed

| Approved scope | Review result | Gaps to bind or resolve |
| --- | --- | --- |
| R2-01 `01-unified-review-en.png` | QNB and CIB have independent actions. Default information and the currency issue share one section. Seven total, five needing review and two selected are consistent; only four transactions are visible. | Direct-checkbox confirmation disclosure is absent; bulk-selection controls are absent; missing-account/amount/category variants need the same compact treatment. Define counts and filter behavior. See F03, F04, F07. |
| R2-02 `02-individual-account-actions-en.png` | Menu correctly scopes Confirm/Edit/Replace/Remove to QNB's three transactions, without confirming CIB or creating an account. | Define Undo and the removed-but-still-visible transaction state; selected invalid rows must become unchecked. Replacement needs explicit group scope. See F05, F06. |
| R2-03 `03-all-suggested-accounts-en.png` | Every suggestion is visible with its own action/status. Confirmed QNB remains editable. Six groups link ten transactions; two defaults bring the batch to twelve. | “12 transactions” can be mistaken for twelve draft-linked transactions. Use “12 total transactions” or “10 linked transactions.” Define longer-list scrolling and menu-sheet transitions. See F07, F11. |
| R1-03 `03-multiple-matches-en.png` | No candidate is preselected; Use account is disabled until a choice. Names, currencies and card suffixes distinguish the shown bank candidates. | Do not fabricate card suffixes for wallets or accounts without card data. Per-row choice changes only that transaction; shared-menu replacement affects its group. Handle stale/no remaining candidates. See F06. |
| R1-07 `07-edit-shared-draft-en.png` foreground | Shared impact is disclosed. Locked currency prevents accidental group-wide currency changes. Account creation is deferred to Save. | Account nickname and provider identity are distinct. Preserve provider/sender/card metadata, validate type changes, and reconfirm material identity changes. Rename action wording if editing an already-confirmed draft to avoid surprise. See F08, F09. Its old background panel is superseded by R2. |
| R1-08 `08-account-helper-en.png` helper | Friendly explanation beneath Edit Account's Default switch is appropriate. “You can change the account before saving” belongs to review assignment context. | Add Account has no Default switch today. Cash needs the approved Voice-only/SMS-bank-or-wallet wording. Preserve existing provider/SMS fields and balance actions. See F01, F10. |
| R1-11 `11-currency-confirm-en.png` foreground | Uncertain currency stays unselected; Use currency is disabled. No account is selected before confirmation. | The two suggestions may both be wrong. Provide another-supported-currency route. Currency correction must detach/regroup only the affected row and keep the numeric amount. See F02, F09. Old background warning is superseded. |
| R1-12 `12-multiple-matches-ar.png` matching concept/copy | RTL chooser illustrates the same explicit-selection behavior and distinguishing labels. | Isolate account names, currency codes and card suffixes for bidi; use consistent localized selection terminology and numbers. Missing-card/wallet labels require variants. See F06, F12. |
| R1-09 `09-shared-draft-ar.png` copy only | Approved Arabic wording retains the one-confirmation/shared-group distinction. | Its old single-QNB panel is not the R2 composition. New R2 action/status labels need Arabic mappings and RTL layouts; existing Arabic approval is not proof that those missing variants render correctly. See F03, F12. |

R1-01/02/04/05/06/10 are historical references, not additional blanket approvals in this latest selection. R2 replaces their account-section stacking and mandatory bulk-confirm presentation.

## Findings

### F01 — Add Account helper placement requires a choice

**Open product/UI choice.** `apps/mobile/app/(private)/add-account.tsx` currently has no Default account control. Creation marks the first active account default automatically; later accounts are not default by default. The approved helper image only shows Edit Account.

Recommendation: preserve Add Account's current behavior and put explanatory information near the account fields, without adding a new switch in this change. Explain that the first account becomes default and that the default can be changed in Edit Account. If a Default switch is wanted on Add too, approve a small additional binding showing first-account and later-account behavior; do not silently introduce it under a helper-copy change.

### F02 — Currency suggestions need an escape route

**Open product/UI choice.** The approved modal offers EGP and USD only. If both suggestions are wrong, Cancel leaves the user blocked.

Recommendation: add a quiet “Choose another currency” action opening the supported-currency picker. It must initially leave currency unconfirmed, preserve the entered amount, and require an explicit choice. Existing `CurrencyPicker` currently expects a selected currency, so an unselected confirmation surface cannot simply pretend the first option was chosen. An unsupported or ambiguous currency must never silently become the preferred currency. Preferred currency fallback remains approved only when currency was omitted.

### F03 — Selecting a card must disclose shared confirmation

**Binding gap; preserve the agreed interaction.** R1 disclosed that choosing one transaction confirms QNB for all three, but that text is absent from R2. Keep direct-card confirmation as agreed, with brief contextual disclosure before the first such selection and feedback such as “QNB confirmed for 3 transactions.” Only the clicked transaction becomes selected. CIB stays pending; other review reasons remain.

A hard-invalid transaction must not become selected merely because its shared account was confirmed. Separate account confirmation from transaction eligibility. A group-level Confirm never selects all linked transactions. Deselecting every linked row prevents creation of an unused account.

### F04 — Bulk selection and Selected filtering need explicit semantics

**Contract/binding gap.** R2 renders Selected rather than the current automatic-eligibility concept, and omits bulk selection. Bind Selected to actual checked transaction IDs. Do not merely rename an auto-selected counter while keeping different behavior.

Retain an accessible bulk-selection action using the existing review pattern. Recommended behavior selects only ready rows and reports unresolved rows; it does not force confirmation of every draft. Do not resurrect R1's compulsory Confirm-all sheet. Counts must distinguish pending-account confirmation from amount/category/currency review and must not falsely imply everything is ready.

### F05 — Removing a suggestion needs a recoverable resulting state

**Transition gap already noted in R2, still not drawn.** Keep all linked transactions, clear their proposed account assignment, and uncheck only rows that became invalid. Never delete financial accounts or discard the transactions. Never fall back to the default when the source explicitly named an account.

Recommendation: show a brief Undo action and a compact “Choose account” issue for affected rows. Do not immediately regenerate the same removed draft from unchanged evidence. Replacing it with an existing account remains possible. Bind whether removal/Undo survives SMS review recovery; Voice remains session-only. No account is created by Confirm, Edit, Remove or Undo.

### F06 — Pickers must disclose which rows will change

**Required interaction binding.** A chooser opened on a transaction affects that transaction only and detaches it from the shared draft. A chooser opened from the shared suggestion menu affects its linked group; its title/helper must name the account and affected count. Closing or cancelling commits nothing.

Show only active, current-user, type/currency-compatible candidates. For ordinary SMS source accounts preserve the Cash exclusion. Display provider/card details only when they exist; wallet candidates need meaningful alternatives. If candidates are deleted or changed while the sheet is open, revalidate and keep the row unresolved. Do not use a profile/person icon as the replacement-account identity when the app already has a shared account icon pattern.

### F07 — The unified section needs all combinations, not just the pictured currency issue

**Required state bindings.** Bind these variants without returning to stacked notices:

- Drafts plus currency/account/amount/category issues: independent compact actionable rows, each opening the relevant transaction(s).
- No drafts, default assignment only: a quiet count/name/Why line with no empty heading or card.
- Issues without drafts: specific issue rows, not a generic duplicate warning.
- No issues/default assignments: omit the section.
- All drafts confirmed: retain quiet editable statuses without making them look like selected transactions.
- No default, or an ineligible default: Choose account; no guessed account.

Group counts refer to the full linked group, even when a filter hides some transactions. Default counts reflect assignments, not selected rows. Save count reflects selection. “Why?” explains automatic default use without permanently hiding required disclosure. Empty filtered results must not show the recording's “No transactions found” state.

### F08 — Similar names must not merge distinct financial accounts

**Identity/contract gap.** Existing local draft dedup uses name, currency and provider identity, not card suffix. Shared QNB/EGP does not prove two different cards are the same account. Current account uniqueness also requires distinct nicknames for separate accounts at the same provider/currency.

Keep incompatible card/type evidence separate and offer editable distinguishing names. Preserve known provider IDs independently of the nickname; do not infer institution identity from a user-edited name. A type change must validate/remove incompatible metadata before confirmation. Existing-account collisions require explicit reuse or a distinct valid nickname, not silent merging. A new draft is not automatically made default.

### F09 — Correcting currency or identity must not spread the correction incorrectly

**Required state contract.** Changing one transaction from EGP to USD detaches/regroups that transaction only. It never changes the currency of the other QNB transactions or a persisted account, and never converts the amount automatically. Currency uncertainty blocks automatic account assignment until resolved.

Confirmation belongs to a validated draft identity. Material edits invalidate that identity's old confirmation; unrelated groups and explicit individual choices survive. After currency correction, use compatible evidence/default rules. Conflicting identities must not inherit another draft's confirmation merely because the visible nickname matches.

### F10 — Default-account copy must reflect source/type eligibility

**Required copy variants.** Keep the approved Bank/Wallet helper. Cash helper must mention Voice and explain that SMS entries use bank/wallet accounts. Do not imply that an explicitly unmatched named bank becomes the default. A default of another currency does not qualify. No default is a supported state, not an error to “repair” by guessing.

Preserve actual Add/Edit form fields and required markers. The approved helper does not authorize removing provider/SMS metadata, changing read-only account currency/type, or changing balance adjustment behavior.

### F11 — Sheets, failures and save boundaries need bindings

**Required implementation/handoff states.** Long lists and enlarged text must scroll, with actions above the runtime bottom inset. Keyboard-open editing must keep Confirm reachable. Define how one sheet opens the next and returns without stacked overlays or losing the group's context. Account-menu actions need adequate touch targets and accessible labels naming the affected account.

Disable duplicate confirmation/save actions during their operation. Failed SMS draft persistence must roll back the apparent success and retain recoverable input. Save creates only draft accounts referenced by valid selected transactions, together with their financial records, through the existing atomic writer. Revalidate owner, deletion, currency and identity before committing. Retry must not duplicate accounts or transactions. Independent valid selections may be saved while another group remains pending; this does not authorize partial writes inside a failed selected batch.

The mockups do not choose a new opening-balance policy. Current SMS save supplies transaction-derived balances for newly prepared accounts (`sms-review-draft-save-service.ts:120`); the generic preparer defaults to zero only when no balance was supplied (`pending-account-service.ts:189`). Reconcile Voice/SMS saving with the established financial service rules; do not invent or reuse an AI-inferred bank balance. Preserve SMS Review later and durable recovery, which are not shown in these Voice examples. Voice draft recovery remains outside this change.

### F12 — Arabic approval still needs the new R2 strings and layout coverage

**Localization binding gap.** Existing Arabic translation approval stands. R2 has new English-only labels and combinations: Review details, View all accounts, independent action menus, Remove/Undo feedback, default Why information and group counts. Provide consistent Arabic equivalents and singular/dual/plural forms before coding; do not claim an English screenshot establishes RTL fidelity.

Use bidi isolation for QNB/CIB, EGP/USD, card suffixes and monetary signs. Confirm localized numeric formatting does not reorder a suffix or change a stored amount. Preserve user-entered names. Verify compact width, enlarged fonts, light/dark mode and RTL action placement through focused layout/unit coverage and the user's manual visual checks; no emulator execution is required by this review.

### F13 — AI response contracts do not yet support the approved UI

**Technical prerequisite, not a reason to redesign the approved screens.** Current Voice context supplies account IDs/names/currencies but lacks provider/type/card identity; its response has no shared draft list, explicit unmatched-name evidence or currency-certainty metadata. Current SMS context has categories and supported currencies, not accounts; its response also lacks shared-draft references and currency certainty.

Define canonical validated response schemas with stable transaction-to-draft references, source evidence, currency resolution and compatible account candidates. Nullable account/currency fields alone cannot distinguish omission, conflict and failed matching. App validation and local dedup remain authoritative. SMS chunk boundaries/retries/recovery need deterministic draft reconciliation; confirmation/editing must not trigger another Gemini request or consume another usage. Validate all returned IDs against owned eligible local records. Do not rely on AI grouping alone to enforce financial identity.

## Before implementation

1. Settle F01 (Add helper placement/control) and F02 (other-currency route); bind the remaining state transitions to the approved concepts.
2. Add exact EN/AR copy, theme, responsive, safe-area and interaction bindings. Record the minor count/disclosure additions instead of silently deviating from these images.
3. Reconcile the existing spec, plan, contracts, business decisions and tasks; do not regenerate tasks from scratch. Run Speckit analysis before worker assignments/production edits.
4. Write a manual scenario list and corresponding unit/integration/E2E coverage. Batch execution of applicable checks; no emulator testing. Device/visual validation remains with the owner.

## Source evidence inspected

- `apps/mobile/app/(private)/add-account.tsx`: complete form; no default switch.
- `docs/business/business-decisions.md:262-312`: currency, identity, default, deletion and SMS matching rules.
- `apps/mobile/services/sms-account-matcher.ts`: source eligibility, matching, Voice default fallback.
- `apps/mobile/services/transaction-review-selection.ts` and `apps/mobile/hooks/useTransactionReviewSelection.ts`: account review reasons and selection/persistence behavior.
- `apps/mobile/services/ai-voice-parser-service.ts:63`, `:127`, `:475`: account context, response schema and currency mapping.
- `apps/mobile/services/ai-sms-parser-service.ts:127` and `apps/mobile/services/ai-sms-parser-response.ts:24`: SMS context and response schema.
- `apps/mobile/services/pending-account-service.ts:176`, `:257`, `:340`: identity dedup, creation and defaults.
- `apps/mobile/services/sms-review-draft-save-service.ts:93`, `:120`, `:241`: revalidation, balances and atomic save.
- `apps/mobile/components/currency/CurrencyPicker.tsx` and `apps/mobile/components/transaction-review/ReviewActionBar.tsx`: existing picker/footer contracts.

Evidence is pinned to the head above; later code changes require a refreshed contract review. Image hashes are verified separately in the approval receipt.
