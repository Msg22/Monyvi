/* eslint-disable @typescript-eslint/consistent-type-assertions */
import React from "react";
import { Text as MockText } from "react-native";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type { Budget, Category } from "@monyvi/db";

let mockCategoryError: unknown = new Error("category observation failed");
let mockAreCategoriesLoading = false;
let mockCategoryMap = new Map<string, Category>();
const mockRetryCategories = jest.fn();

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: { readonly name: string }) => (
    <MockText>{name}</MockText>
  ),
}));

jest.mock("@/hooks/useCategories", () => ({
  useCategories: () => ({
    categories: [],
    expenseCategories: [],
    incomeCategories: [],
    isLoading: mockAreCategoriesLoading,
    error: mockCategoryError,
    retry: mockRetryCategories,
  }),
}));

jest.mock("@/context/CategoriesContext", () => ({
  useCategoryLookup: () => mockCategoryMap,
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({ isDark: false }),
}));

jest.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));

jest.mock("@/hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: () => ({ preferredCurrency: "EGP" }),
}));

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
}));

jest.mock("@/services/budget-service", () => ({
  createBudget: jest.fn(),
  updateBudget: jest.fn(),
}));

jest.mock("@/components/modals/CategorySelectorModal", () => ({
  CategorySelectorModal: (): null => null,
}));

jest.mock("@/components/budget/AlertThresholdSlider", () => ({
  AlertThresholdSlider: (): null => null,
}));

jest.mock("@react-native-community/datetimepicker", () => () => null);

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string): string => key }),
}));

jest.mock("@/utils/dateHelpers", () => ({
  formatDate: (): string => "Aug 14, 2026",
}));

import { BudgetForm } from "@/components/budget/BudgetForm";
import {
  createBudget as createBudgetService,
  updateBudget as updateBudgetService,
} from "@/services/budget-service";

const mockedCreateBudgetService = jest.mocked(createBudgetService);
const mockedUpdateBudgetService = jest.mocked(updateBudgetService);

const RENEWAL_SOURCE = {
  id: "budget-1",
  name: "Education renewal",
  type: "CATEGORY",
  categoryId: "education",
  amount: 5000,
  currency: "USD",
  period: "CUSTOM",
  periodStart: new Date("2026-06-01T00:00:00.000Z"),
  periodEnd: new Date("2026-07-01T00:00:00.000Z"),
  alertThreshold: 80,
} as unknown as Budget;

describe("BudgetForm category recovery", () => {
  beforeEach(() => {
    mockCategoryError = new Error("category observation failed");
    mockAreCategoriesLoading = false;
    mockCategoryMap = new Map<string, Category>();
    mockRetryCategories.mockClear();
    mockedCreateBudgetService.mockReset();
    mockedUpdateBudgetService.mockReset();
  });

  it("preserves a renewal category through an observation failure and recovers after retry", () => {
    const { rerender } = render(<BudgetForm renewalSource={RENEWAL_SOURCE} />);

    expect(screen.getByTestId("budget-category-load-error")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "retry" }));
    expect(mockRetryCategories).toHaveBeenCalledTimes(1);

    mockCategoryError = null;
    mockCategoryMap = new Map([
      ["education", { displayName: "Education" } as unknown as Category],
    ]);
    rerender(<BudgetForm renewalSource={RENEWAL_SOURCE} />);

    expect(screen.getByText("Education")).toBeOnTheScreen();
    expect(screen.queryByTestId("budget-category-load-error")).toBeNull();
  });

  it("blocks category renewal while categories are still loading", () => {
    mockCategoryError = null;
    mockAreCategoriesLoading = true;
    mockCategoryMap = new Map([
      ["education", { displayName: "Education" } as unknown as Category],
    ]);
    render(<BudgetForm renewalSource={RENEWAL_SOURCE} />);

    expect(screen.getByTestId("budget-form-submit")).toHaveProp(
      "accessibilityState",
      { disabled: true }
    );
    fireEvent.press(screen.getByRole("button", { name: "create_budget" }));
    expect(mockedCreateBudgetService).not.toHaveBeenCalled();
  });

  it("submits a renewal with the source currency", async () => {
    mockCategoryError = null;
    mockAreCategoriesLoading = false;
    mockCategoryMap = new Map([
      ["education", { displayName: "Education" } as unknown as Category],
    ]);
    render(<BudgetForm renewalSource={RENEWAL_SOURCE} />);

    expect(screen.getByTestId("budget-form-submit")).toHaveProp(
      "accessibilityState",
      { disabled: false }
    );
    fireEvent.press(screen.getByRole("button", { name: "create_budget" }));

    expect(screen.queryByText("validation_name_required")).toBeNull();
    expect(screen.queryByText("validation_amount_invalid")).toBeNull();
    expect(screen.queryByText("validation_category_required")).toBeNull();
    expect(screen.queryByText("category_load_error")).toBeNull();
    expect(screen.queryByText("validation_date_order")).toBeNull();

    await waitFor(() =>
      expect(mockedCreateBudgetService).toHaveBeenCalledWith(
        expect.objectContaining({ currency: "USD" })
      )
    );
  });

  it("does not persist the preferred-currency fallback for ordinary creation", async () => {
    mockCategoryError = null;
    render(<BudgetForm />);

    fireEvent.press(
      screen.getByRole("button", {
        name: "accessibility_global_budget_type",
      })
    );
    fireEvent.changeText(
      screen.getByPlaceholderText("budget_name_placeholder"),
      "Monthly spending"
    );
    fireEvent.changeText(screen.getByPlaceholderText("0.00"), "5000");
    fireEvent.press(screen.getByRole("button", { name: "create_budget" }));

    await waitFor(() =>
      expect(mockedCreateBudgetService).toHaveBeenCalledTimes(1)
    );
    expect(mockedCreateBudgetService.mock.calls[0]?.[0]).not.toHaveProperty(
      "currency"
    );
  });

  it("does not persist the preferred-currency fallback when editing a legacy budget", async () => {
    mockCategoryError = null;
    mockCategoryMap = new Map([
      ["education", { displayName: "Education" } as unknown as Category],
    ]);
    const legacyBudget = {
      ...RENEWAL_SOURCE,
      currency: null,
      period: "MONTHLY",
      periodStart: null,
      periodEnd: null,
    } as unknown as Budget;

    render(<BudgetForm existingBudget={legacyBudget} />);
    fireEvent.press(screen.getByRole("button", { name: "save_changes" }));

    await waitFor(() =>
      expect(mockedUpdateBudgetService).toHaveBeenCalledTimes(1)
    );
    expect(mockedUpdateBudgetService.mock.calls[0]?.[0]).toBe("budget-1");
    expect(mockedUpdateBudgetService.mock.calls[0]?.[1]).not.toHaveProperty(
      "currency"
    );
  });
});
