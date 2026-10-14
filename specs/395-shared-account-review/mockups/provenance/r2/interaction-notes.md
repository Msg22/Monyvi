# Revised account-review interaction proposal

Status: PROPOSED, not approved for implementation.

## Correction from R1

R1's bulk sheet showed CIB without exposing it in the shared suggestion card. R2 lists every distinct draft as its own actionable row (QNB and CIB in 01), and removes compulsory all-at-once confirmation from the primary flow. R1 remains immutable historical proposal material.

## Independent actions

- Each draft has a direct Confirm button and a menu. Confirm QNB updates only QNB's linked group; it does not confirm CIB, check other transactions or create an account.
- Confirmed is a read-only check/text status, not another confirmation button. Its menu still allows editing/replacement/removal.
- Edit suggested account applies to this shared group's linked transactions, explicitly disclosed by its linked count.
- Use an existing account from this shared menu applies to that group after explicit choice of a compatible account. Per-transaction account selection still detaches only that row.
- Remove suggestion dismisses the proposed account ONLY. Keep its linked transactions, clear the proposed account assignment and require a choice for those rows. No real account deletion and no automatic default fallback, because explicit account evidence was present.
- In a confirmed/selected group, removing its assignment must clear invalid linked selection while preserving unrelated groups. A reversible Undo is recommended; its concrete visual state is not depicted here.
- Do not immediately regenerate a removed suggestion from the same unchanged evidence in the current review session. New evidence/retry/durable SMS semantics require contract reconciliation before coding.
- Accounts are persisted only on final Save for referenced selected transactions. Existing dedup, evidence, currency and account-scope rules remain necessary.
- Optional bulk actions cannot be the only way to proceed. The R1 Confirm & select sheet is not the required primary path. The user can confirm one group, leave another unresolved, and save independently valid selected transactions.
- Direct individual checkbox confirmation remains the previously proposed shared-group behavior, with explicit explanatory feedback; no implicit approval of other groups.

## One compact conditional section

- Show Review details when independent draft suggestions or actionable missing information exist.
- Use compact divided rows, not a full card per draft.
- Currency/account issues are actionable summary rows (Review); their matching transaction retains a contextual indicator.
- Remove the generic A little more information is needed banner; the specific rows already explain the outstanding work.
- Default assignment is a quiet inline count/name/Why? note, not a second tall notice card. It is not a warning.
- If only default assignment exists, show only that compact info line above the list; omit an otherwise-empty Review details heading/container.
- If no draft, issue or default assignment exists, omit this section.
- Why? opens the friendly explanation of eligible default assignment and ability to change it. Do not permanently dismiss required assignment disclosure; per-row Default account labels remain.
- When there are many accounts, show a short preview, accurate total and View all N accounts. The sheet provides the complete vertically scrollable list, independent actions and persistent confirmed statuses; no horizontal carousel hides suggestions.
- Account status/counters and default usage counts must respond to confirmation, individual overrides, removals, currency resolution and selection, without counting hidden hard-invalid rows as ready.

## Image facts / scope

- 01: seven total transactions = three QNB drafts + one CIB draft + two ready Cash defaults + one uncertain-currency row. Five need review; two are selected. Four rows are visible, remaining rows are reached by normal scrolling.
- 02: menu scoped to QNB's three transactions, with CIB unchanged and visible behind a dimmed sheet.
- 03: six proposed groups link ten transactions (3+1+2+1+2+1), plus two default transactions = twelve total. QNB's three are confirmed but not selected. Seven draft-linked rows remain unresolved; two default rows are selected.
- Cash default in these Voice examples does not authorize ordinary SMS Cash source matching. SMS continues using eligible bank/wallet source accounts.
- Omitted currency uses preferred currency; ambiguous/conflicting currency requires confirmation before automatic account assignment.
- The third Selected filter remains a visual proposal from R1. Current summary/filter semantics must be reconciled explicitly before implementation; images do not silently alter business rules.
- No forced mandatory Confirm all action. The shared group is the confirmation unit, not the whole batch.
- Same Monyvi tokens/PageHeader/shared rows, normalized 390×844 dp target, actual runtime safe-area insets. Hardware/lighting/raster typography are illustrative.
- Existing matched/default/currency picker/account-helper R1 concepts remain relevant subject to their own pending approval; R2 replaces their stacking/composition, not the settled evidence/currency rules.
- Final exact bindings, translations, responsive adaptations and Speckit reconciliation/analysis remain implementation prerequisites.

