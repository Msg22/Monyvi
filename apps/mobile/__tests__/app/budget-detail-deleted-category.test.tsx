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
jest.mock("@/components/budget/BudgetDetailIdentity", () => ({
  BudgetDetailIdentity: ({
    identity,
  }: {
    readonly identity: { readonly icon: { readonly kind: string } };
  }): React.JSX.Element => mockView("identity-" + identity.icon.kind),
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
jest.mock("@/components/budget/BudgetDetailDangerZone", () => ({
  BudgetDetailDangerZone: (): React.JSX.Element => mockView("danger-zone"),
}));
jest.mock("@/components/budget/BudgetDetailSkeleton", () => ({
  BudgetDetailSkeleton: (): React.JSX.Element => mockView("skeleton"),
}));
jest.mock("@/components/modals/ConfirmationModal", () => ({
  ConfirmationModal: (): null => null,
}));
jest.mock("@/components/ui/Toast", () => ({
  useToast: (): { readonly showToast: jest.Mock } => ({ showToast: jest.fn() }),
}));
jest.mock("@/hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: (): { readonly preferredCurrency: "EGP" } => ({
    preferredCurrency: "EGP",
  }),
}));
jest.mock("@/hooks/useBudgetDetailActions", () => ({
  useBudgetDetailActions: () => ({
    pendingAction: null,
    errorKey: null,
    execute: jest.fn(),
    clearError: jest.fn(),
  }),
}));
jest.mock("@/hooks/useBudgetDetail", () => ({
  useBudgetDetail: () => ({
    budget: { id: "historical-budget" },
    readModel: {
      identity: {
        budgetId: "historical-budget",
        name: "Historical deleted category budget",
        type: "CATEGORY",
        lifecycle: "ACTIVE",
        period: "MONTHLY",
        periodStart: new Date(2026, 7, 1),
        periodEnd: new Date(2026, 7, 31),
        icon: { kind: "DELETED_CATEGORY" },
        availableLifecycleAction: "PAUSE",
      },
      currency: "EGP",
      metrics: {
        spent: 750,
        limit: 5000,
        remaining: 4250,
        percentage: 15,
        dailyAverage: 25,
        status: "safe",
      },
      daysLeft: 10,
      daysElapsed: 20,
      paceState: "BELOW",
      weeklySpending: [],
      categoryBreakdown: [],
      recentTransactions: [],
      hasCompletedPauseExclusion: false,
    },
    isInitialLoading: false,
    isRefreshing: false,
    isNotFound: false,
    errorKey: null,
    hasValidData: true,
    retry: jest.fn(),
    isLoading: false,
  }),
}));

import BudgetDetailScreen from "@/app/(private)/budget-detail";

describe("deleted-category budget detail", () => {
  it("renders historical detail with the neutral fallback instead of failing", () => {
    render(<BudgetDetailScreen />);

    expect(screen.getByTestId("identity-DELETED_CATEGORY")).toBeOnTheScreen();
    expect(screen.getByTestId("budget-detail-overview")).toBeOnTheScreen();
    expect(screen.getByTestId("subcategory-breakdown")).toBeOnTheScreen();
    expect(screen.queryByText("detail.not_found")).toBeNull();
  });
});
