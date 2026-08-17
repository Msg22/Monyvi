import { render, screen } from "@testing-library/react-native";
import React from "react";

const mockView = (testID: string): React.JSX.Element => {
  const ReactNative =
    jest.requireActual<typeof import("react-native")>("react-native");
  return <ReactNative.View testID={testID} />;
};

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: (): { readonly id: string } => ({
    id: "historical-budget",
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): { readonly bottom: number } => ({ bottom: 0 }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: (key: string): string => key,
  }),
}));

jest.mock("@/components/navigation/PageHeader", () => ({
  PageHeader: (): React.JSX.Element => mockView("page-header"),
}));
jest.mock("@/components/budget/BudgetDetailOverview", () => ({
  BudgetDetailOverview: (): React.JSX.Element =>
    mockView("budget-detail-overview"),
}));
jest.mock("@/components/budget/BudgetSpendingTrendChart", () => ({
  BudgetSpendingTrendChart: (): React.JSX.Element =>
    mockView("budget-spending-trend-chart"),
}));
jest.mock("@/components/budget/SubcategoryBreakdown", () => ({
  SubcategoryBreakdown: (): React.JSX.Element =>
    mockView("subcategory-breakdown"),
}));
jest.mock("@/components/budget/BudgetRecentTransactions", () => ({
  BudgetRecentTransactions: (): React.JSX.Element =>
    mockView("budget-recent-transactions"),
}));
jest.mock("@/components/budget/BudgetActionsSheet", () => ({
  BudgetActionsSheet: (): null => null,
}));
jest.mock("@/components/ui/Toast", () => ({
  useToast: (): { readonly showToast: jest.Mock } => ({ showToast: jest.fn() }),
}));
jest.mock("@/components/ui/Skeleton", () => ({
  Skeleton: (): React.JSX.Element => mockView("skeleton"),
}));
jest.mock("@/hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: (): { readonly preferredCurrency: "EGP" } => ({
    preferredCurrency: "EGP",
  }),
}));
jest.mock("@/hooks/useBudgetPeriodExpiry", () => ({
  useBudgetPeriodExpiry: (): boolean => false,
}));
jest.mock("@/hooks/useBudgetDetail", () => ({
  useBudgetDetail: () => ({
    budget: {
      id: "historical-budget",
      name: "Historical deleted category budget",
      amount: 5000,
      currency: "EGP",
      period: "MONTHLY",
      categoryId: "deleted-category",
      isCategoryBudget: true,
      isPaused: false,
    },
    metrics: {
      spent: 750,
      limit: 5000,
      remaining: 4250,
      percentage: 15,
      dailyAverage: 25,
      status: "safe",
    },
    daysLeft: 10,
    weeklySpending: [],
    subcategoryBreakdown: [],
    recentTransactions: [],
    isLoading: false,
  }),
}));
jest.mock("@/services/budget-service", () => ({
  deleteBudget: jest.fn(),
  pauseBudget: jest.fn(),
  resumeBudget: jest.fn(),
}));

import BudgetDetailScreen from "@/app/(private)/budget-detail";

describe("deleted-category budget detail", () => {
  it("renders historical detail instead of the not-found state", () => {
    render(<BudgetDetailScreen />);

    expect(screen.getByTestId("budget-detail-overview")).toBeTruthy();
    expect(screen.getByTestId("subcategory-breakdown")).toBeTruthy();
    expect(screen.queryByText("budget_not_found")).toBeNull();
  });
});
