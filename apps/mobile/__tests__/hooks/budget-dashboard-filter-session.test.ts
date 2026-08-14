import {
  DEFAULT_BUDGET_DASHBOARD_FILTERS,
  clearBudgetDashboardFilterSession,
  readBudgetDashboardFilterSession,
  resetBudgetDashboardFilterSession,
  writeBudgetDashboardFilterSession,
} from "@/hooks/budget-dashboard-filter-session";

describe("budget-dashboard-filter-session", () => {
  beforeEach(() => {
    clearBudgetDashboardFilterSession();
  });

  it("starts every user with immutable All / All / Active defaults", () => {
    const filters = readBudgetDashboardFilterSession("user-a");

    expect(filters).toEqual({ scope: "ALL", period: "ALL", status: "ACTIVE" });
    expect(filters).toBe(DEFAULT_BUDGET_DASHBOARD_FILTERS);
    expect(Object.isFrozen(filters)).toBe(true);
  });

  it("writes an immutable replacement and restores it for the same user", () => {
    const original = readBudgetDashboardFilterSession("user-a");
    const written = writeBudgetDashboardFilterSession("user-a", {
      scope: "CATEGORY",
      period: "CUSTOM",
      status: "EXPIRED",
    });

    expect(written).not.toBe(original);
    expect(Object.isFrozen(written)).toBe(true);
    expect(readBudgetDashboardFilterSession("user-a")).toBe(written);
  });

  it("resets defaults when the authenticated user changes", () => {
    writeBudgetDashboardFilterSession("user-a", {
      scope: "GLOBAL",
      period: "WEEKLY",
      status: "PAUSED",
    });

    expect(readBudgetDashboardFilterSession("user-b")).toBe(
      DEFAULT_BUDGET_DASHBOARD_FILTERS
    );
    expect(readBudgetDashboardFilterSession("user-a")).toBe(
      DEFAULT_BUDGET_DASHBOARD_FILTERS
    );
  });

  it("explicitly resets all filters for the current user", () => {
    writeBudgetDashboardFilterSession("user-a", {
      scope: "CATEGORY",
      period: "MONTHLY",
      status: "ALL",
    });

    expect(resetBudgetDashboardFilterSession("user-a")).toBe(
      DEFAULT_BUDGET_DASHBOARD_FILTERS
    );
    expect(readBudgetDashboardFilterSession("user-a")).toBe(
      DEFAULT_BUDGET_DASHBOARD_FILTERS
    );
  });
});
