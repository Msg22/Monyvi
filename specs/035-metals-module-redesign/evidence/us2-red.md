# US2 Red Evidence

Base: `4992ec5bdba3b941eba5939ad4297f4773af85b3`
Date: 2026-09-01
Scope: T075 and T076 only. T077–T080 remain open.

## T075 traceability and manual plan

- Created `manual-tests/us2-add-holding.md` with complete Add, locale,
  precision, unusual-value, unavailable-rate, offline/restart, duplicate,
  physical-form, accessibility, responsive, and timed scenarios.
- Created `coverage/us2.md` mapping FR-008–FR-015, FR-017, and applicable
  SC-002/003/005/010/011/015/021/024/026 to T076–T079 or explicit manual-only
  proof. It makes no Green, persistence, UI, or Maestro claim.

## T076 intended Red command

```text
cd apps/mobile
npx jest --testPathPattern='__tests__/validation/metal-holding-form-validation.test.ts' --no-coverage --runInBand --watchman=false
```

Result: 1 failed suite, 7 failed tests.

```text
Cannot find module '../../validation/metal-holding-form-validation'
from '__tests__/validation/metal-holding-form-validation.test.ts'
```

Every declared category reaches the same missing production validation/preview
boundary in T081 and fails there. This is intended Red, not a Jest,
dependency-junction, or test-runner failure.

Declared contract categories blocked by that missing boundary:

- English, Arabic-Indic/Arabic-separator, and decimal-comma normalization to
  canonical exact decimals.
- Required facts with null unselected purity/currency/date and no empty-ID
  sentinel; Gold/Silver-only catalog matching; optional physical form and notes.
- Stable catalog-v1 `gold-999` tuple for exact `24K · 999`: version `1`, factor
  `0.999`, label key `purity_gold_999`.
- Field-specific finite, positive, three-decimal weight, safe-range,
  currency-minor-unit, and non-future-date validation.
- Policy-driven unusual-value acknowledgment without treating a supported value
  as invalid or routing to a separate review.
- Exact normalized live-preview input and an explicit unavailable valuation that
  leaves valid Add facts submittable.

## Remaining gate status

- T077 command-service/SQLite Red, T078 route/component Red, and T079 Maestro
  Red are deliberately outside this lane.
- T080 remains unchecked because it requires all T076–T079 Red artifacts and
  their combined evidence. This file records T076 only and must not be read as
  completion of T080.
