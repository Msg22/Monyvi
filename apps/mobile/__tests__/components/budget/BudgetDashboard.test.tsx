/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import React from "react";
import {
  Text as MockText,
  TouchableOpacity as MockTouchableOpacity,
} from "react-native";
import { fireEvent, render } from "@testing-library/react-native";

import { BudgetDashboard } from "@/components/budget/BudgetDashboard";
import type {
  BudgetDashboardItem,
  BudgetDashboardReadModel,
} from "@/contracts/budget-dashboard";

let mockBottomInset = 0;

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({
    top: 0,
    right: 0,
    bottom: mockBottomInset,
    left: 0,
  }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { readonly count?: number }): string =>
      key.startsWith("dashboard_result_count_")
        ? `${options?.count ?? 0} matching budgets`
        : key,
  }),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => <MockText>icon</MockText>,
}));

jest.mock("@/constants/colors", () => ({
  palette: { gold: { 600: "#000" }, slate: { 400: "#000" } },
}));

jest.mock("@/components/budget/BudgetDashboardRow", () => ({
  BudgetDashboardRow: ({
    item,
    position,
  }: {
    readonly item: BudgetDashboardItem;
    readonly position: string;
  }) => <MockText testID={`dashboard-row-${item.id}`}>{position}</MockText>,
}));

jest.mock("@/components/budget/BudgetDashboardFilters", () => ({
  BudgetDashboardFilters: ({
    onSelectScope,
    onSelectPeriod,
    onSelectStatus,
  }: {
    readonly onSelectScope: (value: "CATEGORY") => void;
    readonly onSelectPeriod: (value: "WEEKLY") => void;
    readonly onSelectStatus: (value: "PAUSED") => void;
  }) => (
    <>
      <MockTouchableOpacity
        accessibilityLabel="scope-filter"
        onPress={() => onSelectScope("CATEGORY")}
      />
      <MockTouchableOpacity
        accessibilityLabel="period-filter"
        onPress={() => onSelectPeriod("WEEKLY")}
      />
      <MockTouchableOpacity
        accessibilityLabel="status-filter"
        onPress={() => onSelectStatus("PAUSED")}
      />
    </>
  ),
}));

jest.mock("@/components/budget/BudgetDashboardSkeleton", () => ({
  BudgetDashboardSkeleton: () => (
    <MockText testID="budget-dashboard-skeleton">loading</MockText>
  ),
}));

jest.mock("@/components/budget/BudgetEmptyState", () => ({
  BudgetEmptyState: ({
    onCreateBudget,
  }: {
    readonly onCreateBudget: () => void;
  }) => (
    <MockTouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="create-empty"
      onPress={onCreateBudget}
    >
      <MockText>empty</MockText>
    </MockTouchableOpacity>
  ),
}));

function item(id: string): BudgetDashboardItem {
  return {
    id,
    displayName: id,
    period: "MONTHLY",
    currency: "EGP",
    scope: "CATEGORY",
    lifecycle: "HEALTHY",
    showsProgress: true,
    metrics: {
      spent: 0,
      limit: 1000,
      remaining: 1000,
      percentage: 0,
      dailyAverage: 0,
      status: "safe",
    },
    daysLeft: 10,
    daysElapsed: 20,
    expiresAt: null,
    categoryLabel: { kind: "resolved", categoryId: id, name: id },
    categoryIcon: null,
    availableAction: null,
    presentation: {
      periodAndScopeLabel: "Monthly • Category",
      spentOfLimitLabel: "100 EGP of 1,000 EGP",
      percentageLabel: "10%",
      progressWidth: "10%",
      statusLabel: "Safe to spend",
      deletedCategoryLabel: null,
      expiryLabel: null,
      actionLabel: null,
      accessibilityLabel:
        "Budget, Monthly, Category, 100 EGP of 1,000 EGP, 10%, Safe to spend",
      viewBudgetLabel: "View Budget: Budget",
    },
  };
}

function readModel(
  overrides: Partial<BudgetDashboardReadModel> = {}
): BudgetDashboardReadModel {
  return {
    filters: { scope: "ALL", period: "ALL", status: "ACTIVE" },
    items: [],
    totalCount: 0,
    matchingCount: 0,
    ...overrides,
  };
}

function renderDashboard(
  overrides: Partial<React.ComponentProps<typeof BudgetDashboard>> = {}
): ReturnType<typeof render> & {
  readonly props: React.ComponentProps<typeof BudgetDashboard>;
} {
  const props: React.ComponentProps<typeof BudgetDashboard> = {
    readModel: readModel(),
    filters: { scope: "ALL", period: "ALL", status: "ACTIVE" },
    isInitialLoading: false,
    isRefreshing: false,
    hasValidData: true,
    errorKey: null,
    onSelectScope: jest.fn(),
    onSelectPeriod: jest.fn(),
    onSelectStatus: jest.fn(),
    onResetFilters: jest.fn(),
    onRetry: jest.fn(),
    onCreateBudget: jest.fn(),
    onBudgetPress: jest.fn(),
    onResume: jest.fn(),
    onRenew: jest.fn(),
    ...overrides,
  };
  return { ...render(<BudgetDashboard {...props} />), props };
}

describe("BudgetDashboard", () => {
  beforeEach(() => {
    mockBottomInset = 0;
  });

  it("renders one grouped virtualized list with stable item order and no old hierarchy", () => {
    const screen = renderDashboard({
      readModel: readModel({
        items: [item("global"), item("category"), item("paused")],
        totalCount: 3,
        matchingCount: 3,
      }),
    });

    expect(
      screen.getAllByTestId(/^dashboard-row-/).map((row) => row.props.testID)
    ).toEqual([
      "dashboard-row-global",
      "dashboard-row-category",
      "dashboard-row-paused",
    ]);
    expect(screen.getByTestId("budget-results-group")).toBeOnTheScreen();
    expect(screen.getByText("3 matching budgets")).toBeOnTheScreen();
    expect(screen.queryByTestId(/^budget-section-/)).toBeNull();
    expect(screen.queryByTestId("global-budget-carousel")).toBeNull();
    expect(screen.queryByTestId("budget-create-fab")).toBeNull();
    expect(screen.queryByTestId("budget-summary-footer")).toBeNull();
  });

  it("connects all filter controls", () => {
    const screen = renderDashboard();
    fireEvent.press(screen.getByLabelText("scope-filter"));
    fireEvent.press(screen.getByLabelText("period-filter"));
    fireEvent.press(screen.getByLabelText("status-filter"));

    expect(screen.props.onSelectScope).toHaveBeenCalledWith("CATEGORY");
    expect(screen.props.onSelectPeriod).toHaveBeenCalledWith("WEEKLY");
    expect(screen.props.onSelectStatus).toHaveBeenCalledWith("PAUSED");
  });

  it("uses a layout-matching Skeleton for initial loading", () => {
    const screen = renderDashboard({
      isInitialLoading: true,
      hasValidData: false,
    });
    expect(screen.getByTestId("budget-dashboard-skeleton")).toBeOnTheScreen();
    expect(screen.queryByTestId("activity-indicator")).toBeNull();
  });

  it("distinguishes no-budget, filtered-empty, and retained-data errors", () => {
    const create = jest.fn();
    const noBudgets = renderDashboard({ onCreateBudget: create });
    fireEvent.press(noBudgets.getByRole("button", { name: "create-empty" }));
    expect(create).toHaveBeenCalledTimes(1);
    noBudgets.unmount();

    const reset = jest.fn();
    const filtered = renderDashboard({
      readModel: readModel({ totalCount: 2, matchingCount: 0 }),
      filters: { scope: "GLOBAL", period: "CUSTOM", status: "EXPIRED" },
      onResetFilters: reset,
    });
    fireEvent.press(filtered.getByRole("button", { name: "reset_filters" }));
    expect(reset).toHaveBeenCalledTimes(1);
    filtered.unmount();

    const recoverable = renderDashboard({
      readModel: readModel({
        items: [item("kept")],
        totalCount: 1,
        matchingCount: 1,
      }),
      errorKey: "dashboard_load_error",
      hasValidData: true,
    });
    expect(
      recoverable.getByTestId("budget-dashboard-recoverable-error")
    ).toBeOnTheScreen();
    expect(recoverable.getByTestId("dashboard-row-kept")).toBeOnTheScreen();
  });

  it("shows recovery instead of false empty data after initial failure", () => {
    const screen = renderDashboard({
      errorKey: "dashboard_load_error",
      hasValidData: false,
    });
    expect(
      screen.getByTestId("budget-dashboard-initial-error")
    ).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "create-empty" })).toBeNull();
  });

  it.each([
    { bottomInset: 0, expectedPadding: 24 },
    { bottomInset: 16, expectedPadding: 40 },
    { bottomInset: 48, expectedPadding: 72 },
  ])(
    "owns the $bottomInset bottom inset once",
    ({ bottomInset, expectedPadding }) => {
      mockBottomInset = bottomInset;
      const screen = renderDashboard();
      expect(
        screen.getByTestId("budget-dashboard-list").props.contentContainerStyle
      ).toEqual(expect.objectContaining({ paddingBottom: expectedPadding }));
    }
  );
});
