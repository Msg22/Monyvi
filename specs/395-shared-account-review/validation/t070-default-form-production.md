# #395 T070 Add/Edit default field + T072 approved localized copy — source handoff

**Status:** candidate SOURCE RELEASED for Root consolidated admission; **NOT RUN**. Immutable exact parent `40c0775f5bb3b61af786677f13fc62d08323e66f`, original tree `4a6c9c13b01d367ef6b3fc40a5bc64e570eb16db`. Governing Constitution at `503f5a1336ba23f6d270615ce1ba47b02116e4f0`; feature spec `e012f5a7d2edadc8bc1e2fa2ce03aeea56bc0c947dc02bfc2a3f166150e2c7d0`; approved B1 receipt/manifest sha256 `cf447362f73c91f975f97ecf2295bce1ed8300213f701f6caab181ee997059a0`. None were modified.

## Exact changed-only paths and original Git blobs

| Path | Before at parent | Change |
| --- | --- | --- |
| `apps/mobile/app/(private)/add-account.tsx` | `dbd46c9a31c0817d2b399ccd166e69bf13971d90` | Controlled default field after Initial Balance, before existing SMS matching; owner-readiness/Save gating; explicit defaultIntent request; same-owner intent preservation |
| `apps/mobile/app/(private)/edit-account.tsx` | `b359c38f298172b54f4f0bf2dce196d278de6bc8` | Reuse same field, keep original editable toggle and read-only type/currency; require owner read readiness before Save and before balance-change confirmation |
| `apps/mobile/hooks/useCreateAccount.ts` | `5fdc021a19cfca3375ae32f07b1f4d284dd0a12d` | Additive optional typed pass-through of defaultIntent to existing create service; no financial write in hook |
| `apps/mobile/hooks/useOwnedAccountDefaultState.ts` | **new** | Authenticated, scoped, READ-ONLY active/default observer with loading/ready/recovery and retry; canonical schema validation |
| `apps/mobile/components/accounts/AccountDefaultField.tsx` | **new** | Existing Edit star/track component extracted as controlled checked/disabled switch, exact B1 type/source helper, first and replacement disclosure, recovery notice |
| `apps/mobile/locales/en/accounts.json` | `851f06f2efc5e3f92b8a79757c9484422f1ef05b` | 6 approved account keys; align existing scoped `default_account` EN to exact B1 sentence case |
| `apps/mobile/locales/ar/accounts.json` | `91bffc7e5003a8a584004f882d6aee82b198621b` | matching 6 approved Arabic keys |
| `apps/mobile/locales/en/transactions.json` | `b28ad3362696185bc70e6b3a38ba9e482f648bb6` | 48 scoped B1 keys for Review detail/choices/toolbar/feedback/recovery |
| `apps/mobile/locales/ar/transactions.json` | `82140cfd78f8345c7fd30da5528c8c1a6d6e57d0` | corresponding 48 Arabic keys |
| `apps/mobile/__tests__/components/account-default-intent-form.test.tsx` | `4534ba130c43e0b28542283e038585ac97dd692c` | T065 harness timing only: shared Add/Edit render helpers wait for actual authenticated ready signal; all 17 cases/assertions retained |
| `apps/mobile/e2e/maestro/accounts/account-default-intent.yaml` | **new** | Held, honest, actual-selector Add default ON journey from deterministic owned Cash fixture; no native execution |
| `specs/395-shared-account-review/validation/t072-approved-copy-key-matrix.md` | **new** | 23 approved B1 sidecars/refs inventoried and mapped to scoped locale keys |
| `specs/395-shared-account-review/validation/t070-default-form-production.md` | **new** | This independent source handoff |

## Snapshot read API and safety

`useOwnedAccountDefaultState()` exposes:
```ts
type OwnedAccountDefaultState =
  | { status: "loading"; ownerId: string | null }
  | {
      status: "ready";
      ownerId: string;
      snapshot: AccountDefaultSnapshot;
      defaultAccountName: string | null;
    }
  | { status: "recovery"; ownerId: string | null };
```
plus `retry():void`. The implementation uses existing `useCurrentUser`, `queryOwned(database.get<Account>("accounts"), userId, Q.where("deleted", false))` and `observeWithColumns(["is_default","deleted","name"])`. It excludes foreign/deleted rows by query and explicit owner check; reads **all** active owned UUIDs and zero/one default identity, sorted via canonical JS string order, then `accountDefaultSnapshotSchema.safeParse` checks exact UUIDs/uniqueness/default membership. Multiple defaults, contradictions, noncanonical IDs, sync/observation errors and unauthenticated states return recovery; loading never masquerades as first account. Subscriptions cancel on owner/scope change and old-owner displays are suppressed. No financial create, snapshot write, generic sync, account update, reader-setter mutations or hook-side policy enforcement.

The canonical schema/type currently has no public top-level `@monyvi/logic` barrel export at this exact parent. This read hook explicitly uses its existing package subpath `@monyvi/logic/src/financial-actions/review-batch-save-shapes` and canonical `AccountDefaultSnapshot` type under `account-create-default-shapes`, **not a copied business DTO**. Root/Core should review that package-subpath access at integration and arrange public schema exports under its separate logic-source lease if monorepo packaging disallows subpaths; no logic source was edited here. Writer-side authoritative CAS and default dependency evidence remain solely AddCore T067/T068 responsibility.

## Shared controlled presentation and form behavior

`AccountDefaultField({accountType,checked,disabled,firstOwnedAccount?,previousDefaultName?,onChange})` uses the original Edit 22dp star/star-outline and 48×28/24dp thumb track, minimum 44dp touch target, 16dp/4dp padding, semantic light/dark colors, switch accessibilityRole and exact checked/disabled accessibilityState. It owns **no account** identity/eligibility computation. Helper: BANK/DIGITAL_WALLET new transactions + Voice or SMS only when unnamed and currency matched; CASH new transactions + Voice only, plus explicit SMS Bank/Wallet restriction. The first-owned-account note and replace-previous-owned-default text come from T072 locale resources; user-owned prior account name is only substituted, not translated. No `parser`, `LLM` or token wording.

**Add:** Unresolved auth/read shows loading rather than a misleading OFF/first state; Save disabled. With zero active owned accounts, Add derives forced ON/disabled for CASH/BANK/WALLET; with nonempty active owned set it starts OFF, permits explicit ON (or OFF with no previous default). User intent is held separate from formData so provider, sender, card, currency, name, amount, focus, keyboard, and validation remain untouched. It survives same-owner observation/retry/failure and resets only on authenticated owner change. `handleSave` creates one additive `{...formData,defaultIntent:boolean}` and passes it **once** into `useCreateAccount`; no post-create Edit toggle. With stale/failed Core return, existing Toast/error and unsaved fields remain. The existing Update/Create validation and de-dup guard stay unchanged.

**Edit:** Keeps existing `useEditAccountForm` `isDefault`, `toggleDefault`, original update service, dirty check and balance-change sheet. New shared control renders the approved type-specific helper. Account type/currency remain read-only. Edit Save and the already-open BalanceChangedSheet confirmation both reject when owner/default snapshot is unresolved or inconsistent; no snapshot read mutates existing account or default flag.

**Recovery:** Both forms show existing `common.error_generic` and `common.retry` in an inline labelled retry region when snapshot is unprovable. A retry resubscribes without clearing form or explicit same-owner choice. These are existing approved friendly phrases, not newly invented recovery copy. Native interaction/Focus/screen-reader/a11y proof is separate.

## Important integration dependency, not falsely claimed as complete

At this parent `apps/mobile/services/account-service.ts` and `apps/mobile/validation/account-validation.ts` remain **owned by AddCore** and the original `accountFormSchema` does **not** yet declare `defaultIntent`; its current Zod parsing would strip unknown fields. This lease changes only the UI intent dispatch and hook typed pass-through. **Do not activate or claim full Add default financial persistence until AddCore incorporates the additive validated boolean in its atomic guarded writer, separately checks the canonical full active/default snapshot and commits account/child/default/effect once.** Legacy `useCreateAccount` call signatures stay compatible with optional field; new Add route always supplies a boolean. No financial writer, core validation, registry, SQL, sync or reconciliation files were modified.

## T065 harness/coverage, T072 mapping, and Maestro

T065's **17 original semantic cases** are retained: first Cash, later on/off, no-default, exact field order, bank/provider/card/sender/focus, validity, duplicate Save, stale preservation, real CurrencyPicker, Arabic WALLET, Edit existing on/off, EN/AR approved copy, switch/dark, foreign/deleted scope. The two shared `renderAdd/renderEdit` helpers now `await waitFor(account-default-state-ready)` because a real Watermelon query is necessarily asynchronous. It does not synthesize a ready state or mock the component; existing assertion bodies are untouched. Exact previously authored source did not wait for any read facade, so immediate assertions would conflate loading with empty owner.

T072 detail in `validation/t072-approved-copy-key-matrix.md` inventories **all 23** owner-approved B1 bindings and R3 notes; accounts has five verbatim owner-approved new helper/first/replacement strings plus a dynamic previous-name interpolation, transactions gains 48 EN/AR scoped detail/action/status/copy keys, preserving all existing Review/default plural and source-specific copy. No T054/T061 review runtime mounting, SMS/Voice route action, or locale fallback component source files were edited.

The held Maestro account-default journey uses real `accounts-add-button`, `account-name-input`, `account-default-state-ready`, `account-default-switch`, `institution-picker-trigger-bank/search-bank`, `header-save` and normal Accounts navigation. It requires a deterministic one-Cash-owned default fixture named `Test Wallet` and the not-yet-activated AddCore writer. **Auth/bootstrap, physical checked state and balance/default/effect persistence are not proved by this YAML.**

## Acceptance limits and stop gate

**NOT RUN:** T065 RNTL17, legacy Add/Edit and form hooks, TS, ESLint, formatting, Maestro, emulator, native device, visual B1 overlays, Accessibility Inspector, screen reader, keyboard, owner recovery/inconsistency injection, real guarded Add command, financial SQL/sync/provider/hosted. T065 receipt is tests authored, not current Green. Owner consolidated verification, independent code/security review, AddCore field/atomic writer admission, T071 rendered and T073 a11y/device proof, and explicit activation/publish approval all remain required.

No unauthorized source/SQL/branch/ref/push/PR/native/delegation/Codex handoff. **SOURCE RELEASED — STOP.**
