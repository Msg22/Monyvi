# #395 T065 — Add/Edit form runtime fixture repair

**Authority and scope:** TEST-HARNESS-ONLY correction against immutable parent `9b087d89e29f9fe8fa278f9b62d8ea996e5fdbfb` (tree `e1aa20eb73c5c19b0ff05e6bf243f75dae92b3de`). Root's last actual grouped admission was **10 PASS / 7 FAIL out of 17 loaded form tests**. No runtime checks performed in this authoring lease. No source/default-control/validation/business/mock service changes.

## Changed-only inventory

| File | Parent blob | Authored blob |
| --- | --- | --- |
| `apps/mobile/__tests__/components/account-default-intent-form.test.tsx` | `70da5312ff9a36ef828fe4378fa9a903d6fcf54a` | `2774468325f9892b23ddfb93a431f7a5bd92a4f5` |
| `specs/395-shared-account-review/validation/t065-form-runtime-fixture-repair.md` | NEW | This report |

`account-default-intent-form-fixtures.ts` is unchanged: the original real SQLite `Database`, generated schema, test model classes, seeded default account and bank/sender children are retained, with no additional synthetic records. No global Jest changes or replacement form hooks/routes.

## Actual failure classifications and narrow correction

### Disabled button: test-host assertion error, not lost validation

The existing `PageHeader` presentation-only mock creates the **real React Native `TouchableOpacity`** and passes `disabled: Boolean(rightAction.disabled || rightAction.loading)` and the real `rightAction.onPress`. React Native consumes the JS `disabled` prop at its composite/host boundary, so an assertion that directly reads `disabled` from a rendered host element is not the semantic disabled-state contract. All existing `header-save` disabled checks were changed to React Native Testing Library's `toBeDisabled()`; successful readiness checks use `toBeEnabled()`. First invalid/empty account name, invalid balance, pending uniqueness and submit-in-progress must still disable Save. No mock button behavior was altered, and no invalid input is treated as valid.

### Save timing: assert actual readiness, preserve duplicate-submit and stale error

The `useAccountForm` source runs a debounced asynchronous `checkAccountNameUniqueness` and derives `isValid` from the **real** Zod account form schema, uniqueness busy flag and collision result. Both the deferred-save and stale-feedback cases must wait for an **actually enabled** Save touch target via bounded `waitFor` before pressing, rather than treating the initial asynchronous loading/validation state as a failed command. The deferred double-submit case additionally waits for one actual account-service call and verifies the displayed button becomes truly disabled while the deferred writer remains pending, before issuing the second press and asserting one call. The stale-state case still requires original name/balance/default preference and the actual error toast after writer refusal. All real validation hooks, owner-scoped reads, spinner and call semantics remain in place.

### Provider CIB: virtualized real InstitutionPicker selection, not a missing bank

The real `components/add-account/InstitutionPicker.tsx` reads `getSelectableEgyptianInstitutions("bank")` and displays rows inside a `FlatList`, whose initial render need not include the CIB row. The old test opened the picker then immediately queried literal `CIB (Commercial International Bank)`; that does not establish that the valid CIB option was actually searched/visible. The repaired test follows the existing functional `InstitutionPicker.test.tsx` contract: open by the real localized accessible label, enter `CIB` into the actual `institution_search_placeholder`, await the real CIB catalog row, press it, then verify that the **real selected bank trigger** continues to display `CIB (Commercial International Bank)` both before and after toggling default. It retains the originally tested name focus, initial balance, card last four digits and SMS section, and additionally types `SalaryCIB` into the actual `SenderChipsField` and confirms the custom sender chip survives the toggle. No provider list, picker, form, eligibility or sender mock was added.

### CurrencyPicker: two real i18next consumers, only one initialized previously

The test's `makeI18n` initialized a private `createInstance().use(initReactI18next)` instance for the `I18nextProvider` tree. But `utils/currency-localization.ts` imports global `t` **directly from `i18next`**, and `CurrencyPicker` calls `currencyMatchesQuery` on search, which invokes `getCurrencyName(code, "en").toLowerCase()`. Because the global singleton had no completed initialization, it could return `undefined` in this fixture instead of the documented localized currency name/fallback, causing an unrelated test crash. The repaired setup first initializes the actual global `i18next` singleton with the **same shipped EN/AR `accounts` and `common` JSON catalogs** and correct language/namespace options, then constructs the original per-render React i18n instance as before. This follows the independently passing `currency-localization.test.ts` approach. It does **not** mock or bypass CurrencyPicker, `getCurrencyName`, `currencyMatchesQuery`, canonical currency codes, or the real picker search, and it preserves all USD/EGP assertions.

## Coverage, non-scope and next gate

All **17 existing `it` cases** remain with their full Add-first/later/no-default semantics, Edit ON/OFF semantics, EN/AR approved helper copy, keyboard/focus/name/balance/provider/sender/card preservation, owner/default async read, real SQLite persistence, and unrelated/deleted owner exclusion. No skip, time-based sleep, fake successful validation, assert-always-enabled control, or source/mock SUT substitution. All changes are to the existing test file; fixture helper remained untouched.

**Fixture-vs-source finding:** the three failure categories described by Root are explained by native host prop representation, asynchronous readiness, virtualized picker selection and missing global translator initialization. The actual production picker uses the valid CIB catalog and the currency helper's shipped locale resources. No specific production defect is demonstrated from these failures, so **no source path is proposed for editing** without a new Red after this fix. If a genuine new source failure appears, Root should report the precise validated branch and separately reopen an exclusive source lease.

**NOT RUN:** Jest, React Native tests, actual SQLite, TypeScript, lint, formatter, generator, CI, SQL, provider, hosted Supabase, native, emulator, device, or Maestro. Root alone owns next grouped check and all activation gates. No Git refs/branches/push/PR/comments, other files, delegation or Codex handoff.

**T065 TEST-HARNESS SOURCE RELEASED — OWNERSHIP FROZEN — STOP.**
