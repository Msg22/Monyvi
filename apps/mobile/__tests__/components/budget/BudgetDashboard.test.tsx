import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react-native";

const mockPauseExpiredCustomBudgets = jest.fn();
const mockRefresh = jest.fn();
const mockUseBudgets = jest.fn();
const mockLoggerError = jest.fn();
let mockIsFocused = true;
let mockBottomInset = 0;

jest.mock("expo-router", () => {
  const ReactModule = jest.requireActual<typeof React>("react");

  return {
    router: { push: jest.fn() },
    useFocusEffect: (callback: () => void | (() => void)): void => {
      ReactModule.useEffect(() => callback(), [callback]);
    },
    useIsFocused: (): boolean => mockIsFocused,
  };
});

jest.mock("react-i18next", () => ({
  useTranslation: (): { t: (key: string) => string } => ({
    t: (key: string): string => key,
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): { bottom: number } => ({ bottom: mockBottomInset }),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: function Ionicons(): React.JSX.Element {
    const { Text: MockText } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <MockText>icon</MockText>;
  },
}));

jest.mock("@/constants/colors", () => ({
  palette: {
    nileGreen: { 500: "#000000" },
    slate: { 400: "#000000", 500: "#000000" },
  },
}));

jest.mock("@/hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: (): { preferredCurrency: "EGP" } => ({
    preferredCurrency: "EGP",
  }),
}));

jest.mock("@/hooks/useBudgets", () => ({
  useBudgets: (): unknown => mockUseBudgets(),
}));

jest.mock("@/services/budget-service", () => ({
  pauseExpiredCustomBudgets: (): Promise<number> =>
    mockPauseExpiredCustomBudgets() as Promise<number>,
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    error: (...args: readonly unknown[]): void => {
      mockLoggerError(...args);
    },
  },
}));

jest.mock("@monyvi/logic", () => ({
  formatCurrency: (amount: number): string => String(amount),
}));

jest.mock("@/components/budget/PeriodFilterChips", () => ({
  PeriodFilterChips: function PeriodFilterChips(): React.JSX.Element {
    const { Text: MockText } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <MockText>period-filter</MockText>;
  },
}));

jest.mock("@/components/budget/BudgetHeroCard", () => ({
  BudgetHeroCard: function BudgetHeroCard(): React.JSX.Element {
    const { Text: MockText } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <MockText>hero</MockText>;
  },
}));

jest.mock("@/components/budget/BudgetCategoryCard", () => ({
  BudgetCategoryCard: function BudgetCategoryCard(): React.JSX.Element {
    const { Text: MockText } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <MockText>category-card</MockText>;
  },
}));

jest.mock("@/components/budget/BudgetEmptyState", () => ({
  BudgetEmptyState: function BudgetEmptyState(): React.JSX.Element {
    const { Text: MockText } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <MockText>empty</MockText>;
  },
}));

import { BudgetDashboard } from "@/components/budget/BudgetDashboard";

function setBudgetState(autoPauseCheckKey: string): void {
  mockUseBudgets.mockReturnValue({
    globalBudget: undefined,
    categoryBudgets: [],
    isLoading: false,
    totalCount: 0,
    periodFilter: "ALL",
    setPeriodFilter: jest.fn(),
    budgets: [],
    refresh: mockRefresh,
    autoPauseCheckKey,
  });
}

function setBudgetStateWithGlobalBudget(): void {
  const globalBudget = {
    budget: { id: "global-budget" },
    daysLeft: 10,
    metrics: { remaining: 1000 },
  };

  mockUseBudgets.mockReturnValue({
    globalBudget,
    categoryBudgets: [],
    isLoading: false,
    totalCount: 1,
    periodFilter: "ALL",
    setPeriodFilter: jest.fn(),
    budgets: [globalBudget],
    refresh: mockRefresh,
    autoPauseCheckKey: "global-budget",
  });
}

describe("BudgetDashboard", () => {
  beforeEach((): void => {
    jest.clearAllMocks();
    mockIsFocused = true;
    mockBottomInset = 0;
    mockPauseExpiredCustomBudgets.mockResolvedValue(0);
    setBudgetState("initial");
  });

  it.each([
    { bottomInset: 0, expectedPadding: 12 },
    { bottomInset: 16, expectedPadding: 28 },
    { bottomInset: 48, expectedPadding: 60 },
  ])(
    "adds the $bottomInset bottom inset to the summary footer base spacing",
    ({ bottomInset, expectedPadding }): void => {
      mockBottomInset = bottomInset;
      setBudgetStateWithGlobalBudget();

      render(<BudgetDashboard />);

      expect(screen.getByTestId("budget-summary-footer")).toHaveStyle({
        paddingBottom: expectedPadding,
      });
    }
  );

  it("re-runs budget auto-pause when relevant budget data changes while focused", async (): Promise<void> => {
    const { rerender } = render(<BudgetDashboard />);

    await waitFor(() => {
      expect(mockPauseExpiredCustomBudgets).toHaveBeenCalledTimes(1);
    });

    setBudgetState("expired-custom-budget-changed");
    rerender(<BudgetDashboard />);

    await waitFor(() => {
      expect(mockPauseExpiredCustomBudgets).toHaveBeenCalledTimes(2);
    });
  });

  it("refreshes the budget list when expired budgets are auto-paused", async (): Promise<void> => {
    mockPauseExpiredCustomBudgets.mockResolvedValueOnce(2);

    render(<BudgetDashboard />);

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it("does not refresh when no budgets needed pausing", async (): Promise<void> => {
    mockPauseExpiredCustomBudgets.mockResolvedValueOnce(0);

    render(<BudgetDashboard />);

    await waitFor(() => {
      expect(mockPauseExpiredCustomBudgets).toHaveBeenCalledTimes(1);
    });
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("logs and swallows errors from auto-pause", async (): Promise<void> => {
    const error = new Error("db failure");
    mockPauseExpiredCustomBudgets.mockRejectedValueOnce(error);

    render(<BudgetDashboard />);

    await waitFor(() => {
      expect(mockLoggerError).toHaveBeenCalledWith(
        "budgetDashboard.pauseExpired.failed",
        error
      );
    });
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("does not refresh if auto-pause resolves after cleanup", async (): Promise<void> => {
    let resolvePause: (pausedCount: number) => void = () => undefined;
    mockPauseExpiredCustomBudgets.mockReturnValueOnce(
      new Promise<number>((resolve) => {
        resolvePause = resolve;
      })
    );

    const { unmount } = render(<BudgetDashboard />);

    await waitFor(() => {
      expect(mockPauseExpiredCustomBudgets).toHaveBeenCalledTimes(1);
    });

    unmount();
    await act(async () => {
      resolvePause(3);
      await Promise.resolve();
    });

    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
