# #395 T065 — Add/Edit default-intent RNTL tests (TESTS ONLY)

Date: 2026-10-16
Exact immutable parent: 508d743ac31b573913dc8e9caceac2eb3a856924
Trusted governance: 503f5a1336ba23f6d270615ce1ba47b02116e4f0
Frozen feature/contract source: 1264134305c126a7836cf09e8f7843609a8c8555
Status: AUTHORED, NOT RUN. No Jest, TypeScript, SQLite, ESLint, formatter, Maestro, native, screenshots, hosted or CI execution. No existing files or production code edited.

## New exclusive test paths

1. apps/mobile/__tests__/components/account-default-intent-form-fixtures.ts
2. apps/mobile/__tests__/components/account-default-intent-form.test.tsx
3. specs/395-shared-account-review/validation/t065-default-form-tests.md (this document)

There are 17 authored RNTL cases. Optional Maestro YAML was not authored, since the new default control selector does not yet exist in source and no real native journey is available.

## Actual source and approved binding

Read the pinned T065 task, Add Account and Edit Account routes, useAccountForm, useCreateAccount, useEditAccountForm, useAccountById, useAccounts, useUpdateAccount, account-service, actual TextField, PageHeader, CurrencyPicker, account type/provider/SMS components, current account locales and earlier focused tests.

B1 approved:
- R3-01 Add default binding revision sha256:66a7911a017944bc207bc8d2beefe1b657526babd67b92b08201ecdf7dc4ba61.
- R3-02 first Cash binding revision sha256:32d8e0076211ff280ef2bbe6ee621d8cc525d3a1a5c236ce6f2cd488cbbd44d6.
- R1-08 Edit helper binding revision sha256:2b3c0f5ee2c45d63d69b5a831fdd6a3949f7804683477b24fd63acd803b2daf5.
Read the owner approval receipt, mockup binding contract, adjustments and R3 interaction/copy notes. Old PENDING headers are historical and superseded by the approved B1 receipt. No image pixel measurements were inferred.

## Harness and source boundary

RNTL renders actual Add/Edit route components and actual form hooks, TextField, default-bearing existing Edit route, CurrencyPicker, institution and SMS controls. It creates a real local Watermelon/SQLite database using current Account, Profile, BankDetails, AccountSmsSender and sibling ledger model classes. Owned, foreign and deleted row fixtures are physical model records. Auth/theme/locale/toast/navigation/native-icon context and unrelated market-rate observation are isolated. The create service is only spied for timing/rejection in the two Save-state tests; no account-default business implementation or fake visual SUT is supplied.

## Case inventory

Add (11):
A01 First CASH forced ON/disabled, named switch, Cash Voice helper, explicit SMS restriction.
A02 Later BANK starts OFF; user ON announces previous Cash replacement, preserves name/balance/provider.
A03 Later OFF does not show replacement; Back leaves persisted accounts untouched.
A04 No prior active default: later OFF, optional ON, never invent prior replacement.
A05 Actual rendered placement: Initial Balance then default flag/helper then existing SMS matching.
A06 Bank provider, account name/focus, input balance, card suffix and sender section survive flag toggle.
A07 Required name and valid opening balance continue controlling Save; accessibility labels intact.
A08 Real hook sends the explicit ON intent and original form once; busy duplicate press rejected, retry state retained.
A09 Stale/failed create gives friendly error without clearing unsaved name, default choice or navigating.
A10 Actual existing Add CurrencyPicker/modal/search reused; no invented transaction context.
A11 Arabic WALLET helper and named OFF accessible state.

Edit (3):
E01 Existing Bank default ON and accessible; B1 Bank helper; original name/balance retained.
E02 Toggle OFF leaves read-only type/currency, provider, sender/card and persisted previous default untouched.
E03 Initially OFF account can toggle ON with dirty Save enabled, without changing unrelated fields.

Copy/presentation/scope (3):
C01 Exact approved EN/AR Bank/Cash/first/replacement/restriction texts exist in actual locale resources; no parsing/token jargon.
C02 B1 star/toggle semantic checked state, dark variants, helper; no new button style or pixel assertion.
C03 Foreign/deleted account rows must not cause wrong first-owned-account default.

## Expected Red vs existing behavior

The immutable parent has no Add default block or defaultIntent field; Edit has a TouchableOpacity default row without accessibilityRole=switch and its old generic helper. EN/AR approved new helper copy is not yet in the account locale files. These are source-confirmed missing features, hence intentional test-first Reds. Exact runtime Red/Green is UNKNOWN: no tests have been run. Existing Add CurrencyPicker, provider/SMS fields, and Edit read-only type/currency remain the unchanged baseline.

## Exact API required before T070 production implementation

Root should approve an authenticated owned default read-state facade with explicit loading, ready or recovery result. It must snapshot the complete active owned account IDs and zero/one active default identity; never infer a first account from foreign/deleted rows or a count-only query. Inconsistent multiple defaults, stale or unprovable snapshots must disable Save and show friendly recovery, without silently guessing or persisting any flag.

Share the existing Edit star/track/helper as a controlled presentational component: checked, disabled, change callback, accessible switch state and label, source/type-aware helper, optional captured prior-default name. Add must supply a validated unsaved defaultIntent through its existing form/create command path. Do not add a post-create Edit toggle or put account-snapshot financial business logic into hooks. Existing Edit semantics, amount fields, provider data and locked type/currency are preserved. UI component and internal read facade names/signatures are NOT frozen by these tests; Root should approve the exact names before authoring.

T072 locale owner may choose implementation keys, but the rendered strings must equal the frozen EN/AR approved text. Cash helper excludes ordinary SMS source fallback. First active Cash/Bank/Wallet is ON/disabled; later starts OFF even if intentional no-default. Changes apply only at the successful atomic local create boundary.

## Proof and limitations

RNTL verifies rendered tree order, accessibility props and event-driven form state, NOT 16/4 dp padding, 22 dp star, 48x28 dp track, 24x24 thumb, 44 dp tap targets, exact screenshot pixels, physical keyboard/insets, RTL screenreader or native animations. Rendered comparison remains T071 and accessibility/device remains T073. The stale create-service rejection proves UI preservation but NOT actual inconsistent multiple-default detection; current SQLite partial-unique index prevents constructing a valid two-active-default fixture, and the Add route lacks the approved default snapshot read API. Root must approve the narrow read seam first. Financial CAS, replay, SQL, postimage and dependency semantics belong to T064/T066/T067/T068. Optional Maestro not authored or executed. No checks were run; any assumptions about Jest compatibility require Root execution.

## Separate T064 follow-up note — do NOT edit T064 in this T065 artifact

The user identified two T064 zero-opening service assertions incorrectly requiring zero action roots. Approved account.create-default/v1 mandates ONE complete metadata/create financial-action root, ZERO financial effects, revision 0 and exact atomic children. Existing legacy zero-create behavior is not the new tuple. After T065 release Root should grant a distinct T064 correction. The prior T064 rollback spy on collection.create does not cover the future prepareCreate plus atomic batch writer; inject failure at the actual new writer/commit seam. The canonical new-tuple action IDs, snapshot/replay/dependency guard tests require the accepted new command API and their own tests-first follow-up. No T064 source or test file changed now.

STOP: T065 tests-only ownership released to Root. No source grant, checks, refs, hosted operations or delegation.
