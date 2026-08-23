# Data Model: Budget Management

**Branch**: `019-budget-management` | **Date**: 2026-03-19

## Entities

### Budget (existing table — `budgets`)

The `budgets` table already exists in WatermelonDB and Supabase. No schema
migration is needed for the table itself. The existing required `currency`
column persists one supported currency for every budget.

| Field             | Type         | Required | Notes                                        |
| ----------------- | ------------ | -------- | -------------------------------------------- |
| `id`              | string       | ✅       | Auto-generated WatermelonDB ID               |
| `name`            | string       | ✅       | User-defined budget name                     |
| `type`            | BudgetType   | ✅       | `"GLOBAL"` or `"CATEGORY"`                   |
| `category_id`     | string       | ❌       | FK → categories. Required when type=CATEGORY |
| `amount`          | number       | ✅       | Budget limit in the budget's saved currency  |
| `currency`        | CurrencyType | ✅       | Required, immutable supported currency       |
| `period`          | BudgetPeriod | ✅       | `"WEEKLY"`, `"MONTHLY"`, `"CUSTOM"`          |
| `period_start`    | Date         | ❌       | Required for CUSTOM period                   |
| `period_end`      | Date         | ❌       | Required for CUSTOM period                   |
| `alert_threshold` | number       | ✅       | Percentage (50–100) for alert trigger        |
| `status`          | BudgetStatus | ✅       | `"ACTIVE"` or `"PAUSED"`                     |
| `user_id`         | string       | ✅       | FK → auth.users                              |
| `created_at`      | Date         | ✅       | Auto-set, readonly                           |
| `updated_at`      | Date         | ✅       | Auto-updated                                 |
| `deleted`         | boolean      | ✅       | Sync-aware soft-delete flag                  |

### Relationships

```
Budget ──belongs_to──▶ Category (via category_id, optional)
Budget ──has_many────▶ Transaction (computed: spending aggregation via category match + date range)
```

### State Transitions

```
                  ┌──────────────┐
    Create ──────▶│    ACTIVE    │◀─── Resume
                  └──────┬───────┘
                         │ Pause
                         ▼
                  ┌──────────────┐
                  │    PAUSED    │
                  └──────┬───────┘
                         │ Delete (markAsDeleted)
                         ▼
                  ┌──────────────┐
                  │   DELETED    │ (WatermelonDB _status, not business status)
                  └──────────────┘

  Note: ACTIVE budgets can also be deleted directly. Custom-period budgets
  auto-transition to PAUSED when period_end passes.
```

### Validation Rules

| Rule                                                        | Source      |
| ----------------------------------------------------------- | ----------- |
| `name` is non-empty                                         | FR-003      |
| `amount` > 0                                                | FR-003      |
| `alert_threshold` between 50 and 100                        | FR-003      |
| `category_id` required when type=CATEGORY                   | FR-002      |
| `category_id` must be null when type=GLOBAL                 | FR-002      |
| `period_start` and `period_end` required when period=CUSTOM | FR-013      |
| `period_end` > `period_start`                               | FR-013      |
| No duplicate category+period budgets                        | FR-014      |
| Max one GLOBAL budget per period type                       | FR-014 (Q1) |
| Type (GLOBAL/CATEGORY) is immutable on edit                 | FR-018      |

### Computed Fields (not in schema, calculated at runtime)

| Field             | Calculation                                                                   |
| ----------------- | ----------------------------------------------------------------------------- |
| `spent`           | SUM(transactions.amount) where type=EXPENSE, category matches, date in period |
| `spentPercentage` | `(spent / amount) * 100`                                                      |
| `remaining`       | `max(0, amount - spent)`                                                      |
| `dailyAverage`    | `spent / daysElapsedInPeriod`                                                 |
| `daysLeft`        | `periodEnd - today` (calculated from period boundaries)                       |
| `periodStart`     | For WEEKLY: most recent Sunday. For MONTHLY: 1st of month                     |
| `periodEnd`       | For WEEKLY: next Saturday. For MONTHLY: last day of month                     |

## Currency Persistence

`currency` remains required in both WatermelonDB and Supabase. Creation defaults
to the user preference but persists the selected supported currency; it is not
changed during edit. No currency migration or backfill is required.

### Alert Deduplication Tracking

To implement "once per threshold crossing per budget period" (Q2), we need to
track whether an alert has been shown. Two approaches:

- **Option A (Recommended)**: Add `last_alert_at` nullable date column to
  `budgets` table. When an alert is shown, set this to now. On period reset,
  clear it. Check: if `last_alert_at` is within the current period, skip the
  alert.
- **Option B**: Use local-only AsyncStorage key per budget ID + period. Simpler
  but not sync-aware.

Decision: Option A — a `last_alert_at` column keeps alert state in the budget
record and syncs across devices, but we need to also track which threshold was
last alerted (80% vs 100%). A simpler approach: add `last_warning_at` and
`last_danger_at` nullable date columns, or a single `alert_fired_level` ("NONE",
"WARNING", "DANGER") column that resets per period.

**Final decision**: Add a `alert_fired_level` text column (nullable, values:
null, "WARNING", "DANGER") to the budgets table. Reset to null on period
boundary detection. This avoids adding two date columns and keeps it simple.
