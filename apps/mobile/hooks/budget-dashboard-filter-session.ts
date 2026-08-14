import type { BudgetDashboardFilters } from "@/contracts/budget-dashboard";

export const DEFAULT_BUDGET_DASHBOARD_FILTERS: BudgetDashboardFilters =
  Object.freeze({
    scope: "ALL",
    period: "ALL",
    status: "ACTIVE",
  });

let sessionUserId: string | null = null;
let sessionFilters: BudgetDashboardFilters = DEFAULT_BUDGET_DASHBOARD_FILTERS;

function ensureSessionOwner(userId: string): void {
  if (sessionUserId === userId) return;
  sessionUserId = userId;
  sessionFilters = DEFAULT_BUDGET_DASHBOARD_FILTERS;
}

export function readBudgetDashboardFilterSession(
  userId: string
): BudgetDashboardFilters {
  ensureSessionOwner(userId);
  return sessionFilters;
}

export function writeBudgetDashboardFilterSession(
  userId: string,
  filters: BudgetDashboardFilters
): BudgetDashboardFilters {
  ensureSessionOwner(userId);
  sessionFilters = Object.freeze({ ...filters });
  return sessionFilters;
}

export function resetBudgetDashboardFilterSession(
  userId: string
): BudgetDashboardFilters {
  sessionUserId = userId;
  sessionFilters = DEFAULT_BUDGET_DASHBOARD_FILTERS;
  return sessionFilters;
}

export function clearBudgetDashboardFilterSession(): void {
  sessionUserId = null;
  sessionFilters = DEFAULT_BUDGET_DASHBOARD_FILTERS;
}
