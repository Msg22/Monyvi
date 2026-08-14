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
} from "@/services/budget-list-read-model-service";

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
    t: (key: string): string => key,
  }),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => <MockText>icon</MockText>,
}));

jest.mock("@/constants/colors", () => ({
  palette: {
    gold: { 600: "#000" },
    slate: { 400: "#000" },
  },
}));

jest.mock("@/components/budget/BudgetDashboardRow", () => ({
  BudgetDashboardRow: ({
    item,
    variant,
  }: {
    item: BudgetDashboardItem;
    variant: "attention" | "category" | "paused";
  }) => (
    <MockText testID={`dashboard-row-${variant}-${item.id}`}>
      {item.lifecycle}
    </MockText>
  ),
}));

jest.mock("@/components/budget/GlobalBudgetCarousel", () => ({
  GlobalBudgetCarousel: ({
    budgets,
  }: {
    budgets: readonly BudgetDashboardItem[];
  }) => (
    <MockText testID="global-budget-carousel">
      {budgets.map((budget) => budget.id).join(",")}
    </MockText>
  ),
}));

jest.mock("@/components/budget/BudgetDashboardSkeleton", () => ({
  BudgetDashboardSkeleton: () => (
    <MockText testID="budget-dashboard-skeleton">loading</MockText>
  ),
}));

jest.mock("@/components/budget/BudgetEmptyState", () => ({
  BudgetEmptyState: ({ onCreateBudget }: { onCreateBudget: () => void }) => (
    <MockTouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="create-empty"
      onPress={onCreateBudget}
    >
      <MockText>empty</MockText>
    </MockTouchableOpacity>
  ),
}));

jest.mock("@/components/budget/PeriodFilterChips", () => ({
  PeriodFilterChips: ({ onSelect }: { onSelect: (filter: "ALL") => void }) => (
    <MockTouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="select-all"
      onPress={() => onSelect("ALL")}
    >
      <MockText>filters</MockText>
    </MockTouchableOpacity>
  ),
}));

function item(
  id: string,
  sectionId: BudgetDashboardItem["sectionId"],
  lifecycle: BudgetDashboardItem["lifecycle"] = "HEALTHY"
): BudgetDashboardItem {
  return {
    id,
    displayName: id,
    period: "MONTHLY",
    currency: "EGP",
    scope: sectionId === "OVERALL" ? "GLOBAL" : "CATEGORY",
    lifecycle,
    sectionId,
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
    categoryLabel:
      sectionId === "OVERALL"
        ? { kind: "not-applicable" }
        : { kind: "resolved", categoryId: id, name: id },
    categoryIcon: null,
    availableAction: lifecycle === "PAUSED" ? "RESUME" : null,
  };
}

function readModel(
  overrides: Partial<BudgetDashboardReadModel> = {}
): BudgetDashboardReadModel {
  return {
    overallBudgets: [],
    needsAttentionBudgets: [],
    categoryBudgets: [],
    pausedBudgets: [],
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
    periodFilter: "ALL",
    isInitialLoading: false,
    isRefreshing: false,
    hasValidData: true,
    errorKey: null,
    preferredCurrency: "EGP",
    onSelectPeriod: jest.fn(),
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

  it("renders four non-empty sections in approved order", () => {
    const screen = renderDashboard({
      readModel: readModel({
        overallBudgets: [item("overall", "OVERALL")],
        needsAttentionBudgets: [
          item("attention", "NEEDS_ATTENTION", "NEAR_LIMIT"),
        ],
        categoryBudgets: [item("category", "CATEGORY")],
        pausedBudgets: [item("paused", "PAUSED", "PAUSED")],
        totalCount: 4,
        matchingCount: 4,
      }),
    });

    expect(
      screen
        .getAllByTestId(/^budget-section-/)
        .map((section) => section.props.testID)
    ).toEqual([
      "budget-section-overall",
      "budget-section-needs_attention",
      "budget-section-category_budgets",
      "budget-section-paused",
    ]);
    expect(screen.getByTestId("global-budget-carousel").props.children).toBe(
      "overall"
    );
    expect(
      screen.getByTestId("dashboard-row-attention-attention")
    ).toBeTruthy();
    expect(screen.getByTestId("dashboard-row-category-category")).toBeTruthy();
    expect(screen.getByTestId("dashboard-row-paused-paused")).toBeTruthy();
  });

  it("renders category budgets as full-width compact rows instead of a two-column grid", () => {
    const screen = renderDashboard({
      readModel: readModel({
        categoryBudgets: [
          item("category-a", "CATEGORY"),
          item("category-b", "CATEGORY"),
        ],
        totalCount: 2,
        matchingCount: 2,
      }),
    });

    expect(
      screen.getByTestId("dashboard-row-category-category-a")
    ).toBeTruthy();
    expect(
      screen.getByTestId("dashboard-row-category-category-b")
    ).toBeTruthy();
    expect(screen.queryByTestId(/dashboard-card-/)).toBeNull();
  });

  it("omits empty sections and has no summary footer or floating action", () => {
    const screen = renderDashboard({
      readModel: readModel({
        categoryBudgets: [item("category", "CATEGORY")],
        totalCount: 1,
        matchingCount: 1,
      }),
    });

    expect(screen.queryByTestId("budget-section-overall")).toBeNull();
    expect(screen.queryByTestId("budget-section-needs_attention")).toBeNull();
    expect(screen.queryByTestId("budget-section-paused")).toBeNull();
    expect(screen.queryByTestId("budget-summary-footer")).toBeNull();
    expect(screen.queryByTestId("budget-create-fab")).toBeNull();
  });

  it("uses a layout-matching Skeleton for initial loading", () => {
    const screen = renderDashboard({
      isInitialLoading: true,
      hasValidData: false,
    });

    expect(screen.getByTestId("budget-dashboard-skeleton")).toBeTruthy();
    expect(screen.queryByTestId("activity-indicator")).toBeNull();
  });

  it("distinguishes no-budget, filtered-empty, and recoverable error states", () => {
    const create = jest.fn();
    const noBudgets = renderDashboard({ onCreateBudget: create });
    fireEvent.press(noBudgets.getByRole("button", { name: "create-empty" }));
    expect(create).toHaveBeenCalledTimes(1);
    noBudgets.unmount();

    const selectPeriod = jest.fn();
    const filtered = renderDashboard({
      readModel: readModel({ totalCount: 2, matchingCount: 0 }),
      periodFilter: "CUSTOM",
      onSelectPeriod: selectPeriod,
    });
    expect(
      filtered.getByTestId("budget-dashboard-filtered-empty")
    ).toBeTruthy();
    fireEvent.press(filtered.getByRole("button", { name: "filter_all" }));
    expect(selectPeriod).toHaveBeenCalledWith("ALL");
    filtered.unmount();

    const recoverable = renderDashboard({
      readModel: readModel({
        categoryBudgets: [item("category", "CATEGORY")],
        totalCount: 1,
        matchingCount: 1,
      }),
      errorKey: "dashboard_load_error",
      hasValidData: true,
    });
    expect(
      recoverable.getByTestId("budget-dashboard-recoverable-error")
    ).toBeTruthy();
  });

  it("shows recovery instead of a false empty state when the initial load fails", () => {
    const screen = renderDashboard({
      errorKey: "dashboard_load_error",
      hasValidData: false,
    });

    expect(screen.getByTestId("budget-dashboard-initial-error")).toBeTruthy();
    expect(screen.getByText("dashboard_initial_load_error")).toBeTruthy();
    expect(screen.queryByText("dashboard_load_error")).toBeNull();
    expect(screen.queryByRole("button", { name: "create-empty" })).toBeNull();
  });

  it.each([
    { bottomInset: 0, expectedPadding: 24 },
    { bottomInset: 16, expectedPadding: 40 },
    { bottomInset: 48, expectedPadding: 72 },
  ])(
    "owns the $bottomInset bottom inset exactly once",
    ({ bottomInset, expectedPadding }) => {
      mockBottomInset = bottomInset;
      const screen = renderDashboard();

      expect(
        screen.getByTestId("budget-dashboard-list").props.contentContainerStyle
      ).toEqual(expect.objectContaining({ paddingBottom: expectedPadding }));
    }
  );
});
