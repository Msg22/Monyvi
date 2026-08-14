/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import React from "react";
import { Text as MockText } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";

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
    t: (
      key: string,
      options?: { readonly spent?: string; readonly limit?: string }
    ): string => {
      if (key === "spent_of_limit") {
        return `${options?.spent} of ${options?.limit}`;
      }
      return (
        {
          filter_monthly: "Monthly",
          filter_weekly: "Weekly",
          filter_custom: "Custom",
          paused: "Paused",
          resume_action: "Resume",
          renew_action: "Renew",
          over_budget: "Over Budget",
          near_limit: "Near limit",
          budget_expired: "Expired",
          deleted_category: "Deleted category",
          view_budget: "View Budget",
        }[key] ?? key
      );
    },
  }),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: { name: string }) => <MockText>{name}</MockText>,
}));

jest.mock("@/components/common/CategoryIcon", () => ({
  CategoryIcon: ({ iconName }: { iconName: string }) => (
    <MockText testID="category-icon">{iconName}</MockText>
  ),
}));

jest.mock("@/constants/colors", () => ({
  palette: {
    gold: { 600: "#000" },
    nileGreen: { 500: "#000" },
    red: { 500: "#000" },
    slate: { 400: "#000" },
  },
}));

import { BudgetDashboardRow } from "@/components/budget/BudgetDashboardRow";
import type { BudgetDashboardItem } from "@/services/budget-list-read-model-service";

function item(
  overrides: Partial<BudgetDashboardItem> = {}
): BudgetDashboardItem {
  return {
    id: "budget-1",
    displayName: "Food & Drinks",
    period: "MONTHLY",
    currency: "EGP",
    scope: "CATEGORY",
    lifecycle: "HEALTHY",
    sectionId: "CATEGORY",
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
    categoryLabel: { kind: "resolved", categoryId: "food", name: "Food" },
    categoryIcon: null,
    availableAction: null,
    ...overrides,
  };
}

describe("BudgetDashboardRow", () => {
  it("renders a compact category row with stable title width and inline progress", () => {
    render(
      <BudgetDashboardRow
        item={item({
          displayName: "Groceries Monthly",
          categoryIcon: {
            iconName: "restaurant-outline",
            iconLibrary: "Ionicons",
            iconColor: "#000",
          },
        })}
        variant="category"
        position="only"
        preferredCurrency="EGP"
        onPress={jest.fn()}
      />
    );

    const rowClassName = screen.getByTestId("budget-dashboard-row-budget-1")
      .props.className as string;
    expect(rowClassName).toContain("min-h-24");
    expect(rowClassName).not.toContain("min-h-64");
    expect(screen.getByText("Groceries Monthly")).toHaveProp(
      "numberOfLines",
      2
    );
    expect(screen.getByText("35%")).toBeOnTheScreen();
    expect(screen.getByTestId("category-icon")).toHaveTextContent(
      "restaurant-outline"
    );
    expect(
      screen.getByTestId("budget-row-progress-budget-1")
    ).toBeOnTheScreen();
  });

  it("renders direct compact Resume and Renew actions", () => {
    const onResume = jest.fn();
    const { rerender } = render(
      <BudgetDashboardRow
        item={item({ lifecycle: "PAUSED", availableAction: "RESUME" })}
        variant="paused"
        position="only"
        preferredCurrency="EGP"
        onPress={jest.fn()}
        onResume={onResume}
      />
    );

    fireEvent.press(screen.getByRole("button", { name: "Resume" }));
    expect(onResume).toHaveBeenCalledWith("budget-1");

    const onRenew = jest.fn();
    rerender(
      <BudgetDashboardRow
        item={item({
          lifecycle: "EXPIRED",
          availableAction: "RENEW",
          expiresAt: new Date("2026-08-12T00:00:00.000Z"),
        })}
        variant="attention"
        position="only"
        preferredCurrency="EGP"
        onPress={jest.fn()}
        onRenew={onRenew}
      />
    );

    fireEvent.press(screen.getByRole("button", { name: "Renew" }));
    expect(onRenew).toHaveBeenCalledWith("budget-1");
    expect(screen.getAllByText(/Expired.*Aug 12/)).toHaveLength(2);
  });

  it("keeps detail navigation available separately from lifecycle actions", () => {
    const onPress = jest.fn();
    render(
      <BudgetDashboardRow
        item={item({ lifecycle: "PAUSED", availableAction: "RESUME" })}
        variant="paused"
        position="only"
        preferredCurrency="EGP"
        onPress={onPress}
        onResume={jest.fn()}
      />
    );

    fireEvent.press(
      screen.getByRole("button", { name: /Food & Drinks, Monthly/ })
    );
    expect(onPress).toHaveBeenCalledWith("budget-1");
  });
});
