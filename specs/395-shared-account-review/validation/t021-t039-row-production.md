# #395 T021/T039 — row presentation source and bounded test hygiene

**Handoff:** SOURCE RELEASED, exact immutable parent `c7c7a892bee5ef8c823842633b1178a83b7a4f65` (parent tree `263907103e853f211c8a34cfdcc94fc105788027`). **NOT RUN.** Root alone owns the grouped admission and independent review; T039 modal/route wiring remains later owned work.

## Changed-only sources and provenance

| File | Before parent blob | Delivered change |
| --- | --- | --- |
| `apps/mobile/components/transaction-review/TransactionItem.tsx` | `9d1121c4e9140f1346179be0f348814d5a713c46` | Optional parent-shaped `accountReview` field, guarded busy checkbox, independent sibling presentation, complete memo field/callback comparison |
| `apps/mobile/components/transaction-review/account-review-row-presentation.tsx` | **absent** | New cohesive display-only UI/actions and explicit status tone/icon mapping |
| `apps/mobile/__tests__/components/account-review-panel.test.tsx` | `7a8c765a89fac703137bf8309d473ecf31bdd33b` | **ONE assertion only:** `expect(ready.props.disabled).toBe(true)` replaced with `expect(ready).toBeDisabled()`; pre-existing `accessibilityState.disabled`, press and no-callback assertions intact |
| `apps/mobile/__tests__/components/account-review-transaction-item.test.tsx` | `cf254efb59102175e5733b93b69c6a6b72773aac` | No test removals: replace three unsafe `props.accessibilityState` accesses with `toHaveProp("accessibilityState", ...)`, use semantic `toBeDisabled()` instead of unsafe native `props.disabled`; busy-checkbox property assertion uses `objectContaining({disabled:true})` to retain checked state |
| `specs/395-shared-account-review/validation/t021-t039-row-production.md` | **absent** | This report |

No edits to canonical logic, T057/T059, other fixtures, panel source, existing approved chooser/picker files, locale dictionaries, shell/routes, service/hook, persistence, Undo, private schema, SQL, sync, financial writer, or governance.

## Trusted approvals and admitted dependency evidence

Governance `c02a773613f9b6ebc5ca01aae02dd41863fd0e90`, frontend persona/team-led workflow, separately approved Constitution1.8 `503f5a1336ba23f6d270615ce1ba47b02116e4f0`, frozen #395 spec sha256 `e012f5a7d2edadc8bc1e2fa2ce03aeea56bc0c947dc02bfc2a3f166150e2c7d0`, and B1 binding manifest sha256 `cf447362f73c91f975f97ecf2295bce1ed8300213f701f6caab181ee997059a0` remain unchanged.

The exact parent already contains admitted `AccountChoiceSheet.tsx` (blob `56b869da8e4e359a69ec35fb15a90cf3da7f120f`), `CurrencyConfirmationSheet.tsx` (blob `f630a78fbcd970afbe07f6564d5759efe813dbbb`), `account-review-choice-presentation.tsx` (blob `5c09e5e7300019d4f2a18ceb7ddc97353b7b6302`), and existing `CurrencyPicker.tsx` (blob `fc420f93aea6f0b02c9424d9ee298cbf617c6311`). This row work **does not** recreate, mock, mount, or alter these components.

## API implementation: optional, shaped, pure presentation

`TransactionItem` accepts an **optional** `accountReview?: AccountReviewRowPresentationProps`. When absent, existing account chip, edit/checkbox, amount, category, source icon, voice/SMS metadata, SMS discard, expansion, theme and accessibility semantics remain as previously implemented. No extra row block is rendered.

```ts
export interface AccountReviewRowPresentationProps {
  readonly rowId: AccountReviewRow["rowId"];
  readonly accountActionLabel: string | null;
  readonly accountStatusLabel: string | null;
  readonly sharedSelectionDisclosure: string | null;
  readonly currencyActionLabel: string | null;
  readonly currencyContextLabel: string | null;
  readonly accountStatusTone?: "pending" | "confirmed" | "removed";
  readonly isBusy: boolean;
  readonly onChooseAccount: (rowId: AccountReviewRow["rowId"]) => void;
  readonly onChooseCurrency: (
    rowId: AccountReviewRow["rowId"],
    contextLabel: string
  ) => void;
}
```

The optional tone is **presentation-only**, explicitly supplied by the future parent rather than inferred from translated status labels; present uses gold800/400 + `time-outline`, confirmed uses nileGreen700/400 + `checkmark-circle-outline`, removed uses red600/500 + `close-circle-outline`. If no tone is supplied, use neutral slate/info-icon rather than guessing the account state. EN/AR copy remains parent-provided and user account names are not translated.

New scoped named testIDs: `account-review-row-account-action`, `account-review-row-currency-action`, `account-review-row-status`, `account-review-row-shared-disclosure`. The action buttons retain 44dp touch minimum, semantic `accessibilityRole="button"`, accessible labels, and `accessibilityState.disabled`. Rendering reflows using the existing centralized `shouldUseDenseRowCompactLayout`, mirrors action order for Arabic RTL, wraps long labels and disclosures, and uses the approved light/dark tokens. TouchableOpacity never receives NativeWind alpha/opacity/shadow classes; alpha/background composition is not added to interactive controls.

Account action invokes `onChooseAccount(rowId)` only. Currency action invokes `onChooseCurrency(rowId, currencyContextLabel)` only, and **fails closed disabled when contextual label is missing**, rather than inventing a currency or picker state. The real approved chooser and picker remain parent-owned and may be mounted by the later integration lane; this is **not full T039 route wiring**. Neither action calls the existing `onPress` row-edit or `onToggleSelect` checkbox callbacks.

When `accountReview.isBusy` is true, account/currency controls and the canonical original checkbox expose disabled accessibility; a defensive handler guard blocks selection even if a test synthesizes the press. Original row-edit, expansion and SMS controls remain unchanged. On prop update, React.memo's existing comparator now includes all shaped values, optional tone and both callback identities, including busy transitions, preventing stale visible disclosures or callback closure while preserving legacy memo behavior for identical effective props. A completely empty set of shaped labels/actions renders no extra row gap.

No eligibility/default/currency/group/Save/reducer computation is in UI. All legacy review badges remain driven by the accepted narrow `TransactionReviewMeta`; the code does not widen its historical reason union or infer eligibility from strings.

## Approved B1 coverage and frozen cases

- **R3-07/default-only:** Cash accepted default remains visible and editable without inserting account-only blocker; original amount/category reasons still displayed from legacy `reviewMeta`. **R3-05/QNB3+CIB1:** independent pending group identity/disclosure, one clicked row selection callback only; no group-wide checkbox action. **R3-09:** confirmed status and latest parent-shaped label without implicit selection.
- **R3-06:** removed QNB returns unassigned/Choose account, does not invent Cash default or Undo inside row. **R1-03/R1-12:** ambiguous compatible accounts remain unselected, one-row chooser callback and Arabic accessible label. **R1-11/R3-03/R3-04:** currency conflict delegates to parent with exact transaction-context label, no inline/duplicate CurrencyPicker; numeric amount untouched. **R3-15:** RTL and mixed-label text/disclosure. Responsive 340/390/font scale1.35 coverage is semantic, not rendered geometry proof.
- Existing legacy TransactionItem behavior, the parent-controlled T031 group actions, R3 filtering/toolbar, source headers, and Save remain untouched. Other owners handle the actual accepted T038 sheet visibility, candidate selection and source-specific route action handling.
- Frozen tests preserved: **22 T021/T039 row case instances** and **17 T058 panel case instances**. Only the requested test-harness assertions were updated; no scenarios, cases, callbacks, or meaningful expectations were removed.
- Root's **prior** grouped observation: row **3 PASS / 19 missing-presentation FAIL** (22 total), panel **16 PASS / 1 host-view `disabled` property failure** (17 total), all existing legacy TransactionItem/chooser/NativeWind/picker suites PASS. These are *pre-change* observations, not results of this unreferenced commit. No new Green is claimed.

## Validation and remaining gates

**NOT RUN** by this worker: Jest, pure regression, TypeScript, ESLint, formatter, source-build, Maestro, emulator/native, provider, hosted DB, rendered screenshot/B1 pixel comparison, screen-reader/focus, RTL/large-font/keyboard/native inset/device evidence. Root must run the consolidated grouped admission and independent review. T039 route/modal wiring and T054/T061 shell/Save remain explicitly held. If a new failure is a harness issue, classify it separately; no speculative test weakening or cross-owner source edits.

**No Git refs, branches, pushes, PR/comments/issues, local checks, hosted state changes, native work, or Codex/delegation. SOURCE RELEASED; STOP.**
