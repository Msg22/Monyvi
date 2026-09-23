# US2 Red Evidence

Base: `8d34c15248711507d31a65b042b633eb22c9c8c9`
Date: 2026-09-23
Scope: T075–T080.

## T075 traceability and manual plan

- Created `manual-tests/us2-add-holding.md` with complete Add, locale,
  precision, unusual-value, unavailable-rate, offline/restart, duplicate,
  physical-form, accessibility, responsive, and timed scenarios.
- Created `coverage/us2.md` mapping FR-008–FR-015, FR-017, and applicable
  SC-002/003/005/010/011/015/021/024/026 to T076–T079 or explicit manual-only
  proof.

## T076 intended Red execution

```bash
npm --prefix apps/mobile test -- metal-holding-form-validation.test.ts
```

Result: 1 failed suite, 7 failed tests.

```text
FAIL __tests__/validation/metal-holding-form-validation.test.ts
Cannot find module '../../validation/metal-holding-form-validation' from '__tests__/validation/metal-holding-form-validation.test.ts'
```

Every declared category reaches the missing production validation/preview
boundary and fails there as intended Red:
- English, Arabic-Indic/Arabic-separator, and decimal-comma normalization to canonical exact decimals.
- Required facts with null unselected purity/currency/date and no empty-ID sentinel; Gold/Silver-only catalog matching; optional physical form and notes.
- Stable catalog-v1 `gold-999` tuple for exact `24K · 999`: version `1`, factor `0.999`, label key `purity_gold_999`.
- Field-specific finite, positive, three-decimal weight, safe-range, currency-minor-unit, and non-future-date validation.
- Policy-driven unusual-value acknowledgment without treating a supported value as invalid or routing to a separate review.
- Exact normalized live-preview input and an explicit unavailable valuation that leaves valid Add facts submittable.

## T077 intended Red execution

```bash
npm --prefix apps/mobile test -- add-metal-holding-command-service.integration.test.ts
```

Result: 1 failed suite, 5 failed tests.

```text
FAIL __tests__/services/add-metal-holding-command-service.integration.test.ts
Cannot find module '../../services/add-metal-holding-command-service' from '__tests__/services/add-metal-holding-command-service.integration.test.ts'
```

All five cases reached the missing scoped Add command boundary:
- One complete exact linked action group.
- Stable replay and payload-mismatch rejection.
- All-row rollback on local failure.
- Current-owner enforcement.
- Rate snapshot handling while retaining a `sync_pending` holding state.

## T078 intended Red execution

```bash
npm --prefix apps/mobile test -- metals-add.test.tsx
```

Result: 1 failed suite, 7 failed tests.

```text
FAIL __tests__/app/metals-add.test.tsx
Could not locate module @/components/metals/MetalHoldingForm
Could not locate module @/app/(private)/metals/add
```

The seven cases reached the missing `MetalHoldingForm` and Add route boundaries:
- Canonical full-form order, ordinary and compact Weight/Purity layout, 200% text, EN/Arabic RTL, light/dark, labels, and Skeleton loading state.
- Gold/Silver form facts, Monyvi supplied render, exact `24K · 999` identity, direct Add with no review screen, and unavailable valuation that does not disable Add.
- Safe-area CTA, first validation-error focus, dirty-exit request, and pending-submission double-tap lock.
- Route-level mounting of the full form directly.

## T079 authored Maestro journey

`apps/mobile/e2e/maestro/metals/add-holding.yaml` defines runner-controlled Gold, Silver, validation, and restart journeys.

## T080 Status

T076–T078 failing test evidence confirmed and recorded. Proceeding to T081/T082 Green implementation.
