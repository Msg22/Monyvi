import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

jest.mock("@monyvi/logic", () => ({
  formatCurrency: ({
    amount,
    currency,
  }: {
    amount: number;
    currency: string;
  }) => `${amount.toLocaleString("en-US")} ${currency}`,
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string, options?: { readonly count?: number }): string => {
      const labels: Record<string, string> = {
        filter_weekly: "Weekly",
        filter_monthly: "Monthly",
        filter_custom: "Custom",
        spent: "Spent",
        budget_limit: "Budget limit",
        remaining: "Remaining",
        safe_to_spend: "Safe to Spend",
        alert_warning_title: "Spending Alert",
        over_budget: "Over Budget",
        paused: "Paused",
        budget_expired: "Expired",
        deleted_category: "Deleted category",
        resume_budget: "Resume Budget",
        renew_budget: "Renew budget",
      };
      if (key === "days_remaining") {
        return `${options?.count ?? 0} days remaining`;
      }
      return labels[key] ?? key;
    },
  }),
}));

import { BudgetDashboardCard } from "@/components/budget/BudgetDashboardCard";
import type { BudgetDashboardItem } from "@/services/budget-list-read-model-service";

function createItem(
  overrides: Partial<BudgetDashboardItem> = {}
): BudgetDashboardItem {
  return {
    id: "budget-1",
    displayName: "Monthly essentials",
    period: "MONTHLY",
    currency: "EGP",
    scope: "GLOBAL",
    lifecycle: "HEALTHY",
    sectionId: "OVERALL",
    metrics: {
      spent: 1750,
      limit: 5000,
      remaining: 3250,
      percentage: 35,
      dailyAverage: 125,
      status: "safe",
    },
    daysLeft: 12,
    daysElapsed: 18,
    expiresAt: null,
    categoryLabel: { kind: "not-applicable" },
    availableAction: null,
    ...overrides,
  };
}

describe("BudgetDashboardCard", () => {
  it("renders every required financial and remaining-time field", () => {
    const screen = render(
      <BudgetDashboardCard
        item={createItem()}
        variant="global"
        preferredCurrency="EGP"
        onPress={jest.fn()}
      />
    );

    expect(screen.getByText("Monthly essentials")).toBeTruthy();
    expect(screen.getByText("Monthly")).toBeTruthy();
    expect(screen.getByText("35%")).toBeTruthy();
    expect(screen.getByText(/1,750/)).toBeTruthy();
    expect(screen.getByText(/5,000/)).toBeTruthy();
    expect(screen.getByText(/3,250/)).toBeTruthy();
    expect(screen.getByText(/12 days remaining/)).toBeTruthy();
    expect(
      screen.getByLabelText(
        /Monthly essentials.*Monthly.*1,750.*5,000.*35.*3,250.*12/
      )
    ).toBeTruthy();
  });

  it.each([
    { lifecycle: "NEAR_LIMIT", label: "Spending Alert" },
    { lifecycle: "OVER_BUDGET", label: "Over Budget" },
    { lifecycle: "PAUSED", label: "Paused" },
    { lifecycle: "EXPIRED", label: "Expired" },
  ] as const)(
    "renders $lifecycle as text, not color alone",
    ({ lifecycle, label }) => {
      const screen = render(
        <BudgetDashboardCard
          item={createItem({ lifecycle })}
          variant="full"
          preferredCurrency="EGP"
          onPress={jest.fn()}
        />
      );

      expect(screen.getByText(label)).toBeTruthy();
    }
  );

  it("renders direct Resume and Renew actions", () => {
    const onResume = jest.fn();
    const { getByRole, rerender } = render(
      <BudgetDashboardCard
        item={createItem({ lifecycle: "PAUSED", availableAction: "RESUME" })}
        variant="full"
        preferredCurrency="EGP"
        onPress={jest.fn()}
        onResume={onResume}
      />
    );

    fireEvent.press(getByRole("button", { name: "Resume Budget" }));
    expect(onResume).toHaveBeenCalledWith("budget-1");

    const onRenew = jest.fn();
    rerender(
      <BudgetDashboardCard
        item={createItem({ lifecycle: "EXPIRED", availableAction: "RENEW" })}
        variant="full"
        preferredCurrency="EGP"
        onPress={jest.fn()}
        onRenew={onRenew}
      />
    );
    fireEvent.press(getByRole("button", { name: "Renew budget" }));
    expect(onRenew).toHaveBeenCalledWith("budget-1");
  });

  it("shows a neutral deleted-category label and zero spend", () => {
    const screen = render(
      <BudgetDashboardCard
        item={createItem({
          displayName: "Historic learning",
          scope: "CATEGORY",
          metrics: { ...createItem().metrics, spent: 0, percentage: 0 },
          categoryLabel: { kind: "deleted", categoryId: "deleted" },
        })}
        variant="compact"
        preferredCurrency="EGP"
        onPress={jest.fn()}
      />
    );

    expect(screen.getByText("Deleted category")).toBeTruthy();
    expect(screen.getByText("0%")).toBeTruthy();
  });
});
