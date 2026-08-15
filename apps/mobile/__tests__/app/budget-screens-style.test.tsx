import { act, render, screen } from "@testing-library/react-native";
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let mockSearchParams: { readonly id?: string } = {};
let mockEditableBudgetResult: {
  readonly budget: Record<string, unknown> | undefined;
  readonly isLoading: boolean;
  readonly loadErrorKey: "budget_not_found" | "load_budget_error" | null;
};
let mockBudgetDetailResult: {
  readonly budget: Record<string, unknown> | null;
  readonly metrics: Record<string, unknown> | null;
  readonly daysLeft: number;
  readonly weeklySpending: readonly [];
  readonly subcategoryBreakdown: readonly [];
  readonly recentTransactions: readonly [];
  readonly isLoading: boolean;
};
const mockBudgetActionsSheet = jest.fn();

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
  BudgetActionsSheet: (props: unknown): null => {
    mockBudgetActionsSheet(props);
    return null;
  },
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
    mockBudgetActionsSheet.mockClear();
    mockSearchParams = {};
    mockEditableBudgetResult = {
      budget: undefined,
      isLoading: false,
      loadErrorKey: null,
    };
    mockBudgetDetailResult = {
      budget: {
        id: "budget-1",
        name: "Food",
        amount: 1000,
        currency: "EGP",
        isPaused: false,
        isCategoryBudget: false,
      },
      metrics: { remaining: 500 },
      daysLeft: 10,
      weeklySpending: [],
      subcategoryBreakdown: [],
      recentTransactions: [],
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
      budget: null,
      metrics: null,
      isLoading: true,
    };

    render(<BudgetDetailScreen />);

    expect(screen.getByTestId("budget-detail-screen")).toHaveProp(
      "className",
      expect.stringContaining("bg-background dark:bg-background-dark")
    );
    expect(
      screen.getAllByTestId("budget-detail-skeleton-block").length
    ).toBeGreaterThan(0);
    const source = readFileSync(
      resolve(__dirname, "../../app/(private)/budget-detail.tsx"),
      "utf8"
    );
    expect(source).not.toContain("ActivityIndicator");
  });

  it("omits the pause toggle for expired custom budget detail", () => {
    mockSearchParams = { id: "expired-budget" };
    mockBudgetDetailResult = {
      ...mockBudgetDetailResult,
      budget: {
        ...mockBudgetDetailResult.budget,
        id: "expired-budget",
        isPaused: true,
        period: "CUSTOM",
        periodEnd: new Date("2020-01-01T00:00:00.000Z"),
      },
    };

    render(<BudgetDetailScreen />);

    expect(mockBudgetActionsSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({ canTogglePause: false })
    );
  });

  it("removes the pause toggle when a mounted custom budget expires", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 7, 14, 23, 59, 59, 998));
    mockSearchParams = { id: "expiring-budget" };
    mockBudgetDetailResult = {
      ...mockBudgetDetailResult,
      budget: {
        ...mockBudgetDetailResult.budget,
        id: "expiring-budget",
        period: "CUSTOM",
        periodEnd: new Date(2026, 7, 14),
      },
    };

    const view = render(<BudgetDetailScreen />);

    expect(mockBudgetActionsSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({ canTogglePause: true })
    );

    act(() => {
      jest.advanceTimersByTime(2);
    });

    expect(mockBudgetActionsSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({ canTogglePause: false })
    );

    view.unmount();
    jest.useRealTimers();
  });

  it("uses the themed app background on the budget detail not-found root", () => {
    mockSearchParams = { id: "budget-1" };
    mockBudgetDetailResult = {
      ...mockBudgetDetailResult,
      budget: null,
      metrics: null,
      isLoading: false,
    };

    render(<BudgetDetailScreen />);

    expect(screen.getByTestId("budget-detail-screen")).toHaveProp(
      "className",
      expect.stringContaining("bg-background dark:bg-background-dark")
    );
  });
});
