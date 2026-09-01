# US2 Add Green Evidence

Base: `9c08cef4261cea417c76694c716257e250969498`
Date: 2026-09-01
Scope: T081–T082 Green; T079/T080/T083 remain open.

## Integrated production boundaries

- Locale-aware exact validation and preview shaping keep supported holding facts
  submittable when valuation is unavailable.
- The scoped Add command commits Asset, Metal detail, holding state, evidence,
  lifecycle event, and zero-or-two trustworthy acquisition-rate references as
  one local financial action group. Stable IDs support safe unchanged retries;
  ownership and rollback checks fail closed.
- The reusable shaped-prop form and Add hook/route provide the approved compact
  full form, Gold/Silver catalog identity, supplied Monyvi render, live preview,
  direct Add with no review step, unusual-value acknowledgment, pending lock,
  dirty-exit guard, and bottom safe-area accommodation.

## Versioned unusual-value policy

`metals-unusual-value/v1` is a soft typo guard, not a financial limit:

- Gold weight greater than or equal to 1,000g warns.
- Silver weight greater than or equal to 10,000g warns.
- Purchase amount greater than or equal to EGP 10,000,000 equivalent warns when
  the latest usable cached FX can convert truthfully.
- Equality warns. Stale valid FX may evaluate the branch and retains its stale
  disclosure. Missing/invalid conversion never invents a value or blocks Add.

The policy is a pure injectable mobile service so Edit can reuse it without
moving UI policy into shared financial logic.

## Green verification

```text
npm run typecheck --workspace @monyvi/mobile
```

Result: passed (`tsc --noEmit`).

```text
node node_modules/jest/bin/jest.js --config apps/mobile/jest.config.js --runInBand --testPathPattern='metal-holding-form-validation.test.ts|add-metal-holding-command-service.integration.test.ts|metal-unusual-value-policy.test.ts|useAddMetalHoldingForm.test.tsx|metals-add.test.tsx' --no-coverage --watchman=false --silent
```

Result: 5 passed suites, 30 passed tests.

```text
node node_modules/jest/bin/jest.js --config apps/mobile/jest.config.js --runInBand --runTestsByPath apps/mobile/__tests__/i18n/translation-resources.test.ts apps/mobile/__tests__/i18n/metals-content-contract.test.ts --no-coverage --watchman=false --silent
```

Result: 2 passed suites, 12 passed tests.

Focused ESLint over all changed TypeScript/TSX paths also passed.

The repository-wide mobile lint reached one pre-existing activation-lane error
in `metal-financial-action-foundation.integration.test.ts` (an unused type-only
import). That file is outside US2 ownership; the Add-owned focused lint is
Green and the activation owner must clear the shared-lane failure.

## Still open

- T079 Maestro has been authored but was not executed while the shared physical
  device/Metro QA lock is active.
- T080 remains open because the Maestro Red artifact was not executed.
- T083 remains open until Maestro plus required device/manual evidence is
  recorded. No device, visual, accessibility, or timed-completion claim is made.
