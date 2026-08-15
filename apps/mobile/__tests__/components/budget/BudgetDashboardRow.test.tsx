/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import React from "react";
import { I18nManager, Text as MockText } from "react-native";
import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: { name: string }) => <MockText>{name}</MockText>,
  MaterialCommunityIcons: ({ name }: { name: string }) => (
    <MockText>{name}</MockText>
  ),
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
import type { BudgetDashboardItem } from "@/contracts/budget-dashboard";

const BASE_PRESENTATION: BudgetDashboardItem["presentation"] = {
  periodAndScopeLabel: "Monthly • Category",
  spentOfLimitLabel: "1,750 EGP of 5,000 EGP",
  percentageLabel: "35%",
  progressWidth: "35%",
  statusLabel: "safe_to_spend",
  deletedCategoryLabel: null,
  expiryLabel: null,
  actionLabel: null,
  actionAccessibilityLabel: null,
  accessibilityLabel:
    "Food & Drinks, Monthly, Category, 1,750 EGP of 5,000 EGP, 35%, safe_to_spend",
  viewBudgetLabel: "View Budget: Food & Drinks",
};

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
    showsProgress: true,
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
    presentation: BASE_PRESENTATION,
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
        position="only"
        onPress={jest.fn()}
      />
    );

    const rowClassName = screen.getByTestId("budget-dashboard-row-budget-1")
      .props.className as string;
    expect(rowClassName).toContain("min-h-24");
    expect(rowClassName).toContain("py-3");
    expect(rowClassName).not.toContain("min-h-28");
    expect(rowClassName).not.toContain("min-h-64");
    expect(screen.getByText("Groceries Monthly")).toHaveProp(
      "numberOfLines",
      1
    );
    expect(screen.getByText("Groceries Monthly")).toHaveProp(
      "ellipsizeMode",
      "tail"
    );
    expect(screen.getByText("Groceries Monthly")).toHaveProp(
      "className",
      expect.stringContaining("text-xs")
    );
    expect(screen.getByText("Groceries Monthly")).not.toHaveProp(
      "adjustsFontSizeToFit",
      true
    );
    expect(screen.getByText("35%")).toBeOnTheScreen();
    expect(screen.getByText("Monthly • Category")).toBeOnTheScreen();
    expect(screen.getByText("1,750 EGP of 5,000 EGP")).toBeOnTheScreen();
    expect(screen.getByText("safe_to_spend")).toBeOnTheScreen();
    expect(screen.getByTestId("category-icon")).toHaveTextContent(
      "restaurant-outline"
    );
    expect(screen.getByTestId("budget-row-icon-budget-1")).toHaveProp(
      "className",
      expect.stringContaining("h-10 w-10")
    );
    expect(
      screen.getByTestId("budget-row-progress-budget-1")
    ).toBeOnTheScreen();
  });

  it("uses the approved contextual icons for actionable budget states", () => {
    const { rerender } = render(
      <BudgetDashboardRow
        item={item({ lifecycle: "NEAR_LIMIT" })}
        position="only"
        onPress={jest.fn()}
      />
    );

    expect(screen.getByText("speedometer")).toBeOnTheScreen();
    expect(screen.queryByText("alert-circle-outline")).toBeNull();

    rerender(
      <BudgetDashboardRow
        item={item({ lifecycle: "OVER_BUDGET" })}
        position="only"
        onPress={jest.fn()}
      />
    );

    expect(screen.getByText("wallet-outline")).toBeOnTheScreen();
    expect(screen.getByText("arrow-up")).toBeOnTheScreen();
    expect(screen.queryByText("alert-circle-outline")).toBeNull();

    rerender(
      <BudgetDashboardRow
        item={item({ lifecycle: "EXPIRED", showsProgress: false })}
        position="only"
        onPress={jest.fn()}
      />
    );

    expect(screen.getByText("calendar-clock-outline")).toBeOnTheScreen();
    expect(screen.queryByText("alert-circle-outline")).toBeNull();
  });

  it("renders direct compact Resume and Renew actions", () => {
    const onResume = jest.fn();
    const { rerender } = render(
      <BudgetDashboardRow
        item={item({
          lifecycle: "PAUSED",
          showsProgress: false,
          availableAction: "RESUME",
          presentation: {
            ...BASE_PRESENTATION,
            percentageLabel: null,
            progressWidth: null,
            statusLabel: "Paused",
            actionLabel: "Resume",
            actionAccessibilityLabel: "Resume: Food & Drinks",
            accessibilityLabel:
              "Food & Drinks, Monthly, Category, 1,750 EGP of 5,000 EGP, Paused",
          },
        })}
        position="only"
        onPress={jest.fn()}
        onResume={onResume}
      />
    );

    expect(
      screen.getByTestId("budget-action-resume-budget-1")
    ).toBeOnTheScreen();
    expect(screen.queryByTestId("budget-row-progress-budget-1")).toBeNull();
    expect(screen.queryByTestId("budget-row-percentage-budget-1")).toBeNull();
    expect(
      screen.getByRole("button", { name: /Food & Drinks, Monthly, Category/ })
    ).not.toHaveProp("accessibilityLabel", expect.stringContaining("35%"));
    expect(screen.getByTestId("budget-action-resume-budget-1")).toHaveProp(
      "accessibilityLabel",
      "Resume: Food & Drinks"
    );
    expect(
      screen.getByTestId("budget-row-lifecycle-controls-budget-1")
    ).toHaveProp("className", expect.stringContaining("justify-between"));
    expect(
      within(
        screen.getByTestId("budget-row-action-anchor-budget-1")
      ).getByTestId("budget-action-resume-budget-1")
    ).toBeOnTheScreen();
    expect(
      within(screen.getByTestId("budget-row-action-anchor-budget-1")).getByText(
        "chevron-forward"
      )
    ).toBeOnTheScreen();
    expect(screen.getByTestId("budget-row-action-anchor-budget-1")).toHaveProp(
      "className",
      expect.stringContaining("gap-1")
    );
    expect(
      within(screen.getByTestId("budget-detail-target-budget-1")).queryByTestId(
        "budget-action-resume-budget-1"
      )
    ).toBeNull();
    fireEvent.press(screen.getByTestId("budget-action-resume-budget-1"), {
      stopPropagation: jest.fn(),
    });
    expect(onResume).toHaveBeenCalledWith("budget-1");

    const onRenew = jest.fn();
    rerender(
      <BudgetDashboardRow
        item={item({
          lifecycle: "EXPIRED",
          showsProgress: false,
          availableAction: "RENEW",
          expiresAt: new Date("2026-08-12T00:00:00.000Z"),
          presentation: {
            ...BASE_PRESENTATION,
            percentageLabel: null,
            progressWidth: null,
            statusLabel: "Expired",
            expiryLabel: "Expired Aug 12",
            actionLabel: "Renew",
            actionAccessibilityLabel: "Renew: Food & Drinks",
            accessibilityLabel:
              "Food & Drinks, Monthly, Category, 1,750 EGP of 5,000 EGP, Expired",
          },
        })}
        position="only"
        onPress={jest.fn()}
        onRenew={onRenew}
      />
    );

    expect(
      screen.getByTestId("budget-action-renew-budget-1")
    ).toBeOnTheScreen();
    expect(screen.getByTestId("budget-action-renew-budget-1")).toHaveProp(
      "accessibilityLabel",
      "Renew: Food & Drinks"
    );
    expect(
      within(
        screen.getByTestId("budget-row-lifecycle-controls-budget-1")
      ).getByTestId("budget-row-status-budget-1")
    ).toBeOnTheScreen();
    expect(
      within(
        screen.getByTestId("budget-row-action-anchor-budget-1")
      ).getByTestId("budget-action-renew-budget-1")
    ).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("budget-action-renew-budget-1"), {
      stopPropagation: jest.fn(),
    });
    expect(onRenew).toHaveBeenCalledWith("budget-1");
    expect(screen.getByText(/Expired.*Aug 12/)).toBeOnTheScreen();
    expect(screen.queryByTestId("budget-row-progress-budget-1")).toBeNull();
    expect(screen.queryByTestId("budget-row-percentage-budget-1")).toBeNull();
    expect(screen.getByTestId("budget-row-status-budget-1")).toHaveProp(
      "numberOfLines",
      1
    );
    expect(screen.getByTestId("budget-row-subtitle-budget-1")).toHaveProp(
      "numberOfLines",
      1
    );
    expect(screen.getByTestId("budget-row-subtitle-budget-1")).toHaveProp(
      "adjustsFontSizeToFit",
      true
    );
  });

  it("keeps extreme percentages and status on one compact trailing line", () => {
    render(
      <BudgetDashboardRow
        item={item({
          displayName: "QA Over Budget Category",
          lifecycle: "OVER_BUDGET",
          metrics: {
            ...item().metrics,
            percentage: 11641,
          },
          presentation: {
            ...BASE_PRESENTATION,
            percentageLabel: "11641%",
            progressWidth: "100%",
            statusLabel: "Over Budget",
          },
        })}
        position="only"
        onPress={jest.fn()}
      />
    );

    const rowClassName = screen.getByTestId("budget-dashboard-row-budget-1")
      .props.className as string;
    const trailingClassName = screen.getByTestId("budget-row-trailing-budget-1")
      .props.className as string;

    expect(rowClassName).toContain("min-h-24");
    expect(trailingClassName).toContain("w-24");
    expect(screen.getByTestId("budget-row-percentage-budget-1")).toHaveProp(
      "numberOfLines",
      1
    );
    expect(screen.getByTestId("budget-row-percentage-budget-1")).toHaveProp(
      "adjustsFontSizeToFit",
      true
    );
    expect(screen.getByTestId("budget-row-status-budget-1")).toHaveProp(
      "numberOfLines",
      1
    );
  });

  it("keeps detail navigation available separately from lifecycle actions", () => {
    const onPress = jest.fn();
    render(
      <BudgetDashboardRow
        item={item({
          lifecycle: "PAUSED",
          showsProgress: false,
          availableAction: "RESUME",
          presentation: {
            ...BASE_PRESENTATION,
            percentageLabel: null,
            progressWidth: null,
            statusLabel: "Paused",
            actionLabel: "Resume",
            actionAccessibilityLabel: "Resume: Food & Drinks",
          },
        })}
        position="only"
        onPress={onPress}
        onResume={jest.fn()}
      />
    );

    fireEvent.press(
      screen.getByRole("button", { name: /Food & Drinks, Monthly/ })
    );
    expect(onPress).toHaveBeenCalledWith("budget-1");
  });

  it("opens detail from active-row metrics and progress without dead tap zones", () => {
    const onPress = jest.fn();
    render(
      <BudgetDashboardRow item={item()} position="only" onPress={onPress} />
    );

    fireEvent.press(screen.getByTestId("budget-row-percentage-budget-1"));
    fireEvent.press(screen.getByTestId("budget-row-progress-budget-1"));

    expect(onPress).toHaveBeenNthCalledWith(1, "budget-1");
    expect(onPress).toHaveBeenNthCalledWith(2, "budget-1");
  });

  it("announces deleted-category history in the row label", () => {
    render(
      <BudgetDashboardRow
        item={item({
          displayName: "Historic learning",
          categoryLabel: { kind: "deleted", categoryId: "deleted" },
          presentation: {
            ...BASE_PRESENTATION,
            deletedCategoryLabel: "Deleted category",
            accessibilityLabel:
              "Historic learning, Deleted category, Monthly, Category, 1,750 EGP of 5,000 EGP, 35%, safe_to_spend",
          },
        })}
        position="only"
        onPress={jest.fn()}
      />
    );

    expect(
      screen.getByRole("button", {
        name: /Historic learning.*Deleted category/,
      })
    ).toBeOnTheScreen();
    expect(screen.getByText("Deleted category")).toBeOnTheScreen();
  });

  it("uses the RTL-aware detail chevron without changing logical content order", () => {
    const originalIsRTL = I18nManager.isRTL;
    Object.defineProperty(I18nManager, "isRTL", {
      configurable: true,
      value: true,
    });

    render(
      <BudgetDashboardRow
        item={item({ displayName: "ميزانية الطعام" })}
        position="only"
        onPress={jest.fn()}
      />
    );

    expect(screen.getByText("chevron-back")).toBeOnTheScreen();
    expect(screen.getByText("ميزانية الطعام")).toHaveProp("numberOfLines", 1);
    expect(screen.getByText("ميزانية الطعام")).toHaveProp(
      "ellipsizeMode",
      "tail"
    );

    Object.defineProperty(I18nManager, "isRTL", {
      configurable: true,
      value: originalIsRTL,
    });
  });
});
