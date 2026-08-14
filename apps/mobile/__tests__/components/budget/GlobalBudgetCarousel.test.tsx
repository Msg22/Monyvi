/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import React from "react";
import { AccessibilityInfo } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";

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
      options?: {
        readonly current?: number;
        readonly total?: number;
        readonly count?: number;
      }
    ): string => {
      const labels: Record<string, string> = {
        overall_budgets: "Overall budgets",
        filter_weekly: "Weekly",
        filter_monthly: "Monthly",
        filter_custom: "Custom",
        spent: "Spent",
        budget_limit: "Budget limit",
        remaining: "Remaining",
        safe_to_spend: "Safe to Spend",
      };
      if (key === "carousel_page_announcement") {
        return `Budget page ${options?.current} of ${options?.total}`;
      }
      if (key === "days_remaining") {
        return `${options?.count ?? 0} days remaining`;
      }
      return labels[key] ?? key;
    },
  }),
}));

import { GlobalBudgetCarousel } from "@/components/budget/GlobalBudgetCarousel";
import type { BudgetDashboardItem } from "@/services/budget-list-read-model-service";

function item(id: string): BudgetDashboardItem {
  return {
    id,
    displayName: `Budget ${id}`,
    period: "MONTHLY",
    currency: "EGP",
    scope: "GLOBAL",
    lifecycle: "HEALTHY",
    sectionId: "OVERALL",
    metrics: {
      spent: 100,
      limit: 1000,
      remaining: 900,
      percentage: 10,
      dailyAverage: 10,
      status: "safe",
    },
    daysLeft: 10,
    daysElapsed: 20,
    expiresAt: null,
    categoryLabel: { kind: "not-applicable" },
    categoryIcon: null,
    availableAction: null,
  };
}

describe("GlobalBudgetCarousel", () => {
  beforeEach(() => {
    jest
      .spyOn(AccessibilityInfo, "announceForAccessibility")
      .mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders complete equal-width page groups and informational dots", () => {
    const screen = render(
      <GlobalBudgetCarousel
        budgets={[item("a"), item("b"), item("c")]}
        preferredCurrency="EGP"
        onBudgetPress={jest.fn()}
      />
    );

    fireEvent(
      screen.getByTestId("global-budget-carousel-container"),
      "layout",
      {
        nativeEvent: { layout: { width: 656, height: 300, x: 0, y: 0 } },
      }
    );

    expect(screen.getByTestId("global-budget-page-a:b")).toBeTruthy();
    expect(screen.getByTestId("global-budget-page-c")).toBeTruthy();
    expect(screen.getAllByTestId(/global-budget-card-/)).toHaveLength(3);
    expect(screen.getAllByTestId(/global-budget-page-dot-/)).toHaveLength(2);
  });

  it("hides dots when every card fits", () => {
    const screen = render(
      <GlobalBudgetCarousel
        budgets={[item("a"), item("b")]}
        preferredCurrency="EGP"
        onBudgetPress={jest.fn()}
      />
    );
    fireEvent(
      screen.getByTestId("global-budget-carousel-container"),
      "layout",
      {
        nativeEvent: { layout: { width: 656, height: 300, x: 0, y: 0 } },
      }
    );

    expect(screen.queryByTestId(/global-budget-page-dot-/)).toBeNull();
  });

  it("keeps global cards intrinsically sized instead of filling the carousel viewport", () => {
    const screen = render(
      <GlobalBudgetCarousel
        budgets={[item("a")]}
        preferredCurrency="EGP"
        onBudgetPress={jest.fn()}
      />
    );
    fireEvent(
      screen.getByTestId("global-budget-carousel-container"),
      "layout",
      {
        nativeEvent: { layout: { width: 320, height: 800, x: 0, y: 0 } },
      }
    );

    const cardClassName = screen.getByTestId("budget-dashboard-card-a").props
      .className as string;
    expect(cardClassName).toContain("min-h-64");
    expect(cardClassName).not.toContain("h-full");
  });

  it("exposes page position when the carousel has exactly one page", () => {
    const screen = render(
      <GlobalBudgetCarousel
        budgets={[item("a")]}
        preferredCurrency="EGP"
        onBudgetPress={jest.fn()}
      />
    );
    fireEvent(
      screen.getByTestId("global-budget-carousel-container"),
      "layout",
      {
        nativeEvent: { layout: { width: 320, height: 300, x: 0, y: 0 } },
      }
    );

    expect(screen.queryByTestId(/global-budget-page-dot-/)).toBeNull();
    expect(screen.getByTestId("global-budget-carousel")).toHaveProp(
      "accessibilityValue",
      { text: "Budget page 1 of 1" }
    );
  });

  it("announces only a user-driven page change", () => {
    const screen = render(
      <GlobalBudgetCarousel
        budgets={[item("a"), item("b"), item("c")]}
        preferredCurrency="EGP"
        onBudgetPress={jest.fn()}
      />
    );
    fireEvent(
      screen.getByTestId("global-budget-carousel-container"),
      "layout",
      {
        nativeEvent: { layout: { width: 320, height: 300, x: 0, y: 0 } },
      }
    );
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();

    act(() => {
      fireEvent(
        screen.getByTestId("global-budget-carousel"),
        "scrollBeginDrag"
      );
      fireEvent(
        screen.getByTestId("global-budget-carousel"),
        "momentumScrollEnd",
        { nativeEvent: { contentOffset: { x: 320, y: 0 } } }
      );
    });

    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      "Budget page 2 of 3"
    );
  });

  it("uses logical page distance when RTL reports a negative horizontal offset", () => {
    const screen = render(
      <GlobalBudgetCarousel
        budgets={[item("a"), item("b"), item("c")]}
        preferredCurrency="EGP"
        onBudgetPress={jest.fn()}
      />
    );
    fireEvent(
      screen.getByTestId("global-budget-carousel-container"),
      "layout",
      {
        nativeEvent: { layout: { width: 320, height: 300, x: 0, y: 0 } },
      }
    );

    fireEvent(screen.getByTestId("global-budget-carousel"), "scrollBeginDrag");
    fireEvent(
      screen.getByTestId("global-budget-carousel"),
      "momentumScrollEnd",
      { nativeEvent: { contentOffset: { x: -320, y: 0 } } }
    );

    expect(screen.getByTestId("global-budget-page-dot-1")).toHaveProp(
      "accessibilityState",
      { selected: true }
    );
  });

  it("preserves the first visible eligible budget after responsive regrouping", () => {
    const screen = render(
      <GlobalBudgetCarousel
        budgets={[item("a"), item("b"), item("c")]}
        preferredCurrency="EGP"
        onBudgetPress={jest.fn()}
      />
    );
    fireEvent(
      screen.getByTestId("global-budget-carousel-container"),
      "layout",
      {
        nativeEvent: { layout: { width: 320, height: 300, x: 0, y: 0 } },
      }
    );
    fireEvent(screen.getByTestId("global-budget-carousel"), "scrollBeginDrag");
    fireEvent(
      screen.getByTestId("global-budget-carousel"),
      "momentumScrollEnd",
      { nativeEvent: { contentOffset: { x: 320, y: 0 } } }
    );

    fireEvent(
      screen.getByTestId("global-budget-carousel-container"),
      "layout",
      {
        nativeEvent: { layout: { width: 656, height: 300, x: 0, y: 0 } },
      }
    );

    expect(
      screen.getByTestId("global-budget-page-dot-0").props.accessibilityState
    ).toEqual({ selected: true });
  });

  it("replaces a removed preserved anchor with the fallback page anchor", () => {
    const props = {
      preferredCurrency: "EGP" as const,
      onBudgetPress: jest.fn(),
    };
    const screen = render(
      <GlobalBudgetCarousel
        {...props}
        budgets={[item("a"), item("b"), item("c")]}
      />
    );
    fireEvent(
      screen.getByTestId("global-budget-carousel-container"),
      "layout",
      {
        nativeEvent: { layout: { width: 320, height: 300, x: 0, y: 0 } },
      }
    );
    fireEvent(screen.getByTestId("global-budget-carousel"), "scrollBeginDrag");
    fireEvent(
      screen.getByTestId("global-budget-carousel"),
      "momentumScrollEnd",
      {
        nativeEvent: { contentOffset: { x: 320, y: 0 } },
      }
    );

    screen.rerender(
      <GlobalBudgetCarousel {...props} budgets={[item("a"), item("c")]} />
    );
    screen.rerender(
      <GlobalBudgetCarousel
        {...props}
        budgets={[item("a"), item("b"), item("c")]}
      />
    );

    expect(screen.getByTestId("global-budget-page-dot-0")).toHaveProp(
      "accessibilityState",
      { selected: true }
    );
  });

  it("ignores momentum completion from an obsolete data generation", () => {
    const props = {
      preferredCurrency: "EGP" as const,
      onBudgetPress: jest.fn(),
    };
    const screen = render(
      <GlobalBudgetCarousel
        {...props}
        budgets={[item("a"), item("b"), item("c")]}
      />
    );
    fireEvent(
      screen.getByTestId("global-budget-carousel-container"),
      "layout",
      {
        nativeEvent: { layout: { width: 320, height: 300, x: 0, y: 0 } },
      }
    );
    fireEvent(screen.getByTestId("global-budget-carousel"), "scrollBeginDrag");

    screen.rerender(
      <GlobalBudgetCarousel {...props} budgets={[item("a"), item("c")]} />
    );
    jest.mocked(AccessibilityInfo.announceForAccessibility).mockClear();
    fireEvent(
      screen.getByTestId("global-budget-carousel"),
      "momentumScrollEnd",
      {
        nativeEvent: { contentOffset: { x: 320, y: 0 } },
      }
    );

    expect(screen.getByTestId("global-budget-page-dot-0")).toHaveProp(
      "accessibilityState",
      { selected: true }
    );
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
  });
});
