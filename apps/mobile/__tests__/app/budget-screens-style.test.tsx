import { render, screen } from "@testing-library/react-native";
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let mockSearchParams: { readonly id?: string } = {};
let mockEditableBudgetResult: {
  readonly budget: Record<string, unknown> | undefined;
  readonly isLoading: boolean;
  readonly loadErrorKey: "budget_not_found" | "load_budget_error" | null;
};
let mockBudgetDetailResult: Record<string, unknown>;

const mockView = (testID: string): React.JSX.Element => {
  const ReactNative =
    jest.requireActual<typeof import("react-native")>("react-native");

  return <ReactNative.View testID={testID} />;
};

jest.mock("expo-router", () => ({
  router: {
    back: jest.fn(),
    push: jest.fn(),
  },
  useLocalSearchParams: (): { readonly id?: string } => mockSearchParams,
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useFocusEffect: jest.fn(),
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
  PageHeader: ({
    rightAction,
  }: {
    readonly rightAction?: {
      readonly testID?: string;
      readonly accessibilityLabel?: string;
      readonly onPress: () => void;
    };
  }): React.JSX.Element | null => {
    if (!rightAction) return null;
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    return (
      <ReactNative.TouchableOpacity
        testID={rightAction.testID}
        accessibilityRole="button"
        accessibilityLabel={rightAction.accessibilityLabel}
        onPress={rightAction.onPress}
      />
    );
  },
}));

jest.mock("@/components/budget/BudgetDashboard", () => ({
  BudgetDashboard: (): React.JSX.Element => mockView("budget-dashboard"),
}));

jest.mock("@/components/modals/ConfirmationModal", () => ({
  ConfirmationModal: (): null => null,
}));

jest.mock("@/components/budget/BudgetForm", () => ({
  BudgetForm: (): React.JSX.Element => mockView("budget-form"),
}));

jest.mock("@/components/budget/BudgetDetailIdentity", () => ({
  BudgetDetailIdentity: (): React.JSX.Element =>
    mockView("budget-detail-identity"),
}));
jest.mock("@/components/budget/BudgetDetailDangerZone", () => ({
  BudgetDetailDangerZone: (): React.JSX.Element =>
    mockView("budget-detail-danger-zone"),
}));
jest.mock("@/components/budget/BudgetDetailSkeleton", () => ({
  BudgetDetailSkeleton: (): React.JSX.Element =>
    mockView("budget-detail-skeleton"),
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


jest.mock("@/components/ui/Skeleton", () => ({
  Skeleton: (): React.JSX.Element => mockView("budget-detail-skeleton-block"),
}));

jest.mock("@/components/ui/Toast", () => ({
  useToast: (): { readonly showToast: jest.Mock } => ({ showToast: jest.fn() }),
}));

jest.mock("@/hooks/useEditableBudget", () => ({
  useEditableBudget: (): typeof mockEditableBudgetResult =>
    mockEditableBudgetResult,
}));

jest.mock("@/hooks/useBudgetDetail", () => ({
  useBudgetDetail: (): typeof mockBudgetDetailResult => mockBudgetDetailResult,
}));

jest.mock("@/hooks/useBudgetDetailActions", () => ({
  useBudgetDetailActions: () => ({
    pendingAction: null,
    errorKey: null,
    execute: jest.fn(),
    clearError: jest.fn(),
  }),
}));

jest.mock("@/hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: (): { readonly preferredCurrency: "EGP" } => ({
    preferredCurrency: "EGP",
  }),
}));

jest.mock("@/hooks/useBudgets", () => ({
  useBudgets: () => ({
    readModel: {
      filters: { scope: "ALL", period: "ALL", status: "ACTIVE" },
      items: [],
      totalCount: 0,
      matchingCount: 0,
    },
    filters: { scope: "ALL", period: "ALL", status: "ACTIVE" },
    isInitialLoading: false,
    isRefreshing: false,
    hasValidData: true,
    errorKey: null,
    setScopeFilter: jest.fn(),
    setPeriodFilter: jest.fn(),
    setStatusFilter: jest.fn(),
    resetFilters: jest.fn(),
    retry: jest.fn(),
    refresh: jest.fn(),
    autoPauseCheckKey: "",
  }),
}));

jest.mock("@/hooks/useBudgetDashboardActions", () => ({
  useBudgetDashboardActions: () => ({
    isSubmitting: false,
    errorKey: null,
    confirmResume: jest.fn(),
    resetError: jest.fn(),
  }),
}));

jest.mock("@/services/budget-service", () => ({
  deleteBudget: jest.fn(),
  pauseBudget: jest.fn(),
  resumeBudget: jest.fn(),
  pauseExpiredCustomBudgets: jest.fn(),
}));

jest.mock("@/utils/logger", () => ({ logger: { error: jest.fn() } }));

import BudgetDetailScreen from "@/app/(private)/budget-detail";
import BudgetsScreen from "@/app/(private)/budgets";
import CreateBudgetScreen from "@/app/(private)/create-budget";

describe("Budget screen dark theme styling", () => {
  beforeEach(() => {
    mockSearchParams = {};
    mockEditableBudgetResult = {
      budget: undefined,
      isLoading: false,
      loadErrorKey: null,
    };
    mockBudgetDetailResult = {
      budget: { id: "budget-1" },
      readModel: {
        identity: {
          budgetId: "budget-1",
          name: "Food",
          type: "GLOBAL",
          lifecycle: "ACTIVE",
          period: "MONTHLY",
          periodStart: new Date(2026, 7, 1),
          periodEnd: new Date(2026, 7, 31),
          icon: { kind: "GLOBAL" },
          availableLifecycleAction: "PAUSE",
        },
        currency: "EGP",
        metrics: {
          spent: 500,
          limit: 1000,
          remaining: 500,
          percentage: 50,
          dailyAverage: 25,
          status: "safe",
        },
        daysLeft: 10,
        daysElapsed: 20,
        paceState: "BELOW",
        weeklySpending: [],
        categoryBreakdown: null,
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
    };
  });

  it("uses the themed app background on the budgets dashboard root", () => {
    render(<BudgetsScreen />);

    expect(screen.getByTestId("budgets-screen")).toHaveProp(
      "className",
      expect.stringContaining("bg-background dark:bg-background-dark")
    );
  });

  it("keeps budget creation in the shared PageHeader action", () => {
    render(<BudgetsScreen />);

    expect(screen.getByTestId("budgets-add-button")).toBeOnTheScreen();
    expect(screen.queryByTestId("budget-create-fab")).toBeNull();
    expect(screen.queryByTestId("budget-summary-footer")).toBeNull();
  });

  it("keeps unified dashboard surfaces on theme tokens without static colors", () => {
    const files = [
      "../../components/budget/BudgetDashboard.tsx",
      "../../components/budget/BudgetDashboardFilters.tsx",
      "../../components/budget/BudgetDashboardRow.tsx",
      "../../components/budget/BudgetDashboardSkeleton.tsx",
    ];

    for (const relativePath of files) {
      const source = readFileSync(resolve(__dirname, relativePath), "utf8");
      expect(source).not.toContain("StyleSheet.create");
      expect(source).not.toMatch(/#[0-9a-f]{6}/i);
      expect(source).toContain("dark:");
    }
  });

  it("keeps financial and localized row presentation in the read model", () => {
    const source = readFileSync(
      resolve(__dirname, "../../components/budget/BudgetDashboardRow.tsx"),
      "utf8"
    );

    expect(source).not.toContain("@monyvi/logic");
    expect(source).not.toContain("formatCurrency");
    expect(source).not.toContain("useTranslation");
  });

  it("uses the themed app background on the create budget root", () => {
    render(<CreateBudgetScreen />);

    expect(screen.getByTestId("create-budget-screen")).toHaveProp(
      "className",
      expect.stringContaining("bg-background dark:bg-background-dark")
    );
  });

  it("uses the themed app background on the budget detail root", () => {
    mockSearchParams = { id: "budget-1" };

    render(<BudgetDetailScreen />);

    expect(screen.getByTestId("budget-detail-screen")).toHaveProp(
      "className",
      expect.stringContaining("bg-background dark:bg-background-dark")
    );
  });

  it("uses the themed app background on the budget detail loading root", () => {
    mockSearchParams = { id: "budget-1" };
    mockBudgetDetailResult = {
      ...mockBudgetDetailResult,
      readModel: null,
      isInitialLoading: true,
      isLoading: true,
    };

    render(<BudgetDetailScreen />);

    expect(screen.getByTestId("budget-detail-screen")).toHaveProp(
      "className",
      expect.stringContaining("bg-background dark:bg-background-dark")
    );
    expect(screen.getByTestId("budget-detail-skeleton")).toBeOnTheScreen();
    const source = readFileSync(
      resolve(__dirname, "../../app/(private)/budget-detail.tsx"),
      "utf8"
    );
    expect(source).not.toContain("ActivityIndicator");
  });


  it("uses the themed app background on the budget detail not-found root", () => {
    mockSearchParams = { id: "budget-1" };
    mockBudgetDetailResult = {
      ...mockBudgetDetailResult,
      readModel: null,
      isNotFound: true,
      isInitialLoading: false,
      isLoading: false,
    };

    render(<BudgetDetailScreen />);

    expect(screen.getByTestId("budget-detail-screen")).toHaveProp(
      "className",
      expect.stringContaining("bg-background dark:bg-background-dark")
    );
  });
});
