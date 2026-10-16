# #395 — T068 Add hygiene / test physical-model typing

**Date:** 2026-10-16  
**Immutable GitData parent:** `94a4dde09a5c97b022e57abb9320bede80f9a283`  
**Parent tree:** `5cf3ba16f62f94ebd779621ffd77a9362e2f6208`  
**Scope:** exactly five existing files plus this new validation report; no source/feature behavior change is intended.  
**Checks:** **NOT RUN** — Root owns consolidated TypeScript, lint, Jest, physical SQLite, native/SQL/CI and final acceptance.

## Corrections

1. `apps/mobile/services/account-default-intent-service.ts`: removed the unused type-only `Database` and `Account` imports. The DI contract, validated intent, owned snapshot read, frozen command, Foundation plan and replay path remain byte-for-byte otherwise unchanged.

2. `apps/mobile/hooks/useOwnedAccountDefaultState.ts`: combined the duplicate `@monyvi/db` imports into `import { database, type Account } from "@monyvi/db";`. No owner filtering, observable lifecycle, logical snapshot validation, recovery, retry or current-state semantics changed.

3. `apps/mobile/__tests__/services/account-default-intent.test.ts` (16 original cases preserved) and `apps/mobile/__tests__/services/account-default-intent-atomic.sqlite.integration.test.ts` (14 original cases preserved): replaced the dynamically reconstructed `@monyvi/db` Jest module exports produced via `...Object.fromEntries(models.map((model) => [model.name, model]))` with **explicit named classes** from the existing actual `account-review-save-ledger-models` module. The real `LEDGER_MODEL_CLASSES`, SQLiteAdapter, database singleton for the fixture, schema and Watermelon `Q` remain the same. The named physical exports are `Account`, `AccountFinancialEffect`, `AccountSmsSender`, `BankDetails`, `Category`, `FinancialActionGroup`, `Transaction`, `Transfer`, `SmsReviewQueue`, `SmsReviewDraftItem` and `DismissedSmsFingerprint`. All these classes come from the existing real DB model registry. No fake domain model, aliased DTO, raw namespace spread, `any`, cast or test-only production seam introduced. No original assertions altered. The reported unsafe dynamic module export spreads were the pertinent raw spreads actually present in these authorized test files; there were no `Model._raw` spreads at the cited line numbers in the immutable parent.

4. `apps/mobile/__tests__/components/account-default-intent-form.test.tsx`: uses `import { createInstance, type i18n } from "i18next"` and `createInstance()`, removing the default-import named-method warning. All 17 original Add/Edit/default control tests, the narrowly scoped unrelated navigation PageHeader mock, actual feature hooks/fields and SQLite fixture remain unchanged.

5. **NEW** `specs/395-shared-account-review/validation/t068-add-hygiene.md`: this report.

## Evidence and non-goals

The supplied attachment `395-t046-production-correction.patch` covers distinct T046 Review files outside this lease; it was read for scope verification and **not applied**. No foundation, Recovery, Storage, Review financial logic, account default business command, Add/Edit screen, component, locale, SQL, schema, user-settings or provider file was changed.

This is a static source-only hygiene repair, **not** an executable acceptance result. Retaining the same classes and callbacks is an authored-diff claim, not a new physical SQLite execution receipt. Previous Root baselines and admissions are not promoted to Green by these edits. Root must run the complete consolidated battery against the imported exact objects.

**NO** Jest, TypeScript, ESLint, formatter, DB/SQLite, pgTAP, hosted service, provider, emulator/native, or CI checks. **NO** refs, push, PR, deploy, delegation or Codex handoff.

**SOURCE RELEASED — STOP.**
