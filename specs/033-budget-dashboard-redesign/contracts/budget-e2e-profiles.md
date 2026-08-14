# Contract: Budget E2E Seed Profiles

## Purpose

Give each budget Maestro journey deterministic data without depending on
`manual-qa@monyvi.test` or changing the default fixture used by other suites.

## Selection

`apps/mobile/scripts/e2e-seed.js` reads optional `E2E_BUDGET_PROFILE` and
resolves one immutable fixture from
`apps/mobile/scripts/seed-fixtures/e2e-fixture.js`:

- unset: existing default E2E fixture, unchanged for non-budget suites;
- `dashboard-full`: deterministic global/category budgets across WEEKLY,
  MONTHLY, and CUSTOM plus healthy, near-limit, over-budget, paused, expired,
  deleted-category, zero-spend, and long-copy records;
- `dashboard-filter-empty`: deterministic dashboard records with no CUSTOM
  budgets, so selecting Custom produces the filtered-empty state while the user
  still owns budgets.

Unknown profile values fail fast with a clear harness error.

## Per-flow mapping

| Flow                               | Required profile         |
| ---------------------------------- | ------------------------ |
| `dashboard-filtering.yaml`         | `dashboard-full`         |
| `dashboard-lifecycle-actions.yaml` | `dashboard-full`         |
| filtered-empty journey             | `dashboard-filter-empty` |

The budget suite resets and reseeds its E2E user before every flow, setting the
mapped profile for that seed. It must not reuse mutated state from a prior
Resume journey.

## Guarantees

- Profiles use only the dedicated E2E account.
- Seed output is deterministic and idempotent after reset.
- `dashboard-full` covers all scope, period, and derived-status options.
- `dashboard-filter-empty` contains non-CUSTOM budgets and zero CUSTOM budgets.
- Other suites receive the unchanged default fixture when the variable is unset.
- Unit tests cover profile selection, unknown-profile rejection, fixture
  contents, filter combinations, per-flow reset/reseed mapping, suite
  registration, retry behavior, and scope routing.

## Automation boundary

Maestro drives only visible user behavior. Injected Resume failure remains
Jest/RNTL coverage until a separate approved user-level failure harness exists.
