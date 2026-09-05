# US2 Red Evidence

Base: `9c08cef4261cea417c76694c716257e250969498` Date: 2026-09-01 Scope:
T075–T078. T079 and T080 remain open.

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

## T078 intended Red command

```text
node E:/Work/My Projects/Monyvi-metals-us2-add-red/node_modules/jest/bin/jest.js --config E:/Work/My Projects/Monyvi-metals-us2-add-red/apps/mobile/jest.config.js --runInBand --testPathPattern='metals-add.test.tsx' --no-coverage --watchman=false
```

Result: 1 failed suite, 7 failed tests, in 6.845 seconds.

```text
Could not locate module @/components/metals/MetalHoldingForm
Could not locate module @/app/(private)/metals/add
```

The six full-form cases reach the missing `MetalHoldingForm` boundary and the
route case reaches the missing Add route. This is intended Red, not a native,
router, DB, or dependency-junction failure. The neighboring `index.test.tsx`
completed Green (1 suite, 4 tests), confirming the mobile Jest harness.

Declared UI contract categories blocked by those boundaries:

- canonical full-form order, ordinary and compact Weight/Purity layout, 200%
  text, EN/Arabic RTL, light/dark, labels, and Skeleton loading state;
- Gold/Silver form facts, Monyvi supplied render, exact `24K · 999` identity,
  direct Add with no review screen, and unavailable valuation that does not
  disable Add;
- safe-area CTA, first validation-error focus, dirty-exit request, and a
  pending-submission double-tap lock.

## T077 intended Red command

```text
node node_modules/jest/bin/jest.js --config apps/mobile/jest.config.js --runInBand --testPathPattern='add-metal-holding-command-service.integration.test.ts' --no-coverage --watchman=false
```

Result: 1 failed suite, 5 failed tests, in 11.298 seconds.

```text
Cannot find module '../../services/add-metal-holding-command-service'
```

All five cases reached the missing scoped Add command boundary after the real
schema-v27 SQLite adapter initialized successfully. They cover one complete
exact linked action group, stable replay and payload-mismatch rejection, all-row
rollback, current-owner enforcement, fresh-database restart, and valid Add
without rate references while retaining a `sync_pending` holding state.

## T079 authored but unexecuted

`e2e/maestro/metals/add-holding.yaml` defines runner-controlled Gold, Silver,
validation, and restart journeys under the existing deterministic profile
matrix. It is intentionally not marked complete: this base lacks both the Add
route and an Add-specific clean-data fixture profile, so an execution cannot yet
reach a meaningful Maestro failure or success state.

## Remaining gate status

- T079 stays unexecuted and unchecked until runner fixture wiring and the route
  exist. T080 remains unchecked because it requires all T076–T079 Red artifacts
  and their combined evidence.
