# #395 — T021/T039 transaction-row tests-first handoff

**Status: TESTS-ONLY SOURCE RELEASED; NOT RUN.** Immutable exact parent:
`0160dbc20ace784bad2829f6b8753e774159cfd1` with parent tree
`ebb8299830d00618330c7eb22fd8d010fb2d7c67`.

## Authority, source and boundaries

Governing `AGENTS.md`, `.agent/workflows/team-led-delivery.md` and
`.agents/personas/frontend-developer.md` at
`c02a773613f9b6ebc5ca01aae02dd41863fd0e90`; technical Constitution
1.8.0 at `503f5a1336ba23f6d270615ce1ba47b02116e4f0`. Immutable
`specs/395-shared-account-review/{spec,plan,tasks,pre-plan-review}.md`, B1
manifest and scoped sidecars at `1264134305c126a7836cf09e8f7843609a8c8555`.
Approved spec sha256
`e012f5a7d2edadc8bc1e2fa2ce03aeea56bc0c947dc02bfc2a3f166150e2c7d0`;
B1 revision sha256
`cf447362f73c91f975f97ecf2295bce1ed8300213f701f6caab181ee997059a0`.
No new mockups, product decisions or copy.

Actual source read at exact parent:
- `apps/mobile/components/transaction-review/TransactionItem.tsx` blob `9d1121c4e9140f1346179be0f348814d5a713c46` (515 lines), old props, check/select/edit/expansion, account chip, memo comparator;
- `apps/mobile/contracts/transaction-review.ts` blob `69d9fc4c72daae869a43a472df632a1de76d3bb2` (legacy reason vocabulary only);
- `apps/mobile/components/transaction-review/get-transaction-badges.ts`, `TransactionReview.tsx`, existing `CurrencyPicker.tsx` blob `30e0cdb00e2062cc99f9b90edb11fa7db555f994`, T018/T026/T060 and TransactionItem tests and fixture contracts.
- The T038 `AccountChoiceSheet.tsx`, `CurrencyConfirmationSheet.tsx` and T035 choice component suite are **not present** at this parent; root/other lanes may own later publication. Do not fabricate these SUTs or picker support here.
- T021/T039 `TransactionItem` production, T054/T061 review shell/save, lifecycle hooks, picker additions and locales are HELD. Test-only row requirements must not be mistaken for production authorization.

## Changed-only inventory and before blobs

| Path | Before | Change |
| --- | --- | --- |
| `packages/logic/src/account-review/__tests__/read-model.test.ts` | `d7cbe584023e31280dc41a56481004f6af3c1be7` | **Narrow typing hygiene only:** `batchCommand` return type is `Extract<AccountReviewCommand, { kind: "select_ready" \| "clear_selection" }>`; after canonical schema parsing, explicit discriminant narrowing rejects other commands. No cast, copied union, eligibility change or assertion change. All original 10 test cases remain. |
| `apps/mobile/__tests__/components/account-review-transaction-item.test.tsx` | absent | **New** actual `TransactionItem` presentation integration tests: 19 named cases plus three variants of one parameterized case, **22 instantiated cases total**. No mocked SUT. |
| `apps/mobile/__tests__/components/account-review-transaction-item-test-fixtures.ts` | absent | **New** cohesive typed fixture using existing T018 canonical review sessions and T026 B1 group display data; no fake account/currency business union. |
| `specs/395-shared-account-review/validation/t021-t039-row-integration-tests.md` | absent | This handoff. |

All other files remain byte-for-byte as the source parent. The two new row tests do not change existing T018/T026/T058 test cases, snapshots or fixtures. **No** code in app production, routes, hooks, model, services, storage, SQL, locales, sync or external provider.

## Proposed minimal shaped row presentation API (for Root review, not implemented)

The T021/T039 UI writer can add one optional `accountReview` prop to the **existing**
`TransactionItem`. New tests construct a typed intersection with the actual
`ComponentProps<typeof TransactionItem>`; JSX spreads the extra view prop into
the **real** component without a cast, so the current component simply ignores
it and behavior assertions should fail. There is no alternate test renderer
and no mocked `TransactionItem`.

```ts
interface ShapedAccountReviewRow {
  readonly rowId: AccountReviewRow["rowId"];
  readonly accountActionLabel: string | null;
  readonly accountStatusLabel: string | null;
  readonly sharedSelectionDisclosure: string | null;
  readonly currencyActionLabel: string | null;
  readonly currencyContextLabel: string | null;
  readonly isBusy: boolean;
  readonly onChooseAccount: (rowId: AccountReviewRow["rowId"]) => void;
  readonly onChooseCurrency: (
    rowId: AccountReviewRow["rowId"],
    contextLabel: string
  ) => void;
}
```

**Only display information and parent callbacks.** The account name continues
through the existing `accountName` prop; the selection uses the original
`isSelected`/`onToggleSelect(index)` boundary, and the existing
`reviewMeta: TransactionReviewMeta` retains its current legacy badge
presentation rather than widening that narrow legacy reason vocabulary to
the canonical `AccountReviewReason` union. Any canonical account eligibility,
currency certainty, default fallback, grouping, row-to-group selection
confirmation, action validation or Save belongs upstream. New row triggers
must not import reducers, services, databases, providers or a new picker.

Proposed new row identifiers:

- `account-review-row-account-action`: explicit per-row choose/change button, receives initiating canonical row ID, distinct from the existing `transaction-review-edit-action` and checkbox;
- `account-review-row-currency-action`: separate approved Confirm currency trigger, forwards canonical row ID **and** parent-shaped transaction context;
- `account-review-row-status`: parent-shaped pending/confirmed/removed status;
- `account-review-row-shared-disclosure`: complete untruncated shared-effect copy.

Existing IDs and content remain: `transaction-review-row`, `transaction-review-edit-action`, `transaction-account-match`, `transaction-review-amount`, category, provider icon, checkbox, SMS discard/expand behavior. Existing row semantics should remain without `accountReview`. Optional `accountReview` does **not** authorize changing legacy consumers automatically.

T039 must open the **parent-owned** account chooser or existing currency picker through callbacks. The row does not enumerate matches, infer QNB account/card details, choose a currency, display another modal or apply group replacement. Actual current `CurrencyPicker` still has required `selectedCurrency: CurrencyType` and no context prop; the approved unconfirmed-null/context adaptation belongs to separately owned T037/T039 and remains **NOT IMPLEMENTED OR TESTED** in this lease. The row test covers forwarding the exact `For Lunch at Talabat` context with no implied account/currency choice or numeric amount change; it intentionally does **not** claim an end-to-end picker session.

## Authored case inventory — 19 definitions / 22 instantiated cases

| IDs | What the real row must prove | Approved B1 |
| --- | --- | --- |
| R01 | Legacy TransactionItem without new prop retains original account chip, amount, edit and no new actions | existing legacy UI |
| R02–R05 | Eligible Cash default remains editable; no account-only warning; category and amount blockers survive; edit/select/account callbacks independent; parent-updated label preserves source amount | R3-07/R3-05, R3-12 disclosure separately T018 |
| R06 | Pending QNB3 identity and shared-effect disclosure (all three), no invented account options | R3-05 |
| R07 | Three QNB rows render real checkboxes; clicking only row 2 calls `onToggleSelect(1)`; sibling T031 Confirm callback untouched and no other row selected | R3-05, R2-02 |
| R08 | Parent-confirmed QNB status supersedes pending with checkbox still unchanged | R3-09 |
| R09 | Removed QNB retains transaction, no accidental Cash/default, permits only per-row Choose account; Undo remains T031 | R3-06 |
| R10 | Ambiguous choice has no preselected QNB bank/card candidates or phantom default; opens one per-row parent action | R1-03 |
| R11–R12 | Currency conflict forwards parent callback with exact contextual label, no embedded picker/auto-confirm; unchanged/cancelled state commits nothing | R1-11, R3-03/04 |
| R13 | Arabic chooser action forwards only initiating row ID with accessible name | R1-12 |
| R14–R15 | Saving/busy disables new choice and selection controls; parent-cleared busy state re-enables without reinterpreting source | B1 loading/failure/accessibility |
| R16 | Rebound parent assignment clears stale pending disclosure/status immediately | FR-010/012, R3-05/09 |
| R17 | Width 390, 340 and font scale 1.35 keep separate account touch target and untruncated disclosure (three variants); actual geometry remains device-only | B1 responsive |
| R18 | Arabic QNB disclosure retains linked-count Arabic meaning and mixed identity without truncation | R3-15 |
| R19 | `React.memo` comparator must observe changed shaped props and latest callback with legacy fields stable; no stale click closure | T021/T039 lifecycle |
| R20 | Existing light/dark row surface/edit and NativeWind `TouchableOpacity` alpha/shadow restriction; no extra matching candidates | existing UI/B1 |

**Case-count notation:** the source actually has 19 plain `it(...)` declarations plus one `it.each(...)` declaration expanded three times: **20 declarations, 22 instances**. The paragraph above uses "19 definitions" to mean the 19 non-parameterized declarations. All are authored and have **not** been executed. Test fixture construction reads canonical `makeDefaultInfoSession("r3-default-only" | "r3-combined-en")` for actual parsed transaction fields, and existing `makeSharedPresentation` and `requireGroup` for display-only group copy. No copied transaction DTO, account enum, currency rule or provider call.

## Readiness, boundary and next gate

- **NOT RUN**: Jest (new row suite or existing T057 10 cases), Jest RNTL E2E, TypeScript, lint, formatter, Nx, consolidated batch, Maestro, emulator/device, locale-rendered screenshot, native RTL, large fonts, screen reader, keyboard or inset proof.
- **Expected Red:** at the original parent, the live `TransactionItem` has no `accountReview` surface, no per-row account/currency buttons/status/disclosure and no memo comparison for that prop. The baseline legacy case should remain green; account-review cases are expected **behavioral** failures when Root executes them. No Red/Green claims without actual execution. If Root finds an unrelated test harness/setup failure or a type error, classify it separately and return a tests-only correction before a production grant.
- The T057 narrow `Extract<...>` hygiene does not change any behavior, Zod schema, original 10 test cases or reducer code.
- **T021/T039 source, T054/T061 review shell and Save, T037 picker and all hook/storage/Undo/Add/SQL paths remain HELD** pending Root's dependency and Red assessment. Integration writer must preserve original `TransactionItem` memo/selection/expansion and existing sibling behavior; no account policy or financial logic in UI.
- Root alone executes one consolidated check and independent review, then selects a separately bounded non-overlapping source owner. No branch/ref move, push, PR, hosted mutation, provider, native work or Codex handoff here. **STOP.**
